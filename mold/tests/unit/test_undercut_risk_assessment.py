from __future__ import annotations

from pathlib import Path

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionRankingScoreBreakdown,
    PullDirectionSource,
    PullDirectionSourceReference,
    RankedPullDirectionEvaluation,
    UndercutConnectedRegion,
    UndercutRegionAnalysis,
    UndercutRegionAnalysisWarning,
    UndercutRegionAnalysisWarningCode,
    UndercutRegionDraftSummary,
    UndercutRiskAssessmentWarningCode,
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
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
from mold_generator_engine.pipeline.detailed_mold_analysis.undercut_assessment import (
    DefaultUndercutRiskAssessor,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


def _build_model() -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=10.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=10.0, z=0.0),
    ]
    return ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0),
            maximum=Vertex(x=10.0, y=10.0, z=0.0),
        ),
        dimensions=Dimensions(x=10.0, y=10.0, z=0.0),
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


def _selection() -> PreliminaryPullDirectionSelection:
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
    return PreliminaryPullDirectionSelection(
        status=PreliminaryPullDirectionSelectionStatus.SELECTED,
        ranked_evaluations=(ranked,),
        selected_evaluation=ranked,
        decisiveness=PreliminaryPullDirectionSelectionDecisiveness.CLEAR,
    )


def _region(
    *,
    region_id: str = "undercut-region-0001",
    face_count: int,
    total_area_sq_mm: float,
    area_ratio: float,
    axial_extent_mm: float,
    maximum_lateral_extent_mm: float,
    boundary_edge_count: int,
    confidence: float = 1.0,
    touches_open_boundary: bool = False,
    touches_non_manifold_edge: bool = False,
    adjacent_ambiguous_face_indices: tuple[int, ...] = (),
    ambiguous_bridge_region_ids: tuple[str, ...] = (),
    draft_summary: UndercutRegionDraftSummary | None = None,
) -> UndercutConnectedRegion:
    return UndercutConnectedRegion(
        region_id=region_id,
        order_index=1,
        seed_face_index=0,
        face_indices=tuple(range(face_count)),
        face_count=face_count,
        total_area_sq_mm=total_area_sq_mm,
        area_ratio=area_ratio,
        area_weighted_centroid=Vector3D(1.0, 1.0, 1.0),
        measurable_face_count=face_count,
        degenerate_face_count=0,
        axial_projection_min_mm=0.0,
        axial_projection_max_mm=axial_extent_mm,
        axial_extent_mm=axial_extent_mm,
        lateral_extent_u_mm=maximum_lateral_extent_mm,
        lateral_extent_v_mm=max(0.5, maximum_lateral_extent_mm / 2.0),
        maximum_lateral_extent_mm=maximum_lateral_extent_mm,
        axial_to_lateral_extent_ratio=(
            0.0
            if maximum_lateral_extent_mm <= 0.0
            else axial_extent_mm / maximum_lateral_extent_mm
        ),
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0),
            maximum=Vertex(x=maximum_lateral_extent_mm, y=1.0, z=axial_extent_mm),
        ),
        boundary_edge_count=boundary_edge_count,
        boundary_face_indices=tuple(range(face_count)),
        adjacent_pullable_face_indices=(),
        adjacent_ambiguous_face_indices=adjacent_ambiguous_face_indices,
        adjacent_potential_face_indices=(),
        ambiguous_bridge_region_ids=ambiguous_bridge_region_ids,
        touches_open_boundary=touches_open_boundary,
        open_boundary_edge_count=int(touches_open_boundary),
        touches_non_manifold_edge=touches_non_manifold_edge,
        affected_non_manifold_edge_count=int(touches_non_manifold_edge),
        confirmed_sample_count=face_count * 4,
        ambiguous_sample_count=0,
        accessible_sample_count=0,
        total_sample_count=face_count * 4,
        blocked_sample_ratio=1.0,
        confidence=confidence,
        draft_summary=draft_summary,
    )


def _analysis(
    *regions: UndercutConnectedRegion,
    warnings: tuple[UndercutRegionAnalysisWarning, ...] = (),
) -> UndercutRegionAnalysis:
    return UndercutRegionAnalysis(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        selected_pull_direction=_selection().selected_candidate,
        is_evaluable=True,
        regions=regions,
        region_count=len(regions),
        confirmed_face_count=sum(region.face_count for region in regions),
        total_area_sq_mm=sum(region.total_area_sq_mm for region in regions),
        area_ratio=sum(region.area_ratio for region in regions),
        largest_region_id=(regions[0].region_id if regions else None),
        largest_region_area_sq_mm=(
            max((region.total_area_sq_mm for region in regions), default=0.0)
        ),
        regions_touching_ambiguous_faces_count=sum(
            bool(region.adjacent_ambiguous_face_indices) for region in regions
        ),
        regions_touching_non_manifold_count=sum(
            region.touches_non_manifold_edge for region in regions
        ),
        affected_non_manifold_edge_count=sum(
            region.affected_non_manifold_edge_count for region in regions
        ),
        regions_touching_open_boundaries_count=sum(
            region.touches_open_boundary for region in regions
        ),
        warnings=warnings,
    )


