# Craft native migration -- Windows development environment.
#
# Dot-source this from any PowerShell session before configuring/building:
#
#     . .\scripts\native\windows-env.ps1
#
# It is session-local: nothing is persisted machine-wide. Every heavy location
# (SDKs, caches, build trees, temp) is routed to the heavy-data root on D:
# because C: has limited free space on the development machine. D: is a
# development-storage constraint only -- the shipped application never refers
# to it (runtime paths come from QStandardPaths).
#
# Every default below can be overridden by setting the variable before
# sourcing, e.g. `$env:CRAFT_QT_DIR = 'E:\Qt\6.8.3\msvc2022_64'`.

$ErrorActionPreference = 'Stop'

function Set-CraftDefault([string]$Name, [string]$Value) {
  if (-not [Environment]::GetEnvironmentVariable($Name, 'Process')) {
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
  }
}

Set-CraftDefault 'CRAFT_HEAVY_ROOT' 'D:\CraftNative'
$HeavyRoot = $env:CRAFT_HEAVY_ROOT

if (-not (Test-Path (Split-Path -Qualifier $HeavyRoot))) {
  throw "Heavy-data drive for '$HeavyRoot' is missing. Refusing to fall back to C:."
}

$needed = @(
  "$HeavyRoot\sdk", "$HeavyRoot\tools", "$HeavyRoot\deps",
  "$HeavyRoot\caches\pip", "$HeavyRoot\caches\npm", "$HeavyRoot\caches\cmake",
  "$HeavyRoot\python", "$HeavyRoot\build", "$HeavyRoot\staging",
  "$HeavyRoot\temp", "$HeavyRoot\logs", "$HeavyRoot\worktrees"
)
$needed | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

# Session-local redirects of everything that would otherwise land on C:.
$env:TEMP = "$HeavyRoot\temp"
$env:TMP = "$HeavyRoot\temp"
$env:PIP_CACHE_DIR = "$HeavyRoot\caches\pip"
$env:npm_config_cache = "$HeavyRoot\caches\npm"
Set-CraftDefault 'CMAKE_BUILD_PARALLEL_LEVEL' '4'

# Consumed by native/CMakePresets.json.
Set-CraftDefault 'CRAFT_BUILD_ROOT' "$HeavyRoot\build"
Set-CraftDefault 'CRAFT_DEPS_ROOT' "$HeavyRoot\deps"
Set-CraftDefault 'CRAFT_STAGING_ROOT' "$HeavyRoot\staging"

# Toolchain locations discovered on this machine during the Phase 0 audit.
Set-CraftDefault 'CRAFT_QT_DIR' 'D:\Qt\6.8.3\msvc2022_64'
Set-CraftDefault 'CRAFT_CMAKE_DIR' 'D:\Craft 3D Requirement\toolchains\cmake-4.4.3-windows-x86_64\bin'
Set-CraftDefault 'CRAFT_NINJA_DIR' 'D:\Craft 3D Requirement\toolchains\ninja'
Set-CraftDefault 'CRAFT_PYTHON_HOME' "$HeavyRoot\sdk\python-3.13.17"
Set-CraftDefault 'CRAFT_PYTHON_VENV' "$HeavyRoot\python\venv"
# The interpreter the native app launches for the analysis worker in a
# development build (a packaged build uses its bundled runtime instead).
Set-CraftDefault 'CRAFT_PYTHON' "$($env:CRAFT_PYTHON_VENV)\Scripts\python.exe"

foreach ($required in 'CRAFT_QT_DIR', 'CRAFT_CMAKE_DIR', 'CRAFT_NINJA_DIR') {
  $path = [Environment]::GetEnvironmentVariable($required, 'Process')
  if (-not (Test-Path $path)) { throw "$required points at a missing path: $path" }
}

# Optional portable Node (only used to regression-test the reference frontend).
$node = Get-ChildItem "$HeavyRoot\tools" -Directory -Filter 'node-v*-win-x64' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1

# MSVC: import the vcvars64 environment once per session.
if (-not $env:VSCMD_VER) {
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) { throw 'vswhere.exe not found; install Visual Studio Build Tools 2022.' }
  $vsRoot = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (-not $vsRoot) { throw 'No Visual Studio installation with the x64 C++ toolset was found.' }
  $vcvars = Join-Path $vsRoot 'VC\Auxiliary\Build\vcvars64.bat'
  cmd /c "`"$vcvars`" >nul 2>&1 && set" | ForEach-Object {
    $pair = $_ -split '=', 2
    if ($pair.Count -eq 2) { [Environment]::SetEnvironmentVariable($pair[0], $pair[1], 'Process') }
  }
  if (-not $env:VSCMD_VER) { throw "vcvars64.bat did not initialise the MSVC environment ($vcvars)." }
}

$prepend = @($env:CRAFT_CMAKE_DIR, $env:CRAFT_NINJA_DIR, "$($env:CRAFT_QT_DIR)\bin")
if ($node) { $prepend += $node.FullName }
foreach ($entry in $prepend) {
  if (($env:Path -split ';') -notcontains $entry) { $env:Path = "$entry;$env:Path" }
}

$ErrorActionPreference = 'Continue'
Write-Host "Craft native env ready: heavy root $HeavyRoot, Qt $($env:CRAFT_QT_DIR), MSVC $($env:VSCMD_VER)"
