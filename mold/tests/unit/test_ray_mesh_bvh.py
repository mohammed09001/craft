"""The BVH ray-mesh backend must give exactly the brute-force backend's answers, only faster.

Every comparison is exact equality of ``RayMeshHit`` (the face index and the float distance), not a tolerance: the BVH changes
which triangles are looked at, never how one is judged.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import pytest

from mold_generator_engine.geometry import (
    BruteForceRayMeshQuery,
    BvhRayMeshQuery,
    RayMeshHit,
    Vector3D,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)


def _model(vertices: list[Vertex], faces: list[Face]) -> ImportedModel:
    return ImportedModel(
        source_path=Path("models/ray.stl"),
        source_name="ray.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=faces,
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0), maximum=Vertex(x=1.0, y=1.0, z=1.0)
        ),
        dimensions=Dimensions(x=1.0, y=1.0, z=1.0),
        warnings=[],
        metadata={},
    )


def _soup(
    rng: random.Random, triangles: int, *, spread: float = 30.0, size: float = 6.0
) -> ImportedModel:
    vertices: list[Vertex] = []
    faces: list[Face] = []
    for _ in range(triangles):
        centre = [rng.uniform(-spread, spread) for _ in range(3)]
        base = len(vertices)
        for _ in range(3):
            vertices.append(
                Vertex(*(centre[i] + rng.uniform(-size, size) for i in range(3)))
            )
        faces.append(Face(vertex_1=base, vertex_2=base + 1, vertex_3=base + 2))
    return _model(vertices, faces)


def _icosphere(subdivisions: int, radius: float) -> ImportedModel:
    t = (1 + math.sqrt(5)) / 2
    raw = [
        (-1, t, 0),
        (1, t, 0),
        (-1, -t, 0),
        (1, -t, 0),
        (0, -1, t),
        (0, 1, t),
        (0, -1, -t),
        (0, 1, -t),
        (t, 0, -1),
        (t, 0, 1),
        (-t, 0, -1),
        (-t, 0, 1),
    ]
    points = [
        tuple(c / math.sqrt(x * x + y * y + z * z) for c in (x, y, z))
        for x, y, z in raw
    ]
    tris = [
        (0, 11, 5),
        (0, 5, 1),
        (0, 1, 7),
        (0, 7, 10),
        (0, 10, 11),
        (1, 5, 9),
        (5, 11, 4),
        (11, 10, 2),
        (10, 7, 6),
        (7, 1, 8),
        (3, 9, 4),
        (3, 4, 2),
        (3, 2, 6),
        (3, 6, 8),
        (3, 8, 9),
        (4, 9, 5),
        (2, 4, 11),
        (6, 2, 10),
        (8, 6, 7),
        (9, 8, 1),
    ]
    for _ in range(subdivisions):
        cache: dict[tuple[int, int], int] = {}

        def mid(a: int, b: int, cache: dict[tuple[int, int], int] = cache) -> int:
            key = (a, b) if a < b else (b, a)
            if key not in cache:
                x, y, z = (points[a][i] + points[b][i] for i in range(3))
                n = math.sqrt(x * x + y * y + z * z)
                points.append((x / n, y / n, z / n))
                cache[key] = len(points) - 1
            return cache[key]

        nxt = []
        for a, b, c in tris:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nxt += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        tris = nxt
    return _model(
        [Vertex(x=p[0] * radius, y=p[1] * radius, z=p[2] * radius) for p in points],
        [Face(vertex_1=a, vertex_2=b, vertex_3=c) for a, b, c in tris],
    )


def _random_direction(rng: random.Random) -> Vector3D:
    choice = rng.random()
    if (
        choice < 0.25
    ):  # axis-aligned and diagonal directions: zero components exercise the slab test's zero branch
        axes = [
            (1, 0, 0),
            (0, 1, 0),
            (0, 0, 1),
            (1, 1, 0),
            (0, 1, 1),
            (1, 0, 1),
            (1, 1, 1),
        ]
        x, y, z = rng.choice(axes)
        sign = rng.choice((-1.0, 1.0))
        return Vector3D(
            x * sign, y * -sign if rng.random() < 0.5 else y * sign, float(z)
        )
    while True:
        v = Vector3D(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))
        magnitude = v.magnitude()
        if magnitude > 1e-6:
            return v * (1.0 / magnitude)


def _compare(
    model: ImportedModel, rays: int, seed: int, *, epsilon: float, origin_spread: float
) -> int:
    rng = random.Random(seed)
    brute = BruteForceRayMeshQuery.from_model(model, intersection_epsilon_mm=epsilon)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=epsilon)
    assert bvh.triangles == brute.triangles
    hits = 0
    for _ in range(rays):
        if (
            rng.random() < 0.2 and model.vertices
        ):  # start exactly on a vertex: rays that graze edges and corners
            vertex = rng.choice(model.vertices)
            origin = Vector3D(vertex.x, vertex.y, vertex.z)
        else:
            origin = Vector3D(
                *(rng.uniform(-origin_spread, origin_spread) for _ in range(3))
            )
        direction = _random_direction(rng)
        ignored = (
            rng.randrange(len(model.faces))
            if model.faces and rng.random() < 0.4
            else None
        )
        floor = rng.choice((None, None, 0.0, 0.05, 0.5, 3.0))
        expected = brute.first_hit(
            origin, direction, ignored_face_index=ignored, min_distance_mm=floor
        )
        actual = bvh.first_hit(
            origin, direction, ignored_face_index=ignored, min_distance_mm=floor
        )
        assert actual == expected, (
            f"ray {origin} {direction} ignored={ignored} floor={floor}: {actual} != {expected}"
        )
        hits += expected is not None
    return hits


@pytest.mark.parametrize("seed", [1, 2, 3])
@pytest.mark.parametrize("epsilon", [1e-9, 1e-6, 1e-3])
def test_random_triangle_soup_gives_identical_hits(seed: int, epsilon: float) -> None:
    model = _soup(random.Random(seed), triangles=300, spread=22.0, size=7.0)
    hits = _compare(
        model, rays=1500, seed=seed * 7 + 1, epsilon=epsilon, origin_spread=45.0
    )
    assert hits > 240, (
        "the rays must actually hit things, or the comparison proves little"
    )


@pytest.mark.parametrize("subdivisions", [1, 2, 3])
def test_icosphere_gives_identical_hits_including_rays_from_inside(
    subdivisions: int,
) -> None:
    model = _icosphere(subdivisions, 15.0)
    hits = _compare(
        model, rays=1500, seed=subdivisions, epsilon=1e-6, origin_spread=22.0
    )
    assert hits > 350


def test_identical_overlapping_triangles_tie_to_the_lowest_face_index() -> None:
    # Five copies of one triangle at the same distance: the brute-force scan keeps the first (lowest) face.
    vertices = [
        Vertex(x=-1.0, y=-1.0, z=5.0),
        Vertex(x=1.0, y=-1.0, z=5.0),
        Vertex(x=0.0, y=1.0, z=5.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=1, vertex_3=2) for _ in range(5)]
    model = _model(vertices, faces)
    ray = (Vector3D(0.0, 0.0, 0.0), Vector3D(0.0, 0.0, 1.0))
    brute = BruteForceRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    assert brute.first_hit(*ray) == RayMeshHit(face_index=0, distance_mm=5.0)
    assert bvh.first_hit(*ray) == brute.first_hit(*ray)
    assert bvh.first_hit(*ray, ignored_face_index=0) == brute.first_hit(
        *ray, ignored_face_index=0
    )
    assert bvh.first_hit(*ray, ignored_face_index=0) == RayMeshHit(
        face_index=1, distance_mm=5.0
    )


def test_many_equal_distance_triangles_in_a_larger_mesh_still_tie_like_brute_force() -> (
    None
):
    # A stack of identical triangles among random ones, so the tie is resolved across leaves of the hierarchy.
    rng = random.Random(11)
    model = _soup(rng, triangles=120)
    base = len(model.vertices)
    model.vertices.extend(
        [
            Vertex(x=-2.0, y=-2.0, z=100.0),
            Vertex(x=2.0, y=-2.0, z=100.0),
            Vertex(x=0.0, y=2.0, z=100.0),
        ]
    )
    for _ in range(40):
        model.faces.append(Face(vertex_1=base, vertex_2=base + 1, vertex_3=base + 2))
    brute = BruteForceRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    for ignored in (None, 120, 121, 130):
        ray = (Vector3D(0.0, 0.0, 60.0), Vector3D(0.0, 0.0, 1.0))
        assert bvh.first_hit(*ray, ignored_face_index=ignored) == brute.first_hit(
            *ray, ignored_face_index=ignored
        )
    assert (
        bvh.first_hit(Vector3D(0.0, 0.0, 60.0), Vector3D(0.0, 0.0, 1.0)).face_index
        == 120
    )


def test_degenerate_out_of_range_and_non_finite_triangles_are_skipped_like_brute_force() -> (
    None
):
    vertices = [
        Vertex(x=0.0, y=0.0, z=3.0),
        Vertex(x=4.0, y=0.0, z=3.0),
        Vertex(x=0.0, y=4.0, z=3.0),
        Vertex(x=math.nan, y=0.0, z=1.0),
        Vertex(x=1.0, y=1.0, z=1.0),
        Vertex(x=2.0, y=2.0, z=1.0),
    ]
    faces = [
        Face(vertex_1=0, vertex_2=1, vertex_3=2),
        Face(vertex_1=0, vertex_2=0, vertex_3=1),  # repeated vertex
        Face(vertex_1=0, vertex_2=1, vertex_3=99),  # out of range
        Face(vertex_1=3, vertex_2=4, vertex_3=5),  # not finite
    ]
    model = _model(vertices, faces)
    brute = BruteForceRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    assert len(bvh.triangles) == 1
    ray = (Vector3D(1.0, 1.0, 0.0), Vector3D(0.0, 0.0, 1.0))
    assert (
        bvh.first_hit(*ray)
        == brute.first_hit(*ray)
        == RayMeshHit(face_index=0, distance_mm=3.0)
    )


def test_empty_mesh_and_non_finite_rays_return_none() -> None:
    empty = _model([], [])
    assert (
        BvhRayMeshQuery.from_model(empty, intersection_epsilon_mm=1e-6).first_hit(
            Vector3D(0, 0, 0), Vector3D(0, 0, 1)
        )
        is None
    )
    model = _icosphere(1, 5.0)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    assert bvh.first_hit(Vector3D(math.nan, 0, 0), Vector3D(0, 0, 1)) is None
    assert bvh.first_hit(Vector3D(0, 0, 0), Vector3D(math.inf, 0, 1)) is None


def test_the_hierarchy_visits_far_fewer_triangles_than_the_mesh_has() -> None:
    # Not a timing: a count of the work. A ray through a 1,280-face sphere must judge a small fraction of the triangles.
    model = _icosphere(3, 15.0)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-6)
    judged = 0
    import mold_generator_engine.geometry.ray_mesh_bvh as module

    original = module._box_accepts

    def counting(*args, **kwargs):  # every box test, node or triangle
        nonlocal judged
        judged += 1
        return original(*args, **kwargs)

    module._box_accepts = counting
    try:
        for x in range(-10, 11, 4):
            bvh.first_hit(Vector3D(float(x), 0.0, -40.0), Vector3D(0.0, 0.0, 1.0))
    finally:
        module._box_accepts = original
    rays = len(range(-10, 11, 4))
    assert judged / rays < len(bvh.triangles) / 4, (
        f"{judged / rays:.0f} box tests per ray for {len(bvh.triangles)} triangles"
    )


def test_a_hit_just_outside_a_triangle_but_within_epsilon_is_rejected_by_the_box_test_like_brute_force() -> (
    None
):
    # The triangle's box ends at x = 0. A ray at x = -0.0005 misses the box, so the brute-force backend never looks at the
    # triangle, although its barycentric test (u >= -epsilon, epsilon 1e-3) would have accepted the point. The hierarchy must
    # apply the same per-triangle box test, or it would report a hit the brute-force backend does not.
    vertices = [
        Vertex(x=0.0, y=0.0, z=5.0),
        Vertex(x=1.0, y=0.0, z=5.0),
        Vertex(x=0.0, y=1.0, z=5.0),
        # a second, distant triangle in the same leaf: the leaf's box now reaches past x = 0, so only the triangle's own
        # box test keeps the ray at x = -0.0005 away from the first one
        Vertex(x=-5.0, y=10.0, z=20.0),
        Vertex(x=-4.0, y=10.0, z=20.0),
        Vertex(x=-5.0, y=11.0, z=20.0),
    ]
    model = _model(
        vertices,
        [
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=3, vertex_2=4, vertex_3=5),
        ],
    )
    brute = BruteForceRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-3)
    bvh = BvhRayMeshQuery.from_model(model, intersection_epsilon_mm=1e-3)
    outside = (Vector3D(-0.0005, 0.25, 0.0), Vector3D(0.0, 0.0, 1.0))
    inside = (Vector3D(0.25, 0.25, 0.0), Vector3D(0.0, 0.0, 1.0))
    assert brute.first_hit(*outside) is None
    assert bvh.first_hit(*outside) is None
    assert brute.first_hit(*inside) == RayMeshHit(face_index=0, distance_mm=5.0)
    assert bvh.first_hit(*inside) == brute.first_hit(*inside)
