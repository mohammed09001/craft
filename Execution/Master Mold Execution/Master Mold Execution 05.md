# Master Mold Execution 05

## Architectural Separation, Master Mold Engine Rebuild, and Corrective Closure

**Document type:** Corrective architecture + production implementation execution  
**Repository:** `mohammed09001/craft`  
**Live branch at authoring:** `main`  
**Live HEAD inspected at authoring:** `f46105f17b19d38eb366859170cd4108950a400a`  
**Primary objective:** Correct the architectural confusion introduced across Master Mold Executions 01–04, restore Create Cavity to an independent product loop, and replace the current cavity-coupled Master Mold implementation with a new independent **Master Mold Engine** grounded in physical case-mold manufacturing and computational mold-design literature.

---

# 0. Executive Mission

Execution 05 is not another incremental patch on top of the current Master Mold path.

It is a **controlled architectural correction**.

The previous implementation established useful infrastructure—workers, state, provenance, rendering, validation, cancellation, and tests—but it also embedded one product assumption that must now be removed:

```text
Master Mold
    ↓
Final Mold Target synthesis
    ↓
Create-Cavity geometry capability
    ↓
Master Mold generation
```

That dependency is no longer permitted.

The target architecture is:

```text
                    Shared Neutral Geometry Core
                  Manifold / mesh / BVH / topology
                              │
               ┌──────────────┴──────────────┐
               │                             │
        Create Cavity Loop             Master Mold Loop
               │                             │
        Cavity Engine                 Master Mold Engine
               │                             │
     Finished usable mold        Printable case/tooling system
```

The two product engines are peers.

They may consume the same authoritative project inputs and may reuse **neutral mathematical infrastructure**, but:

> **Create Cavity must know nothing about Master Mold.**

and:

> **Master Mold must know nothing about Create Cavity.**

No call, import, state dependency, result reuse, worker dependency, hidden side effect, workflow bridge, or shared domain orchestration may cross that boundary.

---

# 1. Product Truth

## 1.1 Create Cavity

Create Cavity produces the finished usable mold geometry directly.

```text
Imported Part
    ↓
Committed Cutting / Segmentation
    ↓
Create Cavity
    ↓
Finished Final Mold Geometry
    ↓
User prints/manufactures Final Mold
    ↓
User pours final product material
```

Create Cavity owns its own generation loop.

Its output is a **Final Mold**.

---

## 1.2 Master Mold

Master Mold produces a manufacturing tool used to cast the Final Mold.

```text
Imported Part
    ↓
Committed Cutting / Segmentation
    ↓
Master Mold Engine
    ↓
Printable Master Case / Tooling Set
    ↓
User assembles tooling if multi-piece
    ↓
User pours plaster / resin / cementitious / other mold-making material
    ↓
Physical Final Mold Part
    ↓
User removes Master tooling
    ↓
Physical Final Mold
```

Its output is **not** the Final Mold.

Its output is the tool that manufactures the Final Mold.

---

## 1.3 One Final Mold Part May Require Multiple Master Tooling Pieces

The previous invariant:

```text
1 Final Mold Part
=
1 Master Mold body
```

is removed.

The correct contract is:

```text
1 Final Mold Part
=
1 Master Tooling Set
=
1..N printable tooling pieces
```

A simple part may need one rigid case.

A complex part may require:

- two case halves;
- multiple removable panels;
- a base;
- removable cores/inserts;
- tooling-only alignment features.

Failure of a one-piece pull is **not automatically failure of Master Mold generation**.

It is a trigger for release-planning and case partitioning.

---

# 2. Physical Manufacturing Model

The Master Mold Engine must model the actual physical operation:

```text
Desired Final Mold Part
        ↓
Choose casting orientation
        ↓
Choose Pour Face
        ↓
Construct enclosing case
        ↓
Create exact inverse cavity/core geometry
        ↓
Determine how tooling can be removed after cure
        ↓
One-piece release?
    ├── yes → build one-piece case
    └── no  → partition case into removable tooling pieces
        ↓
Add tooling-only assembly/alignment aids when required
        ↓
Validate fill access
        ↓
Validate release sequence
        ↓
Validate printability
        ↓
Output Master Tooling Set
```

Critical distinction:

```text
Pour Face
≠
Demold Direction
```

The Pour Face answers:

> Where does the mold-making material enter the Master tooling?

The Release Strategy answers:

> How are the printed tooling pieces removed after the cast Final Mold Part cures?

These must be independent concepts in contracts, algorithms, tests, and UI.

---

# 3. Research Foundation

Execution 05 must use the following research as algorithmic guidance, not as decorative references.

## 3.1 Practical Case-Mold Manufacturing Evidence

Digitalfire documents direct 3D-printed case molds used to cast plaster working molds, including multi-piece printed tooling, natches/alignment hardware, thin printed shells, and cases where rigid PLA extraction damaged plaster and a rubber intermediate became preferable.

Engineering implications:

- direct print-and-pour is physically valid for suitable geometry;
- case molds may consist of multiple printed sections;
- tooling assembly features belong to the tooling, not the final molded part;
- orientation and extraction matter;
- sharp re-entrant geometry can mechanically lock brittle cast materials;
- release strategy cannot be reduced to “one open face”;
- complex geometry may require flexible or sacrificial alternatives.

Practical references:

- Digitalfire — **A Case Mold and Working Mold for Slip Casting**  
  https://digitalfire.com/picture/3728
- Digitalfire — **CAD steps for a 3DP block mold to make a rubber case mold**  
  https://digitalfire.com/picture/3533
- Digitalfire — **Mold Natches**  
  https://digitalfire.com/project/mold%2Bnatches
- Digitalfire — **Medalta Ball Pitcher Slip Casting Mold via 3D Printing**  
  https://digitalfire.com/project/59
