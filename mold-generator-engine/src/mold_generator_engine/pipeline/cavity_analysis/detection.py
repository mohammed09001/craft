from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from mold_generator_engine.config.geometry import DEFAULT_LINEAR_TOLERANCE_MM
from mold_generator_engine.geometry.mesh_adjacency import (
    Edge,
    build_face_adjacency_graph,
)
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionOutcome,
    CavityCandidateDetectionResult,
    CavityConnectivityClassification,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    InternalCavityCandidate,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.imported_model import Face, ImportedModel, Vertex
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CavityCandidateDetector,
)


@dataclass(frozen=True, slots=True)
class ShellTopologyCavityCandidateDetector:
    """Detect cavity candidates from disconnected shells and conservative containment."""

    linear_tolerance_mm: float = DEFAULT_LINEAR_TOLERANCE_MM
    containment_classifier: _ShellContainmentClassifier | None = None

    def detect(
        self,
        context: CavityAnalysisContext,
    ) -> CavityCandidateDetectionResult:
        """Detect internal cavity candidates from topology and shell nesting only."""
        validation_findings = _validate_model(context.model)
        if validation_findings:
            return CavityCandidateDetectionResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                outcome=CavityCandidateDetectionOutcome.NOT_ASSESSABLE,
                summary=(
                    "Shell/topology cavity detection could not start because the "
                    "model geometry is not valid for deterministic shell analysis."
                ),
                findings=_order_findings(validation_findings),
            )

        components = _extract_shell_components(
            context.model,
            linear_tolerance_mm=self.linear_tolerance_mm,
        )
        if not components:
            no_component_findings = (
                _finding(
                    code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Shell/topology cavity detection could not build any "
                        "analyzable shell component from the provided mesh."
                    ),
                ),
            )
            return CavityCandidateDetectionResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                outcome=CavityCandidateDetectionOutcome.NOT_ASSESSABLE,
                summary=(
                    "Shell/topology cavity detection could not build analyzable "
                    "shell components from the current mesh."
                ),
                findings=no_component_findings,
            )

        classifier = (
            self.containment_classifier
            or _RayParityShellContainmentClassifier(
                linear_tolerance_mm=self.linear_tolerance_mm,
            )
        )
        containment_by_child: dict[int, set[int]] = defaultdict(set)
        ambiguous_containers_by_child: dict[int, set[int]] = defaultdict(set)

        for child in components:
            for parent in components:
                if child.component_index == parent.component_index:
                    continue
                if not parent.is_closed_manifold:
                    continue
                if not _bounding_boxes_may_nest(
                    outer_bounds=parent.bounds,
                    inner_bounds=child.bounds,
                    tolerance_mm=self.linear_tolerance_mm,
                ):
                    continue

                decision = classifier.classify(parent, child)
                if decision is _ShellContainmentDecision.CONTAINED:
                    containment_by_child[child.component_index].add(
                        parent.component_index
                    )
                elif decision is _ShellContainmentDecision.AMBIGUOUS:
                    ambiguous_containers_by_child[child.component_index].add(
                        parent.component_index
                    )

        parent_by_child = _resolve_immediate_parents(
            components,
            containment_by_child,
        )
        depth_by_component = _resolve_nesting_depths(parent_by_child)
        findings: list[CavityFinding] = []
        candidate_drafts: list[_CandidateDraft] = []

        root_closed_components = [
            component
            for component in components
            if component.is_closed_manifold
            and parent_by_child.get(component.component_index) is None
        ]
        if len(root_closed_components) > 1:
            findings.append(
                _finding(
                    code=(
                        CavityFindingCode.DISCONNECTED_SOLID_COMPONENTS_ARE_NOT_TREATED_AS_CAVITIES
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "Multiple disconnected closed solid shells were found, "
                        "but disconnected solid components are not treated as "
                        "internal cavities by the current shell/topology method."
                    ),
                    metadata={
                        "root_closed_shell_count": len(root_closed_components),
                        "component_indices": tuple(
                            component.component_index
                            for component in root_closed_components
                        ),
                    },
                )
            )

        for component in components:
            parent_component_index = parent_by_child.get(component.component_index)
            ambiguous_parents = tuple(
                sorted(ambiguous_containers_by_child.get(component.component_index, ()))
            )
            if ambiguous_parents and parent_component_index is None:
                ambiguous_finding = _finding(
                    code=CavityFindingCode.AMBIGUOUS_SHELL_CONTAINMENT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Shell containment remained ambiguous for one detached "
                        "component, so the current detector cannot classify its "
                        "internal-cavity significance reliably."
                    ),
                    metadata={
                        "component_index": component.component_index,
                        "candidate_container_indices": ambiguous_parents,
                    },
                )
                findings.append(ambiguous_finding)
                candidate_drafts.append(
                    _CandidateDraft(
                        component=component,
                        connectivity_classification=(
                            CavityConnectivityClassification.AMBIGUOUS
                        ),
                        parent_component_index=ambiguous_parents[0],
                        nesting_depth=None,
                        is_potential_void_boundary=False,
                        findings=(ambiguous_finding,),
                    )
                )
                continue

            if parent_component_index is None:
                if component.non_manifold_edge_count:
                    findings.append(
                        _finding(
                            code=CavityFindingCode.NON_MANIFOLD_SHELL_NOT_ASSESSABLE,
                            severity=IssueSeverity.WARNING,
                            message=(
                                "A disconnected shell contains non-manifold edges, "
                                "so reliable cavity containment cannot be inferred "
                                "from topology alone."
                            ),
                            metadata={
                                "component_index": component.component_index,
                                "non_manifold_edge_count": (
                                    component.non_manifold_edge_count
                                ),
                            },
                        )
                    )
                elif component.boundary_edge_count:
                    findings.append(
                        _finding(
                            code=(
                                CavityFindingCode.MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION
                            ),
                            severity=IssueSeverity.WARNING,
                            message=(
                                "A disconnected shell contains open boundary edges. "
                                "This is treated as mesh-boundary evidence, not as "
                                "a valid manufacturing opening."
                            ),
                            metadata={
                                "component_index": component.component_index,
                                "boundary_edge_count": component.boundary_edge_count,
                            },
                        )
                    )
                continue

            nesting_depth = depth_by_component.get(parent_component_index, 0) + 1
            if component.non_manifold_edge_count:
                component_finding = _finding(
                    code=CavityFindingCode.NON_MANIFOLD_SHELL_NOT_ASSESSABLE,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "A nested shell contains non-manifold edges, so the "
                        "current detector cannot classify it as a reliable cavity "
                        "candidate."
                    ),
                    metadata={
                        "component_index": component.component_index,
                        "parent_component_index": parent_component_index,
                        "non_manifold_edge_count": component.non_manifold_edge_count,
                    },
                )
                findings.append(component_finding)
                candidate_drafts.append(
                    _CandidateDraft(
                        component=component,
                        connectivity_classification=(
                            CavityConnectivityClassification.NOT_ASSESSABLE
                        ),
                        parent_component_index=parent_component_index,
                        nesting_depth=nesting_depth,
                        is_potential_void_boundary=False,
                        findings=(component_finding,),
                    )
                )
                continue

            if component.boundary_edge_count:
                open_finding = _finding(
                    code=CavityFindingCode.NESTED_OPEN_SHELL_DETECTED,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "A nested shell was found, but it contains open boundary "
                        "edges. The current detector treats this as a mesh-boundary "
                        "defect, not as a valid cavity opening."
                    ),
                    metadata={
                        "component_index": component.component_index,
                        "parent_component_index": parent_component_index,
                        "boundary_edge_count": component.boundary_edge_count,
                    },
                )
                findings.append(open_finding)
                findings.append(
                    _finding(
                        code=(
                            CavityFindingCode.MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION
                        ),
                        severity=IssueSeverity.INFO,
                        message=(
                            "Nested open-shell evidence prevents reliable cavity "
                            "connectivity classification by the current method."
                        ),
                        metadata={
                            "component_index": component.component_index,
                            "parent_component_index": parent_component_index,
                        },
                    )
                )
                candidate_drafts.append(
                    _CandidateDraft(
                        component=component,
                        connectivity_classification=(
                            CavityConnectivityClassification.MESH_BOUNDARY_OPEN
                        ),
                        parent_component_index=parent_component_index,
                        nesting_depth=nesting_depth,
                        is_potential_void_boundary=False,
                        findings=(open_finding,),
                    )
                )
                continue

            if ambiguous_parents:
                ambiguous_finding = _finding(
                    code=CavityFindingCode.AMBIGUOUS_SHELL_CONTAINMENT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "A nested shell was found, but shell containment remains "
                        "ambiguous against at least one possible container."
                    ),
                    metadata={
                        "component_index": component.component_index,
                        "parent_component_index": parent_component_index,
                        "candidate_container_indices": ambiguous_parents,
                    },
                )
                findings.append(ambiguous_finding)
                candidate_drafts.append(
                    _CandidateDraft(
                        component=component,
                        connectivity_classification=(
                            CavityConnectivityClassification.AMBIGUOUS
                        ),
                        parent_component_index=parent_component_index,
                        nesting_depth=nesting_depth,
                        is_potential_void_boundary=False,
                        findings=(ambiguous_finding,),
                    )
                )
                continue

            if nesting_depth % 2 == 1:
                enclosed_finding = _finding(
                    code=CavityFindingCode.NESTED_CLOSED_SHELL_CANDIDATE_DETECTED,
                    severity=IssueSeverity.INFO,
                    message=(
                        "A closed nested shell was found inside a closed parent "
                        "shell. The current detector classifies it as a potential "
                        "enclosed internal-volume boundary."
                    ),
                    metadata={
                        "component_index": component.component_index,
                        "parent_component_index": parent_component_index,
                        "nesting_depth": nesting_depth,
                    },
                )
                findings.append(enclosed_finding)
                candidate_drafts.append(
                    _CandidateDraft(
                        component=component,
                        connectivity_classification=(
                            CavityConnectivityClassification.ENCLOSED
                        ),
                        parent_component_index=parent_component_index,
                        nesting_depth=nesting_depth,
                        is_potential_void_boundary=True,
                        findings=(enclosed_finding,),
                    )
                )
                continue

            findings.append(
                _finding(
                    code=CavityFindingCode.INTERNAL_SHELL_PARITY_INDICATES_SOLID_ISLAND,
                    severity=IssueSeverity.INFO,
                    message=(
                        "A nested closed shell was found at an even nesting depth. "
                        "The current detector treats it as a likely solid island "
                        "boundary rather than as a separate enclosed cavity."
                    ),
                    metadata={
                        "component_index": component.component_index,
                        "parent_component_index": parent_component_index,
                        "nesting_depth": nesting_depth,
                    },
                )
            )

        ordered_candidates = _finalize_candidates(candidate_drafts)
        findings.extend(_method_scope_findings(ordered_candidates))
        ordered_findings = _order_findings(findings)
        outcome = _resolve_detection_outcome(ordered_candidates, ordered_findings)
        status = _resolve_detection_status(outcome, ordered_candidates)

        return CavityCandidateDetectionResult(
            status=status,
            outcome=outcome,
            summary=_build_detection_summary(outcome, ordered_candidates),
            candidates=ordered_candidates,
            findings=ordered_findings,
        )


