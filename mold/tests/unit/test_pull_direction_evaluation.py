from __future__ import annotations

from math import inf, nan

import pytest

from mold_generator_engine.geometry import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    FaceGeometry,
    FaceGeometryAnalysis,
    PullDirectionCandidate,
    PullDirectionCandidates,
    PullDirectionEvaluationSettings,
    PullDirectionSideClassification,
    PullDirectionSource,
    PullDirectionSourceReference,
)
from mold_generator_engine.pipeline.detailed_mold_analysis import (
    PullDirectionEvaluator,
)


def _candidate(
    candidate_id: str,
    direction: Vector3D,
    *,
    order_index: int = 0,
) -> PullDirectionCandidate:
    return PullDirectionCandidate(
        candidate_id=candidate_id,
        order_index=order_index,
        direction=direction,
        source=PullDirectionSource.GLOBAL_AXIS,
        source_references=(
            PullDirectionSourceReference(source=PullDirectionSource.GLOBAL_AXIS),
        ),
    )


def _face(
    face_index: int,
    *,
    area: float,
    unit_normal: Vector3D | None,
    is_degenerate: bool = False,
) -> FaceGeometry:
    return FaceGeometry(
        face_index=face_index,
        vertex_indices=(0, 1, 2),
        centroid=Vector3D(0.0, 0.0, 0.0),
        raw_normal=unit_normal,
        unit_normal=unit_normal,
        area=area,
        is_degenerate=is_degenerate,
    )


def _analysis(*faces: FaceGeometry) -> FaceGeometryAnalysis:
    valid_faces = [
        face
        for face in faces
        if not face.is_degenerate and face.unit_normal is not None and face.area > 0.0
    ]
    degenerate_face_indices = tuple(
        face.face_index for face in faces if face.is_degenerate
    )
    return FaceGeometryAnalysis(
        faces=faces,
        total_face_count=len(faces),
        valid_face_count=len(valid_faces),
        degenerate_face_count=len(degenerate_face_indices),
        valid_surface_area_sq_mm=sum(face.area for face in valid_faces),
        degenerate_face_indices=degenerate_face_indices,
    )


def test_pull_direction_evaluation_computes_alignment_and_zero_draft_for_normal_perpendicular_to_pull_direction() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(_face(0, area=2.0, unit_normal=Vector3D(1.0, 0.0, 0.0)))
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)
    face_result = result.face_evaluations[0]

    assert face_result.is_analyzable is True
    assert face_result.signed_alignment == pytest.approx(0.0)
    assert face_result.draft_angle_degrees == pytest.approx(0.0)
    assert face_result.side_classification is PullDirectionSideClassification.NEUTRAL


def test_pull_direction_evaluation_computes_ninety_degree_draft_for_normal_parallel_to_pull_direction() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(_face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)))
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)

    assert result.face_evaluations[0].draft_angle_degrees == pytest.approx(90.0)


def test_pull_direction_evaluation_classifies_positive_negative_and_neutral_faces() -> (
    None
):
    evaluator = PullDirectionEvaluator(
        PullDirectionEvaluationSettings(
            minimum_recommended_draft_degrees=3.0,
            alignment_tolerance=1e-5,
        )
    )
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(0.0, 0.0, -1.0)),
        _face(2, area=1.0, unit_normal=Vector3D(1.0, 0.0, 1e-6)),
    )
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)

    assert [face.side_classification for face in result.face_evaluations] == [
        PullDirectionSideClassification.POSITIVE,
        PullDirectionSideClassification.NEGATIVE,
        PullDirectionSideClassification.NEUTRAL,
    ]


