# Crash recovery with a REAL operating-system kill (docs/native-migration/RISKS.md, R-Project-3).
#
#   .\scripts\native\crash-drill.ps1 [-Stl part.stl] [-Rounds 10] [-MaxKillDelayMs 2500] [-Seed 1] [-Config windows-release]
#
# Each round starts the application as a "victim" (Craft.exe --crash-victim): it imports the part and keeps editing it with a very short
# autosave interval, so an autosave is being written almost all the time. When the first autosave exists the script waits a random time and
# kills the process with TerminateProcess (Stop-Process -Force: no cleanup runs, as in a crash or a power cut at the process level), then starts
# the application as a "probe" (Craft.exe --recover-probe) on the same autosave folder and checks what it finds:
#   - at least one recovery offer (an autosave that was complete before the kill is never lost, whatever moment the kill hits),
#   - the offer opens as a project (no unreadable or half-written file is ever offered as the recovery),
#   - the recovered model is the right one (name and triangle count) and the edit state is one the victim really wrote,
#   - it reports every other file the kill left in the autosave folder (a killed write leaves a temporary file behind, as big as the project),
#     and a second probe, after those files have been aged by ten minutes, checks that the application removed them (a recent one is never removed).
# A big part makes the kill land inside a write most of the time (the default is the 62.5 MiB sphere used for the large-model checks, if present).
# Needs a development build (cmake --build --preset windows-release --target craft, from native/, with the tests enabled).
[CmdletBinding()]
param(
  [string]$Stl,
  [int]$Rounds = 10,
  [int]$MaxKillDelayMs = 2500,
  [int]$Seed = 1,
  [string]$Config = 'windows-release'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repo 'scripts\native\windows-env.ps1') | Out-Null
