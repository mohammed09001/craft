<div align="center">

# Execution continuous 06
## Master Mold — Corrective Continuation, Production Closure, and Completion of Execution 06

**Date:** 2026-09-17  
**Document Type:** Continuous Corrective + Completion Execution  
**Repository:** `mohammed09001/craft`  
**Branch:** `main`  
**Repository HEAD inspected before this continuation:** `86e254207b114ebd791cdf3f1829a7c78905e815`  
**Parent Execution:** `Master Mold Execution 06`  
**Execution Mode:** Continuous — investigate → reproduce → repair → implement → test → regress → continue.  
**Stopping Rule:** Do not pause for approval between articles. Do not create an Execution 07 merely to finish requirements already defined by Execution 06.

</div>

---

# 0. Mission

This document is not a replacement for Execution 06 and must not restart the Master Mold architecture from zero.

Execution 06 already established the correct product direction:

```text
Imported Part
    ↓
Master Mold
    ↓
Autonomous Working Mold Planning
    ↓
2..N Working Mold Pieces
    ↓
Master Tooling Planning per Working Mold Piece
    ↓
Printable Master Tooling
```

The repository now contains a real autonomous Master Mold path. It no longer fundamentally depends on Cut by Face, Segmentation, Create Cavity, or a pre-existing `ReferenceMoldDefinition`.

The purpose of **Execution continuous 06** is narrower and stricter:

> **Close every incomplete requirement, repair every correctness defect found during the Execution 06 audit, complete every unimplemented Execution 06 capability that is still required for readiness, remove transitional architecture left behind by the interrupted execution, and produce final production evidence.**

This continuation must preserve the good implementation already present.

Do not rebuild working pieces merely to make the code look different.

Do not create parallel engines beside the current autonomous engine.

Do not restore the old Execution 05 architecture.

Repository evidence is authoritative. If file names or internal APIs changed after the inspected commit, investigate the live repository first and adapt the implementation while preserving the invariants and acceptance criteria in this document.

---

# 1. Current Baseline That Must Be Preserved

The following capabilities are already materially present and should be repaired or extended rather than rewritten without cause.

## 1.1 Direct Master Mold Entry

The current Master Mold action can operate from the imported source geometry without requiring:

- `workflow === "partsReady"`;
- committed Split Face mold parts;
- cutting planes;
- Segmentation output;
- Create Cavity completion.

This product behavior must remain.

The user journey remains:

```text
Import STL
→ Master Mold
```

not:

```text
Import
→ Cut
→ Create Cavity
→ Master Mold
```

## 1.2 Master-Owned Seed Snapshot

The new Master Mold seed architecture is conceptually correct.

It is built from Master-relevant source truth such as:

- imported source model;
- source geometry identity;
- source transform;
- source bounds;
- printer build volume;
- Master process profile;
- Master planning preferences;
- project/source revision.

It must remain independent from Cavity and Split Face planning state.

## 1.3 Two-Resolution Planning Direction

The repository now follows the correct principle:

```text
Planning decides.
Exact geometry verifies.
```

A lightweight planning representation is used before full-resolution Manifold construction.

Preserve this architecture.

## 1.4 Geometry-Derived Direction Search

The current direction generator already includes more than the six world directions.

It includes geometry-derived candidates such as:

- PCA/principal directions;
- normal-cluster directions;
- world-axis baseline directions;
- both polarities.

Do not regress to ±X/±Y/±Z-only planning.

## 1.5 Global Accessibility

The current accessibility stage uses visibility/occlusion analysis and BVH reasoning before exact CSG.

Preserve the rule:

> **No exact Manifold Boolean should become the raw candidate-search engine.**

## 1.6 Adaptive Working Mold Piece Count

The current Working Mold planner can search progressively from two pieces toward higher bounded piece counts.

Preserve:

```text
2-piece feasible
→ prefer 2

2-piece impossible
→ search 3

3-piece impossible
→ search 4

continue only within configured limits
```

A failed two-piece candidate is evidence, not a product failure.

## 1.7 Exact Working Mold Construction

The repository now performs full-resolution Working Mold construction and exact release verification after planning.

Preserve:

- watertightness validation;
- manifold validation;
- positive-volume validation;
- ordered release sequence;
- collision verification;
- assembled-negative / envelope consistency checks.

## 1.8 Per-Working-Mold Master Tooling

The autonomous engine already creates Master tooling from Working Mold targets.

Preserve the distinction:

```text
Working Mold Decomposition
≠
Master Tooling Decomposition
```

The number of Working Mold pieces and the number of printed Master tooling pieces are separate decisions.

## 1.9 Real Master-Only Browser Journey

A real `/workspace` E2E now exists that imports an STL and presses Master Mold without first running Create Cavity.

Keep this path and strengthen it. Do not replace it with a store-only probe.

---

# 2. Current Readiness Decision

The interrupted Execution 06 must currently be treated as:

```text
NOT READY
```

The reason is not that the autonomous architecture failed.

The reason is that several requirements are incomplete at the exact places where production confidence matters most:

- final geometry can change after release verification;
- the performance pipeline still copies geometry unnecessarily;
- high-poly browser responsiveness is not proven;
- deep cancellation is incomplete;
- Working Mold parting intelligence is still constrained by planar prism assumptions;
- 3+ panel tooling alignment remains user-managed;
- automatic vent planning is incomplete;
- localized removable-core strategy is absent;
- actual viewport render truth is not fully tested;
- a printer-build-volume golden assertion is incorrect;
- transitional Execution 05 contracts remain;
- complete CI evidence for the interrupted HEAD is absent.

