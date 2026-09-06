from collections.abc import Callable
from pathlib import Path

import pytest

from mold_generator_engine.exceptions import UnsupportedFileExtensionError
from mold_generator_engine.io.importers.importer import ModelImporter
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    GeometryValidationError,
    ImportedModel,
    ImportWarning,
    ModelFormat,
    TopologyValidationStatus,
    Vertex,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityFindingCode,
    InitialMoldabilityStatus,
)
from mold_generator_engine.models.issues import (
    IssueSeverity,
    IssueSource,
    TopologyIssue,
)
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


class FakeReader:
    def __init__(
        self,
        file_format: ModelFormat,
        model_factory: Callable[[Path, ModelFormat], ImportedModel] | None = None,
    ) -> None:
        self._file_format = file_format
        self._model_factory = model_factory
        self.received_path: Path | None = None

    @property
    def file_format(self) -> ModelFormat:
        return self._file_format

    def read(self, source_path: Path) -> ImportedModel:
        self.received_path = source_path

        if self._model_factory is not None:
            return self._model_factory(source_path, self.file_format)

        return _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=self.file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
        )


def _build_model(
    *,
    source_path: Path,
    source_name: str,
    file_format: ModelFormat,
    vertices: list[Vertex],
    faces: list[Face],
    warnings: list[ImportWarning] | None = None,
    metadata: dict[str, object] | None = None,
) -> ImportedModel:
    minimum = Vertex(
        x=min(vertex.x for vertex in vertices),
        y=min(vertex.y for vertex in vertices),
        z=min(vertex.z for vertex in vertices),
    )
    maximum = Vertex(
        x=max(vertex.x for vertex in vertices),
        y=max(vertex.y for vertex in vertices),
        z=max(vertex.z for vertex in vertices),
    )

    return ImportedModel(
        source_path=source_path,
        source_name=source_name,
        file_format=file_format,
        vertices=vertices,
        faces=faces,
        bounding_box=BoundingBox(minimum=minimum, maximum=maximum),
        dimensions=Dimensions(
            x=maximum.x - minimum.x,
            y=maximum.y - minimum.y,
            z=maximum.z - minimum.z,
        ),
        warnings=list(warnings or []),
        metadata=dict(metadata or {}),
    )


def test_importer_selects_reader_from_file_extension():
    registry = ReaderRegistry()
    reader = FakeReader(ModelFormat.STL)
    registry.register(reader)
    importer = ModelImporter(registry)
    source_path = Path("models/sample.stl")

    model = importer.import_model(source_path)

    assert reader.received_path == source_path
    assert model.file_format is ModelFormat.STL
    assert model.source_path == source_path
    assert model.geometry_validation.errors == ()
    assert model.geometry_validation.warnings == ()
    assert model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert model.topology_validation.analysis is not None
    assert model.statistics is not None
    assert model.statistics.vertex_count == 3
    assert model.statistics.face_count == 1
    assert model.statistics.volume is None
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert [
        finding.code for finding in model.initial_moldability_assessment.findings
    ] == [
        InitialMoldabilityFindingCode.ZERO_OR_NEAR_ZERO_EXTENT,
        InitialMoldabilityFindingCode.OPEN_MESH,
    ]
    assert model.topology_validation.issues == (
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
            metadata={
                "edge_count": 3,
                "edges": ((0, 1), (0, 2), (1, 2)),
            },
        ),
    )
    assert model.has_blocking_issues is True
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR


def test_importer_accepts_uppercase_file_extension():
    registry = ReaderRegistry()
    reader = FakeReader(ModelFormat.STL)
    registry.register(reader)
    importer = ModelImporter(registry)
    source_path = Path("models/sample.STL")

    model = importer.import_model(source_path)

    assert reader.received_path == source_path
    assert model.file_format is ModelFormat.STL
    assert model.topology_validation.status is TopologyValidationStatus.COMPLETED


def test_importer_marks_closed_manifold_model_as_ready():
    registry = ReaderRegistry()
    reader = FakeReader(
        ModelFormat.STL,
        model_factory=lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
                Vertex(x=0.0, y=0.0, z=1.0),
            ],
            faces=[
                Face(vertex_1=0, vertex_2=1, vertex_3=2),
                Face(vertex_1=0, vertex_2=3, vertex_3=1),
                Face(vertex_1=0, vertex_2=2, vertex_3=3),
                Face(vertex_1=1, vertex_2=3, vertex_3=2),
            ],
        ),
    )
    registry.register(reader)
    importer = ModelImporter(registry)

    model = importer.import_model(Path("models/closed_tetrahedron.stl"))

    assert model.geometry_validation.errors == ()
    assert model.geometry_validation.warnings == ()
    assert model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert model.topology_validation.issues == ()
    assert model.statistics is not None
    assert model.statistics.volume == pytest.approx(1.0 / 6.0)
    assert model.statistics.volume_is_reliable is True
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
    )
    assert model.processing_decision.status is ModelProcessingStatus.READY


