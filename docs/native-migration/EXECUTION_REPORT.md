# CRAFT NATIVE MIGRATION — EXECUTION REPORT

Written 2026-11-20 at the end of the execution that began 2026-11-17. Every figure below was measured in that execution; where something was not measured, it says so. The detailed record is `EXECUTION_LOG.md` (51 sessions), `DECISIONS.md` (D-001 to D-107), `RISKS.md` and `PARITY_MATRIX.md`. Open work with its status is in `Craft_Native_Remaining_Work.md` (outside the repository).

**This migration is not complete.** Gates 0 to 6 are met for what can be verified on this Windows machine. Gate 7 (macOS, installer, signing, CI, release) is not met, and the Qt licensing decision that blocks any release is open. The TypeScript frontend and the Python engine remain the behavioural reference.

## Repository / branch / commit
- Repository: `C:\Projects\Mold-SaaS` (remote `origin` `https://github.com/mohammed09001/craft.git`); the user's checkout was not modified.
- Work done in the worktree `D:\CraftNative\worktrees\native-desktop-migration`, branch `feature/native-desktop-migration`, from `main` @ `98082a9`.
- 57 local commits on the branch (head: the commit that adds this report; the one before it is `35a642b`). 272 files changed against the base: +295,037 / -55 lines.
- **Nothing has been pushed.** Pushing, pull requests and releases need explicit instruction.

## Platform actually used
Windows 11 Home 10.0.26100, 8 logical cores, 15.9 GiB RAM, Intel UHD 620 (integrated), a 75 Hz display. Visual Studio 2022 Build Tools (MSVC 17), CMake 4.4.3, Ninja, Qt 6.8.3 (msvc2022_64) with Qt Quick 3D, Node 22, Python 3.13.17. All timings come from this one machine.

## C: free space before/after
126.9 GB at the start (session 1), 124.3 GiB now. The two readings use different units and the drop (at most about 3 GB) was not attributed; TEMP and caches were routed to D: from the start.

## D: free space before/after
Not recorded at the start (only the footprint, about 1.25 GB). Now: 1453.6 GiB free, 409.3 GiB used on D:, of which `D:\CraftNative` is 10.4 GiB (build trees 9.0 GiB, scratch 0.4 GiB, worktrees 0.3 GiB, dependencies 0.2 GiB).

