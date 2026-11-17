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
### Next exact step
1. GPU frame-rate/VRAM measurement, WASM timing for the same inputs, and a visual comparison with the Three.js viewport on real STLs (Phase 2 gate).
2. Port positive cavity clearance (offset engines), then sprue, registration, segmentation, Master Mold.
3. `.craft` project format with atomic save/load; bundled Python runtime; installer; macOS CI job on a real runner.
