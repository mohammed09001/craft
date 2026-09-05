from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisBlocker,
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    DraftAnalysisResult,
    MoldabilityEvidenceSummary,
    MoldAnalysisModuleResult,
    PreliminaryMoldabilityAssessment,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionRankingResult,
    UndercutAnalysisOutcome,
    UndercutAnalysisResult,
    UndercutRiskAssessmentResult,
    UndercutRegionAnalysis,
)
from mold_generator_engine.models.import_analysis_report import ImportAnalysisReport
from mold_generator_engine.models.imported_model import ImportedModel
from mold_generator_engine.models.issues import ModelIssue
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    CandidatePullDirectionEvaluator,
    CandidatePullDirectionProvider,
    DraftAngleAnalyzer,
    MoldabilityEvidenceSummarizer,
    MoldAnalysisModule,
    PreliminaryMoldabilityDecider,
    PreliminaryUndercutAnalyzer,
    PullDirectionRankingPolicy,
    UndercutRiskAssessor,
    UndercutRegionAnalyzer,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.draft_analysis import (
    DEFAULT_DRAFT_ANGLE_ANALYZER,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.face_analysis import (
    analyze_model_face_geometry,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.pull_direction_ranking import (
    DEFAULT_PRELIMINARY_PULL_DIRECTION_SELECTOR,
    DEFAULT_PULL_DIRECTION_RANKING_POLICY,
    PreliminaryPullDirectionSelector,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.pull_directions import (
    DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.moldability_decision import (
    DEFAULT_PRELIMINARY_MOLDABILITY_DECIDER,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.moldability_summary import (
    DEFAULT_MOLDABILITY_EVIDENCE_SUMMARIZER,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.undercut import (
    DEFAULT_PRELIMINARY_UNDERCUT_DETECTOR,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.undercut_regions import (
    DEFAULT_UNDERCUT_REGION_ANALYZER,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.undercut_assessment import (
    DEFAULT_UNDERCUT_RISK_ASSESSOR,
)


@dataclass(frozen=True, slots=True)
class DetailedMoldAnalysisService:
    """Coordinate the detailed mold-analysis stage on top of Chapter 2 output."""

    modules: tuple[MoldAnalysisModule, ...] = ()
    candidate_pull_direction_provider: CandidatePullDirectionProvider = (
        DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER
    )
    pull_direction_evaluator: CandidatePullDirectionEvaluator | None = None
    pull_direction_ranking_policy: PullDirectionRankingPolicy = (
        DEFAULT_PULL_DIRECTION_RANKING_POLICY
    )
    preliminary_pull_direction_selector: PreliminaryPullDirectionSelector = (
        DEFAULT_PRELIMINARY_PULL_DIRECTION_SELECTOR
    )
    undercut_analyzer: PreliminaryUndercutAnalyzer | None = (
        DEFAULT_PRELIMINARY_UNDERCUT_DETECTOR
    )
    draft_angle_analyzer: DraftAngleAnalyzer | None = DEFAULT_DRAFT_ANGLE_ANALYZER
    undercut_region_analyzer: UndercutRegionAnalyzer | None = (
        DEFAULT_UNDERCUT_REGION_ANALYZER
    )
    undercut_risk_assessor: UndercutRiskAssessor | None = DEFAULT_UNDERCUT_RISK_ASSESSOR
    moldability_evidence_summarizer: MoldabilityEvidenceSummarizer | None = (
        DEFAULT_MOLDABILITY_EVIDENCE_SUMMARIZER
    )
    preliminary_moldability_decider: PreliminaryMoldabilityDecider | None = (
        DEFAULT_PRELIMINARY_MOLDABILITY_DECIDER
    )

    def __post_init__(self) -> None:
        normalized_modules = tuple(self.modules)
        object.__setattr__(self, "modules", normalized_modules)

        module_ids = [module.module_id for module in normalized_modules]
        if len(module_ids) != len(set(module_ids)):
            raise ValueError(
                "Detailed mold analysis module identifiers must be unique."
            )

    def analyze(
        self,
        import_report: ImportAnalysisReport,
        model: ImportedModel,
    ) -> DetailedMoldAnalysisReport:
        """Run the configured detailed-analysis skeleton for one imported model."""
        processing_decision = import_report.processing_decision
        if processing_decision is None:
            return DetailedMoldAnalysisReport(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                source=import_report.source,
                summary=(
                    "Detailed mold analysis is blocked because Chapter 2 did not "
                    "produce a processing decision."
                ),
                chapter_2_status=import_report.status,
                blockers=(
                    DetailedMoldAnalysisBlocker(
                        code="missing_processing_decision",
                        message=(
                            "Chapter 2 output must include a processing decision "
                            "before detailed mold analysis can start."
                        ),
                    ),
                ),
            )

        if not processing_decision.is_processable:
            return DetailedMoldAnalysisReport(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                source=import_report.source,
                summary=(
                    "Detailed mold analysis is blocked by the Chapter 2 "
                    "processing decision."
                ),
                chapter_2_status=import_report.status,
                processing_decision=processing_decision,
                blockers=_blockers_from_issues(processing_decision.blocking_issues),
            )

        context = DetailedMoldAnalysisContext.from_report(import_report, model)
        module_results = [module.analyze(context) for module in self.modules]
        pull_direction_evaluations: tuple[CandidatePullDirectionEvaluation, ...] = ()
        pull_direction_ranking: PullDirectionRankingResult | None = None
        preliminary_pull_direction_selection: (
            PreliminaryPullDirectionSelection | None
        ) = None
        undercut_analysis: UndercutAnalysisResult | None = None
        draft_analysis: DraftAnalysisResult | None = None
        undercut_region_analysis: UndercutRegionAnalysis | None = None
        undercut_risk_assessment: UndercutRiskAssessmentResult | None = None
        moldability_evidence_summary: MoldabilityEvidenceSummary | None = None
        preliminary_moldability_assessment: (
            PreliminaryMoldabilityAssessment | None
        ) = None
        if self.pull_direction_evaluator is not None:
            face_analysis = analyze_model_face_geometry(context.model)
            pull_direction_candidates = (
                self.candidate_pull_direction_provider.generate_candidates(
                    face_analysis
                )
            )
            pull_direction_evaluations = (
                self.pull_direction_evaluator.evaluate_candidates(
                    face_analysis,
                    pull_direction_candidates,
                )
            )
            module_results.append(
                _module_result_from_pull_direction_evaluations(
                    pull_direction_evaluations
                )
            )
            pull_direction_ranking = self.pull_direction_ranking_policy.rank(
                pull_direction_evaluations
            )
            preliminary_pull_direction_selection = (
                self.preliminary_pull_direction_selector.select_from_ranking(
                    pull_direction_ranking
                )
            )
            module_results.append(
                _module_result_from_preliminary_selection(
                    preliminary_pull_direction_selection
                )
            )
            if self.undercut_analyzer is not None:
                undercut_analysis = self.undercut_analyzer.analyze(
                    context,
                    face_analysis,
                    preliminary_pull_direction_selection,
                )
                module_results.append(
                    _module_result_from_undercut_analysis(undercut_analysis)
                )
            if self.draft_angle_analyzer is not None:
                draft_analysis = self.draft_angle_analyzer.analyze(
                    context,
                    face_analysis,
                    preliminary_pull_direction_selection,
                )
                module_results.append(
                    _module_result_from_draft_analysis(draft_analysis)
                )
            if self.undercut_region_analyzer is not None:
                undercut_region_analysis = self.undercut_region_analyzer.analyze(
                    context,
                    face_analysis,
                    preliminary_pull_direction_selection,
                    undercut_analysis,
                    draft_analysis,
                )
                module_results.append(
                    _module_result_from_undercut_region_analysis(
                        undercut_region_analysis
                    )
                )
            if self.undercut_risk_assessor is not None:
                undercut_risk_assessment = self.undercut_risk_assessor.analyze(
                    context,
                    preliminary_pull_direction_selection,
                    undercut_region_analysis,
                )
                module_results.append(
                    _module_result_from_undercut_risk_assessment(
                        undercut_risk_assessment
                    )
                )
            if self.moldability_evidence_summarizer is not None:
                moldability_evidence_summary = (
                    self.moldability_evidence_summarizer.summarize(
                        context,
                        preliminary_pull_direction_selection,
                        undercut_analysis,
                        draft_analysis,
                        undercut_region_analysis,
                        undercut_risk_assessment,
                    )
                )
                module_results.append(
                    _module_result_from_moldability_evidence_summary(
                        moldability_evidence_summary
                    )
                )
            if (
                self.preliminary_moldability_decider is not None
                and moldability_evidence_summary is not None
            ):
                preliminary_moldability_assessment = (
                    self.preliminary_moldability_decider.decide(
                        moldability_evidence_summary
                    )
                )
                module_results.append(
                    _module_result_from_preliminary_moldability_assessment(
                        preliminary_moldability_assessment
                    )
                )

        resolved_module_results = tuple(module_results)
        overall_status = _resolve_overall_status(resolved_module_results)

        return DetailedMoldAnalysisReport(
            status=overall_status,
            source=import_report.source,
            summary=_summary_for_completed_path(
                overall_status=overall_status,
                module_results=resolved_module_results,
            ),
            chapter_2_status=import_report.status,
            processing_decision=processing_decision,
            module_results=resolved_module_results,
            pull_direction_evaluations=pull_direction_evaluations,
            pull_direction_ranking=pull_direction_ranking,
            preliminary_pull_direction_selection=preliminary_pull_direction_selection,
            undercut_analysis=undercut_analysis,
            draft_analysis=draft_analysis,
            undercut_region_analysis=undercut_region_analysis,
            undercut_risk_assessment=undercut_risk_assessment,
            preliminary_moldability_assessment=preliminary_moldability_assessment,
        )


def _blockers_from_issues(
    issues: tuple[ModelIssue, ...],
) -> tuple[DetailedMoldAnalysisBlocker, ...]:
    if not issues:
        return (
            DetailedMoldAnalysisBlocker(
                code="processing_not_allowed",
                message=(
                    "Chapter 2 marked the model as not processable for detailed "
                    "analysis."
                ),
            ),
        )

    return tuple(
        DetailedMoldAnalysisBlocker(
            code=issue.code,
            message=issue.message,
            metadata={"source": issue.source.value},
        )
        for issue in issues
    )


def _resolve_overall_status(
    module_results: tuple[MoldAnalysisModuleResult, ...],
) -> DetailedMoldAnalysisStatus:
    statuses = [result.status for result in module_results]

    if not statuses:
        return DetailedMoldAnalysisStatus.NOT_RUN

    if all(status is DetailedMoldAnalysisStatus.NOT_RUN for status in statuses):
        return DetailedMoldAnalysisStatus.NOT_RUN

    if all(status is DetailedMoldAnalysisStatus.BLOCKED for status in statuses):
        return DetailedMoldAnalysisStatus.BLOCKED

    if all(status is DetailedMoldAnalysisStatus.COMPLETED for status in statuses):
        return DetailedMoldAnalysisStatus.COMPLETED

    if all(status is DetailedMoldAnalysisStatus.FAILED for status in statuses):
        return DetailedMoldAnalysisStatus.FAILED

    return DetailedMoldAnalysisStatus.PARTIAL


def _module_result_from_pull_direction_evaluations(
    evaluations: tuple[CandidatePullDirectionEvaluation, ...],
) -> MoldAnalysisModuleResult:
    module_id = "candidate_pull_direction_evaluation"
    if not evaluations:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.NOT_RUN,
            summary="Candidate pull-direction evaluation received no candidates.",
        )

    evaluable_count = sum(1 for evaluation in evaluations if evaluation.is_evaluable)
    if evaluable_count == len(evaluations):
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.COMPLETED,
            summary=(
                "Candidate pull-direction evaluation completed for "
                f"{len(evaluations)} candidate direction(s)."
            ),
        )

    if evaluable_count == 0:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary=(
                "Candidate pull-direction evaluation could not find analyzable "
                "face area for any candidate direction."
            ),
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.PARTIAL,
        summary=(
            "Candidate pull-direction evaluation completed for "
            f"{evaluable_count} of {len(evaluations)} candidate direction(s)."
        ),
    )


def _module_result_from_preliminary_selection(
    selection: PreliminaryPullDirectionSelection,
) -> MoldAnalysisModuleResult:
    module_id = "preliminary_pull_direction_selection"
    if selection.status is PreliminaryPullDirectionSelectionStatus.UNAVAILABLE:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Stage-4 preliminary pull-direction selection was unavailable.",
        )

    if selection.status is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.PARTIAL,
            summary=(
                "Stage-4 pull-direction ranking completed, but the preliminary "
                "selection remains ambiguous."
            ),
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="Stage-4 preliminary pull-direction selection completed successfully.",
    )


def _module_result_from_undercut_analysis(
    analysis: UndercutAnalysisResult,
) -> MoldAnalysisModuleResult:
    module_id = "preliminary_undercut_detection"
    if not analysis.is_evaluable:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Preliminary undercut detection could not be evaluated.",
        )

    if analysis.outcome is UndercutAnalysisOutcome.AMBIGUOUS:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.PARTIAL,
            summary=(
                "Preliminary undercut detection completed with ambiguous face-level "
                "evidence."
            ),
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary=(
            "Preliminary undercut detection completed with "
            f"{len(analysis.regions)} region(s)."
        ),
    )


def _module_result_from_draft_analysis(
    analysis: DraftAnalysisResult,
) -> MoldAnalysisModuleResult:
    module_id = "draft_angle_analysis"
    if not analysis.is_evaluable:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Draft-angle analysis could not be evaluated.",
        )

    if analysis.status is DetailedMoldAnalysisStatus.PARTIAL:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.PARTIAL,
            summary=(
                "Draft-angle analysis completed with unevaluable faces or an "
                "ambiguous preliminary pull-direction selection."
            ),
        )

    evaluated_face_count = 0
    if analysis.summary is not None:
        evaluated_face_count = analysis.summary.evaluated_face_count

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary=(f"Draft-angle analysis completed for {evaluated_face_count} face(s)."),
    )


