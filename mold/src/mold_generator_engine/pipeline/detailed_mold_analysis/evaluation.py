from __future__ import annotations

from dataclasses import dataclass
from math import asin, degrees, isfinite

from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    FaceGeometry,
    FaceGeometryAnalysis,
    FacePullDirectionEvaluation,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionCandidates,
    PullDirectionEvaluationSettings,
    PullDirectionEvaluationWarning,
    PullDirectionEvaluationWarningCode,
    PullDirectionSideClassification,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    CandidatePullDirectionEvaluator,
    PullDirectionScoringPolicy,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.scoring import (
    DEFAULT_PULL_DIRECTION_SCORING_POLICY,
)


@dataclass(frozen=True, slots=True)
class PullDirectionEvaluator:
    """Evaluate local draft behavior for each candidate pull direction."""

    settings: PullDirectionEvaluationSettings = PullDirectionEvaluationSettings()
    scoring_policy: PullDirectionScoringPolicy = DEFAULT_PULL_DIRECTION_SCORING_POLICY

    def evaluate_candidates(
        self,
        face_analysis: FaceGeometryAnalysis,
        candidates: PullDirectionCandidates,
    ) -> tuple[CandidatePullDirectionEvaluation, ...]:
        """Return immutable candidate evaluations in the original candidate order."""
        return tuple(
            self.evaluate_candidate(face_analysis, candidate_direction)
            for candidate_direction in candidates.candidates
        )

    def evaluate_candidate(
        self,
        face_analysis: FaceGeometryAnalysis,
        candidate_direction: PullDirectionCandidate,
    ) -> CandidatePullDirectionEvaluation:
        """Evaluate one candidate pull direction from analyzed face geometry."""
        unit_pull_direction = _normalize_candidate_direction(
            candidate_direction.direction
        )
        face_evaluations: list[FacePullDirectionEvaluation] = []
        warnings: list[PullDirectionEvaluationWarning] = []

        analyzed_face_count = 0
        ignored_face_count = 0
        total_analyzed_area_sq_mm = 0.0
        positive_side_area_sq_mm = 0.0
        negative_side_area_sq_mm = 0.0
        neutral_area_sq_mm = 0.0
        low_draft_area_sq_mm = 0.0
        weighted_draft_sum = 0.0
        minimum_observed_draft_angle_degrees: float | None = None
        faces_meeting_recommended_draft_count = 0

        for face in face_analysis.faces:
            face_evaluation = _evaluate_face(
                face=face,
                unit_pull_direction=unit_pull_direction,
                settings=self.settings,
            )
            face_evaluations.append(face_evaluation)

            if not face_evaluation.is_analyzable:
                ignored_face_count += 1
                continue

            analyzed_face_count += 1
            total_analyzed_area_sq_mm += face_evaluation.face_area_sq_mm

            if (
                face_evaluation.side_classification
                is PullDirectionSideClassification.POSITIVE
            ):
                positive_side_area_sq_mm += face_evaluation.face_area_sq_mm
            elif (
                face_evaluation.side_classification
                is PullDirectionSideClassification.NEGATIVE
            ):
                negative_side_area_sq_mm += face_evaluation.face_area_sq_mm
            else:
                neutral_area_sq_mm += face_evaluation.face_area_sq_mm

            if face_evaluation.draft_angle_degrees is not None:
                weighted_draft_sum += (
                    face_evaluation.face_area_sq_mm
                    * face_evaluation.draft_angle_degrees
                )
                if minimum_observed_draft_angle_degrees is None:
                    minimum_observed_draft_angle_degrees = (
                        face_evaluation.draft_angle_degrees
                    )
                else:
                    minimum_observed_draft_angle_degrees = min(
                        minimum_observed_draft_angle_degrees,
                        face_evaluation.draft_angle_degrees,
                    )

            if face_evaluation.meets_recommended_draft:
                faces_meeting_recommended_draft_count += 1
            else:
                low_draft_area_sq_mm += face_evaluation.face_area_sq_mm

        if ignored_face_count > 0:
            warnings.append(
                PullDirectionEvaluationWarning(
                    code=PullDirectionEvaluationWarningCode.NON_ANALYZABLE_FACES_IGNORED,
                    message=(
                        "One or more faces were ignored because they did not provide "
                        "finite positive-area local geometry for pull-direction evaluation."
                    ),
                    metadata={"ignored_face_count": ignored_face_count},
                )
            )

        is_evaluable = total_analyzed_area_sq_mm > 0.0
        if not is_evaluable:
            warnings.append(
                PullDirectionEvaluationWarning(
                    code=PullDirectionEvaluationWarningCode.NO_ANALYZABLE_FACE_AREA,
                    message=(
                        "Candidate pull-direction evaluation could not find any "
                        "analyzable positive-area faces."
                    ),
                )
            )

        aggregate_metrics = PullDirectionAggregateMetrics(
            analyzed_face_count=analyzed_face_count,
            ignored_face_count=ignored_face_count,
            total_analyzed_area_sq_mm=total_analyzed_area_sq_mm,
            positive_side_area_sq_mm=positive_side_area_sq_mm,
            negative_side_area_sq_mm=negative_side_area_sq_mm,
            neutral_area_sq_mm=neutral_area_sq_mm,
            positive_side_area_ratio=_safe_ratio(
                positive_side_area_sq_mm,
                total_analyzed_area_sq_mm,
            ),
            negative_side_area_ratio=_safe_ratio(
                negative_side_area_sq_mm,
                total_analyzed_area_sq_mm,
            ),
            neutral_area_ratio=_safe_ratio(
                neutral_area_sq_mm,
                total_analyzed_area_sq_mm,
            ),
            low_draft_area_sq_mm=low_draft_area_sq_mm,
            low_draft_area_ratio=_safe_ratio(
                low_draft_area_sq_mm,
                total_analyzed_area_sq_mm,
            ),
            area_weighted_mean_draft_angle_degrees=_safe_ratio(
                weighted_draft_sum,
                total_analyzed_area_sq_mm,
            ),
            minimum_observed_draft_angle_degrees=minimum_observed_draft_angle_degrees,
            faces_meeting_recommended_draft_count=faces_meeting_recommended_draft_count,
        )
        engineering_score = self.scoring_policy.score(
            face_evaluations=tuple(face_evaluations),
            aggregate_metrics=aggregate_metrics,
            settings=self.settings,
        )

        return CandidatePullDirectionEvaluation(
            candidate=candidate_direction,
            aggregate_metrics=aggregate_metrics,
            engineering_score=engineering_score,
            is_evaluable=is_evaluable,
            face_evaluations=tuple(face_evaluations),
            warnings=tuple(warnings),
        )


