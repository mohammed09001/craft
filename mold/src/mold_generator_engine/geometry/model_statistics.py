from __future__ import annotations

from dataclasses import dataclass
from math import fsum, sqrt

from mold_generator_engine.exceptions import (
    EmptyGeometryError,
    InvalidGeometryDataError,
)
from mold_generator_engine.geometry.model_topology import (
    ModelTopologyAnalysis,
    collect_unique_edges,
)
from mold_generator_engine.models.imported_model import (
    ImportedModel,
    TopologyValidationResult,
    Vertex,
)


@dataclass(frozen=True, slots=True)
class AxisAlignedBoundingBox:
    """Axis-aligned bounds and extents for the current model geometry."""

    minimum: Vertex
    maximum: Vertex
    size_x: float
    size_y: float
    size_z: float


@dataclass(frozen=True, slots=True)
class ModelStatistics:
    """Basic geometric statistics for an indexed triangle mesh.

    Surface area is reported in square millimeters and volume in cubic
    millimeters because the engine uses millimeters internally.
    """

    vertex_count: int
    face_count: int
    edge_count: int
    bounding_box: AxisAlignedBoundingBox
    centroid: Vertex
    surface_area: float
    volume: float | None
    volume_is_reliable: bool
    volume_unavailable_reason: str | None


def calculate_model_statistics(
    model: ImportedModel,
    topology_result: ModelTopologyAnalysis | TopologyValidationResult | None = None,
) -> ModelStatistics:
    """Calculate deterministic mesh statistics for an imported model.

    The centroid is the arithmetic mean of all vertex coordinates, not the
    center of the bounding box.
    """
    _validate_model_geometry(model)

    bounding_box = _calculate_bounding_box(model.vertices)
    centroid = _calculate_centroid(model.vertices)
    surface_area = _calculate_surface_area(model)
    topology_analysis, missing_topology_reason = _resolve_topology_analysis(
        topology_result
    )
    volume_reason = _resolve_unreliable_volume_reason(
        topology_analysis,
        missing_topology_reason,
    )
    volume = None if volume_reason is not None else _calculate_oriented_volume(model)

    return ModelStatistics(
        vertex_count=len(model.vertices),
        face_count=len(model.faces),
        edge_count=len(collect_unique_edges(model.faces)),
        bounding_box=bounding_box,
        centroid=centroid,
        surface_area=surface_area,
        volume=None if volume is None else abs(volume),
        volume_is_reliable=volume_reason is None,
        volume_unavailable_reason=volume_reason,
    )


def _validate_model_geometry(model: ImportedModel) -> None:
    if not model.vertices or not model.faces:
        raise EmptyGeometryError("Model statistics require non-empty geometry.")

    vertex_count = len(model.vertices)

    for face_number, face in enumerate(model.faces, start=1):
        for vertex_index in (face.vertex_1, face.vertex_2, face.vertex_3):
            if 0 <= vertex_index < vertex_count:
                continue

            raise InvalidGeometryDataError(
                "Model statistics require valid face indices. "
                f"Face {face_number} references vertex index {vertex_index}."
            )


def _calculate_bounding_box(vertices: list[Vertex]) -> AxisAlignedBoundingBox:
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

    return AxisAlignedBoundingBox(
        minimum=minimum,
        maximum=maximum,
        size_x=maximum.x - minimum.x,
        size_y=maximum.y - minimum.y,
        size_z=maximum.z - minimum.z,
    )


def _calculate_centroid(vertices: list[Vertex]) -> Vertex:
    vertex_count = len(vertices)

    return Vertex(
        x=fsum(vertex.x for vertex in vertices) / vertex_count,
        y=fsum(vertex.y for vertex in vertices) / vertex_count,
        z=fsum(vertex.z for vertex in vertices) / vertex_count,
    )


def _calculate_surface_area(model: ImportedModel) -> float:
    return fsum(
        _triangle_area(model, face_index) for face_index in range(len(model.faces))
    )


def _triangle_area(model: ImportedModel, face_index: int) -> float:
    vertex_1, vertex_2, vertex_3 = _face_vertices(model, face_index)
    edge_1 = _subtract_vertices(vertex_2, vertex_1)
    edge_2 = _subtract_vertices(vertex_3, vertex_1)
    cross_product = _cross_product(edge_1, edge_2)

    return 0.5 * sqrt(_dot_product(cross_product, cross_product))


def _calculate_oriented_volume(model: ImportedModel) -> float:
    reference_vertex = model.vertices[0]

    return fsum(
        _signed_tetrahedron_volume(model, face_index, reference_vertex)
        for face_index in range(len(model.faces))
    )


def _signed_tetrahedron_volume(
    model: ImportedModel,
    face_index: int,
    reference_vertex: Vertex,
) -> float:
    vertex_1, vertex_2, vertex_3 = _face_vertices(model, face_index)
    relative_vertex_1 = _subtract_vertices(vertex_1, reference_vertex)
    relative_vertex_2 = _subtract_vertices(vertex_2, reference_vertex)
    relative_vertex_3 = _subtract_vertices(vertex_3, reference_vertex)

    return (
        _dot_product(
            relative_vertex_1,
            _cross_product(relative_vertex_2, relative_vertex_3),
        )
        / 6.0
    )


def _resolve_topology_analysis(
    topology_result: ModelTopologyAnalysis | TopologyValidationResult | None,
) -> tuple[ModelTopologyAnalysis | None, str | None]:
    if topology_result is None:
        return None, "Topology analysis was not provided."

    if isinstance(topology_result, TopologyValidationResult):
        if topology_result.was_run:
            return topology_result.analysis, None

        return None, topology_result.skip_reason or "Topology analysis was not run."

    return topology_result, None


def _resolve_unreliable_volume_reason(
    topology_analysis: ModelTopologyAnalysis | None,
    missing_topology_reason: str | None,
) -> str | None:
    if topology_analysis is None:
        return (
            "Volume is unavailable because no completed topology analysis was "
            f"available. {missing_topology_reason}"
        )

    if topology_analysis.boundary_edges:
        return "Volume is unavailable for open meshes with boundary edges."

    if topology_analysis.non_manifold_edges:
        return "Volume is unavailable for non-manifold meshes."

    if topology_analysis.duplicate_faces:
        return "Volume is unavailable for meshes with duplicate faces."

    if topology_analysis.excluded_degenerate_face_count:
        return (
            "Volume is unavailable because topology analysis excluded degenerate faces."
        )

    return None


def _face_vertices(
    model: ImportedModel,
    face_index: int,
) -> tuple[Vertex, Vertex, Vertex]:
    face = model.faces[face_index]
    return (
        model.vertices[face.vertex_1],
        model.vertices[face.vertex_2],
        model.vertices[face.vertex_3],
    )


def _subtract_vertices(vertex_a: Vertex, vertex_b: Vertex) -> Vertex:
    return Vertex(
        x=vertex_a.x - vertex_b.x,
        y=vertex_a.y - vertex_b.y,
        z=vertex_a.z - vertex_b.z,
    )


def _cross_product(vector_a: Vertex, vector_b: Vertex) -> Vertex:
    return Vertex(
        x=vector_a.y * vector_b.z - vector_a.z * vector_b.y,
        y=vector_a.z * vector_b.x - vector_a.x * vector_b.z,
        z=vector_a.x * vector_b.y - vector_a.y * vector_b.x,
    )


def _dot_product(vector_a: Vertex, vector_b: Vertex) -> float:
    return vector_a.x * vector_b.x + vector_a.y * vector_b.y + vector_a.z * vector_b.z
