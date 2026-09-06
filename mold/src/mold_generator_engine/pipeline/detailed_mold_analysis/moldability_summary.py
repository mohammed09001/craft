from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisStatus,
    DraftAnalysisResult,
    MoldabilityEvidenceQuality,
    MoldabilityEvidenceSummary,
    MoldabilityFinding,
    MoldabilityFindingCode,
    MoldabilityFindingSource,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    UndercutAnalysisOutcome,
    UndercutAnalysisResult,
    UndercutRegionAnalysis,
    UndercutRegionAnalysisWarningCode,
    UndercutRiskAssessmentResult,
    UndercutRiskAssessmentWarningCode,
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    MoldabilityEvidenceSummarizer,
)


@dataclass(frozen=True, slots=True)
class DefaultMoldabilityEvidenceSummarizer:
    """Summarize structured Chapter-3 evidence without re-running analysis."""

    def summarize(
        self,
        context: DetailedMoldAnalysisContext,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_analysis: UndercutAnalysisResult | None,
        draft_analysis: DraftAnalysisResult | None,
        undercut_region_analysis: UndercutRegionAnalysis | None,
        undercut_risk_assessment: UndercutRiskAssessmentResult | None,
    ) -> MoldabilityEvidenceSummary:
        """Build a deterministic evidence summary from prior stage results."""
        del context

        findings: list[MoldabilityFinding] = []
        has_selected_pull_direction = bool(
            preliminary_selection is not None
            and preliminary_selection.selected_candidate is not None
        )
        selected_pull_direction_status = (
            None if preliminary_selection is None else preliminary_selection.status
        )
        selected_pull_direction_decisiveness = (
            None
            if preliminary_selection is None
            else preliminary_selection.decisiveness
        )
        selected_direction_evidence_quality = _selected_direction_quality(
            preliminary_selection
        )

        if not has_selected_pull_direction:
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.SELECTED_PULL_DIRECTION_UNAVAILABLE,
                    source=MoldabilityFindingSource.PULL_DIRECTION_SELECTION,
                    severity=IssueSeverity.ERROR,
                    message=(
                        "No selected pull direction is available for moldability "
                        "synthesis."
                    ),
                    is_blocking=True,
                )
            )
        elif (
            preliminary_selection is not None
            and preliminary_selection.status
            is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
        ):
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.SELECTED_PULL_DIRECTION_AMBIGUOUS,
                    source=MoldabilityFindingSource.PULL_DIRECTION_SELECTION,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "The preliminary pull-direction selection remains ambiguous."
                    ),
                )
            )

        if selected_pull_direction_decisiveness is (
            PreliminaryPullDirectionSelectionDecisiveness.CLOSE
        ):
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.SELECTED_PULL_DIRECTION_LOW_CONFIDENCE,
                    source=MoldabilityFindingSource.PULL_DIRECTION_SELECTION,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "The selected pull direction is only weakly separated from "
                        "other candidates."
                    ),
                )
            )

        if undercut_analysis is None or not undercut_analysis.is_evaluable:
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.UNDERCUT_ANALYSIS_UNAVAILABLE,
                    source=MoldabilityFindingSource.UNDERCUT_ANALYSIS,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Preliminary undercut analysis is unavailable or unevaluable."
                    ),
                )
            )

        draft_analysis_available = bool(
            draft_analysis is not None and draft_analysis.is_evaluable
        )
        draft_analysis_status = (
            None if draft_analysis is None else draft_analysis.status
        )
        if not draft_analysis_available:
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.DRAFT_ANALYSIS_UNAVAILABLE,
                    source=MoldabilityFindingSource.DRAFT_ANALYSIS,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Draft analysis is unavailable, so the current moldability "
                        "evidence remains incomplete."
                    ),
                )
            )

        undercut_region_analysis_available = bool(
            undercut_region_analysis is not None
            and undercut_region_analysis.is_evaluable
        )
        if not undercut_region_analysis_available:
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.UNDERCUT_REGION_ANALYSIS_UNAVAILABLE,
                    source=MoldabilityFindingSource.UNDERCUT_REGION_ANALYSIS,
                    severity=IssueSeverity.ERROR,
                    message=(
                        "Connected undercut-region analysis is unavailable for "
                        "moldability synthesis."
                    ),
                    is_blocking=True,
                )
            )

        undercut_risk_assessment_available = bool(
            undercut_risk_assessment is not None
            and undercut_risk_assessment.is_evaluable
        )
        if not undercut_risk_assessment_available:
            findings.append(
                _finding(
                    code=MoldabilityFindingCode.UNDERCUT_RISK_ASSESSMENT_UNAVAILABLE,
                    source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                    severity=IssueSeverity.ERROR,
                    message=(
                        "Undercut risk assessment is unavailable for preliminary "
                        "moldability synthesis."
                    ),
                    is_blocking=True,
                )
            )

        confirmed_undercut_region_count = 0
        topology_limitations_detected = False
        if undercut_region_analysis is not None:
            confirmed_undercut_region_count = undercut_region_analysis.region_count
            topology_limitations_detected = any(
                (
                    undercut_region_analysis.regions_touching_non_manifold_count > 0,
                    undercut_region_analysis.regions_touching_open_boundaries_count > 0,
                )
            )
            if topology_limitations_detected:
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.TOPOLOGY_LIMITATIONS_PRESENT,
                        source=MoldabilityFindingSource.UNDERCUT_REGION_ANALYSIS,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "One or more connected undercut regions touch open or "
                            "non-manifold topology."
                        ),
                    )
                )
            if (
                undercut_region_analysis.region_count == 0
                and undercut_region_analysis.is_evaluable
            ):
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.NO_CONFIRMED_UNDERCUT_REGIONS,
                        source=MoldabilityFindingSource.UNDERCUT_REGION_ANALYSIS,
                        severity=IssueSeverity.INFO,
                        message=("No connected confirmed undercut regions were found."),
                    )
                )

        highest_undercut_risk = None
        highest_treatment_requirement = None
        high_risk_region_count = 0
        critical_risk_region_count = 0
        manual_review_region_count = 0
        blocking_region_count = 0
        if undercut_risk_assessment is not None:
            highest_undercut_risk = undercut_risk_assessment.highest_severity
            highest_treatment_requirement = (
                undercut_risk_assessment.overall_treatment_requirement
            )
            high_risk_region_count = undercut_risk_assessment.severity_counts.get(
                UndercutRiskSeverity.HIGH,
                0,
            )
            critical_risk_region_count = undercut_risk_assessment.severity_counts.get(
                UndercutRiskSeverity.CRITICAL,
                0,
            )
            manual_review_region_count = (
                undercut_risk_assessment.manual_review_region_count
            )
            blocking_region_count = undercut_risk_assessment.blocking_region_count

            if highest_undercut_risk is UndercutRiskSeverity.HIGH:
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.HIGH_UNDERCUT_RISK_PRESENT,
                        source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                        severity=IssueSeverity.ERROR,
                        message=(
                            "At least one connected undercut region carries high "
                            "manufacturability risk."
                        ),
                    )
                )
            if highest_undercut_risk is UndercutRiskSeverity.CRITICAL:
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.CRITICAL_UNDERCUT_RISK_PRESENT,
                        source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                        severity=IssueSeverity.CRITICAL,
                        message=(
                            "At least one connected undercut region carries critical "
                            "manufacturability risk."
                        ),
                        is_blocking=True,
                    )
                )

            if highest_treatment_requirement is (
                UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED
            ):
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.SIDE_ACTION_TREATMENT_INDICATED,
                        source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                        severity=IssueSeverity.ERROR,
                        message=(
                            "Structured undercut treatment evidence indicates that "
                            "side actions are likely required."
                        ),
                    )
                )

            if highest_treatment_requirement in (
                UndercutTreatmentRequirement.CORE_OR_INSERT_LIKELY_REQUIRED,
                UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK,
            ):
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.CORE_OR_INSERT_TREATMENT_INDICATED,
                        source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                        severity=IssueSeverity.ERROR,
                        message=(
                            "Structured undercut treatment evidence indicates that a "
                            "core or insert is likely required."
                        ),
                        is_blocking=(
                            highest_treatment_requirement
                            is UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK
                        ),
                    )
                )

            if manual_review_region_count > 0:
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.MANUAL_REVIEW_REGION_PRESENT,
                        source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "One or more connected undercut regions require manual "
                            "review under the current assessment policy."
                        ),
                    )
                )

            if blocking_region_count > 0:
                findings.append(
                    _finding(
                        code=MoldabilityFindingCode.BLOCKING_UNDERCUT_RISK_PRESENT,
                        source=MoldabilityFindingSource.UNDERCUT_RISK_ASSESSMENT,
                        severity=IssueSeverity.CRITICAL,
                        message=(
                            "One or more connected undercut regions are marked as "
                            "blocking under the current undercut-risk policy."
                        ),
                        is_blocking=True,
                        related_region_ids=tuple(
                            assessment.region_id
                            for assessment in undercut_risk_assessment.region_assessments
                            if assessment.treatment_requirement
                            is UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK
                        ),
                    )
                )

        findings.append(
            _finding(
                code=MoldabilityFindingCode.CORE_REQUIREMENT_NOT_ASSESSED,
                source=MoldabilityFindingSource.EVIDENCE_SUMMARY,
                severity=IssueSeverity.INFO,
                message=(
                    "Core or internal-insert need cannot be ruled out without "
                    "dedicated internal-feature evidence."
                ),
            )
        )

        ambiguity_detected = _ambiguity_detected(
            preliminary_selection=preliminary_selection,
            undercut_analysis=undercut_analysis,
            undercut_region_analysis=undercut_region_analysis,
            undercut_risk_assessment=undercut_risk_assessment,
        )
        is_assessable = _is_assessable(
            has_selected_pull_direction=has_selected_pull_direction,
            undercut_region_analysis_available=undercut_region_analysis_available,
            undercut_risk_assessment_available=undercut_risk_assessment_available,
        )
        evidence_quality = _evidence_quality(
            is_assessable=is_assessable,
            ambiguity_detected=ambiguity_detected,
            draft_analysis_available=draft_analysis_available,
            selected_direction_evidence_quality=selected_direction_evidence_quality,
            manual_review_region_count=manual_review_region_count,
        )
        ordered_findings = tuple(sorted(findings, key=_finding_sort_key))

        return MoldabilityEvidenceSummary(
            is_assessable=is_assessable,
            has_selected_pull_direction=has_selected_pull_direction,
            selected_pull_direction_status=selected_pull_direction_status,
            selected_pull_direction_decisiveness=selected_pull_direction_decisiveness,
            selected_direction_evidence_quality=selected_direction_evidence_quality,
            draft_analysis_available=draft_analysis_available,
            draft_analysis_status=draft_analysis_status,
            undercut_analysis_available=bool(
                undercut_analysis is not None and undercut_analysis.is_evaluable
            ),
            undercut_analysis_outcome=(
                None if undercut_analysis is None else undercut_analysis.outcome
            ),
            undercut_region_analysis_available=undercut_region_analysis_available,
            undercut_risk_assessment_available=undercut_risk_assessment_available,
            confirmed_undercut_region_count=confirmed_undercut_region_count,
            high_risk_region_count=high_risk_region_count,
            critical_risk_region_count=critical_risk_region_count,
            manual_review_region_count=manual_review_region_count,
            blocking_region_count=blocking_region_count,
            highest_undercut_risk=highest_undercut_risk,
            highest_treatment_requirement=highest_treatment_requirement,
            ambiguity_detected=ambiguity_detected,
            topology_limitations_detected=topology_limitations_detected,
            evidence_quality=evidence_quality,
            summary=_summary_line(
                is_assessable=is_assessable,
                confirmed_undercut_region_count=confirmed_undercut_region_count,
                highest_undercut_risk=highest_undercut_risk,
                ambiguity_detected=ambiguity_detected,
            ),
            findings=ordered_findings,
        )


