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
### Session 9: Master Mold surface regions and accessibility

Ported `core/master/MasterAccessibility.*` (region graph with seed-anchored growth, visibility-driven subdivision, per-direction accessibility with
three-offset probes and undercut grouping, region summaries, `pruneDirections`) and `TriangleIntersection.*` (three-mesh-bvh triangle test) and wired the
bounded self-intersection pass into the preflight, closing D-022. The generator gained a C-shaped extrusion and a tessellated C-assembly (overlapping boxes
with a partial lip): the assembly yields 18 refined regions from 16, unresolved regions, and the reference's self_intersection issue. `tst_master_equivalence`
passes 11/11 rows. A first fixture had inverted winding (all patches blocked); that was caught by inspecting fixture statistics, not by the test.

Still not ported: region set cover, working-mold planner/constructor, multi-piece planner, pour face, tooling construction, release verification, engine, worker,
store, UI.
### Session 10: Master Mold region set cover and working-mold planner

Ported `core/master/MasterWorkingMoldPlanner.*`: greedy region cover, exact and multi-candidate parting thresholds, region-owned piece ownership, the
diversity-aware prism beam, finalization with sliding-wall / seam / imbalance scoring, parting-interface curve ordering and simplification, the incremental
piece-count search with its diagnostics and rejection reasons, and the single-shot plan. The generator now records, per case, thresholds, cover steps, every
search step (diagnostics + finalists with assignments and interfaces) and the plan summary, on the engine's pruned (keep 32) direction set.
`tst_master_equivalence` passes 18/18 rows across 7 cases: five cases find finalists from 2 pieces up, the C-assembly is rejected at every count with the
reference's long reasons (inaccessible patches, unresolved regions), and the 150-patch clustered cube takes the same beam. 

Not done: adaptive direction discovery (the engine runs it between pruning and planning), the working-mold constructor (Manifold booleans over real
geometry), multi-piece planner, pour face, tooling construction, release verification, engine, worker, store, UI.
### Session 11: Master Mold adaptive discovery and the planar working-mold constructor

Ported adaptive direction discovery (region-derived candidates, bounded rounds, near-duplicate rejection); the C-assembly now triggers one real round that adds a
direction. Added `translate` to the kernel seam and ported the PLANAR constructor: half-space prisms, ordered carving, connected-component split, clearance
offset, pin placement with release re-verification and rollback, exact translation sweeps (32 coarse samples, 12 refinement steps), greedy-order option, assembly
invariants and piece targets. The generator runs the real TypeScript `constructWorkingMold` the way the engine does (finalists in order, per count, first success
wins) and records every attempt and its error text. `tst_master_equivalence` now has 31 rows; Debug: 30 passed + 1 skipped; Release: the 11 construction rows all
pass including the 50,700-triangle part (D-028).

Findings worth remembering: (1) the first native run failed only on error wording ("Not manifold" from the WASM kernel, D-027); (2) a first native run of the heavy
row looked like a crash (exit 0xC0000409) but was Qt's 300 s watchdog, not a defect; it is a Debug-kernel speed issue; (3) none of the original fixtures placed pins
(parts too large for the 0.3-span inset to clear the footprint), so two tiny parts were added to exercise pin placement.

Not done: the constructor's fallback modes (height-field, multi-neighbor, simultaneous grid, volumetric, multi-label) and region-direct assignment/construction
that feed them; multi-piece planner; pour face; tooling construction; release verification of tooling; engine; worker; store; UI.
### Session 12: Master Mold engine orchestration, pour face and one-piece tooling

Extracted the three.js-faithful ray BVH into a shared `RayBvh` (crossing counts for pour-face pockets, surface accessibility and vent proofs), ported pour face
(candidate directions, planar exposure, sealed air pockets with 26-connected grouping, scoring), surface accessibility, vent path proofs, `constructCasePiece`
(one piece), the exact release sweep and assembled-negative check, and the whole engine: preflight, planning, pruning, adaptive discovery, piece-count search,
planar construction, per-piece tooling, budgets and budget details, debug snapshot, structured failures with their exact text, sacrificial outcome and prior-set
reuse. The generator now runs the real `runMasterMoldEngine` on every case (cube-grid-large takes 128 s in the TS reference).

