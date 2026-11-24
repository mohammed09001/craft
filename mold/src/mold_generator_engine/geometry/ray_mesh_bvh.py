from __future__ import annotations

from math import inf, isfinite

from mold_generator_engine.geometry.ray_mesh_query import (
    BruteForceRayMeshQuery,
    RayMeshHit,
)
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.imported_model import ImportedModel

_LEAF_SIZE = 6


def _box_accepts(
    ox: float,
    oy: float,
    oz: float,
    ix: float | None,
    iy: float | None,
    iz: float | None,
    floor: float,
    x0: float,
    y0: float,
    z0: float,
    x1: float,
    y1: float,
    z1: float,
) -> bool:
    """The slab test of ``ray_mesh_query._ray_intersects_aabb``, operation for operation.

    ``ix``/``iy``/``iz`` are the inverse direction components, ``None`` where the component is exactly zero. The interval starts
    at ``floor``, as the brute-force test starts it at its minimum distance.
    """
    lo = floor
    hi = inf
    if ix is None:
        if ox < x0 or ox > x1:
            return False
    else:
        a = (x0 - ox) * ix
        b = (x1 - ox) * ix
        if a > b:
            a, b = b, a
        if a > lo:
            lo = a
        if b < hi:
            hi = b
        if hi < lo:
            return False
    if iy is None:
        if oy < y0 or oy > y1:
            return False
    else:
        a = (y0 - oy) * iy
        b = (y1 - oy) * iy
        if a > b:
            a, b = b, a
        if a > lo:
            lo = a
        if b < hi:
            hi = b
        if hi < lo:
            return False
    if iz is None:
        if oz < z0 or oz > z1:
            return False
    else:
        a = (z0 - oz) * iz
        b = (z1 - oz) * iz
        if a > b:
            a, b = b, a
        if a > lo:
            lo = a
        if b < hi:
            hi = b
        if hi < lo:
            return False
    return hi >= lo


