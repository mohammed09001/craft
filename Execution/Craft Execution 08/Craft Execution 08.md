# Craft — Execution 08
## Sprue/Funnel Performance Closure — Responsive Interaction, Incremental Evaluation, and Cross-System Safety

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 08/`  
**Observed repository head while authoring this execution:** `main` at `5898679a685830b624bd3e80e34d10754669deb2`  
**Execution type:** focused performance repair + correctness hardening  
**Primary subsystem:** Sprue / Funnel  
**Coupled systems that MUST be treated as one system:** Viewport, SplitFace singleton state, MoldDocument/evaluation ownership, Cavity, Registration, Reference Mold rendering, Undo/Redo, Worker lifecycle, Manifold/WASM, Three.js presentation.  
**Non-goal:** new product functionality.

---

# 0. Why this is Execution 08

Execution 07 already exists. This is therefore **Craft Execution 08**.

It is not another generic stabilization pass. It is a focused repair for a user-visible defect:

- Sprue tool activation/placement can feel slow.
- Creating a Sprue can take too long before the action feels accepted.
- Resizing the upper/main opening can feel slow.
- Resizing the lower/entry-neck opening can feel slow.
- A committed resize can visually snap back to the previous diameter while authoritative geometry is recomputed.
- Current flow performs expensive work that is unnecessary for interactive presentation.
- A cache/geometry-version defect can allow downstream Sprue cache reuse against changed upstream geometry.

The repair must make interaction materially faster **without reducing final geometry quality and without weakening correctness**.

---

# 1. Mission

Target interaction:

```text
Activate Sprue
→ responsive immediately

Move pointer
→ at most one expensive placement update per animation frame

Click to create
→ current Sprue intent appears immediately as pending presentation
→ authoritative Sprue + Registration run asynchronously
→ final current result commits atomically

