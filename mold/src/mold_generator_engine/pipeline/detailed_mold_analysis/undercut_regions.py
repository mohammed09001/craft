from __future__ import annotations

from dataclasses import dataclass, replace
from math import isfinite

from mold_generator_engine.config.undercut import UndercutRegionAnalysisSettings
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.mesh_adjacency import (
    Edge,
    FaceAdjacencyGraph,
    build_face_adjacency_graph,
)
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisStatus,
    DraftAnalysisResult,
    DraftReleaseSide,
    DraftSurfaceType,
    FaceDraftAnalysis,
    FaceGeometry,
    FaceGeometryAnalysis,
    PreliminaryPullDirectionSelection,
    PreliminaryPullDirectionSelectionStatus,
    PullDirectionCandidate,
    UndercutAnalysisResult,
    UndercutConnectedRegion,
    UndercutFaceAssessment,
    UndercutFaceClassification,
    UndercutRegionAnalysis,
    UndercutRegionAnalysisWarning,
    UndercutRegionAnalysisWarningCode,
    UndercutRegionDraftSummary,
)
from mold_generator_engine.models.imported_model import BoundingBox, Vertex
from mold_generator_engine.pipeline.detailed_mold_analysis.contracts import (
    UndercutRegionAnalyzer,
)


@dataclass(frozen=True, slots=True)
class DefaultUndercutRegionAnalyzer:
    """Build deterministic connected confirmed-undercut regions from stage-5 output."""

    settings: UndercutRegionAnalysisSettings = UndercutRegionAnalysisSettings()

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis: FaceGeometryAnalysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_analysis: UndercutAnalysisResult | None,
        draft_analysis: DraftAnalysisResult | None,
    ) -> UndercutRegionAnalysis:
        """Analyze connected confirmed undercut regions without re-running rays."""
        warnings: list[UndercutRegionAnalysisWarning] = []
        selected_candidate = _resolve_selected_candidate(
            preliminary_selection=preliminary_selection,
            undercut_analysis=undercut_analysis,
        )

        if (
            preliminary_selection is not None
            and preliminary_selection.status
            is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
        ):
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.AMBIGUOUS_PULL_DIRECTION_SELECTION
                    ),
                    message=(
                        "Stage-4 pull-direction selection is ambiguous, so stage-7 "
                        "region analysis uses its deterministic representative only "
                        "as preliminary evidence."
                    ),
                )
            )

        if undercut_analysis is None:
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.NO_PRELIMINARY_UNDERCUT_ANALYSIS
                    ),
                    message=(
                        "Stage-7 region analysis requires the completed preliminary "
                        "undercut analysis produced by stage 5."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        if not undercut_analysis.is_evaluable:
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.UNEVALUABLE_PRELIMINARY_UNDERCUT_ANALYSIS
                    ),
                    message=(
                        "Stage-7 region analysis cannot continue because the "
                        "preliminary undercut analysis is unevaluable."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        if selected_candidate is None:
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=UndercutRegionAnalysisWarningCode.NO_SELECTED_PULL_DIRECTION,
                    message=(
                        "Stage-7 region analysis requires the selected pull "
                        "direction produced by stage 4."
                    ),
                )
            )
            return _build_unevaluable_result(None, warnings)

        try:
            unit_pull_direction = selected_candidate.direction.normalized(
                minimum_magnitude=0.0
            )
        except InvalidVectorError:
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.INVALID_SELECTED_PULL_DIRECTION
                    ),
                    message=(
                        "The selected pull direction must be finite and non-zero "
                        "before stage-7 region analysis can run."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        assessment_lookup = {
            assessment.face_index: assessment
            for assessment in undercut_analysis.face_assessments
        }
        if not _has_complete_face_assessments(face_analysis, assessment_lookup):
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=UndercutRegionAnalysisWarningCode.INCOMPLETE_FACE_ASSESSMENTS,
                    message=(
                        "Stage-7 region analysis requires face-level undercut "
                        "assessments aligned with every analyzed face."
                    ),
                )
            )
            return _build_unevaluable_result(selected_candidate, warnings)

        draft_lookup = _build_draft_lookup(draft_analysis)
        if draft_lookup is None:
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=UndercutRegionAnalysisWarningCode.DRAFT_ANALYSIS_UNAVAILABLE,
                    message=(
                        "Draft-angle enrichment is unavailable, so stage-7 region "
                        "analysis proceeds without draft summaries."
                    ),
                )
            )

        adjacency_graph = build_face_adjacency_graph(context.model)
        face_lookup = {face.face_index: face for face in face_analysis.faces}
        confirmed_face_indices = tuple(
            sorted(
                assessment.face_index
                for assessment in undercut_analysis.face_assessments
                if assessment.classification
                is UndercutFaceClassification.CONFIRMED_UNDERCUT
            )
        )
        if not confirmed_face_indices:
            return UndercutRegionAnalysis(
                status=_resolve_status(preliminary_selection),
                selected_pull_direction=selected_candidate,
                is_evaluable=True,
                warnings=tuple(warnings),
            )

        pending_regions = [
            _build_pending_region(
                context=context,
                adjacency_graph=adjacency_graph,
                face_lookup=face_lookup,
                assessment_lookup=assessment_lookup,
                draft_lookup=draft_lookup,
                region_face_indices=region_face_indices,
                valid_surface_area_sq_mm=face_analysis.valid_surface_area_sq_mm,
                unit_pull_direction=unit_pull_direction,
                settings=self.settings,
            )
            for region_face_indices in _collect_components(
                confirmed_face_indices,
                adjacency_graph,
            )
        ]
        sorted_regions = sorted(
            pending_regions, key=lambda region: region.seed_face_index
        )
        region_id_by_face_index: dict[int, str] = {}
        ordered_regions: list[UndercutConnectedRegion] = []

        for order_index, region in enumerate(sorted_regions, start=1):
            region_id = _region_id(order_index, self.settings)
            for face_index in region.face_indices:
                region_id_by_face_index[face_index] = region_id
            ordered_regions.append(
                replace(
                    region,
                    region_id=region_id,
                    order_index=order_index,
                )
            )

        bridge_region_ids = _build_ambiguous_bridge_region_ids(
            adjacency_graph=adjacency_graph,
            assessment_lookup=assessment_lookup,
            region_id_by_face_index=region_id_by_face_index,
        )
        final_regions = tuple(
            _with_ambiguous_bridges(
                region,
                bridge_region_ids.get(region.region_id, ()),
            )
            for region in ordered_regions
        )

        if any(region.touches_non_manifold_edge for region in final_regions):
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.NON_MANIFOLD_CONNECTIVITY_PRESENT
                    ),
                    message=(
                        "One or more connected undercut regions touch non-manifold "
                        "mesh connectivity."
                    ),
                    metadata={
                        "affected_region_count": sum(
                            region.touches_non_manifold_edge for region in final_regions
                        ),
                    },
                )
            )
        if any(region.touches_open_boundary for region in final_regions):
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.OPEN_BOUNDARY_CONNECTIVITY_PRESENT
                    ),
                    message=(
                        "One or more connected undercut regions touch open mesh "
                        "boundaries."
                    ),
                )
            )
        if any(region.ambiguous_bridge_region_ids for region in final_regions):
            warnings.append(
                UndercutRegionAnalysisWarning(
                    code=(
                        UndercutRegionAnalysisWarningCode.AMBIGUOUS_FACE_BRIDGES_PRESENT
                    ),
                    message=(
                        "One or more region pairs are separated only by chains of "
                        "ambiguous faces and remain intentionally unmerged."
                    ),
                )
            )

        largest_region = max(
            final_regions,
            key=lambda region: (region.total_area_sq_mm, -region.order_index),
        )
        total_area_sq_mm = sum(region.total_area_sq_mm for region in final_regions)

        return UndercutRegionAnalysis(
            status=_resolve_status(preliminary_selection),
            selected_pull_direction=selected_candidate,
            is_evaluable=True,
            regions=final_regions,
            region_count=len(final_regions),
            confirmed_face_count=len(confirmed_face_indices),
            total_area_sq_mm=total_area_sq_mm,
            area_ratio=_safe_ratio(
                total_area_sq_mm,
                face_analysis.valid_surface_area_sq_mm,
            ),
            largest_region_id=largest_region.region_id,
            largest_region_area_sq_mm=largest_region.total_area_sq_mm,
            regions_touching_ambiguous_faces_count=sum(
                bool(region.adjacent_ambiguous_face_indices) for region in final_regions
            ),
            regions_touching_non_manifold_count=sum(
                region.touches_non_manifold_edge for region in final_regions
            ),
            affected_non_manifold_edge_count=sum(
                region.affected_non_manifold_edge_count for region in final_regions
            ),
            regions_touching_open_boundaries_count=sum(
                region.touches_open_boundary for region in final_regions
            ),
            warnings=tuple(warnings),
        )


