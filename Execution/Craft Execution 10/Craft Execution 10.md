# Craft — Execution 10
## Sprue Lifecycle Closure — Cross-System Scheduler Invalidation, Atomic Failure Rollback, Real Browser Interaction Proof, Historical Performance Evidence, and Remote Exact-SHA Verification

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 10/`  
**Observed repository head while authoring this execution:** `main` at `042d4011a77c2f7ceb3813def23a97da59dd961f`  
**Observed exact-head CI while authoring:** GitHub Actions `Continuous Integration` run `34336467798` — `success` on the exact observed SHA  
**Execution 09 baseline:** `081ef3a94db3dd3f7d58e3283d5a238603e4655c`  
**Execution type:** narrow corrective closure of residual Execution 09 defects and missing evidence  
**Primary subsystem:** Sprue / Funnel lifecycle and derived-mold evaluation ownership  
**Coupled systems that MUST be treated as one system:** SplitFace state, MoldDocument identity, derived evaluation scheduler, persistent Worker, Manifold/WASM, Cavity, Registration, Mold Scale, Cut by Face, Segmentation handoff, Reference Mold presentation, Undo/Redo, Three.js viewport presentation, Playwright harness, performance harness, npm security gate, and GitHub Actions.  
**Non-goal:** new product functionality.  
**Doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline.  
**Hard rule:** repository evidence is authoritative. Re-audit current `main` before editing. Never assume this authoring SHA is still current.

---

# 0. Why Execution 10 Exists

Execution 09 materially improved Sprue interaction and is remotely green, but a post-execution adversarial audit found that the execution is not closed under its own Definition of Done.

Execution 09 successfully delivered:

```text
valid newer Sprue intent is accepted while older evaluation runs
bounded latest-wins scheduling exists
one active evaluation + one latest pending snapshot
stale success cannot commit
stale failure cannot overwrite current pending state
pending profile/position beats stale resolved presentation
rapid bursts coalesce into one final history entry
persistent Worker reuse remains
per-Sprue cache reuse is materially stronger
Sprue glass EdgesGeometry is cached by BufferGeometry identity
Reference Mold optimization is fail-safe when geometry identity is not trustworthy
Vitest moderate advisory was upgraded away
npm audit currently reports 0 vulnerabilities
current exact SHA is remotely green
```

Those are real improvements and MUST NOT be casually rewritten.

However, the live repository audit found four classes of residual work:

```text
1. cross-system Sprue scheduler cancellation is incomplete
2. current Sprue failure rollback is not a coherent whole-state rollback
3. the browser Sprue proof tests cache behavior but not the required production store lifecycle
4. the required before/after small-medium-large latency evidence was never produced
```

A fifth architecture question also remains:

```text
the store scheduler is per-store,
but the default production derived-evaluation runner is module-global;
prove whether multiple live stores can interfere through that shared runner,
and repair only if the production topology makes that risk real
```

Execution 10 exists only to close these residuals.

Do not reopen already-closed work without a new failing test or repository evidence.

---

# 1. Starting Repository Evidence

At authoring time, `main` is:

```text
042d4011a77c2f7ceb3813def23a97da59dd961f
```

Execution 09 changed exactly one commit from:

```text
081ef3a94db3dd3f7d58e3283d5a238603e4655c
```

to:

```text
042d4011a77c2f7ceb3813def23a97da59dd961f
```

Current frontend package baseline includes:

```text
React 19.2.7
Vite 8.1.3
Three ^0.185.1
Manifold ^3.5.1
Zustand 5.0.14
Vitest 4.1.11
Playwright ^1.63.0
```

Current frontend scripts include:

```text
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run build:e2e
npm run e2e
```

Current production build already includes:

```text
verifyProductionArtifact.mjs
checkBundleBudget.mjs
```

Current E2E build already includes:

```text
verifyE2eArtifact.mjs
```

Current CI already has:

```text
Python quality
Frontend quality
Browser smoke
Repository integrity
Dependency review
explicit Quality Gate result matrix
```

Observed exact-head remote baseline while authoring:

```text
Vitest: 1106 passed, 5 skipped
Playwright: 3 passed
Python: 357 passed
npm install/audit in browser job: 0 vulnerabilities
exact pushed SHA: 042d4011...
```

These numbers are starting references only.

Re-measure after edits.

---

# 2. Residual Gap Ledger

Execution 10 is complete only if every mandatory gap is closed with direct evidence.

## Gap A — Cross-System Scheduler Invalidation

The new Sprue scheduler is closure-owned and bounded, but not every upstream topology mutation currently clears that scheduler lifecycle.

Observed risk paths include code equivalent to:

```text
setClearanceMm
updateClearanceEdit
clearSelection
non-extension commitPlaneDrag
toggleFace
removeSplitFace
```

Some of these currently cancel only the underlying derived evaluation or mutate the MoldDocument without clearing all scheduler bookkeeping.

The dangerous sequence is:

```text
Sprue A running
→ upstream topology/scale edit happens
→ document changes
→ worker request becomes stale/cancelled
→ scheduler active/pending bookkeeping is not fully reset
→ stale completion drains no pending job
→ sprueStatus may remain "generating"
→ unrelated rebuild action can remain blocked by a ghost busy state
```

Required closure:

```text
any authoritative non-Sprue mutation that invalidates the current Sprue evaluation
→ active Sprue result becomes non-committable immediately
→ pendingLatest is cleared
→ history base is cleared
→ sprueStatus becomes truthful terminal/idle state
→ no queued old job can start against the new document
→ stale worker completion writes nothing
```

## Gap B — Current Failure Rollback Is Not Whole-State Coherent

Current Execution 09 failure handling marks Sprue definitions invalid and sets:

```text
sprueStatus = idle
evaluation.phase = failed
error = message
```

but the accepted request had already moved Registration to a new generating revision.

Therefore a current failure can leave a contradictory cluster similar to:

```text
evaluation = failed
sprueStatus = idle
registration = generating
```

The old committed result also no longer matches the new failed document identity, while presentation continuity ends after `evaluation.phase` leaves `evaluating`.

Required closure:

```text
current final Sprue failure
→ no provisional manufacturing state survives
→ previous valid derived result remains coherent if one existed
→ Registration is not left "generating"
→ MoldDocument / evaluation / lastCommittedResult relationship is truthful
→ viewport bodies follow the chosen rollback policy consistently
→ failure remains visible to the user
→ no history entry is created for the failed burst
→ next valid Sprue edit is immediately allowed
```

Execution 10 MUST choose and document one failure policy.

Preferred policy:

```text
ATOMIC SPRUE-CYCLE ROLLBACK
```

Meaning:

```text
restore the pre-burst Sprue-owned authoritative cluster
preserve unrelated user state
surface the failure through the existing error/failure channel
do not leave failed provisional intent pretending to be the current manufacturing document
```

Do not blindly restore an entire generic UI snapshot if doing so can overwrite unrelated body visibility or unrelated interaction state.

## Gap C — Browser Proof Is Misnamed / Incomplete

The current browser Sprue spec proves real Chromium + Manifold cache behavior, but it directly runs repeated `evaluateDerivedMold(...)` calls.

It does not prove:

```text
createSprue immediate acceptance through the production store
resizeSprue upper/main diameter through the production store
resizeSprueEntryNeck lower diameter through the production store
latest-wins burst through acceptSprueIntent
scheduler dispatch bound in real Chromium
history behavior in real Chromium
cross-system invalidation while a real Worker request is active
```

Required closure:

```text
keep the existing cache proof
add real browser lifecycle proof through the actual production store actions
```

## Gap D — Required Performance Evidence Is Missing

Execution 09 required actual before/after measurements.

The final report only contains structural counts.

Required closure:

```text
historical baseline
final candidate
same machine
same browser/runtime conditions
small / medium / large deterministic fixtures
1 Sprue / 3 Sprues
interaction acceptance latency
authoritative completion latency
p50 / p95 where sample size makes p95 meaningful
min / max
repeat count
structural counts
```

Do not claim the Manifold Boolean kernel became faster unless the measurements prove that.

## Gap E — Production Runner Ownership Must Be Proven

The SplitFace scheduler is per-store.

The default `runDerivedMoldEvaluation` runner is currently module-level and maintains one active cancellation callback.

Possible architecture risk:

```text
store A uses default production runner
store B uses the same default production runner
A starts evaluation
B starts evaluation
runner-level cancelActive may cancel A
```

This is not yet a confirmed production bug.

Execution 10 must inspect all production store-instance creation paths and prove whether more than one live store can use the default shared runner concurrently.

If production has only one live owner:

```text
document the proof
add a regression assertion where practical
do not redesign the runner unnecessarily
```

If production can have multiple simultaneous live stores:

```text
repair ownership narrowly
preserve persistent Worker reuse
do not introduce module-global cross-store cancellation
```

## Gap F — Final Report Evidence Integrity

The Execution 09 report contains at least one description that does not exactly match the current code.

Execution 10 final reporting must be generated from verified repository facts.

Required closure:

```text
every important claim names the concrete file/function/test/log evidence
no invented meshHash
no claim that a cancellation path exists if the code does not call it
no "CLOSED" row without a test or direct code proof
no REMOTE COMPLETE claim before exact-SHA GitHub Actions succeeds
```

---

# 3. System Promise — Mandatory Invariants

## Promise A — One Authoritative Sprue Intent

Do not add a second persistent Sprue state system.

The authoritative requested state remains in the current SplitFace/MoldDocument domain.

Scheduler bookkeeping is ephemeral only.

## Promise B — One Active + One Latest Pending

At any time:

```text
active derived Sprue evaluation <= 1
pending latest snapshot <= 1
```

For:

```text
A running
B arrives
C arrives
D arrives
```

expected:

```text
A may finish physically
B/C never need to execute
D is the single pending latest
A cannot commit
D runs next
```

## Promise C — Cancellation Is Not Correctness

The Worker may be inside synchronous WASM.

Correctness comes from:

```text
requestId
document revision
document fingerprint
current authoritative intent identity
```

not from hoping the Worker stops immediately.

## Promise D — Upstream Mutation Ends the Sprue Cycle

A non-Sprue authoritative edit that invalidates the document must not merely cancel the Worker promise.

It must terminate the scheduler cycle itself.

After the upstream mutation returns:

```text
no old pending job exists
no ghost busy state exists
old result cannot commit
```

## Promise E — Failure Is a Terminal Lifecycle Event

Current failure must leave a coherent state.

Forbidden:

```text
evaluation = failed
registration = generating
sprueStatus = generating
old document + new registration
new failed document + old committed bodies with no explicit policy
```

## Promise F — Pending Is Presentation, Not Manufacturing Truth

A valid accepted resize may be visible immediately.

It is not manufacturing truth until current successful derived evaluation commits.

## Promise G — Failed Burst Creates No Undo Step

A burst that never successfully commits must create:

```text
0 new history entries
```

## Promise H — Successful Burst Creates One Undo Step

A burst of many superseded intents that ends in one successful final commit must create:

```text
exactly 1 history entry
```

## Promise I — Real Browser Proof Must Exercise the Real Coordinator

A browser test that directly calls:

```text
evaluateDerivedMold()
```

does not prove the latest-wins coordinator.

The new lifecycle proof must call actual production actions such as:

```text
createSprue
resizeSprue
resizeSprueEntryNeck
moveSprue
```

through a real SplitFace store using the real production Worker path.

## Promise J — Test Instrumentation May Observe, Not Replace

Allowed in browser harness:

```text
thin wrapper that counts calls and delegates to the real production runner
performance.now() measurement
state subscriptions
deterministic fixture generation
```

Forbidden:

```text
mocking Manifold
mocking the Worker result
fake Sprue geometry
reimplementing SprueGenerationService
Node-only substitute for browser Worker
sleep-based race manufacturing
```

---

# 4. Execution Method

Use this order:

```text
Phase 0  — exact-head re-audit
Phase 1  — reproduce residual lifecycle defects before implementation
Phase 2  — cross-system scheduler invalidation closure
Phase 3  — atomic current-failure rollback closure
Phase 4  — runner ownership/isolation proof
Phase 5  — browser production-store Sprue lifecycle proof
Phase 6  — historical and final performance measurement
Phase 7  — security and build regression sweep
Phase 8  — complete local harness
Phase 9  — user-authorized push only
Phase 10 — exact-SHA remote verification
Phase 11 — adversarial final re-audit
```

Do not jump directly into implementation.

---

# 5. Phase 0 — Exact-Head Re-Audit

Before editing:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
git fetch origin
git rev-parse origin/main
```