- Digitalfire — **Orientation is important when 3D printing a mold**  
  https://digitalfire.com/picture/3637

These sources support process and tooling practice. They are not the mathematical authority for automated mold decomposition.

---

## 3.2 Demoldability and Visibility

Chen, Chou, and Woo formulate demoldability using complete/partial visibility and visibility maps on the unit sphere.

Algorithmic use:

- surface accessibility must drive release planning;
- candidate removal directions must be reasoned from geometry;
- surface regions can be classified according to directions from which they are removable.

Reference:

**Parting directions for mould and die design**  
Computer-Aided Design, 1993  
DOI: `10.1016/0010-4485(93)90103-U`

---

## 3.3 Undercut Recognition and Direction Selection

Nee et al. identify undercut features and choose parting directions using the number and volume of undercuts.

Algorithmic use:

- detect undercut/re-entrant regions;
- do not treat every reverse-facing triangle as an independent failure;
- group geometric obstacles into meaningful release constraints;
- use undercut severity as a planner cost, not merely a binary flag.

Reference:

**Determination of Optimal Parting Directions in Plastic Injection Mold Design**  
CIRP Annals, 1997  
DOI: `10.1016/S0007-8506(07)60858-0`

---

## 3.4 Surface Moldability and Parting-Line Generation

Fu, Nee, and Fuh connect surface visibility/moldability to core-, cavity-, and local-tool-molded surfaces and use those classifications to derive parting lines.

Algorithmic use:

- classify target surfaces by feasible tooling removal direction;
- derive boundaries between surface regions assigned to different tooling pieces;
- use those boundaries to create candidate parting curves and surfaces.

Reference:

**The application of surface visibility and moldability to parting line generation**  
Computer-Aided Design, 2002  
DOI: `10.1016/S0010-4485(01)00117-8`

---

## 3.5 Accessibility-Driven Partitioning

Huang, Gupta, and Stoppel describe accessibility-driven spatial partitioning for multi-piece sacrificial molds.

Algorithmic use:

- start from an enclosing mold/case volume;
- analyze inaccessible regions;
- partition only where accessibility improves;
- score candidate partition planes;
- iterate until tooling pieces satisfy accessibility/manufacturability constraints.

Reference:

**Generating sacrificial multi-piece molds using accessibility driven spatial partitioning**  
Computer-Aided Design, 2003  
DOI: `10.1016/S0010-4485(03)00008-3`

---

## 3.6 Automated Multi-Piece Permanent Molds

Priyadarshi and Gupta describe automated multi-piece permanent mold design, including:

- parting directions;
- parting lines;
- parting surfaces;
- mold-piece construction;
- global accessibility;
- guaranteed disassembly of generated pieces.

This is the most important direct research analogue for the new Master Mold Engine.

Reference:

**Geometric algorithms for automated design of multi-piece permanent molds**  
Computer-Aided Design, 2004  
DOI: `10.1016/S0010-4485(03)00107-6`

---

## 3.7 Free-Form Multi-Piece Mold Regions

Lin and Quang automatically recognize mold-piece regions and parting curves for complex free-form CAD models using feasible parting directions, surface visibility/moldability, silhouette detection, edge extrusion, and region assignment.

Algorithmic use:

- support non-box-like final mold parts;
- form coherent surface regions for tooling pieces;
- avoid forcing every case split onto global X/Y/Z planes.

Reference:

**Automatic generation of mold-piece regions and parting curves for complex CAD models in multi-piece mold design**  
Computer-Aided Design, 2014  
DOI: `10.1016/j.cad.2014.06.014`

---

## 3.8 Research Interpretation Rule

Do not copy an injection-molding algorithm blindly.

Craft is generating low-pressure printable case tooling for casting mold-making materials.

Use the papers for:

- visibility;
- accessibility;
- undercut reasoning;
- region partitioning;
- parting geometry;
- disassembly sequence;
- mold-piece construction.

Do **not** import assumptions specific to high-pressure injection tooling unless Craft needs them.

---

# 4. Current Repository Facts That Must Be Corrected

Repository evidence at the inspected HEAD shows the present coupling explicitly.

## 4.1 MasterMoldAction Depends on Cavity-Domain Types and Final-Mold Synthesis

Current Master Mold UI imports:

```text
cavityBodyGeometryVersion
CanonicalPartGeometry
synthesizeFinalMoldTarget
```

and obtains Master Mold target bodies either from `lastCommittedResult` containing a cavity result or by calling `synthesizeFinalMoldTarget()`.

This dependency must be removed.

---

## 4.2 `workflow/finalMoldTarget.ts` Is a Coupling Seam

The current helper:

```text
synthesizeFinalMoldTarget()
```

calls:

```text
runCavityGenerationInWorker()
→ runDerivedMoldEvaluation()
→ Sprue
→ Registration
```

This file was introduced for the Master Mold architecture.

It must no longer sit between Master Mold and its source data.

If no other independent product still needs it after migration, delete it.

---

## 4.3 Master Mold Geometry Imports Cavity Internals

The current Master Mold generator imports Cavity-domain modules for:

- Manifold conversion;
- cavity body fragment classification;
- cavity tolerance policy;
- cavity BVH/signed-distance utilities.

The new Master Mold Engine must not import from `cavity-generation/`.

Generic geometry primitives must live under a neutral geometry boundary.

---

## 4.4 Master Mold Store Uses a Cavity-Domain Geometry Version

The current Master store calls:

```text
cavityBodyGeometryVersion(...)
```

to identify source geometry.

This must be replaced with a neutral geometry fingerprint owned outside the Cavity domain.

---

## 4.5 Create Cavity UI Itself Does Not Require a Rollback

The inspected `CavityAction.tsx` matches its pre-Master-Mold version.

Therefore:

> Do not perform a blind repository rollback.

