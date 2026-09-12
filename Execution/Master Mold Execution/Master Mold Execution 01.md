# Master Mold Execution Zero One

## Production Implementation Execution

### Mission

Implement **Master Mold** as a production-ready manufacturing workflow inside the existing Craft repository.

Master Mold must appear as an independent alternative to **Create Cavity** after the cutting workflow has produced a valid committed result.

The product-level choice is:

```text
Committed Cutting Result
        │
        ├── Create Cavity
        │
        └── Master Mold
```

The two tools are independent from the user's perspective.

Internally, Master Mold must reuse the existing mature Craft geometry infrastructure wherever technically correct rather than introducing duplicate geometry engines.

The implementation must deliver a usable end-to-end product, not a prototype, mock, isolated demonstration, or disconnected UI state.

---

# Execution Contract

This execution operates continuously.

Do not stop after a Task, Phase, test group, investigation, implementation milestone, or successful loop.

Each Task is an article containing:

**Goal → Plan → Execution Loop → Exit Gate**

When an Exit Gate passes, immediately continue to the next article.

When an Exit Gate fails:

1. identify the smallest authoritative cause;
2. repair it;
3. rerun the relevant loop;
4. continue until the gate passes;
5. automatically enter the next article.

Do not request approval between articles.

Do not create a harness that deliberately pauses execution between loops or phases.

Repository evidence is authoritative.

Inspect the actual implementation before modifying architecture. Do not assume file names, ownership, stores, workers, selectors, component boundaries, or workflows from this document if the repository proves otherwise.

When repository evidence conflicts with an assumption here, preserve the intended product behavior while adapting the implementation to the repository's real architecture.

---

# Engineering Principles

The execution must optimize simultaneously for:

- production correctness;
- geometric robustness;
- minimal architectural complexity;
- reuse over duplication;
- deterministic behavior;
- explicit ownership;
- derived-state integrity;
- predictable invalidation;
- worker-safe heavy computation;
- local failure containment;
- testability;
- maintainability;
- accessibility;
- performance proportional to changed geometry.

Do not introduce another CAD kernel.

Do not introduce a second segmentation system.

Do not introduce a Master Mold-specific Boolean engine.

Do not introduce ML, LLM inference, generative optimization, voxel infrastructure, server infrastructure, or backend infrastructure for this execution.

Do not duplicate existing Manifold, BVH, cavity-generation, tolerance, geometry payload, worker, provenance, or validation behavior when the existing implementation can safely provide it.

New intelligence should primarily answer:

> How should this individual Master Mold be opened and validated?

The existing geometry infrastructure should answer:

> How should robust solid geometry be constructed?

---

# Product Definition

A **Master Mold** is a temporary manufacturing tool used to produce one physical part of the final mold.

If the committed mold design contains three mold parts:

```text
Final Mold Part A
Final Mold Part B
Final Mold Part C
```

Craft must generate:

```text
Master Mold A
Master Mold B
Master Mold C
```

Each Master Mold is independent.

The user prints each Master Mold separately.

The user pours the desired mold-making material into each printed Master Mold separately.

Example:

```text
Master Mold A
    ↓
Pour material
    ↓
Physical Final Mold Part A
```

The Master Molds themselves are **not assembled and filled together**.

After all physical mold parts are produced, those resulting parts form the final mold.

The Master Mold therefore behaves as a manufacturing representation of a final mold part, not as the final mold itself.

---

# Critical Domain Boundary

The following distinction is non-negotiable:

```text
Final Mold Geometry
        ≠
Master Mold Manufacturing Geometry
```

The final mold is the desired product.

The Master Mold is the temporary tool that manufactures that product.

Funnel/Sprue and Registration/Alignment belong conceptually to the **final mold domain**.

They must never be reinterpreted as Master Mold assembly features merely because the Master Mold workflow is active.

A Master Mold does not receive its own registration system in Execution Zero One.

A Master Mold does not receive its own pour funnel in Execution Zero One.

Its single open face is the material-pouring opening.

If final-mold functional geometry changes after Master Mold generation, affected Master Mold results must become stale and be regenerated from the updated final-mold target rather than manually patched.

---

# Master Mold V1 Geometric Contract

Every generated Master Mold must:

- correspond to exactly one final-mold part;
- be an independent solid;
- have exactly one intended open casting face;
- remain a valid watertight printable solid;
- contain the inverse geometry required to reproduce its target mold part;
- maintain safe positive wall thickness;
- maintain safe positive bottom thickness;
- avoid invalid detached fragments;
- preserve finite coordinates;
- produce non-zero valid volume;
- preserve stable source provenance;
- support deterministic regeneration;
- report failure rather than silently producing geometrically unsafe output.

