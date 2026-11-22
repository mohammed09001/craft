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

### Session 18: Project save/load

New feature (no reference to port): the `.craft` project format and its application support. Spec: PROJECT_FORMAT.md; decisions D-046..D-050; risks R-Project-1..5.

Built: `core/project` (document model, validation, inputs fingerprint), `io/project` (container, manifest JSON, integrity, atomic save with one backup, version policy, migration chain, linked-model verification), in-memory binary STL encoder, camera pose restore, `app/AppControllerProject.cpp` (capture, async save/open, restore of mold/sprue/segmentation/view inputs and regeneration, dirty tracking, autosave, recovery), File menu and dialogs (open/save/save as, recovery, relink, unsaved-changes guard on open, import and window close).

Evidence: `tst_project` 26 (round trips with exact doubles, unicode paths, a 48 MiB project in about 2 s, backup rules, refused invalid saves, truncation at many lengths, bit flips across the whole file, newer major/minor, migrations ordered/failing, linked model missing/changed/relinked); `tst_app_workflow` +9 against the real controller and kernel (round trip rebuilds identical mold volumes and re-resolves the sprue, dirty tracking, autosave and recovery, clean exit, damaged file, relink, segmentation restore, backup); full Debug ctest 17/17; the real executable runs with zero QML warnings.

Found along the way: a QML binding on a hidden group read `moldSummary.registration.keyed` while empty (a warning on every start); guarded.

Not done: the app never writes linked projects; no real migration exists; recovery was not tested with an OS-level kill; the File menu was not clicked through on screen.
### Session 19: Bundled Python runtime and Windows package

Built: `native/cmake/CraftPackaging.cmake` (install rules, CPack ZIP), `scripts/native/prepare-python-runtime.ps1` (pinned download, hash check, `_pth`), `build-package.ps1`, `verify-install.ps1`, the `windows-package` preset, `native/packaging/{pins.json,THIRD_PARTY_NOTICES.txt}`, PACKAGING.md. Decisions D-051..D-055; risks R-License-1, R-Packaging-1, R-Packaging-2. The app can report `analysisWorkerInfo` and a moldability run in its smoke mode.

Evidence: the installed layout (132.5 MB, 1585 files) and the freshly unzipped 70.9 MB ZIP both pass every check of `verify-install.ps1` (layout, 130-binary dependency closure, a full run from a hostile environment that imports, generates, analyses and renders using the interpreter and worker inside the install folder, install folder unchanged). Mutation tests prove the verifier is sensitive: removing `python/` fails five checks and the app now reports `analysis_runtime_missing`.

Found along the way: the first package silently fell back to the baked-in development interpreter when the bundled runtime was missing (D-053); fixed and covered by a binary check. Verifier bugs fixed: path-separator comparison and UTF-8 summary decoding.

Not done: the installer (WiX could not be fetched, D-055), code signing, an update mechanism, CI, macOS, the Qt/Craft licensing decision (R-License-1), a test on a machine that never had a development toolchain.

### Session 20: Master tooling piece export

New feature (the reference has no tooling export): `io/tooling/MasterToolingExport` (plan + writer), the `exportMasterTooling` controller job on a worker thread, `masterMold.canExport/exporting/lastExport` for the panel, an "Export Master tooling…" button and File-menu item, and a shared `stl::encodeBinary(MeshPayload)` so the bytes that are hashed are the bytes that are written. Decisions D-056..D-059; risks R-Export-1..3; spec in MASTER_TOOLING_EXPORT.md.

Evidence: `tst_master_export` 14 cases; `tst_app_workflow` generates a real Master Mold on the bracket, exports it, and checks the files against the store's pieces (triangle counts, SHA-256, manifest) and the stale/empty refusals. Mutation tests: removing the no-overwrite rule, exporting stale sets, and truncating a written file are each caught. Full Debug ctest after the change: 18/18 passed (17 before plus tst_master_export).

Not done: on-screen check of the dialog and panel; 3MF (still only if justified); print orientation (D-059); macOS.


### Session 21: Selection highlight, selection box and box-face picking

Finding first: the reference has no highlight of a patch on the part's surface. Its "face selection" is the six faces of the part's selection box (hover overlay, click toggles Cut by Face planes) plus a whole-model highlight colour (D-060). That is what was ported.

Built: `core/view/SelectionBox` (face quads, picking with Three.js triangle rules, box edges and cumulative dashes, linear-space highlight rule, constants), `app/AppControllerSelection.cpp` (pick/hover/clear, overlay geometry, `selectionBox`/`selectionStyle` for QML), the scene model's `itemSelected` role, viewport overlays and highlight in `ViewportView.qml`, Escape to clear, hover throttled in QML, geometry builders for segment lists and quads, smoke-mode `--select-part`/`--screenshot`/`--theme`. Decisions D-060..D-062; risks R-Selection-1..3.

Evidence: the real reference (Three.js, via `craftSelectionReference.test.ts` and `generate-reference-fixtures.ps1 -Only selection`) is replayed by `tst_selection_equivalence` (13 cases, 188 rays); the equivalence test found that Three.js's dash distance accumulates across edges and that its light/dark rule works in linear space (both fixed). `tst_app_workflow` (5 new cases) and `tst_viewport` (2). Mutation tests: farthest-face-wins, sRGB-space lightness, no face toggling, box visible with a complete mold are each caught. Rendered frames in both themes were inspected. Full Debug ctest after the change: 19/19 passed (18 before plus tst_selection_equivalence), including app_smoke, which loads the changed QML.

Not done: pixel comparison with the Three.js viewport, hover timing on very large models, the Escape/typing interaction, face-region highlight in the Master Mold or Segmentation panels (the reference has none).


### Session 22: Sprue 3D funnel preview

Ported from `spruePreview3dRuntime.ts`: the preview solids (funnel, main stem, entry neck), their colours and finish, the glass look of the mold while the Sprue tool is active, and when the preview hides. The placement logic (`computeSpruePlacement`) already existed; nothing drew it. Decisions D-063, D-064; risks R-SpruePreview-1, R-SpruePreview-2.

Built: `core/mold/SpruePreview` (Three.js CylinderGeometry and transform math, constants), the scene model's glass edge outlines, `AppController` (`spruePreviewGeometry`, `sprueGlass`, `sprueStyle`, `clearSprueCandidate`, throttled preview), `viewport::buildSmoothSurfaceBuffers`, QML (preview model, glass opacity and outline, 16 ms throttle, hide on leave/drag), smoke options `--sprue-preview`/`--sprue-invalid`, generator `-Only spruepreview`.

Evidence: `craftSpruePreviewReference.test.ts` drives the real runtime (Three.js under jsdom) on 4 scenes x 12 rays (valid, invalid, rejected, oblique, side, below; default and large derived profiles) and `tst_sprue_preview_equivalence` matches every placement and every vertex, normal and index of the three solids to 1e-9, plus the presentation constants and glass edges; it fixed my misremembered torso winding. Workflow tests (2) and a viewport builder test. Mutation tests: wrong funnel radius, swapped colours, unclamped neck, glass outside the Sprue tool, preview kept after placing. Rendered frames (green/dark, red/light) inspected. Full Debug ctest after the change: 20/20 passed (19 before plus tst_sprue_preview_equivalence), including app_smoke, which loads the changed QML.

Not done: pixel comparison, timing on very large molds, drag-resize/drag-move gizmos, undo/redo, result caching (the rest of the sprue checklist).

### Session 23: Sprue resize gizmo

Finding first: the reference has no drag-move gizmo (D-065). What exists in the viewport is the resize gizmo, and that is what was ported (D-066, D-067; risks R-SprueGizmo-1..3).

