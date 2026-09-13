# Master Mold Execution 03 — Corrective Recovery

## Mission

Repair the existing Master Mold implementation until it behaves as a usable Craft manufacturing workflow on real project geometry, not only synthetic box fixtures.

This execution is corrective, not exploratory. Do not redesign the product, add unrelated features, or create parallel geometry systems. Work from repository evidence, reproduce the current failures first, repair the smallest authoritative seams, and continuously verify real user behavior.

The required end state is:

```text
Committed Mold Parts
        ↓
Final Mold Target Synthesis
  + Funnel / Sprue
  + Registration
        ↓
Master Mold Generation
        ↓
Visible, inspectable, manufacturable Master Mold bodies
```

The user must be able to generate a Master Mold from real Craft geometry, modify the final mold with supported downstream tools such as Funnel/Sprue and Registration, regenerate only what became invalid, and still obtain a visible usable Master Mold result.

---

# Execution Contract

1. **Repository evidence is authoritative.** Inspect the current code before changing anything. Do not assume file names, stores, data flow, geometry ownership, or failure causes.
2. **Reproduce before repair.** Every major repair must begin with a failing test, fixture, probe, or deterministic reproduction that represents the real failing workflow.
3. **No parallel engines.** Reuse the current Manifold, BVH, cavity, final-mold synthesis, worker, mesh, rendering, store, provenance, and segmentation infrastructure.
4. **Do not solve failures by weakening correctness.** Do not simply suppress red errors, bypass validation, force `+Z`, return fake geometry, or mark blocked geometry as current.
5. **Do not hide failure behind fallback boxes.** A visible segmented reference block is not a Master Mold. Master Mold output must be derived from the final-mold target and must be explicitly identifiable in state and viewport.
6. **Do not stop between articles.** Run every article continuously. If an exit gate fails, investigate, repair, rerun the gate, then continue automatically. Do not ask for approval between articles.
7. **No harness-driven pauses.** Use direct repository work, tests, browser verification, and existing project tooling. Do not introduce a harness architecture that pauses the execution after each loop or phase.
8. **Repair first, cleanup second.** Remove or replace obsolete logic only after the repaired path is proven. Avoid accumulating dead compatibility code.
9. **Real workflow acceptance is mandatory.** Synthetic boxes may remain as unit tests, but they are not sufficient evidence for readiness.

---

# Product Invariants

## Master Mold is a sibling workflow

```text
Committed Cutting Result
        ├── Create Cavity
        └── Master Mold
```

The user must not be required to click Create Cavity before Master Mold.

Internally, both workflows may reuse one authoritative final-mold target synthesis capability.

## Master Mold is derived from final-mold geometry

A Master Mold must not be generated from raw segmentation blocks alone.

The authoritative geometry sequence is:

```text
Committed source / cutting state
        ↓
Cavity / final-mold target synthesis
        ↓
Funnel / Sprue
        ↓
Registration
        ↓
Final Mold Target Bodies
        ↓
Master Mold
```

## Funnel and Registration belong to the final mold

Master Mold must consume their resulting final-mold geometry.

Do not create:

```text
MasterMoldSprueService
MasterMoldRegistrationService
```

Do not duplicate their logic inside the Master Mold feature.

## A blocked or stale result is not a successful result

Tests must not treat:

```text
["current", "blocked"]
```

as proof that Funnel or Registration integration works.

For an integration acceptance test, the expected result must be a usable `current` Master Mold unless the fixture is explicitly designed to prove a physically impossible case.

---

# Article 01 — Reproduce the Real Regression

## Goal

Turn the current user-visible failures into deterministic repository evidence before changing implementation.

The required reproductions are:

- Master Mold reports that no one-piece open-face direction is feasible on a realistic final-mold part.
- Master Mold disappears or is visually replaced by unrelated mold/reference bodies when it becomes blocked or stale.
- Adding Funnel/Sprue invalidates Master Mold and regeneration may end in `blocked`.
- A document-level change invalidates more Master Mold bodies than necessary.
- Existing browser coverage can pass without proving the actual toolbar-to-viewport workflow.

