# Master Mold repair: replacement ledger (engine switch-over)

Scope of this stage: the engine, store, wire format, worker result, panel model, export and tests now use the two-master contract (`MasterContract.h`, version 2). The old variable-piece planner is deleted. Not done yet and listed at the end: the adaptive (curved-seam) path, a robust self-intersection preflight, measured memory limits, packaging checks, and the final `MASTER_MOLD_REPAIR_REPORT.md`.

| Old component | Action | Reason | Verification |
|---|---|---|---|
| `MasterWorkingMoldPlanner.*` (2-6 piece prism search) | deleted | replaced by the closed-form planar seam search in `MasterTwoPart` | `tst_master_twopart` |
| `MasterWorkingMoldConstructor.*` (multi-piece construction, discrete release sweeps) | deleted | replaced by two-half construction and continuous translation-sweep verification | `tst_master_twopart` independent re-verification |
| `MasterMultiLabel.*`, `MasterRegionDirect.*` (side-plug / multi-label fallbacks) | deleted | the contract forbids side plugs and fragments | no references left (grep) |
| `MasterTooling.*`, `MasterMultiPiece.*` (one/multi-piece cases, sacrificial outcome, pour face, vents) | deleted | replaced by per-half inversion into one integral master | `tst_master_twopart`, `tst_master_export` |
| `MasterAccessibility.*`, `RayBvh.*` (patch accessibility, ray BVH) | deleted | the new planner judges every triangle directly | no references left |
| `jsToFixed` (was in `MasterAccessibility.cpp`) | moved to `JsFormat.*` | still used by `core/reports` | `tst_reports_equivalence` |
| `MasterPlanning.*` planning mesh, candidate directions, limits, `MasterCastingProcessProfile`, `MasterPlanningPreferences` | deleted / replaced by `MasterProcessProfile` (`MasterProfile.h`) | no flexible/sacrificial flags, no piece-count caps | `tst_master_store` |
| `MasterPlanning.*` seed, preflight, `TriangleIntersection` | retained | shared input side; identity now includes the contract version and every profile field, so results of the old contract are stale by construction | `tst_master_store` |
| `MasterEngine.*` (orchestration, budget report, unported-path flags) | replaced | now only stages, hooks and one call into `planTwoPartMasters` | `tst_master_twopart` |
| `MasterMoldStore.*` (per-piece sets, tooling states) | replaced | one outcome: current / stale / blocked / error; failure never leaves an earlier result | `tst_master_store` |
| `MasterWire.*` | replaced | request = seed; result = outcome; a decoded success is re-validated | `tst_master_wire`, `tst_geometry_worker` |
| `MasterToolingExport.*` | adapted | exports exactly Master A and B (+3MF plate, manifest v2); halves never exported; all-or-nothing pair | `tst_master_export`, `tst_long_paths` |
| Panel model / QML (`Inspector.qml`, `MasterPiecesFlyout.qml`) | adapted | two printable masters + preview-only halves group; warnings and residual uncertainty shown; incomplete-path note removed | `app_smoke_master`, `tst_app_workflow` |
| `tst_master_equivalence`, `master-reference.json`, `MasterTestRequests.h` (75 web-reference parity tests, old fixtures) | deleted / rewritten | they asserted the obsolete multi-piece output and messages; intentional change, not weakened tests | replaced by contract, planner, store, wire, export tests |
| Progress stages | renamed | `searching_release_axes`, `choosing_seam`, `building_working_halves`, `inverting_masters` | worker stage log |

## New components

`MasterContract.*` (result contract, measured body facts, validator), `MasterTwoPart.*` (planner), `MasterProfile.h` (profile), `JsFormat.*`, tests `tst_master_contract`, `tst_master_twopart`, and the standalone `app_smoke_master_standalone` (Master Mold from an imported model with no `--generate-mold`).

## Still to do

- The duck is still `no_feasible_plan`: no flat seam on any of 169 axes, and no curved height-field seam on the 4 most promising (1,500-2,200 of ~25,000 seam vertices sit above a downward-opening face and below an upward-opening one, i.e. a column holds mold that can leave neither way). Not a proof of impossibility: other pull-direction pairs or non-translational release are not searched.



- Historical docs in this folder still describe the old planner.
- `MASTER_MOLD_REPAIR_REPORT.md`.

## Curved-seam path (added)

