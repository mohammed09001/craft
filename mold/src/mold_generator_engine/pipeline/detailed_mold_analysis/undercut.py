from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

from mold_generator_engine.config.geometry import DEFAULT_LINEAR_TOLERANCE_MM
from mold_generator_engine.config.undercut import UndercutAnalysisSettings
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.mesh_adjacency import build_face_adjacency_graph
from mold_generator_engine.geometry.ray_mesh_query import BruteForceRayMeshQuery
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisContext,
    FaceGeometry,
    FaceGeometryAnalysis,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionCandidate,
    UndercutAnalysisOutcome,
    UndercutAnalysisResult,
    UndercutAnalysisWarning,
    UndercutAnalysisWarningCode,
    UndercutFaceAssessment,
    UndercutFaceClassification,
    UndercutFaceReasonCode,
    UndercutRegion,
    UndercutRegionClassification,
    UndercutRegionSeverity,
)
from mold_generator_engine.models.imported_model import BoundingBox, Vertex
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    MeshRayQueryBackend,
    PreliminaryUndercutAnalyzer,
)

RayQueryBackendFactory = Callable[
    [DetailedMoldAnalysisContext, float],
    MeshRayQueryBackend,
]


class _PathAccessibility(Enum):
    CLEAR = "clear"
    BLOCKED = "blocked"
    AMBIGUOUS = "ambiguous"


