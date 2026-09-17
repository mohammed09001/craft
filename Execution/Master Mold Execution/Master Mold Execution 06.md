<div align="center">

# Master Mold Execution 06
## Intelligent Autonomous Master Mold Planning, Physical Mold-Making Automation, and Corrective Closure

**Date:** 2026-09-14  
**Document Type:** Corrective + Complementary + Development Execution  
**Repository:** `mohammed09001/craft`  
**Branch:** `main`  
**Repository HEAD inspected:** `1a9aaba759342ca1ff74fc99bc0dd4b6c06921dc`  
**Execution Mode:** Continuous — investigate → repair → implement → test → regress → continue. Do not pause for approval between articles.  
**Primary Product Change:** Master Mold becomes an autonomous mold-design workflow that starts directly from the imported part and intelligently chooses the required mold-piece count and Master tooling strategy. It must not require Cut by Face, Segmentation, Create Cavity, or a pre-existing committed mold definition.

</div>

---

# 0. Executive Mission

Execution 06 is a corrective continuation of the current Master Mold implementation, but it also changes the product model in a fundamental way.

The current repository still treats Master Mold as a downstream consumer of an already-created mold-part definition. `MasterMoldAction.tsx` currently reads `definition`, `cuttingPlanes`, `lastCommittedResult`, and the Split Face workflow, and it renders only when the workflow reaches `partsReady`. The current `masterMoldSnapshot.ts` also requires `ReferenceMoldDefinition` and converts its `moldBodies` into `committedMoldParts`. This means the user must first create mold parts through the cutting workflow before Master Mold can operate.

That is no longer the intended product.

Create Cavity and Master Mold now have deliberately different entry conditions:

```text
CREATE CAVITY
Imported Part
    ↓
User creates mold-part boundaries
    ↓
Cut by Face OR Segmentation
    ↓
Committed mold parts
    ↓
Create Cavity
    ↓
Finished mold ready to print/use
```

```text
MASTER MOLD
Imported Part
    ↓
User presses Master Mold
    ↓
Master Mold Intelligence analyzes the part
    ↓
Automatically decides mold-piece count and parting strategy
    ↓
Automatically constructs a virtual Working Mold Plan
    ↓
Automatically creates printable Master tooling for those Working Mold parts
    ↓
User prints Master tooling and casts physical mold-making material
    ↓
Physical Working Mold parts
    ↓
Assembled Final Working Mold
```

The key invariant is:

> **Master Mold must not require Cut by Face or Segmentation.**

The user may import a model and press **Master Mold immediately**. The Master Mold Engine must determine whether the physical working mold should use two, three, four, or more mold parts according to geometry, release, fillability, tooling release, printer constraints, and manufacturing risk.

A simple object should strongly prefer the minimum practical count, normally two mold parts under the current product policy. A complex object must be allowed to use more pieces when that reduces mechanical lock, undercuts, fragile tooling, impossible release paths, or unsafe cast extraction.

Execution 06 must also repair the performance architecture introduced by Execution 05. The current planner can perform many exact Manifold CSG collision sweeps across many candidate split planes. This is computationally expensive and is consistent with the reported product behavior where pressing Master Mold appears to freeze. The new planner must use cheap geometric reasoning to narrow the search first, and reserve exact CSG operations for a very small final shortlist.

This execution is complete only when a real imported model can run:

```text
Import
→ Master Mold
→ intelligent automatic mold planning
→ visible verified Master tooling
```

without ever touching:

```text
Constructed Cutting Plan
Cut by Face
Segmentation
Create Cavity
```

---

# 1. Product Truth: Three Different Geometric Layers

The implementation must stop collapsing three physically different objects into one concept.

## 1.1 Source Part

The imported STL/mesh is the object whose shape the user ultimately wants to reproduce by casting material into a physical working mold.

This is the only mandatory geometric input for a fresh Master Mold run.

## 1.2 Auto Working Mold Plan

Master Mold must internally create a **virtual Working Mold Plan** around the Source Part.

This is not the Create Cavity result and must not reuse Create Cavity state.

It answers:

- How many physical working-mold parts are needed?
- Which source-part surfaces belong to each mold piece?
- What are the feasible demolding directions?
- Where should parting curves and parting surfaces lie?
- Which pieces release first?
- Where can final-mold registration features live safely?
- Which seams should be avoided because they cross high-detail or high-curvature regions?

The result should be represented by a Master-owned contract such as:

```ts
interface AutoWorkingMoldPlan {
  sourceGeometryVersion: string;
  moldPieces: WorkingMoldPieceTarget[];
  partingInterfaces: WorkingMoldPartingInterface[];
  releaseSequence: WorkingMoldReleaseStep[];
  registrationPlan: WorkingMoldRegistrationPlan;
  warnings: PlanningWarning[];
  score: WorkingMoldPlanScore;
}
```

The exact naming may change after repository investigation, but the architectural concept must exist.

## 1.3 Master Tooling Set

For each `WorkingMoldPieceTarget`, Master Mold must create the printable tooling used to cast that one physical working-mold piece.

Therefore the physical hierarchy is:

```text
Source Part
    ↓
Auto Working Mold Plan
    ↓
Working Mold Piece A
Working Mold Piece B
Working Mold Piece C ...
    ↓
Master Tooling Set A
Master Tooling Set B
Master Tooling Set C ...
    ↓
Cast A / Cast B / Cast C
    ↓
Physical Working Mold A / B / C
    ↓
Assemble Working Mold
```

A `Master Tooling Set` itself may be one rigid printed case or several removable tooling panels if the cast working-mold piece would mechanically lock inside a single rigid case.

Thus there are two independent decomposition questions:

1. **Working Mold Decomposition:** how many final working-mold parts surround the original Source Part?
2. **Master Tooling Decomposition:** how many printed tooling panels are required to cast and release each Working Mold Part?

Do not merge these two problems.

---

# 2. Physical Mold-Making Research Converted into Product Rules

Execution 06 is grounded in real physical mold-making practice, not only CAD abstractions.

## 2.1 Direct 3D-Printed Case Molds Are Valid, But Mechanical Lock Is Real

Digitalfire documents CAD and 3D-print workflows where a printed case/block mold is used to produce working plaster molds. The practical workflow includes building an enclosing box around the desired mold shape, creating the negative space, adding sufficient wall thickness, and using alignment hardware/natches. It also documents an important failure mode: direct rigid PLA case molds can grip plaster strongly enough that the plaster breaks during extraction when geometry contains sharp corners, inside negative shapes, unfavorable orientation, or print artifacts.