DEFAULT_UNDERCUT_REGION_ANALYZER: UndercutRegionAnalyzer = (
    DefaultUndercutRegionAnalyzer()
)


def _resolve_selected_candidate(
    *,
    preliminary_selection: PreliminaryPullDirectionSelection | None,
    undercut_analysis: UndercutAnalysisResult | None,
) -> PullDirectionCandidate | None:
    if (
        undercut_analysis is not None
        and undercut_analysis.selected_pull_direction is not None
    ):
        return undercut_analysis.selected_pull_direction

    if preliminary_selection is None:
        return None

    return preliminary_selection.selected_candidate


def _has_complete_face_assessments(
    face_analysis: FaceGeometryAnalysis,
    assessment_lookup: dict[int, UndercutFaceAssessment],
) -> bool:
    if len(assessment_lookup) != face_analysis.total_face_count:
        return False

    return all(face.face_index in assessment_lookup for face in face_analysis.faces)


def _build_draft_lookup(
    draft_analysis: DraftAnalysisResult | None,
) -> dict[int, FaceDraftAnalysis] | None:
    if draft_analysis is None or not draft_analysis.face_results:
        return None

    return {
        face_result.face_index: face_result
        for face_result in draft_analysis.face_results
    }


def _collect_components(
    confirmed_face_indices: tuple[int, ...],
    adjacency_graph: FaceAdjacencyGraph,
) -> tuple[tuple[int, ...], ...]:
    pending_face_indices = set(confirmed_face_indices)
    components: list[tuple[int, ...]] = []

    for start_face_index in confirmed_face_indices:
        if start_face_index not in pending_face_indices:
            continue

        component: list[int] = []
        queue = [start_face_index]
        pending_face_indices.remove(start_face_index)

        while queue:
            current_face_index = queue.pop(0)
            component.append(current_face_index)

            for neighbor_face_index in adjacency_graph.neighbors(current_face_index):
                if neighbor_face_index not in pending_face_indices:
                    continue

                pending_face_indices.remove(neighbor_face_index)
                queue.append(neighbor_face_index)

        components.append(tuple(sorted(component)))

    return tuple(components)