@dataclass(frozen=True, slots=True)
class PreliminaryUndercutDetector:
    """Detect preliminary undercut evidence from bidirectional pull-axis access.

    Face-normal sign alone is not enough here: a bottom face on a convex cube can
    oppose the selected signed pull direction while still remaining releasable
    because the opposite direction on the same opening axis is clear.

    The current detector therefore treats the stage-4 selected pull direction as
    an unsigned mold-opening axis and checks both ``+D`` and ``-D`` for every
    deterministic sample. The result remains preliminary and conservative.
    """

    settings: UndercutAnalysisSettings = UndercutAnalysisSettings()
    ray_query_backend_factory: RayQueryBackendFactory = (
        lambda context, intersection_epsilon_mm: BruteForceRayMeshQuery.from_model(
            context.model,
            intersection_epsilon_mm=intersection_epsilon_mm,
        )
    )

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis: FaceGeometryAnalysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
    ) -> UndercutAnalysisResult:
        """Run preliminary bidirectional accessibility checks for one model."""
        warnings: list[UndercutAnalysisWarning] = []
        selected_candidate = (
            None
            if preliminary_selection is None
            else preliminary_selection.selected_candidate
        )

        if (
            preliminary_selection is not None
            and preliminary_selection.status
            is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
        ):
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION,
                    message=(
                        "Stage-4 pull-direction selection is ambiguous, so the current "
                        "undercut result uses its deterministic representative only as "
                        "preliminary evidence."
                    ),
                )
            )

        if selected_candidate is None:
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.NO_SELECTED_PULL_DIRECTION,
                    message=(
                        "Preliminary undercut detection requires the selected "
                        "pull direction produced by stage 4."
                    ),
                )
            )
            return _build_unevaluable_result(
                selected_pull_direction=None,
                face_assessments=(),
                warnings=warnings,
            )

        try:
            unit_pull_direction = selected_candidate.direction.normalized(
                minimum_magnitude=0.0
            )
        except InvalidVectorError:
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.INVALID_SELECTED_PULL_DIRECTION,
                    message=(
                        "The selected pull direction must be finite and non-zero "
                        "before preliminary undercut detection can run."
                    ),
                )
            )
            return _build_unevaluable_result(
                selected_pull_direction=selected_candidate,
                face_assessments=(),
                warnings=warnings,
            )

        if face_analysis.valid_face_count == 0:
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.NO_ANALYZABLE_FACES,
                    message=(
                        "Preliminary undercut detection could not find any valid "
                        "positive-area faces to analyze."
                    ),
                )
            )
            return _build_unevaluable_result(
                selected_pull_direction=selected_candidate,
                face_assessments=(),
                warnings=warnings,
            )

        if face_analysis.degenerate_face_count > 0:
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.DEGENERATE_FACES_IGNORED,
                    message=(
                        "One or more degenerate faces were excluded from preliminary "
                        "undercut detection."
                    ),
                    metadata={
                        "degenerate_face_count": face_analysis.degenerate_face_count,
                    },
                )
            )

        model_diagonal_mm = _model_diagonal_length_mm(context)
        surface_offset_mm = max(
            DEFAULT_LINEAR_TOLERANCE_MM,
            model_diagonal_mm * self.settings.surface_offset_scale,
        )
        intersection_epsilon_mm = max(
            DEFAULT_LINEAR_TOLERANCE_MM,
            model_diagonal_mm * self.settings.ray_intersection_scale,
        )
        ambiguity_distance_mm = max(
            intersection_epsilon_mm,
            model_diagonal_mm * self.settings.numeric_ambiguity_scale,
        )

        ray_query_backend = self.ray_query_backend_factory(
            context,
            intersection_epsilon_mm,
        )
        face_assessments = tuple(
            _assess_face(
                context=context,
                face=face,
                pull_direction=unit_pull_direction,
                ray_query_backend=ray_query_backend,
                settings=self.settings,
                surface_offset_mm=surface_offset_mm,
                ambiguity_distance_mm=ambiguity_distance_mm,
                intersection_epsilon_mm=intersection_epsilon_mm,
            )
            for face in face_analysis.faces
        )

        if any(
            assessment.classification is UndercutFaceClassification.AMBIGUOUS
            for assessment in face_assessments
        ):
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.AMBIGUOUS_FACE_RESULTS_PRESENT,
                    message=(
                        "Some faces remained numerically or geometrically ambiguous, "
                        "so the current undercut result is conservative."
                    ),
                )
            )

        regions = _build_regions(
            context=context,
            face_analysis=face_analysis,
            face_assessments=face_assessments,
            settings=self.settings,
        )
        if any(region.severity is UndercutRegionSeverity.TINY for region in regions):
            warnings.append(
                UndercutAnalysisWarning(
                    code=UndercutAnalysisWarningCode.TINY_REGIONS_PRESENT,
                    message=(
                        "Tiny preliminary undercut regions were retained for audit "
                        "instead of being silently discarded."
                    ),
                )
            )

        confirmed_region_count = sum(
            region.classification is UndercutRegionClassification.CONFIRMED_UNDERCUT
            for region in regions
        )
        potential_region_count = sum(
            region.classification is UndercutRegionClassification.POTENTIAL_UNDERCUT
            for region in regions
        )
        total_undercut_area_sq_mm = sum(region.total_area_sq_mm for region in regions)
        undercut_area_ratio = _safe_ratio(
            total_undercut_area_sq_mm,
            face_analysis.valid_surface_area_sq_mm,
        )
        highest_severity = _highest_region_severity(regions)
        confidence = _overall_confidence(face_analysis, face_assessments)
        outcome = _resolve_outcome(
            face_assessments=face_assessments,
            confirmed_region_count=confirmed_region_count,
            potential_region_count=potential_region_count,
        )

        return UndercutAnalysisResult(
            selected_pull_direction=selected_candidate,
            is_evaluable=True,
            outcome=outcome,
            face_assessments=face_assessments,
            regions=regions,
            confirmed_region_count=confirmed_region_count,
            potential_region_count=potential_region_count,
            total_undercut_area_sq_mm=total_undercut_area_sq_mm,
            undercut_area_ratio=undercut_area_ratio,
            highest_severity=highest_severity,
            confidence=confidence,
            warnings=tuple(warnings),
        )


DEFAULT_PRELIMINARY_UNDERCUT_DETECTOR: PreliminaryUndercutAnalyzer = (
    PreliminaryUndercutDetector()
)


