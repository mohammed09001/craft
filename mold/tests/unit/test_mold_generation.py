from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from mold_generator_engine import (
    DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER,
    MOLD_GENERATION_REPORT_SCHEMA_VERSION,
    CandidatePullDirectionEvaluation,
    CavityAnalysisDecision,
    CavityAnalysisDecisionOutcome,
    CavityAnalysisReport,
    CavityAssessmentOutcome,
    CavityCoreStrategyAssessment,
    CavityCoreStrategyOutcome,
    ConservativeGlobalMoldGenerationValidator,
    ConservativeMoldBlockPlanner,
    ConservativeMoldComponentPlanValidator,
    ConservativeMoldEnvelopePlanner,
    ConservativeMoldGenerationPlanner,
    ConservativePartingSurfaceValidator,
    CoreCavitySidePlan,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    DraftAnalysisResult,
    DraftAnalysisSummary,
    FinalMoldGenerationDecision,
    FinalMoldGenerationDecisionStatus,
    GlobalMoldGenerationValidationResult,
    ImportAnalysisReport,
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
    InitialPartingSurfacePlan,
    InitialPartingSurfacePlanStatus,
    InitialPartingSurfaceType,
    InsertPlan,
    InsertPlanPurpose,
    ManufacturabilityRisk,
    MoldabilityActionIndication,
    MoldabilityEvidenceQuality,
    MoldabilityStatus,
    MoldBlockPlan,
    MoldComponentPlanningResult,
    MoldComponentPlanningStatus,
    MoldComponentPlanValidationResult,
    MoldComponentSide,
    MoldEnvelopePlan,
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationFinding,
    MoldGenerationFindingCode,
    MoldGenerationFindingSource,
    MoldGenerationNextCapability,
    MoldGenerationPlanner,
    MoldGenerationReport,
    MoldGenerationService,
    MoldGenerationTraceability,
    MoldSpecialRegionKind,
    MoldSpecialRegionPlan,
    PartingStrategyEvaluationStatus,
    PartingStrategyType,
    PartingSurfaceRefinementResult,
    PartingSurfaceRefinementStatus,
    PartingSurfaceValidationResult,
    PartingSurfaceValidationStatus,
    PlanarPatchPartingSurfaceGenerator,
    PreliminaryCoreCavityPlan,
    PreliminaryCoreStrategyAssessment,
    PreliminaryMoldabilityAssessment,
    PreliminaryMoldGenerationMode,
    PreliminaryMoldGenerationPlan,
    PreliminaryPartingStrategySelectionStatus,
    PreliminaryPartingSurface,
    PreliminaryPartingSurfacePatch,
    PreliminaryPartingSurfaceStatus,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionRankingScoreBreakdown,
    PullDirectionSource,
    PullDirectionSourceReference,
    RankedPullDirectionEvaluation,
    ReliefPlan,
    ReliefPlanPurpose,
    SafeInitialPartingSurfaceRefiner,
    SupportPlan,
    SupportPlanPurpose,
    UndercutAnalysisOutcome,
    UndercutAnalysisResult,
    UndercutRiskAssessmentResult,
    Vector3D,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


class FakePlanner:
    def __init__(self) -> None:
        self.call_count = 0

    def plan(
        self,
        context: MoldGenerationContext,
    ) -> PreliminaryMoldGenerationPlan:
        self.call_count += 1
        return PreliminaryMoldGenerationPlan(
            disposition=MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED,
            generation_mode=PreliminaryMoldGenerationMode.UNSUPPORTED_CANDIDATE,
            required_next_capabilities=(
                MoldGenerationNextCapability.MANUAL_ENGINEERING_REVIEW,
            ),
            reasons=(
                MoldGenerationFinding(
                    code=(MoldGenerationFindingCode.CHAPTER_4_MANUAL_REVIEW_REQUIRED),
                    source=MoldGenerationFindingSource.CAVITY_ANALYSIS,
                    severity=IssueSeverity.WARNING,
                    message=f"fake planner reviewed {context.source.source_name}.",
                ),
            ),
            traceability=MoldGenerationTraceability(
                source_name=context.source.source_name,
                chapter_2_status=context.import_report.status,
                chapter_3_status=context.detailed_mold_analysis_report.status,
                chapter_4_status=context.cavity_analysis_report.status,
            ),
        )


class FakePartingSurfaceGenerator:
    def __init__(self) -> None:
        self.call_count = 0

    def generate(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
    ) -> PreliminaryPartingSurface:
        self.call_count += 1
        assert context.source.source_name == "sample.stl"
        return PreliminaryPartingSurface(
            status=PreliminaryPartingSurfaceStatus.BLOCKED,
            patches=(),
            source_plan_status=surface_plan.status,
            source_strategy_id=surface_plan.selected_strategy_id,
            reasons=(
                MoldGenerationFinding(
                    code=MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                    source=MoldGenerationFindingSource.MOLD_GENERATION_PLANNER,
                    severity=IssueSeverity.ERROR,
                    message="fake generator blocked",
                    is_blocking=True,
                ),
            ),
        )


class FakePartingSurfaceValidator:
    def __init__(self) -> None:
        self.call_count = 0

    def validate(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
        surface: PreliminaryPartingSurface | None,
    ) -> PartingSurfaceValidationResult:
        self.call_count += 1
        assert context.model.source_name == "sample.stl"
        assert surface_plan is not None
        assert surface is not None
        return PartingSurfaceValidationResult(
            status=PartingSurfaceValidationStatus.BLOCKED,
            findings=surface.reasons,
            manual_review_required=True,
            direct_progression_blocked=True,
        )


class FakePartingSurfaceRefiner:
    def __init__(self) -> None:
        self.call_count = 0

    def refine(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
        surface: PreliminaryPartingSurface | None,
        validation: PartingSurfaceValidationResult,
    ) -> PartingSurfaceRefinementResult:
        self.call_count += 1
        assert context.processing_decision is not None
        assert surface_plan is not None
        return PartingSurfaceRefinementResult(
            status=PartingSurfaceRefinementStatus.BLOCKED,
            refinement_applied=False,
            actions=(),
            reasons=validation.findings,
            unresolved_findings=validation.findings,
        )


def _build_model(*, source_name: str = "sample.stl") -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=10.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=10.0, z=0.0),
        Vertex(x=0.0, y=0.0, z=10.0),
    ]
    return ImportedModel(
        source_path=Path(f"models/{source_name}"),
        source_name=source_name,
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=3, vertex_3=1),
            Face(vertex_1=0, vertex_2=2, vertex_3=3),
            Face(vertex_1=1, vertex_2=3, vertex_3=2),
        ],
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0),
            maximum=Vertex(x=10.0, y=10.0, z=10.0),
        ),
        dimensions=Dimensions(x=10.0, y=10.0, z=10.0),
        warnings=[],
        metadata={"fixture": source_name},
    )


def _build_degenerate_model(*, source_name: str = "sample.stl") -> ImportedModel:
    vertex = Vertex(x=0.0, y=0.0, z=0.0)
    return ImportedModel(
        source_path=Path(f"models/{source_name}"),
        source_name=source_name,
        file_format=ModelFormat.STL,
        vertices=[vertex, vertex, vertex],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
        bounding_box=BoundingBox(minimum=vertex, maximum=vertex),
        dimensions=Dimensions(x=0.0, y=0.0, z=0.0),
        warnings=[],
        metadata={"fixture": "degenerate"},
    )