"Open face" does not mean deleting triangles from the mesh.

The Master Mold solid itself must remain watertight.

The cavity must reach the exterior through the selected open side while the enclosing body remains a valid printable solid.

---

# Article 01 — Repository Reconnaissance and Baseline Lock

## Goal

Build an authoritative map of the current Craft implementation before changing code.

Identify the actual ownership of:

- cutting workflow;
- committed mold bodies;
- Create Cavity;
- cavity-generation contracts;
- Manifold helpers;
- mesh payload conversion;
- BVH usage;
- workers;
- derived mold evaluation;
- sprue/funnel;
- registration;
- geometry versions;
- source fingerprints;
- stale-result handling;
- toolbar;
- toolbar icon components;
- hover and tooltip behavior;
- light mode;
- dark mode;
- viewport result rendering;
- tests;
- bundle and architecture checks.

## Plan

Trace actual execution from:

```text
Imported Model
→ Cutting Workflow
→ Done / Commit
→ committed mold result
→ Create Cavity
→ derived tools
→ viewport
```

Identify which geometry functionality can be reused by Master Mold without introducing circular ownership.

Determine whether Create Cavity currently owns reusable geometry logic that should be extracted behind an internal shared function without changing Create Cavity's external behavior.

Record the current test baseline before modifications.

Do not perform broad cleanup unrelated to Master Mold.

## Execution Loop

```text
Inspect
  ↓
Trace ownership
  ↓
Trace data dependencies
  ↓
Trace worker boundaries
  ↓
Trace rendering
  ↓
Run focused baseline tests
  ↓
Run architecture/type checks
  ↓
Compare assumptions with repository evidence
```

If ownership is ambiguous, trace call sites until one authoritative owner is proven.

If duplicate ownership already exists, do not add a third owner.

## Exit Gate

Article 01 passes only when:

- the authoritative source of committed cutting geometry is known;
- the Create Cavity entry point is known;
- the reusable cavity geometry seam is known;
- downstream sprue/registration ownership is known;
- toolbar insertion point is known;
- worker ownership is known;
- current tests and architecture checks have a recorded baseline;
- no production behavior has been modified yet.

Continue immediately to Article 02.

---

# Article 02 — Establish the Final-Mold Target Boundary

## Goal

Introduce the minimum architectural seam required for Create Cavity and Master Mold to coexist without duplicating the underlying final-mold geometry generation.

## Plan

Master Mold must be independently selectable from Create Cavity in the UI.

However, Master Mold still needs the geometry of the mold part that it is intended to manufacture.

Do not force the user to execute Create Cavity first.

Instead, reuse the authoritative cavity/final-mold geometry capability internally.

Conceptually:

```text
Committed Cutting Result
        │
        ├── Create Cavity
        │       ↓
        │   Final Mold Result
        │
        └── Master Mold
                ↓
        Final Mold Target Synthesis
                ↓
        Master Mold Generation
```

The common geometry operation should have one implementation.

Do not make Master Mold call a UI action such as `createCavity()` as a side effect.

If necessary, extract the pure/reusable geometric portion behind an internal contract while preserving the current Create Cavity public workflow.

Prefer a concept equivalent to:

```text
FinalMoldTarget
```

or:

```text
CastTargetBodies
```

over spreading knowledge of `cavityResult` through the Master Mold implementation.

Names must follow existing repository conventions.

## Execution Loop

```text
Locate reusable cavity core
        ↓
Separate UI action from reusable geometry only if required
        ↓
Define minimal target contract
        ↓
Route existing Create Cavity through unchanged behavior
        ↓
Route Master Mold preparation through same geometry authority
        ↓
Run existing Create Cavity tests
```

If any existing Create Cavity behavior changes unintentionally, repair the seam before continuing.

Do not rewrite the cavity system.

## Exit Gate

Pass only when:

- Create Cavity still behaves exactly as before;
- Master Mold can obtain final-mold target geometry without requiring the user to run Create Cavity;
- there is one authoritative geometry implementation rather than duplicated cavity logic;
- no circular dependency exists;
- existing cavity tests pass.

Continue automatically to Article 03.

---

# Article 03 — Master Mold Domain Contracts and Provenance

## Goal

Create a small, explicit Master Mold domain that owns only Master Mold-specific intent and derived results.

## Plan

