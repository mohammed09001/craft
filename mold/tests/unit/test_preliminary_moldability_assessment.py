from __future__ import annotations

from pathlib import Path

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    DraftAnalysisResult,
    DraftAnalysisSummary,
    ManufacturabilityRisk,
    MoldabilityActionIndication,
    MoldabilityFindingCode,
    MoldabilityStatus,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionRankingScoreBreakdown,
    PullDirectionSource,
    PullDirectionSourceReference,
    RankedPullDirectionEvaluation,
    UndercutAnalysisOutcome,
    UndercutAnalysisResult,
    UndercutRiskAssessmentResult,
    UndercutRiskAssessmentWarning,
    UndercutRiskAssessmentWarningCode,
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
    UndercutRegionAnalysis,
    UndercutRegionAnalysisWarning,
    UndercutRegionAnalysisWarningCode,
    UndercutRegionComplexity,
    UndercutRegionRiskAssessment,
)
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReport,
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.moldability_decision import (
    DefaultPreliminaryMoldabilityDecider,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.moldability_summary import (
    DefaultMoldabilityEvidenceSummarizer,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)

_DEFAULT = object()


def _build_model() -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=10.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=10.0, z=0.0),
        Vertex(x=0.0, y=0.0, z=10.0),
    ]
    return ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=3, vertex_3=1),
        ],
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0),
            maximum=Vertex(x=10.0, y=10.0, z=10.0),
        ),
        dimensions=Dimensions(x=10.0, y=10.0, z=10.0),
        warnings=[],
        metadata={},
    )


def _build_context() -> DetailedMoldAnalysisContext:
    model = _build_model()
    report = ImportAnalysisReport(
        status=ImportAnalysisReportStatus.READY,
        source=ImportAnalysisSource(
            source_name=model.source_name,
            source_path=str(model.source_path),
            file_format=model.file_format.value,
        ),
        import_succeeded=True,
        analysis_completed=True,
        summary="ready",
        issue_counts=IssueSeverityCounts(),
        processing_decision=ModelProcessingDecision(
            status=ModelProcessingStatus.READY,
            issue_counts=IssueSeverityCounts(),
        ),
    )
    return DetailedMoldAnalysisContext.from_report(report, model)


def _selection(
    *,
    status: PreliminaryPullDirectionSelectionStatus = (
        PreliminaryPullDirectionSelectionStatus.SELECTED
    ),
    decisiveness: PreliminaryPullDirectionSelectionDecisiveness | None = (
        PreliminaryPullDirectionSelectionDecisiveness.CLEAR
    ),
    with_candidate: bool = True,
) -> PreliminaryPullDirectionSelection:
    candidate = None
    ranked_evaluations = ()
    selected_evaluation = None

    if with_candidate:
        candidate = PullDirectionCandidate(
            candidate_id="axis:z",
            order_index=0,
            direction=Vector3D(0.0, 0.0, 1.0),
            source=PullDirectionSource.GLOBAL_AXIS,
            source_references=(
                PullDirectionSourceReference(source=PullDirectionSource.GLOBAL_AXIS),
            ),
        )
        evaluation = CandidatePullDirectionEvaluation(
            candidate=candidate,
            aggregate_metrics=PullDirectionAggregateMetrics(
                analyzed_face_count=1,
                ignored_face_count=0,
                total_analyzed_area_sq_mm=1.0,
                positive_side_area_sq_mm=1.0,
                negative_side_area_sq_mm=0.0,
                neutral_area_sq_mm=0.0,
                positive_side_area_ratio=1.0,
                negative_side_area_ratio=0.0,
                neutral_area_ratio=0.0,
                low_draft_area_sq_mm=0.0,
                low_draft_area_ratio=0.0,
                area_weighted_mean_draft_angle_degrees=45.0,
                minimum_observed_draft_angle_degrees=45.0,
                faces_meeting_recommended_draft_count=1,
            ),
            engineering_score=90.0,
            is_evaluable=True,
        )
        ranked = RankedPullDirectionEvaluation(
            evaluation=evaluation,
            rank=1,
            preliminary_score=90.0,
            score_breakdown=PullDirectionRankingScoreBreakdown(
                engineering_score=90.0,
                low_draft_area_ratio=0.0,
                area_weighted_mean_draft_angle_degrees=45.0,
                total_analyzed_area_sq_mm=1.0,
                warning_count=0,
            ),
            score_delta_from_top=0.0,
            score_delta_from_previous=None,
            is_engineering_tie_with_top=False,
            is_near_tie_with_top=False,
            shares_axis_with_top=True,
            axis_equivalence_key=(0, 0, 1),
        )
        ranked_evaluations = (ranked,)
        selected_evaluation = ranked if status is not PreliminaryPullDirectionSelectionStatus.UNAVAILABLE else None

    return PreliminaryPullDirectionSelection(
        status=status,
        ranked_evaluations=ranked_evaluations,
        selected_evaluation=selected_evaluation,
        decisiveness=decisiveness,
    )