## Plan

Trace the complete production path from toolbar action through final-mold target synthesis, worker request, open-direction analysis, Master Mold Boolean generation, store result, stale/current transition, viewport adapter, and viewport runtime.

Create realistic regression fixtures from repository geometry builders wherever possible.

At minimum create one fixture representing:

```text
segmented mold body
+ cavity
+ funnel/sprue
+ registration
```

Do not rely only on a cuboid or pedestal.

## Execution Loop

```text
inspect
→ reproduce
→ encode failing regression test
→ verify failure for the expected reason
→ continue
```

If the failure cannot be reproduced, inspect production state and browser behavior until the real trigger is identified. Do not replace the reported behavior with an easier synthetic issue.

## Exit Gate

Article 01 passes only when the repository contains deterministic failing evidence for the actual broken workflow and the failure is traceable to concrete production code.

---

# Article 02 — Restore Visual Truth in the Viewport

## Goal

Make it impossible for the viewport to visually imply that ordinary mold blocks are generated Master Mold bodies.

## Plan

Audit the ownership of reference mold bodies, cavity/final-mold bodies, Master Mold bodies, stale Master Mold bodies, and blocked Master Mold results.

Repair the viewport state so the UI has a clear distinction between:

```text
source/final mold geometry
Master Mold result geometry
Master Mold stale geometry
Master Mold failure
```

When Master Mold generation succeeds, the generated Master Mold bodies must be visibly present, the result must not be confused with reference blocks, and the user must be able to inspect their internal cavity/open-face geometry.

When a previously valid Master Mold becomes stale, do not silently replace it with unrelated geometry and do not erase all visual evidence unless deletion is intentional. Prefer a clearly marked stale/ghosted result if that fits the existing viewport architecture. Stale geometry must never be presented as current/manufacturable.

When generation is blocked, show the actual final-mold geometry separately from Master Mold result state. Do not render a fallback box and call it Master Mold.

Add the smallest inspection behavior needed to understand the result, using existing viewport patterns rather than a new CAD subsystem.

## Execution Loop

```text
render authoritative state
→ inspect scene graph
→ verify identity
→ verify current/stale/blocked behavior
→ repair ambiguity
→ rerun visual + unit tests
```

## Exit Gate

A developer and user can determine from the viewport alone whether a visible body is the final mold, a current Master Mold, a stale Master Mold, or no Master Mold at all.

No unrelated box may visually masquerade as a Master Mold.

---

# Article 03 — Replace the False-Negative Demold Gate

## Goal

Stop rejecting valid real final-mold parts because of an overly conservative normal-based heuristic.

## Plan

Audit the current open-direction analyzer and separate it into two responsibilities.

### Broad phase

Use cheap geometry evidence only to rank or reject obviously impossible candidates:

```text
+X
-X
+Y
-Y
+Z
-Z
```

Broad-phase heuristics may include bounds, candidate depth, open-side extent, obvious degenerate geometry, and stock feasibility.

A triangle-normal heuristic must not be the final authority for a real Master Mold.

### Precise phase

For each surviving candidate, perform an actual demoldability verification based on the geometry that will be manufactured.

Use existing BVH / Manifold infrastructure.

The precise verifier must answer:

> Can the final-mold target be translated out of the generated one-open-face Master Mold along this direction without penetrating the Master Mold beyond the repository tolerance?

Prefer direct geometric evidence over surface-normal inference.

A valid implementation may use a conservative translation/collision test, directional monotonicity analysis, or another deterministic geometric method already supportable by the repository. It must be justified in code and tests.

Do not introduce a second CAD kernel.

The precise phase must account for external target surfaces, internal cavity surfaces, Funnel/Sprue geometry, Registration geometry, segmentation boundaries, and repository geometry tolerance.