DEFAULT_MOLDABILITY_EVIDENCE_SUMMARIZER: MoldabilityEvidenceSummarizer = (
    DefaultMoldabilityEvidenceSummarizer()
)


def _selected_direction_quality(
    preliminary_selection: PreliminaryPullDirectionSelection | None,
) -> MoldabilityEvidenceQuality:
    if (
        preliminary_selection is None
        or preliminary_selection.selected_candidate is None
        or preliminary_selection.status
        is PreliminaryPullDirectionSelectionStatus.UNAVAILABLE
    ):
        return MoldabilityEvidenceQuality.INSUFFICIENT

    if (
        preliminary_selection.status
        is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    ):
        return MoldabilityEvidenceQuality.LOW

    if preliminary_selection.decisiveness is (
        PreliminaryPullDirectionSelectionDecisiveness.CLOSE
    ):
        return MoldabilityEvidenceQuality.MODERATE

    return MoldabilityEvidenceQuality.HIGH


def _ambiguity_detected(
    *,
    preliminary_selection: PreliminaryPullDirectionSelection | None,
    undercut_analysis: UndercutAnalysisResult | None,
    undercut_region_analysis: UndercutRegionAnalysis | None,
    undercut_risk_assessment: UndercutRiskAssessmentResult | None,
) -> bool:
    if (
        preliminary_selection is not None
        and preliminary_selection.status
        is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    ):
        return True

    if undercut_analysis is not None and (
        undercut_analysis.outcome is UndercutAnalysisOutcome.AMBIGUOUS
    ):
        return True

    if undercut_region_analysis is not None and (
        undercut_region_analysis.status is DetailedMoldAnalysisStatus.PARTIAL
        or any(
            warning.code
            in (
                UndercutRegionAnalysisWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION,
                UndercutRegionAnalysisWarningCode.AMBIGUOUS_FACE_BRIDGES_PRESENT,
            )
            for warning in undercut_region_analysis.warnings
        )
    ):
        return True

    if undercut_risk_assessment is not None:
        return any(
            warning.code
            in (
                UndercutRiskAssessmentWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION,
                UndercutRiskAssessmentWarningCode.AMBIGUOUS_BOUNDARY_EVIDENCE_PRESENT,
            )
            for warning in undercut_risk_assessment.warnings
        )

    return False


