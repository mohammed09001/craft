from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionResult,
    CavityClassificationOutcome,
    CavityClassificationResult,
    CavityCoreStrategyAssessment,
    CavityCoreStrategyOutcome,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionResult,
    CavityType,
    CoreTrappingRiskAnalysisResult,
    CoreTrappingRiskAssessment,
    CoreTrappingRiskOutcome,
    InternalAccessDirectionCandidate,
    InternalAccessDirectionGenerationResult,
    InternalAccessibilityAnalysisResult,
    InternalAccessibilityAssessment,
    InternalAccessibilityOutcome,
    InternalDirectionEvaluation,
    InternalDirectionEvaluationOutcome,
    InternalUndercutAnalysisResult,
    PreliminaryCoreStrategyAssessment,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CoreStrategySynthesizer,
)


@dataclass(frozen=True, slots=True)
class ConservativeCoreStrategySynthesizer:
    """Synthesize preliminary core-strategy evidence from Chapter 4 results."""

    def synthesize(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
        core_trapping_risk: CoreTrappingRiskAnalysisResult,
    ) -> PreliminaryCoreStrategyAssessment:
        """Return target-scoped strategy assessments without new geometry analysis."""
        del context, candidate_detection
        if any(
            result.status is DetailedMoldAnalysisStatus.BLOCKED
            for result in (
                opening_detection,
                classification,
                accessibility,
                access_directions,
                undercut_analysis,
                core_trapping_risk,
            )
        ):
            return PreliminaryCoreStrategyAssessment(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                summary="Preliminary core strategy synthesis was blocked upstream.",
                findings=(
                    _finding(
                        code=CavityFindingCode.UPSTREAM_RESULT_MISSING,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "Preliminary core strategy synthesis did not run because "
                            "one or more upstream Chapter 4 results were blocked."
                        ),
                        is_blocking=True,
                    ),
                ),
            )

        accessibility_by_target = {
            assessment.target_id: assessment for assessment in accessibility.assessments
        }
        directions_by_target = _directions_by_target(access_directions)
        evaluations_by_target = _evaluations_by_target(undercut_analysis)
        trapping_by_target = {
            assessment.target_id: assessment
            for assessment in core_trapping_risk.assessments
        }

        assessments = tuple(
            sorted(
                (
                    _assess_target(
                        target=target,
                        accessibility=accessibility_by_target.get(target.target_id),
                        directions=directions_by_target.get(target.target_id, ()),
                        evaluations=evaluations_by_target.get(target.target_id, ()),
                        trapping=trapping_by_target.get(target.target_id),
                    )
                    for target in classification.classifications
                ),
                key=_assessment_sort_key,
            )
        )

        findings = _build_findings(assessments)
        return PreliminaryCoreStrategyAssessment(
            status=_resolve_status(assessments),
            summary=_build_summary(assessments),
            assessments=assessments,
            findings=findings,
        )


DEFAULT_CORE_STRATEGY_SYNTHESIZER: CoreStrategySynthesizer = (
    ConservativeCoreStrategySynthesizer()
)