def test_small_simple_region_is_classified_as_low_risk() -> None:
    region = _region(
        face_count=1,
        total_area_sq_mm=0.5,
        area_ratio=0.01,
        axial_extent_mm=0.0,
        maximum_lateral_extent_mm=1.0,
        boundary_edge_count=3,
        draft_summary=UndercutRegionDraftSummary(
            negative_release_face_count=1,
            neutral_release_face_count=0,
            positive_release_face_count=0,
            ambiguous_face_count=0,
            unevaluable_face_count=0,
            minimum_signed_draft_angle_degrees=-0.5,
            maximum_signed_draft_angle_degrees=-0.5,
            area_weighted_mean_signed_draft_angle_degrees=-0.5,
        ),
    )

    assessment = DefaultUndercutRiskAssessor().analyze(
        _build_context(),
        _selection(),
        _analysis(region),
    )

    assert assessment.is_evaluable is True
    assert assessment.highest_severity is UndercutRiskSeverity.LOW
    assert assessment.overall_treatment_requirement is (
        UndercutTreatmentRequirement.MINOR_DRAFT_ADJUSTMENT_CANDIDATE
    )
    assert assessment.region_assessments[0].reasons == ()


def test_large_extended_region_escalates_to_critical_risk() -> None:
    region = _region(
        face_count=24,
        total_area_sq_mm=900.0,
        area_ratio=0.45,
        axial_extent_mm=12.0,
        maximum_lateral_extent_mm=50.0,
        boundary_edge_count=20,
        draft_summary=UndercutRegionDraftSummary(
            negative_release_face_count=24,
            neutral_release_face_count=0,
            positive_release_face_count=0,
            ambiguous_face_count=0,
            unevaluable_face_count=0,
            minimum_signed_draft_angle_degrees=-9.0,
            maximum_signed_draft_angle_degrees=-1.0,
            area_weighted_mean_signed_draft_angle_degrees=-6.5,
        ),
    )

    assessment = DefaultUndercutRiskAssessor().analyze(
        _build_context(),
        _selection(),
        _analysis(region),
    )

    assert assessment.highest_severity is UndercutRiskSeverity.CRITICAL
    assert assessment.overall_treatment_requirement is (
        UndercutTreatmentRequirement.CORE_OR_INSERT_LIKELY_REQUIRED
    )
    assert assessment.region_assessments[0].complexity_score >= 7


def test_ambiguous_or_incomplete_inputs_degrade_to_manual_review_not_crash() -> None:
    region = _region(
        face_count=2,
        total_area_sq_mm=8.0,
        area_ratio=0.03,
        axial_extent_mm=0.5,
        maximum_lateral_extent_mm=3.0,
        boundary_edge_count=4,
        confidence=0.3,
        touches_open_boundary=True,
        adjacent_ambiguous_face_indices=(9,),
        draft_summary=None,
    )
    analysis = _analysis(
        region,
        warnings=(
            UndercutRegionAnalysisWarning(
                code=UndercutRegionAnalysisWarningCode.DRAFT_ANALYSIS_UNAVAILABLE,
                message="draft unavailable",
            ),
        ),
    )

    assessment = DefaultUndercutRiskAssessor().analyze(
        _build_context(),
        _selection(),
        analysis,
    )

    assert assessment.is_evaluable is True
    assert assessment.region_assessments[0].treatment_requirement is (
        UndercutTreatmentRequirement.MANUAL_REVIEW_REQUIRED
    )
    assert assessment.region_assessments[0].warnings
    assert {warning.code for warning in assessment.warnings} >= {
        UndercutRiskAssessmentWarningCode.DRAFT_ANALYSIS_UNAVAILABLE,
        UndercutRiskAssessmentWarningCode.AMBIGUOUS_BOUNDARY_EVIDENCE_PRESENT,
        UndercutRiskAssessmentWarningCode.TOPOLOGY_RISK_EVIDENCE_PRESENT,
    }


def test_report_to_dict_serializes_undercut_risk_assessment() -> None:
    region = _region(
        face_count=1,
        total_area_sq_mm=0.5,
        area_ratio=0.01,
        axial_extent_mm=0.0,
        maximum_lateral_extent_mm=1.0,
        boundary_edge_count=3,
    )
    context = _build_context()
    assessment = DefaultUndercutRiskAssessor().analyze(
        context,
        _selection(),
        _analysis(region),
    )
    report = DetailedMoldAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=context.source,
        summary="ok",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        undercut_risk_assessment=assessment,
    )

    serialized = report.to_dict()

    assert (
        serialized["undercut_risk_assessment"]["region_assessments"][0][
            "treatment_requirement"
        ]
        == "minor_draft_adjustment_candidate"
    )
