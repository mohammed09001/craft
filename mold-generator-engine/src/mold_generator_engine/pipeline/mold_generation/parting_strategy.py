from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisDecisionOutcome,
    CavityCoreStrategyOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DraftAnalysisResult,
    MoldabilityActionIndication,
    MoldabilityStatus,
    PreliminaryPullDirectionSelectionStatus,
    UndercutAnalysisOutcome,
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.models.mold_generation import (
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationFinding,
    MoldGenerationFindingCode,
    MoldGenerationFindingSource,
    PartingStrategyCandidate,
    PartingStrategyEvaluation,
    PartingStrategyEvaluationStatus,
    PartingStrategyType,
    PreliminaryMoldGenerationMode,
    PreliminaryMoldGenerationPlan,
    PreliminaryPartingStrategySelection,
    PreliminaryPartingStrategySelectionStatus,
)


@dataclass(frozen=True, slots=True)
class EvidencePartingStrategyCandidateGenerator:
    """Generate strategy candidates from existing Chapter 2-4 evidence."""

    def generate(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
    ) -> tuple[PartingStrategyCandidate, ...]:
        """Generate deterministic parting strategy candidates."""
        if preliminary_plan.disposition is MoldGenerationDisposition.BLOCKED:
            return ()

        pull_direction = _selected_pull_direction(context)
        if pull_direction is None:
            return ()

        candidates = [
            PartingStrategyCandidate(
                candidate_id="parting-strategy-0001-simple-two-part",
                order_index=0,
                strategy_type=PartingStrategyType.SIMPLE_TWO_PART_PLANAR,
                pull_direction=pull_direction,
                generation_mode=preliminary_plan.generation_mode,
                evidence_codes=(
                    MoldGenerationFindingCode.PARTING_PULL_DIRECTION_SELECTED,
                    (
                        MoldGenerationFindingCode.PARTING_SIMPLE_TWO_PART_CANDIDATE_GENERATED
                    ),
                ),
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_SIMPLE_TWO_PART_CANDIDATE_GENERATED,
                        IssueSeverity.INFO,
                        "Generated a simple two-part planar parting candidate.",
                    ),
                ),
            )
        ]

        core_target_ids = _core_target_ids(context)
        if core_target_ids:
            candidates.append(
                PartingStrategyCandidate(
                    candidate_id="parting-strategy-0002-core-assisted",
                    order_index=1,
                    strategy_type=PartingStrategyType.CORE_ASSISTED_PLANAR,
                    pull_direction=pull_direction,
                    generation_mode=PreliminaryMoldGenerationMode.CORE_ASSISTED_CANDIDATE,
                    core_target_ids=core_target_ids,
                    evidence_codes=(
                        MoldGenerationFindingCode.PARTING_PULL_DIRECTION_SELECTED,
                        (
                            MoldGenerationFindingCode.PARTING_CORE_ASSISTED_CANDIDATE_GENERATED
                        ),
                    ),
                    reasons=(
                        _finding(
                            MoldGenerationFindingCode.PARTING_CORE_ASSISTED_CANDIDATE_GENERATED,
                            IssueSeverity.INFO,
                            "Generated a core-assisted planar parting candidate.",
                            metadata={"core_target_ids": core_target_ids},
                        ),
                    ),
                )
            )

        return tuple(candidates)


@dataclass(frozen=True, slots=True)
class EvidencePartingStrategyEvaluator:
    """Score preliminary strategy candidates without creating geometry."""

    def evaluate(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        candidates: tuple[PartingStrategyCandidate, ...],
    ) -> tuple[PartingStrategyEvaluation, ...]:
        """Return deterministic evaluations in candidate order."""
        return tuple(
            _evaluate_candidate(context, preliminary_plan, candidate)
            for candidate in sorted(candidates, key=lambda item: item.order_index)
        )