Built: `core/mold/SprueGizmo` (presentation precedence, handle construction and orientation, Three.js torus, front-face picking, drag arithmetic with snapping and limits, label, colours), `core/view/Rotation` (shared with the preview), `SprueHandleModel`, `AppControllerSprueGizmo.cpp` (hover/press/drag/release/cancel, numeric editor, hidden bodies, cursors), an overlay View3D, label and editor in `ViewportView.qml`, Escape handling, smoke options `--sprue-gizmo` and `--sprue-gizmo-events`, generator `-Only sprueresize`.

Evidence: `craftSprueResizeReference.test.ts` drives the real `createSprueResizeRuntime` with real DOM pointer events (handles, 182 pointer probes, 13 drags incl. Escape, 8 numeric inputs, hover hiding bodies, deactivation, and the real presentation selector); `tst_sprue_gizmo_equivalence` matches all of it. The real-event smoke test `app_smoke_sprue_gizmo` sends platform mouse events through the QML and found a real bug (the click part of a double click on a ring placed another sprue and closed the editor), now fixed. Mutation tests: 7 core/controller breaks and 3 QML-routing breaks are each caught. Rendered frames inspected. Full Debug ctest after the change: 22/22 passed (20 before plus tst_sprue_gizmo_equivalence and app_smoke_sprue_gizmo), including app_smoke, which loads the changed QML.

Not done: pixel comparison, the editor popup's on-screen look and keyboard behaviour, sprue undo/redo, result caching, and the macOS build.
### Session 24: Cut by Face plane slabs and the Eraser (removal lifecycle)

Finding first: the reference's removal lifecycle is the Eraser tool over planes drawn as slabs, calling removeSplitFaceAndRebuild; selectSplitFace and removeSelectedSplitFaceAndRebuild have no UI caller and were left alone; native has no separate parts-ready stage (D-068). Decisions D-068..D-070; risks R-CutPlane-1..3.

