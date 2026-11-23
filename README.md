# Craft

Craft is a native Windows desktop application for mold generation: import a 3D
model (STL), define where it splits, and derive the mold geometry (cavity,
sprue, registration keys) needed to manufacture it. It is one application:
Qt/QML for the interface, C++ with native Manifold for the geometry, and a
local Python engine for the engineering analysis. There is no web runtime.

## Repository layout

```
native/        the application (C++/Qt Quick), its tests and packaging
  app/         application controller, QML, jobs, project handling
  core/        geometry, mold, segmentation, Master Mold (platform-neutral)
  io/          STL, 3MF, project file, tooling export
  engines/     analysis bridge, native Manifold wrapper
  viewport/    3D viewport adapters
  tests/       Qt Test suites and recorded fixtures
mold/
  src/         Python 3.13 engineering engine (mold_generator_engine,
               engineering_analysis, engineering_reports)
  tests/       Python test suite
  docs/        engine and engineering documentation
scripts/native/  Windows environment, packaging, installer, smoke and benchmarks
docs/native-migration/  architecture, decisions, risks, completion matrix
```

The earlier React/TypeScript web app was removed from this tree. The last tree
that contains it is the tag `web-reference-final`; the behaviour it defined is
recorded in `native/tests/fixtures/reference`.

## Build and test (Windows)

```powershell
. .\scripts\native\windows-env.ps1
cd native
cmake --preset windows-release
cmake --build --preset windows-release
ctest --preset windows-release
```

## Python verification

```bash
cd mold
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

## Documentation

- `docs/native-migration/WINDOWS_COMPLETION_MATRIX.md` - what passes and what is open.
- `docs/native-migration/OWNER_DECISIONS.md` - decisions only the owner can make.
- `docs/native-migration/README.md` - index of the migration documents.
