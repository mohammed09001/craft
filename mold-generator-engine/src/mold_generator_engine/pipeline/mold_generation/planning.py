from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisDecision,
    CavityAnalysisDecisionOutcome,
    CavityCoreStrategyOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
    MoldabilityStatus,
)
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReportStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.models.mold_generation import (
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationFinding,
    MoldGenerationFindingCode,
    MoldGenerationFindingSource,
    MoldGenerationNextCapability,
    MoldGenerationTraceability,
    PreliminaryMoldGenerationMode,
    PreliminaryMoldGenerationPlan,
)


@dataclass(frozen=True, slots=True)
class ConservativeMoldGenerationPlanner:
    """Default deterministic planner for preliminary mold generation."""

    def plan(
        self,
        context: MoldGenerationContext,
    ) -> PreliminaryMoldGenerationPlan:
        """Resolve a conservative non-geometric plan from Chapter 2-4 reports."""
        traceability = _traceability_from_context(context)
        reasons: list[MoldGenerationFinding] = []
        warnings: list[MoldGenerationFinding] = []

        chapter_2_blocker = _chapter_2_blocker(context)
        if chapter_2_blocker is not None:
            reasons.append(chapter_2_blocker)
            return _blocked_plan(reasons, warnings, traceability)

        chapter_3_blocker = _chapter_3_blocker(context)
        if chapter_3_blocker is not None:
            reasons.append(chapter_3_blocker)
            return _blocked_plan(reasons, warnings, traceability)

        chapter_4_blocker = _chapter_4_blocker(context)
        if chapter_4_blocker is not None:
            reasons.append(chapter_4_blocker)
            return _blocked_plan(reasons, warnings, traceability)

        generation_mode = PreliminaryMoldGenerationMode.SIMPLE_TWO_PART_CANDIDATE
        disposition = MoldGenerationDisposition.READY_FOR_PARTING_STRATEGY
        required_next_capabilities = [MoldGenerationNextCapability.PARTING_STRATEGY]

        chapter_3_review = _chapter_3_manual_review(context)
        if chapter_3_review is not None:
            reasons.append(chapter_3_review)
            disposition = MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED

        chapter_4_review = _chapter_4_manual_review(context)
        if chapter_4_review is not None:
            reasons.append(chapter_4_review)
            disposition = MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED

        if _has_preliminary_core_candidate(context):
            generation_mode = PreliminaryMoldGenerationMode.CORE_ASSISTED_CANDIDATE
            required_next_capabilities.append(
                MoldGenerationNextCapability.CORE_FEASIBILITY_VERIFICATION
            )
            reasons.append(
                _finding(
                    MoldGenerationFindingCode.CHAPTER_4_PRELIMINARY_LINEAR_CORE_CANDIDATE,
                    MoldGenerationFindingSource.CAVITY_ANALYSIS,
                    IssueSeverity.INFO,
                    (
                        "Chapter 4 reported a preliminary linear core candidate; "
                        "Chapter 5 treats it only as a core-assisted candidate."
                    ),
                )
            )
            warnings.append(
                _finding(
                    (
                        MoldGenerationFindingCode.PRELIMINARY_CORE_STRATEGY_IS_NOT_FEASIBILITY_PROOF
                    ),
                    MoldGenerationFindingSource.MOLD_GENERATION_PLANNER,
                    IssueSeverity.WARNING,
                    (
                        "Preliminary core strategy evidence does not prove core "
                        "geometry, clearance, or motion feasibility."
                    ),
                )
            )

        if disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED:
            generation_mode = _unsupported_if_no_candidate_mode(generation_mode)
            required_next_capabilities.append(
                MoldGenerationNextCapability.MANUAL_ENGINEERING_REVIEW
            )
        else:
            reasons.extend(_ready_reasons(context))

        return PreliminaryMoldGenerationPlan(
            disposition=disposition,
            generation_mode=generation_mode,
            required_next_capabilities=_ordered_unique_next_capabilities(
                required_next_capabilities
            ),
            reasons=_ordered_unique_findings(tuple(reasons)),
            warnings=_ordered_unique_findings(tuple(warnings)),
            traceability=traceability,
        )


DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER = ConservativeMoldGenerationPlanner()


def _traceability_from_context(
    context: MoldGenerationContext,
) -> MoldGenerationTraceability:
    processing_decision = context.processing_decision
    preliminary_moldability = (
        context.detailed_mold_analysis_report.preliminary_moldability_assessment
    )
    cavity_decision = context.cavity_analysis_report.cavity_analysis_decision

    return MoldGenerationTraceability(
        source_name=context.source.source_name,
        chapter_2_status=context.import_report.status,
        chapter_3_status=context.detailed_mold_analysis_report.status,
        chapter_4_status=context.cavity_analysis_report.status,
        processing_decision_status=(
            None if processing_decision is None else processing_decision.status.value
        ),
        preliminary_moldability_status=(
            None if preliminary_moldability is None else preliminary_moldability.status
        ),
        cavity_analysis_decision_outcome=(
            None if cavity_decision is None else cavity_decision.outcome
        ),
    )


def _chapter_2_blocker(
    context: MoldGenerationContext,
) -> MoldGenerationFinding | None:
    processing_decision = context.processing_decision
    if processing_decision is None:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_2_PROCESSING_DECISION_MISSING,
            MoldGenerationFindingSource.IMPORT_ANALYSIS,
            IssueSeverity.ERROR,
            ("Chapter 2 did not provide a processing decision for mold generation."),
            is_blocking=True,
        )

    if not processing_decision.is_processable:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_2_BLOCKS_PROCESSING,
            MoldGenerationFindingSource.IMPORT_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 2 processing suitability blocks mold generation.",
            is_blocking=True,
            metadata={"processing_status": processing_decision.status.value},
        )

    if context.import_report.status not in {
        ImportAnalysisReportStatus.READY,
        ImportAnalysisReportStatus.READY_WITH_WARNINGS,
    }:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_2_STATUS_NOT_READY,
            MoldGenerationFindingSource.IMPORT_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 2 report status is not ready for mold generation.",
            is_blocking=True,
            metadata={"chapter_2_status": context.import_report.status.value},
        )

    return None


def _chapter_3_blocker(
    context: MoldGenerationContext,
) -> MoldGenerationFinding | None:
    report = context.detailed_mold_analysis_report
    if report.status in {
        DetailedMoldAnalysisStatus.BLOCKED,
        DetailedMoldAnalysisStatus.FAILED,
        DetailedMoldAnalysisStatus.NOT_RUN,
    }:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_3_STATUS_BLOCKS_GENERATION,
            MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 3 status blocks preliminary mold generation.",
            is_blocking=True,
            metadata={"chapter_3_status": report.status.value},
        )

    assessment = report.preliminary_moldability_assessment
    if assessment is None:
        return None

    if (
        assessment.direct_generation_blocked
        or assessment.status is MoldabilityStatus.BLOCKED_FOR_DIRECT_GENERATION
    ):
        return _finding(
            MoldGenerationFindingCode.CHAPTER_3_MOLDABILITY_BLOCKS_GENERATION,
            MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 3 preliminary moldability blocks direct generation.",
            is_blocking=True,
            metadata={"moldability_status": assessment.status.value},
        )

    return None


def _chapter_4_blocker(
    context: MoldGenerationContext,
) -> MoldGenerationFinding | None:
    report = context.cavity_analysis_report
    if report.status in {
        DetailedMoldAnalysisStatus.BLOCKED,
        DetailedMoldAnalysisStatus.FAILED,
        DetailedMoldAnalysisStatus.NOT_RUN,
    }:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_STATUS_BLOCKS_GENERATION,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 4 status blocks preliminary mold generation.",
            is_blocking=True,
            metadata={"chapter_4_status": report.status.value},
        )

    decision = report.cavity_analysis_decision
    if decision is None:
        return None

    if (
        decision.status
        in {
            DetailedMoldAnalysisStatus.BLOCKED,
            DetailedMoldAnalysisStatus.FAILED,
        }
        or decision.outcome is CavityAnalysisDecisionOutcome.CURRENT_METHOD_BLOCKED
    ):
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_DECISION_BLOCKS_GENERATION,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 4 cavity decision blocks preliminary mold generation.",
            is_blocking=True,
            metadata={"cavity_decision_outcome": decision.outcome.value},
        )

    blocked_strategy = _first_strategy_outcome(
        context,
        {CavityCoreStrategyOutcome.BLOCKED_BY_CURRENT_METHOD},
    )
    if blocked_strategy is not None:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_DECISION_BLOCKS_GENERATION,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.ERROR,
            "Chapter 4 preliminary core strategy blocks generation by current method.",
            is_blocking=True,
            metadata={"core_strategy_outcome": blocked_strategy.value},
        )

    return None


