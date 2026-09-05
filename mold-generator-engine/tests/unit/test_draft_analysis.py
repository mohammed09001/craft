from __future__ import annotations

from math import cos, inf, nan, radians, sin
from pathlib import Path

import pytest

from mold_generator_engine.config import DraftAnalysisSettings
from mold_generator_engine.geometry import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DraftAdequacy,
    DraftAnalysisWarningCode,
    DraftReleaseSide,
    DraftSurfaceType,
    FaceGeometry,
    FaceGeometryAnalysis,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionRankingScoreBreakdown,
    PullDirectionSource,
    PullDirectionSourceReference,
    RankedPullDirectionEvaluation,
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
from mold_generator_engine.pipeline.detailed_mold_analysis.draft_analysis import (
    DefaultDraftAngleAnalyzer,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.face_analysis import (
    analyze_model_face_geometry,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


def _analysis(*faces: FaceGeometry) -> FaceGeometryAnalysis:
    valid_faces = [
        face
        for face in faces
        if not face.is_degenerate and face.unit_normal is not None and face.area > 0.0
    ]
    return FaceGeometryAnalysis(
        faces=faces,
        total_face_count=len(faces),
        valid_face_count=len(valid_faces),
        degenerate_face_count=sum(face.is_degenerate for face in faces),
        valid_surface_area_sq_mm=sum(face.area for face in valid_faces),
        degenerate_face_indices=tuple(
            face.face_index for face in faces if face.is_degenerate
        ),
    )


def _face(
    face_index: int,
    *,
    area: float,
    unit_normal: Vector3D | None,
    is_degenerate: bool = False,
) -> FaceGeometry:
    return FaceGeometry(
        face_index=face_index,
        vertex_indices=(0, 1, 2),
        centroid=Vector3D(0.0, 0.0, 0.0),
        raw_normal=unit_normal,
        unit_normal=unit_normal,
        area=area,
        is_degenerate=is_degenerate,
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


def _build_cube_model() -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=1.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
        Vertex(x=0.0, y=0.0, z=1.0),
        Vertex(x=1.0, y=0.0, z=1.0),
        Vertex(x=1.0, y=1.0, z=1.0),
        Vertex(x=0.0, y=1.0, z=1.0),
    ]
    faces = [
        Face(vertex_1=0, vertex_2=2, vertex_3=1),
        Face(vertex_1=0, vertex_2=3, vertex_3=2),
        Face(vertex_1=4, vertex_2=5, vertex_3=6),
        Face(vertex_1=4, vertex_2=6, vertex_3=7),
        Face(vertex_1=0, vertex_2=1, vertex_3=5),
        Face(vertex_1=0, vertex_2=5, vertex_3=4),
        Face(vertex_1=3, vertex_2=7, vertex_3=6),
        Face(vertex_1=3, vertex_2=6, vertex_3=2),
        Face(vertex_1=0, vertex_2=4, vertex_3=7),
        Face(vertex_1=0, vertex_2=7, vertex_3=3),
        Face(vertex_1=1, vertex_2=2, vertex_3=6),
        Face(vertex_1=1, vertex_2=6, vertex_3=5),
    ]
    return _build_model(vertices, faces)


def _build_context(model: ImportedModel) -> ImportAnalysisReport:
    return ImportAnalysisReport(
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


def _context(model: ImportedModel):
    from mold_generator_engine.models.detailed_mold_analysis import (
        DetailedMoldAnalysisContext,
    )

    return DetailedMoldAnalysisContext.from_report(_build_context(model), model)


def _selection(
    direction: Vector3D,
    *,
    status: PreliminaryPullDirectionSelectionStatus = (
        PreliminaryPullDirectionSelectionStatus.SELECTED
    ),
) -> PreliminaryPullDirectionSelection:
    candidate = PullDirectionCandidate(
        candidate_id=f"axis:{direction.x}:{direction.y}:{direction.z}",
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
    ranked_evaluation = RankedPullDirectionEvaluation(
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
        is_engineering_tie_with_top=True,
        is_near_tie_with_top=True,
        shares_axis_with_top=True,
        axis_equivalence_key=(0, 0, 1),
    )
    return PreliminaryPullDirectionSelection(
        status=status,
        ranked_evaluations=(ranked_evaluation,),
        selected_evaluation=ranked_evaluation,
        decisiveness=(
            PreliminaryPullDirectionSelectionDecisiveness.CLEAR
            if status is PreliminaryPullDirectionSelectionStatus.SELECTED
            else PreliminaryPullDirectionSelectionDecisiveness.AMBIGUOUS
        ),
    )


def _unit_normal_from_signed_draft_angle(angle_degrees: float) -> Vector3D:
    angle_radians = radians(angle_degrees)
    return Vector3D(cos(angle_radians), 0.0, sin(angle_radians))


def test_cube_with_positive_z_classifies_pull_facing_and_near_zero_faces() -> None:
    model = _build_cube_model()
    analyzer = DefaultDraftAngleAnalyzer()

    result = analyzer.analyze(
        _context(model),
        analyze_model_face_geometry(model),
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.is_evaluable is True
    assert result.summary is not None
    assert result.summary.face_count_by_surface_type[DraftSurfaceType.PULL_FACING] == 4
    assert (
        result.summary.face_count_by_surface_type[DraftSurfaceType.NEAR_ZERO_DRAFT] == 8
    )
    assert result.summary.face_count_by_adequacy[DraftAdequacy.ZERO_OR_NEAR_ZERO] == 8

    face_results = {face.face_index: face for face in result.face_results}
    assert face_results[2].surface_type is DraftSurfaceType.PULL_FACING
    assert face_results[2].release_side is DraftReleaseSide.POSITIVE
    assert face_results[2].signed_draft_angle_degrees == pytest.approx(90.0)
    assert face_results[0].surface_type is DraftSurfaceType.PULL_FACING
    assert face_results[0].release_side is DraftReleaseSide.NEGATIVE
    assert face_results[0].signed_draft_angle_degrees == pytest.approx(-90.0)
    assert face_results[4].surface_type is DraftSurfaceType.NEAR_ZERO_DRAFT
    assert face_results[4].release_side is DraftReleaseSide.NEUTRAL


def test_known_alignment_produces_expected_signed_angle_and_magnitude() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(
            4,
            area=2.0,
            unit_normal=_unit_normal_from_signed_draft_angle(30.0),
        )
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.face_results[0].alignment == pytest.approx(0.5)
    assert result.face_results[0].signed_draft_angle_degrees == pytest.approx(30.0)
    assert result.face_results[0].draft_angle_magnitude_degrees == pytest.approx(30.0)


def test_faces_above_and_below_required_draft_are_classified_correctly() -> None:
    analyzer = DefaultDraftAngleAnalyzer(
        DraftAnalysisSettings(
            zero_draft_tolerance_degrees=0.25,
            minimum_required_draft_degrees=2.0,
            pull_facing_threshold_degrees=89.0,
            numerical_tolerance=1e-6,
        )
    )
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(3.0)),
        _face(1, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(1.0)),
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.face_results[0].surface_type is DraftSurfaceType.DRAFTED
    assert result.face_results[0].adequacy is DraftAdequacy.SUFFICIENT
    assert result.face_results[1].surface_type is DraftSurfaceType.DRAFTED
    assert result.face_results[1].adequacy is DraftAdequacy.INSUFFICIENT


def test_threshold_boundaries_are_deterministic() -> None:
    analyzer = DefaultDraftAngleAnalyzer(
        DraftAnalysisSettings(
            zero_draft_tolerance_degrees=0.25,
            minimum_required_draft_degrees=1.0,
            pull_facing_threshold_degrees=89.0,
            numerical_tolerance=1e-6,
        )
    )
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(0.25)),
        _face(1, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(1.0)),
        _face(2, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(89.0)),
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.face_results[0].surface_type is DraftSurfaceType.NEAR_ZERO_DRAFT
    assert result.face_results[1].adequacy is DraftAdequacy.SUFFICIENT
    assert result.face_results[2].surface_type is DraftSurfaceType.PULL_FACING


def test_reversing_pull_direction_changes_sign_and_release_side_only() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(0, area=2.0, unit_normal=_unit_normal_from_signed_draft_angle(15.0))
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    forward = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )
    reverse = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, -5.0)),
    )

    assert forward.face_results[0].signed_draft_angle_degrees == pytest.approx(15.0)
    assert reverse.face_results[0].signed_draft_angle_degrees == pytest.approx(-15.0)
    assert forward.face_results[0].draft_angle_magnitude_degrees == pytest.approx(
        reverse.face_results[0].draft_angle_magnitude_degrees
    )
    assert forward.face_results[0].adequacy is reverse.face_results[0].adequacy
    assert forward.face_results[0].release_side is DraftReleaseSide.POSITIVE
    assert reverse.face_results[0].release_side is DraftReleaseSide.NEGATIVE