def _undercut_analysis(
    *,
    evaluable: bool = True,
    outcome: UndercutAnalysisOutcome = UndercutAnalysisOutcome.CLEAR,
) -> UndercutAnalysisResult:
    return UndercutAnalysisResult(
        selected_pull_direction=_selection().selected_candidate,
        is_evaluable=evaluable,
        outcome=outcome,
    )


def _draft_analysis(
    *,
    available: bool = True,
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
) -> DraftAnalysisResult | None:
    if not available:
        return None

    return DraftAnalysisResult(
        status=status,
        selected_pull_direction=_selection().selected_candidate,
        is_evaluable=True,
        summary=DraftAnalysisSummary(
            total_face_count=2,
            evaluated_face_count=2,
            unevaluable_face_count=0,
            total_surface_area_sq_mm=10.0,
            evaluated_surface_area_sq_mm=10.0,
            draft_relevant_area_sq_mm=10.0,
            pull_facing_area_sq_mm=0.0,
            near_zero_draft_area_sq_mm=0.0,
            sufficient_draft_area_sq_mm=10.0,
            insufficient_draft_area_sq_mm=0.0,
            ambiguous_area_sq_mm=0.0,
        ),
    )


def _region_analysis(
    *,
    evaluable: bool = True,
    region_count: int = 0,
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
    warnings: tuple[UndercutRegionAnalysisWarning, ...] = (),
    open_boundaries: int = 0,
    non_manifold: int = 0,
) -> UndercutRegionAnalysis | None:
    if not evaluable:
        return UndercutRegionAnalysis(
            status=DetailedMoldAnalysisStatus.BLOCKED,
            selected_pull_direction=_selection().selected_candidate,
            is_evaluable=False,
            warnings=warnings,
        )

    return UndercutRegionAnalysis(
        status=status,
        selected_pull_direction=_selection().selected_candidate,
        is_evaluable=True,
        regions=(),
        region_count=region_count,
        confirmed_face_count=region_count,
        regions_touching_open_boundaries_count=open_boundaries,
        regions_touching_non_manifold_count=non_manifold,
        warnings=warnings,
    )


def _risk_assessment(
    *,
    evaluable: bool = True,
    assessed_region_count: int = 0,
    highest_severity: UndercutRiskSeverity | None = None,
    highest_treatment_requirement: UndercutTreatmentRequirement | None = None,
    manual_review_region_count: int = 0,
    blocking_region_count: int = 0,
    high_risk_region_count: int = 0,
    critical_risk_region_count: int = 0,
    warnings: tuple[UndercutRiskAssessmentWarning, ...] = (),
) -> UndercutRiskAssessmentResult | None:
    if not evaluable:
        return None

    region_assessments = ()
    if highest_severity is not None or highest_treatment_requirement is not None:
        region_assessments = (
            UndercutRegionRiskAssessment(
                region_id="undercut-region-0001",
                severity=highest_severity or UndercutRiskSeverity.LOW,
                complexity=UndercutRegionComplexity.MODERATE,
                treatment_requirement=(
                    highest_treatment_requirement
                    or UndercutTreatmentRequirement.NO_SPECIAL_ACTION
                ),
                risk_score=4,
                complexity_score=3,
                face_count=1,
                total_area_sq_mm=10.0,
                area_ratio=0.1,
                axial_extent_mm=1.0,
                maximum_lateral_extent_mm=3.0,
                boundary_edge_count=4,
                blocked_sample_ratio=1.0,
                confidence=1.0,
                requires_manual_review=manual_review_region_count > 0,
            ),
        )

    severity_counts: dict[UndercutRiskSeverity, int] = {}
    if highest_severity is not None:
        severity_counts[highest_severity] = max(1, assessed_region_count)
    if high_risk_region_count > 0:
        severity_counts[UndercutRiskSeverity.HIGH] = high_risk_region_count
    if critical_risk_region_count > 0:
        severity_counts[UndercutRiskSeverity.CRITICAL] = critical_risk_region_count

    return UndercutRiskAssessmentResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        selected_pull_direction=_selection().selected_candidate,
        is_evaluable=True,
        region_assessments=region_assessments,
        assessed_region_count=assessed_region_count,
        highest_severity=highest_severity,
        highest_complexity=(
            UndercutRegionComplexity.MODERATE if assessed_region_count else None
        ),
        overall_treatment_requirement=highest_treatment_requirement,
        severity_counts=severity_counts,
        treatment_counts=(
            {}
            if highest_treatment_requirement is None
            else {highest_treatment_requirement: max(1, assessed_region_count)}
        ),
        manual_review_region_count=manual_review_region_count,
        blocking_region_count=blocking_region_count,
        warnings=warnings,
    )