Execution implication:

- “Boolean geometry succeeded” is not enough.
- The engine must prove a release sequence.
- Rigid brittle cast materials must receive a conservative release strategy.
- If a one-piece printed case mechanically locks the cast mold, the engine must split the tooling, introduce removable panels/cores, or return a structured material/process fallback.
- Never fake a valid reusable rigid case simply because the Boolean produced a watertight solid.

Practical reference:

- Digitalfire — **CAD steps for a 3DP block mold to make a rubber case mold**  
  https://digitalfire.com/picture/3533
- Digitalfire — **Poor plaster release from 3D printed mug handle case molds**  
  https://digitalfire.com/picture/3529

## 2.2 Physical Mold Makers Choose Split Lines to Prevent Mechanical Lock

Smooth-On’s multi-piece support-shell tutorials explicitly plan shell splits around the high points of the model to prevent mechanical lock. Their examples use two- and three-piece rigid shells depending on shape complexity.

Execution implication:

- Piece count must be geometry-dependent.
- High points, silhouette boundaries, undercuts, curvature ridges, and accessibility transitions are meaningful candidate parting locations.
- A three-piece plan is not a failure of a two-piece plan; it is a legitimate physical solution.
- The planner must search increasing piece count instead of terminating after a failed two-piece attempt.

Practical references:

- Smooth-On — **Preparing Mold For Support Shell**: multi-piece shell; split lines planned to avoid mechanical lock.  
  https://www.smooth-on.com/tutorials/making-brush-mold-dragon-skin-silicone-rubber/preparing-mold-for-support-shell/
- Smooth-On — **Preparing Mold For Support Shell** (two-piece support shell): plan split along high points.  
  https://www.smooth-on.com/tutorials/glove-mold-dragon-skin-cast-faux-wood-repro/preparing-mold-for-support-shell/

## 2.3 Registration Features Are Physical Assembly Features

Physical mold-making workflows cut keys into temporary shims or clay so that mold or shell sections reassemble precisely. Smooth-On examples also use bolts to lock rigid support-shell sections together.

Execution implication:

- Working Mold Registration and Master Tooling Registration remain two different domains.
- Every multi-piece Master Tooling Set must receive its own alignment strategy when sufficient safe flange area exists.
- `registrationFeatures: []` cannot remain the production default for verified multi-piece tooling.
- Pins/keys/natches/flanges must avoid the functional cast surface.
- Fastener holes may be proposed only on nonfunctional flange regions.

References:

- Smooth-On — **How To Make a 2 Part Silicone Mold**  
  https://www.smooth-on.com/tutorials/mold-max-25-create-2-silicone-mold/
- Smooth-On — **Applying Third Part of Support Shell and Demolding Original**  
  https://www.smooth-on.com/tutorials/making-brush-mold-dragon-skin-silicone-rubber/applying-third-part-of-support-shell-and-demolding-original/

## 2.4 Pour Access and Air Escape Are Separate Problems

Physical matrix/cavity mold workflows use a pour spout plus separate air-release paths. Smooth-On explicitly keeps vent tubes away from the model surface.

Execution implication:

- `Pour Face` remains independent from `Release Direction`.
- Fillability must also model trapped-air risk.
- Vents must never be drilled through functional source-part surfaces.
- Execution 06 may automatically generate **tooling-only safe vents** only when the vent path terminates on a nonfunctional exterior surface of the Working Mold target and passes a collision/surface-protection check.
- If no safe vent exists, return a visible recommendation rather than silently modifying the functional mold surface.

Reference:

- Smooth-On — **Create a Matrix Mold or Cavity Pour Mold Using Mold Max 30**  
  https://www.smooth-on.com/tutorials/creating-cavity-pour-mold-mold-max-30/

---

# 3. Computational Research Converted into the New Intelligence Pipeline

The following literature is not decoration. Each paper contributes a specific algorithmic idea.

## 3.1 Visibility Maps and Demoldability

Chen, Chou, and Woo define complete/partial visibility, surface visibility maps on the unit sphere, pockets, and optimal parting direction pairs.

**Reference:**  
Lin-Lin Chen, Shuo-Yan Chou, Tony C. Woo — *Parting directions for mould and die design*, Computer-Aided Design, 1993.  
DOI: `10.1016/0010-4485(93)90103-U`

Use in Craft:

- Generate candidate release directions from geometry.
- Build a global accessibility representation for surface regions.
- Do not assume only ±X/±Y/±Z.
- Use visibility to eliminate impossible directions before CSG.

## 3.2 Surface Moldability and Parting-Line Generation

Fu, Nee, and Fuh connect surface visibility/moldability classification to core/cavity/local-tool surfaces and parting-line generation.

**Reference:**  
M.W. Fu, A.Y.C. Nee, J.Y.H. Fuh — *The application of surface visibility and moldability to parting line generation*, Computer-Aided Design, 2002.  
DOI: `10.1016/S0010-4485(01)00117-8`

Use in Craft:

- Convert triangle-level visibility into coherent moldable surface regions.
- Use region boundaries as candidate parting curves.
- Prefer seams that separate accessibility classes instead of arbitrary box fractions.

## 3.3 Accessibility-Driven Multi-Piece Partitioning

Huang, Gupta, and Stoppel partition a gross mold shape iteratively so each decomposition improves accessibility.

**Reference:**  
J. Huang, S.K. Gupta, K. Stoppel — *Generating sacrificial multi-piece molds using accessibility driven spatial partitioning*, Computer-Aided Design, 2003.  
DOI: `10.1016/S0010-4485(03)00008-3`

Use in Craft:

- Splitting must solve an identified accessibility problem.
- Do not enumerate dozens of arbitrary planes and immediately run exact Boolean sweeps.
- A proposed split must have measurable accessibility gain.
- Stop splitting when all assigned regions have a valid release path and piece-count/printability constraints are satisfied.

## 3.4 Global Accessibility and Guaranteed Multi-Piece Disassembly

Priyadarshi and Gupta automate parting directions, parting lines, parting surfaces, mold-piece construction, and global disassembly for multi-piece permanent molds.

**Reference:**  
Alok K. Priyadarshi, Satyandra K. Gupta — *Geometric algorithms for automated design of multi-piece permanent molds*, Computer-Aided Design, 2004.  
DOI: `10.1016/S0010-4485(03)00107-6`

Use in Craft:

- Local face visibility is not enough; each complete piece must have a globally valid removal path.
- Every accepted plan must include an ordered release sequence.
- Exact collision verification validates the final plan; it must not be the main search mechanism.