def test_pull_direction_evaluation_aggregates_area_weighted_metrics_and_low_draft_area() -> (
    None
):
    evaluator = PullDirectionEvaluator(
        PullDirectionEvaluationSettings(
            minimum_recommended_draft_degrees=45.0,
            alignment_tolerance=1e-6,
        )
    )
    analysis = _analysis(
        _face(0, area=2.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(0.0, 0.0, -1.0)),
        _face(2, area=1.0, unit_normal=Vector3D(1.0, 0.0, 0.0)),
    )
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)
    metrics = result.aggregate_metrics

    assert metrics.total_analyzed_area_sq_mm == pytest.approx(4.0)
    assert metrics.positive_side_area_ratio == pytest.approx(0.5)
    assert metrics.negative_side_area_ratio == pytest.approx(0.25)
    assert metrics.neutral_area_ratio == pytest.approx(0.25)
    assert metrics.low_draft_area_sq_mm == pytest.approx(1.0)
    assert metrics.low_draft_area_ratio == pytest.approx(0.25)
    assert metrics.area_weighted_mean_draft_angle_degrees == pytest.approx(67.5)
    assert metrics.minimum_observed_draft_angle_degrees == pytest.approx(0.0)
    assert metrics.faces_meeting_recommended_draft_count == 2
    assert result.engineering_score == pytest.approx(75.0)


def test_pull_direction_evaluation_score_is_symmetric_between_opposite_directions() -> (
    None
):
    evaluator = PullDirectionEvaluator(
        PullDirectionEvaluationSettings(minimum_recommended_draft_degrees=45.0)
    )
    analysis = _analysis(
        _face(0, area=2.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(0.0, 0.0, -1.0)),
        _face(2, area=1.0, unit_normal=Vector3D(1.0, 0.0, 0.0)),
    )
    forward = evaluator.evaluate_candidate(
        analysis,
        _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0)),
    )
    reverse = evaluator.evaluate_candidate(
        analysis,
        _candidate("axis:-z", Vector3D(0.0, 0.0, -1.0)),
    )

    assert forward.engineering_score == pytest.approx(reverse.engineering_score)
    assert forward.aggregate_metrics.positive_side_area_ratio == pytest.approx(
        reverse.aggregate_metrics.negative_side_area_ratio
    )
    assert forward.aggregate_metrics.negative_side_area_ratio == pytest.approx(
        reverse.aggregate_metrics.positive_side_area_ratio
    )
    assert forward.aggregate_metrics.neutral_area_ratio == pytest.approx(
        reverse.aggregate_metrics.neutral_area_ratio
    )


def test_pull_direction_evaluation_preserves_area_based_result_when_one_face_is_split() -> (
    None
):
    evaluator = PullDirectionEvaluator(
        PullDirectionEvaluationSettings(minimum_recommended_draft_degrees=45.0)
    )
    unsplit_analysis = _analysis(
        _face(0, area=2.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(1.0, 0.0, 0.0)),
    )
    split_analysis = _analysis(
        _face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(2, area=1.0, unit_normal=Vector3D(1.0, 0.0, 0.0)),
    )
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    unsplit = evaluator.evaluate_candidate(unsplit_analysis, candidate)
    split = evaluator.evaluate_candidate(split_analysis, candidate)

    assert unsplit.aggregate_metrics.total_analyzed_area_sq_mm == pytest.approx(
        split.aggregate_metrics.total_analyzed_area_sq_mm
    )
    assert unsplit.aggregate_metrics.positive_side_area_ratio == pytest.approx(
        split.aggregate_metrics.positive_side_area_ratio
    )
    assert unsplit.aggregate_metrics.low_draft_area_ratio == pytest.approx(
        split.aggregate_metrics.low_draft_area_ratio
    )
    assert (
        unsplit.aggregate_metrics.area_weighted_mean_draft_angle_degrees
        == pytest.approx(split.aggregate_metrics.area_weighted_mean_draft_angle_degrees)
    )
    assert unsplit.engineering_score == pytest.approx(split.engineering_score)


def test_pull_direction_evaluation_ignores_zero_area_and_invalid_normal_faces_without_division_by_zero() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(
        _face(0, area=0.0, unit_normal=Vector3D(0.0, 0.0, 1.0), is_degenerate=True),
        _face(1, area=1.0, unit_normal=None),
    )
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)

    assert result.is_evaluable is False
    assert result.aggregate_metrics.total_analyzed_area_sq_mm == pytest.approx(0.0)
    assert result.engineering_score == pytest.approx(0.0)
    assert {warning.code.value for warning in result.warnings} == {
        "non_analyzable_faces_ignored",
        "no_analyzable_face_area",
    }