At coincident starting surfaces, use the established tolerance/clearance conventions instead of treating contact as penetration.

## Execution Loop

```text
candidate
→ broad phase
→ generate/prepare candidate geometry
→ precise demold verification
→ accept or reject with evidence
→ compare against known real fixtures
```

When the analyzer rejects a fixture that is known to be removable, inspect the collision/directional evidence and repair the algorithm. Do not whitelist the fixture.

## Exit Gate

A realistic cavity-bearing final-mold part that is actually removable in one orthogonal direction must resolve to a valid direction and generate a current Master Mold.

A deliberately trapped fixture must still be rejected.

---

# Article 04 — Repair One-Open-Face Master Geometry

## Goal

Ensure every successful result is a real one-open-face casting tool, not a hollow-looking stock box or an ambiguous Boolean artifact.

## Plan

For each final-mold target body:

1. select a verified pull/open direction;
2. construct Master stock with valid side walls and bottom;
3. subtract the exact target using the existing Manifold path;
4. make the selected cavity side accessible to the exterior without triangle deletion;
5. preserve a closed watertight Master Mold solid;
6. validate the resulting tool.

The Master Mold must reproduce the final-mold target geometry when cast.

Do not enlarge the cavity into a swept volume merely to make demolding pass, because that changes the cast part.

Do not manually delete triangles to create the open face.

Validate finite mesh, non-zero volume, manifold/watertight result, side-wall thickness, bottom thickness, detached fragments, cavity access to the intended opening, and agreement between demold verification and selected direction.

## Execution Loop

```text
build stock
→ subtract final-mold target
→ establish exterior opening
→ validate mesh
→ validate open-face access
→ validate demold path
→ repair if any invariant fails
```

## Exit Gate

Every `current` Master Mold body is a printable, watertight, one-open-face tool whose negative geometry corresponds to the authoritative final-mold target.

---

# Article 05 — Repair Funnel / Sprue Integration

## Goal

Make Funnel/Sprue a working upstream final-mold feature for Master Mold instead of merely a staleness trigger.

## Plan

Trace the real Funnel/Sprue geometry through:

```text
sprue definition
→ derived mold evaluation
→ final mold target body
→ Master Mold target
→ Master Mold result
```

Verify that the generated Master Mold reflects the Funnel/Sprue feature geometrically.

Replace any integration test whose success condition accepts `blocked` for an ordinary valid fixture.

Create at least these acceptance cases:

### Case A — no Funnel

```text
Final Mold
→ Master Mold
→ current
```

### Case B — Funnel added in a manufacturable orientation

```text
Final Mold
+ Funnel
→ Master Mold regeneration
→ current
→ Master geometry changes
```

### Case C — Funnel edited

Only dependent target fingerprints and Master Mold bodies should invalidate.

### Case D — intentionally impossible Funnel orientation

The system may return a structured physical-feasibility failure, but the test must be explicitly labeled as an impossible-tooling case. It must not be used as evidence that ordinary Funnel integration works.

Do not implement a separate Master Mold Funnel generator.

## Execution Loop

```text
add Funnel
→ inspect derived final-mold body
→ verify geometryVersion/fingerprint changes
→ regenerate Master Mold
→ compare geometry
→ verify current status
```

## Exit Gate

A valid Funnel/Sprue modification produces a correspondingly changed, current Master Mold result.

`blocked` is not accepted as a successful integration outcome for the valid fixture.

---

# Article 06 — Repair Registration Integration

## Goal

Prove that Registration geometry is consumed correctly by Master Mold and does not disappear between final-mold synthesis and Master generation.

## Plan

Trace registration bodies and their geometry versions through the same authoritative final-mold target seam used by Create Cavity.

Test both relevant registration forms where the repository supports them: positive/male geometry and negative/female geometry.

The Master Mold target must be the final registered mold body, not the pre-registration body.

Ensure Registration changes update the affected target fingerprint, invalidate only dependent Master Mold bodies, and regenerate into a current usable result when geometrically feasible.