A related implementation description from Gupta’s research group emphasizes that global accessibility enables guaranteed disassembly and non-planar parting lines:

https://sites.usc.edu/skgupta/automated-design-of-multi-piece-molds-for-making-geometrically-complex-objects/

## 3.5 Minimum Mold-Piece Region Cover

Research on complex ceramic gelcasting describes a five-step multi-piece mold pipeline:

1. find candidate parting directions;
2. compute accessible facet sets;
3. build connected mold-piece regions;
4. choose a minimum number of regions that covers the entire boundary — a set-cover problem;
5. construct mold pieces.

Use in Craft:

- Prefer the **smallest verified piece count**.
- Search piece count progressively: 2 → 3 → 4 → … up to a bounded process/profile cap.
- A higher piece count is justified only when lower counts cannot satisfy hard manufacturing constraints or are significantly worse by the planner score.

Research summary source:

- *Replamineform Inspired Bone Structures (RIBS) using multi-piece molds and advanced ceramic gelcasting technology* — multi-piece mold algorithm summary.  
  https://www.sciencedirect.com/science/article/abs/pii/S0928493106001809

## 3.6 Free-Form Mold-Piece Regions

Lin and Quang generate tentative parting directions from coordinate axes, axes of revolution, and planar surface normals; identify visible-moldable surfaces; split partial regions using silhouettes/edge extrusion; assign fragments into mold-piece regions; and extract parting curves.

**Reference:**  
Alan C. Lin, Nguyen Huu Quang — *Automatic generation of mold-piece regions and parting curves for complex CAD models in multi-piece mold design*, Computer-Aided Design, 2014.  
DOI: `10.1016/j.cad.2014.06.014`

Use in Craft’s mesh environment:

- Relative/world axes remain baseline candidates.
- Add PCA/principal shape axes.
- Add dominant planar-patch normals.
- Add dominant normal-cluster directions.
- Detect approximate rotational axes where robustly inferable; do not invent them when confidence is low.
- Extract silhouette/visibility transition boundaries from the mesh as candidate parting curves.
- Support ruled/extruded parting surfaces derived from those curves, not only global axis-aligned planes.

## 3.7 Mesh-Friendly Demoldability Mapping

Martin-Doñate and Rubio-Paramio describe moldability analysis using discretization/storage arrays and 2D scan profiles, with hierarchical demolding zones and automatic parting-line extraction.

**Reference:**  
C. Martin Doñate, M.A. Rubio Paramio — *New methodology for demoldability analysis based on volume discretization algorithms*, Computer-Aided Design, 2013.  
DOI: `10.1016/j.cad.2012.08.005`

Use in Craft:

- STL is already mesh/discrete data; do not require B-Rep semantics.
- Use a compact planning representation for classification and search.
- Preserve the full-resolution mesh only for final construction/verification.
- This supports the required performance architecture: cheap array/BVH planning first, expensive CSG only after pruning.

## 3.8 State-of-the-Art Review

A modern survey of computational mold design covers parting-line, mold decomposition, undercut removal, and shape decomposition methods and references later geometric approaches.

**Reference:**  
Alderighi et al. — *State of the Art in Computational Mould Design*, Computer Graphics Forum, 2022.  
DOI: `10.1111/cgf.14581`

Execution implication:

- Do not bind the architecture permanently to orthogonal box splits.
- Keep planning contracts general enough for non-planar parting surfaces and future shape-decomposition strategies.

---

# 4. Current Repository Findings That Execution 06 Must Correct

The following statements are based on the inspected Craft `main` state at commit `1a9aaba759342ca1ff74fc99bc0dd4b6c06921dc`.

## 4.1 Master Mold Is Still Gated by Split-Face Workflow

`MasterMoldAction.tsx` currently reads:

- `workflow`;
- `definition`;
- `cuttingPlanes`;
- `lastCommittedResult`;
- `segmentationRegenerationCount`;
- the Split Face document identity.

It returns `null` unless:

```ts
workflow === "partsReady"
```

This violates the new product contract.

## 4.2 Snapshot Still Requires a Pre-Built Mold Definition

`masterMoldSnapshot.ts` currently requires `ReferenceMoldDefinition` and maps:

```text
definition.moldBodies
→ committedMoldParts
```

This means Master Mold is still conceptually downstream of mold-part creation.

Execution 06 must replace this required input with a Master-owned seed snapshot built from the imported model and neutral project context.

## 4.3 Current Engine Starts from `committedMoldParts`

`engine/masterMoldEngine.ts` currently starts by calling `buildMasterCastTargets(snapshot)`, where the snapshot already contains committed mold parts.

The new engine must instead start with:

```text
Source Part
→ Intelligent Working Mold Planner
→ WorkingMoldPieceTarget[]
→ Master Tooling Planner
```

## 4.4 Current Multi-Piece Planner Is Effectively Two-Piece and Planar

`engine/multiPiecePlanner.ts` currently:

- creates candidate axis-aligned splits;
- evaluates fixed fractions and selected feature levels;
- calls `attemptTwoPiecePlan()`;
- tries a bounded set of core assignment modes;
- returns the first verified two-piece plan.

This is useful as a fallback primitive, but it is not an intelligent N-piece planner.

It must no longer be the top-level planning algorithm.

## 4.5 Accessibility Analysis Is Not Driving Search Strongly Enough

`engine/releaseAnalysis.ts` computes sampled directional accessibility, but the result is mostly descriptive. The exact CSG planner still performs expensive candidate construction/verification independently.

Execution 06 must make accessibility, surface regions, and parting-boundary reasoning the **search authority**.

## 4.6 Exact CSG Is Being Used Too Early and Too Often

The current demold verifier performs many Manifold intersection operations during translation sweeps. The current multi-piece planner may invoke these sweeps for many split candidates.

Exact CSG must become a **late validation stage**, not the primary candidate search mechanism.

## 4.7 Worker Payload Uses Clone-Heavy Mesh Structures

The current Master worker receives a request containing large object graphs and mesh arrays through `postMessage()` without a Transferable ownership strategy. This can impose expensive structured-clone work before the Worker begins processing.

Execution 06 must introduce a compact Worker request with typed arrays and transfer ownership where safe.

## 4.8 Progress Is Coarse

The current evaluation path emits progress essentially around the whole engine call rather than reporting internal stages and candidate progress.

A long planner therefore looks frozen even when the Worker is active.

## 4.9 Cancellation Is Not Deeply Cooperative

Cancellation is checked outside major engine calls, but expensive inner loops and repeated candidate validation must also inspect an AbortSignal or cancellation token.

