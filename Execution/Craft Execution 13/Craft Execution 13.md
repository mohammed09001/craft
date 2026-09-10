# Craft — Execution 13
## Final Mechanical Closure Protocol — System-of-Systems Sprue Closure, Red-Baseline Recovery, Browser Proof, Historical Performance, and Exact-SHA Remote Green

**Repository:** `mohammed09001/craft`  
**Audited starting branch:** `main`  
**Audited starting SHA:** `4567a9a4a747c546659d6a5f01b87e8c05fea445`  
**Execution 12 baseline:** `57b55a0a1594c780be21f7680813ed750ee030dc`  
**Exact current CI at authoring:** `Continuous Integration` run `34452280729` — `failure`  
**Project root:** `mold/`  
**Frontend root:** `mold/frontend/`  
**Execution mode:** deterministic, mechanical, bounded, proof-carrying.  
**Doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline + System-of-Systems Invariant Discipline.  
**Primary objective:** close this Sprue/Funnel corrective chain completely so the next execution is a different product feature.  
**Non-goal:** feature expansion.  
**Non-goal:** broad refactor.  
**Non-goal:** architecture redesign.  
**Non-goal:** opportunistic cleanup.  
**Non-goal:** lowering geometry quality for speed.  

---

# Operating Law

Execute this document as a closed protocol.

Do not improvise outside its explicit branches.

Do not add features.

Do not redesign working subsystems.

Do not narrate ordinary execution.

Do not flatter.

Do not apologize.

Do not ask for repository facts available through Git/source/tests/GitHub Actions.

Do not invent results.

Do not call code changes proof.

Do not call skipped tests proof.

Do not call a cache test a coordinator test.

Do not call a unit test Chromium proof.

Do not call local green remote green.

Do not call an older green SHA proof of final SHA.

Do not claim performance improvement without equivalent measured evidence.

Do not weaken strict TypeScript, ESLint, Vitest, Playwright, Python, security, bundle, artifact, geometry, or Quality Gate rules.

Do not create a second authoritative state owner.

Do not create a second freshness system.

Do not use cancellation as correctness.

Do not reduce geometry quality to make Sprue fast.

Remain silent during ordinary execution.

Only emit if genuinely blocked:

```text
BLOCKED
Exact blocker:
Repository evidence:
External input required:
Why repository-local evidence cannot resolve it:
```

Only final success phrase:

```text
REMOTE VERIFIED COMPLETE — EXECUTION 13 FINAL SPRUE CLOSURE
```

Forbidden until every mandatory condition is proved on the exact final pushed SHA.

---
# 1. Current Red Baseline

The current remote baseline is RED.

Exact SHA:

```text
4567a9a4a747c546659d6a5f01b87e8c05fea445
```

Exact run:

```text
34452280729
```

Current jobs:

```text
Frontend quality: FAILURE
Browser smoke: FAILURE
Python quality: SUCCESS
Repository integrity: SUCCESS
Dependency review: SKIPPED on push as expected
Quality gate: FAILURE
```

Frontend failed at `npm run typecheck`.

Lint/build/Vitest were skipped.

Browser failed at `npm run build:e2e`.

Playwright was skipped.

Do not begin benchmark/browser expansion/production refactor until typecheck is green.

---

# 2. Exact Current Compiler Failures

Must close first:

```text
splitFace.sprueGhostState.test.ts
  mockImplementationOnce unavailable because mock type was erased by production-function cast
  CavityGenerationResult confused with CavityWorkerExecutionResult

splitFace.sprueRunnerOwnership.test.ts
  node:fs / node:url / node:path imported from source test compiled by tsconfig.app
  partial SprueDefinition missing circularSegments, coordinateSpace, moldFrameId, tolerancePolicy

splitFace.sprueUpstreamInvalidation.test.ts
  partial SprueDefinition missing required fields
  number + boolean through selfDispatch
  mockImplementationOnce erased on cavity worker mock
```

Treat these as deterministic test/harness defects until a compiling assertion proves a product defect.

---

# 3. Repository Binding

Run:

```powershell
$RepoRoot=(git rev-parse --show-toplevel).Trim()
$Head=(git rev-parse HEAD).Trim()
$Branch=(git branch --show-current).Trim()
$Status=git status --short
"REPO_ROOT=$RepoRoot"
"HEAD=$Head"
"BRANCH=$Branch"
$Status
git -C $RepoRoot remote -v
git -C $RepoRoot fetch origin
git -C $RepoRoot rev-parse origin/main
```

Codex may run from `...\mold-saas\mold` while Git root is above it.

That is valid.

Forbidden:

```text
git init inside mold
nested .git
git reset --hard
git clean -fd
force push
discard user work
```

If `origin/main` advanced, re-audit changed closure files and use the new exact SHA.

---

# 4. System-of-Systems Contract

Connected manufacturing chain:

```text
Imported Geometry
→ Canonical Part Geometry
→ Cut by Face / Segmentation
→ Reference Mold Definition
→ Mold Scale
→ Cavity
→ Sprue Intent
→ Sprue Derived Geometry
→ Registration
→ Final Mold Result
→ Viewport Presentation
→ Export / downstream manufacturing truth
```

Cross-cutting systems:

```text
MoldDocument revision/fingerprint
Evaluation request identity
Worker ownership
Cache identity
History
Undo/Redo
Body visibility
Selection
Segmentation regeneration
Browser harness
CI
```

A local repair is invalid if it creates mixed revisions or stale ownership in adjacent systems.

---

# 5. Five Truths

Keep separate:

```text
USER INTENT TRUTH
AUTHORITATIVE DOCUMENT TRUTH
MANUFACTURING RESULT TRUTH
EXECUTION TRUTH
PRESENTATION TRUTH
```

Pending diameter can be intent/presentation truth.

It is not manufacturing truth until current evaluation commits.

Stale Worker completion owns nothing.

Failed provisional intent creates no durable history.

Previous committed result may be bounded presentation continuity only; it must not silently become authoritative input.

---

# 6. TypeScript Runtime Boundary

Current `tsconfig.app.json` explicitly has:

```json
"types": ["vitest/globals"]
```

Current `tsconfig.node.json` owns:

```json
"types": ["node"]
```

Current package already has `@types/node`.

Therefore:

```text
DO NOT add "node" to tsconfig.app.json.
```

Move Node filesystem architecture scanning out of `src/**` into `mold/frontend/scripts/`.

Keep browser app and Node tooling type surfaces separate.

---

# 7. Allowed Change Surface

Mandatory CHANGE:

```text
mold/frontend/src/features/mold-generation/split-face/splitFace.sprueGhostState.test.ts
mold/frontend/src/features/mold-generation/split-face/splitFace.sprueRunnerOwnership.test.ts
mold/frontend/src/features/mold-generation/split-face/splitFace.sprueUpstreamInvalidation.test.ts
mold/frontend/package.json
.github/workflows/ci.yml
mold/frontend/src/test-harness/sprueStoreLifecycleProbe.ts
mold/frontend/e2e/sprueStoreLifecycle.spec.ts
```

Mandatory ADD:

```text
mold/frontend/scripts/checkSplitFaceRunnerOwnership.mjs
mold/frontend/scripts/benchmarks/runSprueBenchmark.mjs
mold/frontend/src/test-harness/spruePerformanceProbe.ts
Execution/Craft Execution 13/Craft Execution 13 Report.md
Execution/Craft Execution 13/Craft Execution 13 Performance.md
```

Optional extra benchmark helpers only under existing test/benchmark areas.

`splitFace.store.ts` is conditional: change only if a compiling deterministic test proves a current product defect.

Mandatory removal from tests:

```text
Node fs/path/url scan from source Vitest file
partial SprueDefinition casts
boolean-as-number selfDispatch arithmetic
mock casts erasing Vitest methods
```

---

# 8. Phase Order

No reordering:

```text
01 bind repository
02 fix TypeScript red baseline only
03 execute the three new Execution 12 suites
04 finish upstream invalidation matrix
05 finish failure atomicity matrix
06 close runner ownership
07 strengthen browser coordinator proof
08 build performance harness
09 execute historical/current performance matrix
10 mutation-sensitivity audit
11 full local frontend harness
12 full local Python harness
13 write both reports
14 freeze candidate
15 wait for explicit user push authorization
16 exact-SHA remote verification
17 final adversarial review
18 stop
```

---

# 9. Fix Vitest Mock Type Erasure

In ghost-state and upstream-invalidation tests, preserve the Vitest mock object.

Use pattern:

```ts
type CavityDependency = SplitFaceStoreDeps["runCavityGenerationInWorker"];
type CavityCall = (
  input: Parameters<CavityDependency>[0],
  options?: Parameters<CavityDependency>[1]
) => ReturnType<CavityDependency>;

const runCavityGenerationMock = vi.fn<CavityCall>(async (input) => {
  // existing real test implementation
});

const runCavityGenerationInWorker = Object.assign(
  runCavityGenerationMock,
  { cancel: vi.fn() },
);
```

Use mock APIs on `runCavityGenerationMock`:

```ts
runCavityGenerationMock.mockImplementationOnce(...)
runCavityGenerationMock.mockImplementation(...)
runCavityGenerationMock.mockClear()
```

Do not fix with `as unknown as`.

---

# 10. Fix Cavity Worker Envelope Typing

The dependency returns `CavityWorkerExecutionResult`.

The inner generator returns `CavityGenerationResult`.

Deferred resolver must carry the Worker envelope consistently:

```ts
let release: (execution: CavityWorkerExecutionResult) => void;
```

Held helper exposes:

```ts
release: (execution: CavityWorkerExecutionResult) => void
```

No cast between envelope and inner result.

---

# 11. Move Runner Ownership Scan to Node Script

Delete Node fs/url/path imports and filesystem traversal from `splitFace.sprueRunnerOwnership.test.ts`.

Keep the behavioral adversarial Vitest proving shared runner cancellation.

Create:

```text
mold/frontend/scripts/checkSplitFaceRunnerOwnership.mjs
```

Script behavior:

```text
resolve frontend root from import.meta.url
walk src .ts/.tsx
exclude tests/specs/test-harness/node_modules/dist/.tmp
find production literal `createSplitFaceStoreCreator(` consumers
allow exactly:
  src/features/mold-generation/split-face/splitFace.store.ts
print discovered consumers
exit 1 on any additional production consumer
```

Do not install an AST/parser package.

Add package script:

```json
"check:architecture": "node scripts/checkSplitFaceRunnerOwnership.mjs"
```

Add CI step after moderate audit, before typecheck:

```yaml
- name: Verify architecture ownership guards
  run: npm run check:architecture
```

---

# 12. Eliminate Partial SprueDefinition Fixtures

Current `SprueDefinition` requires:

```text
operationId
targetBodyIds
position
inwardDirection
profile
depthMm
circularSegments
coordinateSpace
moldFrameId
tolerancePolicy
```

Allowed test values:

```text
real resolved production test result
copy of a real resolved result
complete local fixture checked with `satisfies SprueDefinition`
```

Forbidden:

```ts
partialObject as SprueDefinition
```

Prefer real resolved template whenever the test setup already generates one.

---

# 13. Replace Boolean Dispatch Arithmetic

Replace `selfDispatch` numeric use with:

```ts
expectedSelfDispatchDelta: 0 | 1
```

Assert:

```ts
expect(control.calls().length)
  .toBe(dispatchesBeforeAct + expectedSelfDispatchDelta);
```

No boolean coercion.

No cast.

---

# 14. TypeScript Exit Gate

Run from `mold/frontend`:

```powershell
npm run check:architecture
npm run typecheck
```

Both PASS before continuing.

---

# 15. Targeted Execution 12 Test Gate

Run the three current suites directly.

Every test must compile and execute.

No skip to obtain green.

Classify failures:

```text
fixture/harness defect -> test-only fix
confirmed invariant violation -> smallest production fix
obsolete assertion -> replace with stronger correct assertion
```

Every production fix must name failing proof, owner, readers/writers, invalidated outputs, async impact, history impact, presentation impact, and coupled regression tests.

---

# 16. Failure Atomicity Contract

Dedicated current-failure coverage:

```text
first Create
main resize
entry-neck resize
move
remove/rebuild if derived work is scheduled
final latest request after burst
Registration-stage failure
```

Every current failure:

```text
sprueStatus idle
pending latest empty
history delta 0
Registration not generating
lastCommittedResult coherent with restored document
resolved Sprues restored where prior committed result existed
first Create leaves no fake resolved Sprue
failure visible
immediate retry accepted
```

Then prove failure -> retry success -> Undo -> Redo.

Failed value must never enter durable history.

---

# 17. Runner Ownership Contract

Use two proofs only:

```text
Behavioral Vitest:
  two stores intentionally sharing one runner cancel one another

Node architecture guard:
  exactly one production default SplitFace store construction site
```

If both pass:

```text
CLOSED BY ARCHITECTURE EVIDENCE
```

Do not refactor the runner.

Only if a second production site is discovered may runner ownership be changed.

Then bind an independent runner to the true independent owner while preserving persistent Worker reuse.

No Worker pool.

No Worker per edit.

---

# 18. Browser Direct Coordinator Contract

Strengthen E2E-only production-store probe to emit per-operation values:

```text
createDispatchDelta
mainResizeDispatchDelta
entryResizeDispatchDelta
burstDispatchDelta
createHistoryDelta
mainHistoryDelta
entryHistoryDelta
burstHistoryDelta
createPendingObserved
mainPendingObserved
entryPendingObserved
mainPendingDiameterMm
entryPendingDiameterMm
finalMainDiameterMm
finalEntryDiameterMm
finalRegistrationStatus
finalDocumentRevision/fingerprint
finalResultRevision/fingerprint
pageErrors
consoleErrors
```

Hard assertions:

```text
main pending diameter == requested
entry pending diameter == requested
20-edit burst dispatch delta <= 2
20-edit burst history delta == 1
final main diameter == final requested
Registration current/terminal
result fingerprint == current document fingerprint
page errors == 0
console errors == 0
```

Do not infer per-burst values from cumulative totals.

---

# 19. Browser Synchronization

Use Playwright auto-retrying assertions and `expect.poll`.

No arbitrary sleeps.

If Worker completes too quickly to observe pending state externally, capture a store-subscription checkpoint inside the E2E-only probe.

Do not slow production code for observability.

---

# 20. Performance Harness

Add:

```text
mold/frontend/scripts/benchmarks/runSprueBenchmark.mjs
mold/frontend/src/test-harness/spruePerformanceProbe.ts
```

Use Chromium through Playwright against the E2E build.

Collect deterministic samples.

Calculate min/p50/p95/max.

Fail benchmark run if correctness assertions fail.

Keep probe E2E-only.

Do not run expensive historical benchmark in CI.

Commit compact report only.

---

# 21. Performance Classes and Samples

Class A:

```text
action invocation -> accepted/pending observable
warmup >= 5
n >= 50
min/p50/p95/max
```

Class B small/medium:

```text
accepted -> current final manufacturing commit
warmup >= 3
n >= 20
min/p50/p95/max
```

Large:

```text
n >= 10
p95 only if n >= 20
```

Record exact SHA, OS, CPU, RAM, Node, npm, Chromium, Playwright, build mode, fixture, triangles, Sprue count, scenario, sample count, percentile method.

---

# 22. Historical Worktree Protocol

Use external linked worktrees for:

```text
081ef3a94db3dd3f7d58e3283d5a238603e4655c
042d4011a77c2f7ceb3813def23a97da59dd961f
6aeabcd57b255b6ded740996408f9664298b8339
57b55a0a1594c780be21f7680813ed750ee030dc
4567a9a4a747c546659d6a5f01b87e8c05fea445
final candidate
```

Never checkout historical refs in active user worktree.

Adapter may map API names only.

Adapter may not copy final scheduler/cache fixes.

If semantics cannot be preserved, mark `NOT COMPARABLE` with exact evidence.

---

# 23. Mutation Sensitivity

Use external temporary worktree at final candidate.

Temporarily break one at a time:

```text
one scheduler teardown
one stale ownership gate
busy-reject
history coalescing
latest-wins dispatch bound
production/E2E artifact isolation
```

Expected targeted detector must fail.

Record detector.

Revert mutation.

No mutation may remain.

---

# 24. Full Local Frontend Gate

Run exactly:

```powershell
npm ci
npm audit
npm audit --audit-level=moderate
npm run check:architecture
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run build:e2e
npm run e2e
```

Every command PASS.

A command skipped because an earlier one failed is no evidence.

---

# 25. Full Local Python Gate

Run:

```powershell
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

Every command PASS.

---

# 26. Artifact, Security, and Bundle Invariants

Preserve:

```text
npm audit --audit-level=moderate
dependency review moderate
Quality Gate exact-result semantics
normal production/E2E separation
bundle budgets 410 kB eager / 575 kB lazy-shared
real browser Cavity Worker/WASM proof
```

Normal production must not contain:

```text
e2e-harness.html
sprueStoreLifecycleProbe
spruePerformanceProbe
benchmark harness
```

Do not raise budgets.

Do not lower security severity.

---

# 27. Mandatory Reports

Create:

```text
Execution/Craft Execution 13/Craft Execution 13 Report.md
Execution/Craft Execution 13/Craft Execution 13 Performance.md
```

Main report sections:

```text
Decision
Repository binding
Start SHA
Final SHA
Red baseline diagnosis
Changed/added/deleted files
System ownership map
Production impact contracts
TypeScript repair evidence
Runner ownership closure
Upstream matrix
Failure matrix
Stale channels
History
Browser proof
Structural counters
Mutation sensitivity
Security
Bundle
Artifact isolation
Local frontend/browser/Python
Remote exact-SHA run
Controlled warnings
Open items
Final adversarial review
```

Performance report sections:

```text
Methodology
Environment
Percentile method
Fixtures
Historical refs
Adapter policy
Comparability
Class A
Class B
1-Sprue
3-Sprue
Small/Medium/Large
Bursts
Structural counters
Drift check
Interpretation
Limitations
Conclusion
```

Every CLOSED item names exact file/test/command/result.

---

# 28. Candidate Freeze and Remote Gate

After every local mandatory item passes:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

Freeze candidate.

Wait for explicit user push authorization.

After push, verify only the CI run whose head SHA equals exact candidate.

Required remote:

```text
Frontend SUCCESS
Browser SUCCESS
Python SUCCESS
Repository integrity SUCCESS
Quality Gate SUCCESS
Dependency Review event-correct
```

Inspect logs for moderate audit, architecture guard, typecheck, lint, build, Vitest, E2E build, strengthened Sprue browser proof, Cavity proof, Python suite.

---

# 29. Stop Rule

Only after exact-SHA remote green and final adversarial review:

```text
REMOTE VERIFIED COMPLETE — EXECUTION 13 FINAL SPRUE CLOSURE
```

Then stop.

Do not propose Execution 14.

Do not continue Sprue hardening.

Next planned work is another product feature unless future independent evidence proves a regression.

---

# 30. Exhaustive Upstream Mutation Matrix

## M001 — `toggleFace` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `toggleFace` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M001` PASS requires direct observation.

## M002 — `toggleFace` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `toggleFace` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M002` PASS requires direct observation.

## M003 — `toggleFace` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `toggleFace` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M003` PASS requires direct observation.

## M004 — `toggleFace` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `toggleFace` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M004` PASS requires direct observation.

## M005 — `toggleFace` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `toggleFace` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M005` PASS requires direct observation.

## M006 — `toggleFace` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `toggleFace` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M006` PASS requires direct observation.

## M007 — `removeSplitFace` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFace` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M007` PASS requires direct observation.

## M008 — `removeSplitFace` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFace` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M008` PASS requires direct observation.

## M009 — `removeSplitFace` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFace` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M009` PASS requires direct observation.

## M010 — `removeSplitFace` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFace` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M010` PASS requires direct observation.

## M011 — `removeSplitFace` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFace` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M011` PASS requires direct observation.

## M012 — `removeSplitFace` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFace` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M012` PASS requires direct observation.

## M013 — `removeSplitFaceAndRebuild-final` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-final` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M013` PASS requires direct observation.

## M014 — `removeSplitFaceAndRebuild-final` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-final` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M014` PASS requires direct observation.

## M015 — `removeSplitFaceAndRebuild-final` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-final` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M015` PASS requires direct observation.

## M016 — `removeSplitFaceAndRebuild-final` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-final` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M016` PASS requires direct observation.

## M017 — `removeSplitFaceAndRebuild-final` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-final` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M017` PASS requires direct observation.

## M018 — `removeSplitFaceAndRebuild-final` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-final` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M018` PASS requires direct observation.

## M019 — `removeSplitFaceAndRebuild-nonfinal` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-nonfinal` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M019` PASS requires direct observation.

## M020 — `removeSplitFaceAndRebuild-nonfinal` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-nonfinal` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M020` PASS requires direct observation.

## M021 — `removeSplitFaceAndRebuild-nonfinal` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-nonfinal` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M021` PASS requires direct observation.

## M022 — `removeSplitFaceAndRebuild-nonfinal` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-nonfinal` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M022` PASS requires direct observation.

## M023 — `removeSplitFaceAndRebuild-nonfinal` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-nonfinal` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M023` PASS requires direct observation.

## M024 — `removeSplitFaceAndRebuild-nonfinal` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSplitFaceAndRebuild-nonfinal` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M024` PASS requires direct observation.

## M025 — `removeSelectedSplitFaceAndRebuild` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSelectedSplitFaceAndRebuild` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M025` PASS requires direct observation.

## M026 — `removeSelectedSplitFaceAndRebuild` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSelectedSplitFaceAndRebuild` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M026` PASS requires direct observation.

## M027 — `removeSelectedSplitFaceAndRebuild` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSelectedSplitFaceAndRebuild` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M027` PASS requires direct observation.

## M028 — `removeSelectedSplitFaceAndRebuild` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSelectedSplitFaceAndRebuild` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M028` PASS requires direct observation.

## M029 — `removeSelectedSplitFaceAndRebuild` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSelectedSplitFaceAndRebuild` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M029` PASS requires direct observation.

## M030 — `removeSelectedSplitFaceAndRebuild` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `removeSelectedSplitFaceAndRebuild` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M030` PASS requires direct observation.

## M031 — `clearSelection` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearSelection` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M031` PASS requires direct observation.

## M032 — `clearSelection` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearSelection` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M032` PASS requires direct observation.

## M033 — `clearSelection` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearSelection` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M033` PASS requires direct observation.

## M034 — `clearSelection` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearSelection` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M034` PASS requires direct observation.

## M035 — `clearSelection` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearSelection` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M035` PASS requires direct observation.

## M036 — `clearSelection` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearSelection` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M036` PASS requires direct observation.

## M037 — `commitPlaneDrag-ordinary` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-ordinary` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M037` PASS requires direct observation.

## M038 — `commitPlaneDrag-ordinary` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-ordinary` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M038` PASS requires direct observation.

## M039 — `commitPlaneDrag-ordinary` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-ordinary` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M039` PASS requires direct observation.

## M040 — `commitPlaneDrag-ordinary` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-ordinary` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M040` PASS requires direct observation.

## M041 — `commitPlaneDrag-ordinary` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-ordinary` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M041` PASS requires direct observation.

## M042 — `commitPlaneDrag-ordinary` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-ordinary` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M042` PASS requires direct observation.

## M043 — `commitPlaneDrag-extension` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-extension` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M043` PASS requires direct observation.

## M044 — `commitPlaneDrag-extension` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-extension` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M044` PASS requires direct observation.

## M045 — `commitPlaneDrag-extension` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-extension` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M045` PASS requires direct observation.

## M046 — `commitPlaneDrag-extension` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-extension` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M046` PASS requires direct observation.

## M047 — `commitPlaneDrag-extension` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-extension` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M047` PASS requires direct observation.

## M048 — `commitPlaneDrag-extension` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitPlaneDrag-extension` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M048` PASS requires direct observation.

## M049 — `setClearanceMm` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setClearanceMm` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M049` PASS requires direct observation.

## M050 — `setClearanceMm` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setClearanceMm` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M050` PASS requires direct observation.

## M051 — `setClearanceMm` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setClearanceMm` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M051` PASS requires direct observation.

## M052 — `setClearanceMm` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setClearanceMm` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M052` PASS requires direct observation.

## M053 — `setClearanceMm` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setClearanceMm` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M053` PASS requires direct observation.

## M054 — `setClearanceMm` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setClearanceMm` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M054` PASS requires direct observation.

## M055 — `updateClearanceEdit` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `updateClearanceEdit` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M055` PASS requires direct observation.

## M056 — `updateClearanceEdit` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `updateClearanceEdit` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M056` PASS requires direct observation.

## M057 — `updateClearanceEdit` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `updateClearanceEdit` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M057` PASS requires direct observation.

## M058 — `updateClearanceEdit` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `updateClearanceEdit` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M058` PASS requires direct observation.

## M059 — `updateClearanceEdit` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `updateClearanceEdit` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M059` PASS requires direct observation.

## M060 — `updateClearanceEdit` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `updateClearanceEdit` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M060` PASS requires direct observation.

## M061 — `commitClearanceEdit-nochange` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitClearanceEdit-nochange` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M061` PASS requires direct observation.

## M062 — `commitClearanceEdit-nochange` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitClearanceEdit-nochange` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M062` PASS requires direct observation.

## M063 — `commitClearanceEdit-nochange` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitClearanceEdit-nochange` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M063` PASS requires direct observation.

## M064 — `commitClearanceEdit-nochange` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitClearanceEdit-nochange` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M064` PASS requires direct observation.

## M065 — `commitClearanceEdit-nochange` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitClearanceEdit-nochange` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M065` PASS requires direct observation.

## M066 — `commitClearanceEdit-nochange` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `commitClearanceEdit-nochange` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M066` PASS requires direct observation.

## M067 — `cancelClearanceEdit` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelClearanceEdit` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M067` PASS requires direct observation.

## M068 — `cancelClearanceEdit` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelClearanceEdit` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M068` PASS requires direct observation.

## M069 — `cancelClearanceEdit` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelClearanceEdit` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M069` PASS requires direct observation.

## M070 — `cancelClearanceEdit` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelClearanceEdit` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M070` PASS requires direct observation.

## M071 — `cancelClearanceEdit` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelClearanceEdit` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M071` PASS requires direct observation.

## M072 — `cancelClearanceEdit` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelClearanceEdit` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M072` PASS requires direct observation.

## M073 — `setCanonicalPartGeometrySignature` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setCanonicalPartGeometrySignature` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M073` PASS requires direct observation.

## M074 — `setCanonicalPartGeometrySignature` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setCanonicalPartGeometrySignature` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M074` PASS requires direct observation.

## M075 — `setCanonicalPartGeometrySignature` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setCanonicalPartGeometrySignature` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M075` PASS requires direct observation.

## M076 — `setCanonicalPartGeometrySignature` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setCanonicalPartGeometrySignature` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M076` PASS requires direct observation.

## M077 — `setCanonicalPartGeometrySignature` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setCanonicalPartGeometrySignature` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M077` PASS requires direct observation.

## M078 — `setCanonicalPartGeometrySignature` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setCanonicalPartGeometrySignature` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M078` PASS requires direct observation.

## M079 — `clearForOrientationChange` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForOrientationChange` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M079` PASS requires direct observation.

## M080 — `clearForOrientationChange` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForOrientationChange` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M080` PASS requires direct observation.

## M081 — `clearForOrientationChange` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForOrientationChange` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M081` PASS requires direct observation.

## M082 — `clearForOrientationChange` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForOrientationChange` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M082` PASS requires direct observation.

## M083 — `clearForOrientationChange` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForOrientationChange` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M083` PASS requires direct observation.

## M084 — `clearForOrientationChange` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForOrientationChange` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M084` PASS requires direct observation.

## M085 — `clearForModelReplacement` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForModelReplacement` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M085` PASS requires direct observation.

## M086 — `clearForModelReplacement` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForModelReplacement` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M086` PASS requires direct observation.

## M087 — `clearForModelReplacement` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForModelReplacement` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M087` PASS requires direct observation.

## M088 — `clearForModelReplacement` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForModelReplacement` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M088` PASS requires direct observation.

## M089 — `clearForModelReplacement` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForModelReplacement` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M089` PASS requires direct observation.

## M090 — `clearForModelReplacement` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `clearForModelReplacement` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M090` PASS requires direct observation.

## M091 — `undo` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `undo` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M091` PASS requires direct observation.

## M092 — `undo` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `undo` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M092` PASS requires direct observation.

## M093 — `undo` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `undo` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M093` PASS requires direct observation.

## M094 — `undo` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `undo` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M094` PASS requires direct observation.

## M095 — `undo` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `undo` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M095` PASS requires direct observation.

## M096 — `undo` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `undo` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M096` PASS requires direct observation.

## M097 — `redo` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `redo` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M097` PASS requires direct observation.

## M098 — `redo` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `redo` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M098` PASS requires direct observation.

## M099 — `redo` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `redo` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M099` PASS requires direct observation.

## M100 — `redo` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `redo` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M100` PASS requires direct observation.

## M101 — `redo` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `redo` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M101` PASS requires direct observation.

## M102 — `redo` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `redo` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M102` PASS requires direct observation.

## M103 — `adoptCommittedSegmentationResult` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `adoptCommittedSegmentationResult` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M103` PASS requires direct observation.

## M104 — `adoptCommittedSegmentationResult` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `adoptCommittedSegmentationResult` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M104` PASS requires direct observation.

## M105 — `adoptCommittedSegmentationResult` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `adoptCommittedSegmentationResult` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M105` PASS requires direct observation.

## M106 — `adoptCommittedSegmentationResult` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `adoptCommittedSegmentationResult` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M106` PASS requires direct observation.

## M107 — `adoptCommittedSegmentationResult` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `adoptCommittedSegmentationResult` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M107` PASS requires direct observation.

## M108 — `adoptCommittedSegmentationResult` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `adoptCommittedSegmentationResult` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M108` PASS requires direct observation.

## M109 — `promoteReplannedSegmentationResult` / ACTIVE_ONLY / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `promoteReplannedSegmentationResult` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M109` PASS requires direct observation.

## M110 — `promoteReplannedSegmentationResult` / ACTIVE_ONLY / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `promoteReplannedSegmentationResult` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M110` PASS requires direct observation.

## M111 — `promoteReplannedSegmentationResult` / ACTIVE_ONLY / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `promoteReplannedSegmentationResult` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M111` PASS requires direct observation.

## M112 — `promoteReplannedSegmentationResult` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `promoteReplannedSegmentationResult` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M112` PASS requires direct observation.

## M113 — `promoteReplannedSegmentationResult` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `promoteReplannedSegmentationResult` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M113` PASS requires direct observation.

## M114 — `promoteReplannedSegmentationResult` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `INVALIDATE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `promoteReplannedSegmentationResult` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M114` PASS requires direct observation.

## M115 — `addExtensionCuttingPlane` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `addExtensionCuttingPlane` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M115` PASS requires direct observation.

## M116 — `addExtensionCuttingPlane` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `addExtensionCuttingPlane` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M116` PASS requires direct observation.

## M117 — `addExtensionCuttingPlane` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `addExtensionCuttingPlane` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M117` PASS requires direct observation.

## M118 — `addExtensionCuttingPlane` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `addExtensionCuttingPlane` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M118` PASS requires direct observation.

## M119 — `addExtensionCuttingPlane` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `addExtensionCuttingPlane` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M119` PASS requires direct observation.

## M120 — `addExtensionCuttingPlane` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `addExtensionCuttingPlane` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M120` PASS requires direct observation.

## M121 — `selectSplitFace` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `selectSplitFace` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M121` PASS requires direct observation.

## M122 — `selectSplitFace` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `selectSplitFace` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M122` PASS requires direct observation.

## M123 — `selectSplitFace` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `selectSplitFace` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M123` PASS requires direct observation.

## M124 — `selectSplitFace` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `selectSplitFace` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M124` PASS requires direct observation.

## M125 — `selectSplitFace` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `selectSplitFace` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M125` PASS requires direct observation.

## M126 — `selectSplitFace` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `selectSplitFace` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M126` PASS requires direct observation.

## M127 — `setBodyVisibility` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setBodyVisibility` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M127` PASS requires direct observation.

## M128 — `setBodyVisibility` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setBodyVisibility` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M128` PASS requires direct observation.

## M129 — `setBodyVisibility` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setBodyVisibility` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M129` PASS requires direct observation.

## M130 — `setBodyVisibility` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setBodyVisibility` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M130` PASS requires direct observation.

## M131 — `setBodyVisibility` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setBodyVisibility` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M131` PASS requires direct observation.

## M132 — `setBodyVisibility` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `setBodyVisibility` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M132` PASS requires direct observation.

## M133 — `beginPlaneDrag` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `beginPlaneDrag` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M133` PASS requires direct observation.

## M134 — `beginPlaneDrag` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `beginPlaneDrag` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M134` PASS requires direct observation.

## M135 — `beginPlaneDrag` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `beginPlaneDrag` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M135` PASS requires direct observation.

## M136 — `beginPlaneDrag` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `beginPlaneDrag` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M136` PASS requires direct observation.

## M137 — `beginPlaneDrag` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `beginPlaneDrag` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M137` PASS requires direct observation.

## M138 — `beginPlaneDrag` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `beginPlaneDrag` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M138` PASS requires direct observation.

## M139 — `cancelPlaneDrag` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelPlaneDrag` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M139` PASS requires direct observation.

## M140 — `cancelPlaneDrag` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelPlaneDrag` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M140` PASS requires direct observation.

## M141 — `cancelPlaneDrag` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelPlaneDrag` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M141` PASS requires direct observation.

## M142 — `cancelPlaneDrag` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelPlaneDrag` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M142` PASS requires direct observation.

## M143 — `cancelPlaneDrag` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelPlaneDrag` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M143` PASS requires direct observation.

## M144 — `cancelPlaneDrag` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `cancelPlaneDrag` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M144` PASS requires direct observation.

## M145 — `enterSelection` / ACTIVE_ONLY / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `enterSelection` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M145` PASS requires direct observation.

## M146 — `enterSelection` / ACTIVE_ONLY / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `enterSelection` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M146` PASS requires direct observation.

## M147 — `enterSelection` / ACTIVE_ONLY / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `enterSelection` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M147` PASS requires direct observation.

## M148 — `enterSelection` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `enterSelection` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M148` PASS requires direct observation.

## M149 — `enterSelection` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `enterSelection` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M149` PASS requires direct observation.

## M150 — `enterSelection` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `PRESERVE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `enterSelection` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert current request identity remains owned.
Assert execution completes normally.
Assert no scheduler-only history pollution.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M150` PASS requires direct observation.

## M151 — `createCavity-current` / ACTIVE_ONLY / SUCCESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-current` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M151` PASS requires direct observation.

## M152 — `createCavity-current` / ACTIVE_ONLY / FAILURE
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-current` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M152` PASS requires direct observation.

## M153 — `createCavity-current` / ACTIVE_ONLY / PROGRESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-current` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M153` PASS requires direct observation.

## M154 — `createCavity-current` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-current` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M154` PASS requires direct observation.

## M155 — `createCavity-current` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-current` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M155` PASS requires direct observation.

## M156 — `createCavity-current` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-current` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M156` PASS requires direct observation.

## M157 — `createCavity-stale-failure` / ACTIVE_ONLY / SUCCESS
Classification target: `STALE_INERT`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-stale-failure` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M157` PASS requires direct observation.

## M158 — `createCavity-stale-failure` / ACTIVE_ONLY / FAILURE
Classification target: `STALE_INERT`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-stale-failure` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M158` PASS requires direct observation.

## M159 — `createCavity-stale-failure` / ACTIVE_ONLY / PROGRESS
Classification target: `STALE_INERT`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-stale-failure` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M159` PASS requires direct observation.

## M160 — `createCavity-stale-failure` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `STALE_INERT`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-stale-failure` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M160` PASS requires direct observation.

## M161 — `createCavity-stale-failure` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `STALE_INERT`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-stale-failure` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M161` PASS requires direct observation.

## M162 — `createCavity-stale-failure` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `STALE_INERT`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createCavity-stale-failure` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M162` PASS requires direct observation.

## M163 — `createMoldParts-current` / ACTIVE_ONLY / SUCCESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createMoldParts-current` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M163` PASS requires direct observation.

## M164 — `createMoldParts-current` / ACTIVE_ONLY / FAILURE
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createMoldParts-current` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M164` PASS requires direct observation.

## M165 — `createMoldParts-current` / ACTIVE_ONLY / PROGRESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_ONLY` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createMoldParts-current` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M165` PASS requires direct observation.

## M166 — `createMoldParts-current` / ACTIVE_PLUS_PENDING / SUCCESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createMoldParts-current` exactly once.
Deliver `SUCCESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M166` PASS requires direct observation.

## M167 — `createMoldParts-current` / ACTIVE_PLUS_PENDING / FAILURE
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createMoldParts-current` exactly once.
Deliver `FAILURE` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M167` PASS requires direct observation.

## M168 — `createMoldParts-current` / ACTIVE_PLUS_PENDING / PROGRESS
Classification target: `SUPERSEDE`.
Prepare committed deterministic state and a controlled production-faithful derived runner.
Create `ACTIVE_PLUS_PENDING` Sprue execution state.
Capture document/evaluation/Registration/result/visibility/Sprues/error/history.
Call public `createMoldParts-current` exactly once.
Deliver `PROGRESS` tail after the mutation boundary.
Assert old tail writes zero newer-owned channels.
Assert no obsolete queued job starts.
Assert no ghost `sprueStatus=generating`.
Assert post-mutation document remains authoritative.
No private cleanup helper as primary proof.
No arbitrary sleep.
No production edit without compiling failing proof.
`M168` PASS requires direct observation.

# 31. Exhaustive Failure Atomicity Matrix

## F001 — FIRST_CREATE / SPRUE_STAGE
Public action: `createSprue`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F001` PASS requires atomic failure + retry proof.

## F002 — FIRST_CREATE / REGISTRATION_STAGE
Public action: `createSprue`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F002` PASS requires atomic failure + retry proof.

## F003 — MAIN_RESIZE / SPRUE_STAGE
Public action: `resizeSprue`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F003` PASS requires atomic failure + retry proof.

## F004 — MAIN_RESIZE / REGISTRATION_STAGE
Public action: `resizeSprue`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F004` PASS requires atomic failure + retry proof.

## F005 — ENTRY_RESIZE / SPRUE_STAGE
Public action: `resizeSprueEntryNeck`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F005` PASS requires atomic failure + retry proof.

## F006 — ENTRY_RESIZE / REGISTRATION_STAGE
Public action: `resizeSprueEntryNeck`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F006` PASS requires atomic failure + retry proof.

## F007 — MOVE / SPRUE_STAGE
Public action: `moveSprue`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F007` PASS requires atomic failure + retry proof.

## F008 — MOVE / REGISTRATION_STAGE
Public action: `moveSprue`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F008` PASS requires atomic failure + retry proof.

## F009 — REMOVE / SPRUE_STAGE
Public action: `removeSprue`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F009` PASS requires atomic failure + retry proof.

## F010 — REMOVE / REGISTRATION_STAGE
Public action: `removeSprue`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F010` PASS requires atomic failure + retry proof.

## F011 — REBUILD / SPRUE_STAGE
Public action: `rebuildSprueDefinitions`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F011` PASS requires atomic failure + retry proof.

## F012 — REBUILD / REGISTRATION_STAGE
Public action: `rebuildSprueDefinitions`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F012` PASS requires atomic failure + retry proof.

## F013 — FINAL_BURST / SPRUE_STAGE
Public action: `20-edit burst`.
Failure injection: reject during Sprue stage.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
reject during Sprue stage.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F013` PASS requires atomic failure + retry proof.

## F014 — FINAL_BURST / REGISTRATION_STAGE
Public action: `20-edit burst`.
Failure injection: emit current Registration progress then reject.
Capture pre-action document/evaluation/Registration/result/Sprues/definitions/visibility/history/error.
Execute valid distinct intent and confirm acceptance/pending state.
Confirm failing request is still current by requestId/revision/fingerprint.
emit current Registration progress then reject.
Assert sprueStatus idle and pending latest empty.
Assert history delta zero.
Assert Registration not generating.
Assert result/document coherence.
Assert resolved Sprues restore prior truth or remain empty for first Create.
Assert failure visible.
Immediately retry with a distinct valid value.
Resolve retry and assert exactly one successful history entry.
Undo returns to true prior commit; Redo restores successful retry only.
No store reset or history wipe shortcut.
`F014` PASS requires atomic failure + retry proof.

# 32. Browser Proof Matrix

## B01 — APP
Purpose: app smoke.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Preserve deterministic boot/import assertions.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B01` PASS only if claimed owner is exercised.

## B02 — CAVITY
Purpose: real Cavity Boolean.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Preserve real Worker/WASM Boolean proof.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B02` PASS only if claimed owner is exercised.

## B03 — CACHE
Purpose: Sprue cache.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Keep cache naming truthful; direct engine cache proof is allowed here.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B03` PASS only if claimed owner is exercised.

## B04 — CREATE
Purpose: production-store Create.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Invoke createSprue through production store.
Assert acceptance/pending/final Registration coherence.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B04` PASS only if claimed owner is exercised.

## B05 — MAIN
Purpose: production-store main resize.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Observe pending main value before final commit.
Pending/final main diameter equals requested value.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B05` PASS only if claimed owner is exercised.

## B06 — ENTRY
Purpose: production-store entry resize.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Observe pending entry value before final commit.
Pending/final entry diameter equals requested value; main remains coherent.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B06` PASS only if claimed owner is exercised.

## B07 — BURST
Purpose: production-store 20-edit burst.
Use Chromium Playwright against E2E build.
Use real Worker/Manifold where claimed.
Capture pageerror and console errors.
Use auto-retrying assertions/expect.poll; no fixed sleeps.
Measure burstDispatchDelta directly; require <=2.
Measure burstHistoryDelta directly; require ==1.
Final resolved value equals final requested value.
Require page errors 0 and console errors 0.
Normal production build must exclude test harness.
`B07` PASS only if claimed owner is exercised.

# 33. Historical and Final Performance Matrix

## P0001 — 081/SMALL/1-Sprue/COLD_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0001` completes only when measured or evidence-backed NOT COMPARABLE.

## P0002 — 081/SMALL/1-Sprue/COLD_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0002` completes only when measured or evidence-backed NOT COMPARABLE.

## P0003 — 081/SMALL/1-Sprue/WARM_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0003` completes only when measured or evidence-backed NOT COMPARABLE.

## P0004 — 081/SMALL/1-Sprue/WARM_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0004` completes only when measured or evidence-backed NOT COMPARABLE.

## P0005 — 081/SMALL/1-Sprue/MAIN/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0005` completes only when measured or evidence-backed NOT COMPARABLE.

## P0006 — 081/SMALL/1-Sprue/MAIN/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0006` completes only when measured or evidence-backed NOT COMPARABLE.

## P0007 — 081/SMALL/1-Sprue/ENTRY/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0007` completes only when measured or evidence-backed NOT COMPARABLE.

## P0008 — 081/SMALL/1-Sprue/ENTRY/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0008` completes only when measured or evidence-backed NOT COMPARABLE.

## P0009 — 081/SMALL/1-Sprue/B3/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0009` completes only when measured or evidence-backed NOT COMPARABLE.

## P0010 — 081/SMALL/1-Sprue/B3/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0010` completes only when measured or evidence-backed NOT COMPARABLE.

## P0011 — 081/SMALL/1-Sprue/B20/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0011` completes only when measured or evidence-backed NOT COMPARABLE.

## P0012 — 081/SMALL/1-Sprue/B20/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0012` completes only when measured or evidence-backed NOT COMPARABLE.

## P0013 — 081/SMALL/3-Sprue/COLD_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0013` completes only when measured or evidence-backed NOT COMPARABLE.

## P0014 — 081/SMALL/3-Sprue/COLD_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0014` completes only when measured or evidence-backed NOT COMPARABLE.

## P0015 — 081/SMALL/3-Sprue/WARM_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0015` completes only when measured or evidence-backed NOT COMPARABLE.

## P0016 — 081/SMALL/3-Sprue/WARM_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0016` completes only when measured or evidence-backed NOT COMPARABLE.

## P0017 — 081/SMALL/3-Sprue/MAIN/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0017` completes only when measured or evidence-backed NOT COMPARABLE.

## P0018 — 081/SMALL/3-Sprue/MAIN/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0018` completes only when measured or evidence-backed NOT COMPARABLE.

## P0019 — 081/SMALL/3-Sprue/ENTRY/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0019` completes only when measured or evidence-backed NOT COMPARABLE.

## P0020 — 081/SMALL/3-Sprue/ENTRY/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0020` completes only when measured or evidence-backed NOT COMPARABLE.

## P0021 — 081/SMALL/3-Sprue/B3/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0021` completes only when measured or evidence-backed NOT COMPARABLE.

## P0022 — 081/SMALL/3-Sprue/B3/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0022` completes only when measured or evidence-backed NOT COMPARABLE.

## P0023 — 081/SMALL/3-Sprue/B20/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0023` completes only when measured or evidence-backed NOT COMPARABLE.

## P0024 — 081/SMALL/3-Sprue/B20/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0024` completes only when measured or evidence-backed NOT COMPARABLE.

## P0025 — 081/MEDIUM/1-Sprue/COLD_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0025` completes only when measured or evidence-backed NOT COMPARABLE.

## P0026 — 081/MEDIUM/1-Sprue/COLD_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0026` completes only when measured or evidence-backed NOT COMPARABLE.

## P0027 — 081/MEDIUM/1-Sprue/WARM_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0027` completes only when measured or evidence-backed NOT COMPARABLE.

## P0028 — 081/MEDIUM/1-Sprue/WARM_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0028` completes only when measured or evidence-backed NOT COMPARABLE.

## P0029 — 081/MEDIUM/1-Sprue/MAIN/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0029` completes only when measured or evidence-backed NOT COMPARABLE.

## P0030 — 081/MEDIUM/1-Sprue/MAIN/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0030` completes only when measured or evidence-backed NOT COMPARABLE.

## P0031 — 081/MEDIUM/1-Sprue/ENTRY/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0031` completes only when measured or evidence-backed NOT COMPARABLE.

## P0032 — 081/MEDIUM/1-Sprue/ENTRY/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0032` completes only when measured or evidence-backed NOT COMPARABLE.

## P0033 — 081/MEDIUM/1-Sprue/B3/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0033` completes only when measured or evidence-backed NOT COMPARABLE.

## P0034 — 081/MEDIUM/1-Sprue/B3/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0034` completes only when measured or evidence-backed NOT COMPARABLE.

## P0035 — 081/MEDIUM/1-Sprue/B20/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0035` completes only when measured or evidence-backed NOT COMPARABLE.

## P0036 — 081/MEDIUM/1-Sprue/B20/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0036` completes only when measured or evidence-backed NOT COMPARABLE.

## P0037 — 081/MEDIUM/3-Sprue/COLD_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0037` completes only when measured or evidence-backed NOT COMPARABLE.

## P0038 — 081/MEDIUM/3-Sprue/COLD_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0038` completes only when measured or evidence-backed NOT COMPARABLE.

## P0039 — 081/MEDIUM/3-Sprue/WARM_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0039` completes only when measured or evidence-backed NOT COMPARABLE.

## P0040 — 081/MEDIUM/3-Sprue/WARM_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0040` completes only when measured or evidence-backed NOT COMPARABLE.

## P0041 — 081/MEDIUM/3-Sprue/MAIN/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0041` completes only when measured or evidence-backed NOT COMPARABLE.

## P0042 — 081/MEDIUM/3-Sprue/MAIN/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0042` completes only when measured or evidence-backed NOT COMPARABLE.

## P0043 — 081/MEDIUM/3-Sprue/ENTRY/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0043` completes only when measured or evidence-backed NOT COMPARABLE.

## P0044 — 081/MEDIUM/3-Sprue/ENTRY/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0044` completes only when measured or evidence-backed NOT COMPARABLE.

## P0045 — 081/MEDIUM/3-Sprue/B3/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0045` completes only when measured or evidence-backed NOT COMPARABLE.

## P0046 — 081/MEDIUM/3-Sprue/B3/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0046` completes only when measured or evidence-backed NOT COMPARABLE.

## P0047 — 081/MEDIUM/3-Sprue/B20/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0047` completes only when measured or evidence-backed NOT COMPARABLE.

## P0048 — 081/MEDIUM/3-Sprue/B20/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0048` completes only when measured or evidence-backed NOT COMPARABLE.

## P0049 — 081/LARGE/1-Sprue/COLD_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0049` completes only when measured or evidence-backed NOT COMPARABLE.

## P0050 — 081/LARGE/1-Sprue/COLD_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0050` completes only when measured or evidence-backed NOT COMPARABLE.

## P0051 — 081/LARGE/1-Sprue/WARM_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0051` completes only when measured or evidence-backed NOT COMPARABLE.

## P0052 — 081/LARGE/1-Sprue/WARM_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0052` completes only when measured or evidence-backed NOT COMPARABLE.

## P0053 — 081/LARGE/1-Sprue/MAIN/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0053` completes only when measured or evidence-backed NOT COMPARABLE.

## P0054 — 081/LARGE/1-Sprue/MAIN/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0054` completes only when measured or evidence-backed NOT COMPARABLE.

## P0055 — 081/LARGE/1-Sprue/ENTRY/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0055` completes only when measured or evidence-backed NOT COMPARABLE.

## P0056 — 081/LARGE/1-Sprue/ENTRY/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0056` completes only when measured or evidence-backed NOT COMPARABLE.

## P0057 — 081/LARGE/1-Sprue/B3/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0057` completes only when measured or evidence-backed NOT COMPARABLE.

## P0058 — 081/LARGE/1-Sprue/B3/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0058` completes only when measured or evidence-backed NOT COMPARABLE.

## P0059 — 081/LARGE/1-Sprue/B20/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0059` completes only when measured or evidence-backed NOT COMPARABLE.

## P0060 — 081/LARGE/1-Sprue/B20/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0060` completes only when measured or evidence-backed NOT COMPARABLE.

## P0061 — 081/LARGE/3-Sprue/COLD_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0061` completes only when measured or evidence-backed NOT COMPARABLE.

## P0062 — 081/LARGE/3-Sprue/COLD_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0062` completes only when measured or evidence-backed NOT COMPARABLE.

## P0063 — 081/LARGE/3-Sprue/WARM_CREATE/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0063` completes only when measured or evidence-backed NOT COMPARABLE.

## P0064 — 081/LARGE/3-Sprue/WARM_CREATE/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0064` completes only when measured or evidence-backed NOT COMPARABLE.

## P0065 — 081/LARGE/3-Sprue/MAIN/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0065` completes only when measured or evidence-backed NOT COMPARABLE.

## P0066 — 081/LARGE/3-Sprue/MAIN/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0066` completes only when measured or evidence-backed NOT COMPARABLE.

## P0067 — 081/LARGE/3-Sprue/ENTRY/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0067` completes only when measured or evidence-backed NOT COMPARABLE.

## P0068 — 081/LARGE/3-Sprue/ENTRY/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0068` completes only when measured or evidence-backed NOT COMPARABLE.

## P0069 — 081/LARGE/3-Sprue/B3/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0069` completes only when measured or evidence-backed NOT COMPARABLE.

## P0070 — 081/LARGE/3-Sprue/B3/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0070` completes only when measured or evidence-backed NOT COMPARABLE.

## P0071 — 081/LARGE/3-Sprue/B20/Class-A
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0071` completes only when measured or evidence-backed NOT COMPARABLE.

## P0072 — 081/LARGE/3-Sprue/B20/Class-B
SHA: `081ef3a94db3dd3f7d58e3283d5a238603e4655c`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0072` completes only when measured or evidence-backed NOT COMPARABLE.

## P0073 — 042/SMALL/1-Sprue/COLD_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0073` completes only when measured or evidence-backed NOT COMPARABLE.

## P0074 — 042/SMALL/1-Sprue/COLD_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0074` completes only when measured or evidence-backed NOT COMPARABLE.

## P0075 — 042/SMALL/1-Sprue/WARM_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0075` completes only when measured or evidence-backed NOT COMPARABLE.

## P0076 — 042/SMALL/1-Sprue/WARM_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0076` completes only when measured or evidence-backed NOT COMPARABLE.

## P0077 — 042/SMALL/1-Sprue/MAIN/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0077` completes only when measured or evidence-backed NOT COMPARABLE.

## P0078 — 042/SMALL/1-Sprue/MAIN/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0078` completes only when measured or evidence-backed NOT COMPARABLE.

## P0079 — 042/SMALL/1-Sprue/ENTRY/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0079` completes only when measured or evidence-backed NOT COMPARABLE.

## P0080 — 042/SMALL/1-Sprue/ENTRY/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0080` completes only when measured or evidence-backed NOT COMPARABLE.

## P0081 — 042/SMALL/1-Sprue/B3/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0081` completes only when measured or evidence-backed NOT COMPARABLE.

## P0082 — 042/SMALL/1-Sprue/B3/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0082` completes only when measured or evidence-backed NOT COMPARABLE.

## P0083 — 042/SMALL/1-Sprue/B20/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0083` completes only when measured or evidence-backed NOT COMPARABLE.

## P0084 — 042/SMALL/1-Sprue/B20/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0084` completes only when measured or evidence-backed NOT COMPARABLE.

## P0085 — 042/SMALL/3-Sprue/COLD_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0085` completes only when measured or evidence-backed NOT COMPARABLE.

## P0086 — 042/SMALL/3-Sprue/COLD_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0086` completes only when measured or evidence-backed NOT COMPARABLE.

## P0087 — 042/SMALL/3-Sprue/WARM_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0087` completes only when measured or evidence-backed NOT COMPARABLE.

## P0088 — 042/SMALL/3-Sprue/WARM_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0088` completes only when measured or evidence-backed NOT COMPARABLE.

## P0089 — 042/SMALL/3-Sprue/MAIN/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0089` completes only when measured or evidence-backed NOT COMPARABLE.

## P0090 — 042/SMALL/3-Sprue/MAIN/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0090` completes only when measured or evidence-backed NOT COMPARABLE.

## P0091 — 042/SMALL/3-Sprue/ENTRY/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0091` completes only when measured or evidence-backed NOT COMPARABLE.

## P0092 — 042/SMALL/3-Sprue/ENTRY/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0092` completes only when measured or evidence-backed NOT COMPARABLE.

## P0093 — 042/SMALL/3-Sprue/B3/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0093` completes only when measured or evidence-backed NOT COMPARABLE.

## P0094 — 042/SMALL/3-Sprue/B3/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0094` completes only when measured or evidence-backed NOT COMPARABLE.

## P0095 — 042/SMALL/3-Sprue/B20/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0095` completes only when measured or evidence-backed NOT COMPARABLE.

## P0096 — 042/SMALL/3-Sprue/B20/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0096` completes only when measured or evidence-backed NOT COMPARABLE.

## P0097 — 042/MEDIUM/1-Sprue/COLD_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0097` completes only when measured or evidence-backed NOT COMPARABLE.

## P0098 — 042/MEDIUM/1-Sprue/COLD_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0098` completes only when measured or evidence-backed NOT COMPARABLE.

## P0099 — 042/MEDIUM/1-Sprue/WARM_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0099` completes only when measured or evidence-backed NOT COMPARABLE.

## P0100 — 042/MEDIUM/1-Sprue/WARM_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0100` completes only when measured or evidence-backed NOT COMPARABLE.

## P0101 — 042/MEDIUM/1-Sprue/MAIN/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0101` completes only when measured or evidence-backed NOT COMPARABLE.

## P0102 — 042/MEDIUM/1-Sprue/MAIN/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0102` completes only when measured or evidence-backed NOT COMPARABLE.

## P0103 — 042/MEDIUM/1-Sprue/ENTRY/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0103` completes only when measured or evidence-backed NOT COMPARABLE.

## P0104 — 042/MEDIUM/1-Sprue/ENTRY/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0104` completes only when measured or evidence-backed NOT COMPARABLE.

## P0105 — 042/MEDIUM/1-Sprue/B3/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0105` completes only when measured or evidence-backed NOT COMPARABLE.

## P0106 — 042/MEDIUM/1-Sprue/B3/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0106` completes only when measured or evidence-backed NOT COMPARABLE.

## P0107 — 042/MEDIUM/1-Sprue/B20/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0107` completes only when measured or evidence-backed NOT COMPARABLE.

## P0108 — 042/MEDIUM/1-Sprue/B20/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0108` completes only when measured or evidence-backed NOT COMPARABLE.

## P0109 — 042/MEDIUM/3-Sprue/COLD_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0109` completes only when measured or evidence-backed NOT COMPARABLE.

## P0110 — 042/MEDIUM/3-Sprue/COLD_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0110` completes only when measured or evidence-backed NOT COMPARABLE.

## P0111 — 042/MEDIUM/3-Sprue/WARM_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0111` completes only when measured or evidence-backed NOT COMPARABLE.

## P0112 — 042/MEDIUM/3-Sprue/WARM_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0112` completes only when measured or evidence-backed NOT COMPARABLE.

## P0113 — 042/MEDIUM/3-Sprue/MAIN/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0113` completes only when measured or evidence-backed NOT COMPARABLE.

## P0114 — 042/MEDIUM/3-Sprue/MAIN/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0114` completes only when measured or evidence-backed NOT COMPARABLE.

## P0115 — 042/MEDIUM/3-Sprue/ENTRY/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0115` completes only when measured or evidence-backed NOT COMPARABLE.

## P0116 — 042/MEDIUM/3-Sprue/ENTRY/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0116` completes only when measured or evidence-backed NOT COMPARABLE.

## P0117 — 042/MEDIUM/3-Sprue/B3/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0117` completes only when measured or evidence-backed NOT COMPARABLE.

## P0118 — 042/MEDIUM/3-Sprue/B3/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0118` completes only when measured or evidence-backed NOT COMPARABLE.

## P0119 — 042/MEDIUM/3-Sprue/B20/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0119` completes only when measured or evidence-backed NOT COMPARABLE.

## P0120 — 042/MEDIUM/3-Sprue/B20/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0120` completes only when measured or evidence-backed NOT COMPARABLE.

## P0121 — 042/LARGE/1-Sprue/COLD_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0121` completes only when measured or evidence-backed NOT COMPARABLE.

## P0122 — 042/LARGE/1-Sprue/COLD_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0122` completes only when measured or evidence-backed NOT COMPARABLE.

## P0123 — 042/LARGE/1-Sprue/WARM_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0123` completes only when measured or evidence-backed NOT COMPARABLE.

## P0124 — 042/LARGE/1-Sprue/WARM_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0124` completes only when measured or evidence-backed NOT COMPARABLE.

## P0125 — 042/LARGE/1-Sprue/MAIN/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0125` completes only when measured or evidence-backed NOT COMPARABLE.

## P0126 — 042/LARGE/1-Sprue/MAIN/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0126` completes only when measured or evidence-backed NOT COMPARABLE.

## P0127 — 042/LARGE/1-Sprue/ENTRY/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0127` completes only when measured or evidence-backed NOT COMPARABLE.

## P0128 — 042/LARGE/1-Sprue/ENTRY/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0128` completes only when measured or evidence-backed NOT COMPARABLE.

## P0129 — 042/LARGE/1-Sprue/B3/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0129` completes only when measured or evidence-backed NOT COMPARABLE.

## P0130 — 042/LARGE/1-Sprue/B3/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0130` completes only when measured or evidence-backed NOT COMPARABLE.

## P0131 — 042/LARGE/1-Sprue/B20/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0131` completes only when measured or evidence-backed NOT COMPARABLE.

## P0132 — 042/LARGE/1-Sprue/B20/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0132` completes only when measured or evidence-backed NOT COMPARABLE.

## P0133 — 042/LARGE/3-Sprue/COLD_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0133` completes only when measured or evidence-backed NOT COMPARABLE.

## P0134 — 042/LARGE/3-Sprue/COLD_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0134` completes only when measured or evidence-backed NOT COMPARABLE.

## P0135 — 042/LARGE/3-Sprue/WARM_CREATE/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0135` completes only when measured or evidence-backed NOT COMPARABLE.

## P0136 — 042/LARGE/3-Sprue/WARM_CREATE/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0136` completes only when measured or evidence-backed NOT COMPARABLE.

## P0137 — 042/LARGE/3-Sprue/MAIN/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0137` completes only when measured or evidence-backed NOT COMPARABLE.

## P0138 — 042/LARGE/3-Sprue/MAIN/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0138` completes only when measured or evidence-backed NOT COMPARABLE.

## P0139 — 042/LARGE/3-Sprue/ENTRY/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0139` completes only when measured or evidence-backed NOT COMPARABLE.

## P0140 — 042/LARGE/3-Sprue/ENTRY/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0140` completes only when measured or evidence-backed NOT COMPARABLE.

## P0141 — 042/LARGE/3-Sprue/B3/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0141` completes only when measured or evidence-backed NOT COMPARABLE.

## P0142 — 042/LARGE/3-Sprue/B3/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0142` completes only when measured or evidence-backed NOT COMPARABLE.

## P0143 — 042/LARGE/3-Sprue/B20/Class-A
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0143` completes only when measured or evidence-backed NOT COMPARABLE.

## P0144 — 042/LARGE/3-Sprue/B20/Class-B
SHA: `042d4011a77c2f7ceb3813def23a97da59dd961f`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0144` completes only when measured or evidence-backed NOT COMPARABLE.

## P0145 — 6AE/SMALL/1-Sprue/COLD_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0145` completes only when measured or evidence-backed NOT COMPARABLE.

## P0146 — 6AE/SMALL/1-Sprue/COLD_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0146` completes only when measured or evidence-backed NOT COMPARABLE.

## P0147 — 6AE/SMALL/1-Sprue/WARM_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0147` completes only when measured or evidence-backed NOT COMPARABLE.

## P0148 — 6AE/SMALL/1-Sprue/WARM_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0148` completes only when measured or evidence-backed NOT COMPARABLE.

## P0149 — 6AE/SMALL/1-Sprue/MAIN/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0149` completes only when measured or evidence-backed NOT COMPARABLE.

## P0150 — 6AE/SMALL/1-Sprue/MAIN/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0150` completes only when measured or evidence-backed NOT COMPARABLE.

## P0151 — 6AE/SMALL/1-Sprue/ENTRY/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0151` completes only when measured or evidence-backed NOT COMPARABLE.

## P0152 — 6AE/SMALL/1-Sprue/ENTRY/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0152` completes only when measured or evidence-backed NOT COMPARABLE.

## P0153 — 6AE/SMALL/1-Sprue/B3/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0153` completes only when measured or evidence-backed NOT COMPARABLE.

## P0154 — 6AE/SMALL/1-Sprue/B3/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0154` completes only when measured or evidence-backed NOT COMPARABLE.

## P0155 — 6AE/SMALL/1-Sprue/B20/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0155` completes only when measured or evidence-backed NOT COMPARABLE.

## P0156 — 6AE/SMALL/1-Sprue/B20/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0156` completes only when measured or evidence-backed NOT COMPARABLE.

## P0157 — 6AE/SMALL/3-Sprue/COLD_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0157` completes only when measured or evidence-backed NOT COMPARABLE.

## P0158 — 6AE/SMALL/3-Sprue/COLD_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0158` completes only when measured or evidence-backed NOT COMPARABLE.

## P0159 — 6AE/SMALL/3-Sprue/WARM_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0159` completes only when measured or evidence-backed NOT COMPARABLE.

## P0160 — 6AE/SMALL/3-Sprue/WARM_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0160` completes only when measured or evidence-backed NOT COMPARABLE.

## P0161 — 6AE/SMALL/3-Sprue/MAIN/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0161` completes only when measured or evidence-backed NOT COMPARABLE.

## P0162 — 6AE/SMALL/3-Sprue/MAIN/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0162` completes only when measured or evidence-backed NOT COMPARABLE.

## P0163 — 6AE/SMALL/3-Sprue/ENTRY/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0163` completes only when measured or evidence-backed NOT COMPARABLE.

## P0164 — 6AE/SMALL/3-Sprue/ENTRY/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0164` completes only when measured or evidence-backed NOT COMPARABLE.

## P0165 — 6AE/SMALL/3-Sprue/B3/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0165` completes only when measured or evidence-backed NOT COMPARABLE.

## P0166 — 6AE/SMALL/3-Sprue/B3/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0166` completes only when measured or evidence-backed NOT COMPARABLE.

## P0167 — 6AE/SMALL/3-Sprue/B20/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0167` completes only when measured or evidence-backed NOT COMPARABLE.

## P0168 — 6AE/SMALL/3-Sprue/B20/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0168` completes only when measured or evidence-backed NOT COMPARABLE.

## P0169 — 6AE/MEDIUM/1-Sprue/COLD_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0169` completes only when measured or evidence-backed NOT COMPARABLE.

## P0170 — 6AE/MEDIUM/1-Sprue/COLD_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0170` completes only when measured or evidence-backed NOT COMPARABLE.

## P0171 — 6AE/MEDIUM/1-Sprue/WARM_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0171` completes only when measured or evidence-backed NOT COMPARABLE.

## P0172 — 6AE/MEDIUM/1-Sprue/WARM_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0172` completes only when measured or evidence-backed NOT COMPARABLE.

## P0173 — 6AE/MEDIUM/1-Sprue/MAIN/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0173` completes only when measured or evidence-backed NOT COMPARABLE.

## P0174 — 6AE/MEDIUM/1-Sprue/MAIN/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0174` completes only when measured or evidence-backed NOT COMPARABLE.

## P0175 — 6AE/MEDIUM/1-Sprue/ENTRY/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0175` completes only when measured or evidence-backed NOT COMPARABLE.

## P0176 — 6AE/MEDIUM/1-Sprue/ENTRY/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0176` completes only when measured or evidence-backed NOT COMPARABLE.

## P0177 — 6AE/MEDIUM/1-Sprue/B3/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0177` completes only when measured or evidence-backed NOT COMPARABLE.

## P0178 — 6AE/MEDIUM/1-Sprue/B3/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0178` completes only when measured or evidence-backed NOT COMPARABLE.

## P0179 — 6AE/MEDIUM/1-Sprue/B20/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0179` completes only when measured or evidence-backed NOT COMPARABLE.

## P0180 — 6AE/MEDIUM/1-Sprue/B20/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0180` completes only when measured or evidence-backed NOT COMPARABLE.

## P0181 — 6AE/MEDIUM/3-Sprue/COLD_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0181` completes only when measured or evidence-backed NOT COMPARABLE.

## P0182 — 6AE/MEDIUM/3-Sprue/COLD_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0182` completes only when measured or evidence-backed NOT COMPARABLE.

## P0183 — 6AE/MEDIUM/3-Sprue/WARM_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0183` completes only when measured or evidence-backed NOT COMPARABLE.

## P0184 — 6AE/MEDIUM/3-Sprue/WARM_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0184` completes only when measured or evidence-backed NOT COMPARABLE.

## P0185 — 6AE/MEDIUM/3-Sprue/MAIN/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0185` completes only when measured or evidence-backed NOT COMPARABLE.

## P0186 — 6AE/MEDIUM/3-Sprue/MAIN/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0186` completes only when measured or evidence-backed NOT COMPARABLE.

## P0187 — 6AE/MEDIUM/3-Sprue/ENTRY/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0187` completes only when measured or evidence-backed NOT COMPARABLE.

## P0188 — 6AE/MEDIUM/3-Sprue/ENTRY/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0188` completes only when measured or evidence-backed NOT COMPARABLE.

## P0189 — 6AE/MEDIUM/3-Sprue/B3/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0189` completes only when measured or evidence-backed NOT COMPARABLE.

## P0190 — 6AE/MEDIUM/3-Sprue/B3/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0190` completes only when measured or evidence-backed NOT COMPARABLE.

## P0191 — 6AE/MEDIUM/3-Sprue/B20/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0191` completes only when measured or evidence-backed NOT COMPARABLE.

## P0192 — 6AE/MEDIUM/3-Sprue/B20/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0192` completes only when measured or evidence-backed NOT COMPARABLE.

## P0193 — 6AE/LARGE/1-Sprue/COLD_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0193` completes only when measured or evidence-backed NOT COMPARABLE.

## P0194 — 6AE/LARGE/1-Sprue/COLD_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0194` completes only when measured or evidence-backed NOT COMPARABLE.

## P0195 — 6AE/LARGE/1-Sprue/WARM_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0195` completes only when measured or evidence-backed NOT COMPARABLE.

## P0196 — 6AE/LARGE/1-Sprue/WARM_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0196` completes only when measured or evidence-backed NOT COMPARABLE.

## P0197 — 6AE/LARGE/1-Sprue/MAIN/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0197` completes only when measured or evidence-backed NOT COMPARABLE.

## P0198 — 6AE/LARGE/1-Sprue/MAIN/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0198` completes only when measured or evidence-backed NOT COMPARABLE.

## P0199 — 6AE/LARGE/1-Sprue/ENTRY/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0199` completes only when measured or evidence-backed NOT COMPARABLE.

## P0200 — 6AE/LARGE/1-Sprue/ENTRY/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0200` completes only when measured or evidence-backed NOT COMPARABLE.

## P0201 — 6AE/LARGE/1-Sprue/B3/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0201` completes only when measured or evidence-backed NOT COMPARABLE.

## P0202 — 6AE/LARGE/1-Sprue/B3/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0202` completes only when measured or evidence-backed NOT COMPARABLE.

## P0203 — 6AE/LARGE/1-Sprue/B20/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0203` completes only when measured or evidence-backed NOT COMPARABLE.

## P0204 — 6AE/LARGE/1-Sprue/B20/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0204` completes only when measured or evidence-backed NOT COMPARABLE.

## P0205 — 6AE/LARGE/3-Sprue/COLD_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0205` completes only when measured or evidence-backed NOT COMPARABLE.

## P0206 — 6AE/LARGE/3-Sprue/COLD_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0206` completes only when measured or evidence-backed NOT COMPARABLE.

## P0207 — 6AE/LARGE/3-Sprue/WARM_CREATE/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0207` completes only when measured or evidence-backed NOT COMPARABLE.

## P0208 — 6AE/LARGE/3-Sprue/WARM_CREATE/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0208` completes only when measured or evidence-backed NOT COMPARABLE.

## P0209 — 6AE/LARGE/3-Sprue/MAIN/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0209` completes only when measured or evidence-backed NOT COMPARABLE.

## P0210 — 6AE/LARGE/3-Sprue/MAIN/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0210` completes only when measured or evidence-backed NOT COMPARABLE.

## P0211 — 6AE/LARGE/3-Sprue/ENTRY/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0211` completes only when measured or evidence-backed NOT COMPARABLE.

## P0212 — 6AE/LARGE/3-Sprue/ENTRY/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0212` completes only when measured or evidence-backed NOT COMPARABLE.

## P0213 — 6AE/LARGE/3-Sprue/B3/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0213` completes only when measured or evidence-backed NOT COMPARABLE.

## P0214 — 6AE/LARGE/3-Sprue/B3/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0214` completes only when measured or evidence-backed NOT COMPARABLE.

## P0215 — 6AE/LARGE/3-Sprue/B20/Class-A
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0215` completes only when measured or evidence-backed NOT COMPARABLE.

## P0216 — 6AE/LARGE/3-Sprue/B20/Class-B
SHA: `6aeabcd57b255b6ded740996408f9664298b8339`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0216` completes only when measured or evidence-backed NOT COMPARABLE.

## P0217 — 57B/SMALL/1-Sprue/COLD_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0217` completes only when measured or evidence-backed NOT COMPARABLE.

## P0218 — 57B/SMALL/1-Sprue/COLD_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0218` completes only when measured or evidence-backed NOT COMPARABLE.

## P0219 — 57B/SMALL/1-Sprue/WARM_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0219` completes only when measured or evidence-backed NOT COMPARABLE.

## P0220 — 57B/SMALL/1-Sprue/WARM_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0220` completes only when measured or evidence-backed NOT COMPARABLE.

## P0221 — 57B/SMALL/1-Sprue/MAIN/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0221` completes only when measured or evidence-backed NOT COMPARABLE.

## P0222 — 57B/SMALL/1-Sprue/MAIN/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0222` completes only when measured or evidence-backed NOT COMPARABLE.

## P0223 — 57B/SMALL/1-Sprue/ENTRY/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0223` completes only when measured or evidence-backed NOT COMPARABLE.

## P0224 — 57B/SMALL/1-Sprue/ENTRY/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0224` completes only when measured or evidence-backed NOT COMPARABLE.

## P0225 — 57B/SMALL/1-Sprue/B3/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0225` completes only when measured or evidence-backed NOT COMPARABLE.

## P0226 — 57B/SMALL/1-Sprue/B3/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0226` completes only when measured or evidence-backed NOT COMPARABLE.

## P0227 — 57B/SMALL/1-Sprue/B20/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0227` completes only when measured or evidence-backed NOT COMPARABLE.

## P0228 — 57B/SMALL/1-Sprue/B20/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0228` completes only when measured or evidence-backed NOT COMPARABLE.

## P0229 — 57B/SMALL/3-Sprue/COLD_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0229` completes only when measured or evidence-backed NOT COMPARABLE.

## P0230 — 57B/SMALL/3-Sprue/COLD_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0230` completes only when measured or evidence-backed NOT COMPARABLE.

## P0231 — 57B/SMALL/3-Sprue/WARM_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0231` completes only when measured or evidence-backed NOT COMPARABLE.

## P0232 — 57B/SMALL/3-Sprue/WARM_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0232` completes only when measured or evidence-backed NOT COMPARABLE.

## P0233 — 57B/SMALL/3-Sprue/MAIN/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0233` completes only when measured or evidence-backed NOT COMPARABLE.

## P0234 — 57B/SMALL/3-Sprue/MAIN/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0234` completes only when measured or evidence-backed NOT COMPARABLE.

## P0235 — 57B/SMALL/3-Sprue/ENTRY/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0235` completes only when measured or evidence-backed NOT COMPARABLE.

## P0236 — 57B/SMALL/3-Sprue/ENTRY/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0236` completes only when measured or evidence-backed NOT COMPARABLE.

## P0237 — 57B/SMALL/3-Sprue/B3/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0237` completes only when measured or evidence-backed NOT COMPARABLE.

## P0238 — 57B/SMALL/3-Sprue/B3/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0238` completes only when measured or evidence-backed NOT COMPARABLE.

## P0239 — 57B/SMALL/3-Sprue/B20/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0239` completes only when measured or evidence-backed NOT COMPARABLE.

## P0240 — 57B/SMALL/3-Sprue/B20/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0240` completes only when measured or evidence-backed NOT COMPARABLE.

## P0241 — 57B/MEDIUM/1-Sprue/COLD_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0241` completes only when measured or evidence-backed NOT COMPARABLE.

## P0242 — 57B/MEDIUM/1-Sprue/COLD_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0242` completes only when measured or evidence-backed NOT COMPARABLE.

## P0243 — 57B/MEDIUM/1-Sprue/WARM_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0243` completes only when measured or evidence-backed NOT COMPARABLE.

## P0244 — 57B/MEDIUM/1-Sprue/WARM_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0244` completes only when measured or evidence-backed NOT COMPARABLE.

## P0245 — 57B/MEDIUM/1-Sprue/MAIN/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0245` completes only when measured or evidence-backed NOT COMPARABLE.

## P0246 — 57B/MEDIUM/1-Sprue/MAIN/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0246` completes only when measured or evidence-backed NOT COMPARABLE.

## P0247 — 57B/MEDIUM/1-Sprue/ENTRY/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0247` completes only when measured or evidence-backed NOT COMPARABLE.

## P0248 — 57B/MEDIUM/1-Sprue/ENTRY/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0248` completes only when measured or evidence-backed NOT COMPARABLE.

## P0249 — 57B/MEDIUM/1-Sprue/B3/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0249` completes only when measured or evidence-backed NOT COMPARABLE.

## P0250 — 57B/MEDIUM/1-Sprue/B3/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0250` completes only when measured or evidence-backed NOT COMPARABLE.

## P0251 — 57B/MEDIUM/1-Sprue/B20/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0251` completes only when measured or evidence-backed NOT COMPARABLE.

## P0252 — 57B/MEDIUM/1-Sprue/B20/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0252` completes only when measured or evidence-backed NOT COMPARABLE.

## P0253 — 57B/MEDIUM/3-Sprue/COLD_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0253` completes only when measured or evidence-backed NOT COMPARABLE.

## P0254 — 57B/MEDIUM/3-Sprue/COLD_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0254` completes only when measured or evidence-backed NOT COMPARABLE.

## P0255 — 57B/MEDIUM/3-Sprue/WARM_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0255` completes only when measured or evidence-backed NOT COMPARABLE.

## P0256 — 57B/MEDIUM/3-Sprue/WARM_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0256` completes only when measured or evidence-backed NOT COMPARABLE.

## P0257 — 57B/MEDIUM/3-Sprue/MAIN/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0257` completes only when measured or evidence-backed NOT COMPARABLE.

## P0258 — 57B/MEDIUM/3-Sprue/MAIN/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0258` completes only when measured or evidence-backed NOT COMPARABLE.

## P0259 — 57B/MEDIUM/3-Sprue/ENTRY/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0259` completes only when measured or evidence-backed NOT COMPARABLE.

## P0260 — 57B/MEDIUM/3-Sprue/ENTRY/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0260` completes only when measured or evidence-backed NOT COMPARABLE.

## P0261 — 57B/MEDIUM/3-Sprue/B3/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0261` completes only when measured or evidence-backed NOT COMPARABLE.

## P0262 — 57B/MEDIUM/3-Sprue/B3/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0262` completes only when measured or evidence-backed NOT COMPARABLE.

## P0263 — 57B/MEDIUM/3-Sprue/B20/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0263` completes only when measured or evidence-backed NOT COMPARABLE.

## P0264 — 57B/MEDIUM/3-Sprue/B20/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0264` completes only when measured or evidence-backed NOT COMPARABLE.

## P0265 — 57B/LARGE/1-Sprue/COLD_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0265` completes only when measured or evidence-backed NOT COMPARABLE.

## P0266 — 57B/LARGE/1-Sprue/COLD_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0266` completes only when measured or evidence-backed NOT COMPARABLE.

## P0267 — 57B/LARGE/1-Sprue/WARM_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0267` completes only when measured or evidence-backed NOT COMPARABLE.

## P0268 — 57B/LARGE/1-Sprue/WARM_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0268` completes only when measured or evidence-backed NOT COMPARABLE.

## P0269 — 57B/LARGE/1-Sprue/MAIN/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0269` completes only when measured or evidence-backed NOT COMPARABLE.

## P0270 — 57B/LARGE/1-Sprue/MAIN/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0270` completes only when measured or evidence-backed NOT COMPARABLE.

## P0271 — 57B/LARGE/1-Sprue/ENTRY/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0271` completes only when measured or evidence-backed NOT COMPARABLE.

## P0272 — 57B/LARGE/1-Sprue/ENTRY/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0272` completes only when measured or evidence-backed NOT COMPARABLE.

## P0273 — 57B/LARGE/1-Sprue/B3/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0273` completes only when measured or evidence-backed NOT COMPARABLE.

## P0274 — 57B/LARGE/1-Sprue/B3/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0274` completes only when measured or evidence-backed NOT COMPARABLE.

## P0275 — 57B/LARGE/1-Sprue/B20/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0275` completes only when measured or evidence-backed NOT COMPARABLE.

## P0276 — 57B/LARGE/1-Sprue/B20/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0276` completes only when measured or evidence-backed NOT COMPARABLE.

## P0277 — 57B/LARGE/3-Sprue/COLD_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0277` completes only when measured or evidence-backed NOT COMPARABLE.

## P0278 — 57B/LARGE/3-Sprue/COLD_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0278` completes only when measured or evidence-backed NOT COMPARABLE.

## P0279 — 57B/LARGE/3-Sprue/WARM_CREATE/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0279` completes only when measured or evidence-backed NOT COMPARABLE.

## P0280 — 57B/LARGE/3-Sprue/WARM_CREATE/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0280` completes only when measured or evidence-backed NOT COMPARABLE.

## P0281 — 57B/LARGE/3-Sprue/MAIN/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0281` completes only when measured or evidence-backed NOT COMPARABLE.

## P0282 — 57B/LARGE/3-Sprue/MAIN/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0282` completes only when measured or evidence-backed NOT COMPARABLE.

## P0283 — 57B/LARGE/3-Sprue/ENTRY/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0283` completes only when measured or evidence-backed NOT COMPARABLE.

## P0284 — 57B/LARGE/3-Sprue/ENTRY/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0284` completes only when measured or evidence-backed NOT COMPARABLE.

## P0285 — 57B/LARGE/3-Sprue/B3/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0285` completes only when measured or evidence-backed NOT COMPARABLE.

## P0286 — 57B/LARGE/3-Sprue/B3/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0286` completes only when measured or evidence-backed NOT COMPARABLE.

## P0287 — 57B/LARGE/3-Sprue/B20/Class-A
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0287` completes only when measured or evidence-backed NOT COMPARABLE.

## P0288 — 57B/LARGE/3-Sprue/B20/Class-B
SHA: `57b55a0a1594c780be21f7680813ed750ee030dc`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0288` completes only when measured or evidence-backed NOT COMPARABLE.

## P0289 — 456/SMALL/1-Sprue/COLD_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0289` completes only when measured or evidence-backed NOT COMPARABLE.

## P0290 — 456/SMALL/1-Sprue/COLD_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0290` completes only when measured or evidence-backed NOT COMPARABLE.

## P0291 — 456/SMALL/1-Sprue/WARM_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0291` completes only when measured or evidence-backed NOT COMPARABLE.

## P0292 — 456/SMALL/1-Sprue/WARM_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0292` completes only when measured or evidence-backed NOT COMPARABLE.

## P0293 — 456/SMALL/1-Sprue/MAIN/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0293` completes only when measured or evidence-backed NOT COMPARABLE.

## P0294 — 456/SMALL/1-Sprue/MAIN/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0294` completes only when measured or evidence-backed NOT COMPARABLE.

## P0295 — 456/SMALL/1-Sprue/ENTRY/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0295` completes only when measured or evidence-backed NOT COMPARABLE.

## P0296 — 456/SMALL/1-Sprue/ENTRY/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0296` completes only when measured or evidence-backed NOT COMPARABLE.

## P0297 — 456/SMALL/1-Sprue/B3/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0297` completes only when measured or evidence-backed NOT COMPARABLE.

## P0298 — 456/SMALL/1-Sprue/B3/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0298` completes only when measured or evidence-backed NOT COMPARABLE.

## P0299 — 456/SMALL/1-Sprue/B20/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0299` completes only when measured or evidence-backed NOT COMPARABLE.

## P0300 — 456/SMALL/1-Sprue/B20/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0300` completes only when measured or evidence-backed NOT COMPARABLE.

## P0301 — 456/SMALL/3-Sprue/COLD_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0301` completes only when measured or evidence-backed NOT COMPARABLE.

## P0302 — 456/SMALL/3-Sprue/COLD_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0302` completes only when measured or evidence-backed NOT COMPARABLE.

## P0303 — 456/SMALL/3-Sprue/WARM_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0303` completes only when measured or evidence-backed NOT COMPARABLE.

## P0304 — 456/SMALL/3-Sprue/WARM_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0304` completes only when measured or evidence-backed NOT COMPARABLE.

## P0305 — 456/SMALL/3-Sprue/MAIN/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0305` completes only when measured or evidence-backed NOT COMPARABLE.

## P0306 — 456/SMALL/3-Sprue/MAIN/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0306` completes only when measured or evidence-backed NOT COMPARABLE.

## P0307 — 456/SMALL/3-Sprue/ENTRY/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0307` completes only when measured or evidence-backed NOT COMPARABLE.

## P0308 — 456/SMALL/3-Sprue/ENTRY/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0308` completes only when measured or evidence-backed NOT COMPARABLE.

## P0309 — 456/SMALL/3-Sprue/B3/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0309` completes only when measured or evidence-backed NOT COMPARABLE.

## P0310 — 456/SMALL/3-Sprue/B3/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0310` completes only when measured or evidence-backed NOT COMPARABLE.

## P0311 — 456/SMALL/3-Sprue/B20/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0311` completes only when measured or evidence-backed NOT COMPARABLE.

## P0312 — 456/SMALL/3-Sprue/B20/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0312` completes only when measured or evidence-backed NOT COMPARABLE.

## P0313 — 456/MEDIUM/1-Sprue/COLD_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0313` completes only when measured or evidence-backed NOT COMPARABLE.

## P0314 — 456/MEDIUM/1-Sprue/COLD_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0314` completes only when measured or evidence-backed NOT COMPARABLE.

## P0315 — 456/MEDIUM/1-Sprue/WARM_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0315` completes only when measured or evidence-backed NOT COMPARABLE.

## P0316 — 456/MEDIUM/1-Sprue/WARM_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0316` completes only when measured or evidence-backed NOT COMPARABLE.

## P0317 — 456/MEDIUM/1-Sprue/MAIN/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0317` completes only when measured or evidence-backed NOT COMPARABLE.

## P0318 — 456/MEDIUM/1-Sprue/MAIN/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0318` completes only when measured or evidence-backed NOT COMPARABLE.

## P0319 — 456/MEDIUM/1-Sprue/ENTRY/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0319` completes only when measured or evidence-backed NOT COMPARABLE.

## P0320 — 456/MEDIUM/1-Sprue/ENTRY/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0320` completes only when measured or evidence-backed NOT COMPARABLE.

## P0321 — 456/MEDIUM/1-Sprue/B3/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0321` completes only when measured or evidence-backed NOT COMPARABLE.

## P0322 — 456/MEDIUM/1-Sprue/B3/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0322` completes only when measured or evidence-backed NOT COMPARABLE.

## P0323 — 456/MEDIUM/1-Sprue/B20/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0323` completes only when measured or evidence-backed NOT COMPARABLE.

## P0324 — 456/MEDIUM/1-Sprue/B20/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0324` completes only when measured or evidence-backed NOT COMPARABLE.

## P0325 — 456/MEDIUM/3-Sprue/COLD_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0325` completes only when measured or evidence-backed NOT COMPARABLE.

## P0326 — 456/MEDIUM/3-Sprue/COLD_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0326` completes only when measured or evidence-backed NOT COMPARABLE.

## P0327 — 456/MEDIUM/3-Sprue/WARM_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0327` completes only when measured or evidence-backed NOT COMPARABLE.

## P0328 — 456/MEDIUM/3-Sprue/WARM_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0328` completes only when measured or evidence-backed NOT COMPARABLE.

## P0329 — 456/MEDIUM/3-Sprue/MAIN/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0329` completes only when measured or evidence-backed NOT COMPARABLE.

## P0330 — 456/MEDIUM/3-Sprue/MAIN/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0330` completes only when measured or evidence-backed NOT COMPARABLE.

## P0331 — 456/MEDIUM/3-Sprue/ENTRY/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0331` completes only when measured or evidence-backed NOT COMPARABLE.

## P0332 — 456/MEDIUM/3-Sprue/ENTRY/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0332` completes only when measured or evidence-backed NOT COMPARABLE.

## P0333 — 456/MEDIUM/3-Sprue/B3/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0333` completes only when measured or evidence-backed NOT COMPARABLE.

## P0334 — 456/MEDIUM/3-Sprue/B3/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0334` completes only when measured or evidence-backed NOT COMPARABLE.

## P0335 — 456/MEDIUM/3-Sprue/B20/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0335` completes only when measured or evidence-backed NOT COMPARABLE.

## P0336 — 456/MEDIUM/3-Sprue/B20/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0336` completes only when measured or evidence-backed NOT COMPARABLE.

## P0337 — 456/LARGE/1-Sprue/COLD_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0337` completes only when measured or evidence-backed NOT COMPARABLE.

## P0338 — 456/LARGE/1-Sprue/COLD_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0338` completes only when measured or evidence-backed NOT COMPARABLE.

## P0339 — 456/LARGE/1-Sprue/WARM_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0339` completes only when measured or evidence-backed NOT COMPARABLE.

## P0340 — 456/LARGE/1-Sprue/WARM_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0340` completes only when measured or evidence-backed NOT COMPARABLE.

## P0341 — 456/LARGE/1-Sprue/MAIN/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0341` completes only when measured or evidence-backed NOT COMPARABLE.

## P0342 — 456/LARGE/1-Sprue/MAIN/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0342` completes only when measured or evidence-backed NOT COMPARABLE.

## P0343 — 456/LARGE/1-Sprue/ENTRY/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0343` completes only when measured or evidence-backed NOT COMPARABLE.

## P0344 — 456/LARGE/1-Sprue/ENTRY/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0344` completes only when measured or evidence-backed NOT COMPARABLE.

## P0345 — 456/LARGE/1-Sprue/B3/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0345` completes only when measured or evidence-backed NOT COMPARABLE.

## P0346 — 456/LARGE/1-Sprue/B3/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0346` completes only when measured or evidence-backed NOT COMPARABLE.

## P0347 — 456/LARGE/1-Sprue/B20/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0347` completes only when measured or evidence-backed NOT COMPARABLE.

## P0348 — 456/LARGE/1-Sprue/B20/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0348` completes only when measured or evidence-backed NOT COMPARABLE.

## P0349 — 456/LARGE/3-Sprue/COLD_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0349` completes only when measured or evidence-backed NOT COMPARABLE.

## P0350 — 456/LARGE/3-Sprue/COLD_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0350` completes only when measured or evidence-backed NOT COMPARABLE.

## P0351 — 456/LARGE/3-Sprue/WARM_CREATE/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0351` completes only when measured or evidence-backed NOT COMPARABLE.

## P0352 — 456/LARGE/3-Sprue/WARM_CREATE/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0352` completes only when measured or evidence-backed NOT COMPARABLE.

## P0353 — 456/LARGE/3-Sprue/MAIN/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0353` completes only when measured or evidence-backed NOT COMPARABLE.

## P0354 — 456/LARGE/3-Sprue/MAIN/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0354` completes only when measured or evidence-backed NOT COMPARABLE.

## P0355 — 456/LARGE/3-Sprue/ENTRY/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0355` completes only when measured or evidence-backed NOT COMPARABLE.

## P0356 — 456/LARGE/3-Sprue/ENTRY/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0356` completes only when measured or evidence-backed NOT COMPARABLE.

## P0357 — 456/LARGE/3-Sprue/B3/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0357` completes only when measured or evidence-backed NOT COMPARABLE.

## P0358 — 456/LARGE/3-Sprue/B3/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0358` completes only when measured or evidence-backed NOT COMPARABLE.

## P0359 — 456/LARGE/3-Sprue/B20/Class-A
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0359` completes only when measured or evidence-backed NOT COMPARABLE.

## P0360 — 456/LARGE/3-Sprue/B20/Class-B
SHA: `4567a9a4a747c546659d6a5f01b87e8c05fea445`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0360` completes only when measured or evidence-backed NOT COMPARABLE.

## P0361 — FINAL/SMALL/1-Sprue/COLD_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0361` completes only when measured or evidence-backed NOT COMPARABLE.

## P0362 — FINAL/SMALL/1-Sprue/COLD_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0362` completes only when measured or evidence-backed NOT COMPARABLE.

## P0363 — FINAL/SMALL/1-Sprue/WARM_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0363` completes only when measured or evidence-backed NOT COMPARABLE.

## P0364 — FINAL/SMALL/1-Sprue/WARM_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0364` completes only when measured or evidence-backed NOT COMPARABLE.

## P0365 — FINAL/SMALL/1-Sprue/MAIN/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0365` completes only when measured or evidence-backed NOT COMPARABLE.

## P0366 — FINAL/SMALL/1-Sprue/MAIN/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0366` completes only when measured or evidence-backed NOT COMPARABLE.

## P0367 — FINAL/SMALL/1-Sprue/ENTRY/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0367` completes only when measured or evidence-backed NOT COMPARABLE.

## P0368 — FINAL/SMALL/1-Sprue/ENTRY/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0368` completes only when measured or evidence-backed NOT COMPARABLE.

## P0369 — FINAL/SMALL/1-Sprue/B3/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0369` completes only when measured or evidence-backed NOT COMPARABLE.

## P0370 — FINAL/SMALL/1-Sprue/B3/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0370` completes only when measured or evidence-backed NOT COMPARABLE.

## P0371 — FINAL/SMALL/1-Sprue/B20/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0371` completes only when measured or evidence-backed NOT COMPARABLE.

## P0372 — FINAL/SMALL/1-Sprue/B20/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0372` completes only when measured or evidence-backed NOT COMPARABLE.

## P0373 — FINAL/SMALL/3-Sprue/COLD_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0373` completes only when measured or evidence-backed NOT COMPARABLE.

## P0374 — FINAL/SMALL/3-Sprue/COLD_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0374` completes only when measured or evidence-backed NOT COMPARABLE.

## P0375 — FINAL/SMALL/3-Sprue/WARM_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0375` completes only when measured or evidence-backed NOT COMPARABLE.

## P0376 — FINAL/SMALL/3-Sprue/WARM_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0376` completes only when measured or evidence-backed NOT COMPARABLE.

## P0377 — FINAL/SMALL/3-Sprue/MAIN/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0377` completes only when measured or evidence-backed NOT COMPARABLE.

## P0378 — FINAL/SMALL/3-Sprue/MAIN/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0378` completes only when measured or evidence-backed NOT COMPARABLE.

## P0379 — FINAL/SMALL/3-Sprue/ENTRY/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0379` completes only when measured or evidence-backed NOT COMPARABLE.

## P0380 — FINAL/SMALL/3-Sprue/ENTRY/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0380` completes only when measured or evidence-backed NOT COMPARABLE.

## P0381 — FINAL/SMALL/3-Sprue/B3/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0381` completes only when measured or evidence-backed NOT COMPARABLE.

## P0382 — FINAL/SMALL/3-Sprue/B3/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0382` completes only when measured or evidence-backed NOT COMPARABLE.

## P0383 — FINAL/SMALL/3-Sprue/B20/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0383` completes only when measured or evidence-backed NOT COMPARABLE.

## P0384 — FINAL/SMALL/3-Sprue/B20/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: SMALL, 12–100 triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0384` completes only when measured or evidence-backed NOT COMPARABLE.

## P0385 — FINAL/MEDIUM/1-Sprue/COLD_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0385` completes only when measured or evidence-backed NOT COMPARABLE.

## P0386 — FINAL/MEDIUM/1-Sprue/COLD_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0386` completes only when measured or evidence-backed NOT COMPARABLE.

## P0387 — FINAL/MEDIUM/1-Sprue/WARM_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0387` completes only when measured or evidence-backed NOT COMPARABLE.

## P0388 — FINAL/MEDIUM/1-Sprue/WARM_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0388` completes only when measured or evidence-backed NOT COMPARABLE.

## P0389 — FINAL/MEDIUM/1-Sprue/MAIN/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0389` completes only when measured or evidence-backed NOT COMPARABLE.

## P0390 — FINAL/MEDIUM/1-Sprue/MAIN/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0390` completes only when measured or evidence-backed NOT COMPARABLE.

## P0391 — FINAL/MEDIUM/1-Sprue/ENTRY/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0391` completes only when measured or evidence-backed NOT COMPARABLE.

## P0392 — FINAL/MEDIUM/1-Sprue/ENTRY/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0392` completes only when measured or evidence-backed NOT COMPARABLE.

## P0393 — FINAL/MEDIUM/1-Sprue/B3/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0393` completes only when measured or evidence-backed NOT COMPARABLE.

## P0394 — FINAL/MEDIUM/1-Sprue/B3/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0394` completes only when measured or evidence-backed NOT COMPARABLE.

## P0395 — FINAL/MEDIUM/1-Sprue/B20/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0395` completes only when measured or evidence-backed NOT COMPARABLE.

## P0396 — FINAL/MEDIUM/1-Sprue/B20/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0396` completes only when measured or evidence-backed NOT COMPARABLE.

## P0397 — FINAL/MEDIUM/3-Sprue/COLD_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0397` completes only when measured or evidence-backed NOT COMPARABLE.

## P0398 — FINAL/MEDIUM/3-Sprue/COLD_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0398` completes only when measured or evidence-backed NOT COMPARABLE.

## P0399 — FINAL/MEDIUM/3-Sprue/WARM_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0399` completes only when measured or evidence-backed NOT COMPARABLE.

## P0400 — FINAL/MEDIUM/3-Sprue/WARM_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0400` completes only when measured or evidence-backed NOT COMPARABLE.

## P0401 — FINAL/MEDIUM/3-Sprue/MAIN/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0401` completes only when measured or evidence-backed NOT COMPARABLE.

## P0402 — FINAL/MEDIUM/3-Sprue/MAIN/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0402` completes only when measured or evidence-backed NOT COMPARABLE.

## P0403 — FINAL/MEDIUM/3-Sprue/ENTRY/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0403` completes only when measured or evidence-backed NOT COMPARABLE.

## P0404 — FINAL/MEDIUM/3-Sprue/ENTRY/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0404` completes only when measured or evidence-backed NOT COMPARABLE.

## P0405 — FINAL/MEDIUM/3-Sprue/B3/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0405` completes only when measured or evidence-backed NOT COMPARABLE.

## P0406 — FINAL/MEDIUM/3-Sprue/B3/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0406` completes only when measured or evidence-backed NOT COMPARABLE.

## P0407 — FINAL/MEDIUM/3-Sprue/B20/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0407` completes only when measured or evidence-backed NOT COMPARABLE.

## P0408 — FINAL/MEDIUM/3-Sprue/B20/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: MEDIUM, 2k–5k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=3; n>=20; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0408` completes only when measured or evidence-backed NOT COMPARABLE.

## P0409 — FINAL/LARGE/1-Sprue/COLD_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0409` completes only when measured or evidence-backed NOT COMPARABLE.

## P0410 — FINAL/LARGE/1-Sprue/COLD_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0410` completes only when measured or evidence-backed NOT COMPARABLE.

## P0411 — FINAL/LARGE/1-Sprue/WARM_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0411` completes only when measured or evidence-backed NOT COMPARABLE.

## P0412 — FINAL/LARGE/1-Sprue/WARM_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0412` completes only when measured or evidence-backed NOT COMPARABLE.

## P0413 — FINAL/LARGE/1-Sprue/MAIN/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0413` completes only when measured or evidence-backed NOT COMPARABLE.

## P0414 — FINAL/LARGE/1-Sprue/MAIN/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0414` completes only when measured or evidence-backed NOT COMPARABLE.

## P0415 — FINAL/LARGE/1-Sprue/ENTRY/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0415` completes only when measured or evidence-backed NOT COMPARABLE.

## P0416 — FINAL/LARGE/1-Sprue/ENTRY/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0416` completes only when measured or evidence-backed NOT COMPARABLE.

## P0417 — FINAL/LARGE/1-Sprue/B3/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0417` completes only when measured or evidence-backed NOT COMPARABLE.

## P0418 — FINAL/LARGE/1-Sprue/B3/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0418` completes only when measured or evidence-backed NOT COMPARABLE.

## P0419 — FINAL/LARGE/1-Sprue/B20/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0419` completes only when measured or evidence-backed NOT COMPARABLE.

## P0420 — FINAL/LARGE/1-Sprue/B20/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `1`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0420` completes only when measured or evidence-backed NOT COMPARABLE.

## P0421 — FINAL/LARGE/3-Sprue/COLD_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0421` completes only when measured or evidence-backed NOT COMPARABLE.

## P0422 — FINAL/LARGE/3-Sprue/COLD_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: cold Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0422` completes only when measured or evidence-backed NOT COMPARABLE.

## P0423 — FINAL/LARGE/3-Sprue/WARM_CREATE/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0423` completes only when measured or evidence-backed NOT COMPARABLE.

## P0424 — FINAL/LARGE/3-Sprue/WARM_CREATE/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: warm Create; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0424` completes only when measured or evidence-backed NOT COMPARABLE.

## P0425 — FINAL/LARGE/3-Sprue/MAIN/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0425` completes only when measured or evidence-backed NOT COMPARABLE.

## P0426 — FINAL/LARGE/3-Sprue/MAIN/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: main resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0426` completes only when measured or evidence-backed NOT COMPARABLE.

## P0427 — FINAL/LARGE/3-Sprue/ENTRY/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0427` completes only when measured or evidence-backed NOT COMPARABLE.

## P0428 — FINAL/LARGE/3-Sprue/ENTRY/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: entry resize; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0428` completes only when measured or evidence-backed NOT COMPARABLE.

## P0429 — FINAL/LARGE/3-Sprue/B3/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0429` completes only when measured or evidence-backed NOT COMPARABLE.

## P0430 — FINAL/LARGE/3-Sprue/B3/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 3-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0430` completes only when measured or evidence-backed NOT COMPARABLE.

## P0431 — FINAL/LARGE/3-Sprue/B20/Class-A
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `acceptance/pending`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=5; n>=50; record min/p50/p95/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0431` completes only when measured or evidence-backed NOT COMPARABLE.

## P0432 — FINAL/LARGE/3-Sprue/B20/Class-B
SHA: `FINAL_EXECUTION_13_SHA`.
Fixture: LARGE, 10k–25k triangles, deterministic/watertight.
Scenario: 20-edit burst; Sprue count `3`; latency class `final manufacturing completion`.
Correctness gate: valid placement + current result requirements must pass before timing.
Warmup >=2; n>=10; p95 only if n>=20; otherwise min/p50/max.
Record dispatch/Worker/history/stale-commit counters where observable.
Record exact OS/CPU/RAM/Node/npm/Chromium/Playwright/build mode.
Historical adapter may map APIs only; never copy final fixes into baseline.
If equivalent semantics are impossible, record `NOT COMPARABLE` with exact evidence.
`P0432` completes only when measured or evidence-backed NOT COMPARABLE.

# 34. Structural Invariants

## S01 — pointer RAF
Scenario: many pointer events.
Hard invariant: expensive placement updates <=1.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S01` PASS requires direct observation.

## S02 — burst dispatch
Scenario: 20 intents.
Hard invariant: dispatch delta <=2.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S02` PASS requires direct observation.

## S03 — failed burst
Scenario: final failure.
Hard invariant: history delta 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S03` PASS requires direct observation.

## S04 — success burst
Scenario: final success.
Hard invariant: history delta 1.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S04` PASS requires direct observation.

## S05 — stale success
Scenario: late success.
Hard invariant: authoritative commits 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S05` PASS requires direct observation.

## S06 — stale failure
Scenario: late failure.
Hard invariant: newer-owned writes 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S06` PASS requires direct observation.

## S07 — stale progress
Scenario: late progress.
Hard invariant: newer-owned progress writes 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S07` PASS requires direct observation.

## S08 — teardown
Scenario: active+pending then upstream edit.
Hard invariant: obsolete queued starts 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S08` PASS requires direct observation.

## S09 — edge cache
Scenario: warm reactivation.
Hard invariant: new EdgesGeometry 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S09` PASS requires direct observation.

## S10 — reference mold
Scenario: pending profile metadata.
Hard invariant: full geometry rebuild delta 0.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S10` PASS requires direct observation.

## S11 — Worker reuse
Scenario: normal owner lifecycle.
Hard invariant: Worker creation bounded by owner lifetime.
Capture pre/post operation-scoped counter.
Do not infer from cumulative totals.
Keep instrumentation test/benchmark-only.
Record in Performance report.
`S11` PASS requires direct observation.

# 35. Mutation-Sensitivity Matrix

## U01 — scheduler teardown
Temporary mutation: remove one invalidation teardown.
Expected detector: upstream test.
Use external temporary worktree only.
Run detector and confirm intended failure.
Record command/test/failure.
Revert mutation and verify candidate SHA restored.
Never commit mutation.
`U01` PASS proves detector sensitivity.

## U02 — stale gate
Temporary mutation: remove one currentness gate.
Expected detector: stale channel test.
Use external temporary worktree only.
Run detector and confirm intended failure.
Record command/test/failure.
Revert mutation and verify candidate SHA restored.
Never commit mutation.
`U02` PASS proves detector sensitivity.

## U03 — busy reject
Temporary mutation: restore busy rejection.
Expected detector: latest-wins test.
Use external temporary worktree only.
Run detector and confirm intended failure.
Record command/test/failure.
Revert mutation and verify candidate SHA restored.
Never commit mutation.
`U03` PASS proves detector sensitivity.

## U04 — history
Temporary mutation: push superseded intents.
Expected detector: history test.
Use external temporary worktree only.
Run detector and confirm intended failure.
Record command/test/failure.
Revert mutation and verify candidate SHA restored.
Never commit mutation.
`U04` PASS proves detector sensitivity.

## U05 — dispatch
Temporary mutation: dispatch all burst intents.
Expected detector: structural dispatch test.
Use external temporary worktree only.
Run detector and confirm intended failure.
Record command/test/failure.
Revert mutation and verify candidate SHA restored.
Never commit mutation.
`U05` PASS proves detector sensitivity.

## U06 — artifact
Temporary mutation: ship E2E harness in production.
Expected detector: artifact verifier.
Use external temporary worktree only.
Run detector and confirm intended failure.
Record command/test/failure.
Revert mutation and verify candidate SHA restored.
Never commit mutation.
`U06` PASS proves detector sensitivity.

# 36. Final Checklist

- [ ] C001 — Git root resolved.
- [ ] C002 — No nested repo.
- [ ] C003 — Exact start SHA recorded.
- [ ] C004 — Red CI diagnosis recorded.
- [ ] C005 — Mock type erasure fixed.
- [ ] C006 — Cavity Worker envelope fixed.
- [ ] C007 — Node scan moved to scripts.
- [ ] C008 — Architecture script added.
- [ ] C009 — Package architecture script added.
- [ ] C010 — CI architecture step added.
- [ ] C011 — tsconfig.app remains browser-only.
- [ ] C012 — No partial SprueDefinition casts.
- [ ] C013 — Dispatch arithmetic fixed.
- [ ] C014 — Architecture guard passes.
- [ ] C015 — Typecheck passes.
- [ ] C016 — Execution 12 targeted suites run.
- [ ] C017 — Upstream matrix active-only passes.
- [ ] C018 — Upstream matrix active+pending passes.
- [ ] C019 — Stale success inert.
- [ ] C020 — Stale failure inert.
- [ ] C021 — Stale progress inert.
- [ ] C022 — Ghost generating impossible.
- [ ] C023 — Obsolete queued starts zero.
- [ ] C024 — First Create failure atomic.
- [ ] C025 — First Create retry.
- [ ] C026 — Main failure atomic.
- [ ] C027 — Main retry.
- [ ] C028 — Entry failure atomic.
- [ ] C029 — Entry retry.
- [ ] C030 — Move failure atomic.
- [ ] C031 — Move retry.
- [ ] C032 — Registration-stage failure atomic.
- [ ] C033 — Failed final burst atomic.
- [ ] C034 — Failed burst history zero.
- [ ] C035 — Successful burst history one.
- [ ] C036 — Fresh history base after failure.
- [ ] C037 — Runner risk behavior test.
- [ ] C038 — Runner production boundary guard.
- [ ] C039 — Persistent Worker reuse.
- [ ] C040 — Browser app smoke.
- [ ] C041 — Browser Cavity real Boolean.
- [ ] C042 — Browser Sprue cache.
- [ ] C043 — Browser store Create.
- [ ] C044 — Browser store main.
- [ ] C045 — Browser store entry.
- [ ] C046 — Browser main pending.
- [ ] C047 — Browser entry pending.
- [ ] C048 — Browser burst dispatch direct <=2.
- [ ] C049 — Browser burst history direct =1.
- [ ] C050 — Browser final latest value.
- [ ] C051 — Browser Registration current.
- [ ] C052 — Browser result fingerprint current.
- [ ] C053 — Browser page errors zero.
- [ ] C054 — Browser console errors zero.
- [ ] C055 — Benchmark runner exists.
- [ ] C056 — Benchmark probe E2E-only.
- [ ] C057 — 081 ref attempted.
- [ ] C058 — 042 ref attempted.
- [ ] C059 — 6ae ref attempted.
- [ ] C060 — 57b ref attempted.
- [ ] C061 — 456 ref attempted.
- [ ] C062 — Final candidate measured.
- [ ] C063 — Small 1 Sprue.
- [ ] C064 — Small 3 Sprues.
- [ ] C065 — Medium 1 Sprue.
- [ ] C066 — Medium 3 Sprues.
- [ ] C067 — Large 1 Sprue.
- [ ] C068 — Large 3 Sprues.
- [ ] C069 — Cold Create.
- [ ] C070 — Warm Create.
- [ ] C071 — Main resize.
- [ ] C072 — Entry resize.
- [ ] C073 — 3-edit burst.
- [ ] C074 — 20-edit burst.
- [ ] C075 — Class A separated.
- [ ] C076 — Class B separated.
- [ ] C077 — min recorded.
- [ ] C078 — p50 recorded.
- [ ] C079 — p95 supported.
- [ ] C080 — max recorded.
- [ ] C081 — environment recorded.
- [ ] C082 — drift check.
- [ ] C083 — dispatch counter.
- [ ] C084 — Worker counter.
- [ ] C085 — history counter.
- [ ] C086 — stale commit zero.
- [ ] C087 — obsolete start zero.
- [ ] C088 — edge cache non-regression.
- [ ] C089 — reference mold non-regression.
- [ ] C090 — mutation teardown detected.
- [ ] C091 — mutation stale gate detected.
- [ ] C092 — mutation busy reject detected.
- [ ] C093 — mutation history detected.
- [ ] C094 — mutation dispatch detected.
- [ ] C095 — mutation artifact detected.
- [ ] C096 — temporary worktrees removed.
- [ ] C097 — npm ci.
- [ ] C098 — npm audit.
- [ ] C099 — moderate audit.
- [ ] C100 — architecture check final.
- [ ] C101 — typecheck final.
- [ ] C102 — lint final.
- [ ] C103 — production build.
- [ ] C104 — artifact verification.
- [ ] C105 — bundle budgets unchanged.
- [ ] C106 — Vitest full.
- [ ] C107 — E2E build.
- [ ] C108 — Playwright full.
- [ ] C109 — Python install.
- [ ] C110 — Ruff.
- [ ] C111 — Ruff format.
- [ ] C112 — pytest.
- [ ] C113 — git diff --check.
- [ ] C114 — no transient output.
- [ ] C115 — Execution 13 Report.
- [ ] C116 — Execution 13 Performance.
- [ ] C117 — all CLOSED have evidence.
- [ ] C118 — no invented benchmark.
- [ ] C119 — no unrelated feature.
- [ ] C120 — candidate frozen.
- [ ] C121 — user authorized push.
- [ ] C122 — exact pushed SHA.
- [ ] C123 — exact SHA CI.
- [ ] C124 — remote Frontend.
- [ ] C125 — remote Browser.
- [ ] C126 — remote Python.
- [ ] C127 — remote repo integrity.
- [ ] C128 — remote Quality Gate.
- [ ] C129 — Dependency Review correct.
- [ ] C130 — remote architecture guard ran.
- [ ] C131 — remote moderate audit ran.
- [ ] C132 — remote typecheck/lint/build/tests ran.
- [ ] C133 — remote strengthened browser proof ran.
- [ ] C134 — remote Cavity proof ran.
- [ ] C135 — remote Python full suite ran.
- [ ] C136 — final diff review.
- [ ] C137 — final adversarial review.
- [ ] C138 — no mandatory open item.

# 37. Final Adversarial Review

## Q01
Mold Scale ghost busy?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q02
Old pending start after topology replacement?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q03
Stale success commit?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q04
Stale failure clobber?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q05
Stale progress clobber?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q06
Current failure leaves Registration generating?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q07
Current failure mismatches result/document?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q08
Failed first Create leaves fake manufacturing truth?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q09
Failed resize enters history?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q10
Successful burst creates >1 history entry?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q11
Undo/Redo resurrects pending work?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q12
Model/orientation replacement accepts old work?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q13
Segmentation promotion mixes revisions?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q14
Cavity failure clobbers newer Sprue?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q15
Second production store can share default runner undetected?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q16
Browser latest-wins bypasses production store?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q17
Burst dispatch still cumulative?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q18
Burst history still cumulative?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q19
Pending main unproven?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q20
Pending entry unproven?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q21
Historical workload not equivalent?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q22
p95 under-sampled?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q23
Production ships test harness?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q24
Bundle threshold raised?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q25
Security severity lowered?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q26
Mandatory test skipped?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q27
Production edit without failing proof?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

## Q28
Temporary mutation remains?
Required final answer: NO, or explicit repository-backed intentional exception.
Evidence must name exact final file/test/log.
Uncertainty reopens owning phase.

# 38. Final Output Protocol

At partial completion:

```text
PARTIALLY COMPLETE
Open mandatory items:
```

At local completion:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

Only after exact-final-SHA remote green and final adversarial review:

```text
REMOTE VERIFIED COMPLETE — EXECUTION 13 FINAL SPRUE CLOSURE
```

Then stop.

Do not propose Execution 14.

---

# 39. Proof Ledger — Mandatory Mechanical Verification Rows

- [ ] LEDGER-0001 — During `red-baseline repair`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0002 — During `red-baseline repair`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0003 — During `red-baseline repair`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0004 — During `red-baseline repair`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0005 — During `red-baseline repair`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0006 — During `red-baseline repair`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0007 — During `red-baseline repair`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0008 — During `red-baseline repair`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0009 — During `red-baseline repair`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0010 — During `red-baseline repair`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0011 — During `red-baseline repair`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0012 — During `red-baseline repair`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0013 — During `red-baseline repair`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0014 — During `red-baseline repair`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0015 — During `red-baseline repair`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0016 — During `red-baseline repair`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0017 — During `red-baseline repair`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0018 — During `red-baseline repair`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0019 — During `red-baseline repair`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0020 — During `red-baseline repair`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0021 — During `red-baseline repair`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0022 — During `red-baseline repair`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0023 — During `red-baseline repair`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0024 — During `red-baseline repair`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0025 — During `red-baseline repair`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0026 — During `red-baseline repair`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0027 — During `upstream matrix`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0028 — During `upstream matrix`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0029 — During `upstream matrix`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0030 — During `upstream matrix`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0031 — During `upstream matrix`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0032 — During `upstream matrix`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0033 — During `upstream matrix`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0034 — During `upstream matrix`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0035 — During `upstream matrix`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0036 — During `upstream matrix`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0037 — During `upstream matrix`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0038 — During `upstream matrix`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0039 — During `upstream matrix`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0040 — During `upstream matrix`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0041 — During `upstream matrix`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0042 — During `upstream matrix`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0043 — During `upstream matrix`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0044 — During `upstream matrix`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0045 — During `upstream matrix`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0046 — During `upstream matrix`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0047 — During `upstream matrix`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0048 — During `upstream matrix`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0049 — During `upstream matrix`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0050 — During `upstream matrix`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0051 — During `upstream matrix`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0052 — During `upstream matrix`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0053 — During `failure atomicity`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0054 — During `failure atomicity`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0055 — During `failure atomicity`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0056 — During `failure atomicity`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0057 — During `failure atomicity`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0058 — During `failure atomicity`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0059 — During `failure atomicity`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0060 — During `failure atomicity`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0061 — During `failure atomicity`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0062 — During `failure atomicity`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0063 — During `failure atomicity`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0064 — During `failure atomicity`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0065 — During `failure atomicity`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0066 — During `failure atomicity`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0067 — During `failure atomicity`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0068 — During `failure atomicity`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0069 — During `failure atomicity`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0070 — During `failure atomicity`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0071 — During `failure atomicity`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0072 — During `failure atomicity`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0073 — During `failure atomicity`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0074 — During `failure atomicity`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0075 — During `failure atomicity`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0076 — During `failure atomicity`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0077 — During `failure atomicity`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0078 — During `failure atomicity`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0079 — During `runner ownership`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0080 — During `runner ownership`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0081 — During `runner ownership`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0082 — During `runner ownership`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0083 — During `runner ownership`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0084 — During `runner ownership`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0085 — During `runner ownership`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0086 — During `runner ownership`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0087 — During `runner ownership`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0088 — During `runner ownership`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0089 — During `runner ownership`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0090 — During `runner ownership`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0091 — During `runner ownership`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0092 — During `runner ownership`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0093 — During `runner ownership`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0094 — During `runner ownership`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0095 — During `runner ownership`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0096 — During `runner ownership`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0097 — During `runner ownership`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0098 — During `runner ownership`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0099 — During `runner ownership`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0100 — During `runner ownership`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0101 — During `runner ownership`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0102 — During `runner ownership`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0103 — During `runner ownership`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0104 — During `runner ownership`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0105 — During `browser lifecycle`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0106 — During `browser lifecycle`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0107 — During `browser lifecycle`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0108 — During `browser lifecycle`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0109 — During `browser lifecycle`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0110 — During `browser lifecycle`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0111 — During `browser lifecycle`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0112 — During `browser lifecycle`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0113 — During `browser lifecycle`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0114 — During `browser lifecycle`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0115 — During `browser lifecycle`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0116 — During `browser lifecycle`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0117 — During `browser lifecycle`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0118 — During `browser lifecycle`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0119 — During `browser lifecycle`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0120 — During `browser lifecycle`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0121 — During `browser lifecycle`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0122 — During `browser lifecycle`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0123 — During `browser lifecycle`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0124 — During `browser lifecycle`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0125 — During `browser lifecycle`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0126 — During `browser lifecycle`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0127 — During `browser lifecycle`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0128 — During `browser lifecycle`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0129 — During `browser lifecycle`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0130 — During `browser lifecycle`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0131 — During `performance`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0132 — During `performance`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0133 — During `performance`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0134 — During `performance`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0135 — During `performance`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0136 — During `performance`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0137 — During `performance`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0138 — During `performance`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0139 — During `performance`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0140 — During `performance`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0141 — During `performance`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0142 — During `performance`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0143 — During `performance`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0144 — During `performance`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0145 — During `performance`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0146 — During `performance`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0147 — During `performance`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0148 — During `performance`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0149 — During `performance`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0150 — During `performance`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0151 — During `performance`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0152 — During `performance`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0153 — During `performance`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0154 — During `performance`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0155 — During `performance`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0156 — During `performance`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0157 — During `mutation sensitivity`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0158 — During `mutation sensitivity`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0159 — During `mutation sensitivity`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0160 — During `mutation sensitivity`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0161 — During `mutation sensitivity`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0162 — During `mutation sensitivity`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0163 — During `mutation sensitivity`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0164 — During `mutation sensitivity`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0165 — During `mutation sensitivity`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0166 — During `mutation sensitivity`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0167 — During `mutation sensitivity`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0168 — During `mutation sensitivity`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0169 — During `mutation sensitivity`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0170 — During `mutation sensitivity`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0171 — During `mutation sensitivity`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0172 — During `mutation sensitivity`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0173 — During `mutation sensitivity`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0174 — During `mutation sensitivity`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0175 — During `mutation sensitivity`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0176 — During `mutation sensitivity`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0177 — During `mutation sensitivity`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0178 — During `mutation sensitivity`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0179 — During `mutation sensitivity`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0180 — During `mutation sensitivity`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0181 — During `mutation sensitivity`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0182 — During `mutation sensitivity`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0183 — During `full harness`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0184 — During `full harness`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0185 — During `full harness`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0186 — During `full harness`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0187 — During `full harness`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0188 — During `full harness`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0189 — During `full harness`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0190 — During `full harness`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0191 — During `full harness`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0192 — During `full harness`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0193 — During `full harness`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0194 — During `full harness`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0195 — During `full harness`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0196 — During `full harness`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0197 — During `full harness`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0198 — During `full harness`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0199 — During `full harness`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0200 — During `full harness`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0201 — During `full harness`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0202 — During `full harness`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0203 — During `full harness`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0204 — During `full harness`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0205 — During `full harness`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0206 — During `full harness`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0207 — During `full harness`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0208 — During `full harness`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0209 — During `reporting`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0210 — During `reporting`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0211 — During `reporting`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0212 — During `reporting`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0213 — During `reporting`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0214 — During `reporting`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0215 — During `reporting`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0216 — During `reporting`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0217 — During `reporting`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0218 — During `reporting`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0219 — During `reporting`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0220 — During `reporting`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0221 — During `reporting`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0222 — During `reporting`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0223 — During `reporting`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0224 — During `reporting`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0225 — During `reporting`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0226 — During `reporting`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0227 — During `reporting`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0228 — During `reporting`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0229 — During `reporting`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0230 — During `reporting`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0231 — During `reporting`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0232 — During `reporting`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0233 — During `reporting`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0234 — During `reporting`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0235 — During `remote verification`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0236 — During `remote verification`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0237 — During `remote verification`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0238 — During `remote verification`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0239 — During `remote verification`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0240 — During `remote verification`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0241 — During `remote verification`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0242 — During `remote verification`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0243 — During `remote verification`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0244 — During `remote verification`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0245 — During `remote verification`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0246 — During `remote verification`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0247 — During `remote verification`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0248 — During `remote verification`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0249 — During `remote verification`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0250 — During `remote verification`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0251 — During `remote verification`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0252 — During `remote verification`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0253 — During `remote verification`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0254 — During `remote verification`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0255 — During `remote verification`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0256 — During `remote verification`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0257 — During `remote verification`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0258 — During `remote verification`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0259 — During `remote verification`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0260 — During `remote verification`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0261 — During `red-baseline repair`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0262 — During `red-baseline repair`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0263 — During `red-baseline repair`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0264 — During `red-baseline repair`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0265 — During `red-baseline repair`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0266 — During `red-baseline repair`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0267 — During `red-baseline repair`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0268 — During `red-baseline repair`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0269 — During `red-baseline repair`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0270 — During `red-baseline repair`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0271 — During `red-baseline repair`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0272 — During `red-baseline repair`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0273 — During `red-baseline repair`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0274 — During `red-baseline repair`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0275 — During `red-baseline repair`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0276 — During `red-baseline repair`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0277 — During `red-baseline repair`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0278 — During `red-baseline repair`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0279 — During `red-baseline repair`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0280 — During `red-baseline repair`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0281 — During `red-baseline repair`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0282 — During `red-baseline repair`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0283 — During `red-baseline repair`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0284 — During `red-baseline repair`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0285 — During `red-baseline repair`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0286 — During `red-baseline repair`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0287 — During `upstream matrix`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0288 — During `upstream matrix`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0289 — During `upstream matrix`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0290 — During `upstream matrix`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0291 — During `upstream matrix`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0292 — During `upstream matrix`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0293 — During `upstream matrix`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0294 — During `upstream matrix`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0295 — During `upstream matrix`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0296 — During `upstream matrix`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0297 — During `upstream matrix`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0298 — During `upstream matrix`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0299 — During `upstream matrix`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0300 — During `upstream matrix`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0301 — During `upstream matrix`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0302 — During `upstream matrix`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0303 — During `upstream matrix`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0304 — During `upstream matrix`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0305 — During `upstream matrix`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0306 — During `upstream matrix`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0307 — During `upstream matrix`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0308 — During `upstream matrix`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0309 — During `upstream matrix`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0310 — During `upstream matrix`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0311 — During `upstream matrix`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0312 — During `upstream matrix`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0313 — During `failure atomicity`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0314 — During `failure atomicity`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0315 — During `failure atomicity`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0316 — During `failure atomicity`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0317 — During `failure atomicity`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0318 — During `failure atomicity`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0319 — During `failure atomicity`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0320 — During `failure atomicity`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0321 — During `failure atomicity`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0322 — During `failure atomicity`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0323 — During `failure atomicity`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0324 — During `failure atomicity`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0325 — During `failure atomicity`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0326 — During `failure atomicity`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0327 — During `failure atomicity`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0328 — During `failure atomicity`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0329 — During `failure atomicity`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0330 — During `failure atomicity`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0331 — During `failure atomicity`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0332 — During `failure atomicity`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0333 — During `failure atomicity`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0334 — During `failure atomicity`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0335 — During `failure atomicity`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0336 — During `failure atomicity`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0337 — During `failure atomicity`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0338 — During `failure atomicity`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0339 — During `runner ownership`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0340 — During `runner ownership`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0341 — During `runner ownership`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0342 — During `runner ownership`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0343 — During `runner ownership`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0344 — During `runner ownership`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0345 — During `runner ownership`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0346 — During `runner ownership`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0347 — During `runner ownership`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0348 — During `runner ownership`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0349 — During `runner ownership`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0350 — During `runner ownership`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0351 — During `runner ownership`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0352 — During `runner ownership`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0353 — During `runner ownership`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0354 — During `runner ownership`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0355 — During `runner ownership`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0356 — During `runner ownership`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0357 — During `runner ownership`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0358 — During `runner ownership`, verify `Redo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0359 — During `runner ownership`, verify `browser proof exercises claimed owner` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0360 — During `runner ownership`, verify `benchmark sample correctness-valid` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0361 — During `runner ownership`, verify `production excludes harness` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0362 — During `runner ownership`, verify `security moderate` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0363 — During `runner ownership`, verify `bundle budget unchanged` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0364 — During `runner ownership`, verify `remote evidence exact-SHA` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0365 — During `browser lifecycle`, verify `document identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0366 — During `browser lifecycle`, verify `evaluation request identity current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0367 — During `browser lifecycle`, verify `Registration current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0368 — During `browser lifecycle`, verify `lastCommittedResult current` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0369 — During `browser lifecycle`, verify `stale success inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0370 — During `browser lifecycle`, verify `stale failure inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0371 — During `browser lifecycle`, verify `stale progress inert` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0372 — During `browser lifecycle`, verify `failed intent absent from history` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0373 — During `browser lifecycle`, verify `successful burst one history transaction` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0374 — During `browser lifecycle`, verify `pending intent not manufacturing truth` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0375 — During `browser lifecycle`, verify `presentation not authoritative input` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0376 — During `browser lifecycle`, verify `Worker lifetime bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0377 — During `browser lifecycle`, verify `latest-wins bounded` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0378 — During `browser lifecycle`, verify `Cavity coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0379 — During `browser lifecycle`, verify `Sprue geometry coherent` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0380 — During `browser lifecycle`, verify `Segmentation cannot resurrect old Sprue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0381 — During `browser lifecycle`, verify `Mold Scale no ghost busy` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0382 — During `browser lifecycle`, verify `Cut by Face no obsolete queue` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
- [ ] LEDGER-0383 — During `browser lifecycle`, verify `Undo no resurrection` with an exact file/test/command result; if evidence is absent mark OPEN rather than infer.
