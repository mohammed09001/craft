from pathlib import Path

import pytest

from mold_generator_engine.exceptions import (
    CorruptedModelFileError,
    EmptyFileError,
    EmptyGeometryError,
    InvalidFilePathError,
    InvalidGeometryDataError,
)
from mold_generator_engine.io.importers.obj_reader import ObjReader
from mold_generator_engine.io.importers.reader import ModelReader
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ModelFormat,
    Vertex,
)


def _write_obj_file(tmp_path: Path, file_name: str, content: str) -> Path:
    source_path = tmp_path / file_name
    source_path.write_text(content, encoding="utf-8")
    return source_path


def test_obj_reader_matches_model_reader_contract():
    reader = ObjReader()

    assert isinstance(reader, ModelReader)
    assert reader.file_format is ModelFormat.OBJ


def test_read_imports_simple_triangular_obj():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/single_triangle.obj")

    model = reader.read(source_path)

    assert model.source_path == source_path
    assert model.source_name == "single_triangle.obj"
    assert model.file_format is ModelFormat.OBJ
    assert model.vertices == [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=10.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=5.0, z=0.0),
    ]
    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]
    assert model.bounding_box == BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=10.0, y=5.0, z=0.0),
    )
    assert model.dimensions == Dimensions(x=10.0, y=5.0, z=0.0)
    assert model.warnings == []
    assert model.metadata == {"obj_face_count": 1}
    assert all(isinstance(vertex, Vertex) for vertex in model.vertices)
    assert all(isinstance(face, Face) for face in model.faces)


def test_read_supports_vertex_only_face_references():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/single_triangle.obj")

    model = reader.read(source_path)

    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]


def test_read_supports_vertex_texture_face_references():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/triangle_with_vt.obj")

    model = reader.read(source_path)

    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]
    assert model.metadata == {"obj_face_count": 1}


def test_read_supports_vertex_normal_face_references():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/triangle_with_vn.obj")

    model = reader.read(source_path)

    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]


def test_read_supports_vertex_texture_normal_face_references():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/triangle_with_vt_vn.obj")

    model = reader.read(source_path)

    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]


def test_read_supports_positive_face_indices():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/single_triangle.obj")

    model = reader.read(source_path)

    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]


def test_read_supports_negative_face_indices():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/triangle_with_negative_indices.obj")

    model = reader.read(source_path)

    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]


def test_read_triangulates_quad_faces_with_a_fan():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/quad_face.obj")

    model = reader.read(source_path)

    assert model.faces == [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=0, vertex_2=2, vertex_3=3),
    ]
    assert model.metadata == {"obj_face_count": 1}


def test_read_triangulates_polygons_with_more_than_four_vertices():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/pentagon_face.obj")

    model = reader.read(source_path)

    assert model.faces == [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=0, vertex_2=2, vertex_3=3),
        Face(vertex_1=0, vertex_2=3, vertex_3=4),
    ]
    assert model.metadata == {"obj_face_count": 1}


def test_read_ignores_comments_blank_lines_and_unneeded_obj_statements():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/ignored_statements.obj")

    model = reader.read(source_path)

    assert model.vertices == [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=2.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=3.0, z=1.0),
    ]
    assert model.faces == [Face(vertex_1=0, vertex_2=1, vertex_3=2)]
    assert model.bounding_box == BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=2.0, y=3.0, z=1.0),
    )
    assert model.dimensions == Dimensions(x=2.0, y=3.0, z=1.0)


def test_read_leaves_geometry_validation_to_the_import_pipeline():
    reader = ObjReader()
    source_path = Path("tests/fixtures/models/obj/degenerate_face.obj")

    model = reader.read(source_path)

    assert len(model.faces) == 1
    assert model.warnings == []


def test_read_raises_error_when_file_does_not_exist(tmp_path: Path):
    reader = ObjReader()
    source_path = tmp_path / "missing.obj"

    with pytest.raises(FileNotFoundError):
        reader.read(source_path)


def test_read_raises_error_when_path_is_directory(tmp_path: Path):
    reader = ObjReader()

    with pytest.raises(InvalidFilePathError):
        reader.read(tmp_path)