Built: `core/mold/CuttingPlaneSlabs` (slab geometry, the reference colours/opacities, double-sided picking) and `core/geometry/ThreeRayTriangle` (one Three.js ray-triangle rule now shared by the selection box, the sprue rings and the slabs, replacing two private copies), `CutPlaneModel`, `AppControllerCutPlanes.cpp` (slab rows, eraser hover/click, removal with the reference's guards, tool availability and fallback), slabs in `ViewportView.qml`, an Eraser toolbar button and cursor, smoke options `--eraser` and `--eraser-events`, generator `-Only cutplane`.

Evidence: `craftCutPlaneReference.test.ts` drives the real `createCuttingPlane3dRuntime` with real DOM pointer events and the real split-face store (10 removal scenarios incl. the generating guard and rebuild body counts 4 to 2 and 8 to 4); `tst_cutplane_equivalence` matches the slabs, 51 hover/erase probes and the partitions; `tst_app_workflow` replays the store scenarios on the controller; `app_smoke_eraser` sends real platform mouse events through the QML. Mutation tests: 8 breaks (slab thickness, block vs part extent, farthest pick, erase colour, removal while generating, kept position, planes on a complete mold, click not erasing, also through real events) are each caught. Rendered frame inspected. Full Debug ctest after the change: 24/24 passed (22 before plus tst_cutplane_equivalence and app_smoke_eraser), including both real-event smoke tests.

Not done: undo/redo for removals, an automatic parts-ready stage after removal, the right-button plane drag, pixel comparison, and the macOS build.
### Session 25: undo / redo

Finding first: the reference has one undo/redo, over the split-face store, with two toolbar buttons and no keyboard shortcuts. The segmentation store's and the sprue application's own undo have no UI caller, so they were not ported.

Built: `app/AppControllerHistory.cpp` (snapshot capture and restore, 50-entry stacks, gestures, canUndo/canRedo, the `history` property), `app/Held.h` (shared immutable result holder replacing the three optional results), push hooks in the cut-face, clearance, sprue, Eraser and mold-generation paths, fresh history on a new model / project open / segmentation adopt or reset, toolbar buttons, an Edit menu with Ctrl+Z / Ctrl+Y, and slider gestures in the Inspector.

Evidence: `craftUndoReference.test.ts` drives the real store through 5 sequences and a derived-results scenario; `tst_app_workflow` replays every step (planes, positions, clearance, undo and redo depth, the 50 cap) and has tests for restoring the generated mold (same result object, no job run), sprue bursts and their evaluation, cancelling a running generation, slider gestures and the project becoming clean again; `app_smoke_undo` clicks the real buttons and sends real Ctrl+Z / Ctrl+Y. Mutations (shortcut removed, redo not cleared, cap 51, mold not restored, gesture not coalesced) each fail a test; dropping the cancel call does not (R-Undo-4). Debug ctest: 25/25 pass.

Not done: body-visibility history, a measurement of snapshot memory, a pixel check of the toolbar, and the macOS build.
### Session 26: end-to-end project test (Gate 6)

Finding first: the first run of the end-to-end journey failed. After save and reopen the mold had the same geometry and volumes, but every exported STL had a different operation id in its header. Cause: the mold ids embed the imported file's size, and a project embeds the model as binary STL (451,284 bytes) while the imported ASCII file was 2,831,624 bytes. Fixed by recording the imported size in the project (`sourceSizeBytes`, D-075); the exports are now byte-identical across save and reopen.

Built: `endToEndProjectJourney` in `tst_app_workflow` (import the sphere, design with a cut face, clearances and a sprue, generate, export, save, reopen in a fresh session, export again and compare every byte, edit the cut plane, regenerate, save in place, reopen a third time and compare again), a round-trip test for the new field in `tst_project`.

Evidence: exports are checked for well-formed binary STL; the edit is shown to change the triangles; a reopened project starts with an empty history and is clean. Mutations: reopening without the stored size fails the journey; not writing the field fails the project test. Debug ctest: 25/25 pass.

Not done: the journey covers one part and one design (R-E2E-1); exported files were not opened in a slicer or compared with the reference app's files (R-E2E-2); the Master Mold, segmentation and the analysis worker are not part of it.
### Session 27: viewport pixel and performance comparison

Finding first: the reference's first view and native's differed by about 15 degrees. The reference fits a new model from the current view direction; native reset it. Fixed (D-077) with a regression test; mask overlap rose from 0.82 to 0.89, and to 0.97 to 0.997 once the mask excluded grid lines and labels.

Built: `native/tools/ImageCompare.*` and `craft_imgcompare` (mask, opening, largest region, boundary distance, SSIM; 7 mutations all caught by `tst_imagecompare` after two gaps were closed), `native/app/ViewportBench.*` (`craft --viewport-bench`: viewport sized exactly, frames with and without the part, import timing, orbit cadence from real swap times, process memory, the D3D11 adapter; test builds only), `scripts/native/viewport/captureReference.mjs` (the real production reference in installed Chrome through Playwright, GPU readback for honest timing), `makeModels.mjs` (82k, 405k and 1.3M-triangle models), `process-memory.ps1` (working set, private bytes and per-process GPU memory), and `scripts/native/compare-viewport.ps1` (the runner and report tables, with -NoVsync and -Recompare).

Evidence: 6 scenes x 3 runs x 2 modes, in `VIEWPORT_COMPARISON.md`. Part framing agrees within 1.4 px; colour and lighting do not (R-Viewport-1). At 75 Hz both hold full rate to 405k triangles; uncapped native costs about 5.5 ms per frame regardless of the part and the reference crosses it between 82k and 405k triangles; native imports 2 to 4.4 times faster and uses about a third of the memory; native loads a 62.5 MiB, 1.3M-triangle file the reference refuses. A first version of the reference timing read 1,800 fps for the 405k part because WebGL is asynchronous; it was replaced by a GPU readback. Debug ctest: 26/26 pass in the full run (before the camera regression test was added). The workflow, viewport, image-compare and smoke tests were then run again with it: tst_app_workflow, tst_viewport, tst_imagecompare and the smoke tests passed, and app_smoke_eraser failed once (hover did not highlight the plane) and then passed 6 of 6 alone and 4 of 4 times in the smoke group (R-Smoke-1).

Not done: palette and lighting alignment, automatic part orientation, profiling the native fixed per-frame cost, other hardware or refresh rates, the 512 MiB ceiling, and macOS.

### Session 28: the viewport takes the reference's look

Finding first: the first comparison showed native with another palette, headlight lighting and no tone mapping. Read the reference's own modules and measured its frames: the page backgrounds are `#0b1118` and `#f7f9fb`; the part colour, mold colour and lighting do not change with the theme in the running application (D-081); feature edges exist on mold bodies only; the reference's grid colours are not what its palette says.

Built: `core/view/ViewportLook` (plain data with source references), a generated reference fixture (`craftLookReference.test.ts`: the real lighting rig in both theme variants, CAD themes, materials, grid opacities, edge style, and at which bend angles an edge appears) and `tst_viewport_look` (6 mutations caught); `AppController::viewLook` and the QML: world-fixed key/fill/rim lights with a sky light and an ambient term, ACES tone mapping, a rectangle background under a transparent 3D view (Qt tone maps its clear colour), the reference's grid and edge style, the part no longer outlined, mold bodies one red; the bench picks the fastest display (D-083). Stale background expectations in two tests updated to the reference's real values.

Evidence: whole-frame colour difference 0.053 to 0.067 down to 0.004 to 0.007, whole-frame similarity 0.78 to 0.89 up to 0.91 to 0.97, colour difference inside the part 0.117 to 0.174 down to 0.025 to 0.031, mask overlap 0.977 to 0.999, backgrounds identical to the byte. Side effects measured: import four to five times faster (no edge geometry for the part: torus 458 ms to 98 ms), uncapped frame cost 5.5 ms down to 4.4 ms. Two benchmark traps found and fixed on the way: the window opening on a 60 Hz monitor (61 fps against 74.7), and one scene with two disturbed runs, rechecked clean (R-Viewport-9). Debug ctest: 27/27 pass in the final full run. An earlier full run of this work had app_smoke_eraser fail (its second failure, R-Smoke-1); the test was then hardened and the smoke group passed 5 of 5 and the full run passed.

Not done: the ground-plane ruler (yellow labels and ticks) and the hint badge, shadows, identical shading (R-Viewport-7), the other part roles' colours compared with the reference, a per-body colour cue for molds (R-Viewport-8), other hardware, and macOS.

### Session 29: the ground-plane ruler and the hint badge

Finding first: reading the reference's ruler also showed that the first look alignment had the engineering grid's colours wrong (a dim white major grid for the dark theme, a grey minor grid for the light one): the real grid is white at 0.32 (minor, both themes) and the palette's rgb() at 0.50 (major). Corrected and pinned by a fixture (D-085).

Built: a reference fixture generated by running the real ruler modules (label step with hysteresis for 180 input combinations, layout, label text, projection, and the real runtime's geometry and rebuild moments through zoom sequences in two palettes and two grids), `core/view/GroundPlaneRuler` and `tst_ground_ruler` (10 tests; 6 mutations caught), the controller wiring (follows the camera and the viewport size, rebuilds on the next event-loop turn after a grid change), line geometry and label quads in the viewport, label images as cached PNGs, the Axes option now showing the ruler, the coloured X/Y/Z axes removed, the interaction hint badge with two real-input smoke tests (press, wheel; 3 mutations caught), and 4 workflow tests (the ruler follows the camera and rebuilds only on step changes exactly as an independent ruler does; it is built at the fitted zoom, a case the 30 mm box exposes and the bracket does not; the labels; the look's colours; 1 more mutation caught).

Evidence: whole-frame colour difference and similarity improved again (empty-frame difference 0.0063 to 0.0048 dark and 0.0052 to 0.0029 light; whole-frame SSIM 0.916 to 0.921 on the box). Two things that cost time: Qt Quick 3D neither sampled a custom texture-data object nor loaded `image://` URLs for textures (labels render as solid rectangles), so labels use cached PNG files; and building the ruler before the camera fit left labels twice too large on the box, which only the box (not the bracket) shows. Debug ctest: the full run had 29 of 30 passing; tst_viewport_look failed on a stale assertion of mine (it still said the minor grid colour differs between themes), which is fixed; tst_viewport_look and tst_ground_ruler passed afterwards, but the whole suite was not rerun after that fix.

Not done: the timing and memory tables were not re-measured with the ruler (a full run was stopped by the system after three scenes because memory ran low; not restarted), shadows, automatic part orientation, and a check that labels overlap the part the same way in more scenes.

### Session 30: Python analysis speed

Finding first: a profile of the 768-face box put 99 % of the detailed stage in `ray_mesh_query.first_hit` (every ray against every triangle's box, 4.7 million box tests). Behind it, on a smooth sphere, sat the candidates x faces evaluation (each face normal is a candidate; 1.65 million stored evaluation objects for 1,280 faces), and behind that the worker's `to_dict()`, which built millions of dicts that its compaction dropped at once (16 of 18 profiled seconds).

Built (D-086 to D-088): a bounding-volume hierarchy with exactly the brute-force answers, a flat candidate-evaluation loop with the original arithmetic order, an opt-in mode that does not keep the per-face evaluations (the worker uses it), a one-pass compact serialization in the worker, `scripts/native/analysis/` (models, per-stage timing with SHA-256 fingerprints, whole-job timing, a payload differ, and `compare-analysis.ps1` against an older commit). Tests: 45 Python test cases (18 hierarchy vs brute force by exact equality, 20 evaluation vs the face-by-face original including broken faces and parallel normals whose dot rounds above 1, 7 for the worker serialization and the unkept mode), 17 deliberate bugs each caught (two gaps found and closed: the per-triangle box test needs a leaf with a distant second triangle, the alignment clamp needs normals whose self dot product rounds above 1).

Evidence: against commit d58b3d1 the whole worker report is identical field by field (only the creation time, the measured milliseconds and the engine version string differ) on four models; the 10,800-face box: 884 s in the original (561 s measured earlier) against 3.6 s, all four stage fingerprints equal; a 3,072-face box 59 s to 1.1 s; a smooth 1,280-face sphere 82 s and 1,646 MiB to 2.8 s and 47 MiB; a 5,120-face sphere 21 s and 149 MiB (it would have needed several GiB). Debug ctest: 30/30 pass in the final full run. Python: 395 engine tests and 7 worker tests pass.

Not done: smooth meshes still grow faster than their face count (R-Analysis-1; a native reimplementation of the evaluation is the behaviour-preserving next step), parts with real undercuts were not measured, one built hierarchy per model instead of three, and the cavity stage's own Python work was not touched.

### Session 31: native candidate evaluation

Started from what Session 30 left: a smooth mesh spent 16 of 19 seconds in the candidates x faces loop of `PullDirectionEvaluator` (26 million evaluations at 5,120 faces, 420 million at 20,480).

Built (D-089, D-090): `native/engines/analysis-kernels` (a C interface, `craft_evaluate_pull_directions`, the loop with the same operations in the same order, no fused multiply-add, release C runtime, platform threads over candidates); `finish_candidate_evaluation` split out of the engine's evaluator so the Python loop and the kernel share the code that builds the metrics, warnings, evaluability and score; `craft_native_evaluation.py` in the worker (ctypes loader, a check against the Python arithmetic on load, `NativePullDirectionEvaluator`, fall back to the engine's loop with the reason); the application passes the library to the worker (`WorkerConfig::kernelsLibrary`, bundled `analysis/` or the build tree) and the result envelope carries `diagnostics`; packaging installs the library and the module; `verify-install.ps1` loads the installed library in the bundled interpreter and requires the application to have resolved it; `time_evaluation.py` and a third column in `compare-analysis.ps1`.

Tests: `test_native_evaluation.py` (28), two bridge cases in `tst_analysis_bridge` (same report data with and without the kernel on a tetrahedron and the bracket; missing and corrupt library fall back), `py_native_evaluation` in ctest. 17 deliberate bugs in the C++: 15 caught, 2 change no bit. Four of them survived the first check data (the lower alignment clamp, the three comparison boundaries) and led to boundary faces and settings taken from the data. A fused-multiply-add build (`/fp:fast /arch:AVX2`, optimized) is caught.

Evidence: evaluation alone 294 s -> 2.8 s on 20,480 faces, 16.3 s -> 0.20 s on 5,120, identical results; whole job 20,480-face sphere 43 s and 449 MiB; whole worker report identical to the Python loop and to the commit before Session 30 on every model both ways. Python: 395 engine tests, 38 worker and kernel tests; Debug ctest 31 of 31; the package built from this tree passes all `verify-install.ps1` checks including the hostile-environment run. Found on the way and fixed: the first bridge test case used `QVERIFY2` in a lambda that returns a value (compile error); the worker could not find its sibling module when imported by another script (it now adds its own folder to the path, and runs without the module if it is absent); the check data had no boundary cases.

Not done: a native ray query (R-Analysis-5), Linux and macOS kernels never built (R-Analysis-7), thread cap (R-Analysis-8), models above 20,480 faces not measured.

### Session 32: Cut by Face right-button plane drag

Read first: the reference's `cuttingPlane3dRuntime.ts` onDown/onMove/finish/cancel and the store's `beginPlaneDrag` / `commitPlaneDrag` / `cancelPlaneDrag`; native already had the slabs, picking, the Eraser, the slider (`setCutFacePosition`) and the helpers, but not `worldToNormalizedPosition`, a right-button path or plane hover.

Built (D-091 to D-093): `core/mold/CuttingPlaneDrag` (begin / update / finish on rays, `commitCutPlanePosition`), `worldToNormalizedPosition` in `ReferenceMold`; controller (`cutPlaneDragBegin/To/End/Cancel`, `cutPlaneHoverAt/Leave`, `cutPlanes` map: `dragging`, `dragFace`, `planeHoverFace`, `cursor`), `CutPlaneModel::setCoordinate`, the QML (a right press that lands on a plane drags it, otherwise it pans as before; hover on every move), grab / grabbing cursors, `--plane-drag-events` smoke test.

Reference fixture: `native/tests/reference/craftCutPlaneDragReference.test.ts` runs the real runtime (Three.js, jsdom, real DOM pointer events) through 55 scenarios (every enabled plane from seven cameras including three looking exactly along an axis; clicks that never move; pointercancel, lost capture, planes replaced, the Eraser coming on mid-drag, another pointer, other buttons, empty space, two drags in a row with the host's commit between) and the real store's commitPlaneDrag for 10 cases. Findings from it that the port reproduces: a plane seen exactly along its axis cannot be dragged (R-PlaneDrag-1); a drag that returns to its press commits an unchanged position, which the store ignores; after release the hand cursor stays and the plane is idle until the next move; the host rebuilds the planes after a commit (without it a second drag would start from the old record, which the generator had to model with an explicit step).

Tests: `tst_cutplane_drag_equivalence` (7) replays every event against the core; `tst_app_workflow` +2 (hover looks and cursor, press away from planes, threshold, follow along the axis only, one undo step, undo / redo, clamp at the box limits, cancel, a release back at the start, the Eraser mid-drag and under the Eraser, unchecking the face mid-drag); `app_smoke_plane_drag` (real right-button events: hover, the left button does not drag, a right press on the plane drags without panning, release commits one undo step, a right drag on empty space still pans). Mutation checks: 17 in the core (15 caught, 2 change no result: the reference plane's constant is exactly zero and a negated normal is the same plane), 16 in the app and QML, all caught; one survived at first (a release back at the start recording an undo step) and led to a test.

Not done: dragging Segmentation extension planes (R-PlaneDrag-4), a drag during a running generation (R-PlaneDrag-5), pixel comparison. Debug ctest: 33 of 33 pass, run under a watcher for the "Bad Image" window (none appeared). Earlier full runs of this tree each had one failure (tst_analysis_bridge twice, app_smoke_hint_events once), which I first put down to a slow machine because the same tests passed when rerun. That was wrong, and it was found only when the user sent a screenshot of the dialog: see the correction below.


#### Correction to Sessions 31 and 32: the kernel tests raised a modal Windows dialog

Two of the tests added in Session 31 (`aMissingOrBrokenKernelFallsBackToThePythonLoop` in tst_analysis_bridge and `test_loading_refuses_what_it_should` in the pytest suite) load a deliberately corrupt file named `craft_analysis_kernels.dll`. Under the bridge test's worker Windows answered with a modal "python.exe - Bad Image" box (status 0xc000012f) and the worker waited for someone to press OK. With nobody at the machine the tests waited for it (65 s, 131 s, a 300 s timeout), with someone passing by they passed at once; I read those timings as a slow machine and a flaky smoke test, and wrote that in the Session 32 log. It was this dialog. The user's screenshot of it showed the cause. A worker nobody watches would have hung the same way on a corrupt library in a real install.

Fixed: `craft_native_evaluation.load_kernels` loads inside `_no_loader_dialogs()`, which sets the thread's error mode to SEM_FAILCRITICALERRORS and SEM_NOOPENFILEERRORBOX for the load only and restores it, so a file that is not a usable library comes back as an OSError and the worker falls back to the Python loop, reported like any other refusal. A regression test checks the error mode during and after the load. Reproduced and checked with a watcher that looks for the window: guard switched off, the bridge test raises the dialog (dismissed by the watcher); with the fix, none, and the bridge test takes 6 s instead of waiting on a click. Full ctest with the watcher: 33 of 33, no dialog, 365 s.

Lessons: a failure that disappears on rerun and correlates with duration is a wait, not noise; and a test that feeds the loader a corrupt library has to prove that nothing can block on a dialog.

### Session 33: viewport re-measurement with the ruler

Ran the two full comparisons (display cadence and uncapped, `compare-viewport.ps1`, Release build of the current tree, five scenes). The first pair was disturbed (native 67 to 71 fps on small scenes at the display's cadence, 43 fps on the torus, 5.3 to 5.6 ms per frame uncapped against 74.7 fps and 4.3 ms before), and the question was whether the ruler had cost frame time. Rather than trust either run, built the commit before the ruler (`31d4112`) in a detached worktree and ran it against the current build, alternating: new script `scripts/native/ab-viewport.ps1`. Uncapped: 4.2 to 4.6 ms against 4.3 to 5.0 ms; display cadence: the same 74.7 fps on the box and the 9k sphere; torus at the display's cadence: 58.2 against 58.5 fps median over 18 runs each (the current build has 5 sporadic dips at 47 to 56 fps, the older none: R-Viewport-10). A second full run of the same two commands was clean and its numbers replace the tables in VIEWPORT_COMPARISON.md.

Found: the ruler costs no measurable frame time (R-Ruler-2 resolved); the torus at the display's cadence reads 58 fps on both builds today and read 74 fps on 18 November (the machine, not the code); a disturbed first run looked like a regression and was not one; the pixel metrics are unchanged by the ruler (IoU 0.978 to 0.999).

Not done: the cause of the first run's disturbance (R-Viewport-9), the cause of the torus dips (R-Viewport-10), the fixed ~4.3 ms per frame (R-Viewport-3), other GPUs, refresh rates and viewport sizes.

### Session 34: R-Smoke-1 re-examined

After the Bad Image dialog (Session 31/32 correction) showed that a failure which vanishes on rerun and correlates with duration can be a wait, the three unexplained real-event smoke failures were looked at again. Built `scripts/native/smoke-stress.ps1` (the smoke group repeated, with optional all-CPU load and a topmost modal dialog, and a refusal to run unless those conditions are verified). Its first version was wrong in a way worth recording: the CPU burners were started with an unquoted `while True: pass` argument and exited at once (total CPU 15 %), and the dialog was created in a way that never appeared, so the first two "clean" results (84 and 28 runs) were for conditions that did not exist; both were discovered by checking the conditions and discarded. With verified conditions: 105 runs idle, 56 under 100 % CPU (about three times slower per test), 56 with a dialog in the foreground at the start (it was gone by the end in every run, cause unknown): no failure in 217 counted runs.

Changed: the hint-events smoke test polls for the badge for up to three seconds instead of one look after 150 ms, and its failure message carries the model phase, busy, window-active and the viewport size; checked by forcing the badge hidden (it then fails after three seconds with those fields).

Not found: why the three runs failed (R-Smoke-1 stays open as unexplained, with a hypothesis).

### Session 35: a look at the window

Asked what is left of the UI, the first honest step was to look: rendered the real window (the smoke test's frame grab) with a model, a mold and an analysis, dark and light. Three defects that no test had caught, all visible at once: the hint badge text was garbled (an A-circumflex before each separator dot), the third printer-size field was cut off, and the Light theme left the toolbar, menus and panels dark. Fixed: the middle dot is an escape and `source_encoding` (a ctest over native/) fails any double-encoded or non-UTF-8 text (it caught the bug before the fix and finds nothing after; the whole tree had exactly that one line); the printer fields share the panel width; the theme sets the application's colour scheme (`AppController::applyChromeScheme`, Qt 6.8 `QStyleHints::setColorScheme`), checked on screen in both themes and by `theThemeSetsTheColourSchemeOfTheWholeWindow` (fails when the scheme is not set). Smoke and workflow tests pass.

Not done: a comparison of the chrome with the reference's UI (R-UI-1), HiDPI, keyboard and accessibility, translations (R-UI-3), the Windows title bar in the light theme, the lower sections of the inspector (reports, selection, Master Mold results) were not viewed (R-Reports-3).

### Session 36: the UI walk-through

Built `native/app/UiTour.*` (a development-only tour of eleven states that captures the window in both themes and at its minimum size, the whole inspector, and lints the item tree), `scripts/native/ui/` (the native tour wrapper, a Playwright driver for the real reference app with a step language and a control inventory, and the reference tour), and `check-source-encoding.py`. Walked both UIs through the same states; the reference is a viewport-centred workspace and the native window follows the directive's menus, toolbar, status bar and inspector, so the result is a control-by-control map and a list of defects, not a layout comparison (UI_WALKTHROUGH.md).

Found and fixed (ten items, nine fixed): a garbled hint badge, a light theme that left the chrome dark, a clipped printer field, a toolbar that ran off the window at the minimum width (Redo and the opacity slider outside it; opacity moved into the Mold section, minimum width 880 px), unchecked checkboxes that looked checked in the dark theme (`CraftCheckBox`), misaligned cut-face sliders, engine identifiers shown with underscores, and drag-and-drop of an STL onto the window, which the reference has and native lacked (reference validation and messages; `app_smoke_drop` through real platform drag events; eight mutations caught). Not fixable: the Windows title bar in the light theme.

Also found, the expensive way: the tour's unclean exit left autosaves, and the next full ctest failed six real-mouse smoke tests together because the recovery dialog covered the window. A bisect that restored files by copying them kept their old modification times and the build skipped them, which cost two wrong turns. The smoke tests now use autosave and cache folders of their own (R-Smoke-1).

Not done: the Molds browser (per-body and model visibility), status indicators, a shorter inspector, HiDPI, keyboard and accessibility, translations, the operating system's dialogs (R-UI-1, R-UI-3, R-UI-4).

### Session 37: a sectioned inspector

The walk-through's biggest remaining usability finding was the inspector: one 3,400 px column. `CraftSection` replaces the twelve group boxes (and the three nested ones): a header that folds and unfolds the section on a click, Space or Enter, takes keyboard focus with Tab, shows a focus ring and names itself and its state to a screen reader (the first accessibility name in the native UI), and "Collapse all" / "Expand all" at the top of the inspector. The tour gained a twelfth state (every section folded; lint 0 findings in all 36 captures). `app_smoke_sections` drives it through real input: a click folds and unfolds and the inspector's height follows, the header has the focus after the click, Space and Enter toggle it, Collapse all and Expand all reach every section including the nested ones; 9 mutations caught. The first version of that test read the layout height at once and failed: the layout follows on the next frame, so it polls.

Not done: the fold state is not remembered between runs or saved with a project; no section index; the reports section's content is still long (UI_WALKTHROUGH.md).

### Session 38: the Molds browser

The one capability gap the walk-through left: the reference's Molds browser (an eye per mold body and one for the original model). Ported as a "Molds" inspector section (D-094): `SceneModel::setVisibleById / clearHidden` keep visibility by id, `AppController::moldBrowser` and `setBodyVisible` expose it, the scene delegate already honoured the `itemVisible` role. `theMoldsBrowserShowsAndHidesBodiesAndTheModel` covers hiding and showing one body, no undo step, the hidden state surviving a rebuild of the same mold, a hidden model not being picked (the bodies are hidden first: a mold body is pickable too), a new model resetting it and Master tooling hiding the section; `app_smoke_molds` clicks the checkboxes of the real window.

Found on the way: the first smoke run segfaulted. The test kept a pointer to a checkbox, the toggle changed the browser's list of maps, and the Repeater rebuilt every delegate, including the one whose toggle was running: a use-after-free in the test, and for users a checkbox that loses the keyboard focus when toggled. The Molds list now runs on ids (R-UI-5: the cut-face rows and other lists still rebuild). Mutations: 7 of 9 caught; the other two are equivalent in practice (model ids change with every import, so clearing hidden ids on import cannot be told apart; Qt does not rebuild a repeater whose list of ids is unchanged, so the explicit id list is the same as the plain one).

### Session 39: alpha ghosting of stale Master Mold pieces

The pieces of a Master Mold result whose inputs changed were drawn flat grey; the reference keeps their colour and caps the opacity at 0.2 (D-095). Added a `ghost` flag per scene row and the opacity cap in the viewport QML. `masterMoldGeneratesShowsGhostsAndResets` now checks that stale pieces are flagged, keep their colour and are solid again after regenerating; 3 of 3 mutations caught (flag never set, grey again, everything ghosted). The tour has a new state, `09b-master-mold-stale`, looked at in both themes: the pieces stay blue and orange and read as a holdover. The opacity value is a constant copied from the reference source (the TypeScript constant is not exported, so no fixture compares it) and the QML side is covered by the picture only.

### Session 40: cavity quality mode

Item: the cavity "High" mode was implemented but not selectable. Reading the reference showed more than a missing control: its store starts every cavity in "high" and nothing changes it, so native had been running a different mode from the reference all along (D-096). Now `cavityQuality` on the controller (default high), a "Cavity quality" selector in the Mold section (enabled only with a clearance), part of undo history and of the mold-input invalidation, reported in the mold summary. Not saved in the project file.

`cavityQualityDefaultsToHighAndIsUsedByGeneration`: default, generation in both modes recorded in the result (Debug bracket at 1 mm: High 4.5 to 6.2 s, Standard 1.6 to 2.6 s, removed volume 10337.1 against 10331.7 mm3, so the mode does change the result), invalidation, undo and redo of the change. `app_smoke_molds` checks the selector's QML wiring (disabled at clearance 0, starts on High, its choice reaches the controller, it follows the controller back); it sets the combo's index and emits `activated` rather than clicking the popup. 7 of 7 mutations caught after one test was strengthened (a missing history step survived until the test asserted that undo brings back the finished High mold). `bench_pipeline` gained a quality argument; numbers in R-Cavity-1.

### Session 41: the Master Mold toolbar button

Ported the reference's toolbar entry (D-097): a "Master" button and a Mold-menu action sharing one Action, with the reference's availability, highlight and tooltip rules. Building its smoke test exposed a bug that had been there since Master Mold was ported: `canGenerate` depends on the model and the busy state, but neither emitted `masterMoldChanged`, so the button never enabled after an import (the inspector's button too; it shows greyed in the earlier tour). Fixed by connecting `modelChanged` and `busyChanged`. The tour's lint then found the toolbar overflowing at 880 px (Redo off the window): label "Master", spacing 4 to 2 px, lint back to 0.

`masterMoldAvailabilityNotifiesWhenTheModelOrBusyStateChanges` (notification on import and while generating) and `app_smoke_master` (a real click on an imported model with no mold: enabled, idle tooltip, generating observed with the button unavailable and a progress tooltip, success with pieces on the scene and the button highlighted, stale tooltip after a printer change). Mutations: model-change and busy-change notifications, never highlighted, does nothing, stale tooltip, progress tooltip all caught; "enabled while generating" survives and is equivalent in practice, because `canGenerate` already includes not-busy. One unexplained failure in 32 smoke runs: R-Smoke-2.

### Session 42: the two Registration items of Phase 5 are not gaps

Before building a "native workflow for the segmentation sizing policy" and a "manufacturing-profile UI", I read what the reference does with them. Sizing: it is chosen from the committed definition's segmentation lineage and nothing else, and native already does that; it is covered against the real reference by `tst_segmentation_equivalence` (policy id, interface ids, feature ids, body volumes and triangle counts of the keyed segmented mold) and by `tst_app_workflow` (an adopted segmentation gets the automatic policy: 15 mm maximum key radius for a 30 mm interface, keys generated). Profile: the reference passes `null` everywhere and has no UI, so there is nothing to port (D-098). No code changed; the remaining-work file and the parity matrix were corrected so that they stop listing them as open.

### Session 43: sprue result caching

Phase 5's "result caching": the reference memoises each sprue's generation in `evaluateDerivedMold`, native re-ran every Boolean pass on every evaluation (D-099). `SprueResultCache` in core, passed through `evaluateDerivedMold` from both app jobs (the mold job and the sprue-edit job), hit and miss counts in the mold summary. Tests: three core tests (an unchanged evaluation is all hits and equal to the uncached one in every observable field including mesh arrays; editing the last, middle and first sprue gives 2, 1 and 0 hits, each equal to the uncached result; failures are memoised, a deleted sprue's record goes, `clear()` empties it) and an app test on the real flow (two sprues placed through the tool: 0/1, then 1/1, regenerating the unchanged mold 2/0, resizing the last 1/1, resizing the first 0/2, removing the last 1/0). 10 mutations caught; one only after the app test gained the regeneration step, because the mold job passed no cache and nothing exercised it until then. Not tested: the clearing on import (it cannot change a result).

### Session 44: the keyed segmentation plan preview

Phase 5's "async plan-preview registration". The reference's viewport shows the planned sections with their registration keys, produced asynchronously by `generateSegmentationPlanPreview`; native showed unkeyed boxes (D-100). The core already had the routine (`generateSegmentationRegistration`), so the work was the evidence and the job. Evidence: `craftSegmentationReference.test.ts` now also runs the real preview for every valid plan, and two larger plans (3 x 3 x 3 and 4 x 4 x 4) were added; `scripts/native/generate-reference-fixtures.ps1` gained `-Only segmentation` (the fixture used to regenerate only under `all`, about 25 minutes). The committed fixture is otherwise unchanged (checked structurally). `tst_segmentation_equivalence` compares status, reason code, message, policy id, interface ids, feature ids and every keyed body (volume, triangles, key triangles) for 14 plans: all match, including the two the reference blocks. In the app: the preview job after every valid plan, the guards, `previewState` in the segmentation map and an inspector hint. Tests: the keys arrive without moving a camera the user had moved, the preview keys equal the executed keys, a blocked plan stays unkeyed with the reason, a replaced plan or a reset drops a running preview, and a preview of an earlier plan never lands on a later one after a reset restarts the revision counter. Mutations: 6 of 8 caught; the other two are equivalent (the phase check is redundant now that executing bumps the generation; the revision prefix only changes an identity hash). Two real problems found by the tests while building it: after an execution the state stayed "running" (so the hint would have stuck), and the generation guard was untested until a plan, a reset and a second plan were driven together.

### Session 45: the two Master Mold construction items are not gaps

Same check as for Registration (D-098): read what the reference does before building. The volumetric mode: `buildVolumetricConstructionPieces` has no callers outside comments and one test, so the branch is unreachable there. The multi-label success path: tallying `labelResult` in the master fixture, the real reference's multi-label construction fails in 9 of 9 attempts (a box, a slab, a bracket, a dumbbell, a tripod, a grooved sphere and others; two more cases never reach an assignment), always with the release-polarity error native reproduces. So there is nothing to port and no reference success to verify against (D-102, R-Master-2). No code changed; the remaining-work file now says so.

### Session 46: crash recovery with a real kill

R-Project-3 said recovery had only been simulated. Added `CrashDrill` (development builds: `--crash-victim` edits with an 80 ms autosave interval and announces its first autosave, `--recover-probe` opens the first recovery offer as the dialog does and writes what it found) and `scripts/native/crash-drill.ps1`, which kills the victim with TerminateProcess after a random delay and checks the probe: an offer, a project that opens, the right model by name and triangle count, a cavity clearance among the 40 values the victim cycles through, and the files the kill left behind. Result: the atomic write holds, 26 of 26 rounds (6 small, 20 on the 62.5 MiB part). Two bugs in the drill itself on the way (a relative path resolved against the wrong directory; offers read after recovery, when the opened project's own autosave is rightly no longer offered). The kills found one real defect: stray temporary files of up to 62.5 MiB that nothing removed (D-103). Fixed with a narrow stale-age rule, tested by `theLeftoverOfAnInterruptedAutosaveIsRemovedOnceItIsStale` (7 mutations caught: never removing, ignoring the age, inverting it, matching too broadly or too narrowly, removing any old file, not calling it) and in the real flow by the drill, which ages the leftovers, starts the application again and checks they are gone (5 of 5 cases in the last run).

### Session 47: progress and cancel for save, open and import

The remaining-work item "progress, cancel and diagnostics for all heavy jobs (save/open run on worker threads; cancel is not offered)" (D-104). The writer, the reader, the linked-model loader and the STL file read now take an optional control and work in chunks; the controller keeps a token and a stage and progress for the job that runs; the footer shows a progress bar and a Cancel button. Tests: core tests for every stage of a save (while hashing, mid-model, after the last chunk before the commit: the file is as it was and no temporary file remains), progress that never goes backwards and ends at 1, a stopped open, a stopped linked-model load, the STL chunked read; app tests for a save, an open and an import cancelled before they start (holding the only worker thread: no hook in the production code), for the progress each reports, and for a cancel when nothing runs not poisoning the next operation. Mutations: 14 on save and open (the first run left three survivors because the test stopped at the Nth poll, which hides a missing poll site; a test that stops by stage fixed that) and 9 on import and the STL read, all caught except one equivalent. Measured stop latency on the 62.5 MiB part: 31 to 47 ms (R-FileJobs-1).

### Session 48: the 512 MiB ceiling

The remaining-work item "Large-STL behaviour". `makeLargeModel.mjs` streams a UV sphere of any size to disk; 10.73M triangles (511.8 MiB, just under the limit) and 10.82M (516.1 MiB, just over) were made. Load, render, save, open and cancel all work at the limit (R-LargeStl-1: stalls of at most 23 ms, cancels in about 50 ms). The mold does not: run under a watchdog (kill past 9 GiB or 4 minutes), 1.31M, 2.64M and 5.20M triangles finished using 1.6, 3.1 and 6.3 GiB, and 10.73M was killed at 9.2 GiB after 116 s with no end in sight. A part the file limit accepts can therefore need about 13 GiB to mold, which is more than most machines have. So the app now refuses a mold whose estimated memory (1.5 KB per triangle plus 64 MiB) exceeds what is free, before any work, with the numbers in the message (D-105). Tests: the exact boundary (one byte short refuses, exactly enough runs), unknown memory never refuses, a refusal changes nothing (the mold phase, the scene, a planned segmentation), and the estimate's constants (11 mutations, two of them only after a test pinned the estimate against the measured peaks). The timings were taken with a throw-away Release test and a watchdog script that are not kept; the numbers are in the risks.

### Session 49: the other engines at large sizes, and a Master Mold that could not be stopped

Measuring Master Mold, the Python analyses and sprues after the mold (D-105). Segmentation works from bounds, not the part's triangles, so it does not scale with them. Master Mold did badly (R-Master-3): slow on free-form parts of any size, memory up to 7 to 8 KB per triangle, and, the real defect, not stoppable: after the 180 s timeout the panel stayed 'generating' and the whole application busy for as long as one Boolean ran (more than 250 s on the spheres). Fixed as D-106: timeout, cancel and reset release the UI at once and the thread ends in the background, a new run waits for it, and Master Mold has its own memory guard. Tests: cancel, timeout and reset release the application synchronously; the late result never reaches the scene or a mold started in the meantime (a held worker thread makes the order deterministic: Master job, then mold job, so the mold is running when the discarded run ends); a new run is refused while one ends and works after; the guard's boundary, unknown memory and error code; the estimate against the four observations. Mutations: 17 of 19 caught on the first pass (the harness itself hung on a mutant and was fixed to wait for the killed process); the two survivors were a real untested case (Master's unknown-memory path, now tested) and the pair of protections that hide each other. Along the way the first version of the timeout test was flaky (the bracket's run can finish inside one poll); the held worker made it deterministic.

### Session 50: the mold's Cancel

The same defect as Master Mold's, found by reading the mold's completion handler (D-107): it cleared `busy` before checking that its result was still wanted, and a change of an input during generation only flagged the token, leaving the application busy until the Boolean returned. One `abandonMoldRun` now serves the Cancel button, input changes and undo. All 81 existing app tests passed unchanged, which was not a given since a new generation is now refused while the old thread ends. New tests: cancel releases at once and a new generation waits and then works; an input change releases at once; a held worker thread fixes the order so that the discarded mold's thread ends while Master Mold runs behind it and must not disturb it; undo leaves the orphan accounted for. Mutations: 11 of 12 caught (three of them as hangs, which is how a missing abandon flag shows); the survivor is the pair of protections that hide each other, as for Master Mold.

### Session 51: final verification and the report

Fresh evidence for `EXECUTION_REPORT.md` instead of memory of earlier runs. Package rebuilt and `verify-install.ps1` passed (133.1 MB installed, 71.2 MB ZIP). The existing checks of the repository: `pytest` 395 passed (357 at the baseline: the rest are the new engine tests), the frontend typecheck passed, `ruff check` and `ruff format --check` FAILED, and that was mine: the engine speedup files of earlier sessions had three B023 errors and four unformatted files, passing at the baseline (fixed, committed, pytest and the native-side equivalence tests re-run). The first complete Release ctest found two more problems (R-Test-1): a test that only passed in Debug and a timeout that could never be met; both fixed. Stale documentation corrected: the parity matrix (sprue caching, the sizing policy, "Other Python stages NOT WIRED", the Master Mold cancel note, two rows that had been joined on one line), ARCHITECTURE.md ("packaging is NOT done"), README.md ("the Python engine is untouched"), R-Reports-3 (the section was looked at on the tour capture). Not re-run: the frontend's own tests, lint, build and Playwright (no frontend file differs from the base: `git diff --name-only 98082a9..HEAD -- mold/frontend` is empty).


## Session 52 (2026-11-21): Windows-only completion, increment 1
- Verified worktree D:\CraftNative\worktrees\native-desktop-migration, branch feature/native-desktop-migration, head 018c7cc.
- Full Release build + single-run ctest on 018c7cc: 38/38 passed, 1123.91 s (closes R-Test-1 for that commit).
- Added 3MF export with read-back validation (tst_threemf 11 tests; tst_app_workflow 3MF test passes in Debug), WINDOWS_COMPLETION_MATRIX.md, and .github/workflows/windows-native.yml (written, not executed on a runner). Commits 5c05b07, bcb6e81.
- Mistake fixed: forcing QT_QPA_PLATFORM=offscreen produced a Qt platform-plugin assert dialog; removed from CI. The Dell SupportAssist driver popup is unrelated to Craft.

## Session 53 (2026-11-21): Flip / part orientation finished, Master tooling 3MF

- Part orientation committed in two steps (core port 3cd01be, app integration 18b379e). Full Release ctest on 00e3615: 41/41 passed, 990.34 s.
- UI tour on Release: the lint found Redo cut off at the minimum window width (885 px against 880) because of the Flip button; the minimum width is now 910 and the tour is clean (13 states, 39 captures, 0 findings).
- New app_smoke_flip drives the real window: mouse click on the Flip button and the four arrow keys as platform key events, including a held key. Mutation-checked (auto-repeat on the Left shortcut fails it). Mistake fixed: the first runs failed because the test was not in the list that gives each smoke test its own autosave folder, so a recovery dialog swallowed the clicks.
- Two background waiters on UTF-16 logs never returned (grep could not match through NUL bytes); stopped.
- Mistake fixed: `git add native` committed Python bytecode; removed from the index and ignored.
- Master tooling 3MF (D-109): one 3MF with every current piece beside the STLs and manifest, read back and validated; Debug tst_master_export 18/18, tst_app_workflow and tst_threemf pass; the unreported-open-piece warning is mutation-checked. Release on 075428b: build ok, full ctest 41/41 in 1113.88 s, UI tour 13 states / 39 captures / 0 lint findings / 0 problems.
- Segmentation extension planes (D-110): drawn as slabs in the mold frame, right-button drag, Eraser removes the boundary, add/edit/remove/drag are undo steps. Debug: 4 new tst_app_workflow tests and app_smoke_extension_drag pass; an undo mutant (extensions not restored) fails 3 of them. A first slab placement used the unshifted part box and a test caught it 6 mm off the part (the plan's coordinate is in the mold frame).
- Release on 298d743: build ok, full ctest 42/42 in 1033.13 s, UI tour 13 states / 39 captures / 0 lint findings / 0 problems. Debug full ctest on the same code: 42/42 in 397.81 s.
- Protected-region merge (D-111): new real-reference fixture (craftSegmentationSourceReference.test.ts drives readCurrentSegmentationSourceSnapshot through the real stores, 15 scenarios), core readSegmentationSource, planSegmentation wired to it. Debug: tst_segmentation_source_equivalence passes first run (identities and signatures included); two app tests pass; a mutant that keeps the automatic signature and one that drops the committed mold are each caught. Finding: the application's default mold clearance is 10 mm, so a default mold never has the automatic 100 mm block and contributes no regions, as in the reference.
- Release on 089a338: build ok, full ctest 43/43 in 1044.64 s, UI tour 13 states / 39 captures / 0 lint findings / 0 problems. Debug full ctest on the same code: 43/43 in 411.68 s.
- Edge and role colour cues (D-112): look-reference.json now records every role material and the glass material from the real createCadMaterial; native ViewportLook, role-coloured vertex buffers, the moldGlass option and an Inspector button. Debug: tst_viewport_look 10/10, tst_viewport 14/14, two workflow tests pass. Checked on screen by making the cavity colour green for one build (the cavity surface rendered green, none in glass) and restoring it. Mistake fixed: a PowerShell here-string ate the newline after a replaced comment in ViewportLook.cpp, which zeroed the edge colour and failed gridAndEdgeStyle; the test caught it.
- Release on 4ddca6c: build ok, full ctest 43/43 in 1048.62 s, UI tour 13 states / 39 captures / 0 lint findings / 0 problems (the Glass appearance button included). Debug full ctest on the same code: 43/43 in 423.95 s.
- Undo/redo completeness (D-113): audited the reference's history (snapshot contents and every push site) against the native one. The only missing record was body visibility, which the reference keeps in every snapshot and resets when a plane is chosen, moved or removed (not on a clearance change); the real store showed that, a sixth sequence in undo-reference.json records it and the native replay passes it, with mutants for the unrecorded toggle and the missing reset both caught. Stale risk notes R-CutPlane-1 and R-SprueGizmo-3 (plane removal and sprue edits cannot be undone) were out of date and are corrected; R-Undo-1 is closed.
- Release on 82a7571: build ok, full ctest 43/43 in 1131.60 s, UI tour 13 states / 39 captures / 0 lint findings / 0 problems. Debug: the first full run failed one test (the Molds browser test still encoded the pre-D-113 behaviour); it was corrected and the workflow suite plus all smoke tests then passed 14/14.

## Session 54 (2026-11-22): package rebuild and install check

- build-package.ps1 on d7dfbcf: exit 0 (Python runtime, windows-package configure and build, install, CPack). Layout 133.2 MB, ZIP 71.2 MB.
- verify-install.ps1: all checks pass on the installed layout (D:\CraftNative\staging\Craft-install) and on the ZIP extracted into a fresh folder; the two file lists are identical. The packaged Craft.exe, started normally from a PATH with only the Windows directories and private LOCALAPPDATA/APPDATA, showed its window, stayed responsive and closed with exit 0 and empty stderr; the only files it wrote outside the install folder were the GPU driver's shader cache.
- Installer tools (WiX, NSIS, Inno Setup): none on this machine and none on PATH, so PK-2 stays blocked on the owner's permission to download WiX. Not done: a clean Windows image (P0-6's last row), code signing (owner decision).
- Update strategy (D-114): UPDATE_STRATEGY.md written as a proposal. Single version source (CMake project version -> CRAFT_APP_VERSION, version resource in Craft.exe via app/craft.rc.in, applicationVersion in the smoke summary) and three new verify-install checks. Package rebuilt (ZIP SHA-256 764A05FB...69CEF): verify-install 37/37 on the layout and on the extracted ZIP; Craft.exe VersionInfo file=product=0.1.0. Debug and Release rebuilt; tst_project, tst_app_workflow and the smoke tests pass in both (15/15). The full Release ctest was not repeated for this commit (no test or behaviour changed beyond the version string). The new verify check was not seen failing (no way to change the resource without a rebuild); it compares three strings.

## Session 55 (2026-11-22): P2 items

- P2-3 (D-115): measured first. With a 300-character folder and Windows' long-path setting off (the default), the STL import and export, the 3MF export, the Master tooling export and both Python analyses failed; projects and autosave (Qt) did not. Added io/path/ExtendedPath and used it at every standard-library file call and for the path given to the Python worker. tst_long_paths (11) and a workflow test pass in Debug; the affected 19 tests pass; mutants for the helper and for the worker conversion are caught. A removable drive could not be tested.
- P2-1 (D-116): reproduced R-UI-5 in the real window for the Cut by face rows, a sprue slider, an extension field and a Master piece (focus went to the Inspector container), added VariantListModel and four models, and a real-key smoke (app_smoke_focus) that also checks the first Tab, a trap-free Tab cycle over 47 stops, focus rings, a modal dialog (focus in, Tab inside, Escape out, focus back) and accessible names. Each list's fix is mutation-checked (the old list back makes the smoke fail with the R-UI-5 message), and so is an unlabelled slider. Debug: tst_variant_list_model 9/9, app_smoke_focus passes (8 s); the list model, workflow and all smoke tests pass (16/16).
- P2-2 (D-117): the tour under QT_SCALE_FACTOR 1.25/1.5/2 was clean, but the new --font-scale option (QT_FONT_DPI changes the scale, not the text) found 230 / 737 / thousands of lint findings at 1.25 / 1.5 / 2.0 times the text: fixed (toolbar Flow, wrapping check boxes and labels, slider minimum widths, Inspector and window minimum width from the text size), tour clean at all four. The 9 real-input smoke tests that failed at any scale other than 100 % were a harness bug (device-independent positions given to a native-pixel interface); fixed, 14/14 pass at 100/125/150/200 %. Plane-drag test now also checks drawn versus picked pixels (mutation: device pixels taken for logical ones fails at 200 %) and the same after resizing the window. Mistakes made on the way: a replacement string with a literal backtick-n commented out a declaration, and the resize block went into the wrong function; the compiler caught both.
- Release for P2-1, P2-2 and P2-3: the first full run on 44c578d failed one test (46 tests, 45 passed): app_smoke_plane_drag, in the new drawn-versus-picked check, after the window was enlarged to 1500 x 900 (the hover reaches the screen a rendered frame later, so the two frames compared were identical); it failed on every run, alone and in the suite. Fixed in 52da243 by taking frames until one differs from the idle frame (25 of 25 runs pass, and at 150 and 200 % scale). Full Release on 52da243: build ok, ctest 46/46 in 1021.66 s, UI tour 13 states / 39 captures / 0 lint findings / 0 problems. Debug full ctest on 44c578d: 46/46 in 484.30 s.
- P2-6 (D-118): new development option --project-bench (ProjectBench.cpp) times import, two saves, an autosave and two opens of a large project. First attempt at the autosave number was wrong twice: the 60 s autosave timer overlapped the run, then (timer off) autosaveNow() returned at once because the dirty flag is set asynchronously after the edit, so the earlier 26 to 41 s were the timer's own autosave and not the one asked for; fixed by stopping the timer and waiting for dirty. Same-conditions comparison with the skip off and on is in D-118. tst_project and tst_app_workflow pass in Release; the new writer test fails when the hash is skipped by default.
- P2-7: audited the smoke harness for the pattern that the plane-drag failure showed (state read at one instant, no wait for the screen or layout): six centre-click sites now use stableCentre; the Master click failure message carries the state. smoke-stress.ps1 gained -Preset. Release, all CPUs busy, 6 iterations x 14 smoke tests: 84 runs, no failure (27.8 min). Two mistakes in running it: a backgrounded bash job with & ended at once without running, and a wait loop that matched the start banner and returned early; the run itself was started as a detached PowerShell process and waited on its 'done' line.
