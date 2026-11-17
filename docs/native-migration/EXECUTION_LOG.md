# Native migration execution log

## Session 1 (2026-11-17), Windows 11, branch `feature/native-desktop-migration`

Worktree: `D:\CraftNative\worktrees\native-desktop-migration` (from `main` @ 98082a9).
The user's checkout at `C:\Projects\Mold-SaaS` was not modified. Nothing is committed yet.

### Environment (all heavy data on D:)

- Reused: Qt 6.8.3 msvc2022_64 (`D:\Qt`), CMake 4.4.3, Ninja and VS 2022 Build Tools
  (`D:\Craft 3D Requirement\toolchains`). Windows SDK 10.0.26100 is on C: (pre-existing).
- Added: Qt Quick 3D + Quick Timeline modules into `D:\Qt\6.8.3` (aqtinstall, additive),
  Python 3.13.17 (`D:\CraftNative\sdk\python-3.13.17`, venvs in `D:\CraftNative\python`),
  Node 22 (`D:\CraftNative\tools`), Manifold v3.5.1 source (`D:\CraftNative\deps\fetchcontent`).
- Session script: `scripts/native/windows-env.ps1`. Build tree: `D:\CraftNative\build\windows-debug`.

### Baseline (existing code, unmodified)

| Check | Result |
|---|---|
| Python `pytest` | PASS, 357 passed |
| `ruff check`, `ruff format --check` | PASS |
| Frontend `npm run typecheck` | PASS |
| Frontend `npm run test:run` | 1425 passed, 5 skipped; 1 suite FAILED to load: `scripts/checkBundleBudget.test.mjs` (parse error on the `#!` line under Windows; not investigated, not caused by this branch) |
| Frontend lint / build / Playwright | NOT RUN |

Logs: `D:\CraftNative\logs\baseline-*.log`.

### Implemented and verified (`ctest --preset windows-debug` from `native/`: 8/8 pass)

core (`tst_core` 26), STL (`tst_stl` 15), mold + Manifold (`tst_mold` 37), native-vs-TS/WASM equivalence on 12 recorded
cases (`tst_reference_equivalence` 17), Python bridge against real Python 3.13 (`tst_analysis_bridge` 14),
viewport adapter/camera (`tst_viewport`), controller workflow incl. import, mold, export, stale-result drop,
picking, real Python analysis (`tst_app_workflow`), and `app_smoke`: launches `Craft.exe`, imports
`native/tests/fixtures/models/bracket.stl`, generates a mold, grabs a rendered 1280x800 frame
(12053 non-background samples) and prints CRAFT_SMOKE_OK.

Gate status: Gate 0 met (docs exist; baseline recorded). Gate 1 met on Windows: `D:\CraftNative\build\windows-debug\Craft.exe`
(Qt Quick/QML, no WebEngine DLLs present); macOS NOT verified. Gate 2 PARTIAL (real viewport, picking and tests; no visual or
performance comparison). Gate 3 MET for zero-clearance molds. Gate 4 MET for import analysis only. Gates 5-7 NOT met.

Disk: C: free 125.8 GB (126.9 GB at start; the ~1 GB drop was not attributed, this work routes TEMP/caches to D:); D: build/tool footprint ~1.25 GB under D:\CraftNative plus Qt additions.

### Session 2: CPU pipeline benchmark (Release/RelWithDebInfo, 8 logical cores, 15.9 GB RAM)

`native/tests/bench_pipeline.cpp` (target `bench_pipeline`, not in CTest; run from `D:\CraftNative\build\windows-release`).
Generated spheres, Z=0 grounded, one mid-height Cut by Face split, zero clearance, stages timed on one thread:

| triangles | STL MiB | read+validate ms | ground ms | render buffers ms | feature-edge buffers ms | mold ms | bodies | peak RSS MiB |
|---|---|---|---|---|---|---|---|---|
| 2,208 | 0.1 | 0 | 0 | 0 | 1 | 19 | 2 | 13 |
| 25,280 | 1.2 | 3 | 0 | 1 | 16 | 197 | 2 | 29 |
| 128,880 | 6.1 | 15 | 1 | 5 | 107 | 1,034 | 2 | 103 |
| 488,600 | 23.3 | 56 | 5 | 18 | 448 | 4,174 | 2 | 362 |

Reading: import and buffer building stay under half a second even at ~490k triangles; the mold operation is the heavy
stage (about 4 s at 490k) and already runs on a worker thread, so the UI stays responsive.
NOT measured: GPU frame rate, VRAM, the equivalent timings of the TypeScript/WASM pipeline, and a visual comparison with
the Three.js viewport (needs a browser run). Spheres only; no real-world STL beyond the small bracket.
### Session 3: positive cavity clearance

