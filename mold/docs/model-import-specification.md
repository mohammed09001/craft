# 3D Model Import Specification

## 1. Purpose

The model import system is responsible for receiving a 3D model file, validating the basic input, reading its geometric data, and converting it into a consistent internal representation that can be used safely by the rest of the Mold Generator Engine.

This component only imports and prepares model data. It does not generate molds, repair complex geometry, split molds, add vents, create keys, or export final models.

## 2. Responsibilities

The model import system is responsible for:

* Accepting a path to a 3D model file.
* Checking that the file exists and is accessible.
* Identifying the file format.
* Rejecting unsupported file formats.
* Reading the model's basic geometric data.
* Creating a consistent internal model object.
* Returning useful information about the imported model.
* Reporting clear errors when the import fails.

## 3. Non-Responsibilities

The model import system is not responsible for:

* Generating a mold from the imported model.
* Repairing complex mesh defects automatically.
* Deciding whether a model is finally suitable for mold making.
* Splitting the model or the mold into parts.
* Adding parting lines, vents, gates, or alignment keys.
* Scaling or modifying the model for manufacturing.
* Exporting the generated mold.
* Preparing files directly for a 3D printer or slicer.

The import flow may still expose a preliminary readiness assessment for later
mold-analysis stages, as long as that assessment does not claim that final mold
analysis is complete.

## 4. Supported File Formats

The first version of the model import system supports:

* `.stl` — the primary format for importing mesh models intended for 3D printing.
* `.obj` — a commonly used mesh format for exchanging 3D models.

File extensions are treated as case-insensitive. For example, `.STL` and `.stl` are considered the same format.

The first version does not support formats such as `.step`, `.stp`, `.3mf`, `.ply`, `.fbx`, or native CAD project files. Support for additional formats may be added in later versions.

## 5. Basic File Validation

Before reading the model geometry, the import system must verify that:

* The provided file path is not empty.
* The path points to an existing file.
* The path does not point to a directory.
* The file can be accessed and read.
* The file extension is supported.
* The file is not empty.
* The detected file format matches the expected importer.

If any of these checks fail, the import process must stop before geometric processing begins and return a clear error.

## 6. Basic Geometry Validation

After reading the file, the import system must verify that:

* The file contains at least one mesh.
* The mesh contains vertices.
* The mesh contains faces.
* Vertex coordinates contain valid finite numbers.
* Faces reference valid vertex indices.
* The imported geometry is not completely empty or unusable.

The importer may report warnings for issues such as degenerate faces, duplicate vertices, open boundaries, or non-manifold geometry.

A model must not be rejected only because it is not watertight or not suitable for mold making. Detailed geometry analysis and repair belong to later engine components.


## 7. Import Output

A successful import must return a consistent internal model object containing:

* The original file path.
* The original file name.
* The detected file format.
* The imported mesh data.
* The total number of vertices.
* The total number of faces.
* The model's bounding box.
* The model dimensions along the X, Y, and Z axes.
* Any warnings discovered during import.
* Basic metadata available from the source file.
* A preliminary mold-analysis readiness assessment derived from the already
  collected diagnostics and statistics.

The rest of the engine must use this internal model object instead of depending directly on STL-specific or OBJ-specific data structures.


## 8. Errors and Exceptions

The import system must use clear, specific errors instead of returning a generic failure.

Expected error categories include:

* `InvalidFilePathError` — the provided path is empty or invalid.
* `FileNotFoundError` — the requested file does not exist.
* `FileAccessError` — the file cannot be opened or read.
* `UnsupportedFileFormatError` — the file extension or format is not supported.
* `EmptyFileError` — the file contains no data.
* `CorruptedModelFileError` — the file cannot be parsed as a valid model file.
* `EmptyGeometryError` — the file contains no usable mesh geometry.
* `InvalidGeometryDataError` — the geometry contains invalid coordinates, faces, or vertex references.
* `ModelImportError` — a general import error used only when a more specific category does not apply.

Warnings must not be raised as fatal exceptions unless the imported geometry is unusable.


## 9. Proposed File Locations

The model import system will be placed inside the existing `io` package.

Planned locations:

* `src/mold_generator_engine/io/importers/__init__.py` — exposes the public import functionality.
* `src/mold_generator_engine/io/importers/model_importer.py` — coordinates validation, format detection, and importer selection.
* `src/mold_generator_engine/io/importers/stl_importer.py` — reads STL files.
* `src/mold_generator_engine/io/importers/obj_importer.py` — reads OBJ files.
* `src/mold_generator_engine/models/imported_model.py` — defines the consistent internal model object returned after import.
* `src/mold_generator_engine/exceptions.py` — contains import-related exception classes.
* `tests/unit/io/importers/` — contains unit tests for import validation and importer behavior.
* `tests/fixtures/models/` — contains small sample model files used by tests.

These files and directories are planned locations only. They do not need to be created during this specification stage unless required by a later implementation stage.

## 10. Import Process Flow

The import process follows this sequence:

1. Receive the file path.
2. Validate the path and confirm that the file exists.
3. Confirm that the file is readable and not empty.
4. Detect the file format.
5. Reject the file if the format is unsupported.
6. Select the correct format-specific importer.
7. Read the model geometry.
8. Perform shared basic geometry validation.
9. Run basic topology analysis when the imported geometry is valid enough for safe connectivity analysis.
10. Collect metadata, geometry findings, and topology findings.
11. Calculate basic model statistics when the imported geometry is valid enough.
12. Derive the preliminary mold-analysis readiness assessment from the already
    collected results.
13. Convert the imported data into the internal model object.
14. Return the internal model object to the next engine component.

If a fatal error occurs at any step, the process must stop and raise the most specific applicable exception.

## 11. Acceptance Criteria

This specification is considered complete when it clearly defines:

* The purpose and boundaries of the model import system.
* The supported file formats for the first version.
* The required file and geometry validation checks.
* The structure of the internal import result.
* The expected warnings, errors, and exceptions.
* The proposed file locations inside the project.
* The complete import process flow.
* The responsibilities excluded from this component.
* Requirements that can be converted into automated tests and implementation tasks.

No mold-generation algorithm must be implemented as part of this specification stage.