Restore architectural independence by removing Master Mold coupling around Create Cavity, while preserving valid Cavity fixes and current behavior.

---

## 4.6 Visibility Bug Is Independent and Reproducible from Current Architecture

Current behavior:

```text
MoldBodiesBrowser eye click
→ setBodyVisibility()
→ selector returns body.visible change
→ reference mold runtime computes same geometry identity
→ rebuild skipped
→ existing Three.js mesh.visible never updated
```

The render identity intentionally excludes presentation state, but there is no separate presentation synchronization path.

Execution 05 must fix this without forcing expensive geometry reconstruction.

---

# 5. Target Architecture

```text
Authoritative Project State
│
├── Canonical imported-part geometry
├── Committed Cut-by-Face / Segmentation result
├── Mold scale / envelope
├── Sprue intent
├── Final-mold Registration intent/policy
├── printer/build-volume context
└── revision/fingerprints
        │
        ├────────────────────────────────────────┐
        │                                        │
        ▼                                        ▼
Create Cavity Loop                       Master Mold Loop
        │                                        │
Cavity-domain input                      MasterMoldProjectSnapshot
        │                                        │
Cavity Engine                            Master Mold Engine
        │                                        │
Cavity Worker                            Master Mold Worker
        │                                        │
Derived Final Mold                       Cast Target Builder
        │                                        │
Final Mold Store                         Pour-Face Planner
        │                                        │
Final Mold Viewport                      Release Planner
                                                 │
                                      One-piece / Multi-piece
                                                 │
                                      Tooling Constructor
                                                 │
                                      Tooling Registration
                                                 │
                                      Validation
                                                 │
                                      Master Mold Store
                                                 │
                                      Master Tooling Viewport
```

---

# 6. Absolute Dependency Rules

## 6.1 Forbidden Imports

No production file under:

```text
master-mold/
```

may import from:

```text
cavity-generation/
```

No production file under:

```text
cavity-generation/
```

may import from:

```text
master-mold/
```

No workflow helper may secretly reconnect them.

---

## 6.2 Allowed Shared Dependencies

Both engines may depend on neutral infrastructure such as:

```text
mold-generation/geometry/
reference-mold-definition contracts
committed cutting/segmentation contracts
Sprue intent contracts
Registration intent/policy contracts
printer build-volume contracts
generic hash/fingerprint utilities
generic Worker protocol helpers
generic topology/BVH/Manifold primitives
```

Shared **math** is allowed.

Shared **product workflow ownership** is not.

---

# 7. Independent Loop Contract

## 7.1 Create Cavity Loop

```text
User clicks Create Cavity
→ capture Cavity input snapshot
→ Cavity store enters generating
→ Cavity Worker executes
→ validate Cavity result
→ apply Final Mold features under Cavity's own workflow
→ commit Cavity result
→ update Final Mold viewport
→ end
```

It must not:

- query Master Mold state;
- invalidate Master Mold directly;
- invoke Master Mold worker;
- import Master Mold contracts;
- wait for Master Mold;
- reuse Master Mold output.

A neutral upstream document revision may independently cause both consumers to become stale, but neither consumer informs the other.

---

## 7.2 Master Mold Loop

```text
User clicks Master Mold
→ capture MasterMoldProjectSnapshot
→ Master Mold store enters generating
→ Master Mold Worker executes full Master pipeline
→ return MasterToolingSet[]
→ validate source identity
→ commit Master result
→ update Master tooling viewport
→ end
```

It must not:

- call Create Cavity;
- read Cavity result;
- read Cavity status;
- call Cavity Worker;
- import Cavity generation code;
- use Cavity geometry-version functions;
- require the Create Cavity button to have been clicked.

---

# 8. Context Engineering Contract for the Coding Agent

Before each article, the executing agent must build a compact **Live Context Packet** containing only:

```text
1. live HEAD SHA
2. exact relevant production files
3. exact relevant tests
4. current failing/passing evidence
5. product invariant for this article
6. forbidden dependency boundary
7. expected observable behavior
8. exit gate
```

Do not repeatedly load all four previous execution documents as implementation authority.

They are historical evidence only.

Current repository behavior + this Execution 05 product contract are authoritative.

When old comments or tests conflict with Execution 05:

```text
investigate
→ prove whether they encode obsolete Master architecture
→ replace/delete them if obsolete
```

Do not preserve a wrong architectural assumption merely because an old test asserts it.

---

# 9. Loop Engineering Contract

Every article uses the same continuous loop:

```text
OBSERVE
→ TRACE
→ HYPOTHESIZE
→ REPRODUCE
→ WRITE FAILING TEST
→ REPAIR / REPLACE / DELETE
→ RUN FOCUSED TEST
→ RUN NEIGHBOR REGRESSION
→ INSPECT DIFF
→ CONTINUE
```

Rules:

- Do not stop for approval between articles.
- Do not create a harness that pauses after loops.
- Do not claim success from code presence.
- Do not accept a test that merely checks state when geometry is the product.
- Do not broaden scope after a failure; find the smallest authoritative cause.
- Prefer deletion/replacement of obsolete coupling over compatibility shims.
- Every compatibility shim requires written evidence that it is necessary.
- If an article exposes a fundamental contradiction in this execution, report `NOT READY`; do not silently redefine the product.

---

# 10. Article 01 — Lock the Baseline and Protect Create Cavity

## Goal

Prove the exact pre-rebuild Create Cavity behavior and prevent Execution 05 from damaging it.

## Required Work

Capture:

- current `CavityAction` behavior;
- current `createCavity()` store path;
- Cavity worker path;
- current Sprue/Registration post-Cavity behavior;
- Cavity viewport presentation;
- Cavity cancellation;
- Cavity Undo/Redo;
- Cavity after Cut-by-Face;
- Cavity after Segmentation;
- Cavity after Mold Scale.