Execution continuous 06 must close these gaps before `READY`.

---

# 3. Priority Order

Repair in this order.

```text
P0-A  Final-geometry release correctness
P0-B  Performance / Worker / main-thread architecture
P0-C  High-poly browser responsiveness evidence
P0-D  Real viewport truth

P1-A  Parting intelligence correctness
P1-B  Multi-panel tooling registration
P1-C  Vent planning
P1-D  Localized removable-core strategy
P1-E  Deep cancellation + granular progress
P1-F  Golden-fixture and research-fidelity correctness

P2-A  Transitional architecture cleanup
P2-B  warnings / bundle / lint / test debt
P2-C  full production closure
```

Do not spend time on cosmetic refactors while a P0 remains open.

---

# 4. Article 01 — Reproduce the Remaining Execution 06 Failures Before Repair

## Goal

Create direct regression evidence for every known unfinished or incorrect behavior.

## Required Reproductions

Add failing or diagnostic tests for at least the following before changing production behavior.

### Case A — Registration Changes Geometry After Release Verification

Construct a Working Mold plan where automatic Working Mold registration is successfully placed.

Capture:

```text
geometry before registration
release proof before registration
geometry after registration
```

Prove that the current release proof is not automatically re-established after pin/socket geometry is applied.

The repaired test must eventually assert:

```text
final registered geometry
→ final release verification
→ collisionVerified = true
```

not merely:

```text
pre-registration geometry
→ release verified
→ registration added later
```

### Case B — Large Mesh Main-Thread Preparation

Instrument the real browser path with a deterministic high-poly imported mesh.

Measure separately:

```text
import complete
→ click Master Mold
→ seed assembly begins
→ Worker receives request
→ first Worker progress event
```

The page heartbeat must remain alive during seed preparation and Worker transfer.

A freeze before the Worker starts is still a Master Mold performance failure.

### Case C — Cancellation During Expensive Inner Work

Do not cancel only at a stage callback.

Trigger cancellation while one of these is active:

- accessibility iteration;
- piece-count search;
- Working Mold exact construction;
- repeated release sweeps;
- Master tooling multi-panel search.

The expected outcome is a bounded cancellation time and coherent store state.

### Case D — Viewport Truth

Create two Master tooling states with different mesh content and then exercise visibility.

The test must inspect actual rendered Master objects or an explicit viewport-runtime observation surface.

Checking only Zustand `pieceVisibility` is insufficient.

### Case E — Printer Z Constraint

Reproduce the existing Golden F assertion problem:

```text
printerBuildVolume = { x: 27, y: 27, z: 18 }
```

The final assertion must check:

```text
piece size X <= 27
piece size Y <= 27
piece size Z <= 18
```

not Z <= 27.

### Case F — Silhouette Interface Classification

Construct an interface where the midpoint of adjacent patch centroids is not equal to either patch centroid.

Prove that the current interface classifier cannot infer `silhouette` merely because a centroid lookup fails.

The repaired classifier must use the actual adjacent patches that created the boundary.

## Exit Condition

Each issue above has a regression test or explicit test harness that fails or demonstrates the gap against the pre-repair code.

---

# 5. Article 02 — Make Release Verification Apply to Final Working Mold Geometry

## Goal

A Working Mold piece may only be reported as release-verified when the **final geometry actually returned to the rest of the product** was verified.

## Current Risk

The current construction pipeline performs release verification before Working Mold registration pins/sockets are added.

Registration then mutates the solids.

This breaks the invariant:

```text
verified geometry
===
returned geometry
```

## Required Repair

Reorder the final stages.

Preferred sequence:

```text
Construct carved Working Mold pieces
→ validate topology
→ plan registration
→ apply registration geometry
→ validate topology again
→ recompute final piece meshes/bounds/volumes
→ run release sequencing against FINAL registered pieces
→ validate assembled final mold
→ emit WorkingMoldPieceTarget[]
```

If registration is optional because safe placement cannot be found, the final unregistered pieces may be verified, but the result must carry the explicit registration limitation already required by the product.

## Release Sequence

The final `WorkingMoldReleaseStep[]` must refer to the final piece identities and final geometry versions.

A pre-registration release sequence must never be copied forward as if it proves post-registration geometry.

## Geometry Identity

`geometryVersion` must include the final registered mesh.

Changing:

- pin placement;
- socket geometry;
- interface geometry;
- registration policy;

must change the final geometry identity.

## Exit Tests

Required:

- release verification succeeds on final geometry with pins;
- an intentionally obstructive pin arrangement is rejected or replanned;
- topology is revalidated after registration;
- release-step count equals final Working Mold piece count;
- every emitted `collisionVerified: true` was computed against final geometry.

---

# 6. Article 03 — Repair Working Mold Registration as a Physical Assembly System

## Goal

Working Mold registration must be physically meaningful and must not be a decorative metadata layer.

## Requirements

For every Working Mold interface:

- search safe alignment-feature locations;
- remain outside protected Source Part functional cavity surfaces;
- preserve minimum wall;
- preserve release paths;
- preserve connected solids;
- maintain printable feature dimensions from the process profile or geometry-only defaults;
- generate mirrored male/female behavior where applicable;
- attach feature IDs to both the interface plan and final pieces.

If an interface cannot receive automatic registration:

```text
registrationPlan.reason != null
```

must describe why.

Do not silently return:

```text
features: []
reason: null
```

for a multi-piece Working Mold.

## Multi-Interface Plans

Do not assume every non-catch-all piece only needs registration with one final catch-all piece if the actual decomposition creates other adjacency relationships.

Registration planning must derive from the final interface graph.

## Verification

After feature application:

- validate manifoldness;
- validate no functional-surface damage;
- validate release;
- validate assembly consistency.

---

# 7. Article 04 — Complete the Two-Resolution Geometry Architecture

## Goal

Keep planning cheap while improving planning quality beyond “sampled triangles treated as patches.”

## Planning Surface Graph

Upgrade the planning representation so a patch may represent a coherent local surface region rather than always one sampled triangle.

A patch builder may group adjacent triangles using bounded criteria such as:

- normal similarity;
- planarity;
- curvature continuity;
- sharp-edge boundaries;
- material/topological boundaries where available;
- connected-component boundaries.

Preserve source-triangle provenance.

## Required Fields

A useful planning patch should support at least:

```text
patch id
source triangle IDs / range
centroid
representative normal
area
adjacency
curvature proxy
planarity proxy
dominant boundary type
```

Do not require a B-Rep.

Craft remains mesh-first.

## Sampling

Large meshes may still be sampled, but sampling must not destroy the boundaries needed to detect:

- undercuts;
- blind recesses;
- ridges;
- silhouettes;
- likely parting transitions.

## Manufacturing Mesh

Never replace the original source mesh with the planning mesh for final construction.

---

# 8. Article 05 — Correct and Strengthen Parting Curve / Parting Surface Intelligence

## Goal

Close the largest remaining intelligence gap in the Working Mold decomposition.

## 8.1 Fix the Silhouette Classification Bug

Do not classify a boundary as silhouette by searching for a patch whose centroid equals the midpoint between two patch centroids.

The interface extractor already knows the two adjacent source patches.

Use those exact source patches.

A boundary may be marked `silhouette` only when its local geometry supports that classification relative to the relevant release direction.

## 8.2 Boundary Provenance

Each candidate interface should retain:

- source patch A;
- source patch B;
- release direction on each side;
- boundary samples;
- local normal behavior;
- local curvature/ridge evidence;
- visibility-transition evidence.

## 8.3 Parting Surface Types

Keep planar parting as the preferred fast path.

Add at least one general non-axis path beyond global planar prisms where the current kernel permits it safely.

Preferred progression:

```text
planar
→ oblique planar
→ ruled/extruded surface from a parting polyline
→ bounded free-form only if justified and robust
```

Do not add fragile free-form geometry merely to satisfy a label.

## 8.4 Search Policy

A geometry-derived non-axis candidate must be able to influence both:

- release direction;
- parting surface orientation.

Do not generate an oblique release direction and then force every partition back to a world-axis plane.

## 8.5 Accessibility Gain

A candidate split must have measurable planning value.

Before expensive construction, reject a candidate if it does not:

- reduce inaccessible area;
- isolate an undercut region;
- reduce unresolved patch count;
- improve release feasibility;
- or materially improve a hard manufacturing constraint.

Add instrumentation proving useless candidates are removed before exact CSG.

---

# 9. Article 06 — Complete Adaptive Working Mold Piece Search

## Goal

Keep the current 2 → 3 → 4 progressive search, but make its proof stronger.

## Requirements

For every attempted piece count, retain rejection evidence such as:

```text
unassigned surface region
unresolved undercut
no valid release sequence
parting surface invalid
exact construction failed
registration impossible under hard policy
piece too fragile
piece-count budget reached
```

Do not collapse all exact-construction failures into one generic message when more precise evidence is available.

## Minimum Verified Count

The selected plan must remain the smallest **verified** piece count, not merely the first planning approximation that looks feasible.

If all 2-piece finalists fail exact verification, continue to 3.

Do not return global failure immediately.

The search should be:

```text
planning says 2 possible
→ exact finalists fail
→ record evidence
→ continue to 3
```

This continuation behavior is mandatory.

---

# 10. Article 07 — Complete Master Tooling 1..N Decomposition

## Goal

Master tooling decomposition must be genuinely adaptive rather than “two-piece plus bounded emergency bisection.”

## Current Direction

Keep the existing recursive panel split and exact release sequencing.

## Required Completion

Improve candidate generation so tooling decomposition may be informed by:

- actual locked regions;
- target accessibility;
- Working Mold assigned release direction;
- target feature levels;
- printer build volume;
- safe flange regions;
- surface curvature/ridge boundaries where useful.

The existing fixed fractions may remain fallback candidates.

They must not be the only meaningful candidates.

## Panel Count

Respect:

```text
maximumToolingPieceCount
```

from the process profile.

The central absolute safety cap may lower, but never silently raise, the user/profile cap.

## Release

Every final panel must have:

- exact pull vector;
- exact collision proof;
- release order;
- final geometry identity.

---

# 11. Article 08 — Implement Localized Removable Core / Insert Strategy

## Goal

Close the missing middle step between “split the entire case again” and “recommend sacrificial/flexible tooling.”

## Product Logic

Required strategy order for a rigid Working Mold target:

```text
1. one-piece reusable Master case
2. multi-panel reusable case
3. localized removable core / insert for a local lock
4. additional bounded panel decomposition if justified
5. structured sacrificial/flexible-intermediate recommendation
```

The exact order between steps 2–4 may adapt to cost, but a localized core must be an available planning primitive.

## Core Candidate

