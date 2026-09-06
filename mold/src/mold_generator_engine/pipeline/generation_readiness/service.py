from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisDecisionOutcome,
    CavityAnalysisReport,
    CavityCoreStrategyOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    MoldabilityEvidenceQuality,
    PreliminaryPullDirectionSelectionStatus,
    UndercutTreatmentRequirement,
)
from mold_generator_engine.models.generation_readiness import (
    Chapter9GenerationContract,
    CoreCavityReadiness,
    DraftOrientationReadiness,
    GenerationReadinessFinding,
    GenerationReadinessReport,
    GenerationReadinessStatus,
    PartingStrategyReadiness,
    PullDirectionReadiness,
    UndercutIndicator,
)
from mold_generator_engine.models.import_analysis_report import ImportAnalysisReport
from mold_generator_engine.models.imported_model import ImportedModel
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.models.mold_generation import (
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationFinding,
    PartingStrategyEvaluation,
    PartingStrategyEvaluationStatus,
    PreliminaryPartingStrategySelectionStatus,
)
from mold_generator_engine.pipeline.mold_generation.contracts import (
    MoldGenerationPlanner,
    PartingStrategyCandidateGenerator,
    PartingStrategyEvaluator,
    PreliminaryPartingStrategySelector,
)
from mold_generator_engine.pipeline.mold_generation.parting_strategy import (
    DEFAULT_PARTING_STRATEGY_CANDIDATE_GENERATOR,
    DEFAULT_PARTING_STRATEGY_EVALUATOR,
    DEFAULT_PRELIMINARY_PARTING_STRATEGY_SELECTOR,
)
from mold_generator_engine.pipeline.mold_generation.planning import (
    DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER,
)


@dataclass(frozen=True, slots=True)
class GenerationReadinessService:
    """Produce the final Chapter 9 hand-off contract for Chapter 10."""

    planner: MoldGenerationPlanner = DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER
    parting_strategy_candidate_generator: PartingStrategyCandidateGenerator = (
        DEFAULT_PARTING_STRATEGY_CANDIDATE_GENERATOR
    )
    parting_strategy_evaluator: PartingStrategyEvaluator = (
        DEFAULT_PARTING_STRATEGY_EVALUATOR
    )
    preliminary_parting_strategy_selector: PreliminaryPartingStrategySelector = (
        DEFAULT_PRELIMINARY_PARTING_STRATEGY_SELECTOR
    )

    def analyze(
        self,
        import_report: ImportAnalysisReport,
        detailed_mold_analysis_report: DetailedMoldAnalysisReport,
        cavity_analysis_report: CavityAnalysisReport,
        model: ImportedModel,
    ) -> GenerationReadinessReport:
        """Build the final Chapter 9 report from existing analysis reports."""
        try:
            context = MoldGenerationContext.from_reports(
                import_report,
                detailed_mold_analysis_report,
                cavity_analysis_report,
                model,
            )
        except ValueError as exc:
            blocker = GenerationReadinessFinding(
                code="report_context_mismatch",
                source="generation_readiness",
                severity=IssueSeverity.ERROR,
                message=str(exc),
                is_blocking=True,
            )
            return _blocked_report(
                import_report,
                detailed_mold_analysis_report,
                cavity_analysis_report,
                blocker,
            )

        preliminary_plan = self.planner.plan(context)
        candidates = self.parting_strategy_candidate_generator.generate(
            context,
            preliminary_plan,
        )
        evaluations = self.parting_strategy_evaluator.evaluate(
            context,
            preliminary_plan,
            candidates,
        )
        strategy_selection = self.preliminary_parting_strategy_selector.select(
            context,
            preliminary_plan,
            evaluations,
        )

        parting_strategies = _parting_strategies_from_evaluations(evaluations)
        selected_strategy_id = None
        if strategy_selection.selected_candidate is not None:
            selected_strategy_id = strategy_selection.selected_candidate.candidate_id

        blockers = _blockers_from_findings(
            (
                *preliminary_plan.reasons,
                *strategy_selection.reasons,
                *(finding for item in evaluations for finding in item.reasons),
            )
        )
        warnings = _warnings_from_findings(
            (
                *preliminary_plan.reasons,
                *preliminary_plan.warnings,
                *strategy_selection.reasons,
                *strategy_selection.warnings,
                *(finding for item in evaluations for finding in item.warnings),
            )
        )

        if not parting_strategies:
            blockers = _dedupe_findings(
                (
                    *blockers,
                    GenerationReadinessFinding(
                        code="parting_strategy_unavailable",
                        source="generation_readiness",
                        severity=IssueSeverity.ERROR,
                        message="No parting strategy candidate is available for generation.",
                        is_blocking=True,
                    ),
                )
            )

        contract = Chapter9GenerationContract(
            pull_direction=_pull_direction_readiness(detailed_mold_analysis_report),
            draft_orientation=_draft_orientation_readiness(
                detailed_mold_analysis_report
            ),
            undercut_indicators=_undercut_indicators(detailed_mold_analysis_report),
            parting_strategies=parting_strategies,
            core_cavity_readiness=_core_cavity_readiness(cavity_analysis_report),
            selected_parting_strategy_id=selected_strategy_id,
            confidence=_overall_confidence(
                detailed_mold_analysis_report,
                cavity_analysis_report,
                evaluations,
            ),
        )

        status = _resolve_status(
            preliminary_plan.disposition,
            strategy_selection.status,
            blockers,
            warnings,
        )
        return GenerationReadinessReport(
            status=status,
            source=import_report.source,
            summary=_summary_for_status(status),
            chapter_2_status=import_report.status,
            chapter_3_status=detailed_mold_analysis_report.status.value,
            chapter_4_status=cavity_analysis_report.status.value,
            contract=contract,
            blockers=blockers,
            warnings=warnings,
        )


