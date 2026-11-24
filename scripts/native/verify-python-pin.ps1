# Checks the pinned Python runtime (native/packaging/pins.json, D-051) against what python.org publishes, so that the pin is no longer
# trust-on-first-use. Three independent facts must hold, and the script fails if any does not:
#
#   1. a fresh download of the pinned URL has the pinned SHA-256 (the cached file, and the pin, are what the server serves now);
#   2. the detached OpenPGP signature python.org publishes next to it (<url>.asc) is a good signature;
#   3. the key that made it has the fingerprint pinned in pins.json as `signingKeyFingerprint`, which was itself taken from python.org's
#      own key list (https://www.python.org/downloads/metadata/pgp/, "Steve Dower (Windows binaries)").
#
# The public key is fetched from the link python.org's key list gives (Keybase) into a throwaway GnuPG home, so nothing is added to the
# user's keyring. python.org publishes no MD5/SHA-256 for the embeddable zip on its release page (only the .asc, .sigstore and SPDX files),
# which is why the signature is the check. Sigstore verification is not done here.
#
#   .\scripts\native\verify-python-pin.ps1            exit 0 when all three hold
#
# Needs gpg (Git for Windows ships one) and network access to python.org and keybase.io. Everything goes under the heavy-data root.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$pin = (Get-Content (Join-Path $repoRoot 'native\packaging\pins.json') -Raw | ConvertFrom-Json).'python-embed-win-amd64'
if (-not $pin.signingKeyFingerprint) { throw 'pins.json has no signingKeyFingerprint for the Python runtime.' }
$expectedFingerprint = ($pin.signingKeyFingerprint -replace '\s', '').ToUpperInvariant()

$gpg = (Get-Command gpg -ErrorAction SilentlyContinue).Source
if (-not $gpg) { $gpg = 'C:\Program Files\Git\usr\bin\gpg.exe' }
if (-not (Test-Path $gpg)) { throw 'gpg was not found (Git for Windows ships one at C:\Program Files\Git\usr\bin\gpg.exe).' }

# A fresh, empty folder each run: downloaded files are untrusted data and never mixed with scripts.
$work = Join-Path $env:CRAFT_HEAVY_ROOT ('temp\verify-python-pin-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$gnupg = Join-Path $work 'gnupg'; New-Item -ItemType Directory -Force -Path $gnupg | Out-Null
$zip = Join-Path $work 'runtime.zip'; $sig = "$zip.asc"; $key = Join-Path $work 'signing-key.asc'
$ProgressPreference = 'SilentlyContinue'
try {
  Invoke-WebRequest -Uri $pin.url -OutFile $zip -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 300
  Invoke-WebRequest -Uri ($pin.url + '.asc') -OutFile $sig -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 60
  Invoke-WebRequest -Uri $pin.signingKeyUrl -OutFile $key -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 60

  # 1. the hash
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $pin.sha256) { throw "FAIL 1: a fresh download has SHA-256 $actual, the pin says $($pin.sha256)." }
  Write-Host "ok 1: a fresh download of the pinned URL has the pinned SHA-256 ($actual)"

  # 2 and 3. the signature, and whose key made it
  # Git's gpg is an MSYS program: it needs the home folder as /d/... and writes progress to stderr, which is not an error here.
  $msys = { param($path) '/' + $path.Substring(0, 1).ToLowerInvariant() + $path.Substring(2).Replace('\', '/') }
  $gpgHome = & $msys $gnupg
  $ErrorActionPreference = 'Continue'
  & $gpg --homedir $gpgHome --batch --quiet --import $key 2>&1 | Out-Null
  $status = & $gpg --homedir $gpgHome --batch --status-fd 1 --verify $sig $zip 2>&1 | Out-String
  $ErrorActionPreference = 'Stop'
  $good = [regex]::Match($status, '\[GNUPG:\] VALIDSIG (\w+) .* (\w{40})\r?\n')
  if ($status -notmatch '\[GNUPG:\] GOODSIG' -or -not $good.Success) { throw "FAIL 2: the signature is not a good signature.`n$status" }
  Write-Host 'ok 2: python.org''s detached signature is a good OpenPGP signature of that file'
  $primary = $good.Groups[2].Value.ToUpperInvariant()
  if ($primary -ne $expectedFingerprint) { throw "FAIL 3: the signing key is $primary, the pin expects $expectedFingerprint." }
  Write-Host "ok 3: the signing key is the one pinned from python.org's key list ($primary)"
  Write-Host 'The Python runtime pin is verified against python.org (hash and signature).'
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