## Execution Loop

```text
generate baseline
→ apply Registration
→ inspect final-mold target
→ inspect target fingerprint
→ regenerate
→ compare Master geometry
→ validate
```

## Exit Gate

Registration is visible in the resulting manufacturing geometry and a valid registered mold can regenerate to a current Master Mold.

---

# Article 07 — Repair Staleness Granularity

## Goal

Stop invalidating the entire Master Mold result when only one final-mold part changed.

## Plan

Audit the current staleness dependency chain.

Replace document-wide invalidation where sufficient per-part provenance exists.

Each Master Mold body should depend on a deterministic snapshot of the geometry that actually affects it, such as:

```text
finalMoldPartId
finalMoldGeometryVersion
source fingerprint
relevant Funnel/Sprue state
relevant Registration state
Master Mold parameters
selected/verified open direction
geometry tolerance
```

Use existing `geometryVersion`, fingerprints, and part IDs. Do not create a duplicate provenance framework.

If only one final-mold part changes:

```text
changed part
→ stale
unchanged sibling parts
→ remain current
```

If a global parameter truly affects all bodies, global invalidation is allowed.

## Execution Loop

```text
capture dependency snapshot
→ mutate one part
→ compare fingerprints
→ stale only dependent result
→ regenerate only dependent result
→ verify siblings remain current
```

## Exit Gate

A local change does not cause unrelated Master Mold bodies to disappear, become stale, or regenerate.

---

# Article 08 — Repair Failure Semantics

## Goal

Turn red generic failures into precise engineering outcomes without hiding real problems.

## Plan

Audit Master Mold failure reasons and ensure each represents a distinct failure class.

At minimum distinguish:

- invalid source geometry;
- final-mold target synthesis failure;
- no verified pull direction;
- invalid Master stock;
- Boolean failure;
- insufficient wall thickness;
- insufficient bottom thickness;
- detached fragment;
- non-manifold result;
- open-face inaccessible;
- stale request;
- cancellation.

Do not report `no_valid_open_direction` when the real cause is analyzer uncertainty, Boolean failure, target synthesis failure, tolerance failure, or stale state.

UI messages should explain the actual next action.

Warnings and hard failures must not be conflated.

## Execution Loop

```text
trigger failure
→ trace root cause
→ map to structured reason
→ verify UI message
→ verify state transition
```

## Exit Gate

Every user-visible Master Mold error can be mapped to a concrete production failure and cannot be mistaken for a successful or stale state.

---

# Article 09 — Repair the Master Mold Action Lifecycle

## Goal

Make the toolbar action predictable from Ready through Generate, Current, Stale, Regenerating, and Failure.

## Plan

Audit the Master Mold action/store lifecycle.

Required behavior:

```text
Ready
→ Generating
→ Current
```

After a relevant upstream change:

```text
Current
→ Stale
→ Regenerating
→ Current
```

On failure:

```text
Regenerating
→ Failed/Blocked
```

A failed regeneration must not corrupt unrelated current sibling results.

Protect against stale worker responses, duplicate clicks, overlapping requests, old geometry replacing new geometry, cancellation races, and store status inconsistent with viewport contents.

Use request IDs/revisions already present in the repository.

## Execution Loop

```text
start request
→ mutate/cancel/retry
→ inspect request identity
→ accept only authoritative result
→ verify store + viewport agreement
```

## Exit Gate

The action state, stored Master Mold result, and viewport representation always describe the same authoritative generation request.

---

# Article 10 — Replace Synthetic-Only Acceptance with Real Workflow Tests

## Goal

Make it impossible for CI to report Master Mold ready while the actual Craft workflow is broken.

## Plan

Keep low-level unit tests, but add product-level coverage.

The browser-level acceptance path must exercise as much of the production workflow as is stably automatable:

```text
load realistic model/fixture
→ committed mold/cutting state
→ add or preserve Funnel/Sprue
→ preserve Registration
→ trigger Master Mold production action
→ wait for worker
→ assert current result
→ assert visible Master Mold geometry
→ assert no uncaught browser errors
```

Do not use a direct worker probe as the only E2E evidence.

A test-only probe may remain for kernel diagnostics, but it must be classified as a diagnostic test, not product acceptance.

Create at least one realistic integration fixture whose geometry includes a cavity-bearing final mold, more than one final-mold body if supported by fixture infrastructure, Funnel/Sprue, and Registration.

Assert actual result identity, body count, current state, non-empty mesh, and visible runtime objects.

## Execution Loop

```text
run real workflow
→ inspect UI state
→ inspect store state
→ inspect viewport scene
→ inspect console/page errors
→ repair
→ rerun
```

## Exit Gate

CI fails if the user-facing Master Mold flow reproduces the current broken behavior.

---

# Article 11 — Remove Repair Debt

## Goal

Finish with one coherent implementation rather than layers of temporary fixes.

## Plan

After the repaired path passes:

- remove superseded heuristic-only blocking logic;
- remove obsolete fallback behavior;
- remove duplicate tests that assert the old broken contract;
- remove dead status handling;
- remove comments that describe behavior no longer true;
- consolidate shared final-mold target logic if duplication exists;
- verify no Master-specific copies of Funnel, Registration, Boolean, cavity, mesh, or provenance systems were introduced.

Inspect for circular imports, duplicate geometry conversion, repeated mesh disposal logic, stale cache keys, unbounded worker caches, hard-coded visual states, React components owning geometry algorithms, and geometry modules owning UI behavior.

## Execution Loop

```text
search duplicates
→ identify obsolete path
→ remove/replace
→ typecheck
→ focused tests
→ broad tests
```

## Exit Gate

There is one authoritative production path for final-mold target synthesis and one authoritative production path for Master Mold generation.

---

# Article 12 — Production Closure

## Goal

Prove the repair is ready for real use.

## Plan

Run the repository’s real quality gates.

At minimum, where available:

```text
typecheck
lint
focused Master Mold tests
cavity/final-mold regression tests
Funnel/Sprue tests
Registration tests
viewport tests
store/lifecycle tests
worker tests
browser/E2E tests
production build
```

Review every failure. Do not dismiss a failure as unrelated without evidence.

Perform a final manual browser verification using a realistic Craft model.

Verify:

1. segmentation/final mold remains intact;
2. Master Mold generates visible geometry;
3. the generated result is not an empty/reference block;
4. the Master Mold can be inspected visually;
5. Funnel/Sprue is reflected after regeneration;
6. Registration is reflected after regeneration;
7. a local change does not stale every unrelated Master Mold body;
8. no unexpected red errors appear;
9. browser console has no uncaught Master Mold errors;
10. generated current bodies pass geometry validation.

## Execution Loop

```text
run gate
→ inspect failure
→ repair root cause
→ rerun gate
→ continue automatically
```

Do not stop after a passing subset.

## Exit Gate

All required gates pass and the realistic user workflow produces a current, visible, usable Master Mold.

---

# Mandatory Acceptance Matrix

| Scenario | Required Result |
|---|---|
| Simple final-mold part | Master Mold `current` |
| Real cavity-bearing final-mold part with valid pull direction | Master Mold `current` |
| Multiple final-mold parts | Independent Master Mold bodies |
| Valid Funnel/Sprue added | Affected Master Mold regenerates to `current` |
| Valid Registration added | Affected Master Mold regenerates to `current` |
| One local mold part changes | Only dependent Master Mold becomes stale |
| Stale Master Mold exists | UI clearly distinguishes stale from current |
| Physically trapped target | Structured infeasibility failure |
| Invalid source mesh | Structured source-geometry failure |
| Boolean failure | Structured Boolean failure |
| Worker race/stale response | Old result cannot overwrite new result |
| Browser production flow | Visible Master Mold geometry, no uncaught errors |