$craft = Join-Path (Join-Path $env:CRAFT_BUILD_ROOT $Config) 'Craft.exe'
if (-not (Test-Path $craft)) { throw "Craft.exe not found at $craft; build it first." }
if (-not $Stl) {
  $big = Join-Path $env:CRAFT_BUILD_ROOT 'viewport-compare\models\sphere_1_3m.stl'
  $Stl = if (Test-Path $big) { $big } else { Join-Path $repo 'native\tests\fixtures\models\bracket.stl' }
}
$Stl = (Resolve-Path $Stl).Path
$expectedTriangles = [int][BitConverter]::ToUInt32([IO.File]::ReadAllBytes($Stl)[80..83], 0)   # binary STL: the count after the 80-byte header
$expectedName = [IO.Path]::GetFileName($Stl)
$steps = 40
$allowedClearances = 1..$steps | ForEach-Object { [math]::Round(0.1 * $_, 6) }
$env:PATH = "$env:CRAFT_QT_BIN;$env:PATH"
$rng = [System.Random]::new($Seed)
$work = Join-Path $env:CRAFT_BUILD_ROOT ('crash-drill\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $work | Out-Null
"Part: $Stl ($expectedTriangles triangles), $Rounds rounds, kill after 0-$MaxKillDelayMs ms, seed $Seed. Work folder: $work"

$failures = 0
$rows = @()
for ($round = 1; $round -le $Rounds; $round++) {
  $dir = Join-Path $work "round$round"
  $autosave = Join-Path $dir 'autosave'
  New-Item -ItemType Directory -Force -Path $autosave | Out-Null
  $ready = Join-Path $dir 'ready.json'
  $summary = Join-Path $dir 'summary.json'
  $env:CRAFT_AUTOSAVE_DIR = $autosave

  $victim = Start-Process -FilePath $craft -ArgumentList @('--crash-victim', $ready, '--import', $Stl) -PassThru
  $deadline = (Get-Date).AddSeconds(180)
  while (-not (Test-Path $ready) -and (Get-Date) -lt $deadline -and -not $victim.HasExited) { Start-Sleep -Milliseconds 50 }
  if (-not (Test-Path $ready)) {
    if (-not $victim.HasExited) { Stop-Process -Id $victim.Id -Force }
    $rows += [pscustomobject]@{ Round = $round; KillAfterMs = '-'; Offers = '-'; Recovered = $false; Clearance = '-'; Stray = '-'; Cleaned = '-'; Verdict = 'FAIL: the victim never became ready' }
    $failures++; continue
  }
  $delay = $rng.Next(0, $MaxKillDelayMs + 1)
  Start-Sleep -Milliseconds $delay
  $alive = -not $victim.HasExited
  if ($alive) { Stop-Process -Id $victim.Id -Force }
  $victim.WaitForExit()
  if (-not $alive) {
    $rows += [pscustomobject]@{ Round = $round; KillAfterMs = $delay; Offers = '-'; Recovered = $false; Clearance = '-'; Stray = '-'; Cleaned = '-'; Verdict = 'FAIL: the victim exited by itself before the kill' }
    $failures++; continue
  }

  $probe = Start-Process -FilePath $craft -ArgumentList @('--recover-probe', $summary) -PassThru
  if (-not $probe.WaitForExit(120000)) { Stop-Process -Id $probe.Id -Force }
  if (-not (Test-Path $summary)) {
    $rows += [pscustomobject]@{ Round = $round; KillAfterMs = $delay; Offers = '-'; Recovered = $false; Clearance = '-'; Stray = '-'; Cleaned = '-'; Verdict = 'FAIL: the probe wrote no summary' }
    $failures++; continue
  }
  $s = Get-Content $summary -Raw | ConvertFrom-Json
  $problems = @()
  $offers = @($s.offers).Count
  if ($offers -lt 1) { $problems += 'no recovery offer' }
  if (-not $s.recovered) { $problems += "not recovered ($($s.error))" }
  elseif ($s.modelName -ne $expectedName -or [int]$s.modelTriangles -ne $expectedTriangles) { $problems += "wrong model ($($s.modelName), $($s.modelTriangles) triangles)" }
  elseif (-not ($allowedClearances | Where-Object { [math]::Abs($_ - [double]$s.cavityClearanceMm) -lt 1e-6 })) { $problems += "a clearance the victim never wrote ($($s.cavityClearanceMm))" }
  $stray = @($s.files | Where-Object { $_.name -notlike '*.craft' })
  $strayText = if ($stray.Count) { ('{0} file(s), {1:N1} MiB' -f $stray.Count, (($stray | Measure-Object size -Sum).Sum / 1MB)) } else { 'none' }
  # A leftover is removed only once it is stale (two minutes without a write): age them, start the application again and look.
  $cleaned = '-'
  if ($stray.Count) {
    foreach ($file in $stray) { (Get-Item (Join-Path $autosave $file.name)).LastWriteTime = (Get-Date).AddMinutes(-10) }
    $summary2 = Join-Path $dir 'summary2.json'
    $probe2 = Start-Process -FilePath $craft -ArgumentList @('--recover-probe', $summary2) -PassThru
    if (-not $probe2.WaitForExit(120000)) { Stop-Process -Id $probe2.Id -Force }
    $left = if (Test-Path $summary2) { @((Get-Content $summary2 -Raw | ConvertFrom-Json).files | Where-Object { $_.name -notlike '*.craft' }).Count } else { -1 }
    $cleaned = if ($left -eq 0) { 'yes' } else { 'NO' }
    if ($left -ne 0) { $problems += 'a stale leftover was not removed' }
  }
  $verdict = if ($problems) { 'FAIL: ' + ($problems -join '; ') } else { 'ok' }
  if ($problems) { $failures++ }
  $rows += [pscustomobject]@{ Round = $round; KillAfterMs = $delay; Offers = $offers; Recovered = [bool]$s.recovered; Clearance = $s.cavityClearanceMm; Stray = $strayText; Cleaned = $cleaned; Verdict = $verdict }
}
Remove-Item Env:\CRAFT_AUTOSAVE_DIR -ErrorAction SilentlyContinue
$rows | Format-Table -AutoSize | Out-String -Width 200
"$($Rounds - $failures) of $Rounds rounds recovered correctly."
if ($failures) { exit 1 }
