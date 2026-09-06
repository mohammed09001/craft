from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from mold_generator_engine.config.geometry import DEFAULT_LINEAR_TOLERANCE_MM
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.mesh_adjacency import build_face_adjacency_graph
from mold_generator_engine.geometry.ray_mesh_query import BruteForceRayMeshQuery
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionResult,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionResult,
    InternalAccessDirectionGenerationOutcome,
    InternalAccessDirectionGenerationResult,
    InternalDirectionEvaluation,
    InternalDirectionEvaluationOutcome,
    InternalObstructionRegion,
    InternalObstructionRegionClassification,
    InternalUndercutAnalysisOutcome,
    InternalUndercutAnalysisResult,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.imported_model import Face, ImportedModel
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    InternalUndercutAnalyzer,
)


@dataclass(frozen=True, slots=True)
class DirectionalInternalUndercutAnalyzer:
    """Assess directional internal obstruction evidence from finite samples."""

    linear_tolerance_mm: float = DEFAULT_LINEAR_TOLERANCE_MM

    def analyze(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        access_directions: InternalAccessDirectionGenerationResult,
    ) -> InternalUndercutAnalysisResult:
        """Evaluate each target and access direction independently."""
        if access_directions.status is DetailedMoldAnalysisStatus.BLOCKED:
            return _not_assessable_result(
                "Internal undercut analysis was blocked by direction generation."
            )

        if (
            access_directions.outcome
            is InternalAccessDirectionGenerationOutcome.NO_SUPPORTED_DIRECTION
        ):
            return InternalUndercutAnalysisResult(
                status=DetailedMoldAnalysisStatus.COMPLETED,
                outcome=InternalUndercutAnalysisOutcome.ENCLOSED
                if _has_enclosed_candidate(candidate_detection)
                else InternalUndercutAnalysisOutcome.NOT_ASSESSABLE,
                summary=(
                    "Internal undercut analysis found no supported access "
                    "direction to evaluate."
                ),
                findings=(
                    _finding(
                        code=CavityFindingCode.NO_SUPPORTED_INTERNAL_ACCESS_DIRECTION,
                        severity=IssueSeverity.INFO,
                        message=(
                            "No directional internal obstruction test was run "
                            "because no supported access direction was available."
                        ),
                    ),
                ),
            )

        target_faces = _target_face_indices(candidate_detection, opening_detection)
        ray_query = BruteForceRayMeshQuery.from_model(
            context.model,
            intersection_epsilon_mm=self.linear_tolerance_mm,
        )
        adjacency = build_face_adjacency_graph(context.model)
        pending_evaluations: list[_PendingEvaluation] = []
        pending_regions: list[_PendingRegion] = []

        for direction_candidate in access_directions.directions:
            face_indices = target_faces.get(direction_candidate.target_id, ())
            direction = _normalized_direction(
                direction_candidate.direction,
                linear_tolerance_mm=self.linear_tolerance_mm,
            )
            if direction is None or not face_indices:
                pending_evaluations.append(
                    _PendingEvaluation(
                        target_id=direction_candidate.target_id,
                        direction_id=direction_candidate.direction_id,
                        assessed_face_count=len(face_indices),
                        assessed_sample_count=0,
                        clear_face_indices=(),
                        obstruction_face_indices=(),
                        ambiguous_face_indices=face_indices,
                        outcome=InternalDirectionEvaluationOutcome.NOT_ASSESSABLE,
                    )
                )
                continue

            clear_faces: list[int] = []
            obstructed_face_stats: dict[int, _FaceSampleStats] = {}
            ambiguous_faces: list[int] = []
            assessed_sample_count = 0

            for face_index in face_indices:
                stats = _evaluate_face(
                    context.model,
                    ray_query,
                    face_index=face_index,
                    direction=direction,
                    tolerance_mm=self.linear_tolerance_mm,
                )
                assessed_sample_count += stats.assessed_sample_count
                if stats.obstructed_sample_count >= 2:
                    obstructed_face_stats[face_index] = stats
                elif (
                    stats.clear_sample_count > 0 and stats.obstructed_sample_count == 0
                ):
                    clear_faces.append(face_index)
                else:
                    ambiguous_faces.append(face_index)

            components = _connected_face_components(
                tuple(sorted(obstructed_face_stats)),
                adjacency,
            )
            for component in components:
                pending_regions.append(
                    _PendingRegion(
                        target_id=direction_candidate.target_id,
                        direction_id=direction_candidate.direction_id,
                        face_indices=component,
                        assessed_sample_count=sum(
                            obstructed_face_stats[index].assessed_sample_count
                            for index in component
                        ),
                        obstructed_sample_count=sum(
                            obstructed_face_stats[index].obstructed_sample_count
                            for index in component
                        ),
                        ambiguous_sample_count=sum(
                            obstructed_face_stats[index].ambiguous_sample_count
                            for index in component
                        ),
                    )
                )

            pending_evaluations.append(
                _PendingEvaluation(
                    target_id=direction_candidate.target_id,
                    direction_id=direction_candidate.direction_id,
                    assessed_face_count=len(face_indices),
                    assessed_sample_count=assessed_sample_count,
                    clear_face_indices=tuple(sorted(clear_faces)),
                    obstruction_face_indices=tuple(sorted(obstructed_face_stats)),
                    ambiguous_face_indices=tuple(sorted(ambiguous_faces)),
                    outcome=_direction_outcome(
                        clear_face_count=len(clear_faces),
                        obstructed_face_count=len(obstructed_face_stats),
                        ambiguous_face_count=len(ambiguous_faces),
                    ),
                )
            )

        regions, region_ids_by_key = _finalize_regions(pending_regions)
        evaluations = _finalize_evaluations(pending_evaluations, region_ids_by_key)
        findings = _build_findings(evaluations, regions)

        return InternalUndercutAnalysisResult(
            status=_resolve_status(evaluations),
            outcome=_resolve_outcome(evaluations, regions),
            summary=_build_summary(evaluations, regions),
            evaluations=evaluations,
            obstruction_regions=regions,
            findings=findings,
        )