Create a focused feature boundary consistent with the repository's structure.

It should represent concepts equivalent to:

```text
MasterMoldRequest
MasterMoldParameters
MasterMoldSource
MasterMoldResult
MasterMoldBodyResult
MasterMoldStatus
MasterMoldFailureReason
MasterMoldDirection
MasterMoldSourceFingerprint
```

Do not create a giant store.

Do not copy the full cavity contracts and rename them.

Store only Master Mold-specific state.

A Master Mold result must retain enough provenance to answer:

- Which committed mold part created this Master Mold?
- Which geometry version was used?
- Which final-mold target version was used?
- Which open direction was selected?
- Which wall/bottom settings were used?
- Is the result current or stale?
- What failed, if generation was blocked?

Use deterministic fingerprints.

Two identical inputs must result in equivalent generation intent and source fingerprints.

## Execution Loop

```text
Define contracts
  ↓
Define source ownership
  ↓
Define fingerprints
  ↓
Define stale semantics
  ↓
Write contract tests
  ↓
Verify no duplicated geometry payload model
```

Reuse the repository's existing mesh/bounds/body contracts where compatible.

## Exit Gate

Pass when the domain is minimal, typed, deterministic, and does not duplicate existing geometry infrastructure.

Continue immediately to Article 04.

---

# Article 04 — Open Direction Analyzer

## Goal

Implement the only substantial new geometric intelligence required by Master Mold V1:

> determine whether a final mold part can be reproduced in a one-piece open-face Master Mold and select the best opening direction.

## Plan

Start with the six orthogonal candidate directions:

```text
+X
-X
+Y
-Y
+Z
-Z
```

Do not introduce arbitrary continuous-direction optimization in Execution Zero One.

This matches Craft's current orthogonal design philosophy and keeps behavior explainable and deterministic.

Use a two-stage evaluation.

### Stage A — Cheap Candidate Filtering

For each direction evaluate inexpensive properties first:

- bounds;
- required box depth;
- candidate open-plane position;
- obvious geometric impossibility;
- degenerate dimensions;
- invalid or non-finite source geometry.

Reject impossible candidates before expensive spatial queries.

### Stage B — Demoldability Analysis

Use the existing spatial acceleration infrastructure, preferably the repository's existing `three-mesh-bvh` capability where appropriate.

Determine whether the target geometry contains reverse geometry/undercuts that block straight extraction along the proposed pull direction.

Use pull-direction reasoning consistent with professional mold draft analysis:

```text
Target moves along candidate pull vector
        ↓
Would target geometry collide with the surrounding negative tool?
        ↓
yes → reject direction
no  → candidate valid
```

Do not brute-force triangle-against-triangle comparisons if BVH queries can answer the same question.

Use adaptive sampling or targeted spatial queries rather than a permanently excessive uniform ray grid.

Begin coarse.

Refine near ambiguous regions.

Fail conservatively when geometric certainty cannot be established.

### Candidate Score

A direction must first satisfy hard validity.

Only valid directions are scored.

Score using simple deterministic factors such as:

- demoldability confidence;
- open-face suitability;
- Master Mold depth;
- resulting stock volume;
- wall safety;
- printing simplicity.

Do not use learned weights.

Do not use AI.

Keep weights/constants centralized and tested.

## Execution Loop

```text
Generate six candidates
        ↓
Cheap filtering
        ↓
BVH/directional validation
        ↓
Reject undercuts
        ↓
Score survivors
        ↓
Select deterministic winner
        ↓
Verify repeatability
```

If no candidate is valid, return a structured blocked result equivalent to:

```text
one_piece_master_mold_not_feasible
```

Do not automatically invent a multi-piece Master Mold.

## Exit Gate

Pass when:

- six directions are evaluated deterministically;
- obvious undercuts are rejected;
- simple removable geometry passes;
- no-valid-direction cases are reported safely;
- tests cover positive, negative, edge, and deterministic tie cases;
- no new spatial library was added.

Continue automatically to Article 05.

---

# Article 05 — Independent Open-Face Master Mold Geometry

## Goal

Generate one printable Master Mold for one final-mold target body.

## Plan

For each source mold part:

1. obtain the final-mold target body;
2. obtain the selected open direction;
3. construct a surrounding Master Stock;
4. provide positive side-wall thickness;
5. provide positive bottom thickness;
6. position the target so its open side reaches the stock opening plane correctly;
7. subtract the target from the stock using the existing Manifold infrastructure;
8. validate the resulting solid.

Conceptually:

```text
Master Stock
     -
Final Mold Target
     =
Master Mold
```

Do not delete faces manually after Boolean generation.

Do not create an intentionally non-manifold mesh.

The cavity must communicate with the exterior through the open side while the surrounding Master Mold remains watertight.

Reuse existing Manifold conversion, tolerance, bounds, payload and validation utilities.

Use existing Boolean subtraction rather than implementing mesh surgery.

## Geometry Validation

Reject output when any of these occur:

- empty result;
- non-finite coordinates;
- invalid volume;
- non-positive volume;
- non-manifold status;
- insufficient wall thickness;
- insufficient bottom thickness;
- disconnected unintended fragment;
- target cavity inaccessible from the selected open face;
- Boolean failure.

Preserve the previously valid result when regeneration fails, if this matches current Craft lifecycle conventions.

## Execution Loop

```text
Target body
  ↓
Build Master Stock
  ↓
Position open plane
  ↓
Manifold subtraction
  ↓
Solid validation
  ↓
Wall/bottom validation
  ↓
Open-access validation
  ↓
Produce result
```

Repair only the failing stage.

Do not add fallback geometry engines simply because one malformed source fails.

## Exit Gate

Pass when representative simple target bodies produce valid one-piece open-face printable solids and invalid sources fail explicitly without corrupting existing state.

Continue to Article 06 automatically.

---

# Article 06 — Multi-Part Independence

## Goal

Support any valid committed mold containing one or more parts while preserving the user's manufacturing model:

> every Master Mold piece is printed and filled independently.

## Plan

Generation must be per-source-part.

Example:

```text
Target A → Master A
Target B → Master B
Target C → Master C
```

Never:

```text
A + B + C
→ one shared Master block
```

Never assume all Master pieces share one open direction.

Each piece may independently choose:

```text
+X / -X / +Y / -Y / +Z / -Z
```

Each piece owns its own result status.

A failure in Master C should not erase a valid Master A or Master B.

Where the existing Worker architecture supports it safely, independent pieces may be computed without blocking the UI.

Do not introduce uncontrolled concurrency.

## Execution Loop

```text
Enumerate target parts
        ↓
Fingerprint each part
        ↓
Generate/evaluate independently
        ↓
Aggregate statuses
        ↓
Preserve successful siblings
        ↓
Report failed siblings precisely
```

## Exit Gate

Pass when:

- one-part workflow works;
- multi-part workflow works;
- pieces are geometrically independent;
- one piece failing does not destroy valid siblings;
- identity mapping between final mold part and Master Mold part is stable.

Continue immediately to Article 07.

---

# Article 07 — Lifecycle, Staleness, and Incremental Regeneration

## Goal

Make Master Mold a reliable derived CAD result rather than a one-time destructive mesh operation.

## Plan

The Master Mold result depends on its source final-mold target.

When authoritative upstream geometry changes, affected Master Mold pieces must become stale.

Relevant upstream changes can include:

- segmentation;
- Cut by Face;
- committed cutting result;
- cavity/final-target geometry;
- scale where geometry is actually affected;
- final-mold functional features;
- future geometry-producing tools.

Use geometry versions and source fingerprints rather than comparing entire meshes manually.

Regenerate only affected Master Mold pieces.

Example:

```text
A unchanged
B changed
C unchanged
```

must result in:

```text
Master A → reuse
Master B → regenerate
Master C → reuse
```

Do not recompute every Master Mold simply because one sibling changed.

Do not mutate generated meshes with ad-hoc downstream edits that bypass provenance.

## Execution Loop

```text
Capture dependency snapshot
       ↓
Compare fingerprints
       ↓
Classify current/stale
       ↓
Reuse unchanged results
       ↓
Regenerate changed results
       ↓
Commit atomically
```

## Exit Gate

Pass when stale state is deterministic, targeted regeneration works, and no outdated Master Mold is presented as current.

Continue automatically to Article 08.

---

# Article 08 — Final Mold Tools Boundary: Funnel and Registration

## Goal

Preserve the correct semantic ownership of Funnel/Sprue and Registration/Alignment.

## Plan

Master Mold does not own Funnel.

Master Mold does not own Registration.

These tools belong to the final mold.

The system must preserve a clear dependency model:

```text
Final Mold Design
    │
    ├── Funnel / Sprue
    ├── Registration / Alignment
    └── other final-mold features
            ↓
Final Mold Geometry
            ↓
Master Mold Representation
```

If the current Craft UX allows the user to enter Master Mold before adding Funnel or Registration, that is acceptable.

