# Master Mold repair: report

Branch `feature/native-desktop-migration`, worktree `D:\CraftNative\worktrees\native-desktop-migration`, started from commit `5187628`. Nothing in this work is committed: the deletions are staged, everything else is unstaged. All measurements were taken on 2026-11-24 on one machine (Intel Core i7-8550U, 4 cores / 8 threads, 15.9 GiB, Windows 11, MSVC 17, Release, Qt 6.8.3). "Digital validation" below means the checks the software itself runs; nothing in this report has been printed, cast or demolded.

## 1. What Master Mold is now

From an imported model, with no Split by Face, mold or cut, the Master Mold command returns exactly two independent, printable, rigid master tools (Master A and Master B), or a structured failure. Each master is an open-top casting tool: base, integral walls, the positive impression of one working-mold half, registration pits or pins of complementary polarity, and (on A) the post that forms the final-cast inlet. Mold-making material is cast into each master separately; the two cast halves are then assembled to cast the product. The two virtual working halves are computed and previewed but never exported. The three material roles (printed master, working-mold material, final cast material) are kept apart, and none is assumed flexible.

Failures carry one of: `invalid_input`, `no_feasible_plan`, `blocked_release` (with the release stage), `unresolved_verification`, `resource_limit`, `internal_error`. A success cannot be constructed without passing `validateMasterPlan` (two masters, each one closed manifold body with no zero-area triangles, fill volume matching its half, complementary keys, every release check verified with a recorded method, fidelity measured and in tolerance, residual uncertainty stated); a decoded success is re-validated, so bytes cannot promote a plan.

## 2. Root causes found in the old code

Confirmed in code and by running it (baseline: commit `5187628`, 7 Master tests green, duck blocked in 2.6 s):

1. **The contract was wrong, not the search budget.** The planner produced 2-6 working-mold pieces with up to 4 tooling pieces each, plus a "sacrificial-recommended" non-result. The product needs exactly two masters. No cap, beam or threshold change could have fixed that.
2. **The planner could express only flat cuts per piece, with one patch-level accessibility veto.** Parts such as the duck produced dozens of interlocking fragments.
3. **The preflight's self-intersection test was not robust.** `trianglesIntersect` took float32-rounded, nearly coplanar wall triangles through the Moller path, where the line of intersection of two planes at 1e-7 rad is arbitrary, so disjoint triangles 7.5 mm apart were flagged and the small gear was refused. (The pass existed and ran up to 20,000 triangles; the old header comment saying it was not implemented was stale.)
4. **Release was checked at discrete steps with exact Booleans**, which cannot prove the motion between steps and was the dominant cost.
5. **Memory estimate and the benchmark both misled.** The refusal threshold (9 KB/triangle) was 2.6 times the real need, and the benchmark reported the application process's peak, which says nothing about a job running in another process.

## 3. Deviations from `master.md`

- Its product model (variable pieces, sacrificial fallback, a six-direction ordered-peeling voxel fallback) was not implemented; the directive supersedes it. No voxel stair-steps, side plugs or trapped-volume erasure exist anywhere.
- Its "duck must succeed" acceptance criterion is superseded by the two-piece constraint. The duck is reported as not solved (section 8).
- Its fix 4 (drop sliver patches) and fix 5 (relax coverage to 0.95) were not needed: patches no longer exist.
- Its timeout recommendation was not followed: the 180 s limit is unchanged. The one part that exceeds it (`gear_l`) is reported as such.
- It names the preflight refusals "small gear and small ring". The ring fixture is not on this machine; by triangle count the "medium ring (160,000)" matches `flower_m`, so the ring is probably the `flower_*` part, but that mapping is inferred, not confirmed.

## 4. Algorithm

Single pipeline, `core/master/MasterTwoPart.cpp`, stages `analyzing_geometry`, `searching_release_axes`, `choosing_seam`, `building_working_halves`, `inverting_masters`, `verifying_release`, `finalizing`.

