# Makes the WiX Toolset 3.14 build tools available (the installer is built with them; they are not part of the package) and prints the
# folder that holds candle.exe, heat.exe and light.exe as its last output line.
#
# The archive is pinned by URL, size and SHA-256 in native/packaging/pins.json ("wix-toolset-binaries"). It is unsigned and GitHub publishes
# no digest for it, so the hash is trust on first use (see the pin's comment). It is fetched only here, only when the tools are missing, and
# only into the heavy-data root on D: (CRAFT_TOOLS_ROOT\wix314 or CRAFT_HEAVY_ROOT\tools\wix314), never into the repository.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$pin = (Get-Content (Join-Path $repoRoot 'native\packaging\pins.json') -Raw | ConvertFrom-Json).'wix-toolset-binaries'
$root = if ($env:CRAFT_TOOLS_ROOT) { $env:CRAFT_TOOLS_ROOT } else { Join-Path $env:CRAFT_HEAVY_ROOT 'tools' }
$dest = Join-Path $root 'wix314'

if (-not (Test-Path (Join-Path $dest 'candle.exe'))) {
  $download = Join-Path $env:CRAFT_HEAVY_ROOT 'temp\pkgdl'
  New-Item -ItemType Directory -Force -Path $download | Out-Null
  $zip = Join-Path $download (Split-Path $pin.url -Leaf)
  if (-not (Test-Path $zip)) {
    Write-Host "Downloading $($pin.url)"
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $pin.url -OutFile $zip -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 600
  }
  if ((Get-Item $zip).Length -ne $pin.sizeBytes) { throw "WiX archive has $((Get-Item $zip).Length) bytes, the pin says $($pin.sizeBytes). Refusing to use it." }
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $pin.sha256) { throw "SHA-256 mismatch for $zip`n  expected $($pin.sha256)`n  actual   $actual`nRefusing to use an unverified toolchain." }
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Expand-Archive -Path $zip -DestinationPath $dest -Force
}
foreach ($tool in 'candle.exe', 'light.exe', 'heat.exe') { if (-not (Test-Path (Join-Path $dest $tool))) { throw "$tool is missing from $dest." } }
$dest