A removable core is appropriate when:

- one local region causes lock;
- splitting the entire case adds unnecessary panels;
- the core has its own verified removal path;
- it can be assembled and located repeatably;
- it does not damage the functional target surface.

## Contract

Add a tooling feature/part type if required, but do not hide cores as ordinary panels without provenance.

The result should be able to explain:

```text
Working Mold 2 Master tooling:
- Case shell A
- Case shell B
- Removable core C
```

## Verification

Core insertion/removal sequence must be collision-verified.

---

# 12. Article 09 — Complete Multi-Panel Master Tooling Registration

## Goal

Remove the current limitation where automatic registration is effectively strongest only for a two-panel planar pair.

## Requirements

For 3+ panel tooling:

- build the panel adjacency graph;
- identify physical interfaces;
- place registration per interface where safe;
- support more than one pin pair / key family when required;
- keep features away from functional cast surfaces;
- preserve panel release sequence;
- preserve printable wall/flange thickness.

Do not use:

```text
3-panel tooling requires user-managed alignment
```

as the normal production answer when automatic alignment can reasonably be generated.

User-managed alignment may remain a structured fallback only when safe automatic registration cannot be proven.

## Assembly Proof

For an accepted production multi-panel tooling plan:

```text
registrationFeatures.length > 0
```

or every uncovered interface must have a precise blocking/fallback reason.

---

# 13. Article 10 — Implement Intelligent Fillability and Safe Vent Planning

## Goal

Complete Article 11 of Execution 06.

Pour access and trapped-air escape are different problems.

## Pour Face

Retain ranked Pour Face planning but extend its evidence.

For every candidate, score:

- opening area;
- cavity depth;
- fill direction;
- cleanup burden;
- trapped-air risk;
- print orientation;
- functional-surface proximity;
- tooling complexity.

## Trapped-Air Analysis

After choosing a Pour Face:

1. classify high / enclosed pockets relative to gravity/fill direction;
2. determine whether air can escape through the main opening;
3. identify pockets requiring a vent;
4. search for a path to a nonfunctional exterior tooling surface.

## Automatic Vent Rule

An automatic vent may only be generated when:

```text
vent path avoids protected functional cavity geometry
AND
vent path does not destroy registration
AND
vent path preserves wall thickness
AND
vent terminates on an accessible nonfunctional exterior
```

Otherwise:

```text
vent_required_user_review
```

with a structured pocket location / target reference.

## Prohibition

Never automatically puncture the Source Part negative surface.

Never create a vent merely because “air may be trapped” without checking its path.

## Result Contract

Include:

```text
fillability result
vent features
unresolved vent recommendations
```

in the tooling result or a dedicated Master-owned planning contract.

---

# 14. Article 11 — Repair the Worker and Memory Pipeline End-to-End

## Goal

The Worker architecture must remove main-thread and memory pressure, not merely move one later stage off-thread.

## 14.1 Avoid Full World-Position Expansion on Main Thread

Current seed construction must not eagerly transform every large source vertex into a new JS array on the main thread unless there is a measured reason.

Preferred payload:

```text
typed local positions
typed indices
source transform
local bounds
```

Then transform or reason in the Worker.

If world-space arrays are required by a specific algorithm, create them inside the Worker.

## 14.2 Typed Arrays Must Stay Typed

Do not:

```text
Float32Array
→ transfer
→ Array.from(...)
→ number[]
```

immediately after receipt.

Refactor geometry/planning interfaces to accept typed numeric arrays where practical.

Use:

```ts
ArrayLike<number>
Readonly<Float32Array>
Readonly<Uint32Array>
```

or suitable neutral contracts rather than forcing `number[]`.

## 14.3 Transfer Strategy

Use transferred buffers for the dedicated Worker copy.

The main application may preserve its own canonical buffers.

Avoid duplicate copies such as:

```text
source JS array
→ transformed JS array
→ Float32Array
→ transferred
→ new JS array in Worker
```

## 14.4 Precision Policy

Document where `Float32Array` is sufficient and where `Float64Array` is needed.

Do not silently reduce precision in manufacturing geometry without a policy.

## 14.5 Worker Result Payload

If generated meshes are large, evaluate transferring result mesh buffers back to the main thread as typed arrays.

Do not optimize only request direction while returning clone-heavy result geometry.

---

# 15. Article 12 — Deep Cooperative Cancellation

## Goal

Cancellation must work during long internal work, not only between top-level stages.

## Required Cancellation Seam

Thread a cancellation abstraction through:

```text
planning mesh construction
candidate direction loops
accessibility patch × direction loops
piece-count search
parting candidate generation
Working Mold exact finalists
Working Mold release sweeps
Master tooling candidates
recursive panel decomposition
tooling release sequencing
vent search
registration placement search
```

A helper may be used:

```ts
throwIfCancelled(signal)
```

or an equivalent lightweight token.

## Web Worker Constraint

A synchronous long loop prevents the Worker from handling a newly-arrived `cancel` message until the event loop yields.

Therefore choose one or both:

### Strategy A — Worker Termination

The main thread may terminate the entire generation Worker when cancelling.

The store must then recover coherently.

### Strategy B — Cooperative Yield

Long non-kernel loops periodically yield so a cancel message can be processed.

Do not insert excessive micro-yields into every triangle operation.

Use bounded batches.

## Manifold Calls

A single blocking kernel call may not be interruptible.

That is acceptable if:

- it is bounded;
- the candidate count is bounded;
- cancellation is checked immediately before and after;
- the UI remains responsive because the call is in the Worker.