def _assess_target(
    *,
    target,
    accessibility: InternalAccessibilityAssessment | None,
    directions: tuple[InternalAccessDirectionCandidate, ...],
    evaluations: tuple[InternalDirectionEvaluation, ...],
    trapping: CoreTrappingRiskAssessment | None,
) -> CavityCoreStrategyAssessment:
    opening_ids = tuple(sorted(target.opening_ids))
    direction_ids = tuple(sorted(direction.direction_id for direction in directions))
    best_direction_id = (
        None if trapping is None else trapping.best_supported_direction_id
    )
    if best_direction_id is None and len(direction_ids) == 1:
        best_direction_id = direction_ids[0]

    accessibility_outcome = None if accessibility is None else accessibility.outcome
    undercut_outcome = _target_undercut_outcome(evaluations, best_direction_id)
    trapping_outcome = None if trapping is None else trapping.risk_outcome
    limitations = (
        CavityFindingCode.STATIC_ANALYSIS_ONLY,
        CavityFindingCode.CLEARANCE_NOT_EVALUATED,
        CavityFindingCode.MOTION_NOT_EVALUATED,
    )

    common_kwargs = {
        "target_id": target.target_id,
        "supporting_opening_ids": opening_ids,
        "candidate_access_direction_ids": direction_ids,
        "best_supported_direction_id": best_direction_id,
        "internal_accessibility_outcome": accessibility_outcome,
        "internal_undercut_outcome": undercut_outcome,
        "core_trapping_risk_outcome": trapping_outcome,
        "limitations": limitations,
    }

    if target.cavity_type is CavityType.MESH_BOUNDARY_DEFECT:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=0,
            strategy_outcome=CavityCoreStrategyOutcome.NOT_APPLICABLE,
            blocking_finding_codes=(CavityFindingCode.MESH_BOUNDARY_DEFECT_EXCLUDED,),
        )

    if target.cavity_type is CavityType.NOT_ASSESSABLE or target.outcome is (
        CavityClassificationOutcome.NOT_ASSESSABLE
    ):
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=0,
            strategy_outcome=CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            blocking_finding_codes=(
                CavityFindingCode.UPSTREAM_RESULT_MISSING,
                CavityFindingCode.TOPOLOGY_UNRELIABLE,
            ),
        )

    if accessibility is None or trapping is None:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            blocking_finding_codes=(CavityFindingCode.UPSTREAM_RESULT_MISSING,),
        )

    if target.cavity_type is CavityType.NESTED_SHELL_VOID:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=0,
            strategy_outcome=(
                CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
            ),
            blocking_finding_codes=(CavityFindingCode.HIGH_STRUCTURAL_TRAPPING_RISK,),
        )

    if target.outcome is CavityClassificationOutcome.AMBIGUOUS:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.AMBIGUOUS,
            manual_review_finding_codes=(CavityFindingCode.NUMERICAL_AMBIGUITY,),
        )

    if accessibility_outcome is InternalAccessibilityOutcome.NOT_ASSESSABLE:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            blocking_finding_codes=(CavityFindingCode.UPSTREAM_RESULT_MISSING,),
        )

    if accessibility_outcome in (
        InternalAccessibilityOutcome.AMBIGUOUS,
        InternalAccessibilityOutcome.ENCLOSED,
    ):
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.AMBIGUOUS,
            manual_review_finding_codes=(CavityFindingCode.NUMERICAL_AMBIGUITY,),
        )

    if not opening_ids:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=(
                CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
            ),
            blocking_finding_codes=(CavityFindingCode.NO_SUPPORTED_OPENING,),
        )

    if not direction_ids:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=1,
            strategy_outcome=(
                CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
            ),
            blocking_finding_codes=(
                CavityFindingCode.NO_SUPPORTED_INTERNAL_ACCESS_DIRECTION,
            ),
        )

    if trapping_outcome is CoreTrappingRiskOutcome.NOT_ASSESSABLE:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            blocking_finding_codes=(CavityFindingCode.UPSTREAM_RESULT_MISSING,),
        )

    if trapping_outcome is CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK:
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=(
                CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
            ),
            blocking_finding_codes=(CavityFindingCode.HIGH_STRUCTURAL_TRAPPING_RISK,),
        )

    if _has_blocking_directional_obstruction(evaluations):
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(1, len(direction_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.BLOCKED_BY_CURRENT_METHOD,
            blocking_finding_codes=(
                CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_DETECTED,
                CavityFindingCode.CURRENT_METHOD_BLOCKED,
            ),
        )

    if (
        target.cavity_type
        in (
            CavityType.THROUGH_CHANNEL_CANDIDATE,
            CavityType.MULTI_OPENING_REGION_CANDIDATE,
        )
        or len(direction_ids) > 1
    ):
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=max(2, len(direction_ids), len(opening_ids)),
            strategy_outcome=CavityCoreStrategyOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
            manual_review_finding_codes=(
                CavityFindingCode.MULTIPLE_INDEPENDENT_DIRECTIONS,
            ),
        )

    if trapping_outcome is CoreTrappingRiskOutcome.AMBIGUOUS or undercut_outcome in (
        InternalDirectionEvaluationOutcome.AMBIGUOUS,
        InternalDirectionEvaluationOutcome.NOT_ASSESSABLE,
    ):
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=1,
            strategy_outcome=CavityCoreStrategyOutcome.AMBIGUOUS,
            manual_review_finding_codes=(CavityFindingCode.NUMERICAL_AMBIGUITY,),
        )

    if (
        len(direction_ids) == 1
        and best_direction_id is not None
        and undercut_outcome is InternalDirectionEvaluationOutcome.CLEAR
        and trapping_outcome is CoreTrappingRiskOutcome.LOW_OBSERVED_RISK
    ):
        return CavityCoreStrategyAssessment(
            **common_kwargs,
            required_direction_count=1,
            strategy_outcome=CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
        )

    return CavityCoreStrategyAssessment(
        **common_kwargs,
        required_direction_count=max(1, len(direction_ids)),
        strategy_outcome=CavityCoreStrategyOutcome.MANUAL_REVIEW_REQUIRED,
        manual_review_finding_codes=(CavityFindingCode.UPSTREAM_RESULT_CONFLICT,),
    )


def _directions_by_target(
    access_directions: InternalAccessDirectionGenerationResult,
) -> dict[str, tuple[InternalAccessDirectionCandidate, ...]]:
    grouped: dict[str, list[InternalAccessDirectionCandidate]] = {}
    for direction in access_directions.directions:
        grouped.setdefault(direction.target_id, []).append(direction)
    return {
        target_id: tuple(sorted(directions, key=lambda item: item.direction_id))
        for target_id, directions in grouped.items()
    }


def _evaluations_by_target(
    undercut_analysis: InternalUndercutAnalysisResult,
) -> dict[str, tuple[InternalDirectionEvaluation, ...]]:
    grouped: dict[str, list[InternalDirectionEvaluation]] = {}
    for evaluation in undercut_analysis.evaluations:
        grouped.setdefault(evaluation.target_id, []).append(evaluation)
    return {
        target_id: tuple(sorted(evaluations, key=lambda item: item.direction_id))
        for target_id, evaluations in grouped.items()
    }


def _target_undercut_outcome(
    evaluations: tuple[InternalDirectionEvaluation, ...],
    best_direction_id: str | None,
) -> InternalDirectionEvaluationOutcome | None:
    if not evaluations:
        return None
    if best_direction_id is not None:
        for evaluation in evaluations:
            if evaluation.direction_id == best_direction_id:
                return evaluation.outcome
    if any(
        evaluation.outcome is InternalDirectionEvaluationOutcome.CLEAR
        for evaluation in evaluations
    ):
        return InternalDirectionEvaluationOutcome.CLEAR
    if any(
        evaluation.outcome is InternalDirectionEvaluationOutcome.PARTIALLY_OBSTRUCTED
        for evaluation in evaluations
    ):
        return InternalDirectionEvaluationOutcome.PARTIALLY_OBSTRUCTED
    if any(
        evaluation.outcome is InternalDirectionEvaluationOutcome.OBSTRUCTED
        for evaluation in evaluations
    ):
        return InternalDirectionEvaluationOutcome.OBSTRUCTED
    if any(
        evaluation.outcome is InternalDirectionEvaluationOutcome.AMBIGUOUS
        for evaluation in evaluations
    ):
        return InternalDirectionEvaluationOutcome.AMBIGUOUS
    return InternalDirectionEvaluationOutcome.NOT_ASSESSABLE


def _has_blocking_directional_obstruction(
    evaluations: tuple[InternalDirectionEvaluation, ...],
) -> bool:
    return bool(evaluations) and all(
        evaluation.outcome
        in (
            InternalDirectionEvaluationOutcome.OBSTRUCTED,
            InternalDirectionEvaluationOutcome.PARTIALLY_OBSTRUCTED,
        )
        for evaluation in evaluations
    )


def _resolve_status(
    assessments: tuple[CavityCoreStrategyAssessment, ...],
) -> DetailedMoldAnalysisStatus:
    if any(
        assessment.strategy_outcome
        in (
            CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            CavityCoreStrategyOutcome.AMBIGUOUS,
            CavityCoreStrategyOutcome.MANUAL_REVIEW_REQUIRED,
            CavityCoreStrategyOutcome.BLOCKED_BY_CURRENT_METHOD,
            CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
        )
        for assessment in assessments
    ):
        return DetailedMoldAnalysisStatus.PARTIAL
    return DetailedMoldAnalysisStatus.COMPLETED


def _build_summary(
    assessments: tuple[CavityCoreStrategyAssessment, ...],
) -> str:
    if not assessments:
        return "Preliminary core strategy synthesis found no cavity target to assess."
    return (
        "Preliminary core strategy synthesis produced "
        f"{len(assessments)} target assessment(s)."
    )


def _build_findings(
    assessments: tuple[CavityCoreStrategyAssessment, ...],
) -> tuple[CavityFinding, ...]:
    findings = [
        _finding(
            code=CavityFindingCode.STATIC_ANALYSIS_ONLY,
            severity=IssueSeverity.INFO,
            message=(
                "Preliminary core strategy synthesis uses current static Chapter 4 "
                "evidence only."
            ),
            metadata={"assessment_count": len(assessments)},
        ),
        _finding(
            code=CavityFindingCode.CLEARANCE_NOT_EVALUATED,
            severity=IssueSeverity.INFO,
            message="Core clearance has not been evaluated.",
        ),
        _finding(
            code=CavityFindingCode.MOTION_NOT_EVALUATED,
            severity=IssueSeverity.INFO,
            message="Insertion and extraction motion have not been evaluated.",
        ),
    ]
    for code in sorted(
        {
            code
            for assessment in assessments
            for code in (
                assessment.blocking_finding_codes
                + assessment.manual_review_finding_codes
            )
        },
        key=lambda item: item.value,
    ):
        findings.append(
            _finding(
                code=code,
                severity=IssueSeverity.WARNING,
                message=f"Core strategy synthesis recorded {code.value}.",
            )
        )
    return _order_findings(findings)


def _assessment_sort_key(
    assessment: CavityCoreStrategyAssessment,
) -> tuple[object, ...]:
    return (assessment.target_id, assessment.strategy_outcome.value)


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
        source=CavityFindingSource.CORE_STRATEGY_SYNTHESIZER,
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
