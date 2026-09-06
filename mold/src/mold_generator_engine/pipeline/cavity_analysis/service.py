from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisBlocker,
    CavityAnalysisContext,
    CavityAnalysisDecision,
    CavityAnalysisDecisionOutcome,
    CavityAnalysisReport,
    CavityAssessmentOutcome,
    CavityClassificationResult,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionOutcome,
    CavityOpeningDetectionResult,
    CoreTrappingRiskAnalysisResult,
    CoreTrappingRiskOutcome,
    InternalAccessDirectionGenerationOutcome,
    InternalAccessDirectionGenerationResult,
    InternalAccessibilityAnalysisResult,
    InternalUndercutAnalysisOutcome,
    InternalUndercutAnalysisResult,
    PreliminaryCoreStrategyAssessment,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisBlocker,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.import_analysis_report import ImportAnalysisReport
from mold_generator_engine.models.imported_model import ImportedModel
from mold_generator_engine.models.issues import IssueSeverity, ModelIssue
from mold_generator_engine.pipeline.cavity_analysis.accessibility import (
    DEFAULT_INTERNAL_ACCESSIBILITY_ANALYZER,
)
from mold_generator_engine.pipeline.cavity_analysis.assessment import (
    DEFAULT_CAVITY_EVIDENCE_ASSESSOR,
)
from mold_generator_engine.pipeline.cavity_analysis.classification import (
    DEFAULT_CAVITY_CLASSIFIER,
)
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CavityAnalysisDecisionMaker,
    CavityCandidateDetector,
    CavityClassifier,
    CavityEvidenceAssessor,
    CavityOpeningDetector,
    CoreStrategySynthesizer,
    CoreTrappingRiskAnalyzer,
    InternalAccessDirectionGenerator,
    InternalAccessibilityAnalyzer,
    InternalUndercutAnalyzer,
)
from mold_generator_engine.pipeline.cavity_analysis.core_strategy import (
    DEFAULT_CORE_STRATEGY_SYNTHESIZER,
)
from mold_generator_engine.pipeline.cavity_analysis.core_trapping import (
    DEFAULT_CORE_TRAPPING_RISK_ANALYZER,
)
from mold_generator_engine.pipeline.cavity_analysis.decision import (
    DEFAULT_CAVITY_ANALYSIS_DECISION_MAKER,
)
from mold_generator_engine.pipeline.cavity_analysis.detection import (
    DEFAULT_CAVITY_CANDIDATE_DETECTOR,
)
from mold_generator_engine.pipeline.cavity_analysis.directions import (
    DEFAULT_INTERNAL_ACCESS_DIRECTION_GENERATOR,
)
from mold_generator_engine.pipeline.cavity_analysis.openings import (
    DEFAULT_CAVITY_OPENING_DETECTOR,
)
from mold_generator_engine.pipeline.cavity_analysis.undercuts import (
    DEFAULT_INTERNAL_UNDERCUT_ANALYZER,
)


