# Compares the Python analysis worker of an older commit with the current tree: time, memory and the report itself.
# Documented in docs/native-migration/ANALYSIS_PERFORMANCE.md.
#
#   .\scripts\native\analysis\compare-analysis.ps1 -Baseline d58b3d1
#   .\scripts\native\analysis\compare-analysis.ps1 -Baseline d58b3d1 -Models box_768,sphere_320 -Runs 3
#
# For every model it runs the whole moldability job (analysis, report conversion, compaction, JSON) with the engine and the worker of
# the baseline commit (extracted from git, untouched) and with the current ones, samples the peak memory of each, and diffs the two
# payloads field by field: they must differ only in when the report was made, how long it took, and the engine version string.
# A model with more than -OriginalMaxFaces faces is run with the current tree only (the baseline would take too long or too much
# memory), and its time and memory are reported alone.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Baseline,
  [string[]]$Models = @('box_768', 'box_3072', 'sphere_320', 'sphere_1280'),
  [int]$Runs = 1,
  [int]$OriginalMaxFaces = 3200,
  [string]$ModelDir = 'D:\CraftNative\build\analysis-perf\models',
  [string]$Python = 'D:\CraftNative\sdk\python-3.13.17\python.exe',
  # The native kernels (a release build): timed as a third column, with its own report diff. Without the file that column is skipped.
  [string]$Kernels = 'D:\CraftNative\build\windows-release\craft_analysis_kernels.dll'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $repo
$work = 'D:\CraftNative\build\analysis-perf'
if (-not (Test-Path (Join-Path $ModelDir 'box_768.stl'))) { & $Python -I (Join-Path $PSScriptRoot 'make_models.py') $ModelDir | Out-Null }

# The baseline engine and worker, as that commit has them.
$base = Join-Path $work "baseline-$Baseline"
if (Test-Path $base) { Remove-Item $base -Recurse -Force }
New-Item -ItemType Directory -Force $base | Out-Null
$archive = Join-Path $work "baseline-$Baseline.tar"
git archive --format=tar -o $archive $Baseline mold/src native/engines/analysis-bridge/worker   # a file: a pipe would corrupt the binary
if ($LASTEXITCODE -ne 0) { throw "git archive $Baseline failed" }
tar -xf $archive -C $base
if ($LASTEXITCODE -ne 0) { throw "extracting $archive failed" }
$baseEngine = Join-Path $base 'mold\src'
$baseWorker = Join-Path $base 'native\engines\analysis-bridge\worker'

function Invoke-Timed($engine, $worker, $model, $payload, $kernels = $null) {
  $env:CRAFT_ENGINE_SRC = $engine; $env:CRAFT_WORKER_DIR = $worker
  if ($kernels) { $env:CRAFT_ANALYSIS_KERNELS = $kernels } else { Remove-Item Env:\CRAFT_ANALYSIS_KERNELS -ErrorAction SilentlyContinue }
  try {
    $out = Join-Path $work 'timing.json'
    $p = Start-Process $Python -ArgumentList '-I', (Join-Path $PSScriptRoot 'time_worker.py'), $model, $payload -PassThru -NoNewWindow -RedirectStandardOutput $out
    $peak = 0
    while (-not $p.HasExited) { $p.Refresh(); if ($p.PeakWorkingSet64 -gt $peak) { $peak = $p.PeakWorkingSet64 }; Start-Sleep -Milliseconds 300 }
    $j = Get-Content $out -Raw | ConvertFrom-Json
    return [pscustomobject]@{ seconds = $j.withJsonSeconds; bytes = $j.jsonBytes; peakMiB = [math]::Round($peak / 1MB) }
  } finally { Remove-Item Env:\CRAFT_ENGINE_SRC, Env:\CRAFT_WORKER_DIR, Env:\CRAFT_ANALYSIS_KERNELS -ErrorAction SilentlyContinue }
}

$rows = foreach ($name in $Models) {
  $model = Join-Path $ModelDir "$name.stl"
  $faces = [int](($name -split '_')[-1])
  $old = $null; $new = $null; $nat = $null; $same = 'n/a'; $sameNative = 'n/a'
  for ($run = 1; $run -le $Runs; $run++) {
    $payloadNew = Join-Path $work "payload-$name-new.json"
    $n = Invoke-Timed '' '' $model $payloadNew
    if (-not $new -or $n.seconds -lt $new.seconds) { $new = $n }
    if (Test-Path $Kernels) {
      $payloadNative = Join-Path $work "payload-$name-native.json"
      $k = Invoke-Timed '' '' $model $payloadNative $Kernels
      if (-not $nat -or $k.seconds -lt $nat.seconds) { $nat = $k }
      if ($faces -le $OriginalMaxFaces) {
        & $Python -I (Join-Path $PSScriptRoot 'diff_payloads.py') $payloadNew $payloadNative *> $null
        $sameNative = if ($LASTEXITCODE -eq 0) { 'identical' } else { 'DIFFERENT' }
      } else {
        # no baseline to compare with at this size: the Python loop of the current engine is the reference
        & $Python -I (Join-Path $PSScriptRoot 'diff_payloads.py') $payloadNew $payloadNative *> $null
        $sameNative = if ($LASTEXITCODE -eq 0) { 'identical to python loop' } else { 'DIFFERENT' }
      }
    }
    if ($faces -le $OriginalMaxFaces) {
      $payloadOld = Join-Path $work "payload-$name-baseline.json"
      $o = Invoke-Timed $baseEngine $baseWorker $model $payloadOld
      if (-not $old -or $o.seconds -lt $old.seconds) { $old = $o }
      & $Python -I (Join-Path $PSScriptRoot 'diff_payloads.py') $payloadOld $payloadNew *> $null
      $same = if ($LASTEXITCODE -eq 0) { 'identical' } else { 'DIFFERENT' }
    }
  }
  [pscustomobject]@{ model = $name; faces = $faces; baselineSeconds = $old.seconds; nowSeconds = $new.seconds; nativeSeconds = $nat.seconds; nativeMiB = $nat.peakMiB; nativeReport = $sameNative
    speedup = if ($old) { [math]::Round($old.seconds / [math]::Max(0.001, $new.seconds), 1) } else { $null }
    baselineMiB = $old.peakMiB; nowMiB = $new.peakMiB; report = $same }
}
$rows | Format-Table -AutoSize
$rows | ConvertTo-Json | Set-Content (Join-Path $work "compare-$Baseline.json") -Encoding utf8
if ($rows | Where-Object { $_.report -eq 'DIFFERENT' -or $_.nativeReport -eq 'DIFFERENT' }) { throw 'A report differs from its reference.' }