Expected authoring reference:

```text
042d4011a77c2f7ceb3813def23a97da59dd961f
```

If current `main` advanced:

```text
STOP using the old SHA as implementation truth.
Re-audit current files.
Do not reset.
Do not force.
Do not discard user work.
```

Record:

```text
actual starting SHA
branch
working tree status
latest exact-SHA CI conclusion
```

---

# 6. Phase 0.1 — Files to Read Before Editing

At minimum inspect current versions of:

```text
mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
mold/frontend/src/features/mold-generation/split-face/splitFace.sprueLatestWins.test.ts
mold/frontend/src/features/mold-generation/split-face/splitFace.spruePerformance.test.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.workerClient.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.worker.ts
mold/frontend/src/features/mold-generation/workflow/evaluateDerivedMold.ts
mold/frontend/src/features/mold-generation/registration/registrationLifecycle.ts
mold/frontend/src/features/viewport/runtime/spruePreview3dRuntime.ts
mold/frontend/src/features/viewport/runtime/referenceMoldBlock3dRuntime.ts
mold/frontend/e2e/sprueLatestWins.spec.ts
mold/frontend/src/test-harness/sprueLatestWinsProbe.ts
mold/frontend/e2e-harness.html
mold/frontend/playwright.config.ts
mold/frontend/package.json
mold/frontend/vite.config.ts
.github/workflows/ci.yml
```

Also locate every production call to:

```text
createSplitFaceStoreCreator
runDerivedMoldEvaluation
cancelDerivedMoldEvaluation
setClearanceMm
updateClearanceEdit
toggleFace
removeSplitFace
clearSelection
commitPlaneDrag
clearForOrientationChange
clearForModelReplacement
adoptCommittedSegmentationResult
promoteReplannedSegmentationResult
setCanonicalPartGeometrySignature
```

Do not rely on comments.

Trace actual callers.

---

# 7. Phase 1 — Reproduce Scheduler Ghost-Busy Before Fixing

Add a deterministic failing regression before implementation.

Use a controlled deferred derived-evaluation dependency.

Scenario:

```text
prepare committed mold
prepare cavity
prepare resolved Sprue
start Sprue resize A
confirm one evaluation is active
perform Mold Scale mutation
resolve/reject old A after scale mutation
```

Required after upstream mutation:

```text
sprueStatus === "idle"
scheduler pending count logically zero
no queued request starts
old request cannot commit
current document remains the scale-edited document
registration follows the scale invalidation policy
createMoldParts is not blocked by ghost Sprue busy state
```

The test must fail on the pre-fix current code if the audited defect still exists.

If it unexpectedly passes:

```text
re-audit the live implementation
find the actual path
do not implement a fix for a non-reproducible defect
```

---

# 8. Cross-System Mutation Matrix

Create table-driven tests for every mutation that can invalidate active Sprue work.

Mandatory matrix:

```text
Mold Scale:
  setClearanceMm
  begin/update/commit scale edit path

Cut by Face:
  toggleFace
  removeSplitFace
  clearSelection
  non-extension commitPlaneDrag
  removeSplitFaceAndRebuild

Model lifecycle:
  clearForOrientationChange
  clearForModelReplacement
  setCanonicalPartGeometrySignature

Segmentation/document replacement:
  adoptCommittedSegmentationResult
  promoteReplannedSegmentationResult

Undo/Redo:
  undo
  redo
```

For each path classify:

```text
A. must terminate Sprue scheduler cycle
B. intentionally does not invalidate Sprue scheduler
```

No unclassified path.

For every `A` path test:

```text
active request exists
optional pending latest exists
mutation occurs
active result later succeeds/fails
```

Expected:

```text
0 stale authoritative commits
0 queued old job starts after mutation
sprueStatus truthful
document identity stays with newer mutation
```

---

# 9. Phase 2 — Establish One Scheduler Teardown Owner

Do not scatter subtly different cleanup logic across many mutations.

Create or strengthen one narrow scheduler teardown owner inside `createSplitFaceStoreCreator`.

Conceptual responsibility:

```text
clear sprueActiveRequestId
clear spruePendingLatest
clear sprueHistoryBase
cancel current derived evaluation as resource optimization
```

Name may differ.

The code must make caller responsibility explicit.

A topology mutation also needs to leave store-visible state truthful.

Do not hide this requirement inside comments.

---

# 10. Scheduler Teardown State Contract

Immediately after a non-Sprue upstream invalidation:

```text
sprueStatus must not remain "generating"
```

If the mutation invalidates resolved Sprue geometry:

```text
sprues
sprueDefinitions validation
registration
lastCommittedResult
document
evaluation
```

must follow that mutation's existing domain policy.

