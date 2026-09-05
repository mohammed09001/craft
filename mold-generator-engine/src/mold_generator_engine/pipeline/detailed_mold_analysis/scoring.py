from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.detailed_mold_analysis import (
    FacePullDirectionEvaluation,
    PullDirectionAggregateMetrics,
    PullDirectionEvaluationSettings,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    PullDirectionScoringPolicy,
)


@dataclass(frozen=True, slots=True)
class AreaWeightedDraftScoringPolicy:
    """Score a pull direction from local draft quality weighted by face area."""

    def score(
        self,
        *,
        face_evaluations: tuple[FacePullDirectionEvaluation, ...],
        aggregate_metrics: PullDirectionAggregateMetrics,
        settings: PullDirectionEvaluationSettings,
    ) -> float:
        """Return a deterministic score in the inclusive range 0 to 100."""
        total_area = aggregate_metrics.total_analyzed_area_sq_mm
        if total_area <= 0.0:
            return 0.0

        weighted_quality_sum = 0.0
        for evaluation in face_evaluations:
            if not evaluation.is_analyzable or evaluation.draft_angle_degrees is None:
                continue

            face_quality = _clamp01(
                evaluation.draft_angle_degrees
                / settings.minimum_recommended_draft_degrees
            )
            weighted_quality_sum += evaluation.face_area_sq_mm * face_quality

        return max(0.0, min(100.0, 100.0 * (weighted_quality_sum / total_area)))


DEFAULT_PULL_DIRECTION_SCORING_POLICY: PullDirectionScoringPolicy = (
    AreaWeightedDraftScoringPolicy()
)


def _clamp01(value: float) -> float:
    if value <= 0.0:
        return 0.0
    if value >= 1.0:
        return 1.0
    return value
