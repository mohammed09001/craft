from pathlib import Path

from mold_generator_engine.geometry.model_topology import analyze_model_topology
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)


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


def test_analyze_model_topology_reports_closed_tetrahedron():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=0.0, y=0.0, z=1.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=3, vertex_3=1),
            Face(vertex_1=0, vertex_2=2, vertex_3=3),
            Face(vertex_1=1, vertex_2=3, vertex_3=2),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.vertex_count == 4
    assert analysis.face_count == 4
    assert analysis.analyzed_face_count == 4
    assert analysis.excluded_degenerate_face_count == 0
    assert analysis.unique_edge_count == 6
    assert analysis.boundary_edges == ()
    assert analysis.non_manifold_edges == ()
    assert analysis.isolated_vertices == ()
    assert analysis.duplicate_faces == ()
    assert analysis.connected_component_count == 1


def test_analyze_model_topology_reports_single_triangle_boundary_edges():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    analysis = analyze_model_topology(model)

    assert analysis.boundary_edges == ((0, 1), (0, 2), (1, 2))
    assert analysis.connected_component_count == 1


def test_analyze_model_topology_treats_shared_edge_as_manifold():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=1.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=2, vertex_2=1, vertex_3=3),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.boundary_edges == ((0, 1), (0, 2), (1, 3), (2, 3))
    assert (1, 2) not in analysis.boundary_edges
    assert analysis.non_manifold_edges == ()
    assert analysis.connected_component_count == 1


def test_analyze_model_topology_reports_non_manifold_edge():
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
            Face(vertex_1=3, vertex_2=1, vertex_3=0),
            Face(vertex_1=0, vertex_2=1, vertex_3=4),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.non_manifold_edges == ((0, 1),)


def test_analyze_model_topology_reports_isolated_vertices_in_sorted_order():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=2.0, y=2.0, z=2.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    analysis = analyze_model_topology(model)

    assert analysis.isolated_vertices == (3,)


def test_analyze_model_topology_reports_one_duplicate_face_key_per_face():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=2, vertex_2=1, vertex_3=0),
            Face(vertex_1=1, vertex_2=2, vertex_3=0),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.duplicate_faces == ((0, 1, 2),)


def test_analyze_model_topology_counts_disconnected_face_groups():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=5.0, y=0.0, z=0.0),
            Vertex(x=6.0, y=0.0, z=0.0),
            Vertex(x=5.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=3, vertex_2=4, vertex_3=5),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.connected_component_count == 2


def test_analyze_model_topology_does_not_join_faces_sharing_only_one_vertex():
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

    analysis = analyze_model_topology(model)

    assert analysis.connected_component_count == 2


def test_analyze_model_topology_excludes_faces_with_repeated_vertex_indices():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=0, vertex_3=1),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.face_count == 2
    assert analysis.analyzed_face_count == 1
    assert analysis.excluded_degenerate_face_count == 1
    assert analysis.unique_edge_count == 3
    assert analysis.boundary_edges == ((0, 1), (0, 2), (1, 2))
    assert analysis.connected_component_count == 1


def test_analyze_model_topology_handles_empty_model_deterministically():
    model = _build_model(vertices=[], faces=[])

    analysis = analyze_model_topology(model)

    assert analysis.vertex_count == 0
    assert analysis.face_count == 0
    assert analysis.analyzed_face_count == 0
    assert analysis.excluded_degenerate_face_count == 0
    assert analysis.unique_edge_count == 0
    assert analysis.boundary_edges == ()
    assert analysis.non_manifold_edges == ()
    assert analysis.isolated_vertices == ()
    assert analysis.duplicate_faces == ()
    assert analysis.connected_component_count == 0


def test_analyze_model_topology_remains_index_based_for_identical_coordinates():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=2, vertex_3=3)],
    )

    analysis = analyze_model_topology(model)

    assert analysis.isolated_vertices == (1,)
    assert analysis.boundary_edges == ((0, 2), (0, 3), (2, 3))


def test_analyze_model_topology_returns_sorted_public_collections():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=2.0, y=0.0, z=0.0),
            Vertex(x=3.0, y=0.0, z=0.0),
            Vertex(x=4.0, y=0.0, z=0.0),
            Vertex(x=5.0, y=0.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=2, vertex_2=1, vertex_3=0),
            Face(vertex_1=1, vertex_2=2, vertex_3=0),
            Face(vertex_1=5, vertex_2=4, vertex_3=3),
        ],
    )

    analysis = analyze_model_topology(model)

    assert analysis.boundary_edges == ((3, 4), (3, 5), (4, 5))
    assert analysis.non_manifold_edges == ()
    assert analysis.isolated_vertices == (6,)
    assert analysis.duplicate_faces == ((0, 1, 2),)
