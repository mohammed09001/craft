# Mold Generator SaaS — Official Engineering Terminology

This document is the single source of truth for engineering terminology across the entire **Mold Generator SaaS** repository (core Python engine, React/TypeScript frontend, geometry runtime, test suites, and technical documentation).

All contributors, subagents, and AI pair programmers must strictly adhere to the naming principles, domain definitions, and conventions specified here.

---

## 1. Naming Principles

1. **Domain-Driven, Not History-Driven**: Code elements are named according to what they represent in CAD tooling, mold engineering, and computational geometry — never by their historical development order (e.g. `Chapter 3`, `Stage 5`, `A3`, `K2`).
2. **Self-Explaining & Unambiguous**: Every identifier must be understandable to an experienced CAD software engineer without needing prior knowledge of the project's internal history.
3. **One Concept, One Name**: A single engineering concept has exactly one official name throughout the entire codebase. Do not mix synonyms (`Part` vs `Model` vs `Mesh`) unless they explicitly describe different spatial or topological abstractions.
4. **No Legacy Symbols in Active Code**: Symbolic codes (e.g. `A1`, `A2`, `A3`, `K1`, `K2`, `C1`–`C10`, `N1`–`N3`, `B4`, `V4`, `BN`, `VN`) are strictly prohibited in active production code.

---

## 2. Official Project Vocabulary

### Foundational Concepts

| Concept | Official Term | Precise Definition |
| :--- | :--- | :--- |
| **Workpiece / Component** | **`Part`** | The physical product component being molded (e.g. `PartBoundingBox`, `PartOrientationScore`). |
| **Polygonal Tessellation** | **`Mesh`** | A discrete surface mesh (vertices, triangle indices, face normals) without topological solid guarantees (e.g. `SourcePartMesh`, `TriangleMesh`). |
| **Closed Manifold Volume** | **`Solid`** | A closed, manifold, watertight 3D volume with valid enclosed volume (e.g. `WatertightPartSolid`, `PartSolidValidator`). |
| **Spatial / Coordinate Attributes** | **`Geometry`** | Mathematical spatial attributes (coordinates, bounds, matrix transforms) without topological solid guarantees. |
| **File / System Entity** | **`Model`** | High-level file or domain entity (e.g. `3D Model File`, `ModelImportPipeline`). |
| **Tooling Stock Blank** | **`MoldBlock`** | The rectangular stock block from which core and cavity plates are defined (e.g. `ReferenceMoldBlock`, `MoldBlockBounds`). |
| **Disconnected Topology** | **`Body`** | A distinct connected component in multi-body geometric analysis (e.g. `ConnectedBodyCount`). |
| **Raw Input Data** | **`Source`** | Unvalidated data as ingested from an input file prior to engine processing (e.g. `SourcePartMesh`, `SourcePartBoundingBox`). |
| **World Baseline** | **`Canonical`** | Standardized geometry in world coordinate space (Z-up, mm, centered) serving as the single truth baseline (e.g. `CanonicalPartGeometry`). |
| **Visual / Spatial Guide** | **`Reference`** | A user-defined visual or spatial constraint guide (e.g. `ReferenceMoldBlock`, `ReferenceSplitSketch`). |
| **Topological Guarantee** | **`Validated`** | Verified to satisfy boolean topological correctness criteria (watertight, manifold, finite). |
| **Engine Execution Phase** | **`PipelineStep`** | A sequential engineering computation phase in backend engine execution (replaces historical `Stage` numbers). |
| **User Interface / Runtime State**| **`UiState`** / **`State`** | The interactive state of user interface tools, viewports, or bridges (e.g. `ViewportCommandUiState`, `MeasurementToolState`). |
| **Session Export Snapshot** | **`Snapshot`** | An immutable, serializable point-in-time data record exported across system session boundaries (e.g. `DraftAnalysisBoundarySnapshot`). |
| **Executive Decision Metric** | **`Signals`** | High-level boolean or numerical indicators summarizing analysis findings for decision-making (e.g. `DraftAnalysisSummarySignals`). |

---

## 3. Legacy → Official Terminology Mapping

### Part & Solid Geometry

| Legacy Term | Official Engineering Term | Meaning / Description |
| :--- | :--- | :--- |
| `A1` | `sketchStartBoundaryPoint` | Start boundary point of a 2D reference sketch intersecting the mold block perimeter. |
| `A2` | `sketchEndBoundaryPoint` | End boundary point of a 2D reference sketch intersecting the mold block perimeter. |
| `A3` / `a3` | `sourcePartMesh` | Raw input 3D model mesh (positions, indices, matrix transform). |
| `CanonicalA3Geometry` | `CanonicalPartGeometry` | Standardized 3D part geometry representation in world coordinate space. |
| `PreparedA3Solid` | `WatertightPartSolid` | Validated, welded, manifold, watertight 3D part solid mesh in mold space. |
| `A3SolidValidationResult` | `PartSolidValidationResult` | Validation result container for part solid mesh audits. |
| `validateAndPrepareA3` | `validateAndPreparePartSolid` | Function for validating, welding, repairing, and orienting part solid geometry. |
| `setCanonicalA3` | `setCanonicalPartGeometry` | State action updating canonical part geometry. |
| `canonicalA3Signature` | `partGeometrySignature` | Unique hash signature tracking active part geometry. |
| `onCanonicalA3Change` | `onCanonicalPartGeometryChange` | Callback signature for part geometry changes. |