DEFAULT_PULL_DIRECTION_EVALUATOR: CandidatePullDirectionEvaluator = (
    PullDirectionEvaluator()
)


def _evaluate_face(
    *,
    face: FaceGeometry,
    unit_pull_direction: Vector3D,
    settings: PullDirectionEvaluationSettings,
) -> FacePullDirectionEvaluation:
    if not _is_positive_finite_area(face.area) or face.unit_normal is None:
        return FacePullDirectionEvaluation(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            signed_alignment=None,
            draft_angle_degrees=None,
            side_classification=None,
            meets_recommended_draft=False,
            is_analyzable=False,
        )

    try:
        unit_face_normal = face.unit_normal.normalized(minimum_magnitude=0.0)
    except InvalidVectorError:
        return FacePullDirectionEvaluation(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            signed_alignment=None,
            draft_angle_degrees=None,
            side_classification=None,
            meets_recommended_draft=False,
            is_analyzable=False,
        )

    signed_alignment = _clamp_alignment(unit_face_normal.dot(unit_pull_direction))
    draft_angle_degrees = degrees(asin(abs(signed_alignment)))
    side_classification = _classify_side(
        signed_alignment=signed_alignment,
        alignment_tolerance=settings.alignment_tolerance,
    )
    meets_recommended_draft = (
        draft_angle_degrees >= settings.minimum_recommended_draft_degrees
    )

    return FacePullDirectionEvaluation(
        face_index=face.face_index,
        face_area_sq_mm=face.area,
        signed_alignment=signed_alignment,
        draft_angle_degrees=draft_angle_degrees,
        side_classification=side_classification,
        meets_recommended_draft=meets_recommended_draft,
        is_analyzable=True,
    )


def _normalize_candidate_direction(direction: Vector3D) -> Vector3D:
    try:
        return direction.normalized(minimum_magnitude=0.0)
    except InvalidVectorError as error:
        raise ValueError(
            "Candidate pull direction must be finite and non-zero."
        ) from error


def _is_positive_finite_area(area_sq_mm: float) -> bool:
    return isfinite(area_sq_mm) and area_sq_mm > 0.0


def _clamp_alignment(value: float) -> float:
    if value <= -1.0:
        return -1.0
    if value >= 1.0:
        return 1.0
    return value


def _classify_side(
    *,
    signed_alignment: float,
    alignment_tolerance: float,
) -> PullDirectionSideClassification:
    if signed_alignment > alignment_tolerance:
        return PullDirectionSideClassification.POSITIVE
    if signed_alignment < -alignment_tolerance:
        return PullDirectionSideClassification.NEGATIVE
    return PullDirectionSideClassification.NEUTRAL


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0.0:
        return 0.0
    return numerator / denominator
