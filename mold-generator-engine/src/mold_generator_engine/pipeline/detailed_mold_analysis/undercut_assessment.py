from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from mold_generator_engine.config.undercut import UndercutRiskAssessmentSettings
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisStatus,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionCandidate,
    UndercutConnectedRegion,
    UndercutRegionAnalysis,
    UndercutRegionAnalysisWarningCode,
    UndercutRegionComplexity,
    UndercutRegionRiskAssessment,
    UndercutRiskAssessmentResult,
    UndercutRiskAssessmentWarning,
    UndercutRiskAssessmentWarningCode,
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    UndercutRiskAssessor,
)


@dataclass(frozen=True, slots=True)
class DefaultUndercutRiskAssessor:
    """Assess connected undercut regions for risk, complexity, and treatment."""

    settings: UndercutRiskAssessmentSettings = UndercutRiskAssessmentSettings()

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_region_analysis: UndercutRegionAnalysis | None,
    ) -> UndercutRiskAssessmentResult:
        """Assess stage-7 undercut regions without deciding a final mold solution."""
        del context

        warnings: list[UndercutRiskAssessmentWarning] = []
        selected_candidate = _resolve_selected_candidate(
            preliminary_selection=preliminary_selection,
            undercut_region_analysis=undercut_region_analysis,
        )

        if (
            preliminary_selection is not None
            and preliminary_selection.status
            is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
        ):
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION
                    ),
                    message=(
                        "Stage-8/9 undercut assessment uses the deterministic "
                        "representative from an ambiguous preliminary pull-direction "
                        "selection only as provisional evidence."
                    ),
                )
            )

        if undercut_region_analysis is None:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.NO_UNDERCUT_REGION_ANALYSIS
                    ),
                    message=(
                        "Stage-8/9 undercut assessment requires the connected "
                        "undercut-region analysis produced by stage 7."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        if not undercut_region_analysis.is_evaluable:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.UNEVALUABLE_UNDERCUT_REGION_ANALYSIS
                    ),
                    message=(
                        "Stage-8/9 undercut assessment cannot continue because "
                        "the connected undercut-region analysis is unevaluable."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        if selected_candidate is None:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=UndercutRiskAssessmentWarningCode.NO_SELECTED_PULL_DIRECTION,
                    message=(
                        "Stage-8/9 undercut assessment requires the selected pull "
                        "direction carried by stages 4 and 7."
                    ),
                )
            )
            return _build_unevaluable_result(None, warnings)

        try:
            selected_candidate.direction.normalized(minimum_magnitude=0.0)
        except InvalidVectorError:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.INVALID_SELECTED_PULL_DIRECTION
                    ),
                    message=(
                        "The selected pull direction must remain finite and non-zero "
                        "before stage-8/9 undercut assessment can run."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        if any(
            warning.code is UndercutRegionAnalysisWarningCode.DRAFT_ANALYSIS_UNAVAILABLE
            for warning in undercut_region_analysis.warnings
        ):
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.DRAFT_ANALYSIS_UNAVAILABLE
                    ),
                    message=(
                        "Draft-angle enrichment was unavailable, so treatment "
                        "recommendations rely on geometry and accessibility evidence "
                        "only."
                    ),
                )
            )

        if not undercut_region_analysis.regions:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.NO_CONNECTED_UNDERCUT_REGIONS
                    ),
                    message=(
                        "Stage-7 reported no connected confirmed undercut regions, "
                        "so no special treatment is currently required."
                    ),
                )
            )
            return UndercutRiskAssessmentResult(
                status=_resolve_status(
                    preliminary_selection=preliminary_selection,
                    undercut_region_analysis=undercut_region_analysis,
                ),
                selected_pull_direction=selected_candidate,
                is_evaluable=True,
                assessed_region_count=0,
                overall_treatment_requirement=(
                    UndercutTreatmentRequirement.NO_SPECIAL_ACTION
                ),
                warnings=tuple(warnings),
            )

        region_assessments = tuple(
            _assess_region(region, self.settings)
            for region in undercut_region_analysis.regions
        )
        region_lookup = {
            region.region_id: region for region in undercut_region_analysis.regions
        }
        ambiguous_region_count = sum(
            assessment.adjacent_ambiguous_face_count > 0
            or bool(region_lookup[assessment.region_id].ambiguous_bridge_region_ids)
            for assessment in region_assessments
        )
        topology_region_count = sum(
            assessment.touches_open_boundary or assessment.touches_non_manifold_edge
            for assessment in region_assessments
        )

        if ambiguous_region_count > 0:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.AMBIGUOUS_BOUNDARY_EVIDENCE_PRESENT
                    ),
                    message=(
                        "One or more assessed undercut regions remain adjacent to "
                        "ambiguous evidence, so treatment recommendations stay "
                        "conservative."
                    ),
                    metadata={"affected_region_count": ambiguous_region_count},
                )
            )

        if topology_region_count > 0:
            warnings.append(
                UndercutRiskAssessmentWarning(
                    code=(
                        UndercutRiskAssessmentWarningCode.TOPOLOGY_RISK_EVIDENCE_PRESENT
                    ),
                    message=(
                        "One or more assessed undercut regions touch open or "
                        "non-manifold topology and should be reviewed carefully "
                        "before downstream mold planning."
                    ),
                    metadata={"affected_region_count": topology_region_count},
                )
            )

        severity_counts = Counter(
            assessment.severity for assessment in region_assessments
        )
        treatment_counts = Counter(
            assessment.treatment_requirement for assessment in region_assessments
        )
        return UndercutRiskAssessmentResult(
            status=_resolve_status(
                preliminary_selection=preliminary_selection,
                undercut_region_analysis=undercut_region_analysis,
            ),
            selected_pull_direction=selected_candidate,
            is_evaluable=True,
            region_assessments=region_assessments,
            assessed_region_count=len(region_assessments),
            highest_severity=max(
                (assessment.severity for assessment in region_assessments),
                key=lambda severity: _RISK_SEVERITY_ORDER[severity],
            ),
            highest_complexity=max(
                (assessment.complexity for assessment in region_assessments),
                key=lambda complexity: _REGION_COMPLEXITY_ORDER[complexity],
            ),
            overall_treatment_requirement=max(
                (assessment.treatment_requirement for assessment in region_assessments),
                key=lambda requirement: _TREATMENT_REQUIREMENT_ORDER[requirement],
            ),
            severity_counts=dict(severity_counts),
            treatment_counts=dict(treatment_counts),
            manual_review_region_count=sum(
                assessment.requires_manual_review for assessment in region_assessments
            ),
            blocking_region_count=sum(
                assessment.treatment_requirement
                is UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK
                for assessment in region_assessments
            ),
            warnings=tuple(warnings),
        )


