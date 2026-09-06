from pathlib import Path

import pytest

from mold_generator_engine.io.importers.importer import ModelImporter
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.io.importers.stl_reader import StlReader
from mold_generator_engine.models.imported_model import (
    IssueSeverity,
    ModelFormat,
    TopologyValidationStatus,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityStatus,
)
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


def test_model_importer_imports_stl_through_registered_reader():
    registry = ReaderRegistry()
    registry.register(StlReader())
    importer = ModelImporter(registry)

    source_path = Path("tests/fixtures/models/stl/single_triangle_ascii.stl")

    model = importer.import_model(source_path)

    assert model.source_path == source_path
    assert model.file_format is ModelFormat.STL
    assert len(model.vertices) == 3
    assert len(model.faces) == 1
    assert model.geometry_validation.errors == ()
    assert model.geometry_validation.warnings == ()
    assert model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert model.topology_validation.analysis is not None
    assert model.statistics is not None
    assert model.statistics.surface_area == pytest.approx(0.5)
    assert model.statistics.volume is None
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert model.highest_issue_severity is IssueSeverity.ERROR
    assert model.has_blocking_issues is True
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR


def test_model_importer_exposes_geometry_issue_severity_for_stl():
    registry = ReaderRegistry()
    registry.register(StlReader())
    importer = ModelImporter(registry)

    model = importer.import_model(
        Path("tests/fixtures/models/stl/degenerate_face_ascii.stl")
    )

    assert model.geometry_validation.warnings[0].severity is IssueSeverity.ERROR
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert model.has_blocking_issues is True
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