`tst_master_equivalence`: 40 rows. Release: 40 passed, 0 skipped. Debug: 38 passed, 2 skipped (the two cube-grid-large rows, D-028). Full Debug ctest: see below.

Findings: (1) piece vertex positions are bit-identical natively and in the reference on all 9 cases; two pin-bearing pieces triangulate differently (D-029), found by
hashing meshes rather than by loosening a tolerance first. (2) The heavy row's attempt count differed (3 vs 5) only because the reference retries each failed
finalist with height-field tools; the native engine now flags that instead of pretending (D-031). (3) c-extrusion's second working-mold piece needs the multi-piece
planner in the reference; native flags it and still matches pour face, accessibility and plan for it.

Not done: multi-piece planner (recursive split, localized removable core, lock evidence), tooling registration pins, planar split case pieces, the engine's
height-field / region-direct / multi-label construction fallbacks (and the constructor modes behind them), the worker, the store and the UI.
### Session 13: Master Mold multi-piece planner

Enabled Manifold CrossSection and extended the kernel seam (`rotate`, `sphere`, `sliceOverlapArea`). Ported full `constructCasePiece` (split half-spaces, oblique splits, core modes,
vents), tooling registration pins, `deriveLockRegions`, the localized removable core, and the whole recursive planar planner (candidate splits from target/tool feature
levels, build-volume cuts and oblique normal clusters; chunk decomposition and bisection; AABB-pruned greedy release sequencing; assembled-negative proof; exact
interface contact area; multi-panel keys with corridor and release re-verification; cost). The engine now runs the real one-piece -> localized core -> multi-piece
cascade including the build-volume path. The reference generator gained kernel-built hard parts (grooved sphere, cross-drilled cube, dumbbell, torus) and records
parting surfaces, registration features and pull vectors.

Result: `tst_master_equivalence` Release 56 passed / 0 failed (13 engine cases incl. 2-piece pinned, 3-piece and 4-piece tooling sets); Debug passes with the heavy rows
skipped (D-034). Full Debug ctest 13/13.

Finding: native plans for the dumbbell first disagreed with the reference. Sweep tables matched to 15 digits, so the kernel was not the cause. Tracing showed native
building pieces in the full-negative core mode that the reference never could; reproducing the reference with the same inputs showed `Manifold instance already deleted`:
a double-delete defect in the reference core modes (D-032). Native reproduces the observable behaviour behind a named switch.

Not done: the constructor fallback modes (height-field / multi-neighbor / simultaneous grid / volumetric / multi-label) and region-direct assignment that feed them,
the worker, the store and the UI.
### Session 14: Master Mold worker, store and UI

Core (`core/master/MasterMoldStore.*`, Qt-free): the store state machine as a two-phase generate (begin/commit/fail), the engine-result mapping the reference worker applies,
the shared UI-state derivation, summaries, overall status and renderable-body selection with composite (set, piece) keys. App (`app/AppControllerMaster.cpp`): the seed from the
grounded part, the generation job with progress stages, a 180 s timeout and cooperative cancel, staleness on printer-volume change, reset on model change, scene display
(stale pieces gray), per-piece visibility and isolate, the panel model (banner, summary lines, sets, scope notice) and the QML "Master Mold" group in the inspector.

Evidence: `tst_master_store` 17 passed (hand-derived from the TS store: reuse, supersede, reset race, stale idempotence, commit-time identity mismatch, composite visibility keys,
UI-state kinds); the TS `evaluate` + contracts + viewport adapter were run on 12 cases and the native mapping/derivations match (status, failure family, summary, ui state,
renderable ids and visibility, stale path); `tst_app_workflow` adds generation -> display -> visibility -> reuse -> printer-change stale -> regenerate -> reset, cancellation -> error
status, and the no-model refusal. Full Debug ctest 14/14.

Not done: tooling-piece export, Master toolbar entry, alpha ghosting for stale pieces, the constructor fallback modes, region-direct assignment.
### Next exact step
1. GPU frame-rate/VRAM measurement, WASM timing for the same inputs, and a visual comparison with the Three.js viewport on real STLs (Phase 2 gate).
2. Port Master Mold (tooling set generation) and the engineering reports.
3. `.craft` project format with atomic save/load; bundled Python runtime; installer; macOS CI job on a real runner.
### Session 15: Master Mold construction fallbacks