Run focused Cavity tests before modifications.

Record exact pass/fail counts.

Where useful, compare behavior with the last pre-Master-Mold repository state, but do not mechanically restore old files.

## Mandatory Regression

Create a browser acceptance proving:

```text
Import
→ commit mold parts
→ Create Cavity
→ finished mold visible
```

without generating Master Mold.

## Exit Gate

Create Cavity has an evidence-backed baseline and a protected regression path.

---

# 11. Article 02 — Fix Mold / Model Visibility Before Architecture Work

## Goal

Fix the eye-button failure shown in the real product.

## Root Cause to Verify

The store visibility value changes, but `referenceMoldBlock3dRuntime` skips geometry rebuild when geometry identity is unchanged; `mesh.visible` is applied only during mesh construction.

## Required Design

Do not include visibility in expensive geometry identity merely to force rebuilding.

Add a presentation synchronization path equivalent to:

```text
setBodyVisibility(bodyId, visible)
```

or:

```text
syncBodyPresentation(bodies)
```

inside the existing reference-mold runtime.

Update existing Three.js meshes by stable body ID.

The same principle applies to:

- model visibility;
- final mold body visibility;
- later Master tooling-piece visibility.

## Required Tests

Prove:

```text
visible true → false → actual Three.js mesh.visible false
false → true → actual mesh.visible true
```

with:

- unchanged geometry identity;
- unchanged bounds;
- unchanged triangle count.

Also test multiple bodies independently.

## Exit Gate

The eye buttons control actual rendered objects without unnecessary geometry rebuild.

---

# 12. Article 03 — Remove the Cavity ↔ Master Mold Coupling

## Goal

Create a hard architectural firewall before implementing the new engine.

## Required Removals

Master Mold must stop using:

```text
synthesizeFinalMoldTarget
runCavityGenerationInWorker
CavityWorkflowState
CavityResult
cavityBodyGeometryVersion
cavityGeometryTolerance.policy
cavitySignedDistance.bvh
cavityBody.generator
```

directly or indirectly.

Inspect all transitive imports.

## `finalMoldTarget.ts`

If the module exists only to allow Master Mold to synthesize Cavity-derived Final Mold geometry:

- remove Master usage;
- relocate any genuinely reusable Registration policy helper to the Registration domain;
- delete `finalMoldTarget.ts` if no independent consumer remains;
- remove it from the workflow barrel.

## Create Cavity

Keep Create Cavity's current valid production path.

Do not route Create Cavity through the new Master engine.

## Architecture Test

Add a static dependency test that fails if:

```text
master-mold/** imports cavity-generation/**
cavity-generation/** imports master-mold/**
```

Include dynamic-import string detection if the architecture checker supports it.

## Exit Gate

The two domains compile and test with no cross-import or runtime call.

---

# 13. Article 04 — Complete the Neutral Geometry Core

## Goal

Move only truly generic mathematical operations into a shared geometry layer.

## Existing Starting Point

Reuse the existing neutral:

```text
mold-generation/geometry/manifold.ts
```

where correct.

## Extract or Create Neutral Primitives for

- mesh → Manifold conversion;
- Manifold → mesh conversion;
- Boolean union/subtract/intersect;
- bounds extraction;
- mesh finite validation;
- topology / watertight checks;
- connected-component classification;
- neutral geometry fingerprint;
- BVH construction;
- point classification;
- ray/visibility queries;
- translation collision checks;
- tolerance derivation based on generic geometric scale.

## Rule

A function belongs in `geometry/` only if its name and contract make sense without the words:

```text
Cavity
Master Mold
Sprue
Registration
```

Do not move Cavity-domain policy into neutral geometry merely to satisfy the import guard.

## Exit Gate

Master and Cavity can both consume neutral geometry without sharing domain workflows.

---

# 14. Article 05 — Create the New Master Mold Engine Boundary

## Goal

Replace the current “final-mold-body inversion” engine with a full case-tooling engine.

## Recommended Domain

Use the existing Master Mold feature directory if appropriate, but establish an explicit engine boundary equivalent to:

```text
master-mold/engine/
```

with contracts such as:

```text
MasterMoldProjectSnapshot
MasterCastTarget
MasterPourFaceCandidate
MasterPourFaceDecision
MasterReleaseDirection
MasterSurfaceAccessibility
MasterToolingRegion
MasterPartingCurve
MasterPartingSurface
MasterToolingPiece
MasterToolingAssembly
MasterReleaseStep
MasterToolingSet
MasterMoldEngineResult
MasterMoldFailure
```

Names may adapt to repository conventions.

## MasterMoldProjectSnapshot

It must capture authoritative input at click time:

```text
source model geometry identity
canonical imported-part mesh
committed mold-part bodies
committed segmentation/cutting provenance
mold frame / scale
Sprue intents
Final Mold Registration intents/policy
printer build volume if available
Master material/process parameters
project revision/fingerprint
```

It must not contain:

```text
CavityResult
CavityWorkflowState
Create Cavity status
Create Cavity worker result
```

## Exit Gate

The engine can be invoked using project truth even when Create Cavity has never run.

---

# 15. Article 06 — Master Cast Target Builder

## Goal

Inside the Master Mold Engine, construct the exact physical Final Mold Part that the Master tooling is supposed to cast.

This is not Create Cavity.

It is a Master-domain transformation from project design intent to **cast target**.

## Required Pipeline

For each committed mold part:

```text
Committed mold stock/body
        +
Canonical original part geometry
        +
Mold frame/provenance
        ↓
MasterCastTarget base shape
        +
Final-mold Sprue intent
        +
Final-mold Registration intent
        ↓
Exact MasterCastTarget
```

## Important Rule

The fact that Boolean subtraction may be mathematically similar to Cavity generation does not create domain ownership.

Use neutral Boolean primitives.