def _build_processing_decision(
    status: ModelProcessingStatus = ModelProcessingStatus.READY,
) -> ModelProcessingDecision:
    return ModelProcessingDecision(
        status=status,
        issue_counts=IssueSeverityCounts(),
    )


def _build_import_report(
    *,
    source_name: str = "sample.stl",
    processing_decision: ModelProcessingDecision | None = None,
) -> ImportAnalysisReport:
    if processing_decision is None:
        processing_decision = _build_processing_decision()

    return ImportAnalysisReport(
        status=ImportAnalysisReportStatus.READY,
        source=ImportAnalysisSource(
            source_name=source_name,
            source_path=f"models/{source_name}",
            file_format="stl",
        ),
        import_succeeded=True,
        analysis_completed=True,
        summary="Chapter 2 fixture report.",
        issue_counts=IssueSeverityCounts(),
        processing_decision=processing_decision,
    )


def _build_preliminary_moldability(
    *,
    status: MoldabilityStatus = MoldabilityStatus.SIMPLE_MOLD_POSSIBLE,
    manual_review_required: bool = False,
    direct_generation_blocked: bool = False,
    ambiguity_detected: bool = False,
) -> PreliminaryMoldabilityAssessment:
    return PreliminaryMoldabilityAssessment(
        status=status,
        is_assessable=status is not MoldabilityStatus.NOT_ASSESSABLE,
        overall_risk=ManufacturabilityRisk.LOW,
        simple_mold_possible=status is MoldabilityStatus.SIMPLE_MOLD_POSSIBLE,
        side_action_indication=MoldabilityActionIndication.NOT_INDICATED,
        core_or_insert_indication=MoldabilityActionIndication.NOT_ASSESSED,
        manual_review_required=manual_review_required,
        direct_generation_blocked=direct_generation_blocked,
        ambiguity_detected=ambiguity_detected,
        evidence_quality=MoldabilityEvidenceQuality.HIGH,
        summary="Chapter 3 preliminary moldability fixture.",
    )


def _build_pull_direction_selection(
    *,
    status: PreliminaryPullDirectionSelectionStatus = (
        PreliminaryPullDirectionSelectionStatus.SELECTED
    ),
    decisiveness: PreliminaryPullDirectionSelectionDecisiveness | None = (
        PreliminaryPullDirectionSelectionDecisiveness.CLEAR
    ),
    direction: Vector3D | None = None,
) -> PreliminaryPullDirectionSelection:
    if direction is None:
        direction = Vector3D(0.0, 0.0, 1.0)

    candidate = PullDirectionCandidate(
        candidate_id="axis:z",
        order_index=0,
        direction=direction,
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
            total_analyzed_area_sq_mm=100.0,
            positive_side_area_sq_mm=50.0,
            negative_side_area_sq_mm=50.0,
            neutral_area_sq_mm=0.0,
            positive_side_area_ratio=0.5,
            negative_side_area_ratio=0.5,
            neutral_area_ratio=0.0,
            low_draft_area_sq_mm=0.0,
            low_draft_area_ratio=0.0,
            area_weighted_mean_draft_angle_degrees=30.0,
            minimum_observed_draft_angle_degrees=10.0,
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
            area_weighted_mean_draft_angle_degrees=30.0,
            total_analyzed_area_sq_mm=100.0,
            warning_count=0,
        ),
        score_delta_from_top=0.0,
        score_delta_from_previous=None,
        is_engineering_tie_with_top=False,
        is_near_tie_with_top=False,
        shares_axis_with_top=True,
        axis_equivalence_key=(0, 0, 1),
    )
    return PreliminaryPullDirectionSelection(
        status=status,
        ranked_evaluations=(ranked,),
        selected_evaluation=ranked,
        decisiveness=decisiveness,
    )


def _build_draft_analysis() -> DraftAnalysisResult:
    return DraftAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        selected_pull_direction=_build_pull_direction_selection().selected_candidate,
        is_evaluable=True,
        summary=DraftAnalysisSummary(
            total_face_count=4,
            evaluated_face_count=4,
            unevaluable_face_count=0,
            total_surface_area_sq_mm=100.0,
            evaluated_surface_area_sq_mm=100.0,
            draft_relevant_area_sq_mm=100.0,
            pull_facing_area_sq_mm=0.0,
            near_zero_draft_area_sq_mm=0.0,
            sufficient_draft_area_sq_mm=100.0,
            insufficient_draft_area_sq_mm=0.0,
            ambiguous_area_sq_mm=0.0,
        ),
    )


def _build_undercut_analysis() -> UndercutAnalysisResult:
    return UndercutAnalysisResult(
        selected_pull_direction=_build_pull_direction_selection().selected_candidate,
        is_evaluable=True,
        outcome=UndercutAnalysisOutcome.CLEAR,
    )


def _build_undercut_risk_assessment() -> UndercutRiskAssessmentResult:
    return UndercutRiskAssessmentResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        selected_pull_direction=_build_pull_direction_selection().selected_candidate,
        is_evaluable=True,
        assessed_region_count=0,
    )


def _build_detailed_report(
    *,
    source_name: str = "sample.stl",
    processing_decision: ModelProcessingDecision | None = None,
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
    preliminary_moldability: PreliminaryMoldabilityAssessment | None = None,
    pull_direction_selection: PreliminaryPullDirectionSelection | None = None,
    draft_analysis: DraftAnalysisResult | None = None,
    undercut_analysis: UndercutAnalysisResult | None = None,
    undercut_risk_assessment: UndercutRiskAssessmentResult | None = None,
) -> DetailedMoldAnalysisReport:
    if processing_decision is None:
        processing_decision = _build_processing_decision()
    if preliminary_moldability is None:
        preliminary_moldability = _build_preliminary_moldability()

    return DetailedMoldAnalysisReport(
        status=status,
        source=ImportAnalysisSource(
            source_name=source_name,
            source_path=f"models/{source_name}",
            file_format="stl",
        ),
        summary="Chapter 3 fixture report.",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        processing_decision=processing_decision,
        preliminary_pull_direction_selection=pull_direction_selection,
        draft_analysis=draft_analysis,
        undercut_analysis=undercut_analysis,
        undercut_risk_assessment=undercut_risk_assessment,
        preliminary_moldability_assessment=preliminary_moldability,
    )


def _build_cavity_decision(
    outcome: CavityAnalysisDecisionOutcome = (
        CavityAnalysisDecisionOutcome.NO_CAVITY_REQUIRING_CORE_STRATEGY
    ),
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
) -> CavityAnalysisDecision:
    return CavityAnalysisDecision(
        status=status,
        outcome=outcome,
        summary="Chapter 4 decision fixture.",
    )


def _build_core_strategy(
    outcome: CavityCoreStrategyOutcome,
) -> PreliminaryCoreStrategyAssessment:
    return PreliminaryCoreStrategyAssessment(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="Chapter 4 preliminary core strategy fixture.",
        assessments=(
            CavityCoreStrategyAssessment(
                target_id="target_001",
                strategy_outcome=outcome,
            ),
        ),
    )


def _build_cavity_report(
    *,
    source_name: str = "sample.stl",
    processing_decision: ModelProcessingDecision | None = None,
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
    chapter_3_status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
    decision: CavityAnalysisDecision | None = None,
    with_decision: bool = True,
    core_strategy: PreliminaryCoreStrategyAssessment | None = None,
) -> CavityAnalysisReport:
    if processing_decision is None:
        processing_decision = _build_processing_decision()
    if with_decision and decision is None:
        decision = _build_cavity_decision()

    return CavityAnalysisReport(
        status=status,
        source=ImportAnalysisSource(
            source_name=source_name,
            source_path=f"models/{source_name}",
            file_format="stl",
        ),
        summary="Chapter 4 fixture report.",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        chapter_3_status=chapter_3_status,
        assessment_outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
        processing_decision=processing_decision,
        preliminary_core_strategy=core_strategy,
        cavity_analysis_decision=decision,
    )