def _assess_face(
    *,
    context: DetailedMoldAnalysisContext,
    face: FaceGeometry,
    pull_direction: Vector3D,
    ray_query_backend: MeshRayQueryBackend,
    settings: UndercutAnalysisSettings,
    surface_offset_mm: float,
    ambiguity_distance_mm: float,
    intersection_epsilon_mm: float,
) -> UndercutFaceAssessment:
    if face.is_degenerate:
        return UndercutFaceAssessment(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            classification=UndercutFaceClassification.AMBIGUOUS,
            sample_count=0,
            accessible_sample_count=0,
            bidirectionally_blocked_sample_count=0,
            ambiguous_sample_count=0,
            blocked_ratio=0.0,
            confidence=0.0,
            reason_codes=(UndercutFaceReasonCode.DEGENERATE_FACE,),
        )

    if face.unit_normal is None or not face.unit_normal.is_finite():
        return UndercutFaceAssessment(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            classification=UndercutFaceClassification.AMBIGUOUS,
            sample_count=0,
            accessible_sample_count=0,
            bidirectionally_blocked_sample_count=0,
            ambiguous_sample_count=0,
            blocked_ratio=0.0,
            confidence=0.0,
            reason_codes=(UndercutFaceReasonCode.INVALID_NORMAL,),
        )

    triangle_vertices = _face_vertices(context, face)
    if triangle_vertices is None:
        return UndercutFaceAssessment(
            face_index=face.face_index,
            face_area_sq_mm=face.area,
            classification=UndercutFaceClassification.AMBIGUOUS,
            sample_count=0,
            accessible_sample_count=0,
            bidirectionally_blocked_sample_count=0,
            ambiguous_sample_count=0,
            blocked_ratio=0.0,
            confidence=0.0,
            reason_codes=(UndercutFaceReasonCode.DEGENERATE_FACE,),
        )

    sample_count = len(settings.sample_barycentric_coordinates)
    accessible_sample_count = 0
    bidirectionally_blocked_sample_count = 0
    ambiguous_sample_count = 0

    for barycentric_coordinates in settings.sample_barycentric_coordinates:
        sample_point = _sample_point(triangle_vertices, barycentric_coordinates)
        sample_origin = sample_point + (face.unit_normal * surface_offset_mm)
        positive_path = _path_accessibility(
            origin=sample_origin,
            direction=pull_direction,
            ray_query_backend=ray_query_backend,
            ignored_face_index=face.face_index,
            ambiguity_distance_mm=ambiguity_distance_mm,
            intersection_epsilon_mm=intersection_epsilon_mm,
        )
        negative_path = _path_accessibility(
            origin=sample_origin,
            direction=-pull_direction,
            ray_query_backend=ray_query_backend,
            ignored_face_index=face.face_index,
            ambiguity_distance_mm=ambiguity_distance_mm,
            intersection_epsilon_mm=intersection_epsilon_mm,
        )

        if (
            positive_path is _PathAccessibility.CLEAR
            or negative_path is _PathAccessibility.CLEAR
        ):
            accessible_sample_count += 1
            continue

        if (
            positive_path is _PathAccessibility.AMBIGUOUS
            or negative_path is _PathAccessibility.AMBIGUOUS
        ):
            ambiguous_sample_count += 1
            continue

        bidirectionally_blocked_sample_count += 1

    blocked_ratio = _safe_ratio(bidirectionally_blocked_sample_count, sample_count)
    classification = _classify_face(
        blocked_ratio=blocked_ratio,
        ambiguous_sample_count=ambiguous_sample_count,
        sample_count=sample_count,
        settings=settings,
    )

    return UndercutFaceAssessment(
        face_index=face.face_index,
        face_area_sq_mm=face.area,
        classification=classification,
        sample_count=sample_count,
        accessible_sample_count=accessible_sample_count,
        bidirectionally_blocked_sample_count=bidirectionally_blocked_sample_count,
        ambiguous_sample_count=ambiguous_sample_count,
        blocked_ratio=blocked_ratio,
        confidence=_face_confidence(
            classification=classification,
            blocked_ratio=blocked_ratio,
            ambiguous_sample_count=ambiguous_sample_count,
            sample_count=sample_count,
        ),
        reason_codes=_face_reason_codes(
            classification=classification,
            accessible_sample_count=accessible_sample_count,
            bidirectionally_blocked_sample_count=bidirectionally_blocked_sample_count,
            ambiguous_sample_count=ambiguous_sample_count,
            sample_count=sample_count,
        ),
    )


