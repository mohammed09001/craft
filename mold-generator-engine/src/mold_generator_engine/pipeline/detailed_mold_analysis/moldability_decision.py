from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.config.moldability import (
    PreliminaryMoldabilityDecisionSettings,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    ManufacturabilityRisk,
    MoldabilityActionIndication,
    MoldabilityEvidenceQuality,
    MoldabilityEvidenceSummary,
    MoldabilityFinding,
    MoldabilityFindingCode,
    MoldabilityFindingSource,
    MoldabilityStatus,
    PreliminaryMoldabilityAssessment,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    PreliminaryMoldabilityDecider,
)


@dataclass(frozen=True, slots=True)
class DefaultPreliminaryMoldabilityDecider:
    """Turn structured Chapter-3 evidence into a preliminary moldability decision."""

    settings: PreliminaryMoldabilityDecisionSettings = (
        PreliminaryMoldabilityDecisionSettings()
    )

    def decide(
        self,
        evidence_summary: MoldabilityEvidenceSummary,
    ) -> PreliminaryMoldabilityAssessment:
        """Return a deterministic preliminary moldability assessment."""
        overall_risk = _overall_risk(evidence_summary)
        side_action_indication = _side_action_indication(evidence_summary)
        core_or_insert_indication = _core_or_insert_indication(evidence_summary)
        direct_generation_blocked = _direct_generation_blocked(
            evidence_summary=evidence_summary,
            overall_risk=overall_risk,
            core_or_insert_indication=core_or_insert_indication,
            settings=self.settings,
        )
        manual_review_required = _manual_review_required(
            evidence_summary=evidence_summary,
            overall_risk=overall_risk,
            direct_generation_blocked=direct_generation_blocked,
            settings=self.settings,
        )
        simple_mold_possible = _simple_mold_possible(
            evidence_summary=evidence_summary,
            overall_risk=overall_risk,
            side_action_indication=side_action_indication,
            core_or_insert_indication=core_or_insert_indication,
            manual_review_required=manual_review_required,
            direct_generation_blocked=direct_generation_blocked,
            settings=self.settings,
        )
        status = _status(
            is_assessable=evidence_summary.is_assessable,
            simple_mold_possible=simple_mold_possible,
            manual_review_required=manual_review_required,
            direct_generation_blocked=direct_generation_blocked,
        )
        decision_findings = list(evidence_summary.findings)
        decision_findings.extend(
            _decision_findings(
                status=status,
                direct_generation_blocked=direct_generation_blocked,
                simple_mold_possible=simple_mold_possible,
            )
        )
        ordered_reasons = tuple(sorted(decision_findings, key=_finding_sort_key))
        blocking_reasons = tuple(
            reason for reason in ordered_reasons if reason.is_blocking
        )

        return PreliminaryMoldabilityAssessment(
            status=status,
            is_assessable=evidence_summary.is_assessable,
            overall_risk=overall_risk,
            simple_mold_possible=simple_mold_possible,
            side_action_indication=side_action_indication,
            core_or_insert_indication=core_or_insert_indication,
            manual_review_required=manual_review_required,
            direct_generation_blocked=direct_generation_blocked,
            ambiguity_detected=evidence_summary.ambiguity_detected,
            evidence_quality=evidence_summary.evidence_quality,
            summary=_summary_line(
                status=status,
                overall_risk=overall_risk,
                simple_mold_possible=simple_mold_possible,
                direct_generation_blocked=direct_generation_blocked,
            ),
            reasons=ordered_reasons,
            blocking_reasons=blocking_reasons,
            evidence_summary=evidence_summary,
        )


DEFAULT_PRELIMINARY_MOLDABILITY_DECIDER: PreliminaryMoldabilityDecider = (
    DefaultPreliminaryMoldabilityDecider()
)


def _overall_risk(
    evidence_summary: MoldabilityEvidenceSummary,
) -> ManufacturabilityRisk:
    if not evidence_summary.is_assessable:
        return ManufacturabilityRisk.UNKNOWN

    if evidence_summary.highest_undercut_risk is UndercutRiskSeverity.CRITICAL:
        return ManufacturabilityRisk.CRITICAL
    if evidence_summary.highest_undercut_risk is UndercutRiskSeverity.HIGH:
        return ManufacturabilityRisk.HIGH
    if evidence_summary.highest_undercut_risk is UndercutRiskSeverity.MEDIUM:
        return ManufacturabilityRisk.MODERATE
    return ManufacturabilityRisk.LOW


