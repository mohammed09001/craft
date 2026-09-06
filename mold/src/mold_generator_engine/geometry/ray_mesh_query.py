from __future__ import annotations

from dataclasses import dataclass
from math import inf, isfinite

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.imported_model import ImportedModel


@dataclass(frozen=True, slots=True)
class RayMeshHit:
    """First deterministic ray hit against one indexed triangle face."""

    face_index: int
    distance_mm: float


@dataclass(frozen=True, slots=True)
class _TriangleRecord:
    face_index: int
    vertex_a: Vector3D
    vertex_b: Vector3D
    vertex_c: Vector3D
    minimum: Vector3D
    maximum: Vector3D


@dataclass(frozen=True, slots=True)
class BruteForceRayMeshQuery:
    """Replaceable mesh ray-query backend using triangle AABBs and Moller-Trumbore."""

    triangles: tuple[_TriangleRecord, ...]
    intersection_epsilon_mm: float

    @classmethod
    def from_model(
        cls,
        model: ImportedModel,
        *,
        intersection_epsilon_mm: float,
    ) -> BruteForceRayMeshQuery:
        """Create a deterministic query backend from an indexed triangle mesh."""
        triangles: list[_TriangleRecord] = []

        for face_index, face in enumerate(model.faces):
            vertex_indices = (face.vertex_1, face.vertex_2, face.vertex_3)
            if len(set(vertex_indices)) < 3:
                continue

            if any(
                vertex_index < 0 or vertex_index >= len(model.vertices)
                for vertex_index in vertex_indices
            ):
                continue

            vertices = [model.vertices[vertex_index] for vertex_index in vertex_indices]
            points = tuple(
                Vector3D(vertex.x, vertex.y, vertex.z) for vertex in vertices
            )
            if any(not point.is_finite() for point in points):
                continue

            minimum = Vector3D(
                min(point.x for point in points),
                min(point.y for point in points),
                min(point.z for point in points),
            )
            maximum = Vector3D(
                max(point.x for point in points),
                max(point.y for point in points),
                max(point.z for point in points),
            )
            triangles.append(
                _TriangleRecord(
                    face_index=face_index,
                    vertex_a=points[0],
                    vertex_b=points[1],
                    vertex_c=points[2],
                    minimum=minimum,
                    maximum=maximum,
                )
            )

        return cls(
            triangles=tuple(triangles),
            intersection_epsilon_mm=intersection_epsilon_mm,
        )

    def first_hit(
        self,
        origin: Vector3D,
        direction: Vector3D,
        *,
        ignored_face_index: int | None = None,
        min_distance_mm: float | None = None,
    ) -> RayMeshHit | None:
        """Return the nearest triangle hit strictly beyond the configured epsilon."""
        if not origin.is_finite() or not direction.is_finite():
            return None

        hit_distance_floor = (
            self.intersection_epsilon_mm
            if min_distance_mm is None
            else max(self.intersection_epsilon_mm, min_distance_mm)
        )
        closest_hit: RayMeshHit | None = None

        for triangle in self.triangles:
            if triangle.face_index == ignored_face_index:
                continue

            if not _ray_intersects_aabb(
                origin=origin,
                direction=direction,
                minimum=triangle.minimum,
                maximum=triangle.maximum,
                min_distance_mm=hit_distance_floor,
            ):
                continue

            hit_distance = _ray_triangle_intersection_distance(
                origin=origin,
                direction=direction,
                triangle=triangle,
                epsilon_mm=self.intersection_epsilon_mm,
            )
            if hit_distance is None or hit_distance <= hit_distance_floor:
                continue

            if closest_hit is None or hit_distance < closest_hit.distance_mm:
                closest_hit = RayMeshHit(
                    face_index=triangle.face_index,
                    distance_mm=hit_distance,
                )

        return closest_hit


def _ray_triangle_intersection_distance(
    *,
    origin: Vector3D,
    direction: Vector3D,
    triangle: _TriangleRecord,
    epsilon_mm: float,
) -> float | None:
    edge_a = triangle.vertex_b - triangle.vertex_a
    edge_b = triangle.vertex_c - triangle.vertex_a
    p_vector = direction.cross(edge_b)
    determinant = edge_a.dot(p_vector)

    if abs(determinant) <= epsilon_mm:
        return None

    inverse_determinant = 1.0 / determinant
    t_vector = origin - triangle.vertex_a
    barycentric_u = t_vector.dot(p_vector) * inverse_determinant
    if barycentric_u < -epsilon_mm or barycentric_u > 1.0 + epsilon_mm:
        return None

    q_vector = t_vector.cross(edge_a)
    barycentric_v = direction.dot(q_vector) * inverse_determinant
    if barycentric_v < -epsilon_mm:
        return None

    if barycentric_u + barycentric_v > 1.0 + epsilon_mm:
        return None

    hit_distance = edge_b.dot(q_vector) * inverse_determinant
    if not isfinite(hit_distance) or hit_distance <= epsilon_mm:
        return None

    return hit_distance


def _ray_intersects_aabb(
    *,
    origin: Vector3D,
    direction: Vector3D,
    minimum: Vector3D,
    maximum: Vector3D,
    min_distance_mm: float,
) -> bool:
    interval_min = min_distance_mm
    interval_max = inf

    for origin_component, direction_component, minimum_component, maximum_component in (
        (origin.x, direction.x, minimum.x, maximum.x),
        (origin.y, direction.y, minimum.y, maximum.y),
        (origin.z, direction.z, minimum.z, maximum.z),
    ):
        if abs(direction_component) <= 0.0:
            if (
                origin_component < minimum_component
                or origin_component > maximum_component
            ):
                return False
            continue

        inverse_direction = 1.0 / direction_component
        slab_entry = (minimum_component - origin_component) * inverse_direction
        slab_exit = (maximum_component - origin_component) * inverse_direction
        if slab_entry > slab_exit:
            slab_entry, slab_exit = slab_exit, slab_entry

        interval_min = max(interval_min, slab_entry)
        interval_max = min(interval_max, slab_exit)
        if interval_max < interval_min:
            return False

    return interval_max >= interval_min
