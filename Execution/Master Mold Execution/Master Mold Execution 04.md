# Master Mold Execution 04

## Corrective Production Closure

**Document type:** Corrective engineering execution  
**Scope:** Master Mold only  
**Purpose:** Close the unresolved production gaps left after the previous Master Mold implementation cycle without rebuilding the subsystem or introducing a parallel geometry architecture.

---

# 0. Mission

Master Mold already has a substantial working foundation:

- authoritative final-mold target synthesis;
- independent Master Mold generation;
- Manifold-backed Boolean construction;
- one-open-face geometry validation;
- Funnel/Sprue propagation through the final-mold target;
- Registration propagation through the final-mold target;
- per-part Master Mold state;
- worker isolation;
- cancellation and latest-request protection;
- stale-state presentation;
- browser-level production-store tests;
- broad CI coverage.

This execution must **not replace that foundation**.

Its mission is narrower and stricter:

> Close the remaining correctness gaps that can still allow Craft to reject a valid Master Mold, display old geometry as current, keep an incomplete Master Mold result marked current after the final-mold part set changes, or pass CI without proving the actual user-facing Master Mold flow.

The implementation must end with one coherent production path.

---

# 1. Execution Contract

The repository is the source of truth.

Before changing code:

1. inspect the live branch and current repository state;
2. identify the exact production modules responsible for the behavior;
3. reproduce each unresolved issue before repairing it;
4. add a failing regression test for every reproducible bug;
5. make the smallest architectural repair;
6. rerun focused tests immediately;
7. continue automatically to the next article;
8. run the complete quality gates only after all focused exit gates pass.

Do not stop between articles for approval.

Do not create an execution harness that pauses after phases, loops, articles, or test groups.

A failed exit gate means:

```text
inspect
→ reproduce
→ repair root cause
→ rerun
→ continue
```

not:

```text
report failure
→ stop
```

The final result must be classified as exactly one of:

```text
READY
READY WITH DISCLOSED PHYSICAL LIMITATION
NOT READY
```

---

# 2. Non-Negotiable Product Invariants

## 2.1 Final-Mold Geometry Is the Source of Truth

Master Mold is derived manufacturing-tool geometry.

The authoritative relationship is:

```text
Committed Final Mold Part
→ Master Mold Target
→ Master Mold Tool
```

Master Mold must never invent, approximate, or silently substitute the upstream final-mold geometry.

## 2.2 One Final-Mold Part Maps to One Independent Master Mold Body

For every current final-mold part that is physically feasible:

```text
Final Mold Part A → Master Mold A
Final Mold Part B → Master Mold B
Final Mold Part C → Master Mold C
```

If the authoritative part set changes, the Master Mold part set must reconcile with it.

A missing current Master Mold body must never be hidden behind an overall `current` state.

An obsolete Master Mold body must never remain visible as a current manufacturing result.

## 2.3 `current` Means All Three Layers Agree

The following must always agree:

```text
Geometry truth
Store truth
Viewport truth
```

A Master Mold body may be reported as `current` only if:

- its source final-mold geometry is current;
- its Master Mold geometry was generated from that source;
- the stored body fingerprint matches that generation;
- the viewport is rendering that exact body geometry;
- the body is not stale, blocked, superseded, removed, or partially replaced.

## 2.4 A Physical Limitation Requires Physical Evidence

`no_valid_open_direction` must mean:

> No allowed one-piece orthogonal demold path has been geometrically verified as feasible.

It must **not** mean:

- a triangle normal looked suspicious;
- a centroid probe failed;
- a heuristic was uncertain;
- a test fixture happened to fail;
- the previous analyzer already said the direction was invalid.

A physical limitation cannot use the same algorithm under test as its own ground truth.

## 2.5 A Valid Integration Case Must End in a Usable Result

For a fixture explicitly designed to be manufacturable:

```text
valid geometry
→ valid Master Mold
→ current
```

Tests must never accept:

```text
current OR blocked
```

as proof that an integration works.

---

# 3. Scope

This execution is intentionally surgical.

It must close these unresolved classes:

1. precise demold verification;
2. authoritative Master Mold part-set reconciliation;
3. viewport geometry identity correctness;
4. true user-facing Master Mold E2E coverage;
5. remaining Registration proof gaps;
6. remaining failure-semantics gaps;
7. test reliability warnings and closure debt;
8. final production verification.

