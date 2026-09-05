from pathlib import Path

from mold_generator_engine import ImportAnalysisService
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReportStatus,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityStatus,
)
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


def test_import_analysis_service_analyzes_open_stl_fixture_with_default_readers():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(
        Path("tests/fixtures/models/stl/single_triangle_ascii.stl")
    )

    assert report.import_succeeded is True
    assert report.analysis_completed is True
    assert report.status is ImportAnalysisReportStatus.UNSUITABLE
    assert report.source.file_format == "stl"
    assert report.geometry_validation is not None
    assert report.topology_validation is not None
    assert report.statistics is not None
    assert report.processing_decision is not None
    assert report.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    assert report.initial_moldability_assessment is not None
    assert (
        report.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )
    assert report.to_dict()["status"] == "unsuitable"


def test_import_analysis_service_analyzes_closed_stl_fixture_as_ready():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(
        Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    )

    assert report.import_succeeded is True
    assert report.analysis_completed is True
    assert report.status is ImportAnalysisReportStatus.READY
    assert report.source.file_format == "stl"
    assert report.errors == ()
    assert report.warnings == ()
    assert report.statistics is not None
    assert report.statistics.volume_is_reliable is True
    assert report.processing_decision is not None
    assert report.processing_decision.status is ModelProcessingStatus.READY
    assert report.initial_moldability_assessment is not None
    assert (
        report.initial_moldability_assessment.status
        is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
    )


def test_import_analysis_service_analyzes_closed_obj_fixture_as_ready():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(Path("tests/fixtures/models/obj/closed_tetrahedron.obj"))

    assert report.import_succeeded is True
    assert report.analysis_completed is True
    assert report.status is ImportAnalysisReportStatus.READY
    assert report.source.file_format == "obj"
    assert report.errors == ()
    assert report.warnings == ()
    assert report.statistics is not None
    assert report.statistics.volume_is_reliable is True
    assert report.processing_decision is not None
    assert report.processing_decision.status is ModelProcessingStatus.READY
    assert report.initial_moldability_assessment is not None
    assert (
        report.initial_moldability_assessment.status
        is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
    )


def test_import_analysis_service_surfaces_geometry_issues_in_unified_report():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(
        Path("tests/fixtures/models/stl/degenerate_face_ascii.stl")
    )

    assert report.import_succeeded is True
    assert report.analysis_completed is True
    assert report.status is ImportAnalysisReportStatus.UNSUITABLE
    assert report.geometry_validation is not None
    assert [issue.code for issue in report.geometry_validation.warnings] == [
        "degenerate_face"
    ]
    assert {issue.code for issue in report.errors} >= {
        "degenerate_face",
        "open_boundary_edges",
    }
    assert report.processing_decision is not None
    assert report.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    assert [issue.code for issue in report.processing_decision.blocking_issues] == [
        "degenerate_face",
        "open_boundary_edges",
    ]
    assert report.initial_moldability_assessment is not None
    assert (
        report.initial_moldability_assessment.status
        is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    )


def test_import_analysis_service_returns_failed_report_for_missing_file():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(Path("tests/fixtures/models/stl/missing_file.stl"))

    assert report.import_succeeded is False
    assert report.analysis_completed is False
    assert report.status is ImportAnalysisReportStatus.IMPORT_FAILED
    assert report.source.file_format == "stl"
    assert [issue.code for issue in report.errors] == ["file_not_found"]


def test_import_analysis_service_returns_failed_report_for_unsupported_extension():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(Path("tests/fixtures/models/step/sample.step"))

    assert report.import_succeeded is False
    assert report.analysis_completed is False
    assert report.status is ImportAnalysisReportStatus.IMPORT_FAILED
    assert report.source.file_format == "step"
    assert [issue.code for issue in report.errors] == ["unsupported_file_extension"]


def test_import_analysis_service_returns_failed_report_for_corrupted_stl():
    service = ImportAnalysisService.from_default_readers()

    report = service.analyze(Path("tests/fixtures/models/stl/truncated_binary.stl"))

    assert report.import_succeeded is False
    assert report.analysis_completed is False
    assert report.status is ImportAnalysisReportStatus.IMPORT_FAILED
    assert report.source.file_format == "stl"
    assert [issue.code for issue in report.errors] == ["corrupted_model_file"]


def test_import_analysis_service_returns_deterministic_serialized_report():
    service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/degenerate_face_ascii.stl")

    first_report = service.analyze(source_path)
    second_report = service.analyze(source_path)

    assert first_report.to_dict() == second_report.to_dict()
