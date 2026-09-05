from collections.abc import Sequence

from mold_generator_engine.models.imported_model import (
    Face,
    GeometryValidationError,
    GeometryValidationResult,
    ImportedModel,
    ImportWarning,
    Vertex,
)
from mold_generator_engine.models.issues import IssueSource


def is_degenerate_face(
    vertices: Sequence[Vertex],
    face: Face,
) -> bool:
    """Return whether a triangle face is degenerate."""
    if len({face.vertex_1, face.vertex_2, face.vertex_3}) < 3:
        return True

    vertex_1 = vertices[face.vertex_1]
    vertex_2 = vertices[face.vertex_2]
    vertex_3 = vertices[face.vertex_3]

    edge_1 = (
        vertex_2.x - vertex_1.x,
        vertex_2.y - vertex_1.y,
        vertex_2.z - vertex_1.z,
    )
    edge_2 = (
        vertex_3.x - vertex_1.x,
        vertex_3.y - vertex_1.y,
        vertex_3.z - vertex_1.z,
    )

    cross_product = (
        edge_1[1] * edge_2[2] - edge_1[2] * edge_2[1],
        edge_1[2] * edge_2[0] - edge_1[0] * edge_2[2],
        edge_1[0] * edge_2[1] - edge_1[1] * edge_2[0],
    )

    return cross_product == (0.0, 0.0, 0.0)


def collect_basic_geometry_warnings(
    vertices: Sequence[Vertex],
    faces: Sequence[Face],
) -> list[ImportWarning]:
    """Collect non-fatal warnings for basic imported triangle geometry."""
    warnings: list[ImportWarning] = []

    for face_number, face in enumerate(faces, start=1):
        if not _has_valid_face_indices(face, len(vertices)):
            continue

        if is_degenerate_face(vertices, face):
            warnings.append(
                ImportWarning(
                    code="degenerate_face",
                    message=f"Degenerate face {face_number} has zero area.",
                    source=IssueSource.GEOMETRY_VALIDATION,
                )
            )

    return warnings


def validate_imported_model_geometry(model: ImportedModel) -> GeometryValidationResult:
    """Validate imported model geometry before downstream analysis runs."""
    errors: list[GeometryValidationError] = []

    if not model.vertices:
        errors.append(
            GeometryValidationError(
                code="missing_vertices",
                message="Imported model contains no vertices.",
            )
        )

    if not model.faces:
        errors.append(
            GeometryValidationError(
                code="missing_faces",
                message="Imported model contains no faces.",
            )
        )

    for face_number, face in enumerate(model.faces, start=1):
        if _has_valid_face_indices(face, len(model.vertices)):
            continue

        errors.append(
            GeometryValidationError(
                code="face_index_out_of_range",
                message=(
                    "Face "
                    f"{face_number} references a vertex index outside the "
                    "imported vertex list."
                ),
            )
        )

    return GeometryValidationResult(
        warnings=tuple(
            collect_basic_geometry_warnings(
                model.vertices,
                model.faces,
            )
        ),
        errors=tuple(errors),
    )


def _has_valid_face_indices(face: Face, vertex_count: int) -> bool:
    return all(
        0 <= vertex_index < vertex_count
        for vertex_index in (face.vertex_1, face.vertex_2, face.vertex_3)
    )
