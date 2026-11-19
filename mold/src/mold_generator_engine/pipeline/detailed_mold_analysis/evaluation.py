from __future__ import annotations

from collections.abc import Sequence
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
    AreaWeightedDraftScoringPolicy,
)


class FaceEvaluationsNotRetainedError(LookupError):
    """Raised when the per-face evaluations of a candidate are read although the evaluator was told not to keep them."""


class UnretainedFaceEvaluations(Sequence[FacePullDirectionEvaluation]):
    """Stands in for a candidate's per-face evaluations when they are not kept: it knows how many there were.

    Every face has one evaluation per candidate, so the length is the face count; reading an item raises
    ``FaceEvaluationsNotRetainedError`` (a ``LookupError``, not an ``IndexError``, so iterating it fails loudly instead of
    looking empty).
    """

    __slots__ = ("_count",)

    def __init__(self, count: int) -> None:
        self._count = count

    def __len__(self) -> int:
        return self._count

    def __getitem__(self, index):  # type: ignore[no-untyped-def, override]
        raise FaceEvaluationsNotRetainedError(
            "The per-face evaluations were not kept (PullDirectionEvaluator(retain_face_evaluations=False))."
        )

    def __repr__(self) -> str:
        return f"UnretainedFaceEvaluations(count={self._count})"


@dataclass(frozen=True, slots=True)
class PullDirectionEvaluator:
    """Evaluate local draft behavior for each candidate pull direction.

    By default every candidate keeps one evaluation object per face (candidates x faces objects: millions for a smooth mesh,
    where every face normal is a candidate). With ``retain_face_evaluations=False`` they are not built: the aggregate metrics, the
    score, the warnings and the evaluability are computed exactly the same way in the same loop, and ``face_evaluations`` becomes
    an ``UnretainedFaceEvaluations`` that only knows its length. That mode applies to the default scoring policy; a custom policy
    needs the evaluations, so it keeps them.
    """

    settings: PullDirectionEvaluationSettings = PullDirectionEvaluationSettings()
    scoring_policy: PullDirectionScoringPolicy = DEFAULT_PULL_DIRECTION_SCORING_POLICY
    retain_face_evaluations: bool = True

    def evaluate_candidates(
        self,
        face_analysis: FaceGeometryAnalysis,
        candidates: PullDirectionCandidates,
    ) -> tuple[CandidatePullDirectionEvaluation, ...]:
        """Return immutable candidate evaluations in the original candidate order."""
        # What depends only on a face (is it analyzable, its normalized normal) is worked out once for all candidates.
        face_data = _face_invariants(face_analysis)
        return tuple(
            self._evaluate(face_data, candidate_direction)
            for candidate_direction in candidates.candidates
        )

    def evaluate_candidate(
        self,
        face_analysis: FaceGeometryAnalysis,
        candidate_direction: PullDirectionCandidate,
    ) -> CandidatePullDirectionEvaluation:
        """Evaluate one candidate pull direction from analyzed face geometry."""
        return self._evaluate(_face_invariants(face_analysis), candidate_direction)

    def _evaluate(
        self,
        face_data: list[_FaceInvariants],
        candidate_direction: PullDirectionCandidate,
    ) -> CandidatePullDirectionEvaluation:
        unit_pull_direction = _normalize_candidate_direction(
            candidate_direction.direction
        )
        pull_x = unit_pull_direction.x
        pull_y = unit_pull_direction.y
        pull_z = unit_pull_direction.z
        alignment_tolerance = self.settings.alignment_tolerance
        minimum_recommended_draft = self.settings.minimum_recommended_draft_degrees
        positive_side = PullDirectionSideClassification.POSITIVE
        negative_side = PullDirectionSideClassification.NEGATIVE
        neutral_side = PullDirectionSideClassification.NEUTRAL
        retain = self.retain_face_evaluations or not isinstance(
            self.scoring_policy, AreaWeightedDraftScoringPolicy
        )
        weighted_quality_sum = 0.0  # the default scoring policy's sum, accumulated here when the evaluations are not kept
        face_evaluations: list[FacePullDirectionEvaluation] = []

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

        # The per-face arithmetic of ``_evaluate_face`` and the accumulation of the original loop, in the same order of
        # operations (so every float comes out identical), without a call per face.
        append_face_evaluation = face_evaluations.append
        for face_index, area, normal_x, normal_y, normal_z, fixed in face_data:
            if fixed is not None:  # not analyzable: the same immutable result for every candidate
                if retain:
                    append_face_evaluation(fixed)
                ignored_face_count += 1
                continue

            signed_alignment = (normal_x * pull_x) + (normal_y * pull_y) + (normal_z * pull_z)
            if signed_alignment <= -1.0:
                signed_alignment = -1.0
            elif signed_alignment >= 1.0:
                signed_alignment = 1.0
            draft_angle_degrees = degrees(asin(abs(signed_alignment)))
            if signed_alignment > alignment_tolerance:
                side_classification = positive_side
            elif signed_alignment < -alignment_tolerance:
                side_classification = negative_side
            else:
                side_classification = neutral_side
            meets_recommended_draft = draft_angle_degrees >= minimum_recommended_draft

            if retain:
                append_face_evaluation(
                    FacePullDirectionEvaluation(
                        face_index,
                        area,
                        signed_alignment,
                        draft_angle_degrees,
                        side_classification,
                        meets_recommended_draft,
                        True,
                    )
                )
            else:
                # AreaWeightedDraftScoringPolicy.score, one face at a time and in the same order.
                face_quality = draft_angle_degrees / minimum_recommended_draft
                if face_quality <= 0.0:
                    face_quality = 0.0
                elif face_quality >= 1.0:
                    face_quality = 1.0
                weighted_quality_sum += area * face_quality

            analyzed_face_count += 1
            total_analyzed_area_sq_mm += area

            if side_classification is positive_side:
                positive_side_area_sq_mm += area
            elif side_classification is negative_side:
                negative_side_area_sq_mm += area
            else:
                neutral_area_sq_mm += area

            weighted_draft_sum += area * draft_angle_degrees
            if minimum_observed_draft_angle_degrees is None:
                minimum_observed_draft_angle_degrees = draft_angle_degrees
            else:
                minimum_observed_draft_angle_degrees = min(
                    minimum_observed_draft_angle_degrees,
                    draft_angle_degrees,
                )

            if meets_recommended_draft:
                faces_meeting_recommended_draft_count += 1
            else:
                low_draft_area_sq_mm += area

        return self.finish_candidate_evaluation(
            candidate_direction,
            face_count=len(face_data),
            analyzed_face_count=analyzed_face_count,
            ignored_face_count=ignored_face_count,
            total_analyzed_area_sq_mm=total_analyzed_area_sq_mm,
            positive_side_area_sq_mm=positive_side_area_sq_mm,
            negative_side_area_sq_mm=negative_side_area_sq_mm,
            neutral_area_sq_mm=neutral_area_sq_mm,
            low_draft_area_sq_mm=low_draft_area_sq_mm,
            weighted_draft_sum=weighted_draft_sum,
            minimum_observed_draft_angle_degrees=minimum_observed_draft_angle_degrees,
            faces_meeting_recommended_draft_count=faces_meeting_recommended_draft_count,
            weighted_quality_sum=weighted_quality_sum,
            kept_face_evaluations=tuple(face_evaluations) if retain else None,
        )
    def finish_candidate_evaluation(
        self,
        candidate_direction: PullDirectionCandidate,
        *,
        face_count: int,
        analyzed_face_count: int,
        ignored_face_count: int,
        total_analyzed_area_sq_mm: float,
        positive_side_area_sq_mm: float,
        negative_side_area_sq_mm: float,
        neutral_area_sq_mm: float,
        low_draft_area_sq_mm: float,
        weighted_draft_sum: float,
        minimum_observed_draft_angle_degrees: float | None,
        faces_meeting_recommended_draft_count: int,
        weighted_quality_sum: float,
        kept_face_evaluations: tuple[FacePullDirectionEvaluation, ...] | None,
    ) -> CandidatePullDirectionEvaluation:
        """Build one candidate's result from the sums the per-face loop accumulated.

        The loop in ``_evaluate`` and any other implementation of it (the worker's native kernel) hand over the same
        accumulators, so the metrics, warnings, evaluability and score are assembled by one piece of code. With
        ``kept_face_evaluations=None`` the per-face evaluations are not kept and the default scoring policy's score is
        computed from ``weighted_quality_sum``.
        """
        warnings: list[PullDirectionEvaluationWarning] = []
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
        stored_face_evaluations: Sequence[FacePullDirectionEvaluation]
        if kept_face_evaluations is not None:
            stored_face_evaluations = kept_face_evaluations
            engineering_score = self.scoring_policy.score(
                face_evaluations=stored_face_evaluations,
                aggregate_metrics=aggregate_metrics,
                settings=self.settings,
            )
        else:
            stored_face_evaluations = UnretainedFaceEvaluations(face_count)
            # AreaWeightedDraftScoringPolicy.score from the sum accumulated above.
            if total_analyzed_area_sq_mm <= 0.0:
                engineering_score = 0.0
            else:
                engineering_score = max(
                    0.0,
                    min(100.0, 100.0 * (weighted_quality_sum / total_analyzed_area_sq_mm)),
                )

        return CandidatePullDirectionEvaluation(
            candidate=candidate_direction,
            aggregate_metrics=aggregate_metrics,
            engineering_score=engineering_score,
            is_evaluable=is_evaluable,
            face_evaluations=stored_face_evaluations,  # type: ignore[arg-type]
            warnings=tuple(warnings),
        )