DEFAULT_CAVITY_CANDIDATE_DETECTOR: CavityCandidateDetector = (
    ShellTopologyCavityCandidateDetector()
)


class _PointContainmentClassification(Enum):
    INSIDE = "inside"
    OUTSIDE = "outside"
    AMBIGUOUS = "ambiguous"


class _ShellContainmentDecision(Enum):
    CONTAINED = "contained"
    NOT_CONTAINED = "not_contained"
    AMBIGUOUS = "ambiguous"


class _ShellContainmentClassifier(Protocol):
    def classify(
        self,
        parent: _ShellComponent,
        child: _ShellComponent,
    ) -> _ShellContainmentDecision:
        """Classify whether one child shell is contained inside one parent shell."""


@dataclass(frozen=True, slots=True)
class _TriangleRecord:
    face_index: int
    vertex_a: Vector3D
    vertex_b: Vector3D
    vertex_c: Vector3D


@dataclass(frozen=True, slots=True)
class _SampleFace:
    face_index: int
    centroid: Vector3D
    unit_normal: Vector3D


@dataclass(frozen=True, slots=True)
class _Bounds:
    minimum: Vector3D
    maximum: Vector3D


@dataclass(frozen=True, slots=True)
class _ShellComponent:
    component_index: int
    face_indices: tuple[int, ...]
    used_vertex_indices: tuple[int, ...]
    minimum_face_index: int
    boundary_edge_count: int
    non_manifold_edge_count: int
    is_closed_manifold: bool
    bounds: _Bounds
    sample_faces: tuple[_SampleFace, ...]
    triangles: tuple[_TriangleRecord, ...]
    sort_key: tuple[object, ...]


