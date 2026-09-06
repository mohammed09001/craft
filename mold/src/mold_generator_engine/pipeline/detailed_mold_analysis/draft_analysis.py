from __future__ import annotations

from dataclasses import dataclass
from math import asin, degrees, isfinite

from mold_generator_engine.config.draft import DraftAnalysisSettings
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisStatus,
    DraftAdequacy,
    DraftAnalysisResult,
    DraftAnalysisSummary,
    DraftAnalysisWarning,
    DraftAnalysisWarningCode,
    DraftReleaseSide,
    DraftSurfaceType,
    FaceDraftAnalysis,
    FaceGeometry,
    FaceGeometryAnalysis,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionStatus,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    DraftAngleAnalyzer,
)


@dataclass(frozen=True, slots=True)
class DefaultDraftAngleAnalyzer:
    """Analyze per-face draft against the selected pull direction."""

    settings: DraftAnalysisSettings = DraftAnalysisSettings()

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis: FaceGeometryAnalysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
    ) -> DraftAnalysisResult:
        """Return deterministic draft-angle analysis for the current selection."""
        del context
        warnings: list[DraftAnalysisWarning] = []
        selected_candidate = (
            None
            if preliminary_selection is None
            else preliminary_selection.selected_candidate
        )

        if (
            preliminary_selection is not None
            and preliminary_selection.status
            is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
        ):
            warnings.append(
                DraftAnalysisWarning(
                    code=DraftAnalysisWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION,
                    message=(
                        "Stage-4 pull-direction selection is ambiguous, so the current "
                        "draft analysis uses its deterministic representative only as "
                        "preliminary evidence."
                    ),
                )
            )

        if selected_candidate is None:
            warnings.append(
                DraftAnalysisWarning(
                    code=DraftAnalysisWarningCode.NO_SELECTED_PULL_DIRECTION,
                    message=(
                        "Draft analysis requires the selected pull direction "
                        "produced by stage 4."
                    ),
                )
            )
            return _build_unevaluable_result(
                selected_pull_direction=None,
                face_results=(),
                warnings=warnings,
            )

        try:
            unit_pull_direction = selected_candidate.direction.normalized(
                minimum_magnitude=0.0
            )
        except InvalidVectorError:
            warnings.append(
                DraftAnalysisWarning(
                    code=DraftAnalysisWarningCode.INVALID_SELECTED_PULL_DIRECTION,
                    message=(
                        "The selected pull direction must be finite and non-zero "
                        "before draft analysis can run."
                    ),
                )
            )
            return _build_unevaluable_result(
                selected_pull_direction=selected_candidate,
                face_results=(),
                warnings=warnings,
            )

        face_results = tuple(
            sorted(
                (
                    _analyze_face(
                        face=face,
                        unit_pull_direction=unit_pull_direction,
                        settings=self.settings,
                    )
                    for face in face_analysis.faces
                ),
                key=lambda result: result.face_index,
            )
        )
        summary = _build_summary(face_results)

        if summary.evaluated_face_count == 0:
            warnings.append(
                DraftAnalysisWarning(
                    code=DraftAnalysisWarningCode.NO_ANALYZABLE_FACES,
                    message=(
                        "Draft analysis could not find any valid positive-area faces "
                        "with usable normals."
                    ),
                )
            )
            return DraftAnalysisResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                selected_pull_direction=selected_candidate,
                is_evaluable=False,
                face_results=face_results,
                summary=summary,
                warnings=tuple(warnings),
            )

        if summary.unevaluable_face_count > 0:
            warnings.append(
                DraftAnalysisWarning(
                    code=DraftAnalysisWarningCode.UNEVALUABLE_FACES_PRESENT,
                    message=(
                        "One or more faces could not be classified safely and were "
                        "retained as unevaluable."
                    ),
                    metadata={"unevaluable_face_count": summary.unevaluable_face_count},
                )
            )

        return DraftAnalysisResult(
            status=_resolve_status(
                preliminary_selection=preliminary_selection,
                summary=summary,
            ),
            selected_pull_direction=selected_candidate,
            is_evaluable=True,
            face_results=face_results,
            summary=summary,
            warnings=tuple(warnings),
        )