def _side_action_indication(
    evidence_summary: MoldabilityEvidenceSummary,
) -> MoldabilityActionIndication:
    if not evidence_summary.is_assessable:
        return MoldabilityActionIndication.NOT_ASSESSED

    if evidence_summary.highest_treatment_requirement is (
        UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED
    ):
        return MoldabilityActionIndication.LIKELY

    if evidence_summary.highest_treatment_requirement is (
        UndercutTreatmentRequirement.LOCAL_PARTING_REVIEW_REQUIRED
    ):
        return MoldabilityActionIndication.POSSIBLE

    return MoldabilityActionIndication.NOT_INDICATED


def _core_or_insert_indication(
    evidence_summary: MoldabilityEvidenceSummary,
) -> MoldabilityActionIndication:
    if evidence_summary.highest_treatment_requirement in (
        UndercutTreatmentRequirement.CORE_OR_INSERT_LIKELY_REQUIRED,
        UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK,
    ):
        return MoldabilityActionIndication.LIKELY

    return MoldabilityActionIndication.NOT_ASSESSED


def _direct_generation_blocked(
    *,
    evidence_summary: MoldabilityEvidenceSummary,
    overall_risk: ManufacturabilityRisk,
    core_or_insert_indication: MoldabilityActionIndication,
    settings: PreliminaryMoldabilityDecisionSettings,
) -> bool:
    if not evidence_summary.is_assessable:
        return True

    if evidence_summary.blocking_region_count >= settings.blocking_region_count_threshold:
        return True

    if (
        settings.block_on_critical_risk
        and overall_risk is ManufacturabilityRisk.CRITICAL
        and evidence_summary.critical_risk_region_count
        >= settings.critical_risk_region_count_threshold
    ):
        return True

    if (
        settings.block_on_core_or_insert_likely
        and core_or_insert_indication is MoldabilityActionIndication.LIKELY
    ):
        return True

    return False


def _manual_review_required(
    *,
    evidence_summary: MoldabilityEvidenceSummary,
    overall_risk: ManufacturabilityRisk,
    direct_generation_blocked: bool,
    settings: PreliminaryMoldabilityDecisionSettings,
) -> bool:
    if not evidence_summary.is_assessable:
        return False

    if (
        settings.manual_review_on_ambiguity
        and evidence_summary.ambiguity_detected
    ):
        return True

    if evidence_summary.manual_review_region_count > 0:
        return True

    if (
        overall_risk is ManufacturabilityRisk.HIGH
        and evidence_summary.high_risk_region_count
        >= settings.high_risk_region_count_manual_review_threshold
    ):
        return True

    if (
        settings.manual_review_on_low_evidence
        and evidence_summary.evidence_quality is MoldabilityEvidenceQuality.LOW
        and not direct_generation_blocked
    ):
        return True

    return False


def _simple_mold_possible(
    *,
    evidence_summary: MoldabilityEvidenceSummary,
    overall_risk: ManufacturabilityRisk,
    side_action_indication: MoldabilityActionIndication,
    core_or_insert_indication: MoldabilityActionIndication,
    manual_review_required: bool,
    direct_generation_blocked: bool,
    settings: PreliminaryMoldabilityDecisionSettings,
) -> bool:
    if not evidence_summary.is_assessable:
        return False

    if manual_review_required or direct_generation_blocked:
        return False

    if evidence_summary.confirmed_undercut_region_count > 0:
        return False

    if overall_risk is not ManufacturabilityRisk.LOW:
        return False

    if side_action_indication is not MoldabilityActionIndication.NOT_INDICATED:
        return False

    if core_or_insert_indication is MoldabilityActionIndication.LIKELY:
        return False

    if (
        settings.require_draft_analysis_for_simple_mold
        and not evidence_summary.draft_analysis_available
    ):
        return False

    if (
        settings.require_clear_pull_direction_for_simple_mold
        and (
            evidence_summary.selected_pull_direction_status
            is not PreliminaryPullDirectionSelectionStatus.SELECTED
            or evidence_summary.selected_pull_direction_decisiveness
            is not PreliminaryPullDirectionSelectionDecisiveness.CLEAR
        )
    ):
        return False

    return evidence_summary.evidence_quality is MoldabilityEvidenceQuality.HIGH