@dataclass(frozen=True, slots=True)
class ScoreBasedPreliminaryPartingStrategySelector:
    """Select the best safe preliminary strategy by score and stable order."""

    minimum_score: float = 70.0
    minimum_confidence: float = 0.6
    ambiguity_score_delta: float = 5.0

    def select(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        evaluations: tuple[PartingStrategyEvaluation, ...],
    ) -> PreliminaryPartingStrategySelection:
        """Select a strategy or return manual-review/blocked result."""
        if not evaluations:
            status = (
                PreliminaryPartingStrategySelectionStatus.BLOCKED
                if preliminary_plan.disposition is MoldGenerationDisposition.BLOCKED
                else PreliminaryPartingStrategySelectionStatus.BLOCKED
            )
            return PreliminaryPartingStrategySelection(
                status=status,
                selected_evaluation=None,
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_PULL_DIRECTION_MISSING,
                        IssueSeverity.ERROR,
                        "No parting strategy candidate could be generated.",
                        is_blocking=True,
                    ),
                ),
            )

        ordered = tuple(
            sorted(
                evaluations,
                key=lambda item: (-item.score, item.candidate.order_index),
            )
        )
        top = ordered[0]

        if top.is_blocking or top.status is PartingStrategyEvaluationStatus.BLOCKED:
            return PreliminaryPartingStrategySelection(
                status=PreliminaryPartingStrategySelectionStatus.BLOCKED,
                selected_evaluation=None,
                reasons=top.reasons,
                warnings=top.warnings,
            )

        if (
            top.requires_manual_review
            or top.status is PartingStrategyEvaluationStatus.MANUAL_REVIEW_REQUIRED
            or top.score < self.minimum_score
            or top.confidence < self.minimum_confidence
        ):
            return PreliminaryPartingStrategySelection(
                status=PreliminaryPartingStrategySelectionStatus.MANUAL_REVIEW_REQUIRED,
                selected_evaluation=None,
                reasons=(
                    *top.reasons,
                    _finding(
                        MoldGenerationFindingCode.PARTING_STRATEGY_REQUIRES_MANUAL_REVIEW,
                        IssueSeverity.WARNING,
                        "Best parting strategy evidence is not decisive enough.",
                    ),
                ),
                warnings=top.warnings,
            )

        if len(ordered) > 1:
            runner_up = ordered[1]
            if (
                runner_up.status is PartingStrategyEvaluationStatus.ACCEPTABLE
                and top.score - runner_up.score < self.ambiguity_score_delta
            ):
                return PreliminaryPartingStrategySelection(
                    status=(
                        PreliminaryPartingStrategySelectionStatus.MANUAL_REVIEW_REQUIRED
                    ),
                    selected_evaluation=None,
                    reasons=(
                        _finding(
                            MoldGenerationFindingCode.PARTING_STRATEGY_AMBIGUOUS,
                            IssueSeverity.WARNING,
                            "Top parting strategy candidates are too close to select automatically.",
                            metadata={
                                "top_candidate_id": top.candidate_id,
                                "runner_up_candidate_id": runner_up.candidate_id,
                                "score_delta": round(top.score - runner_up.score, 6),
                            },
                        ),
                    ),
                    warnings=top.warnings,
                )

        return PreliminaryPartingStrategySelection(
            status=PreliminaryPartingStrategySelectionStatus.SELECTED,
            selected_evaluation=top,
            reasons=(
                _finding(
                    MoldGenerationFindingCode.PARTING_STRATEGY_ACCEPTABLE,
                    IssueSeverity.INFO,
                    "Selected the highest-scoring safe preliminary parting strategy.",
                    metadata={
                        "candidate_id": top.candidate_id,
                        "score": top.score,
                        "confidence": top.confidence,
                    },
                ),
            ),
            warnings=top.warnings,
        )


DEFAULT_PARTING_STRATEGY_CANDIDATE_GENERATOR = (
    EvidencePartingStrategyCandidateGenerator()
)
DEFAULT_PARTING_STRATEGY_EVALUATOR = EvidencePartingStrategyEvaluator()
DEFAULT_PRELIMINARY_PARTING_STRATEGY_SELECTOR = (
    ScoreBasedPreliminaryPartingStrategySelector()
)