DEFAULT_UNDERCUT_RISK_ASSESSOR: UndercutRiskAssessor = DefaultUndercutRiskAssessor()


def _resolve_selected_candidate(
    *,
    preliminary_selection: PreliminaryPullDirectionSelection | None,
    undercut_region_analysis: UndercutRegionAnalysis | None,
) -> PullDirectionCandidate | None:
    if (
        undercut_region_analysis is not None
        and undercut_region_analysis.selected_pull_direction is not None
    ):
        return undercut_region_analysis.selected_pull_direction

    if preliminary_selection is None:
        return None

    return preliminary_selection.selected_candidate


def _assess_region(
    region: UndercutConnectedRegion,
    settings: UndercutRiskAssessmentSettings,
) -> UndercutRegionRiskAssessment:
    minimum_signed_draft = (
        None
        if region.draft_summary is None
        else region.draft_summary.minimum_signed_draft_angle_degrees
    )
    reverse_draft_magnitude = 0.0
    if minimum_signed_draft is not None and minimum_signed_draft < 0.0:
        reverse_draft_magnitude = abs(minimum_signed_draft)

    face_score = _threshold_score(
        float(region.face_count),
        float(settings.medium_face_count),
        float(settings.high_face_count),
        float(settings.critical_face_count),
    )
    area_score = _threshold_score(
        region.total_area_sq_mm,
        settings.medium_region_area_sq_mm,
        settings.high_region_area_sq_mm,
        settings.critical_region_area_sq_mm,
    )
    ratio_score = 0
    if (
        region.total_area_sq_mm >= settings.minimum_area_for_ratio_escalation_sq_mm
        or region.maximum_lateral_extent_mm >= settings.medium_lateral_extent_mm
    ):
        ratio_score = _threshold_score(
            region.area_ratio,
            settings.medium_region_area_ratio,
            settings.high_region_area_ratio,
            settings.critical_region_area_ratio,
        )
    axial_score = _threshold_score(
        region.axial_extent_mm,
        settings.medium_axial_extent_mm,
        settings.high_axial_extent_mm,
        settings.critical_axial_extent_mm,
    )
    lateral_score = _threshold_score(
        region.maximum_lateral_extent_mm,
        settings.medium_lateral_extent_mm,
        settings.high_lateral_extent_mm,
        settings.critical_lateral_extent_mm,
    )
    draft_score = _threshold_score(
        reverse_draft_magnitude,
        settings.medium_negative_draft_degrees,
        settings.high_negative_draft_degrees,
        settings.critical_negative_draft_degrees,
    )
    topology_score = int(region.touches_open_boundary) + int(
        region.touches_non_manifold_edge
    )
    ambiguity_score = int(bool(region.adjacent_ambiguous_face_indices)) + int(
        bool(region.ambiguous_bridge_region_ids)
    )
    low_confidence_score = int(
        region.confidence < settings.manual_review_confidence_threshold
    )
    risk_score = (
        face_score
        + area_score
        + ratio_score
        + axial_score
        + lateral_score
        + draft_score
        + topology_score
        + ambiguity_score
        + low_confidence_score
    )

    boundary_score = _threshold_score(
        float(region.boundary_edge_count),
        float(settings.medium_boundary_edge_count),
        float(settings.high_boundary_edge_count),
        float(settings.critical_boundary_edge_count),
    )
    adjacency_complexity_score = (
        int(bool(region.adjacent_potential_face_indices))
        + int(bool(region.adjacent_ambiguous_face_indices))
        + int(bool(region.ambiguous_bridge_region_ids))
    )
    span_complexity_score = int(axial_score > 0 and lateral_score > 0) + int(
        axial_score >= 2 or lateral_score >= 2
    )
    draft_complexity_score = 0
    if (
        region.draft_summary is not None
        and len(region.draft_summary.boundary_surface_types) >= 3
    ):
        draft_complexity_score = 1
    topology_complexity_score = int(region.touches_open_boundary) + (
        2 if region.touches_non_manifold_edge else 0
    )
    complexity_score = (
        face_score
        + boundary_score
        + adjacency_complexity_score
        + span_complexity_score
        + draft_complexity_score
        + topology_complexity_score
    )

    severity = _classify_risk_severity(risk_score, settings)
    complexity = _classify_region_complexity(complexity_score, settings)
    requires_manual_review = _requires_manual_review(region, settings)
    treatment_requirement = _classify_treatment_requirement(
        severity=severity,
        complexity=complexity,
        requires_manual_review=requires_manual_review,
    )

    reasons: list[str] = []
    warnings: list[str] = []

    if area_score > 0:
        reasons.append(
            "Region area is large enough to materially affect mold release "
            f"({region.total_area_sq_mm:.3f} sq mm)."
        )
    if ratio_score > 0:
        reasons.append(
            "Region occupies a meaningful share of the analyzed surface "
            f"({region.area_ratio:.3%})."
        )
    if face_score > 0:
        reasons.append(
            "Region spans multiple confirmed undercut faces "
            f"({region.face_count} face(s))."
        )
    if axial_score > 0:
        reasons.append(
            "Region extends measurably along the selected pull axis "
            f"({region.axial_extent_mm:.3f} mm)."
        )
    if lateral_score > 0:
        reasons.append(
            "Region has a broad lateral span that can affect parting or side access "
            f"({region.maximum_lateral_extent_mm:.3f} mm)."
        )
    if draft_score > 0 and minimum_signed_draft is not None:
        reasons.append(
            "Reverse draft is present inside the region "
            f"({minimum_signed_draft:.3f} degrees minimum signed draft)."
        )
    if region.adjacent_ambiguous_face_indices:
        reasons.append(
            "Adjacent ambiguous faces reduce confidence in a fully automatic "
            "treatment recommendation."
        )
    if region.ambiguous_bridge_region_ids:
        reasons.append(
            "The region is separated from another confirmed region only by "
            "ambiguous faces."
        )
    if region.touches_open_boundary:
        reasons.append("The region touches an open mesh boundary.")
    if region.touches_non_manifold_edge:
        reasons.append("The region touches non-manifold mesh connectivity.")

    if requires_manual_review:
        warnings.append(
            "Manual review is required because topology, ambiguity, or confidence "
            "limits reduce the reliability of a fully automatic recommendation."
        )
    if region.draft_summary is None:
        warnings.append(
            "Draft-angle enrichment is unavailable for this region, so reverse-draft "
            "severity may be understated."
        )

    return UndercutRegionRiskAssessment(
        region_id=region.region_id,
        severity=severity,
        complexity=complexity,
        treatment_requirement=treatment_requirement,
        risk_score=risk_score,
        complexity_score=complexity_score,
        face_count=region.face_count,
        total_area_sq_mm=region.total_area_sq_mm,
        area_ratio=region.area_ratio,
        axial_extent_mm=region.axial_extent_mm,
        maximum_lateral_extent_mm=region.maximum_lateral_extent_mm,
        boundary_edge_count=region.boundary_edge_count,
        blocked_sample_ratio=region.blocked_sample_ratio,
        confidence=region.confidence,
        minimum_signed_draft_angle_degrees=minimum_signed_draft,
        adjacent_ambiguous_face_count=len(region.adjacent_ambiguous_face_indices),
        adjacent_potential_face_count=len(region.adjacent_potential_face_indices),
        touches_open_boundary=region.touches_open_boundary,
        touches_non_manifold_edge=region.touches_non_manifold_edge,
        requires_manual_review=requires_manual_review,
        reasons=tuple(reasons),
        warnings=tuple(warnings),
    )


