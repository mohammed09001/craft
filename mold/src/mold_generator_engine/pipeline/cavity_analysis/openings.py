from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass

from mold_generator_engine.config.geometry import DEFAULT_LINEAR_TOLERANCE_MM
from mold_generator_engine.geometry.mesh_adjacency import build_face_adjacency_graph
from mold_generator_engine.geometry.ray_mesh_query import BruteForceRayMeshQuery
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionResult,
    CavityConnectivityClassification,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningCandidate,
    CavityOpeningCandidateOutcome,
    CavityOpeningDetectionOutcome,
    CavityOpeningDetectionResult,
    InternalSurfaceRegion,
    InternalSurfaceRegionOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.imported_model import Face, ImportedModel, Vertex
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CavityOpeningDetector,
)


@dataclass(frozen=True, slots=True)
class ConservativeCavityOpeningDetector:
    """Detect bounded internal-surface and opening line-of-sight evidence.

    The detector uses finite deterministic centroid probes against a closed manifold
    triangle mesh. It can find simple exterior-connected pockets and through channels,
    but it does not prove completeness, clearance, or manufacturable openings.
    """

    linear_tolerance_mm: float = DEFAULT_LINEAR_TOLERANCE_MM
    occluded_direction_threshold: int = 3
    maximum_visible_direction_threshold: int = 2

    def detect(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
    ) -> CavityOpeningDetectionResult:
        """Return internal regions and grouped line-of-sight witnesses."""
        if candidate_detection.status is DetailedMoldAnalysisStatus.BLOCKED:
            return CavityOpeningDetectionResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                outcome=CavityOpeningDetectionOutcome.BLOCKED,
                summary=(
                    "Opening detection was blocked because cavity candidate "
                    "detection did not produce consumable geometry evidence."
                ),
                findings=(
                    _finding(
                        code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "Opening detection did not run because upstream "
                            "candidate detection was blocked."
                        ),
                        is_blocking=True,
                    ),
                ),
            )

        validation_finding = _validate_closed_manifold_input(context.model)
        if validation_finding is not None:
            return CavityOpeningDetectionResult(
                status=DetailedMoldAnalysisStatus.PARTIAL,
                outcome=CavityOpeningDetectionOutcome.NOT_ASSESSABLE,
                summary=(
                    "Opening detection could not assess internal regions because "
                    "the mesh topology is not a closed manifold."
                ),
                findings=(validation_finding,),
            )

        regions = list(_regions_from_nested_candidates(candidate_detection))
        sampled_regions, sampled_witnesses = _detect_sampled_regions(
            context.model,
            tolerance_mm=self.linear_tolerance_mm,
            occluded_direction_threshold=self.occluded_direction_threshold,
            maximum_visible_direction_threshold=self.maximum_visible_direction_threshold,
        )
        regions.extend(sampled_regions)
        openings = _build_openings(sampled_witnesses)

        findings: list[CavityFinding] = []
        if regions:
            findings.append(
                _finding(
                    code=CavityFindingCode.INTERNAL_SURFACE_REGION_CANDIDATE_DETECTED,
                    severity=IssueSeverity.INFO,
                    message=(
                        "Internal-surface region evidence was detected from "
                        "bounded deterministic sampling."
                    ),
                    metadata={"region_count": len(regions)},
                )
            )
        else:
            findings.append(
                _finding(
                    code=(
                        CavityFindingCode.NO_INTERNAL_SURFACE_REGION_DETECTED_BY_CURRENT_METHOD
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "No internal-surface region was detected by the current "
                        "finite sampling method. This is not proof that no cavity exists."
                    ),
                )
            )

        if openings:
            findings.append(
                _finding(
                    code=CavityFindingCode.CAVITY_OPENING_LINE_OF_SIGHT_WITNESS_DETECTED,
                    severity=IssueSeverity.INFO,
                    message=(
                        "Grouped exterior line-of-sight witnesses were detected for "
                        "one or more internal regions."
                    ),
                    metadata={"opening_candidate_count": len(openings)},
                )
            )
            findings.append(
                _finding(
                    code=(
                        CavityFindingCode.OPENING_WITNESS_IS_NOT_MANUFACTURING_OPENING_PROOF
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "Opening candidates are line-of-sight witness groups only; "
                        "they are not confirmed manufacturing openings."
                    ),
                )
            )
        else:
            findings.append(
                _finding(
                    code=CavityFindingCode.NO_OPENING_WITNESS_DETECTED_BY_CURRENT_METHOD,
                    severity=IssueSeverity.INFO,
                    message=(
                        "No opening witness was detected by the current finite "
                        "sampling method."
                    ),
                )
            )

        ordered_regions = _order_regions(regions)
        ordered_openings = tuple(sorted(openings, key=_opening_sort_key))
        return CavityOpeningDetectionResult(
            status=DetailedMoldAnalysisStatus.COMPLETED,
            outcome=_resolve_outcome(ordered_regions, ordered_openings),
            summary=_build_summary(ordered_regions, ordered_openings),
            regions=ordered_regions,
            openings=ordered_openings,
            findings=_order_findings(findings),
        )