def _blocked_report(
    import_report: ImportAnalysisReport,
    detailed_report: DetailedMoldAnalysisReport,
    cavity_report: CavityAnalysisReport,
    blocker: GenerationReadinessFinding,
) -> GenerationReadinessReport:
    contract = Chapter9GenerationContract(
        pull_direction=PullDirectionReadiness(
            status="unavailable",
            candidate_id=None,
            direction=None,
            decisiveness=None,
            score=None,
            confidence=0.0,
        ),
        draft_orientation=DraftOrientationReadiness(
            status="unavailable",
            evaluated_surface_area_ratio=0.0,
            insufficient_draft_area_ratio=0.0,
            near_zero_draft_area_ratio=0.0,
        ),
        undercut_indicators=(),
        parting_strategies=(),
        core_cavity_readiness=CoreCavityReadiness(
            handling_required=False,
            decision_outcome=None,
            target_ids=(),
            confidence=0.0,
            blocker_codes=(blocker.code,),
        ),
        selected_parting_strategy_id=None,
        confidence=0.0,
    )
    return GenerationReadinessReport(
        status=GenerationReadinessStatus.BLOCKED,
        source=import_report.source,
        summary=_summary_for_status(GenerationReadinessStatus.BLOCKED),
        chapter_2_status=import_report.status,
        chapter_3_status=detailed_report.status.value,
        chapter_4_status=cavity_report.status.value,
        contract=contract,
        blockers=(blocker,),
    )


def _pull_direction_readiness(
    report: DetailedMoldAnalysisReport,
) -> PullDirectionReadiness:
    selection = report.preliminary_pull_direction_selection
    if selection is None:
        return PullDirectionReadiness(
            status="unavailable",
            candidate_id=None,
            direction=None,
            decisiveness=None,
            score=None,
            confidence=0.0,
        )

    selected = selection.selected_evaluation
    score = None if selected is None else selected.preliminary_score
    candidate = selection.selected_candidate
    confidence = _confidence_from_score(score)
    if selection.status is not PreliminaryPullDirectionSelectionStatus.SELECTED:
        confidence = min(confidence, 0.45)

    return PullDirectionReadiness(
        status=selection.status.value,
        candidate_id=None if candidate is None else candidate.candidate_id,
        direction=None if candidate is None else candidate.direction,
        decisiveness=None
        if selection.decisiveness is None
        else selection.decisiveness.value,
        score=score,
        confidence=confidence,
        warning_codes=tuple(selection.warnings),
    )


def _draft_orientation_readiness(
    report: DetailedMoldAnalysisReport,
) -> DraftOrientationReadiness:
    analysis = report.draft_analysis
    if analysis is None or analysis.summary is None:
        return DraftOrientationReadiness(
            status="unavailable",
            evaluated_surface_area_ratio=0.0,
            insufficient_draft_area_ratio=0.0,
            near_zero_draft_area_ratio=0.0,
        )

    summary = analysis.summary
    return DraftOrientationReadiness(
        status=analysis.status.value,
        evaluated_surface_area_ratio=round(summary.evaluated_surface_area_ratio, 6),
        insufficient_draft_area_ratio=round(
            summary.insufficient_draft_area_ratio,
            6,
        ),
        near_zero_draft_area_ratio=round(summary.near_zero_draft_area_ratio, 6),
        face_count_by_surface_type={
            key.value: value
            for key, value in summary.face_count_by_surface_type.items()
        },
        face_count_by_adequacy={
            key.value: value for key, value in summary.face_count_by_adequacy.items()
        },
        warning_codes=tuple(warning.code.value for warning in analysis.warnings),
    )


