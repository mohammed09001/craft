from __future__ import annotations

from pathlib import Path

from mold_generator_engine import (
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisService,
    DetailedMoldAnalysisStatus,
    ImportAnalysisService,
    MoldAnalysisModuleResult,
    PullDirectionEvaluator,
)


class FakeDetailedModule:
    @property
    def module_id(self) -> str:
        return "orientation"

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
    ) -> MoldAnalysisModuleResult:
        return MoldAnalysisModuleResult(
            module_id=self.module_id,
            status=DetailedMoldAnalysisStatus.COMPLETED,
            summary=f"Processed {context.source.source_name}.",
        )


def test_detailed_mold_analysis_service_integrates_with_ready_chapter_2_output():
    import_service = ImportAnalysisService.from_default_readers()
    import_report = import_service.analyze(
        Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    )

    assert import_report.processing_decision is not None
    assert import_report.processing_decision.is_processable is True

    model = import_service.importer.import_model(
        Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    )
    service = DetailedMoldAnalysisService(
        modules=(FakeDetailedModule(),),
    )

    detailed_report = service.analyze(import_report, model)

    assert detailed_report.status in {
        DetailedMoldAnalysisStatus.COMPLETED,
        DetailedMoldAnalysisStatus.PARTIAL,
    }
    assert [result.module_id for result in detailed_report.module_results] == [
        "orientation"
    ]


def test_detailed_mold_analysis_service_blocks_unprocessable_chapter_2_output():
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/single_triangle_ascii.stl")
    import_report = import_service.analyze(source_path)

    assert import_report.processing_decision is not None
    assert import_report.processing_decision.is_processable is False

    model = import_service.importer.import_model(source_path)
    service = DetailedMoldAnalysisService(modules=(FakeDetailedModule(),))

    detailed_report = service.analyze(import_report, model)

    assert detailed_report.status is DetailedMoldAnalysisStatus.BLOCKED
    assert detailed_report.module_results == ()


def test_detailed_mold_analysis_service_can_integrate_pull_direction_evaluation():
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    service = DetailedMoldAnalysisService(
        pull_direction_evaluator=PullDirectionEvaluator(),
    )

    detailed_report = service.analyze(import_report, model)

    assert isinstance(detailed_report, DetailedMoldAnalysisReport)
    assert detailed_report.status in {
        DetailedMoldAnalysisStatus.COMPLETED,
        DetailedMoldAnalysisStatus.PARTIAL,
    }
    assert len(detailed_report.pull_direction_evaluations) >= 6
    assert detailed_report.pull_direction_ranking is not None
    assert detailed_report.preliminary_pull_direction_selection is not None
    assert detailed_report.undercut_analysis is not None
    assert detailed_report.draft_analysis is not None
    assert detailed_report.undercut_region_analysis is not None
    assert detailed_report.undercut_risk_assessment is not None
    assert detailed_report.preliminary_moldability_assessment is not None
    assert (
        detailed_report.draft_analysis.selected_pull_direction
        == detailed_report.preliminary_pull_direction_selection.selected_candidate
    )
    assert detailed_report.undercut_analysis.selected_pull_direction == (
        detailed_report.preliminary_pull_direction_selection.selected_candidate
    )
    assert [result.module_id for result in detailed_report.module_results[-8:]] == [
        "candidate_pull_direction_evaluation",
        "preliminary_pull_direction_selection",
        "preliminary_undercut_detection",
        "draft_angle_analysis",
        "undercut_region_analysis",
        "undercut_risk_assessment",
        "moldability_evidence_summary",
        "preliminary_moldability_assessment",
    ]


def test_detailed_mold_analysis_service_is_deterministic_for_same_input():
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    service = DetailedMoldAnalysisService(
        pull_direction_evaluator=PullDirectionEvaluator(),
    )

    first_report = service.analyze(import_report, model)
    second_report = service.analyze(import_report, model)

    assert first_report.to_dict() == second_report.to_dict()
