from pathlib import Path

import pytest

from mold_generator_engine.exceptions import (
    CorruptedModelFileError,
    EmptyFileError,
    EmptyGeometryError,
    InvalidFilePathError,
    InvalidGeometryDataError,
)
from mold_generator_engine.io.importers.reader import ModelReader
from mold_generator_engine.io.importers.stl_reader import StlReader
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ModelFormat,
    Vertex,
)


def test_stl_reader_matches_model_reader_contract():
    reader = StlReader()

    assert isinstance(reader, ModelReader)
    assert reader.file_format is ModelFormat.STL


def test_read_raises_error_when_file_does_not_exist(tmp_path: Path):
    reader = StlReader()
    source_path = tmp_path / "missing.stl"

    with pytest.raises(FileNotFoundError):
        reader.read(source_path)


def test_read_raises_error_when_path_is_directory(tmp_path: Path):
    reader = StlReader()

    with pytest.raises(InvalidFilePathError):
        reader.read(tmp_path)


def test_read_raises_error_when_file_is_empty(tmp_path: Path):
    reader = StlReader()
    source_path = tmp_path / "empty.stl"
    source_path.touch()

    with pytest.raises(EmptyFileError):
        reader.read(source_path)


def test_read_imports_single_triangle_ascii_stl():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/single_triangle_ascii.stl")

    model = reader.read(source_path)

    assert model.source_path == source_path
    assert model.source_name == "single_triangle_ascii.stl"
    assert model.file_format is ModelFormat.STL
    assert model.vertices == [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    assert model.faces == [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
    ]
    assert model.bounding_box == BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=1.0, y=1.0, z=0.0),
    )
    assert model.dimensions == Dimensions(x=1.0, y=1.0, z=0.0)
    assert model.warnings == []
    assert model.metadata == {"stl_encoding": "ascii"}


def test_read_raises_error_for_corrupted_ascii_stl():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/corrupted_ascii.stl")

    with pytest.raises(CorruptedModelFileError):
        reader.read(source_path)


def test_read_imports_single_triangle_binary_stl():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/single_triangle_binary.stl")

    model = reader.read(source_path)

    assert model.source_path == source_path
    assert model.source_name == "single_triangle_binary.stl"
    assert model.file_format is ModelFormat.STL
    assert model.vertices == [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    assert model.faces == [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
    ]
    assert model.bounding_box == BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=1.0, y=1.0, z=0.0),
    )
    assert model.dimensions == Dimensions(x=1.0, y=1.0, z=0.0)
    assert model.warnings == []
    assert model.metadata == {"stl_encoding": "binary"}


def test_read_raises_error_for_truncated_binary_stl():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/truncated_binary.stl")

    with pytest.raises(
        CorruptedModelFileError,
        match="Binary STL file size",
    ):
        reader.read(source_path)


def test_read_raises_error_for_non_finite_ascii_coordinate():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/non_finite_ascii.stl")

    with pytest.raises(InvalidGeometryDataError):
        reader.read(source_path)


def test_read_raises_error_when_ascii_stl_has_no_geometry():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/empty_geometry_ascii.stl")

    with pytest.raises(EmptyGeometryError):
        reader.read(source_path)


def test_read_leaves_geometry_validation_to_the_import_pipeline():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/degenerate_face_ascii.stl")

    model = reader.read(source_path)

    assert len(model.faces) == 2
    assert model.warnings == []


def test_read_reuses_shared_vertices_between_faces():
    reader = StlReader()
    source_path = Path("tests/fixtures/models/stl/two_triangles_ascii.stl")

    model = reader.read(source_path)

    assert len(model.vertices) == 4
    assert model.vertices == [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
        Vertex(x=1.0, y=1.0, z=0.0),
    ]
    assert model.faces == [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=1, vertex_2=3, vertex_3=2),
    ]
    assert model.warnings == []