1. **Preflight.** Finite coordinates, welded topology, winding, volume, components, degenerate and duplicate faces, and an exact grid-based self-intersection search with a work cap. Coplanar-to-float32 triangles (within four float32 ulps of the largest coordinate, `containmentToleranceMm`) are judged by overlap in their plane; genuine crossings, shallow crossings (tested at 3 degrees) and overlapping coplanar faces are still refused. Intersecting pairs are classified: a crossing or an overlap in one plane is a self-intersection (refused), a touch (an edge or corner of one triangle resting on another) is only a contact (a warning). If the work cap is hit the result says so rather than claiming a clean pass.
2. **Release axis, flat seam.** For an axis u, half A pulls toward +u and half B toward -u. A flat seam at offset c is release-compatible exactly when no face looking against u lies above it and no face looking along u lies below it. Over the triangles that is a closed interval `[max projection of against-facing faces, min projection of along-facing faces]`, computed on every triangle for world axes, principal axes, dominant face normals, a Fibonacci sample and a local refinement. Coarse sampling never proves anything safe.
3. **Release axis, curved seam (when no flat seam works).** With pure translation, a mold point can leave upward only if no product lies above it in its column and downward only if none lies below, so a seam z = h(x, y) exists exactly when every column meets the product in at most one interval and then lo <= h <= hi there; two intervals leave mold between them that can go neither way. The bounds are taken from the faces (downward-opening face: h at or above it over its footprint; upward-opening: at or below), evaluated exactly over each face clipped to the cells around each grid vertex, so the piecewise-linear seam cannot dip through a face between vertices. A projected relaxation picks the smoothest seam inside the bounds. Grid 64 then 160 cells, four most promising axes.
4. **Working halves.** Envelope B around product P; W_A = (B - P) above the seam, W_B = (B - P) below it, final-cast inlet (a channel whose base disc lies wholly inside the product, so it cannot form a blind pocket) and three registration keys that stand vertically across the seam (A: two pegs and one socket; B: the complements). Each half must be one closed manifold body.
5. **Masters.** Each half is placed with its seam face against the master floor and the impression rising from it (B is turned over by a proper rotation, not a mirror): `M_i = E_i - (T_i(W_i) + headspace)`. The fill volume reconstructed from the built master must equal the half's volume. Master walls, base, freeboard and key sizes come from `MasterProcessProfile`; nothing is added to the impression surface.
6. **Verification on the final feature-complete solids**, four release motions (cast half out of its master, halves apart, product out): every obstacle face that opposes the motion is extruded back over the moving solid and intersected with it exactly (a continuous swept-volume test, not samples). A real overlap is `blocked_release` at that stage; an overlap that cannot be classed is `unresolved_verification`; more opposing faces than the budget allows is also unverified, never a pass. The mating halves and the product are checked for overlap, and reproduction fidelity is measured as the symmetric-difference volume of (assembled halves vs product + inlet) per unit product area.
7. **Material estimate**: fill volume per master plus a waste margin; mass only when a density is supplied.

Tolerances and their basis: input resolution 2e-7 of the largest coordinate (float32 STL, about 12 times the observed spread); zero-draft threshold sin(angle) 1e-5; overlap blocked above 1e-3 mm^3, clear below 1e-6 mm^3; an overlap that is only a film no thicker than twice the kernel tolerance (2V/A of the overlap solid) is contact, not interference (a peg standing in a pit of the same radius otherwise reads as 2e-6 mm^3 of "overlap"). Zero-draft faces are reported as warnings with their area.

## 5. Component inventory and ledger

Full ledger with reasons and verification: `MASTER_MOLD_REPAIR_LEDGER.md`. In short: deleted `MasterWorkingMoldPlanner`, `MasterWorkingMoldConstructor`, `MasterMultiLabel`, `MasterRegionDirect`, `MasterTooling`, `MasterMultiPiece`, `MasterAccessibility`, `RayBvh`, the old piece-count profile, the old store and wire types, the 75-test web-parity suite (`tst_master_equivalence`) and its fixture. Replaced `MasterEngine`, `MasterMoldStore`, `MasterWire`, `MasterPlanning`'s profile and identity, the export module and the panel model. New: `MasterContract`, `MasterTwoPart`, `MasterProfile.h`, `JsFormat` (`jsToFixed` moved out of the deleted accessibility file because `core/reports` uses it). Retained shared code: seed, preflight, `TriangleIntersection`, the Manifold engine seam, the geometry worker, cancellation and timeout. In the repository as a whole the staged and unstaged tracked changes are 9,143 deletions against 934 insertions; the new files are untracked and not in that count. A search finds no stale symbols outside the historical documents.

