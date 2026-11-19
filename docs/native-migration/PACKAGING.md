# Packaging the Windows application

Status: the **installed layout, the bundled Python runtime and a portable ZIP** are implemented and verified. A **Windows installer (MSI/EXE) is not built yet**: see "Installer" below. **macOS packaging is not started.**

## What is in the package

```
Craft.exe                              the application (Manifold kernel statically linked)
Qt6*.dll, platforms/, styles/, qml/ …  Qt runtime, deployed by windeployqt
msvcp140*.dll, vcruntime140*.dll       MSVC runtime, app-local
python/                                CPython 3.13.17, the official embeddable distribution
analysis/craft_analysis_worker.py      the worker the app launches
analysis/craft_native_evaluation.py    the worker's native evaluation hook (loads and checks the kernels)
analysis/craft_analysis_kernels.dll    native kernels the worker loads through ctypes (an optimisation; the worker runs without it)
analysis/site/                         mold_generator_engine, engineering_reports, engineering_analysis
                                       (+ dist-info for the version, precompiled .pyc)
licenses/                              THIRD_PARTY_NOTICES.txt, Manifold and Clipper2 licenses
```

The app finds all of this relative to its own directory (`AppPaths::analysisWorkerConfig`, "bundled runtime"), so the folder can be moved anywhere. Nothing refers to the development drive.

## The bundled Python runtime

- Source: the official `python-3.13.17-embed-amd64.zip`, pinned by URL **and SHA-256** in `native/packaging/pins.json`. `scripts/native/prepare-python-runtime.ps1` downloads it, refuses to continue on a hash mismatch, extracts it and writes `python313._pth`.
- **Isolation by construction.** The `_pth` file (`python313.zip`, `.`, `..\analysis\site`) makes the interpreter ignore `PYTHONPATH`, `PYTHONHOME`, the registry and the user's site-packages. The bundled engine cannot be shadowed by anything on the user's machine, and the user's Python cannot be affected.
- **No dependencies to install.** The engine is pure Python with no third-party packages (`mold/pyproject.toml`), so there is no pip step and no wheel to pin.
- Size: the runtime is 21.6 MB; the engine sources are 0.9 MB.
- The SHA-256 was recorded when the file was first downloaded (trust on first use). **Before a public release, compare it with the checksum/signature python.org publishes for 3.13.17.**
- Never persisted: the embeddable distribution has no `pip`, `venv` or `tkinter`; the worker needs none of them (checked by running the worker through every command).

## Building and verifying

```powershell
. .\scripts\native\build-package.ps1                 # runtime, Release build, install, portable ZIP
. .\scripts\native\verify-install.ps1 -InstallDir D:\CraftNative\staging\Craft-install
```

`build-package.ps1` uses the `windows-package` CMake preset (Release, tests off) and `native/cmake/CraftPackaging.cmake` (install rules + CPack). Output stays on the heavy-data drive.

`verify-install.ps1` checks, and exits non-zero on any failure:

1. the layout (app, runtime, relative `_pth`, engine, precompiled bytecode, licenses, no `.pdb`/`.obj` leftovers, no development paths in config files);
2. the **dependency closure**: every DLL any binary in the folder needs is in the folder or in System32 (`dumpbin /dependents` over all binaries);
3. a **real run from a hostile environment**: PATH reduced to the Windows directories (no Qt, MSVC or Python), `CRAFT_PYTHON`/`PYTHONPATH`/`PYTHONHOME` removed, a different working directory, an isolated user-data location. The app imports an STL, generates a mold, runs the import analysis and the moldability/cavity/readiness analysis, and renders a frame; the script asserts that the interpreter and worker used are the ones **inside the install folder**, that the worker reports Python 3.13.17 and the engine version from the bundled metadata, and that no Qt/QML warnings were printed;
4. that the run **wrote nothing** into the install folder (it may be read-only).

Note for developers: `scripts/native/windows-env.ps1` sets `CRAFT_PYTHON`, which the app prefers over a bundled runtime. The verification script clears it; without that it would silently test the development interpreter.

## Installer

The portable ZIP is the only distributable built so far.

An installer (MSI through CPack's WiX generator, per-user install scope so it can be installed and tested without elevation) was the plan, but it needs the WiX Toolset binaries, which are not installed on this machine. Fetching them (a 41 MB GitHub release archive) was blocked during this work, and was not worked around. **What an installer must add on top of the verified layout:** Start-menu shortcut, uninstaller, the `.craft` file association (the app already opens a `.craft` or `.stl` passed on its command line), upgrade handling. Nothing about the layout needs to change.

## Open decisions and blockers for a release

1. **Qt licensing (blocking).** The Qt SBOM on this machine records Qt Quick 3D 6.8.3 as `Commercial OR GPL-3.0-only` (not LGPL; Qt Base, Declarative and Shader Tools do offer LGPL-3.0). The viewport is built on Qt Quick 3D, so distributing Craft with the open-source Qt means either a commercial Qt license or releasing Craft under the GPL-3.0. This must be decided by the product owner; until then the package is for internal testing. `licenses/THIRD_PARTY_NOTICES.txt` says so.
2. **Craft's own license** is not chosen yet.
3. **Code signing.** There is no certificate: the executable, the DLLs and any installer are unsigned, so Windows SmartScreen will warn on a downloaded copy. Signing needs a certificate and a signing step in the build; neither exists.
4. **No update mechanism** exists or is designed.
5. **macOS** needs its own bundling (`.app`, a relocatable Python such as python-build-standalone, `macdeployqt`, signing and notarization) and a real Mac runner. None of it was attempted; nothing here has been run on macOS.
6. There is no native **CI** job; builds and verification are run by hand with the scripts above.