Ported (`native/core/mold/CavityOffset.*`, `native/core/geometry/SignedDistance.*`, engine seam extended with `simplify`,
`minkowskiSphere`, `levelSet`): engine selector and complexity score, adaptive Minkowski policy (simplify above 50k triangles,
sphere segments 16/32/8/16), distance-field quality profile and grid budget, own BVH signed distance (closest point + 3-ray
parity vote, float32-quantized like three-mesh-bvh), Manifold level set, direct-to-distance-field fallback, cancellation.
The app has a cavity-clearance slider (0 to 5 mm, as in the reference) and shows the engine used.

Evidence: `tst_mold` 47 passed (selector rules, policy/profile numbers, SDF values, Minkowski volume vs analytic formula,
distance field on two cubes vs analytic, injected-failure fallback, cancellation, grid-budget refusal);
`tst_reference_equivalence` 24 passed: 7 new reference cases (4 direct Minkowski, 2 distance-field including a multi-body
split, 1 outer-breakthrough rejection) reproduce the TypeScript/WASM results including exact triangle and vertex counts and
volumes to 1e-9 relative. Full `ctest` 8/8. Corrected during this work: the reference reports an outer-breakthrough as
`cavity_boolean_failed` (plain Error), native now does the same.

Performance (Release, 1 mm clearance, one split, single thread):

| triangles | engine | mold ms | peak RSS MiB |
|---|---|---|---|
| 2,208 | direct Minkowski | 64 | 17 |
| 25,280 | direct Minkowski | 531 | 80 |
| 128,880 | distance field | 146,059 | 137 |
| 488,600 | distance field | 267,806 | 336 |

The distance field is the bottleneck (single-threaded SDF evaluation, see RISKS.md). No WASM timing for comparison.
High quality mode is implemented and unit-tested but not exposed in the UI. Parity check of the UI path: `tst_app_workflow`.

### Session 4: distance-field speed-up

Profile first: prefill of the sampling lattice was ~90% of the time and the closest-point query cost 55 us/point (inside test 3 us) because
points deep inside or far from the part had to scan almost every triangle. Changes (all keep the output identical):
1. Engine pre-evaluates the exact lattice Manifold samples, on all cores, into a dense cache (`LatticeCache` in `ManifoldMeshEngine.cpp`).
2. Inside test shortcuts: point outside the mesh bounding box is outside; the third ray is skipped when two agree; ray-hit buffer reused.
3. Banded signed distance (`SignedDistanceField::signedDistanceBanded`): closest-point search is capped at clearance + 4 lattice steps.

Result (Release, 1 mm clearance, 8 cores), mold stage total / offset stage:

| triangles | before | threads only | threads + banded |
|---|---|---|---|
| 128,880 | 146.1 s | 33.0 s | 8.6 s (offset 7.5 s) |
| 488,600 | 267.8 s | 62.6 s | 12.8 s (offset 10.3 s) |

After the change `ctest` is still 8/8 and `tst_reference_equivalence` is still 24/24 (identical triangle counts, volumes to 1e-9).
Not measured: WASM timing for the same inputs; on fewer cores the thread-level gain shrinks. `CRAFT_TRACE_LEVELSET=1` prints prefill/total time and cache hits.

### Session 5: sprue generation

Ported: profile design (`core/mold/SprueProfile.*`), tolerance policy, generation service and the sequential evaluation loop from
`evaluateDerivedMold` (`core/mold/SprueGeneration.*`), top-face placement from the preview ray, plus engine seam additions `cylinder`
and `unionOf`. App: Sprue tool (hover candidate, click to place), per-sprue status, main/neck diameter sliders, remove, move by
coordinates; intents persist across cavity regeneration; sprues are included in displayed and exported bodies.

Evidence: `tst_sprue` 18 passed (design arithmetic and limits, normalization, tolerance formulas, removed volume equals the 32-gon prism x
depth, determinism, input-validation codes, placement rules, split mold cuts only the body under the sprue);
`tst_reference_equivalence` 36 passed: 12 sprue cases generated by the real TypeScript `SprueGenerationService` match on design values
(exact), depth, target bodies, tolerance policy (exact), resulting volumes/bounds/triangle and vertex counts, funnel triangle counts and
every failure code and message (`SPRUE_DOES_NOT_REACH_CAVITY`, `SPRUE_INLET_OUTSIDE_BODY`, `SPRUE_NOT_ON_TOP_FACE`). `tst_app_workflow`
covers place, resize, regenerate-with-persisting-intent, export, remove and discard on re-import.

Not done: 3D funnel preview mesh in the viewport, drag-based resize/move, sprue undo/redo, the reference result cache.

### Session 6: registration