When the user later modifies final-mold geometry, any Master Mold whose target geometry changed must become stale and regenerate.

Do not reinterpret existing SprueGenerationService as a Master Mold pouring system.

Do not create:

```text
MasterMoldSprueService
```

Do not create:

```text
MasterMoldRegistrationService
```

The physical process represented is:

```text
Master A → cast separately → Final Mold A
Master B → cast separately → Final Mold B
Master C → cast separately → Final Mold C

Final Mold A + B + C
        ↓
assembled final mold
```

Master pieces are never treated as parts requiring mutual registration in Execution Zero One.

## Execution Loop

```text
Inspect existing Funnel ownership
        ↓
Inspect Registration ownership
        ↓
Preserve final-mold semantics
        ↓
Connect geometry invalidation only
        ↓
Test regeneration after final-mold feature changes
```

## Exit Gate

Pass when Funnel/Registration semantics remain unchanged for the final mold and Master Mold receives only the resulting geometry dependency, never duplicated feature engines.

Continue automatically to Article 09.

---

# Article 09 — Toolbar Entry and Master Mold Icon

## Goal

Add Master Mold to the existing toolbar as a first-class peer to Create Cavity while preserving Craft's current visual language.

## Product Placement

After a valid cutting result has been committed, the user must have access to:

```text
Create Cavity
Master Mold
```

Master Mold must not be hidden inside Create Cavity.

Master Mold must not require Create Cavity to have been clicked.

Use the existing toolbar placement, sizing, spacing, button shell, disabled behavior, focus behavior and theme tokens as the visual authority.

Do not redesign the entire toolbar.

---

## Master Mold Icon Geometry

The Master Mold icon consists of **two vertical rectangles positioned side-by-side**.

One rectangle is smaller.

One rectangle is larger.

Conceptually:

```text
┌───┐  ┌─────┐
│   │  │     │
│   │  │     │
└───┘  │     │
       └─────┘
```

Both must read clearly as vertical forms at the toolbar's actual icon size.

### Small Rectangle

The smaller rectangle must:

- use a navy fill;
- use an external stroke derived from the same visual token or icon-stroke treatment already used by existing toolbar tools;
- remain clearly visible in both Light Mode and Dark Mode;
- not use an unrelated hard-coded outline color.

Use the existing design-token system where available.

If no suitable semantic navy token exists, introduce the smallest scoped semantic token required for Master Mold rather than scattering raw color values.

### Large Rectangle

The larger rectangle must:

- have no fill;
- remain transparent;
- use the same toolbar-compatible outline treatment as the existing tools;
- visually align with the smaller rectangle;
- not look like a filled button or selected panel.

### Shape Character

Do not turn the icon into:

- a cube;
- an isometric 3D illustration;
- a mold cross-section;
- a detailed CAD symbol;
- an icon containing text.

Keep it minimal and geometric.

---

## Toolbar States

The Master Mold toolbar control must support:

```text
default
hover
focus-visible
active/selected if existing toolbar supports it
disabled
working/generating if existing toolbar has a pattern
error indication only through existing UI conventions
```

Do not invent an isolated interaction language.

---

## Hover

Hover is required.

Use the toolbar's existing hover animation, duration, easing, background behavior and visual depth where possible.

The icon should remain recognizable on hover.

Do not create an exaggerated scale animation.

Do not move the button enough to disturb toolbar alignment.

Provide a tooltip:

```text
Master Mold
```

The tooltip must also behave correctly for keyboard focus.

Use the existing tooltip system if one exists.

Do not introduce a second tooltip framework.

If custom hover/focus content is used, preserve predictable, dismissible and persistent interaction behavior consistent with accessibility requirements.

---

## Execution Loop

```text
Inspect toolbar tokens/components
        ↓
Implement icon with existing primitives
        ↓
Implement default state
        ↓
Implement hover
        ↓
Implement focus-visible
        ↓
Test light theme
        ↓
Test dark theme
        ↓
Test disabled/active states
        ↓
Compare visually against sibling tools
```

## Exit Gate

Pass only when:

- icon matches the requested two-rectangle design;
- small rectangle is navy;
- large rectangle is transparent;
- strokes match toolbar visual language;
- hover exists;
- tooltip exists;
- focus behavior works;
- Light and Dark Mode remain legible;
- no toolbar layout shift occurs.

Continue immediately to Article 10.

---

# Article 10 — User Interaction and Viewport Experience

## Goal

Create a complete usable interaction rather than a hidden geometry command.