Execution 10 is not permission to invent a universal “wipe everything” policy.

Preserve existing distinctions:

```text
some topology replacements preserve Sprue intent as pending
some destructive Cut-by-Face edits intentionally clear Sprue intent
```

Only fix execution lifecycle ownership.

---

# 11. Lifecycle Cleanup and Domain Invalidation Are Different

Keep concepts separate:

```text
scheduler cleanup:
  execution bookkeeping

domain invalidation:
  what authoritative Sprue intent/geometry survives topology change
```

One must not accidentally substitute for the other.

---

# 12. Do Not Use sprueStatus as the Scheduler Truth

`sprueStatus` is user-facing/store-visible state.

It must not become a second internal queue mechanism.

Ephemeral scheduler truth remains closure-owned.

After Execution 10, tests must enforce:

```text
ghost generating state cannot survive scheduler teardown
```

---

# 13. Stale Completion After Teardown

After upstream teardown, an old success must do:

```text
no document write
no sprue write
no registration write
no lastCommittedResult write
no history write
no status resurrection
no pending dispatch
```

An old failure must do:

```text
no error overwrite
no status overwrite
no evaluation overwrite
no pending dispatch
```

An old progress callback must do:

```text
no visible progress overwrite
```

---

# 14. Explicit Test — Scale During Active + Pending Burst

Mandatory regression:

```text
A active
B arrives -> pendingLatest
Mold Scale occurs before A returns
A returns
```

Expected:

```text
B never starts
A cannot commit
scale document survives
sprueStatus not generating
pending scheduler empty
history contains no Sprue burst commit
```

---

# 15. Explicit Test — Cut-by-Face Edit During Active + Pending Burst

Mandatory regression:

```text
A active
B pending
toggle/remove/non-extension drag changes topology
A returns
```

Expected:

```text
A discarded
B discarded
new topology survives
no stale Sprue resurrected
```

---

# 16. Explicit Test — Model Replacement During Active + Pending Burst

Execution 09 already has some coverage.

Preserve it and make the invariant stronger:

```text
new model state cannot receive queued old Sprue work
old Worker completion cannot mutate new model
```

Do not remove the existing test.

---

# 17. Cancellation Ordering

When an upstream mutation occurs, preferred conceptual order:

```text
1. make old scheduler work unable to continue as current
2. advance authoritative document state
3. normalize store-visible busy state
4. allow old Worker rejection/return to be ignored by identity
```

Exact synchronous ordering may differ.

Test observable invariants, not line order.

---

# 18. Pending Dispatch Validity Gate

Before starting `pendingLatest`, confirm it still matches:

```text
current evaluation request
current document identity
current requested Sprue intent
current topology/source
```

Execution 09 already checks some of this.

Preserve/strengthen as needed.

Do not start a queued snapshot merely because a variable is non-null.

---

# 19. History Base Lifetime

History base exists only for the active burst cycle.

It must clear on:

```text
successful final commit
current final failure
upstream invalidation
Undo
Redo
model replacement
orientation replacement
document replacement
```

Test the major paths.

---

# 20. No History Base Leakage Into Next Burst

Regression:

```text
burst A fails
new independent burst B succeeds
```

Undo for B must return to state immediately before B.

It must not return to the base of failed burst A.

---

# 21. Phase 3 — Define the Current-Failure Policy Before Coding

Use:

```text
ATOMIC SPRUE-CYCLE ROLLBACK
```

unless repository evidence reveals an existing stronger product requirement.

Meaning:

```text
pending Sprue intent may be displayed while evaluation is running
if the final current evaluation succeeds:
    commit final current result
if the final current evaluation fails:
    restore the pre-burst Sprue-owned authoritative cluster
    expose failure through existing error/failure UI state
```

The failed provisional intent must not remain the manufacturing document.

---

# 22. Define the Sprue-Owned Rollback Cluster

Do not blindly spread a generic `Snapshot`.

Audit ownership field by field.

Expected rollback candidates:

```text
document
evaluation / derived completion identity
registration
sprues
sprueDefinitions
lastCommittedResult
```

Fields that are NOT automatically Sprue-owned:

```text
bodyVisibility
unrelated panel state
unrelated viewport selection
segmentation regeneration counter
model identity
current topology
```

If current failure is still current, topology should not have changed.

If topology changed, the failure is stale and must not rollback anything.

---

# 23. Replace Generic History Base Only If Needed

Current scheduler uses a generic snapshot as its history base.

If that type is insufficient to implement a safe scoped rollback, introduce a narrow ephemeral type conceptually similar to:

```ts
type SprueCycleBase = {
  document: MoldDocument
  evaluation: MoldEvaluationState
  registration: DerivedRegistrationState
  sprues: readonly SprueDefinition[]
  sprueDefinitions: readonly SprueOperationDefinition[]
  lastCommittedResult: FinalMoldResult | null
  historySnapshot: Snapshot
}
```

Exact shape may differ.

Rules:

```text
ephemeral closure-owned only
not persisted
not a second store
not a second freshness system
```

Use the smallest coherent shape.

---

# 24. Failure With Previous Resolved Sprue

Mandatory test:

```text
resolved A exists
resize A accepted
pending requested diameter visible
current evaluation fails
```

Expected:

```text
previous resolved diameter restored
previous resolved Sprue geometry restored
previous valid Registration restored
previous lastCommittedResult remains coherent
document/evaluation relationship coherent
sprueStatus idle
failure visible
history length unchanged
next resize accepted
```

---

# 25. Failure With Previous Cavity + Registration Presentation

Mandatory test against active mold bodies:

```text
previous committed result includes cavity/Sprue/Registration
resize accepted
current request fails
```

After failure:

```text
active mold bodies match the selected rollback policy
no jump to undecorated base mold if rollback policy says previous committed result survives
registration is not "generating"
```

Assert actual body identities/geometry versions or deterministic body content.

Do not merely assert `error !== null`.

---

# 26. Failed First Create

Scenario:

```text
mold + cavity ready
no resolved Sprue
createSprue accepted
current evaluation fails
```

Preferred result:

```text
no fake resolved Sprue
no provisional manufacturing Sprue
pre-create Sprue authoritative state restored
failure visible
sprueStatus idle
registration restored to pre-create value
history unchanged
```

If product design intentionally keeps an invalid placement marker, it must be explicitly presentation-only and cannot be the MoldDocument manufacturing truth.

Do not keep it merely because an Execution 09 test currently expects it.

Correctness owns the test, not the reverse.

---

# 27. Failed Final Request in a Rapid Burst

Scenario:

```text
pre-burst resolved state R
A active
B supersedes
C supersedes
C becomes final pending
A stale returns
C runs
C fails
```

Expected:

```text
rollback to R
0 new history entries
no B/C provisional state remains authoritative
failure visible
next valid edit accepted
```

This is mandatory.

---

# 28. Failure Must End Registration

Add direct assertion:

```text
after current Sprue failure:
registration.status !== "generating"
```

unless a completely separate, current, non-Sprue Registration operation legitimately owns the state.

If such parallel ownership exists, prove it by identity.

Never infer.

---

# 29. Failure Must Not Break Undo/Redo

After a failed burst:

```text
Undo should behave exactly as it did before the burst
```

because the failed burst added no history entry.

After a later successful edit:

```text
one new history entry
Undo -> pre-success state
Redo -> successful current state
```

Add regression coverage.

---

# 30. Failure Retry

Add test:

```text
current request fails
→ state rolls back
→ user immediately submits another valid resize
→ accepted
→ succeeds
```

No manual reset required.

---

# 31. Pending Presentation After Retry

During retry:

```text
new requested pending value
```

must beat restored old resolved geometry.

This verifies rollback did not reintroduce the stale-presentation bug.

---

# 32. Current Failure vs Stale Failure

Keep these distinct.

Current failure:

```text
must trigger rollback/failure UI
```

Stale failure:

```text
must do nothing to current state
```

Do not use the same branch without an identity check.

---

# 33. Current Success vs Stale Success

Current success:

```text
commit
history +1 for burst
scheduler cycle ends
```

Stale success:

```text
no commit
no history
drain only if a still-valid latest pending job exists
```

After upstream teardown:

```text
there is no still-valid pending Sprue job to drain
```

---

# 34. Phase 4 — Production Runner Ownership Audit

Inspect the default dependency:

```text
runDerivedMoldEvaluation
```

and every live SplitFace store instance.

Build an ownership map:

```text
store instance
where created
lifetime
runner instance used
can it be live concurrently with another store?
```

Do not create a diagram if prose/table is clearer.

---

# 35. Runner Isolation Decision A — Single Production Store Only

If evidence proves:

