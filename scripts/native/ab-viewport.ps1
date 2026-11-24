# A/B timing of the native viewport: the current Release build against a build of an earlier commit, alternating, on this machine now.
# Documented in docs/native-migration/VIEWPORT_COMPARISON.md.
#
#   .\scripts\native\ab-viewport.ps1 -Baseline 31d4112                          vsync, three scenes, 3 runs x 2 rounds
#   .\scripts\native\ab-viewport.ps1 -Baseline 31d4112 -Only torus_405k -Runs 6 -Rounds 3
#   .\scripts\native\ab-viewport.ps1 -Baseline 31d4112 -NoVsync                 the cost of a frame instead of the cadence
#
# Why: the absolute numbers of a run drift with the machine (a display's refresh, the GPU's clock, whatever else is running: the
# torus scene read 74 fps on one day and 58 fps two days later on the unchanged baseline). A change is only attributable when the
# build before it and the build after it are measured side by side, alternating so that drift hits both. The baseline is built from a
# detached git worktree of the commit (D:\CraftNative\worktrees\ab-<commit>) into D:\CraftNative\build\ab-<commit>; both are reused
# when they exist. Only the native application is timed (compare-viewport.ps1 -SkipReference); the pixels are not compared here.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Baseline,
  [string]$Current = 'windows-release',                 # the build directory name (under the build root) of the build being judged
  [string[]]$Only = @('box_30mm', 'sphere_9k', 'torus_405k'),
  [int]$Runs = 3,
  [int]$Rounds = 2,
  [switch]$NoVsync,
  [string]$WorktreeDir,
  [string]$BuildName
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'windows-env.ps1') | Out-Null
$short = (git -C $repo rev-parse --short $Baseline).Trim()
if (-not $short) { throw "Unknown commit '$Baseline'." }
if (-not $WorktreeDir) { $WorktreeDir = Join-Path (Split-Path $repo -Parent) "ab-$short" }
if (-not $BuildName) { $BuildName = "ab-$short" }
$buildDir = Join-Path $env:CRAFT_BUILD_ROOT $BuildName

if (-not (Test-Path $WorktreeDir)) { git -C $repo worktree add --detach $WorktreeDir $short | Out-Null }
if (-not (Test-Path (Join-Path $buildDir 'CMakeCache.txt'))) {
  Push-Location (Join-Path $WorktreeDir 'native')
  try { cmake --preset windows-release -B $buildDir | Out-Null; if ($LASTEXITCODE) { throw 'configure failed' } } finally { Pop-Location }
}
cmake --build $buildDir --target craft craft_imgcompare | Out-Null
if ($LASTEXITCODE) { throw "building $short failed" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$root = Join-Path $env:CRAFT_BUILD_ROOT "viewport-compare\ab-$stamp"
New-Item -ItemType Directory -Force $root | Out-Null
$results = @{ $BuildName = @(); $Current = @() }
foreach ($round in 1..$Rounds) {
  foreach ($config in @($BuildName, $Current)) {
    $out = Join-Path $root "$config-r$round"
    $extra = @(); if ($NoVsync) { $extra += '-NoVsync' }
    & (Join-Path $PSScriptRoot 'compare-viewport.ps1') -Config $config -SkipReference -Only $Only -Runs $Runs -OutDir $out @extra *> (Join-Path $root "$config-r$round.log")
    if (-not (Test-Path $out)) { throw "The comparison of $config produced nothing; see $(Join-Path $root "$config-r$round.log")." }
    foreach ($scene in Get-ChildItem $out -Directory) {
      foreach ($run in Get-ChildItem $scene.FullName -Directory -Filter 'native-run*') {
        $json = Join-Path $run.FullName 'result.json'
        if (Test-Path $json) {
          $o = (Get-Content $json -Raw | ConvertFrom-Json).orbit
          $results[$config] += [pscustomobject]@{ scene = $scene.Name; round = $round; fps = $o.fps; p50 = $o.p50Ms }
        }
      }
    }
  }
}

function Median($v) { $s = @($v | Sort-Object); if (-not $s.Count) { return $null }; if ($s.Count % 2) { $s[($s.Count - 1) / 2] } else { ($s[$s.Count / 2 - 1] + $s[$s.Count / 2]) / 2 } }
$rows = foreach ($scene in ($results[$Current] | Select-Object -ExpandProperty scene -Unique)) {
  foreach ($config in @($BuildName, $Current)) {
    $r = @($results[$config] | Where-Object { $_.scene -eq $scene })
    [pscustomobject]@{ scene = $scene; build = $config; runs = $r.Count
      medianFps = [math]::Round((Median ($r.fps)), 1); minFps = [math]::Round(($r.fps | Measure-Object -Minimum).Minimum, 1)
      meanFps = [math]::Round(($r.fps | Measure-Object -Average).Average, 1); medianP50Ms = [math]::Round((Median ($r.p50)), 2) }
  }
}
$rows | Format-Table -AutoSize
$rows | ConvertTo-Json | Set-Content (Join-Path $root 'ab-summary.json') -Encoding utf8
"Results: $root"
