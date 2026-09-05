from __future__ import annotations

from pathlib import Path

from mold_generator_engine import (
    CavityAnalysisDecision,
    CavityAnalysisDecisionOutcome,
    CavityAnalysisReport,
    CavityAnalysisService,
    CavityAssessmentOutcome,
    DetailedMoldAnalysisService,
    DetailedMoldAnalysisStatus,
    GenerationReadinessReport,
    GenerationReadinessService,
    GenerationReadinessStatus,
    ImportAnalysisService,
    PartingStrategyType,
    PullDirectionEvaluator,
)


def test_generation_readiness_contract_serializes_chapter_10_inputs() -> None:
    import_report, detailed_report, cavity_report, model = _ready_reports()

    report = GenerationReadinessService().analyze(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )

    assert isinstance(report, GenerationReadinessReport)
    assert report.status in {
        GenerationReadinessStatus.READY,
        GenerationReadinessStatus.READY_WITH_WARNINGS,
        GenerationReadinessStatus.BLOCKED,
    }
    assert report.contract.pull_direction.status in {
        "selected",
        "ambiguous",
        "unavailable",
    }
    assert report.contract.draft_orientation.status in {
        DetailedMoldAnalysisStatus.COMPLETED.value,
        DetailedMoldAnalysisStatus.PARTIAL.value,
        "unavailable",
    }
    assert report.contract.parting_strategies
    assert "contract" in report.to_dict()


def test_generation_readiness_supports_multiple_ranked_parting_strategies() -> None:
    import_report, detailed_report, cavity_report, model = _ready_reports()
    cavity_report = CavityAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=cavity_report.source,
        summary="Core candidate fixture.",
        chapter_2_status=cavity_report.chapter_2_status,
        chapter_3_status=cavity_report.chapter_3_status,
        assessment_outcome=CavityAssessmentOutcome.CORE_OR_INSERT_REVIEW_INDICATED,
        processing_decision=cavity_report.processing_decision,
        cavity_analysis_decision=CavityAnalysisDecision(
            status=DetailedMoldAnalysisStatus.COMPLETED,
            outcome=CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
            summary="Preliminary linear core candidate fixture.",
            linear_candidate_target_ids=("target-a",),
        ),
    )

    report = GenerationReadinessService().analyze(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )

    strategies = report.contract.parting_strategies
    assert len(strategies) >= 2
    assert {strategy.strategy_type for strategy in strategies} >= {
        PartingStrategyType.SIMPLE_TWO_PART_PLANAR.value,
        PartingStrategyType.CORE_ASSISTED_PLANAR.value,
    }
    assert [strategy.rank for strategy in strategies] == list(
        range(1, len(strategies) + 1)
    )
    assert [strategy.score for strategy in strategies] == sorted(
        (strategy.score for strategy in strategies),
        reverse=True,
    )
    assert report.contract.core_cavity_readiness.handling_required is True
    assert report.contract.core_cavity_readiness.target_ids == ("target-a",)


def test_generation_readiness_blocks_insufficient_geometry() -> None:
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/single_triangle_ascii.stl")
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

    report = GenerationReadinessService().analyze(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )

    assert report.status is GenerationReadinessStatus.BLOCKED
    assert report.blockers
    assert report.contract.parting_strategies == ()
    assert report.contract.confidence == 0.0


def test_generation_readiness_is_deterministic_for_same_reports() -> None:
    import_report, detailed_report, cavity_report, model = _ready_reports()
    service = GenerationReadinessService()

    first = service.analyze(import_report, detailed_report, cavity_report, model)
    second = service.analyze(import_report, detailed_report, cavity_report, model)

    assert first.to_dict() == second.to_dict()


def _ready_reports():
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
    return import_report, detailed_report, cavity_report, model