Drag upper/lower diameter
→ proxy follows pointer in the same frame
→ release does NOT snap back to old diameter
→ authoritative recomputation runs in background
→ newer edits supersede obsolete pending work
→ only the newest current result may commit
```

Core rule:

> **Presentation may be provisional. Manufacturing truth may never be provisional.**

---

# 2. Current Repository Evidence

The current code already contains the correct architectural foundations. Improve them; do not replace them with a parallel Sprue system.

Current interaction chain:

```text
Viewport.tsx
→ useViewportRuntime.ts
→ createThreeViewportRuntime.ts
→ spruePreview3dRuntime.ts / sprueResizeRuntime.ts
→ splitFace.store.ts
→ MoldDocument + derived evaluation
→ persistent Worker
→ Sprue generation
→ Registration
→ FinalMoldResult
→ Viewport
```

Current facts that must guide implementation:

1. `sprueResizeRuntime.ts` already keeps drag preview lightweight by scaling a Three.js group. Heavy geometry must remain out of `pointermove`.
2. Normal pointer release currently goes through drag cancellation logic that resets the visual scale before async completion. This creates visible snap-back.
3. `resizeSprue()` and `resizeSprueEntryNeck()` both route into `rebuildSprueDefinitions()`, which starts a full derived evaluation.
4. `evaluateDerivedMold.ts` performs Sprue generation and then Registration.
5. `derivedMoldEvaluation.workerClient.ts` already reuses one persistent Worker. Preserve this.
6. `evaluateDerivedMold.ts` already contains per-Sprue cache reuse. Fix its correctness before expanding it.
7. `spruePreview3dRuntime.ts` performs pointer-driven mold/cavity ray queries directly from `pointermove`.
8. `modelSelectionRuntime.ts` already demonstrates the correct frame-coalescing pattern with `requestAnimationFrame`.
9. `Viewport.tsx` constructs a new reference mold wrapper from body/registration/Sprue presentation state, while `referenceMoldBlock3dRuntime.ts` primarily uses wrapper object identity to decide whether geometry changed. This can cause expensive presentation rebuilds for metadata-only changes.
10. Existing `three-mesh-bvh` is already in the repository and may be reused locally if profiling confirms raycast cost remains significant.

---

# 3. Confirmed Correctness Defect to Fix First

Current Sprue-updated body `geometryVersion` is derived from upstream geometry version plus `operationId`, while a resize keeps the same operation ID.

Therefore:

```text
same operationId
different main diameter
→ different mesh can receive the same derived geometryVersion
```

That can make a downstream Sprue cache believe upstream geometry is unchanged.

This is a correctness risk, not merely a performance issue.

**Fix geometry identity and cache-key completeness before relying on cache reuse for optimization.**

---

# 4. The System Promise — Mandatory Invariants

Treat this section as a contract.

## Promise A — One authoritative state

- Sprue intent remains in the existing authoritative mold/SplitFace state.
- Final manufacturing geometry remains in the existing derived-evaluation/final-result path.
- Do not create a second persistent Sprue store.
- Three.js scene objects remain presentation only.

## Promise B — Pending presentation can never become final geometry

A pending Sprue may render immediately, but it must never be used as final export/manufacturing geometry.

Final export/authoritative bodies must come only from a successful current derived evaluation.

## Promise C — Final geometry quality is unchanged

Do not improve performance by:

- lowering `SPRUE_CIRCULAR_SEGMENTS`;
- weakening Manifold/tolerance checks;
- lowering Cavity quality;
- skipping inlet validation;
- skipping Cavity reach validation;
- skipping Registration;
- skipping stale-result validation;
- using low-resolution final geometry.

A lightweight display proxy is allowed only for presentation.

## Promise D — Latest authoritative intent wins

If A is running and B arrives:

```text
A must never overwrite B.
```

If C then arrives:

```text
B may be replaced by C before execution.
```

Bound the queue:

```text
maximum 1 active evaluation
maximum 1 latest pending intent
```

No unbounded queue.

## Promise E — Existing freshness ownership remains authoritative

Preserve or strengthen:

```text
document.revision
document.fingerprint
requestId
sourceRevision
sourceFingerprint
canCommitMoldEvaluation-equivalent gate
```

Do not replace this with an unrelated freshness system.

## Promise F — Pending state is reversible

On final current failure:

```text
pending visual
→ revert to last valid resolved presentation
→ preserve truthful failure state
```

Do not leave fake geometry visible as successful.

## Promise G — History stays coherent

- Superseded work that never commits creates no Undo history.
- A final committed resize creates one coherent history unit.
- Undo/Redo must restore intent, resolved Sprue, Registration, document, evaluation, and final-result truth coherently.

## Promise H — Dependency order remains

```text
Cavity
→ Sprue
→ Registration
→ final commit
```

Pending visual feedback may appear earlier. Final authoritative ordering may not change.

## Promise I — Main-thread geometry work is identity-driven

A pending profile/status change must not recreate the whole mold BufferGeometry if body geometry did not change.

## Promise J — No global Three.js patch without proof

Do not globally monkey-patch `Mesh.prototype.raycast` or other shared Three behavior merely to optimize Sprue. Prefer local ownership.

---

# 5. Hard Scope

Likely files:

```text
mold/frontend/src/features/viewport/runtime/spruePreview3dRuntime.ts
mold/frontend/src/features/viewport/runtime/sprueResizeRuntime.ts
mold/frontend/src/features/viewport/runtime/spruePlacementRequestGate.ts
mold/frontend/src/features/viewport/runtime/createThreeViewportRuntime.ts
mold/frontend/src/features/viewport/useViewportRuntime.ts
mold/frontend/src/features/viewport/Viewport.tsx

mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
mold/frontend/src/features/mold-generation/sprue-generation/SprueGenerationService.ts
mold/frontend/src/features/mold-generation/workflow/evaluateDerivedMold.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.worker.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.workerClient.ts
```

Touch Reference Mold or Registration files only when required by proven redundant work or identity correctness.

---

# 6. Explicit Non-Goals

Do not add:

- new Sprue types;
- CFD;
- flow simulation;
- AI;
- backend;
- WebGPU rewrite;
- new geometry kernel;
- new state library;
- new queue framework;
- new caching framework;
- unrelated UI redesign;
- unrelated Cavity/Segmentation/Registration features.

---

# 7. Phase 0 — Re-Audit Before Editing

Before any code change:

1. read current `main`;
2. record exact SHA;
3. inspect working tree;
4. inspect current Sprue runtime/store/worker tests;
5. inspect latest CI;
6. confirm whether repository advanced beyond the observed SHA.

If `main` advanced, do not reset. Re-derive assumptions from current code.

---

# 8. Phase 1 — Instrument the Real Latency Path

Do not optimize from intuition.

Measure real stages:

```text
Sprue tool activation
placement pointer update
create intent acceptance
worker dispatch
Sprue generation
Registration
worker result delivery
reference mold visual rebuild
final visible commit
upper diameter resize
lower diameter resize
```

Use narrow browser performance marks or test-only instrumentation.

Remove ad-hoc production logs before completion.

Measure deterministic:

```text
small fixture
medium fixture
large fixture
```

and:

```text
cold first Sprue
warm Sprue
warm upper resize
warm lower resize
1 Sprue
3 Sprues
```

Final report must include before/after evidence.

---

# 9. Phase 2 — Repair Geometry Identity and Cache Correctness

Do this before deeper caching.

## 9.1 Geometry version contract

A Sprue-produced body geometry version must change whenever generated geometry can change.

At minimum include deterministic identity for:

```text
upstream body geometryVersion
operationId
anchor position
inward direction
main diameter
entry-neck diameter
entry-neck length
current mold/cavity revision identity
```

Add other proven geometry-affecting inputs if required.

Never use time/randomness/object memory identity.

## 9.2 Cache key contract

Audit every input consumed by `SprueGenerationService.generate()`.

Worker-side cache keys must cover every geometry-affecting input.

Document why the key is complete.

## 9.3 Mandatory cache tests

```text
A unchanged, B resized
→ A reusable
→ B recomputes
```

```text
A resized, B unchanged
→ A recomputes
→ B recomputes if A changed B's input body
```

```text
same operationId + different main diameter
→ different geometryVersion
```

```text
same operationId + different entry-neck diameter
→ different geometryVersion
```

```text
same operationId + different position
→ different geometryVersion
```

```text
exact same authoritative input
→ cache reuse remains valid
```

Also test ordered `A → B → C` prefix/suffix behavior.

---

# 10. Phase 3 — Frame-Coalesce Placement Pointer Work

Current Sprue placement must stop doing expensive work at raw pointer-event frequency.

Implement:

```text
pointermove
→ store latest pointer state
→ if RAF already scheduled: stop
→ RAF callback processes latest state once
```

Required structural budget:

```text
<= 1 expensive placement update per animation frame
```

Do not use arbitrary debounce milliseconds.

On click boundary, ensure the latest pointer position is used. If necessary, flush latest pointer state once synchronously.

Cancel pending RAF on:

```text
deactivation
dispose
pointerleave
model replacement
mold-root replacement
```

Test many pointermove events before one RAF and assert one expensive update using the latest coordinate.

---

# 11. Phase 4 — Add Local BVH Acceleration Only if Profiling Requires It

After RAF coalescing, measure again.

If mold/cavity raycasts remain a significant cost:

- reuse existing `three-mesh-bvh`;
- scope acceleration to Sprue-owned targets;
- cache acceleration by actual geometry identity;
- rebuild only when geometry changes;
- dispose on geometry replacement/runtime disposal.

Do not globally patch Three.js prototypes.

Required correctness comparison:

```text
reference top hit == accelerated top hit
cavity hit distance within tolerance
miss remains miss
```

---

# 12. Phase 5 — Eliminate Metadata-Only Full Mold Rebuilds

This is a major main-thread objective.

A new `ReferenceMoldDefinition` wrapper object does not necessarily mean new body geometry.

Create a narrow rendering geometry identity that changes when:

```text
body set changes
body mesh changes
reference mold bounds change
model/frame identity changes
```

and does NOT change merely because:

```text
Sprue validation status changed
pending Sprue profile changed
Registration changed generated → generating without body geometry change
document metadata changed
```

Do not hash full mesh arrays every React render.

Prefer existing immutable body/mesh identities and explicit geometry versions.

Required proof:

```text
pending diameter update
→ Sprue proxy updates
→ full reference mold body rebuild count = 0
```

and:

```text
final body mesh changes
→ correct geometry rebuild occurs
```

---

# 13. Phase 6 — Stop Rebuilding Edge Geometry for Unchanged Bodies

Current Sprue glass/feature visualization can recreate `EdgesGeometry`.

Preserve visual intent but avoid repeated extraction for unchanged geometry.

Allowed approaches:

- reuse existing feature edges;
- cache Sprue glass edges by source geometry identity;
- change only material state when geometry is unchanged.

Do not delete useful edge visualization merely for speed unless current behavior proves it is redundant and the visual result remains equivalent.

Dispose cached edges correctly on geometry replacement/dispose.

---

# 14. Phase 7 — Fix Resize Snap-Back

Separate:

```text
cancel
```

from:

```text
normal commit pending
```

Normal pointer release must not execute the same visual revert used by Escape/cancel.

During pending commit:

```text
requested diameter remains visible
```

until:

```text
final current success
```

or:

```text
current failure → rollback
```

Both upper/main and lower/entry-neck openings must follow this lifecycle.

Numeric entry must use the same lifecycle.

---

# 15. Phase 8 — Fix Pending Presentation Precedence

Current presentation has both:

```text
sprueDefinitions
resolved sprues
```

Define explicit precedence.

For a resolved current definition:

```text
render resolved geometry data
```

For a pending local profile edit:

```text
render current authoritative intent fields
  anchor
  inward direction
  profile