### Bounding Box & Mold Block Geometry

| Legacy Term | Official Engineering Term | Meaning / Description |
| :--- | :--- | :--- |
| `K1` / `k1` | `partBoundingBox` | Orthogonal 3D bounding box surrounding the target part model. |
| `K1FaceId` | `PartBoundingBoxFaceId` | Face ID (`px`, `nx`, `py`, `ny`, `pz`, `nz`) of the part bounding box. |
| `K1FacePlane` | `PartBoundingBoxFacePlane` | Plane definition corresponding to a part bounding box face. |
| `K1_FACE_IDS` | `PART_BOUNDING_BOX_FACE_IDS` | Constant array of the six part bounding box face IDs. |
| `cuttingPlaneK1` | `partBoundingBoxCutPlanes` | Sectioning planes derived from part bounding box faces. |
| `sourceK1Bounds` | `sourcePartBoundingBox` | Original bounding box of unscaled input part. |
| `K2` / `k2` | `referenceMoldBlock` | Outer block bounding box surrounding part with clearance distance. |
| `cuttingPlaneK2` | `referenceMoldBlockBounds` | Bounding box of the outer reference mold block. |
| `ReferenceMoldBlockK2` | `ReferenceMoldBlockGroup` | Three.js render group object for the reference mold block. |
| `ReferenceMoldBlockK2Surface` | `ReferenceMoldBlockSurface` | Visual surface mesh of the reference mold block. |
| `ReferenceMoldBlockK2Edges` | `ReferenceMoldBlockEdges` | Visual wireframe edge mesh of the reference mold block. |
| `NORMAL_K2_OPACITY` | `NORMAL_MOLD_BLOCK_OPACITY` | Opacity constant for rendering the translucent mold block. |
| `K2ShadeSlider` | `MoldBlockOpacitySlider` | UI slider for adjusting mold block rendering opacity. |
| `currentK2GroundZ` | `moldBlockBaseZ` | Z-coordinate offset of the bottom face of the mold block. |

### Draft Analysis & Boundary Signals

| Legacy Term | Official Engineering Term | Meaning / Description |
| :--- | :--- | :--- |
| `C10` / `chapter10Signals` | `draftAnalysisSummarySignals` | Summary flags from draft angle analysis (`algorithmCompleted`, `hasNegativeDraftFaces`, `demoldingRiskCount`). |
| `DraftAnalysisChapter10Signals` | `DraftAnalysisSummarySignals` | Interface type for draft analysis summary metrics. |
| `DraftAnalysisChapter10BoundarySnapshot` | `DraftAnalysisBoundarySnapshot` | Point-in-time snapshot of draft metrics exported across session boundaries. |
| `DraftAnalysisChapter10SessionBoundaryOptions` | `DraftAnalysisSessionBoundaryOptions` | Configuration options for building draft session snapshot. |
| `createChapter10Signals` | `createDraftAnalysisSummarySignals` | Factory function creating draft summary signals. |
| `createDraftAnalysisChapter10BoundarySnapshot` | `createDraftAnalysisBoundarySnapshot` | Factory function creating draft boundary snapshot. |

### Reference Sketch & Parting Line Stages

| Legacy Term | Official Engineering Term | Meaning / Description |
| :--- | :--- | :--- |
| `status: "ready_for_n2"` | `status: "ready_for_parting_line_generation"` | Status flag indicating sketch validation is complete and parting line generation can execute. |
| `StageN1` | `PartingLineSketchImportStep` | Pipeline step for sketch import. |
| `StageN2` | `PartingLineEvaluationStep` | Pipeline step evaluating parting line continuity and split feasibility. |
| `StageN3` | `PartingSurfaceGenerationStep` | Pipeline step constructing shutoff and parting surfaces. |

### Engine Architecture & Services

| Legacy Term | Official Engineering Term | Meaning / Description |
| :--- | :--- | :--- |
| `Chapter 2` / `chapter_2_status` | `ModelImportPipeline` / `modelImportStatus` | Engine pipeline for file parsing, model import, and initial geometry health scoring. |
| `Chapter 3` / `chapter_3_status` | `DraftAndPullAnalysisService` / `draftAndPullAnalysisStatus` | Engine service for draft angle calculation, pull axis evaluation, and orientation ranking. |
| `Chapter 4` / `chapter_4_status` | `CavityAndUndercutAnalysisService` / `cavityAndUndercutAnalysisStatus` | Engine service for cavity region partitioning, undercut trapping analysis, and core/cavity feasibility. |
| `Chapter 5` / `chapter5EngineBridge.ts` | `MoldGenerationEngineBridge` / `moldGenerationEngineBridge.ts` | Bridge connecting frontend state to core mold generation engine. |
| `Chapter5EngineCapability` | `MoldGenerationEngineCapability` | Capability payload type for mold generation engine. |
| `Chapter5ImportAnalysisCommandId` | `MoldGenerationCommandId` | Command ID enum for mold generation engine. |
| `Chapter5ImportAnalysisCommandInput` | `MoldGenerationCommandInput` | Command payload input type for mold generation commands. |
| `Chapter 9` / `Chapter9GenerationReadinessReport` | `MoldGenerationReadinessReport` | Report evaluating whether part geometry is suitable for core/cavity block generation. |
| `Chapter9CoreCavityReadiness` | `CoreCavityFeasibilityStatus` | Feasibility status for core/cavity block extraction. |
| `Chapter9DraftOrientationReadiness` | `DraftOrientationFeasibilityStatus` | Feasibility status for demolding draft angles. |
| `Chapter9PartingStrategyReadiness` | `PartingStrategyFeasibilityStatus` | Feasibility status for parting surface strategy. |
| `Chapter9PullDirectionReadiness` | `PullDirectionFeasibilityStatus` | Feasibility status for primary pull axis alignment. |
| `Chapter9UndercutIndicator` | `UndercutFeasibilityIndicator` | Indicator classifying undercut trapping risk. |

### Pipeline Execution Steps & UI States

| Legacy Term | Official Engineering Term | Meaning / Description |
| :--- | :--- | :--- |
| `stage` / `Stage` | `pipelineStep` / `AnalysisPipelineStep` | Sequential execution steps in engine processing. |
| `Stage 1` | `InitialModelReadinessStep` | Snapshot creation of unvalidated imported geometry. |
| `Stage 2` | `GeometryValidationStep` | Topological manifold and watertight auditing step. |
| `Stage 3` | `PartOrientationScoringStep` | Evaluation and ranking of candidate pull directions. |
| `Stage 4` | `CavityRegionPartitionStep` | Decomposition of mesh faces into core, cavity, and undercut regions. |
| `Stage 5` | `PullDirectionAnalysisStep` | Parting line and closure guard evaluation step. |
| `Stage 7` | `PullDirectionSelectionStep` | Interactive user selection of primary pull direction. |
| `Stage 8A` | `DraftSurfaceAnalysisStep` | Detailed surface face draft angle calculations. |
| `Stage 35` | `ViewportCameraControlStep` | Viewport viewcube and camera orientation step. |
| `EngineCommandUiPhase` | `ViewportCommandUiState` | Interactive state machine for viewport command UI (`inactive`, `awaiting-input`, `processing`, `completed`, `error`). |
| `EngineIntegrationPhase` | `EngineBridgeLifecycleState` | Operational state of the engine connection bridge. |
| `MeasurementPhase` | `MeasurementToolState` | Interactive state of 3D measurement tools (`inactive`, `awaiting-first-point`, `awaiting-second-point`, `showing-measurement`). |
| `ModelImportPhase` | `ModelImportLifecycleState` | Operational state of the model import pipeline. |
| `MoldEvaluationPhase` | `MoldEvaluationLifecycleState` | Operational state of the mold evaluation pipeline. |
| `ViewportPhase` | `ViewportRenderState` | Render execution state of the Three.js viewport. |

---

## 4. Compatibility Isolation Layer Guidelines

Where legacy symbolic terms appear in serialized payload contracts, persistent local storage, or worker messages:
1. **Network & Storage Boundary Isolation**: Convert legacy serialized fields at the adapter boundary (e.g. `generationReadiness.adapter.ts`).
2. **Internal Code Purity**: Production code, Zustand stores, React components, and Python domain models must use only the official engineering terms.
3. **No Symbolic Leakage**: Do not preserve symbolic prefixes/suffixes inside new identifiers (e.g. Avoid `A3PartMesh`, `K2Block`, `Stage5Step`).

---

## 5. Rules for Future Development

1. **Check This Document First**: Before defining new types, modules, or services, verify that your proposed names conform to the vocabulary tables above.
2. **No Historical Development Labels**: Never introduce names containing `StageN`, `ChapterN`, `PhaseN`, `A-N`, `K-N`, `C-N`, etc.
3. **Strict Unit & Axis Standards**: Internal units are millimeters (`mm`). Internal coordinate orientation is Z-up. Metric properties must include unit suffixes (`VolumeMm3`, `ClearanceMm`, `AreaMm2`).
