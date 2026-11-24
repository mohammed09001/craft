# Craft native migration

Goal: a native Qt 6 / QML / Qt Quick 3D desktop app with local C++ geometry (Manifold) and the
existing Python engine behind a versioned local bridge. The TypeScript frontend is untouched and, with the Python
engine, remains the behavioural reference. The only edits to the Python engine are bit-exact speedups of the pull-direction
analysis (`geometry/ray_mesh_bvh.py`, `pipeline/detailed_mold_analysis/evaluation.py` and three small call-site changes,
ANALYSIS_PERFORMANCE.md), covered by equivalence tests; the existing pytest suite, ruff and the frontend typecheck pass.

- Code: `native/` (CMake presets in `native/CMakePresets.json`).
- Dev environment (Windows, heavy data on D:): `. scripts/native/windows-env.ps1`, then
  `cmake --preset windows-debug` / `cmake --build --preset windows-debug` / `ctest --preset windows-debug`
  from `native/`. Set `CRAFT_PYTHON` to a Python 3.13 interpreter for the analysis tests.
- Reference fixtures: `scripts/native/generate-reference-fixtures.ps1` (needs `npm ci` in `mold/frontend`).
- Final report: `EXECUTION_REPORT.md`. Session log and stopping point: `EXECUTION_LOG.md`. Feature status: `PARITY_MATRIX.md`.
  Decisions: `DECISIONS.md`. Risks and what was not measured: `RISKS.md`. Open work: `Craft_Native_Remaining_Work.md` (outside the repository).
- macOS: presets exist, NEVER built or run. Unverified.