def _build_pending_region(
    *,
    context: DetailedMoldAnalysisContext,
    adjacency_graph: FaceAdjacencyGraph,
    face_lookup: dict[int, FaceGeometry],
    assessment_lookup: dict[int, UndercutFaceAssessment],
    draft_lookup: dict[int, FaceDraftAnalysis] | None,
    region_face_indices: tuple[int, ...],
    valid_surface_area_sq_mm: float,
    unit_pull_direction: Vector3D,
    settings: UndercutRegionAnalysisSettings,
) -> UndercutConnectedRegion:
    region_face_index_set = set(region_face_indices)
    total_area_sq_mm = 0.0
    measurable_face_count = 0
    degenerate_face_count = 0
    centroid_weighted_sum = Vector3D(0.0, 0.0, 0.0)
    centroid_area_sum = 0.0
    confidence_weighted_sum = 0.0
    confirmed_sample_count = 0
    ambiguous_sample_count = 0
    accessible_sample_count = 0
    total_sample_count = 0
    region_vertices: list[Vector3D] = []

    for face_index in region_face_indices:
        face = face_lookup[face_index]
        assessment = assessment_lookup[face_index]
        total_area_sq_mm += face.area
        confidence_weighted_sum += face.area * assessment.confidence
        confirmed_sample_count += assessment.bidirectionally_blocked_sample_count
        ambiguous_sample_count += assessment.ambiguous_sample_count
        accessible_sample_count += assessment.accessible_sample_count
        total_sample_count += assessment.sample_count

        if face.is_degenerate:
            degenerate_face_count += 1

        if (
            face.centroid is not None
            and face.area >= settings.minimum_centroid_face_area_sq_mm
            and isfinite(face.area)
        ):
            centroid_weighted_sum = centroid_weighted_sum + (face.centroid * face.area)
            centroid_area_sum += face.area
            measurable_face_count += 1

        region_vertices.extend(_face_vertices(context, face))

    boundary_face_indices: set[int] = set()
    adjacent_pullable_face_indices: set[int] = set()
    adjacent_ambiguous_face_indices: set[int] = set()
    adjacent_potential_face_indices: set[int] = set()
    boundary_surface_types: set[DraftSurfaceType] = set()
    touched_non_manifold_edges: set[Edge] = set()
    touched_open_boundary_edges: set[Edge] = set()
    boundary_edge_count = 0

    for face_index in region_face_indices:
        for edge in adjacency_graph.face_edges(face_index):
            edge_face_indices = adjacency_graph.edge_faces(edge)
            if len(edge_face_indices) >= 3:
                touched_non_manifold_edges.add(edge)

            outside_face_indices = tuple(
                sorted(
                    neighbor_face_index
                    for neighbor_face_index in edge_face_indices
                    if neighbor_face_index not in region_face_index_set
                )
            )
            is_boundary_edge = len(edge_face_indices) == 1 or bool(outside_face_indices)
            if not is_boundary_edge:
                continue

            boundary_edge_count += 1
            boundary_face_indices.add(face_index)
            if len(edge_face_indices) == 1:
                touched_open_boundary_edges.add(edge)

            for neighbor_face_index in outside_face_indices:
                assessment = assessment_lookup.get(neighbor_face_index)
                if assessment is None:
                    continue

                if assessment.classification is UndercutFaceClassification.CLEAR:
                    adjacent_pullable_face_indices.add(neighbor_face_index)
                elif assessment.classification is UndercutFaceClassification.AMBIGUOUS:
                    adjacent_ambiguous_face_indices.add(neighbor_face_index)
                elif (
                    assessment.classification
                    is UndercutFaceClassification.POTENTIAL_UNDERCUT
                ):
                    adjacent_potential_face_indices.add(neighbor_face_index)

                if draft_lookup is None:
                    continue

                draft_face = draft_lookup.get(neighbor_face_index)
                if draft_face is None:
                    continue
                boundary_surface_types.add(draft_face.surface_type)

    axial_projections, lateral_u_projections, lateral_v_projections = _project_region(
        region_vertices=region_vertices,
        unit_pull_direction=unit_pull_direction,
        settings=settings,
    )
    axial_projection_min_mm = min(axial_projections) if axial_projections else None
    axial_projection_max_mm = max(axial_projections) if axial_projections else None
    axial_extent_mm = _projection_extent(axial_projections)
    lateral_extent_u_mm = _projection_extent(lateral_u_projections)
    lateral_extent_v_mm = _projection_extent(lateral_v_projections)
    maximum_lateral_extent_mm = max(lateral_extent_u_mm, lateral_extent_v_mm)

    warnings: list[str] = []
    if touched_non_manifold_edges:
        warnings.append(
            "Region touches one or more non-manifold edges and remains connected "
            "through shared-edge topology."
        )
    if touched_open_boundary_edges:
        warnings.append("Region touches one or more open mesh boundary edges.")

    return UndercutConnectedRegion(
        region_id="pending",
        order_index=0,
        seed_face_index=region_face_indices[0],
        face_indices=region_face_indices,
        face_count=len(region_face_indices),
        total_area_sq_mm=total_area_sq_mm,
        area_ratio=_safe_ratio(total_area_sq_mm, valid_surface_area_sq_mm),
        area_weighted_centroid=(
            None
            if centroid_area_sum <= 0.0
            else centroid_weighted_sum * (1.0 / centroid_area_sum)
        ),
        measurable_face_count=measurable_face_count,
        degenerate_face_count=degenerate_face_count,
        axial_projection_min_mm=axial_projection_min_mm,
        axial_projection_max_mm=axial_projection_max_mm,
        axial_extent_mm=axial_extent_mm,
        lateral_extent_u_mm=lateral_extent_u_mm,
        lateral_extent_v_mm=lateral_extent_v_mm,
        maximum_lateral_extent_mm=maximum_lateral_extent_mm,
        axial_to_lateral_extent_ratio=(
            None
            if maximum_lateral_extent_mm <= 0.0
            else axial_extent_mm / maximum_lateral_extent_mm
        ),
        bounding_box=_bounding_box(region_vertices),
        boundary_edge_count=boundary_edge_count,
        boundary_face_indices=tuple(sorted(boundary_face_indices)),
        adjacent_pullable_face_indices=tuple(sorted(adjacent_pullable_face_indices)),
        adjacent_ambiguous_face_indices=tuple(sorted(adjacent_ambiguous_face_indices)),
        adjacent_potential_face_indices=tuple(sorted(adjacent_potential_face_indices)),
        touches_open_boundary=bool(touched_open_boundary_edges),
        open_boundary_edge_count=len(touched_open_boundary_edges),
        touches_non_manifold_edge=bool(touched_non_manifold_edges),
        affected_non_manifold_edge_count=len(touched_non_manifold_edges),
        confirmed_sample_count=confirmed_sample_count,
        ambiguous_sample_count=ambiguous_sample_count,
        accessible_sample_count=accessible_sample_count,
        total_sample_count=total_sample_count,
        blocked_sample_ratio=_safe_ratio(confirmed_sample_count, total_sample_count),
        confidence=_safe_ratio(confidence_weighted_sum, total_area_sq_mm),
        draft_summary=_build_draft_summary(
            region_face_indices=region_face_indices,
            adjacent_boundary_face_indices=tuple(
                sorted(
                    adjacent_pullable_face_indices
                    | adjacent_ambiguous_face_indices
                    | adjacent_potential_face_indices
                )
            ),
            draft_lookup=draft_lookup,
            boundary_surface_types=tuple(
                sorted(boundary_surface_types, key=lambda value: value.value)
            ),
        ),
        warnings=tuple(warnings),
    )