DEFAULT_CAVITY_OPENING_DETECTOR: CavityOpeningDetector = (
    ConservativeCavityOpeningDetector()
)


_AXIS_DIRECTIONS = (
    Vector3D(1.0, 0.0, 0.0),
    Vector3D(-1.0, 0.0, 0.0),
    Vector3D(0.0, 1.0, 0.0),
    Vector3D(0.0, -1.0, 0.0),
    Vector3D(0.0, 0.0, 1.0),
    Vector3D(0.0, 0.0, -1.0),
)


@dataclass(frozen=True, slots=True)
class _FaceProbe:
    face_index: int
    visible_directions: tuple[Vector3D, ...]
    blocked_direction_count: int
    ambiguous_direction_count: int = 0


@dataclass(frozen=True, slots=True)
class _OpeningWitness:
    region_id: str
    face_index: int
    direction: Vector3D


def _regions_from_nested_candidates(
    candidate_detection: CavityCandidateDetectionResult,
) -> tuple[InternalSurfaceRegion, ...]:
    regions: list[InternalSurfaceRegion] = []
    for candidate in candidate_detection.candidates:
        if not (
            candidate.is_potential_void_boundary
            and candidate.connectivity_classification
            is CavityConnectivityClassification.ENCLOSED
        ):
            continue

        region_id = f"internal_region_{len(regions) + 1:03d}"
        regions.append(
            InternalSurfaceRegion(
                region_id=region_id,
                source_candidate_id=candidate.candidate_id,
                face_indices=candidate.source_face_indices,
                assessed_sample_count=len(candidate.source_face_indices),
                blocked_sample_count=len(candidate.source_face_indices),
                evidence=("nested_closed_shell_containment",),
                outcome=InternalSurfaceRegionOutcome.STRUCTURAL_ENCLOSED,
                findings=candidate.findings,
            )
        )
    return tuple(regions)


def _detect_sampled_regions(
    model: ImportedModel,
    *,
    tolerance_mm: float,
    occluded_direction_threshold: int,
    maximum_visible_direction_threshold: int,
) -> tuple[tuple[InternalSurfaceRegion, ...], tuple[_OpeningWitness, ...]]:
    ray_query = BruteForceRayMeshQuery.from_model(
        model,
        intersection_epsilon_mm=tolerance_mm,
    )
    face_probes: dict[int, _FaceProbe] = {}
    for face_index, face in enumerate(model.faces):
        if _is_global_boundary_face(model, face, tolerance_mm=tolerance_mm):
            continue

        centroid = _face_centroid(model, face)
        unit_normal = _face_unit_normal(model, face, tolerance_mm=tolerance_mm)
        if unit_normal is None:
            continue

        visible_directions, blocked_direction_count = max(
            (
                _probe_face_side(
                    ray_query,
                    face_index=face_index,
                    origin=centroid + (unit_normal * side_sign * tolerance_mm * 10.0),
                    tolerance_mm=tolerance_mm,
                )
                for side_sign in (-1.0, 1.0)
            ),
            key=lambda item: (len(item[0]), item[1]),
        )

        if (
            visible_directions
            and len(visible_directions) <= maximum_visible_direction_threshold
            and blocked_direction_count >= occluded_direction_threshold
        ):
            face_probes[face_index] = _FaceProbe(
                face_index=face_index,
                visible_directions=tuple(
                    sorted(visible_directions, key=_direction_key)
                ),
                blocked_direction_count=blocked_direction_count,
            )

    if not face_probes:
        return (), ()

    adjacency = build_face_adjacency_graph(model)
    unvisited = set(face_probes)
    region_face_groups: list[tuple[int, ...]] = []
    while unvisited:
        seed = min(unvisited)
        queue = deque([seed])
        unvisited.remove(seed)
        region_faces: list[int] = []
        while queue:
            face_index = queue.popleft()
            region_faces.append(face_index)
            for neighbor in adjacency.neighbors(face_index):
                if neighbor not in unvisited:
                    continue
                unvisited.remove(neighbor)
                queue.append(neighbor)

        region_face_groups.append(tuple(sorted(region_faces)))

    region_face_groups.sort(key=lambda faces: (faces[0], faces))
    regions: list[InternalSurfaceRegion] = []
    witnesses: list[_OpeningWitness] = []
    for region_index, face_indices in enumerate(region_face_groups, start=1):
        region_id = f"internal_region_{region_index:03d}"
        visible_sample_count = sum(
            len(face_probes[face_index].visible_directions)
            for face_index in face_indices
        )
        blocked_sample_count = sum(
            face_probes[face_index].blocked_direction_count
            for face_index in face_indices
        )
        regions.append(
            InternalSurfaceRegion(
                region_id=region_id,
                face_indices=face_indices,
                assessed_sample_count=len(face_indices) * len(_AXIS_DIRECTIONS),
                visible_sample_count=visible_sample_count,
                blocked_sample_count=blocked_sample_count,
                evidence=(
                    "non_boundary_faces",
                    "restricted_exterior_visibility",
                    "ray_query_evidence",
                ),
                outcome=InternalSurfaceRegionOutcome.CANDIDATE,
            )
        )
        for face_index in face_indices:
            for direction in face_probes[face_index].visible_directions:
                witnesses.append(
                    _OpeningWitness(
                        region_id=region_id,
                        face_index=face_index,
                        direction=direction,
                    )
                )

    return tuple(regions), tuple(witnesses)