Ported: height-field and multi-neighbor parting tools (ruled surface via the new `extrudePolygon`/`transform` seam), the simultaneous grid partition (local-bounded assignment, stolen-material exclusions), region-direct assignment with small-component absorption and physical pieces, the multi-label partition (ICM relaxation, escape corridors, cavity vote, per-label level set), and the engine cascade with the reference bookkeeping and messages.

Evidence: fixtures gained `sphere-three-through-holes` and `tripod` (planar search fails, set cover complete) plus a `fallbackModes` section per part (region-direct builders, grid/multi-label construction, height-field retry). Release `fallbackModesMatchReference` 12/12; cross-blind-holes and torus engine rows now match attempt counts and failure text exactly. Reference generator timeout raised to 60 min (the fixture run takes ~22 min).

Debug: `fallbackModesMatchReference` took 3346 s (multi-label voxel stage), so it is Release-only (QSKIP in Debug); the other Debug rows stay under the 300 s ctest limit (construction 114 s, planner 30 s). Release full suite: 75 passed, 0 failed.

Not verified: the reference multi-label construction fails on every fixture, so only its failure path is compared. Volumetric mode not ported (engine never reaches it).
### Next exact step (superseded list above still applies)
### Session 16: Engineering reports

Ported (`core/reports/*`, Qt-free, library `craft_reports`): the report contract with a strict boundary validator, the registry and manifest (validation messages and ordering exactly as the reference), the pull-direction report contract, mock/session reports, MVP completion layer, the candidate foundation pipeline, the evaluation layer (scoring profile, decisions, summary, report section, snapshot, snapshot validation, presentation, view model) and the context-panel card model. A `localeCompare` approximation (D-043) was needed to reproduce tie ordering.

Wired a real analysis: the worker gained `moldability_analysis` (the existing Python detailed mold analysis, returned as an `engineering_report`), the client gained a per-job timeout, and the app gained `engineeringReports` state, an Inspector section and cancellation/stale-result handling.

Evidence: `tst_reports_equivalence` 71 rows against `reports-reference.json` written by the real TS code (generator `craftReportsReference.test.ts`, regenerated alone with `generate-reference-fixtures.ps1 -Only reports`), including 16 card rows rendered from the real React component; `tst_analysis_bridge` 16 (2 new, real Python); `tst_app_workflow` 4 new end-to-end tests; full Debug ctest 15/15.

Findings: the reference pull-direction "engine" never inspects geometry and its completed report is hard-coded sample data (D-040); the Python analysis took 561 s for a 10,800-face box and 52 MB of JSON before per-face lists were omitted (R-Reports-1, D-041); the reference card shows "Review" for a 42% candidate because its validation state is "warning" (matches the reference rule, the completion layer alone says Poor).

Not done in this session (cavity analysis and generation readiness were wired in Session 17): no native reimplementation of the analysis; the Inspector layout was not inspected on screen (R-Reports-3).

### Session 17: Cavity analysis and generation readiness

Ported/wired: the `moldability_analysis` worker command now also runs the Python cavity analysis and generation readiness (D-044); the generation-readiness adapter and contracts are ported natively (`core/reports/GenerationReadiness`, D-045); the app shows "Cavity analysis" and "Generation readiness" in the Inspector. There is no TypeScript algorithm for cavity analysis, so it is Python-engine-only like the moldability stage.

Evidence: `readiness-python-samples.json` (real Python reports from `make_readiness_samples.py`) + 35 synthetic cases run through the real TS adapter (`craftReadinessReference.test.ts`) -> `readiness-reference.json`; `tst_reports_equivalence` 120 passed (49 new); `tst_analysis_bridge` 16; `tst_app_workflow` assertions extended; new `py_worker_stage_failures` (3, forced stage failures); full Debug ctest 16/16.

Findings: every real report comes out blocked through the adapter (R-Reports-4); the cavity detector disclaims its own negative results (R-Reports-5); the Python engine's per-stage cost is dominated by the detailed stage, not by cavity/readiness.

Not done: nothing consumes the readiness snapshot for generation; the Inspector layout was not inspected on screen; the Python analysis performance limit (R-Reports-1) is unchanged.