def _build_regions(
    *,
    context: DetailedMoldAnalysisContext,
    face_analysis: FaceGeometryAnalysis,
    face_assessments: tuple[UndercutFaceAssessment, ...],
    settings: UndercutAnalysisSettings,
) -> tuple[UndercutRegion, ...]:
    face_lookup = {face.face_index: face for face in face_analysis.faces}
    assessment_lookup = {
        assessment.face_index: assessment for assessment in face_assessments
    }
    undercut_face_indices = {
        assessment.face_index
        for assessment in face_assessments
        if assessment.classification
        in (
            UndercutFaceClassification.POTENTIAL_UNDERCUT,
            UndercutFaceClassification.CONFIRMED_UNDERCUT,
        )
    }
    if not undercut_face_indices:
        return ()

    adjacency_graph = build_face_adjacency_graph(context.model)
    visited_face_indices: set[int] = set()
    unsorted_regions: list[UndercutRegion] = []

    for start_face_index in sorted(undercut_face_indices):
        if start_face_index in visited_face_indices:
            continue

        region_face_indices: list[int] = []
        pending_face_indices = [start_face_index]
        visited_face_indices.add(start_face_index)

        while pending_face_indices:
            current_face_index = pending_face_indices.pop()
            region_face_indices.append(current_face_index)

            for neighbor_face_index in adjacency_graph.neighbors(current_face_index):
                if neighbor_face_index not in undercut_face_indices:
                    continue
                if neighbor_face_index in visited_face_indices:
                    continue

                visited_face_indices.add(neighbor_face_index)
                pending_face_indices.append(neighbor_face_index)

        region = _build_region(
            context=context,
            face_lookup=face_lookup,
            assessment_lookup=assessment_lookup,
            region_face_indices=tuple(sorted(region_face_indices)),
            valid_surface_area_sq_mm=face_analysis.valid_surface_area_sq_mm,
            settings=settings,
        )
        unsorted_regions.append(region)

    sorted_regions = sorted(
        unsorted_regions,
        key=lambda region: (
            -_REGION_SEVERITY_ORDER[region.severity],
            -region.total_area_sq_mm,
            min(region.face_indices),
        ),
    )

    return tuple(
        UndercutRegion(
            region_id=f"undercut-region-{index:03d}",
            face_indices=region.face_indices,
            face_count=region.face_count,
            total_area_sq_mm=region.total_area_sq_mm,
            area_ratio=region.area_ratio,
            area_weighted_centroid=region.area_weighted_centroid,
            bounding_box=region.bounding_box,
            classification=region.classification,
            severity=region.severity,
            confidence=region.confidence,
            confirmed_face_count=region.confirmed_face_count,
            potential_face_count=region.potential_face_count,
            reason_summary=region.reason_summary,
            warnings=region.warnings,
        )
        for index, region in enumerate(sorted_regions, start=1)
    )


def _build_region(
    *,
    context: DetailedMoldAnalysisContext,
    face_lookup: dict[int, FaceGeometry],
    assessment_lookup: dict[int, UndercutFaceAssessment],
    region_face_indices: tuple[int, ...],
    valid_surface_area_sq_mm: float,
    settings: UndercutAnalysisSettings,
) -> UndercutRegion:
    total_area_sq_mm = sum(
        face_lookup[face_index].area for face_index in region_face_indices
    )
    area_ratio = _safe_ratio(total_area_sq_mm, valid_surface_area_sq_mm)
    confirmed_face_count = sum(
        assessment_lookup[face_index].classification
        is UndercutFaceClassification.CONFIRMED_UNDERCUT
        for face_index in region_face_indices
    )
    potential_face_count = sum(
        assessment_lookup[face_index].classification
        is UndercutFaceClassification.POTENTIAL_UNDERCUT
        for face_index in region_face_indices
    )
    classification = (
        UndercutRegionClassification.CONFIRMED_UNDERCUT
        if confirmed_face_count > 0
        else UndercutRegionClassification.POTENTIAL_UNDERCUT
    )
    confidence = _safe_ratio(
        sum(
            face_lookup[face_index].area * assessment_lookup[face_index].confidence
            for face_index in region_face_indices
        ),
        total_area_sq_mm,
    )
    severity = _classify_region_severity(
        classification=classification,
        total_area_sq_mm=total_area_sq_mm,
        area_ratio=area_ratio,
        confidence=confidence,
        settings=settings,
    )
    warnings: list[str] = []
    if severity is UndercutRegionSeverity.TINY:
        warnings.append(
            "Region is below the configured meaningful-area threshold and is kept "
            "only as low-severity preliminary evidence."
        )

    return UndercutRegion(
        region_id="pending",
        face_indices=region_face_indices,
        face_count=len(region_face_indices),
        total_area_sq_mm=total_area_sq_mm,
        area_ratio=area_ratio,
        area_weighted_centroid=_area_weighted_centroid(
            face_lookup,
            region_face_indices,
        ),
        bounding_box=_region_bounding_box(
            context=context,
            face_lookup=face_lookup,
            region_face_indices=region_face_indices,
        ),
        classification=classification,
        severity=severity,
        confidence=confidence,
        confirmed_face_count=confirmed_face_count,
        potential_face_count=potential_face_count,
        reason_summary=_region_reason_summary(
            assessment_lookup,
            region_face_indices,
        ),
        warnings=tuple(warnings),
    )