## Plan

When Master Mold is unavailable because no valid committed cutting result exists, show the toolbar control using the application's normal disabled pattern rather than silently hiding it, if that matches current toolbar policy.

When activated:

1. enter Master Mold generation context;
2. retain clear source-part identity;
3. show generation progress using existing conventions;
4. render generated Master Mold pieces in the viewport;
5. preserve the relationship between Master Mold piece and source final mold part;
6. allow the user to inspect each result;
7. surface blocked pieces intelligibly.

Avoid complex graph visualizations.

Avoid engineering-debug terminology in normal UI.

Useful states should be concise, equivalent to:

```text
Ready
Generating
Out of date
Cannot generate as one-piece Master Mold
Generation failed
```

Do not expose raw exception text as primary UX.

Detailed diagnostic information may remain available to development logs/tests.

---

## Preview Policy

Do not execute expensive exact Boolean reconstruction continuously during pointer hover.

Use cheap preview information while interacting.

Commit exact Master Mold geometry at deliberate generation/commit boundaries according to existing Craft interaction patterns.

Do not cause viewport stutter simply to preview a box.

---

## Exit Gate

Pass when a normal user can discover Master Mold, invoke it, understand its state, inspect results, and recover from a blocked piece without developer knowledge.

Continue automatically to Article 11.

---

# Article 11 — Worker, Cache, and Performance Discipline

## Goal

Keep Master Mold computational cost proportional to actual changed geometry.

## Plan

Reuse existing Worker infrastructure wherever its ownership permits.

Heavy operations must not unnecessarily occupy the UI thread.

Cache only deterministic expensive results.

Suitable cache inputs may include:

```text
source part geometryVersion
final mold target fingerprint
open direction
Master Mold wall parameters
Master Mold bottom parameters
geometry tolerance
relevant final-mold feature fingerprint
```

Never reuse cached geometry across a changed source fingerprint.

BVH structures may be reused for unchanged geometry if lifecycle safety is proven.

Remember that BVH data becomes invalid when underlying geometry changes unless rebuilt/refit according to the existing library behavior.

Do not optimize before correctness is established.

Do not introduce absolute performance claims without measurement.

Compare against repository baseline.

Do not regress existing bundle-budget checks.

## Execution Loop

```text
Correct implementation
      ↓
Measure relevant path
      ↓
Find actual redundant work
      ↓
Cache/reuse only proven repetition
      ↓
Measure again
      ↓
Verify no stale reuse
```

## Exit Gate

Pass when:

- heavy operations follow existing worker policy;
- unchanged Master Mold pieces are not regenerated needlessly;
- source changes invalidate caches correctly;
- interaction remains responsive;
- build/bundle budgets remain within repository policy.

Continue automatically to Article 12.

---

# Article 12 — Failure Containment and Recovery

## Goal

Ensure Master Mold cannot corrupt valid Craft state.

## Plan

Every geometric failure must be contained to the attempted derived result.

Examples:

```text
invalid_source_geometry
no_valid_open_direction
master_stock_invalid
boolean_failed
insufficient_wall_thickness
insufficient_bottom_thickness
detached_fragment
open_face_inaccessible
non_manifold_result
cancelled
stale_request
```

Use repository naming conventions rather than these exact strings if authoritative conventions differ.

A late asynchronous worker result must never overwrite a newer request.

Cancellation must not leave partial geometry committed.

If generation fails after a previously valid Master Mold existed, follow existing Craft conventions for preserving or marking the previous result stale rather than silently replacing it with invalid geometry.

## Execution Loop

```text
Inject failure
   ↓
Observe state transition
   ↓
Verify valid upstream state survives
   ↓
Verify stale async result cannot commit
   ↓
Verify user-facing message
   ↓
Retry
```

## Exit Gate

Pass when all major failure classes are deterministic, recoverable, and incapable of corrupting committed cutting/final-mold state.

Continue immediately to Article 13.

---

# Article 13 — Test Architecture

## Goal

Prove Master Mold as a product workflow, not merely as a collection of unit functions.

## Plan

Add focused tests at the correct architectural levels.

### Geometry Unit Tests

Cover:

- valid rectangular/simple target;
- valid irregular target;
- each orthogonal opening direction;
- deterministic direction selection;
- clear undercut rejection;
- no-valid-direction case;
- thin wall rejection;
- thin bottom rejection;
- valid Boolean output;
- watertight result;
- positive volume;
- finite geometry;
- independent multi-part generation.

### Provenance Tests