Do not call Cavity algorithms.

## Sprue

Read the authoritative Sprue intent/contracts.

Apply Sprue geometry as part of the **cast target** that must exist in the physical Final Mold.

Do not reuse Cavity output.

Do not create a user-facing “Master Sprue”.

## Final Mold Registration

Read Registration intent/policy.

Apply its geometry to the cast target.

This is different from Master-tooling alignment created later between Master case pieces.

## Independent Geometry Identity

Create:

```text
masterCastTargetGeometryVersion
```

from neutral geometry fingerprints + Master input provenance.

Do not use a Cavity-named signature.

## Required Tests

- base mold part without features;
- target with original-part negative surface;
- Sprue changes cast-target fingerprint;
- Registration changes cast-target fingerprint;
- unchanged sibling target remains identical;
- Create Cavity state absent → target still builds.

## Exit Gate

The Master Engine owns its cast-target generation from source intent.

---

# 16. Article 07 — Pour-Face and Casting-Orientation Planner

## Goal

Select how the cast material enters the Master tooling without confusing this decision with release.

## Candidate Sources

Start with deterministic candidates from:

- semantic outer mold faces;
- large planar exterior regions;
- planar surface normals;
- principal geometry axes;
- user override when provided.

Do not restrict future architecture to only ±X/±Y/±Z.

## Hard Constraints

Reject a Pour Face when it:

- cuts through functional cavity geometry;
- intersects an essential Registration feature;
- creates zero/negative case wall;
- creates an impossible fill opening;
- cannot be represented by the current case-envelope strategy;
- produces invalid or non-finite tooling.

## Scoring

Among valid candidates, score:

- exposed opening area;
- casting depth;
- gravity fill continuity;
- trapped-air risk;
- interference with functional surfaces;
- expected case complexity;
- print orientation/support burden;
- user override preference.

Weights must be centralized and deterministic.

## Fillability Analysis

At minimum detect obvious sealed high pockets relative to gravity.

If the engine cannot safely place a vent automatically, return a structured warning.

Do not invent small vent holes through functional mold surfaces.

## Output

```text
MasterPourFaceDecision
```

with:

- selected face/region;
- casting orientation;
- score;
- rejected candidates and reasons;
- fillability warnings.

## Exit Gate

Pour Face is an explicit independent engine decision.

---

# 17. Article 08 — Release Analysis

## Goal

Determine how the Master tooling can be removed after the cast Final Mold Part has cured.

## Stage A — Surface Accessibility

Use visibility/accessibility reasoning inspired by:

- Chen–Chou–Woo visibility maps;
- Fu–Nee–Fuh moldability;
- undercut grouping.

For each significant surface patch, compute candidate directions from which the tooling surface can move away without crossing the cast target.

Candidate directions should include:

- semantic axes;
- principal axes;
- planar surface normals;
- axes of revolution when detectable;
- clustered significant normals.

Do not rely on one triangle centroid.

## Stage B — Exact Verification

Visibility is a planner.

Collision is the final verifier.

For each proposed rigid tooling-piece removal:

```text
tooling piece at assembled position
→ translate along proposed release path
→ collision/intersection test against cast target
→ collision/intersection test against not-yet-removed tooling pieces
→ continue until clear
```

Use neutral Manifold/BVH collision primitives.

## One-Piece Attempt

Attempt a one-piece rigid case only when the entire required tooling surface is compatible with one release path.

If it succeeds:

```text
releaseMode = one-piece
```

If it fails:

```text
continue to multi-piece planning
```

Do not return product-level failure yet.

## Exit Gate

One-piece failure becomes planning evidence, not the end of Master Mold.

---

# 18. Article 09 — Multi-Piece Master Case Planner

## Goal

Automatically partition Master tooling when one-piece release is impossible.

## Research-Grounded Planning Model

Use a sequence equivalent to:

```text
surface accessibility
→ visible/moldable surface regions
→ region clustering by feasible removal directions
→ candidate parting curves
→ candidate parting surfaces
→ construct tentative tooling pieces
→ verify disassembly
→ score plan
```

## Surface Region Assignment

Partition the cast-target boundary into coherent regions according to feasible tooling removal directions.

Avoid triangle-by-triangle pieces.

Use adjacency clustering and preserve continuous free-form regions where possible.

## Candidate Parting Curves

Derive boundaries between regions with incompatible release-direction sets.

Use where appropriate:

- silhouette boundaries;
- sharp/topological boundaries;
- projected edge loops;
- region adjacency borders.

## Candidate Parting Surfaces

Prefer simple manufacturable surfaces first:

```text
planar
ruled/extruded
axis-aligned where equivalent
```

Use more complex surfaces only when required by geometry.

## Search Strategy

Do not brute-force every possible partition.

Use bounded deterministic search:

```text
generate candidates
→ reject non-improving splits
→ rank by accessibility gain
→ expand best candidates
→ exact disassembly verification
```

A beam-search / bounded best-first implementation is acceptable if deterministic.

Centralize limits such as maximum candidate count / tooling-piece count.

Do not scatter magic constants.

## Plan Cost

Minimize, in order of priority:

1. invalid/disassembly-impossible plans;
2. number of tooling pieces;
3. fragile/narrow tooling sections;
4. complex parting surfaces;
5. excessive print volume/material;
6. poor assembly access;
7. support-heavy print orientation.

## Exact Acceptance

A plan is valid only if there exists a complete removal sequence:

```text
Piece P1 removes
→ Piece P2 removes
→ ...
→ Cast Final Mold Part becomes free
```

Each step must be collision-verified.

## Exit Gate

At least one research-grounded multi-piece fixture that fails one-piece release is successfully converted into a valid removable tooling set.

---

# 19. Article 10 — Master Tooling Piece Construction

## Goal

Construct printable solids from the selected tooling plan.