def _threshold_score(
    value: float,
    medium_threshold: float,
    high_threshold: float,
    critical_threshold: float,
) -> int:
    if value >= critical_threshold:
        return 3
    if value >= high_threshold:
        return 2
    if value >= medium_threshold:
        return 1
    return 0


def _classify_risk_severity(
    risk_score: int,
    settings: UndercutRiskAssessmentSettings,
) -> UndercutRiskSeverity:
    if risk_score >= settings.critical_severity_score:
        return UndercutRiskSeverity.CRITICAL
    if risk_score >= settings.high_severity_score:
        return UndercutRiskSeverity.HIGH
    if risk_score >= settings.medium_severity_score:
        return UndercutRiskSeverity.MEDIUM
    return UndercutRiskSeverity.LOW


def _classify_region_complexity(
    complexity_score: int,
    settings: UndercutRiskAssessmentSettings,
) -> UndercutRegionComplexity:
    if complexity_score >= settings.highly_complex_score:
        return UndercutRegionComplexity.HIGHLY_COMPLEX
    if complexity_score >= settings.complex_complexity_score:
        return UndercutRegionComplexity.COMPLEX
    if complexity_score >= settings.moderate_complexity_score:
        return UndercutRegionComplexity.MODERATE
    return UndercutRegionComplexity.SIMPLE