def _classify_face(
    *,
    blocked_ratio: float,
    ambiguous_sample_count: int,
    sample_count: int,
    settings: UndercutAnalysisSettings,
) -> UndercutFaceClassification:
    ambiguous_ratio = _safe_ratio(ambiguous_sample_count, sample_count)

    if sample_count == 0:
        return UndercutFaceClassification.AMBIGUOUS

    if blocked_ratio >= settings.confirmed_blocked_ratio_threshold:
        if ambiguous_ratio > settings.ambiguity_tolerance:
            return UndercutFaceClassification.POTENTIAL_UNDERCUT

        return UndercutFaceClassification.CONFIRMED_UNDERCUT

    if blocked_ratio >= settings.potential_blocked_ratio_threshold:
        return UndercutFaceClassification.POTENTIAL_UNDERCUT

    if ambiguous_sample_count > 0:
        return UndercutFaceClassification.AMBIGUOUS

    return UndercutFaceClassification.CLEAR


def _face_confidence(
    *,
    classification: UndercutFaceClassification,
    blocked_ratio: float,
    ambiguous_sample_count: int,
    sample_count: int,
) -> float:
    if sample_count == 0:
        return 0.0

    ambiguous_ratio = _safe_ratio(ambiguous_sample_count, sample_count)
    stable_ratio = 1.0 - ambiguous_ratio

    if classification is UndercutFaceClassification.CLEAR:
        return stable_ratio

    if classification is UndercutFaceClassification.AMBIGUOUS:
        return stable_ratio * (1.0 - ambiguous_ratio)

    if classification is UndercutFaceClassification.POTENTIAL_UNDERCUT:
        return min(1.0, 0.35 + (0.65 * blocked_ratio)) * stable_ratio

    return min(1.0, 0.5 + (0.5 * blocked_ratio)) * stable_ratio


def _face_reason_codes(
    *,
    classification: UndercutFaceClassification,
    accessible_sample_count: int,
    bidirectionally_blocked_sample_count: int,
    ambiguous_sample_count: int,
    sample_count: int,
) -> tuple[UndercutFaceReasonCode, ...]:
    reason_codes: list[UndercutFaceReasonCode] = []

    if accessible_sample_count > 0:
        reason_codes.append(UndercutFaceReasonCode.DIRECTIONALLY_ACCESSIBLE)

    if 0 < bidirectionally_blocked_sample_count < sample_count:
        reason_codes.append(UndercutFaceReasonCode.PARTIALLY_BLOCKED)

    if bidirectionally_blocked_sample_count > 0:
        reason_codes.append(UndercutFaceReasonCode.BIDIRECTIONALLY_BLOCKED)
        if classification in (
            UndercutFaceClassification.POTENTIAL_UNDERCUT,
            UndercutFaceClassification.CONFIRMED_UNDERCUT,
        ):
            reason_codes.append(
                UndercutFaceReasonCode.ENCLOSED_OR_DIRECTIONALLY_BLOCKED
            )

    if ambiguous_sample_count > 0:
        reason_codes.append(UndercutFaceReasonCode.NUMERICALLY_AMBIGUOUS)

    return _deduplicate_reason_codes(reason_codes)