class BvhRayMeshQuery:
    """Ray-mesh query backend with a bounding-volume hierarchy: the same answers as ``BruteForceRayMeshQuery``, found faster.

    It returns exactly what the brute-force backend returns, bit for bit, because it changes only which triangles are looked at,
    never how a triangle is judged:

    * The triangles are the brute-force backend's, in its order (built through ``BruteForceRayMeshQuery.from_model``).
    * A node is skipped only when the ray fails the very slab test the brute-force backend applies to each triangle's box, on a
      box that contains the boxes below it. Rounding in that test is monotonic, so a ray that reaches a triangle's box always
      reaches every box above it: no triangle the brute-force backend would consider is ever skipped. (There is no pruning by hit
      distance: a hit within the epsilon tolerance can lie a hair outside its box, and the brute-force backend would take it.)
    * Every remaining triangle gets the brute-force backend's per-triangle box test and its Moller-Trumbore test with the same
      arithmetic in the same order.
    * Of several hits at the same distance the lowest face index wins, which is what the brute-force backend's ascending scan with
      a strict "closer than" comparison gives.
    """

    __slots__ = (
        "_bounds",
        "_children",
        "_leaf_ranges",
        "_order",
        "_triangle_data",
        "intersection_epsilon_mm",
        "triangles",
    )

    def __init__(self, brute_force: BruteForceRayMeshQuery) -> None:
        self.intersection_epsilon_mm = brute_force.intersection_epsilon_mm
        self.triangles = brute_force.triangles

        data = []
        for triangle in self.triangles:
            a, b, c = triangle.vertex_a, triangle.vertex_b, triangle.vertex_c
            edge_a = b - a
            edge_b = c - a
            data.append(
                (
                    triangle.face_index,
                    a.x,
                    a.y,
                    a.z,
                    edge_a.x,
                    edge_a.y,
                    edge_a.z,
                    edge_b.x,
                    edge_b.y,
                    edge_b.z,
                    triangle.minimum.x,
                    triangle.minimum.y,
                    triangle.minimum.z,
                    triangle.maximum.x,
                    triangle.maximum.y,
                    triangle.maximum.z,
                )
            )
        self._triangle_data = tuple(data)

        # Build the hierarchy over triangle positions in the data tuple.
        order = list(range(len(data)))
        bounds: list[tuple[float, float, float, float, float, float]] = []
        children: list[
            tuple[int, int]
        ] = []  # (left, right) for an inner node, (-1, -1) for a leaf
        leaf_ranges: list[tuple[int, int]] = []  # [start, end) in ``order`` for a leaf

        def build(start: int, end: int) -> int:
            lo_x = min(data[i][10] for i in order[start:end])
            lo_y = min(data[i][11] for i in order[start:end])
            lo_z = min(data[i][12] for i in order[start:end])
            hi_x = max(data[i][13] for i in order[start:end])
            hi_y = max(data[i][14] for i in order[start:end])
            hi_z = max(data[i][15] for i in order[start:end])
            node = len(bounds)
            bounds.append((lo_x, lo_y, lo_z, hi_x, hi_y, hi_z))
            children.append((-1, -1))
            leaf_ranges.append((start, end))
            if end - start <= _LEAF_SIZE:
                return node
            # Split at the median centre along the axis the centres spread over most.
            extents = []
            for axis in range(3):
                centres = [
                    (data[i][10 + axis] + data[i][13 + axis]) * 0.5
                    for i in order[start:end]
                ]
                extents.append(max(centres) - min(centres))
            axis = extents.index(max(extents))
            order[start:end] = sorted(
                order[start:end],
                key=lambda i: ((data[i][10 + axis] + data[i][13 + axis]) * 0.5, i),
            )
            middle = (start + end) // 2
            left = build(start, middle)
            right = build(middle, end)
            children[node] = (left, right)
            return node

        if data:
            build(0, len(data))
        self._bounds = tuple(bounds)
        self._children = tuple(children)
        self._leaf_ranges = tuple(leaf_ranges)
        self._order = tuple(order)

    @classmethod
    def from_model(
        cls,
        model: ImportedModel,
        *,
        intersection_epsilon_mm: float,
    ) -> BvhRayMeshQuery:
        """Create the query backend from an indexed triangle mesh, like ``BruteForceRayMeshQuery.from_model``."""
        return cls(
            BruteForceRayMeshQuery.from_model(
                model, intersection_epsilon_mm=intersection_epsilon_mm
            )
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
        if not self._bounds:
            return None

        epsilon = self.intersection_epsilon_mm
        floor = epsilon if min_distance_mm is None else max(epsilon, min_distance_mm)
        ox, oy, oz = origin.x, origin.y, origin.z
        dx, dy, dz = direction.x, direction.y, direction.z
        ix = None if abs(dx) <= 0.0 else 1.0 / dx
        iy = None if abs(dy) <= 0.0 else 1.0 / dy
        iz = None if abs(dz) <= 0.0 else 1.0 / dz

        bounds = self._bounds
        children = self._children
        leaf_ranges = self._leaf_ranges
        order = self._order
        data = self._triangle_data
        box_accepts = _box_accepts
        upper = 1.0 + epsilon

        best_distance = inf
        best_face = -1
        stack = [0]
        while stack:
            node = stack.pop()
            x0, y0, z0, x1, y1, z1 = bounds[node]
            if not box_accepts(ox, oy, oz, ix, iy, iz, floor, x0, y0, z0, x1, y1, z1):
                continue
            left, right = children[node]
            if left >= 0:
                stack.append(right)
                stack.append(left)
                continue

            start, end = leaf_ranges[node]
            for position in range(start, end):
                (
                    face_index,
                    ax,
                    ay,
                    az,
                    e1x,
                    e1y,
                    e1z,
                    e2x,
                    e2y,
                    e2z,
                    bx0,
                    by0,
                    bz0,
                    bx1,
                    by1,
                    bz1,
                ) = data[order[position]]
                if face_index == ignored_face_index:
                    continue
                if not box_accepts(
                    ox, oy, oz, ix, iy, iz, floor, bx0, by0, bz0, bx1, by1, bz1
                ):
                    continue

                # Moller-Trumbore, in the brute-force backend's operation order.
                px = (dy * e2z) - (dz * e2y)
                py = (dz * e2x) - (dx * e2z)
                pz = (dx * e2y) - (dy * e2x)
                determinant = (e1x * px) + (e1y * py) + (e1z * pz)
                if abs(determinant) <= epsilon:
                    continue
                inverse_determinant = 1.0 / determinant
                tx = ox - ax
                ty = oy - ay
                tz = oz - az
                u = ((tx * px) + (ty * py) + (tz * pz)) * inverse_determinant
                if u < -epsilon or u > upper:
                    continue
                qx = (ty * e1z) - (tz * e1y)
                qy = (tz * e1x) - (tx * e1z)
                qz = (tx * e1y) - (ty * e1x)
                v = ((dx * qx) + (dy * qy) + (dz * qz)) * inverse_determinant
                if v < -epsilon:
                    continue
                if u + v > upper:
                    continue
                distance = ((e2x * qx) + (e2y * qy) + (e2z * qz)) * inverse_determinant
                if not isfinite(distance) or distance <= epsilon:
                    continue
                if distance <= floor:
                    continue
                if distance < best_distance or (
                    distance == best_distance and face_index < best_face
                ):
                    best_distance = distance
                    best_face = face_index

        if best_face < 0:
            return None
        return RayMeshHit(face_index=best_face, distance_mm=best_distance)