def _face_vertices(
    context: DetailedMoldAnalysisContext,
    face: FaceGeometry,
) -> tuple[Vector3D, Vector3D, Vector3D]:
    vertices = []
    for vertex_index in face.vertex_indices:
        vertex = context.model.vertices[vertex_index]
        vertices.append(Vector3D(vertex.x, vertex.y, vertex.z))

    return (vertices[0], vertices[1], vertices[2])


def _project_region(
    *,
    region_vertices: list[Vector3D],
    unit_pull_direction: Vector3D,
    settings: UndercutRegionAnalysisSettings,
) -> tuple[list[float], list[float], list[float]]:
    if not region_vertices:
        return ([], [], [])

    basis_u, basis_v = _orthogonal_basis(
        unit_pull_direction=unit_pull_direction,
        settings=settings,
    )
    axial_projections = [vertex.dot(unit_pull_direction) for vertex in region_vertices]
    lateral_u_projections = [vertex.dot(basis_u) for vertex in region_vertices]
    lateral_v_projections = [vertex.dot(basis_v) for vertex in region_vertices]
    return (axial_projections, lateral_u_projections, lateral_v_projections)


def _orthogonal_basis(
    *,
    unit_pull_direction: Vector3D,
    settings: UndercutRegionAnalysisSettings,
) -> tuple[Vector3D, Vector3D]:
    reference_axes = (
        Vector3D(1.0, 0.0, 0.0),
        Vector3D(0.0, 1.0, 0.0),
        Vector3D(0.0, 0.0, 1.0),
    )
    reference_axis = min(
        reference_axes,
        key=lambda axis: abs(axis.dot(unit_pull_direction)),
    )
    basis_u = reference_axis.cross(unit_pull_direction).normalized(
        minimum_magnitude=settings.orthogonal_basis_minimum_magnitude
    )
    basis_v = unit_pull_direction.cross(basis_u).normalized(
        minimum_magnitude=settings.orthogonal_basis_minimum_magnitude
    )
    return (basis_u, basis_v)


