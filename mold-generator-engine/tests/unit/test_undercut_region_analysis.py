from __future__ import annotations

from pathlib import Path

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    DraftAdequacy,
    DraftAnalysisResult,
    DraftReleaseSide,
    DraftSurfaceType,
    FaceDraftAnalysis,
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
    UndercutFaceAssessment,
    UndercutFaceClassification,
    UndercutRegionAnalysisWarningCode,
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
from mold_generator_engine.pipeline.detailed_mold_analysis.face_analysis import (
    analyze_model_face_geometry,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.undercut_regions import (
    DefaultUndercutRegionAnalyzer,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


def _build_model(
    vertices: list[Vertex],
    faces: list[Face],
) -> ImportedModel:
    minimum = Vertex(
        x=min(vertex.x for vertex in vertices),
        y=min(vertex.y for vertex in vertices),
        z=min(vertex.z for vertex in vertices),
    )
    maximum = Vertex(
        x=max(vertex.x for vertex in vertices),
        y=max(vertex.y for vertex in vertices),
        z=max(vertex.z for vertex in vertices),
    )
    return ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=faces,
        bounding_box=BoundingBox(minimum=minimum, maximum=maximum),
        dimensions=Dimensions(
            x=maximum.x - minimum.x,
            y=maximum.y - minimum.y,
            z=maximum.z - minimum.z,
        ),
        warnings=[],
        metadata={},
    )


def _build_context(model: ImportedModel) -> DetailedMoldAnalysisContext:
    return DetailedMoldAnalysisContext.from_report(
        ImportAnalysisReport(
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
        ),
        model,
    )


def _selection(direction: Vector3D) -> PreliminaryPullDirectionSelection:
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


def _build_undercut_result(
    face_analysis,
    *,
    confirmed_face_indices: set[int],
    ambiguous_face_indices: set[int] | None = None,
    potential_face_indices: set[int] | None = None,
) -> UndercutAnalysisResult:
    ambiguous_face_indices = ambiguous_face_indices or set()
    potential_face_indices = potential_face_indices or set()
    assessments: list[UndercutFaceAssessment] = []

    for face in face_analysis.faces:
        classification = UndercutFaceClassification.CLEAR
        sample_count = 4
        accessible_sample_count = 4
        blocked_sample_count = 0
        ambiguous_sample_count = 0
        confidence = 0.6

        if face.face_index in confirmed_face_indices:
            classification = UndercutFaceClassification.CONFIRMED_UNDERCUT
            accessible_sample_count = 0
            blocked_sample_count = 4
            confidence = 1.0
        elif face.face_index in ambiguous_face_indices:
            classification = UndercutFaceClassification.AMBIGUOUS
            accessible_sample_count = 0
            ambiguous_sample_count = 4
            confidence = 0.0
        elif face.face_index in potential_face_indices:
            classification = UndercutFaceClassification.POTENTIAL_UNDERCUT
            accessible_sample_count = 2
            blocked_sample_count = 2
            confidence = 0.5

        assessments.append(
            UndercutFaceAssessment(
                face_index=face.face_index,
                face_area_sq_mm=face.area,
                classification=classification,
                sample_count=sample_count,
                accessible_sample_count=accessible_sample_count,
                bidirectionally_blocked_sample_count=blocked_sample_count,
                ambiguous_sample_count=ambiguous_sample_count,
                blocked_ratio=blocked_sample_count / sample_count,
                confidence=confidence,
            )
        )

    return UndercutAnalysisResult(
        selected_pull_direction=_selection(Vector3D(0.0, 0.0, 1.0)).selected_candidate,
        is_evaluable=True,
        outcome=(
            UndercutAnalysisOutcome.CONFIRMED_UNDERCUTS_FOUND
            if confirmed_face_indices
            else UndercutAnalysisOutcome.CLEAR
        ),
        face_assessments=tuple(assessments),
    )


def _build_draft_result(
    face_analysis,
    signed_angles: dict[int, float],
) -> DraftAnalysisResult:
    face_results: list[FaceDraftAnalysis] = []
    for face in face_analysis.faces:
        signed_angle = signed_angles.get(face.face_index)
        if signed_angle is None:
            face_results.append(
                FaceDraftAnalysis(
                    face_index=face.face_index,
                    face_area_sq_mm=face.area,
                    alignment=None,
                    signed_draft_angle_degrees=None,
                    draft_angle_magnitude_degrees=None,
                    release_side=DraftReleaseSide.UNEVALUABLE,
                    surface_type=DraftSurfaceType.UNEVALUABLE,
                    adequacy=DraftAdequacy.UNEVALUABLE,
                )
            )
            continue

        if signed_angle < 0.0:
            release_side = DraftReleaseSide.NEGATIVE
        elif signed_angle > 0.0:
            release_side = DraftReleaseSide.POSITIVE
        else:
            release_side = DraftReleaseSide.NEUTRAL

        face_results.append(
            FaceDraftAnalysis(
                face_index=face.face_index,
                face_area_sq_mm=face.area,
                alignment=0.0,
                signed_draft_angle_degrees=signed_angle,
                draft_angle_magnitude_degrees=abs(signed_angle),
                release_side=release_side,
                surface_type=DraftSurfaceType.DRAFTED,
                adequacy=DraftAdequacy.SUFFICIENT,
            )
        )

    return DraftAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        selected_pull_direction=_selection(Vector3D(0.0, 0.0, 1.0)).selected_candidate,
        is_evaluable=True,
        face_results=tuple(face_results),
    )