def test_non_unit_selected_direction_is_normalized() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(20.0))
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 10.0)),
    )

    assert result.face_results[0].signed_draft_angle_degrees == pytest.approx(20.0)


def test_zero_or_non_finite_selected_direction_returns_blocked_result() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(20.0))
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    zero_result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 0.0)),
    )
    infinite_result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(inf, 0.0, 0.0)),
    )

    assert zero_result.is_evaluable is False
    assert (
        zero_result.warnings[0].code
        is DraftAnalysisWarningCode.INVALID_SELECTED_PULL_DIRECTION
    )
    assert infinite_result.is_evaluable is False
    assert (
        infinite_result.warnings[0].code
        is DraftAnalysisWarningCode.INVALID_SELECTED_PULL_DIRECTION
    )


def test_invalid_normals_and_areas_become_unevaluable_without_nan_aggregates() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(5, area=nan, unit_normal=Vector3D(1.0, 0.0, 0.0), is_degenerate=True),
        _face(2, area=1.0, unit_normal=None),
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.is_evaluable is False
    assert result.summary is not None
    assert result.summary.total_surface_area_sq_mm == pytest.approx(1.0)
    assert result.summary.evaluated_surface_area_sq_mm == pytest.approx(0.0)
    assert result.summary.near_zero_draft_area_ratio == pytest.approx(0.0)
    assert [face.face_index for face in result.face_results] == [2, 5]
    assert all(
        face.surface_type is DraftSurfaceType.UNEVALUABLE
        for face in result.face_results
    )


