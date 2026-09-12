# Master Mold Execution Zero Two

## Closure, Integration, and Production Hardening Execution

### Mission

Close the remaining gaps from **Master Mold Execution Zero One** and make Master Mold a trustworthy, lifecycle-correct manufacturing tool that integrates with Craft's existing mold-generation tools without creating duplicate geometry engines, duplicate state ownership, or isolated UI behavior.

Execution Zero Two is **corrective and integrative**.

It must preserve the working Zero One foundation:

```text
Committed Cutting Result
        │
        ├── Create Cavity
        │
        └── Master Mold
                ↓
       Final Mold Target
                ↓
       Pull / Open-Direction Analysis
                ↓
       Master Mold Generation
```

Do not replace this architecture unless repository evidence proves a specific part is incorrect.

The primary objective is:

```text
Working Master Mold Core
        +
Authoritative Stale Lifecycle
        +
Verified Open Casting Face
        +
Stronger Demold Safety
        +
Toolbar / Tool Integration
        +
End-to-End Product Validation
        =
Production-Ready Master Mold V1
```

---

# Execution Contract

Execute continuously from Article 01 through Article 08.

Do not pause after an article, test group, successful loop, or intermediate repair.

For every article:

**Investigate → Repair → Test → Regress → Continue**

Repository evidence is authoritative.

Prefer modifying, extracting, deleting, or reusing existing code over adding parallel systems.

Do not create:

- a second cavity engine;
- a second registration engine;
- a Master Mold-specific Sprue engine;
- a second segmentation system;
- another Boolean kernel;
- another BVH library;
- ML/LLM geometry planning;
- backend or server infrastructure;
- a second toolbar framework;
- duplicate viewport rendering primitives.

---

# Article 01 — Authoritative Master Mold Lifecycle

## Goal

Make Master Mold state truthful at all times.

A previously generated Master Mold must never remain `current` after any authoritative input used to generate it has changed.

## Required Behavior

The lifecycle must become:

```text
Generate Master Mold
        ↓
current

Upstream manufacturing input changes
        ↓
stale

Regenerate Master Mold
        ↓
current
```

The following changes must invalidate affected Master Mold outputs:

- imported model replacement;
- part orientation change;
- cutting-plan modification;
- Cut by Face modification;
- Segmentation result replacement;
- Segmentation extension-axis modification;
- Mold Scale change;
- cavity clearance change when it changes the final-mold target;
- Sprue/Funnel intent change;
- Registration geometry change;
- removal or replacement of a final mold part;
- Undo/Redo that changes authoritative source geometry.

Do not rely on the next `Generate` click to discover staleness.

Staleness must be propagated when the source changes.

## Architecture

Keep Master Mold as a sibling domain, but give it an explicit invalidation seam.

Prefer a small API equivalent to:

```text
markMasterMoldStale(sourceChange)
resetMasterMold()
invalidateMasterMoldParts(partIds)
```

Do not make the SplitFace store own Master Mold geometry.

Do not embed Master Mold implementation logic inside unrelated stores.

Use document revision, final-mold geometry version, source fingerprints, and part IDs already available in the repository.

If only one final mold part changes:

```text
Part A changed → Master A stale
Part B unchanged → Master B remains reusable
```

If the whole source model is replaced:

```text
All Master Mold results → unavailable/reset
```

## Rendering Gate

The viewport must render only bodies whose provenance is still valid.

A stale body must never remain visible as a valid finished Master Mold.

## Exit Gate

Pass only when:

- `stale` is a real runtime state, not only a contract type;
- source changes invalidate Master Mold immediately;
- model replacement clears old Master Mold geometry;
- Undo/Redo cannot restore mismatched geometry;
- unchanged siblings remain reusable;
- stale results cannot render as current.

---

# Article 02 — Verified Open Casting Face

## Goal

Prove geometrically that every generated Master Mold has a real, accessible casting opening.

Watertight geometry alone is insufficient.

## Required Geometry Contract

A valid Master Mold must satisfy all of the following:

```text
Closed printable solid shell
        +
One intended exterior-connected cavity opening
        +
Target cavity reachable through that opening
        +
No accidental sealed cavity
        +
No unintended second opening
```

Do not create the opening by deleting triangles.

Continue using Manifold Boolean construction.