DEFAULT_DRAFT_ANGLE_ANALYZER: DraftAngleAnalyzer = DefaultDraftAngleAnalyzer()


def _analyze_face(
    *,
    face: FaceGeometry,
    unit_pull_direction: Vector3D,
    settings: DraftAnalysisSettings,
) -> FaceDraftAnalysis:
    if not _is_positive_finite_area(face.area):
        return _unevaluable_face(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            warning="Face area is not finite and positive.",
        )

    if face.unit_normal is None:
        return _unevaluable_face(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            warning="Face normal is missing.",
        )

    if not face.unit_normal.is_finite():
        return _unevaluable_face(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            warning="Face normal is not finite.",
        )

    try:
        unit_face_normal = face.unit_normal.normalized(minimum_magnitude=0.0)
    except InvalidVectorError:
        return _unevaluable_face(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            warning="Face normal is zero-length or numerically unstable.",
        )

    alignment = _clamp_alignment(unit_face_normal.dot(unit_pull_direction))
    if not isfinite(alignment):
        return _unevaluable_face(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            warning="Face alignment against the selected pull direction is non-finite.",
        )

    signed_draft_angle_degrees = degrees(asin(alignment))
    draft_angle_magnitude_degrees = abs(signed_draft_angle_degrees)
    release_side = _classify_release_side(
        signed_draft_angle_degrees=signed_draft_angle_degrees,
        numerical_tolerance=settings.numerical_tolerance,
    )

    if _is_at_or_above(
        draft_angle_magnitude_degrees,
        settings.pull_facing_threshold_degrees,
        settings.numerical_tolerance,
    ):
        return FaceDraftAnalysis(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            alignment=alignment,
            signed_draft_angle_degrees=signed_draft_angle_degrees,
            draft_angle_magnitude_degrees=draft_angle_magnitude_degrees,
            release_side=release_side,
            surface_type=DraftSurfaceType.PULL_FACING,
            adequacy=DraftAdequacy.NOT_APPLICABLE,
        )

    if _is_at_or_below(
        draft_angle_magnitude_degrees,
        settings.zero_draft_tolerance_degrees,
        settings.numerical_tolerance,
    ):
        return FaceDraftAnalysis(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            alignment=alignment,
            signed_draft_angle_degrees=signed_draft_angle_degrees,
            draft_angle_magnitude_degrees=draft_angle_magnitude_degrees,
            release_side=DraftReleaseSide.NEUTRAL,
            surface_type=DraftSurfaceType.NEAR_ZERO_DRAFT,
            adequacy=DraftAdequacy.ZERO_OR_NEAR_ZERO,
        )

    adequacy = DraftAdequacy.INSUFFICIENT
    if _is_at_or_above(
        draft_angle_magnitude_degrees,
        settings.minimum_required_draft_degrees,
        settings.numerical_tolerance,
    ):
        adequacy = DraftAdequacy.SUFFICIENT

    return FaceDraftAnalysis(
        face_index=face.face_index,
        face_area_sq_mm=face.area,
        alignment=alignment,
        signed_draft_angle_degrees=signed_draft_angle_degrees,
        draft_angle_magnitude_degrees=draft_angle_magnitude_degrees,
        release_side=release_side,
        surface_type=DraftSurfaceType.DRAFTED,
        adequacy=adequacy,
    )


def _unevaluable_face(
    *,
    face_index: int,
    face_area_sq_mm: float,
    warning: str,
) -> FaceDraftAnalysis:
    return FaceDraftAnalysis(
        face_index=face_index,
        face_area_sq_mm=face_area_sq_mm,
        alignment=None,
        signed_draft_angle_degrees=None,
        draft_angle_magnitude_degrees=None,
        release_side=DraftReleaseSide.UNEVALUABLE,
        surface_type=DraftSurfaceType.UNEVALUABLE,
        adequacy=DraftAdequacy.UNEVALUABLE,
        warnings=(warning,),
    )