def _evaluate_candidate(
    context: MoldGenerationContext,
    preliminary_plan: PreliminaryMoldGenerationPlan,
    candidate: PartingStrategyCandidate,
) -> PartingStrategyEvaluation:
    reasons = list(candidate.reasons)
    warnings: list[MoldGenerationFinding] = []
    score = (
        86.0
        if candidate.strategy_type is PartingStrategyType.SIMPLE_TWO_PART_PLANAR
        else 78.0
    )
    confidence = 0.85
    status = PartingStrategyEvaluationStatus.ACCEPTABLE
    blocking = False
    manual_review = False

    if candidate.pull_direction is None:
        return _blocked_evaluation(
            candidate,
            MoldGenerationFindingCode.PARTING_PULL_DIRECTION_MISSING,
            "Parting strategy evaluation requires a selected pull direction.",
        )

    if preliminary_plan.disposition is MoldGenerationDisposition.BLOCKED:
        return _blocked_evaluation(
            candidate,
            MoldGenerationFindingCode.PARTING_STRATEGY_BLOCKED,
            "Preliminary mold generation is blocked.",
        )

    if preliminary_plan.disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED:
        manual_review = True
        score -= 20.0
        confidence = min(confidence, 0.45)
        warnings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_STRATEGY_REQUIRES_MANUAL_REVIEW,
                IssueSeverity.WARNING,
                "Preliminary plan requires manual review.",
            )
        )

    selection = context.detailed_mold_analysis_report.preliminary_pull_direction_selection
    if selection is None or selection.selected_direction is None:
        return _blocked_evaluation(
            candidate,
            MoldGenerationFindingCode.PARTING_PULL_DIRECTION_MISSING,
            "Chapter 3 did not provide a selected pull direction.",
        )

    if selection.status is not PreliminaryPullDirectionSelectionStatus.SELECTED:
        manual_review = True
        score -= 18.0
        confidence = min(confidence, 0.5)
        warnings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_PULL_DIRECTION_AMBIGUOUS,
                IssueSeverity.WARNING,
                "Chapter 3 pull-direction selection is not decisive.",
                metadata={"pull_direction_status": selection.status.value},
            )
        )

    assessment = context.detailed_mold_analysis_report.preliminary_moldability_assessment
    if assessment is None:
        manual_review = True
        score -= 12.0
        confidence = min(confidence, 0.5)
    elif assessment.direct_generation_blocked:
        blocking = True
        score = 0.0
        confidence = 0.0
    elif (
        assessment.status
        in {
            MoldabilityStatus.MANUAL_REVIEW_REQUIRED,
            MoldabilityStatus.NOT_ASSESSABLE,
        }
        or assessment.manual_review_required
        or assessment.ambiguity_detected
    ):
        manual_review = True
        score -= 20.0
        confidence = min(confidence, 0.45)

    if assessment is not None:
        if assessment.side_action_indication is MoldabilityActionIndication.LIKELY:
            manual_review = True
            score -= 16.0
        if (
            assessment.core_or_insert_indication is MoldabilityActionIndication.LIKELY
            and candidate.strategy_type is PartingStrategyType.SIMPLE_TWO_PART_PLANAR
        ):
            manual_review = True
            score -= 16.0

    score, confidence, manual_review = _apply_draft_evidence(
        context.detailed_mold_analysis_report.draft_analysis,
        score,
        confidence,
        manual_review,
        warnings,
    )
    score, confidence, manual_review = _apply_undercut_evidence(
        context,
        candidate,
        score,
        confidence,
        manual_review,
        warnings,
    )
    score, confidence, manual_review = _apply_cavity_evidence(
        context,
        candidate,
        score,
        confidence,
        manual_review,
        warnings,
    )

    risk = context.detailed_mold_analysis_report.undercut_risk_assessment
    if risk is not None and (
        risk.blocking_region_count > 0
        or risk.overall_treatment_requirement
        is UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK
    ):
        blocking = True
        manual_review = False
        score = 0.0
        confidence = 0.0

    if blocking:
        status = PartingStrategyEvaluationStatus.BLOCKED
        reasons.append(
            _finding(
                MoldGenerationFindingCode.PARTING_STRATEGY_BLOCKED,
                IssueSeverity.ERROR,
                "Parting strategy is blocked by upstream moldability evidence.",
                is_blocking=True,
            )
        )
    elif manual_review:
        status = PartingStrategyEvaluationStatus.MANUAL_REVIEW_REQUIRED
        reasons.append(
            _finding(
                MoldGenerationFindingCode.PARTING_STRATEGY_REQUIRES_MANUAL_REVIEW,
                IssueSeverity.WARNING,
                "Parting strategy requires manual engineering review.",
            )
        )
    else:
        reasons.append(
            _finding(
                MoldGenerationFindingCode.PARTING_STRATEGY_ACCEPTABLE,
                IssueSeverity.INFO,
                "Parting strategy evidence is acceptable for preliminary selection.",
            )
        )

    return PartingStrategyEvaluation(
        candidate=candidate,
        status=status,
        score=round(max(0.0, min(100.0, score)), 6),
        confidence=round(max(0.0, min(1.0, confidence)), 6),
        reasons=tuple(reasons),
        warnings=tuple(warnings),
        is_blocking=blocking,
        requires_manual_review=manual_review,
    )


def _apply_draft_evidence(
    draft_analysis: DraftAnalysisResult | None,
    score: float,
    confidence: float,
    manual_review: bool,
    warnings: list[MoldGenerationFinding],
) -> tuple[float, float, bool]:
    if draft_analysis is None or not draft_analysis.is_evaluable:
        warnings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_STRATEGY_REQUIRES_MANUAL_REVIEW,
                IssueSeverity.WARNING,
                "Draft evidence is unavailable for parting strategy evaluation.",
            )
        )
        return score - 12.0, min(confidence, 0.55), True

    summary = draft_analysis.summary
    if summary is None:
        return score - 8.0, min(confidence, 0.6), True

    if summary.insufficient_draft_area_ratio > 0.25:
        warnings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_STRATEGY_REQUIRES_MANUAL_REVIEW,
                IssueSeverity.WARNING,
                "Significant insufficient draft area requires review.",
                metadata={
                    "insufficient_draft_area_ratio": round(
                        summary.insufficient_draft_area_ratio, 6
                    )
                },
            )
        )
        return score - 18.0, min(confidence, 0.55), True

    if summary.near_zero_draft_area_ratio > 0.1:
        return score - 8.0, min(confidence, 0.7), manual_review

    return score, confidence, manual_review


