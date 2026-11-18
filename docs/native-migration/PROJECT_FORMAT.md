# Craft project format (`.craft`), version 1.0

Status: implemented and tested (`native/io/project`, `native/core/project`, `tst_project`, `tst_app_workflow`). This is a **new** native design: the TypeScript frontend has no project persistence to port (Phase 6 of the migration directive).

## What a project stores

A project stores what the user **decided**, not what was derived:

| Section | Contents |
|---|---|
| `model` | the source model: file name, size, SHA-256, triangle count, original encoding, the app's geometry fingerprint, and either the embedded asset id or a linked path |
| `moldInputs` | mold clearance, cavity clearance, the six cut faces (enabled, normalized position) |
| `sprues` | every sprue intent: id, creation order, position, inward direction, resolved profile (diameters, neck length), the design record and its warnings |
| `segmentation` | printer volume and the user's extension planes (axis + coordinate) |
| `view` | theme, grid/axes/edges, mold opacity, camera pose |
| `workflow` | which derived stages existed when saved: segmentation planned/executed, mold generated |

Units are millimeters and the coordinate system is Z-up; both are written and **checked on load** (a manifest that says anything else is refused).

**Not stored (derived):** mold bodies, segmentation pieces, Master Mold sets, analysis/engineering reports, selection, measurement, the active tool. The pipelines are deterministic, so opening a project rebuilds the mold (and the executed segmentation) from the stored inputs; a test checks that the rebuilt body volumes equal the originals exactly. Master Mold sets and reports are expensive and on demand, so they are not rebuilt automatically.

## Container

Little-endian, one file:

```
offset 0       header, 64 bytes
                 "CRAFTPRJ" (8)  u16 major  u16 minor  u32 flags (0)
                 u64 manifestOffset  u64 manifestLength  32 reserved zero bytes
offset 64      asset blobs, back to back (v1: the embedded source-model STL)
manifestOffset manifest, UTF-8 JSON
end - 48       footer: "CRAFTEND" (8), SHA-256 of the manifest bytes (32), u64 total file length
```

The embedded model is a **canonical binary STL written from the source triangles** (float32 in, float32 out, so re-reading reproduces the geometry and its fingerprint exactly). The user's original ASCII file is not preserved byte for byte; its encoding is recorded as `sourceEncoding`.

### Manifest

`schema: "craft.project"`, `formatVersion {major, minor}`, `app {name, version}`, `projectId`, `createdAt`, `modifiedAt`, `units: "mm"`, `coordinateSystem: "z-up"`, `assets[] {id, role, name, mediaType, offset, size, sha256}`, then the sections above. Autosave files add `autosave {originalPath}`.

## Integrity

- **Truncation**: the footer must be present and its recorded length must equal the file size.
- **Manifest damage**: SHA-256 of the manifest must match the footer.
- **Asset damage**: SHA-256 of each asset is checked when it is read (and must equal the model record's hash).
- **Version mismatch**: header and manifest must agree on the format version.
- Errors are coded (`project_not_found`, `project_unreadable`, `project_not_a_craft_file`, `project_truncated`, `project_corrupt`, `project_asset_corrupt`, `project_unsupported_version`, `project_invalid`, `project_migration_failed`, `project_write_failed`, `project_asset_missing`, `project_asset_changed`) with messages written for the user.
- A flip of any single bit in the manifest, model data or footer is detected (tested across the file); only the reserved header bytes are not covered.

## Saving

Written to a temporary file beside the target (`QSaveFile`) and renamed over it on commit, so a crash or a full disk never leaves a half-written file under the real name. Before replacing, the previous file is copied to `<name>.craft.bak` **only if it is itself intact**, so a damaged file never overwrites a good backup (one generation kept). A document that fails validation is refused before anything on disk is touched.

## Versioning policy

| File | Behaviour |
|---|---|
| same major, same or older minor | read |
| same major, **newer minor** | read; members this build does not know are kept (`preservedExtensionsJson`) and written back unchanged; a warning is returned. Extensions can never shadow a known member |
| **newer major** | refused: "created by a newer version of Craft" |
| **older major** | upgraded in memory by the registered migration chain (`builtinMigrations()`), with a warning per step; refused with "no migration" if a step is missing; a failing step is `project_migration_failed`. The file on disk is untouched until the next save, which writes the current version |

Format 1 is the first major, so `builtinMigrations()` is empty. The migration machinery is tested with an injected chain (ordering, reporting, failure), not with a real historical format: there is none.

## Linked models

A project may refer to a model file instead of embedding it (`storage: "linked"`: path, size, SHA-256). Opening verifies the file: `project_asset_missing` if it is gone, `project_asset_changed` if its size or content differs. The app answers both with a "Locate the model…" dialog and reopens with the chosen file. **The app only writes embedded projects today**; linked projects are read and tested, and written by tests.

## Autosave and crash recovery

- Every 60 s, if there are unsaved changes, the document is autosaved to `<user data>/autosave/<projectId>.craft` (never to the project's own file) on a worker thread.
- A normal save deletes the autosave. A clean exit with no unsaved changes deletes it. Exiting with unsaved changes **keeps** it, which is also exactly what a crash leaves behind.
- On the next start, leftover autosaves are offered ("Recover / Discard / Decide later"). Recovering opens the autosave as an **unsaved** project (it has no file of its own; the original location is remembered). Unreadable files in the folder are ignored, not offered.
- Closing the window or opening another project/STL with unsaved changes asks first.

## Unsaved changes ("dirty")

A project is dirty when its **inputs** differ from the last save. The comparison ignores ids, timestamps, the app version, the camera pose, and the derived-stage flags (`workflow`): orbiting the camera or generating a mold is not an edit; changing a clearance, a sprue, the printer volume or a view option is.