@dataclass(frozen=True, slots=True)
class CavityAnalysisService:
    """Coordinate the independent Chapter 4 cavity-analysis stage."""

    evidence_assessor: CavityEvidenceAssessor = DEFAULT_CAVITY_EVIDENCE_ASSESSOR
    candidate_detector: CavityCandidateDetector = DEFAULT_CAVITY_CANDIDATE_DETECTOR
    opening_detector: CavityOpeningDetector = DEFAULT_CAVITY_OPENING_DETECTOR
    cavity_classifier: CavityClassifier = DEFAULT_CAVITY_CLASSIFIER
    accessibility_analyzer: InternalAccessibilityAnalyzer = (
        DEFAULT_INTERNAL_ACCESSIBILITY_ANALYZER
    )
    access_direction_generator: InternalAccessDirectionGenerator = (
        DEFAULT_INTERNAL_ACCESS_DIRECTION_GENERATOR
    )
    internal_undercut_analyzer: InternalUndercutAnalyzer = (
        DEFAULT_INTERNAL_UNDERCUT_ANALYZER
    )
    core_trapping_risk_analyzer: CoreTrappingRiskAnalyzer = (
        DEFAULT_CORE_TRAPPING_RISK_ANALYZER
    )
    core_strategy_synthesizer: CoreStrategySynthesizer = (
        DEFAULT_CORE_STRATEGY_SYNTHESIZER
    )
    cavity_analysis_decision_maker: CavityAnalysisDecisionMaker = (
        DEFAULT_CAVITY_ANALYSIS_DECISION_MAKER
    )

    def analyze(
        self,
        import_report: ImportAnalysisReport,
        detailed_mold_analysis_report: DetailedMoldAnalysisReport,
        model: ImportedModel,
    ) -> CavityAnalysisReport:
        """Run the cavity-analysis foundation on top of Chapters 2 and 3 output."""
        processing_decision = import_report.processing_decision
        if processing_decision is None:
            return CavityAnalysisReport(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                source=import_report.source,
                summary=(
                    "Cavity analysis is blocked because Chapter 2 did not provide "
                    "a processing decision."
                ),
                chapter_2_status=import_report.status,
                chapter_3_status=detailed_mold_analysis_report.status,
                assessment_outcome=(
                    CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED
                ),
                blockers=(
                    CavityAnalysisBlocker(
                        code="missing_processing_decision",
                        message=(
                            "Chapter 2 output must include a processing decision "
                            "before cavity analysis can start."
                        ),
                    ),
                ),
                internal_access_directions=_blocked_access_directions(),
                internal_undercut_analysis=_blocked_undercut_analysis(),
                core_trapping_risk=_blocked_trapping_risk(),
                preliminary_core_strategy=_blocked_core_strategy(),
                cavity_analysis_decision=_blocked_decision(),
            )

        if not processing_decision.is_processable:
            return CavityAnalysisReport(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                source=import_report.source,
                summary=(
                    "Cavity analysis is blocked by the Chapter 2 processing decision."
                ),
                chapter_2_status=import_report.status,
                chapter_3_status=detailed_mold_analysis_report.status,
                assessment_outcome=(
                    CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED
                ),
                processing_decision=processing_decision,
                blockers=_blockers_from_issues(processing_decision.blocking_issues),
                internal_access_directions=_blocked_access_directions(),
                internal_undercut_analysis=_blocked_undercut_analysis(),
                core_trapping_risk=_blocked_trapping_risk(),
                preliminary_core_strategy=_blocked_core_strategy(),
                cavity_analysis_decision=_blocked_decision(),
            )

        if detailed_mold_analysis_report.status in {
            DetailedMoldAnalysisStatus.BLOCKED,
            DetailedMoldAnalysisStatus.FAILED,
            DetailedMoldAnalysisStatus.NOT_RUN,
        }:
            return CavityAnalysisReport(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                source=import_report.source,
                summary=(
                    "Cavity analysis is blocked because the Chapter 3 report is "
                    "not consumable for cavity assessment."
                ),
                chapter_2_status=import_report.status,
                chapter_3_status=detailed_mold_analysis_report.status,
                assessment_outcome=(
                    CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED
                ),
                processing_decision=processing_decision,
                blockers=_blockers_from_detailed_report(detailed_mold_analysis_report),
                internal_access_directions=_blocked_access_directions(),
                internal_undercut_analysis=_blocked_undercut_analysis(),
                core_trapping_risk=_blocked_trapping_risk(),
                preliminary_core_strategy=_blocked_core_strategy(),
                cavity_analysis_decision=_blocked_decision(),
            )

        context = CavityAnalysisContext.from_reports(
            import_report,
            detailed_mold_analysis_report,
            model,
        )
        assessment = self.evidence_assessor.assess(context)
        candidate_detection = self.candidate_detector.detect(context)
        if candidate_detection.status is DetailedMoldAnalysisStatus.BLOCKED:
            opening_detection = _blocked_opening_detection()
            cavity_classification = _blocked_classification()
            internal_accessibility = _blocked_accessibility()
            internal_access_directions = _blocked_access_directions()
            internal_undercut_analysis = _blocked_undercut_analysis()
            core_trapping_risk = _blocked_trapping_risk()
            preliminary_core_strategy = _blocked_core_strategy()
            cavity_analysis_decision = _blocked_decision()
        else:
            opening_detection = self.opening_detector.detect(
                context,
                candidate_detection,
            )
            if opening_detection.outcome is CavityOpeningDetectionOutcome.BLOCKED:
                cavity_classification = _blocked_classification()
                internal_accessibility = _blocked_accessibility()
                internal_access_directions = _blocked_access_directions()
                internal_undercut_analysis = _blocked_undercut_analysis()
                core_trapping_risk = _blocked_trapping_risk()
                preliminary_core_strategy = _blocked_core_strategy()
                cavity_analysis_decision = _blocked_decision()
            else:
                cavity_classification = self.cavity_classifier.classify(
                    context,
                    candidate_detection,
                    opening_detection,
                )
                if cavity_classification.status is DetailedMoldAnalysisStatus.BLOCKED:
                    internal_accessibility = _blocked_accessibility()
                    internal_access_directions = _blocked_access_directions()
                    internal_undercut_analysis = _blocked_undercut_analysis()
                    core_trapping_risk = _blocked_trapping_risk()
                    preliminary_core_strategy = _blocked_core_strategy()
                    cavity_analysis_decision = _blocked_decision()
                else:
                    internal_accessibility = self.accessibility_analyzer.analyze(
                        context,
                        opening_detection,
                        cavity_classification,
                    )
                    internal_access_directions = (
                        self.access_direction_generator.generate(
                            context,
                            opening_detection,
                            cavity_classification,
                            internal_accessibility,
                        )
                    )
                    if (
                        internal_access_directions.status
                        is DetailedMoldAnalysisStatus.BLOCKED
                    ):
                        internal_undercut_analysis = _blocked_undercut_analysis()
                        core_trapping_risk = _blocked_trapping_risk()
                        preliminary_core_strategy = _blocked_core_strategy()
                        cavity_analysis_decision = _blocked_decision()
                    else:
                        internal_undercut_analysis = (
                            self.internal_undercut_analyzer.analyze(
                                context,
                                candidate_detection,
                                opening_detection,
                                internal_access_directions,
                            )
                        )
                        core_trapping_risk = self.core_trapping_risk_analyzer.analyze(
                            context,
                            candidate_detection,
                            opening_detection,
                            cavity_classification,
                            internal_accessibility,
                            internal_access_directions,
                            internal_undercut_analysis,
                        )
                        preliminary_core_strategy = (
                            self.core_strategy_synthesizer.synthesize(
                                context,
                                candidate_detection,
                                opening_detection,
                                cavity_classification,
                                internal_accessibility,
                                internal_access_directions,
                                internal_undercut_analysis,
                                core_trapping_risk,
                            )
                        )
                        cavity_analysis_decision = (
                            self.cavity_analysis_decision_maker.decide(
                                context,
                                assessment,
                                candidate_detection,
                                opening_detection,
                                cavity_classification,
                                internal_accessibility,
                                internal_access_directions,
                                internal_undercut_analysis,
                                core_trapping_risk,
                                preliminary_core_strategy,
                            )
                        )

        return CavityAnalysisReport(
            status=_resolve_completed_status(
                candidate_detection.status,
                opening_detection.status,
                cavity_classification.status,
                internal_accessibility.status,
                internal_access_directions.status,
                internal_undercut_analysis.status,
                core_trapping_risk.status,
            ),
            source=import_report.source,
            summary=_combine_summary(
                assessment.summary,
                candidate_detection.summary,
                opening_detection.summary,
                cavity_classification.summary,
                internal_accessibility.summary,
                internal_access_directions.summary,
                internal_undercut_analysis.summary,
                core_trapping_risk.summary,
                preliminary_core_strategy.summary,
                cavity_analysis_decision.summary,
            ),
            chapter_2_status=import_report.status,
            chapter_3_status=detailed_mold_analysis_report.status,
            assessment_outcome=assessment.outcome,
            processing_decision=processing_decision,
            findings=_merge_findings(
                assessment.findings,
                candidate_detection.findings,
                opening_detection.findings,
                cavity_classification.findings,
                internal_accessibility.findings,
                internal_access_directions.findings,
                internal_undercut_analysis.findings,
                core_trapping_risk.findings,
                preliminary_core_strategy.findings,
                cavity_analysis_decision.findings,
            ),
            candidate_detection=candidate_detection,
            opening_detection=opening_detection,
            cavity_classification=cavity_classification,
            internal_accessibility=internal_accessibility,
            internal_access_directions=internal_access_directions,
            internal_undercut_analysis=internal_undercut_analysis,
            core_trapping_risk=core_trapping_risk,
            preliminary_core_strategy=preliminary_core_strategy,
            cavity_analysis_decision=cavity_analysis_decision,
            upstream_preliminary_moldability_status=(
                assessment.upstream_preliminary_moldability_status
            ),
            upstream_core_or_insert_indication=(
                assessment.upstream_core_or_insert_indication
            ),
        )


