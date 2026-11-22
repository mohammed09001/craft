# Windows Completion Matrix

Scope: **Windows x64 native desktop only.** macOS is deferred (see the last section). Derived from `PARITY_MATRIX.md`, `RISKS.md` and `EXECUTION_REPORT.md` (checkpoint `018c7cc`, 2026-11-20) and re-checked against source in this session (2026-11-21).

Status vocabulary: `pass`, `fail`, `blocked` (needs an owner decision or something unavailable here), `not tested`, `in progress`.
Three separate completion levels are tracked and none is claimed until all its rows pass:
**(E) Windows engineering complete**, **(P) Windows packaging complete**, **(L) Windows legally ready for distribution**.

## P0 - release blockers

| ID | Item | Module | Test / measurement | Status | Evidence | Acceptance |
|---|---|---|---|---|---|---|
| P0-1 | Full Debug CTest in one run | all | `ctest --preset windows-debug` | pass (checkpoint) | EXECUTION_REPORT: 38/38, ~6.5 min. Re-run after this session's changes: see session log | 0 failures; Master fallback rows skipped in Debug by design |
| P0-2 | Full **Release** CTest in one run, including `tst_master_equivalence` | all | `ctest --preset windows-release` (one invocation) | **pass (2026-11-21)** | One invocation of ctest --preset windows-release on 018c7cc (before the 3MF commit): 38/38 passed, 1123.91 s, build exit 0, log D:CraftNativelogselease-full-ctest.log. Must be re-run on the final tree before any release claim | 0 failures, count and duration recorded |
| P0-3 | Mold geometry validity vs the reference | core/mold, engines | equivalence suites against fixtures recorded from the real TypeScript runtime | pass (checkpoint) | 13 generators, 14 fixture files, mutation-tested | unchanged; re-run with P0-1/2 |
| P0-4 | No data loss: project save/open/autosave/recovery | io/project | tst_project 26, tst_app_workflow, crash-drill (26/26 real kills) | pass (checkpoint) | R-Project-3 | unchanged |
| P0-5 | Cancelled / timed-out jobs do not hold the app or leak CPU/RAM forever | app jobs | D-106 | partial | A running Boolean cannot be interrupted; the thread ends in the background with its result ignored. Bounded, not preemptive | documented limit; blocker only if a measurement shows unbounded growth |
| P0-6 | Package installs and runs on a machine without Qt/Python/MSVC | packaging | `verify-install.ps1` (hostile environment); clean VM | partial | Hostile-environment run passes; no clean VM available here | blocked on a clean Windows image for the final row |
| P0-7 | Qt Quick 3D / Craft licensing decided | - | owner + legal | **blocked (owner)** | R-License-1 | decision recorded; NOT something engineering can close |

## P1 - required Windows functionality and parity

| ID | Item | Module | Test | Status | Notes |
|---|---|---|---|---|---|
| P1-1 | 3MF export of mold bodies, with read-back validation | io/threemf, AppController | `tst_threemf` (11 tests), `tst_app_workflow::threeMfExportMatchesTheMoldAndIsValidated` | **pass in Debug (2026-11-21)**; Release re-run pending; no third-party slicer import test | New: stored-ZIP writer + independent validator (CRC-32, unit, build items, closed 2-manifold, signed volume). Menu, inspector button, save dialog |
| P1-2 | 3MF export of Master Mold tooling pieces | io/tooling, app | tst_master_export (3 new tests), tst_app_workflow master export test | **pass in Debug and Release (2026-11-21)**; slicer import and an on-screen look at the export not done | D-109. One 3MF with every piece beside the STLs and the manifest, verified by read-back; no format choice in the UI |
| P1-3 | Automatic part orientation / Flip / manual orientation | core/model/PartOrientation, app | tst_orientation_equivalence (real-reference fixture), 6 workflow tests, tst_project | **pass in Debug and Release (2026-11-21)**, incl. app_smoke_flip (real mouse and key events) and a clean UI tour; person-eyes check and 10.7M-triangle flip timing still open (R-Orient-1) | D-108. Reference has no UI caller for auto orientation (only Flip); native adds an Auto orient button. Manual orientation in the reference is the arrow-key Flip, there is no drag rotation |
| P1-4 | 3D drag of segmentation extension planes | app (AppControllerCutPlanes, history), main.cpp smoke | 4 workflow tests (slab frame, drag, Eraser, undo), app_smoke_extension_drag (real mouse and key events) | **pass in Debug and Release (2026-11-21)**; other models, a re-opened project and an on-screen look not done | D-110. The three open questions settled from the reference code, not by running it; native keeps slab, plan and undo together where the reference code does not (R-PlaneDrag-4) |
| P1-5 | Protected-region merge from a committed mold | core/mold/Segmentation (readSegmentationSource), app | tst_segmentation_source_equivalence (real-reference fixture, 15 scenarios), 2 workflow tests | **pass in Debug and Release (2026-11-21)**; an on-screen look at the Inspector note not done | D-111. The earlier note "reference evidence incomplete" is closed: the reference function was run through its real stores |
| P1-6 | Edge/wireframe visibility, role/body colour cues | viewport (ViewportLook, MeshGeometryAdapter, SceneModel, ViewportView), Inspector | tst_viewport_look (real-reference roles and glass), tst_viewport (role buffers), 2 workflow tests, three real frames | **pass in Debug and Release (2026-11-21)**; key and funnel yellows not seen on screen | D-112. Role colours and the glass toggle ported; the reference has no wireframe mode and no per-body colour, so there is nothing more to port (feature edges and the Edges entry were already there). Key and funnel yellows not seen on screen (R-Viewport-9) |
| P1-7 | Undo/redo completeness (tools, segmentation, visibility, sprues) | app history | undo-reference.json replay (6 sequences from the real store, incl. body visibility), tst_app_workflow undo tests (cut faces, sprues, mold, extensions, visibility) | **pass in Debug and Release (2026-11-22)**; no sprue fixture from the real store | D-071..D-074, D-110, D-113. Audited against the reference store: the only missing record was body visibility (now in, with the reference reset on plane edits). Tools, selection, camera and the part toggle are not history in the reference either; segmentation plans have no history there (only extension boundaries, D-110). Sprue history is covered by controller tests, not by a real-store fixture (the reference sprue steps need geometry) |
| P1-8 | Master Mold honest completeness and failure handling | core/master | tst_master_equivalence | pass (as documented) | Not labelled parity-complete (R-Master-1/3) |
| P1-9 | Older `.craft` revisions | io/project | tst_project | pass (vacuous) | No older revision exists; chain empty (R-Project-1). Must add a real migration with the first format change |
| P1-10 | Linked-project UX | app | - | not started (decision needed) | Read/relink supported; nothing creates a linked project (R-Project-5). Recommended default: keep embedded-only for v1 and document |
| P1-11 | Windows-only native CI (CMake/CTest) | .github/workflows/windows-native.yml | workflow run | **written, not executed** | Debug CTest per push/PR, complete Release CTest nightly/manual; no macOS job; actions SHA-pinned like `ci.yml`, Qt via aqtinstall. Cannot be verified until pushed (needs your approval) |

## P2 - polish and performance

| ID | Item | Status | Notes |
|---|---|---|---|
| P2-1 | Keyboard navigation, focus retention, popup lifecycle | not tested | R-UI-5: lists rebuild widgets and drop focus |
| P2-2 | HiDPI / scaling / resize | not tested | |
| P2-3 | Long paths (> MAX_PATH), network/removable drives, read-only folders | not tested | R-Export-3 |
| P2-4 | Orbit rate and GPU memory at 10.7M triangles | not tested | Load time (2.5 s) was measured |
| P2-5 | Non-sphere representative parts for cavity / Master Mold timing | not tested | |
| P2-6 | Save/open at the 512 MiB limit (13-15 s) | measured | candidate optimisation: skip the second SHA-256 |
| P2-7 | Unexplained smoke failures R-Smoke-1/2 | open | not reproduced in 217 + 32 runs |
| P2-8 | Shadows, remaining part-role colours | not started | |

## Packaging, distribution, CI

| ID | Item | Status | Notes |
|---|---|---|---|
| PK-1 | Portable Windows x64 ZIP builds and passes `verify-install.ps1` | pass (checkpoint) | 133.1 MB layout, 71.2 MB ZIP; to be rebuilt after this session's changes |
| PK-2 | Installer (WiX or equivalent): install, Start menu, uninstall, upgrade, `.craft` association, data preservation | **blocked** | WiX not installed; download denied at the checkpoint. Re-check tool availability; if still denied, owner must allow it |
| PK-3 | Update strategy defined | not started | Documentation task; recommended default: manual download of a signed installer for v1, no in-app updater |
| PK-4 | Dependency + licence inventory of the release package | partial | `licenses/THIRD_PARTY_NOTICES.txt`; legal review is owner-controlled |
| PK-5 | Code signing | **blocked (owner)** | certificate required; never fabricated |
| PK-6 | Python runtime SHA-256 pin compared with python.org | not tested | R-Packaging-2 |

## Repository cleanup (single maintained app)

| ID | Item | Status | Notes |
|---|---|---|---|
| RC-1 | Inventory of every consumer of the web frontend | not started | fixture generators (`native/tests/reference/*.test.ts`), `ci.yml` jobs, docs, scripts |
| RC-2 | Preserve golden fixtures and test specs | not started | the 14 recorded fixtures already live under `native/tests/fixtures/reference` |
| RC-3 | Remove the web app in controlled, reversible commits | **gated** | only after native parity rows above pass and the fixture generators are replaced or archived; fixture regeneration needs the TypeScript runtime |

## Deferred / Future / Not Started - requires explicit user authorization after Windows reaches 100%

All macOS work: configuration, builds, tests, runners, packaging, signing, notarization, bundled Python runtime, SDKs, platform-specific code and parity investigations. Nothing in this section is on the active Windows critical path and none of it was started.