def _projection_extent(projections: list[float]) -> float:
    if not projections:
        return 0.0
    return max(projections) - min(projections)


def _bounding_box(region_vertices: list[Vector3D]) -> BoundingBox | None:
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


def _build_draft_summary(
    *,
    region_face_indices: tuple[int, ...],
    adjacent_boundary_face_indices: tuple[int, ...],
    draft_lookup: dict[int, FaceDraftAnalysis] | None,
    boundary_surface_types: tuple[DraftSurfaceType, ...],
) -> UndercutRegionDraftSummary | None:
    if draft_lookup is None:
        return None

    region_faces = [
        draft_lookup[face_index]
        for face_index in region_face_indices
        if face_index in draft_lookup
    ]
    if not region_faces:
        return None

    weighted_sum = 0.0
    weighted_area_sum = 0.0
    signed_angles = [
        face.signed_draft_angle_degrees
        for face in region_faces
        if face.signed_draft_angle_degrees is not None
    ]

    for face in region_faces:
        if face.signed_draft_angle_degrees is None:
            continue
        weighted_sum += face.face_area_sq_mm * face.signed_draft_angle_degrees
        weighted_area_sum += face.face_area_sq_mm

    return UndercutRegionDraftSummary(
        negative_release_face_count=sum(
            face.release_side is DraftReleaseSide.NEGATIVE for face in region_faces
        ),
        neutral_release_face_count=sum(
            face.release_side is DraftReleaseSide.NEUTRAL for face in region_faces
        ),
        positive_release_face_count=sum(
            face.release_side is DraftReleaseSide.POSITIVE for face in region_faces
        ),
        ambiguous_face_count=sum(
            face.release_side is DraftReleaseSide.AMBIGUOUS for face in region_faces
        ),
        unevaluable_face_count=sum(
            face.release_side is DraftReleaseSide.UNEVALUABLE for face in region_faces
        ),
        minimum_signed_draft_angle_degrees=(
            min(signed_angles) if signed_angles else None
        ),
        maximum_signed_draft_angle_degrees=(
            max(signed_angles) if signed_angles else None
        ),
        area_weighted_mean_signed_draft_angle_degrees=(
            None if weighted_area_sum <= 0.0 else weighted_sum / weighted_area_sum
        ),
        boundary_surface_types=tuple(
            sorted(
                {
                    *boundary_surface_types,
                    *(
                        draft_lookup[face_index].surface_type
                        for face_index in adjacent_boundary_face_indices
                        if face_index in draft_lookup
                    ),
                },
                key=lambda value: value.value,
            )
        ),
    )