@dataclass(frozen=True, slots=True)
class _CandidateDraft:
    component: _ShellComponent
    connectivity_classification: CavityConnectivityClassification
    parent_component_index: int | None
    nesting_depth: int | None
    is_potential_void_boundary: bool
    findings: tuple[CavityFinding, ...]


@dataclass(frozen=True, slots=True)
class _RayIntersection:
    distance_mm: float
    face_index: int


@dataclass(frozen=True, slots=True)
class _PendingShellComponent:
    face_indices: tuple[int, ...]
    used_vertex_indices: tuple[int, ...]
    minimum_face_index: int
    boundary_edge_count: int
    non_manifold_edge_count: int
    is_closed_manifold: bool
    bounds: _Bounds
    sample_faces: tuple[_SampleFace, ...]
    triangles: tuple[_TriangleRecord, ...]
    sort_key: tuple[object, ...]


@dataclass(frozen=True, slots=True)
class _RayParityShellContainmentClassifier:
    linear_tolerance_mm: float

    def classify(
        self,
        parent: _ShellComponent,
        child: _ShellComponent,
    ) -> _ShellContainmentDecision:
        """Classify shell containment using deterministic offset samples and parity."""
        if not parent.is_closed_manifold:
            return _ShellContainmentDecision.AMBIGUOUS

        if not _bounding_boxes_may_nest(
            outer_bounds=parent.bounds,
            inner_bounds=child.bounds,
            tolerance_mm=self.linear_tolerance_mm,
        ):
            return _ShellContainmentDecision.NOT_CONTAINED

        sample_offset_mm = max(self.linear_tolerance_mm * 100.0, 1e-4)
        sample_results: list[_PointContainmentClassification] = []

        for sample_face in child.sample_faces[:3]:
            offset_vector = sample_face.unit_normal * sample_offset_mm
            for sample_point in (
                sample_face.centroid + offset_vector,
                sample_face.centroid - offset_vector,
            ):
                point_result = self._classify_point(parent, sample_point)
                if point_result is _PointContainmentClassification.AMBIGUOUS:
                    return _ShellContainmentDecision.AMBIGUOUS
                sample_results.append(point_result)

        if not sample_results:
            return _ShellContainmentDecision.AMBIGUOUS

        if all(
            result is _PointContainmentClassification.INSIDE
            for result in sample_results
        ):
            return _ShellContainmentDecision.CONTAINED

        if all(
            result is _PointContainmentClassification.OUTSIDE
            for result in sample_results
        ):
            return _ShellContainmentDecision.NOT_CONTAINED

        return _ShellContainmentDecision.AMBIGUOUS

    def _classify_point(
        self,
        shell: _ShellComponent,
        point: Vector3D,
    ) -> _PointContainmentClassification:
        if not _point_within_bounds(
            point,
            bounds=shell.bounds,
            tolerance_mm=self.linear_tolerance_mm,
        ):
            return _PointContainmentClassification.OUTSIDE

        directional_results: list[_PointContainmentClassification] = []
        for direction in _RAY_DIRECTIONS:
            direction_result = _classify_point_with_direction(
                shell=shell,
                point=point,
                direction=direction,
                tolerance_mm=self.linear_tolerance_mm,
            )
            if direction_result is _PointContainmentClassification.AMBIGUOUS:
                continue
            directional_results.append(direction_result)

        if not directional_results:
            return _PointContainmentClassification.AMBIGUOUS

        first_result = directional_results[0]
        if all(result is first_result for result in directional_results):
            return first_result

        return _PointContainmentClassification.AMBIGUOUS