DEFAULT_INTERNAL_UNDERCUT_ANALYZER: InternalUndercutAnalyzer = (
    DirectionalInternalUndercutAnalyzer()
)


@dataclass(frozen=True, slots=True)
class _FaceSampleStats:
    assessed_sample_count: int
    clear_sample_count: int
    obstructed_sample_count: int
    ambiguous_sample_count: int


@dataclass(frozen=True, slots=True)
class _FaceSamples:
    points: tuple[Vector3D, ...]
    unit_normal: Vector3D


@dataclass(frozen=True, slots=True)
class _PendingRegion:
    target_id: str
    direction_id: str
    face_indices: tuple[int, ...]
    assessed_sample_count: int
    obstructed_sample_count: int
    ambiguous_sample_count: int


@dataclass(frozen=True, slots=True)
class _PendingEvaluation:
    target_id: str
    direction_id: str
    assessed_face_count: int
    assessed_sample_count: int
    clear_face_indices: tuple[int, ...]
    obstruction_face_indices: tuple[int, ...]
    ambiguous_face_indices: tuple[int, ...]
    outcome: InternalDirectionEvaluationOutcome


def _target_face_indices(
    candidate_detection: CavityCandidateDetectionResult,
    opening_detection: CavityOpeningDetectionResult,
) -> dict[str, tuple[int, ...]]:
    targets: dict[str, tuple[int, ...]] = {}
    for candidate in candidate_detection.candidates:
        targets[candidate.candidate_id] = candidate.source_face_indices
    for region in opening_detection.regions:
        targets[region.region_id] = region.face_indices
        if region.source_candidate_id is not None:
            targets[region.source_candidate_id] = region.face_indices
    return targets


def _evaluate_face(
    model: ImportedModel,
    ray_query: BruteForceRayMeshQuery,
    *,
    face_index: int,
    direction: Vector3D,
    tolerance_mm: float,
) -> _FaceSampleStats:
    if face_index < 0 or face_index >= len(model.faces):
        return _FaceSampleStats(0, 0, 0, 1)

    face_samples = _face_samples(model, model.faces[face_index], tolerance_mm)
    if face_samples is None:
        return _FaceSampleStats(0, 0, 0, 1)

    side_stats = tuple(
        _evaluate_samples_from_origin_side(
            ray_query,
            face_index=face_index,
            samples=face_samples.points,
            origin_offset=face_samples.unit_normal * side_sign * tolerance_mm * 10.0,
            direction=direction,
            tolerance_mm=tolerance_mm,
        )
        for side_sign in (-1.0, 1.0)
    )
    return max(
        side_stats,
        key=lambda stats: (
            stats.clear_sample_count,
            -stats.obstructed_sample_count,
            -stats.ambiguous_sample_count,
        ),
    )


def _evaluate_samples_from_origin_side(
    ray_query: BruteForceRayMeshQuery,
    *,
    face_index: int,
    samples: tuple[Vector3D, ...],
    origin_offset: Vector3D,
    direction: Vector3D,
    tolerance_mm: float,
) -> _FaceSampleStats:
    clear_count = 0
    obstructed_count = 0
    for sample in samples:
        origin = sample + origin_offset + (direction * tolerance_mm * 10.0)
        hit = ray_query.first_hit(
            origin,
            direction,
            ignored_face_index=face_index,
            min_distance_mm=tolerance_mm * 10.0,
        )
        if hit is None:
            clear_count += 1
        else:
            obstructed_count += 1

    return _FaceSampleStats(
        assessed_sample_count=len(samples),
        clear_sample_count=clear_count,
        obstructed_sample_count=obstructed_count,
        ambiguous_sample_count=0,
    )