```

Do not allow stale resolved `profile` or `position` to visually override a newer pending intent.

Any reused resolved metadata such as depth/target IDs must be explicitly proven safe for presentation and must not imply final truth.

Pending status must remain visually truthful.

---

# 16. Phase 9 — Replace Busy-Reject With Bounded Latest-Wins

Current behavior must no longer reject a valid new resize merely because an older Sprue evaluation is running.

Required state machine:

```text
IDLE

commit A
→ authoritative intent A
→ active A
→ RUNNING

B arrives while A runs
→ authoritative intent becomes B
→ A becomes non-committable
→ pendingLatest = B

C arrives
→ pendingLatest B replaced by C

A ends
→ discard if stale
→ run C if present
→ otherwise IDLE
```

Maximum:

```text
1 active
1 pending latest
```

No unbounded queue.

A newer intent must invalidate old commit eligibility immediately.

---

# 17. Worker Cancellation Reality

The persistent Worker may receive a cancellation message while synchronous WASM work is already running.

Do not assume cancellation instantly frees the Worker.

The coordinator must remain correct when old computation completes before the Worker can service the next message.

Preserve persistent Worker reuse.

Do not terminate/recreate the Worker on every resize.

---

# 18. Public Action Semantics

Define action return meaning clearly.

Preferred contract:

```text
true = valid intent accepted/enqueued/coalesced
false = invalid input/precondition
```

Do not make `true` ambiguously mean “all final geometry already finished.”

If callers/tests currently depend on old completion semantics, refactor coherently and document the new contract.

---

# 19. Phase 10 — Make Create Feel Accepted Immediately

Valid Sprue click should hand off:

```text
placement ghost
→ pending Sprue presentation
```

immediately after intent acceptance.

Do not require the user to wait for full Sprue Boolean + Registration before the action feels accepted.

Prevent duplicate click creation.

Do not show overlapping placement ghost + pending Sprue after acceptance.

On final failure:

```text
pending presentation removed/reverted
previous committed mold preserved
truthful failure exposed
```

---

# 20. Phase 11 — Preserve Atomic Final Evaluation

Final authoritative path remains:

```text
current Sprue definitions
→ Sprue generation
→ Registration against resulting bodies
→ validate request identity
→ atomic FinalMoldResult commit
```

Never authoritatively expose:

```text
new Sprue + old Registration
```

as final state.

Presentation may show pending Sprue while last-known-good committed mold remains authoritative.

---

# 21. Phase 12 — Re-Profile Worker Transfer and Deep Geometry Cost

Only after the earlier redundant work is removed.

Measure structured-clone cost for:

```text
cavityResult
definition
mold bodies
Sprue definitions
worker result bodies
```

Do not convert the entire geometry model to transferables unless this is proven to be a leading remaining cost.

If still dominant, a narrowly allowed design is Worker-resident stable context keyed by exact authoritative fingerprint.

If introduced, it must invalidate on:

```text
model replacement
Cavity replacement
Mold Scale
Segmentation topology promotion/replan
Cut by Face topology replacement
Undo/Redo to incompatible document
orientation change
```

Do not implement this merely because it sounds faster.

---

# 22. Registration Policy

Registration remains required final dependent geometry.

Do not skip it.

If Registration dominates final latency, the interaction model must still be:

```text
pending visual immediately
→ Sprue compute
→ Registration compute
→ atomic final commit
```

not:

```text
skip Registration
```

Cache Registration only if the complete dependency snapshot is exactly unchanged.

---

# 23. SprueGenerationService Optimization Rules

After higher-level fixes, profile again.

If service generation remains dominant, allowed focused optimizations include:

- cache immutable preparation keyed by exact geometry identity;
- accelerate repeated cavity triangle queries;
- remove repeated conversions that are proven redundant;
- reuse stable prepared source geometry only when Manifold ownership/delete semantics are proven.

Forbidden:

- skipping validations;
- mutating cached Manifold solids unsafely;
- leaking WASM objects;
- sharing mutable solids across concurrent requests.

---

# 24. Structural Performance Budgets — CI Enforced

Do not rely on fragile wall-clock thresholds for shared CI runners.

Enforce deterministic invariants:

```text
pointermove:
  <= 1 expensive preview update per RAF

drag:
  0 authoritative Boolean calls during pointermove

evaluation:
  <= 1 active
  <= 1 latest pending

metadata-only pending resize:
  0 full mold mesh rebuilds

superseded request:
  0 authoritative commits
  0 history entries

cache:
  unchanged valid prefix may reuse
  changed upstream geometry invalidates dependent suffix
```

---

# 25. Measured Browser Performance Evidence

Final report must show before/after p50/p95 for:

```text
tool activation
placement hover update
warm create
warm main-diameter resize
warm entry-neck resize
```

for:

```text
small
medium
large
```

fixtures.

Wall-clock values are evidence, not brittle CI gates.

If a large-model Sprue-owned main-thread hover task still exceeds roughly 50 ms after RAF coalescing, local BVH acceleration becomes mandatory.

---

# 26. Mandatory Interaction Tests

Add/update tests for:

1. many pointer moves coalesce to one preview computation per RAF;
2. latest pointer coordinate wins;
3. dispose cancels scheduled preview work;
4. click uses current placement;
5. drag preview performs no authoritative geometry work before pointerup;
6. normal pointerup keeps new visual diameter;
7. Escape restores old diameter;
8. current final failure rolls back pending visual;
9. upper diameter respects lower opening coupling;
10. lower opening never exceeds main diameter;
11. numeric entry uses identical pending lifecycle;
12. controls re-enable correctly;
13. pending Sprue does not hide unrelated mold bodies.

---

# 27. Mandatory Latest-Wins Tests

```text
A running
B arrives
→ B accepted
→ A cannot commit
```

```text
A running
B arrives
C arrives
→ B replaced by C
→ only C remains pending
```

```text
stale A success
→ no current-state clobber
```

```text
stale A failure
→ no current-state clobber
```

```text
current final request succeeds
→ one final commit
```

```text
superseded requests
→ zero Undo entries
```

```text
final current resize
→ one coherent history entry
```

---

# 28. Mandatory Viewport Identity Tests

Metadata-only case:

```text
Sprue definition becomes pending
mold body mesh unchanged
→ no full BufferGeometry rebuild
→ no full feature-edge rebuild
```

Final geometry case:

```text
new authoritative mold bodies arrive
→ geometry rebuild occurs
```

Model replacement case:

```text
old BVH/edge caches disposed
new geometry receives fresh caches
```

Appearance mode case:

```text
solid/ghost appearance still updates correctly
```

---

# 29. Mandatory Cache Correctness Tests

For ordered Sprues `A → B → C`:

### Edit C

```text
A reusable
B reusable
C recomputed
```

when upstream identity is unchanged.

### Edit B

```text
A reusable
B recomputed
C recomputed if B changes C input bodies
```

### Edit A

```text
A recomputed
B/C dependent cache invalidated as required
```

Do not assert cache reuse where mathematical dependency does not permit it.

---

# 30. Cross-System Regression Matrix

After each major implementation phase and again at the end, verify:

## Cavity

```text
creation
fallback
worker stale guards
current Cavity remains Sprue upstream
```

## Registration

```text
runs against final current Sprue bodies
protected regions use current resolved Sprues
old Registration never finalizes a newer Sprue intent
```

## Cut by Face

```text
plane add
drag
remove
Eraser
Done
Undo/Redo
```

## Segmentation

```text
planning
preview
execution
promotion
extension axis
Mold Scale regeneration
```

## Mold Scale

```text
topology invalidation
Sprue intent pending revalidation
Registration invalidation
cache invalidation
```

## Model replacement

```text
old pending Sprue work staled/cancelled
old BVH/edge resources disposed
new model starts clean
```

## Orientation

```text
incompatible Sprue/geometry cache state does not survive orientation invalidation
```

---

# 31. Real Browser Proof

Add one deterministic browser proof using real production modules.

At minimum:

```text
real browser
→ persistent Worker
→ real Manifold/WASM
→ create one Sprue
→ resize main diameter
→ resize entry-neck diameter
→ final current result commits
→ resulting geometry identity changes appropriately
→ no page error
→ no console error
```

If practical, include:

```text
resize A
resize B before A finalizes
→ final state = B
→ A cannot commit
```

Do not mock Manifold in this browser proof.

---

# 32. Resource Ownership and Disposal

Audit ownership of:

```text
RAF IDs
BVHs
Three geometries
edge geometries
materials
event listeners
worker-side caches
pending coordinator closures
Manifold solids
```

On runtime disposal/model replacement, Sprue-owned resources must be releasable.

Do not retain old large geometry indefinitely through cache references.

---

# 33. No-Tech-Debt / No-Shortcut Rules

Do not:

- lower Sprue segments;
- lower geometry tolerances;
- lower Cavity quality;
- skip Registration;
- hide latency with only a spinner;
- reject all edits while busy;
- queue every edit;
- let stale work commit;
- mutate `lastCommittedResult` optimistically;
- export pending proxy geometry;
- hash full large meshes on every render;
- rebuild all mold geometry for metadata-only updates;
- create a second Sprue store;
- create a second general worker system;
- recreate Worker/WASM per resize;
- globally monkey-patch Three without proof;
- add a generic queue/caching dependency;
- introduce arbitrary debounce latency;
- change Cavity/Sprue/Registration authority order;
- disable tests;
- suppress errors;
- preserve old broken busy-reject behavior through compatibility wrappers.

---

# 34. No-Compatibility-Shell Rule

When replacing an obsolete path, simplify/delete it.

Do not leave:

```text
old rebuild path
new rebuild path
adapter between them
```

unless a real current caller requires it.

Repository evidence is authority.

---

# 35. No-Duplicate-Freshness-System Rule

If the latest-wins coordinator needs a local sequence token, it must be subordinate to the existing MoldDocument/request identity.

Do not create an independent truth system that can disagree with:

```text
revision
fingerprint
requestId
```

---

# 36. Failure Semantics

## Invalid input

```text
not accepted
no pending visual
no worker work
```

## Accepted pending intent

```text
authoritative intent recorded
pending presentation visible
final geometry not yet committed
```

## Superseded work

```text
not user-visible failure
no commit
no history
```

## Current final failure

```text
evaluation leaves evaluating
pending presentation rolls back
last valid committed result preserved when policy allows
truthful error exposed
```

---

# 37. Recommended Implementation Order

1. Reproduce + instrument.
2. Fix geometryVersion/cache correctness.
3. Run Sprue correctness tests.
4. Add placement RAF coalescing.
5. Re-measure.
6. Add local BVH only if needed.
7. Make reference mold rendering geometry-identity-aware.
8. Prevent repeated unchanged edge extraction.
9. Fix pending selector precedence + resize snap-back.
10. Implement bounded latest-wins coordinator.
11. Make create handoff immediately to pending presentation.
12. Re-profile Worker/Registration.
13. Add deeper Worker-resident reuse only if still justified.
14. Run full cross-system regression.
15. After user-authorized push, verify exact remote SHA.

---

# 38. Stop Conditions

Stop and report instead of forcing the optimization if:

- the proposed fix requires lowering final geometry quality;
- local BVH cannot be isolated safely;
- Worker-resident Manifold cache ownership/delete semantics cannot be proven;
- latest-wins would require bypassing document identity;
- pending presentation leaks into authoritative export;
- a fix requires redesigning the entire mold pipeline;
- a new unrelated P0/P1 correctness defect appears.

Do not trade correctness for benchmark numbers.

---

# 39. Required Local Harness

From `mold/frontend/`:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run build:e2e
npm run e2e
```

Use current repository script names if they changed.

From `mold/`:

```bash
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

From repository root:

```bash
git diff --check
```

---

# 40. Baseline Preservation

Recent verified baseline before this execution:

```text
Frontend:
  1075 passed
  5 skipped

Python:
  357 passed

Browser:
  2 passing E2E proofs

npm audit:
  0 vulnerabilities

CI:
  green exact-SHA baseline
```

Current repository is authoritative.

If counts are now higher, preserve the higher baseline.

Do not remove tests to match these numbers.

---

# 41. Definition of Complete — Interaction

```text
[ ] placement preview is frame-coalesced
[ ] pointermove performs no authoritative geometry
[ ] upper drag remains responsive
[ ] lower drag remains responsive
[ ] normal upper release does not snap back
[ ] normal lower release does not snap back
[ ] create produces immediate pending presentation
[ ] current failure rolls pending presentation back truthfully
[ ] valid newer resize is accepted while old evaluation is active
[ ] at most one latest pending intent exists
```

---

# 42. Definition of Complete — Correctness

```text
[ ] geometryVersion changes for all geometry-changing Sprue edits
[ ] Sprue cache key is complete
[ ] downstream cache invalidates on upstream geometry change
[ ] exact unchanged input can reuse cache
[ ] stale success cannot commit
[ ] stale failure cannot clobber newer state
[ ] superseded work creates no history
[ ] final current work creates coherent history
[ ] final Registration matches final Sprue bodies
[ ] pending presentation cannot become export/manufacturing geometry
```

---

# 43. Definition of Complete — Main Thread

```text
[ ] metadata-only pending updates cause zero full mold body geometry rebuilds
[ ] unchanged body geometry does not recreate feature edges
[ ] acceleration/edge caches invalidate on real geometry replacement
[ ] no resource leak on model replacement/dispose
```

---

# 44. Definition of Complete — Evidence

Final report must include before/after data for:

```text
small / medium / large fixtures

tool activation
placement hover
cold create
warm create
warm upper resize
warm lower resize
```

Also report:

```text
worker evaluations per gesture
cache hits/misses
full mold rebuild count
feature-edge rebuild count
```

No measurable improvement → do not claim complete.

---

# 45. Definition of Complete — Regression

```text
[ ] npm audit passes
[ ] typecheck passes
[ ] lint passes
[ ] production build passes
[ ] frontend full tests pass
[ ] browser E2E passes including new Sprue proof
[ ] Python Ruff passes
[ ] Python format passes
[ ] Python pytest passes
[ ] git diff --check passes
[ ] Execution 07 Quality Gate semantics remain intact
```

---

# 46. Remote Completion Rule

Do not claim remote completion from local tests.

After a user-authorized push:

1. record final SHA;
2. fetch GitHub Actions for that exact SHA;
3. verify every required job;
4. verify Quality Gate;
5. inspect unexpected skipped/failure states.

Only then print:

```text
REMOTE VERIFIED COMPLETE — SPRUE PERFORMANCE REPAIR CLOSED
```

If local proof is complete but no push was authorized:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

---

# 47. Final Report Format

Print:

```text
Decision
Starting SHA
Final SHA
Files Modified / Added / Deleted

Problem Reproduced
Baseline Measurements
Confirmed Root Causes