## Robust Construction

Avoid relying only on exact coplanar coincidence between the target and Master Stock.

Prefer a robust Boolean strategy equivalent to:

```text
Target
   ↓
extend through chosen open plane by tolerance-safe distance
   ↓
subtract extended target from Master Stock
   ↓
validate resulting cavity access
```

The extension distance must derive from the repository's geometry tolerance policy, not an arbitrary magic constant.

## Open-Access Validation

Implement an explicit validator that proves the intended cavity is connected to the exterior through the selected opening.

Use existing geometry/BVH/Manifold capabilities where appropriate.

Return a structured failure such as:

```text
open_face_inaccessible
```

when the Boolean result is watertight but the casting cavity is sealed or inaccessible.

Also reject unintended multiple exterior casting openings when deterministically detectable.

## Exit Gate

Pass only when tests prove:

- simple box → valid open face;
- irregular removable target → valid open face;
- intentionally sealed construction → rejected;
- wrong-side opening → rejected;
- open face remains accessible after Boolean tolerance handling;
- result remains watertight and manifold.

---

# Article 03 — Demoldability Hardening

## Goal

Strengthen the existing six-direction analyzer without replacing it.

Keep:

```text
+X -X +Y -Y +Z -Z
```

for V1.

## Required Improvement

Retain the current cheap Stage A filter.

Strengthen Stage B so one centroid probe per triangle is not the only evidence for demoldability.

Use existing BVH infrastructure to evaluate ambiguous geometry more conservatively.

Prioritize:

- reverse-facing surfaces;
- narrow necks;
- shoulders;
- re-entrant geometry;
- partially occluded regions;
- close separated lobes;
- cavity features that trap the physical cast during straight extraction.

Use adaptive refinement only where needed.

Do not introduce a large uniform ray grid.

Do not introduce arbitrary non-orthogonal optimization.

## Reuse Existing Craft Intelligence

Inspect the existing Pull Direction / Draft Analysis infrastructure.

Reuse stable shared mathematical or geometric primitives where genuinely compatible.

Do not force Master Mold to depend on report/UI-oriented analysis abstractions whose contracts are not production geometry authorities.

## Exit Gate

Add adversarial fixtures and prove:

- deterministic selection;
- obvious removable geometry passes;
- clear undercuts fail;
- narrow-neck trap fails;
- shouldered geometry chooses the valid side;
- no-valid-direction returns a structured blocked result;
- repeated execution on identical geometry produces identical selection.

---

# Article 04 — Final Mold Feature Dependency Integration

## Goal

Make Master Mold regenerate from the real final-mold target whenever final-mold features change.

Master Mold must not own separate versions of Funnel/Sprue or Registration.

## Authoritative Flow

Preserve this dependency direction:

```text
Committed Mold Geometry
        ↓
Final Mold Target
        ↓
Sprue / Funnel
        ↓
Registration / Alignment
        ↓
Final Mold Geometry Version
        ↓
Master Mold inversion
```

If repository ownership evaluates Registration before Sprue or combines them differently, preserve the repository's actual authoritative order while keeping the same domain rule:

> Master Mold reproduces the final mold; it does not invent independent final-mold features.

## Funnel / Sprue

When the user modifies a final-mold Sprue/Funnel:

```text
Sprue intent changes
        ↓
Final Mold Target changes
        ↓
Affected Master Mold becomes stale
        ↓
Regenerate
```

Do not add:

```text
MasterMoldSprueService
```

The open face remains the Master Mold's material-pouring opening.

## Registration

When Registration geometry changes:

```text
Registration changes
        ↓
Final Mold Target changes
        ↓
Affected Master Mold becomes stale
```

Do not add Master Mold registration keys in this execution.

## Exit Gate

Pass when Master Mold reproduces current Sprue/Registration geometry through the final-mold target pipeline and no duplicate feature engine exists.

---

# Article 05 — Toolbar Tool Integration

## Goal

Make Master Mold behave as a native Craft manufacturing state rather than an isolated toolbar button.

## Integration Matrix

### Create Cavity

Keep both tools independent.

```text
Create Cavity ≠ prerequisite for Master Mold
Master Mold ≠ replacement for Create Cavity
```

Switching between them must not corrupt either result.

