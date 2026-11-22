# Packaging the Windows application

Status: the **installed layout, the bundled Python runtime and a portable ZIP** are implemented and verified. A **per-user Windows installer (MSI, unsigned)** is built and tested by `verify-installer.ps1`: see "Installer" below. **macOS packaging is not started.**

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

- Source: the official `python-3.13.17-embed-amd64.zip`, pinned by URL **and SHA-256** in `native/packaging/pins.json` (verified against python.org's signature by `scripts/native/verify-python-pin.ps1`, D-051). `scripts/native/prepare-python-runtime.ps1` downloads it, refuses to continue on a hash mismatch, extracts it and writes `python313._pth`.
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

Two distributables are built from the same installed layout (`Craft-install`): the portable ZIP and a per-user MSI.

- Build: `scripts\native\build-installer.ps1` (WiX Toolset 3.14: `heat` harvests the layout, `candle` compiles, `light` links). Output: `D:\CraftNative\build\windows-package\packages\Craft-<version>-windows-x64.msi`. Source: `native/packaging/wix/Craft.wxs`. The WiX binaries are a build tool only, fetched by `prepare-wix.ps1` into `D:\CraftNative\tools\wix314` and pinned by URL, size and SHA-256 in `pins.json` (trust on first use: GitHub publishes no digest and the archive is unsigned). They are not part of the package.
- What it does: installs per user (no elevation) to `%LocalAppData%\Programs\Craft` (or `INSTALLFOLDER=<folder>` on the command line); adds a Start-menu shortcut, an entry in Settings > Apps with an uninstaller, and the `.craft` association for the current user (HKCU). A higher `ProductVersion` with the same `UpgradeCode` replaces the old version (major upgrade); an older or equal one is refused. Uninstall removes what the installer put down and nothing else; autosaves, recovery files, the model cache and the user's `.craft` files live outside the install folder and are never touched. No licence text is shown (R-License-1 is the owner's).
- Test: `scripts\native\verify-installer.ps1` (non-elevated; refuses to run if Craft is already installed for the user). It installs the real MSI and checks the file count against the layout, the Settings > Apps entry and version, the shortcut target, `verify-install.ps1` on the installed copy, the `.craft` command with a real launch of a project made by `--project-bench`, a user-data marker, the upgrade to the next patch version (built on the fly), the refused downgrade, the uninstall, and that the per-user registry and Start menu equal their state before the first install. Last run: all checks passed (log `D:\CraftNative\logs\installer-test2.log`).
- Windows behaviour worth knowing: the Settings > Apps entry of this per-user MSI is written under `HKLM\...\Uninstall` by Windows Installer's service, although the install needs no elevation (measured on Windows 11 24H2). The test therefore looks in both hives.
- Not done and not claimed: the MSI is **not signed** (needs the owner's certificate, PK-5), so SmartScreen will warn; behaviour when Craft is running during an upgrade or uninstall was **not tested** (Windows Installer's Restart Manager may offer to close it in an interactive install; UPDATE_STRATEGY.md requirement 4 stays open); no test on a clean machine or another Windows version (P0-6); no per-machine mode.
## Open decisions and blockers for a release

1. **Qt licensing (blocking).** The Qt SBOM on this machine records Qt Quick 3D 6.8.3 as `Commercial OR GPL-3.0-only` (not LGPL; Qt Base, Declarative and Shader Tools do offer LGPL-3.0). The viewport is built on Qt Quick 3D, so distributing Craft with the open-source Qt means either a commercial Qt license or releasing Craft under the GPL-3.0. This must be decided by the product owner; until then the package is for internal testing. `licenses/THIRD_PARTY_NOTICES.txt` says so.
2. **Craft's own license** is not chosen yet.
3. **Code signing.** There is no certificate: the executable, the DLLs and the MSI are unsigned, so Windows SmartScreen will warn on a downloaded copy. Signing needs a certificate and a signing step in the build; neither exists.
4. **Updates:** no update mechanism exists, by design for v1; the proposed strategy (manual signed installer, no updater, no network access) is in `UPDATE_STRATEGY.md` and waits for the owner's approval.
5. **macOS** needs its own bundling (`.app`, a relocatable Python such as python-build-standalone, `macdeployqt`, signing and notarization) and a real Mac runner. None of it was attempted; nothing here has been run on macOS.
6. There is no native **CI** job; builds and verification are run by hand with the scripts above.