Do not redesign the Master Mold feature.

Do not replace the existing state architecture unless repository evidence proves a localized replacement is required.

---

# 4. Explicit Non-Solutions

Do not solve this execution by:

```text
forcing +Z
disabling undercut detection
weakening blocked conditions
accepting blocked as success
adding arbitrary free-angle search
creating a second Boolean engine
creating a second collision engine
creating a Master-specific cavity engine
creating a Master-specific Funnel/Sprue engine
creating a Master-specific Registration engine
turning stale geometry back into current without regeneration/revalidation
deleting stale geometry merely to hide a lifecycle bug
changing visible geometry without updating provenance
changing provenance without updating visible geometry
hard-coding fixture-specific direction exceptions
whitelisting known test models
using the existing Master Mold analyzer as the ground truth for its own validation
using only a Worker probe as product E2E
claiming manual verification that was not actually performed
```

---

# Article 01 — Lock the Current Production Baseline

## Goal

Establish the exact live behavior before repairs and preserve evidence for every gap this execution intends to close.

## Investigation Targets

At minimum inspect the live equivalents of:

```text
masterMoldDirection.analyzer
masterMoldGeometry.generator
masterMold.store
MasterMoldAction
masterMoldViewportAdapter
masterMoldBody3dRuntime
finalMoldTarget
Viewport
useViewportRuntime
Master Mold worker client/evaluator
Master Mold integration tests
Master Mold browser tests
SplitFace / final-mold committed-result lifecycle
segmentation adoption lifecycle
Sprue lifecycle
Registration lifecycle
```

Do not assume these paths or names are unchanged. Discover them live.

## Required Reproductions

Create deterministic evidence for at least these four classes.

### Case 1 — Geometry changes while viewport identity appears unchanged

Construct two valid Master Mold renderable bodies with:

```text
same part ID
same bounds
same triangle count
same visibility
same stale flag
different mesh positions or indices
```

Prove whether the current viewport runtime rebuilds or incorrectly preserves the old mesh.

### Case 2 — Final-mold part added

Start from:

```text
Final Mold: A, B
Master Mold: A, B
```

Then commit an authoritative final-mold result:

```text
Final Mold: A, B, C
```

Prove the resulting Master Mold state.

The expected safe behavior before regeneration is not `current`.

### Case 3 — Final-mold part removed

Start from:

```text
Final Mold: A, B
Master Mold: A, B
```

Then commit:

```text
Final Mold: A
```

Prove whether obsolete Master Mold B remains current or visible.

### Case 4 — Demold decision independence

Create at least one geometry fixture where the expected physical removability is established independently from the Master Mold analyzer.

The expected answer must not be derived from:

```text
analyzeMasterMoldOpenDirection()
```

or any output produced by the algorithm under test.

## Execution Loop

```text
inspect live code
→ reproduce behavior
→ add failing regression
→ verify failure is for expected reason
→ preserve evidence
→ continue
```

## Exit Gate

Article 01 passes only when every repair target has deterministic pre-fix evidence or the repository investigation proves the suspected bug does not exist.

If a suspected bug cannot be reproduced, record exactly why and do not manufacture an easier substitute.

---

# Article 02 — Replace Heuristic-Only Demold Authority with Precise Geometry Verification

## Goal

Make `no_valid_open_direction` a defensible manufacturing decision.

The existing normal/probe heuristic may remain as a broad-phase accelerator if useful, but it must not be the final authority for a production Master Mold.

## Required Architecture

Separate direction evaluation into two conceptual stages.

### Stage A — Broad Phase

Cheaply eliminate only directions that are unquestionably invalid.

Allowed evidence includes:

- invalid/degenerate bounds;
- impossible stock dimensions;
- impossible bottom/wall construction;
- obvious zero-volume conditions;
- inexpensive directional hints used for prioritization.

Triangle-normal information may:

- rank candidates;
- identify suspicious areas;
- prioritize precise verification.

It must not by itself produce the final product-level infeasibility conclusion for otherwise valid geometry.

### Stage B — Precise Demold Verification

For each surviving orthogonal direction:

```text
+X
-X
+Y
-Y
+Z
-Z
```

verify the actual physical question:

> Can the authoritative final-mold target translate out of the candidate one-open-face Master Mold along this direction without penetrating Master Mold material beyond the repository tolerance?

