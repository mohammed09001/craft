# Compares the native viewport with the Three.js reference viewport: pixels and performance.
# Documented in docs/native-migration/VIEWPORT_COMPARISON.md.
#
#   .\scripts\native\compare-viewport.ps1                       the standard scene list, Release build
#   .\scripts\native\compare-viewport.ps1 -Only box_30mm        one model
#   .\scripts\native\compare-viewport.ps1 -Runs 5 -Frames 600   more timing samples
#
# For every scene (a model and a theme) it runs the real reference app (production build of mold/frontend in the installed
# Chrome) and the native application at the same viewport size, captures both with and without the part, and compares them
# (craft_imgcompare), times the import and a continuous orbit, and samples process and graphics memory. Results land in
# -OutDir (frames, side-by-side and difference images, one JSON per run, summary.json and summary.md).
#
# Needs: a Release build of the native app with the tests enabled (cmake --build --preset windows-release --target craft
# craft_imgcompare), Node and the frontend dependencies, Chrome, and the reference production build in
# D:\CraftNative\build\reference-dist (node node_modules\vite\bin\vite.js build --outDir ... in mold\frontend).
[CmdletBinding()]
param(
  [string]$Config = 'windows-release',
  [string]$Size = '960x640',
  [int]$Frames = 300,
  [int]$Runs = 3,
  [string]$OutDir,
  [string[]]$Only,
  [string]$ReferenceDist = 'D:\CraftNative\build\reference-dist',
  [switch]$SkipReference,
  [string]$Recompare,  # re-run only the pixel comparison on the frames of an earlier run directory (no captures)
  [switch]$NoVsync   # present without waiting for the display refresh (both renderers): the cost of a frame, not the cadence
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
if (-not $OutDir) { $OutDir = Join-Path $env:CRAFT_BUILD_ROOT ("viewport-compare\run-" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Force $OutDir | Out-Null

$buildDir = Join-Path $env:CRAFT_BUILD_ROOT $Config
$craft = Join-Path $buildDir 'Craft.exe'
if (-not (Test-Path $craft)) { $craft = (Get-ChildItem $buildDir -Recurse -Filter 'craft.exe' | Select-Object -First 1).FullName }
$imgcompare = (Get-ChildItem $buildDir -Recurse -Filter 'craft_imgcompare.exe' | Select-Object -First 1).FullName
if (-not $craft -or -not $imgcompare) { throw "Build craft and craft_imgcompare in $buildDir first." }
$env:PATH = "$env:CRAFT_QT_DIR\bin;$env:PATH"
$env:QT_ENABLE_HIGHDPI_SCALING = '0'

# Generated models (large binary meshes with correct normals).
$models = Join-Path $env:CRAFT_BUILD_ROOT 'viewport-compare\models'
if (-not (Test-Path (Join-Path $models 'torus_405k.stl'))) { node (Join-Path $PSScriptRoot 'viewport\makeModels.mjs') $models | Out-Null }

$fixtures = Join-Path $repo 'mold\frontend\e2e\fixtures'
$scenes = @(
  @{ name = 'box_30mm';    stl = Join-Path $fixtures 'box_30mm_ascii.stl'; themes = @('dark', 'light') },
  @{ name = 'sphere_9k';   stl = Join-Path $fixtures 'highpoly_sphere_15mm_ascii.stl'; themes = @('dark', 'light') },
  @{ name = 'sphere_82k';  stl = Join-Path $models 'sphere_82k.stl'; themes = @('dark') },
  @{ name = 'torus_405k';  stl = Join-Path $models 'torus_405k.stl'; themes = @('dark') },
  @{ name = 'sphere_1_3m'; stl = Join-Path $models 'sphere_1_3m.stl'; themes = @('dark') }
)
if ($Only) { $scenes = $scenes | Where-Object { $Only -contains $_.name } }

function Median($values) {
  $v = @($values | Where-Object { $null -ne $_ } | Sort-Object)
  if ($v.Count -eq 0) { return $null }
  if ($v.Count % 2) { return $v[($v.Count - 1) / 2] }
  return ($v[$v.Count / 2 - 1] + $v[$v.Count / 2]) / 2
}

function Invoke-NativeRun($stl, $theme, $dir, $label) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  $json = Join-Path $dir 'result.json'
  Remove-Item $json -ErrorAction SilentlyContinue
  $args = @('--viewport-bench', $json, '--import', $stl, '--viewport-size', $Size, '--bench-dir', $dir, '--bench-frames', $Frames,
            '--bench-hold-ms', 6000, '--bench-label', $label, '--theme', $theme)
  if ($NoVsync) { $args += '--bench-no-vsync' }
  $proc = Start-Process -FilePath $craft -ArgumentList $args -PassThru -RedirectStandardError (Join-Path $dir 'stderr.txt') -RedirectStandardOutput (Join-Path $dir 'stdout.txt')
  $deadline = (Get-Date).AddMinutes(10)
  while (-not (Test-Path $json) -and -not $proc.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
  $gpu = $null
  if (Test-Path $json) {
    Start-Sleep -Milliseconds 800
    $gpu = & (Join-Path $PSScriptRoot 'viewport\process-memory.ps1') -RootPid $proc.Id | ConvertFrom-Json
  }
  if (-not $proc.WaitForExit(30000)) { $proc.Kill() }
  if (-not (Test-Path $json)) { return @{ failure = "native bench produced no result (exit $($proc.ExitCode)): $((Get-Content (Join-Path $dir 'stderr.txt') -Raw -ErrorAction SilentlyContinue))" } }
  $r = Get-Content $json -Raw | ConvertFrom-Json
  # Keep the graphics-memory sample with the run, so a later -Recompare still has it.
  $r | Add-Member -NotePropertyName processMemory -NotePropertyValue $gpu -Force
  $r | ConvertTo-Json -Depth 10 | Set-Content $json -Encoding utf8
  return $r
}

function Invoke-ReferenceRun($stl, $theme, $dir, $label) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  node (Join-Path $PSScriptRoot 'viewport\captureReference.mjs') --stl $stl --out $dir --size $Size --theme $theme --frames $Frames --label $label --dist $ReferenceDist --novsync $(if ($NoVsync) { 1 } else { 0 }) | Out-Null
  return Get-Content (Join-Path $dir 'result.json') -Raw | ConvertFrom-Json
}

$summary = @()
if ($Recompare) {
  # Pixel comparison (and the tables) again from what an earlier run saved: the per-run result files and frames.
  $OutDir = (Resolve-Path $Recompare).Path
  $scenes = @()
  foreach ($dir in (Get-ChildItem $OutDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'native-run1\result.json') } | Sort-Object Name)) {
    $id = $dir.Name
    $entry = [ordered]@{ id = $id; model = ($id -replace '-(dark|light)$', ''); theme = ($id -replace '^.*-', ''); stlBytes = 0; native = @(); reference = @() }
    for ($run = 1; $run -le $Runs; $run++) {
      $nr = Join-Path $dir.FullName "native-run$run\result.json"; $rr = Join-Path $dir.FullName "reference-run$run\result.json"
      if (Test-Path $nr) { $entry.native += (Get-Content $nr -Raw | ConvertFrom-Json) }
      if (Test-Path $rr) { $entry.reference += (Get-Content $rr -Raw | ConvertFrom-Json) }
    }
    $entry.stlBytes = [long]$entry.native[0].model.fileSizeBytes
    $nd = Join-Path $dir.FullName "native-run$Runs"; $rd = Join-Path $dir.FullName "reference-run$Runs"
    if (Test-Path (Join-Path $rd 'part.png')) {
      & $imgcompare --ref-empty (Join-Path $rd 'empty.png') --ref-part (Join-Path $rd 'part.png') --native-empty (Join-Path $nd 'empty.png') `
        --native-part (Join-Path $nd 'part.png') --out (Join-Path $dir.FullName 'metrics.json') --side-by-side (Join-Path $dir.FullName 'side-by-side.png') `
        --diff (Join-Path $dir.FullName 'diff.png')
      $entry.metrics = Get-Content (Join-Path $dir.FullName 'metrics.json') -Raw | ConvertFrom-Json
    }
    $summary += [pscustomobject]$entry
  }
}
foreach ($scene in $scenes) {
  foreach ($theme in $scene.themes) {
    $id = "$($scene.name)-$theme"
    Write-Host "== $id" -ForegroundColor Cyan
    $entry = [ordered]@{ id = $id; model = $scene.name; theme = $theme; stlBytes = (Get-Item $scene.stl).Length; native = @(); reference = @() }
    for ($run = 1; $run -le $Runs; $run++) {
      $n = Invoke-NativeRun $scene.stl $theme (Join-Path $OutDir "$id\native-run$run") "$id run $run"
      $entry.native += $n
      if (-not $SkipReference) { $entry.reference += (Invoke-ReferenceRun $scene.stl $theme (Join-Path $OutDir "$id\reference-run$run") "$id run $run") }
      Write-Host ("   run {0}: native {1:N1} fps   reference {2:N1} fps (synced {3:N1})" -f $run, $n.orbit.fps, $(if ($entry.reference.Count) { $entry.reference[-1].orbit.fps } else { 0 }), $(if ($entry.reference.Count) { $entry.reference[-1].orbitSynced.fps } else { 0 }))
    }
    $refOk = $entry.reference | Where-Object { -not $_.failure -and -not $_.refusedByApp }
    if ($refOk -and -not $entry.native[-1].failure) {
      $nd = Join-Path $OutDir "$id\native-run$Runs"; $rd = Join-Path $OutDir "$id\reference-run$Runs"
      & $imgcompare --ref-empty (Join-Path $rd 'empty.png') --ref-part (Join-Path $rd 'part.png') --native-empty (Join-Path $nd 'empty.png') `
        --native-part (Join-Path $nd 'part.png') --out (Join-Path $OutDir "$id\metrics.json") --side-by-side (Join-Path $OutDir "$id\side-by-side.png") `
        --diff (Join-Path $OutDir "$id\diff.png")
      $entry.metrics = Get-Content (Join-Path $OutDir "$id\metrics.json") -Raw | ConvertFrom-Json
    }
    $summary += [pscustomobject]$entry
  }
}
$summary | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $OutDir 'summary.json') -Encoding utf8

