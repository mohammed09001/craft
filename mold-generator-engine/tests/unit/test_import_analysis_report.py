from collections.abc import Callable
from pathlib import Path

from mold_generator_engine.io.importers.importer import ModelImporter
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReportStatus,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ImportWarning,
    ModelFormat,
    TopologyValidationStatus,
    Vertex,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.import_analysis import (
    ImportAnalysisReportBuilder,
    ImportAnalysisService,
)
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


class FakeReader:
    def __init__(
        self,
        file_format: ModelFormat,
        model_factory: Callable[[Path, ModelFormat], ImportedModel],
    ) -> None:
        self._file_format = file_format
        self._model_factory = model_factory

    @property
    def file_format(self) -> ModelFormat:
        return self._file_format

    def read(self, source_path: Path) -> ImportedModel:
        return self._model_factory(source_path, self.file_format)


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


def _import_with_fake_reader(
    model_factory: Callable[[Path, ModelFormat], ImportedModel],
) -> ImportedModel:
    registry = ReaderRegistry()
    registry.register(FakeReader(ModelFormat.STL, model_factory))
    importer = ModelImporter(registry)

    return importer.import_model(Path("models/sample.stl"))


def _collect_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        keys = set(value)
        for nested_value in value.values():
            keys.update(_collect_keys(nested_value))

        return keys

    if isinstance(value, list):
        keys: set[str] = set()

        for nested_value in value:
            keys.update(_collect_keys(nested_value))

        return keys

    return set()


def test_builder_creates_ready_report_for_closed_manifold_model():
    model = _import_with_fake_reader(
        lambda source_path, file_format: _build_model(
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
        )
    )

    report = ImportAnalysisReportBuilder().build_from_model(model)

    assert report.status is ImportAnalysisReportStatus.READY
    assert report.import_succeeded is True
    assert report.analysis_completed is True
    assert report.summary == "Model import and analysis completed successfully."
    assert report.warnings == ()
    assert report.errors == ()
    assert report.processing_decision is not None
    assert report.processing_decision.status is ModelProcessingStatus.READY
    assert report.initial_moldability_assessment is not None
    assert (
        report.initial_moldability_assessment.status
        is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
    )


def test_builder_creates_ready_with_warnings_report_without_duplicate_warnings():
    reader_warning = ImportWarning(
        code="reader_warning",
        message="Reader found non-standard metadata.",
        severity=IssueSeverity.WARNING,
    )
    model = _import_with_fake_reader(
        lambda source_path, file_format: _build_model(
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
        )
    )

    report = ImportAnalysisReportBuilder().build_from_model(model)

    assert report.status is ImportAnalysisReportStatus.READY_WITH_WARNINGS
    assert report.analysis_completed is True
    assert report.warnings == (reader_warning,)
    assert report.errors == ()
    assert report.issue_counts.warning_count == 1
    assert report.processing_decision is not None
    assert (
        report.processing_decision.status is ModelProcessingStatus.READY_WITH_WARNINGS
    )


def test_builder_marks_unsuitable_report_for_preliminarily_unsuitable_model():
    model = _import_with_fake_reader(
        lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
        )
    )

    report = ImportAnalysisReportBuilder().build_from_model(model)

    assert report.status is ImportAnalysisReportStatus.UNSUITABLE
    assert report.import_succeeded is True
    assert report.analysis_completed is True
    assert report.processing_decision is not None
    assert report.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    assert report.initial_moldability_assessment is not None
    assert (
        report.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )


def test_builder_marks_analysis_incomplete_when_geometry_failure_skips_later_stages():
    model = _import_with_fake_reader(
        lambda source_path, file_format: _build_model(
            source_path=source_path,
            source_name=source_path.name,
            file_format=file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[Face(vertex_1=0, vertex_2=1, vertex_3=3)],
        )
    )

    report = ImportAnalysisReportBuilder().build_from_model(model)

    assert report.status is ImportAnalysisReportStatus.ANALYSIS_INCOMPLETE
    assert report.analysis_completed is False
    assert report.topology_validation is not None
    assert report.topology_validation.status is TopologyValidationStatus.SKIPPED
    assert report.statistics is None


def test_service_returns_import_failed_report_for_unsupported_extension():
    service = ImportAnalysisService(importer=ModelImporter(ReaderRegistry()))

    report = service.analyze(Path("models/sample.step"))

    assert report.status is ImportAnalysisReportStatus.IMPORT_FAILED
    assert report.import_succeeded is False
    assert report.analysis_completed is False
    assert report.source.file_format == "step"
    assert report.errors[0].code == "unsupported_file_extension"


def test_report_to_dict_serializes_nested_values_without_mesh_payload():
    model = _import_with_fake_reader(
        lambda source_path, file_format: _build_model(
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
            metadata={"reader": "fake"},
        )
    )
    report = ImportAnalysisReportBuilder().build_from_model(model)

    serialized_report = report.to_dict()
    serialized_keys = _collect_keys(serialized_report)

    assert serialized_report["schema_version"] == "1.0"
    assert serialized_report["status"] == "ready"
    assert serialized_report["source"]["file_format"] == "stl"
    assert serialized_report["processing_decision"]["status"] == "ready"
    assert (
        serialized_report["initial_moldability_assessment"]["status"]
        == "ready_for_detailed_analysis"
    )
    assert "vertices" not in serialized_keys
    assert "faces" not in serialized_keys