def _chapter_3_manual_review(
    context: MoldGenerationContext,
) -> MoldGenerationFinding | None:
    assessment = (
        context.detailed_mold_analysis_report.preliminary_moldability_assessment
    )
    if assessment is None:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_3_MOLDABILITY_EVIDENCE_MISSING,
            MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 3 did not provide preliminary moldability evidence.",
        )

    if assessment.status is MoldabilityStatus.NOT_ASSESSABLE:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_3_MOLDABILITY_NOT_ASSESSABLE,
            MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 3 preliminary moldability is not assessable.",
            metadata={"moldability_status": assessment.status.value},
        )

    if assessment.manual_review_required or assessment.ambiguity_detected:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_3_MANUAL_REVIEW_REQUIRED,
            MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 3 evidence requires manual review before generation.",
            metadata={"moldability_status": assessment.status.value},
        )

    if assessment.status is MoldabilityStatus.MANUAL_REVIEW_REQUIRED:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_3_MANUAL_REVIEW_REQUIRED,
            MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 3 moldability status requires manual review.",
            metadata={"moldability_status": assessment.status.value},
        )

    return None


def _chapter_4_manual_review(
    context: MoldGenerationContext,
) -> MoldGenerationFinding | None:
    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is None:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_CAVITY_DECISION_MISSING,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 4 did not provide a final cavity analysis decision.",
        )

    review_finding = _finding_from_cavity_decision(decision)
    if review_finding is not None:
        return review_finding

    review_strategy = _first_strategy_outcome(
        context,
        {
            CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
            CavityCoreStrategyOutcome.MANUAL_REVIEW_REQUIRED,
            CavityCoreStrategyOutcome.AMBIGUOUS,
            CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            CavityCoreStrategyOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
        },
    )
    if review_strategy is None:
        return None

    return _finding(
        MoldGenerationFindingCode.CHAPTER_4_MANUAL_REVIEW_REQUIRED,
        MoldGenerationFindingSource.CAVITY_ANALYSIS,
        IssueSeverity.WARNING,
        "Chapter 4 preliminary core strategy requires manual review.",
        metadata={"core_strategy_outcome": review_strategy.value},
    )


def _finding_from_cavity_decision(
    decision: CavityAnalysisDecision,
) -> MoldGenerationFinding | None:
    if decision.outcome is CavityAnalysisDecisionOutcome.NOT_ASSESSABLE:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_DECISION_NOT_ASSESSABLE,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 4 cavity decision is not assessable by the current method.",
            metadata={"cavity_decision_outcome": decision.outcome.value},
        )

    if decision.outcome is CavityAnalysisDecisionOutcome.MANUAL_REVIEW_REQUIRED:
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_MANUAL_REVIEW_REQUIRED,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 4 cavity decision requires manual review.",
            metadata={"cavity_decision_outcome": decision.outcome.value},
        )

    if (
        decision.outcome
        is CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
    ):
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_SPECIAL_STRATEGY_REQUIRED,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 4 requires special core strategy investigation.",
            metadata={"cavity_decision_outcome": decision.outcome.value},
        )

    if (
        decision.outcome
        is CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED
    ):
        return _finding(
            MoldGenerationFindingCode.CHAPTER_4_MULTI_DIRECTION_REQUIRED,
            MoldGenerationFindingSource.CAVITY_ANALYSIS,
            IssueSeverity.WARNING,
            "Chapter 4 requires multiple internal access directions.",
            metadata={"cavity_decision_outcome": decision.outcome.value},
        )

    return None


def _has_preliminary_core_candidate(context: MoldGenerationContext) -> bool:
    decision = context.cavity_analysis_report.cavity_analysis_decision
    if (
        decision is not None
        and decision.outcome
        is CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
    ):
        return True

    return (
        _first_strategy_outcome(
            context,
            {CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE},
        )
        is not None
    )