def _build_openings(
    witnesses: tuple[_OpeningWitness, ...],
) -> tuple[CavityOpeningCandidate, ...]:
    grouped: dict[tuple[str, tuple[float, float, float]], list[_OpeningWitness]] = (
        defaultdict(list)
    )
    for witness in witnesses:
        grouped[(witness.region_id, _direction_tuple(witness.direction))].append(
            witness
        )

    openings: list[CavityOpeningCandidate] = []
    for opening_index, ((region_id, direction), group) in enumerate(
        sorted(grouped.items(), key=lambda item: (item[0][0], item[0][1])),
        start=1,
    ):
        support_face_indices = tuple(
            sorted({witness.face_index for witness in group})[:8]
        )
        openings.append(
            CavityOpeningCandidate(
                opening_id=f"opening_candidate_{opening_index:03d}",
                region_id=region_id,
                witness_count=len(group),
                representative_direction=direction,
                witness_directions=(direction,),
                support_face_indices=support_face_indices,
                outcome=CavityOpeningCandidateOutcome.LINE_OF_SIGHT_WITNESS,
            )
        )
    return tuple(openings)


def _validate_closed_manifold_input(model: ImportedModel) -> CavityFinding | None:
    if not model.vertices or not model.faces:
        return _finding(
            code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
            severity=IssueSeverity.WARNING,
            message="Opening detection requires non-empty vertices and faces.",
            is_blocking=True,
        )

    for vertex in model.vertices:
        if not _vertex_is_finite(vertex):
            return _finding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                severity=IssueSeverity.WARNING,
                message="Opening detection requires finite vertex coordinates.",
                is_blocking=True,
            )

    for face in model.faces:
        if any(
            vertex_index < 0 or vertex_index >= len(model.vertices)
            for vertex_index in (face.vertex_1, face.vertex_2, face.vertex_3)
        ):
            return _finding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                severity=IssueSeverity.WARNING,
                message="Opening detection requires valid face vertex indices.",
                is_blocking=True,
            )

    adjacency = build_face_adjacency_graph(model)
    if adjacency.non_manifold_edges:
        return _finding(
            code=CavityFindingCode.NON_MANIFOLD_SHELL_NOT_ASSESSABLE,
            severity=IssueSeverity.WARNING,
            message=(
                "Opening detection does not treat non-manifold shell topology as "
                "reliable internal-region evidence."
            ),
            metadata={"non_manifold_edge_count": len(adjacency.non_manifold_edges)},
        )

    if adjacency.boundary_edges:
        return _finding(
            code=(
                CavityFindingCode.MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION
            ),
            severity=IssueSeverity.WARNING,
            message=(
                "Open mesh boundary edges are treated as topology defects, not as "
                "manufacturing opening candidates."
            ),
            metadata={"boundary_edge_count": len(adjacency.boundary_edges)},
        )

    return None


def _is_global_boundary_face(
    model: ImportedModel,
    face: Face,
    *,
    tolerance_mm: float,
) -> bool:
    vertices = tuple(model.vertices[index] for index in _face_vertex_indices(face))
    bounds = model.bounding_box
    for coordinate_name in ("x", "y", "z"):
        values = tuple(getattr(vertex, coordinate_name) for vertex in vertices)
        minimum = getattr(bounds.minimum, coordinate_name)
        maximum = getattr(bounds.maximum, coordinate_name)
        if all(abs(value - minimum) <= tolerance_mm for value in values):
            return True
        if all(abs(value - maximum) <= tolerance_mm for value in values):
            return True
    return False


