from __future__ import annotations

from pathlib import Path

from mold_generator_engine.geometry import RayMeshHit, Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisContext,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionDecisiveness,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionSource,
    PullDirectionSourceReference,
    RankedPullDirectionEvaluation,
    UndercutAnalysisOutcome,
    UndercutAnalysisWarningCode,
    UndercutFaceClassification,
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
from mold_generator_engine.pipeline.detailed_mold_analysis.undercut import (
    PreliminaryUndercutDetector,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


class SequenceRayQueryBackend:
    def __init__(
        self,
        responses: dict[tuple[int, tuple[int, int, int]], list[RayMeshHit | None]],
    ) -> None:
        self._responses = {key: list(values) for key, values in responses.items()}

    def first_hit(
        self,
        origin: Vector3D,
        direction: Vector3D,
        *,
        ignored_face_index: int | None = None,
        min_distance_mm: float | None = None,
    ) -> RayMeshHit | None:
        del origin, min_distance_mm
        assert ignored_face_index is not None
        direction_key = direction.normalized(minimum_magnitude=0.0).canonical_key(
            tolerance=1.0
        )
        responses = self._responses.get((ignored_face_index, direction_key))
        if not responses:
            return None

        return responses.pop(0)


def _build_model(
    vertices: list[Vertex],
    faces: list[Face],
) -> ImportedModel:
    if vertices:
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
    else:
        minimum = Vertex(x=0.0, y=0.0, z=0.0)
        maximum = Vertex(x=0.0, y=0.0, z=0.0)

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
        score_breakdown=evaluation_to_score_breakdown(evaluation),
        score_delta_from_top=0.0,
        score_delta_from_previous=None,
        is_engineering_tie_with_top=True,
        is_near_tie_with_top=True,
        shares_axis_with_top=True,
        axis_equivalence_key=(0, 0, 1),
    )
    return PreliminaryPullDirectionSelection(
        status=PreliminaryPullDirectionSelectionStatus.SELECTED,
        ranked_evaluations=(ranked_evaluation,),
        selected_evaluation=ranked_evaluation,
        decisiveness=PreliminaryPullDirectionSelectionDecisiveness.CLEAR,
    )


def evaluation_to_score_breakdown(
    evaluation: CandidatePullDirectionEvaluation,
):
    from mold_generator_engine.models.detailed_mold_analysis import (
        PullDirectionRankingScoreBreakdown,
    )

    return PullDirectionRankingScoreBreakdown(
        engineering_score=evaluation.engineering_score,
        low_draft_area_ratio=evaluation.aggregate_metrics.low_draft_area_ratio,
        area_weighted_mean_draft_angle_degrees=(
            evaluation.aggregate_metrics.area_weighted_mean_draft_angle_degrees
        ),
        total_analyzed_area_sq_mm=(
            evaluation.aggregate_metrics.total_analyzed_area_sq_mm
        ),
        warning_count=len(evaluation.warnings),
    )


def test_cube_is_evaluable_and_has_no_confirmed_undercut_regions() -> None:
    model = _build_cube_model()
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    detector = PreliminaryUndercutDetector()

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert result.is_evaluable is True
    assert result.outcome is UndercutAnalysisOutcome.CLEAR
    assert result.confirmed_region_count == 0
    assert result.potential_region_count == 0
    assert result.regions == ()
    assert all(
        assessment.classification is UndercutFaceClassification.CLEAR
        for assessment in result.face_assessments[4:]
    )


def test_bidirectionally_blocked_samples_produce_confirmed_region() -> None:
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
    hit = RayMeshHit(face_index=99, distance_mm=1.0)
    backend = SequenceRayQueryBackend(
        {
            (0, (0, 0, 1)): [hit, hit, hit, hit],
            (0, (0, 0, -1)): [hit, hit, hit, hit],
        }
    )
    detector = PreliminaryUndercutDetector(
        ray_query_backend_factory=lambda _context, _epsilon: backend
    )

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert result.outcome is UndercutAnalysisOutcome.CONFIRMED_UNDERCUTS_FOUND
    assert result.confirmed_region_count == 1
    assert result.regions[0].face_indices == (0,)


def test_mixed_samples_are_classified_as_potential_undercut() -> None:
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
    hit = RayMeshHit(face_index=42, distance_mm=1.0)
    backend = SequenceRayQueryBackend(
        {
            (0, (0, 0, 1)): [hit, hit, hit, hit],
            (0, (0, 0, -1)): [hit, hit, None, None],
        }
    )
    detector = PreliminaryUndercutDetector(
        ray_query_backend_factory=lambda _context, _epsilon: backend
    )

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert result.outcome is UndercutAnalysisOutcome.POTENTIAL_UNDERCUTS_FOUND
    assert result.face_assessments[0].classification is (
        UndercutFaceClassification.POTENTIAL_UNDERCUT
    )
    assert result.regions[0].potential_face_count == 1