def _build_context(
    *,
    processing_decision: ModelProcessingDecision | None = None,
    detailed_report: DetailedMoldAnalysisReport | None = None,
    cavity_report: CavityAnalysisReport | None = None,
    model: ImportedModel | None = None,
) -> MoldGenerationContext:
    if processing_decision is None:
        processing_decision = _build_processing_decision()

    if model is None:
        model = _build_model()
    import_report = _build_import_report(processing_decision=processing_decision)
    if detailed_report is None:
        detailed_report = _build_detailed_report(
            processing_decision=processing_decision,
        )
    if cavity_report is None:
        cavity_report = _build_cavity_report(
            processing_decision=processing_decision,
            chapter_3_status=detailed_report.status,
        )

    return MoldGenerationContext.from_reports(
        import_report,
        detailed_report,
        cavity_report,
        model,
    )


def _ready_context() -> MoldGenerationContext:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    return _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )


def _ready_surface_report() -> MoldGenerationReport:
    return MoldGenerationService().generate(_ready_context())


def test_context_is_created_from_reports_without_copying_geometry() -> None:
    context = _build_context()

    assert context.model is not None
    assert context.import_report is not None
    assert context.detailed_mold_analysis_report is not None
    assert context.cavity_analysis_report is not None
    assert context.processing_decision is context.import_report.processing_decision


def test_chapter_2_processing_blocker_blocks_generation() -> None:
    processing_decision = _build_processing_decision(
        ModelProcessingStatus.REQUIRES_REPAIR
    )
    context = _build_context(processing_decision=processing_decision)

    plan = ConservativeMoldGenerationPlanner().plan(context)

    assert plan.disposition is MoldGenerationDisposition.BLOCKED
    assert plan.generation_mode is PreliminaryMoldGenerationMode.UNSUPPORTED_CANDIDATE
    assert plan.reasons[0].code is MoldGenerationFindingCode.CHAPTER_2_BLOCKS_PROCESSING


def test_chapter_3_moldability_blocker_blocks_generation() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        preliminary_moldability=_build_preliminary_moldability(
            status=MoldabilityStatus.BLOCKED_FOR_DIRECT_GENERATION,
            direct_generation_blocked=True,
        ),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    report = MoldGenerationService().generate(context)

    assert report.status is MoldGenerationDisposition.BLOCKED
    assert report.preliminary_plan.reasons[0].code is (
        MoldGenerationFindingCode.CHAPTER_3_MOLDABILITY_BLOCKS_GENERATION
    )


def test_chapter_4_blocking_decision_blocks_generation() -> None:
    processing_decision = _build_processing_decision()
    cavity_report = _build_cavity_report(
        processing_decision=processing_decision,
        decision=_build_cavity_decision(
            CavityAnalysisDecisionOutcome.CURRENT_METHOD_BLOCKED
        ),
    )
    context = _build_context(
        processing_decision=processing_decision,
        cavity_report=cavity_report,
    )

    report = MoldGenerationService().generate(context)

    assert report.status is MoldGenerationDisposition.BLOCKED
    assert report.preliminary_plan.reasons[0].code is (
        MoldGenerationFindingCode.CHAPTER_4_DECISION_BLOCKS_GENERATION
    )


def test_manual_review_evidence_remains_manual_review() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        preliminary_moldability=_build_preliminary_moldability(
            status=MoldabilityStatus.MANUAL_REVIEW_REQUIRED,
            manual_review_required=True,
        ),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    plan = DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER.plan(context)

    assert plan.disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
    assert MoldGenerationNextCapability.MANUAL_ENGINEERING_REVIEW in (
        plan.required_next_capabilities
    )


def test_ready_simple_case_advances_only_to_parting_strategy() -> None:
    context = _build_context()

    report = MoldGenerationService().generate(context)

    assert report.status is MoldGenerationDisposition.READY_FOR_PARTING_STRATEGY
    assert report.preliminary_plan.generation_mode is (
        PreliminaryMoldGenerationMode.SIMPLE_TWO_PART_CANDIDATE
    )
    assert report.preliminary_plan.required_next_capabilities == (
        MoldGenerationNextCapability.PARTING_STRATEGY,
    )


def test_parting_strategy_happy_path_selects_and_plans_surface() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    report = MoldGenerationService().generate(context)

    assert len(report.parting_strategy_candidates) == 1
    assert report.parting_strategy_candidates[0].strategy_type is (
        PartingStrategyType.SIMPLE_TWO_PART_PLANAR
    )
    assert report.parting_strategy_evaluations[0].status is (
        PartingStrategyEvaluationStatus.ACCEPTABLE
    )
    assert report.preliminary_parting_strategy_selection is not None
    assert report.preliminary_parting_strategy_selection.status is (
        PreliminaryPartingStrategySelectionStatus.SELECTED
    )
    assert report.initial_parting_surface_plan is not None
    assert report.initial_parting_surface_plan.status is (
        InitialPartingSurfacePlanStatus.PLANNED
    )
    assert report.initial_parting_surface_plan.reference_offset_mm == 5.0


def test_ambiguous_parting_strategy_requires_manual_review() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        preliminary_moldability=_build_preliminary_moldability(
            status=MoldabilityStatus.MANUAL_REVIEW_REQUIRED,
            manual_review_required=True,
            ambiguity_detected=True,
        ),
        pull_direction_selection=_build_pull_direction_selection(
            status=PreliminaryPullDirectionSelectionStatus.AMBIGUOUS,
            decisiveness=PreliminaryPullDirectionSelectionDecisiveness.AMBIGUOUS,
        ),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    report = MoldGenerationService().generate(context)

    assert report.parting_strategy_evaluations[0].requires_manual_review is True
    assert report.preliminary_parting_strategy_selection is not None
    assert report.preliminary_parting_strategy_selection.status is (
        PreliminaryPartingStrategySelectionStatus.MANUAL_REVIEW_REQUIRED
    )
    assert report.initial_parting_surface_plan is not None
    assert report.initial_parting_surface_plan.status is (
        InitialPartingSurfacePlanStatus.MANUAL_REVIEW_REQUIRED
    )


def test_missing_pull_direction_blocks_strategy_and_surface_planning() -> None:
    context = _build_context()

    report = MoldGenerationService().generate(context)

    assert report.parting_strategy_candidates == ()
    assert report.parting_strategy_evaluations == ()
    assert report.preliminary_parting_strategy_selection is not None
    assert report.preliminary_parting_strategy_selection.status is (
        PreliminaryPartingStrategySelectionStatus.BLOCKED
    )
    assert report.initial_parting_surface_plan is not None
    assert report.initial_parting_surface_plan.status is (
        InitialPartingSurfacePlanStatus.BLOCKED
    )


def test_parting_strategy_outputs_are_deterministic() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )
    service = MoldGenerationService()

    first = service.generate(context).to_dict()
    second = service.generate(context).to_dict()

    assert first == second
    assert first["parting_strategy_evaluations"][0]["score"] == 86.0


