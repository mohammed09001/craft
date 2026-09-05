from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityAnalysisDecision,
    CavityAnalysisDecisionOutcome,
    CavityAssessmentOutcome,
    CavityCandidateDetectionResult,
    CavityClassificationResult,
    CavityCoreStrategyOutcome,
    CavityEvidenceAssessment,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionResult,
    CoreTrappingRiskAnalysisResult,
    InternalAccessDirectionGenerationResult,
    InternalAccessibilityAnalysisResult,
    InternalUndercutAnalysisResult,
    PreliminaryCoreStrategyAssessment,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CavityAnalysisDecisionMaker,
)


@dataclass(frozen=True, slots=True)
class ConservativeCavityAnalysisDecisionMaker:
    """Resolve the final Chapter 4 decision from structured stage outputs."""

    def decide(
        self,
        context: CavityAnalysisContext,
        assessment: CavityEvidenceAssessment,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
        core_trapping_risk: CoreTrappingRiskAnalysisResult,
        preliminary_core_strategy: PreliminaryCoreStrategyAssessment,
    ) -> CavityAnalysisDecision:
        """Return the conservative final Chapter 4 decision."""
        del (
            context,
            opening_detection,
            accessibility,
            access_directions,
            undercut_analysis,
            core_trapping_risk,
        )
        if assessment.outcome is CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.NOT_ASSESSABLE,
                summary=(
                    "Final cavity analysis decision is not assessable because "
                    "upstream evidence did not allow geometric assessment."
                ),
                finding_codes=(CavityFindingCode.UPSTREAM_RESULT_MISSING,),
                status=DetailedMoldAnalysisStatus.PARTIAL,
            )

        if preliminary_core_strategy.status is DetailedMoldAnalysisStatus.BLOCKED:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.NOT_ASSESSABLE,
                summary=(
                    "Final cavity analysis decision is not assessable because "
                    "preliminary core strategy synthesis was blocked."
                ),
                finding_codes=(CavityFindingCode.UPSTREAM_RESULT_MISSING,),
                status=DetailedMoldAnalysisStatus.PARTIAL,
            )

        target_assessments = preliminary_core_strategy.assessments
        if not target_assessments:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.NO_CAVITY_REQUIRING_CORE_STRATEGY,
                summary=(
                    "No cavity target requiring a preliminary core strategy was "
                    "identified by current Chapter 4 evidence."
                ),
                finding_codes=(
                    CavityFindingCode.NO_CANDIDATE_DETECTED_BY_CURRENT_SHELL_TOPOLOGY_METHOD,
                )
                if not classification.classifications
                and not candidate_detection.candidates
                else (),
                status=DetailedMoldAnalysisStatus.COMPLETED,
            )

        applicable = tuple(
            assessment_item
            for assessment_item in target_assessments
            if assessment_item.strategy_outcome
            is not CavityCoreStrategyOutcome.NOT_APPLICABLE
        )
        if not applicable:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.NO_APPLICABLE_INTERNAL_CAVITY,
                summary="No applicable internal cavity target remains after exclusions.",
                finding_codes=_collect_codes(target_assessments),
                status=DetailedMoldAnalysisStatus.COMPLETED,
            )

        not_assessable = _target_ids(
            applicable,
            CavityCoreStrategyOutcome.NOT_ASSESSABLE,
        )
        if not_assessable:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.NOT_ASSESSABLE,
                summary=(
                    "At least one applicable cavity target is not assessable, so "
                    "automatic Chapter 4 continuation is not safe."
                ),
                applicable_target_ids=_target_ids(applicable),
                blocking_target_ids=not_assessable,
                finding_codes=_collect_codes(applicable),
                status=DetailedMoldAnalysisStatus.PARTIAL,
            )

        blocked = _target_ids(
            applicable,
            CavityCoreStrategyOutcome.BLOCKED_BY_CURRENT_METHOD,
        )
        if blocked:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.CURRENT_METHOD_BLOCKED,
                summary=(
                    "At least one applicable cavity target is blocked by the "
                    "current preliminary/static Chapter 4 method."
                ),
                applicable_target_ids=_target_ids(applicable),
                blocking_target_ids=blocked,
                finding_codes=_collect_codes(applicable),
                status=DetailedMoldAnalysisStatus.PARTIAL,
            )

        special = _target_ids(
            applicable,
            CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
        )
        if special:
            return _decision(
                outcome=(
                    CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
                ),
                summary=(
                    "At least one cavity target requires future special strategy "
                    "investigation before downstream automation."
                ),
                applicable_target_ids=_target_ids(applicable),
                blocking_target_ids=special,
                finding_codes=_collect_codes(applicable),
                status=DetailedMoldAnalysisStatus.PARTIAL,
            )

        manual_review = tuple(
            sorted(
                assessment_item.target_id
                for assessment_item in applicable
                if assessment_item.strategy_outcome
                in (
                    CavityCoreStrategyOutcome.MANUAL_REVIEW_REQUIRED,
                    CavityCoreStrategyOutcome.AMBIGUOUS,
                )
            )
        )
        if manual_review:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.MANUAL_REVIEW_REQUIRED,
                summary=(
                    "Manual review is required because at least one cavity target "
                    "is ambiguous or has conflicting preliminary evidence."
                ),
                applicable_target_ids=_target_ids(applicable),
                manual_review_target_ids=manual_review,
                finding_codes=_collect_codes(applicable),
                status=DetailedMoldAnalysisStatus.PARTIAL,
            )

        multi_direction = _target_ids(
            applicable,
            CavityCoreStrategyOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
        )
        if multi_direction:
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
                summary=(
                    "The hardest applicable cavity target requires multiple "
                    "independent internal access directions by current evidence."
                ),
                applicable_target_ids=_target_ids(applicable),
                multi_direction_target_ids=multi_direction,
                linear_candidate_target_ids=_target_ids(
                    applicable,
                    CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
                ),
                finding_codes=_collect_codes(applicable),
                status=DetailedMoldAnalysisStatus.COMPLETED,
            )

        linear = _target_ids(
            applicable,
            CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
        )
        if len(linear) == len(applicable):
            return _decision(
                outcome=CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
                summary=(
                    "All applicable cavity targets are preliminarily compatible "
                    "with a linear-core strategy by current evidence."
                ),
                applicable_target_ids=_target_ids(applicable),
                linear_candidate_target_ids=linear,
                finding_codes=_collect_codes(applicable),
                limitations=_collect_limitations(applicable),
                status=DetailedMoldAnalysisStatus.COMPLETED,
            )

        return _decision(
            outcome=CavityAnalysisDecisionOutcome.MANUAL_REVIEW_REQUIRED,
            summary=(
                "Final cavity analysis decision requires manual review because "
                "target outcomes did not resolve to a clean automatic continuation."
            ),
            applicable_target_ids=_target_ids(applicable),
            manual_review_target_ids=_target_ids(applicable),
            finding_codes=_collect_codes(applicable),
            status=DetailedMoldAnalysisStatus.PARTIAL,
        )


