from __future__ import annotations

from mold_generator_engine.geometry import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    FaceGeometry,
    FaceGeometryAnalysis,
    PullDirectionSource,
)
from mold_generator_engine.pipeline.detailed_mold_analysis import (
    DefaultCandidatePullDirectionProvider,
    generate_candidate_pull_directions,
)


def _face_analysis(*faces: FaceGeometry) -> FaceGeometryAnalysis:
    valid_face_count = sum(1 for face in faces if not face.is_degenerate)
    valid_surface_area_sq_mm = sum(
        face.area for face in faces if not face.is_degenerate
    )
    degenerate_face_indices = tuple(
        face.face_index for face in faces if face.is_degenerate
    )
    return FaceGeometryAnalysis(
        faces=faces,
        total_face_count=len(faces),
        valid_face_count=valid_face_count,
        degenerate_face_count=len(degenerate_face_indices),
        valid_surface_area_sq_mm=valid_surface_area_sq_mm,
        degenerate_face_indices=degenerate_face_indices,
    )


def _valid_face(
    face_index: int,
    direction: Vector3D,
) -> FaceGeometry:
    return FaceGeometry(
        face_index=face_index,
        vertex_indices=(0, 1, 2),
        centroid=Vector3D(0.0, 0.0, 0.0),
        raw_normal=direction,
        unit_normal=direction.normalized(minimum_magnitude=0.0),
        area=1.0,
        is_degenerate=False,
    )


def _degenerate_face(face_index: int) -> FaceGeometry:
    return FaceGeometry(
        face_index=face_index,
        vertex_indices=(0, 0, 1),
        centroid=Vector3D(0.0, 0.0, 0.0),
        raw_normal=Vector3D(0.0, 0.0, 0.0),
        unit_normal=None,
        area=0.0,
        is_degenerate=True,
    )


def test_pull_direction_generation_always_includes_the_six_global_axes() -> None:
    candidates = generate_candidate_pull_directions(_face_analysis())

    assert [candidate.direction for candidate in candidates.candidates] == [
        Vector3D(1.0, 0.0, 0.0),
        Vector3D(-1.0, 0.0, 0.0),
        Vector3D(0.0, 1.0, 0.0),
        Vector3D(0.0, -1.0, 0.0),
        Vector3D(0.0, 0.0, 1.0),
        Vector3D(0.0, 0.0, -1.0),
    ]


def test_pull_direction_generation_adds_face_normals_and_their_reverse() -> None:
    candidates = generate_candidate_pull_directions(
        _face_analysis(_valid_face(0, Vector3D(1.0, 1.0, 0.0)))
    )

    assert Vector3D(1.0, 1.0, 0.0).normalized(minimum_magnitude=0.0) in [
        candidate.direction for candidate in candidates.candidates
    ]
    assert Vector3D(-1.0, -1.0, 0.0).normalized(minimum_magnitude=0.0) in [
        candidate.direction for candidate in candidates.candidates
    ]


def test_pull_direction_generation_skips_degenerate_faces() -> None:
    candidates = generate_candidate_pull_directions(_face_analysis(_degenerate_face(0)))

    assert candidates.candidate_count == 6


def test_pull_direction_generation_merges_face_normals_that_match_global_axes() -> None:
    candidates = generate_candidate_pull_directions(
        _face_analysis(_valid_face(3, Vector3D(1.0, 0.0, 0.0)))
    )
    positive_x = candidates.candidates[0]

    assert positive_x.direction == Vector3D(1.0, 0.0, 0.0)
    assert positive_x.source is PullDirectionSource.GLOBAL_AXIS
    assert {reference.source for reference in positive_x.source_references} == {
        PullDirectionSource.GLOBAL_AXIS,
        PullDirectionSource.FACE_NORMAL,
    }
    assert positive_x.face_indices == (3,)


def test_pull_direction_generation_keeps_opposite_directions_separate() -> None:
    candidates = generate_candidate_pull_directions(
        _face_analysis(_valid_face(2, Vector3D(1.0, 0.0, 0.0)))
    )

    assert candidates.candidates[0].direction == Vector3D(1.0, 0.0, 0.0)
    assert candidates.candidates[1].direction == Vector3D(-1.0, 0.0, 0.0)


def test_pull_direction_generation_merges_nearly_identical_normals() -> None:
    provider = DefaultCandidatePullDirectionProvider(deduplication_tolerance=1e-5)
    candidates = generate_candidate_pull_directions(
        _face_analysis(
            _valid_face(0, Vector3D(0.0, 0.0, 1.0)),
            _valid_face(1, Vector3D(0.0, 0.0, 1.0 + 1e-6)),
        ),
        provider=provider,
    )

    positive_z = candidates.candidates[4]

    assert positive_z.direction == Vector3D(0.0, 0.0, 1.0)
    assert positive_z.face_indices == (0, 1)


def test_pull_direction_generation_preserves_stable_order_and_repeatability() -> None:
    analysis = _face_analysis(
        _valid_face(4, Vector3D(0.0, 1.0, 1.0)),
        _valid_face(6, Vector3D(1.0, 0.0, 1.0)),
    )

    first = generate_candidate_pull_directions(analysis)
    second = generate_candidate_pull_directions(analysis)

    assert [candidate.candidate_id for candidate in first.candidates[:6]] == [
        "axis:+x",
        "axis:-x",
        "axis:+y",
        "axis:-y",
        "axis:+z",
        "axis:-z",
    ]
    assert first == second
