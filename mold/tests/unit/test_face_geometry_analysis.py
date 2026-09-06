from __future__ import annotations

import math
from pathlib import Path

from mold_generator_engine.models.detailed_mold_analysis import FaceDegeneracyReason
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)
from mold_generator_engine.pipeline.detailed_mold_analysis import (
    analyze_model_face_geometry,
)


def _build_model(
    *,
    vertices: list[Vertex],
    faces: list[Face],
) -> ImportedModel:
    return ImportedModel(
        source_path=Path("models/foundation.stl"),
        source_name="foundation.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=faces,
        bounding_box=BoundingBox(
            minimum=Vertex(0.0, 0.0, 0.0),
            maximum=Vertex(1.0, 1.0, 1.0),
        ),
        dimensions=Dimensions(1.0, 1.0, 1.0),
        warnings=[],
        metadata={"fixture": "unit"},
    )


def test_face_geometry_analysis_reports_centroid_area_and_unit_normal() -> None:
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(2.0, 0.0, 0.0),
            Vertex(0.0, 2.0, 0.0),
        ],
        faces=[Face(0, 1, 2)],
    )

    analysis = analyze_model_face_geometry(model)
    face = analysis.faces[0]

    assert analysis.total_face_count == 1
    assert analysis.valid_face_count == 1
    assert analysis.degenerate_face_count == 0
    assert face.centroid is not None
    assert face.centroid.x == 2.0 / 3.0
    assert face.centroid.y == 2.0 / 3.0
    assert face.centroid.z == 0.0
    assert math.isclose(face.area, 2.0)
    assert face.unit_normal is not None
    assert face.unit_normal.is_approximately_equal(
        other=type(face.unit_normal)(0.0, 0.0, 1.0)
    )


def test_face_geometry_analysis_flips_the_normal_when_vertex_order_is_reversed() -> (
    None
):
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(1.0, 0.0, 0.0),
            Vertex(0.0, 1.0, 0.0),
        ],
        faces=[Face(0, 1, 2), Face(0, 2, 1)],
    )

    analysis = analyze_model_face_geometry(model)
    first_face = analysis.faces[0]
    second_face = analysis.faces[1]

    assert math.isclose(first_face.area, second_face.area)
    assert first_face.unit_normal is not None
    assert second_face.unit_normal is not None
    assert second_face.unit_normal == -first_face.unit_normal


def test_face_geometry_analysis_marks_duplicate_point_faces_as_degenerate() -> None:
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(1.0, 0.0, 0.0),
            Vertex(1.0, 0.0, 0.0),
        ],
        faces=[Face(0, 1, 2)],
    )

    analysis = analyze_model_face_geometry(model)
    face = analysis.faces[0]

    assert face.is_degenerate is True
    assert face.degeneracy_reason is FaceDegeneracyReason.ZERO_OR_NEAR_ZERO_AREA
    assert analysis.degenerate_face_indices == (0,)


def test_face_geometry_analysis_marks_invalid_indices_without_crashing() -> None:
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(1.0, 0.0, 0.0),
            Vertex(0.0, 1.0, 0.0),
        ],
        faces=[Face(0, 1, 4), Face(0, 1, 2)],
    )

    analysis = analyze_model_face_geometry(model)

    assert analysis.total_face_count == 2
    assert analysis.valid_face_count == 1
    assert analysis.degenerate_face_count == 1
    assert (
        analysis.faces[0].degeneracy_reason is FaceDegeneracyReason.INVALID_VERTEX_INDEX
    )
    assert analysis.faces[1].is_degenerate is False


def test_face_geometry_analysis_marks_non_finite_vertices_as_degenerate() -> None:
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(math.inf, 0.0, 0.0),
            Vertex(0.0, 1.0, 0.0),
        ],
        faces=[Face(0, 1, 2)],
    )

    analysis = analyze_model_face_geometry(model)

    assert analysis.faces[0].is_degenerate is True
    assert analysis.faces[0].degeneracy_reason is FaceDegeneracyReason.NON_FINITE_VERTEX


def test_face_geometry_analysis_does_not_mutate_the_imported_model() -> None:
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(1.0, 0.0, 0.0),
            Vertex(0.0, 1.0, 0.0),
        ],
        faces=[Face(0, 1, 2)],
    )
    original_vertices = list(model.vertices)
    original_faces = list(model.faces)
    original_metadata = dict(model.metadata)

    analyze_model_face_geometry(model)

    assert model.vertices == original_vertices
    assert model.faces == original_faces
    assert model.metadata == original_metadata


def test_face_geometry_analysis_preserves_face_order_and_is_deterministic() -> None:
    model = _build_model(
        vertices=[
            Vertex(0.0, 0.0, 0.0),
            Vertex(1.0, 0.0, 0.0),
            Vertex(0.0, 1.0, 0.0),
            Vertex(0.0, 0.0, 1.0),
        ],
        faces=[Face(0, 1, 2), Face(0, 1, 1), Face(0, 3, 1)],
    )

    first_analysis = analyze_model_face_geometry(model)
    second_analysis = analyze_model_face_geometry(model)

    assert [face.face_index for face in first_analysis.faces] == [0, 1, 2]
    assert first_analysis == second_analysis
