from __future__ import annotations

from dataclasses import replace
from math import inf, nan

import pytest

from mold_generator_engine.geometry import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionEvaluationWarning,
    PullDirectionEvaluationWarningCode,
    PullDirectionSource,
    PullDirectionSourceReference,
)
from mold_generator_engine.pipeline.detailed_mold_analysis import (
    DefaultPullDirectionRankingPolicy,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PreliminaryPullDirectionSelector,
)


def _candidate(
    candidate_id: str,
    direction: Vector3D,
    *,
    face_index: int | None = None,
) -> PullDirectionCandidate:
    return PullDirectionCandidate(
        candidate_id=candidate_id,
        order_index=0,
        direction=direction,
        source=PullDirectionSource.FACE_NORMAL,
        source_references=(
            PullDirectionSourceReference(
                source=PullDirectionSource.FACE_NORMAL,
                face_index=face_index,
            ),
        ),
    )


def _aggregate_metrics(
    *,
    total_area: float = 10.0,
    low_draft_ratio: float = 0.1,
    mean_draft: float = 45.0,
) -> PullDirectionAggregateMetrics:
    return PullDirectionAggregateMetrics(
        analyzed_face_count=4,
        ignored_face_count=0,
        total_analyzed_area_sq_mm=total_area,
        positive_side_area_sq_mm=5.0,
        negative_side_area_sq_mm=5.0,
        neutral_area_sq_mm=0.0,
        positive_side_area_ratio=0.5,
        negative_side_area_ratio=0.5,
        neutral_area_ratio=0.0,
        low_draft_area_sq_mm=total_area * low_draft_ratio,
        low_draft_area_ratio=low_draft_ratio,
        area_weighted_mean_draft_angle_degrees=mean_draft,
        minimum_observed_draft_angle_degrees=5.0,
        faces_meeting_recommended_draft_count=4,
    )


def _evaluation(
    candidate_id: str,
    direction: Vector3D,
    *,
    engineering_score: float,
    total_area: float = 10.0,
    low_draft_ratio: float = 0.1,
    mean_draft: float = 45.0,
    is_evaluable: bool = True,
    warnings: tuple[PullDirectionEvaluationWarning, ...] = (),
    face_index: int | None = None,
) -> CandidatePullDirectionEvaluation:
    return CandidatePullDirectionEvaluation(
        candidate=_candidate(candidate_id, direction, face_index=face_index),
        aggregate_metrics=_aggregate_metrics(
            total_area=total_area,
            low_draft_ratio=low_draft_ratio,
            mean_draft=mean_draft,
        ),
        engineering_score=engineering_score,
        is_evaluable=is_evaluable,
        warnings=warnings,
    )


def test_selector_returns_unavailable_when_no_evaluations_are_provided() -> None:
    selector = PreliminaryPullDirectionSelector()

    selection = selector.select(())

    assert selection.status is PreliminaryPullDirectionSelectionStatus.UNAVAILABLE
    assert selection.selected_candidate is None
    assert selection.ranked_evaluations == ()


def test_single_candidate_is_ranked_first_and_selected_preliminarily() -> None:
    selector = PreliminaryPullDirectionSelector()
    evaluation = _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=88.0)

    selection = selector.select((evaluation,))

    assert selection.status is PreliminaryPullDirectionSelectionStatus.SELECTED
    assert selection.selected_candidate == evaluation.candidate
    assert selection.selected_evaluation is not None
    assert selection.selected_evaluation.rank == 1
    assert selection.decisiveness is PreliminaryPullDirectionSelectionDecisiveness.CLEAR


def test_ranking_orders_candidates_from_best_to_worst() -> None:
    policy = DefaultPullDirectionRankingPolicy()
    evaluations = (
        _evaluation("axis:+x", Vector3D(1.0, 0.0, 0.0), engineering_score=72.0),
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=91.0),
        _evaluation("axis:+y", Vector3D(0.0, 1.0, 0.0), engineering_score=83.0),
    )

    ranking = policy.rank(evaluations)

    assert [item.candidate.candidate_id for item in ranking.ranked_evaluations] == [
        "axis:+z",
        "axis:+y",
        "axis:+x",
    ]


def test_ranking_is_independent_of_input_order() -> None:
    selector = PreliminaryPullDirectionSelector()
    first_order = (
        _evaluation("axis:+x", Vector3D(1.0, 0.0, 0.0), engineering_score=70.0),
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=93.0),
        _evaluation("axis:+y", Vector3D(0.0, 1.0, 0.0), engineering_score=85.0),
    )
    second_order = tuple(reversed(first_order))

    first_selection = selector.select(first_order)
    second_selection = selector.select(second_order)

    assert [
        item.candidate.candidate_id for item in first_selection.ranked_evaluations
    ] == [item.candidate.candidate_id for item in second_selection.ranked_evaluations]
    assert first_selection.selected_candidate == second_selection.selected_candidate


def test_selection_marks_exact_top_tie_as_ambiguous_but_deterministic() -> None:
    selector = PreliminaryPullDirectionSelector()
    evaluations = (
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=90.0),
        _evaluation("axis:-z", Vector3D(0.0, 0.0, -1.0), engineering_score=90.0),
    )

    first_selection = selector.select(evaluations)
    second_selection = selector.select(tuple(reversed(evaluations)))

    assert first_selection.status is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    assert first_selection.decisiveness is (
        PreliminaryPullDirectionSelectionDecisiveness.AMBIGUOUS
    )
    assert first_selection.selected_candidate is not None
    assert first_selection.selected_candidate == second_selection.selected_candidate
    assert [
        item.candidate.direction for item in first_selection.ranked_evaluations
    ] == [
        Vector3D(0.0, 0.0, -1.0),
        Vector3D(0.0, 0.0, 1.0),
    ]


def test_selection_marks_near_tie_within_tolerance_as_ambiguous() -> None:
    selector = PreliminaryPullDirectionSelector()
    evaluations = (
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=90.0),
        _evaluation("axis:+y", Vector3D(0.0, 1.0, 0.0), engineering_score=88.5),
    )

    selection = selector.select(evaluations)

    assert selection.status is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    assert selection.selected_candidate == evaluations[0].candidate


def test_opposite_directions_remain_separate_and_record_axis_equivalence() -> None:
    policy = DefaultPullDirectionRankingPolicy()
    evaluations = (
        _evaluation("axis:+x", Vector3D(1.0, 0.0, 0.0), engineering_score=90.0),
        _evaluation("axis:-x", Vector3D(-1.0, 0.0, 0.0), engineering_score=90.0),
    )

    ranking = policy.rank(evaluations)

    assert ranking.candidate_count == 2
    assert (
        ranking.ranked_evaluations[0].axis_equivalence_key
        == ranking.ranked_evaluations[1].axis_equivalence_key
    )
    assert ranking.ranked_evaluations[1].shares_axis_with_top is True


def test_ranking_preserves_stage_3_evaluation_and_source_references() -> None:
    evaluation = _evaluation(
        "face-normal:4",
        Vector3D(0.0, 0.0, 1.0),
        engineering_score=84.0,
        face_index=4,
    )
    policy = DefaultPullDirectionRankingPolicy()

    ranking = policy.rank((evaluation,))
    ranked_evaluation = ranking.ranked_evaluations[0]

    assert ranked_evaluation.evaluation is evaluation
    assert ranked_evaluation.candidate.face_indices == (4,)
    assert ranked_evaluation.preliminary_score == pytest.approx(84.0)
    assert ranked_evaluation.score_breakdown.engineering_score == pytest.approx(84.0)


@pytest.mark.parametrize(
    ("evaluation", "message_part"),
    [
        (
            _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=nan),
            "engineering score",
        ),
        (
            replace(
                _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=90.0),
                aggregate_metrics=replace(
                    _aggregate_metrics(),
                    low_draft_area_ratio=inf,
                ),
            ),
            "low-draft area ratio",
        ),
    ],
)
def test_ranking_rejects_non_finite_scores_and_metrics(
    evaluation: CandidatePullDirectionEvaluation,
    message_part: str,
) -> None:
    policy = DefaultPullDirectionRankingPolicy()

    with pytest.raises(ValueError, match=message_part):
        policy.rank((evaluation,))


def test_ranking_does_not_mutate_inputs() -> None:
    selector = PreliminaryPullDirectionSelector()
    evaluations = (
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=90.0),
        _evaluation("axis:+x", Vector3D(1.0, 0.0, 0.0), engineering_score=70.0),
    )
    original_evaluations = evaluations

    selector.select(evaluations)

    assert evaluations == original_evaluations


def test_selected_candidate_matches_first_ranked_result() -> None:
    selector = PreliminaryPullDirectionSelector()
    evaluations = (
        _evaluation("axis:+x", Vector3D(1.0, 0.0, 0.0), engineering_score=82.0),
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=95.0),
    )

    selection = selector.select(evaluations)

    assert selection.selected_evaluation == selection.ranked_evaluations[0]
    assert selection.selected_candidate == selection.ranked_evaluations[0].candidate


def test_score_margin_is_computed_against_the_runner_up() -> None:
    selector = PreliminaryPullDirectionSelector()
    evaluations = (
        _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=92.0),
        _evaluation("axis:+y", Vector3D(0.0, 1.0, 0.0), engineering_score=80.5),
    )

    selection = selector.select(evaluations)

    assert selection.score_margin_to_runner_up == pytest.approx(11.5)


def test_selection_decisiveness_changes_around_thresholds() -> None:
    selector = PreliminaryPullDirectionSelector()
    clear_selection = selector.select(
        (
            _evaluation("axis:+z", Vector3D(0.0, 0.0, 1.0), engineering_score=95.0),
            _evaluation("axis:+y", Vector3D(0.0, 1.0, 0.0), engineering_score=84.0),
        )
    )
    close_selection = selector.select(
        (
            _evaluation(
                "axis:+z",
                Vector3D(0.0, 0.0, 1.0),
                engineering_score=95.0,
                warnings=(
                    PullDirectionEvaluationWarning(
                        code=PullDirectionEvaluationWarningCode.NON_ANALYZABLE_FACES_IGNORED,
                        message="Some faces were ignored.",
                    ),
                ),
            ),
            _evaluation("axis:+y", Vector3D(0.0, 1.0, 0.0), engineering_score=91.0),
        )
    )

    assert clear_selection.decisiveness is (
        PreliminaryPullDirectionSelectionDecisiveness.CLEAR
    )
    assert close_selection.status is PreliminaryPullDirectionSelectionStatus.SELECTED
    assert close_selection.decisiveness is (
        PreliminaryPullDirectionSelectionDecisiveness.CLOSE
    )


def test_non_evaluable_candidates_do_not_produce_a_selected_direction() -> None:
    selector = PreliminaryPullDirectionSelector()
    selection = selector.select(
        (
            _evaluation(
                "axis:+z",
                Vector3D(0.0, 0.0, 1.0),
                engineering_score=0.0,
                is_evaluable=False,
            ),
        )
    )

    assert selection.status is PreliminaryPullDirectionSelectionStatus.UNAVAILABLE
    assert selection.selected_direction is None


def test_ranking_is_available_from_the_public_root_package() -> None:
    import mold_generator_engine

    assert mold_generator_engine.PreliminaryPullDirectionSelector is not None
    assert mold_generator_engine.DefaultPullDirectionRankingPolicy is not None
    assert mold_generator_engine.PullDirectionRankingResult is not None
