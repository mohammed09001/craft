from __future__ import annotations

from mold_generator_engine.config.geometry import (
    DEFAULT_FACE_DEGENERACY_AREA_TOLERANCE_SQ_MM,
)
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    FaceDegeneracyReason,
    FaceGeometry,
    FaceGeometryAnalysis,
)
from mold_generator_engine.models.imported_model import ImportedModel, Vertex


def analyze_model_face_geometry(
    model: ImportedModel,
    *,
    area_tolerance_sq_mm: float = DEFAULT_FACE_DEGENERACY_AREA_TOLERANCE_SQ_MM,
) -> FaceGeometryAnalysis:
    """Analyze every model face without mutating the original geometry."""
    face_results: list[FaceGeometry] = []
    degenerate_face_indices: list[int] = []
    valid_face_count = 0
    valid_surface_area_sq_mm = 0.0

    for face_index, face in enumerate(model.faces):
        vertex_indices = (face.vertex_1, face.vertex_2, face.vertex_3)
        face_result = analyze_face_geometry(
            model,
            face_index=face_index,
            vertex_indices=vertex_indices,
            area_tolerance_sq_mm=area_tolerance_sq_mm,
        )
        face_results.append(face_result)

        if face_result.is_degenerate:
            degenerate_face_indices.append(face_index)
            continue

        valid_face_count += 1
        valid_surface_area_sq_mm += face_result.area

    return FaceGeometryAnalysis(
        faces=tuple(face_results),
        total_face_count=len(face_results),
        valid_face_count=valid_face_count,
        degenerate_face_count=len(degenerate_face_indices),
        valid_surface_area_sq_mm=valid_surface_area_sq_mm,
        degenerate_face_indices=tuple(degenerate_face_indices),
    )


def analyze_face_geometry(
    model: ImportedModel,
    *,
    face_index: int,
    vertex_indices: tuple[int, int, int],
    area_tolerance_sq_mm: float = DEFAULT_FACE_DEGENERACY_AREA_TOLERANCE_SQ_MM,
) -> FaceGeometry:
    """Analyze one triangle face and return a safe typed result."""
    vertices: list[Vertex] = []
    for vertex_index in vertex_indices:
        if vertex_index < 0 or vertex_index >= len(model.vertices):
            return FaceGeometry(
                face_index=face_index,
                vertex_indices=vertex_indices,
                centroid=None,
                raw_normal=None,
                unit_normal=None,
                area=0.0,
                is_degenerate=True,
                degeneracy_reason=FaceDegeneracyReason.INVALID_VERTEX_INDEX,
            )

        vertices.append(model.vertices[vertex_index])

    points = tuple(Vector3D(vertex.x, vertex.y, vertex.z) for vertex in vertices)
    if any(not point.is_finite() for point in points):
        return FaceGeometry(
            face_index=face_index,
            vertex_indices=vertex_indices,
            centroid=None,
            raw_normal=None,
            unit_normal=None,
            area=0.0,
            is_degenerate=True,
            degeneracy_reason=FaceDegeneracyReason.NON_FINITE_VERTEX,
        )

    edge_a = points[1] - points[0]
    edge_b = points[2] - points[0]
    raw_normal = edge_a.cross(edge_b)
    centroid = (points[0] + points[1] + points[2]) * (1.0 / 3.0)
    area = raw_normal.magnitude() * 0.5

    if area <= area_tolerance_sq_mm:
        return FaceGeometry(
            face_index=face_index,
            vertex_indices=vertex_indices,
            centroid=centroid,
            raw_normal=raw_normal,
            unit_normal=None,
            area=area,
            is_degenerate=True,
            degeneracy_reason=FaceDegeneracyReason.ZERO_OR_NEAR_ZERO_AREA,
        )

    return FaceGeometry(
        face_index=face_index,
        vertex_indices=vertex_indices,
        centroid=centroid,
        raw_normal=raw_normal,
        unit_normal=raw_normal.normalized(minimum_magnitude=0.0),
        area=area,
        is_degenerate=False,
    )
