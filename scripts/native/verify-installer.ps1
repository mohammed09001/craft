# Really installs, upgrades and uninstalls the MSI (PK-2) and checks what a user would see and what must stay behind.
#
#   . .\scripts\native\verify-installer.ps1 [-Msi <Craft-x.y.z-windows-x64.msi>]
#
# It runs as the current user without elevation (a per-user MSI needs none) and installs into D:\CraftNative\temp\install-test\Craft (the
# INSTALLFOLDER property), but the Start-menu shortcut, the .craft association and the Settings > Apps entry are the real per-user ones, so
# the script records them before, refuses to start if Craft is already installed, and proves at the end that they are back to what they were.
# What it proves, in order:
#   1. install: exit 0; the file count matches the layout; the layout passes verify-install.ps1 (a hostile environment run);
#      the Start-menu shortcut points at the installed Craft.exe; Settings > Apps lists Craft with the version;
#   2. the .craft association: HKCU holds the open command, and running that command with a real .craft file opens it in the installed app;
#   3. user data: the app's own data folder (its log, a marker the script plants) is outside the install folder;
#   4. upgrade: a higher-version MSI installs over it (one Craft entry, the new version, the old version's files replaced), and
#      installing the older MSI again is refused;
#   5. uninstall: exit 0; the install folder, shortcut, association and Settings entry are gone; the user data marker is still there;
#      the registry and Start menu are exactly as they were before the first install.
#   6. Craft running: a silent upgrade and a silent uninstall while the installed Craft is open close it (Restart Manager), replace or remove
#      every file, leave no rollback files, and need no reboot.
# Exit code 0 only if every check passes. An interrupted run uninstalls in its finally block.