def _blockers_from_issues(
    issues: tuple[ModelIssue, ...],
) -> tuple[CavityAnalysisBlocker, ...]:
    if not issues:
        return (
            CavityAnalysisBlocker(
                code="processing_not_allowed",
                message=(
                    "Chapter 2 marked the model as not processable for cavity analysis."
                ),
            ),
        )

    return tuple(
        CavityAnalysisBlocker(
            code=issue.code,
            message=issue.message,
            metadata={
                "source": issue.source.value,
                "severity": (None if issue.severity is None else issue.severity.value),
            },
        )
        for issue in issues
    )


def _blockers_from_detailed_report(
    detailed_mold_analysis_report: DetailedMoldAnalysisReport,
) -> tuple[CavityAnalysisBlocker, ...]:
    if detailed_mold_analysis_report.blockers:
        return tuple(
            _blocker_from_detailed_blocker(blocker)
            for blocker in detailed_mold_analysis_report.blockers
        )

    return (
        CavityAnalysisBlocker(
            code=CavityFindingCode.CHAPTER_3_REPORT_NOT_AVAILABLE.value,
            message=(
                "Chapter 3 did not produce a consumable report for cavity analysis."
            ),
            metadata={
                "chapter_3_status": detailed_mold_analysis_report.status.value,
                "source": CavityFindingSource.DETAILED_MOLD_ANALYSIS.value,
                "severity": IssueSeverity.WARNING.value,
            },
        ),
    )


