from pathlib import Path

import pytest

from mold_generator_engine.exceptions import EmptyGeometryError
from mold_generator_engine.geometry.model_statistics import calculate_model_statistics
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


def _build_box_model(
    *,
    minimum: Vertex,
    size_x: float,
    size_y: float,
    size_z: float,
) -> ImportedModel:
    maximum = Vertex(
        x=minimum.x + size_x,
        y=minimum.y + size_y,
        z=minimum.z + size_z,
    )
    vertices = [
        Vertex(x=minimum.x, y=minimum.y, z=minimum.z),
        Vertex(x=maximum.x, y=minimum.y, z=minimum.z),
        Vertex(x=maximum.x, y=maximum.y, z=minimum.z),
        Vertex(x=minimum.x, y=maximum.y, z=minimum.z),
        Vertex(x=minimum.x, y=minimum.y, z=maximum.z),
        Vertex(x=maximum.x, y=minimum.y, z=maximum.z),
        Vertex(x=maximum.x, y=maximum.y, z=maximum.z),
        Vertex(x=minimum.x, y=maximum.y, z=maximum.z),
    ]
    faces = [
        Face(vertex_1=0, vertex_2=2, vertex_3=1),
        Face(vertex_1=0, vertex_2=3, vertex_3=2),
        Face(vertex_1=4, vertex_2=5, vertex_3=6),
        Face(vertex_1=4, vertex_2=6, vertex_3=7),
        Face(vertex_1=0, vertex_2=1, vertex_3=5),
        Face(vertex_1=0, vertex_2=5, vertex_3=4),
        Face(vertex_1=3, vertex_2=6, vertex_3=2),
        Face(vertex_1=3, vertex_2=7, vertex_3=6),
        Face(vertex_1=0, vertex_2=4, vertex_3=7),
        Face(vertex_1=0, vertex_2=7, vertex_3=3),
        Face(vertex_1=1, vertex_2=2, vertex_3=6),
        Face(vertex_1=1, vertex_2=6, vertex_3=5),
    ]

    return _build_model(vertices=vertices, faces=faces)


def test_calculate_model_statistics_for_single_triangle():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    statistics = calculate_model_statistics(model, analyze_model_topology(model))

    assert statistics.vertex_count == 3
    assert statistics.face_count == 1
    assert statistics.edge_count == 3
    assert statistics.bounding_box.minimum == Vertex(x=0.0, y=0.0, z=0.0)
    assert statistics.bounding_box.maximum == Vertex(x=1.0, y=1.0, z=0.0)
    assert statistics.bounding_box.size_x == pytest.approx(1.0)
    assert statistics.bounding_box.size_y == pytest.approx(1.0)
    assert statistics.bounding_box.size_z == pytest.approx(0.0)
    assert statistics.centroid.x == pytest.approx(1.0 / 3.0)
    assert statistics.centroid.y == pytest.approx(1.0 / 3.0)
    assert statistics.centroid.z == pytest.approx(0.0)
    assert statistics.surface_area == pytest.approx(0.5)
    assert statistics.volume is None
    assert statistics.volume_is_reliable is False
    assert statistics.volume_unavailable_reason is not None


def test_calculate_model_statistics_for_unit_cube():
    model = _build_box_model(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        size_x=1.0,
        size_y=1.0,
        size_z=1.0,
    )

    statistics = calculate_model_statistics(model, analyze_model_topology(model))

    assert statistics.vertex_count == 8
    assert statistics.face_count == 12
    assert statistics.edge_count == 18
    assert statistics.bounding_box.size_x == pytest.approx(1.0)
    assert statistics.bounding_box.size_y == pytest.approx(1.0)
    assert statistics.bounding_box.size_z == pytest.approx(1.0)
    assert statistics.centroid == Vertex(x=0.5, y=0.5, z=0.5)
    assert statistics.surface_area == pytest.approx(6.0)
    assert statistics.volume == pytest.approx(1.0)
    assert statistics.volume_is_reliable is True
    assert statistics.volume_unavailable_reason is None


def test_calculate_model_statistics_for_translated_rectangular_prism():
    model = _build_box_model(
        minimum=Vertex(x=1_000_000.0, y=-2_000_000.0, z=500_000.0),
        size_x=2.0,
        size_y=3.0,
        size_z=4.0,
    )

    statistics = calculate_model_statistics(model, analyze_model_topology(model))

    assert statistics.bounding_box.minimum == Vertex(
        x=1_000_000.0,
        y=-2_000_000.0,
        z=500_000.0,
    )
    assert statistics.bounding_box.maximum == Vertex(
        x=1_000_002.0,
        y=-1_999_997.0,
        z=500_004.0,
    )
    assert statistics.bounding_box.size_x == pytest.approx(2.0)
    assert statistics.bounding_box.size_y == pytest.approx(3.0)
    assert statistics.bounding_box.size_z == pytest.approx(4.0)
    assert statistics.surface_area == pytest.approx(52.0)
    assert statistics.volume == pytest.approx(24.0)
    assert statistics.volume_is_reliable is True


def test_calculate_model_statistics_with_negative_coordinates():
    model = _build_model(
        vertices=[
            Vertex(x=-3.0, y=-1.0, z=-2.0),
            Vertex(x=-1.0, y=-1.0, z=1.0),
            Vertex(x=-3.0, y=2.0, z=1.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    statistics = calculate_model_statistics(model, analyze_model_topology(model))

    assert statistics.bounding_box.minimum == Vertex(x=-3.0, y=-1.0, z=-2.0)
    assert statistics.bounding_box.maximum == Vertex(x=-1.0, y=2.0, z=1.0)
    assert statistics.bounding_box.size_x == pytest.approx(2.0)
    assert statistics.bounding_box.size_y == pytest.approx(3.0)
    assert statistics.bounding_box.size_z == pytest.approx(3.0)
    assert statistics.centroid.x == pytest.approx(-7.0 / 3.0)
    assert statistics.centroid.y == pytest.approx(0.0)
    assert statistics.centroid.z == pytest.approx(0.0)


def test_calculate_model_statistics_rejects_empty_model():
    model = _build_model(vertices=[], faces=[])

    with pytest.raises(EmptyGeometryError):
        calculate_model_statistics(model)


def test_calculate_model_statistics_handles_zero_area_triangle():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=2.0, y=0.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    statistics = calculate_model_statistics(model, analyze_model_topology(model))

    assert statistics.surface_area == pytest.approx(0.0)
    assert statistics.volume is None
    assert statistics.volume_is_reliable is False


def test_calculate_model_statistics_for_open_mesh_preserves_other_statistics():
    closed_model = _build_box_model(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        size_x=1.0,
        size_y=1.0,
        size_z=1.0,
    )
    open_model = _build_model(
        vertices=list(closed_model.vertices),
        faces=list(closed_model.faces[:-1]),
    )

    statistics = calculate_model_statistics(
        open_model, analyze_model_topology(open_model)
    )

    assert statistics.vertex_count == 8
    assert statistics.face_count == 11
    assert statistics.edge_count == 18
    assert statistics.surface_area == pytest.approx(5.5)
    assert statistics.volume is None
    assert statistics.volume_is_reliable is False
    assert statistics.volume_unavailable_reason == (
        "Volume is unavailable for open meshes with boundary edges."
    )