## 4.10 Tooling Registration Exists but Is Not Fully Connected

The repository contains tooling-registration construction code, but current produced assemblies can still return empty `registrationFeatures` and pieces with empty feature IDs.

Execution 06 must connect registration geometry to the actual selected Master Tooling plan.

---

# 5. Target Architecture

Execution 06 should produce this architectural flow:

```text
Imported Part Truth
│
├── canonical mesh / transform
├── source bounds
├── orientation
├── model scale
├── printer build volume
├── Master casting process profile
└── optional Master-specific user preferences
        │
        ▼
MasterMoldSeedSnapshot
        │
        ▼
Planning Mesh / Surface Patch Graph
        │
        ▼
Candidate Direction Generator
        │
        ▼
Global Accessibility Analyzer
        │
        ▼
Moldable Surface Region Builder
        │
        ▼
Working Mold Piece Optimizer
        │
        ├── try 2 pieces
        ├── then 3
        ├── then 4
        └── continue to bounded N only when necessary
        │
        ▼
Parting Curve + Parting Surface Generator
        │
        ▼
Virtual Working Mold Constructor
        │
        ▼
Exact Working-Mold Release Verification
        │
        ▼
WorkingMoldPieceTarget[]
        │
        ▼
Per-target Master Tooling Planner
        │
        ├── one-piece printed case if releasable
        ├── multi-panel case if required
        ├── removable core/insert when justified
        └── structured sacrificial/flexible fallback if reusable rigid tooling is impossible
        │
        ▼
Tooling Registration + Fill/Vent Planning
        │
        ▼
Exact Final CSG Validation
        │
        ▼
Master Tooling Sets
```

Create Cavity remains a sibling product path and is not called or mutated by this pipeline.

---

# 6. Article 01 — Decouple Master Mold Entry from Cutting Workflow

## Goal

Allow the user to import a part and click Master Mold immediately.

## Required Changes

Investigate all current Master Mold entry conditions and remove dependencies that exist only because of the old downstream architecture.

`MasterMoldAction` must no longer require:

- `workflow === "partsReady"`;
- `definition !== null`;
- committed cutting planes;
- `lastCommittedResult`;
- Segmentation regeneration state;
- Create Cavity completion.

The action should be available when the imported canonical source geometry is valid and the application is not in a conflicting destructive edit transaction.

If a cutting session is open, choose one deterministic product behavior:

- either Master Mold is disabled with a clear reason until the session is closed; or
- Master Mold explicitly ignores the uncommitted draft and works from the canonical imported part.

Do not silently read draft cutting geometry.

## Store Boundary

Master Mold must not populate or mutate:

- `splitFace.definition`;
- `splitFace.cuttingPlanes`;
- Segmentation drafts;
- Cavity result state.

It owns its own `AutoWorkingMoldPlan`.

## Exit Test

Real app:

```text
Import STL
assert cuttingPlanes.length === 0
assert definition === null
click Master Mold
Master generation begins
```

No synthetic pre-commit injection is allowed for this acceptance case.

---

# 7. Article 02 — Replace `MasterMoldProjectSnapshot` with a True Seed Snapshot

## Goal

Stop treating committed mold bodies as mandatory Master inputs.

## New Snapshot Contract

Create a Master-owned seed snapshot containing only authoritative information required before planning:

```ts
interface MasterMoldSeedSnapshot {
  schemaVersion: number;
  sourceModelId: string;
  sourceGeometryVersion: string;
  sourceMesh: TransferableMeshPayload;
  sourceTransform: Matrix4Payload;
  sourceBounds: Bounds3;
  printerBuildVolume: BuildVolume | null;
  processProfile: MasterCastingProcessProfile;
  userPreferences: MasterMoldPlanningPreferences;
  sourceProjectRevision: string;
}
```

Do not include:

- `ReferenceMoldDefinition` as a required field;
- `committedMoldParts`;
- `cuttingPlanes`;
- Cavity results;
- Create Cavity provenance.

Optional existing Master outputs may be included only as prior Master-owned cache/reuse data.

## Context Rule

Do not copy the entire project state into the Worker. Pass the smallest deterministic snapshot necessary to reproduce the Master result.

---

# 8. Article 03 — Build a Two-Resolution Geometry Architecture

## Goal

Fix freezing and prevent exact CSG from becoming the search engine.

## Planning Geometry

Create a lightweight `PlanningMesh` or `SurfacePatchGraph` from the full source mesh.

It may contain:

- sampled triangles or patches;
- triangle normals;
- area weights;
- adjacency;
- curvature/ridge estimates;
- dominant planar patches;
- connected components;
- BVH acceleration;
- source triangle/patch provenance.

The planning representation must be compact enough to analyze high-poly STL models quickly.

Do not permanently modify or decimate the manufacturing mesh.

## Manufacturing Geometry

The original full-resolution mesh remains authoritative for:

- final Boolean construction;
- final parting-surface cuts;
- exact collision verification;
- exported tooling geometry.

## Rule

```text
Planning decides.
Exact geometry verifies.
```

Never invert this rule again.

---

# 9. Article 04 — Intelligent Candidate Direction Generator

## Goal

Replace “six world axes only” with geometry-derived candidate directions while remaining bounded and deterministic.

## Candidate Sources

Generate and deduplicate candidates from:

- ± world X/Y/Z;
- PCA/principal shape axes;
- dominant planar-patch normals;
- dominant normal-cluster directions;
- inferred revolution/feature axes only when confidence is above a documented threshold;
- optional user override in a future UI-compatible contract.

For every direction, compute a cheap preliminary score using:

- accessible surface area;
- inaccessible/undercut area;
- number of disconnected inaccessible zones;
- expected seam complexity;
- expected mold depth;
- silhouette complexity;
- print orientation cost proxy.

Discard dominated directions before region optimization.

Keep an explicit maximum direction candidate budget. The budget must be centralized and tested, not scattered magic constants.

---

# 10. Article 05 — Global Accessibility and Surface Region Graph

## Goal

Make accessibility the authority for mold decomposition.

## Required Algorithm

For each candidate release direction:

1. classify sampled surface patches as globally accessible / partially accessible / inaccessible;
2. use BVH ray or scan-profile analysis to account for occlusion, not normal sign alone;
3. group adjacent inaccessible patches into coherent undercut regions;
4. compute region area and severity;
5. build a graph whose nodes are surface patches/regions and whose edges represent mesh adjacency;
6. record which directions can mold/release each region.

The output should support queries such as:

```text
Which connected surface regions can be formed by a single mold piece moving along direction d?
```

This replaces the current descriptive-only accessibility fraction.

## Performance Rule

No Manifold Boolean is allowed in this stage.

---

# 11. Article 06 — Automatic Working Mold Piece Count Optimizer

## Goal

Let the engine decide whether the Working Mold needs 2, 3, 4, or more pieces.

## Product Policy

For the current Master Mold product:

- Start from **2 pieces** as the preferred minimum.
- Never force two pieces when geometry is mechanically locked.
- Increase piece count only when hard constraints fail or the lower-piece plan is materially worse.
- Support a bounded configurable `maxWorkingMoldPieces` in the process/profile contract; do not hardcode the engine to two pieces.

## Set-Cover Interpretation

For each feasible candidate direction, create moldable connected surface regions. The planner must select a collection of regions that covers the complete Source Part boundary.

Optimize lexicographically:

1. **Hard feasibility** — every surface must be assigned; every piece must have a release path.
2. **Minimum piece count.**
3. **Mechanical safety** — reduce undercut risk and narrow trapped features.
4. **Parting-line quality** — avoid high-detail/high-curvature/high-visibility areas when alternatives exist.
5. **Piece robustness** — avoid thin fragile mold parts.
6. **Assembly simplicity.**
7. **Master tooling manufacturability.**
8. **Printer build-volume fit.**
9. **Total tooling volume / estimated print burden.**

A bounded branch-and-bound / beam / hybrid breadth-depth search is acceptable. Exhaustive brute force is not.

## Required Behavior

```text
2-piece feasible and good
→ choose 2

2-piece impossible
3-piece verified
→ choose 3

2/3 impossible
4-piece verified
→ choose 4
```

A failed two-piece plan is planning evidence, not product failure.

---

# 12. Article 07 — Parting Curves and Parting Surfaces from Geometry

## Goal

Stop using arbitrary fixed-fraction axis planes as the primary partition generator.

## Candidate Parting Curves

Derive candidates from:

- accessibility-region boundaries;
- silhouette boundaries for candidate release directions;
- high-point/ridge chains where a physical mold maker would naturally place a split to avoid lock;
- planar-patch boundaries;
- sharp feature edges where appropriate;
- boundaries between regions assigned to different release directions.

## Candidate Parting Surfaces

Generate in preference order:

1. planar surfaces when sufficient;
2. extruded/ruled surfaces from parting curves;
3. bounded free-form extensions only when necessary and supported safely by the existing geometry kernel.

The selected surface must:

- separate assigned regions without cutting protected functional geometry incorrectly;
- produce connected mold solids;
- avoid sliver pieces;
- preserve minimum wall/flange requirements;
- support a valid release sequence.

The old axis-aligned `attemptTwoPiecePlan()` may remain only as a fallback primitive or a fast path for simple shapes.

---

# 13. Article 08 — Construct the Virtual Working Mold Plan

## Goal

Create the mold that the user physically wants to cast using Master tooling, without invoking Create Cavity.

## Construction

Using a Master-owned Working Mold envelope policy:

```text
Working Mold Envelope
-
Source Part Negative
=
Gross Working Mold
```

Then partition the Gross Working Mold by the selected Working Mold parting surfaces.

The result is:

```text
WorkingMoldPieceTarget[]
```

Each target must include:

- full-resolution mesh;
- bounds;
- volume;
- source geometry fingerprint;
- assigned release direction;
- interface IDs;
- functional-surface provenance;
- nonfunctional exterior-surface provenance;
- release order;
- warnings.

## Final Working Mold Registration

For interfaces between Working Mold Pieces, generate final-mold alignment features only on safe nonfunctional interfaces.

This is **not** Master Tooling Registration.

Keep separate contracts and IDs.

---

# 14. Article 09 — Master Tooling Planner per Working Mold Piece

## Goal

Generate printable case tooling for each automatically-created Working Mold Piece.

For each `WorkingMoldPieceTarget`:

1. choose a casting orientation;
2. choose a Pour Face;
3. build an enclosing Master case envelope;
4. test whether the cast Working Mold Piece can be released from a one-piece rigid case;
5. if not, identify the actual locked regions;
6. split the case into removable panels based on those locked regions;
7. introduce a removable core/insert only when it solves a localized internal lock more cheaply than another whole case split;
8. generate an ordered tooling disassembly sequence;
9. verify all pieces with exact CSG only after the plan is shortlisted.

## Adaptive Tooling Piece Count

Master tooling must also support `1..N` pieces per Working Mold Piece.

Do not stop at two tooling panels.

However, the optimizer should prefer fewer tooling pieces when equally safe.

## Physical Rule

For rigid/brittle cast mold materials, do not rely on deforming the cast or flexing the printed case unless an explicit material/process profile permits it.

---

# 15. Article 10 — Connect Tooling Registration, Flanges, and Fasteners

## Goal

Turn multi-piece tooling into an assembly a real user can print and reassemble.

## Requirements

Connect the existing tooling-registration generator to the selected production plan.

Every multi-piece Master Tooling Set must evaluate:

- safe key/pin/natch locations;
- sufficient flange thickness;
- pin/slot tolerance;
- interference with cast target;
- bolt/fastener hole candidates when adequate flange area exists;
- printability and minimum wall constraints.

Populate:

```text
assembly.registrationFeatures
piece.toolingRegistrationFeatureIds
```

with actual generated features.

If registration cannot be placed safely, the set must carry an explicit warning or be rejected if accurate assembly cannot be guaranteed.

Do not silently return a supposedly production-ready multi-piece set with no assembly strategy.

---

# 16. Article 11 — Intelligent Pour, Fillability, and Vent Planning

## Goal

Automate the physical step of filling Master tooling without damaging the functional Working Mold surface.

## Pour Face

Score candidate Pour Faces using:

- opening area;
- casting depth;
- gravitational fill direction;
- trapped-air risk;
- proximity to functional target surfaces;
- tooling complexity;
- print orientation;
- ease of cleanup on the cast Working Mold exterior.

## Vent Planning

Perform trapped-air analysis after Pour Face selection.

For each trapped pocket:

1. search for a path to a nonfunctional exterior face;
2. verify the path does not intersect protected functional Source-Part negative surfaces;
3. prefer short straight tooling-only vent channels;
4. generate the vent only when safety is provable;
5. otherwise surface a `vent_required_user_review` warning with the pocket location.

Do not automatically puncture a final working-mold cavity surface.

---

# 17. Article 12 — Material / Process Intelligence Without Hallucinated Material Numbers

## Goal

Make the Master Mold physically aware without silently inventing material data.

Extend `MasterCastingProcessProfile` to distinguish at least:

- rigid/brittle cast mold target;
- flexible cast mold target;
- reusable rigid printed tooling preferred;
- sacrificial printed tooling permitted or forbidden;
- user-supplied shrink compensation;
- user-supplied release clearance;
- minimum tooling wall;
- maximum Working Mold piece count;
- maximum Master tooling piece count;
- vent policy.

Do not hardcode unsupported shrinkage numbers for plaster, cement, resin, ceramic, or silicone.

If the user has not selected a material profile, use geometry-only conservative defaults and expose that assumption clearly in result metadata.

## Direct-Print Failure Strategy

If rigid reusable Master tooling cannot safely release a brittle cast target:

```text
try additional tooling decomposition
→ try removable localized core/insert
→ if still impossible:
   structured recommendation:
   flexible-intermediate or sacrificial-tooling workflow
```

Do not freeze and do not return fake geometry.

---

# 18. Article 13 — Performance Architecture Repair

## Goal

Eliminate the observed “Master Mold freezes” behavior.

## 18.1 Typed Arrays + Transferables

Worker-bound mesh payloads must use compact typed arrays such as:

- `Float32Array` / `Float64Array` as precision policy requires;
- `Uint32Array` indices.

Use `postMessage(message, transferList)` where ownership transfer is safe.

Do not repeatedly structured-clone full `number[]` geometry graphs.

## 18.2 Compact Worker Snapshot

Do not send:

- full Split Face store objects;
- full Reference Mold definitions;
- unused histories;
- duplicate meshes.

Send one canonical source mesh plus compact planning/profile data.

## 18.3 Cheap-to-Expensive Funnel

Required planner ordering:

```text
A. topology / bounds / adjacency
B. planning mesh / patch graph
C. BVH visibility and accessibility
D. region + direction scoring
E. piece-count optimization
F. shortlist only
G. exact full-resolution CSG construction
H. exact release verification
```

There must be a measurable candidate-reduction gate before G.

## 18.4 Exact CSG Budget

Introduce centralized limits for:

- maximum exact candidate plans per Working Mold piece count;
- maximum exact Master tooling plans per target;
- maximum demold sweep samples;
- maximum recursive partition depth.

The engine must report when it reaches a planning budget rather than appearing hung.

## 18.5 Progressive Result / Progress Events

Worker progress must expose named stages, for example:

```text
analyzing_geometry
building_accessibility
optimizing_working_mold
constructing_working_mold
planning_master_tooling
verifying_release
finalizing
```

Include:

- stage index;
- stage count;
- current mold piece;
- candidate index / total when meaningful;
- elapsed time.

The UI should display a compact progress message rather than a permanently spinning button.

## 18.6 Deep Cooperative Cancellation

Check cancellation inside:

- direction loops;
- patch/region analysis loops;
- piece-count search;
- candidate plan loops;
- repeated CSG verification loops.

Abort must terminate work promptly and leave the store in a coherent state.

## 18.7 Cache

Cache Master-owned planning artifacts by source geometry fingerprint and relevant profile inputs:

- Planning Mesh;
- surface patch graph;
- candidate directions;
- accessibility map.

Changing only printer build volume should not rebuild the Source Part accessibility map.

---

# 19. Article 14 — Store and Lifecycle Redesign

## Goal

Make Master lifecycle independent from Split Face document lifecycle.

## Required State

The Master store should own at minimum:

```text
status
seedSnapshotIdentity
analysisCacheIdentity
autoWorkingMoldPlan
workingMoldPieceStates
masterToolingSets
progressStage
progressDetail
warnings
lastError
generationVersion
```

## Staleness Inputs

Master becomes stale when Master-relevant inputs change, such as:

- Source Part geometry;
- orientation/transform;
- scale;
- Master process profile;
- Master-specific plan override;
- printer build volume when it affects tooling fit;
- optional Master-specific feature edits.

It must not become stale merely because Create Cavity state changes.

It must not be reset because Split Face `definition` becomes null; Master no longer depends on it.

## Incremental Regeneration

If only one Working Mold target/tooling set changes, preserve unaffected sets.

---

# 20. Article 15 — UI / UX: Make the Intelligent Workflow Understandable

## Goal

The user should understand that Master Mold is designing a mold automatically, not waiting for manual cutting.

## Button Behavior

The **Master Mold** button should be enabled after a valid model import.

On click:

```text
Analyzing part…
Finding release regions…
Choosing mold-piece count…
Building 3-piece working mold…
Planning Master cases…
Verifying release…
```

Do not expose internal research jargon unless placed in an advanced report.

## Result Presentation

The viewport must clearly distinguish:

- Source Part;
- Auto Working Mold preview;
- Master Tooling output.

Do not leave old reference mold boxes visible in a way that makes the user think they are Master geometry.

The Mold Bodies browser / visibility controls must work for:

- generated Working Mold pieces;
- Master Tooling pieces.

A user must be able to isolate one Master Tooling Set.

## Intelligent Summary

After generation, provide a compact result such as:

```text
Master Mold generated
Working mold: 3 parts
Master tooling: 4 printable pieces total
2 working-mold parts use one-piece cases
1 working-mold part uses a two-panel case
All release sequences verified
1 vent recommendation
```

---

# 21. Article 16 — Preserve Create Cavity as a Separate Product Loop

## Goal

Execution 06 must not damage the existing Create Cavity workflow.

Create Cavity keeps its current product contract:

```text
No committed Cut/Segmentation
→ Create Cavity unavailable

Committed mold parts exist
→ Create Cavity may generate the finished working mold
```

Master Mold must not weaken this rule.

Add an architecture test proving:

```text
cavity-generation/**
  does not import master-mold/**

master-mold/**
  does not import cavity-generation/** production orchestration/state
```

Neutral geometry primitives may remain shared under the neutral geometry domain.

---

# 22. Article 17 — Required Golden Geometry Cases

Execution 06 is not accepted with only boxes and 12-triangle fixtures.

Create deterministic fixtures covering the actual planner.

## Golden A — Simple Two-Piece Working Mold

A part with a clear single primary parting strategy.

Expected:

```text
Working Mold piece count = 2
Both pieces release
Master tooling generated
No manual cutting state used
```

## Golden B — Three-Piece Required

A part with an undercut arrangement impossible for any valid two-piece Working Mold but solvable with three pieces.

Expected:

```text
2-piece search rejected with evidence
3-piece plan selected
all three Working Mold pieces release
```

## Golden C — Four-or-More-Piece Complex Shape

A complex synthetic or industrial-like mesh with multiple independent accessibility regions.

Expected:

- planner does not terminate at two pieces;
- selected count is the smallest verified count within the configured limit;
- no arbitrary axis-only split assumption.

## Golden D — Non-Axis Parting Candidate

A rotated/oblique geometry where world ±X/±Y/±Z produce poor/impossible plans but a dominant planar normal or principal direction succeeds.

## Golden E — Master Case Lock

A valid Working Mold Piece that cannot be released from a one-piece rigid Master case.

Expected:

```text
one-piece Master case rejected
multi-panel Master tooling selected
verified disassembly sequence
```

## Golden F — Printer Constraint

A Working Mold plan is geometrically valid, but one Master case exceeds build volume.

Expected:

- split the Master tooling, not the Source Part or Create Cavity segmentation;
- output still produces the same Working Mold target.

## Golden G — Rigid-Plaster-Like Mechanical Lock

Fixture inspired by the physical failure mode documented by Digitalfire.

Expected:

- no assumption that the cast can flex;
- tooling decomposition or structured fallback.

---

# 23. Article 18 — Real Performance Acceptance

## Goal

Prove that the product does not only pass correctness tests; it remains usable on realistic mesh complexity.

## High-Poly Test Fixture

Include at least one deterministic high-poly fixture or generated mesh large enough to exercise:

- transfer cost;
- Planning Mesh generation;
- BVH analysis;
- region optimization;
- exact construction shortlist.

Do not use only a 12-triangle box as the performance evidence.

## Acceptance Signals

The browser E2E must verify:

- the main UI remains responsive after Master Mold click;
- a periodic heartbeat/timer on the page continues while Worker planning runs;
- progress advances through more than one stage;
- cancellation can terminate a long run;
- no unbounded candidate explosion occurs;
- the exact CSG candidate count stays under the centralized budget;
- result or structured bounded failure arrives without a frozen interface.

Avoid a brittle absolute millisecond threshold as the only criterion. Test the architectural properties that prevent freezing.

---

# 24. Article 19 — Real Browser Product Acceptance

The critical E2E must be the new user journey:

```text
Open /workspace
→ Import a real STL
→ DO NOT open Constructed Cutting Plan
→ DO NOT call Cut by Face
→ DO NOT run Segmentation
→ DO NOT click Create Cavity
→ click Master Mold
→ wait for intelligent planning
→ verify Working Mold plan has 2..N pieces
→ verify Master tooling exists
→ verify every current tooling piece is manifold/watertight
→ verify release sequences are collision-verified
→ verify actual viewport renders Master tooling
→ hide one tooling piece using the real UI
→ verify it disappears
→ show it again
→ verify it returns
```

The test must assert before clicking Master Mold that:

```text
cuttingPlanes.length === 0
definition === null
cavity.status !== complete
```

The test passes only if Master succeeds independently.

Do not satisfy this acceptance by injecting mold parts directly into the store.

A small e2e-only hook may observe state, but it must not create the required mold geometry for the feature.

---

# 25. Article 20 — Research Fidelity Tests

Add tests that prevent the implementation from drifting back into shallow approximations.

Required invariants:

- candidate direction set contains geometry-derived directions for an oblique fixture;
- accessibility regions affect the shortlist;
- a candidate split with no accessibility gain is rejected before exact CSG;
- planner can choose three pieces;
- planner can choose four or more within configured limits;
- parting curves originate from region/silhouette boundaries for the relevant fixture;
- exact CSG is not called for every raw candidate;
- minimum verified piece count is preferred;
- every accepted plan has a release sequence;
- every multi-piece tooling plan has an assembly/registration strategy or an explicit blocking reason.

---

# 26. Article 21 — Cleanup of Execution 05 Transitional Architecture

After the new path is proven, remove or demote obsolete concepts.

Investigate before deleting.

Likely candidates include:

- required `committedMoldParts` in the Master seed contract;
- mandatory `ReferenceMoldDefinition` in Master snapshot;
- Split Face document identity as Master’s primary provenance;
- `workflow === "partsReady"` UI gate;
- two-piece planner as top-level architecture;
- old cast-target builder assumptions that start from existing mold stock;
- dead registration code not wired into production;
- stale tests that prove the old “Create Cavity → Master Mold” sequence as the only real UI workflow.

Keep useful neutral geometry utilities and verified low-level release checks.

Do not perform a broad rollback.

---

# 27. Required Implementation Loop

This execution must run continuously.

For each article:

```text
INVESTIGATE
- inspect current code and tests
- identify authoritative state and existing reusable primitives
- reproduce the specific failure/gap first where possible

DESIGN
- define the smallest architecture change that satisfies the new product invariant
- avoid duplicate engines and parallel sources of truth

IMPLEMENT
- modify/replace/delete existing code where appropriate
- do not solve architectural problems by accumulating unused code beside the old path

TEST
- focused unit/integration tests
- use full-resolution exact geometry only where the test needs it

REGRESS
- run relevant Create Cavity, Segmentation, Sprue, Registration, viewport tests

CONTINUE
- proceed directly to the next article without waiting for approval
```

Do not create an execution harness that pauses after phases.

Repository evidence is authoritative. If current code differs from assumptions in this document, investigate and adapt while preserving the Product Truth and acceptance criteria.

---

# 28. Non-Negotiable Product Invariants

1. **Master Mold starts from the imported part.**
2. **Master Mold does not require Cut by Face.**
3. **Master Mold does not require Segmentation.**
4. **Master Mold does not require Create Cavity.**
5. **Create Cavity still requires committed mold-part geometry.**
6. **Master owns its automatic Working Mold Plan.**
7. **The engine chooses the minimum verified Working Mold piece count, beginning at two and increasing as needed.**
8. **Working Mold decomposition and Master Tooling decomposition are separate problems.**
9. **Accessibility/region analysis drives search; exact CSG validates the shortlist.**
10. **No world-axis-only assumption.**
11. **No two-piece-only top-level planner.**
12. **Every accepted rigid tooling plan has a verified release sequence.**
13. **Multi-piece tooling must have a real assembly/alignment strategy.**
14. **Functional Source-Part mold surfaces are protected from automatic vent/key damage.**
15. **No silent material assumptions for shrinkage or flexibility.**
16. **No clone-heavy full project state sent to the Worker.**
17. **Progress and cancellation must work during expensive planning.**
18. **The real browser acceptance path never clicks Create Cavity first.**
19. **A green unit-test suite is insufficient without high-poly responsiveness evidence.**
20. **Do not mark Execution 06 READY if the real imported-model workflow still freezes.**

---

# 29. Definition of Done

Execution 06 is `READY` only if all of the following are true.

## Product

- Import → Master Mold works directly.
- No cutting plan is required.
- Engine automatically produces a Working Mold Plan with 2..N pieces.
- Simple geometry selects the lowest valid piece count.
- Complex geometry can select 3+ pieces.
- Master tooling is generated for every valid Working Mold target.

## Physical Correctness

- Working Mold pieces have valid source-part release sequences.
- Master tooling has valid cast-target release sequences.
- Multi-piece tooling includes alignment/assembly features when required.
- Pour access is valid.
- Trapped-air risk is analyzed.
- Rigid cast materials never rely on undocumented flexibility.

## Architecture

- Master is independent of Cavity and Split Face planning state.
- Create Cavity behavior remains unchanged.
- Master planning state is Master-owned.
- Neutral geometry utilities remain shared appropriately.

## Intelligence

- candidate directions are geometry-derived;
- global accessibility is computed;
- coherent moldable regions are built;
- piece-count search is adaptive;
- parting boundaries are geometry-driven;
- exact verification is late-stage.

## Performance

- typed-array / transfer strategy implemented;
- UI stays responsive during real generation;
- stage progress is visible;
- cancellation is cooperative;
- exact candidate count is bounded;
- high-poly test exists and passes the responsiveness criteria.

## QA

- unit tests pass;
- integration tests pass;
- Create Cavity regression tests pass;
- real Master-only Playwright E2E passes;
- visibility hide/show works on actual generated Master tooling;
- no test claims success by accepting `blocked` for a fixture intended to be manufacturable;
- no 12-triangle box is used as the only evidence of product readiness.

If any of these gates fails, final report status must be:

```text
NOT READY
```

with the failed gate and repository evidence listed explicitly.

Do not create Execution 07 merely to patch an unfinished Execution 06 requirement. Repair the Execution 06 implementation until its own acceptance gates are satisfied, unless a genuinely new product capability is intentionally deferred by the user.

---

# 30. Final Expected Product Experience

For a normal user, the finished behavior should feel simple despite the internal geometry intelligence.

```text
1. Import model.
2. Press Master Mold.
3. Craft analyzes the object.
4. Craft decides the mold needs, for example, three Working Mold parts.
5. Craft creates the parting strategy automatically.
6. Craft creates a printable Master case/tooling set for each Working Mold part.
7. User prints the Master tooling.
8. User pours plaster/resin/cementitious or other selected mold-making material into each appropriate case.
9. Tooling is removed in the verified sequence.
10. Physical Working Mold parts are assembled using their registration features.
11. The Working Mold is ready for the user’s final casting process.
```

The user should not need to understand Cut by Face, visibility maps, set cover, accessibility cones, parting-curve extraction, CSG verification, or release-search internals to get a valid Master Mold.

That complexity belongs inside the Master Mold Engine.

---

# 31. Research References

## Practical / Physical Mold-Making

- Digitalfire — *CAD steps for a 3DP block mold to make a rubber case mold*  
  https://digitalfire.com/picture/3533
- Digitalfire — *Poor plaster release from 3D printed mug handle case molds*  
  https://digitalfire.com/picture/3529
- Smooth-On — *How To Make a 2 Part Silicone Mold*  
  https://www.smooth-on.com/tutorials/mold-max-25-create-2-silicone-mold/
- Smooth-On — *Preparing Mold For Support Shell* (multi-piece shell)  
  https://www.smooth-on.com/tutorials/making-brush-mold-dragon-skin-silicone-rubber/preparing-mold-for-support-shell/
- Smooth-On — *Preparing Mold For Support Shell* (two-piece shell)  
  https://www.smooth-on.com/tutorials/glove-mold-dragon-skin-cast-faux-wood-repro/preparing-mold-for-support-shell/
- Smooth-On — *Applying Third Part of Support Shell and Demolding Original*  
  https://www.smooth-on.com/tutorials/making-brush-mold-dragon-skin-silicone-rubber/applying-third-part-of-support-shell-and-demolding-original/
- Smooth-On — *Create a Matrix Mold or Cavity Pour Mold Using Mold Max 30*  
  https://www.smooth-on.com/tutorials/creating-cavity-pour-mold-mold-max-30/

## Computational Mold Design

- Chen, Chou, Woo (1993) — *Parting directions for mould and die design*  
  DOI: `10.1016/0010-4485(93)90103-U`
- Fu, Nee, Fuh (2002) — *The application of surface visibility and moldability to parting line generation*  
  DOI: `10.1016/S0010-4485(01)00117-8`
- Huang, Gupta, Stoppel (2003) — *Generating sacrificial multi-piece molds using accessibility driven spatial partitioning*  
  DOI: `10.1016/S0010-4485(03)00008-3`
- Priyadarshi, Gupta (2004) — *Geometric algorithms for automated design of multi-piece permanent molds*  
  DOI: `10.1016/S0010-4485(03)00107-6`
- Martin Doñate, Rubio Paramio (2013) — *New methodology for demoldability analysis based on volume discretization algorithms*  
  DOI: `10.1016/j.cad.2012.08.005`
- Lin, Quang (2014) — *Automatic generation of mold-piece regions and parting curves for complex CAD models in multi-piece mold design*  
  DOI: `10.1016/j.cad.2014.06.014`
- Alderighi et al. (2022) — *State of the Art in Computational Mould Design*  
  DOI: `10.1111/cgf.14581`
- S.K. Gupta research overview — *Automated Design of Multi-Piece Molds for Making Geometrically Complex Objects*  
  https://sites.usc.edu/skgupta/automated-design-of-multi-piece-molds-for-making-geometrically-complex-objects/

---

# 32. Final Instruction to the Coding Agent

Treat this document as a product-corrective execution, not as a request to add another layer beside the current implementation.

First inspect the live repository at execution time. Reproduce the current Master Mold direct-entry limitation and the high-cost planning path. Then refactor the feature toward the architecture defined here while preserving the existing stable Create Cavity path.

Prefer deleting, replacing, or moving obsolete Master Mold code over leaving both the old committed-mold-parts pipeline and the new autonomous pipeline active in parallel.

Do not stop after implementing contracts or tests. The required final evidence is a real browser run where an imported model generates an intelligent Master Mold without Cut by Face, Segmentation, or Create Cavity, while the UI remains responsive and the generated tooling has verified physical release and assembly behavior.