def test_report_to_dict_serializes_parting_strategy_and_surface_plan() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    serialized = MoldGenerationService().generate(context).to_dict()

    assert serialized["parting_strategy_candidates"][0]["strategy_type"] == (
        "simple_two_part_planar"
    )
    assert serialized["preliminary_parting_strategy_selection"]["status"] == (
        "selected"
    )
    assert serialized["initial_parting_surface_plan"]["surface_type"] == (
        "planar_midplane"
    )


def test_parting_surface_generation_validation_and_acceptance_happy_path() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    report = MoldGenerationService().generate(context)

    assert report.generated_parting_surface is not None
    assert report.generated_parting_surface.status is (
        PreliminaryPartingSurfaceStatus.GENERATED
    )
    patch = report.generated_parting_surface.patches[0]
    assert patch.origin == Vector3D(5.0, 5.0, 5.0)
    assert patch.normal == Vector3D(0.0, 0.0, 1.0)
    assert patch.basis_u.dot(patch.normal) == 0.0
    assert patch.basis_v.dot(patch.normal) == 0.0
    assert len(patch.boundary_points) == 4
    assert patch.extent_u_mm == 10.0
    assert patch.extent_v_mm == 10.0
    assert report.parting_surface_validation is not None
    assert report.parting_surface_validation.status is (
        PartingSurfaceValidationStatus.VALID
    )
    assert report.parting_surface_refinement is not None
    assert report.parting_surface_refinement.status is (
        PartingSurfaceRefinementStatus.NOT_NEEDED
    )
    assert report.refined_parting_surface_validation is None
    assert report.accepted_parting_surface is report.generated_parting_surface


def test_parting_surface_serialization_is_deterministic() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )
    service = MoldGenerationService()

    first = service.generate(context).to_dict()
    second = service.generate(context).to_dict()

    assert first == second
    assert first["generated_parting_surface"]["patches"][0]["origin"] == {
        "x": 5.0,
        "y": 5.0,
        "z": 5.0,
    }
    assert first["accepted_parting_surface_reason"]["code"] == (
        "parting_surface_accepted"
    )


def test_parting_surface_generation_blocks_degenerate_model_bounds() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
        model=_build_degenerate_model(),
    )

    report = MoldGenerationService().generate(context)

    assert report.generated_parting_surface is not None
    assert report.generated_parting_surface.status is (
        PreliminaryPartingSurfaceStatus.BLOCKED
    )
    assert report.parting_surface_validation is not None
    assert report.parting_surface_validation.status is (
        PartingSurfaceValidationStatus.BLOCKED
    )
    assert report.accepted_parting_surface is None


def test_parting_surface_generation_blocks_zero_pull_direction() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(
            direction=Vector3D(0.0, 0.0, 0.0)
        ),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
    )

    report = MoldGenerationService().generate(context)

    assert report.generated_parting_surface is not None
    assert report.generated_parting_surface.status is (
        PreliminaryPartingSurfaceStatus.BLOCKED
    )
    assert report.accepted_parting_surface is None


def test_parting_surface_validator_blocks_non_planar_boundary() -> None:
    report = _ready_surface_report()
    assert report.generated_parting_surface is not None
    assert report.initial_parting_surface_plan is not None
    patch = report.generated_parting_surface.patches[0]
    invalid_patch = PreliminaryPartingSurfacePatch(
        patch_id=patch.patch_id,
        origin=patch.origin,
        normal=patch.normal,
        basis_u=patch.basis_u,
        basis_v=patch.basis_v,
        boundary_points=(
            patch.boundary_points[0],
            patch.boundary_points[1],
            patch.boundary_points[2] + Vector3D(0.0, 0.0, 1.0),
            patch.boundary_points[3],
        ),
        extent_u_mm=patch.extent_u_mm,
        extent_v_mm=patch.extent_v_mm,
        source_strategy_id=patch.source_strategy_id,
        source_plan_reference=patch.source_plan_reference,
    )
    invalid_surface = PreliminaryPartingSurface(
        status=PreliminaryPartingSurfaceStatus.GENERATED,
        patches=(invalid_patch,),
        source_plan_status=report.generated_parting_surface.source_plan_status,
        source_strategy_id=report.generated_parting_surface.source_strategy_id,
        reasons=report.generated_parting_surface.reasons,
    )

    validation = ConservativePartingSurfaceValidator().validate(
        _ready_context(),
        report.initial_parting_surface_plan,
        invalid_surface,
    )

    assert validation.status is PartingSurfaceValidationStatus.BLOCKED
    assert any(finding.is_blocking for finding in validation.findings)


def test_parting_surface_validator_detects_insufficient_projection_coverage() -> None:
    report = _ready_surface_report()
    assert report.generated_parting_surface is not None
    assert report.initial_parting_surface_plan is not None
    patch = report.generated_parting_surface.patches[0]
    small_boundary = tuple(
        patch.origin + ((point - patch.origin) * 0.25)
        for point in patch.boundary_points
    )
    small_patch = PreliminaryPartingSurfacePatch(
        patch_id=patch.patch_id,
        origin=patch.origin,
        normal=patch.normal,
        basis_u=patch.basis_u,
        basis_v=patch.basis_v,
        boundary_points=small_boundary,
        extent_u_mm=patch.extent_u_mm / 4.0,
        extent_v_mm=patch.extent_v_mm / 4.0,
        source_strategy_id=patch.source_strategy_id,
        source_plan_reference=patch.source_plan_reference,
    )
    small_surface = PreliminaryPartingSurface(
        status=PreliminaryPartingSurfaceStatus.GENERATED,
        patches=(small_patch,),
        source_plan_status=report.generated_parting_surface.source_plan_status,
        source_strategy_id=report.generated_parting_surface.source_strategy_id,
        reasons=report.generated_parting_surface.reasons,
    )

    validation = ConservativePartingSurfaceValidator().validate(
        _ready_context(),
        report.initial_parting_surface_plan,
        small_surface,
    )

    assert validation.status is PartingSurfaceValidationStatus.MANUAL_REVIEW_REQUIRED
    assert validation.metrics is not None
    assert validation.metrics.covers_model_projection is False


def test_parting_surface_refinement_repairs_normalization_and_duplicates() -> None:
    report = _ready_surface_report()
    assert report.generated_parting_surface is not None
    assert report.initial_parting_surface_plan is not None
    patch = report.generated_parting_surface.patches[0]
    fixable_patch = PreliminaryPartingSurfacePatch(
        patch_id=patch.patch_id,
        origin=patch.origin,
        normal=Vector3D(0.0, 0.0, 2.0),
        basis_u=patch.basis_u * 2.0,
        basis_v=patch.basis_v * 2.0,
        boundary_points=(
            patch.boundary_points[0],
            patch.boundary_points[0],
            patch.boundary_points[1],
            patch.boundary_points[2],
            patch.boundary_points[3],
        ),
        extent_u_mm=patch.extent_u_mm,
        extent_v_mm=patch.extent_v_mm,
        source_strategy_id=patch.source_strategy_id,
        source_plan_reference=patch.source_plan_reference,
    )
    fixable_surface = PreliminaryPartingSurface(
        status=PreliminaryPartingSurfaceStatus.GENERATED,
        patches=(fixable_patch,),
        source_plan_status=report.generated_parting_surface.source_plan_status,
        source_strategy_id=report.generated_parting_surface.source_strategy_id,
        reasons=report.generated_parting_surface.reasons,
    )
    validator = ConservativePartingSurfaceValidator()
    validation = validator.validate(
        _ready_context(),
        report.initial_parting_surface_plan,
        fixable_surface,
    )

    refinement = SafeInitialPartingSurfaceRefiner().refine(
        _ready_context(),
        report.initial_parting_surface_plan,
        fixable_surface,
        validation,
    )
    assert refinement.status is PartingSurfaceRefinementStatus.APPLIED
    assert "removed_duplicate_boundary_points" in refinement.actions
    assert refinement.refined_surface is not None

    revalidation = validator.validate(
        _ready_context(),
        report.initial_parting_surface_plan,
        refinement.refined_surface,
    )

    assert revalidation.status is PartingSurfaceValidationStatus.VALID
    assert len(refinement.refined_surface.patches[0].boundary_points) == 4