## Exit Test

Cancel an actually expensive high-poly generation in the real browser.

Expected:

```text
button / cancel action
→ generation terminates
→ no stale result later resurrects
→ no status corruption
→ subsequent generation works
```

---

# 16. Article 13 — Granular Progress That Cannot Look Frozen

## Goal

A long but healthy generation must visibly prove that it is progressing.

## Stage Contract

Keep the named stages.

Extend progress detail with optional structured fields:

```ts
interface MasterMoldProgressStage {
  stage: ...
  stageIndex: number;
  stageCount: number;
  detail: string | null;
  elapsedMs: number;

  currentWorkingMoldPiece?: number;
  workingMoldPieceCount?: number;

  candidateIndex?: number;
  candidateCount?: number;

  attemptedPieceCount?: number;
  exactAttemptIndex?: number;
  exactAttemptBudget?: number;
}
```

Exact naming may adapt.

## Progress Events

Emit progress at meaningful bounded milestones, not for every triangle.

Examples:

```text
Analyzing geometry — 2,048 planning patches
Testing release directions — 8 / 18
Searching 3-part plan — finalist 2 / 5
Constructing Working Mold — part 2 / 3
Planning Master cases — part 1 / 3
Checking panel release — candidate 4 / 8
```

## Budget Reporting

If a planning budget is reached, surface that fact.

Do not let the user see an infinite-looking spinner.

---

# 17. Article 14 — Build the Required High-Poly Browser Performance Acceptance

## Goal

Execution 06 is not production-closed until a realistic browser path proves responsiveness.

## Fixture

Use at least one deterministic mesh significantly more complex than the 12-triangle box.

It may be:

- generated high-poly sphere;
- deterministic high-poly mechanical shape;
- checked-in compact STL fixture;
- or another repeatable source.

Prefer a shape that exercises more than convex-box logic.

## Required Real Browser Path

```text
/workspace
→ import high-poly STL
→ do not open cutting workflow
→ click Master Mold
→ Worker starts
→ UI heartbeat continues
→ progress advances
→ result or structured bounded failure
```

## Assertions

The E2E must prove:

- the Master button was enabled from imported geometry alone;
- no Create Cavity action occurred;
- no cutting plan was created;
- main-thread heartbeat advances during preparation and Worker planning;
- at least two progress stages are observed;
- no unbounded candidate explosion;
- exact CSG attempt counts remain within configured budgets;
- no browser page error;
- no fatal console error;
- the result completes or returns a structured bounded physical failure;
- the browser remains interactive throughout.

## Cancellation Subcase

During the same high-poly architecture, start another generation and cancel it mid-run.

Prove the cancellation lifecycle.

## Timing

Do not use one brittle absolute millisecond threshold as the only criterion.

Measure and report elapsed time, but acceptance is architectural responsiveness + bounded work.

---

# 18. Article 15 — Make the Browser E2E Prove Real Viewport Geometry

## Goal

A real UI test must prove that Master tooling geometry is in the Three.js scene, not merely in Zustand.

## Required Observation Surface

Add a tiny e2e-only viewport observation hook if necessary.

It may report:

```text
MasterMoldBodyGroup child count
rendered Master piece IDs
visible Master piece IDs
geometry identity per piece
```

It must not create geometry or mutate the production result.

It is observation only.

## Required E2E

After generation:

```text
store current pieces = N
viewport Master group pieces = N
IDs match
```

Then:

```text
uncheck one real UI visibility checkbox
→ corresponding Three object visible=false or removed according to runtime policy

check again
→ visible=true / restored
```

Also test isolate:

```text
Isolate Working Mold 2 Master tooling
→ only that set's pieces remain visible
```

## Geometry Refresh

Regenerate with changed Master-relevant input while keeping:

- same piece ID;
- same triangle count where possible;
- similar/equal bounds where possible.

The viewport must rebuild from the new `geometryIdentity`.

This prevents stale mesh reuse.

---

# 19. Article 16 — Fix the Golden Geometry and Research-Fidelity Test Suite

## Goal

Make the tests prove the intended research claims instead of merely following implementation assumptions.

## Golden F Repair

Fix the Z build-volume assertion.

For:

```text
{x: 27, y: 27, z: 18}
```

assert Z <= 18.

## Golden B / C Independence

For 3-piece and 4-piece fixtures, document the physical reason the lower piece count is impossible.

Do not define “3 pieces required” only because the planner currently returns 3.

Where practical, use independent geometric facts in the fixture construction.

## Golden D

Keep non-axis behavior and strengthen it.

Assert that:

- a geometry-derived direction exists;
- that direction survives pruning;
- it participates in the selected final plan;
- the same solution is not silently reconstructed using only world-axis partition logic.

## Golden E

Prove at least one Working Mold target:

```text
one-piece Master case fails exact release
→ multi-panel plan succeeds
```

Do not merely assert that the final mode is `multi-piece`.

Keep evidence of the rejected one-piece attempt.

## Golden G

Keep structured no-release/fallback behavior.

Do not create fake solids.

## Accessibility-Gain Test

Add a candidate split that provides no accessibility improvement.

Assert:

```text
rejected before exact CSG
```

Use instrumentation/counters so this is provable.

## Parting Boundary Test

Assert the selected interface points originate from actual adjacency/visibility transitions and not from a broken midpoint lookup.

---

# 20. Article 17 — Complete Material and Process Behavior

## Goal

