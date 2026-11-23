# Verifies that an installed (or unpacked) Craft layout is self-contained and works.
#
#   . .\scripts\native\verify-install.ps1 -InstallDir <folder with Craft.exe>
#
# What it proves, in order:
#   1. the layout: app, bundled Python, engine, worker, licenses;
#   2. the dependency closure: every non-system DLL any binary needs is inside the folder;
#   3. the app really runs from a hostile environment -- PATH reduced to the Windows
#      directories (no Qt, no MSVC, no Python), CRAFT_PYTHON / PYTHONPATH / PYTHONHOME
#      removed, a different working directory -- and its analysis jobs are served by
#      the BUNDLED interpreter (import analysis, then the moldability/cavity/readiness
#      analysis), after an STL import, a mold generation and a rendered frame;
#   4. running the app wrote nothing into the install folder.
# Exit code 0 only if every check passes.

[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$InstallDir,
  [string]$Stl,
  [switch]$SkipRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Stl) { $Stl = Join-Path $repoRoot 'native\tests\fixtures\models\bracket.stl' }
$InstallDir = (Resolve-Path $InstallDir).Path
$failures = New-Object System.Collections.Generic.List[string]

function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { Write-Host ("  PASS  {0}" -f $name) -ForegroundColor Green }
  else { Write-Host ("  FAIL  {0}  {1}" -f $name, $detail) -ForegroundColor Red; $script:failures.Add($name) }
}

Write-Host "`n== 1. Layout ($InstallDir)"
$exe = Join-Path $InstallDir 'Craft.exe'
Check 'Craft.exe' (Test-Path $exe)
Check 'bundled python.exe' (Test-Path (Join-Path $InstallDir 'python\python.exe'))
$pth = Get-ChildItem (Join-Path $InstallDir 'python') -Filter 'python*._pth' -ErrorAction SilentlyContinue | Select-Object -First 1
Check 'python _pth present and relative' ($null -ne $pth -and (Get-Content $pth.FullName -Raw) -match '\.\.\\analysis\\site' -and (Get-Content $pth.FullName -Raw) -notmatch '[A-Za-z]:\\')
Check 'worker script' (Test-Path (Join-Path $InstallDir 'analysis\craft_analysis_worker.py'))
Check 'native evaluation module' (Test-Path (Join-Path $InstallDir 'analysis\craft_native_evaluation.py'))
$kernelsDll = Join-Path $InstallDir 'analysis\craft_analysis_kernels.dll'
Check 'native kernels library' (Test-Path $kernelsDll)
# The installed kernels, loaded by the BUNDLED interpreter the way the worker loads them: the library must find its runtime there and
# pass the bit-for-bit check against that interpreter's own arithmetic.
$kernelProbe = 'import sys; sys.path[:0] = [sys.argv[1], sys.argv[2]]; import craft_native_evaluation as n; k, s = n.load_kernels(sys.argv[3]); print(s); sys.exit(0 if k is not None else 1)'
$kernelStatus = & (Join-Path $InstallDir 'python\python.exe') -I -c $kernelProbe (Join-Path $InstallDir 'analysis') (Join-Path $InstallDir 'analysis\site') $kernelsDll 2>&1 | Out-String
Check 'native kernels load and pass their check in the bundled interpreter' ($LASTEXITCODE -eq 0) $kernelStatus.Trim()
foreach ($pkg in 'mold_generator_engine', 'engineering_reports', 'engineering_analysis') {
  Check "engine package $pkg" (Test-Path (Join-Path $InstallDir "analysis\site\$pkg\__init__.py"))
}
Check 'engine dist-info (version metadata)' ($null -ne (Get-ChildItem (Join-Path $InstallDir 'analysis\site') -Directory -Filter 'mold_generator_engine-*.dist-info' -ErrorAction SilentlyContinue))
$pyc = @(Get-ChildItem (Join-Path $InstallDir 'analysis\site') -Recurse -Filter '*.pyc' -ErrorAction SilentlyContinue).Count
Check "engine precompiled ($pyc .pyc files)" ($pyc -gt 50)
Check 'Qt platform plugin' (Test-Path (Join-Path $InstallDir 'platforms\qwindows.dll'))
Check 'QML modules deployed' (Test-Path (Join-Path $InstallDir 'qml'))
Check 'license notices' ((Test-Path (Join-Path $InstallDir 'licenses\THIRD_PARTY_NOTICES.txt')) -and (Test-Path (Join-Path $InstallDir 'licenses\Manifold-LICENSE-Apache-2.0.txt')) -and (Test-Path (Join-Path $InstallDir 'licenses\Clipper2-LICENSE-BSL-1.0.txt')) -and (Test-Path (Join-Path $InstallDir 'python\LICENSE.txt')))
# The executable must not carry a developer's interpreter or worker path as a silent fallback.
$exeBytes = [IO.File]::ReadAllBytes($exe)
$ascii = [Text.Encoding]::ASCII.GetString($exeBytes)
$utf16 = [Text.Encoding]::Unicode.GetString($exeBytes)
$baked = @('python\venv', 'python/venv', 'CraftNative\python', 'CraftNative/python', 'craft_analysis_worker.py') | Where-Object { $ascii.Contains($_) -or $utf16.Contains($_) }
# "analysis/craft_analysis_worker.py" (relative) is the bundled-layout name; only an absolute path is a leak.
$absoluteLeak = [regex]::IsMatch($ascii, '[A-Za-z]:[\\/][^\0]{0,200}(python[\\/]venv|craft_analysis_worker\.py)') -or [regex]::IsMatch($utf16, '[A-Za-z]:[\\/][^\0]{0,200}(python[\\/]venv|craft_analysis_worker\.py)')
Check 'Craft.exe has no absolute development runtime path baked in' (-not $absoluteLeak) 'an absolute python/worker path is compiled into the executable'$leaks = @(Get-ChildItem $InstallDir -Recurse -File | Where-Object { $_.Extension -in '.pdb', '.ilk', '.obj', '.lib', '.cmake' })
Check 'no build leftovers (.pdb/.ilk/.obj/.lib)' ($leaks.Count -eq 0) (($leaks | Select-Object -First 5 | ForEach-Object Name) -join ', ')
$devRefs = @(Get-ChildItem $InstallDir -Recurse -File -Include '*.txt', '*.json', '*.cfg', '*._pth', '*.py' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\site\\|\\Lib\\|python313.zip|\\licenses\\|\\qml\\' } |
  Select-String -Pattern 'D:\\CraftNative|C:\\projects|\\Craft 3D Requirement' -ErrorAction SilentlyContinue)