A current Cavity result may be reused as a final-mold target only when provenance proves it is current.

### Constructed Cutting Plan / Segmentation / Cut by Face

Any committed topology change must invalidate affected Master Mold results.

While a cutting session is open, Master Mold must follow the same truthful availability rules as other post-commit manufacturing tools.

Do not generate against an uncommitted draft.

### Mold Scale

Mold Scale changes the authoritative final mold envelope.

It must invalidate affected Master Mold geometry immediately.

Do not perform expensive Master Mold Boolean work during pointer dragging.

Use:

```text
interactive change → stale
commit → source current
explicit Master Mold regeneration → expensive Boolean
```

### Eraser

Eraser must act on authoritative feature intent or upstream geometry ownership.

Do not implement triangle-level destructive editing of Master Mold output.

If Eraser removes a source feature that affects the final mold:

```text
source feature removed
        ↓
Final Mold Target changes
        ↓
Master Mold stale
```

### Sprue / Funnel

Keep it a final-mold feature.

If edited after Master Mold generation, invalidate the affected Master Mold.

### Registration

Keep Registration under its current authoritative owner.

A registration change invalidates affected Master Mold geometry.

### Pointer / Selection

Master Mold bodies must remain inspectable without hijacking unrelated selection behavior.

### Undo / Redo

Undo/Redo must restore authoritative intent and trigger truthful Master Mold invalidation/reuse.

Never restore Master Mold geometry whose fingerprint no longer matches restored source state.

## Toolbar State

Master Mold must support coherent states:

```text
Unavailable
Ready
Generating
Current
Stale
Blocked
Error
```

The UI must never communicate `current` while the source is stale.

## Exit Gate

Pass when the complete toolbar interaction matrix is covered by lifecycle tests and no tool requires Master Mold-specific duplicate logic unless the behavior is genuinely Master Mold-specific.

---

# Article 06 — Product UX Closure

## Goal

Make failures and lifecycle state understandable without requiring the user to infer them from geometry disappearance.

## Required UX

Keep the existing icon and toolbar style.

Add concise visible feedback for:

- generating;
- stale / needs regeneration;
- blocked because one-piece Master Mold is infeasible;
- open-face validation failure;
- geometry/Boolean failure;
- partial multi-part success.

For multi-part results, communicate which part failed without discarding valid siblings.

Do not build a large new panel unless the existing UI architecture clearly requires it.

Prefer existing status, tooltip, HUD, contextual message, or lightweight result patterns.

## Accessibility

Verify:

- keyboard focus;
- accessible label;
- disabled semantics;
- tooltip;
- selected/current semantics;
- stale is not exposed as selected/current;
- error text is accessible.

Validate Light Mode and Dark Mode.

## Exit Gate

Pass when a user can distinguish:

```text
Ready
Generating
Current
Needs regeneration
Partially blocked
Failed
```

without inspecting developer state.

---

# Article 07 — End-to-End Validation

## Goal

Prove the actual user workflow, not only isolated geometry functions.

## Required E2E Path

Where executable browser infrastructure permits, automate the real UI flow:

```text
Import model
→ create / commit cutting result
→ Master Mold becomes available
→ click Master Mold
→ final-mold target is synthesized
→ Master Mold Worker runs
→ result appears in viewport
→ modify an upstream source
→ old Master Mold becomes stale / disappears as valid result
→ regenerate
→ new result appears
→ switch to Create Cavity
→ no state corruption
```

Also cover a multi-part path.

The existing Worker probe may remain as a geometry smoke test, but it does not replace this product E2E.

## Test Groups

At minimum cover:

- Master Mold contracts;
- fingerprint/provenance;
- open-direction analysis;
- open-face accessibility;
- generator;
- Worker client;
- store lifecycle;
- viewport adapter/runtime;
- toolbar action;
- model replacement;
- cutting invalidation;
- Segmentation invalidation;
- Mold Scale invalidation;
- Sprue dependency;
- Registration dependency;
- Undo/Redo;
- Create Cavity independence;
- multi-part partial failure;
- real-browser UI workflow.

Run relevant existing regression suites for:

- cavity;
- split face;
- segmentation;
- cutting workflow;
- sprue;
- registration;
- viewport;
- toolbar;
- architecture.

## Exit Gate