def _evaluate(
    *,
    selection: PreliminaryPullDirectionSelection | None = None,
    undercut_analysis: UndercutAnalysisResult | None | object = _DEFAULT,
    draft_analysis: DraftAnalysisResult | None | object = _DEFAULT,
    region_analysis: UndercutRegionAnalysis | None | object = _DEFAULT,
    risk_assessment: UndercutRiskAssessmentResult | None | object = _DEFAULT,
):
    context = _build_context()
    summarizer = DefaultMoldabilityEvidenceSummarizer()
    decider = DefaultPreliminaryMoldabilityDecider()
    summary = summarizer.summarize(
        context,
        _selection() if selection is None else selection,
        _undercut_analysis() if undercut_analysis is _DEFAULT else undercut_analysis,
        _draft_analysis() if draft_analysis is _DEFAULT else draft_analysis,
        _region_analysis() if region_analysis is _DEFAULT else region_analysis,
        _risk_assessment() if risk_assessment is _DEFAULT else risk_assessment,
    )
    assessment = decider.decide(summary)
    return (context, summary, assessment)


def test_low_risk_model_without_confirmed_undercuts_is_simple_mold_candidate() -> None:
    _, summary, assessment = _evaluate(
        region_analysis=_region_analysis(region_count=0),
        risk_assessment=_risk_assessment(assessed_region_count=0),
    )

    assert summary.is_assessable is True
    assert assessment.status is MoldabilityStatus.SIMPLE_MOLD_POSSIBLE
    assert assessment.overall_risk is ManufacturabilityRisk.LOW
    assert assessment.side_action_indication is MoldabilityActionIndication.NOT_INDICATED
    assert assessment.direct_generation_blocked is False
    assert assessment.blocking_reasons == ()


def test_side_action_evidence_becomes_additional_actions_likely() -> None:
    _, _, assessment = _evaluate(
        region_analysis=_region_analysis(region_count=1),
        risk_assessment=_risk_assessment(
            assessed_region_count=1,
            highest_severity=UndercutRiskSeverity.MEDIUM,
            highest_treatment_requirement=(
                UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED
            ),
        ),
    )

    assert assessment.status is MoldabilityStatus.ADDITIONAL_ACTIONS_LIKELY
    assert assessment.side_action_indication is MoldabilityActionIndication.LIKELY
    assert MoldabilityFindingCode.SIDE_ACTION_TREATMENT_INDICATED in {
        reason.code for reason in assessment.reasons
    }


def test_high_risk_evidence_requires_manual_review() -> None:
    _, _, assessment = _evaluate(
        region_analysis=_region_analysis(region_count=1),
        risk_assessment=_risk_assessment(
            assessed_region_count=1,
            highest_severity=UndercutRiskSeverity.HIGH,
            highest_treatment_requirement=(
                UndercutTreatmentRequirement.LOCAL_PARTING_REVIEW_REQUIRED
            ),
            high_risk_region_count=1,
        ),
    )

    assert assessment.status is MoldabilityStatus.MANUAL_REVIEW_REQUIRED
    assert assessment.overall_risk is ManufacturabilityRisk.HIGH
    assert assessment.manual_review_required is True


