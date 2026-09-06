import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from mold_generator_engine.exceptions import EmptyGeometryError
from mold_generator_engine.io.importers.model_repair import (
    ModelRepairResult,
    remove_degenerate_faces,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    GeometryValidationResult,
    ImportedModel,
    ImportWarning,
    ModelFormat,
    TopologyValidationStatus,
    Vertex,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityStatus,
)
from mold_generator_engine.models.issues import IssueSeverity, IssueSource
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


def _build_imported_model(
    *,
    faces: list[Face],
    warnings: list[ImportWarning] | None = None,
    geometry_validation: GeometryValidationResult | None = None,
    metadata: dict[str, object] | None = None,
) -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
        Vertex(x=2.0, y=0.0, z=0.0),
        Vertex(x=3.0, y=0.0, z=0.0),
        Vertex(x=4.0, y=0.0, z=0.0),
    ]
    bounding_box = BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=4.0, y=1.0, z=0.0),
    )
    dimensions = Dimensions(x=4.0, y=1.0, z=0.0)

    model = ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=faces,
        bounding_box=bounding_box,
        dimensions=dimensions,
        warnings=list(warnings or []),
        metadata=dict(metadata or {}),
    )
    if geometry_validation is not None:
        model.geometry_validation = geometry_validation

    return model


def test_remove_degenerate_faces_returns_result_without_changes_for_valid_model():
    faces = [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=1, vertex_2=3, vertex_3=2),
    ]
    warnings = [
        ImportWarning(
            code="import_note",
            message="Imported successfully.",
        )
    ]
    metadata = {"stl_encoding": "ascii"}
    model = _build_imported_model(
        faces=faces,
        warnings=warnings,
        geometry_validation=GeometryValidationResult(),
        metadata=metadata,
    )

    result = remove_degenerate_faces(model)

    assert isinstance(result, ModelRepairResult)
    assert result.removed_face_count == 0
    assert result.removed_face_indices == ()
    assert result.model.faces == faces
    assert result.model.faces is not model.faces
    assert result.model.vertices == model.vertices
    assert result.model.bounding_box is model.bounding_box
    assert result.model.dimensions is model.dimensions
    assert result.model.warnings == [
        ImportWarning(
            code="import_note",
            message="Imported successfully.",
            severity=IssueSeverity.ERROR,
        )
    ]
    assert result.model.warnings is not model.warnings
    assert result.model.metadata == metadata
    assert result.model.metadata is not model.metadata
    assert result.model.geometry_validation == GeometryValidationResult()
    assert result.model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert result.model.statistics is not None
    assert result.model.statistics.face_count == 2
    assert result.model.statistics.volume is None
    assert result.model.initial_moldability_assessment is not None
    assert (
        result.model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert (
        result.model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    )


def test_remove_degenerate_faces_removes_only_degenerate_faces_in_order():
    faces = [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=0, vertex_2=0, vertex_3=2),
        Face(vertex_1=1, vertex_2=2, vertex_3=3),
        Face(vertex_1=3, vertex_2=4, vertex_3=5),
    ]
    warnings = [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 2 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        ),
        ImportWarning(
            code="user_note",
            message="Keep history.",
        ),
    ]
    metadata = {"obj_face_count": 4}
    model = _build_imported_model(
        faces=faces,
        warnings=warnings,
        geometry_validation=GeometryValidationResult(
            warnings=(
                ImportWarning(
                    code="degenerate_face",
                    message="Degenerate face 2 has zero area.",
                    source=IssueSource.GEOMETRY_VALIDATION,
                ),
                ImportWarning(
                    code="degenerate_face",
                    message="Degenerate face 4 has zero area.",
                    source=IssueSource.GEOMETRY_VALIDATION,
                ),
            )
        ),
        metadata=metadata,
    )

    result = remove_degenerate_faces(model)

    assert result.removed_face_count == 2
    assert result.removed_face_indices == (1, 3)
    assert result.model.faces == [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=1, vertex_2=2, vertex_3=3),
    ]
    assert result.model.vertices == model.vertices
    assert result.model.vertices is not model.vertices
    assert result.model.warnings == [
        ImportWarning(
            code="user_note",
            message="Keep history.",
            severity=IssueSeverity.ERROR,
        )
    ]
    assert result.model.warnings is not model.warnings
    assert result.model.metadata == metadata
    assert result.model.metadata is not model.metadata
    assert result.model.source_path == model.source_path
    assert result.model.source_name == model.source_name
    assert result.model.file_format is model.file_format
    assert result.model.bounding_box is model.bounding_box
    assert result.model.dimensions is model.dimensions
    assert result.model.geometry_validation == GeometryValidationResult()
    assert result.model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert result.model.statistics is not None
    assert result.model.statistics.face_count == 2
    assert result.model.statistics.volume is None
    assert result.model.initial_moldability_assessment is not None
    assert (
        result.model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert (
        result.model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    )


def test_remove_degenerate_faces_raises_error_when_all_faces_are_degenerate():
    model = _build_imported_model(
        faces=[
            Face(vertex_1=0, vertex_2=0, vertex_3=2),
            Face(vertex_1=3, vertex_2=4, vertex_3=5),
        ]
    )

    with pytest.raises(EmptyGeometryError):
        remove_degenerate_faces(model)


def test_remove_degenerate_faces_does_not_mutate_original_model():
    faces = [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=0, vertex_2=0, vertex_3=2),
        Face(vertex_1=1, vertex_2=2, vertex_3=3),
    ]
    warnings = [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 2 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        )
    ]
    metadata = {"stl_encoding": "ascii"}
    model = _build_imported_model(
        faces=faces,
        warnings=warnings,
        geometry_validation=GeometryValidationResult(
            warnings=tuple(warnings),
        ),
        metadata=metadata,
    )
    original_faces = list(model.faces)
    original_warnings = list(model.warnings)
    original_metadata = dict(model.metadata)

    result = remove_degenerate_faces(model)

    assert model.faces == original_faces
    assert model.warnings == original_warnings
    assert model.metadata == original_metadata
    assert result.model is not model


def test_remove_degenerate_faces_refreshes_geometry_validation_for_repaired_model():
    warnings = [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 2 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        )
    ]
    model = _build_imported_model(
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=0, vertex_3=2),
        ],
        warnings=warnings,
        geometry_validation=GeometryValidationResult(
            warnings=tuple(warnings),
        ),
    )

    result = remove_degenerate_faces(model)

    assert model.warnings == warnings
    assert model.geometry_validation == GeometryValidationResult(
        warnings=tuple(warnings),
    )
    assert result.model.geometry_validation == GeometryValidationResult()
    assert result.model.warnings == []
    assert result.model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert result.model.statistics is not None
    assert result.model.statistics.face_count == 1
    assert result.model.initial_moldability_assessment is not None
    assert (
        result.model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert (
        result.model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    )