def _build_ambiguous_bridge_region_ids(
    *,
    adjacency_graph: FaceAdjacencyGraph,
    assessment_lookup: dict[int, UndercutFaceAssessment],
    region_id_by_face_index: dict[int, str],
) -> dict[str, tuple[str, ...]]:
    ambiguous_face_indices = sorted(
        face_index
        for face_index, assessment in assessment_lookup.items()
        if assessment.classification is UndercutFaceClassification.AMBIGUOUS
    )
    pending_face_indices = set(ambiguous_face_indices)
    bridge_region_ids: dict[str, set[str]] = {}

    for start_face_index in ambiguous_face_indices:
        if start_face_index not in pending_face_indices:
            continue

        queue = [start_face_index]
        pending_face_indices.remove(start_face_index)
        component: list[int] = []

        while queue:
            current_face_index = queue.pop(0)
            component.append(current_face_index)

            for neighbor_face_index in adjacency_graph.neighbors(current_face_index):
                if neighbor_face_index not in pending_face_indices:
                    continue
                pending_face_indices.remove(neighbor_face_index)
                queue.append(neighbor_face_index)

        touched_region_ids = sorted(
            {
                region_id_by_face_index[neighbor_face_index]
                for face_index in component
                for neighbor_face_index in adjacency_graph.neighbors(face_index)
                if neighbor_face_index in region_id_by_face_index
            }
        )
        if len(touched_region_ids) < 2:
            continue

        for region_id in touched_region_ids:
            bridge_region_ids.setdefault(region_id, set()).update(
                other_region_id
                for other_region_id in touched_region_ids
                if other_region_id != region_id
            )

    return {
        region_id: tuple(sorted(other_region_ids))
        for region_id, other_region_ids in bridge_region_ids.items()
    }


def _with_ambiguous_bridges(
    region: UndercutConnectedRegion,
    bridge_region_ids: tuple[str, ...],
) -> UndercutConnectedRegion:
    if not bridge_region_ids:
        return region

    updated_warnings = list(region.warnings)
    updated_warnings.append(
        "Region remains separate from one or more other confirmed regions because "
        "they are connected only through ambiguous faces."
    )
    return replace(
        region,
        ambiguous_bridge_region_ids=bridge_region_ids,
        warnings=tuple(updated_warnings),
    )


def _region_id(
    order_index: int,
    settings: UndercutRegionAnalysisSettings,
) -> str:
    return (
        f"{settings.region_id_prefix}-{order_index:0{settings.region_id_zero_padding}d}"
    )


def _resolve_status(
    preliminary_selection: PreliminaryPullDirectionSelection | None,
) -> DetailedMoldAnalysisStatus:
    if preliminary_selection is not None and (
        preliminary_selection.status
        is PreliminaryPullDirectionSelectionStatus.AMBIGUOUS
    ):
        return DetailedMoldAnalysisStatus.PARTIAL

    return DetailedMoldAnalysisStatus.COMPLETED


def _build_unevaluable_result(
    selected_pull_direction: PullDirectionCandidate | None,
    warnings: list[UndercutRegionAnalysisWarning],
) -> UndercutRegionAnalysis:
    return UndercutRegionAnalysis(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        selected_pull_direction=selected_pull_direction,
        is_evaluable=False,
        warnings=tuple(warnings),
    )


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0.0:
        return 0.0
    return numerator / denominator
