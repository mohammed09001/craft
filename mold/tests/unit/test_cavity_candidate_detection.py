from __future__ import annotations

from pathlib import Path

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionOutcome,
    CavityConnectivityClassification,
    CavityFindingCode,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
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
from mold_generator_engine.pipeline.cavity_analysis.detection import (
    ShellTopologyCavityCandidateDetector,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


def test_closed_single_shell_reports_no_candidate_by_current_method() -> None:
    model = _build_model_from_shell_specs(_cube_shell((0.0, 0.0, 0.0), 10.0))

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.status is DetailedMoldAnalysisStatus.COMPLETED
    assert result.outcome is (
        CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD
    )
    assert result.candidates == ()
    assert CavityFindingCode.NO_CANDIDATE_DETECTED_BY_CURRENT_SHELL_TOPOLOGY_METHOD in {
        finding.code for finding in result.findings
    }


def test_nested_closed_shell_detects_enclosed_candidate_and_parent() -> None:
    model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 20.0),
        _cube_shell((6.0, 6.0, 6.0), 4.0),
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is CavityCandidateDetectionOutcome.CANDIDATES_DETECTED
    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.candidate_id == "cavity_candidate_001"
    assert candidate.connectivity_classification is (
        CavityConnectivityClassification.ENCLOSED
    )
    assert candidate.parent_component_index == 0
    assert candidate.nesting_depth == 1
    assert candidate.is_potential_void_boundary is True


def test_reversed_inner_shell_orientation_does_not_prevent_detection() -> None:
    model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 20.0),
        _cube_shell((6.0, 6.0, 6.0), 4.0, reverse=True),
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is CavityCandidateDetectionOutcome.CANDIDATES_DETECTED
    assert len(result.candidates) == 1
    assert result.candidates[0].connectivity_classification is (
        CavityConnectivityClassification.ENCLOSED
    )


def test_multi_level_nesting_uses_parity_and_immediate_parent() -> None:
    model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 20.0),
        _cube_shell((3.0, 3.0, 3.0), 14.0),
        _cube_shell((6.0, 6.0, 6.0), 8.0),
        _cube_shell((8.0, 8.0, 8.0), 4.0),
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is CavityCandidateDetectionOutcome.CANDIDATES_DETECTED
    assert [candidate.nesting_depth for candidate in result.candidates] == [1, 3]
    assert result.candidates[0].parent_component_index == 0
    assert result.candidates[1].parent_component_index == 2
    assert CavityFindingCode.INTERNAL_SHELL_PARITY_INDICATES_SOLID_ISLAND in {
        finding.code for finding in result.findings
    }


def test_disconnected_closed_solids_are_not_treated_as_cavities() -> None:
    model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 4.0),
        _cube_shell((20.0, 0.0, 0.0), 4.0),
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is (
        CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD
    )
    assert result.candidates == ()
    assert (
        CavityFindingCode.DISCONNECTED_SOLID_COMPONENTS_ARE_NOT_TREATED_AS_CAVITIES
        in {finding.code for finding in result.findings}
    )


def test_open_mesh_is_not_assessed_as_valid_opening() -> None:
    model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 10.0, omit_top_face=True)
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is CavityCandidateDetectionOutcome.NOT_ASSESSABLE
    assert result.candidates == ()
    assert (
        CavityFindingCode.MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION
        in {finding.code for finding in result.findings}
    )


def test_nested_open_shell_is_reported_as_mesh_boundary_not_enclosed_cavity() -> None:
    model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 20.0),
        _cube_shell((6.0, 6.0, 6.0), 4.0, omit_top_face=True),
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is CavityCandidateDetectionOutcome.NOT_ASSESSABLE
    assert len(result.candidates) == 1
    assert result.candidates[0].connectivity_classification is (
        CavityConnectivityClassification.MESH_BOUNDARY_OPEN
    )
    assert result.candidates[0].is_potential_void_boundary is False


def test_non_manifold_shell_is_not_assessable() -> None:
    vertices, faces = _cube_shell((0.0, 0.0, 0.0), 10.0)
    faces.append(faces[0])
    model = _build_model(vertices, faces)

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.outcome is CavityCandidateDetectionOutcome.NOT_ASSESSABLE
    assert CavityFindingCode.NON_MANIFOLD_SHELL_NOT_ASSESSABLE in {
        finding.code for finding in result.findings
    }


