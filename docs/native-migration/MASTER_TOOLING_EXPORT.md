# Master tooling export

New native feature (the reference frontend only displays Master pieces; it has no export). Decisions D-056..D-059 and D-109; rewritten for the two-master contract (D-130). Risks R-Export-1..3.

## What the user gets

"Export Master tooling…" (Inspector, Master Mold section, and the File menu) asks for a folder and creates, inside it:

```
<folder>/<model>_master_tooling[_N]/
    <model>_master_A.stl                 Master A, in its own print frame
    <model>_master_B.stl                 Master B, in its own print frame
    <model>_master_tooling.3mf           both masters as two named objects on one plate
    manifest.json
```

* **STL**: binary, float32, millimetres, Z-up. Each master is in its own print frame: the underside of its base on z = 0, the open pour face toward +Z. The manifest's `printFromModel` (column-major 4x4) maps the model frame to that frame. Facet normals are recomputed from winding. No supports or unit change (D-059).
* **3MF**: one package, millimetres, two objects ("Master A", "Master B"); Master B is moved along +X so the two do not overlap when the package is opened. The STL files are not moved.
* **What is exported**: exactly the two masters of a `current` result, never the virtual working halves (the manifest lists them with `exported: false`). A Master Mold is a pair: if either master has no geometry, nothing is written and the reason is given. A `stale` result (the part or printer context changed) or a `blocked` one (no feasible plan) is listed under `excluded` with its reason; the export fails and says why ("regenerate the Master Mold", the failure's message, "generate the Master Mold first").
* **Never overwrites**: a new sub-folder per export (`_2`, `_3`, ... when the name is taken). Files beside it are not touched.
* **All or nothing**: built in `<name>.craft-export-tmp`, every file read back and checked (size, SHA-256, parsed triangle count; the 3MF by an independent validator), then renamed. A failure or cancellation removes the temporary folder; a folder with the final name is always complete. A temporary folder left by a crash is replaced by the next export of the same name.
* Runs on a worker thread; the panel shows the folder, file count, warnings and skipped items, and a "Show folder" button.

## manifest.json (`craft.master-tooling-export`, formatVersion 2)

| Field | Content |
|---|---|
| `app`, `exportedAt`, `source` | Craft version, UTC time, model file name, Master generation number, source geometry version |
| `units`, `upAxis`, `coordinateFrame`, `stlEncoding` | `millimeters`, `Z`, a sentence on the print frames, how the STL was written |
| `seam` | `kind` (`planar` or `height-field`), `pullAxis`, `planeOffsetMm`, a description |
| `masters[]` | `id`, `name`, `file`, `bytes`, `sha256`, `triangleCount`, `volumeMm3`, `bounds`, `watertight`, `manifold`, `bodies`, `fillVolumeMm3`, `minimumWallMm`, `pourDirection`, `printFromModel`, `registrationFeatures`, `inletFeatures` |
| `virtualWorkingHalves[]` | `id`, `name`, `volumeMm3`, `bounds`, `releaseDirection`, `exported: false` |
| `releaseChecks[]` | `stage`, `subject`, `verification`, `direction`, `marginMm`, `method`, `note` |
| `materialEstimates[]` | `fillVolumeMm3`, `wasteMargin`, `volumeWithWasteMm3`, and `densityGPerCm3` / `massG` only when a density is known |
| `fidelity` | `toleranceMm`, `deviationMm`, `method` |
| `residualUncertainty[]`, `fingerprint` | what digital validation does not cover; the plan's fingerprint |
| `threeMf` | file, bytes, SHA-256, unit, layout note, object names (only when written) |
| `excluded[]`, `warnings[]` | what was left out and why; notes shown to the user |

## Code

`io/tooling/MasterToolingExport.{h,cpp}` (library `craft_export`: `planMasterToolingExport` taking a `MasterExportSource` {status, shared plan, failure message}, `writeMasterToolingExport`, `sanitizeFileComponent`); `app/AppControllerMaster.cpp` (`exportMasterTooling`, `masterMold.canExport/exporting/lastExport`); `stl::encodeBinary(MeshPayload)` is shared with `writeBinary` so the hashed bytes are the written bytes. Tests: `tst_master_export`, `tst_long_paths`, and `tst_app_workflow` (`masterToolingExportWritesEveryCurrentPieceAndRefusesStaleOnes`).