def test_confirmed_faces_sharing_edge_form_one_region_with_expected_metrics() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=1.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=2, vertex_3=3),
        ],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    analyzer = DefaultUndercutRegionAnalyzer()

    analysis = analyzer.analyze(
        context,
        face_analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
        _build_undercut_result(face_analysis, confirmed_face_indices={0, 1}),
        _build_draft_result(face_analysis, {0: -2.0, 1: 3.0}),
    )

    assert analysis.is_evaluable is True
    assert analysis.region_count == 1
    region = analysis.regions[0]
    assert region.region_id == "undercut-region-0001"
    assert region.face_indices == (0, 1)
    assert region.total_area_sq_mm == 1.0
    assert region.area_ratio == 1.0
    assert region.area_weighted_centroid == Vector3D(0.5, 0.5, 0.0)
    assert region.axial_extent_mm == 0.0
    assert region.lateral_extent_u_mm == 1.0
    assert region.lateral_extent_v_mm == 1.0
    assert region.maximum_lateral_extent_mm == 1.0
    assert region.boundary_edge_count == 4
    assert region.touches_open_boundary is True
    assert region.confirmed_sample_count == 8
    assert region.total_sample_count == 8
    assert region.blocked_sample_ratio == 1.0
    assert region.draft_summary is not None
    assert region.draft_summary.negative_release_face_count == 1
    assert region.draft_summary.positive_release_face_count == 1


def test_vertex_only_contact_keeps_regions_separate_and_stable() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=2.0, y=0.0, z=0.0),
            Vertex(x=2.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=3, vertex_3=4),
        ],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)

    analysis = DefaultUndercutRegionAnalyzer().analyze(
        context,
        face_analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
        _build_undercut_result(face_analysis, confirmed_face_indices={0, 1}),
        None,
    )

    assert [region.region_id for region in analysis.regions] == [
        "undercut-region-0001",
        "undercut-region-0002",
    ]
    assert [region.face_indices for region in analysis.regions] == [(0,), (1,)]


def test_ambiguous_faces_do_not_merge_regions_and_are_recorded_as_bridges() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=1.0, y=1.0, z=0.0),
            Vertex(x=2.0, y=0.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=1, vertex_2=3, vertex_3=2),
            Face(vertex_1=1, vertex_2=4, vertex_3=3),
        ],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)

    analysis = DefaultUndercutRegionAnalyzer().analyze(
        context,
        face_analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
        _build_undercut_result(
            face_analysis,
            confirmed_face_indices={0, 2},
            ambiguous_face_indices={1},
        ),
        None,
    )

    assert analysis.region_count == 2
    assert analysis.regions[0].adjacent_ambiguous_face_indices == (1,)
    assert analysis.regions[1].adjacent_ambiguous_face_indices == (1,)
    assert analysis.regions[0].ambiguous_bridge_region_ids == ("undercut-region-0002",)
    assert analysis.regions[1].ambiguous_bridge_region_ids == ("undercut-region-0001",)


def test_missing_draft_analysis_does_not_block_region_analysis() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)

    analysis = DefaultUndercutRegionAnalyzer().analyze(
        context,
        face_analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
        _build_undercut_result(face_analysis, confirmed_face_indices={0}),
        None,
    )

    assert analysis.is_evaluable is True
    assert analysis.regions[0].draft_summary is None
    assert analysis.warnings[0].code is (
        UndercutRegionAnalysisWarningCode.DRAFT_ANALYSIS_UNAVAILABLE
    )


def test_non_manifold_edge_is_reported_without_blocking_analysis() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=1.0, y=1.0, z=0.0),
            Vertex(x=0.5, y=0.5, z=1.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=1, vertex_2=0, vertex_3=3),
            Face(vertex_1=0, vertex_2=1, vertex_3=4),
        ],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)

    analysis = DefaultUndercutRegionAnalyzer().analyze(
        context,
        face_analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
        _build_undercut_result(face_analysis, confirmed_face_indices={0, 1, 2}),
        None,
    )

    assert analysis.is_evaluable is True
    assert analysis.region_count == 1
    assert analysis.regions[0].touches_non_manifold_edge is True
    assert analysis.regions[0].affected_non_manifold_edge_count == 1
    assert any(
        warning.code
        is UndercutRegionAnalysisWarningCode.NON_MANIFOLD_CONNECTIVITY_PRESENT
        for warning in analysis.warnings
    )


def test_report_to_dict_serializes_region_analysis_stably() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    region_analysis = DefaultUndercutRegionAnalyzer().analyze(
        context,
        face_analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
        _build_undercut_result(face_analysis, confirmed_face_indices={0}),
        None,
    )
    report = DetailedMoldAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=context.source,
        summary="ok",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        undercut_region_analysis=region_analysis,
    )

    first = report.to_dict()
    second = report.to_dict()

    assert first == second
    assert first["undercut_region_analysis"]["regions"][0]["region_id"] == (
        "undercut-region-0001"
    )
    assert first["undercut_region_analysis"]["warnings"][0]["code"] == (
        "draft_analysis_unavailable"
    )