DEFAULT_PULL_DIRECTION_EVALUATOR: CandidatePullDirectionEvaluator = (
    PullDirectionEvaluator()
)


_FaceInvariants = tuple[
    int, float, float, float, float, FacePullDirectionEvaluation | None
]


def _face_invariants(face_analysis: FaceGeometryAnalysis) -> list[_FaceInvariants]:
    """What does not depend on the candidate: (face index, area, unit normal x, y, z, fixed result or None).

    A face that cannot be analyzed gets the one immutable "not analyzable" result every candidate would build for it; an
    analyzable face carries its normalized normal, computed here the way ``_evaluate_face`` computes it.
    """
    invariants: list[_FaceInvariants] = []
    for face in face_analysis.faces:
        not_analyzable = FacePullDirectionEvaluation(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            signed_alignment=None,
            draft_angle_degrees=None,
            side_classification=None,
            meets_recommended_draft=False,
            is_analyzable=False,
        )
        if not _is_positive_finite_area(face.area) or face.unit_normal is None:
            invariants.append((face.face_index, face.area, 0.0, 0.0, 0.0, not_analyzable))
            continue
        try:
            unit_face_normal = face.unit_normal.normalized(minimum_magnitude=0.0)
        except InvalidVectorError:
            invariants.append((face.face_index, face.area, 0.0, 0.0, 0.0, not_analyzable))
            continue
        invariants.append(
            (
                face.face_index,
                face.area,
                unit_face_normal.x,
                unit_face_normal.y,
                unit_face_normal.z,
                None,
            )
        )
    return invariants


def _evaluate_face(
    *,
    face: FaceGeometry,
    unit_pull_direction: Vector3D,
    settings: PullDirectionEvaluationSettings,
) -> FacePullDirectionEvaluation:
    """One face against one direction, face by face: the reference the candidate loop above is tested against."""
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