def test_parting_surface_refinement_does_not_hide_blocking_invalid_geometry() -> None:
    report = _ready_surface_report()
    assert report.generated_parting_surface is not None
    assert report.initial_parting_surface_plan is not None
    patch = report.generated_parting_surface.patches[0]
    invalid_patch = PreliminaryPartingSurfacePatch(
        patch_id=patch.patch_id,
        origin=patch.origin,
        normal=Vector3D(0.0, 0.0, 0.0),
        basis_u=patch.basis_u,
        basis_v=patch.basis_v,
        boundary_points=patch.boundary_points,
        extent_u_mm=patch.extent_u_mm,
        extent_v_mm=patch.extent_v_mm,
        source_strategy_id=patch.source_strategy_id,
        source_plan_reference=patch.source_plan_reference,
    )
    invalid_surface = PreliminaryPartingSurface(
        status=PreliminaryPartingSurfaceStatus.GENERATED,
        patches=(invalid_patch,),
        source_plan_status=report.generated_parting_surface.source_plan_status,
        source_strategy_id=report.generated_parting_surface.source_strategy_id,
        reasons=report.generated_parting_surface.reasons,
    )
    validation = ConservativePartingSurfaceValidator().validate(
        _ready_context(),
        report.initial_parting_surface_plan,
        invalid_surface,
    )

    refinement = SafeInitialPartingSurfaceRefiner().refine(
        _ready_context(),
        report.initial_parting_surface_plan,
        invalid_surface,
        validation,
    )

    assert validation.status is PartingSurfaceValidationStatus.BLOCKED
    assert refinement.status is PartingSurfaceRefinementStatus.BLOCKED
    assert refinement.refinement_applied is False


def test_parting_surface_generator_reports_unsupported_plan_type() -> None:
    report = _ready_surface_report()
    assert report.initial_parting_surface_plan is not None
    unsupported_plan = InitialPartingSurfacePlan(
        status=InitialPartingSurfacePlanStatus.PLANNED,
        surface_type=InitialPartingSurfaceType.UNAVAILABLE,
        selected_strategy_id=report.initial_parting_surface_plan.selected_strategy_id,
        pull_direction=report.initial_parting_surface_plan.pull_direction,
        reference="unsupported",
        reference_offset_mm=0.0,
        construction_steps=(),
        required_later_validations=(),
        reasons=report.initial_parting_surface_plan.reasons,
    )

    surface = PlanarPatchPartingSurfaceGenerator().generate(
        _ready_context(),
        unsupported_plan,
    )

    assert surface.status is PreliminaryPartingSurfaceStatus.UNSUPPORTED
    assert surface.patches == ()


def test_service_runs_injected_parting_surface_components() -> None:
    context = _ready_context()
    generator = FakePartingSurfaceGenerator()
    validator = FakePartingSurfaceValidator()
    refiner = FakePartingSurfaceRefiner()
    service = MoldGenerationService(
        preliminary_parting_surface_generator=generator,
        parting_surface_validator=validator,
        initial_parting_surface_refiner=refiner,
    )

    report = service.generate(context)

    assert generator.call_count == 1
    assert validator.call_count == 1
    assert refiner.call_count == 1
    assert report.accepted_parting_surface is None
    assert report.accepted_parting_surface_reason is not None
    assert report.accepted_parting_surface_reason.is_blocking is True


def test_preliminary_core_strategy_creates_core_assisted_candidate_only() -> None:
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    cavity_report = _build_cavity_report(
        processing_decision=processing_decision,
        decision=_build_cavity_decision(
            CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
        ),
        core_strategy=_build_core_strategy(
            CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
        ),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
        cavity_report=cavity_report,
    )

    plan = ConservativeMoldGenerationPlanner().plan(context)
    report = MoldGenerationService().generate(context)

    assert plan.disposition is MoldGenerationDisposition.READY_FOR_PARTING_STRATEGY
    assert plan.generation_mode is PreliminaryMoldGenerationMode.CORE_ASSISTED_CANDIDATE
    assert MoldGenerationNextCapability.CORE_FEASIBILITY_VERIFICATION in (
        plan.required_next_capabilities
    )
    assert plan.warnings[0].code is (
        MoldGenerationFindingCode.PRELIMINARY_CORE_STRATEGY_IS_NOT_FEASIBILITY_PROOF
    )
    assert [
        candidate.strategy_type for candidate in report.parting_strategy_candidates
    ] == [
        PartingStrategyType.SIMPLE_TWO_PART_PLANAR,
        PartingStrategyType.CORE_ASSISTED_PLANAR,
    ]


def test_conflicting_cavity_decision_requires_manual_review() -> None:
    processing_decision = _build_processing_decision()
    cavity_report = _build_cavity_report(
        processing_decision=processing_decision,
        decision=_build_cavity_decision(
            CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED
        ),
    )
    context = _build_context(
        processing_decision=processing_decision,
        cavity_report=cavity_report,
    )

    plan = ConservativeMoldGenerationPlanner().plan(context)

    assert plan.disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
    assert (
        plan.reasons[0].code
        is MoldGenerationFindingCode.CHAPTER_4_MULTI_DIRECTION_REQUIRED
    )


def test_missing_cavity_decision_does_not_become_success() -> None:
    processing_decision = _build_processing_decision()
    cavity_report = _build_cavity_report(
        processing_decision=processing_decision,
        with_decision=False,
    )
    context = _build_context(
        processing_decision=processing_decision,
        cavity_report=cavity_report,
    )

    plan = ConservativeMoldGenerationPlanner().plan(context)

    assert plan.disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
    assert plan.reasons[0].code is (
        MoldGenerationFindingCode.CHAPTER_4_CAVITY_DECISION_MISSING
    )


def test_planner_and_report_to_dict_are_deterministic() -> None:
    context = _build_context()
    service = MoldGenerationService()

    first_report = service.generate(context)
    second_report = service.generate(context)

    assert first_report.to_dict() == second_report.to_dict()
    assert first_report.to_dict()["schema_version"] == "1.0"
    assert first_report.to_dict()["status"] == "ready_for_parting_strategy"
    assert (
        first_report.to_dict()["preliminary_plan"]["generation_mode"]
        == "simple_two_part_candidate"
    )


def test_service_uses_injected_planner_without_adding_rules() -> None:
    context = _build_context()
    planner = FakePlanner()
    service = MoldGenerationService(planner=planner)

    report = service.generate(context)

    assert planner.call_count == 1
    assert report.status is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
    assert report.preliminary_plan.reasons[0].message == (
        "fake planner reviewed sample.stl."
    )