The verification must use deterministic geometric evidence.

Prefer reusing existing:

- BVH infrastructure;
- Manifold solids;
- mesh conversion utilities;
- tolerance policy;
- bounds/provenance primitives.

Do not add another CAD kernel.

## Acceptable Verification Strategies

Use the smallest strategy that is geometrically valid for the repository.

### Strategy A — Translation Collision Sweep

```text
build candidate Master Mold
→ place target at casting position
→ translate target toward open face
→ test target/tool overlap at deterministic intervals
→ adaptively refine near first suspected collision
→ accept only if no penetration beyond tolerance occurs until target clears stock
```

### Strategy B — Directional Occupancy / Monotonicity Verification

If a mathematically equivalent directional occupancy test can prove that every line parallel to the pull direction intersects the target/tool relationship in a demoldable ordering, it may be used.

The implementation must include a code-level explanation of why it is equivalent for the one-open-face orthogonal product contract.

### Strategy C — Exact or Conservative Swept-Volume Test

A swept-volume test may be used only if:

- it verifies the removal path;
- it does not modify the cavity geometry;
- it does not replace the manufactured Master Mold geometry with a swept cavity.

The Master Mold must continue to cast the exact target geometry.

## Tolerance Requirements

Contact at the initial casting position is not penetration.

Use the repository’s established tolerance policy.

The verifier must distinguish:

```text
touching / coincident within tolerance
```

from:

```text
material penetration beyond tolerance
```

Do not invent arbitrary epsilon values independently of the geometry policy unless dimensionless mathematics requires it and the reason is documented.

## Required Independent Fixtures

At minimum include:

- plain box;
- shouldered geometry with exactly one valid pull direction;
- narrow-neck trapped geometry;
- cavity-bearing final-mold geometry;
- valid Sprue/Funnel geometry in a compatible direction;
- Registration-bearing geometry;
- one fixture that the old heuristic would reject or classify ambiguously but the precise verifier proves removable, if such a repository-supported fixture can be constructed.

If no such false-negative fixture can be produced, do not claim that one existed. Still retain the precise verifier so future decisions are not heuristic-only.

## Circular-Validation Prohibition

A test may not say:

```text
the existing analyzer rejects Z
therefore Z is physically impossible
therefore the analyzer is correct
```

Physical expectation must come from independently constructed geometry evidence.

## Execution Loop

```text
candidate direction
→ broad phase
→ build/prepare candidate Master geometry
→ precise removal-path verification
→ accept or reject with measured evidence
→ compare against independent ground truth
→ rerun adversarial fixtures
```

## Exit Gate

Article 02 passes only when:

- every `current` direction has passed precise verification;
- every final `no_valid_open_direction` result means all allowed orthogonal candidates failed precise verification or were unquestionably invalid before that stage;
- a deliberately trapped fixture is rejected;
- a known removable fixture is accepted;
- no test uses analyzer output as physical ground truth.

---

# Article 03 — Make Master Geometry and Demold Verification Agree

## Goal

Guarantee that the geometry being manufactured is the geometry that was verified.

A direction validator and a geometry generator must not reason about different solids.

## Plan

For each generated Master Mold body:

1. select a precisely verified direction;
2. construct Master stock;
3. subtract the authoritative final-mold target;
4. extend through the intended open plane only as required by the established Boolean tolerance policy;
5. preserve a watertight Master Mold solid;
6. validate one intended exterior opening;
7. validate finite mesh and topology;
8. validate connected Master Mold material;
9. validate resulting volume;
10. validate bottom and side-wall requirements;
11. rerun or reuse the precise demold verification against the **actual generated result**.

If the precise verifier requires candidate Master geometry, avoid calculating the same expensive geometry twice where safe reuse is possible.

Do not weaken correctness merely to save computation.

## Required Invariant

```text
selected direction
=
direction verified against actual tool geometry
```

No `current` result may rely on:

```text
direction heuristic says valid
+
Boolean happens to succeed
```

as its final manufacturability proof.

## Exit Gate

Every `current` Master Mold body is:

- finite;
- non-empty;
- watertight;
- manifold;
- materially connected;
- open to exterior through exactly the intended casting side under the existing one-open-face contract;
- generated from the authoritative final-mold target;
- removable along the selected direction according to the precise verifier.