_RAY_DIRECTIONS = (
    Vector3D(1.0, 0.0, 0.0),
    Vector3D(0.0, 1.0, 0.0),
    Vector3D(0.0, 0.0, 1.0),
    Vector3D(1.0, 1.0, 1.0).normalized(),
)


def _validate_model(model: ImportedModel) -> tuple[CavityFinding, ...]:
    findings: list[CavityFinding] = []
    if not model.vertices:
        findings.append(
            _finding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                severity=IssueSeverity.WARNING,
                message=(
                    "Shell/topology cavity detection requires at least one vertex."
                ),
            )
        )
    if not model.faces:
        findings.append(
            _finding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                severity=IssueSeverity.WARNING,
                message="Shell/topology cavity detection requires at least one face.",
            )
        )

    for face_index, face in enumerate(model.faces):
        for vertex_index in (face.vertex_1, face.vertex_2, face.vertex_3):
            if vertex_index < 0 or vertex_index >= len(model.vertices):
                findings.append(
                    _finding(
                        code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "Shell/topology cavity detection requires valid face "
                            "vertex indices."
                        ),
                        metadata={
                            "face_index": face_index,
                            "vertex_index": vertex_index,
                        },
                    )
                )
                return tuple(findings)

        points = tuple(
            model.vertices[vertex_index]
            for vertex_index in (face.vertex_1, face.vertex_2, face.vertex_3)
        )
        if any(not _vertex_is_finite(point) for point in points):
            findings.append(
                _finding(
                    code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Shell/topology cavity detection requires finite vertex "
                        "coordinates."
                    ),
                    metadata={"face_index": face_index},
                )
            )
            return tuple(findings)

    return tuple(findings)