def _blocker_from_detailed_blocker(
    blocker: DetailedMoldAnalysisBlocker,
) -> CavityAnalysisBlocker:
    metadata = {"source_engine": "detailed_mold_analysis"}
    metadata.update(blocker.metadata)
    return CavityAnalysisBlocker(
        code=blocker.code,
        message=blocker.message,
        metadata=metadata,
    )


def _resolve_completed_status(
    *module_statuses: DetailedMoldAnalysisStatus,
) -> DetailedMoldAnalysisStatus:
    partial_statuses = {
        DetailedMoldAnalysisStatus.PARTIAL,
        DetailedMoldAnalysisStatus.BLOCKED,
        DetailedMoldAnalysisStatus.FAILED,
    }
    if any(module_status in partial_statuses for module_status in module_statuses):
        return DetailedMoldAnalysisStatus.PARTIAL

    return DetailedMoldAnalysisStatus.COMPLETED


def _combine_summary(
    *summaries: str,
) -> str:
    unique_summaries: list[str] = []
    for summary in summaries:
        if summary in unique_summaries:
            continue
        unique_summaries.append(summary)

    if not unique_summaries:
        return ""

    return " ".join(unique_summaries)


def _blocked_opening_detection() -> CavityOpeningDetectionResult:
    return CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        outcome=CavityOpeningDetectionOutcome.BLOCKED,
        summary="Opening detection was blocked by upstream cavity candidate detection.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                source=CavityFindingSource.CAVITY_OPENING_DETECTOR,
                severity=IssueSeverity.WARNING,
                message=(
                    "Opening detection did not run because candidate detection was "
                    "blocked."
                ),
                is_blocking=True,
            ),
        ),
    )


def _blocked_classification() -> CavityClassificationResult:
    return CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        summary="Cavity classification was blocked by upstream analysis.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                source=CavityFindingSource.CAVITY_CLASSIFIER,
                severity=IssueSeverity.WARNING,
                message="Cavity classification did not run because upstream analysis was blocked.",
                is_blocking=True,
            ),
        ),
    )