def test_critical_or_blocking_risk_blocks_direct_generation() -> None:
    _, _, assessment = _evaluate(
        region_analysis=_region_analysis(region_count=1),
        risk_assessment=_risk_assessment(
            assessed_region_count=1,
            highest_severity=UndercutRiskSeverity.CRITICAL,
            highest_treatment_requirement=(
                UndercutTreatmentRequirement.BLOCKING_UNDERCUT_RISK
            ),
            blocking_region_count=1,
            critical_risk_region_count=1,
        ),
    )

    assert assessment.status is MoldabilityStatus.BLOCKED_FOR_DIRECT_GENERATION
    assert assessment.direct_generation_blocked is True
    assert any(reason.is_blocking for reason in assessment.blocking_reasons)


def test_missing_pull_direction_or_risk_assessment_is_not_assessable() -> None:
    _, summary, assessment = _evaluate(
        selection=_selection(
            status=PreliminaryPullDirectionSelectionStatus.UNAVAILABLE,
            decisiveness=None,
            with_candidate=False,
        ),
        risk_assessment=None,
    )

    assert summary.is_assessable is False
    assert assessment.status is MoldabilityStatus.NOT_ASSESSABLE
    assert MoldabilityFindingCode.SELECTED_PULL_DIRECTION_UNAVAILABLE in {
        reason.code for reason in assessment.reasons
    }


def test_ambiguous_or_low_confidence_pull_direction_forces_manual_review() -> None:
    _, _, assessment = _evaluate(
        selection=_selection(
            status=PreliminaryPullDirectionSelectionStatus.AMBIGUOUS,
            decisiveness=PreliminaryPullDirectionSelectionDecisiveness.CLOSE,
        ),
        region_analysis=_region_analysis(
            region_count=0,
            status=DetailedMoldAnalysisStatus.PARTIAL,
            warnings=(
                UndercutRegionAnalysisWarning(
                    code=UndercutRegionAnalysisWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION,
                    message="ambiguous",
                ),
            ),
        ),
        risk_assessment=_risk_assessment(assessed_region_count=0),
    )

    assert assessment.status is MoldabilityStatus.MANUAL_REVIEW_REQUIRED
    assert assessment.simple_mold_possible is False
    assert MoldabilityFindingCode.SELECTED_PULL_DIRECTION_AMBIGUOUS in {
        reason.code for reason in assessment.reasons
    }


def test_draft_unavailable_does_not_crash_and_core_remains_not_assessed() -> None:
    _, summary, assessment = _evaluate(
        draft_analysis=None,
        region_analysis=_region_analysis(region_count=0),
        risk_assessment=_risk_assessment(assessed_region_count=0),
    )

    assert summary.draft_analysis_available is False
    assert assessment.status is MoldabilityStatus.ADDITIONAL_ACTIONS_LIKELY
    assert assessment.core_or_insert_indication is (
        MoldabilityActionIndication.NOT_ASSESSED
    )
    assert MoldabilityFindingCode.DRAFT_ANALYSIS_UNAVAILABLE in {
        reason.code for reason in assessment.reasons
    }


def test_noncritical_info_findings_do_not_become_blocking_and_reasons_are_stable() -> None:
    first = _evaluate(
        region_analysis=_region_analysis(region_count=0),
        risk_assessment=_risk_assessment(assessed_region_count=0),
    )[2]
    second = _evaluate(
        region_analysis=_region_analysis(region_count=0),
        risk_assessment=_risk_assessment(assessed_region_count=0),
    )[2]

    assert first.blocking_reasons == ()
    assert tuple(reason.code for reason in first.reasons) == tuple(
        reason.code for reason in second.reasons
    )


def test_report_to_dict_serializes_preliminary_moldability_assessment() -> None:
    context, _, assessment = _evaluate(
        region_analysis=_region_analysis(region_count=0),
        risk_assessment=_risk_assessment(assessed_region_count=0),
    )
    report = DetailedMoldAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=context.source,
        summary="ok",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        preliminary_moldability_assessment=assessment,
    )

    serialized = report.to_dict()

    assert serialized["preliminary_moldability_assessment"]["status"] == (
        "simple_mold_possible"
    )
    assert serialized["preliminary_moldability_assessment"]["evidence_summary"][
        "findings"
    ]
