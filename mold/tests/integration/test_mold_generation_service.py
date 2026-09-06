from __future__ import annotations

from pathlib import Path

from mold_generator_engine import (
    CavityAnalysisService,
    DetailedMoldAnalysisService,
    ImportAnalysisService,
    MoldComponentPlanningStatus,
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationReport,
    MoldGenerationService,
    PullDirectionEvaluator,
)


def test_mold_generation_service_integrates_with_chapter_2_to_4_reports() -> None:
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
    context = MoldGenerationContext.from_reports(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )

    mold_generation_report = MoldGenerationService().generate(context)

    assert isinstance(mold_generation_report, MoldGenerationReport)
    assert mold_generation_report.status in {
        MoldGenerationDisposition.READY_FOR_PARTING_STRATEGY,
        MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED,
        MoldGenerationDisposition.BLOCKED,
    }
    assert mold_generation_report.preliminary_plan.traceability is not None
    assert mold_generation_report.component_planning is not None
    assert mold_generation_report.component_planning.status in {
        MoldComponentPlanningStatus.READY,
        MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED,
        MoldComponentPlanningStatus.BLOCKED,
        MoldComponentPlanningStatus.UNSUPPORTED,
    }


def test_mold_generation_service_is_deterministic_for_same_reports() -> None:
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
    context = MoldGenerationContext.from_reports(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )
    service = MoldGenerationService()

    first_report = service.generate(context)
    second_report = service.generate(context)

    assert first_report.to_dict() == second_report.to_dict()
    assert first_report.component_planning is not None
