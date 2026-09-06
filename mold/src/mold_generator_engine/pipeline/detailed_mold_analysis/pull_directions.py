from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.config.geometry import (
    DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
)
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    FaceGeometryAnalysis,
    PullDirectionCandidate,
    PullDirectionCandidates,
    PullDirectionSource,
    PullDirectionSourceReference,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    CandidatePullDirectionProvider,
)

_GLOBAL_AXIS_DIRECTIONS = (
    ("axis:+x", Vector3D(1.0, 0.0, 0.0)),
    ("axis:-x", Vector3D(-1.0, 0.0, 0.0)),
    ("axis:+y", Vector3D(0.0, 1.0, 0.0)),
    ("axis:-y", Vector3D(0.0, -1.0, 0.0)),
    ("axis:+z", Vector3D(0.0, 0.0, 1.0)),
    ("axis:-z", Vector3D(0.0, 0.0, -1.0)),
)


@dataclass(frozen=True, slots=True)
class DefaultCandidatePullDirectionProvider:
    """Generate deterministic candidate pull directions from face analysis."""

    deduplication_tolerance: float = DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE

    def generate_candidates(
        self,
        face_analysis: FaceGeometryAnalysis,
    ) -> PullDirectionCandidates:
        """Return stable pull-direction candidates from global axes and face normals."""
        merged_candidates: list[PullDirectionCandidate] = []
        candidate_indices_by_key: dict[tuple[int, int, int], list[int]] = {}

        for candidate_id, direction in _GLOBAL_AXIS_DIRECTIONS:
            _merge_candidate(
                merged_candidates,
                candidate_indices_by_key,
                candidate_id=candidate_id,
                direction=direction,
                source=PullDirectionSource.GLOBAL_AXIS,
                source_reference=PullDirectionSourceReference(
                    source=PullDirectionSource.GLOBAL_AXIS
                ),
                tolerance=self.deduplication_tolerance,
            )

        for face_result in face_analysis.faces:
            if face_result.unit_normal is None:
                continue

            face_candidate_id = f"face-normal:{face_result.face_index}"
            _merge_candidate(
                merged_candidates,
                candidate_indices_by_key,
                candidate_id=face_candidate_id,
                direction=face_result.unit_normal,
                source=PullDirectionSource.FACE_NORMAL,
                source_reference=PullDirectionSourceReference(
                    source=PullDirectionSource.FACE_NORMAL,
                    face_index=face_result.face_index,
                    is_reversed=False,
                ),
                tolerance=self.deduplication_tolerance,
            )
            _merge_candidate(
                merged_candidates,
                candidate_indices_by_key,
                candidate_id=f"{face_candidate_id}:reversed",
                direction=-face_result.unit_normal,
                source=PullDirectionSource.FACE_NORMAL,
                source_reference=PullDirectionSourceReference(
                    source=PullDirectionSource.FACE_NORMAL,
                    face_index=face_result.face_index,
                    is_reversed=True,
                ),
                tolerance=self.deduplication_tolerance,
            )

        return PullDirectionCandidates(candidates=tuple(merged_candidates))


DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER = DefaultCandidatePullDirectionProvider()


def generate_candidate_pull_directions(
    face_analysis: FaceGeometryAnalysis,
    *,
    provider: CandidatePullDirectionProvider = DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER,
) -> PullDirectionCandidates:
    """Generate candidate pull directions using the configured provider."""
    return provider.generate_candidates(face_analysis)


def _merge_candidate(
    merged_candidates: list[PullDirectionCandidate],
    candidate_indices_by_key: dict[tuple[int, int, int], list[int]],
    *,
    candidate_id: str,
    direction: Vector3D,
    source: PullDirectionSource,
    source_reference: PullDirectionSourceReference,
    tolerance: float,
) -> None:
    canonical_key = direction.canonical_key(tolerance=tolerance)
    matching_indices = candidate_indices_by_key.get(canonical_key, [])

    for candidate_index in matching_indices:
        existing_candidate = merged_candidates[candidate_index]
        if not existing_candidate.direction.is_approximately_equal(
            direction,
            tolerance=tolerance,
        ):
            continue

        merged_candidates[candidate_index] = PullDirectionCandidate(
            candidate_id=existing_candidate.candidate_id,
            order_index=existing_candidate.order_index,
            direction=existing_candidate.direction,
            source=existing_candidate.source,
            source_references=existing_candidate.source_references
            + (source_reference,),
        )
        return

    order_index = len(merged_candidates)
    merged_candidates.append(
        PullDirectionCandidate(
            candidate_id=candidate_id,
            order_index=order_index,
            direction=direction,
            source=source,
            source_references=(source_reference,),
        )
    )
    candidate_indices_by_key.setdefault(canonical_key, []).append(order_index)