Intentional behaviour changes: output is two masters, never 2-6 pieces; sacrificial and flexible fallbacks are gone; the progress stage names changed; the export manifest is format version 2 (masters, virtual halves, release checks, fidelity, material estimates, print transforms, residual uncertainty); cached results of the old contract are stale by construction because the staleness identity includes the contract version and every profile field.

## 6. Measurements

Commands (all Release):

```
Craft.exe --project-bench out.json --bench-kind master --import part.stl      # CRAFT_BENCH_MASTER_TIMEOUT_MS raises the 180 s limit for a measurement
Craft.exe --smoke-test --import part.stl --master-mold --summary s.json       # Master Mold alone: no --generate-mold
tst_master_twopart.exe realFixture_fromEnvironment                            # with CRAFT_MASTER_STL=<binary stl>; preflight: CRAFT_PREFLIGHT_STL
```

Before (old planner, from `master.md` unless noted) and after (this work). "Worker peak" is the geometry worker process's own report of its peak working set; the old figures were not measured that way.

| Part | Triangles | Before | After | Worker peak |
|---|---|---|---|---|
| Duck (`Tubby_Duck_in_Parts.stl`) | 242,884 | blocked, 2.6 s (reproduced; the preflight skipped it above 20,000 triangles) | `no_feasible_plan`, 22.6 s, with the census evidence in the message (section 8) | 199 MiB |
| cup_s | 2,640 | blocked, 10.2 s | success, 5.0 s | 190 MiB |
| cup_m | 85,200 | blocked, 54.7 s | success, 18.1 s | 341 MiB |
| cup_l | 956,000 | not reported | success, 157.5 s | 3,049 MiB |
| flower_s ("ring") | 6,400 | refused by preflight | success, 1.8 s | 49 MiB |
| flower_m | 160,000 | success, 125.7 s (as "medium ring") | success, 50.7 s | 467 MiB |
| gear_s | 7,680 | refused by preflight | success, 3.1 s | 54 MiB |
| gear_m | 184,320 | success, about 450 s | success, 40.7 s | 534 MiB |
| gear_l | 1,536,000 | not reported | success, 320.7 s (limit raised for the run) | 4,065 MiB |
| flower_l | 1,440,000 | not reported | **not run** | |

Preflight alone: gear_s 0.1 s, gear_m 1.8 s, gear_l 14.8 s, cup_l 7.6 s, all `valid`; a 159,200-triangle sphere 0.6 s. Not re-run in this work: the sphere (20k to 1.3M triangles) and torus (405k) timings of `master.md`; a 57,120-triangle sphere takes 6 s end to end in `tst_master_twopart`. `estimateMasterMoldPeakBytes` is now 256 MiB + 3.5 KB per triangle (was 64 MiB + 9 KB); a test checks it against all eight measured peaks.

## 7. Tests and checks

Run on this machine, all passing: the full CTest suite, 53 tests (`ctest --preset windows-release`), including the new `tst_master_contract`, `tst_master_twopart` (planner, census and preflight, 34 test functions, five of them optional and skipped without an environment variable), rewritten `tst_master_store`, `tst_master_wire`, `tst_master_export`, `tst_long_paths`, `tst_geometry_worker`, `tst_app_workflow`, `tst_mold` (memory estimate), and `app_smoke_master`, `app_smoke_master_flag` and the new `app_smoke_master_standalone` (imported model, `--master-mold` only).

Coverage against the directive's table:

| Directive row | Result |
|---|---|
| Box, sphere, cylinder, tapered solid | exactly two masters, both release stages and fidelity pass; every success is re-verified by code that shares nothing with the planner's sweep (halves rebuilt from their meshes, no overlap, stepped sliding, each cast half mapped into its master's print frame and lifted out) |
| Asymmetric releasable organic shape, off-axis version | dimpled blob and its scaled, rotated copy succeed; rotated box and rotated tapered solid succeed and the tapered one follows its rotated axis |
| Nonplanar two-part fixture | a wavy plate with no flat seam on any tested axis (four axes asserted), and the plate rotated 37 degrees, succeed with a height-field seam |
| Thin gaps, degenerates, real self-intersection, tiny detail | preflight tests: wall triangles coplanar to float32 pass; crossing boxes, a 3 degree plate through a wall, and an open mesh are refused with the right code. Real thin-gap and tiny-detail fixtures were not built |
| Duck, cup, ring, gear, torus | table in section 6; the torus is a unit-test fixture (succeeds), the 405k-triangle torus of `master.md` was not re-run |
| Rigid-release trap | a hollow sphere and a cube pierced by three orthogonal holes return `no_feasible_plan` (or `invalid_input`) with the message that it is a bounded search, not proof |
| Registration and inlet | complementary key ids are a validator rule; the inlet is required to start inside the product; independent checks confirm the halves and masters mate. A feature-induced lock is rejected by the same sweep |
| Dense sphere / high triangle count | 57k-triangle sphere in 6 s; the 956k and 1.5M-triangle parts above; cancellation tested on a real worker job |
| Standalone command, UI, worker, export | import, Master Mold, two exports, failure clears stale output, cancel and reset kill the worker (`tst_app_workflow`, `tst_geometry_worker`, `tst_master_export`) |
| Mold Generator unchanged | the unchanged `tst_mold`, `tst_mold_wire`, `app_smoke_molds` and `app_smoke` pass; this work did not touch the mold code |

Packaging, `verify-install.ps1` (now asserting exactly two exportable masters, plus a Master-Mold-alone run from a hostile environment that checks the worker reports its peak): installed folder (1,590 files) all checks pass; portable ZIP extracted to a fresh folder all checks pass; MSI install, upgrade, uninstall, and upgrade and uninstall while Craft is running pass with the per-user registry and Start menu restored exactly. The MSI is unsigned. The installed Master Mold on the bracket peaks at about 26 MiB.

## 8. Remaining limitations (what is not done)