def _build_summary(
    face_results: tuple[FaceDraftAnalysis, ...],
) -> DraftAnalysisSummary:
    face_count_by_surface_type = {surface_type: 0 for surface_type in DraftSurfaceType}
    face_count_by_adequacy = {adequacy: 0 for adequacy in DraftAdequacy}
    surface_area_by_surface_type = {
        surface_type: 0.0 for surface_type in DraftSurfaceType
    }
    surface_area_by_adequacy = {adequacy: 0.0 for adequacy in DraftAdequacy}

    evaluated_face_count = 0
    total_surface_area_sq_mm = 0.0
    evaluated_surface_area_sq_mm = 0.0
    draft_relevant_area_sq_mm = 0.0
    pull_facing_area_sq_mm = 0.0
    near_zero_draft_area_sq_mm = 0.0
    sufficient_draft_area_sq_mm = 0.0
    insufficient_draft_area_sq_mm = 0.0
    ambiguous_area_sq_mm = 0.0
    drafted_weighted_sum = 0.0
    drafted_area_sq_mm = 0.0
    minimum_drafted_magnitude_degrees: float | None = None
    maximum_drafted_magnitude_degrees: float | None = None

    for face_result in face_results:
        face_count_by_surface_type[face_result.surface_type] += 1
        face_count_by_adequacy[face_result.adequacy] += 1

        area = face_result.face_area_sq_mm
        if _is_non_negative_finite(area):
            total_surface_area_sq_mm += area
            surface_area_by_surface_type[face_result.surface_type] += area
            surface_area_by_adequacy[face_result.adequacy] += area

        if face_result.surface_type is DraftSurfaceType.UNEVALUABLE:
            continue

        evaluated_face_count += 1
        if _is_non_negative_finite(area):
            evaluated_surface_area_sq_mm += area

        if face_result.surface_type is DraftSurfaceType.PULL_FACING:
            pull_facing_area_sq_mm += area
            continue

        draft_relevant_area_sq_mm += area
        if face_result.surface_type is DraftSurfaceType.NEAR_ZERO_DRAFT:
            near_zero_draft_area_sq_mm += area
            continue

        if face_result.surface_type is DraftSurfaceType.AMBIGUOUS:
            ambiguous_area_sq_mm += area
            continue

        if face_result.adequacy is DraftAdequacy.SUFFICIENT:
            sufficient_draft_area_sq_mm += area
        elif face_result.adequacy is DraftAdequacy.INSUFFICIENT:
            insufficient_draft_area_sq_mm += area
        elif face_result.adequacy is DraftAdequacy.AMBIGUOUS:
            ambiguous_area_sq_mm += area

        if face_result.draft_angle_magnitude_degrees is None:
            continue

        magnitude = face_result.draft_angle_magnitude_degrees
        drafted_weighted_sum += area * magnitude
        drafted_area_sq_mm += area
        if minimum_drafted_magnitude_degrees is None:
            minimum_drafted_magnitude_degrees = magnitude
            maximum_drafted_magnitude_degrees = magnitude
        else:
            minimum_drafted_magnitude_degrees = min(
                minimum_drafted_magnitude_degrees,
                magnitude,
            )
            maximum_drafted_magnitude_degrees = max(
                maximum_drafted_magnitude_degrees,
                magnitude,
            )

    unevaluable_face_count = face_count_by_surface_type[DraftSurfaceType.UNEVALUABLE]

    return DraftAnalysisSummary(
        total_face_count=len(face_results),
        evaluated_face_count=evaluated_face_count,
        unevaluable_face_count=unevaluable_face_count,
        total_surface_area_sq_mm=total_surface_area_sq_mm,
        evaluated_surface_area_sq_mm=evaluated_surface_area_sq_mm,
        draft_relevant_area_sq_mm=draft_relevant_area_sq_mm,
        pull_facing_area_sq_mm=pull_facing_area_sq_mm,
        near_zero_draft_area_sq_mm=near_zero_draft_area_sq_mm,
        sufficient_draft_area_sq_mm=sufficient_draft_area_sq_mm,
        insufficient_draft_area_sq_mm=insufficient_draft_area_sq_mm,
        ambiguous_area_sq_mm=ambiguous_area_sq_mm,
        face_count_by_surface_type=face_count_by_surface_type,
        face_count_by_adequacy=face_count_by_adequacy,
        surface_area_by_surface_type=surface_area_by_surface_type,
        surface_area_by_adequacy=surface_area_by_adequacy,
        surface_area_ratio_by_surface_type={
            surface_type: _safe_ratio(area, total_surface_area_sq_mm)
            for surface_type, area in surface_area_by_surface_type.items()
        },
        surface_area_ratio_by_adequacy={
            adequacy: _safe_ratio(area, total_surface_area_sq_mm)
            for adequacy, area in surface_area_by_adequacy.items()
        },
        evaluated_surface_area_ratio=_safe_ratio(
            evaluated_surface_area_sq_mm,
            total_surface_area_sq_mm,
        ),
        draft_relevant_area_ratio=_safe_ratio(
            draft_relevant_area_sq_mm,
            total_surface_area_sq_mm,
        ),
        pull_facing_area_ratio=_safe_ratio(
            pull_facing_area_sq_mm,
            evaluated_surface_area_sq_mm,
        ),
        near_zero_draft_area_ratio=_safe_ratio(
            near_zero_draft_area_sq_mm,
            draft_relevant_area_sq_mm,
        ),
        sufficient_draft_area_ratio=_safe_ratio(
            sufficient_draft_area_sq_mm,
            draft_relevant_area_sq_mm,
        ),
        insufficient_draft_area_ratio=_safe_ratio(
            insufficient_draft_area_sq_mm,
            draft_relevant_area_sq_mm,
        ),
        ambiguous_area_ratio=_safe_ratio(
            ambiguous_area_sq_mm,
            draft_relevant_area_sq_mm,
        ),
        minimum_drafted_magnitude_degrees=minimum_drafted_magnitude_degrees,
        maximum_drafted_magnitude_degrees=maximum_drafted_magnitude_degrees,
        area_weighted_mean_drafted_magnitude_degrees=_safe_ratio(
            drafted_weighted_sum,
            drafted_area_sq_mm,
        ),
    )


