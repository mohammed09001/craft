import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from mold_generator_engine.io.importers.model_validation import (
    collect_basic_geometry_warnings,
    is_degenerate_face,
    validate_imported_model_geometry,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    GeometryValidationError,
    ImportedModel,
    ImportWarning,
    ModelFormat,
    Vertex,
)
from mold_generator_engine.models.issues import IssueSource


def _build_model(
    *,
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


def test_is_degenerate_face_returns_false_for_valid_triangle():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    face = Face(vertex_1=0, vertex_2=1, vertex_3=2)

    assert is_degenerate_face(vertices, face) is False


def test_is_degenerate_face_returns_true_for_repeated_face_indices():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    face = Face(vertex_1=0, vertex_2=0, vertex_3=2)

    assert is_degenerate_face(vertices, face) is True


def test_is_degenerate_face_returns_true_for_collinear_triangle():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=1.0, z=1.0),
        Vertex(x=2.0, y=2.0, z=2.0),
    ]
    face = Face(vertex_1=0, vertex_2=1, vertex_3=2)

    assert is_degenerate_face(vertices, face) is True


def test_is_degenerate_face_returns_true_for_identical_coordinates():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
    ]
    face = Face(vertex_1=0, vertex_2=1, vertex_3=2)

    assert is_degenerate_face(vertices, face) is True


def test_collect_basic_geometry_warnings_returns_empty_list_for_valid_triangle():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=1, vertex_3=2)]

    warnings = collect_basic_geometry_warnings(vertices, faces)

    assert warnings == []


def test_collect_basic_geometry_warnings_adds_warning_for_repeated_face_indices():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=0, vertex_3=2)]

    warnings = collect_basic_geometry_warnings(vertices, faces)

    assert warnings == [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 1 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        )
    ]


def test_collect_basic_geometry_warnings_adds_warning_for_collinear_triangle():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=1.0, z=1.0),
        Vertex(x=2.0, y=2.0, z=2.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=1, vertex_3=2)]

    warnings = collect_basic_geometry_warnings(vertices, faces)

    assert warnings == [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 1 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        )
    ]


def test_collect_basic_geometry_warnings_adds_warning_for_identical_coordinates():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=1, vertex_3=2)]

    warnings = collect_basic_geometry_warnings(vertices, faces)

    assert warnings == [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 1 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        )
    ]


def test_collect_basic_geometry_warnings_reports_only_degenerate_faces_in_order():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
        Vertex(x=2.0, y=0.0, z=0.0),
        Vertex(x=3.0, y=0.0, z=0.0),
        Vertex(x=4.0, y=0.0, z=0.0),
    ]
    faces = [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=0, vertex_2=0, vertex_3=2),
        Face(vertex_1=1, vertex_2=2, vertex_3=3),
        Face(vertex_1=3, vertex_2=4, vertex_3=5),
    ]

    warnings = collect_basic_geometry_warnings(vertices, faces)

    assert warnings == [
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 2 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        ),
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 4 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        ),
    ]


def test_collect_basic_geometry_warnings_skips_faces_with_invalid_indices():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=1, vertex_3=99)]

    warnings = collect_basic_geometry_warnings(vertices, faces)

    assert warnings == []


def test_validate_imported_model_geometry_reports_warnings_and_allows_topology():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=0, vertex_3=2)],
    )

    result = validate_imported_model_geometry(model)

    assert result.errors == ()
    assert result.warnings == (
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 1 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
        ),
    )
    assert result.is_valid is True
    assert result.can_analyze_topology is True


def test_validate_imported_model_geometry_reports_fatal_invalid_face_indices():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=3)],
    )

    result = validate_imported_model_geometry(model)

    assert result.errors == (
        GeometryValidationError(
            code="face_index_out_of_range",
            message=(
                "Face 1 references a vertex index outside the imported vertex list."
            ),
        ),
    )
    assert result.warnings == ()
    assert result.is_valid is False
    assert result.can_analyze_topology is False