def _blocked_accessibility() -> InternalAccessibilityAnalysisResult:
    return InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        summary="Internal accessibility analysis was blocked by upstream analysis.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                source=CavityFindingSource.INTERNAL_ACCESSIBILITY_ANALYZER,
                severity=IssueSeverity.WARNING,
                message=(
                    "Internal accessibility did not run because upstream analysis "
                    "was blocked."
                ),
                is_blocking=True,
            ),
        ),
    )


def _blocked_access_directions() -> InternalAccessDirectionGenerationResult:
    return InternalAccessDirectionGenerationResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        outcome=InternalAccessDirectionGenerationOutcome.NOT_ASSESSABLE,
        summary="Internal access direction generation was blocked by upstream analysis.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                source=CavityFindingSource.INTERNAL_ACCESS_DIRECTION_GENERATOR,
                severity=IssueSeverity.WARNING,
                message=(
                    "Internal access direction generation did not run because "
                    "upstream analysis was blocked."
                ),
                is_blocking=True,
            ),
        ),
    )


def _blocked_undercut_analysis() -> InternalUndercutAnalysisResult:
    return InternalUndercutAnalysisResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        outcome=InternalUndercutAnalysisOutcome.NOT_ASSESSABLE,
        summary="Internal undercut analysis was blocked by upstream analysis.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                source=CavityFindingSource.INTERNAL_UNDERCUT_ANALYZER,
                severity=IssueSeverity.WARNING,
                message=(
                    "Internal undercut analysis did not run because upstream "
                    "analysis was blocked."
                ),
                is_blocking=True,
            ),
        ),
    )


def _blocked_trapping_risk() -> CoreTrappingRiskAnalysisResult:
    return CoreTrappingRiskAnalysisResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        summary="Core trapping risk assessment was blocked by upstream analysis.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                source=CavityFindingSource.CORE_TRAPPING_RISK_ANALYZER,
                severity=IssueSeverity.WARNING,
                message=(
                    "Core trapping risk assessment did not run because upstream "
                    "analysis was blocked."
                ),
                is_blocking=True,
                metadata={"risk_outcome": CoreTrappingRiskOutcome.NOT_ASSESSABLE.value},
            ),
        ),
    )


def _blocked_core_strategy() -> PreliminaryCoreStrategyAssessment:
    return PreliminaryCoreStrategyAssessment(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        summary="Preliminary core strategy synthesis was blocked by upstream analysis.",
        findings=(
            CavityFinding(
                code=CavityFindingCode.UPSTREAM_RESULT_MISSING,
                source=CavityFindingSource.CORE_STRATEGY_SYNTHESIZER,
                severity=IssueSeverity.WARNING,
                message=(
                    "Preliminary core strategy synthesis did not run because "
                    "upstream analysis was blocked."
                ),
                is_blocking=True,
            ),
        ),
    )


def _blocked_decision() -> CavityAnalysisDecision:
    return CavityAnalysisDecision(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        outcome=CavityAnalysisDecisionOutcome.NOT_ASSESSABLE,
        summary="Final cavity analysis decision was blocked by upstream analysis.",
        finding_codes=(CavityFindingCode.UPSTREAM_RESULT_MISSING,),
        findings=(
            CavityFinding(
                code=CavityFindingCode.UPSTREAM_RESULT_MISSING,
                source=CavityFindingSource.CAVITY_ANALYSIS_DECISION_MAKER,
                severity=IssueSeverity.WARNING,
                message=(
                    "Final cavity analysis decision did not run because upstream "
                    "analysis was blocked."
                ),
                is_blocking=True,
            ),
        ),
    )


def _merge_findings(
    *finding_groups: tuple[CavityFinding, ...],
) -> tuple[CavityFinding, ...]:
    merged_findings: dict[tuple[object, ...], CavityFinding] = {}

    for finding_group in finding_groups:
        for finding in finding_group:
            metadata_key = tuple(
                sorted((key, repr(value)) for key, value in finding.metadata.items())
            )
            merged_findings[
                (
                    finding.code,
                    finding.source,
                    finding.severity,
                    finding.message,
                    finding.is_blocking,
                    metadata_key,
                )
            ] = finding

    return tuple(
        sorted(
            merged_findings.values(),
            key=_finding_sort_key,
        )
    )


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