def test_context_validation_rejects_mismatched_chapter_sources() -> None:
    model = _build_model()
    processing_decision = _build_processing_decision()
    import_report = _build_import_report(processing_decision=processing_decision)
    detailed_report = _build_detailed_report(
        source_name="other.stl",
        processing_decision=processing_decision,
    )
    cavity_report = _build_cavity_report(processing_decision=processing_decision)

    with pytest.raises(ValueError, match="matching Chapter 2 and Chapter 3 sources"):
        MoldGenerationContext.from_reports(
            import_report,
            detailed_report,
            cavity_report,
            model,
        )


def test_public_api_imports_chapter_5_contracts() -> None:
    assert MOLD_GENERATION_REPORT_SCHEMA_VERSION == "1.0"
    assert isinstance(MoldGenerationService(), MoldGenerationService)
    assert isinstance(
        ConservativeMoldGenerationPlanner(), ConservativeMoldGenerationPlanner
    )
    assert MoldGenerationReport is not None
    assert MoldGenerationPlanner is not None


def test_service_does_not_mutate_imported_model() -> None:
    context = _build_context()
    before_vertices = list(context.model.vertices)
    before_faces = list(context.model.faces)
    before_metadata = dict(context.model.metadata)

    MoldGenerationService().generate(context)

    assert context.model.vertices == before_vertices
    assert context.model.faces == before_faces
    assert context.model.metadata == before_metadata


def test_component_planning_happy_path_creates_core_cavity_plan_only() -> None:
    report = MoldGenerationService().generate(_ready_context())

    assert report.component_planning is not None
    component_planning = report.component_planning
    assert component_planning.status is MoldComponentPlanningStatus.READY
    assert component_planning.core_cavity_plan is not None
    assert component_planning.core_cavity_plan.status is (
        MoldComponentPlanningStatus.READY
    )
    sides = {side.side: side for side in component_planning.core_cavity_plan.sides}
    assert set(sides) == {MoldComponentSide.CORE, MoldComponentSide.CAVITY}
    assert sides[MoldComponentSide.CAVITY].opening_direction == Vector3D(
        0.0,
        0.0,
        1.0,
    )
    assert sides[MoldComponentSide.CORE].opening_direction == Vector3D(
        -0.0,
        -0.0,
        -1.0,
    )
    assert component_planning.insert_plans == ()
    assert component_planning.support_plans == ()
    assert component_planning.relief_plans == ()


def test_component_planning_creates_insert_support_and_relief_from_chapter_4_evidence() -> (
    None
):
    processing_decision = _build_processing_decision()
    detailed_report = _build_detailed_report(
        processing_decision=processing_decision,
        pull_direction_selection=_build_pull_direction_selection(),
        draft_analysis=_build_draft_analysis(),
        undercut_analysis=_build_undercut_analysis(),
        undercut_risk_assessment=_build_undercut_risk_assessment(),
    )
    cavity_report = _build_cavity_report(
        processing_decision=processing_decision,
        decision=CavityAnalysisDecision(
            status=DetailedMoldAnalysisStatus.COMPLETED,
            outcome=CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE,
            summary="Chapter 4 linear core evidence.",
            applicable_target_ids=("target_001",),
            linear_candidate_target_ids=("target_001",),
        ),
        core_strategy=_build_core_strategy(
            CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
        ),
    )
    context = _build_context(
        processing_decision=processing_decision,
        detailed_report=detailed_report,
        cavity_report=cavity_report,
    )

    report = MoldGenerationService().generate(context)

    assert report.component_planning is not None
    component_planning = report.component_planning
    assert component_planning.status is MoldComponentPlanningStatus.READY
    assert len(component_planning.insert_plans) == 1
    assert component_planning.insert_plans[0].purpose is (
        InsertPlanPurpose.INTERNAL_CAVITY_ACCESS
    )
    assert component_planning.support_plans[0].purpose is (
        SupportPlanPurpose.INSERT_RELATED_SUPPORT
    )
    assert component_planning.relief_plans[0].purpose is (
        ReliefPlanPurpose.INSERT_CLEARANCE
    )


def test_component_planning_propagates_blocked_and_manual_review() -> None:
    blocked_decision = _build_processing_decision(ModelProcessingStatus.REQUIRES_REPAIR)
    blocked_context = _build_context(processing_decision=blocked_decision)

    blocked_report = MoldGenerationService().generate(blocked_context)

    assert blocked_report.component_planning is not None
    assert blocked_report.component_planning.status is (
        MoldComponentPlanningStatus.BLOCKED
    )

    processing_decision = _build_processing_decision()
    manual_context = _build_context(
        processing_decision=processing_decision,
        cavity_report=_build_cavity_report(
            processing_decision=processing_decision,
            with_decision=False,
        ),
    )

    manual_report = MoldGenerationService().generate(manual_context)

    assert manual_report.component_planning is not None
    assert manual_report.component_planning.status is (
        MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
    )


def test_core_cavity_planning_reports_unsupported_for_valid_special_strategy_input() -> (
    None
):
    ready_report = _ready_surface_report()
    assert ready_report.preliminary_parting_strategy_selection is not None
    assert ready_report.initial_parting_surface_plan is not None
    assert ready_report.accepted_parting_surface is not None
    processing_decision = _build_processing_decision()
    special_context = _build_context(
        processing_decision=processing_decision,
        detailed_report=_build_detailed_report(
            processing_decision=processing_decision,
            pull_direction_selection=_build_pull_direction_selection(),
            draft_analysis=_build_draft_analysis(),
            undercut_analysis=_build_undercut_analysis(),
            undercut_risk_assessment=_build_undercut_risk_assessment(),
        ),
        cavity_report=_build_cavity_report(
            processing_decision=processing_decision,
            decision=_build_cavity_decision(
                CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
            ),
        ),
    )
    preliminary_plan = ConservativeMoldGenerationPlanner().plan(special_context)

    core_cavity_plan = MoldGenerationService().core_cavity_planner.plan(
        special_context,
        preliminary_plan,
        ready_report.preliminary_parting_strategy_selection,
        ready_report.initial_parting_surface_plan,
        ready_report.accepted_parting_surface,
    )

    assert core_cavity_plan.status is MoldComponentPlanningStatus.UNSUPPORTED
    assert core_cavity_plan.reasons[0].code is (
        MoldGenerationFindingCode.COMPONENT_PLANNING_UNSUPPORTED
    )


def test_component_plan_validator_blocks_duplicate_missing_and_non_finite_values() -> (
    None
):
    report = _ready_surface_report()
    assert report.component_planning is not None
    assert report.component_planning.core_cavity_plan is not None
    assert report.accepted_parting_surface is not None
    core_cavity_plan = report.component_planning.core_cavity_plan
    invalid_insert = InsertPlan(
        plan_id=core_cavity_plan.plan_id,
        status=MoldComponentPlanningStatus.READY,
        purpose=InsertPlanPurpose.INTERNAL_CAVITY_ACCESS,
        source_reference="missing",
        related_region_ids=("missing-region",),
        reason_codes=(),
        provenance=(),
        confidence=float("inf"),
    )

    validation = ConservativeMoldComponentPlanValidator().validate(
        _ready_context(),
        core_cavity_plan,
        (invalid_insert,),
        (),
        (),
        report.accepted_parting_surface,
    )

    codes = {finding.code for finding in validation.findings}
    assert validation.status is MoldComponentPlanningStatus.BLOCKED
    assert MoldGenerationFindingCode.COMPONENT_PLAN_DUPLICATE_ID in codes
    assert MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_REFERENCE in codes
    assert MoldGenerationFindingCode.COMPONENT_PLAN_NON_FINITE_VALUE in codes
    assert MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_EVIDENCE in codes


