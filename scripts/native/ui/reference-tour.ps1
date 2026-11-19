# Runs the REAL reference app through the states that correspond to the native UI tour and saves a screenshot and a control inventory of each,
# for the dark and the light theme (see referenceUi.mjs). Documented in docs/native-migration/UI_WALKTHROUGH.md.
#
#   .\scripts\native\ui\reference-tour.ps1 [-OutDir dir] [-Stl part.stl]
#
# Needs the reference production build in D:\CraftNative\build\reference-dist (see compare-viewport.ps1) and the installed Chrome.
[CmdletBinding()]
param([string]$OutDir, [string]$Stl, [string]$Size = '1280x800')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
. (Join-Path $repo 'scripts\native\windows-env.ps1') | Out-Null
if (-not $Stl) { $Stl = Join-Path $repo 'native\tests\fixtures\models\bracket.stl' }
if (-not $OutDir) { $OutDir = Join-Path $env:CRAFT_BUILD_ROOT ('ui-walkthrough\reference-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
# selected part, the cutting session (both tabs), the Mold Scale popover and Master Mold: the reference's own flows, through its own buttons
$steps = 'clickxy:700,480;wait:600;shot:03-selected;dump:03-selected;click:Constructed Cutting Plan;wait:1200;shot:04-cutting-session;dump:04-cutting-session;' +
         'click:Segmentation;wait:800;shot:05-segmentation-tab;dump:05-segmentation-tab;text:05-text;click:Cancel;wait:600;' +
         'click:Mold Scale;wait:600;shot:06-mold-scale;key:Escape;click:Master Mold;wait:3500;shot:07-master-mold;dump:07-master-mold;text:07-text'
foreach ($theme in 'dark', 'light') {
  node (Join-Path $PSScriptRoot 'referenceUi.mjs') --out (Join-Path $OutDir $theme) --stl $Stl --theme $theme --size $Size --dump 1 --steps $steps
  if ($LASTEXITCODE) { throw "The reference tour failed for the $theme theme." }
}
"Output: $OutDir"
