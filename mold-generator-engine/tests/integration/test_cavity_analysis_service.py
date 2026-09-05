from __future__ import annotations

from pathlib import Path

from mold_generator_engine import (
    CavityAnalysisReport,
    CavityAnalysisService,
    CavityAssessmentOutcome,
    CavityCandidateDetectionOutcome,
    CavityFindingCode,
    DetailedMoldAnalysisService,
    DetailedMoldAnalysisStatus,
    ImportAnalysisService,
    PullDirectionEvaluator,
)


def test_cavity_analysis_service_integrates_with_ready_chapter_2_and_3_output() -> None:
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    detailed_report = DetailedMoldAnalysisService(
        pull_direction_evaluator=PullDirectionEvaluator(),
    ).analyze(import_report, model)

    cavity_report = CavityAnalysisService().analyze(
        import_report,
        detailed_report,
        model,
    )

    assert isinstance(cavity_report, CavityAnalysisReport)
    assert cavity_report.status is DetailedMoldAnalysisStatus.COMPLETED
    assert cavity_report.assessment_outcome in {
        CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
        CavityAssessmentOutcome.MANUAL_REVIEW_REQUIRED,
        CavityAssessmentOutcome.CORE_OR_INSERT_REVIEW_INDICATED,
        CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED,
    }
    assert cavity_report.candidate_detection is not None
    assert cavity_report.candidate_detection.outcome is (
        CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD
    )
    assert CavityFindingCode.NO_CANDIDATE_DETECTED_BY_CURRENT_SHELL_TOPOLOGY_METHOD in {
        finding.code for finding in cavity_report.findings
    }


def test_cavity_analysis_service_blocks_unprocessable_chapter_2_output() -> None:
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/single_triangle_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    detailed_report = DetailedMoldAnalysisService().analyze(import_report, model)

    cavity_report = CavityAnalysisService().analyze(
        import_report,
        detailed_report,
        model,
    )

    assert cavity_report.status is DetailedMoldAnalysisStatus.BLOCKED
    assert cavity_report.blockers


def test_cavity_analysis_service_is_deterministic_for_same_input() -> None:
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    detailed_report = DetailedMoldAnalysisService(
        pull_direction_evaluator=PullDirectionEvaluator(),
    ).analyze(import_report, model)
    service = CavityAnalysisService()

    first_report = service.analyze(import_report, detailed_report, model)
    second_report = service.analyze(import_report, detailed_report, model)

    assert first_report.to_dict() == second_report.to_dict()