## Case Envelope

Generate an enclosing case around the MasterCastTarget using Master-specific parameters:

```text
caseWallThicknessMm
caseBaseThicknessMm
pourOpeningMarginMm
partingFlangeWidthMm
geometryToleranceMm
```

Do not reuse Cavity clearance.

## Negative Geometry

The assembled Master tooling must define a casting volume equal to the MasterCastTarget.

Validation invariant:

```text
Cast volume produced by assembled tooling
≈
MasterCastTarget
```

within the neutral tolerance policy.

## Tooling-Only Registration

When a Master Tooling Set has multiple pieces, it may need its own:

```text
alignment pins
keys
natches
flanges
bolt/magnet seats
clamp lands
```

These are **Master Tooling Registration**.

They must not be confused with Final Mold Registration.

Requirements:

- placed only on tooling interfaces/exterior;
- no interference with cast target;
- no accidental imprint on protected functional mold surfaces;
- sufficient wall around features;
- mirrored male/female pairing;
- deterministic IDs/provenance.

## Build Volume

Every tooling piece must be checked against current printer volume when available.

If a case piece exceeds the volume:

```text
feed constraint back to Master Case Planner
→ split tooling further
→ revalidate assembly + release
```

Do not call Final Mold Segmentation to solve a Master tooling print-size problem.

## Exit Gate

The output consists of valid printable solids, not conceptual regions.

---

# 20. Article 11 — Material / Release Profile Without Unsafe Guessing

## Goal

Allow the Master engine to support plaster, resin, cementitious, ceramic-related workflows without hardcoding unsupported material assumptions.

## Contract

Introduce a small process profile equivalent to:

```text
MasterCastingProcessProfile
```

with explicit user/configurable parameters such as:

- rigid vs flexible cast target;
- reusable vs sacrificial tooling preference;
- shrink compensation supplied by profile/user;
- minimum tooling wall;
- release clearance supplied by profile/user;
- maximum preferred tooling-piece count;
- vent requirement policy.

## Rule

Do not invent shrinkage or release numbers for “resin”, “cement”, “ceramic”, or “plaster”.

If no validated profile exists:

```text
genericRigidCast
```

uses geometric defaults only and exposes material-specific assumptions as warnings.

## Sacrificial Fallback

Research supports sacrificial multi-piece tooling for geometries that are difficult to disassemble.

Execution 05 may implement the **contract and planner outcome**:

```text
reusable_plan_not_found
→ sacrificial_release_recommended
```

Automatic sacrificial tooling generation is allowed only if the repository has a clearly defined user-selected process profile.

Do not silently choose destructive removal.

## Exit Gate

Material behavior is explicit, not guessed.

---

# 21. Article 12 — Independent Integration with Segmentation, Sprue, Registration, Scale, Undo/Redo

## Goal

Integrate the Master engine with project intent without recreating Cavity coupling.

## Segmentation / Cut by Face

Consume committed mold parts only.

Never consume uncommitted draft geometry.

On committed part-set change:

```text
affected Master Tooling Sets → stale
removed part → obsolete tooling removed/archived
new part → missing tooling explicitly represented
```

## Sprue

Consume Sprue intent directly.

Sprue edit:

```text
project intent changes
→ affected Master snapshot identity changes
→ affected Master tooling stale
→ regenerate through Master engine
```

No Cavity result participates.

## Final Mold Registration

Same rule.

Master engine independently applies Final Mold Registration to its cast target.

## Mold Scale

Scale changes source geometry.

Mark Master outputs stale immediately.

Do not run heavy Master geometry during pointer drag.

## Undo / Redo

Restored project source identity determines whether cached Master tooling can be reused.

Never restore tooling only because IDs match.

## Model Replacement / Orientation

Cancel in-flight Master worker.

Reset Master tooling.

No stale completion may resurrect old geometry.

## Exit Gate

All integrations occur through source intent/project identity, never through Cavity state.

---

# 22. Article 13 — Master Mold Store Rebuild

## Goal

Replace the current one-body-per-final-part cache model.

## Required State Shape

Conceptually:

```text
status
sourceSnapshotIdentity
parameters
toolingSets[]
progress
lastError
generationVersion
```

Each Tooling Set contains:

```text
finalMoldPartId
castTargetVersion
pourFaceDecision
releaseMode
toolingPieces[]
releaseSequence[]
warnings[]
validation
fingerprint
status
```

## Status Semantics

At set level:

```text
current
stale
blocked
error
```

At collection level:

```text
unavailable
generating
current
partial
stale
blocked
error
```

A multi-piece valid result is still `current`.

Do not call it “blocked” merely because one-piece release failed.

## Incremental Regeneration

If only Mold 3 source intent changed:

```text
Mold 1 tooling reuse
Mold 2 tooling reuse
Mold 3 regenerate
Mold 4 tooling reuse
```

Use neutral source fingerprints.

## Exit Gate

State represents the physical Master tooling product correctly.

---

# 23. Article 14 — Master Tooling Viewport

## Goal

Make Master Mold unmistakably different from Final Mold geometry.

## Rendering Model

Render:

```text
MasterToolingSetGroup
  ├── ToolingPiece 1
  ├── ToolingPiece 2
  ├── ToolingPiece 3
  └── optional overlays
```

Do not fold these into `ReferenceMoldBodies`.

## Visibility

Provide actual runtime visibility synchronization for:

- whole Master Tooling Set;
- individual Master tooling piece;
- original model;
- final mold/reference mold bodies.

The eye-button regression from Article 02 must be reused here.

## Inspection

At minimum support:

- select/inspect tooling piece;
- highlight Pour Face;
- identify release direction per piece;
- show stale state visually;
- hide unrelated Final Mold geometry when inspecting Master Mold.

Exploded view is optional for this execution unless existing runtime makes it low-risk.