def _requires_manual_review(
    region: UndercutConnectedRegion,
    settings: UndercutRiskAssessmentSettings,
) -> bool:
    return any(
        (
            region.confidence < settings.manual_review_confidence_threshold,
            region.touches_open_boundary,
            region.touches_non_manifold_edge,
            bool(region.adjacent_ambiguous_face_indices),
            bool(region.ambiguous_bridge_region_ids),
        )
    )


def _classify_treatment_requirement(
    *,
    severity: UndercutRiskSeverity,
    complexity: UndercutRegionComplexity,
    requires_manual_review: bool,
) -> UndercutTreatmentRequirement:
    if severity is UndercutRiskSeverity.CRITICAL and requires_manual_review:
        return UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK

    if (
        severity is UndercutRiskSeverity.CRITICAL
        or complexity is UndercutRegionComplexity.HIGHLY_COMPLEX
    ):
        return UndercutTreatmentRequirement.CORE_OR_INSERT_LIKELY_REQUIRED

    if requires_manual_review:
        return UndercutTreatmentRequirement.MANUAL_REVIEW_REQUIRED

    if severity is UndercutRiskSeverity.HIGH:
        return UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED

    if (
        severity is UndercutRiskSeverity.MEDIUM
        or complexity is UndercutRegionComplexity.COMPLEX
    ):
        return UndercutTreatmentRequirement.LOCAL_PARTING_REVIEW_REQUIRED

    return UndercutTreatmentRequirement.MINOR_DRAFT_ADJUSTMENT_CANDIDATE