No remaining failure may be dismissed as unrelated without evidence.

---

# Article 08 — Production Closure

## Goal

Finish Execution Zero Two only when repository and product evidence agree.

## Required Checks

Run:

```text
typecheck
lint
architecture checks
focused Master Mold tests
relevant regression tests
production build
bundle budget
browser E2E
```

Inspect the final diff for:

- duplicated Boolean logic;
- duplicated cavity logic;
- duplicate stale ownership;
- Master Mold-specific Sprue/Registration copies;
- unused failure reasons;
- hidden current/stale mismatch;
- unbounded caches;
- Worker cancellation defects;
- undisposed Manifold solids;
- undisposed Three/BVH resources;
- hard-coded state coupling;
- geometry work triggered by hover/pointer motion;
- stale Master Mold geometry visible after model replacement.

Delete obsolete alternatives rather than leaving dead paths.

---

# Definition of Done

Execution Zero Two is complete only when all conditions below are true.

### Lifecycle

Master Mold becomes stale immediately when an authoritative dependency changes.

### Model Replacement

Old Master Mold geometry cannot survive as a valid result after replacing the imported model.

### Open Face

Every successful Master Mold contains a verified exterior-connected casting opening.

### Demolding

The selected orthogonal direction is supported by conservative geometric evidence.

### Final Mold Fidelity

Master Mold reproduces the current final-mold geometry, including applicable Sprue/Funnel and Registration geometry.

### Tool Integration

Master Mold integrates correctly with:

- Create Cavity;
- Constructed Cutting Plan;
- Cut by Face;
- Segmentation;
- Mold Scale;
- Sprue/Funnel;
- Registration;
- Eraser;
- Pointer/Selection;
- Undo;
- Redo.

### Independence

Master Mold remains an independent user-facing alternative to Create Cavity.

### Incremental Regeneration

Only affected Master Mold parts are regenerated when provenance allows sibling reuse.

### UI

The toolbar truthfully represents Ready, Generating, Current, Stale, Blocked, and Error behavior.

### Performance

Expensive Master Mold generation runs only when required, never during simple hover or continuous pointer movement.

### Architecture

No duplicate geometry kernel, feature engine, segmentation system, or rendering framework exists.

### Testing

The real product flow is tested in addition to Worker-level geometry probes.

### Build

All production quality gates pass.

---

# Explicitly Out of Scope

Do not add in Execution Zero Two:

- automatic multi-piece Master Mold splitting;
- non-orthogonal continuous pull optimization;
- Master Mold-specific registration keys;
- Master Mold-specific sprues;
- vents;
- material chemistry simulation;
- cure simulation;
- slicer functionality;
- print supports;
- cloud computation;
- backend services;
- ML or generative mold planning.

If a one-piece Master Mold is impossible, report it correctly.

Do not hide infeasibility by automatically creating a new manufacturing strategy.

---

# Final Engineering Report

At completion return:

## 1. Decision

```text
READY
READY WITH DISCLOSED LIMITATIONS
NOT READY
```

## 2. Closed Gaps

State exactly which Zero One gaps were closed.

## 3. Tool Integration

Report behavior with:

```text
Create Cavity
Cut by Face
Segmentation
Mold Scale
Sprue/Funnel
Registration
Eraser
Undo/Redo
Model Replacement
```

## 4. Geometry

Report:

- open-direction strategy;
- undercut validation;
- open-face construction;
- open-access validation;
- Boolean strategy;
- wall/bottom validation;
- multi-part behavior.

## 5. Lifecycle

Report:

- stale triggers;
- reset triggers;
- per-part invalidation;
- fingerprint/reuse behavior;
- late Worker result protection.

## 6. Tests

Report exact commands and exact results.

Separate:

```text
Master Mold tests
integration tests
regression tests
browser E2E
build/type/lint/architecture
```

## 7. Remaining Limitations

State only real remaining limitations.

Do not describe future work as implemented.

---

# Final Instruction

Do not solve Zero Two by making Master Mold larger.

Solve it by making its boundaries more truthful.

The preferred result is:

```text
Existing Craft Authorities
        +
Small Master Mold Domain
        +
Correct Invalidations
        +
Verified Casting Access
        +
Strong Pull Validation
        +
Native Tool Integration
        =
Reliable Master Mold
```
