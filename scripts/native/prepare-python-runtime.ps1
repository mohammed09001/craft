# Assembles the Python runtime that ships inside the installed application.
#
# The runtime is the official python.org *embeddable* distribution of the
# pinned version (native/packaging/pins.json), verified against its pinned
# SHA-256, plus a `pythonXY._pth` that makes the interpreter ignore the
# environment (PYTHONPATH, user site, registry) and look only at its own
# standard library and the bundled engine:
#
#     python313.zip         the standard library
#     .                     the extension modules next to python.exe
#     ..\analysis\site      mold_generator_engine, engineering_reports, ...
#
# The engine has no third-party dependencies, so nothing is pip-installed.
# Output goes to the heavy-data root on D: (development-machine policy), not
# into the repository.

[CmdletBinding()]
param(
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$pins = Get-Content (Join-Path $repoRoot 'native\packaging\pins.json') -Raw | ConvertFrom-Json
$pin = $pins.'python-embed-win-amd64'

if (-not $OutDir) { $OutDir = Join-Path $env:CRAFT_STAGING_ROOT "python-runtime-$($pin.version)" }
$download = Join-Path $env:CRAFT_HEAVY_ROOT 'temp\pkgdl'
New-Item -ItemType Directory -Force -Path $download | Out-Null
$zip = Join-Path $download (Split-Path $pin.url -Leaf)

if (-not (Test-Path $zip)) {
  Write-Host "Downloading $($pin.url)"
  Invoke-WebRequest -Uri $pin.url -OutFile $zip -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 300
}
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $pin.sha256) {
  throw "SHA-256 mismatch for $zip`n  expected $($pin.sha256)`n  actual   $actual`nRefusing to bundle an unverified runtime."
}

if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $OutDir -Force

$versionParts = $pin.version.Split('.')
$tag = "$($versionParts[0])$($versionParts[1])"          # 3.13.17 -> 313
$pth = Join-Path $OutDir "python$tag._pth"
if (-not (Test-Path $pth)) { throw "The distribution has no python$tag._pth; the layout changed and this script must be reviewed." }
[IO.File]::WriteAllText($pth, "python$tag.zip`r`n.`r`n..\analysis\site`r`n", [Text.Encoding]::ASCII)

# The bundle must be self-sufficient: the interpreter starts and sees only its own files.
$check = & (Join-Path $OutDir 'python.exe') -I -c "import sys, json, importlib.metadata; print(sys.version.split()[0]); print(*[p for p in sys.path if p])"
if ($LASTEXITCODE -ne 0) { throw 'The assembled runtime does not start.' }
$check | ForEach-Object { Write-Host "  $_" }
if ($check[0] -ne $pin.version) { throw "Runtime reports $($check[0]) but $($pin.version) was pinned." }
$mb = [math]::Round((Get-ChildItem $OutDir -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "Python runtime ready: $OutDir ($mb MB)"
Write-Output $OutDir