def _extract_shell_components(
    model: ImportedModel,
    *,
    linear_tolerance_mm: float,
) -> tuple[_ShellComponent, ...]:
    adjacency_graph = build_face_adjacency_graph(model)
    unvisited_faces = {
        face_index
        for face_index, face_edges in enumerate(adjacency_graph.edges_by_face_index)
        if face_edges
    }
    pending_components: list[_PendingShellComponent] = []

    while unvisited_faces:
        seed_face_index = min(unvisited_faces)
        queue = deque([seed_face_index])
        component_face_indices: list[int] = []
        unvisited_faces.remove(seed_face_index)

        while queue:
            face_index = queue.popleft()
            component_face_indices.append(face_index)
            for neighbor_face_index in adjacency_graph.neighbors(face_index):
                if neighbor_face_index not in unvisited_faces:
                    continue
                unvisited_faces.remove(neighbor_face_index)
                queue.append(neighbor_face_index)

        pending_components.append(
            _build_pending_component(
                model,
                tuple(sorted(component_face_indices)),
                linear_tolerance_mm=linear_tolerance_mm,
            )
        )

    ordered_pending_components = sorted(
        pending_components,
        key=lambda component: component.sort_key,
    )
    return tuple(
        _ShellComponent(
            component_index=component_index,
            face_indices=pending_component.face_indices,
            used_vertex_indices=pending_component.used_vertex_indices,
            minimum_face_index=pending_component.minimum_face_index,
            boundary_edge_count=pending_component.boundary_edge_count,
            non_manifold_edge_count=pending_component.non_manifold_edge_count,
            is_closed_manifold=pending_component.is_closed_manifold,
            bounds=pending_component.bounds,
            sample_faces=pending_component.sample_faces,
            triangles=pending_component.triangles,
            sort_key=pending_component.sort_key,
        )
        for component_index, pending_component in enumerate(ordered_pending_components)
    )


def _build_pending_component(
    model: ImportedModel,
    face_indices: tuple[int, ...],
    *,
    linear_tolerance_mm: float,
) -> _PendingShellComponent:
    edge_counts: dict[Edge, int] = defaultdict(int)
    used_vertex_indices: set[int] = set()
    triangles: list[_TriangleRecord] = []
    sample_faces: list[_SampleFace] = []

    for face_index in face_indices:
        face = model.faces[face_index]
        used_vertex_indices.update((face.vertex_1, face.vertex_2, face.vertex_3))

        for edge in _iter_face_edges(face):
            edge_counts[edge] += 1

        triangle = _build_triangle_record(model, face_index, face)
        if triangle is None:
            continue
        triangles.append(triangle)

        sample_face = _build_sample_face(triangle, linear_tolerance_mm)
        if sample_face is not None:
            sample_faces.append(sample_face)

    boundary_edge_count = sum(1 for count in edge_counts.values() if count == 1)
    non_manifold_edge_count = sum(1 for count in edge_counts.values() if count >= 3)
    is_closed_manifold = bool(edge_counts) and all(
        count == 2 for count in edge_counts.values()
    )
    ordered_vertex_indices = tuple(sorted(used_vertex_indices))
    bounds = _build_bounds(model, ordered_vertex_indices)

    sort_key = (
        _bounds_sort_key(bounds, tolerance_mm=linear_tolerance_mm),
        len(face_indices),
        len(ordered_vertex_indices),
        face_indices[0],
        face_indices,
    )

    return _PendingShellComponent(
        face_indices=face_indices,
        used_vertex_indices=ordered_vertex_indices,
        minimum_face_index=face_indices[0],
        boundary_edge_count=boundary_edge_count,
        non_manifold_edge_count=non_manifold_edge_count,
        is_closed_manifold=is_closed_manifold,
        bounds=bounds,
        sample_faces=tuple(sample_faces),
        triangles=tuple(triangles),
        sort_key=sort_key,
    )


def _build_triangle_record(
    model: ImportedModel,
    face_index: int,
    face: Face,
) -> _TriangleRecord | None:
    vertex_indices = (face.vertex_1, face.vertex_2, face.vertex_3)
    if len(set(vertex_indices)) < 3:
        return None

    vertices = tuple(model.vertices[vertex_index] for vertex_index in vertex_indices)
    points = tuple(Vector3D(vertex.x, vertex.y, vertex.z) for vertex in vertices)
    return _TriangleRecord(
        face_index=face_index,
        vertex_a=points[0],
        vertex_b=points[1],
        vertex_c=points[2],
    )


def _build_sample_face(
    triangle: _TriangleRecord,
    linear_tolerance_mm: float,
) -> _SampleFace | None:
    raw_normal = (triangle.vertex_b - triangle.vertex_a).cross(
        triangle.vertex_c - triangle.vertex_a
    )
    if raw_normal.magnitude() <= linear_tolerance_mm:
        return None

    unit_normal = raw_normal.normalized(minimum_magnitude=linear_tolerance_mm)
    centroid = (triangle.vertex_a + triangle.vertex_b + triangle.vertex_c) * (1.0 / 3.0)
    return _SampleFace(
        face_index=triangle.face_index,
        centroid=centroid,
        unit_normal=unit_normal,
    )