# --- the report tables ----------------------------------------------------------------------------------------------
function F($v, $fmt = 'N1') { if ($null -eq $v) { return '-' } return ([double]$v).ToString($fmt, [Globalization.CultureInfo]::InvariantCulture) }
$md = [System.Text.StringBuilder]::new()
$first = $summary[0].native[0]
[void]$md.AppendLine("Viewport $Size px, $Runs runs per scene (median), $Frames orbit frames, $(Get-Date -Format 'yyyy-MM-dd')")
[void]$md.AppendLine("Native display: $($first.screen.name), $([math]::Round($first.screen.refreshHz,1)) Hz (the fastest screen; the window is moved there)")
[void]$md.AppendLine("Native adapter: $($first.renderer.adapter) ($($first.renderer.backend)); reference: $($summary[0].reference[0].renderer.renderer); Chrome $($summary[0].reference[0].browserVersion)")
[void]$md.AppendLine()
[void]$md.AppendLine('### Pixels (native vs reference, part mask from the empty-vs-part difference)')
[void]$md.AppendLine('| scene | mask IoU | boundary mean / p95 / max (px) | centroid offset (px) | area native/ref | SSIM part | mean abs diff part | frame |')
[void]$md.AppendLine('|---|---|---|---|---|---|---|---|')
foreach ($s in $summary) {
  if ($s.metrics) { $m = $s.metrics
    [void]$md.AppendLine("| $($s.id) | $(F $m.maskIoU 'N3') | $(F $m.boundaryDistanceMeanPx) / $(F $m.boundaryDistanceP95Px) / $(F $m.boundaryDistanceMaxPx) | $(F $m.centroidOffsetPx) | $(F $m.areaRatioNativeOverReference 'N3') | $(F $m.ssimPartRegion 'N3') | $(F $m.meanAbsDifferencePartRegion 'N3') | [side-by-side]($($s.id)/side-by-side.png) |")
  } else { [void]$md.AppendLine("| $($s.id) | not compared ($(if ($s.reference | Where-Object refusedByApp) { 'the reference refused the file: ' + ($s.reference | Where-Object refusedByApp | Select-Object -First 1).refused } else { 'no reference frame' })) | | | | | | |") }
}
[void]$md.AppendLine()
[void]$md.AppendLine('### Import (ms from the file chosen to the part ready / first frame that can show it)')
[void]$md.AppendLine('| scene | triangles | file MiB | native ready | native first frame | reference ready | reference first frame |')
[void]$md.AppendLine('|---|---|---|---|---|---|---|')
foreach ($s in $summary) {
  $nr = Median ($s.native.importReadyMs); $nf = Median ($s.native.importFirstFrameMs)
  $rr = Median ($s.reference | Where-Object { -not $_.refusedByApp } | ForEach-Object { $_.importReadyMs }); $rf = Median ($s.reference | Where-Object { -not $_.refusedByApp } | ForEach-Object { $_.importFirstFrameMs })
  $refused = $s.reference | Where-Object refusedByApp | Select-Object -First 1
  [void]$md.AppendLine("| $($s.id) | $($s.native[0].model.triangleCount) | $(F ($s.stlBytes / 1MB)) | $(F $nr '0') | $(F $nf '0') | $(if ($refused) { 'refused' } else { F $rr '0' }) | $(if ($refused) { 'refused' } else { F $rf '0' }) |")
}
[void]$md.AppendLine()
[void]$md.AppendLine('### Orbit (continuous drag; frames per second, and the frame interval in ms)')
[void]$md.AppendLine('Native: swap-to-swap intervals of the real window, pipelined (CPU and GPU overlap). Reference "pipelined": N frames then one GPU wait, N / time (the same throughput idea). Reference "synced": a GPU wait in every frame, so CPU and GPU do not overlap: the per-frame latency and its spread, a pessimistic rate.')
[void]$md.AppendLine('| scene | native fps | native p50 / p95 / p99 / max | native >20 ms | reference fps (pipelined) | reference fps (synced) | reference synced p50 / p95 / p99 / max | reference >20 ms (synced) |')
[void]$md.AppendLine('|---|---|---|---|---|---|---|---|')
foreach ($s in $summary) {
  $ref = $s.reference | Where-Object { -not $_.refusedByApp -and -not $_.failure }
  $nat = $s.native | Where-Object { -not $_.failure }
  $line = "| $($s.id) | $(F (Median $nat.orbit.fps)) | $(F (Median $nat.orbit.p50Ms)) / $(F (Median $nat.orbit.p95Ms)) / $(F (Median $nat.orbit.p99Ms)) / $(F (Median $nat.orbit.maxMs)) | $(F (Median $nat.orbit.over20ms) '0') |"
  if ($ref) { $line += " $(F (Median $ref.orbit.fps)) | $(F (Median $ref.orbitSynced.fps)) | $(F (Median $ref.orbitSynced.p50Ms)) / $(F (Median $ref.orbitSynced.p95Ms)) / $(F (Median $ref.orbitSynced.p99Ms)) / $(F (Median $ref.orbitSynced.maxMs)) | $(F (Median $ref.orbitSynced.over20ms) '0') |" } else { $line += ' refused | | | |' }
  [void]$md.AppendLine($line)
}
[void]$md.AppendLine()
[void]$md.AppendLine('### Memory after the orbit (MiB; process tree; GPU = what Windows attributes to the processes, shared = system memory used by the adapter)')
[void]$md.AppendLine('| scene | native working set (+part) | native private | native GPU local / shared | reference working set (+part) | reference private | reference GPU local / shared | reference JS heap |')
[void]$md.AppendLine('|---|---|---|---|---|---|---|---|')
foreach ($s in $summary) {
  $nat = $s.native | Where-Object { -not $_.failure }; $ref = $s.reference | Where-Object { -not $_.refusedByApp -and -not $_.failure }
  $nws = Median $nat.memoryAfterOrbit.workingSetMiB; $nbase = Median $nat.memoryBeforeImport.workingSetMiB
  $line = "| $($s.id) | $(F $nws '0') (+$(F ($nws - $nbase) '0')) | $(F (Median $nat.memoryAfterOrbit.privateMiB) '0') | $(F (Median $nat.processMemory.totalGpuLocalMiB) '0') / $(F (Median $nat.processMemory.totalGpuSharedMiB) '0') |"
  if ($ref) {
    $rws = Median $ref.memoryAfterOrbit.totalWorkingSetMiB; $rbase = Median $ref.memoryBeforeImport.totalWorkingSetMiB
    $line += " $(F $rws '0') (+$(F ($rws - $rbase) '0')) | $(F (Median $ref.memoryAfterOrbit.totalPrivateMiB) '0') | $(F (Median $ref.memoryAfterOrbit.totalGpuLocalMiB) '0') / $(F (Median $ref.memoryAfterOrbit.totalGpuSharedMiB) '0') | $(F (Median ($ref | ForEach-Object { $_.memoryAfterOrbit.jsHeapMiB.JSHeapUsedSize })) '0') |"
  } else { $line += ' refused | | | |' }
  [void]$md.AppendLine($line)
}
$md.ToString() | Set-Content (Join-Path $OutDir 'summary.md') -Encoding utf8
Write-Host "`nResults: $OutDir"
Get-Content (Join-Path $OutDir 'summary.md')
