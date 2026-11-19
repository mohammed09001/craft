# Runs the native UI tour (craft --ui-tour) in isolation and summarises what its layout lint found.
# Documented in docs/native-migration/UI_WALKTHROUGH.md.
#
#   .\scripts\native\ui\native-tour.ps1                      Release build, bracket fixture, output next to the other builds
#   .\scripts\native\ui\native-tour.ps1 -Stl part.stl -OutDir D:\somewhere
#
# The tour drives the real application through eleven states and writes, for the dark and the light theme, the whole window and the whole
# content of the inspector, plus the window at its minimum size, and lints every capture (truncated text, items cut off at the edge of
# their panel, controls narrower than their content). Autosave and cache go to a temporary folder: an earlier run that exited without
# closing left an autosave behind and the next run opened with the "Recover unsaved work?" dialog in its pictures.
#
# Needs a build with the tests enabled (cmake --build --preset windows-release --target craft, from native/).
[CmdletBinding()]
param(
  [string]$Config = 'windows-release',
  [string]$Stl,
  [string]$BadStl,
  [string]$OutDir
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
. (Join-Path $repo 'scripts\native\windows-env.ps1') | Out-Null
if (-not $Stl) { $Stl = Join-Path $repo 'native\tests\fixtures\models\bracket.stl' }
if (-not $BadStl) { $BadStl = Join-Path $repo 'mold\tests\fixtures\models\stl\corrupted_ascii.stl' }
if (-not $OutDir) { $OutDir = Join-Path $env:CRAFT_BUILD_ROOT ('ui-walkthrough\native-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$craft = Join-Path (Join-Path $env:CRAFT_BUILD_ROOT $Config) 'Craft.exe'
if (-not (Test-Path $craft)) { throw "Build craft in $Config first ($craft is missing)." }

$state = Join-Path ([IO.Path]::GetTempPath()) ('craft-ui-tour-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force "$state\autosave", "$state\cache" | Out-Null
$env:CRAFT_AUTOSAVE_DIR = "$state\autosave"
$env:CRAFT_CACHE_DIR = "$state\cache"
$env:PATH = "$env:CRAFT_QT_DIR\bin;$env:PATH"
try {
  $log = & $craft --ui-tour $OutDir --import $Stl --tour-bad-stl $BadStl 2>&1 | Out-String
  if ($log -notmatch 'CRAFT_TOUR_OK') { throw "The tour did not finish:`n$log" }
} finally {
  Remove-Item Env:\CRAFT_AUTOSAVE_DIR, Env:\CRAFT_CACHE_DIR -ErrorAction SilentlyContinue
  Remove-Item $state -Recurse -Force -ErrorAction SilentlyContinue
}

$tour = Get-Content (Join-Path $OutDir 'tour.json') -Raw | ConvertFrom-Json
$issues = foreach ($s in $tour.states) {
  foreach ($p in $s.lint.PSObject.Properties) { foreach ($i in $p.Value) { [pscustomobject]@{ state = $s.state; capture = $p.Name; kind = $i.kind; item = $i.item; text = $i.text; detail = $i.detail } } }
}
"{0} states, {1} captures, {2} lint finding(s), {3} tour problem(s). Output: {4}" -f $tour.states.Count, (($tour.states | ForEach-Object { $_.lint.PSObject.Properties.Count } | Measure-Object -Sum).Sum), @($issues).Count, @($tour.problems).Count, $OutDir
if ($issues) { $issues | Sort-Object kind, item, text -Unique | Format-Table kind, item, text, detail -AutoSize }
if ($tour.problems.Count) { $tour.problems | Format-Table -AutoSize }
if (@($issues).Count -or $tour.problems.Count) { exit 1 }