def test_component_planning_serialization_is_deterministic() -> None:
    service = MoldGenerationService()
    context = _ready_context()

    first = service.generate(context).to_dict()
    second = service.generate(context).to_dict()

    assert first == second
    assert first["component_planning"]["status"] == "ready"
    assert first["component_planning"]["core_cavity_plan"]["plan_id"] == (
        "core-cavity-plan-0001"
    )


def test_component_planning_components_are_injectable() -> None:
    class FakeCoreCavityPlanner:
        def __init__(self) -> None:
            self.call_count = 0

        def plan(
            self,
            context: MoldGenerationContext,
            preliminary_plan: PreliminaryMoldGenerationPlan,
            strategy_selection: object,
            surface_plan: InitialPartingSurfacePlan,
            accepted_surface: PreliminaryPartingSurface | None,
        ) -> PreliminaryCoreCavityPlan:
            self.call_count += 1
            assert accepted_surface is not None
            return PreliminaryCoreCavityPlan(
                status=MoldComponentPlanningStatus.READY,
                plan_id="core-cavity-plan-0001",
                selected_strategy_id=surface_plan.selected_strategy_id,
                accepted_parting_surface_patch_ids=(
                    accepted_surface.patches[0].patch_id,
                ),
                sides=(
                    CoreCavitySidePlan(
                        side=MoldComponentSide.CAVITY,
                        opening_direction=Vector3D(0.0, 0.0, 1.0),
                        selected_strategy_id=surface_plan.selected_strategy_id or "",
                        accepted_parting_surface_patch_ids=(
                            accepted_surface.patches[0].patch_id,
                        ),
                        role="positive_opening_side",
                        reason_codes=(
                            MoldGenerationFindingCode.CORE_CAVITY_SIDE_ASSIGNED,
                        ),
                        provenance=("fake",),
                    ),
                    CoreCavitySidePlan(
                        side=MoldComponentSide.CORE,
                        opening_direction=Vector3D(0.0, 0.0, -1.0),
                        selected_strategy_id=surface_plan.selected_strategy_id or "",
                        accepted_parting_surface_patch_ids=(
                            accepted_surface.patches[0].patch_id,
                        ),
                        role="negative_opening_side",
                        reason_codes=(
                            MoldGenerationFindingCode.CORE_CAVITY_SIDE_ASSIGNED,
                        ),
                        provenance=("fake",),
                    ),
                ),
                special_regions=(
                    MoldSpecialRegionPlan(
                        region_id="region-core-target-injected",
                        kind=MoldSpecialRegionKind.CORE_TARGET,
                        source_reference="fake",
                        related_target_ids=("injected",),
                        reason_codes=(
                            MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                        ),
                        provenance=("fake",),
                    ),
                ),
            )

    class FakeInsertPlanner:
        def __init__(self) -> None:
            self.call_count = 0

        def plan(
            self,
            context: MoldGenerationContext,
            core_cavity_plan: PreliminaryCoreCavityPlan,
        ) -> tuple[InsertPlan, ...]:
            self.call_count += 1
            return (
                InsertPlan(
                    plan_id="insert-plan-0001-injected",
                    status=MoldComponentPlanningStatus.READY,
                    purpose=InsertPlanPurpose.INTERNAL_CAVITY_ACCESS,
                    source_reference="fake",
                    related_region_ids=("region-core-target-injected",),
                    reason_codes=(MoldGenerationFindingCode.INSERT_PLAN_CREATED,),
                    provenance=("fake",),
                    confidence=0.9,
                ),
            )

    class FakeSupportPlanner:
        def __init__(self) -> None:
            self.call_count = 0

        def plan(
            self,
            context: MoldGenerationContext,
            core_cavity_plan: PreliminaryCoreCavityPlan,
            insert_plans: tuple[InsertPlan, ...],
        ) -> tuple[SupportPlan, ...]:
            self.call_count += 1
            return ()

    class FakeReliefPlanner:
        def __init__(self) -> None:
            self.call_count = 0

        def plan(
            self,
            context: MoldGenerationContext,
            core_cavity_plan: PreliminaryCoreCavityPlan,
            insert_plans: tuple[InsertPlan, ...],
        ) -> tuple[ReliefPlan, ...]:
            self.call_count += 1
            return ()

    class FakeValidator:
        def __init__(self) -> None:
            self.call_count = 0

        def validate(
            self,
            context: MoldGenerationContext,
            core_cavity_plan: PreliminaryCoreCavityPlan,
            insert_plans: tuple[InsertPlan, ...],
            support_plans: tuple[SupportPlan, ...],
            relief_plans: tuple[ReliefPlan, ...],
            accepted_surface: PreliminaryPartingSurface | None,
        ) -> MoldComponentPlanValidationResult:
            self.call_count += 1
            return MoldComponentPlanValidationResult(
                status=MoldComponentPlanningStatus.READY,
                findings=(),
            )

    class FakeIntegrator:
        def __init__(self) -> None:
            self.call_count = 0

        def integrate(
            self,
            core_cavity_plan: PreliminaryCoreCavityPlan,
            insert_plans: tuple[InsertPlan, ...],
            support_plans: tuple[SupportPlan, ...],
            relief_plans: tuple[ReliefPlan, ...],
            validation: MoldComponentPlanValidationResult,
        ) -> MoldComponentPlanningResult:
            self.call_count += 1
            return MoldComponentPlanningResult(
                status=validation.status,
                core_cavity_plan=core_cavity_plan,
                insert_plans=insert_plans,
                support_plans=support_plans,
                relief_plans=relief_plans,
                validation=validation,
            )

    core_cavity_planner = FakeCoreCavityPlanner()
    insert_planner = FakeInsertPlanner()
    support_planner = FakeSupportPlanner()
    relief_planner = FakeReliefPlanner()
    validator = FakeValidator()
    integrator = FakeIntegrator()
    service = MoldGenerationService(
        core_cavity_planner=core_cavity_planner,
        insert_planner=insert_planner,
        support_planner=support_planner,
        relief_planner=relief_planner,
        mold_component_plan_validator=validator,
        mold_component_planning_integrator=integrator,
    )

    report = service.generate(_ready_context())

    assert core_cavity_planner.call_count == 1
    assert insert_planner.call_count == 1
    assert support_planner.call_count == 1
    assert relief_planner.call_count == 1
    assert validator.call_count == 1
    assert integrator.call_count == 1
    assert report.component_planning is not None
    assert report.component_planning.insert_plans[0].plan_id == (
        "insert-plan-0001-injected"
    )


def test_envelope_block_global_validation_and_final_decision_happy_path() -> None:
    service = MoldGenerationService()
    context = _ready_context()

    first = service.generate(context)
    second = service.generate(context)

    assert first.mold_envelope_plan is not None
    assert first.mold_block_plan is not None
    assert first.global_validation is not None
    assert first.final_decision is not None
    assert first.mold_envelope_plan.status is MoldComponentPlanningStatus.READY
    assert first.mold_block_plan.status is MoldComponentPlanningStatus.READY
    assert first.global_validation.status is MoldComponentPlanningStatus.READY
    assert first.final_decision.status is FinalMoldGenerationDecisionStatus.READY
    assert first.mold_envelope_plan.opening_direction == Vector3D(0.0, 0.0, 1.0)
    assert first.mold_block_plan.envelope_id == first.mold_envelope_plan.envelope_id
    assert first.to_dict() == second.to_dict()
    assert first.to_dict()["final_decision"]["status"] == "ready"