def _build_bounds(
    model: ImportedModel,
    vertex_indices: tuple[int, ...],
) -> _Bounds:
    vertices = [model.vertices[vertex_index] for vertex_index in vertex_indices]
    return _Bounds(
        minimum=Vector3D(
            min(vertex.x for vertex in vertices),
            min(vertex.y for vertex in vertices),
            min(vertex.z for vertex in vertices),
        ),
        maximum=Vector3D(
            max(vertex.x for vertex in vertices),
            max(vertex.y for vertex in vertices),
            max(vertex.z for vertex in vertices),
        ),
    )


def _resolve_immediate_parents(
    components: tuple[_ShellComponent, ...],
    containment_by_child: dict[int, set[int]],
) -> dict[int, int]:
    parent_by_child: dict[int, int] = {}
    component_lookup = {
        component.component_index: component for component in components
    }

    for child_component in components:
        candidate_parents = sorted(
            containment_by_child.get(child_component.component_index, ())
        )
        if not candidate_parents:
            continue

        immediate_parent_candidates = [
            parent_component_index
            for parent_component_index in candidate_parents
            if not any(
                parent_component_index
                in containment_by_child.get(other_parent_component_index, set())
                for other_parent_component_index in candidate_parents
                if other_parent_component_index != parent_component_index
            )
        ]
        if not immediate_parent_candidates:
            immediate_parent_candidates = candidate_parents

        resolved_parent_component_index = min(
            immediate_parent_candidates,
            key=lambda component_index: component_lookup[component_index].sort_key,
        )
        parent_by_child[child_component.component_index] = (
            resolved_parent_component_index
        )

    return parent_by_child


def _resolve_nesting_depths(
    parent_by_child: dict[int, int],
) -> dict[int, int]:
    depth_by_component: dict[int, int] = {}

    def resolve_depth(component_index: int) -> int:
        if component_index in depth_by_component:
            return depth_by_component[component_index]

        parent_component_index = parent_by_child.get(component_index)
        if parent_component_index is None:
            depth_by_component[component_index] = 0
            return 0

        depth = resolve_depth(parent_component_index) + 1
        depth_by_component[component_index] = depth
        return depth

    for component_index in list(parent_by_child):
        resolve_depth(component_index)

    return depth_by_component


def _finalize_candidates(
    candidate_drafts: list[_CandidateDraft],
) -> tuple[InternalCavityCandidate, ...]:
    ordered_drafts = sorted(
        candidate_drafts,
        key=lambda draft: (
            draft.parent_component_index is None,
            -1
            if draft.parent_component_index is None
            else draft.parent_component_index,
            -1 if draft.nesting_depth is None else draft.nesting_depth,
            draft.component.sort_key,
            draft.component.minimum_face_index,
        ),
    )
    return tuple(
        InternalCavityCandidate(
            candidate_id=f"cavity_candidate_{candidate_index:03d}",
            component_index=draft.component.component_index,
            connectivity_classification=draft.connectivity_classification,
            parent_component_index=draft.parent_component_index,
            nesting_depth=draft.nesting_depth,
            is_potential_void_boundary=draft.is_potential_void_boundary,
            minimum_face_index=draft.component.minimum_face_index,
            source_face_indices=draft.component.face_indices,
            boundary_edge_count=draft.component.boundary_edge_count,
            non_manifold_edge_count=draft.component.non_manifold_edge_count,
            findings=_order_findings(draft.findings),
        )
        for candidate_index, draft in enumerate(ordered_drafts, start=1)
    )


def _method_scope_findings(
    candidates: tuple[InternalCavityCandidate, ...],
) -> tuple[CavityFinding, ...]:
    findings: list[CavityFinding] = []
    if not any(candidate.is_potential_void_boundary for candidate in candidates):
        findings.append(
            _finding(
                code=(
                    CavityFindingCode.NO_CANDIDATE_DETECTED_BY_CURRENT_SHELL_TOPOLOGY_METHOD
                ),
                severity=IssueSeverity.INFO,
                message=(
                    "No cavity candidate was detected by the current shell/topology "
                    "method. This does not prove that the model has no internal cavity."
                ),
            )
        )

    findings.append(
        _finding(
            code=(
                CavityFindingCode.EXTERIOR_CONNECTED_CAVITY_CLASS_NOT_ASSESSED_BY_CURRENT_METHOD
            ),
            severity=IssueSeverity.INFO,
            message=(
                "The current shell/topology detector does not prove exterior-connected "
                "internal regions unless they form a separate nested shell."
            ),
        )
    )
    return _order_findings(findings)


