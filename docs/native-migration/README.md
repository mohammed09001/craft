# Craft native migration

Goal: a native Qt 6 / QML / Qt Quick 3D desktop app with local C++ geometry (Manifold) and the
existing Python engine behind a versioned local bridge. The TypeScript frontend and Python engine
are untouched and remain the behavioural reference.

- Code: `native/` (CMake presets in `native/CMakePresets.json`).
- Dev environment (Windows, heavy data on D:): `. scripts/native/windows-env.ps1`, then
  `cmake --preset windows-debug` / `cmake --build --preset windows-debug` / `ctest --preset windows-debug`
  from `native/`. Set `CRAFT_PYTHON` to a Python 3.13 interpreter for the analysis tests.
- Reference fixtures: `scripts/native/generate-reference-fixtures.ps1` (needs `npm ci` in `mold/frontend`).
- Status and stopping point: `EXECUTION_LOG.md`. Feature status: `PARITY_MATRIX.md`.
- macOS: presets exist, NEVER built or run. Unverified.