def _face_centroid(model: ImportedModel, face: Face) -> Vector3D:
    vertices = tuple(model.vertices[index] for index in _face_vertex_indices(face))
    return Vector3D(
        sum(vertex.x for vertex in vertices) / 3.0,
        sum(vertex.y for vertex in vertices) / 3.0,
        sum(vertex.z for vertex in vertices) / 3.0,
    )


def _face_unit_normal(
    model: ImportedModel,
    face: Face,
    *,
    tolerance_mm: float,
) -> Vector3D | None:
    vertices = tuple(model.vertices[index] for index in _face_vertex_indices(face))
    points = tuple(Vector3D(vertex.x, vertex.y, vertex.z) for vertex in vertices)
    raw_normal = (points[1] - points[0]).cross(points[2] - points[0])
    if raw_normal.magnitude() <= tolerance_mm:
        return None
    return raw_normal.normalized(minimum_magnitude=tolerance_mm)


def _probe_face_side(
    ray_query: BruteForceRayMeshQuery,
    *,
    face_index: int,
    origin: Vector3D,
    tolerance_mm: float,
) -> tuple[list[Vector3D], int]:
    visible_directions: list[Vector3D] = []
    blocked_direction_count = 0
    for direction in _AXIS_DIRECTIONS:
        hit = ray_query.first_hit(
            origin + (direction * tolerance_mm * 10.0),
            direction,
            ignored_face_index=face_index,
            min_distance_mm=tolerance_mm * 10.0,
        )
        if hit is None:
            visible_directions.append(direction)
        else:
            blocked_direction_count += 1

    return visible_directions, blocked_direction_count


def _face_vertex_indices(face: Face) -> tuple[int, int, int]:
    return (face.vertex_1, face.vertex_2, face.vertex_3)


def _vertex_is_finite(vertex: Vertex) -> bool:
    return all(
        coordinate == coordinate and coordinate not in (float("inf"), float("-inf"))
        for coordinate in (vertex.x, vertex.y, vertex.z)
    )


def _resolve_outcome(
    regions: tuple[InternalSurfaceRegion, ...],
    openings: tuple[CavityOpeningCandidate, ...],
) -> CavityOpeningDetectionOutcome:
    if openings:
        return CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED
    if regions:
        return CavityOpeningDetectionOutcome.NO_OPENING_CANDIDATE_DETECTED_BY_CURRENT_METHOD
    return CavityOpeningDetectionOutcome.NO_OPENING_CANDIDATE_DETECTED_BY_CURRENT_METHOD


def _build_summary(
    regions: tuple[InternalSurfaceRegion, ...],
    openings: tuple[CavityOpeningCandidate, ...],
) -> str:
    if openings:
        return (
            "Opening detection found "
            f"{len(regions)} internal region candidate(s) and "
            f"{len(openings)} grouped line-of-sight opening candidate(s)."
        )
    if regions:
        return (
            "Opening detection found internal region evidence but no exterior "
            "line-of-sight opening witness by the current method."
        )
    return (
        "Opening detection found no internal region or opening witness by the "
        "current finite sampling method."
    )


def _order_regions(
    regions: list[InternalSurfaceRegion],
) -> tuple[InternalSurfaceRegion, ...]:
    return tuple(
        sorted(
            regions,
            key=lambda region: (
                region.face_indices[0] if region.face_indices else -1,
                region.face_indices,
                ""
                if region.source_candidate_id is None
                else region.source_candidate_id,
                region.region_id,
            ),
        )
    )


def _opening_sort_key(opening: CavityOpeningCandidate) -> tuple[object, ...]:
    return (
        opening.region_id,
        opening.representative_direction,
        opening.support_face_indices,
        opening.opening_id,
    )


def _direction_key(direction: Vector3D) -> tuple[float, float, float]:
    return _direction_tuple(direction)


def _direction_tuple(direction: Vector3D) -> tuple[float, float, float]:
    return (direction.x, direction.y, direction.z)


def _finding(
    *,
    code: CavityFindingCode,
    severity: IssueSeverity,
    message: str,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> CavityFinding:
    return CavityFinding(
        code=code,
        source=CavityFindingSource.CAVITY_OPENING_DETECTOR,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )


def _order_findings(findings: list[CavityFinding]) -> tuple[CavityFinding, ...]:
    return tuple(sorted(findings, key=_finding_sort_key))


def _finding_sort_key(finding: CavityFinding) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in finding.metadata.items())
    )
    return (
        not finding.is_blocking,
        _SEVERITY_ORDER[finding.severity],
        finding.source.value,
        finding.code.value,
        finding.message,
        metadata_key,
    )


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