def _ready_reasons(
    context: MoldGenerationContext,
) -> tuple[MoldGenerationFinding, ...]:
    reasons: list[MoldGenerationFinding] = [
        _finding(
            MoldGenerationFindingCode.PRELIMINARY_PLAN_READY_FOR_PARTING_STRATEGY,
            MoldGenerationFindingSource.MOLD_GENERATION_PLANNER,
            IssueSeverity.INFO,
            "Preliminary plan may advance to the parting strategy stage.",
        )
    ]

    assessment = (
        context.detailed_mold_analysis_report.preliminary_moldability_assessment
    )
    if (
        assessment is not None
        and assessment.status is MoldabilityStatus.SIMPLE_MOLD_POSSIBLE
    ):
        reasons.append(
            _finding(
                MoldGenerationFindingCode.CHAPTER_3_SIMPLE_MOLD_EVIDENCE_PRESENT,
                MoldGenerationFindingSource.DETAILED_MOLD_ANALYSIS,
                IssueSeverity.INFO,
                "Chapter 3 reported simple mold evidence.",
            )
        )

    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is not None and decision.outcome in {
        CavityAnalysisDecisionOutcome.NO_CAVITY_REQUIRING_CORE_STRATEGY,
        CavityAnalysisDecisionOutcome.NO_APPLICABLE_INTERNAL_CAVITY,
    }:
        reasons.append(
            _finding(
                MoldGenerationFindingCode.CHAPTER_4_NO_CORE_STRATEGY_REQUIRED,
                MoldGenerationFindingSource.CAVITY_ANALYSIS,
                IssueSeverity.INFO,
                "Chapter 4 did not find an applicable cavity requiring core strategy.",
                metadata={"cavity_decision_outcome": decision.outcome.value},
            )
        )

    return tuple(reasons)


def _first_strategy_outcome(
    context: MoldGenerationContext,
    outcomes: set[CavityCoreStrategyOutcome],
) -> CavityCoreStrategyOutcome | None:
    strategy = context.cavity_analysis_report.preliminary_core_strategy
    if strategy is None:
        return None

    for assessment in strategy.assessments:
        if assessment.strategy_outcome in outcomes:
            return assessment.strategy_outcome

    return None


def _blocked_plan(
    reasons: list[MoldGenerationFinding],
    warnings: list[MoldGenerationFinding],
    traceability: MoldGenerationTraceability,
) -> PreliminaryMoldGenerationPlan:
    return PreliminaryMoldGenerationPlan(
        disposition=MoldGenerationDisposition.BLOCKED,
        generation_mode=PreliminaryMoldGenerationMode.UNSUPPORTED_CANDIDATE,
        required_next_capabilities=(MoldGenerationNextCapability.UPSTREAM_REMEDIATION,),
        reasons=_ordered_unique_findings(tuple(reasons)),
        warnings=_ordered_unique_findings(tuple(warnings)),
        traceability=traceability,
    )


def _unsupported_if_no_candidate_mode(
    mode: PreliminaryMoldGenerationMode,
) -> PreliminaryMoldGenerationMode:
    if mode is PreliminaryMoldGenerationMode.CORE_ASSISTED_CANDIDATE:
        return mode

    return PreliminaryMoldGenerationMode.UNSUPPORTED_CANDIDATE


def _finding(
    code: MoldGenerationFindingCode,
    source: MoldGenerationFindingSource,
    severity: IssueSeverity,
    message: str,
    *,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> MoldGenerationFinding:
    return MoldGenerationFinding(
        code=code,
        source=source,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )


def _ordered_unique_next_capabilities(
    capabilities: list[MoldGenerationNextCapability],
) -> tuple[MoldGenerationNextCapability, ...]:
    order = {
        MoldGenerationNextCapability.PARTING_STRATEGY: 0,
        MoldGenerationNextCapability.CORE_FEASIBILITY_VERIFICATION: 1,
        MoldGenerationNextCapability.PARTING_SURFACE_REFINEMENT: 2,
        MoldGenerationNextCapability.MANUAL_ENGINEERING_REVIEW: 3,
        MoldGenerationNextCapability.UPSTREAM_REMEDIATION: 4,
    }
    return tuple(
        sorted(
            {capability: None for capability in capabilities}.keys(),
            key=order.__getitem__,
        )
    )


def _ordered_unique_findings(
    findings: tuple[MoldGenerationFinding, ...],
) -> tuple[MoldGenerationFinding, ...]:
    return tuple({finding: None for finding in findings}.keys())