Cover:

- same source → same fingerprint;
- changed source → changed fingerprint;
- unchanged sibling → reused;
- changed sibling → regenerated;
- stale result cannot report current;
- late worker result cannot overwrite newer request.

### Lifecycle Tests

Cover:

```text
Cutting Done
→ Master Mold enabled
```

and:

```text
Cutting changes
→ Master Mold stale
```

and:

```text
Master Mold
→ Create Cavity
```

as independent user choices without one corrupting the other.

### Final Mold Dependency Tests

Verify that final-mold functional geometry changes invalidate only affected Master Mold outputs.

Do not test Funnel or Registration as Master Mold-owned features.

### Toolbar Tests

Verify:

- Master Mold button exists;
- enabled state;
- disabled state;
- click behavior;
- tooltip;
- hover class/state;
- keyboard focus;
- selected state if applicable;
- no accidental Create Cavity activation.

### Rendering Tests

Verify correct Master Mold bodies are shown and stale/failed bodies are not incorrectly presented as valid.

### Regression Tests

Run all focused existing tests for:

- cavity;
- cutting;
- segmentation;
- split face;
- registration;
- sprue;
- viewport/toolbars;
- state lifecycle.

Then run broader relevant suite.

## Execution Loop

```text
Write failing test
      ↓
Implement/repair
      ↓
Focused test passes
      ↓
Run sibling regression tests
      ↓
Run broader suite
      ↓
Classify every failure
```

Do not label failures "unrelated" without proving they existed before the Master Mold changes or proving they arise from an independent defect.

## Exit Gate

Pass only when new tests and relevant regression suites are green, or pre-existing failures are evidence-backed and explicitly reported.

Continue immediately to Article 14.

---

# Article 14 — Architecture and Code Quality Closure

## Goal

Ensure the feature did not achieve functionality by degrading Craft's architecture.

## Plan

Audit the completed diff.

Look specifically for:

- duplicated Boolean logic;
- duplicated cavity logic;
- duplicated geometry contracts;
- duplicated stores;
- duplicated toolbar primitives;
- hidden global state;
- circular dependencies;
- Master Mold-specific copies of Funnel;
- Master Mold-specific copies of Registration;
- manual triangle surgery;
- unnecessary dependencies;
- stale state pathways;
- memory leaks from Manifold solids;
- undisposed BVHs;
- workers without cancellation;
- unbounded caches;
- arbitrary magic tolerances;
- hard-coded theme colors that should use tokens;
- UI logic embedded inside geometry code;
- geometry code embedded inside React components.

Delete accidental duplication rather than leaving dead alternatives behind.

Do not perform unrelated repository-wide refactors.

## Execution Loop

```text
Inspect final diff
    ↓
Trace new ownership
    ↓
Search duplication
    ↓
Search leaks/stale paths
    ↓
Remove unnecessary code
    ↓
Run tests again
```

## Exit Gate

Pass when Master Mold has a narrow, understandable architectural footprint and existing services remain the authoritative owners of shared capabilities.

Continue immediately to Article 15.

---

# Article 15 — Production Build and Ready-to-Use Closure

## Goal

Finish with a feature that can be used in Craft immediately.

## Plan

Run the repository's actual production checks.

At minimum, where available:

```text
typecheck
lint
architecture checks
focused tests
broader relevant tests
production build
bundle budget
```

Do not silently skip failing checks.

Open the application and validate the complete intended interaction where executable testing infrastructure permits:

```text
Import model
→ cutting workflow
→ commit / Done
→ Master Mold available
→ generate
→ independent Master pieces visible
→ inspect pieces
→ modify upstream geometry
→ stale state
→ regenerate
→ switch to Create Cavity without corruption
```

Validate Light Mode and Dark Mode.

Validate the Master Mold icon visually at real toolbar scale.

Validate hover.

Validate focus.

Validate multi-part output.

Validate failure behavior.

---

# Final Definition of Done

Execution Zero One is complete only when all of the following are true.

### Product

Master Mold is a real toolbar tool and independent alternative to Create Cavity.

### Geometry

Each final mold part can generate its own independent one-piece open-face Master Mold when geometrically feasible.

### Manufacturing Model

Each Master Mold is designed to be printed and filled independently.

### Open Face

Each generated Master Mold has one intentional casting opening while remaining a watertight printable solid.

### Intelligence

Craft analyzes and selects a valid orthogonal opening/pull direction rather than assuming +Z universally.

### Undercuts

One-piece infeasibility is detected and reported rather than hidden.