def _resolve_detection_outcome(
    candidates: tuple[InternalCavityCandidate, ...],
    findings: tuple[CavityFinding, ...],
) -> CavityCandidateDetectionOutcome:
    if any(
        candidate.is_potential_void_boundary
        and candidate.connectivity_classification
        is CavityConnectivityClassification.ENCLOSED
        for candidate in candidates
    ):
        return CavityCandidateDetectionOutcome.CANDIDATES_DETECTED

    if any(
        candidate.connectivity_classification
        is CavityConnectivityClassification.AMBIGUOUS
        for candidate in candidates
    ) or any(
        finding.code is CavityFindingCode.AMBIGUOUS_SHELL_CONTAINMENT
        for finding in findings
    ):
        return CavityCandidateDetectionOutcome.AMBIGUOUS

    if any(
        candidate.connectivity_classification
        in (
            CavityConnectivityClassification.MESH_BOUNDARY_OPEN,
            CavityConnectivityClassification.NOT_ASSESSABLE,
        )
        for candidate in candidates
    ) or any(
        finding.code
        in (
            CavityFindingCode.NON_MANIFOLD_SHELL_NOT_ASSESSABLE,
            CavityFindingCode.MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION,
        )
        for finding in findings
    ):
        return CavityCandidateDetectionOutcome.NOT_ASSESSABLE

    return CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD


def _resolve_detection_status(
    outcome: CavityCandidateDetectionOutcome,
    candidates: tuple[InternalCavityCandidate, ...],
) -> DetailedMoldAnalysisStatus:
    if outcome is CavityCandidateDetectionOutcome.AMBIGUOUS:
        return DetailedMoldAnalysisStatus.PARTIAL

    if outcome is CavityCandidateDetectionOutcome.NOT_ASSESSABLE and candidates:
        return DetailedMoldAnalysisStatus.PARTIAL

    return DetailedMoldAnalysisStatus.COMPLETED


def _build_detection_summary(
    outcome: CavityCandidateDetectionOutcome,
    candidates: tuple[InternalCavityCandidate, ...],
) -> str:
    if outcome is CavityCandidateDetectionOutcome.CANDIDATES_DETECTED:
        enclosed_candidate_count = sum(
            1 for candidate in candidates if candidate.is_potential_void_boundary
        )
        return (
            "Shell/topology cavity detection found "
            f"{enclosed_candidate_count} potential enclosed internal-volume "
            "candidate(s)."
        )

    if outcome is CavityCandidateDetectionOutcome.AMBIGUOUS:
        return (
            "Shell/topology cavity detection found nested internal-shell evidence, "
            "but shell containment remained ambiguous for at least one candidate."
        )

    if outcome is CavityCandidateDetectionOutcome.NOT_ASSESSABLE:
        return (
            "Shell/topology cavity detection found topology limitations that "
            "prevent reliable cavity connectivity classification."
        )

    return (
        "No cavity candidate was detected by the current shell/topology method. "
        "This does not prove that the model has no internal cavity."
    )


def _classify_point_with_direction(
    *,
    shell: _ShellComponent,
    point: Vector3D,
    direction: Vector3D,
    tolerance_mm: float,
) -> _PointContainmentClassification:
    intersections: list[_RayIntersection] = []
    for triangle in shell.triangles:
        intersection = _ray_triangle_intersection(
            point=point,
            direction=direction,
            triangle=triangle,
            tolerance_mm=tolerance_mm,
        )
        if intersection is None:
            continue
        if intersection is _AMBIGUOUS_RAY_INTERSECTION:
            return _PointContainmentClassification.AMBIGUOUS
        intersections.append(intersection)

    intersections.sort(key=lambda item: item.distance_mm)
    for index in range(1, len(intersections)):
        if (
            intersections[index].distance_mm - intersections[index - 1].distance_mm
        ) <= tolerance_mm * 10.0:
            return _PointContainmentClassification.AMBIGUOUS

    if len(intersections) % 2 == 1:
        return _PointContainmentClassification.INSIDE

    return _PointContainmentClassification.OUTSIDE


_AMBIGUOUS_RAY_INTERSECTION = object()


def _ray_triangle_intersection(
    *,
    point: Vector3D,
    direction: Vector3D,
    triangle: _TriangleRecord,
    tolerance_mm: float,
) -> _RayIntersection | object | None:
    edge_a = triangle.vertex_b - triangle.vertex_a
    edge_b = triangle.vertex_c - triangle.vertex_a
    p_vector = direction.cross(edge_b)
    determinant = edge_a.dot(p_vector)

    if abs(determinant) <= tolerance_mm:
        return None

    inverse_determinant = 1.0 / determinant
    t_vector = point - triangle.vertex_a
    barycentric_u = t_vector.dot(p_vector) * inverse_determinant
    if barycentric_u < -tolerance_mm or barycentric_u > 1.0 + tolerance_mm:
        return None

    q_vector = t_vector.cross(edge_a)
    barycentric_v = direction.dot(q_vector) * inverse_determinant
    if barycentric_v < -tolerance_mm:
        return None

    barycentric_w = 1.0 - barycentric_u - barycentric_v
    if barycentric_w < -tolerance_mm:
        return None

    hit_distance = edge_b.dot(q_vector) * inverse_determinant
    if hit_distance <= tolerance_mm:
        return None

    edge_hit_tolerance = tolerance_mm * 10.0
    if min(barycentric_u, barycentric_v, barycentric_w) <= edge_hit_tolerance:
        return _AMBIGUOUS_RAY_INTERSECTION

    return _RayIntersection(
        distance_mm=hit_distance,
        face_index=triangle.face_index,
    )