def _path_accessibility(
    *,
    origin: Vector3D,
    direction: Vector3D,
    ray_query_backend: MeshRayQueryBackend,
    ignored_face_index: int,
    ambiguity_distance_mm: float,
    intersection_epsilon_mm: float,
) -> _PathAccessibility:
    if not origin.is_finite() or not direction.is_finite():
        return _PathAccessibility.AMBIGUOUS

    hit = ray_query_backend.first_hit(
        origin,
        direction,
        ignored_face_index=ignored_face_index,
        min_distance_mm=intersection_epsilon_mm,
    )
    if hit is None:
        return _PathAccessibility.CLEAR

    if hit.distance_mm <= ambiguity_distance_mm:
        return _PathAccessibility.AMBIGUOUS

    return _PathAccessibility.BLOCKED


def _face_vertices(
    context: DetailedMoldAnalysisContext,
    face: FaceGeometry,
) -> tuple[Vector3D, Vector3D, Vector3D] | None:
    points: list[Vector3D] = []

    for vertex_index in face.vertex_indices:
        if vertex_index < 0 or vertex_index >= len(context.model.vertices):
            return None

        vertex = context.model.vertices[vertex_index]
        point = Vector3D(vertex.x, vertex.y, vertex.z)
        if not point.is_finite():
            return None

        points.append(point)

    return (points[0], points[1], points[2])


def _sample_point(
    triangle_vertices: tuple[Vector3D, Vector3D, Vector3D],
    barycentric_coordinates: tuple[float, float, float],
) -> Vector3D:
    return (
        (triangle_vertices[0] * barycentric_coordinates[0])
        + (triangle_vertices[1] * barycentric_coordinates[1])
        + (triangle_vertices[2] * barycentric_coordinates[2])
    )


def _region_bounding_box(
    *,
    context: DetailedMoldAnalysisContext,
    face_lookup: dict[int, FaceGeometry],
    region_face_indices: tuple[int, ...],
) -> BoundingBox | None:
    region_vertices: list[Vertex] = []

    for face_index in region_face_indices:
        face = face_lookup[face_index]
        for vertex_index in face.vertex_indices:
            if vertex_index < 0 or vertex_index >= len(context.model.vertices):
                return None
            region_vertices.append(context.model.vertices[vertex_index])

    if not region_vertices:
        return None

    return BoundingBox(
        minimum=Vertex(
            x=min(vertex.x for vertex in region_vertices),
            y=min(vertex.y for vertex in region_vertices),
            z=min(vertex.z for vertex in region_vertices),
        ),
        maximum=Vertex(
            x=max(vertex.x for vertex in region_vertices),
            y=max(vertex.y for vertex in region_vertices),
            z=max(vertex.z for vertex in region_vertices),
        ),
    )


def _area_weighted_centroid(
    face_lookup: dict[int, FaceGeometry],
    region_face_indices: tuple[int, ...],
) -> Vector3D | None:
    weighted_sum = Vector3D(0.0, 0.0, 0.0)
    total_area_sq_mm = 0.0

    for face_index in region_face_indices:
        face = face_lookup[face_index]
        if face.centroid is None or face.area <= 0.0:
            continue

        weighted_sum = weighted_sum + (face.centroid * face.area)
        total_area_sq_mm += face.area

    if total_area_sq_mm <= 0.0:
        return None

    return weighted_sum * (1.0 / total_area_sq_mm)


def _region_reason_summary(
    assessment_lookup: dict[int, UndercutFaceAssessment],
    region_face_indices: tuple[int, ...],
) -> tuple[UndercutFaceReasonCode, ...]:
    return _deduplicate_reason_codes(
        reason_code
        for face_index in region_face_indices
        for reason_code in assessment_lookup[face_index].reason_codes
    )