Finish Execution 06 Article 12 without inventing unsupported material numbers.

## Process Profiles

Retain explicit fields for:

- rigid vs flexible cast target;
- reusable tooling preference;
- sacrificial tooling permission;
- shrink compensation supplied by user/profile;
- release clearance supplied by user/profile;
- minimum wall;
- max Working Mold pieces;
- max Master tooling pieces;
- vent policy.

## Geometry-Only Default

If no material-specific profile is selected:

```text
assumption = geometry-only conservative defaults
```

must be present in metadata or report.

## Prohibited Behavior

Do not hardcode undocumented shrinkage values for:

- plaster;
- cementitious materials;
- ceramic;
- resin;
- silicone;
- other casting systems.

Material intelligence may be added later through validated profiles.

---

# 21. Article 18 — Repair Store Lifecycle Around the New Autonomous Architecture

## Goal

Ensure lifecycle correctness after performance and cancellation changes.

## Staleness Inputs

Keep Master stale only for Master-relevant changes:

- source geometry;
- transform/orientation;
- scale;
- process profile;
- Master preferences;
- build volume when relevant;
- Master-specific feature edits.

Do not stale it because unrelated Create Cavity state changed.

## Generation-In-Flight Changes

Current behavior must be explicitly defined when a Master-relevant input changes while generation is active.

Preferred behavior:

```text
input changes
→ current generation invalidated/cancelled
→ old result can never commit
→ store becomes stale/ready for new generation
```

Do not silently ignore a live identity change solely because `status === "generating"`.

If intentionally deferred until generation returns, prove that the result is rejected against the new live identity before commit.

## Required Races

Test:

- generate → source replacement;
- generate → transform change;
- generate → build volume change;
- generate → reset;
- generate A → generate B;
- cancel → regenerate;
- result arrives after invalidation;
- stale previous set + new seed.

No obsolete generation may resurrect itself as current.

---

# 22. Article 19 — Remove Transitional Execution 05 Contracts and Dead State

## Goal

Finish the architectural cleanup that the interrupted run did not complete.

## Investigate Before Deleting

Likely obsolete or transitional concepts include Master-domain types representing the old architecture such as:

- `MasterMoldProjectSnapshot`;
- `MasterCommittedMoldPart`;
- mandatory mold definition fields;
- old cutting-plane provenance in Master-only contracts;
- old Sprue/Registration intent structures that are no longer production inputs;
- dead helpers built around committed mold parts;
- unused old state parameters;
- tests whose only purpose is the old Create Cavity → Master Mold path.

Delete only after proving no current production path depends on them.

## `MasterMoldParameters`

Investigate the current:

```text
wallThicknessMm
bottomThicknessMm
geometryToleranceMm
```

store state.

If autonomous generation uses the process profile instead and these values are dead:

- remove them;
- or wire them intentionally into Master preferences/profile.

Do not leave two sources of truth for wall/bottom parameters.

## Contract Comments

Update old comments that still describe Execution 05 committed-mold-part behavior.

Documentation must match current architecture.

---

# 23. Article 20 — Preserve Create Cavity, Segmentation, Sprue, Registration, and Existing Craft Behavior

## Goal

The Master Mold rewrite must remain isolated from stable sibling product loops.

## Regression Areas

Run targeted regressions for:

- Create Cavity;
- Cut by Face;
- Segmentation One Mold;
- Segmentation More Molds;
- General Segmentation;
- Sprue;
- Final Mold Registration;
- viewport mold-body rendering;
- import;
- toolbar state;
- undo/redo where related shared stores are touched.

## Architecture Invariants

Keep architecture tests proving:

```text
master-mold production
does not import cavity-generation orchestration/state
```

and:

```text
cavity-generation production
does not import master-mold orchestration/state
```

Neutral geometry utilities may be shared.

Do not duplicate general geometry utilities into Master merely to satisfy domain separation.

---

# 24. Article 21 — Performance Budgets Must Be Observable and Enforced

## Goal

A centralized budget must represent actual work.

## Required Counters

Report at least:

```text
raw direction candidates
kept direction candidates
piece-count candidates
Working Mold exact construction attempts
Master tooling exact construction attempts
release verification sweeps
recursive panel split depth reached
vent search candidates
```

Names may adapt.

## Limits

Centralize limits.

Avoid magic constants scattered across planner files.

## Budget Exhaustion

When a budget stops the search:

```text
limitsExceeded.push(...)
```

must actually be populated and exposed.

Do not define a `limitsExceeded` field that remains permanently empty.

The final structured failure should distinguish:

```text
physically impossible
```

from:

```text
no verified solution found within configured planning budget
```

This distinction is important.

---

# 25. Article 22 — Error and Failure Semantics

## Goal

Every product failure must explain whether the problem is geometry, manufacturing, profile policy, or bounded-search uncertainty.

## Required Failure Families

Support structured reasons covering at least:

```text
invalid_source_geometry
no_working_mold_release_plan
working_mold_exact_verification_failed
working_mold_registration_failed
tooling_construction_failed
tooling_release_plan_failed
tooling_registration_failed
build_volume_exceeded
vent_unresolved
planning_budget_exhausted
cancelled
stale_request
kernel_failure
```

Exact enum names may adapt.

## Uncertainty

Do not tell the user:

```text
this part is impossible
```

when the actual truth is:

```text
the configured search budget found no verified plan
```

Likewise, do not hide a proven physical lock behind a generic timeout.

---

# 26. Article 23 — UI / UX Closure

## Goal

