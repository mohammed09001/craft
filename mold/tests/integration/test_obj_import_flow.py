from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from mold_generator_engine.io.importers.importer import ModelImporter
from mold_generator_engine.io.importers.obj_reader import ObjReader
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    IssueSeverity,
    ModelFormat,
    TopologyValidationStatus,
    Vertex,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityStatus,
)
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


def test_model_importer_imports_obj_through_registered_reader():
    registry = ReaderRegistry()
    registry.register(ObjReader())
    importer = ModelImporter(registry)

    source_path = Path("tests/fixtures/models/obj/single_triangle.obj")

    model = importer.import_model(source_path)

    assert model.source_path == source_path
    assert model.source_name == "single_triangle.obj"
    assert model.file_format is ModelFormat.OBJ
    assert len(model.vertices) == 3
    assert len(model.faces) == 1
    assert model.bounding_box == BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=10.0, y=5.0, z=0.0),
    )
    assert model.dimensions == Dimensions(x=10.0, y=5.0, z=0.0)
    assert model.geometry_validation.errors == ()
    assert model.geometry_validation.warnings == ()
    assert model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert model.topology_validation.analysis is not None
    assert model.statistics is not None
    assert model.statistics.centroid.x == pytest.approx(10.0 / 3.0)
    assert model.statistics.centroid.y == pytest.approx(5.0 / 3.0)
    assert model.statistics.centroid.z == pytest.approx(0.0)
    assert model.statistics.volume is None
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert model.highest_issue_severity is IssueSeverity.ERROR
    assert model.has_blocking_issues is True
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR


def test_model_importer_accepts_uppercase_obj_extension():
    registry = ReaderRegistry()
    registry.register(ObjReader())
    importer = ModelImporter(registry)

    with TemporaryDirectory(dir=".") as temporary_directory:
        source_path = Path(temporary_directory) / "single_triangle.OBJ"
        source_path.write_text(
            Path("tests/fixtures/models/obj/single_triangle.obj").read_text(
                encoding="utf-8"
            ),
            encoding="utf-8",
        )

        model = importer.import_model(source_path)

        assert model.source_path == source_path
        assert model.source_name == "single_triangle.OBJ"
        assert model.file_format is ModelFormat.OBJ
        assert len(model.vertices) == 3
        assert len(model.faces) == 1
        assert model.geometry_validation.errors == ()
        assert model.topology_validation.status is TopologyValidationStatus.COMPLETED
        assert model.initial_moldability_assessment is not None
        assert (
            model.initial_moldability_assessment.status
            is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
        )
        assert model.highest_issue_severity is IssueSeverity.ERROR
        assert model.has_blocking_issues is True
        assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR


def test_model_importer_exposes_geometry_issue_severity_for_obj():
    registry = ReaderRegistry()
    registry.register(ObjReader())
    importer = ModelImporter(registry)

    model = importer.import_model(Path("tests/fixtures/models/obj/degenerate_face.obj"))

    assert model.geometry_validation.warnings[0].severity is IssueSeverity.ERROR
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert model.has_blocking_issues is True
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