Check 'no development paths in config files' ($devRefs.Count -eq 0) (($devRefs | Select-Object -First 3 | ForEach-Object { $_.Path }) -join ', ')

Write-Host "`n== 2. Dependency closure"
$dumpbin = (Get-Command dumpbin.exe -ErrorAction SilentlyContinue).Source
if (-not $dumpbin) { Write-Host '  (dumpbin not found: MSVC environment missing)' -ForegroundColor Yellow; $failures.Add('dumpbin available') }
else {
  $inside = @{}
  Get-ChildItem $InstallDir -Recurse -File -Include '*.dll', '*.exe', '*.pyd' | ForEach-Object { $inside[$_.Name.ToLowerInvariant()] = $true }
  $system = Join-Path $env:SystemRoot 'System32'
  $missing = @{}
  $binaries = Get-ChildItem $InstallDir -Recurse -File -Include '*.dll', '*.exe', '*.pyd'
  foreach ($bin in $binaries) {
    $lines = & $dumpbin /nologo /dependents $bin.FullName 2>$null
    foreach ($line in $lines) {
      if ($line -match '^\s+([\w\.\-\+]+\.(dll|DLL))\s*$') {
        $dep = $Matches[1].ToLowerInvariant()
        if ($dep -like 'api-ms-win-*' -or $dep -like 'ext-ms-win-*') { continue }
        if ($inside.ContainsKey($dep)) { continue }
        if (Test-Path (Join-Path $system $dep)) { continue }
        $missing["$dep  (needed by $($bin.Name))"] = $true
      }
    }
  }
  Check ("every dependency resolves inside the folder or System32 ({0} binaries scanned)" -f $binaries.Count) ($missing.Count -eq 0) (($missing.Keys | Select-Object -First 6) -join '; ')
}

if ($SkipRun) { Write-Host "`n(-SkipRun: not launching the app)"; if ($failures.Count) { exit 1 } else { exit 0 } }