def _classify_region_severity(
    *,
    classification: UndercutRegionClassification,
    total_area_sq_mm: float,
    area_ratio: float,
    confidence: float,
    settings: UndercutAnalysisSettings,
) -> UndercutRegionSeverity:
    if (
        total_area_sq_mm < settings.minimum_meaningful_region_area_sq_mm
        or area_ratio < settings.minimum_meaningful_region_area_ratio
    ):
        return UndercutRegionSeverity.TINY

    if classification is UndercutRegionClassification.POTENTIAL_UNDERCUT:
        return UndercutRegionSeverity.LOW

    if (
        area_ratio >= settings.high_severity_region_area_ratio
        and confidence >= settings.low_confidence_threshold
    ):
        return UndercutRegionSeverity.HIGH

    if (
        area_ratio >= settings.medium_severity_region_area_ratio
        or confidence >= settings.high_confidence_threshold
    ):
        return UndercutRegionSeverity.MEDIUM

    return UndercutRegionSeverity.LOW


def _overall_confidence(
    face_analysis: FaceGeometryAnalysis,
    face_assessments: tuple[UndercutFaceAssessment, ...],
) -> float:
    weighted_confidence = 0.0
    total_area_sq_mm = 0.0
    face_lookup = {face.face_index: face for face in face_analysis.faces}

    for assessment in face_assessments:
        face = face_lookup[assessment.face_index]
        if face.area <= 0.0:
            continue

        weighted_confidence += face.area * assessment.confidence
        total_area_sq_mm += face.area

    return _safe_ratio(weighted_confidence, total_area_sq_mm)


def _resolve_outcome(
    *,
    face_assessments: tuple[UndercutFaceAssessment, ...],
    confirmed_region_count: int,
    potential_region_count: int,
) -> UndercutAnalysisOutcome:
    if confirmed_region_count > 0:
        return UndercutAnalysisOutcome.CONFIRMED_UNDERCUTS_FOUND

    if potential_region_count > 0:
        return UndercutAnalysisOutcome.POTENTIAL_UNDERCUTS_FOUND

    if any(
        assessment.classification is UndercutFaceClassification.AMBIGUOUS
        for assessment in face_assessments
    ):
        return UndercutAnalysisOutcome.AMBIGUOUS

    return UndercutAnalysisOutcome.CLEAR


def _highest_region_severity(
    regions: tuple[UndercutRegion, ...],
) -> UndercutRegionSeverity | None:
    if not regions:
        return None

    return max(
        regions, key=lambda region: _REGION_SEVERITY_ORDER[region.severity]
    ).severity


def _build_unevaluable_result(
    *,
    selected_pull_direction: PullDirectionCandidate | None,
    face_assessments: tuple[UndercutFaceAssessment, ...],
    warnings: list[UndercutAnalysisWarning],
) -> UndercutAnalysisResult:
    return UndercutAnalysisResult(
        selected_pull_direction=selected_pull_direction,
        is_evaluable=False,
        outcome=UndercutAnalysisOutcome.UNEVALUABLE,
        face_assessments=face_assessments,
        warnings=tuple(warnings),
    )


def _model_diagonal_length_mm(context: DetailedMoldAnalysisContext) -> float:
    dimensions = context.model.dimensions
    diagonal = Vector3D(dimensions.x, dimensions.y, dimensions.z).magnitude()
    if diagonal <= 0.0:
        return 1.0
    return diagonal


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0.0:
        return 0.0
    return numerator / denominator


def _deduplicate_reason_codes(
    reason_codes: list[UndercutFaceReasonCode] | tuple[UndercutFaceReasonCode, ...],
) -> tuple[UndercutFaceReasonCode, ...]:
    ordered_reason_codes: list[UndercutFaceReasonCode] = []
    seen_reason_codes: set[UndercutFaceReasonCode] = set()

    for reason_code in reason_codes:
        if reason_code in seen_reason_codes:
            continue

        ordered_reason_codes.append(reason_code)
        seen_reason_codes.add(reason_code)

    return tuple(ordered_reason_codes)


_REGION_SEVERITY_ORDER = {
    UndercutRegionSeverity.TINY: 0,
    UndercutRegionSeverity.LOW: 1,
    UndercutRegionSeverity.MEDIUM: 2,
    UndercutRegionSeverity.HIGH: 3,
}