def test_importer_returns_topology_analysis_for_models_with_topology_issues():
    registry = ReaderRegistry()
    reader = FakeReader(
        ModelFormat.STL,
        model_factory=lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[
                Face(vertex_1=0, vertex_2=1, vertex_3=2),
                Face(vertex_1=2, vertex_2=1, vertex_3=0),
            ],
        ),
    )
    registry.register(reader)
    importer = ModelImporter(registry)

    model = importer.import_model(Path("models/duplicate_faces.stl"))

    assert model.geometry_validation.errors == ()
    assert model.topology_validation.status is TopologyValidationStatus.COMPLETED
    assert model.topology_validation.analysis is not None
    assert model.topology_validation.analysis.duplicate_faces == ((0, 1, 2),)
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert model.topology_validation.issues == (
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
            metadata={
                "face_count": 1,
                "face_keys": ((0, 1, 2),),
            },
        ),
    )
    assert model.processing_decision.status is ModelProcessingStatus.READY_WITH_WARNINGS


def test_importer_skips_topology_analysis_when_geometry_validation_fails():
    registry = ReaderRegistry()
    reader = FakeReader(
        ModelFormat.STL,
        model_factory=lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[Face(vertex_1=0, vertex_2=1, vertex_3=3)],
        ),
    )
    registry.register(reader)
    importer = ModelImporter(registry)

    model = importer.import_model(Path("models/invalid_face_index.stl"))

    assert model.geometry_validation.errors == (
        GeometryValidationError(
            code="face_index_out_of_range",
            message=(
                "Face 1 references a vertex index outside the imported vertex list."
            ),
            severity=IssueSeverity.CRITICAL,
        ),
    )
    assert model.topology_validation.status is TopologyValidationStatus.SKIPPED
    assert model.topology_validation.analysis is None
    assert (
        model.topology_validation.skip_reason
        == "Basic geometry validation reported fatal errors."
    )
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.NOT_ASSESSABLE
    )
    assert model.processing_decision.status is ModelProcessingStatus.REJECTED


def test_importer_rejects_unsupported_file_extension():
    importer = ModelImporter(ReaderRegistry())

    with pytest.raises(UnsupportedFileExtensionError):
        importer.import_model(Path("models/sample.step"))


def test_importer_preserves_custom_reader_warning():
    registry = ReaderRegistry()
    reader_warning = ImportWarning(
        code="reader_warning",
        message="Reader found non-standard metadata.",
        severity=IssueSeverity.WARNING,
    )
    reader = FakeReader(
        ModelFormat.STL,
        model_factory=lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
                Vertex(x=0.0, y=0.0, z=1.0),
            ],
            faces=[
                Face(vertex_1=0, vertex_2=1, vertex_3=2),
                Face(vertex_1=0, vertex_2=3, vertex_3=1),
                Face(vertex_1=0, vertex_2=2, vertex_3=3),
                Face(vertex_1=1, vertex_2=3, vertex_3=2),
            ],
            warnings=[reader_warning],
        ),
    )
    registry.register(reader)
    importer = ModelImporter(registry)

    model = importer.import_model(Path("models/reader_warning.stl"))

    assert model.geometry_validation.warnings == ()
    assert model.warnings == [reader_warning]
    assert model.has_blocking_issues is False
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
    )
    assert model.processing_decision.status is ModelProcessingStatus.READY_WITH_WARNINGS


def test_importer_adds_geometry_validation_warnings_without_duplicates():
    registry = ReaderRegistry()
    shared_warning = ImportWarning(
        code="degenerate_face",
        message="Degenerate face 1 has zero area.",
        source=IssueSource.GEOMETRY_VALIDATION,
        severity=IssueSeverity.ERROR,
    )
    reader = FakeReader(
        ModelFormat.STL,
        model_factory=lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[Face(vertex_1=0, vertex_2=0, vertex_3=2)],
            warnings=[
                ImportWarning(
                    code="reader_warning",
                    message="Reader found non-standard metadata.",
                    severity=IssueSeverity.WARNING,
                ),
                shared_warning,
            ],
        ),
    )
    registry.register(reader)
    importer = ModelImporter(registry)

    model = importer.import_model(Path("models/degenerate_with_reader_warning.stl"))

    assert model.geometry_validation.warnings == (shared_warning,)
    assert model.warnings == [
        ImportWarning(
            code="reader_warning",
            message="Reader found non-standard metadata.",
            severity=IssueSeverity.WARNING,
        ),
        shared_warning,
    ]
    assert model.has_blocking_issues is True
    assert model.initial_moldability_assessment is not None
    assert (
        model.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