def _module_result_from_undercut_region_analysis(
    analysis: UndercutRegionAnalysis,
) -> MoldAnalysisModuleResult:
    module_id = "undercut_region_analysis"
    if not analysis.is_evaluable:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Undercut region analysis could not be evaluated.",
        )

    if analysis.status is DetailedMoldAnalysisStatus.PARTIAL:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.PARTIAL,
            summary=(
                "Undercut region analysis completed with preliminary ambiguity "
                "in the selected pull direction."
            ),
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary=(
            "Undercut region analysis completed with "
            f"{analysis.region_count} connected region(s)."
        ),
    )


def _module_result_from_undercut_risk_assessment(
    assessment: UndercutRiskAssessmentResult,
) -> MoldAnalysisModuleResult:
    module_id = "undercut_risk_assessment"
    if not assessment.is_evaluable:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Undercut risk assessment could not be evaluated.",
        )

    if assessment.assessed_region_count == 0:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=assessment.status,
            summary=(
                "Undercut risk assessment completed with no connected confirmed "
                "regions requiring special treatment."
            ),
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=assessment.status,
        summary=(
            "Undercut risk assessment completed for "
            f"{assessment.assessed_region_count} region(s); highest severity is "
            f"{assessment.highest_severity.value if assessment.highest_severity else 'unavailable'}."
        ),
    )