def _resolve_status(
    *,
    preliminary_selection: PreliminaryPullDirectionSelection | None,
    summary: DraftAnalysisSummary,
) -> DetailedMoldAnalysisStatus:
    if preliminary_selection is not None and (
        preliminary_selection.status
        is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    ):
        return DetailedMoldAnalysisStatus.PARTIAL

    if summary.unevaluable_face_count > 0:
        return DetailedMoldAnalysisStatus.PARTIAL

    if summary.face_count_by_surface_type[DraftSurfaceType.AMBIGUOUS] > 0:
        return DetailedMoldAnalysisStatus.PARTIAL

    return DetailedMoldAnalysisStatus.COMPLETED


def _build_unevaluable_result(
    *,
    selected_pull_direction,
    face_results: tuple[FaceDraftAnalysis, ...],
    warnings: list[DraftAnalysisWarning],
) -> DraftAnalysisResult:
    return DraftAnalysisResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        selected_pull_direction=selected_pull_direction,
        is_evaluable=False,
        face_results=face_results,
        summary=_build_summary(face_results),
        warnings=tuple(warnings),
    )


def _classify_release_side(
    *,
    signed_draft_angle_degrees: float,
    numerical_tolerance: float,
) -> DraftReleaseSide:
    if signed_draft_angle_degrees > numerical_tolerance:
        return DraftReleaseSide.POSITIVE
    if signed_draft_angle_degrees < -numerical_tolerance:
        return DraftReleaseSide.NEGATIVE
    return DraftReleaseSide.NEUTRAL


def _clamp_alignment(value: float) -> float:
    if value <= -1.0:
        return -1.0
    if value >= 1.0:
        return 1.0
    return value


def _is_positive_finite_area(area_sq_mm: float) -> bool:
    return isfinite(area_sq_mm) and area_sq_mm > 0.0


def _is_non_negative_finite(value: float) -> bool:
    return isfinite(value) and value >= 0.0


def _is_at_or_above(value: float, threshold: float, tolerance: float) -> bool:
    return value >= (threshold - tolerance)


def _is_at_or_below(value: float, threshold: float, tolerance: float) -> bool:
    return value <= (threshold + tolerance)


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0.0:
        return 0.0
    return numerator / denominator