def _resolve_status(
    *,
    preliminary_selection: PreliminaryPullDirectionSelection | None,
    undercut_region_analysis: UndercutRegionAnalysis,
) -> DetailedMoldAnalysisStatus:
    if undercut_region_analysis.status is DetailedMoldAnalysisStatus.PARTIAL:
        return DetailedMoldAnalysisStatus.PARTIAL

    if preliminary_selection is not None and (
        preliminary_selection.status
        is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    ):
        return DetailedMoldAnalysisStatus.PARTIAL

    return DetailedMoldAnalysisStatus.COMPLETED


def _build_unevaluable_result(
    selected_pull_direction: PullDirectionCandidate | None,
    warnings: list[UndercutRiskAssessmentWarning],
) -> UndercutRiskAssessmentResult:
    return UndercutRiskAssessmentResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        selected_pull_direction=selected_pull_direction,
        is_evaluable=False,
        warnings=tuple(warnings),
    )


_RISK_SEVERITY_ORDER = {
    UndercutRiskSeverity.LOW: 0,
    UndercutRiskSeverity.MEDIUM: 1,
    UndercutRiskSeverity.HIGH: 2,
    UndercutRiskSeverity.CRITICAL: 3,
}

_REGION_COMPLEXITY_ORDER = {
    UndercutRegionComplexity.SIMPLE: 0,
    UndercutRegionComplexity.MODERATE: 1,
    UndercutRegionComplexity.COMPLEX: 2,
    UndercutRegionComplexity.HIGHLY_COMPLEX: 3,
}

_TREATMENT_REQUIREMENT_ORDER = {
    UndercutTreatmentRequirement.NO_SPECIAL_ACTION: 0,
    UndercutTreatmentRequirement.MINOR_DRAFT_ADJUSTMENT_CANDIDATE: 1,
    UndercutTreatmentRequirement.LOCAL_PARTING_REVIEW_REQUIRED: 2,
    UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED: 3,
    UndercutTreatmentRequirement.CORE_OR_INSERT_LIKELY_REQUIRED: 4,
    UndercutTreatmentRequirement.MANUAL_REVIEW_REQUIRED: 5,
    UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK: 6,
}