```text
only one production live SplitFace store uses the module-global default runner
other factory instances are tests or isolated non-overlapping sessions
```

then:

```text
do not refactor the production runner
document the proof
add a guard/test if cheap
mark the risk CLOSED BY ARCHITECTURE EVIDENCE
```

---

# 36. Runner Isolation Decision B — Multiple Concurrent Live Stores

If two production stores can be active simultaneously:

```text
store A runner must not cancel store B runner
```

Repair options must preserve:

```text
persistent Worker reuse
requestId routing
no Worker-per-edit
no Worker-per-Sprue
```

Prefer:

```text
runner instance per independent store/session owner
```

over:

```text
one module-global cancelActive callback shared by unrelated owners
```

Do not redesign the entire worker protocol unless evidence requires it.

---

# 37. Runner Isolation Test

If multiple live owners exist, mandatory test:

```text
store A starts real/deferred evaluation
store B starts another
B does not cancel A merely because it exists
A does not cancel B
each result can only commit into its own store
```

If production architecture proves only one owner:

```text
test the architecture boundary instead of fabricating a nonexistent product scenario
```

---

# 38. Phase 5 — Keep the Existing Real Browser Cache Proof

Do not delete the current browser cache probe.

It currently provides valuable evidence:

```text
real Chromium
real cavity Worker
real Manifold/WASM
real Sprue generation
first evaluation generates
identical repeat reuses
one changed Sprue regenerates one
0 page errors
0 console errors
```

Rename only if the current test name falsely implies latest-wins coordinator coverage.

A clearer name is preferable, e.g.:

```text
sprueCache.spec.ts
```

but renaming is optional if it creates noisy churn.

The test description itself MUST tell the truth.

---

# 39. Add a New Real Browser Production-Store Lifecycle Probe

Create a test-only browser harness that uses:

```text
createSplitFaceStoreCreator
real runDerivedMoldEvaluation
real cancelDerivedMoldEvaluation
real runCavityGenerationInWorker
real Manifold/WASM
real Registration
```

A thin counting wrapper is allowed:

```text
count dispatch
delegate to production runner unchanged
```

Do not fabricate Worker results.

---

# 40. Browser Fixture Setup

The browser probe must build a deterministic, valid state:

```text
canonical part geometry
valid mold parts
real cavity
resolved initial Sprue where needed
```

Then operate through actual store actions.

The test must wait on observable state:

```text
evaluation phase
sprueStatus
sprues
registration
document identity
```

Do not use arbitrary sleeps.

---

# 41. Browser Test — Real Create

Mandatory:

```text
call createSprue(valid placement)
```

Assert immediate acceptance:

```text
returned promise resolves true without waiting for final geometry
sprueDefinitions contains pending intent immediately
sprueStatus generating while real evaluation is active
```

Then await final:

```text
resolved Sprue exists
Registration terminal/current
final committed result current
no console errors
no page errors
```

---

# 42. Browser Test — Upper/Main Diameter Resize

Mandatory:

```text
resolved Sprue exists
call resizeSprue(operationId, newMainDiameter)
```

Assert before final Worker commit:

```text
pending presentation mainDiameter == requested value
old resolved profile does not visually win
```

Then await final:

```text
resolved mainDiameter == requested value
registration/current result coherent
```

This must run in Chromium.

---

# 43. Browser Test — Lower/Entry-Neck Diameter Resize

Mandatory:

```text
resolved Sprue exists
call resizeSprueEntryNeck(operationId, newEntryDiameter)
```

Assert pending:

```text
entryNeckDiameter == requested value
main diameter stays coherent
```

Then final:

```text
resolved entryNeckDiameter == requested value
```

Real Worker + real Manifold/WASM required.

---

# 44. Browser Test — Latest-Wins Burst

Mandatory.

Start from one resolved Sprue.

In the same browser task / without awaiting completion of each Worker evaluation:

```text
A resize
B resize
C resize
...
final resize
```

Use at least:

```text
20 rapid valid intents
```

Prefer:

```text
50
```

if runtime remains deterministic.

Assertions:

```text
every valid action accepted
at most 2 derived-evaluation dispatches for the burst:
  1 active + 1 final latest pending
final resolved value == last requested value
stale result committed count == 0
history delta == 1
registration/current result coherent
```

---

# 45. Browser Test — Upstream Invalidation During Active Sprue Work

Mandatory if deterministic with the existing production runner.

Scenario:

```text
start real Sprue resize
immediately perform Mold Scale or another authoritative upstream mutation
```

Assert:

```text
Sprue scheduler cycle terminates
no queued old request starts after mutation
sprueStatus becomes truthful
old result never overwrites new document
```

If the real Worker finishes too fast for deterministic overlap on the small fixture:

```text
use a larger deterministic fixture
```

Do not add a sleep.

Do not slow production code artificially.

If overlap still cannot be deterministic in browser, keep this defect covered structurally in controlled Vitest and state clearly why browser overlap is nondeterministic.

That does not waive the required browser Create/upper/lower/latest-wins tests.

---

# 46. Browser Instrumentation Rules

Allowed:

```text
wrapper around real production runner that increments dispatch count
store subscription
performance.now()
requestId log collection
history length snapshots
```

Not allowed:

```text
fake Worker result
mock Manifold
mock Registration result
manual direct calls to evaluateDerivedMold for lifecycle proof
setTimeout-based race creation
network interception pretending to be geometry
```

---

# 47. Real Browser History Assertion

The latest-wins browser burst should assert:

```text
history delta == 1
```

if the harness uses a real store whose history is available.

This complements unit coverage.

---

# 48. Real Browser Registration Assertion

After real Create/main/lower success:

```text
registration.status must be terminal
```

If generated:

```text
registration revision must correspond to the current document/evaluation
```

If unavailable by valid policy:

```text
report the reason
```

Do not accept `generating` as final.

---

# 49. Real Browser Body Truth

After success:

```text
active result bodies are non-empty
```

and current identity matches the document.

After failure test in unit/integration:

```text
previous valid body presentation is coherent
```

Do not only inspect Sprue handle metadata.

---

# 50. Real Browser No Errors

Every new Playwright test must collect:

```text
pageerror
console error
```

Expected:

```text
0
```

If an expected browser warning exists, distinguish warning from error.

---

# 51. Test Harness Production Isolation

Any new lifecycle probe imported by:

```text
e2e-harness.html
```

must remain E2E-only.

Normal production build check must prove the new probe chunk is absent.

Do not rely solely on filename guesses if bundling renames the chunk.

Use existing artifact verification conventions.

---

# 52. CI Browser Discovery

The CI Browser job uses:

```text
npm run build:e2e
npm run e2e
```

Do not create a new spec outside Playwright discovery.

Remote log must list it.

---

# 53. Phase 6 — Historical Performance Evidence

Execution 09 required a pre-edit benchmark from:

```text
081ef3a94db3dd3f7d58e3283d5a238603e4655c
```

and a post-edit benchmark.

Execution 10 must recover this evidence.

Also measure the Execution 10 starting head:

```text
042d4011a77c2f7ceb3813def23a97da59dd961f
```

against the final candidate to prove the corrective changes did not regress performance.

Therefore produce two comparisons:

```text
Comparison A:
081ef3a...  -> final candidate
purpose: recover missing Execution 09 before/after evidence

Comparison B:
042d4011... -> final candidate
purpose: prove Execution 10 correction does not regress the green current baseline
```

---

# 54. Historical Benchmark Isolation

Never modify historical commits.

Use throwaway worktrees.

Conceptual example:

```powershell
git worktree add ..\craft-bench-exec09 081ef3a94db3dd3f7d58e3283d5a238603e4655c
git worktree add ..\craft-bench-exec10-start 042d4011a77c2f7ceb3813def23a97da59dd961f
```

Use a separate final-candidate working tree for final measurements.

Do not commit benchmark output into historical worktrees.

Remove temporary worktrees after evidence capture.

---

# 55. Benchmark Harness Portability

The benchmark harness must measure the same semantic operations across historical and final refs.

Preferred order:

```text
1. stable public product/store action path common to all refs
2. browser-level external driver
3. a test-only adapter copied into each throwaway worktree
```

If an adapter is necessary:

```text
adapter may bridge import names
adapter may collect timing
adapter may not implement any scheduling or geometry logic
adapter may not cherry-pick the fix into the baseline
```

Document adapter differences.

If a fair historical comparison cannot be constructed:

```text
Execution 10 is PARTIALLY COMPLETE
```

Do not invent historical numbers.

---

# 56. Deterministic Geometry Fixtures

Measure at least:

```text
small
medium
large
```

Fixture definition must be based on deterministic geometry complexity, not subjective names.

Record:

```text
triangle count
bounds
watertight/manifold status
fixture generation source
```

Suggested scale:

```text
small:
  simple closed solid
  ~12–100 triangles

medium:
  closed deterministic solid
  roughly 2k–5k triangles

large:
  closed deterministic solid
  roughly 10k–25k triangles
```

Use existing repository fixtures where appropriate.

If creating new test-only fixtures, keep them deterministic and watertight.

Do not use random geometry unless seeded and recorded.

---

# 57. Sprue Count Matrix

For each size measure:

```text
1 Sprue
3 Sprues
```

The 3-Sprue case is required because cache dependency and sequential Boolean cost differ from one Sprue.

---

# 58. Latency Class A — Interaction Acceptance

Measure separately from Worker completion.

Examples:

```text
valid create action invocation
→ pending intent visible

main resize release/action
→ pending requested main diameter visible

entry-neck resize release/action
→ pending requested entry diameter visible
```

This is the latency the user feels immediately.

Do not include Manifold completion in Class A.

---

# 59. Latency Class B — Authoritative Completion

Measure:

```text
accepted create
→ current resolved Sprue + Registration commit

accepted main resize
→ final current resolved commit

accepted entry-neck resize
→ final current resolved commit

rapid burst
→ final latest requested state committed
```

This includes Worker / Manifold / Registration.

Do not confuse it with Class A.

---

# 60. Benchmark Scenarios

Minimum scenarios:

```text
cold first Create
warm Create where a fresh valid placement is used
warm main-diameter resize
warm entry-neck resize
rapid 3-edit burst
rapid 20-edit burst
tool deactivate/reactivate on unchanged mold geometry
```

For edge activation:

```text
measure EdgesGeometry construction count structurally
```

not only wall time.

---

# 61. Repetition Contract

For cheap acceptance latency:

```text
n >= 50 per primary fixture/scenario
```

Report:

```text
min
p50
p95
max
```

For authoritative Worker completion:

```text
n >= 20 per primary size/Sprue-count scenario
```

Report:

```text
min
p50
p95
max
```

If the large fixture makes `n >= 20` objectively impractical:

```text
minimum n = 10
report min / p50 / max
do not label an interpolated n=10 value as meaningful p95
explain the runtime constraint
```

At least one small and one medium authoritative scenario MUST have `n >= 20` and real p95.

---

# 62. Benchmark Environment

Record:

```text
exact git SHA
browser + version
Node version
npm version
OS
CPU model
RAM if easily available
power mode / AC power status if available
build mode
test mode
fixture triangle counts
sample count
```

Run baseline and final on the same machine.

Avoid background-heavy tasks.

Do not compare local Windows baseline to GitHub-hosted Linux final as if they are one performance experiment.

---

# 63. Benchmark Order Bias

To reduce thermal/order bias:

```text
warm up each build
run baseline
run final
repeat one representative baseline scenario again
```

If the repeat baseline shifts materially:

```text
state that the environment is noisy
rerun
```

Do not cherry-pick the faster final run.

---

# 64. Benchmark Clock

Use:

```text
performance.now()
```

inside browser/runtime measurement where appropriate.

Do not use:

```text
Date.now()
```

for sub-frame acceptance measurement.

---

# 65. Percentile Calculation

Document the calculation.

Recommended:

```text
sort ascending
p50 = nearest-rank or clearly stated interpolation
p95 = nearest-rank or clearly stated interpolation
```

Use the same method for baseline and final.

Do not change percentile method between SHAs.

---

# 66. Cold vs Warm Separation

Do not mix:

```text
first Worker/WASM initialization
```

with warm repeated resize timings.

Report separately:

```text
cold
warm
```

Persistent Worker reuse is already a known closed optimization.

---

# 67. Acceptance vs Completion Separation

Never report:

```text
resize took 300 ms
```

without saying whether that means:

```text
pending visible
```

or:

```text
final Manifold + Registration commit
```

Both numbers matter for different reasons.

---

# 68. Structural Performance Counters

Preserve and extend deterministic counts.

Mandatory:

```text
raw pointermove count
expensive pointer placement count
derived evaluation dispatch count
Sprue generation call count
Registration execution count if observable
Reference Mold geometry rebuild count
EdgesGeometry construction count
history entries
stale result authoritative commit count
queued jobs started after upstream teardown
```

Hard requirements:

```text
many pointer moves in one frame
→ <= 1 expensive preview update

N rapid Sprue intents during one active evaluation
→ <= 2 evaluations total

unchanged tool reactivation
→ 0 new EdgesGeometry after warm cache

pending profile-only edit
→ 0 unnecessary full Reference Mold body rebuild

stale result
→ 0 authoritative commits

upstream teardown
→ 0 queued old jobs start afterward

superseded intents
→ 0 history entries

successful final burst
→ exactly 1 history entry

failed final burst
→ 0 history entries
```

---

# 69. Performance Acceptance

Execution 10 does not require Manifold itself to become faster.

Required outcome:

```text
interaction acceptance remains immediate / frame-bound
redundant evaluations remain eliminated
no new full geometry rebuild churn
edge extraction cache remains effective
corrective lifecycle changes do not materially regress completion latency
```

Investigate if:

```text
Class A p95 > 16.7 ms on small/medium without a justified browser scheduling boundary
```

Investigate if final authoritative completion p50/p95 regresses by more than approximately:

```text
15%
```

against `042d4011...` on the same machine and fixture, unless variance analysis proves the difference is noise.

Do not convert this into a brittle CI wall-clock threshold.

CI should gate structural counts.

---

# 70. No False Speed Claim

Valid final language:

```text
acceptance p95 improved from X to Y
rapid burst evaluations dropped from N to <=2
authoritative completion remained dominated by Manifold/Registration
```

Invalid without evidence:

```text
Sprue engine is 10x faster
Manifold is faster
Boolean kernel was optimized
```

---

# 71. Performance Evidence Artifact

Produce a deterministic report under the Execution 10 folder, e.g.:

```text
Execution/Craft Execution 10/Craft Execution 10 Performance.md
```

or equivalent.

It must contain:

```text
environment
fixture definitions
exact SHAs
sample counts
raw summary statistics
before/after tables
structural counters
interpretation
known variance
```

Raw large machine-generated samples may remain untracked if repository policy prefers.

But summary evidence must be reviewable.

---

# 72. Phase 7 — Security Recheck

Current observed npm state is:

```text
0 vulnerabilities
```

Execution 10 must preserve it.

Run:

```powershell
npm audit
npm audit --audit-level=moderate
```

No `--force`.

No audit suppression.

---

# 73. Strengthen CI Moderate Advisory Gate

Current CI uses:

```text
npm audit --audit-level=high
```

Execution 09 specifically closed a moderate advisory.

Since current audit is clean, Execution 10 should strongly consider changing the frontend CI gate to:

```text
npm audit --audit-level=moderate
```

so the same class of advisory cannot silently reappear.

This is in scope because it protects the exact security closure Execution 09 made.

Do not broaden into unrelated dependency churn.

---

# 74. Preserve Production Artifact Isolation

Normal production:

```powershell
npm run build
```

must continue proving:

```text
no e2e-harness.html in normal production dist
no test-only Sprue probe shipping in production artifact
bundle budget passes
```

E2E:

```powershell
npm run build:e2e
```

must include the harness needed for Playwright.

Do not merge the two build modes.

---

# 75. Preserve Bundle Budget

Execution 10 must not regress:

```text
eager entry budget
lazy/shared chunk budget
```

No threshold increase solely to make the execution green.

If new test-only harness code increases E2E-only chunks:

```text
that is not a production budget regression
```

but verify normal production output separately.

---

# 76. Existing Controlled External Warning

If the current Manifold/Vite `node:module` externalization warning still exists:

```text
do not reopen it automatically
```

It was previously classified as controlled after real Chromium Worker/WASM Boolean proof.

Only reopen if Execution 10 introduces new runtime evidence of breakage.

---

# 77. Build Warning Policy

New warnings introduced by Execution 10 are not acceptable without classification.

Existing controlled warning may remain.

Do not silence warnings globally.

---

# 78. Phase 8 — Full Local Frontend Harness

From:

```text
mold/frontend
```

run in this order:

```powershell
npm ci
npm audit
npm audit --audit-level=moderate
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run build:e2e
npm run e2e
```

All required tests must pass.

No skipped new lifecycle test.

---

# 79. Full Python Harness

From:

```text
mold
```

run:

```powershell
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

Expected starting reference:

```text
357 Python tests
```

If count changes:

```text
explain why
```

---

# 80. Repository Integrity

From repository root:

```powershell
git diff --check
git status --short
```

Inspect changed files manually.

Reject:

```text
conflict markers
temporary benchmark output accidentally tracked
Playwright report directories
dist/
coverage/
profiling dumps
throwaway worktree files
.bak
```

---

# 81. Required Unit / Integration Test Inventory

Execution 10 is not complete without tests for:

```text
scale invalidates active Sprue scheduler
scale invalidates active + pending Sprue scheduler
Cut-by-Face topology edit invalidates active + pending
model replacement invalidates active + pending
stale success after teardown cannot commit
stale failure after teardown cannot clobber
stale progress after teardown cannot clobber
ghost sprueStatus generating cannot survive teardown
createMoldParts is not blocked after teardown
current resize failure restores coherent previous state
current entry-neck failure restores coherent previous state
current move failure restores coherent previous state
failed first Create restores coherent pre-create state
failed final burst creates zero history
successful burst still creates one history
next edit after failure is accepted
registration not generating after current failure
active mold bodies follow rollback policy after failure
runner ownership/isolation proven
```

---

# 82. Required Browser Test Inventory

Minimum final browser proof:

```text
existing app smoke
existing Cavity real-Manifold Boolean
existing Sprue cache real-Manifold proof
real Sprue Create through production store
real main/upper resize through production store
real entry-neck/lower resize through production store
real latest-wins burst through production store
```

These may be organized into fewer spec files.

The semantic coverage is mandatory.

If a single probe returns many assertions, its code must still clearly execute each required action.

---

# 83. Browser Proof Must Distinguish Cache and Coordinator

Final report must say separately:

```text
Cache proof:
  direct derived evaluation / generation reuse

Coordinator proof:
  SplitFace store actions
  acceptSprueIntent
  one active + one pending latest
  real Worker dispatch
```

Do not use one as evidence for the other.

---

# 84. Progress Identity Regression

The worker client already filters responses by requestId.

Add or preserve a test proving:

```text
A progress event arrives after B is current
→ B's visible evaluation progress does not become A's progress
```

If scheduler uses a wrapper callback:

```text
gate by current request identity
```

Do not add a second progress epoch.

---

# 85. Exact State Truth Assertions

Avoid weak tests such as:

```text
expect(error).not.toBeNull()
```

when the bug is state coherence.

Assert combinations:

```text
evaluation.phase
evaluation.requestId
document.revision
document.fingerprint
registration.status
registration.revision
lastCommittedResult.sourceRevision
lastCommittedResult.sourceFingerprint
sprueStatus
sprueDefinitions validation
resolved Sprue values
history length
active body selection
```

---

# 86. Do Not Test Implementation Names Only

A test named:

```text
latest wins
```

that never uses the coordinator is insufficient.

Tests must prove behavior.

Naming is not evidence.

---

# 87. No Arbitrary Sleeps

Forbidden:

```ts
await new Promise(resolve => setTimeout(resolve, 500))
```

to make races “work.”

Use:

```text
controlled deferred promises
observable state waits
Playwright expect.poll
request identity
real larger fixture for browser overlap
```

---

# 88. No Promise Poisoning

When replacing production runners with deferred test doubles:

```text
restore mocks after every test
drain pending promises
do not leak unresolved promises into the next test
```

Keep the suite deterministic.

---

# 89. No Duplicate Freshness System

Do not add:

```text
sprueEpoch
sprueGeneration
sprueTimestamp
sprueVersion2
```

if current:

```text
requestId
revision
fingerprint
```

already solve commit identity.

Scheduler-local active/pending references are allowed.

---

# 90. No Worker Churn

Do not solve lifecycle bugs by:

```text
terminate Worker on every resize
create Worker per Sprue
create Worker per pointer event
```

Persistent Worker reuse is a closed improvement.

Preserve it.

---

# 91. No Global Three.js Monkey Patches

Do not patch global Three constructors in production.

Test-only constructor spies must be tightly scoped and restored.

Prefer explicit counters at owned wrapper boundaries.

---

# 92. No Full Mold Rebuild for Sprue Presentation

Pending visual updates must not rebuild Reference Mold geometry merely because metadata wrapper objects changed.

Preserve current fail-safe identity behavior.

Do not weaken it back to:

```text
same id + same triangles + same bounds = same geometry
```

unless a trustworthy geometry version/hash proves it.

---

# 93. Do Not Invent a Mesh Hash Claim

Current code evidence at authoring time uses trusted `geometryVersion` for the skip path and fails safe when missing.

If Execution 10 changes this:

```text
report exactly what the code does
```

Do not claim:

```text
meshHash from positions + indices
```

unless such code actually exists and is tested.

---

# 94. Preserve EdgesGeometry Cache

Current `glassEdgeCache` is a closed Execution 09 improvement.

Regression requirements:

```text
first activation -> extraction
same geometry reactivation -> 0 new extraction
geometry replacement -> old cache entry disposed, new extraction
runtime dispose -> all cache resources disposed
```

Keep existing tests green.

---

# 95. Preserve Per-Sprue Cache

Do not weaken current cache reuse.

Existing required behavior:

```text
exact repeat -> reuse
B-only edit -> A reuse, B recompute
upstream body change -> downstream recompute
3-Sprue dependency chain remains correct
```

Keep all existing cache tests.

---

# 96. Cache Correctness Before Speed

Never reuse cached Sprue geometry if upstream mold geometry identity is uncertain.

Fail safe:

```text
recompute
```

rather than:

```text
reuse because operationId matched
```

---

# 97. History Invariant Table

Final tests must cover:

```text
single successful edit:
  +1 undo entry

rapid successful burst:
  +1 undo entry total

superseded intermediate intents:
  +0

failed first create:
  +0

failed final resize burst:
  +0

upstream invalidation during active Sprue:
  +0 Sprue commit history
```

---

# 98. Status Invariant Table

After:

```text
success:
  sprueStatus = idle
  evaluation = complete
  registration terminal/current

current failure:
  sprueStatus = idle
  no registration generating leak

upstream invalidation:
  sprueStatus not generating
  old scheduler empty

model replacement:
  sprueStatus = idle
  no old queued work
```

---

# 99. Document Identity Invariant

Whenever a result commits:

```text
result.sourceRevision == current document.revision
result.sourceFingerprint == current document.fingerprint
requestId is current
```

Whenever a result fails or is stale:

```text
it cannot write a mismatched result
```

Test this directly.

---

# 100. Cavity Regression Sweep

Execution 10 is Sprue-focused, but Cavity is the upstream source.

Run targeted regression for:

```text
real browser Cavity Boolean
Cavity result survives valid Sprue lifecycle
Mold Scale invalidates Cavity according to existing policy
failed Sprue edit does not corrupt prior Cavity state
```

No Cavity feature changes.

---

# 101. Registration Regression Sweep

Mandatory:

```text
Registration after successful Sprue Create
Registration after main resize
Registration after entry-neck resize
Registration after failed current Sprue
Registration after upstream invalidation
Registration after Undo/Redo
```

The execution is not complete if any path can leave Registration falsely generating.

---

# 102. Mold Scale Regression Sweep

Mandatory:

```text
scale with no Sprue active
scale with resolved Sprue
scale while Sprue active
scale while Sprue active + pending
undo/redo around scale
```

Preserve Segmentation-specific scale behavior.

Do not break `segmentationRegenerationCount` policy.

---

# 103. Cut-by-Face Regression Sweep

Mandatory:

```text
toggle face with resolved Sprue
remove face with resolved Sprue
clear selection
drag normal split plane
remove split face and rebuild
```

Each must preserve its existing Sprue intent invalidation semantics while safely ending active scheduler work.

---

# 104. Segmentation Regression Sweep

Do not treat segmentation extension plane UI markers as ordinary topology edits if the current design intentionally keeps them document-neutral.

Preserve:

```text
extension add/remove/drag behavior
Segmentation source snapshot stability
Mold Scale replan behavior
```

Only terminate Sprue work if the actual authoritative mold document is replaced/invalidated.

---

# 105. Current Test Count Is Not a Contract

Starting observed counts:

```text
Vitest: 1106 passed, 5 skipped
Playwright: 3 passed
Python: 357 passed
```

Execution 10 will add tests.

Final counts must increase legitimately.

Do not hard-code an expected exact future number in CI.

---

# 106. Required New Browser Semantics

Even if total browser count is only modestly larger, the log must show semantic names equivalent to:

```text
real Sprue Create through production store
real main diameter resize
real entry-neck diameter resize
real latest-wins burst
```

This is more important than raw count.

---

# 107. Upstream Cancellation Must Not Delete Durable Intent Incorrectly

Scheduler teardown is execution cleanup.

It must not automatically erase durable Sprue intent if the existing domain policy says:

```text
preserve intent
mark pending for revalidation
```

Example:

```text
Mold Scale may preserve Sprue intent but invalidate resolved geometry
```

Respect that.

---

# 108. Destructive Topology Edits May Clear Intent

Some Cut-by-Face topology edits intentionally clear Sprue definitions because anchors belong to removed topology.

Preserve that existing policy.

Do not force one policy on every upstream edit.

---

# 109. Promise Semantics

Preserve Execution 09 public action contract:

```text
true
= valid intent accepted