def test_read_raises_error_when_file_is_empty(tmp_path: Path):
    reader = ObjReader()
    source_path = tmp_path / "empty.obj"
    source_path.touch()

    with pytest.raises(EmptyFileError):
        reader.read(source_path)


def test_read_raises_error_when_file_has_no_usable_geometry(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "no_geometry.obj",
        "# comment only\nvt 0 0\nvn 0 0 1\nusemtl plastic\n",
    )

    with pytest.raises(EmptyGeometryError):
        reader.read(source_path)


def test_read_raises_error_for_vertex_with_wrong_coordinate_count(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "bad_vertex_count.obj",
        "v 0 1\nf 1 1 1\n",
    )

    with pytest.raises(
        CorruptedModelFileError,
        match="Invalid OBJ vertex at line 1: expected three coordinates.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_vertex_with_non_numeric_coordinate(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "bad_vertex_value.obj",
        "v 0 nope 1\nf 1 1 1\n",
    )

    with pytest.raises(
        CorruptedModelFileError,
        match="Invalid OBJ vertex at line 1: coordinates must be numbers.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_vertex_with_nan_coordinate(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "nan_vertex.obj",
        "v NaN 0 0\nf 1 1 1\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="Invalid OBJ vertex at line 1: coordinates must contain finite numbers.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_vertex_with_positive_infinity_coordinate(
    tmp_path: Path,
):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "infinity_vertex.obj",
        "v Infinity 0 0\nf 1 1 1\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="Invalid OBJ vertex at line 1: coordinates must contain finite numbers.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_vertex_with_negative_infinity_coordinate(
    tmp_path: Path,
):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "negative_infinity_vertex.obj",
        "v -Infinity 0 0\nf 1 1 1\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="Invalid OBJ vertex at line 1: coordinates must contain finite numbers.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_face_with_too_few_vertex_references(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "short_face.obj",
        "v 0 0 0\nv 1 0 0\nf 1 2\n",
    )

    with pytest.raises(
        CorruptedModelFileError,
        match=(
            "Invalid OBJ face at line 3: expected at least three vertex references."
        ),
    ):
        reader.read(source_path)


def test_read_raises_error_for_face_reference_with_zero_index(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "zero_index.obj",
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 0\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="Invalid OBJ face vertex reference at line 4: index 0 is not allowed.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_positive_face_index_out_of_range(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "positive_out_of_range.obj",
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 4\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="OBJ face vertex reference is out of range at line 4: 4.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_negative_face_index_out_of_range(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "negative_out_of_range.obj",
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -4 -2 -1\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="OBJ face vertex reference is out of range at line 4: -4.",
    ):
        reader.read(source_path)


def test_read_raises_error_for_corrupted_face_reference(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "bad_face_reference.obj",
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 nope 3\n",
    )

    with pytest.raises(
        CorruptedModelFileError,
        match=(
            "Invalid OBJ face vertex reference at line 4: "
            "vertex indices must be integers."
        ),
    ):
        reader.read(source_path)


def test_read_raises_error_when_face_appears_before_referenced_vertices(
    tmp_path: Path,
):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "face_before_vertices.obj",
        "f 1 2 3\nv 0 0 0\nv 1 0 0\nv 0 1 0\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="OBJ face vertex reference is out of range at line 1: 1.",
    ):
        reader.read(source_path)


def test_read_raises_error_when_file_has_vertices_only(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "vertices_only.obj",
        "v 0 0 0\nv 1 0 0\nv 0 1 0\n",
    )

    with pytest.raises(EmptyGeometryError):
        reader.read(source_path)


def test_read_raises_error_when_file_has_faces_only(tmp_path: Path):
    reader = ObjReader()
    source_path = _write_obj_file(
        tmp_path,
        "faces_only.obj",
        "f 1 2 3\n",
    )

    with pytest.raises(
        InvalidGeometryDataError,
        match="OBJ face vertex reference is out of range at line 1: 1.",
    ):
        reader.read(source_path)