When no flat seam works, `MasterTwoPart` solves a height-field seam z = h(x, y) in the pull frame of the four most promising axes (grid 64 then 160 cells on the longer side). A seam exists exactly when no column of the product holds mold between two of its intervals: each vertex must lie above every downward-opening face and below every upward-opening face that touches its cells, evaluated exactly over the clipped footprint. The smoothest seam inside those bounds is found by projected relaxation, the halves are built around it, and release is verified by the same translation sweeps on the final solids. `tst_master_twopart` covers a wavy plate (no flat seam on any axis tried), the same plate rotated, and a hollow sphere that must still be refused.

Two numerical rules were added with it, both stated in the code: faces thinner than the kernel resolution are treated as contact (an overlap whose own thickness 2V/A is at most twice the kernel tolerance), and mating overlaps use the same rule.

## Preflight, memory and install checks (added)

**Preflight.** The self-intersection pass was already there (it ran up to 20,000 triangles) and was not robust: two triangles of a wall that are coplanar only to float32 rounding were judged by the line where their planes meet, which is arbitrary at an angle of 1e-7, so the small gear was refused. `trianglesIntersect` now takes the coordinates' own resolution (`containmentToleranceMm`, 4 float32 ulps of the largest coordinate) as a plane tolerance: triangles within it of each other's plane are judged by their overlap in that plane. Genuinely crossing triangles, a shallow 3 degree plate through a wall, and overlapping coplanar faces are still refused (tests). The pass is now a uniform-grid pair search with a work cap, so it covers every size benchmarked and says so when it stops early. Preflight times: gear_s 0.1 s, gear_m (184k) 1.8 s, gear_l (1.5M) 14.8 s, cup_l (956k) 7.6 s; all `valid`.

**Memory (worker process, Release, i7-8550U, 16 GiB).** The worker reports its own peak working set; the benchmarks record it (`workerPeakWorkingSetMiB`). The application process's own peak, which the benchmark used to report, says nothing about a job that runs in another process.

| Part | Triangles | Result | Time | Worker peak |
|---|---|---|---|---|
| flower_s | 6,400 | success | 1.8 s | 49 MiB |
| gear_s | 7,680 | success | 3.1 s | 54 MiB |
| cup_s | 2,640 | success | 5.0 s | 190 MiB |
| cup_m | 85,200 | success | 18.1 s | 341 MiB |
| flower_m | 160,000 | success | 50.7 s | 467 MiB |
| gear_m | 184,320 | success | 40.7 s | 534 MiB |
| cup_l | 956,000 | success | 157.5 s | 3,049 MiB |
| gear_l | 1,536,000 | success (past the 180 s limit: run with CRAFT_BENCH_MASTER_TIMEOUT_MS) | 320.7 s | 4,065 MiB |

Before: the medium gear needed about 450 s and the small gear and ring were refused. `estimateMasterMoldPeakBytes` is now 256 MiB + 3.5 KB per triangle (it was 64 MiB + 9 KB, which would have refused the 1.5M-triangle gear on this 16 GiB machine although it needs 4 GiB). Not run: flower_l (1.44M triangles).

**Install checks.** `verify-install.ps1` now asserts exactly two exportable masters and runs the Master Mold alone (no `--generate-mold`) from a hostile environment, and checks that the worker reports its own peak. Results on this machine, 2026-11-24: installed folder (1,590 files) all checks pass; portable ZIP extracted to a fresh folder all checks pass; MSI install, upgrade, uninstall, and the upgrade/uninstall while Craft is running all pass (`verify-installer.ps1`). The installed Master Mold peaks at about 26 MiB on the bracket. The MSI is unsigned.

## Duck stage (added)

New: `MasterCoverage.*`, the two-direction release census (a necessary condition for any two-part split by translation, in any two directions), used to rank the release axes tried for a curved seam and to state in a failure whether the part has a witnessed obstruction (every pair traps mold) or the search was too narrow (some pair traps nothing). `TriangleIntersection` classifies intersecting triangle pairs (crossing, coplanar overlap, touch); the preflight refuses only crossings and overlaps. The preflight now also covers meshes above 20,000 triangles with a grid search.

Tried and removed: halves that leave in two different directions (shadow of the product by prism union, ledge slab, generalised masters and sweeps). It never reached a success (half B in several bodies on a two-slot block, half A pinched on the duck), so it is not in the tree; the patch is in `D:\CraftNative\logs`.

Result on the duck: `no_feasible_plan` in 22.6 s, with the census in the message: the best opposite pair traps 6.1 mm^3, the best pair of any two directions traps 0.0 mm^3.

Second attempt (2026-11-24): the two-direction builder was restored in a scratch edit with per-body diagnostics and exact dust removal, run on the duck, and removed again. Findings in the report, section 8. Patch: `D:\CraftNative\logs\duck-second-attempt-two-direction-with-dust-removal.patch`. The tree is unchanged by it.