def test_candidate_order_and_ids_are_stable_when_component_input_order_changes() -> (
    None
):
    first_model = _build_model_from_shell_specs(
        _cube_shell((0.0, 0.0, 0.0), 20.0),
        _cube_shell((3.0, 3.0, 3.0), 14.0),
        _cube_shell((6.0, 6.0, 6.0), 8.0),
        _cube_shell((8.0, 8.0, 8.0), 4.0),
    )
    second_model = _build_model_from_shell_specs(
        _cube_shell((8.0, 8.0, 8.0), 4.0),
        _cube_shell((0.0, 0.0, 0.0), 20.0),
        _cube_shell((6.0, 6.0, 6.0), 8.0),
        _cube_shell((3.0, 3.0, 3.0), 14.0),
    )
    detector = ShellTopologyCavityCandidateDetector()

    first_result = detector.detect(_build_context(first_model))
    second_result = detector.detect(_build_context(second_model))

    assert [
        (
            candidate.candidate_id,
            candidate.component_index,
            candidate.parent_component_index,
            candidate.nesting_depth,
            candidate.connectivity_classification,
        )
        for candidate in first_result.candidates
    ] == [
        (
            candidate.candidate_id,
            candidate.component_index,
            candidate.parent_component_index,
            candidate.nesting_depth,
            candidate.connectivity_classification,
        )
        for candidate in second_result.candidates
    ]


def test_invalid_face_indices_block_detector() -> None:
    model = _build_model(
        [
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        [Face(vertex_1=0, vertex_2=1, vertex_3=99)],
    )

    result = ShellTopologyCavityCandidateDetector().detect(_build_context(model))

    assert result.status is DetailedMoldAnalysisStatus.BLOCKED
    assert result.outcome is CavityCandidateDetectionOutcome.NOT_ASSESSABLE
    assert CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT in {
        finding.code for finding in result.findings
    }


def _build_context(model: ImportedModel) -> CavityAnalysisContext:
    processing_decision = ModelProcessingDecision(
        status=ModelProcessingStatus.READY,
        issue_counts=IssueSeverityCounts(),
    )
    import_report = ImportAnalysisReport(
        status=ImportAnalysisReportStatus.READY,
        source=ImportAnalysisSource(
            source_name=model.source_name,
            source_path=str(model.source_path),
            file_format=model.file_format.value,
        ),
        import_succeeded=True,
        analysis_completed=True,
        summary="fixture import report",
        issue_counts=IssueSeverityCounts(),
        processing_decision=processing_decision,
    )
    detailed_report = DetailedMoldAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=import_report.source,
        summary="fixture detailed report",
        chapter_2_status=import_report.status,
        processing_decision=processing_decision,
    )
    return CavityAnalysisContext.from_reports(import_report, detailed_report, model)


def _build_model_from_shell_specs(
    *shell_specs: tuple[list[Vertex], list[Face]],
) -> ImportedModel:
    vertices: list[Vertex] = []
    faces: list[Face] = []

    for shell_vertices, shell_faces in shell_specs:
        vertex_offset = len(vertices)
        vertices.extend(shell_vertices)
        faces.extend(
            Face(
                vertex_1=face.vertex_1 + vertex_offset,
                vertex_2=face.vertex_2 + vertex_offset,
                vertex_3=face.vertex_3 + vertex_offset,
            )
            for face in shell_faces
        )

    return _build_model(vertices, faces)


def _build_model(vertices: list[Vertex], faces: list[Face]) -> ImportedModel:
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
        source_path=Path("tests/generated/cavity_fixture.stl"),
        source_name="cavity_fixture.stl",
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
        metadata={"fixture": "generated"},
    )


def _cube_shell(
    origin: tuple[float, float, float],
    size: float,
    *,
    reverse: bool = False,
    omit_top_face: bool = False,
) -> tuple[list[Vertex], list[Face]]:
    x, y, z = origin
    vertices = [
        Vertex(x=x, y=y, z=z),
        Vertex(x=x + size, y=y, z=z),
        Vertex(x=x + size, y=y + size, z=z),
        Vertex(x=x, y=y + size, z=z),
        Vertex(x=x, y=y, z=z + size),
        Vertex(x=x + size, y=y, z=z + size),
        Vertex(x=x + size, y=y + size, z=z + size),
        Vertex(x=x, y=y + size, z=z + size),
    ]
    faces = [
        Face(vertex_1=0, vertex_2=2, vertex_3=1),
        Face(vertex_1=0, vertex_2=3, vertex_3=2),
        Face(vertex_1=0, vertex_2=1, vertex_3=5),
        Face(vertex_1=0, vertex_2=5, vertex_3=4),
        Face(vertex_1=0, vertex_2=4, vertex_3=7),
        Face(vertex_1=0, vertex_2=7, vertex_3=3),
        Face(vertex_1=1, vertex_2=2, vertex_3=6),
        Face(vertex_1=1, vertex_2=6, vertex_3=5),
        Face(vertex_1=3, vertex_2=7, vertex_3=6),
        Face(vertex_1=3, vertex_2=6, vertex_3=2),
    ]
    if not omit_top_face:
        faces.extend(
            [
                Face(vertex_1=4, vertex_2=5, vertex_3=6),
                Face(vertex_1=4, vertex_2=6, vertex_3=7),
            ]
        )

    if reverse:
        faces = [
            Face(
                vertex_1=face.vertex_1,
                vertex_2=face.vertex_3,
                vertex_3=face.vertex_2,
            )
            for face in faces
        ]

    return vertices, faces
