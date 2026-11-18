# Master tooling export

New native feature (the reference frontend only displays Master pieces; it has no export). Decisions D-056..D-059, risks R-Export-1..3.

## What the user gets

"Export Master tooling…" (Inspector, Master Mold section, and the File menu) asks for a folder and creates, inside it:

```
<folder>/<model>_master_tooling[_N]/
    <model>_master_<set>_<piece>.stl     one per piece
    manifest.json
```

* **STL**: binary, float32, millimeters, Z-up, in the model's world frame (the grounded part as shown in the viewport). Facet normals are recomputed from winding. No re-orientation, supports or unit change (D-059).
* **Which pieces**: every piece of every tooling set whose status is `current`, whatever its visibility in the viewport. Stale sets (the part or printer context changed) and blocked sets are *not* exported; they are listed under `excluded` with the reason. If nothing is exportable the export fails and says why ("regenerate the Master Mold", the blocked set's failure message, ...). Pieces the engine flagged (not watertight / not manifold / larger than the build volume) are exported with a warning.
* **Never overwrites**: a new sub-folder per export (`_2`, `_3`, ... when the name is taken). Files beside it are not touched.
* **All or nothing**: built in `<name>.craft-export-tmp`, every file read back and checked (size, SHA-256, parsed triangle count), then renamed. A failure or cancellation removes the temporary folder; a folder with the final name is always complete. A temporary folder left by a crash is replaced by the next export of the same name.
* Runs on a worker thread; the panel shows the folder, file count, warnings and skipped sets, and a "Show folder" button.

## manifest.json (`craft.master-tooling-export`, formatVersion 1)

| Field | Content |
|---|---|
| `app`, `exportedAt`, `source` | Craft version, UTC time, model file name, Master generation number |
| `units`, `upAxis`, `coordinateFrame`, `stlEncoding` | `millimeters`, `Z`, a sentence on the frame, how the STL was written |
| `completeness` | `unportedPathsReached` + `unportedPaths` (+ a note): the engine may have skipped strategies the reference tries |
| `toolingSets[]` | `moldPartId/Name`, `releaseMode`, `sourceSignature`, `fingerprint`, `warnings`, `releaseSequence[]` (step, piece, direction, clearance, collision-verified), `registrationFeatures[]` (pin: male/female piece), `pieces[]` |
| `pieces[]` | `pieceId`, `name`, `file`, `bytes`, `sha256`, `triangleCount`, `volumeMm3`, `bounds{min,max}`, `watertight`, `manifold`, `fitsBuildVolume`, `releaseDirection` (+ vector for non-axis pulls), `regions`, `registrationFeatureIds` |
| `excluded[]` | set (and piece) that was left out, its status and the reason |
| `warnings[]` | per-piece notes shown to the user |

## Code

`io/tooling/MasterToolingExport.{h,cpp}` (library `craft_export`: `planMasterToolingExport`, `writeMasterToolingExport`, `sanitizeFileComponent`); `app/AppControllerMaster.cpp` (`exportMasterTooling`, `masterMold.canExport/exportablePieceCount/exporting/lastExport`); `stl::encodeBinary(MeshPayload)` is shared with `writeBinary` so the hashed bytes are the written bytes. Tests: `tst_master_export`, and `tst_app_workflow` (`masterToolingExportWritesEveryCurrentPieceAndRefusesStaleOnes`).