- **The duck is not solved, and the reason is now measured.** The result is `no_feasible_plan` in 22.6 s (worker peak 199 MiB). Everything below was measured on `Tubby_Duck_in_Parts.stl` (242,884 triangles):
  - *Preflight (new, now covers the duck).* The self-intersection pass used to stop at 20,000 triangles, so the duck was never checked. It is now: 41 triangles rest on other triangles of the base without passing through them (a wall's bottom edge on a flat base sliver, at z about 0.0002 mm). They enclose no volume twice, so the status is `repairable-warning` (`surface_contact`) and the planner runs. A first version of the new check refused the duck as self-intersecting because it could not tell a touch from a crossing; the classification (crossing, coplanar overlap, touch, with the plane distance scaled by how sliver-like the triangle is) is tested on the exact triangle pairs from the duck.
  - *Flat seam:* none on any of 169 axes (best gap about 55 mm). *Curved seam:* none on the six axes tried, chosen by the census below plus the closest flat ones (1,500 to 2,000 of about 25,000 seam vertices have no valid height).
  - *Census (`MasterCoverage`, 0.72 mm voxels, 102 directions, 1.7 s).* A voxel census counts the mold blocked along both directions of a pair; it leans toward "free" (a thin feature or a ray slipping between voxels counts as free), so a large trapped volume is a real obstruction. Best pair of opposite directions: 6.1 mm^3 trapped (0.0011 % of 550,095 mm^3). Best pair of any two directions, (0.03, -0.32, 0.95) then (-0.23, -0.30, -0.93), 143 degrees apart: **0.0 mm^3 trapped.** So a two-part split by translation very probably exists, but not one whose halves leave in opposite directions: the failure is a limit of this planner's search, not a witnessed obstruction of the part. The same census on a hollow sphere reports exactly its cavity (4,189 mm^3 expected, within 20 %), which is what a witnessed obstruction looks like.
  - *What building it needs, learned by trying.* Half A is everything above the product's upper envelope along the first direction; half B is its shadow, released along the second. I built that (shadow = union of the downward prisms of every up-facing face: 159,421 prisms for the duck, about 110 s and 571,000 triangles; a ledge slab under everything for the keys; the halves, masters and sweeps generalised to two directions) and removed it again, because it never reached a success. On a two-slot block it stopped at half B in three bodies: a pocket that is blocked both ways along the first direction and opens sideways is joined to the rest of B only through mold that is free along the first direction, so B needs connecting tubes that are themselves closed backward along the first direction. On the duck it stopped at half A in 25 to 34 pinched bodies where the shadow's skirt meets thin silhouette edges. The patch is kept outside the repository (`D:\CraftNative\logs\duck-stage-with-two-direction-experiment.patch`, with `MasterCoverage.*`) for whoever continues.
- **Scope of the planner:** opposing translation along one axis per half; a seam that is a height field. A part needing anything else is `no_feasible_plan`.
- **Air entrapment** is geometric only (no fluid simulation): the master fill is certified free of overhangs above the bed, and local high points of the product cavity not served by the inlet are warned about. No working-mold vents beyond the inlet are generated.
- **Zero-draft faces** (parallel to the pull within 1e-5) slide in the digital model and are reported with their area; real casts need draft or clearance, which the profile does not yet add to non-impression faces. The seam of a curved split leaves a faceted line on the cast product.
- **Fidelity metric** is a mean (volume per area), not a Hausdorff bound.
- **Test thresholds**: the independent cross-checks in `tst_master_twopart` accept 1e-2 mm^3 of film overlap while sliding (rotated float32 walls leave films of a few thousandths); nothing real in the fixtures is that small, but it is a loosening from the 1e-4 first used, made after the film analysis in section 4.
- **Memory constants** are fitted to eight measurements on one 16 GiB machine, one build, one run each; other machines and parts may differ. flower_l was not run.
- **Not covered:** thin-gap and tiny-detail fixtures, the 405k torus and the sphere series of `master.md`, a cup or gear with a through-hole beyond what the three families contain, signed packages, other operating systems.
- **Documentation:** the older documents in this folder (`PARITY_MATRIX`, `RISKS`, `DECISIONS`, `WINDOWS_COMPLETION_MATRIX` and others) still describe the retired planner and the 75-test parity suite; only the ledger and this report are current.

## 9. Physical validation status and plan

None has been done: no master has been printed, no half cast, no product poured. Digital success is not physical qualification: shrinkage, adhesion, print quality, release agent, material properties and the inlet's real behaviour are not modelled (the plan lists these as residual uncertainty). A reproducible plan:

1. Generate and export for a part with a flat seam (e.g. the cylinder or the bracket). Print Master A and Master B in the orientation exported (bed on z = 0, open face up); record layer height, material, wall settings.
2. Measure each print against the manifest (`bounds`, `volumeMm3`, `fillVolumeMm3`, `minimumWallMm`); seal and release-agent the masters per the working-mold material's data sheet.
3. Fill each master to the rim with the working-mold material (the manifest gives the volume with waste margin, and mass when a density is supplied); cure; demold each half and note the force and any binding at the zero-draft faces.
4. Measure each half against the virtual half dimensions; assemble with the keys and check the seam gap.
5. Cast the product through the inlet; demold; compare with the original model dimensionally; record any air voids and where, and compare with the report's vent warnings.
6. Repeat once with the curved-seam fixture (the wavy plate) to learn how the seam line prints and casts.

## 10. How to inspect the two masters and the virtual halves

- In the application: import a model, press Master Mold (toolbar or Inspector). The viewport shows Master A and Master B side by side next to the part; the "Master Mold pieces" list has two groups, "Printable masters" and "Working-mold halves" (virtual, hidden by default; tick them to see them in the part's own frame). Isolate and Show all work per group. The banner shows a failure's code, release stage and first diagnostic.
- Export: Export Master tooling writes `<model>_master_A.stl`, `<model>_master_B.stl`, one 3MF with both on a plate, and `manifest.json` into a fresh folder, nothing overwritten; the manifest lists the virtual halves as `exported: false` with their volumes and bounds, the seam, every release check with method and note, fidelity, material estimates and the print transform of each master.
- From the command line: the bench and smoke commands in section 6; `tst_master_twopart` with `CRAFT_MASTER_STL` for any binary STL.

## 11. Definition of done, gate by gate

| Gate | Status |
|---|---|
| Exactly two independent rigid printable masters, automatically, no Split by Face | met on the suite above |
| Each master yields its working half; halves assemble and release the product | met digitally for every success; flat and one curved fixture; **not physically validated** |
| Mold Generator preserved | met (unchanged and passing) |
| Superseded Master-specific implementation removed | met (ledger); older prose documents not yet updated |
| Measured correctness and performance reported | met for the parts listed; flower_l and some historical rows not run |
| The duck | **not met**: reported honestly as not solved |