---

# Article 04 — Reconcile the Authoritative Final-Mold Part Set

## Goal

Make the Master Mold collection structurally consistent with the current final-mold collection.

Per-part geometry fingerprints are not enough if parts are added, removed, or replaced.

## Required Dependency Model

The Master Mold store must reason about both:

```text
part identity set
```

and:

```text
per-part geometry identity
```

For an authoritative final-mold result, derive a deterministic snapshot containing at minimum:

```text
part IDs
per-part geometry versions
Master Mold parameters
relevant direction override if supported
geometry tolerance
```

Reuse existing provenance/fingerprint utilities.

Do not build a parallel provenance subsystem.

## Required Transitions

### A. Existing part geometry changes

```text
A(current), B(current)
↓ A geometry changes
A(stale), B(current)
```

### B. New part appears

```text
Final Mold old: A, B
Final Mold new: A, B, C
```

Before regeneration the Master Mold collection cannot truthfully be globally `current`.

Use the smallest state model that makes the missing C explicit and prevents incomplete manufacturing output from being presented as complete.

### C. Part disappears

```text
Final Mold old: A, B
Final Mold new: A
```

Master Mold B must not remain a current visible manufacturing body.

It may be:

- removed;
- retained only as explicitly stale historical geometry if that matches the existing UX contract.

It must not remain `current`.

### D. IDs remain but geometry changes

Use the existing per-part geometry version comparison.

### E. Global parameter changes

If a parameter affects every Master Mold body, all dependent bodies must become stale immediately.

This includes future UI exposure of parameters such as wall/bottom thickness.

Do not wait for the next Generate click to discover stale output.

## Store Truth Requirement

`overallStatusOf()` or its live equivalent must not return `current` when:

- any required authoritative part has no current Master Mold;
- any obsolete current Master Mold remains;
- any dependent current body has an outdated source fingerprint.

## Required Tests

At minimum:

- A/B → A/B/C;
- A/B → A;
- A/B → A′/B;
- A/B → A/B′;
- all-global parameter invalidation;
- regenerate only changed/missing dependent parts;
- removed part is not regenerated;
- unchanged sibling stays current;
- collection returns to fully `current` only after every required part is current.

## Exit Gate

The set of `current` Master Mold bodies is always a truthful one-to-one representation of the authoritative feasible final-mold parts for the current document snapshot.

---

# Article 05 — Fix Viewport Geometry Identity

## Goal

Prevent the viewport from displaying an old Master Mold mesh while the store reports a newer body as `current`.

## Root Rule

Renderable identity must include actual geometry identity.

A cache key based only on values such as:

```text
id
bounds
triangle count
visibility
stale flag
```

is insufficient.

Two different meshes can share all of those values.

## Plan

Use an existing stable geometry identity if available, preferably:

- final Master Mold body fingerprint;
- Master Mold geometry version;
- content hash already produced by the geometry pipeline.

If no production geometry identity is currently carried into the render adapter, extend the renderable contract minimally.

Do not hash large mesh arrays repeatedly inside the render loop if a stable upstream fingerprint already exists.

## Required Behavior

### Geometry changes, topology metadata unchanged

Given:

```text
same ID
same bounds
same triangleCount
different actual mesh
```

the runtime must replace the rendered geometry.

### Stale/current transition

Changing only stale/current visual state must update appearance correctly without corrupting geometry identity.

### Appearance/theme transition

Changing solid/glass/theme state must not erase stale ghosting or cause geometry replacement unless geometry actually changed.

### Removed body

The viewport must dispose its geometry/material resources and remove the body.

### Added body

The new body must appear without disturbing valid unchanged siblings more than required by the current runtime architecture.

## Scene Truth Tests

Tests must inspect actual Three.js objects.

Do not stop at store assertions.

At minimum prove:

```text
store geometry V2
→ rendered mesh positions/indices correspond to V2
```

and not V1.

## Exit Gate

For every current Master Mold body, the viewport renders the exact current mesh represented by the store.

---

# Article 06 — Complete Registration and Feature-Propagation Proof

## Goal

Close the remaining evidence gap around Registration and feature-driven geometry changes.

The architecture may already propagate Registration correctly. This article must prove it with geometry, not only status flags.

## Plan

Create a deterministic baseline:

```text
Final Mold without Registration
→ Master Mold baseline
```

