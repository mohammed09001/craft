# Update strategy for the Windows release

Status: **proposal for the owner's approval** (matrix row PK-3). Nothing here is decided on the owner's behalf: the parts that need a certificate, a download host, a licence or a toolchain permission are listed in "Owner decisions" and are not assumed. What engineering could do without them is marked **done**.

Scope: Windows x64 only. macOS is not covered and was not worked on.

## Recommendation for version 1

**Manual updates through a signed installer that the user downloads; no in-app updater; no network access from the application.**

Why, from what is true of the product today:

- The application makes **no network requests**: no Qt Network module is linked and there is no URL in the application, I/O, core or engine sources. A craftsman's engineering tool that works on confidential part geometry is easier to trust, to approve in a company and to ship under a licence review when it stays offline. An updater would be the first thing in the product that talks to the internet.
- An updater is a code-execution path: it needs a signing key, signature verification, a staged download, a rollback and a hosting service. None of those exist (no certificate, no release host), and each is a source of security bugs that a v1 does not need.
- The product is **self-contained and relocatable** (the layout is found relative to `Craft.exe`, nothing is written into the install folder, `verify-install.ps1` proves both), so replacing it is a file operation, not a migration of machine state.
- User data is in a separate place (`%LOCALAPPDATA%\Craft\Craft\` with `autosave\`, `cache\` and `logs\`; the user's `.craft` projects are wherever the user saved them), so replacing the program does not touch it.

An **opt-in "check for updates" notice** is a reasonable v1.x addition once signing and hosting exist; its constraints are in "Later".

## What identifies a version

| Thing | Where it lives | Rule |
|---|---|---|
| Product version `MAJOR.MINOR.PATCH` | `project(CraftNative VERSION ...)` in `native/CMakeLists.txt` | **The only place it is written** (done: the application, the executable's version resource and the package file name all take it from there; `verify-install.ps1` now checks that the executable's product version equals what the application reports). It was a second literal in `main.cpp` before. |
| Executable file and product version | `Craft.exe` version resource (`native/app/craft.rc.in`) | What Explorer shows under Details and what an installer compares to decide an upgrade. Done. |
| Project file format `formatVersion {major, minor}` | `.craft` files (`docs/native-migration/PROJECT_FORMAT.md`) | **Independent of the product version.** Changes only when the file format changes. |
| Export manifest `formatVersion` | `manifest.json` of the Master tooling export | Independent; the 3MF member was added without changing it (additive, D-109). |
| Bundled runtime | `native/packaging/pins.json` (Python 3.13.17 with its SHA-256), the Qt version used to build (6.8.3), the Manifold commit | Listed in every release's notes. |

Scheme: `MAJOR.MINOR.PATCH`.

- **PATCH**: fixes only; no change to any file format, no new feature.
- **MINOR**: new features; may add optional members to the project format (a format *minor*, which older builds read and preserve).
- **MAJOR**: a change an older build cannot read (a format major) or that breaks a documented workflow.
- Before 1.0 the same rules apply and the product version stays `0.x`; the installer must still treat a higher `ProductVersion` as an upgrade.

## What a release consists of

| Artefact | Status |
|---|---|
| Portable ZIP `Craft-<version>-windows-x64.zip` | builds and passes `verify-install.ps1` (PK-1) |
| `SHA-256` of every artefact, published next to it | to do at release time (the build already prints the ZIP; record it in the release notes) |
| Installer (MSI/EXE) | **blocked**: no installer toolchain on the build machine and the WiX download was not allowed (PK-2) |
| Authenticode signature on `Craft.exe`, the DLLs and the installer, with a trusted timestamp | **blocked on the owner's certificate** (unsigned binaries trigger SmartScreen: PACKAGING.md, open decision 3) |
| `licenses/THIRD_PARTY_NOTICES.txt` | in the package; the legal review and the Qt / Craft licence decisions are the owner's (R-License-1, P0-7) |
| Release notes | to write per release: user-visible changes, any `.craft` format change (and its migration), the bundled component versions, known limits |

Until the certificate and the licence decisions exist the package is **internal-test only**, as `THIRD_PARTY_NOTICES.txt` already says.

## How an update behaves

### With the installer (when it exists)

Requirements for it, so that updating is safe by construction:

1. **Per-user install scope** (no elevation), installing to `%LOCALAPPDATA%\Programs\Craft` or a user-chosen folder.
2. A **stable upgrade identity** (one `UpgradeCode` / product id for all versions) and **major-upgrade semantics**: a higher `ProductVersion` replaces the old files, the same or a lower one is refused with a clear message (downgrade is a manual uninstall; see Rollback).
3. **Nothing outside the install folder** is installed or changed except the Start-menu entry and the optional `.craft` association; no shared files, no machine-wide registry state, no services. (The package needs none: Qt, the MSVC runtime and Python are application-local.)
4. The installer **detects a running `Craft.exe`** and asks to close it (the files are locked while it runs) instead of failing half-way. Autosave protects the user's unsaved work in any case (P0-4: autosave and recovery, crash drill 26/26 real kills).
5. **Data preservation:** install, upgrade and uninstall never delete `%LOCALAPPDATA%\Craft\Craft\` (autosave, cache, logs) or any `.craft` file. An uninstall may offer to remove the cache and logs, never the autosave without saying so.
6. After an upgrade the first launch offers recovery of any autosave left by the previous version exactly as after a crash (the autosave is an ordinary `.craft` file).

### With the portable ZIP

Close Craft, unpack the new ZIP into a **new folder**, run it; delete the old folder when satisfied. Versions can sit side by side because the program keeps no state in its own folder. Two copies running at once share the same user-data folder; running two versions at the same time has not been tested, so do not rely on it.

## Compatibility rules for user data across updates

These are what the code already does; they are the contract a release must keep.

- **`.craft` projects** (`PROJECT_FORMAT.md`, "Versioning policy"): a build reads the same major and any older minor; reads a **newer minor**, keeps the members it does not know and writes them back unchanged with a warning; **refuses a newer major** with "created by a newer version of Craft"; **upgrades an older major** in memory through the migration chain and leaves the file on disk untouched until the next save.
- **Rule for every release that changes the format:** a minor change adds only optional members; a major change must ship a real migration **with a fixture of an old file** (R-Project-1: the chain is empty today, so this has never been exercised against a real old file; the first real format change must add it). Release notes name the format change.
- **Exports** (STL, 3MF, Master tooling folders) are write-only outputs; their manifests carry their own `formatVersion` and are extended additively.
- **Autosave and recovery** use the project format and therefore the same rules; recovery after an upgrade works across minors and refuses only a newer major.
- **Cache and logs** are disposable and may be deleted at any time.

## Rollback

- Installing an **older build over a newer one** is not supported by the installer (downgrade refused); the supported path is: uninstall (data is kept), install the older version. Projects saved by the newer build open in the older one when they differ only by a newer **minor** (unknown members are preserved); a newer **major** is refused with a clear message, which is why a major format change should be rare and announced.
- Keep the **previous release's installer and ZIP available** next to the current one.
- Portable users roll back by running the old folder.

## Release checklist (engineering gates before a version is published)

1. Full Debug and Release CTest in one run each, and the UI tour, on the tagged commit.
2. `build-package.ps1` on that commit; `verify-install.ps1` on the installed layout **and** on the ZIP extracted into a fresh folder.
3. The product version bumped in one place; the executable's version, the application's reported version and the package name agree (checked by `verify-install.ps1`).
4. SHA-256 of every artefact recorded; the bundled Python checksum compared with the one python.org publishes (PACKAGING.md says this is still to do before a public release).
5. Signature applied and verified (needs the certificate).
6. A clean-machine install, upgrade-from-previous and uninstall run (needs a clean Windows image: P0-6's open row).
7. Release notes: user-visible changes, format changes and migrations, bundled component versions, known limits (the risk register's open items that a user can meet).
8. The licence decisions in place and `THIRD_PARTY_NOTICES.txt` current.

## Later (not v1)

An **opt-in update notice** is acceptable if, and only if:

- it is **off until the user turns it on**, and says so in the first-run text;
- it makes one HTTPS request for a small static manifest (latest version, URL, SHA-256, release-notes link) on the owner's host and sends **nothing about the user, the machine or the work**;
- it only **notifies and opens the browser**: it never downloads or runs code;
- it works with no network and fails silently;
- it needs the signing certificate and the release host first, and the Qt Network module (a licence and size review).

A real in-place updater (download, verify signature, replace, roll back) is a separate project and is not recommended before the product has users and a release process.

## Owner decisions this document needs

1. Approve the v1 recommendation (manual signed installer, no updater, no network access), or choose another.
2. Where releases are published (a web page, a file host) and who can publish.
3. The code-signing certificate (kind, who holds it, where signing runs). Engineering must not create or fake one.
4. The licences (Qt Quick 3D is `Commercial OR GPL-3.0-only`; Craft's own licence is unchosen): R-License-1. This gates any distribution, whatever the update method.
5. Permission to download and use an installer toolchain (WiX Toolset, a 41 MB GitHub release, was denied at the checkpoint) or a different one.
6. How long an old version is supported (how many previous minors get a fix), and whether a release channel other than "latest" is wanted.

## What engineering did for this document

- One source for the product version (`CRAFT_APP_VERSION` from the CMake project version), a version resource in `Craft.exe`, a `applicationVersion` field in the smoke summary, and three `verify-install.ps1` checks that the executable's file version, its product version and the application's reported version agree.
- Confirmed from the sources that the application has no network code.

Not done and not doable without the owner: the installer, the signature, the release host, the clean-VM run.