def test_pull_direction_evaluation_accepts_near_axis_normals_without_trigonometric_domain_errors() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0 + 1e-12)),
        _face(1, area=1.0, unit_normal=Vector3D(0.0, 0.0, -1.0 - 1e-12)),
    )
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)

    assert result.face_evaluations[0].draft_angle_degrees == pytest.approx(90.0)
    assert result.face_evaluations[1].draft_angle_degrees == pytest.approx(90.0)


def test_pull_direction_evaluation_rejects_zero_or_non_finite_candidate_directions() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(_face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)))

    with pytest.raises(ValueError):
        evaluator.evaluate_candidate(
            analysis, _candidate("zero", Vector3D(0.0, 0.0, 0.0))
        )

    with pytest.raises(ValueError):
        evaluator.evaluate_candidate(
            analysis, _candidate("nan", Vector3D(nan, 0.0, 0.0))
        )

    with pytest.raises(ValueError):
        evaluator.evaluate_candidate(
            analysis, _candidate("inf", Vector3D(inf, 0.0, 0.0))
        )


def test_pull_direction_evaluation_rejects_invalid_settings() -> None:
    with pytest.raises(ValueError):
        PullDirectionEvaluationSettings(minimum_recommended_draft_degrees=0.0)

    with pytest.raises(ValueError):
        PullDirectionEvaluationSettings(minimum_recommended_draft_degrees=nan)

    with pytest.raises(ValueError):
        PullDirectionEvaluationSettings(alignment_tolerance=-1e-6)

    with pytest.raises(ValueError):
        PullDirectionEvaluationSettings(alignment_tolerance=1.0)


def test_pull_direction_evaluation_preserves_candidate_order_and_duplicate_entries() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(_face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)))
    candidates = PullDirectionCandidates(
        candidates=(
            _candidate("first", Vector3D(0.0, 0.0, 1.0), order_index=0),
            _candidate("second", Vector3D(0.0, 0.0, 1.0), order_index=1),
        )
    )

    results = evaluator.evaluate_candidates(analysis, candidates)

    assert [result.candidate.candidate_id for result in results] == ["first", "second"]


def test_pull_direction_evaluation_supports_scoring_policy_injection() -> None:
    class FixedScorePolicy:
        def score(self, **_: object) -> float:
            return 12.5

    evaluator = PullDirectionEvaluator(scoring_policy=FixedScorePolicy())
    analysis = _analysis(_face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)))
    candidate = _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0))

    result = evaluator.evaluate_candidate(analysis, candidate)

    assert result.engineering_score == pytest.approx(12.5)


def test_pull_direction_evaluation_is_deterministic_and_does_not_mutate_inputs() -> (
    None
):
    evaluator = PullDirectionEvaluator()
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(1.0, 0.0, 0.0)),
    )
    candidates = PullDirectionCandidates(
        candidates=(
            _candidate("axis:+z", Vector3D(0.0, 0.0, 1.0), order_index=0),
            _candidate("axis:+x", Vector3D(1.0, 0.0, 0.0), order_index=1),
        )
    )
    original_analysis = analysis
    original_candidates = candidates

    first = evaluator.evaluate_candidates(analysis, candidates)
    second = evaluator.evaluate_candidates(analysis, candidates)

    assert first == second
    assert analysis == original_analysis
    assert candidates == original_candidates


def test_pull_direction_evaluation_can_be_used_from_public_root_package() -> None:
    import mold_generator_engine

    assert mold_generator_engine.PullDirectionEvaluator is not None
    assert mold_generator_engine.CandidatePullDirectionEvaluation is not None
    assert mold_generator_engine.PullDirectionEvaluationSettings is not None
    assert mold_generator_engine.PullDirectionSideClassification is not None
