from __future__ import annotations

from pathlib import Path

from mold_generator_engine import (
    DetailedMoldAnalysisContext,
    ImportAnalysisService,
    PreliminaryPullDirectionSelector,
    PullDirectionEvaluator,
    analyze_model_face_geometry,
    generate_candidate_pull_directions,
)


def test_detailed_mold_analysis_foundation_integrates_with_context_and_imported_model():
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    context = DetailedMoldAnalysisContext.from_report(import_report, model)

    first_face_analysis = analyze_model_face_geometry(context.model)
    second_face_analysis = analyze_model_face_geometry(context.model)
    first_candidates = generate_candidate_pull_directions(first_face_analysis)
    second_candidates = generate_candidate_pull_directions(second_face_analysis)

    assert first_face_analysis.total_face_count == len(model.faces)
    assert first_face_analysis.degenerate_face_count == 0
    assert [
        candidate.candidate_id for candidate in first_candidates.candidates[:6]
    ] == [
        "axis:+x",
        "axis:-x",
        "axis:+y",
        "axis:-y",
        "axis:+z",
        "axis:-z",
    ]
    assert first_candidates.candidate_count >= 6
    assert first_face_analysis == second_face_analysis
    assert first_candidates == second_candidates


def test_detailed_mold_analysis_foundation_integrates_ranking_and_selection():
    import_service = ImportAnalysisService.from_default_readers()
    source_path = Path("tests/fixtures/models/stl/closed_tetrahedron_ascii.stl")
    import_report = import_service.analyze(source_path)
    model = import_service.importer.import_model(source_path)
    context = DetailedMoldAnalysisContext.from_report(import_report, model)
    face_analysis = analyze_model_face_geometry(context.model)
    candidates = generate_candidate_pull_directions(face_analysis)
    evaluations = PullDirectionEvaluator().evaluate_candidates(
        face_analysis, candidates
    )

    selection = PreliminaryPullDirectionSelector().select(evaluations)

    assert selection.ranked_evaluations
    assert selection.selected_evaluation == selection.ranked_evaluations[0]
    assert selection.selected_candidate is not None
