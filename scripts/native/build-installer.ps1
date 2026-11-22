# Builds the Windows installer (a per-user MSI) from the installed layout that build-package.ps1 produced (PK-2).
#
#   . .\scripts\native\build-installer.ps1                       version from native/CMakeLists.txt, layout from the staging folder
#   . .\scripts\native\build-installer.ps1 -Version 0.1.1        another product version (the upgrade test builds one)
#   . .\scripts\native\build-installer.ps1 -InstallDir <folder>  another layout
#
# Output (on the heavy-data drive, never in the repository): <build>\windows-package\packages\Craft-<version>-windows-x64.msi
# The MSI is NOT signed: that needs the owner's certificate (PK-5). Test it with scripts\native\verify-installer.ps1.
[CmdletBinding()]
param(
  [string]$InstallDir,
  [string]$Version,
  [string]$OutDir
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $InstallDir) { $InstallDir = Join-Path $env:CRAFT_STAGING_ROOT 'Craft-install' }
if (-not (Test-Path (Join-Path $InstallDir 'Craft.exe'))) { throw "No installed layout at '$InstallDir' (run build-package.ps1 first)." }
$InstallDir = (Resolve-Path $InstallDir).Path
if (-not $Version) {
  $cmake = Get-Content (Join-Path $repoRoot 'native\CMakeLists.txt') -Raw
  $m = [regex]::Match($cmake, 'project\(\s*\w+\s+VERSION\s+(\d+\.\d+\.\d+)')
  if (-not $m.Success) { throw 'The product version was not found in native/CMakeLists.txt.' }
  $Version = $m.Groups[1].Value
}
if ($Version -notmatch '^\d{1,3}\.\d{1,3}\.\d{1,5}$') { throw "'$Version' is not a valid MSI product version (major < 256, minor < 256, build < 65536)." }
if (-not $OutDir) { $OutDir = Join-Path $env:CRAFT_BUILD_ROOT 'windows-package\packages' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$wixSource = Join-Path $repoRoot 'native\packaging\wix\Craft.wxs'
$work = Join-Path $env:CRAFT_BUILD_ROOT 'windows-package\wix'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Run($label) { if ($LASTEXITCODE -ne 0) { throw "$label failed (exit $LASTEXITCODE)." } }

$wix = (& (Join-Path $PSScriptRoot 'prepare-wix.ps1') | Select-Object -Last 1)

Step "Harvest $InstallDir"
# -gg: component GUIDs at harvest (a major upgrade replaces the whole product, so they need not be stable); -srd: no root directory element
# (the files go straight into INSTALLFOLDER); -sreg/-scom/-sfrag/-suid: nothing but files and directories.
& (Join-Path $wix 'heat.exe') dir $InstallDir -nologo -cg CraftFiles -dr INSTALLFOLDER -gg -srd -sreg -scom -sfrag -suid -var var.SourceDir -out (Join-Path $work 'Files.wxs')
Run 'heat'

Step 'Compile'
& (Join-Path $wix 'candle.exe') -nologo -arch x64 "-dVersion=$Version" "-dSourceDir=$InstallDir" -out ($work + '\') $wixSource (Join-Path $work 'Files.wxs')
Run 'candle'

Step 'Link'
$msi = Join-Path $OutDir "Craft-$Version-windows-x64.msi"
if (Test-Path $msi) { Remove-Item $msi -Force }
# A per-user package installs into the user's profile. ICE38/ICE64/ICE91 want a registry key path per component and explicit removal of
# every directory for that case; the files are removed by Windows Installer's own file table and the layout is checked by
# verify-installer.ps1 (a real install and uninstall), so these three are suppressed and nothing else is.
& (Join-Path $wix 'light.exe') -nologo -sice:ICE38 -sice:ICE64 -sice:ICE91 -out $msi (Join-Path $work 'Craft.wixobj') (Join-Path $work 'Files.wixobj')
Run 'light'

$mb = [math]::Round((Get-Item $msi).Length / 1MB, 1)
$hash = (Get-FileHash $msi -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "`nInstaller: $msi ($mb MB)`nSHA-256:   $hash`nNot signed (PK-5)."
$msi