def _module_result_from_moldability_evidence_summary(
    summary: MoldabilityEvidenceSummary,
) -> MoldAnalysisModuleResult:
    module_id = "moldability_evidence_summary"
    if not summary.is_assessable:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Moldability evidence summary could not be completed reliably.",
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary=(
            "Moldability evidence summary completed with "
            f"{summary.confirmed_undercut_region_count} confirmed region(s)."
        ),
    )


def _module_result_from_preliminary_moldability_assessment(
    assessment: PreliminaryMoldabilityAssessment,
) -> MoldAnalysisModuleResult:
    module_id = "preliminary_moldability_assessment"
    if not assessment.is_assessable:
        return MoldAnalysisModuleResult(
            module_id=module_id,
            status=DetailedMoldAnalysisStatus.BLOCKED,
            summary="Preliminary moldability assessment is not assessable.",
        )

    return MoldAnalysisModuleResult(
        module_id=module_id,
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary=(
            "Preliminary moldability assessment completed with status "
            f"{assessment.status.value}."
        ),
    )


def _summary_for_completed_path(
    *,
    overall_status: DetailedMoldAnalysisStatus,
    module_results: tuple[MoldAnalysisModuleResult, ...],
) -> str:
    component_count = len(module_results)

    if overall_status is DetailedMoldAnalysisStatus.NOT_RUN:
        return "No detailed mold analysis components were configured to run."

    if overall_status is DetailedMoldAnalysisStatus.COMPLETED:
        return (
            "Detailed mold analysis completed successfully across "
            f"{component_count} configured component(s)."
        )

    if overall_status is DetailedMoldAnalysisStatus.BLOCKED:
        return (
            "Configured detailed mold analysis components reported blocked execution."
        )

    if overall_status is DetailedMoldAnalysisStatus.FAILED:
        return "All configured detailed mold analysis components reported failure."

    return "Detailed mold analysis completed only partially."