def _apply_undercut_evidence(
    context: MoldGenerationContext,
    candidate: PartingStrategyCandidate,
    score: float,
    confidence: float,
    manual_review: bool,
    warnings: list[MoldGenerationFinding],
) -> tuple[float, float, bool]:
    undercut_analysis = context.detailed_mold_analysis_report.undercut_analysis
    if undercut_analysis is not None:
        if undercut_analysis.outcome is UndercutAnalysisOutcome.AMBIGUOUS:
            manual_review = True
            score -= 14.0
            confidence = min(confidence, 0.5)
        elif (
            undercut_analysis.outcome is UndercutAnalysisOutcome.CONFIRMED_UNDERCUTS_FOUND
            and candidate.strategy_type is PartingStrategyType.SIMPLE_TWO_PART_PLANAR
        ):
            manual_review = True
            score -= 18.0
            confidence = min(confidence, 0.55)

    risk = context.detailed_mold_analysis_report.undercut_risk_assessment
    if risk is None:
        return score, confidence, manual_review

    if risk.blocking_region_count > 0:
        return 0.0, 0.0, True

    if risk.manual_review_region_count > 0:
        manual_review = True
        score -= 14.0
        confidence = min(confidence, 0.5)

    if risk.highest_severity in {
        UndercutRiskSeverity.HIGH,
        UndercutRiskSeverity.CRITICAL,
    }:
        manual_review = True
        score -= 16.0
        confidence = min(confidence, 0.5)

    if risk.overall_treatment_requirement in {
        UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED,
        UndercutTreatmentRequirement.MANUAL_REVIEW_REQUIRED,
        UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK,
    }:
        manual_review = True
        score -= 12.0

    return score, confidence, manual_review


def _apply_cavity_evidence(
    context: MoldGenerationContext,
    candidate: PartingStrategyCandidate,
    score: float,
    confidence: float,
    manual_review: bool,
    warnings: list[MoldGenerationFinding],
) -> tuple[float, float, bool]:
    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is None:
        return score - 12.0, min(confidence, 0.5), True

    if decision.outcome in {
        CavityAnalysisDecisionOutcome.NOT_ASSESSABLE,
        CavityAnalysisDecisionOutcome.MANUAL_REVIEW_REQUIRED,
        CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
        CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
    }:
        return score - 18.0, min(confidence, 0.45), True

    if _core_target_ids(context):
        warnings.append(
            _finding(
                MoldGenerationFindingCode.PRELIMINARY_CORE_STRATEGY_IS_NOT_FEASIBILITY_PROOF,
                IssueSeverity.WARNING,
                "Core-assisted evidence is preliminary and does not prove feasibility.",
            )
        )
        if candidate.strategy_type is PartingStrategyType.SIMPLE_TWO_PART_PLANAR:
            return score - 14.0, min(confidence, 0.65), True

        return score, min(confidence, 0.75), manual_review

    return score, confidence, manual_review


def _selected_pull_direction(context: MoldGenerationContext) -> Vector3D | None:
    selection = context.detailed_mold_analysis_report.preliminary_pull_direction_selection
    if selection is None:
        return None

    return selection.selected_direction


def _core_target_ids(context: MoldGenerationContext) -> tuple[str, ...]:
    target_ids: list[str] = []
    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is not None:
        target_ids.extend(decision.linear_candidate_target_ids)

    strategy = context.cavity_analysis_report.preliminary_core_strategy
    if strategy is not None:
        target_ids.extend(
            assessment.target_id
            for assessment in strategy.assessments
            if assessment.strategy_outcome
            is CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
        )

    return tuple({target_id: None for target_id in target_ids}.keys())


def _blocked_evaluation(
    candidate: PartingStrategyCandidate,
    code: MoldGenerationFindingCode,
    message: str,
) -> PartingStrategyEvaluation:
    reason = _finding(code, IssueSeverity.ERROR, message, is_blocking=True)
    return PartingStrategyEvaluation(
        candidate=candidate,
        status=PartingStrategyEvaluationStatus.BLOCKED,
        score=0.0,
        confidence=0.0,
        reasons=(reason,),
        is_blocking=True,
    )


def _finding(
    code: MoldGenerationFindingCode,
    severity: IssueSeverity,
    message: str,
    *,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> MoldGenerationFinding:
    return MoldGenerationFinding(
        code=code,
        source=MoldGenerationFindingSource.MOLD_GENERATION_PLANNER,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )
