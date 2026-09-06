# Import Analysis Report

The import analysis report is the engine's unified programmatic summary for a
single model import-and-analysis run. It is intended for later API responses,
user-interface rendering, logging, and downstream mold-processing decisions.

For the public import entry point and the full API contract, see
`docs/model-import-api.md`.

The report includes:

* The overall report status.
* Source file information and reader metadata.
* Aggregated warnings and errors.
* Basic geometry-validation and topology-validation results.
* Model statistics.
* The processing suitability decision.
* The initial moldability assessment.

Example:

```python
from pathlib import Path

from mold_generator_engine import ImportAnalysisService

service = ImportAnalysisService.from_default_readers()
report = service.analyze(Path("tests/fixtures/models/stl/single_triangle_ascii.stl"))
```

The report can be converted into a serialization-safe dictionary:

```python
report_dict = report.to_dict()
```

Example shape:

```python
{
    "schema_version": "1.0",
    "status": "unsuitable",
    "source": {
        "source_name": "single_triangle_ascii.stl",
        "source_path": "tests/fixtures/models/stl/single_triangle_ascii.stl",
        "file_format": "stl",
    },
    "import_succeeded": True,
    "analysis_completed": True,
    "warnings": [],
    "errors": [
        {
            "code": "open_boundary_edges",
            "severity": "error",
        }
    ],
}
```