def _status(
    *,
    is_assessable: bool,
    simple_mold_possible: bool,
    manual_review_required: bool,
    direct_generation_blocked: bool,
) -> MoldabilityStatus:
    if not is_assessable:
        return MoldabilityStatus.NOT_ASSESSABLE

    if direct_generation_blocked:
        return MoldabilityStatus.BLOCKED_FOR_DIRECT_GENERATION

    if manual_review_required:
        return MoldabilityStatus.MANUAL_REVIEW_REQUIRED

    if simple_mold_possible:
        return MoldabilityStatus.SIMPLE_MOLD_POSSIBLE

    return MoldabilityStatus.ADDITIONAL_ACTIONS_LIKELY


def _decision_findings(
    *,
    status: MoldabilityStatus,
    direct_generation_blocked: bool,
    simple_mold_possible: bool,
) -> tuple[MoldabilityFinding, ...]:
    if status is MoldabilityStatus.NOT_ASSESSABLE:
        return (
            _finding(
                code=MoldabilityFindingCode.MOLDABILITY_NOT_ASSESSABLE,
                severity=IssueSeverity.ERROR,
                message=(
                    "The current Chapter-3 evidence is insufficient for a reliable "
                    "preliminary moldability decision."
                ),
                is_blocking=True,
            ),
        )

    if direct_generation_blocked:
        return (
            _finding(
                code=MoldabilityFindingCode.AUTOMATED_DIRECT_GENERATION_BLOCKED,
                severity=IssueSeverity.CRITICAL,
                message=(
                    "The current evidence blocks direct automatic mold generation "
                    "under the active policy."
                ),
                is_blocking=True,
            ),
        )

    if status is MoldabilityStatus.MANUAL_REVIEW_REQUIRED:
        return (
            _finding(
                code=MoldabilityFindingCode.MOLDABILITY_MANUAL_REVIEW_REQUIRED,
                severity=IssueSeverity.WARNING,
                message=(
                    "The current evidence requires manual review before a direct "
                    "generation path can be trusted."
                ),
            ),
        )

    if simple_mold_possible:
        return (
            _finding(
                code=MoldabilityFindingCode.SIMPLE_MOLD_EVIDENCE_PRESENT,
                severity=IssueSeverity.INFO,
                message=(
                    "The current evidence supports a simple-mold path without "
                    "confirmed undercut complications."
                ),
            ),
        )

    return (
        _finding(
            code=MoldabilityFindingCode.ADDITIONAL_ACTIONS_EVIDENT,
            severity=IssueSeverity.WARNING,
            message=(
                "The current evidence suggests that additional mold actions are "
                "likely even though the result remains assessable."
            ),
        ),
    )


def _summary_line(
    *,
    status: MoldabilityStatus,
    overall_risk: ManufacturabilityRisk,
    simple_mold_possible: bool,
    direct_generation_blocked: bool,
) -> str:
    if status is MoldabilityStatus.NOT_ASSESSABLE:
        return "Preliminary moldability is not assessable from the currently available Chapter-3 evidence."

    if direct_generation_blocked:
        return (
            "Preliminary moldability is assessable, but direct automatic generation "
            f"is blocked; overall risk is {overall_risk.value}."
        )

    if status is MoldabilityStatus.MANUAL_REVIEW_REQUIRED:
        return (
            "Preliminary moldability requires manual review before trusting the "
            f"direct generation path; overall risk is {overall_risk.value}."
        )

    if simple_mold_possible:
        return "The current evidence supports a simple-mold path with low overall risk."

    return (
        "The current evidence suggests that moldability remains plausible, but "
        f"additional mold actions are likely; overall risk is {overall_risk.value}."
    )


def _finding(
    *,
    code: MoldabilityFindingCode,
    severity: IssueSeverity,
    message: str,
    is_blocking: bool = False,
) -> MoldabilityFinding:
    return MoldabilityFinding(
        code=code,
        source=MoldabilityFindingSource.DECISION_POLICY,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
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
