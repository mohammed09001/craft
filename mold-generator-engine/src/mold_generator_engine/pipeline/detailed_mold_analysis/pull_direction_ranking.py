from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from mold_generator_engine.config.pull_direction import PullDirectionRankingSettings
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionRankingResult,
    PullDirectionRankingScoreBreakdown,
    RankedPullDirectionEvaluation,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    PullDirectionRankingPolicy,
)


@dataclass(frozen=True, slots=True)
class DefaultPullDirectionRankingPolicy:
    """Rank stage-3 pull-direction evaluations without recomputing them."""

    settings: PullDirectionRankingSettings = PullDirectionRankingSettings()

    @property
    def policy_id(self) -> str:
        """Return the stable identifier for the default ranking policy."""
        return "stage3_engineering_score_v1"

    def rank(
        self,
        evaluations: tuple[CandidatePullDirectionEvaluation, ...],
    ) -> PullDirectionRankingResult:
        """Return deterministic ranking built directly on stage-3 evaluations."""
        prepared_evaluations = tuple(evaluations)
        if not prepared_evaluations:
            return PullDirectionRankingResult(
                ranked_evaluations=(),
                policy_id=self.policy_id,
                has_engineering_tie_for_top_rank=False,
                has_near_tie_for_top_rank=False,
                top_score=None,
                score_margin_to_runner_up=None,
            )

        sortable_evaluations = tuple(
            _build_sortable_evaluation(
                evaluation=evaluation,
                settings=self.settings,
            )
            for evaluation in prepared_evaluations
        )
        ranked_sortable_evaluations = tuple(
            sorted(sortable_evaluations, key=_sortable_ranking_key)
        )

        top_sortable_evaluation = ranked_sortable_evaluations[0]
        top_score = top_sortable_evaluation.breakdown.engineering_score
        top_axis_key = top_sortable_evaluation.axis_equivalence_key
        ranked_evaluations: list[RankedPullDirectionEvaluation] = []
        previous_score: float | None = None

        for index, sortable_evaluation in enumerate(
            ranked_sortable_evaluations, start=1
        ):
            score_delta_from_top = (
                top_score - sortable_evaluation.breakdown.engineering_score
            )
            score_delta_from_previous = None
            if previous_score is not None:
                score_delta_from_previous = (
                    previous_score - sortable_evaluation.breakdown.engineering_score
                )

            ranked_evaluations.append(
                RankedPullDirectionEvaluation(
                    evaluation=sortable_evaluation.evaluation,
                    rank=index,
                    preliminary_score=sortable_evaluation.breakdown.engineering_score,
                    score_breakdown=sortable_evaluation.breakdown,
                    score_delta_from_top=score_delta_from_top,
                    score_delta_from_previous=score_delta_from_previous,
                    is_engineering_tie_with_top=(
                        score_delta_from_top <= self.settings.score_tolerance
                    ),
                    is_near_tie_with_top=(
                        score_delta_from_top <= self.settings.near_tie_score_tolerance
                    ),
                    shares_axis_with_top=(
                        sortable_evaluation.axis_equivalence_key == top_axis_key
                    ),
                    axis_equivalence_key=sortable_evaluation.axis_equivalence_key,
                    ranking_reasons=_build_ranking_reasons(sortable_evaluation),
                    ranking_warnings=_build_ranking_warnings(sortable_evaluation),
                )
            )
            previous_score = sortable_evaluation.breakdown.engineering_score

        score_margin_to_runner_up = None
        if len(ranked_evaluations) > 1:
            score_margin_to_runner_up = (
                ranked_evaluations[0].preliminary_score
                - ranked_evaluations[1].preliminary_score
            )

        return PullDirectionRankingResult(
            ranked_evaluations=tuple(ranked_evaluations),
            policy_id=self.policy_id,
            has_engineering_tie_for_top_rank=(
                sum(item.is_engineering_tie_with_top for item in ranked_evaluations) > 1
            ),
            has_near_tie_for_top_rank=(
                sum(item.is_near_tie_with_top for item in ranked_evaluations) > 1
            ),
            top_score=top_score,
            score_margin_to_runner_up=score_margin_to_runner_up,
        )


DEFAULT_PULL_DIRECTION_RANKING_POLICY: PullDirectionRankingPolicy = (
    DefaultPullDirectionRankingPolicy()
)


@dataclass(frozen=True, slots=True)
class PreliminaryPullDirectionSelector:
    """Choose one deterministic preliminary representative from ranked results."""

    ranking_policy: PullDirectionRankingPolicy = DEFAULT_PULL_DIRECTION_RANKING_POLICY
    settings: PullDirectionRankingSettings = PullDirectionRankingSettings()

    def select(
        self,
        evaluations: tuple[CandidatePullDirectionEvaluation, ...],
    ) -> PreliminaryPullDirectionSelection:
        """Rank the evaluations and choose one preliminary representative."""
        return self.select_from_ranking(self.ranking_policy.rank(evaluations))

    def select_from_ranking(
        self,
        ranking_result: PullDirectionRankingResult,
    ) -> PreliminaryPullDirectionSelection:
        """Choose one preliminary representative from deterministic ranking."""
        ranked_evaluations = ranking_result.ranked_evaluations
        if not ranked_evaluations:
            return PreliminaryPullDirectionSelection(
                status=PreliminaryPullDirectionSelectionStatus.UNAVAILABLE,
                ranked_evaluations=(),
                reasons=("No pull-direction evaluations were available to rank.",),
                warnings=("Preliminary selection requires at least one evaluation.",),
            )

        top_evaluation = ranked_evaluations[0]
        if not top_evaluation.evaluation.is_evaluable:
            return PreliminaryPullDirectionSelection(
                status=PreliminaryPullDirectionSelectionStatus.UNAVAILABLE,
                ranked_evaluations=ranked_evaluations,
                reasons=(
                    "No ranked pull-direction candidate had analyzable face area.",
                ),
                warnings=top_evaluation.ranking_warnings,
            )

        engineering_ties = tuple(
            evaluation
            for evaluation in ranked_evaluations
            if evaluation.is_engineering_tie_with_top
        )
        near_ties = tuple(
            evaluation
            for evaluation in ranked_evaluations
            if evaluation.is_near_tie_with_top
        )

        reasons = [
            "Preliminary selection uses the stage-3 engineering score as its "
            "primary ranking metric.",
        ]
        warnings = list(top_evaluation.ranking_warnings)

        if len(engineering_ties) > 1:
            reasons.append(
                "Multiple candidates are tied within the engineering score tolerance."
            )
            warnings.extend(_tie_warnings(engineering_ties))
            return PreliminaryPullDirectionSelection(
                status=PreliminaryPullDirectionSelectionStatus.AMBIGUOUS,
                ranked_evaluations=ranked_evaluations,
                selected_evaluation=top_evaluation,
                decisiveness=PreliminaryPullDirectionSelectionDecisiveness.AMBIGUOUS,
                score_margin_to_runner_up=ranking_result.score_margin_to_runner_up,
                reasons=tuple(reasons),
                warnings=tuple(_deduplicate_messages(warnings)),
            )

        if len(near_ties) > 1:
            reasons.append(
                "Multiple candidates remain inside the configured near-tie margin."
            )
            warnings.extend(_tie_warnings(near_ties))
            return PreliminaryPullDirectionSelection(
                status=PreliminaryPullDirectionSelectionStatus.AMBIGUOUS,
                ranked_evaluations=ranked_evaluations,
                selected_evaluation=top_evaluation,
                decisiveness=PreliminaryPullDirectionSelectionDecisiveness.AMBIGUOUS,
                score_margin_to_runner_up=ranking_result.score_margin_to_runner_up,
                reasons=tuple(reasons),
                warnings=tuple(_deduplicate_messages(warnings)),
            )

        score_margin = ranking_result.score_margin_to_runner_up
        decisiveness = _resolve_decisiveness(
            score_margin=score_margin,
            top_evaluation=top_evaluation,
            settings=self.settings,
        )

        if score_margin is None:
            reasons.append(
                "Only one candidate evaluation was available, so no runner-up margin "
                "was required."
            )
        elif decisiveness is PreliminaryPullDirectionSelectionDecisiveness.CLEAR:
            reasons.append(
                "The leading candidate is separated from the runner-up by the clear "
                "selection margin."
            )
        else:
            reasons.append(
                "The leading candidate is ahead of the runner-up but the margin stays "
                "inside the close preliminary-selection band."
            )

        return PreliminaryPullDirectionSelection(
            status=PreliminaryPullDirectionSelectionStatus.SELECTED,
            ranked_evaluations=ranked_evaluations,
            selected_evaluation=top_evaluation,
            decisiveness=decisiveness,
            score_margin_to_runner_up=score_margin,
            reasons=tuple(reasons),
            warnings=tuple(_deduplicate_messages(warnings)),
        )


DEFAULT_PRELIMINARY_PULL_DIRECTION_SELECTOR = PreliminaryPullDirectionSelector()


@dataclass(frozen=True, slots=True)
class _SortableEvaluation:
    evaluation: CandidatePullDirectionEvaluation
    breakdown: PullDirectionRankingScoreBreakdown
    direction_key: tuple[int, int, int]
    axis_equivalence_key: tuple[int, int, int]
    candidate_id: str


def _build_sortable_evaluation(
    *,
    evaluation: CandidatePullDirectionEvaluation,
    settings: PullDirectionRankingSettings,
) -> _SortableEvaluation:
    engineering_score = _require_finite_metric(
        evaluation.engineering_score,
        "engineering score",
        evaluation.candidate.candidate_id,
    )
    low_draft_area_ratio = _require_finite_metric(
        evaluation.aggregate_metrics.low_draft_area_ratio,
        "low-draft area ratio",
        evaluation.candidate.candidate_id,
    )
    mean_draft = _require_finite_metric(
        evaluation.aggregate_metrics.area_weighted_mean_draft_angle_degrees,
        "area-weighted mean draft angle",
        evaluation.candidate.candidate_id,
    )
    analyzed_area = _require_finite_metric(
        evaluation.aggregate_metrics.total_analyzed_area_sq_mm,
        "total analyzed area",
        evaluation.candidate.candidate_id,
    )
    direction_key = _direction_key(
        evaluation=evaluation,
        tolerance=settings.direction_key_tolerance,
    )
    axis_equivalence_key = min(
        direction_key,
        _direction_key(
            evaluation=evaluation,
            tolerance=settings.direction_key_tolerance,
            reverse=True,
        ),
    )

    return _SortableEvaluation(
        evaluation=evaluation,
        breakdown=PullDirectionRankingScoreBreakdown(
            engineering_score=engineering_score,
            low_draft_area_ratio=low_draft_area_ratio,
            area_weighted_mean_draft_angle_degrees=mean_draft,
            total_analyzed_area_sq_mm=analyzed_area,
            warning_count=len(evaluation.warnings),
        ),
        direction_key=direction_key,
        axis_equivalence_key=axis_equivalence_key,
        candidate_id=evaluation.candidate.candidate_id,
    )


def _sortable_ranking_key(
    sortable_evaluation: _SortableEvaluation,
) -> tuple[float | int | tuple[int, int, int] | str, ...]:
    breakdown = sortable_evaluation.breakdown
    return (
        -breakdown.engineering_score,
        int(not sortable_evaluation.evaluation.is_evaluable),
        breakdown.low_draft_area_ratio,
        -breakdown.area_weighted_mean_draft_angle_degrees,
        -breakdown.total_analyzed_area_sq_mm,
        breakdown.warning_count,
        sortable_evaluation.direction_key,
        sortable_evaluation.candidate_id,
    )


def _build_ranking_reasons(
    sortable_evaluation: _SortableEvaluation,
) -> tuple[str, ...]:
    breakdown = sortable_evaluation.breakdown
    return (
        "Primary rank key uses the stage-3 engineering score.",
        (
            "Secondary tie-breakers use lower low-draft area ratio, higher "
            "mean draft angle, and larger analyzed area."
        ),
        (
            "Final technical ordering uses the normalized direction key and "
            "candidate identifier only for determinism."
        ),
        (
            "Stage-3 score="
            f"{breakdown.engineering_score:.6f}, "
            f"low_draft_area_ratio={breakdown.low_draft_area_ratio:.6f}, "
            f"mean_draft_deg={breakdown.area_weighted_mean_draft_angle_degrees:.6f}, "
            f"analyzed_area_sq_mm={breakdown.total_analyzed_area_sq_mm:.6f}."
        ),
    )


def _build_ranking_warnings(
    sortable_evaluation: _SortableEvaluation,
) -> tuple[str, ...]:
    warnings = [warning.message for warning in sortable_evaluation.evaluation.warnings]
    if not sortable_evaluation.evaluation.is_evaluable:
        warnings.append(
            "This candidate could not be evaluated from analyzable positive-area faces."
        )

    return tuple(_deduplicate_messages(warnings))


def _direction_key(
    *,
    evaluation: CandidatePullDirectionEvaluation,
    tolerance: float,
    reverse: bool = False,
) -> tuple[int, int, int]:
    direction = evaluation.candidate.direction
    if reverse:
        direction = -direction

    try:
        return direction.normalized(minimum_magnitude=0.0).canonical_key(
            tolerance=tolerance
        )
    except InvalidVectorError as error:
        raise ValueError(
            "Pull-direction ranking requires each candidate direction to be finite "
            "and non-zero."
        ) from error


def _require_finite_metric(
    value: float,
    metric_name: str,
    candidate_id: str,
) -> float:
    if not isfinite(value):
        raise ValueError(
            f"Candidate '{candidate_id}' produced a non-finite {metric_name}."
        )

    return value


def _resolve_decisiveness(
    *,
    score_margin: float | None,
    top_evaluation: RankedPullDirectionEvaluation,
    settings: PullDirectionRankingSettings,
) -> PreliminaryPullDirectionSelectionDecisiveness:
    if score_margin is None:
        if top_evaluation.ranking_warnings:
            return PreliminaryPullDirectionSelectionDecisiveness.CLOSE

        return PreliminaryPullDirectionSelectionDecisiveness.CLEAR

    if score_margin >= settings.clear_margin and not top_evaluation.ranking_warnings:
        return PreliminaryPullDirectionSelectionDecisiveness.CLEAR

    return PreliminaryPullDirectionSelectionDecisiveness.CLOSE


def _tie_warnings(
    tied_evaluations: tuple[RankedPullDirectionEvaluation, ...],
) -> tuple[str, ...]:
    warnings: list[str] = []
    if any(evaluation.shares_axis_with_top for evaluation in tied_evaluations[1:]):
        warnings.append(
            "Opposite signed directions remain separate candidates even when they "
            "share the same unsigned axis and current evidence is symmetric."
        )
    warnings.append(
        "A deterministic representative is still returned, but the current result "
        "does not prove unique engineering superiority."
    )
    return tuple(warnings)


def _deduplicate_messages(messages: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    ordered_messages: list[str] = []
    seen_messages: set[str] = set()

    for message in messages:
        if message in seen_messages:
            continue

        ordered_messages.append(message)
        seen_messages.add(message)

    return tuple(ordered_messages)