Then apply Registration using the real production path:

```text
Registration
→ committed final-mold body changes
→ geometry version changes
→ dependent Master Mold becomes stale
→ regenerate
→ Master Mold becomes current
→ Master Mold geometry changes
```

Where repository capabilities support more than one Registration form, test both meaningful forms.

Examples may include:

- positive/male feature;
- negative/female feature.

Do not fabricate unsupported Registration variants merely to satisfy wording.

## Required Assertions

Do not prove integration only with:

```text
registration.status === "generated"
```

Also prove a geometry delta attributable to Registration.

Use:

- geometry version;
- mesh fingerprint;
- volume delta where appropriate;
- deterministic feature evidence.

Avoid brittle exact-volume assertions if geometry tolerance makes them unsuitable.

## Sprue Edit Closure

Also add or strengthen a real Master Mold case for editing an existing Sprue/Funnel:

```text
current Master Mold
→ resize/edit Sprue
→ affected final-mold geometry changes
→ only dependent Master Mold becomes stale
→ regenerate
→ current
→ Master Mold geometry changes
```

This is distinct from merely adding the first Sprue.

## Exit Gate

Registration and Sprue edits are proven upstream feature changes that propagate through the shared final-mold target into corresponding Master Mold geometry.

---

# Article 07 — Complete Failure Semantics

## Goal

Ensure every production failure says what actually failed.

## Required Failure Classes

Inspect the live contracts and preserve existing reason codes where correct.

The final model must distinguish at least:

```text
invalid source geometry
final-mold target synthesis failure
no precisely verified pull direction
invalid Master stock
Boolean failure
insufficient wall thickness
insufficient bottom thickness
detached fragment
non-manifold result
open-face inaccessible
multiple unintended openings
stale/superseded request
cancellation
unexpected worker/runtime failure
```

If analyzer uncertainty remains possible after the precise verifier, do not silently map it to physical infeasibility.

## UI Contract

Each user-visible hard failure must provide:

- what failed;
- which final-mold part failed when applicable;
- whether valid sibling Master Mold bodies remain usable;
- what the user can reasonably change.

Examples:

```text
"No valid one-piece pull direction was verified for Final Mold B."
```

is different from:

```text
"Master Mold generation failed while constructing the Boolean tool."
```

and different from:

```text
"The final-mold target could not be synthesized."
```

## Store Contract

Do not keep synthesis failure only as local React text if it represents a Master Mold production state that should be observable by the feature.

Choose the smallest consistent structured state that fits the current architecture.

## Exit Gate

No physical infeasibility reason is used as a catch-all for algorithm, Worker, synthesis, tolerance, or lifecycle failures.

---

# Article 08 — Build a True User-Facing Master Mold E2E

## Goal

Make CI fail when the real Craft Master Mold experience is broken even if low-level stores and Workers still pass.

The existing Worker and production-store probes remain valuable diagnostics.

They are not sufficient product acceptance.

## Required Browser Path

Automate the most stable real user path available in the repository.

The target path is:

```text
load/import realistic deterministic model
→ establish committed mold/cutting state through production UI or the nearest stable UI boundary
→ preserve or add Registration
→ add valid Funnel/Sprue
→ expose the real Master Mold toolbar action
→ click the real Master Mold button
→ wait for real Worker completion
→ assert action state = current
→ inspect viewport scene/runtime
→ assert generated Master Mold object exists
→ assert visible geometry is Master Mold geometry
→ assert it is not reference/final-mold fallback geometry
→ assert no uncaught browser/page error
```

## Fixture Requirements

Do not use a bare rectangular box as the only acceptance fixture.

Add at least one deterministic non-trivial fixture with:

- cavity-bearing final mold;
- asymmetric geometry;
- a known valid orthogonal removal direction;
- Registration if supported by the workflow;
- valid Sprue/Funnel in a compatible direction.

Prefer a repository geometry builder or committed deterministic STL fixture over a huge external asset.

The fixture must remain fast enough for CI.

## Multi-Part Coverage

If stable fixture infrastructure permits, include more than one final-mold part.

At minimum one acceptance case must verify the current Master Mold body count matches the authoritative final-mold part count.

## Viewport Assertion

Do not stop at:

```text
masterMoldStore.status === "current"
```

Inspect actual rendered Master Mold objects.

At minimum assert:

- Master Mold runtime group exists;
- expected number of Master Mold meshes exists;
- current meshes are visible;
- stale-only visual markers are absent for current output;
- rendered mesh identity matches generated current bodies.

## Existing Probes

Keep low-level browser probes if they provide useful diagnostic isolation:

```text
Worker/Manifold probe
production-store workflow probe
```

But classify them as lower-level coverage.

The real UI/viewport test becomes the product acceptance gate.

## Exit Gate

CI fails if the Master Mold button/store succeeds but the user-visible Master Mold result is absent, stale, old, incomplete, or replaced by unrelated mold geometry.

---

# Article 09 — Close Lifecycle Race and State-Agreement Edges

## Goal

Re-audit the repaired system for races introduced or exposed by the previous articles.

## Required Scenarios

At minimum test:

### Rapid duplicate click

```text
Generate
Generate immediately
→ only authoritative latest result survives
```

### Generate then reset

```text
Generate
→ model replacement / hard reset
→ old request resolves or rejects
→ reset state remains authoritative
```

### Generate then upstream edit

```text
Generate V1
→ source becomes V2 before V1 completes
→ V1 must never become current for V2
```

### Generate then part-set change

```text
Generate A/B
→ final mold becomes A/B/C
→ old A/B completion cannot mark entire collection current
```

### Stale regenerate

```text
current
→ local edit
→ stale affected part
→ regenerate
→ changed part current
→ unchanged sibling preserved
```

### Undo/Redo

If the application restores a previously identical source snapshot:

- do not silently claim current without the feature’s existing revalidation rule;
- reuse cached geometry if the fingerprint proves it safe;
- keep store and viewport consistent.

## Exit Gate

Request identity, source identity, Master Mold store state, and viewport geometry never disagree after overlapping lifecycle events.

---

# Article 10 — Remove Test and Repair Debt

## Goal

Finish with one coherent implementation and a trustworthy test suite.

## Required Cleanup

Inspect and remove or repair:

- tests that accept `blocked` for valid integration;
- circular physical-ground-truth assertions;
- obsolete heuristic-only comments presented as final proof;
- dead invalidation methods;
- stale failure codes that no production path can emit;
- duplicate Master Mold geometry logic;
- duplicate final-mold target synthesis;
- fallback geometry that can masquerade as Master Mold;
- debug-only leftovers;
- stale test fixtures that no longer represent the product contract.

## React Test Reliability

Eliminate Master Mold-related:

```text
not wrapped in act(...)
```

warnings.

A green test suite with repeated React lifecycle warnings is not considered clean closure.

Use the smallest correct Testing Library synchronization pattern.

Do not suppress console warnings globally.

## Bundle Discipline

The eager application bundle is already close to its configured budget.

During this execution:

- keep Manifold/BVH-heavy logic lazy or Worker-side;
- do not statically pull Master Mold geometry engines into eager UI bundles;
- preserve or improve the existing bundle budget;
- investigate any material regression.

Do not increase the budget merely to make CI pass unless repository evidence proves the budget itself is obsolete and the change is separately justified.

## Exit Gate

Focused Master Mold tests pass without React lifecycle warnings, and no repair introduces duplicated architecture or an unjustified eager-bundle regression.

---

# Article 11 — Production Quality Gates

## Goal

Run the complete repository closure, not a selected subset.

## Required Gates

Run the live repository equivalents of:

```text
architecture checks
typecheck
lint
production build
bundle budget
focused Master Mold unit tests
Master Mold geometry tests
Master Mold lifecycle/store tests
viewport runtime tests
final-mold workflow tests
Sprue/Funnel tests
Registration tests
Segmentation regression tests
browser/E2E tests
repository integrity checks
backend/Python tests where part of the repository quality gate
dependency/security checks available for the current event
```

Use the repository’s actual scripts.

Do not invent command names.

## CI Evidence

If GitHub Actions is part of the repository release truth:

- push only if execution instructions/permissions require it;
- inspect the resulting workflow run;
- verify every required job;
- inspect logs, not only the top-level green badge;
- record exact test counts from the run;
- record skipped tests/jobs accurately.

Do not estimate counts.

## Failure Rule

A failure is not "unrelated" without evidence.

For every failure:

```text
identify owning module
→ compare with execution diff
→ reproduce if necessary
→ repair or document why genuinely pre-existing/out-of-scope
```

