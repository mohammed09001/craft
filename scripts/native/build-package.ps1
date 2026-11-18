# Builds the Windows package: a Release build, the installed layout, and the portable ZIP.
#
#   . .\scripts\native\build-package.ps1            # full build
#   . .\scripts\native\build-package.ps1 -SkipBuild # re-install and re-package an existing build
#
# Outputs (all on the heavy-data drive, never in the repository):
#   <staging>\Craft-install\            the installed layout (what the installer would copy)
#   <build>\windows-package\packages\   Craft-<version>-windows-x64.zip
#
# Then verify the result with scripts\native\verify-install.ps1.

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$native = Join-Path $repoRoot 'native'
if (-not $InstallDir) { $InstallDir = Join-Path $env:CRAFT_STAGING_ROOT 'Craft-install' }
$buildDir = Join-Path $env:CRAFT_BUILD_ROOT 'windows-package'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Run($label) {
  if ($LASTEXITCODE -ne 0) { throw "$label failed (exit $LASTEXITCODE)." }
}

Step 'Python runtime'
$runtime = (& (Join-Path $PSScriptRoot 'prepare-python-runtime.ps1') | Select-Object -Last 1)
if (-not (Test-Path (Join-Path $runtime 'python.exe'))) { throw "No prepared Python runtime at '$runtime'." }

Push-Location $native
try {
  if (-not $SkipBuild) {
    Step 'Configure (windows-package, Release)'
    cmake --preset windows-package "-DCRAFT_PYTHON_RUNTIME_DIR=$runtime"
    Run 'configure'
    Step 'Build'
    cmake --build --preset windows-package
    Run 'build'
  }

  Step "Install -> $InstallDir"
  if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
  cmake --install $buildDir --prefix $InstallDir
  Run 'install'

  Step 'Package (portable ZIP)'
  Push-Location $buildDir
  try {
    cpack --config CPackConfig.cmake
    Run 'cpack'
  } finally { Pop-Location }
} finally { Pop-Location }

$zip = Get-ChildItem (Join-Path $buildDir 'packages') -Filter 'Craft-*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$installMb = [math]::Round((Get-ChildItem $InstallDir -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "`nInstalled layout: $InstallDir ($installMb MB)"
Write-Host ("Portable package: {0} ({1} MB)" -f $zip.FullName, [math]::Round($zip.Length / 1MB, 1))