def _point_within_bounds(
    point: Vector3D,
    *,
    bounds: _Bounds,
    tolerance_mm: float,
) -> bool:
    return all(
        minimum_value - tolerance_mm <= coordinate <= maximum_value + tolerance_mm
        for coordinate, minimum_value, maximum_value in (
            (point.x, bounds.minimum.x, bounds.maximum.x),
            (point.y, bounds.minimum.y, bounds.maximum.y),
            (point.z, bounds.minimum.z, bounds.maximum.z),
        )
    )


def _bounding_boxes_may_nest(
    *,
    outer_bounds: _Bounds,
    inner_bounds: _Bounds,
    tolerance_mm: float,
) -> bool:
    return all(
        inner_minimum >= outer_minimum - tolerance_mm
        and inner_maximum <= outer_maximum + tolerance_mm
        for inner_minimum, inner_maximum, outer_minimum, outer_maximum in (
            (
                inner_bounds.minimum.x,
                inner_bounds.maximum.x,
                outer_bounds.minimum.x,
                outer_bounds.maximum.x,
            ),
            (
                inner_bounds.minimum.y,
                inner_bounds.maximum.y,
                outer_bounds.minimum.y,
                outer_bounds.maximum.y,
            ),
            (
                inner_bounds.minimum.z,
                inner_bounds.maximum.z,
                outer_bounds.minimum.z,
                outer_bounds.maximum.z,
            ),
        )
    )


def _bounds_sort_key(
    bounds: _Bounds,
    *,
    tolerance_mm: float,
) -> tuple[int, ...]:
    return (
        _quantize(bounds.minimum.x, tolerance_mm),
        _quantize(bounds.minimum.y, tolerance_mm),
        _quantize(bounds.minimum.z, tolerance_mm),
        _quantize(bounds.maximum.x, tolerance_mm),
        _quantize(bounds.maximum.y, tolerance_mm),
        _quantize(bounds.maximum.z, tolerance_mm),
    )


def _quantize(value: float, tolerance_mm: float) -> int:
    scaled_value = value / tolerance_mm
    if scaled_value >= 0.0:
        return int(scaled_value + 0.5)

    return int(scaled_value - 0.5)


def _iter_face_edges(face: Face) -> tuple[Edge, Edge, Edge]:
    return (
        _canonical_edge(face.vertex_1, face.vertex_2),
        _canonical_edge(face.vertex_2, face.vertex_3),
        _canonical_edge(face.vertex_3, face.vertex_1),
    )


def _canonical_edge(first_index: int, second_index: int) -> Edge:
    if first_index <= second_index:
        return (first_index, second_index)

    return (second_index, first_index)


def _vertex_is_finite(vertex: Vertex) -> bool:
    return all(
        coordinate == coordinate and coordinate not in (float("inf"), float("-inf"))
        for coordinate in (vertex.x, vertex.y, vertex.z)
    )


def _finding(
    *,
    code: CavityFindingCode,
    severity: IssueSeverity,
    message: str,
    metadata: dict[str, object] | None = None,
) -> CavityFinding:
    return CavityFinding(
        code=code,
        source=CavityFindingSource.CAVITY_CANDIDATE_DETECTOR,
        severity=severity,
        message=message,
        metadata={} if metadata is None else metadata,
    )


def _order_findings(
    findings: tuple[CavityFinding, ...] | list[CavityFinding],
) -> tuple[CavityFinding, ...]:
    ordered_unique_findings = {
        (
            finding.code,
            finding.source,
            finding.severity,
            finding.message,
            finding.is_blocking,
            tuple(
                sorted((key, repr(value)) for key, value in finding.metadata.items())
            ),
        ): finding
        for finding in findings
    }
    return tuple(
        sorted(
            ordered_unique_findings.values(),
            key=lambda finding: (
                not finding.is_blocking,
                _SEVERITY_ORDER[finding.severity],
                finding.source.value,
                finding.code.value,
                finding.message,
                tuple(
                    sorted(
                        (key, repr(value)) for key, value in finding.metadata.items()
                    )
                ),
            ),
        )
    )


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