def _undercut_indicators(
    report: DetailedMoldAnalysisReport,
) -> tuple[UndercutIndicator, ...]:
    indicators: dict[str, UndercutIndicator] = {}

    risk = report.undercut_risk_assessment
    if risk is not None:
        for assessment in risk.region_assessments:
            indicators[assessment.region_id] = UndercutIndicator(
                region_id=assessment.region_id,
                source="undercut_risk_assessment",
                face_count=assessment.face_count,
                area_ratio=round(assessment.area_ratio, 6),
                confidence=round(assessment.confidence, 6),
                severity=assessment.severity.value,
                treatment_requirement=assessment.treatment_requirement.value,
                is_blocking=(
                    assessment.treatment_requirement
                    is UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK
                ),
                requires_manual_review=assessment.requires_manual_review,
            )

    region_analysis = report.undercut_region_analysis
    if region_analysis is not None:
        for region in region_analysis.regions:
            indicators.setdefault(
                region.region_id,
                UndercutIndicator(
                    region_id=region.region_id,
                    source="undercut_region_analysis",
                    face_count=region.face_count,
                    area_ratio=round(region.area_ratio, 6),
                    confidence=round(region.confidence, 6),
                ),
            )

    return tuple(sorted(indicators.values(), key=lambda item: item.region_id))


def _parting_strategies_from_evaluations(
    evaluations: tuple[PartingStrategyEvaluation, ...],
) -> tuple[PartingStrategyReadiness, ...]:
    ordered = tuple(
        sorted(evaluations, key=lambda item: (-item.score, item.candidate.order_index))
    )
    return tuple(
        PartingStrategyReadiness(
            candidate_id=evaluation.candidate_id,
            rank=index,
            strategy_type=evaluation.candidate.strategy_type.value,
            status=evaluation.status.value,
            score=evaluation.score,
            confidence=evaluation.confidence,
            pull_direction=evaluation.candidate.pull_direction,
            generation_mode=evaluation.candidate.generation_mode.value,
            core_target_ids=evaluation.candidate.core_target_ids,
            warning_codes=tuple(finding.code.value for finding in evaluation.warnings),
            blocker_codes=tuple(
                finding.code.value
                for finding in evaluation.reasons
                if finding.is_blocking
                or finding.severity in {IssueSeverity.ERROR, IssueSeverity.CRITICAL}
            ),
            requires_manual_review=evaluation.requires_manual_review,
        )
        for index, evaluation in enumerate(ordered, start=1)
    )


def _core_cavity_readiness(
    report: CavityAnalysisReport,
) -> CoreCavityReadiness:
    decision = report.cavity_analysis_decision
    target_ids: list[str] = []
    blocker_codes: list[str] = []
    warning_codes: list[str] = []
    source_references: list[str] = []

    if decision is not None:
        target_ids.extend(decision.linear_candidate_target_ids)
        target_ids.extend(decision.manual_review_target_ids)
        target_ids.extend(decision.multi_direction_target_ids)
        blocker_codes.extend(code.value for code in decision.finding_codes)
        warning_codes.extend(code.value for code in decision.limitations)
        source_references.append("cavity_analysis_decision")

    strategy = report.preliminary_core_strategy
    if strategy is not None:
        source_references.append("preliminary_core_strategy")
        for assessment in strategy.assessments:
            if assessment.strategy_outcome in {
                CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
                CavityCoreStrategyOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
                CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
                CavityCoreStrategyOutcome.MANUAL_REVIEW_REQUIRED,
            }:
                target_ids.append(assessment.target_id)
            blocker_codes.extend(
                code.value for code in assessment.blocking_finding_codes
            )
            warning_codes.extend(code.value for code in assessment.limitations)
            warning_codes.extend(
                code.value for code in assessment.manual_review_finding_codes
            )

    handling_required = bool(target_ids)
    if decision is not None and decision.outcome in {
        CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
        CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
        CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
        CavityAnalysisDecisionOutcome.MANUAL_REVIEW_REQUIRED,
    }:
        handling_required = True

    confidence = 0.85
    if report.status is not DetailedMoldAnalysisStatus.COMPLETED:
        confidence = 0.5
    if blocker_codes:
        confidence = min(confidence, 0.35)
    elif warning_codes:
        confidence = min(confidence, 0.65)

    return CoreCavityReadiness(
        handling_required=handling_required,
        decision_outcome=None if decision is None else decision.outcome.value,
        target_ids=tuple(sorted({target_id for target_id in target_ids})),
        confidence=confidence,
        blocker_codes=tuple(sorted({code for code in blocker_codes})),
        warning_codes=tuple(sorted({code for code in warning_codes})),
        source_references=tuple(dict.fromkeys(source_references)),
    )