## SDKs and dependencies used (with absolute install/cache paths)
- Qt 6.8.3 `D:\Qt\6.8.3\msvc2022_64` (existing; Qt Quick 3D and Quick Timeline added with aqtinstall, additive).
- CMake, Ninja, VS 2022 Build Tools `D:\Craft 3D Requirement\toolchains` (existing); Windows SDK 10.0.26100 on C: (pre-existing, the only mandatory C: footprint).
- Python 3.13.17 `D:\CraftNative\sdk\python-3.13.17`, virtual environments `D:\CraftNative\python`; the official embeddable distribution bundled in the package, pinned by URL and SHA-256 in `native/packaging/pins.json` (trust on first use: not yet compared with python.org's published checksum).
- Node 22 `D:\CraftNative\tools`. Manifold v3.5.1 source `D:\CraftNative\deps\fetchcontent` (fetched from GitHub at configure time; offline builds need a pre-populated `FETCHCONTENT_BASE_DIR`). Clipper2 (through Manifold).
- Build trees `D:\CraftNative\build\<preset>`, install staging `D:\CraftNative\staging`, caches `D:\CraftNative\caches`.
- Licences: Qt Quick 3D is Commercial or GPL-3.0 and Craft's own licence is undecided (R-License-1): **blocks any release**. Inventory in `licenses/THIRD_PARTY_NOTICES.txt`.

## Source files created/modified
- `native/` (227 files, about 295,000 lines including fixtures): `core` (91 source files, about 19,900 lines: contracts, mesh analysis, view math, mold, master, project, reports), `io` (STL, project container, tooling export), `engines` (Manifold seam, Python bridge, analysis kernels in C++), `app` (39 files, about 9,500 lines: controller, scene model, jobs, QML), `tests` (30 files, about 12,400 lines, plus recorded reference fixtures), `packaging`, `cmake`.
- `docs/native-migration/` (12 documents), `scripts/native/` (25 scripts: environment, reference fixture generation, packaging, UI tour, crash drill, viewport tools).
- `mold/` (8 files): bit-exact speedups of the Python pull-direction analysis (`ray_mesh_bvh.py`, `evaluation.py`, three call sites) with their tests. **No frontend file differs from the base.**

## Native architecture implemented
Layers with no upward dependencies and no engineering logic in QML: contracts/tolerance/mesh analysis/grounding/view math/picking (`native/core`, no Qt); STL and project formats (`native/io`); mold algorithms (reference block, Cut by Face, cavity, sprues, registration, segmentation, Master Mold); the kernel seam `IMeshGeometryEngine` with native Manifold 3.5.1 statically linked; a Python analysis bridge (a local worker process, JSON lines, versioned protocol, strict job/result matching, cancel and timeout kill the worker) plus C++ kernels the worker loads through ctypes with a self-check and a pure-Python fallback; Qt Quick 3D viewport adapters; the controller, scene model and job runner. Heavy work runs on the thread pool with cancellation tokens and generation numbers, so stale results are dropped. Millimetres, Z-up and the reference tolerance policy are kept. No Electron, Tauri, WebView or cloud.

## Commands executed (the ones that matter; the full list is in the log)
`. scripts\native\windows-env.ps1`; `cmake --preset windows-debug|windows-release|windows-package`; `cmake --build --preset ...`; `ctest --preset windows-debug|windows-release`; `scripts\native\generate-reference-fixtures.ps1` (runs the real TypeScript runtime to record the fixtures the C++ tests replay); `scripts\native\build-package.ps1`; `scripts\native\verify-install.ps1`; `scripts\native\ui\native-tour.ps1` and `reference-tour.ps1` (UI walk-through with a layout lint); `scripts\native\crash-drill.ps1`; `pytest`, `ruff check`, `ruff format --check`, `npm run typecheck`; benchmark and measurement tools in `scripts\native\`.

## Build/test results (PASS/FAIL/SKIPPED and evidence)
Measured in the final verification, 2026-11-20:
- **Debug `ctest --preset windows-debug`: PASS, 38/38** (about 6.5 minutes), repeated at the end of each increment; `tst_app_workflow` alone has 82 test functions. The Debug run SKIPS the Master Mold fallback-construction equivalence rows (about 55 minutes in Debug).
- **Release `ctest --preset windows-release`: FIRST RUN 36/38, then both failures fixed.** `tst_master_equivalence` timed out at the shared 300 s (it needs 1006 s in Release; it now has its own 1800 s) and `tst_app_workflow` had one test that only passed in Debug (side effects inside `Q_ASSERT`). After the fixes both passed in Release (1006 s and 30 s) and the fixed test in Debug. **One complete Release `ctest` in a single run was not repeated.** Until this run "all tests pass" meant Debug (R-Test-1).
- **Package:** `build-package.ps1` then `verify-install.ps1`: **PASS**, all checks (layout, dependency closure of 131 binaries, a hostile-environment run, the bundled Python serving the analysis, STL import, mold, both analyses, a rendered frame, no QML/Qt warnings, install folder untouched). Installed layout 133.1 MB, portable ZIP 71.2 MB (`D:\CraftNative\build\windows-package\packages\Craft-0.1.0-windows-x64.zip`).
- **Existing Python suite:** `pytest` PASS, 395 passed (357 at the baseline; the other 38 are the engine speedup tests, which are parametrised). `ruff check` and `ruff format --check` **FAILED** in the first final run (my engine speedup files: three B023 errors and four unformatted files; both passed at the baseline), then fixed: both PASS.
- **Existing frontend:** `npm run typecheck` PASS. Frontend tests, lint, build and Playwright were not re-run (no frontend file changed). At the baseline one suite, `scripts/checkBundleBudget.test.mjs`, failed to load on Windows (a shebang parse error, not caused by this branch).
- **UI tour:** 13 states, 39 captures, 0 layout lint findings, 0 tour problems.
- **Evidence against the reference:** 13 generators (`native/tests/reference/*.test.ts`) run the real TypeScript runtime and record 14 fixture files that the native equivalence tests replay (mold and cavity, sprues, registration, segmentation incl. the keyed plan preview, Master Mold, selection, cut planes and their drag, undo, reports and readiness, look, ruler). Most changes were also checked with mutation tests, logged per session; a number of these found real gaps in the tests, which are described in the log.

## Functional capabilities actually working
Verified by the tests and the package check above, on Windows:
- Native Qt/QML application with a Qt Quick 3D viewport: STL import (ASCII and binary, up to 512 MiB; refuses larger), grounding, adaptive grid, camera fit/orbit/pan/zoom, ruler, selection with the box, face picking, point-to-point measurement, light and dark themes, drag and drop, a sectioned inspector, a Molds browser (hide a body or the model).
- Reference mold block, Cut by Face (checkboxes or clicking the box, planes as slabs, the Eraser, right-button plane drag), cavity (zero clearance and offset cavities with the reference's "high" quality by default, "standard" selectable), sprues (3D preview, placement, resize rings, numeric edit, undo/redo, per-sprue result cache), registration keys, STL export of the mold bodies.
- Segmentation: planning from the printer volume, user extension planes (numeric), the keyed plan preview computed in the background, execution into sections with keys, feeding the mold pipeline.
- Master Mold: the full engine and tooling stage, toolbar button and panel, stale ghosting, piece visibility, STL export of the tooling pieces with a manifest.
- Python engine in a bundled, isolated runtime: import analysis, moldability (pull direction, undercut, draft), cavity analysis, generation readiness; the pull-direction analysis is far faster than before (a 10,800-face box in 3.4 s instead of 9 to 15 minutes), bit-exact.
- Project files (`.craft`): save, open, autosave, crash recovery (tested with a real process kill: 26 of 26 rounds), integrity checks, atomic writes, progress and Cancel for save, open and import.
- Large models: loads and renders 10.7M triangles (the limit) in about 2.5 s; a mold that cannot fit in free memory is refused with the numbers; Master Mold timeout and cancel release the application at once.
- Windows portable ZIP with the bundled Python runtime.

## Features remaining / known limitations
Not done or not verified (details and numbers in `RISKS.md` and the remaining-work file):
- **Platform and release:** macOS (nothing built or run), the Windows installer (WiX not installed, download denied), signing, an update mechanism, CI (no job runs ctest; the checked-in workflow was not verified to augment the TS/Python checks), a clean-machine package test, the Qt and Craft licensing decisions, legal review.
- **Reference parity not reached:** Flip / automatic part orientation, 3D dragging of segmentation extension planes (the reference's behaviour is recorded in D-101; native edits them numerically), protected-region merge from a committed mold (evidence incomplete), 3MF export, edge/wireframe overlays, a per-body mold colour cue, shadows and some part-role colours not compared. Master Mold is not claimed parity-complete (R-Master-1, R-Master-3): it is slow on free-form parts and its multi-label construction never succeeds in the reference either.
- **Measured limits:** a mold needs about 1.3 KB per triangle (10.7M triangles would need about 13 GiB) and Master Mold 7 to 8 KB per triangle; a cancelled or timed-out run's thread keeps running until its Boolean returns; saving or opening a 512 MiB project takes 13 to 15 s (SHA-256 and disk writes); parsing and model building cannot be interrupted. Orbit rate and GPU memory at 10.7M triangles, the other engines at that size, and non-sphere geometry were not measured.
- **Unexplained:** three real-event smoke failures (R-Smoke-1: not reproduced in 217 stress runs) and one more (R-Smoke-2: one failure in 32 runs); all passed on rerun.
- **UI:** keyboard and accessibility, HiDPI and translations were not checked; several lists rebuild their widgets on every change, which drops the keyboard focus (R-UI-5). Not pixel-compared with the reference anywhere; the look was matched by measurement and is close, not identical (R-Viewport-1).
- **Project format:** no real older format exists, so the migration chain is empty and tested only with injected steps; the app writes embedded projects only.
- **Process:** the Debug configuration was the one routinely tested (R-Test-1).

## Windows status
Working and verified as above, on one machine. The portable ZIP builds, installs from its folder and passes all its checks. Not a releasable product: unsigned, no installer, and the licensing decision is open.

## macOS status (unverified until Mac runner executes)
**Unverified.** CMake presets exist; nothing was configured, built, launched or tested on macOS (the macOS work was stopped at the user's request), no relocatable Python was bundled for it, and the memory probe returns "unknown" there. No macOS claim is made.

## Next exact implementation step
What is blocking, with the smallest action each needs from you:
1. Decide the Qt licence (Commercial or GPL-3.0) and Craft's own licence; nothing can be released before this.
2. To get an installer: install the WiX Toolset or allow its download; to sign it, provide a certificate.
3. For Gate 7: a macOS runner (or a Mac) to configure, build, launch and test the presets, and a CI job that runs `ctest` (Debug, and Release for the Master Mold fallback rows) next to the existing TS and Python checks.
4. Say whether to push the branch and open a pull request.

What I can do next without any of that: speed up save and open at the limit (skip the second SHA-256 of the model, defer writing the analysis cache), measure orbit rate and GPU memory at 10.7M triangles, port the 3D drag of extension planes once its three open questions (D-101) are settled against the real reference, and a complete single-run Release `ctest` as the last gate before any push.