def test_adjacent_undercut_faces_are_grouped_into_one_region() -> None:
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
    hit = RayMeshHit(face_index=100, distance_mm=1.0)
    backend = SequenceRayQueryBackend(
        {
            (0, (0, 0, 1)): [hit, hit, hit, hit],
            (0, (0, 0, -1)): [hit, hit, hit, hit],
            (1, (0, 0, 1)): [hit, hit, hit, hit],
            (1, (0, 0, -1)): [hit, hit, hit, hit],
        }
    )
    detector = PreliminaryUndercutDetector(
        ray_query_backend_factory=lambda _context, _epsilon: backend
    )

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert len(result.regions) == 1
    assert result.regions[0].face_indices == (0, 1)


def test_disconnected_undercut_face_groups_produce_two_regions() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=1.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=10.0, y=0.0, z=0.0),
            Vertex(x=11.0, y=0.0, z=0.0),
            Vertex(x=11.0, y=1.0, z=0.0),
            Vertex(x=10.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=2, vertex_3=3),
            Face(vertex_1=4, vertex_2=5, vertex_3=6),
            Face(vertex_1=4, vertex_2=6, vertex_3=7),
        ],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    hit = RayMeshHit(face_index=100, distance_mm=1.0)
    backend = SequenceRayQueryBackend(
        {
            (0, (0, 0, 1)): [hit, hit, hit, hit],
            (0, (0, 0, -1)): [hit, hit, hit, hit],
            (1, (0, 0, 1)): [hit, hit, hit, hit],
            (1, (0, 0, -1)): [hit, hit, hit, hit],
            (2, (0, 0, 1)): [hit, hit, hit, hit],
            (2, (0, 0, -1)): [hit, hit, hit, hit],
            (3, (0, 0, 1)): [hit, hit, hit, hit],
            (3, (0, 0, -1)): [hit, hit, hit, hit],
        }
    )
    detector = PreliminaryUndercutDetector(
        ray_query_backend_factory=lambda _context, _epsilon: backend
    )

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert len(result.regions) == 2
    assert {region.face_indices for region in result.regions} == {(0, 1), (2, 3)}


def test_reversing_the_selected_direction_on_the_same_axis_preserves_regions() -> None:
    model = _build_cube_model()
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    detector = PreliminaryUndercutDetector()

    forward = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )
    reverse = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, -1.0))
    )

    assert forward.outcome == reverse.outcome
    assert forward.regions == reverse.regions
    assert [assessment.classification for assessment in forward.face_assessments] == [
        assessment.classification for assessment in reverse.face_assessments
    ]
    assert forward.selected_pull_direction is not None
    assert reverse.selected_pull_direction is not None
    assert forward.selected_pull_direction.direction == Vector3D(0.0, 0.0, 1.0)
    assert reverse.selected_pull_direction.direction == Vector3D(0.0, 0.0, -1.0)


def test_zero_selected_direction_returns_unevaluable_warning_without_crashing() -> None:
    model = _build_cube_model()
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    detector = PreliminaryUndercutDetector()

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 0.0))
    )

    assert result.is_evaluable is False
    assert result.outcome is UndercutAnalysisOutcome.UNEVALUABLE
    assert result.warnings[0].code is (
        UndercutAnalysisWarningCode.INVALID_SELECTED_PULL_DIRECTION
    )


def test_empty_or_degenerate_geometry_is_handled_safely() -> None:
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=0, vertex_3=1)],
    )
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    detector = PreliminaryUndercutDetector()

    result = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert result.is_evaluable is False
    assert result.outcome is UndercutAnalysisOutcome.UNEVALUABLE


def test_detector_is_deterministic_across_repeated_runs() -> None:
    model = _build_cube_model()
    context = _build_context(model)
    face_analysis = analyze_model_face_geometry(model)
    detector = PreliminaryUndercutDetector()

    first = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )
    second = detector.analyze(
        context, face_analysis, _selection(Vector3D(0.0, 0.0, 1.0))
    )

    assert first == second


def test_public_root_package_exports_preliminary_undercut_types() -> None:
    import mold_generator_engine

    assert mold_generator_engine.PreliminaryUndercutDetector is not None
    assert mold_generator_engine.UndercutAnalysisResult is not None
    assert mold_generator_engine.UndercutFaceClassification is not None