### Kernel

Existing Manifold infrastructure performs the solid operations.

### Spatial Analysis

Existing BVH infrastructure is reused where appropriate for pull-direction/demold analysis.

### Independence

Master Mold and Create Cavity are independent user actions sharing authoritative geometry capabilities where appropriate.

### Funnel

No Master Mold-specific Funnel engine exists.

### Registration

No Master Mold-specific Registration engine exists.

### Final Mold

Funnel and Registration remain final-mold features.

### Multi-Part

N source mold parts produce N independent Master Mold manufacturing tools unless a specific source part is blocked.

### Incremental Work

A change to one source part does not unnecessarily regenerate every unaffected Master Mold.

### State

Stale geometry cannot masquerade as current geometry.

### UI

Master Mold appears correctly in the existing toolbar.

### Icon

The icon is composed of two vertical side-by-side rectangles:

- one smaller navy-filled rectangle;
- one larger transparent rectangle;
- both using outlines visually consistent with existing toolbar tools.

### Hover

Master Mold has toolbar-consistent hover behavior and a `Master Mold` tooltip.

### Themes

Icon and interaction work correctly in both Light Mode and Dark Mode.

### Accessibility

Pointer hover and keyboard focus have coherent, predictable behavior.

### Performance

Expensive geometry operations do not run needlessly during simple hover or pointer movement.

### Stability

Existing cavity, cutting, segmentation, registration and sprue behavior does not regress.

### Dependencies

No unnecessary new geometry dependency has been introduced.

### Build

Production build and repository quality checks pass.

---

# Explicitly Out of Scope for Execution Zero One

Do not implement unless existing architecture requires a tiny compatibility seam:

- automatic multi-piece Master Mold splitting;
- arbitrary non-orthogonal pull-direction optimization;
- ML-based mold planning;
- generative design;
- cloud computation;
- backend services;
- collaborative Master Mold editing;
- ceramic firing simulation;
- silicone cure simulation;
- automatic material shrinkage compensation;
- material-specific chemistry;
- Master Mold registration keys;
- Master Mold sprues;
- automatic vents;
- manufacturing simulation;
- support generation for 3D printing;
- slicer functionality.

These belong to future executions only after real Master Mold V1 evidence demonstrates the need.

---

# Continuous Completion Rule

Do not conclude merely because code compiles.

Do not conclude merely because the icon appears.

Do not conclude merely because one Boolean example works.

Continue through every article.

A successful article immediately activates the next article.

A failed article remains active until its Exit Gate is satisfied.

The execution ends only when Article 15 and the complete Definition of Done pass.

---

# Final Engineering Report

At completion, return a concise evidence-based report containing:

## 1. Decision

One of:

```text
READY
READY WITH DISCLOSED LIMITATIONS
NOT READY
```

## 2. Implemented Product

Describe exactly how Master Mold now works from the user's perspective.

## 3. Architecture

List the authoritative components reused and the new components introduced.

Explicitly state whether any new engine or dependency was added.

## 4. Geometry

Report:

- open-direction strategy;
- undercut/demold validation strategy;
- Boolean strategy;
- wall/bottom validation;
- multi-part behavior.

## 5. UI

Report:

- toolbar placement;
- icon implementation;
- navy small rectangle;
- transparent large rectangle;
- hover;
- tooltip;
- Light Mode;
- Dark Mode;
- keyboard focus.

## 6. Performance

Report measured or evidence-backed improvements/characteristics only.

Do not invent timing numbers.

## 7. Tests

Report exact test commands and results.

Separate:

```text
new tests
focused regression tests
broader tests
build/type/lint/architecture checks
```

## 8. Existing Failures

For every remaining failure, prove whether it is:

- introduced by this execution;
- pre-existing;
- intentionally out of scope.

## 9. Changed Files

List changed, added and deleted files grouped by responsibility.

## 10. Remaining Limitations

State real limitations plainly.

Do not describe planned future work as if already implemented.

---

# Final Instruction

Treat Craft as an evolving CAD/manufacturing system, not as a collection of disconnected buttons.

The implementation should minimize new machinery while increasing geometric confidence.

The desired result of Master Mold Execution Zero One is therefore:

```text
Existing Craft Geometry Infrastructure
            +
Small Master Mold Domain
            +
Pull / Open-Direction Intelligence
            +
Independent Open-Face Tool Generation
            +
Correct Provenance and Lifecycle
            +
Native Craft Toolbar Experience
            =
Production-Ready Master Mold V1
```