def _face_samples(
    model: ImportedModel,
    face: Face,
    tolerance_mm: float,
) -> _FaceSamples | None:
    if any(
        vertex_index < 0 or vertex_index >= len(model.vertices)
        for vertex_index in (face.vertex_1, face.vertex_2, face.vertex_3)
    ):
        return None

    points = tuple(
        Vector3D(vertex.x, vertex.y, vertex.z)
        for vertex in (
            model.vertices[face.vertex_1],
            model.vertices[face.vertex_2],
            model.vertices[face.vertex_3],
        )
    )
    if any(not point.is_finite() for point in points):
        return None

    raw_normal = (points[1] - points[0]).cross(points[2] - points[0])
    if raw_normal.magnitude() <= tolerance_mm:
        return None

    unit_normal = raw_normal.normalized(minimum_magnitude=tolerance_mm)
    centroid = (points[0] + points[1] + points[2]) * (1.0 / 3.0)
    return _FaceSamples(
        points=(
            centroid,
            (points[0] + points[1] + centroid) * (1.0 / 3.0),
            (points[1] + points[2] + centroid) * (1.0 / 3.0),
            (points[2] + points[0] + centroid) * (1.0 / 3.0),
        ),
        unit_normal=unit_normal,
    )


def _connected_face_components(
    face_indices: tuple[int, ...],
    adjacency,
) -> tuple[tuple[int, ...], ...]:
    unvisited = set(face_indices)
    components: list[tuple[int, ...]] = []
    while unvisited:
        seed = min(unvisited)
        queue = deque([seed])
        unvisited.remove(seed)
        component: list[int] = []
        while queue:
            face_index = queue.popleft()
            component.append(face_index)
            for neighbor in adjacency.neighbors(face_index):
                if neighbor not in unvisited:
                    continue
                unvisited.remove(neighbor)
                queue.append(neighbor)
        components.append(tuple(sorted(component)))
    return tuple(sorted(components, key=lambda component: (component[0], component)))


def _finalize_regions(
    pending_regions: list[_PendingRegion],
) -> tuple[
    tuple[InternalObstructionRegion, ...], dict[tuple[str, str, tuple[int, ...]], str]
]:
    ordered = sorted(
        pending_regions,
        key=lambda region: (region.target_id, region.direction_id, region.face_indices),
    )
    region_ids_by_key: dict[tuple[str, str, tuple[int, ...]], str] = {}
    regions: list[InternalObstructionRegion] = []
    for index, region in enumerate(ordered, start=1):
        region_id = f"internal_obstruction_region_{index:03d}"
        key = (region.target_id, region.direction_id, region.face_indices)
        region_ids_by_key[key] = region_id
        regions.append(
            InternalObstructionRegion(
                region_id=region_id,
                target_id=region.target_id,
                direction_id=region.direction_id,
                face_indices=region.face_indices,
                assessed_sample_count=region.assessed_sample_count,
                obstructed_sample_count=region.obstructed_sample_count,
                ambiguous_sample_count=region.ambiguous_sample_count,
                classification=(
                    InternalObstructionRegionClassification.DIRECTIONAL_OBSTRUCTION
                ),
                finding_codes=(
                    CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_DETECTED,
                ),
            )
        )
    return tuple(regions), region_ids_by_key


def _finalize_evaluations(
    pending_evaluations: list[_PendingEvaluation],
    region_ids_by_key: dict[tuple[str, str, tuple[int, ...]], str],
) -> tuple[InternalDirectionEvaluation, ...]:
    evaluations: list[InternalDirectionEvaluation] = []
    for evaluation in pending_evaluations:
        region_ids = tuple(
            region_id
            for (target_id, direction_id, face_indices), region_id in sorted(
                region_ids_by_key.items(),
                key=lambda item: item[1],
            )
            if target_id == evaluation.target_id
            and direction_id == evaluation.direction_id
            and set(face_indices).issubset(evaluation.obstruction_face_indices)
        )
        finding_codes = (
            (CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_DETECTED,)
            if region_ids
            else (CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_ASSESSED,)
        )
        evaluations.append(
            InternalDirectionEvaluation(
                target_id=evaluation.target_id,
                direction_id=evaluation.direction_id,
                assessed_face_count=evaluation.assessed_face_count,
                assessed_sample_count=evaluation.assessed_sample_count,
                clear_face_indices=evaluation.clear_face_indices,
                obstructed_region_ids=region_ids,
                ambiguous_face_indices=evaluation.ambiguous_face_indices,
                outcome=evaluation.outcome,
                finding_codes=finding_codes,
            )
        )
    return tuple(sorted(evaluations, key=_evaluation_sort_key))


