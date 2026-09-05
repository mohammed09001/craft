from __future__ import annotations

from pathlib import Path

from mold_generator_engine import (
    CavityAnalysisService,
    DetailedMoldAnalysisService,
    GenerationReadinessService,
    GenerationReadinessStatus,
    ImportAnalysisService,
    PullDirectionEvaluator,
)


def test_generation_readiness_service_integrates_chapter_2_to_4_reports() -> None:
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

    readiness_report = GenerationReadinessService().analyze(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )

    assert readiness_report.status in {
        GenerationReadinessStatus.READY,
        GenerationReadinessStatus.READY_WITH_WARNINGS,
        GenerationReadinessStatus.BLOCKED,
    }
    assert readiness_report.contract.parting_strategies
    assert readiness_report.contract.confidence >= 0.0
    if readiness_report.status is GenerationReadinessStatus.READY:
        assert readiness_report.contract.selected_parting_strategy_id is not None