Ported `core/mold/Registration.*` (contracts, tolerance and sizing policies, interface detection, layout planner with the four-profile ladder and
both search orders, exact signed-distance wall-thickness filter, tongue/groove tool meshes, generation with protected-region collision
check and detached-fragment check, dependency snapshot and lifecycle) and `core/mold/DerivedMold.*` (sprues then registration, as
`evaluateDerivedMold`). The app always runs the derived stage after the cavity; bodies shown and exported are the registered bodies.

Evidence: `tst_registration` 15 passed; `tst_reference_equivalence` 36 passed with registration compared on every successful case
(30 of them: generated, `registration_interface_not_found`, `registration_insufficient_safe_area`): interface ids, feature ids, start/end/anchor
points, key geometry, attempts, tolerance policy, resulting body volumes/bounds/triangle and vertex counts, and registration-key face-run
triangle counts all match the TypeScript service; `tst_app_workflow` 13 passed (split bracket gets keys, whole block reports the warning,
sprue edits re-run the derived stage). Full `ctest` 10/10.

Defect found by the equivalence run and fixed: the tie-break key for equal-area interfaces mixed `a` and `b`.
Process note: two earlier doc edits (sprue and registration commits) blanked this file through a failed string edit; it was restored
from `00f220f` and the two session entries rewritten.

Not done: segmentation workflow (the sizing policy exists as data), manufacturing profile selection, per-interface 3D key preview, key editing.
### Session 7: segmentation

Ported `core/mold/Segmentation.*` (fit analysis, planner with the baseline Cartesian grid, objective scoring, axis ownership, extension
suggestion and merge, preliminary whole-block source, preflight with its unsupported/duplicate/coincident rejections, plane executor with
volume/overlap/manifold/printer-fit validation and provenance, commit gate, preview bodies, keyed registration with the automatic sizing
policy), `core/mold/SegmentationIdentity.*` (canonical JSON + FNV so ids equal the reference ids), the engine seam `splitByPlane`, and
`generateMold` support for segmented bodies (lineage, automatic clearance, no partition-coverage check, lineage sizing in the derived stage).
App: printer volume, Plan / extension cuts / Cut mold / Reset in the inspector; the cut pieces are keyed and shown, then Generate mold
subtracts the cavity from every piece and keys again.

Evidence: reference fixtures from the real TypeScript pipeline (`craftSegmentationReference.test.ts`: real stores for the source snapshot, planner,
extension merge, preflight, Manifold executor, committed registration) on 15 cases: not required, 2/3 sections on x, 2x2, 2x2x2, larger clearance,
invalid printer, hard/advisory protected regions, extensions (suggested, manual, outside body, hard-region avoidance, required axis), plus an
end-to-end case running the TypeScript cavity generation and lineage-keyed registration on the segmented bodies. `tst_segmentation_equivalence` passes
all 18 rows: source identity, request/plan/boundary/segment/candidate ids, plan scores and validation messages, executed bodies (ids, geometry
versions, volumes, bounds, triangle/vertex counts, provenance and boundary lineage), cut validations, registration keys, cavity bodies and keyed bodies.
`tst_segmentation` 18 passed; `tst_app_workflow` 14 passed; full `ctest` 12/12 (see below).

Not done: committed-mold protected-region merge, undo/redo, 3D extension-plane dragging, async preview registration, high-quality execution progress.
### Session 8: Master Mold foundation (first slice only)

Surveyed the module: about 660 KB of TypeScript, dominated by the working-mold constructor (79 KB), multi-piece planner (71 KB), engine (60 KB),
working-mold planner (52 KB) and tooling construction (38 KB). It is being ported bottom-up so every layer is checked against the real reference
before the next one is built on it.

Ported and verified in this slice: `core/master/MasterPlanning.*` with the seed snapshot (ids, Float32 world positions, staleness identity), mesh preflight
(position-welded topology), the planning mesh (full-resolution and clustered paths, adjacency order) and the candidate release directions (world, PCA via
Jacobi, normal clusters). Reference generator `craftMasterReference.test.ts` covers a rotated box, the bracket as a triangle soup, an open box, a box with a
duplicate face, and a 50,700-triangle cube grid that takes the clustered path. `tst_master_equivalence` passes all 5 cases plus 2 unit tests: seed ids,
world positions hash, preflight issues and messages, every patch and adjacency list, and every candidate direction.

Not done: the preflight self-intersection pass (D-022), surface regions, accessibility, the working-mold planner and constructor, the multi-piece planner,
pour face selection, tooling construction, release verification, the engine, the worker, the store and the UI. Master Mold is NOT usable in the app yet.
### Next exact step
1. GPU frame-rate/VRAM measurement, WASM timing for the same inputs, and a visual comparison with the Three.js viewport on real STLs (Phase 2 gate).
2. Port Master Mold (tooling set generation) and the engineering reports.
3. `.craft` project format with atomic save/load; bundled Python runtime; installer; macOS CI job on a real runner.