[CmdletBinding()]
param(
  [string]$Msi,
  [string]$InstallDir
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Msi) { $Msi = (Get-ChildItem (Join-Path $env:CRAFT_BUILD_ROOT 'windows-package\packages') -Filter 'Craft-*-windows-x64.msi' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
if (-not $Msi -or -not (Test-Path $Msi)) { throw 'No MSI found (run build-installer.ps1).' }
$Msi = (Resolve-Path $Msi).Path
$work = Join-Path $env:CRAFT_HEAVY_ROOT 'temp\install-test'
if (-not $InstallDir) { $InstallDir = Join-Path $work 'Craft' }
$layout = Join-Path $env:CRAFT_STAGING_ROOT 'Craft-install'
$failures = New-Object System.Collections.Generic.List[string]
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { Write-Host "  ok   $name" } else { Write-Host "  FAIL $name $detail" -ForegroundColor Red; $failures.Add($name) }
}
function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# Windows Installer writes the Settings > Apps entry of a per-user MSI under HKLM (its service does it, even for an unelevated per-user install,
# measured on Windows 11 24H2), so both hives are searched; either way it is the list Settings > Apps shows.
$uninstallRoots = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
                  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
function Get-CraftEntries {
  @($uninstallRoots | ForEach-Object { Get-ChildItem $_ -ErrorAction SilentlyContinue } |
    Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName -eq 'Craft' })
}
$startMenuFolder = Join-Path ([Environment]::GetFolderPath('Programs')) 'Craft'
function Get-State {
  [ordered]@{
    assocDefault = (Get-ItemProperty 'HKCU:\Software\Classes\.craft' -ErrorAction SilentlyContinue).'(default)'
    progId       = Test-Path 'HKCU:\Software\Classes\Craft.Project'
    craftKey     = Test-Path 'HKCU:\Software\Craft'
    entries      = (Get-CraftEntries).Count
    startMenu    = Test-Path $startMenuFolder
  }
}
function Invoke-Msi([string[]]$arguments, [string]$logName) {
  $log = Join-Path $work $logName
  $p = Start-Process msiexec.exe -ArgumentList (@('/qn', '/norestart', '/l*v', "`"$log`"") + $arguments) -Wait -PassThru
  $p.ExitCode
}

if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this without elevation: a per-user installer must work for a standard user, and elevation would hide a failure.'
}
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $work | Out-Null
$before = Get-State
Step "Before: $($before | ConvertTo-Json -Compress)"
if ($before.entries -gt 0 -or $before.assocDefault -eq 'Craft.Project') { throw 'Craft is already installed for this user (or its association is). Uninstall it first; this script will not touch a real installation.' }

$msiVersion = [regex]::Match((Split-Path $Msi -Leaf), 'Craft-(\d+\.\d+\.\d+)-').Groups[1].Value
$vp = $msiVersion.Split('.'); $upgradeVersion = "$($vp[0]).$($vp[1]).$([int]$vp[2] + 1)"
$markerFolder = $null; $marker = $null
try {
  Step "1. Install $msiVersion"
  $code = Invoke-Msi @('/i', "`"$Msi`"", "INSTALLFOLDER=`"$InstallDir`"") 'install.log'
  Check 'msiexec /i exits 0 without elevation' ($code -eq 0) "(exit $code, see $work\install.log)"
  Check 'Craft.exe is installed' (Test-Path (Join-Path $InstallDir 'Craft.exe'))
  $installed = (Get-ChildItem $InstallDir -Recurse -File).Count; $expected = (Get-ChildItem $layout -Recurse -File).Count
  Check "every file of the layout is installed ($installed of $expected)" ($installed -eq $expected)
  $entries = Get-CraftEntries
  Check 'Settings > Apps lists exactly one Craft' ($entries.Count -eq 1)
  if ($entries.Count -eq 1) {
    $props = Get-ItemProperty $entries[0].PSPath
    Check "the entry shows version $msiVersion" ($props.DisplayVersion -eq $msiVersion) "(shows $($props.DisplayVersion))"
    Check 'the entry has an uninstall command' ([bool]$props.UninstallString)
  }
  $lnk = Join-Path $startMenuFolder 'Craft.lnk'
  Check 'the Start-menu shortcut exists' (Test-Path $lnk)
  if (Test-Path $lnk) { Check 'the shortcut points at the installed Craft.exe' ((New-Object -ComObject WScript.Shell).CreateShortcut($lnk).TargetPath -eq (Join-Path $InstallDir 'Craft.exe')) }
  & (Join-Path $PSScriptRoot 'verify-install.ps1') -InstallDir $InstallDir | Out-Host
  Check 'the installed layout passes verify-install.ps1 (hostile environment run)' ($LASTEXITCODE -eq 0)

  Step '2. The .craft association'
  Check 'HKCU maps .craft to Craft.Project' ((Get-ItemProperty 'HKCU:\Software\Classes\.craft').'(default)' -eq 'Craft.Project')
  $command = (Get-ItemProperty 'HKCU:\Software\Classes\Craft.Project\shell\open\command').'(default)'
  Check 'the open command is the installed Craft.exe with the file' ($command -eq "`"$(Join-Path $InstallDir 'Craft.exe')`" `"%1`"") "($command)"
  # A real .craft file made by the development build's benchmark mode (a project with the bracket in it).
  $dev = Join-Path $env:CRAFT_BUILD_ROOT 'windows-release\Craft.exe'
  $benchDir = Join-Path $work 'project'
  $env:PATH = "$env:CRAFT_QT_DIR\bin;$env:PATH"
  & $dev --project-bench (Join-Path $work 'bench.json') --import (Join-Path $repoRoot 'native\tests\fixtures\models\bracket.stl') --bench-dir $benchDir | Out-Null
  $projectFile = Join-Path $benchDir 'bench.craft'
  Check 'a .craft file was made for the test' (Test-Path $projectFile)
  if (Test-Path $projectFile) {
    $run = $command.Replace('%1', $projectFile)
    $existingIds = @(Get-Process Craft -ErrorAction SilentlyContinue | ForEach-Object Id)
    $shell = Start-Process cmd.exe -ArgumentList '/c', "`"$run`"" -PassThru -WindowStyle Hidden
    $app = $null
    for ($i = 0; $i -lt 40 -and -not $app; $i++) {
      Start-Sleep -Milliseconds 500
      $app = Get-Process Craft -ErrorAction SilentlyContinue | Where-Object { $existingIds -notcontains $_.Id -and $_.MainWindowTitle -match 'bench' } | Select-Object -First 1
    }
    Check 'running the association command opens the project in the installed app' ([bool]$app) '(no window titled with the project appeared)'
    if ($app) {
      Check 'the process is the installed Craft.exe' ($app.Path -eq (Join-Path $InstallDir 'Craft.exe'))
      Step '3. User data lives outside the install folder'
      $log = Get-ChildItem $env:LOCALAPPDATA -Recurse -Filter craft.log -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-3) } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      Check 'the app wrote its log under the user data folder' ([bool]$log)
      if ($log) {
        $dataDir = Split-Path $log.DirectoryName -Parent
        Check 'the data folder is not inside the install folder' (-not $dataDir.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase)) "($dataDir)"
        $markerFolder = Join-Path $dataDir 'autosave'; New-Item -ItemType Directory -Force $markerFolder | Out-Null
        $marker = Join-Path $markerFolder 'installer-test-marker.txt'; Set-Content $marker 'must survive uninstall and upgrade'
      }
      [void]$app.CloseMainWindow(); if (-not $app.WaitForExit(8000)) { $app.Kill() }
    }
  }

  Step "4. Upgrade to $upgradeVersion"
  $upgradeMsi = & (Join-Path $PSScriptRoot 'build-installer.ps1') -Version $upgradeVersion -OutDir (Join-Path $work 'upgrade') | Select-Object -Last 1
  $code = Invoke-Msi @('/i', "`"$upgradeMsi`"", "INSTALLFOLDER=`"$InstallDir`"") 'upgrade.log'
  Check 'installing the higher version over it exits 0' ($code -eq 0) "(exit $code, see $work\upgrade.log)"
  $entries = Get-CraftEntries
  Check 'still exactly one Craft in Settings > Apps' ($entries.Count -eq 1) "($($entries.Count))"
  if ($entries.Count -eq 1) { Check "it now shows $upgradeVersion" ((Get-ItemProperty $entries[0].PSPath).DisplayVersion -eq $upgradeVersion) }
  Check 'Craft.exe is still installed after the upgrade' (Test-Path (Join-Path $InstallDir 'Craft.exe'))
  Check 'the .craft association survived the upgrade' ((Get-ItemProperty 'HKCU:\Software\Classes\.craft' -ErrorAction SilentlyContinue).'(default)' -eq 'Craft.Project')
  if ($marker) { Check 'the user data marker survived the upgrade' (Test-Path $marker) }
  $code = Invoke-Msi @('/i', "`"$Msi`"", "INSTALLFOLDER=`"$InstallDir`"") 'downgrade.log'
  Check 'installing the older version over the newer one is refused' ($code -ne 0) "(exit $code)"
  $entries = Get-CraftEntries
  if ($entries.Count -eq 1) { Check 'the newer version is still the installed one' ((Get-ItemProperty $entries[0].PSPath).DisplayVersion -eq $upgradeVersion) }

  Step '5. Uninstall'
  $code = Invoke-Msi @('/x', "`"$upgradeMsi`"") 'uninstall.log'
  Check 'msiexec /x exits 0' ($code -eq 0) "(exit $code, see $work\uninstall.log)"
  Check 'the install folder is gone' (-not (Test-Path (Join-Path $InstallDir 'Craft.exe')) -and -not (Test-Path $InstallDir)) '(files or folder left behind)'
  Check 'the Start-menu shortcut and folder are gone' (-not (Test-Path $startMenuFolder))
  Check 'Settings > Apps no longer lists Craft' ((Get-CraftEntries).Count -eq 0)
  Check 'the .craft association is gone' ($null -eq (Get-ItemProperty 'HKCU:\Software\Classes\.craft' -ErrorAction SilentlyContinue) -and -not (Test-Path 'HKCU:\Software\Classes\Craft.Project'))
  if ($marker) { Check 'the user data marker is still there' (Test-Path $marker) }
  $after = Get-State
  Check 'the per-user registry and Start menu are exactly as before the first install' (($after | ConvertTo-Json -Compress) -eq ($before | ConvertTo-Json -Compress)) "(before $($before | ConvertTo-Json -Compress), after $($after | ConvertTo-Json -Compress))"

  # 6. Craft is running while the installer upgrades and uninstalls it. A running Craft.exe locks its own files. Measured on Windows 11: in a
  # silent (/qn) install Windows Installer's Restart Manager closes the running application (no prompt: there is no UI) and replaces the
  # files; this section holds that: the new files are in place, nothing is left behind and no reboot is needed. (An interactive install
  # shows the "files in use" dialog instead; that is Windows' own dialog and is not driven here.) The upgrade MSI is built from a copy of the
  # layout whose Craft.exe differs (a byte appended): with identical files there is nothing to replace and the test would prove nothing.
  Step '6. Upgrade and uninstall while Craft is running'
  function Start-InstalledCraft {
    $app = Start-Process (Join-Path $InstallDir 'Craft.exe') -PassThru
    # Wait for the window (a handle is an IntPtr: compare it as a number), then a little longer so that the application has finished loading.
    for ($i = 0; $i -lt 60 -and [int64]$app.MainWindowHandle -eq 0 -and -not $app.HasExited; $i++) { Start-Sleep -Milliseconds 500; $app.Refresh() }
    Start-Sleep -Seconds 3
    $app
  }
  $changed = Join-Path $work 'layout-changed'
  & robocopy $layout $changed /E /NFL /NDL /NJH /NJS /NP | Out-Null
  $stream = [IO.File]::Open((Join-Path $changed 'Craft.exe'), 'Append'); $stream.WriteByte(0); $stream.Close()
  Set-Content (Join-Path $changed 'upgrade-marker.txt') 'only in the upgrade'
  $runningMsi = & (Join-Path $PSScriptRoot 'build-installer.ps1') -InstallDir $changed -Version $upgradeVersion -OutDir (Join-Path $work 'upgrade-running') | Select-Object -Last 1
  Remove-Item $changed -Recurse -Force

  $code = Invoke-Msi @('/i', "`"$Msi`"", "INSTALLFOLDER=`"$InstallDir`"") 'install-running.log'
  Check 'installs again (exit 0)' ($code -eq 0) "(exit $code)"
  $hashBefore = (Get-FileHash (Join-Path $InstallDir 'Craft.exe')).Hash
  $app = Start-InstalledCraft
  Check 'the installed Craft is running with a window' ($app -and -not $app.HasExited -and [int64]$app.MainWindowHandle -ne 0)
  $code = Invoke-Msi @('/i', "`"$runningMsi`"", "INSTALLFOLDER=`"$InstallDir`"") 'upgrade-running.log'
  Check 'upgrading while it runs exits 0 (no reboot needed, not 3010, not a failure)' ($code -eq 0) "(exit $code, see $work\upgrade-running.log)"
  Check 'the running Craft was closed by the installer' ($app.WaitForExit(15000))
  Check 'Craft.exe was replaced' ((Get-FileHash (Join-Path $InstallDir 'Craft.exe')).Hash -ne $hashBefore)
  Check 'a file only the new version has is installed' (Test-Path (Join-Path $InstallDir 'upgrade-marker.txt'))
  Check 'no rollback or backup files were left in the install folder' (@(Get-ChildItem $InstallDir -Filter '*.rbf' -Force -ErrorAction SilentlyContinue).Count -eq 0)
  $entries = Get-CraftEntries
  Check 'one Craft entry in Settings > Apps, showing the new version' ($entries.Count -eq 1 -and (Get-ItemProperty $entries[0].PSPath).DisplayVersion -eq $upgradeVersion)
  $app = Start-InstalledCraft
  Check 'the upgraded Craft starts' ($app -and -not $app.HasExited)
  $code = Invoke-Msi @('/x', "`"$runningMsi`"") 'uninstall-running.log'
  Check 'uninstalling while it runs exits 0' ($code -eq 0) "(exit $code)"
  Check 'the running Craft was closed by the installer' ($app.WaitForExit(15000))
  Check 'the install folder is gone (nothing left behind)' (-not (Test-Path $InstallDir)) "($(@(Get-ChildItem $InstallDir -Recurse -Force -File -ErrorAction SilentlyContinue).Count) files left)"
  Check 'the user data marker is still there' ([bool]$marker -and (Test-Path $marker))
  $after = Get-State
  Check 'the per-user registry and Start menu are again exactly as before the first install' (($after | ConvertTo-Json -Compress) -eq ($before | ConvertTo-Json -Compress)) "(after $($after | ConvertTo-Json -Compress))"
} finally {
  Get-Process Craft -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue
  # An interrupted run must not leave a Craft installed for the user.
  if ((Get-CraftEntries).Count -gt 0) {
    Write-Host 'Cleaning up an installation left by an interrupted run...' -ForegroundColor Yellow
    Get-ChildItem $work -Filter '*.msi' -Recurse -ErrorAction SilentlyContinue | Out-Null
    foreach ($e in Get-CraftEntries) { Start-Process msiexec.exe -ArgumentList '/x', $e.PSChildName, '/qn', '/norestart' -Wait }
  }
  if ($marker -and (Test-Path $marker)) { Remove-Item $marker -Force }
  if ($markerFolder -and (Test-Path $markerFolder) -and -not (Get-ChildItem $markerFolder -Force)) { Remove-Item $markerFolder -Force }
}
if ($failures.Count) { Write-Host "`n$($failures.Count) check(s) FAILED: $($failures -join '; ')" -ForegroundColor Red; exit 1 }
Write-Host "`nThe installer installs, upgrades and uninstalls cleanly."
exit 0
