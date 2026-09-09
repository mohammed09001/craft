# Craft — Execution 09
## Sprue/Funnel Corrective Closure — Latest-Wins Evaluation, Pending Presentation Integrity, Edge Reuse, Browser Proof, and Measured Latency

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 09/`  
**Observed repository head while authoring this execution:** `main` at `081ef3a94db3dd3f7d58e3283d5a238603e4655c`  
**Observed latest CI while authoring:** GitHub Actions run `34313292441` — `success` on the exact observed SHA  
**Execution type:** corrective closure of incomplete Execution 08 + focused performance/correctness hardening  
**Primary subsystem:** Sprue / Funnel  
**Coupled systems that MUST be treated as one system:** Viewport, SplitFace singleton state, MoldDocument/evaluation ownership, Cavity, Registration, Reference Mold rendering, Undo/Redo, derived-evaluation Worker lifecycle, Manifold/WASM, Three.js presentation, test harness, CI.  
**Non-goal:** new product functionality.  
**Doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline.

---

# 0. Why this is Execution 09

Execution 08 exists and was executed, but the post-execution repository audit found that it is only **PARTIALLY COMPLETE — REMOTE GREEN**.

Execution 08 successfully repaired several important pieces:

- Sprue-generated body geometry identity now changes for more geometry-affecting inputs.
- The per-Sprue evaluation cache key is broader and materially safer.
- Sprue placement pointer work is frame-coalesced with `requestAnimationFrame`.
- Normal resize release no longer immediately calls the same visual revert path used by cancellation.
- Reference Mold rendering now attempts to avoid metadata-only full geometry rebuilds.
- The exact remote SHA is green through the existing CI baseline.

However, the central interaction/evaluation contract requested by Execution 08 is still incomplete.

Confirmed residual gaps at the observed head:

```text
busy-reject still exists
latest-wins scheduling is absent
pending presentation still prefers stale resolved profile/position
Create is not guaranteed to appear immediately as accepted pending intent
pending/failure rollback is incomplete
Sprue glass edge extraction still recreates EdgesGeometry
Reference Mold geometry-skip identity has an unsafe fallback when geometryVersion is absent
mandatory cache/coalescing/latest-wins/rebuild-count tests are missing
real-browser Sprue create + upper resize + lower resize proof is missing
small/medium/large before/after latency measurements are missing
npm currently reports moderate Vitest/@vitest-mocker advisories
```

This execution exists to close those residual gaps.

It must **not** re-implement the parts of Execution 08 that are already correct.

---

# 1. Mission

Make Sprue interaction behave like a modern asynchronous CAD interaction while preserving one manufacturing truth.

Target behavior:

```text
Activate Sprue
→ tool becomes responsive immediately
→ unchanged mold geometry does not trigger repeated edge extraction

Move pointer
→ latest pointer state is evaluated at most once per animation frame

Click valid placement
→ intent is accepted immediately
→ pending Sprue presentation appears immediately
→ expensive Sprue + Registration work continues asynchronously

Drag upper/main diameter
→ proxy follows pointer immediately
→ release keeps requested diameter visible
→ evaluation is scheduled in background

Drag lower/entry-neck diameter
→ same lifecycle

A running
B arrives
C arrives
→ A can no longer commit
→ B is replaced before execution
→ C is the one latest pending intent
→ at most one active evaluation + one pending latest snapshot

Current final success
→ authoritative Sprue geometry + Registration commit atomically

Current final failure
→ provisional presentation rolls back truthfully
→ last valid resolved geometry is restored where available
→ failure remains visible in state
```

Core rule:

> **The user may see pending intent immediately. Only a current successful derived evaluation may become manufacturing truth.**

---

# 2. Current Repository Evidence — Starting Point, Not an Assumption Forever

The observed head while this document was authored is:

```text
081ef3a94db3dd3f7d58e3283d5a238603e4655c
```

The observed remote CI on that exact SHA is green.

Observed frontend baseline:

```text
typecheck: pass
lint: pass
build: pass
Vitest: 183 passed files, 2 skipped
tests: 1075 passed, 5 skipped
```

Observed production bundle checks:

```text
eager app entry ≈ 392 kB
largest lazy/shared Three.js chunk ≈ 547 kB
bundle budget check: pass
production artifact check: no E2E harness leaked into normal dist/
```

Observed security baseline:

```text
npm audit --audit-level=high: pass
npm audit currently reports 2 moderate vulnerabilities
affected chain: Vitest / @vitest-mocker
```

Observed code facts that matter:

1. `evaluateDerivedMold.ts` already has per-Sprue cache reuse.
2. `SprueGenerationService` already creates deterministic Sprue geometry and performs Manifold validation.
3. `derivedMoldEvaluation.workerClient.ts` already owns a persistent Worker.
4. `spruePreview3dRuntime.ts` already has RAF coalescing.
5. `sprueResizeRuntime.ts` already distinguishes normal release from cancellation better than before Execution 08.
6. `splitFace.store.ts` still contains a busy guard equivalent to:

```text
if sprueStatus is not idle
→ reject new rebuild request
```

7. `selectSpruePresentationDefinitions` still resolves presentation fields in a way equivalent to:

```text
position = resolved.position ?? intent.position
profile  = resolved.profile  ?? intent.profile
```

which lets an older resolved Sprue visually override a newer pending intent.
8. `spruePreview3dRuntime.ts` still creates `EdgesGeometry` during glass application for unchanged mold geometry.
9. `referenceMoldBlock3dRuntime.ts` uses a geometry identity that can fall back to body id / triangle count / bounds when `geometryVersion` is missing.
10. The missing Execution 08 harness evidence was not added; the total suite increased only marginally and does not contain the required latest-wins/browser/performance proof.

These facts must be re-audited before editing.

If the repository advanced beyond this SHA, do not reset or force history. Re-derive the implementation from current `main`.

---

# 3. Gap Ledger — What Execution 09 Must Close

Execution 09 is complete only if every item below is either **CLOSED WITH EVIDENCE** or **BLOCKED WITH A REPRODUCIBLE EXTERNAL REASON**.

## Gap A — Busy-reject

Current valid edits can still be rejected merely because older Sprue evaluation is running.

Required closure:

```text
valid newer intent is accepted
older result becomes non-committable
queue remains bounded
latest intent wins
```

## Gap B — Pending presentation precedence

A pending resize can still visually regress to stale resolved `profile` / `position`.

Required closure:

```text
pending intent fields beat stale resolved fields
resolved-only metadata may be reused only when explicitly safe
```

## Gap C — Immediate Create acceptance

A valid Create action must not feel blocked by full Sprue + Registration completion.

Required closure:

```text
click
→ accepted pending intent visible immediately
→ worker continues asynchronously
```

## Gap D — Current failure rollback

A failed current request must not leave provisional geometry looking successful and must not corrupt the previous resolved result.

## Gap E — Edge extraction

Repeated Sprue activation against unchanged bodies must not rebuild equivalent `EdgesGeometry`.

## Gap F — Rendering identity safety

No geometry rebuild may be skipped merely because:

```text
same body id
same triangle count
same bounds
```

when actual mesh geometry changed and no trustworthy version exists.

## Gap G — Missing structural tests

Required latest-wins, cache-dependency, RAF, pending-presentation, edge-reuse, history, stale-result, and rebuild-count tests must exist.

## Gap H — Missing real-browser Sprue proof

Chromium must execute a real Sprue path through production Worker + Manifold/WASM.

## Gap I — Missing performance proof

Execution must produce deterministic before/after measurements, including p50/p95 where meaningful.

## Gap J — Moderate npm advisory

Re-audit current dependencies. If the reported Vitest/@vitest-mocker moderate advisory still exists, update to a patched compatible release and prove the full harness remains green. Do not use `--force`.

---

# 4. The System Promise — Mandatory Invariants

Treat this section as a contract.

## Promise A — One authoritative Sprue intent

The authoritative requested Sprue state remains in the existing mold/SplitFace domain.

Do not add a second persistent Sprue store.

A scheduling coordinator may hold ephemeral execution bookkeeping only.

It must never become a second source of manufacturing truth.

## Promise B — One authoritative final geometry path

Final Sprue geometry remains:

```text
MoldDocument
→ derived evaluation
→ Sprue
→ Registration
→ FinalMoldResult
→ current commit gate
```

Do not invent a parallel geometry commit path.

## Promise C — Pending presentation is not manufacturing truth

Pending profile, position, proxy meshes, labels, handles, colors, or status may update immediately.

They must never be used as final export or authoritative geometry.

## Promise D — Latest intent wins

For any sequence:

```text
A
B
C
D
```

where A is already running and B/C/D arrive before it finishes:

```text
A may finish computation
A must not commit
B must not run if already superseded by C/D
C must not run if superseded by D
D is the only pending snapshot that may start next
```

Bound:

```text
maximum active = 1
maximum pending latest = 1
```

## Promise E — Freshness remains explicit

Preserve or strengthen current ownership through:

```text
document.revision
document.fingerprint
requestId
sourceRevision
sourceFingerprint
canCommitMoldEvaluation-equivalent validation
```

Do not replace them with timers or object identity.

## Promise F — Cancellation is not correctness

Worker cancellation may be delayed by synchronous WASM.

Therefore:

```text
cancellation = resource optimization
commit identity = correctness
```

A stale result is safe only because it cannot commit.

## Promise G — History is commit-based

Superseded pending intents create no history entries.

A final accepted edit creates one coherent Undo history unit.

## Promise H — Cavity → Sprue → Registration order remains

Do not skip Registration for performance.

Do not make pending presentation imply Registration is current.

## Promise I — Final geometry quality is unchanged

Do not lower:

- circular segments;
- Manifold checks;
- tolerance quality;
- cavity reach validation;
- inlet fit validation;
- watertight validation;
- Registration correctness.

## Promise J — Existing Worker ownership is preserved

Keep the persistent derived-evaluation Worker.

Do not terminate/recreate it per resize.

Do not introduce a second Sprue Worker unless current architecture proves it is required and the document is amended before implementation.

## Promise K — No stale result may overwrite newer state

This includes:

```text
success
failure
progress
registration
sprueDefinitions
resolved sprues
lastCommittedResult
history
error
presentation status
```

## Promise L — Rendering optimization must fail safe

If rendering geometry identity is incomplete or unknown:

```text
rebuild
```

not:

```text
skip rebuild and hope
```

Correctness beats an unproven optimization.

---

# 5. Hard Scope

Primary likely files:

```text
mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts

mold/frontend/src/features/mold-generation/workflow/evaluateDerivedMold.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.worker.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.workerClient.ts

mold/frontend/src/features/mold-generation/sprue-generation/SprueGenerationService.ts
mold/frontend/src/features/mold-generation/sprue-generation/*
```

Viewport/runtime likely files:

```text
mold/frontend/src/features/viewport/Viewport.tsx
mold/frontend/src/features/viewport/useViewportRuntime.ts
mold/frontend/src/features/viewport/runtime/createThreeViewportRuntime.ts
mold/frontend/src/features/viewport/runtime/spruePreview3dRuntime.ts
mold/frontend/src/features/viewport/runtime/sprueResizeRuntime.ts
mold/frontend/src/features/viewport/runtime/spruePlacementRequestGate.ts
mold/frontend/src/features/viewport/runtime/referenceMoldBlock3dRuntime.ts
```

Harness/build/security only when required:

```text
mold/frontend/e2e/*
mold/frontend/src/test-harness/*
mold/frontend/scripts/*
mold/frontend/vite.config.ts
mold/frontend/package.json
mold/frontend/package-lock.json
.github/workflows/ci.yml
```

Do not modify unrelated engineering report or Generative Design code.

---

# 6. Explicit Non-Goals

Do not add:

- new Sprue types;
- runners;
- gates;
- CFD;
- filling simulation;
- AI;
- backend;
- database;
- WebGPU rewrite;
- new geometry kernel;
- new React state framework;
- RxJS;
- generic task queue library;
- generic caching framework;
- new UI design system;
- unrelated toolbar redesign;
- unrelated Cavity changes;
- unrelated Segmentation changes;
- unrelated Registration features;
- unrelated bundle architecture work.

Execution 09 is a closure execution.

---

# 7. Engineering Doctrine

Use this loop:

```text
READ
→ REPRODUCE
→ INSTRUMENT
→ ISOLATE
→ REPAIR
→ PROVE LOCALLY
→ PROVE IN REAL BROWSER
→ PROVE CROSS-SYSTEM
→ PROVE REMOTELY
→ RE-AUDIT
```

Rules:

1. Repository evidence beats assumptions.
2. Delete obsolete logic instead of stacking compatibility branches.
3. One execution coordinator only.
4. One manufacturing truth only.
5. Structural tests beat timing-only tests.
6. Timing measurements support conclusions; they do not replace correctness proof.
7. A green CI is necessary but not sufficient.
8. Do not close a requirement using a comment alone.
9. Do not claim performance improvement without before/after evidence.
10. Do not suppress a warning or test to make a gate green.

---

# 8. Phase 0 — Re-Audit Before Editing

Before changing code:

1. record exact `git rev-parse HEAD`;
2. record branch;
3. record `git status --short`;
4. compare current head to the observed SHA in this document;
5. inspect latest Actions run for current head;
6. inspect current Sprue tests;
7. inspect current Worker ownership;
8. inspect current `sprueStatus` semantics;
9. inspect all callers of:
   - `createSprue`;
   - `resizeSprue`;
   - `resizeSprueEntryNeck`;
   - `moveSprue`;
   - `removeSprue`;
   - `rebuildSprueDefinitions`;
10. inspect every consumer of `selectSpruePresentationDefinitions`;
11. inspect `createSelectActiveMoldBodies`;
12. inspect Undo/Redo snapshot shape;
13. inspect E2E harness gating so no test artifact leaks into normal production build;
14. run the full current baseline before edits.

Minimum baseline commands:

From `mold/frontend`:

```bash
npm ci
npm audit
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run e2e
```

From `mold`:

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

Do not begin implementation if the baseline is already red for an unrelated reason without documenting it.

---

# 9. Phase 1 — Reproduce the Residual Interaction Defects

Create deterministic reproductions before repair.

## 9.1 Busy-reject reproduction

Prove current behavior with controlled promises:

```text
request A starts
A remains unresolved

request B is issued

expected current defect:
B returns false / is not accepted because sprueStatus is generating
```

Capture the exact action and state transition.

## 9.2 Pending precedence reproduction

Given:

```text
resolved Sprue = 10 mm
new current intent = pending 15 mm
```

prove the current selector returns the stale 10 mm profile.

Do this before changing the selector.

## 9.3 Edge extraction reproduction

Count `EdgesGeometry` creation across:

```text
activate Sprue
deactivate Sprue
activate Sprue again
```

with unchanged body geometry.

Record current count.

## 9.4 Geometry identity risk reproduction

Construct two body presentations with:

```text
same id
same triangleCount
same bounds
different mesh payload
geometryVersion missing
```

prove whether the current identity incorrectly treats them as unchanged.

If current code already changed beyond the observed SHA and this no longer reproduces, update the evidence and do not re-fix it.

---

# 10. Phase 2 — Build a Bounded Latest-Wins Coordinator

This is the central missing Execution 08 objective.

Do not add a generic queue library.

The coordinator must be local to each SplitFace store instance.

A second store instance created by tests or another live consumer must not share coordinator state with the singleton.

Forbidden:

```text
module-global mutable activeJob
module-global mutable pendingJob
```

Preferred ownership:

```text
createSplitFaceStoreCreator()
  owns ephemeral scheduler closure
```

or equivalent per-instance ownership.

The authoritative intent still lives in store state.

The coordinator only schedules evaluation.

---

# 11. Exact Latest-Wins State Machine

Required conceptual state:

```text
active evaluation: 0 or 1
pending latest full desired Sprue snapshot: 0 or 1
history cycle base: 0 or 1
```

Do not create an unbounded array.

## 11.1 Idle → first request

Given current resolved state S0:

```text
request A arrives
```

Required:

```text
validate A
capture history base S0
accept authoritative intent A immediately
advance MoldDocument identity immediately
mark presentation pending
mark A current
start A if Worker idle
```

## 11.2 Request arrives while A runs

```text
request B arrives
```

Required:

```text
validate B
accept authoritative intent B immediately
advance current document/evaluation identity
A becomes non-committable immediately
pendingLatest = B
do not append history
do not wait for A to return before showing B
```

## 11.3 C replaces B

```text
request C arrives before A ends
```

Required:

```text
pendingLatest = C
B disappears from scheduler
authoritative current intent = C
B never executes
```

## 11.4 A succeeds after becoming stale

Required:

```text
A result arrives
commit gate fails
A writes nothing authoritative
A writes no history
A writes no current success/failure status
then start C
```

## 11.5 A fails after becoming stale

Required:

```text
A error arrives
A does not overwrite C
A does not set current evaluation failed
A does not restore old Sprue definitions
A does not set sprueStatus idle in a way that breaks C
then start C
```

## 11.6 Current latest succeeds

If C is still current:

```text
commit C atomically
push exactly one history snapshot from cycle base
clear pending coordinator state
return to idle
```

## 11.7 Current latest fails

If C is still current:

```text
set truthful terminal failure
restore last valid resolved presentation where available
do not leave fake pending geometry as success
clear scheduler state
preserve coherent history
```

---

# 12. MoldDocument and Evaluation Ownership During Coalescing

A newer accepted intent must invalidate older commit eligibility **before** the older Worker result can return.

The simplest valid shape is usually:

```text
accept new intent
→ create new document revision/fingerprint
→ create new evaluation identity for current desired state
→ publish pending intent
→ old request identity no longer matches
```

Do not delay freshness invalidation until the next Worker dispatch.

Otherwise:

```text
B accepted visually
A returns before B dispatch
A may still look current
```

which violates latest-wins.

If current `MoldEvaluationState` does not have a queued phase, prefer reusing the smallest semantically valid existing state over adding a broad new state machine.

If a new phase is required, update every consumer coherently and test it.

Do not overload `"complete"` to mean queued.

---

# 13. Public Action Semantics — Accepted Intent vs Final Completion

Execution 08 asked to separate action acceptance from expensive completion.

Execution 09 must finish that contract.

For interaction actions:

```text
createSprue
resizeSprue
resizeSprueEntryNeck
moveSprue
removeSprue
```

define return semantics clearly.

Preferred semantic:

```text
true
= request is valid and was accepted into authoritative current intent
= it may be running or coalesced as latest pending

false
= invalid input / invalid lifecycle precondition
```

Do not make the UI await full Manifold + Registration completion merely to know that its click/drag was accepted.

If existing tests/callers currently use Promise completion to infer final geometry completion:

- refactor them to observe `evaluation` / resolved state;
- do not silently change semantics without updating tests;
- document the public contract in code near the actions.

---

# 14. Phase 3 — Immediate Pending Presentation on Create

A valid placement click must feel accepted immediately.

Required sequence:

```text
valid preview exists
user clicks
→ current SprueDefinition intent is inserted immediately
→ validation = pending
→ pending Sprue presentation becomes visible immediately
→ expensive evaluation continues asynchronously
```

No requirement says the final Boolean must finish in the same frame.

The UI acknowledgment should be lightweight.

Do not synchronously run:

```text
Manifold Boolean
Registration generation
full mold BufferGeometry rebuild
full EdgesGeometry extraction
```

before pending presentation can appear.

---

# 15. Create Semantics With Multiple Sprues

A full desired Sprue snapshot is the scheduler unit.

Example:

```text
resolved set = [A]

user creates B
active evaluation computes [A, B]

before it finishes user creates C
current authoritative desired set becomes [A, B, C]
```

The pending latest job should represent:

```text
[A, B, C]
```

not merely:

```text
C
```

This keeps the derived evaluation deterministic and lets the existing per-Sprue cache reuse unchanged prefixes safely.

Do not create one independent Worker job object per Sprue.

---

# 16. Phase 4 — Fix Pending Presentation Precedence

This must be explicit, not accidental.

Inputs:

```text
SprueOperationDefinition = current requested intent
SprueDefinition          = last resolved geometry metadata
```

Required presentation rules.

## 16.1 Pending existing Sprue

If the current definition is pending:

```text
position
inwardDirection
profile
```

must come from the current definition.

Do not use stale resolved values for those fields.

Resolved metadata may be reused only if it remains geometrically meaningful and cannot make pending intent look final.

Candidate reusable fields:

```text
depthMm
targetBodyIds
```

only after audit.

If reused, status must still be `"pending"`.

## 16.2 Resolved current Sprue

When current validation is resolved and resolved Sprue exists:

```text
resolved fields may drive presentation
```

provided they correspond to the same current operation and current authoritative request.

## 16.3 Invalid current edit with previous resolved geometry

On a failed current resize:

```text
show last valid resolved geometry
status must truthfully indicate current failure
do not show failed requested profile as if committed
```

Do not silently erase the error.

## 16.4 Failed new Create with no previous resolved geometry

A failed new pending Create must not leave a fake successful Sprue.

Choose the smallest coherent existing UX:

```text
remove provisional geometry
or keep an explicit invalid/pending error marker
```

but do not let it appear resolved.

Document the chosen behavior and test it.

---

# 17. Resize Lifecycle — Preserve the Execution 08 Fix and Finish It

Execution 08 already stopped normal pointer release from immediately reverting the drag proxy.

Preserve that.

Required upper/main flow:

```text
pointerdown
→ drag proxy starts

pointermove
→ proxy scales only
→ no Boolean

pointerup
→ requested main diameter remains visible
→ current intent becomes pending
→ async evaluation starts/coalesces
→ final current success replaces proxy with resolved presentation
→ final current failure rolls back to last valid resolved diameter
```

Required lower/entry-neck flow is identical.

Numeric entry must use the same lifecycle.

Do not create three separate resize implementations.

---

# 18. Failure and Rollback Contract

Failure handling must distinguish:

```text
stale failure
current failure
cancelled obsolete work
```

## Stale failure

Writes nothing current.

## Cancelled obsolete work

Writes nothing current.

## Current failure

Must end in a terminal state.

Never leave:

```text
evaluation.phase = evaluating
sprueStatus = generating
```

forever.

Current failure must preserve:

```text
truthful error
last valid committed result
coherent Registration state
coherent Sprue resolved state
coherent document identity
```

The rollback mechanism must not restore a document revision that accidentally makes an unrelated stale result appear current.

Test exact identity fields after rollback.

---

# 19. History Contract

Do not push Undo history at intent acceptance time.

History belongs to committed user changes.

For rapid sequence:

```text
10 mm resolved
→ request 11
→ request 12
→ request 13
→ final 13 commits
```

expected history:

```text
one Undo entry
```

Undo should return to:

```text
10 mm resolved
```

not 12, 11, or a pending state.

Redo should return coherently to the committed 13 mm result or re-run the required authoritative evaluation according to the existing history contract.

Audit existing `snap()` semantics before choosing which state is stored.

No superseded request may create a history unit.

---

# 20. Worker Lifecycle — Keep One Persistent Worker

Preserve current persistent Worker reuse.

Required scheduler reality:

```text
A is running inside synchronous WASM
B arrives
cancel(A) message may not be processed immediately
```

Correct behavior is still:

```text
B becomes authoritative current intent immediately
A becomes non-committable immediately
B is pendingLatest
A eventually returns
A is discarded
B starts
```

Do not solve this by terminating the Worker on every interaction.

Do not spawn a Worker per Sprue.

Do not spin on cancellation.

---

# 21. Progress Semantics

Old progress must not overwrite current progress.

If A is stale and emits:

```text
sprues 80%
registration 20%
```

after B became current, those progress events must not be presented as B progress.

Gate progress by request identity.

If current Worker protocol does not carry sufficient identity on progress, strengthen it narrowly.

Do not create a second progress system.

---

# 22. Phase 5 — Validate and Complete Per-Sprue Cache Correctness

Execution 08 improved cache keys.

Execution 09 must prove them.

Do not assume the cache is correct because the key looks longer.

Required tests must verify actual call reuse/recompute behavior.

## 22.1 Unchanged prefix reuse

```text
A resolved
B resized

A input unchanged
→ A generation reused

B input changed
→ B generation recomputed
```

## 22.2 Upstream change invalidates downstream

```text
A resized
B definition unchanged

A output body geometry changes
→ B's upstream moldRevision changes
→ B recomputes
```

## 22.3 Three-Sprue chain

```text
A → B → C
```

Cases:

```text
C-only edit
→ A reuse
→ B reuse if exact upstream identical
→ C recompute

B edit
→ A reuse
→ B recompute
→ C recompute because B output changed

A edit
→ A recompute
→ B recompute
→ C recompute
```

## 22.4 Same operationId, changed profile

Test:

```text
main diameter
entry-neck diameter
entry-neck length
position
inward direction
```

Each geometry-affecting change must invalidate the right cache path.

## 22.5 Exact repeat

Exact same authoritative snapshot may reuse cached result.

---

# 23. Cache Observability for Tests

Do not expose production cache internals globally merely for tests.

Allowed narrow approaches:

- injectable service factory in test;
- test-only callback;
- deterministic service spy at module boundary;
- exported pure cache-key helper if it is genuinely useful domain logic.

Avoid:

```text
window.__sprueCache
global mutable test counters in production
```

---

# 24. Phase 6 — Stop Rebuilding Sprue Glass Edges for Unchanged Geometry

Current tool activation still performs expensive edge extraction.

Required target:

```text
first activation on geometry G
→ edge geometry may be created

deactivate
→ visual hidden/restored
→ reusable edge geometry retained if safe

reactivate on same geometry G
→ 0 new EdgesGeometry extraction

geometry changes to H
→ stale cached edges disposed
→ new edges generated for H
```

Preferred identity:

```text
actual BufferGeometry object identity
```

inside the Three runtime is acceptable because this cache is presentation-local and the BufferGeometry object is the actual source object.

Do not use body id alone.

Do not use triangle count alone.

Do not leak cached geometry after mold replacement/disposal.

---

# 25. Edge Cache Ownership

The Sprue runtime owns its glass-edge cache.

Do not create a global cache.

Suggested structure:

```text
Map<BufferGeometry, EdgeCacheEntry>
```

or equivalent iterable ownership.

A WeakMap alone is insufficient if explicit deterministic disposal cannot be performed.

Each entry must have clear lifecycle:

```text
create
attach/show
hide
detach/dispose on source removal
dispose all on runtime disposal
```

Do not duplicate feature edges indefinitely on repeated activation.

Test child counts as well as construction counts.

---

# 26. Phase 7 — Make Reference Mold Geometry Identity Fail Safe

Execution 08 added an optimization to skip Reference Mold rebuilds for metadata-only changes.

Preserve the optimization.

Close the correctness risk.

Current unsafe concept:

```text
body id
triangle count
bounds
geometryVersion ?? null
```

is not a sufficient proof of unchanged geometry when `geometryVersion` is absent.

Required contract:

```text
if every body has trustworthy geometry identity
→ skip allowed when identities match

if any body identity is unknown/incomplete
→ rebuild
```

Never:

```text
missing version on old body
missing version on new body
same bounds/triangle count
→ assume same geometry
```

---

# 27. Geometry Version Strategy

Prefer the smallest safe strategy.

Option A — strongest:

Make deterministic `geometryVersion` a required invariant for authoritative Mold body geometry produced by the current pipeline.

Option B — safe local fallback:

If a body lacks trustworthy version:

```text
identity reliability = false
→ do not use metadata-only skip
```

Do not solve this by hashing millions of vertex values during every React render.

Do not use random version values.

Do not use timestamps.

If version contract is extended, it must change whenever the mesh payload can change.

---

# 28. Reference Mold Rebuild Tests

Required:

```text
same body geometry
new wrapper object
pending Sprue status/profile changes
→ full body BufferGeometry rebuild count = 0
```

Required:

```text
same id
same bounds
same triangle count
different geometryVersion
→ rebuild = 1
```

Required:

```text
same id
same bounds
same triangle count
missing trustworthy version
different mesh payload
→ rebuild occurs
```

Required:

```text
actual body geometry unchanged
registration metadata changes only
→ no full body rebuild
```

Do not test only returned identity strings.

Test the expensive rebuild side effect.

---

# 29. Phase 8 — Keep RAF Coalescing Correct

Execution 08 added frame coalescing.

Do not rewrite it unless the reproduction shows a defect.

Add the missing structural proof.

Required test:

```text
pointermove x 100 before RAF callback
→ expensive placement update count = 1
→ update uses the latest pointer coordinate
```

Required:

```text
new pointermove after next frame
→ second update count = 1 for that frame
```

Required cancellation:

```text
deactivate before queued RAF
→ queued placement work does not run
```

Required click boundary:

```text
latest pointermove pending
click occurs
→ committed placement uses latest pointer state
```

No arbitrary millisecond debounce.

---

# 30. Phase 9 — Immediate Create + Latest-Wins Integration

This is where separate fixes become one coherent product behavior.

Example:

```text
user clicks Create A
→ A pending visible immediately
→ A evaluation starts

before A finishes
user moves/edits A
→ current intent A2 visible immediately
→ old A evaluation stale

before old A ends
user adds B
→ current desired set [A2, B]
→ pending latest snapshot replaced

old A ends
→ discarded
→ [A2, B] evaluation runs
→ final current success commits once
```

Required:

```text
no busy reject
no unbounded queue
no old success commit
no old failure clobber
no extra history
```

---

# 31. Remove or Replace the Busy Guard

A guard equivalent to:

```text
if sprueStatus !== idle
  return false
```

must not remain as the normal gate for valid newer Sprue intent.

Keep lifecycle rejection only for genuine invalid preconditions, such as:

```text
no current mold definition
no cavity when required
invalid numeric profile
tool lifecycle forbids Sprue
model replaced
```

Do not use busy state as correctness.

---

# 32. Keep State Names Truthful

Audit `sprueStatus`.

If it remains:

```text
idle | generating
```

define what `generating` means after coalescing:

```text
there is active or queued current Sprue evaluation work
```

or equivalent.

Do not let it mean only “Worker currently executing this exact request” if the UI relies on it for current pending state.

If a richer state is genuinely necessary, keep it minimal.

Do not create a generalized workflow engine.

---

# 33. Phase 10 — Real Browser Sprue Proof

Unit tests are insufficient.

Execution 09 must add real Chromium proof using the production toolchain.

Minimum required geometry proof:

```text
real browser
→ production Worker
→ real manifold-3d/WASM
→ deterministic mold/cavity fixture
→ real Sprue generation
→ Boolean result
→ Registration path
→ no page errors
→ no console errors
```

Minimum required interaction proof:

```text
pending Create accepted
→ resolved

upper/main resize
→ pending requested diameter remains visible
→ resolved final requested diameter

lower/entry-neck resize
→ pending requested diameter remains visible
→ resolved final requested diameter
```

---

# 34. Preferred Browser Test Path

Preferred:

```text
production preview
→ normal Craft app
→ deterministic STL import
→ create/obtain mold
→ create Cavity
→ activate Sprue
→ place Sprue
→ resize upper
→ resize lower
```

Use this if it is deterministic and maintainable.

Do not choose brittle arbitrary pixel coordinates merely to satisfy a checkbox.

If direct 3D UI picking is objectively too brittle for CI, use the fallback in the next section.

---

# 35. Allowed Browser Harness Fallback

A test-only browser harness is allowed only if it uses actual production code.

It must:

- run in real Chromium;
- import the production SplitFace/Sprue state;
- use the production derived-evaluation Worker;
- load real manifold-3d/WASM;
- execute real Sprue Boolean geometry;
- execute current pending/latest-wins coordinator;
- verify requested and resolved profile transitions;
- remain excluded from normal production `dist/`.

It must not:

- mock Manifold;
- replace the Worker with a fake;
- duplicate Sprue math;
- run only in Node/jsdom;
- bypass current store/evaluation code;
- ship in ordinary production output.

Preserve the existing production artifact guard.

---

# 36. Browser Proof — Multi-Edit Latest-Wins

Add at least one real-browser sequence:

```text
resolved diameter = D0

request D1
immediately request D2
immediately request D3

expected:
presentation reaches pending D3
final resolved diameter = D3
D1 result cannot commit
D2 need not execute if coalesced before dispatch
no unhandled rejection
no console error
```

Do not make the test depend on a fixed Worker duration.

Use deterministic control where possible around dispatch sequencing, but real geometry must still run.

---

# 37. Phase 11 — Performance Instrumentation

Execution 09 cannot close the performance problem without measurement.

Measure two latency classes separately.

## Class A — Interaction acceptance latency

Examples:

```text
tool activate → visual ready
valid click → pending intent visible
pointerup → pending requested diameter visible
```

These should be main-thread lightweight.

## Class B — Authoritative completion latency

Examples:

```text
accepted Create → resolved Sprue + Registration commit
accepted resize → resolved final commit
```

These include Worker/Manifold/Registration cost.

Do not combine them into one number.

---

# 38. Deterministic Performance Fixtures

At minimum measure:

```text
small
medium
large
```

and:

```text
1 Sprue
3 Sprues
```

Scenarios:

```text
cold first Create
warm Create
warm main-diameter resize
warm entry-neck resize
rapid 3-edit burst
tool deactivate/reactivate on unchanged geometry
```

Use the same fixtures before and after.

Record environment:

```text
browser
Node
OS
CPU if available
build mode
commit SHA
```

---

# 39. Before/After Measurement Contract

Capture baseline from the pre-edit exact SHA.

Then capture post-edit from the final candidate SHA.

For repeated scenarios, report:

```text
n
min
median / p50
p95
max
```

where repeat count is sufficient to make p95 meaningful.

Do not report a single fastest run.

Do not cherry-pick.

---

# 40. Structural Performance Proof

Timing can fluctuate.

Therefore Execution 09 also requires structural counts.

Required metrics:

```text
raw pointermove count
expensive placement calculation count
Sprue evaluation dispatch count
Sprue generation call count per operation
Reference Mold full geometry rebuild count
EdgesGeometry construction count
history entries created
stale result commit attempts accepted = 0
```

These are stronger than wall-clock numbers for regression protection.

---

# 41. Required Performance Outcomes

Hard structural requirements:

```text
many pointermoves in one frame
→ <= 1 expensive placement update

N rapid resize intents during one active evaluation
→ <= 2 evaluations total
   (the already-active request + the final latest pending request)

unchanged mold reactivation
→ 0 new EdgesGeometry extraction after cache warm-up

pending profile-only edit
→ 0 full Reference Mold body rebuilds

stale result
→ 0 authoritative commits

superseded intents
→ 0 history entries
```

Wall-clock outcome:

The final report must demonstrate that immediate acceptance latency materially improves or remains already near-frame-bound, and that rapid-edit total work materially decreases.

If measured authoritative Worker completion itself does not become much faster because Manifold/Registration remains the dominant cost, that is acceptable only if:

- interaction acceptance is immediate;
- redundant evaluations are eliminated;
- cache behavior is correct;
- the final report says so precisely.

Do not claim the Boolean kernel became faster if it did not.

---

# 42. Phase 12 — Moderate npm Advisory Closure

Re-run:

```bash
npm audit
```

at execution time.

If the observed Vitest/@vitest-mocker moderate advisory remains:

1. identify the first patched compatible Vitest release;
2. update `package.json` intentionally;
3. update lockfile with normal npm resolution;
4. do not use `npm audit fix --force`;
5. run the full frontend suite;
6. run browser tests;
7. re-run audit.

The prior audit suggested a patched Vitest `4.1.11`, but do not hard-code that if current advisory data has changed.

Acceptance:

```text
no known high/critical
no known fixable moderate advisory in the current direct dev-tool chain
```

If a moderate remains only because no patched compatible version exists, provide the exact advisory, dependency path, exposure, and upstream status. Do not silently ignore it.

---

# 43. Do Not Reopen Controlled Third-Party Manifold Warning

The existing Vite `node:module` externalization warning from `manifold-3d` has already been proven non-blocking by real Chromium Manifold geometry execution in prior stabilization work.

Execution 09 should not add speculative polyfills or forks merely to silence it.

Only revisit it if the new real Sprue browser proof actually fails because of that import.

---

# 44. Preserve Bundle and Production Artifact Baseline

Normal production build must still prove:

```text
no E2E harness artifacts in ordinary dist/
```

Preserve current budget enforcement.

Do not:

- increase bundle thresholds to hide regressions;
- eagerly import the geometry engine into the main app entry;
- duplicate Three.js;
- duplicate manifold-3d;
- add a second Worker bundle unnecessarily.

Final bundle should remain within existing repository budgets.

---

# 45. Mandatory Unit/Integration Test Matrix

Add tests for all of these.

## Latest-wins

```text
A active, B arrives
→ B accepted

A active, B then C
→ B replaced by C

A stale success
→ cannot commit

A stale failure
→ cannot clobber C

A stale progress
→ cannot become C progress

A completes, C pending
→ C starts

C current success
→ commits once

C current failure
→ terminal failure + coherent rollback
```

## Queue bounds

```text
100 rapid intents during one active request
→ pending queue size never exceeds 1
→ only final pending snapshot executes next
```

Do not expose queue size in production API solely for the test if behavior can be asserted through dispatch counts.

---

# 46. Mandatory Presentation Tests

```text
resolved 10 mm + pending intent 15 mm
→ presentation profile = 15 mm
→ status = pending
```

```text
resolved old position + pending moved position
→ presentation position = pending position
```

```text
pending main diameter
→ bottom/entry-neck constraints remain coherent
```

```text
pending entry-neck diameter
→ main diameter remains coherent
```

```text
current failure after prior resolved
→ presentation returns to prior valid resolved geometry
→ failure remains truthful
```

```text
failed new Create with no prior resolved
→ no fake resolved Sprue remains
```

---

# 47. Mandatory Resize Runtime Tests

Upper/main:

```text
pointerup normal
→ no immediate revert
```

Lower/entry-neck:

```text
pointerup normal
→ no immediate revert
```

Cancel:

```text
Escape
→ revert preview
→ no commit intent
```

Pointer cancel:

```text
pointercancel
→ revert preview
```

Numeric edit:

```text
Enter valid value
→ same pending lifecycle
```

Failure:

```text
current async failure
→ resolved visual rollback
```

---

# 48. Mandatory Edge Reuse Tests

Count edge geometry construction.

```text
activate first time
→ N edge geometries

deactivate
activate unchanged
→ still N total, not 2N
```

Then:

```text
replace one source geometry
→ exactly affected edge entry recreated
```

Then:

```text
dispose runtime
→ every cached EdgeGeometry disposed
```

Test no duplicate edge child accumulation.

---

# 49. Mandatory Rendering Identity Tests

Test actual rebuild calls.

Do not test only JSON identity strings.

Cases:

```text
new wrapper, same trustworthy body versions
→ no full rebuild
```

```text
same metadata, changed trustworthy version
→ rebuild
```

```text
missing trustworthy identity
→ fail-safe rebuild
```

```text
pending Sprue status/profile only
→ no full mold rebuild
```

---

# 50. Mandatory Cache Tests

At least:

```text
same op + same exact input
→ reuse

same op + different main diameter
→ recompute

same op + different entry-neck diameter
→ recompute

same op + different entry-neck length
→ recompute

same op + different position
→ recompute

A changed
→ downstream B recompute

B changed
→ unchanged prefix A reused

C changed
→ A/B reused when exact upstream unchanged
```

Use deterministic spies/counters.

---

# 51. Mandatory Undo/Redo Tests

Test:

```text
resolved D0
rapid D1 → D2 → D3
D3 commits

undo
→ D0 coherent result

redo
→ D3 coherent result
```

Verify:

```text
sprueDefinitions
resolved sprues
registration
document
evaluation
lastCommittedResult
```

No pending state may be restored accidentally.

---

# 52. Cross-System Regression — Cavity

Sprue scheduler changes must not break Cavity ownership.

Required:

```text
Cavity unavailable
→ Sprue preconditions truthful

new Cavity replaces topology
→ old Sprue geometry invalidated
→ Sprue intent handled according to existing policy

Cavity current generation
→ no unsafe concurrent authoritative Sprue commit
```

Do not weaken the existing Cavity/Sprue dependency.

---

# 53. Cross-System Regression — Registration

Registration is downstream of Sprue.

Required:

```text
pending Sprue intent
→ old Registration may remain presentation only if explicitly safe
→ must not be marked current final truth

current Sprue success
→ Registration generated from new Sprue bodies

stale Sprue success
→ stale Registration cannot commit

current Sprue failure
→ Registration state remains coherent with rollback
```

---

# 54. Cross-System Regression — Segmentation / Cut by Face

Do not break existing topology replacement behavior.

Required existing suites must remain green around:

- Cut by Face;
- Eraser;
- Segmentation;
- segmentation extension axes;
- Mold Scale;
- Cavity;
- Registration;
- Sprue intent preservation/demotion;
- body visibility;
- last-known-good presentation.

Execution 09 is not allowed to simplify Sprue by weakening those systems.

---

# 55. Cross-System Regression — Viewport

Verify:

```text
tool activation
pending Create
pending resize
resolved success
failure rollback
undo
redo
model replacement
orientation change
dispose/remount
```

No leaked listeners.

No leaked RAF.

No leaked edge geometry.

No duplicate handles.

No stale proxy after model replacement.

---

# 56. Model Replacement / Orientation Cancellation

If model/orientation changes while Sprue evaluation is active or pending:

```text
active result becomes stale
pendingLatest is cleared
current Sprue intent follows existing reset policy
Worker may finish old computation
old computation cannot commit
```

Do not let old scheduler closure start a queued Sprue job against the replacement model.

This needs a dedicated test.

---

# 57. Store Instance Isolation

Because the repository already supports factory-created SplitFace store instances, test:

```text
store A has active Sprue evaluation
store B receives Sprue edit
```

Expected:

```text
A scheduler does not block B
A pending state does not replace B
B does not mutate A
```

Any scheduler closure must be per store instance.

---

# 58. No Duplicate Freshness Systems

Do not create:

```text
sprueEpoch
sprueGenerationNumber
sprueTimestamp
```

if existing:

```text
document revision
fingerprint
requestId
```

already provide the necessary identity.

A small coordinator sequence number is allowed only if it solves a scheduling fact not expressible by the existing identities and is documented.

Correctness commit gates must remain tied to document/evaluation identity.

---

# 59. No Polling

Do not implement latest-wins using:

```text
setInterval
setTimeout loop
poll until sprueStatus idle
```

Scheduler transitions should be event/promise driven.

No arbitrary sleep.

---

# 60. No Promise Chain Leak

A long interaction session must not create an ever-growing chain of retained promises.

At most retain references needed for:

```text
current active
current latest pending
history base
```

Clear them deterministically when the cycle ends or resets.

---

# 61. No Unhandled Rejections

Every background evaluation must have an owned completion path.

Browser test must prove:

```text
rapid edits
cancellation
failure
model replacement
```

produce no unhandled rejection and no console error.

Do not silence errors globally.

---

# 62. Performance Instrumentation Cleanup

Test-only instrumentation may remain if it is:

- isolated;
- deterministic;
- not part of normal user output;
- not global;
- not expensive.

Ad-hoc `console.time`, `console.log`, or permanent debug overlays must be removed before completion.

If durable performance counters are useful for tests, keep them behind explicit test-only ownership.

---

# 63. Lint / React Warning Discipline

Do not reintroduce:

```text
act(...) warnings
React Refresh warnings
unhandled promise warnings
console.error suppression
```

New tests must await/wrap direct store-driven React updates correctly.

---

# 64. Security Discipline

Do not use:

```text
npm audit fix --force
continue-on-error
|| true
disabled lint rule
@ts-ignore
broad eslint disable
```

to pass the harness.

Any dependency bump must be intentional and lockfile-consistent.

---

# 65. CI Discipline

The existing required jobs must remain green:

```text
Python quality
Frontend quality
Browser smoke
Repository integrity
Quality gate
Dependency review according to event policy
```

If Execution 09 adds a new E2E Sprue spec, ensure Browser smoke/job actually executes it.

Do not add a test file that CI never runs.

---

# 66. Browser Job Scope

If current `npm run e2e` or CI only selects a subset of Playwright specs, update the smallest harness configuration so the new Sprue proof runs remotely.

Do not accidentally drop the existing Cavity Manifold proof.

Final Browser job should include both:

```text
existing baseline smoke / Cavity geometry proof
new Sprue proof
```

where appropriate.

---

# 67. Production Artifact Guard

If a test-only browser harness entry is added:

Normal:

```bash
npm run build
```

must still produce:

```text
no e2e-harness.html
no Sprue test harness JS
no test-only globals
```

Browser CI may explicitly build an E2E artifact using the existing E2E-only flag/mode.

Add or extend artifact verification only if needed.

---

# 68. Bundle Guard

After changes record:

```text
eager app entry size
largest lazy/shared chunk
Sprue-related lazy chunks
Worker sizes
```

Do not regress the current eager bundle merely to solve interaction state.

No threshold inflation.

---

# 69. Full Local Verification

From `mold/frontend`:

```bash
npm ci
npm audit
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run e2e
```

From `mold`:

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

Also run targeted Sprue tests repeatedly enough to catch coordinator races.

---

# 70. Targeted Race Repetition

Run the latest-wins test suite repeatedly.

Example:

```bash
npx vitest run <sprue-latest-wins-test> --repeat <supported equivalent>
```

If Vitest has no appropriate repeat flag in the current version, use the existing supported test mechanism or deterministic loop inside a dedicated harness.

Do not add a flaky timing loop.

The goal is deterministic state-race coverage.

---

# 71. Recommended Implementation Order

Follow this order unless repository evidence proves a better dependency order.

```text
1. Baseline capture
2. Reproduce busy-reject / pending precedence / edge rebuild / identity risk
3. Latest-wins coordinator
4. Freshness/progress gating
5. Public action acceptance semantics
6. Pending presentation precedence
7. Current failure rollback
8. History semantics
9. Immediate Create
10. Cache dependency tests
11. Edge reuse
12. Reference Mold identity fail-safe
13. RAF structural tests
14. Browser Sprue proof
15. Performance measurements
16. Vitest advisory update if still applicable
17. Full local harness
18. Remote exact-SHA verification
19. Final re-audit
```

Do not optimize edges before the state coordinator is correct if doing so obscures behavior.

---

# 72. Hard Stop Conditions

Stop and report `BLOCKED` instead of improvising if:

1. current architecture cannot accept pending intent without creating a second manufacturing truth;
2. persistent Worker cannot be preserved without correctness failure;
3. a dependency update required for security breaks the suite and no compatible patched release exists;
4. real Chromium cannot load the current Sprue Worker/Manifold path for an external toolchain reason;
5. current branch contains unrelated conflicting work that changes Sprue architecture materially.

Do not bypass the blocker with a fake harness.

---

# 73. No-Tech-Debt Rules

Execution 09 must not leave:

- busy-reject for valid current Sprue edits;
- unbounded queue;
- second Sprue store;
- second freshness system;
- module-global scheduler shared across store instances;
- stale pending profile precedence;
- fake resolved pending geometry;
- history for superseded work;
- Worker recreation per resize;
- global Three.js monkey patch;
- repeated edge extraction on unchanged reactivation;
- metadata-only geometry skip with unknown identity;
- skipped required tests;
- E2E harness in production build;
- new `console.error` suppression;
- warning threshold inflation;
- audit force;
- disabled CI gate;
- unresolved current `evaluating` state after failure;
- unmeasured performance claims.

---

# 74. Required Evidence Ledger

Final report must include an evidence table with at least:

```text
Requirement
Before evidence
Code change
Test evidence
Browser evidence
Remote CI evidence
Status
```

For each gap A–J.

Do not mark a gap closed because code exists.

---

# 75. Required Performance Report

Include:

```text
Baseline SHA
Final SHA
Environment
Fixture
Scenario
Runs
p50
p95
max
structural counts
```

At minimum for:

```text
small / 1 Sprue
medium / 1 Sprue
large / 1 Sprue
medium / 3 Sprues
rapid 3-edit burst
repeat activation
```

Separate:

```text
acceptance latency
authoritative completion latency
```

---

# 76. Required Scheduler Report

Final report must state:

```text
scheduler owner
active bound
pending bound
what makes active result stale
when pending starts
how model replacement clears it
how failure ends the cycle
how history base is chosen
```

Do not describe it only as “debounced”.

The correct term is bounded latest-wins/coalescing.

---

# 77. Required Cache Report

State:

```text
exact cache-key inputs
exact body geometryVersion inputs
which edits reuse prefix
which edits invalidate downstream suffix
```

Include measured generation call counts from tests.

---

# 78. Required Rendering Report

State:

```text
how Reference Mold geometry identity is proven reliable
what happens when identity is missing
how many full body rebuilds occur during pending resize
```

Also state:

```text
how Sprue glass edges are cached
what invalidates them
how they are disposed
```

---

# 79. Required Browser Report

State:

```text
browser version
production preview or E2E-only build mode
real Worker used: yes/no
real manifold-3d/WASM used: yes/no
real Sprue Boolean: yes/no
Registration path: yes/no
upper resize: yes/no
lower resize: yes/no
latest-wins burst: yes/no
console errors: count
page errors: count
```

Anything `no` where the requirement says yes means the execution is not complete.

---

# 80. Required Security Report

State:

```text
npm audit before
npm audit after
moderate advisory IDs
dependency path
patched version selected
package-lock changed
high/critical count
```

Do not summarize as “audit passed” if moderate known advisories remain.

---

# 81. Remote Verification

Local green is not final completion.

After authorized push:

1. record exact pushed SHA;
2. inspect Actions run for that exact SHA;
3. inspect every required job result;
4. inspect Frontend logs;
5. inspect Browser logs;
6. confirm new Sprue E2E spec actually ran;
7. confirm test totals;
8. confirm audit result;
9. confirm production artifact check;
10. confirm bundle budget check.

Do not use an older green run.

---

# 82. Completion Statuses

Use only one final status.

## `REMOTE VERIFIED COMPLETE — SPRUE CORRECTIVE CLOSURE`

Use only if:

- every mandatory gap is closed;
- latest-wins is implemented and tested;
- pending precedence is correct;
- Create is immediate-pending;
- failure rollback is coherent;
- edge reuse is proven;
- rendering identity is fail-safe;
- cache dependency tests pass;
- real-browser Sprue proof passes;
- performance evidence exists;
- security advisory is closed or formally blocked by unavailable upstream fix;
- exact final SHA is green remotely.

## `LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION`

Use only if all local requirements pass but no exact pushed-SHA remote proof exists yet.

## `PARTIALLY COMPLETE`

Use if meaningful work landed but at least one mandatory requirement remains open.

## `BLOCKED`

Use when a hard external or architectural blocker prevents safe completion.

---

# 83. Strict Definition of Done

Execution 09 is done only when all of these are true:

```text
[ ] Current main re-audited before edit
[ ] Busy-reject removed for valid newer Sprue intent
[ ] Scheduler bounded to 1 active + 1 latest pending
[ ] Newer intent invalidates old commit eligibility immediately
[ ] Stale success cannot commit
[ ] Stale failure cannot clobber
[ ] Stale progress cannot clobber
[ ] Public action acceptance is immediate and documented
[ ] Create appears as pending immediately
[ ] Pending resize profile beats stale resolved profile
[ ] Pending move position beats stale resolved position
[ ] Current failure rolls back truthfully
[ ] Superseded intents create no history
[ ] Final committed rapid burst creates one history entry
[ ] Persistent Worker preserved
[ ] Cache prefix/suffix behavior proven
[ ] Edge geometry reused across unchanged activation
[ ] Cached edges disposed correctly
[ ] Reference Mold skip is fail-safe when geometry identity missing
[ ] RAF one-expensive-update-per-frame test exists
[ ] Real Chromium Sprue Boolean proof exists
[ ] Real Chromium upper resize proof exists
[ ] Real Chromium lower resize proof exists
[ ] Real Chromium latest-wins burst proof exists
[ ] Small/medium/large performance measurements recorded
[ ] Before/after p50/p95 recorded where meaningful
[ ] Structural dispatch/rebuild/edge counts recorded
[ ] Current npm audit rechecked
[ ] Fixable Vitest moderate advisory closed if still present
[ ] Typecheck green
[ ] Lint green
[ ] Build green
[ ] Vitest green
[ ] Playwright green
[ ] Python Ruff green
[ ] Python pytest green
[ ] git diff --check green
[ ] Normal production dist contains no E2E harness
[ ] Bundle budgets remain green
[ ] Exact final remote SHA green
```

If any mandatory box remains false:

```text
do not report REMOTE VERIFIED COMPLETE
```

---

# 84. Final Re-Audit After Green CI

After everything is green, perform one adversarial re-audit.

Ask:

```text
Can an old result still write anything current?
Can rapid edits still be silently rejected?
Can pending presentation still show stale resolved dimensions?
Can repeated activation still recreate edges?
Can a missing geometryVersion still suppress a needed rebuild?
Can Undo land on a superseded pending state?
Can model replacement leave pending scheduler work alive?
Can a test harness ship in production?
Can the new security version create a hidden regression?
Can a green CI still be missing the new browser Sprue spec?
```

If any answer is uncertain, investigate before completion.

---

# 85. Final Report Template

The coding agent's final report must follow this structure.

```text
Execution:
Craft Execution 09

Decision:
<one allowed status>

Starting SHA:
<exact>

Final local SHA:
<exact>

Final pushed SHA:
<exact or not pushed>

Remote Actions run:
<id or none>

A. Latest-wins
- active bound:
- pending bound:
- rapid-edit dispatch counts:
- stale success proof:
- stale failure proof:
- stale progress proof:

B. Pending presentation
- Create immediate pending:
- main diameter pending:
- entry-neck pending:
- move pending:
- failure rollback:

C. History
- superseded history entries:
- final burst history entries:
- Undo/Redo proof:

D. Cache
- geometryVersion contract:
- cache key:
- A/B/C recompute matrix:

E. Rendering
- full mold rebuild count during pending edit:
- unknown geometry identity behavior:
- edge extraction first activation:
- edge extraction second unchanged activation:
- disposal proof:

F. Browser
- real Chromium:
- real Worker:
- real Manifold/WASM:
- real Sprue Boolean:
- Registration:
- upper resize:
- lower resize:
- latest-wins burst:
- console/page errors:

G. Performance
- baseline:
- after:
- p50/p95:
- structural counts:

H. Security
- npm audit before:
- npm audit after:
- Vitest advisory status:

I. Full harness
- npm ci:
- audit high:
- typecheck:
- lint:
- build:
- Vitest:
- Playwright:
- Ruff:
- pytest:
- git diff --check:

J. Remaining limitations
<none, or exact evidence>
```

Do not hide warnings or limitations.

---

# 86. Commit and Push Discipline

Do not commit or push unless explicitly authorized by the user or the current execution environment already has clear authorization.

Before commit:

```text
all local mandatory harnesses green
performance evidence captured
final diff reviewed
no debug artifacts
no test harness leak
```

If authorized to commit:

- make a focused commit;
- do not squash unrelated historical work;
- do not force-push;
- record exact SHA.

If authorized to push:

- push current intended branch;
- verify exact-SHA remote Actions;
- do not declare completion before the run finishes.

---

# 87. Scope Protection

If implementation reveals another unrelated product defect:

1. reproduce it;
2. classify severity;
3. record it;
4. do not expand Execution 09 unless it blocks Sprue closure.

This execution should not become a generic cleanup phase.

---

# 88. Expected Outcome

When complete, a user should experience:

```text
Sprue tool activates without repeated geometry-extraction stall.

Pointer placement stays responsive.

Click feels accepted immediately.

Resize follows the pointer immediately.

Release never visually snaps to an older resolved diameter.

Rapid repeated edits are accepted rather than rejected.

Only the latest desired state is evaluated next.

Old Worker results are harmless.

Final geometry remains Manifold-validated.

Registration remains current.

Undo/Redo remains coherent.

Repeated activation does not keep rebuilding edges.

Viewport does not rebuild full mold bodies for pending metadata-only changes.

The result is proven in real Chromium and measured, not inferred.
```

---

# 89. Final Directive to the Coding Agent

Do not solve the user-visible latency problem by making the geometry cheaper.

Solve it by making the interaction **incremental, bounded, latest-wins, identity-safe, and asynchronously truthful**.

Preserve the strong geometry kernel.

Preserve the persistent Worker.

Preserve the existing document/fingerprint commit authority.

Remove the remaining busy-reject behavior.

Make pending intent visible immediately.

Ensure stale resolved metadata cannot visually override current intent.

Reuse unchanged presentation geometry.

Measure before and after.

Then prove the actual Sprue path in Chromium.

Only after that may the execution be called closed.

---

# 90. Closure Sentence

If and only if every mandatory requirement is remotely verified, the final report must end with:

```text
Craft Execution 09 is closed.
The Sprue/Funnel corrective performance and concurrency phase is complete on the exact verified green SHA.
Proceed to the next engineering phase from this baseline.
```

If any mandatory item is still open, do not use that sentence.
