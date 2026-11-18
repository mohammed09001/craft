# Regenerates native/tests/fixtures/reference/mold-reference.json by running
# the REAL reference implementation (mold/frontend TypeScript pipeline +
# manifold-3d WASM) on the inputs defined in
# native/tests/reference/craftReference.test.ts.
#
# Requires the frontend dependencies (npm ci in mold/frontend) and Node 22.
# Run only when the reference behaviour intentionally changes; the committed
# JSON is the equivalence baseline tst_reference_equivalence compares against.

param(
  # "all" regenerates every fixture (about 25 minutes); "reports" only the engineering-reports fixture (seconds).
  [ValidateSet('all', 'reports')][string]$Only = 'all'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$frontend = Join-Path $repoRoot 'mold\frontend'
$referenceDir = Join-Path $repoRoot 'native\tests\reference'

if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
  throw "Frontend dependencies are missing. Run 'npm ci' in $frontend first."
}

# Vitest only loads test files inside its root, so the generator is staged as
# a temporary copy under the frontend's gitignored .tmp/ folder and removed
# afterwards. The frontend's own vite.config.ts supplies the '@' alias and
# toolchain, so the generator exercises exactly the code the app ships.
$stage = Join-Path $frontend '.tmp\native-reference'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
if ($Only -eq 'all') {
  Copy-Item (Join-Path $referenceDir 'craftReference.test.ts') $stage -Force
  Copy-Item (Join-Path $referenceDir 'craftSegmentationReference.test.ts') $stage -Force
  Copy-Item (Join-Path $referenceDir 'craftMasterReference.test.ts') $stage -Force
}
Copy-Item (Join-Path $referenceDir 'craftReportsReference.test.ts') $stage -Force
$env:CRAFT_REFERENCE_OUTPUT = Join-Path $repoRoot 'native\tests\fixtures\reference\mold-reference.json'
$env:CRAFT_SEGMENTATION_OUTPUT = Join-Path $repoRoot 'native\tests\fixtures\reference\segmentation-reference.json'
$env:CRAFT_BRACKET_STL = Join-Path $repoRoot 'native\tests\fixtures\models\bracket.stl'
$env:CRAFT_MASTER_OUTPUT = Join-Path $repoRoot 'native\tests\fixtures\reference\master-reference.json'
$env:CRAFT_REPORTS_OUTPUT = Join-Path $repoRoot 'native\tests\fixtures\reference\reports-reference.json'

Push-Location $frontend
try {
  $ErrorActionPreference = 'Continue'
  cmd /c "npx vitest run --dir .tmp\native-reference 2>&1"
  $exit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exit -ne 0) { throw "Reference fixture generation failed (exit $exit)." }
} finally {
  Pop-Location
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\CRAFT_REFERENCE_OUTPUT -ErrorAction SilentlyContinue
  Remove-Item Env:\CRAFT_SEGMENTATION_OUTPUT -ErrorAction SilentlyContinue
  Remove-Item Env:\CRAFT_MASTER_OUTPUT -ErrorAction SilentlyContinue
  Remove-Item Env:\CRAFT_REPORTS_OUTPUT -ErrorAction SilentlyContinue
  Remove-Item Env:\CRAFT_BRACKET_STL -ErrorAction SilentlyContinue
}

Get-Item (Join-Path $repoRoot 'native\tests\fixtures\reference\*.json') |
  Select-Object FullName, Length, LastWriteTime