## Exit Gate

Every required live repository quality gate passes.

---

# Article 12 — Realistic Manual Production Verification

## Goal

Verify the real user workflow that automated tests still cannot completely represent.

This is required before `READY`.

## Required Manual Workflow

Use a realistic Craft model that is more complex than the synthetic acceptance cube.

Verify at minimum:

1. import/load the model;
2. produce the final-mold parts;
3. verify final-mold geometry remains intact;
4. generate Master Mold without requiring Create Cavity to be clicked first, if that remains the product contract;
5. verify visible Master Mold geometry is distinct from ordinary final/reference mold geometry;
6. inspect the cavity/open face visually;
7. add a valid Sprue/Funnel;
8. verify affected Master Mold state becomes stale;
9. regenerate;
10. verify the changed Master Mold returns `current`;
11. edit an existing Sprue/Funnel if supported;
12. verify corresponding geometry changes;
13. verify Registration is reflected;
14. perform one local part edit;
15. verify unaffected sibling Master Mold bodies remain current;
16. add/remove a final-mold part through a supported workflow if practical;
17. verify Master Mold part-set reconciliation;
18. replace the source model;
19. verify old Master Mold bodies cannot remain current/visible;
20. inspect browser console for uncaught Master Mold errors.

## Evidence Rule

Do not write "manual verification passed" unless it was actually performed.

If the executing agent cannot perform interactive visual verification in its environment, it must report:

```text
AUTOMATED CLOSURE PASSED
MANUAL PRODUCT VERIFICATION NOT EXECUTED
```

and the final status cannot be stronger than the evidence supports.

## Exit Gate

A realistic user workflow produces a visible, current, geometrically usable Master Mold and none of the repaired lifecycle/identity gaps reappear.

---

# 5. Mandatory Acceptance Matrix

| Scenario | Required Result |
|---|---|
| Simple final-mold part | `current` Master Mold |
| Non-trivial cavity-bearing part with verified valid pull | `current` |
| Physically trapped one-piece target | structured physical infeasibility |
| Analyzer uncertainty without physical proof | must not be mislabeled as physical impossibility |
| Valid Sprue added | affected Master Mold stale → regenerate → `current` |
| Existing Sprue edited | only dependent geometry invalidates; regenerated body changes |
| Registration added/changed | dependent Master Mold geometry changes and returns `current` |
| One part geometry changes | only dependent Master Mold stale |
| New final-mold part appears | collection cannot remain falsely complete/current |
| Final-mold part disappears | obsolete Master Mold cannot remain current |
| Global Master parameter changes | all dependent Master Mold bodies stale immediately |
| Same ID/bounds/triangleCount but new mesh | viewport renders new mesh |
| Stale body | clearly ghosted/non-manufacturable |
| Blocked body | not rendered as successful Master Mold |
| Duplicate generate | latest authoritative result wins |
| Generate then reset | old request cannot resurrect old/error state |
| Generate then source change | old result cannot become current |
| Real UI/browser path | real button → real worker → real visible viewport geometry |
| Browser console | no uncaught Master Mold errors |
| Production build | pass |
| Bundle budget | pass |
| Master Mold test logs | no unresolved React `act(...)` warnings |

---

# 6. Definition of Done

Master Mold Execution 04 is complete only when all statements below are true.

- Master Mold is generated from authoritative final-mold target geometry.
- The current Master Mold part set matches the authoritative final-mold part set.
- Removed final-mold parts cannot leave current obsolete Master Mold bodies.
- Added final-mold parts cannot leave the overall Master Mold result falsely complete/current.
- Per-part edits invalidate only dependent bodies when provenance allows it.
- Global Master Mold parameter edits invalidate all dependent bodies.
- `no_valid_open_direction` is backed by precise geometry verification, not heuristic-only authority.
- The demold verifier and the generated Master Mold use the same effective geometry/tolerance contract.
- Current Master Mold bodies are watertight, manifold, connected, open on the intended side, and precisely demold-verified.
- A physical limitation is never proven by the same analyzer being tested.
- Valid Sprue/Funnel integration ends in `current`.
- Existing Sprue/Funnel edits propagate into regenerated Master Mold geometry.
- Registration changes are proven by actual geometry/fingerprint delta, not status alone.
- Viewport render identity includes real Master Mold geometry identity.
- The viewport cannot show V1 geometry while the store reports V2 as current.
- Current, stale, blocked, and absent Master Mold states are visually and semantically distinct.
- No stale Worker result can overwrite a newer authoritative request.
- Browser acceptance exercises the real Master Mold user action and verifies visible viewport geometry.
- Worker-only and store-only probes are retained only as lower-level diagnostic evidence.
- No duplicate CAD, Boolean, cavity, Sprue, Registration, or provenance engine was introduced.
- Master Mold-related React test warnings are resolved.
- Typecheck, lint, architecture checks, focused tests, broader regressions, browser tests, and production build pass.
- A realistic manual workflow is either actually verified or explicitly disclosed as not executed.