Write-Host "`n== 3. Run from a hostile environment"
$scratch = Join-Path $env:CRAFT_HEAVY_ROOT ('temp\verify-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$summaryPath = Join-Path $scratch 'summary.json'

$before = Get-ChildItem $InstallDir -Recurse -File | Measure-Object Length -Sum
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $exe
$startInfo.WorkingDirectory = $scratch                      # not the install directory
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Arguments = "--smoke-test --import `"$Stl`" --generate-mold --analyze --moldability --summary `"$summaryPath`""
$startInfo.EnvironmentVariables.Clear()
$sys = $env:SystemRoot
$startInfo.EnvironmentVariables['SystemRoot'] = $sys
$startInfo.EnvironmentVariables['PATH'] = "$sys\System32;$sys"          # no Qt, no MSVC, no Python
$startInfo.EnvironmentVariables['TEMP'] = $scratch
$startInfo.EnvironmentVariables['TMP'] = $scratch
$startInfo.EnvironmentVariables['LOCALAPPDATA'] = Join-Path $scratch 'localappdata'
$startInfo.EnvironmentVariables['APPDATA'] = Join-Path $scratch 'appdata'
$startInfo.EnvironmentVariables['CRAFT_AUTOSAVE_DIR'] = Join-Path $scratch 'autosave'
$startInfo.EnvironmentVariables['CRAFT_CACHE_DIR'] = Join-Path $scratch 'cache'
Write-Host "  PATH = $($startInfo.EnvironmentVariables['PATH'])   (CRAFT_PYTHON, PYTHONPATH, PYTHONHOME unset)"
$process = [System.Diagnostics.Process]::Start($startInfo)
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
if (-not $process.WaitForExit(240000)) { $process.Kill(); Check 'app finished within 240 s' $false }
$out = $stdout.Result; $err = $stderr.Result
Check 'smoke test passed (CRAFT_SMOKE_OK, exit 0)' ($process.ExitCode -eq 0 -and $out -match 'CRAFT_SMOKE_OK') "exit=$($process.ExitCode) $err"

if (Test-Path $summaryPath) {
  $s = Get-Content $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
  # Qt reports forward slashes; compare normalized, case-insensitive paths.
  $norm = { param($x) ([string]$x).Replace('/', '\').TrimEnd('\') }
  $root = & $norm $InstallDir
  $pythonPath = & $norm $s.analysisPython
  Check 'analysis served by the bundled runtime' ($s.analysisRuntimeSource -eq 'bundled runtime') "source=$($s.analysisRuntimeSource)"
  Check 'interpreter is inside the install folder' ($pythonPath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) $pythonPath
  Check 'worker script is inside the install folder' ((& $norm $s.analysisWorkerScript).StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) $s.analysisWorkerScript
  Check 'the application resolved the installed native kernels' ($s.analysisKernels -and (& $norm $s.analysisKernels) -eq (& $norm (Join-Path $InstallDir 'analysis\craft_analysis_kernels.dll'))) "kernels=$($s.analysisKernels)"
  Check 'worker reports Python 3.13.17' ($s.analysisWorkerInfo.python -eq '3.13.17') "python=$($s.analysisWorkerInfo.python)"
  Check 'engine version resolved from the bundled metadata' ($s.analysisWorkerInfo.engine.version -match '^\d+\.\d+\.\d+') "engine=$($s.analysisWorkerInfo.engine | ConvertTo-Json -Compress)"
  # One version: what the executable carries (Explorer's Details tab, what an installer compares to decide an upgrade) is what the application
  # reports and writes into projects and exports. A mismatch would mean the version resource and the code drifted apart.
  $versionInfo = (Get-Item $exe).VersionInfo
  Check 'Craft.exe carries a product version' ($versionInfo.ProductVersion -match '^\d+\.\d+\.\d+$') "ProductVersion=$($versionInfo.ProductVersion)"
  Check 'Craft.exe file version equals its product version' ($versionInfo.FileVersion -eq $versionInfo.ProductVersion) "file=$($versionInfo.FileVersion) product=$($versionInfo.ProductVersion)"
  Check 'the application reports the version the executable carries' ($s.applicationVersion -eq $versionInfo.ProductVersion) "app=$($s.applicationVersion) exe=$($versionInfo.ProductVersion)"
  Check 'STL imported' ($s.modelPhase -eq 'ready')
  Check 'mold generated (Manifold kernel)' ($s.moldPhase -eq 'complete')
  # P0-5: the mold runs in a separate process (this same Craft.exe in --geometry-worker mode), which a cancel can kill. Its log line proves the installed executable can start itself as that worker.
  Check 'the mold ran in a geometry worker process from the install folder' ($err -match 'geometry worker: .* succeeded') ($err.Trim().Substring(0, [Math]::Min(300, $err.Trim().Length)))
  Check 'import analysis completed (Python)' ($s.analysisPhase -eq 'complete')
  $reports = $s.engineeringReportsSummary
  Check 'moldability analysis completed (Python: pull direction, cavity, readiness)' ($reports.phase -eq 'complete' -and $reports.report.success -eq $true) "phase=$($reports.phase) $($reports.error)"
  Check 'cavity analysis and readiness present' ($reports.cavity.available -eq $true -and $reports.readiness.available -eq $true)
  Check 'a frame was rendered' ($s.frameNonBackgroundSamples -gt 50)
  Check 'no QML/Qt warnings on stderr' ($err -notmatch 'TypeError|ReferenceError|Unable to assign|QML.*(error|warning)') $err
}
else { Check 'summary written' $false 'no summary.json' }

Write-Host "`n== 4. The run left the install folder untouched"
$after = Get-ChildItem $InstallDir -Recurse -File | Measure-Object Length -Sum
Check ("file count and size unchanged ({0} files)" -f $after.Count) ($before.Count -eq $after.Count -and $before.Sum -eq $after.Sum) "before $($before.Count)/$($before.Sum), after $($after.Count)/$($after.Sum)"

Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
if ($failures.Count -gt 0) { Write-Host ("{0} check(s) FAILED: {1}" -f $failures.Count, ($failures -join '; ')) -ForegroundColor Red; exit 1 }
Write-Host 'All checks passed.' -ForegroundColor Green
exit 0