GeometryVersion Repair
Cache-Key Repair
Multi-Sprue Cache Proof

Placement RAF Coalescing
Raycast Strategy
BVH Strategy
Pointer Work Before/After

Resize Presentation
Upper Opening
Lower Opening
Failure Rollback

Latest-Wins Coordinator
Active/Pending Counts
Stale Success
Stale Failure
History Semantics

Viewport Geometry Identity
Full Mold Rebuild Count Before/After
Feature Edge Reuse
Resource Disposal

Worker
Persistent Worker Preserved
Cold/Warm WASM
Transfer Findings
Any Worker-Resident Context

Registration
Final Registration Preserved
Dependency Correctness

Small/Medium/Large Performance Results
Cold Create
Warm Create
Warm Upper Resize
Warm Lower Resize

Frontend
Browser
Python
Repository Integrity
Security Audit
Quality Gate

Regressions Found
Regressions Fixed
Remaining Risks
Remote CI
User Action Required
```

---

# 48. Final Intended Architecture

```text
POINTER / DRAG
  raw events
    ↓
  RAF coalescing
    ↓
  local accelerated ray query if needed
    ↓
  presentation-only proxy
```

```text
AUTHORITATIVE INTENT
  create / resize
    ↓
  validate
    ↓
  existing Sprue definition/document state
    ↓
  immediate pending presentation
```

```text
DERIVED EVALUATION
  one active request
  + one latest pending intent
    ↓
  Sprue generation
    ↓
  Registration
    ↓
  request/document identity gate
    ↓
  atomic final commit
```

```text
VIEWPORT
  pending profile/status
    → update Sprue presentation only

  actual mold body geometry changes
    → rebuild affected mold presentation
```

---

# 49. Final Instruction to Codex

You are modifying a tightly coupled CAD system.

Do not treat Sprue as an isolated UI widget.

Before changing any function, trace:

```text
who writes it
who reads it
which document identity it changes
which Worker request it owns
which cache depends on it
which final result it can replace
which Undo snapshot it affects
which Three geometry rebuild it triggers
```

The safest performance wins are:

```text
remove redundant work
coalesce obsolete work
reuse proven stable geometry
keep visual intent immediate
preserve authoritative truth
```

The unsafe shortcuts are:

```text
lower quality
skip validation
hide latency
duplicate state
bypass freshness
```

Execution 08 succeeds only when the Sprue tool is materially more responsive **and** Cavity, Registration, Split Face, Segmentation, Mold Scale, Undo/Redo, Worker freshness, and final export truth remain coherent.

When all local criteria pass, stop.

When exact remote SHA is green, stop again.

Do not expand this execution into unrelated product development.