## Exit Gate

A user can visually identify which meshes are Master tooling and hide/show them reliably.

---

# 24. Article 15 — Delete Obsolete Execution 01–04 Architecture

## Goal

Remove the old product model after the new engine is active.

## Delete or Rewrite

Investigate and remove obsolete code/tests/comments involving:

```text
Master Mold obtains Final Mold through Cavity
synthesizeFinalMoldTarget for Master usage
one Final Mold part = one Master body
Pour Face = pull direction
no valid one-piece direction = Master Mold impossible
cavityBodyGeometryVersion inside Master
Master geometry importing cavity utilities
current-or-blocked accepted as successful feature integration
```

Do not keep old architecture behind a fallback flag.

One production Master Mold path only.

## Historical Documents

Do not rewrite prior Execution documents as if they never happened.

They remain historical records.

Production code and tests must stop treating their obsolete assumptions as requirements.

## Exit Gate

No dead compatibility layer keeps the old architecture alive.

---

# 25. Article 16 — Golden Physical Fixtures

## Goal

Replace synthetic confidence with physical-product acceptance.

## Golden Case A — Simple Direct Case

A simple Final Mold Part that:

- has one obvious Pour Face;
- permits one-piece case removal.

Expected:

```text
1 Final Mold Part
→ 1 Master Tooling Set
→ 1 tooling piece
→ current
```

---

## Golden Case B — Multi-Piece Release

A target with an undercut/shoulder that cannot be released from a one-piece rigid case.

Expected:

```text
one-piece attempt fails
→ multi-piece planner runs
→ valid 2+ piece tooling
→ full release sequence verifies
→ current
```

This case is mandatory.

---

## Golden Case C — Sprue

Master Cast Target includes a valid Sprue feature.

Expected:

- geometry fingerprint changes;
- Master tooling geometry changes;
- release remains valid;
- result is `current`.

---

## Golden Case D — Final Mold Registration

Expected:

- cast target includes Final Mold Registration;
- Master tooling reproduces it;
- Master tooling registration remains a separate concept.

---

## Golden Case E — Four Final Mold Parts

Expected:

```text
Mold 1 → Tooling Set 1
Mold 2 → Tooling Set 2
Mold 3 → Tooling Set 3
Mold 4 → Tooling Set 4
```

Each set may contain 1..N tooling pieces.

---

## Golden Case F — Realistic Repository STL

Use a deterministic nontrivial STL already used by the project or add one intentionally.

Do not use a rectangular box as the only production proof.

## Exit Gate

The engine passes geometry representative of the product.

---

# 26. Article 17 — True Independence E2E

## Goal

Prove both loops independently in the browser.

## E2E A — Create Cavity Only

```text
fresh app
→ import
→ commit mold parts
→ click Create Cavity
→ Final Mold appears
→ never click Master Mold
```

Assert:

- no Master worker call;
- no Master state required;
- correct finished mold visible.

---

## E2E B — Master Mold Only

```text
fresh app
→ import
→ commit mold parts
→ never click Create Cavity
→ click Master Mold
→ Master worker runs
→ Master Tooling Set appears
```

Assert:

- no Cavity worker call;
- no Cavity result required;
- one-piece or multi-piece plan visible;
- Pour Face exists;
- actual tooling mesh exists.

---

## E2E C — Both in Either Order

```text
Master → Cavity
```

and:

```text
Cavity → Master
```

Results must be independent.

No action may mutate the other engine's result except a common upstream project edit that independently invalidates both.

---

## E2E D — Visibility

Toggle eyes for:

- original model;
- final mold body;
- Master tooling piece.

Assert actual scene object visibility.

---

## E2E E — Upstream Feature Change

```text
current Master
→ change Sprue or Registration
→ Master stale
→ Create Cavity state untouched except according to its own source rules
→ regenerate Master
→ current
```

## Exit Gate

The real UI proves engine independence.

---

# 27. Article 18 — Concurrency and Cancellation

## Goal

Ensure two independent loops remain correct under overlap.

## Required Scenarios

```text
Master generating
→ user clicks Create Cavity
```

Both may run if resource policy permits, but neither may cancel or overwrite the other.

If the application deliberately serializes heavy geometry workers for resource reasons, use a neutral scheduler—not cross-domain cancellation.

Also test:

- Master generate → Master generate again;
- Cavity generate → Cavity generate again;
- Master generate → upstream model edit;
- Cavity generate → upstream model edit;
- Master generate → model replacement;
- Cavity generate → model replacement;
- Master and Cavity overlap → both complete against same source;
- one finishes after source changed → stale completion discarded.

## Exit Gate

Worker identity and cancellation are per engine.

---

# 28. Article 19 — Architecture and Quality Gates

## Required Architecture Assertions

Fail CI when:

```text
master-mold imports cavity-generation
cavity-generation imports master-mold
Master action reads cavity status/result
Master worker invokes cavity worker
Master store uses cavity-named fingerprint
Create Cavity imports Master state
```

## Required Repository Gates

Run live equivalents of:

```text
architecture checks
typecheck
lint
focused Cavity tests
focused Master Mold tests
Split Face tests
Segmentation tests
Sprue tests
Registration tests
viewport tests
Worker tests
browser E2E
production build
bundle budget
security/dependency audit used by repository
```

Do not invent script names.

## Bundle Rule

Heavy Manifold/BVH planning remains Worker-side or lazy.

Do not raise bundle budgets to hide accidental eager imports.

## Exit Gate

All required repository gates pass.

---

# 29. Definition of Done

Execution 05 is complete only when all of the following are true:

- Create Cavity produces a finished usable mold independently.
- Master Mold produces case/tooling used to cast the Final Mold independently.
- Create Cavity imports nothing from Master Mold.
- Master Mold imports nothing from Cavity generation.
- Master Mold never calls the Cavity worker.
- Master Mold never reads Cavity result/status.
- Create Cavity never reads Master state/result.
- Shared code between them is neutral geometry infrastructure only.
- The old `finalMoldTarget` coupling is removed or has no Master responsibility.
- Master source identity uses neutral provenance.
- Mold/body eye controls update actual Three.js visibility.
- Pour Face is distinct from release direction.
- One-piece release is only the first strategy.
- One-piece failure triggers multi-piece planning.
- Multi-piece planning uses surface accessibility/moldability reasoning.
- Candidate tooling pieces are exact collision-verified.
- A valid complete release sequence exists for every `current` reusable tooling set.
- One Final Mold Part may produce multiple Master tooling pieces.
- Final Mold Sprue intent is reproduced in the Master cast target independently of Cavity.
- Final Mold Registration is reproduced in the Master cast target independently of Cavity.
- Master tooling alignment is a separate feature from Final Mold Registration.
- Segmentation is consumed as committed project input, not reimplemented.
- Master-specific case splitting does not mutate Final Mold Segmentation.
- printer build-volume constraints can trigger Master tooling partition refinement.
- no material-specific shrink/release values are silently invented.
- stale Worker results cannot commit.
- Cavity-only browser E2E passes.
- Master-only browser E2E passes without Create Cavity.
- both tools work in either order.
- visibility browser E2E passes.
- realistic multi-piece Golden Case passes.
- production build and repository quality gates pass.

---

# 30. Mandatory Non-Solutions

Do not close this execution by:

```text
relabeling current Master code as "Master Mold Engine"
wrapping synthesizeFinalMoldTarget behind another adapter
copying cavity-generation files into master-mold
calling Create Cavity silently
requiring a hidden Cavity precomputation
sharing one domain store between both engines
treating a Cavity result as Master source truth
forcing ±X ±Y ±Z as the only future release directions
equating Pour Face and release direction
returning blocked immediately after one-piece failure
accepting current OR blocked as success
hard-coding the user's current STL
whitelisting Golden fixtures
disabling collision checks
generating dozens of tiny triangle-level tooling pieces
using Final Mold Segmentation as Master tooling segmentation
using Final Mold Registration as Master tooling alignment
inventing resin/plaster/cement shrink values
hiding stale geometry instead of fixing lifecycle
forcing full geometry rebuild to make an eye icon work
raising bundle limits merely to make CI green
keeping obsolete 01–04 architecture as a fallback
```

---

# 31. Final Engineering Report

The executing agent must produce a final report with these exact sections.

## 31.1 Decision

Exactly one:

```text
READY
READY WITH DISCLOSED LIMITATIONS
NOT READY
```

## 31.2 Repository Evidence

- starting SHA;
- final SHA;
- branch;
- changed files;
- deleted obsolete files;
- worktree status.

## 31.3 Separation Proof

List:

- all Master → Cavity imports removed;
- all Cavity → Master imports absent;
- architecture test proving the firewall;
- runtime proof that Master works with no Cavity result.

## 31.4 Create Cavity Regression

Report exact tests proving old/current Create Cavity behavior remains intact.

## 31.5 Master Mold Engine Pipeline

Report implementation evidence for:

```text
Project Snapshot
Cast Target Builder
Pour-Face Planner
Surface Accessibility
One-Piece Release Attempt
Multi-Piece Planner
Parting Geometry
Tooling Construction
Tooling Registration
Release Sequence
Validation
```

## 31.6 Research-to-Code Mapping

For each algorithmic stage, identify which research concept informed it:

- visibility maps;
- moldability;
- undercut grouping;
- accessibility partitioning;
- mold-piece regions;
- parting curves;
- parting surfaces;
- global disassembly verification.

Do not claim a paper directly prescribes Craft-specific behavior when it does not.

## 31.7 Visibility Fix

Report:

- confirmed root cause;
- runtime presentation repair;
- Three.js scene test;
- browser eye-toggle test.

## 31.8 Integration

Report exact proof for:

- Segmentation;
- Cut by Face;
- Sprue;
- Final Mold Registration;
- Master tooling registration;
- Mold Scale;
- Undo/Redo;
- model replacement.

## 31.9 Golden Cases

Report each fixture and:

```text
source
pour-face result
release mode
tooling-piece count
release sequence
validation result
```

## 31.10 E2E Independence

Report:

```text
Create Cavity only
Master Mold only
Master → Cavity
Cavity → Master
visibility
upstream edit
```

## 31.11 Quality Gates

List exact commands and exact results.

Do not estimate pass counts.

## 31.12 Remaining Limitations

Separate:

```text
software defect
physical manufacturing limitation
not-yet-supported process strategy
```

Do not rename a software failure as a physical limitation.

---

# 32. Closure Rule

Execution 05 is not complete because:

```text
code compiles
tests are mostly green
a Worker returns meshes
one simple box works
Create Cavity still works
Master Mold has a new class name
```

It is complete only when this is true:

```text
                    SAME PROJECT TRUTH
                       /           \
                      /             \
             Cavity Loop         Master Loop
                 │                  │
          Cavity Engine      Master Mold Engine
                 │                  │
          Finished Mold      Master Tooling Set
                 │                  │
          independent        independent
```

and the Master loop itself proves:

```text
Committed Mold Design
→ Master Cast Target
→ Pour Face
→ Accessibility Analysis
→ One-Piece or Multi-Piece Release Plan
→ Printable Tooling Pieces
→ Verified Release Sequence
→ Master Tooling Viewport
```

without executing, importing, reading, or depending on Create Cavity.

If this architecture cannot be proven, the correct final result is:

```text
NOT READY
```

Do not create Execution 06 merely to close a requirement that Execution 05 silently skipped.

First repair Execution 05 until its own contract is satisfied or report the concrete architectural blocker.