def test_area_weighted_summary_uses_face_area_not_face_count() -> None:
    analyzer = DefaultDraftAngleAnalyzer(
        DraftAnalysisSettings(
            zero_draft_tolerance_degrees=0.25,
            minimum_required_draft_degrees=5.0,
            pull_facing_threshold_degrees=89.0,
            numerical_tolerance=1e-6,
        )
    )
    analysis = _analysis(
        _face(0, area=3.0, unit_normal=_unit_normal_from_signed_draft_angle(2.0)),
        _face(1, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(10.0)),
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.summary is not None
    assert result.summary.area_weighted_mean_drafted_magnitude_degrees == pytest.approx(
        4.0
    )
    assert result.summary.sufficient_draft_area_ratio == pytest.approx(0.25)
    assert result.summary.insufficient_draft_area_ratio == pytest.approx(0.75)


def test_zero_draft_relevant_area_keeps_ratios_safe() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=Vector3D(0.0, 0.0, 1.0)),
        _face(1, area=1.0, unit_normal=Vector3D(0.0, 0.0, -1.0)),
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(Vector3D(0.0, 0.0, 1.0)),
    )

    assert result.summary is not None
    assert result.summary.draft_relevant_area_sq_mm == pytest.approx(0.0)
    assert result.summary.sufficient_draft_area_ratio == pytest.approx(0.0)
    assert result.summary.insufficient_draft_area_ratio == pytest.approx(0.0)
    assert result.summary.near_zero_draft_area_ratio == pytest.approx(0.0)


def test_ambiguous_preliminary_selection_keeps_analysis_evaluable_but_partial() -> None:
    analyzer = DefaultDraftAngleAnalyzer()
    analysis = _analysis(
        _face(0, area=1.0, unit_normal=_unit_normal_from_signed_draft_angle(5.0))
    )
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    result = analyzer.analyze(
        _context(model),
        analysis,
        _selection(
            Vector3D(0.0, 0.0, 1.0),
            status=PreliminaryPullDirectionSelectionStatus.AMBIGUOUS,
        ),
    )

    from mold_generator_engine.models.detailed_mold_analysis import (
        DetailedMoldAnalysisStatus,
    )

    assert result.is_evaluable is True
    assert result.status is DetailedMoldAnalysisStatus.PARTIAL
    assert result.warnings[0].code is (
        DraftAnalysisWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION
    )


def test_public_root_package_exports_draft_analysis_types() -> None:
    import mold_generator_engine

    assert mold_generator_engine.DefaultDraftAngleAnalyzer is not None
    assert mold_generator_engine.DraftAnalysisResult is not None
    assert mold_generator_engine.DraftAnalysisSettings is not None