The autonomous complexity must remain understandable.

## Progress

Use human messages such as:

```text
Analyzing part…
Finding release regions…
Testing a 3-part mold plan…
Building Working Mold 2 of 3…
Planning Master case 1 of 3…
Checking panel release…
Finalizing…
```

## Result Summary

Show a compact result such as:

```text
Master Mold generated
Working mold: 3 parts
Master tooling: 5 printable pieces
2 one-piece cases
1 three-panel case
All release paths verified
2 alignment interfaces generated
1 vent recommendation
```

## Failure

For structured bounded failure:

```text
Reusable Master tooling could not be verified within the current planning limits.
```

If physically proven locked:

```text
This Working Mold piece cannot be released from reusable rigid tooling under the selected process profile.
```

Do not collapse all failures into “Master Mold failed.”

## Viewport

Clearly distinguish:

- Source Part;
- Working Mold preview;
- Master Tooling.

If the Working Mold preview is not intended to remain permanently visible, provide a clear inspection toggle.

---

# 27. Article 24 — Realistic Manual Product Verification

## Goal

Automated tests are necessary but not sufficient for this geometry feature.

## Required Manual Run

Using the actual app, perform at least:

### Model A — Simple geometry

Expected:

```text
Import
→ Master Mold
→ minimum practical Working Mold count
→ printable tooling
```

### Model B — Geometry requiring 3+ Working Mold pieces

Expected:

```text
automatic higher piece count
→ visible Working Mold plan
→ Master tooling per piece
→ no manual segmentation
```

### Model C — Tooling lock case

Expected:

```text
one-piece case rejected
→ multi-panel or removable core
```

### Model D — High-poly model

Expected:

```text
UI remains responsive
progress changes
result/failure is bounded
```

## Evidence

The final report must state exactly what was actually run.

Do not claim manual verification if the coding agent did not perform it.

If browser automation is the strongest available evidence, state that clearly.

---

# 28. Article 25 — Full Quality Gate

## Goal

Close Execution 06 on one final repository state.

## Required Commands

Adapt to repository scripts, but final evidence must cover:

```text
typecheck
lint
unit tests
integration tests
architecture tests
Master Mold golden tests
Create Cavity regressions
Segmentation regressions
Sprue/Registration regressions
build
production artifact verification
Playwright E2E
high-poly Master Mold browser E2E
```

Do not report only focused tests.

## Warnings

Investigate and report:

- React `act(...)` warnings;
- resource-disposal warnings;
- WebGL errors;
- Manifold errors;
- Vite compatibility warnings;
- bundle-size warnings.

A warning may remain only if:

- understood;
- unrelated or accepted;
- documented with evidence.

---

# 29. Mandatory Test Matrix

The final implementation must include evidence for this matrix.

| Case | Expected |
|---|---|
| Direct import → Master Mold | Works with zero cutting state |
| Simple convex part | Minimum 2-piece Working Mold under current policy |
| 3-direction undercut fixture | 2 rejected, 3 verified |
| 4-region fixture | 2 and 3 rejected, 4 verified |
| Oblique fixture | Geometry-derived direction participates |
| Registration mutation | Final post-registration geometry re-verified |
| One-piece Master lock | One-piece rejected exactly |
| Multi-panel Master | Final release sequence verified |
| 3+ panel Master | Automatic alignment or explicit physically justified blocking reason |
| Localized lock | Removable core/insert considered |
| Printer X/Y/Z limit | Every axis checked against its own configured value |
| Trapped air | Safe vent or structured review warning |
| High-poly browser | UI heartbeat remains active |
| Mid-run cancel | No stale completion resurrects |
| Visibility hide/show | Actual Three.js geometry changes visibility |
| Geometry regeneration | Viewport rebuilds from new geometry identity |
| Budget exhaustion | Structured budget reason |
| Create Cavity regression | Unchanged sibling workflow |
| Architecture separation | Master/Cavity orchestration remain independent |
| Full CI | Green on final HEAD |

---

# 30. Non-Negotiable Invariants

1. Master Mold starts directly from the imported part.
2. Master Mold does not require Cut by Face.
3. Master Mold does not require Segmentation.
4. Master Mold does not require Create Cavity.
5. Create Cavity remains a separate workflow.
6. Master owns the automatic Working Mold Plan.
7. Working Mold decomposition and Master tooling decomposition remain separate optimization problems.
8. The engine prefers the minimum verified Working Mold piece count.
9. Accessibility drives search.
10. Exact CSG validates a bounded shortlist.
11. Geometry-derived non-axis directions remain supported.
12. Final release verification must always apply to final emitted geometry.
13. Registration may never invalidate a previously verified release unnoticed.
14. Functional Source Part surfaces must be protected from keys, pins, vents, and tooling features.
15. Multi-panel reusable tooling needs a real assembly strategy.
16. Localized removable cores/inserts must be considered before unnecessary global fallback when appropriate.
17. Material numbers must not be invented.
18. The Worker architecture must keep the main UI responsive.
19. High-poly evidence must include the real browser path.
20. Store-state visibility is not sufficient evidence of viewport rendering.
21. A 12-triangle box is not sufficient readiness evidence.
22. Budget exhaustion is not the same as physical impossibility.
23. No obsolete generation may overwrite newer state.
24. No parallel old/new Master pipelines may remain active.
25. Do not declare READY while any P0 acceptance gate is unresolved.

---

# 31. Required Continuous Implementation Loop

For every article:

```text
INVESTIGATE
- inspect live repository
- inspect existing tests
- identify whether the requested behavior already partially exists
- preserve reusable verified code

REPRODUCE
- create failing regression evidence when repairing a defect
- avoid speculative fixes

DESIGN
- choose the smallest architecture change that closes the invariant
- avoid duplicate sources of truth

IMPLEMENT
- modify existing production path
- delete or demote obsolete path when replacement is proven

TEST
- run focused unit/integration coverage immediately

REGRESS
- run affected sibling feature tests

CONTINUE
- move directly to the next unresolved article
- do not stop for approval
```

Do not create an execution harness that pauses after articles.

Do not ask the user to approve each stage.

Do not stop merely because one focused test passes.

---

# 32. Definition of Done

Execution continuous 06 may declare:

```text
READY
```

only when all of the following are true.

## Product

- Import → Master Mold works directly.
- No Cut by Face / Segmentation / Cavity prerequisite exists.
- Automatic Working Mold planning selects 2..N pieces.
- Master tooling is produced for every accepted Working Mold target.

## Geometry

- final Working Mold geometry is watertight/manifold;
- final post-registration geometry is release-verified;
- final Master tooling geometry is watertight/manifold;
- every accepted reusable panel/core has a verified release sequence;
- assembled negative checks pass.

## Intelligence

- geometry-derived direction candidates participate;
- accessibility drives decomposition;
- useless splits are pruned before exact CSG;
- 3-piece and 4-piece cases are proven;
- parting boundary classification is corrected;
- the planner is not restricted to a world-axis-only product model.

## Tooling

- one-piece cases are preferred when physically valid;
- multi-panel tooling works;
- 3+ panel registration is automated where feasible;
- localized removable-core planning exists;
- build-volume constraints are handled correctly per axis;
- fillability and trapped-air analysis exist;
- safe vent generation or structured user review exists.

## Performance

- large input preparation does not freeze the main thread;
- mesh Worker payloads use an efficient typed/transfer strategy;
- avoid immediate typed-array → JS-array conversion when unnecessary;
- candidate budgets are enforced and observable;
- progress is granular;
- cancellation works during real long-running generation;
- high-poly browser E2E proves responsiveness.

## UI / Viewport

- Source / Working Mold / Master Tooling are distinguishable;
- result summary is understandable;
- real hide/show changes the Three.js scene;
- isolate works;
- geometry identity refreshes the rendered mesh.

## Lifecycle

- stale input cannot commit obsolete results;
- cancellation cannot resurrect old geometry;
- source replacement/reset/build-volume changes are safe;
- incremental reuse does not return invalid stale sets.

## Architecture

- Master remains independent from Create Cavity orchestration;
- transitional Execution 05 contracts are removed or intentionally retained with current justification;
- no duplicate Master engines exist;
- no dead second source of parameters remains.

## QA

- focused tests pass;
- full test suite passes;
- browser E2E passes;
- high-poly browser E2E passes;
- Create Cavity and segmentation regressions pass;
- final build passes;
- production artifact verification passes;
- final CI is green or equivalent local evidence is explicitly documented if CI infrastructure is unavailable.

If any hard gate above remains unresolved, final status is:

```text
NOT READY
```

and the final report must list the exact unresolved gate.

---

# 33. Required Final Report

At the end of the execution, produce one report containing:

## Repository State

```text
branch
starting HEAD
final HEAD
commits created
files added
files modified
files removed
```

## Correctness Repairs

Report:

- final-geometry release repair;
- registration verification;
- parting classifier repair;
- build-volume assertion repair;
- viewport truth repair.

## Intelligence

Report:

- planning patch architecture;
- direction generation;
- accessibility;
- piece-count search;
- parting surfaces;
- removable cores;
- tooling decomposition.

## Physical Tooling

Report:

- Working Mold registration;
- Master tooling registration;
- fillability;
- venting;
- assembly sequence;
- release proof.

## Performance

Report measured:

- high-poly fixture triangle count;
- seed-preparation behavior;
- Worker transfer behavior;
- progress stages;
- exact candidate counts;
- release-sweep counts;
- browser heartbeat evidence;
- cancellation evidence;
- total elapsed time where useful.

## QA

Report exact command results and counts.

Do not write only:

```text
tests passed
```

Give actual evidence.

## Manual / Browser Verification

Separate:

```text
automated browser verification
```

from:

```text
manual visual verification
```

Do not claim one as the other.

## Remaining Limitations

List only real remaining limitations.

Do not hide limitations behind READY.

---

# 34. Final Instruction to the Coding Agent

Continue from the live Craft repository.

Do not restart Master Mold.

Do not recreate Execution 06 in parallel.

First reproduce the known gaps in this document against the current code. Then repair the existing autonomous pipeline in place.

The most important closure rule is:

```text
Imported Source Part
→ efficient planning representation
→ geometry-derived accessibility
→ bounded 2..N Working Mold search
→ exact final Working Mold construction
→ registration applied
→ FINAL geometry release verified
→ per-piece Master tooling
→ panel/core decomposition when needed
→ tooling registration
→ fill/vent planning
→ exact final tooling release verification
→ Master store
→ actual viewport geometry
→ real browser acceptance
→ high-poly responsiveness
→ full regression suite
→ production closure
```

A result is not production-ready because an intermediate plan was valid.

A result is production-ready only when the geometry the user actually sees and prints is the same geometry that passed the final physical verification.

**Do not create Execution 07 to finish this work. Finish Execution 06.**