DEFAULT_CAVITY_ANALYSIS_DECISION_MAKER: CavityAnalysisDecisionMaker = (
    ConservativeCavityAnalysisDecisionMaker()
)


def _decision(
    *,
    outcome: CavityAnalysisDecisionOutcome,
    summary: str,
    status: DetailedMoldAnalysisStatus,
    applicable_target_ids: tuple[str, ...] = (),
    blocking_target_ids: tuple[str, ...] = (),
    manual_review_target_ids: tuple[str, ...] = (),
    multi_direction_target_ids: tuple[str, ...] = (),
    linear_candidate_target_ids: tuple[str, ...] = (),
    finding_codes: tuple[CavityFindingCode, ...] = (),
    limitations: tuple[CavityFindingCode, ...] = (),
) -> CavityAnalysisDecision:
    ordered_codes = _ordered_codes(finding_codes)
    ordered_limitations = _ordered_codes(limitations)
    findings = [
        _finding(
            code=code,
            severity=IssueSeverity.WARNING,
            message=f"Final cavity analysis decision recorded {code.value}.",
        )
        for code in ordered_codes
    ]
    findings.extend(
        _finding(
            code=code,
            severity=IssueSeverity.INFO,
            message=f"Final cavity analysis limitation recorded {code.value}.",
        )
        for code in ordered_limitations
    )
    return CavityAnalysisDecision(
        status=status,
        outcome=outcome,
        summary=summary,
        applicable_target_ids=tuple(sorted(applicable_target_ids)),
        blocking_target_ids=tuple(sorted(blocking_target_ids)),
        manual_review_target_ids=tuple(sorted(manual_review_target_ids)),
        multi_direction_target_ids=tuple(sorted(multi_direction_target_ids)),
        linear_candidate_target_ids=tuple(sorted(linear_candidate_target_ids)),
        finding_codes=ordered_codes,
        limitations=ordered_limitations,
        findings=_order_findings(findings),
    )


def _target_ids(
    assessments,
    outcome: CavityCoreStrategyOutcome | None = None,
) -> tuple[str, ...]:
    return tuple(
        sorted(
            assessment.target_id
            for assessment in assessments
            if outcome is None or assessment.strategy_outcome is outcome
        )
    )


def _collect_codes(assessments) -> tuple[CavityFindingCode, ...]:
    return _ordered_codes(
        code
        for assessment in assessments
        for code in (
            assessment.blocking_finding_codes
            + assessment.manual_review_finding_codes
        )
    )


def _collect_limitations(assessments) -> tuple[CavityFindingCode, ...]:
    return _ordered_codes(
        code
        for assessment in assessments
        for code in assessment.limitations
    )


def _ordered_codes(codes) -> tuple[CavityFindingCode, ...]:
    return tuple(sorted(set(codes), key=lambda item: item.value))


def _finding(
    *,
    code: CavityFindingCode,
    severity: IssueSeverity,
    message: str,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> CavityFinding:
    return CavityFinding(
        code=code,
        source=CavityFindingSource.CAVITY_ANALYSIS_DECISION_MAKER,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )


def _order_findings(findings: list[CavityFinding]) -> tuple[CavityFinding, ...]:
    return tuple(sorted(findings, key=_finding_sort_key))


def _finding_sort_key(finding: CavityFinding) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in finding.metadata.items())
    )
    return (
        not finding.is_blocking,
        _SEVERITY_ORDER[finding.severity],
        finding.source.value,
        finding.code.value,
        finding.message,
        metadata_key,
    )


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