false
= invalid input / lifecycle precondition
```

`true` does not mean final geometry succeeded.

Do not revert to:

```text
await full Worker + Registration then return true
```

for normal Sprue edits.

---

# 110. Failure Notification

Because action promise acceptance and final success are separate, failure must remain observable through store/UI state.

After atomic rollback:

```text
error or existing failure channel
```

must tell the user the accepted operation failed.

Do not swallow current failures just because geometry rolled back.

---

# 111. CI Quality Gate Preservation

Keep explicit result matrix semantics.

For push:

```text
python success
frontend success
browser success
repository integrity success
dependency review skipped
```

For PR:

```text
python success
frontend success
browser success
repository integrity success
dependency review success
```

Unexpected skipped critical job must fail.

Execution 10 must not weaken this.

---

# 112. CI Concurrency Preservation

Keep current concurrency cancellation behavior.

Do not treat a cancelled superseded run as proof of the final SHA.

Use the latest completed run for the exact final SHA.

---

# 113. Git Safety

Forbidden without user instruction:

```text
git reset --hard
git clean -fd
force push
rewrite main history
delete user files
```

If working tree is dirty:

```text
inspect first
preserve user work
```

---

# 114. Commit Scope

If/when user authorizes commit:

Prefer a focused commit message such as:

```text
Execution 10: close Sprue lifecycle rollback and browser proof gaps
```

Do not include unrelated files.

---

# 115. Phase 9 — No Push Without Authorization

Do not commit or push unless the user separately authorizes it.

Before asking for push authorization, final local report must include:

```text
actual starting SHA
changed files
test counts
browser counts
npm audit result
Python result
performance evidence path
remaining warnings
decision
```

Allowed local decision:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

Only if every local mandatory requirement is satisfied.

---

# 116. Local Completion Cannot Ignore Performance

Do not say local complete if:

```text
historical timing evidence not run
small/medium/large missing
1/3 Sprue matrix missing
required p50/p95 missing
```

unless there is a reproducible external blocker.

If blocked:

```text
PARTIALLY COMPLETE
```

or:

```text
BLOCKED
```

with exact reason.

---

# 117. Phase 10 — Exact-SHA Remote Verification

After user-authorized push:

```text
git rev-parse HEAD
```

Record exact pushed SHA.

Then verify GitHub Actions run for that exact SHA.

Do not use:

```text
older green run
green run from parent commit
Dependabot dynamic run as substitute for CI
```

Required exact-SHA jobs:

```text
Python quality -> success
Frontend quality -> success
Browser smoke -> success
Repository integrity -> success
Quality gate -> success
Dependency review -> expected event-dependent result
```

---

# 118. Remote Browser Log Inspection

Do not stop at green job status.

Read Browser smoke logs and confirm:

```text
new lifecycle spec actually ran
real Create assertion ran
upper/main resize assertion ran
lower/entry-neck resize assertion ran
latest-wins burst assertion ran
cache proof still ran
Cavity proof still ran
0 failing browser tests
```

A green Browser job that did not discover the new spec is not proof.

---

# 119. Remote Frontend Log Inspection

Confirm exact SHA remote:

```text
npm ci
npm audit gate
typecheck
lint
production build
production artifact isolation
bundle budget
Vitest
```

Record actual test count.

No hidden skip of new lifecycle tests.

---

# 120. Remote Python Log Inspection

Confirm:

```text
Ruff check
Ruff format --check
pytest
```

Record actual count.

Starting reference is:

```text
357 passed
```

---

# 121. Remote Security Evidence

If CI is strengthened to moderate:

```text
npm audit --audit-level=moderate
```

must pass on exact SHA.

If not changed in CI, final remote audit evidence must still show the current dependency tree is clean.

Preferred:

```text
CI gate moderate
```

because it prevents regression.

---

# 122. Remote Artifact Evidence

Normal production build must still exclude:

```text
e2e-harness.html
test-only Sprue probe entry
```

The E2E build must include them.

Verify both.

---

# 123. Phase 11 — Final Adversarial Re-Audit

After exact-SHA green CI, do not immediately declare completion.

Re-read the final code and ask:

```text
Can Mold Scale leave sprueStatus generating?
Can a queued old Sprue start after topology replacement?
Can an old success commit after teardown?
Can an old failure overwrite newer error/state?
Can an old progress update appear current?
Can current failure leave Registration generating?
Can current failure make the viewport fall back to the wrong mold bodies?
Can failed provisional intent remain manufacturing truth?
Can a failed burst create history?
Can a successful burst create more than one history entry?
Does browser latest-wins actually call the store coordinator?
Does browser upper resize actually call resizeSprue?
Does browser lower resize actually call resizeSprueEntryNeck?
Does the benchmark really compare the declared SHAs?
Are p50/p95 computed from real samples?
Can two production stores cancel one another through the default runner?
Did test harness code leak into production?
Did npm moderate risk return?
```

Any uncertain answer requires investigation.

---

# 124. Required Final Report Structure

Create:

```text
Execution/Craft Execution 10/Craft Execution 10 Report.md
```

or equivalent.

Required sections:

```text
1. Decision
2. Exact starting SHA
3. Exact final candidate SHA if available
4. Files changed
5. Scheduler lifecycle report
6. Failure rollback report
7. Runner ownership report
8. Browser proof report
9. Performance evidence report
10. Security report
11. Full harness results
12. Remote exact-SHA evidence
13. Remaining warnings / controlled external warnings
14. Adversarial re-audit
```

---

# 125. Evidence Ledger Format

For every Execution 10 gap:

```text
Gap
Before defect
Code change
Test that proves it
Browser proof if applicable
Remote proof
Status
```

Statuses:

```text
CLOSED
BLOCKED
OPEN
```

No vague:

```text
mostly fixed
appears fine
should work
```

---

# 126. Performance Report Required Table

Include at least:

```text
SHA
fixture size
triangle count
Sprue count
scenario
n
min
p50
p95
max
```

For any scenario without p95:

```text
state why sample count is insufficient
```

---

# 127. Structural Counter Report Required Table

Include:

```text
scenario
raw events
expensive updates
evaluation dispatches
Sprue generate calls
Registration calls
Reference Mold rebuilds
EdgesGeometry constructions
history delta
stale commits
queued-after-teardown starts
```

---

# 128. Browser Report Required Table

Include:

```text
test
production store action used
real Worker
real Manifold/WASM
real Registration
final assertion
console errors
page errors
```

This prevents a direct-engine cache test from being mislabeled as coordinator proof.

---

# 129. Runner Ownership Report Required Table

Include:

```text
owner/store
creation path
runner
lifetime
concurrent?
cancellation scope
decision
```

If no multi-store production concurrency exists:

```text
say so with file evidence
```

---

# 130. No-Tech-Debt Rules

Execution 10 must not introduce:

```text
@ts-ignore to bypass correctness
eslint disable for new lifecycle code
arbitrary sleeps
busy-reject restoration
unbounded queue
second persistent Sprue store
second freshness epoch system
Worker per resize
Worker per Sprue
global warning filter
global console.error suppression
fake browser Sprue geometry
mock Manifold in real-browser proof
threshold inflation
audit --force
continue-on-error
|| true
skipped mandatory tests
test-only code in normal production artifact
committed dist/
committed Playwright reports
temporary benchmark worktrees inside repository
```

---

# 131. Scope Guard

Do not add:

```text
new mold-generation feature
new Cavity algorithm
new Segmentation algorithm
new Registration style
new UI redesign
new backend
new database
new framework
new geometry kernel
new state framework
```

Execution 10 is closure, not expansion.

---

# 132. Allowed Refactors

Allowed only if directly necessary:

```text
narrow scheduler teardown helper
narrow Sprue-cycle rollback snapshot/cluster
test-only real-browser lifecycle probe
performance benchmark harness
runner ownership extraction if real multi-store conflict is proven
CI npm audit moderate gate
test naming correction
```

Keep the diff focused.

---

# 133. Suggested Implementation Order

Recommended exact sequence:

```text
1. re-audit latest main
2. add failing scale-during-active regression
3. add failing current-failure-registration regression
4. add failing active-body rollback regression
5. repair scheduler teardown ownership
6. repair current-failure atomic rollback
7. run targeted store tests
8. audit production runner ownership
9. repair runner only if real production concurrency is proven
10. add real browser production-store lifecycle probe
11. run browser locally
12. build historical benchmark worktrees
13. capture 081ef baseline
14. capture 042d baseline
15. capture final candidate
16. generate performance evidence
17. run full frontend harness
18. run Python harness
19. run repository integrity
20. adversarial local review
21. report LOCAL COMPLETE only if all local requirements pass
22. wait for user authorization before push
23. push
24. inspect exact-SHA GitHub Actions
25. inspect Browser/Frontend/Python logs
26. final adversarial review
```

---

# 134. Targeted Test Commands During Development

Examples:

```powershell
npm run test:run -- splitFace.sprueLatestWins
npm run test:run -- splitFace.spruePerformance
npm run test:run -- evaluateDerivedMold.cache
npm run test:run -- spruePreview3dRuntime
npm run test:run -- referenceMoldBlock3dRuntime
npm run test:run -- registrationLifecycle
```

Use actual Vitest path syntax supported by the repository.

Do not rely only on targeted tests at the end.

---

# 135. Browser Development Commands

After E2E build:

```powershell
npm run build:e2e
npm run e2e
```

If debugging one spec:

```powershell
npx playwright test e2e/<actual-spec-name>
```

Final verification must run the entire browser suite.

---

# 136. Benchmark Must Not Pollute Product Runtime

Performance instrumentation should be:

```text
test-only
benchmark-only
dev-only
```

unless a counter already exists for legitimate runtime diagnostics.

Do not ship hidden profiling overhead to production solely for Execution 10.

---

# 137. Final Decision Strings

Use only one:

```text
REMOTE VERIFIED COMPLETE — SPRUE LIFECYCLE CLOSURE
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
PARTIALLY COMPLETE
BLOCKED
```

---

# 138. `REMOTE VERIFIED COMPLETE — SPRUE LIFECYCLE CLOSURE`

Allowed only if all are true:

```text
cross-system scheduler teardown closed
ghost generating regression closed
current-failure coherent rollback closed
Registration failure leak closed
active-body rollback policy proven
failed burst history = 0
successful burst history = 1
runner ownership risk resolved by evidence or repair
real browser Create proven through production store
real browser main resize proven
real browser entry-neck resize proven
real browser latest-wins burst proven
existing real browser cache proof preserved
historical 081ef before/final timing evidence produced
042d/final no-regression timing evidence produced
small/medium/large fixtures measured
1/3 Sprue matrix measured
required p50/p95 evidence exists
structural performance counts green
npm audit clean
moderate audit protection preserved/strengthened
normal production artifact excludes E2E harness
bundle budget green
full frontend suite green
full Python suite green
git diff --check green
exact final pushed SHA green remotely
new browser specs confirmed in remote logs
adversarial re-audit finds no unresolved mandatory gap
```

If one mandatory item is false:

```text
DO NOT use REMOTE VERIFIED COMPLETE
```

---

# 139. `LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION`

Use only if:

```text
every local implementation requirement is complete
all local tests pass
browser lifecycle proof passes locally
performance evidence is complete
security is clean
no mandatory local gap remains
```

and only remote exact-SHA evidence is missing.

---

# 140. `PARTIALLY COMPLETE`

Use when:

```text
meaningful fixes landed
but at least one mandatory requirement remains open
```

Examples:

```text
browser latest-wins still only direct engine proof
performance p95 missing
runner ownership unresolved
scale ghost-busy not tested
```

---

# 141. `BLOCKED`

Use only for a real external/architectural blocker.

Include:

```text
reproduction
why repository code alone cannot safely solve it
what evidence is missing
what specific external dependency is required
```

Do not use BLOCKED to avoid a difficult test.

---

# 142. Strict Definition of Done

```text
[ ] Current main re-audited before edits
[ ] Exact starting SHA recorded
[ ] Scale-during-active defect reproduced or disproven with evidence
[ ] Upstream mutation matrix classified
[ ] One scheduler teardown owner established
[ ] setClearanceMm safely ends Sprue execution cycle
[ ] updateClearanceEdit safely ends Sprue execution cycle
[ ] clearSelection safely ends Sprue execution cycle
[ ] normal commitPlaneDrag safely ends Sprue execution cycle
[ ] toggleFace safely ends Sprue execution cycle
[ ] removeSplitFace safely ends Sprue execution cycle
[ ] removeSplitFaceAndRebuild safely ends Sprue execution cycle
[ ] model replacement clears active and pending
[ ] orientation change clears active and pending
[ ] segmentation/document replacement cannot run old queued job
[ ] ghost sprueStatus "generating" impossible after teardown
[ ] stale success after teardown cannot commit
[ ] stale failure after teardown cannot clobber
[ ] stale progress after teardown cannot clobber
[ ] createMoldParts not blocked by ghost busy state
[ ] current-failure policy documented
[ ] failed resize restores coherent prior Sprue state
[ ] failed entry-neck resize restores coherent prior state
[ ] failed move restores coherent prior state
[ ] failed first Create leaves no fake manufacturing Sprue
[ ] Registration never remains generating after current failure
[ ] active mold bodies follow rollback policy after failure
[ ] failed burst creates zero history
[ ] successful burst still creates one history
[ ] retry after failure works immediately
[ ] pending presentation after retry remains correct
[ ] runner ownership map completed
[ ] shared default runner concurrency risk proven absent or repaired
[ ] existing real browser Cavity proof passes
[ ] existing real browser Sprue cache proof passes
[ ] real browser Create uses production store
[ ] real browser main/upper resize uses production store
[ ] real browser lower/entry-neck resize uses production store
[ ] real browser latest-wins burst uses production store
[ ] real browser latest-wins dispatch count <= 2
[ ] real browser final value equals latest intent
[ ] real browser history delta == 1 for successful burst
[ ] no browser page errors
[ ] no browser console errors
[ ] historical benchmark 081ef baseline captured
[ ] Execution 10 starting benchmark 042d captured
[ ] final candidate benchmark captured
[ ] small fixture measured
[ ] medium fixture measured
[ ] large fixture measured
[ ] 1-Sprue cases measured
[ ] 3-Sprue cases measured
[ ] Class A acceptance latency separated
[ ] Class B completion latency separated
[ ] p50 recorded
[ ] p95 recorded where sample count is meaningful
[ ] structural dispatch count recorded
[ ] structural generation count recorded
[ ] structural rebuild count recorded
[ ] structural edge count recorded
[ ] structural history count recorded
[ ] stale commit count = 0
[ ] queued-after-teardown count = 0
[ ] npm audit = clean
[ ] npm moderate gate passes
[ ] typecheck passes
[ ] lint passes
[ ] production build passes
[ ] production artifact isolation passes
[ ] bundle budget passes
[ ] Vitest passes
[ ] E2E build passes
[ ] Playwright passes
[ ] Ruff passes
[ ] Python pytest passes
[ ] git diff --check passes
[ ] no temporary benchmark artifacts tracked
[ ] final report matches actual code
[ ] user separately authorized push
[ ] exact final pushed SHA recorded
[ ] exact final SHA GitHub Actions green
[ ] remote browser log proves new lifecycle tests ran
[ ] remote frontend log proves full gates ran
[ ] remote Python log proves full gates ran
[ ] final adversarial re-audit completed
```

If any mandatory item is false:

```text
do not report REMOTE VERIFIED COMPLETE
```

---

# 143. Final Completion Statement

Only after every mandatory condition above is verified on the exact final pushed SHA, the final response may end with:

```text
REMOTE VERIFIED COMPLETE — SPRUE LIFECYCLE CLOSURE

Execution 10 closes the residual Execution 09 Sprue lifecycle and evidence gaps.
Use this exact green SHA as the Sprue baseline.
Do not open another generic Sprue hardening execution unless new evidence reveals a regression.
```

If not all conditions are met, do not print that statement.

---

# 144. Final Instruction to the Coding Agent

Investigate first.

Reproduce before repairing.

Use the repository as truth.

Do not optimize by assumption.

Do not preserve an inconsistent state merely because an older test encoded it.

Do not call a direct engine test a coordinator test.

Do not call structural counts wall-clock measurements.

Do not call a local green run remotely verified.

Do not let a stale Worker decide correctness.

Do not let scheduler bookkeeping outlive the document that gave it meaning.

Do not let a failed Sprue request leave Registration, MoldDocument, active bodies, and history disagreeing about what is current.

Close the lifecycle.

Prove the lifecycle.

Measure the lifecycle.

Then stop.