def _blockers_from_findings(
    findings: tuple[MoldGenerationFinding, ...],
) -> tuple[GenerationReadinessFinding, ...]:
    return _dedupe_findings(
        tuple(
            _readiness_finding(finding)
            for finding in findings
            if finding.is_blocking
            or finding.severity in {IssueSeverity.ERROR, IssueSeverity.CRITICAL}
        )
    )


def _warnings_from_findings(
    findings: tuple[MoldGenerationFinding, ...],
) -> tuple[GenerationReadinessFinding, ...]:
    return _dedupe_findings(
        tuple(
            _readiness_finding(finding)
            for finding in findings
            if not finding.is_blocking and finding.severity is IssueSeverity.WARNING
        )
    )


def _readiness_finding(
    finding: MoldGenerationFinding,
) -> GenerationReadinessFinding:
    return GenerationReadinessFinding(
        code=finding.code.value,
        source=finding.source.value,
        severity=finding.severity,
        message=finding.message,
        is_blocking=finding.is_blocking,
        metadata=finding.metadata,
    )


def _dedupe_findings(
    findings: tuple[GenerationReadinessFinding, ...],
) -> tuple[GenerationReadinessFinding, ...]:
    ordered: dict[tuple[str, str, bool], GenerationReadinessFinding] = {}
    for finding in findings:
        ordered.setdefault(
            (finding.code, finding.message, finding.is_blocking),
            finding,
        )
    return tuple(ordered.values())


def _overall_confidence(
    detailed_report: DetailedMoldAnalysisReport,
    cavity_report: CavityAnalysisReport,
    evaluations: tuple[PartingStrategyEvaluation, ...],
) -> float:
    values: list[float] = []
    selection = detailed_report.preliminary_pull_direction_selection
    if selection is not None and selection.selected_evaluation is not None:
        values.append(
            _confidence_from_score(selection.selected_evaluation.preliminary_score)
        )

    assessment = detailed_report.preliminary_moldability_assessment
    if assessment is not None:
        values.append(_confidence_from_evidence_quality(assessment.evidence_quality))

    if cavity_report.status is DetailedMoldAnalysisStatus.COMPLETED:
        values.append(0.82)
    elif cavity_report.status is DetailedMoldAnalysisStatus.PARTIAL:
        values.append(0.55)
    else:
        values.append(0.25)

    acceptable_scores = [
        evaluation.confidence
        for evaluation in evaluations
        if evaluation.status is PartingStrategyEvaluationStatus.ACCEPTABLE
    ]
    if acceptable_scores:
        values.append(max(acceptable_scores))
    elif evaluations:
        values.append(max(evaluation.confidence for evaluation in evaluations))
    else:
        values.append(0.0)

    return round(min(values) if values else 0.0, 6)


def _confidence_from_score(score: float | None) -> float:
    if score is None:
        return 0.0
    return round(max(0.0, min(1.0, score / 100.0)), 6)


def _confidence_from_evidence_quality(
    evidence_quality: MoldabilityEvidenceQuality,
) -> float:
    return {
        MoldabilityEvidenceQuality.HIGH: 0.9,
        MoldabilityEvidenceQuality.MODERATE: 0.72,
        MoldabilityEvidenceQuality.LOW: 0.48,
        MoldabilityEvidenceQuality.INSUFFICIENT: 0.2,
    }[evidence_quality]


def _resolve_status(
    disposition: MoldGenerationDisposition,
    selection_status: PreliminaryPartingStrategySelectionStatus,
    blockers: tuple[GenerationReadinessFinding, ...],
    warnings: tuple[GenerationReadinessFinding, ...],
) -> GenerationReadinessStatus:
    if (
        blockers
        or disposition is MoldGenerationDisposition.BLOCKED
        or selection_status is PreliminaryPartingStrategySelectionStatus.BLOCKED
    ):
        return GenerationReadinessStatus.BLOCKED

    if warnings or disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED:
        return GenerationReadinessStatus.READY_WITH_WARNINGS

    if (
        selection_status
        is PreliminaryPartingStrategySelectionStatus.MANUAL_REVIEW_REQUIRED
    ):
        return GenerationReadinessStatus.READY_WITH_WARNINGS

    return GenerationReadinessStatus.READY


def _summary_for_status(status: GenerationReadinessStatus) -> str:
    if status is GenerationReadinessStatus.BLOCKED:
        return "Chapter 9 generation readiness is blocked by upstream evidence."
    if status is GenerationReadinessStatus.READY_WITH_WARNINGS:
        return "Chapter 9 generation readiness completed with generation warnings."
    return "Chapter 9 generation readiness completed for Chapter 10 hand-off."
