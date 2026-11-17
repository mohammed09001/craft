# Parity matrix

Status: PORTED = executable from the native UI with tests; PARTIAL; NOT PORTED. Reference paths are under `mold/frontend/src/features/`.

| Feature | Reference | Python | Native | Tests | Status |
|---|---|---|---|---|---|
| STL import (ASCII/binary), validation | viewport/runtime/localStlImport.ts, modelImportValidation.ts | io/importers/stl_reader.py | io/stl/Stl.cpp | tst_stl, tst_app_workflow | PORTED (size limit 512 MiB vs 25 MiB) |
| Grounding, adaptive grid | viewport/runtime/modelGrounding.ts, adaptiveGrid.ts | - | core/model/ModelGrounding | tst_core, equivalence | PORTED |
| Camera fit/reset, orbit/pan/zoom | viewport/runtime/viewPose.ts | - | core/view/ViewPose, viewport/ViewportCamera | tst_core, tst_viewport | PORTED (not pixel-compared) |
| Selection / measurement | runtime/modelSelection*, modelMeasurementRuntime.ts | - | RayPicking, AppController | tst_app_workflow | PARTIAL (point pick + 2-point distance; no face-region highlight) |
| Viewport rendering | runtime/createThreeViewportRuntime.ts | - | Qt Quick 3D | app_smoke renders a non-empty frame | PARTIAL (no visual diff against Three.js, no perf measurements) |
| Reference mold block | reference-mold-definition/referenceMoldBlock.geometry.ts | - | core/mold/ReferenceMold | tst_mold, equivalence | PORTED |
| Cut by Face partition | split-face/splitFace.geometry.ts, orthogonalMold.ts | - | core/mold/ReferenceMold | tst_mold, equivalence (12 cases) | PORTED (no face-removal/rebuild lifecycle, no drag UI beyond sliders) |
| Part-solid validation | cavity-generation/partSolid.validator.ts | - | core/mold/PartSolid | tst_mold, equivalence | PORTED |
| Cavity, zero clearance (Boolean) | cavity-generation/cavityBody.generator.ts | - | core/mold/CavityGeneration + Manifold | equivalence | PORTED |
| Cavity, positive clearance: engine selector, direct Minkowski, distance-field (SDF + level set), fallback | cavityEngine.selector.ts, manifold.engine.ts, cavityDistanceField.*, cavitySignedDistance.bvh.ts, cavityOffset.orchestrator.ts | - | core/mold/CavityOffset, core/geometry/SignedDistance | tst_mold, equivalence (7 cases), tst_app_workflow | PORTED, standard quality mode only exposed in the UI (high mode is implemented and unit-tested, not selectable); distance field 8.6 s at 129k triangles, see EXECUTION_LOG |
| Sprue, registration, segmentation, Master Mold, reports | sprue-generation, registration, segmentation, master-mold, engineering-reports | partially analysis | - | - | NOT PORTED |
| Import analysis | (none; contract only) | pipeline/import_analysis | analysis-bridge + inspector | tst_analysis_bridge, tst_app_workflow | PORTED (real Python run) |
| Other Python stages (moldability, cavity analysis, pull direction, readiness) | - | pipeline/* | - | - | NOT WIRED |
| STL export of mold bodies | - | - | io/stl writeBinary | tst_stl, tst_app_workflow | PORTED |
| Project save/load (.craft), autosave, 3MF | - | - | - | - | NOT PORTED |