---

# Explicit Non-Solutions

Do not claim the repair is complete by doing any of the following:

```text
force +Z
disable undercut validation
accept blocked as success
hide the error message
render reference blocks as fallback Master Mold
skip Funnel during Master Mold generation
skip Registration during Master Mold generation
require Create Cavity to be clicked first
replace real E2E with worker-only probe
add a second Boolean engine
add a second cavity engine
add a Master-specific Funnel system
add a Master-specific Registration system
```

---

# Scope Boundary

This execution is focused on repairing the current one-piece orthogonal Master Mold workflow.

Do not add unrelated capabilities such as arbitrary free-angle pull optimization, generative AI, ML, cloud processing, backend services, slicer/support generation, material chemistry simulation, shrinkage databases, or automatic manufacturing costing.

If repository evidence proves that a specific real final-mold geometry is **physically impossible** to cast with the current one-piece Master Mold product contract, do not fake success.

Record that case separately with exact geometric evidence.

Do not automatically introduce split Master Mold, removable cores, or multi-part Master tooling unless they are strictly necessary to close a proven production case and can be added without changing the existing product semantics. If such a physical limitation is reached, finish every repair that is independent of it and disclose the remaining limitation precisely in the final report.

---

# Definition of Done

Master Mold Execution 03 is complete only when all statements below are true:

- Master Mold is generated from authoritative final-mold target geometry.
- Real cavity-bearing mold geometry can generate when geometrically feasible.
- Open-direction validation is based on precise geometry evidence, not only triangle-normal heuristics.
- Current Master Mold bodies are visibly distinguishable from ordinary mold bodies.
- Stale results are not silently confused with current results.
- Funnel/Sprue changes are reflected in regenerated Master Mold geometry.
- Registration changes are reflected in regenerated Master Mold geometry.
- A valid Funnel or Registration integration test requires `current`, not `blocked`.
- Local upstream changes invalidate only dependent Master Mold bodies.
- No stale worker result can overwrite a newer request.
- Browser acceptance covers the production workflow, not only a direct worker probe.
- No duplicate geometry engine or feature-specific copy was introduced.
- Typecheck, relevant tests, browser tests, and production build pass.
- A realistic manual Craft workflow produces a visible, usable Master Mold.

---

# Final Engineering Report

At completion, produce a concise evidence-based report with these sections.

## 1. Final Decision

Exactly one:

```text
READY
READY WITH DISCLOSED PHYSICAL LIMITATION
NOT READY
```

## 2. Root Causes Found

For every root cause include file/module, incorrect behavior, why it caused the user-visible failure, and repair performed.

## 3. Geometry Repair

State the old demold decision method, new precise verification method, tolerance policy, evidence that valid real geometry now passes, and evidence that deliberately impossible geometry still fails.

## 4. Funnel and Registration Integration

State exactly how their final-mold geometry reaches Master Mold and list the tests proving regeneration ends in `current`.

## 5. Viewport Repair

State how the UI now distinguishes final mold, current Master Mold, stale Master Mold, and failed/blocked Master Mold.

## 6. Staleness and Incremental Regeneration

List the dependency/fingerprint rules and prove that an isolated part change does not invalidate unaffected siblings.

## 7. Test Evidence

Report actual commands and results for focused tests, integration tests, browser/E2E tests, typecheck, build, and any broader regression suite executed.

Do not report estimated or invented counts.

## 8. Remaining Limitations

Only concrete limitations supported by repository or geometric evidence.

Do not classify a bug as a physical limitation.

## 9. Changed Files

List every intentionally changed production and test file with a one-line reason.

---

# Completion Rule

Continue automatically from Article 01 through Article 12.

A failed exit gate means:

```text
investigate
→ repair
→ rerun
```

not:

```text
report failure
→ stop
```

Stop only after the final Definition of Done has been evaluated and the Final Engineering Report has been produced.