def test_envelope_and_block_are_not_produced_when_prerequisites_fail() -> None:
    context = _build_context(model=_build_degenerate_model())

    report = MoldGenerationService().generate(context)

    assert report.accepted_parting_surface is None
    assert report.mold_envelope_plan is None
    assert report.mold_block_plan is None
    assert report.global_validation is not None
    assert report.global_validation.status is MoldComponentPlanningStatus.BLOCKED
    assert report.final_decision is not None
    assert report.final_decision.status is FinalMoldGenerationDecisionStatus.BLOCKED


def test_global_validation_blocks_invalid_envelope_bounds() -> None:
    report = _ready_surface_report()
    assert report.component_planning is not None
    assert report.mold_envelope_plan is not None
    assert report.mold_block_plan is not None
    assert report.preliminary_parting_strategy_selection is not None
    assert report.initial_parting_surface_plan is not None

    invalid_envelope = replace(
        report.mold_envelope_plan,
        bounds_max=Vector3D(-1.0, -1.0, -1.0),
        dimensions_mm=Vector3D(-1.0, -1.0, -1.0),
    )

    validation = ConservativeGlobalMoldGenerationValidator().validate(
        _ready_context(),
        report.preliminary_plan,
        report.preliminary_parting_strategy_selection,
        report.initial_parting_surface_plan,
        report.accepted_parting_surface,
        report.component_planning,
        invalid_envelope,
        report.mold_block_plan,
    )

    assert validation.status is MoldComponentPlanningStatus.BLOCKED
    assert MoldGenerationFindingCode.MOLD_ENVELOPE_INVALID_BOUNDS in {
        finding.code for finding in validation.findings
    }


def test_global_validation_blocks_non_finite_and_inconsistent_plans() -> None:
    report = _ready_surface_report()
    assert report.component_planning is not None
    assert report.component_planning.core_cavity_plan is not None
    assert report.mold_envelope_plan is not None
    assert report.mold_block_plan is not None
    assert report.preliminary_parting_strategy_selection is not None
    assert report.initial_parting_surface_plan is not None

    invalid_envelope = replace(
        report.mold_envelope_plan,
        envelope_id=report.component_planning.core_cavity_plan.plan_id,
        bounds_min=Vector3D(float("inf"), 0.0, 0.0),
        accepted_parting_surface_patch_ids=("missing-patch",),
        opening_direction=Vector3D(0.0, 0.0, -1.0),
    )
    invalid_block = replace(
        report.mold_block_plan,
        parting_surface_patch_ids=("missing-patch",),
        opening_direction=Vector3D(0.0, 0.0, -1.0),
    )

    validation = ConservativeGlobalMoldGenerationValidator().validate(
        _ready_context(),
        report.preliminary_plan,
        report.preliminary_parting_strategy_selection,
        report.initial_parting_surface_plan,
        report.accepted_parting_surface,
        report.component_planning,
        invalid_envelope,
        invalid_block,
    )
    codes = {finding.code for finding in validation.findings}

    assert validation.status is MoldComponentPlanningStatus.BLOCKED
    assert MoldGenerationFindingCode.MOLD_ENVELOPE_INVALID_BOUNDS in codes
    assert MoldGenerationFindingCode.GLOBAL_VALIDATION_MISSING_REFERENCE in codes
    assert MoldGenerationFindingCode.GLOBAL_VALIDATION_DUPLICATE_ID in codes
    assert (
        MoldGenerationFindingCode.GLOBAL_VALIDATION_INCONSISTENT_OPENING_DIRECTION
        in codes
    )


def test_final_decision_preserves_manual_review_and_unsupported_states() -> None:
    processing_decision = _build_processing_decision()
    manual_context = _build_context(
        processing_decision=processing_decision,
        cavity_report=_build_cavity_report(
            processing_decision=processing_decision,
            with_decision=False,
        ),
    )

    manual_report = MoldGenerationService().generate(manual_context)

    assert manual_report.final_decision is not None
    assert manual_report.final_decision.status is (
        FinalMoldGenerationDecisionStatus.MANUAL_REVIEW
    )
    assert manual_report.mold_envelope_plan is None

    unsupported_context = _build_context(
        processing_decision=processing_decision,
        cavity_report=_build_cavity_report(
            processing_decision=processing_decision,
            decision=_build_cavity_decision(
                CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED
            ),
        ),
    )

    unsupported_report = MoldGenerationService().generate(unsupported_context)

    assert unsupported_report.final_decision is not None
    assert unsupported_report.final_decision.status is (
        FinalMoldGenerationDecisionStatus.UNSUPPORTED
    )


def test_envelope_block_finalization_components_are_injectable() -> None:
    calls: list[str] = []

    class FakeEnvelopePlanner:
        def plan(
            self,
            context: MoldGenerationContext,
            preliminary_plan: PreliminaryMoldGenerationPlan,
            accepted_surface: PreliminaryPartingSurface | None,
            component_planning: MoldComponentPlanningResult,
        ) -> MoldEnvelopePlan | None:
            calls.append("envelope")
            return ConservativeMoldEnvelopePlanner().plan(
                context,
                preliminary_plan,
                accepted_surface,
                component_planning,
            )

    class FakeBlockPlanner:
        def plan(
            self,
            context: MoldGenerationContext,
            envelope_plan: MoldEnvelopePlan | None,
            accepted_surface: PreliminaryPartingSurface | None,
            component_planning: MoldComponentPlanningResult,
        ) -> MoldBlockPlan | None:
            calls.append("block")
            return ConservativeMoldBlockPlanner().plan(
                context,
                envelope_plan,
                accepted_surface,
                component_planning,
            )

    class FakeGlobalValidator:
        def validate(
            self,
            context: MoldGenerationContext,
            preliminary_plan: PreliminaryMoldGenerationPlan,
            selection: object,
            surface_plan: InitialPartingSurfacePlan,
            accepted_surface: PreliminaryPartingSurface | None,
            component_planning: MoldComponentPlanningResult,
            envelope_plan: MoldEnvelopePlan | None,
            block_plan: MoldBlockPlan | None,
        ) -> GlobalMoldGenerationValidationResult:
            calls.append("global")
            return GlobalMoldGenerationValidationResult(
                status=MoldComponentPlanningStatus.READY,
                findings=(),
            )

    class FakeDecisionMaker:
        def decide(
            self,
            context: MoldGenerationContext,
            preliminary_plan: PreliminaryMoldGenerationPlan,
            component_planning: MoldComponentPlanningResult,
            envelope_plan: MoldEnvelopePlan | None,
            block_plan: MoldBlockPlan | None,
            global_validation: GlobalMoldGenerationValidationResult,
        ) -> FinalMoldGenerationDecision:
            calls.append("decision")
            return FinalMoldGenerationDecision(
                status=FinalMoldGenerationDecisionStatus.READY,
                summary="fake ready",
                reasons=(),
                validation_status=global_validation.status,
                preliminary_disposition=preliminary_plan.disposition,
            )

    report = MoldGenerationService(
        mold_envelope_planner=FakeEnvelopePlanner(),
        mold_block_planner=FakeBlockPlanner(),
        global_mold_generation_validator=FakeGlobalValidator(),
        final_mold_generation_decision_maker=FakeDecisionMaker(),
    ).generate(_ready_context())

    assert calls == ["envelope", "block", "global", "decision"]
    assert report.mold_envelope_plan is not None
    assert report.mold_block_plan is not None
    assert report.final_decision is not None
    assert report.final_decision.summary == "fake ready"
