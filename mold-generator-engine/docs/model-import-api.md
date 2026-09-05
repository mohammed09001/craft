# Model Import API

## Overview

The Chapter 2 model-import pipeline is the public engine path for reading a 3D
model file, running shared geometry and topology checks, computing basic mesh
statistics, and returning one unified result object.

Supported input formats today:

- `STL`
- `OBJ`

The pipeline reads the file, normalizes it into the engine's shared mesh model,
runs geometry validation, runs topology analysis when geometry is usable,
computes basic statistics, evaluates processing suitability, and then produces
an initial moldability assessment plus a unified import-analysis report.

## Public Entry Point

The public entry point is `mold_generator_engine.ImportAnalysisService`.

Typical usage:

```python
from pathlib import Path

from mold_generator_engine import ImportAnalysisService

service = ImportAnalysisService.from_default_readers()
report = service.analyze(Path("part.stl"))
```

`ImportAnalysisService.from_default_readers()` builds a service with the
project's currently supported readers.

`ImportAnalysisService.analyze(source_path)` accepts:

- `source_path: Path`

It returns:

- `ImportAnalysisReport`

Expected failure behavior:

- Expected import-time problems are converted into a report with
  `status == ImportAnalysisReportStatus.IMPORT_FAILED`.
- Callers do not need to catch STL- or OBJ-specific reader exceptions when
  they use the service entry point.

## Unified Report

`ImportAnalysisReport` is the stable result object returned by the service. Its
main sections are:

- `status`: Final orchestration status such as `ready`, `requires_repair`, or
  `import_failed`.
- `source`: Source file name, source path, and resolved file format.
- `import_succeeded`: Whether file import completed.
- `analysis_completed`: Whether downstream analysis completed.
- `summary`: Short human-readable summary of the outcome.
- `issue_counts`: Counts by severity across the unified report issues.
- `warnings` and `errors`: Unified issue lists suitable for APIs and UIs.
- `geometry_validation`: Shared geometry-validation result.
- `topology_validation`: Shared topology-analysis result.
- `statistics`: Basic mesh statistics in millimeters.
- `processing_decision`: Unified suitability decision for continuing the
  processing pipeline.
- `initial_moldability_assessment`: Preliminary moldability readiness result.
- `model_metadata`: Reader metadata that is safe to expose downstream.

Use `report.to_dict()` when a serialization-safe dictionary is needed.

## Interpreting Outcomes

Important distinctions in the current API:

- A file can be read successfully while still producing warnings or downstream
  repair requirements.
- `import_succeeded=True` only means file import completed and a shared model
  was created.
- `analysis_completed=True` means the downstream shared analysis stages also
  completed.
- `status=import_failed` means the pipeline could not create a usable imported
  model at all.
- `status=requires_repair` means the model was imported, but geometry or
  topology issues block later processing.
- `status=unsuitable` means the current model is preliminarily not a meaningful
  mold-analysis candidate, even though import may have succeeded.
- `initial_moldability_assessment` is intentionally preliminary. It is not a
  final manufacturing guarantee.

## Adding a Future Reader

To add a future format such as `STEP` or `3MF`:

1. Implement the `ModelReader` protocol for the new format.
2. Return the shared `ImportedModel` structure in millimeters and Z-up.
3. Register the reader in the default service factory when the format is ready
   for public use.
4. Reuse the existing shared validation, topology, statistics, and reporting
   pipeline instead of bypassing it.

This keeps format-specific parsing isolated from the shared import-analysis
stages.

## Current Limitations

The current pipeline does not yet provide:

- Advanced geometry repair
- STEP import
- Draft-angle analysis
- Undercut detection
- Parting-direction selection
- Wall-thickness analysis
- Mold-geometry generation

The current moldability result is an initial readiness screen built on the
shared import diagnostics and basic mesh facts only.