---

# 7. Final Engineering Report

At the end of execution, produce one evidence-based report with the following sections.

## 7.1 Final Decision

Exactly one:

```text
READY
READY WITH DISCLOSED PHYSICAL LIMITATION
NOT READY
```

## 7.2 Repository State

Report the live:

- branch;
- final commit;
- relevant changed-file set;
- whether the worktree was clean at closure.

Do not hard-code these values in advance.

## 7.3 Root Causes Found

For every confirmed root cause provide:

- module/file;
- user-visible effect;
- technical cause;
- repair;
- regression test.

## 7.4 Precise Demold Verification

Report:

- old heuristic role;
- new broad-phase role;
- precise verifier method;
- tolerance policy;
- independently established removable fixture;
- independently established trapped fixture;
- evidence that circular validation was removed.

## 7.5 Master Mold Geometry

Report:

- how stock is built;
- how final-mold target is subtracted;
- how open-face access is created;
- how watertight/manifold validation works;
- how actual generated geometry is tied back to precise demold verification.

## 7.6 Part-Set and Staleness Rules

State exact behavior for:

```text
part added
part removed
one part changed
all parts changed
global parameter changed
Undo/Redo
model replacement
segmentation replacement
```

## 7.7 Viewport Truth

State:

- the render identity key;
- why two geometrically different meshes cannot collide in that identity;
- how current differs from stale;
- how stale differs from blocked/absent;
- tests proving store geometry and rendered geometry agree.

## 7.8 Funnel / Sprue and Registration

List exact tests proving:

- Sprue add;
- Sprue edit;
- Registration change;
- resulting geometry version/fingerprint change;
- regeneration to `current`.

## 7.9 Lifecycle / Race Evidence

List tests for:

- duplicate requests;
- cancellation;
- reset during generation;
- source change during generation;
- part-set change during generation;
- stale regeneration;
- latest-result wins.

## 7.10 Browser Acceptance

Report what the real browser test actually does.

Distinguish clearly among:

```text
Worker diagnostic probe
production-store browser probe
real user-facing UI/viewport E2E
```

Do not call the first two product E2E.

## 7.11 Quality-Gate Evidence

Report exact executed commands and exact results for:

- typecheck;
- lint;
- build;
- bundle budget;
- focused tests;
- full tests;
- browser tests;
- repository integrity;
- other CI jobs.

Include exact pass/skip/fail counts from actual output.

## 7.12 Manual Verification

State exactly:

```text
executed and passed
executed with failures
not executed
```

Never infer manual verification from automated tests.

## 7.13 Remaining Limitations

Only list limitations supported by evidence.

Separate:

```text
physical product limitation
```

from:

```text
software defect
```

A bug must not be relabeled as a physical limitation.

## 7.14 Changed Files

List every intentionally modified production/test file with a one-line reason.

---

# 8. Closure Rule

This execution is not complete when the code merely compiles.

It is not complete when unit tests alone pass.

It is not complete when the Worker alone succeeds.

It is not complete when the store says `current`.

It is not complete when CI is green while the viewport may still show stale or incomplete geometry.

It is complete only when the following chain is truthful:

```text
authoritative final-mold geometry
→ authoritative Master Mold dependency snapshot
→ precise demold verification
→ generated Master Mold geometry
→ current Master Mold store state
→ exact current viewport geometry
→ real user-facing browser acceptance
→ production quality gates
```

Continue automatically until this chain is proven or a concrete, evidence-backed blocker remains.

If a blocker remains, classify it precisely and return:

```text
NOT READY
```

Do not weaken the Definition of Done to manufacture a successful result.