def _direction_outcome(
    *,
    clear_face_count: int,
    obstructed_face_count: int,
    ambiguous_face_count: int,
) -> InternalDirectionEvaluationOutcome:
    if obstructed_face_count and clear_face_count:
        return InternalDirectionEvaluationOutcome.PARTIALLY_OBSTRUCTED
    if obstructed_face_count:
        return InternalDirectionEvaluationOutcome.OBSTRUCTED
    if ambiguous_face_count and not clear_face_count:
        return InternalDirectionEvaluationOutcome.AMBIGUOUS
    if ambiguous_face_count:
        return InternalDirectionEvaluationOutcome.PARTIALLY_OBSTRUCTED
    return InternalDirectionEvaluationOutcome.CLEAR


def _resolve_status(
    evaluations: tuple[InternalDirectionEvaluation, ...],
) -> DetailedMoldAnalysisStatus:
    if any(
        evaluation.outcome
        in (
            InternalDirectionEvaluationOutcome.AMBIGUOUS,
            InternalDirectionEvaluationOutcome.NOT_ASSESSABLE,
        )
        for evaluation in evaluations
    ):
        return DetailedMoldAnalysisStatus.PARTIAL
    return DetailedMoldAnalysisStatus.COMPLETED


def _resolve_outcome(
    evaluations: tuple[InternalDirectionEvaluation, ...],
    regions: tuple[InternalObstructionRegion, ...],
) -> InternalUndercutAnalysisOutcome:
    if not evaluations:
        return InternalUndercutAnalysisOutcome.NOT_ASSESSABLE
    if regions:
        return InternalUndercutAnalysisOutcome.OBSTRUCTIONS_DETECTED
    if any(
        evaluation.outcome is InternalDirectionEvaluationOutcome.AMBIGUOUS
        for evaluation in evaluations
    ):
        return InternalUndercutAnalysisOutcome.AMBIGUOUS
    return InternalUndercutAnalysisOutcome.CLEAR_BY_CURRENT_DIRECTIONAL_TEST


def _build_summary(
    evaluations: tuple[InternalDirectionEvaluation, ...],
    regions: tuple[InternalObstructionRegion, ...],
) -> str:
    if not evaluations:
        return "Internal undercut analysis found no direction to evaluate."
    if regions:
        return (
            "Internal undercut analysis found "
            f"{len(regions)} directional obstruction region(s)."
        )
    return (
        "Internal undercut analysis found no directional obstruction by the "
        "current finite line-of-sight test."
    )


def _build_findings(
    evaluations: tuple[InternalDirectionEvaluation, ...],
    regions: tuple[InternalObstructionRegion, ...],
) -> tuple[CavityFinding, ...]:
    findings = [
        _finding(
            code=CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_ASSESSED,
            severity=IssueSeverity.INFO,
            message=(
                "Directional internal obstruction was assessed from finite "
                "deterministic face samples."
            ),
            metadata={"evaluation_count": len(evaluations)},
        ),
        _finding(
            code=CavityFindingCode.INTERNAL_UNDERCUT_ANALYSIS_NOT_CLEARANCE_PROOF,
            severity=IssueSeverity.INFO,
            message=(
                "A clear directional test is not proof of full opening clearance, "
                "motion planning, or final core feasibility."
            ),
        ),
    ]
    if regions:
        findings.append(
            _finding(
                code=CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_DETECTED,
                severity=IssueSeverity.WARNING,
                message=(
                    "Directional internal obstruction evidence was detected for "
                    "one or more access directions."
                ),
                metadata={"obstruction_region_count": len(regions)},
            )
        )
    return _order_findings(findings)


def _normalized_direction(
    direction: tuple[float, float, float],
    *,
    linear_tolerance_mm: float,
) -> Vector3D | None:
    try:
        return Vector3D(*direction).normalized(minimum_magnitude=linear_tolerance_mm)
    except InvalidVectorError:
        return None


def _has_enclosed_candidate(
    candidate_detection: CavityCandidateDetectionResult,
) -> bool:
    return any(
        candidate.is_potential_void_boundary
        for candidate in candidate_detection.candidates
    )


def _not_assessable_result(summary: str) -> InternalUndercutAnalysisResult:
    return InternalUndercutAnalysisResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        outcome=InternalUndercutAnalysisOutcome.NOT_ASSESSABLE,
        summary=summary,
        findings=(
            _finding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                severity=IssueSeverity.WARNING,
                message=summary,
                is_blocking=True,
            ),
        ),
    )


def _evaluation_sort_key(evaluation: InternalDirectionEvaluation) -> tuple[object, ...]:
    return (evaluation.target_id, evaluation.direction_id)


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
        source=CavityFindingSource.INTERNAL_UNDERCUT_ANALYZER,
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