def _is_assessable(
    *,
    has_selected_pull_direction: bool,
    undercut_region_analysis_available: bool,
    undercut_risk_assessment_available: bool,
) -> bool:
    return all(
        (
            has_selected_pull_direction,
            undercut_region_analysis_available,
            undercut_risk_assessment_available,
        )
    )


def _evidence_quality(
    *,
    is_assessable: bool,
    ambiguity_detected: bool,
    draft_analysis_available: bool,
    selected_direction_evidence_quality: MoldabilityEvidenceQuality,
    manual_review_region_count: int,
) -> MoldabilityEvidenceQuality:
    if not is_assessable:
        return MoldabilityEvidenceQuality.INSUFFICIENT

    if ambiguity_detected or manual_review_region_count > 0:
        return MoldabilityEvidenceQuality.LOW

    if (
        not draft_analysis_available
        or selected_direction_evidence_quality is MoldabilityEvidenceQuality.MODERATE
    ):
        return MoldabilityEvidenceQuality.MODERATE

    return MoldabilityEvidenceQuality.HIGH


def _summary_line(
    *,
    is_assessable: bool,
    confirmed_undercut_region_count: int,
    highest_undercut_risk: UndercutRiskSeverity | None,
    ambiguity_detected: bool,
) -> str:
    if not is_assessable:
        return "Moldability evidence is incomplete and cannot support a final preliminary decision."

    if confirmed_undercut_region_count == 0:
        if ambiguity_detected:
            return "No confirmed undercut regions were found, but ambiguity remains in the current evidence."

        return (
            "No confirmed undercut regions were found in the current detailed analysis."
        )

    return (
        "Detailed analysis found "
        f"{confirmed_undercut_region_count} confirmed undercut region(s); highest "
        f"reported undercut risk is {highest_undercut_risk.value if highest_undercut_risk is not None else 'unknown'}."
    )


def _finding(
    *,
    code: MoldabilityFindingCode,
    source: MoldabilityFindingSource,
    severity: IssueSeverity,
    message: str,
    is_blocking: bool = False,
    related_region_ids: tuple[str, ...] = (),
    metadata: dict[str, object] | None = None,
) -> MoldabilityFinding:
    return MoldabilityFinding(
        code=code,
        source=source,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        related_region_ids=related_region_ids,
        metadata={} if metadata is None else metadata,
    )


def _finding_sort_key(finding: MoldabilityFinding) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in finding.metadata.items())
    )
    return (
        not finding.is_blocking,
        _SEVERITY_ORDER[finding.severity],
        finding.source.value,
        finding.code.value,
        finding.related_region_ids,
        finding.message,
        metadata_key,
    )


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
