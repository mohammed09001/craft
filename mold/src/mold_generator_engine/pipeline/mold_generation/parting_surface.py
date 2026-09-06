from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from mold_generator_engine.config.geometry import (
    DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
    DEFAULT_LINEAR_TOLERANCE_MM,
    DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE,
)
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.imported_model import BoundingBox
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.models.mold_generation import (
    InitialPartingSurfacePlan,
    InitialPartingSurfacePlanStatus,
    InitialPartingSurfaceType,
    MoldGenerationContext,
    MoldGenerationFinding,
    MoldGenerationFindingCode,
    MoldGenerationFindingSource,
    PartingStrategyType,
    PartingSurfaceRefinementResult,
    PartingSurfaceRefinementStatus,
    PartingSurfaceValidationMetrics,
    PartingSurfaceValidationResult,
    PartingSurfaceValidationStatus,
    PreliminaryMoldGenerationPlan,
    PreliminaryPartingStrategySelection,
    PreliminaryPartingStrategySelectionStatus,
    PreliminaryPartingSurface,
    PreliminaryPartingSurfacePatch,
    PreliminaryPartingSurfaceStatus,
)

_MINIMUM_BOUNDARY_POINT_COUNT = 3


@dataclass(frozen=True, slots=True)
class EvidenceInitialPartingSurfacePlanner:
    """Create initial parting surface plans from selected strategy evidence."""

    def plan(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        selection: PreliminaryPartingStrategySelection,
    ) -> InitialPartingSurfacePlan:
        """Plan a preliminary surface without constructing final geometry."""
        if selection.status is PreliminaryPartingStrategySelectionStatus.BLOCKED:
            return _blocked_plan("Parting surface planning is blocked.", selection)

        if (
            selection.status
            is PreliminaryPartingStrategySelectionStatus.MANUAL_REVIEW_REQUIRED
        ):
            return InitialPartingSurfacePlan(
                status=InitialPartingSurfacePlanStatus.MANUAL_REVIEW_REQUIRED,
                surface_type=InitialPartingSurfaceType.UNAVAILABLE,
                selected_strategy_id=None,
                pull_direction=None,
                reference="unavailable",
                reference_offset_mm=None,
                construction_steps=(),
                required_later_validations=(),
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_SURFACE_PLAN_REQUIRES_MANUAL_REVIEW,
                        IssueSeverity.WARNING,
                        "Initial parting surface planning requires manual review.",
                    ),
                ),
                warnings=selection.warnings,
            )

        selected = selection.selected_candidate
        if selected is None or selected.pull_direction is None:
            return _blocked_plan(
                "Parting surface planning requires a selected strategy and pull direction.",
                selection,
            )

        surface_type = (
            InitialPartingSurfaceType.PLANAR_MIDPLANE
            if selected.strategy_type is PartingStrategyType.SIMPLE_TWO_PART_PLANAR
            else InitialPartingSurfaceType.CORE_ASSISTED_PLANAR_MIDPLANE
        )

        return InitialPartingSurfacePlan(
            status=InitialPartingSurfacePlanStatus.PLANNED,
            surface_type=surface_type,
            selected_strategy_id=selected.candidate_id,
            pull_direction=selected.pull_direction,
            reference="model_bounding_box_center",
            reference_offset_mm=_project_bounding_box_center(
                context.model.bounding_box,
                selected.pull_direction,
            ),
            construction_steps=_construction_steps(selected.strategy_type),
            required_later_validations=(
                "parting_loop_extraction",
                "surface_clearance_validation",
                "mold_body_split_validation",
            ),
            reasons=(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_PLAN_CREATED,
                    IssueSeverity.INFO,
                    "Created an initial parting surface plan for later geometry stages.",
                    metadata={
                        "selected_strategy_id": selected.candidate_id,
                        "preliminary_disposition": preliminary_plan.disposition.value,
                    },
                ),
            ),
            warnings=selection.warnings,
        )


DEFAULT_INITIAL_PARTING_SURFACE_PLANNER = EvidenceInitialPartingSurfacePlanner()


@dataclass(frozen=True, slots=True)
class PlanarPatchPartingSurfaceGenerator:
    """Generate bounded planar preliminary parting surface patches."""

    def generate(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
    ) -> PreliminaryPartingSurface:
        """Generate a deterministic bounded planar patch from the surface plan."""
        if (
            surface_plan.status
            is InitialPartingSurfacePlanStatus.MANUAL_REVIEW_REQUIRED
        ):
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.MANUAL_REVIEW_REQUIRED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Parting surface generation requires manual review first.",
                IssueSeverity.WARNING,
            )

        if surface_plan.status is not InitialPartingSurfacePlanStatus.PLANNED:
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.BLOCKED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Parting surface generation is blocked by the surface plan.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        if surface_plan.surface_type not in {
            InitialPartingSurfaceType.PLANAR_MIDPLANE,
            InitialPartingSurfaceType.CORE_ASSISTED_PLANAR_MIDPLANE,
        }:
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.UNSUPPORTED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_UNSUPPORTED,
                "Only planar preliminary parting surface generation is supported.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        if surface_plan.pull_direction is None:
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.BLOCKED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Parting surface generation requires a finite pull direction.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        try:
            normal = surface_plan.pull_direction.normalized()
            basis_u, basis_v = _stable_basis_for_normal(normal)
        except InvalidVectorError:
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.BLOCKED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Parting surface generation received an invalid pull direction.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        bbox = context.model.bounding_box
        if not _bounding_box_is_usable(bbox):
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.BLOCKED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Parting surface generation requires finite non-zero model extents.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        origin = _bounding_box_center(bbox)
        projection = _project_bounding_box_to_basis(bbox, origin, basis_u, basis_v)
        if projection is None:
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.BLOCKED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Parting surface generation could not project the model bounds.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        min_u, max_u, min_v, max_v = projection
        extent_u = max_u - min_u
        extent_v = max_v - min_v
        if (
            extent_u <= DEFAULT_LINEAR_TOLERANCE_MM
            or extent_v <= DEFAULT_LINEAR_TOLERANCE_MM
        ):
            return _surface_without_patches(
                PreliminaryPartingSurfaceStatus.BLOCKED,
                surface_plan,
                MoldGenerationFindingCode.PARTING_SURFACE_GENERATION_BLOCKED,
                "Projected model bounds are degenerate for the selected surface.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        boundary = (
            _point_from_basis(origin, basis_u, basis_v, min_u, min_v),
            _point_from_basis(origin, basis_u, basis_v, max_u, min_v),
            _point_from_basis(origin, basis_u, basis_v, max_u, max_v),
            _point_from_basis(origin, basis_u, basis_v, min_u, max_v),
        )
        patch = PreliminaryPartingSurfacePatch(
            patch_id="parting-surface-patch-0001",
            origin=origin,
            normal=normal,
            basis_u=basis_u,
            basis_v=basis_v,
            boundary_points=boundary,
            extent_u_mm=round(extent_u, 6),
            extent_v_mm=round(extent_v, 6),
            source_strategy_id=surface_plan.selected_strategy_id,
            source_plan_reference=surface_plan.reference,
        )
        return PreliminaryPartingSurface(
            status=PreliminaryPartingSurfaceStatus.GENERATED,
            patches=(patch,),
            source_plan_status=surface_plan.status,
            source_strategy_id=surface_plan.selected_strategy_id,
            reasons=(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_GENERATED,
                    IssueSeverity.INFO,
                    "Generated a bounded preliminary planar parting surface patch.",
                    metadata={
                        "patch_id": patch.patch_id,
                        "surface_type": surface_plan.surface_type.value,
                    },
                ),
            ),
            warnings=surface_plan.warnings,
        )


@dataclass(frozen=True, slots=True)
class ConservativePartingSurfaceValidator:
    """Validate preliminary parting surface patches using bounded checks."""

    def validate(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
        surface: PreliminaryPartingSurface | None,
    ) -> PartingSurfaceValidationResult:
        """Validate finite planar patch geometry without solid separation claims."""
        findings: list[MoldGenerationFinding] = []
        if surface is None:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                    IssueSeverity.ERROR,
                    "No preliminary parting surface is available to validate.",
                    is_blocking=True,
                )
            )
            return _validation_blocked(findings)

        if surface.status is PreliminaryPartingSurfaceStatus.MANUAL_REVIEW_REQUIRED:
            findings.extend(surface.reasons)
            return PartingSurfaceValidationResult(
                status=PartingSurfaceValidationStatus.MANUAL_REVIEW_REQUIRED,
                findings=_ordered_unique_findings(tuple(findings)),
                refinement_recommended=False,
                manual_review_required=True,
                direct_progression_blocked=True,
            )

        if surface.status is not PreliminaryPartingSurfaceStatus.GENERATED:
            findings.extend(surface.reasons)
            findings.append(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                    IssueSeverity.ERROR,
                    "Preliminary parting surface was not generated successfully.",
                    is_blocking=True,
                )
            )
            return _validation_blocked(findings)

        if not surface.patches:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                    IssueSeverity.ERROR,
                    "Preliminary parting surface contains no patches.",
                    is_blocking=True,
                )
            )
            return _validation_blocked(findings)

        metrics = _validate_patch_metrics(context, surface_plan, surface, findings)
        blocking = any(finding.is_blocking for finding in findings)
        refinement_recommended = any(
            finding.code
            is MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_RECOMMENDED
            for finding in findings
        )
        manual_review = any(
            finding.severity is IssueSeverity.WARNING for finding in findings
        )

        if blocking:
            return PartingSurfaceValidationResult(
                status=PartingSurfaceValidationStatus.BLOCKED,
                findings=_ordered_unique_findings(tuple(findings)),
                metrics=metrics,
                refinement_recommended=refinement_recommended,
                manual_review_required=True,
                direct_progression_blocked=True,
            )

        if refinement_recommended or manual_review:
            return PartingSurfaceValidationResult(
                status=PartingSurfaceValidationStatus.MANUAL_REVIEW_REQUIRED,
                findings=_ordered_unique_findings(tuple(findings)),
                metrics=metrics,
                refinement_recommended=refinement_recommended,
                manual_review_required=True,
                direct_progression_blocked=not refinement_recommended,
            )

        findings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_VALIDATED,
                IssueSeverity.INFO,
                "Preliminary parting surface passed bounded validation checks.",
            )
        )
        return PartingSurfaceValidationResult(
            status=PartingSurfaceValidationStatus.VALID,
            findings=_ordered_unique_findings(tuple(findings)),
            metrics=metrics,
            refinement_recommended=False,
            manual_review_required=False,
            direct_progression_blocked=False,
        )


@dataclass(frozen=True, slots=True)
class SafeInitialPartingSurfaceRefiner:
    """Apply safe deterministic refinements to preliminary surface patches."""

    def refine(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
        surface: PreliminaryPartingSurface | None,
        validation: PartingSurfaceValidationResult,
    ) -> PartingSurfaceRefinementResult:
        """Refine only issues that can be fixed deterministically."""
        if (
            surface is None
            or surface.status is not PreliminaryPartingSurfaceStatus.GENERATED
        ):
            return PartingSurfaceRefinementResult(
                status=PartingSurfaceRefinementStatus.BLOCKED,
                refinement_applied=False,
                actions=(),
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_NOT_SAFE,
                        IssueSeverity.ERROR,
                        "No generated parting surface is available for refinement.",
                        is_blocking=True,
                    ),
                ),
                unresolved_findings=validation.findings,
            )

        if validation.direct_progression_blocked:
            return PartingSurfaceRefinementResult(
                status=PartingSurfaceRefinementStatus.BLOCKED,
                refinement_applied=False,
                actions=(),
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_NOT_SAFE,
                        IssueSeverity.ERROR,
                        "Blocking validation findings cannot be safely refined.",
                        is_blocking=True,
                    ),
                ),
                unresolved_findings=validation.findings,
            )

        if not validation.refinement_recommended:
            return PartingSurfaceRefinementResult(
                status=PartingSurfaceRefinementStatus.NOT_NEEDED,
                refinement_applied=False,
                actions=(),
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_NOT_NEEDED,
                        IssueSeverity.INFO,
                        "Parting surface refinement is not needed.",
                    ),
                ),
                refined_surface=surface,
                unresolved_findings=validation.findings,
                revalidation_required=False,
            )

        refined_patches: list[PreliminaryPartingSurfacePatch] = []
        actions: list[str] = []
        for patch in surface.patches:
            refined_patch, patch_actions = _refine_patch(patch)
            if refined_patch is None:
                return PartingSurfaceRefinementResult(
                    status=PartingSurfaceRefinementStatus.NOT_APPLIED,
                    refinement_applied=False,
                    actions=tuple(actions),
                    reasons=(
                        _finding(
                            MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_NOT_SAFE,
                            IssueSeverity.WARNING,
                            "Parting surface refinement was not safe for all patches.",
                        ),
                    ),
                    unresolved_findings=validation.findings,
                    revalidation_required=False,
                )
            refined_patches.append(refined_patch)
            actions.extend(patch_actions)

        unique_actions = tuple({action: None for action in actions}.keys())
        if not unique_actions:
            return PartingSurfaceRefinementResult(
                status=PartingSurfaceRefinementStatus.NOT_APPLIED,
                refinement_applied=False,
                actions=(),
                reasons=(
                    _finding(
                        MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_NOT_SAFE,
                        IssueSeverity.WARNING,
                        "No safe deterministic parting surface refinement was available.",
                    ),
                ),
                unresolved_findings=validation.findings,
            )

        refined_surface = PreliminaryPartingSurface(
            status=PreliminaryPartingSurfaceStatus.GENERATED,
            patches=tuple(refined_patches),
            source_plan_status=surface_plan.status,
            source_strategy_id=surface.source_strategy_id,
            reasons=(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_REFINED,
                    IssueSeverity.INFO,
                    "Applied safe deterministic parting surface refinement.",
                    metadata={"actions": unique_actions},
                ),
            ),
            warnings=surface.warnings,
        )
        return PartingSurfaceRefinementResult(
            status=PartingSurfaceRefinementStatus.APPLIED,
            refinement_applied=True,
            actions=unique_actions,
            reasons=refined_surface.reasons,
            refined_surface=refined_surface,
            unresolved_findings=validation.findings,
            revalidation_required=True,
        )


DEFAULT_PRELIMINARY_PARTING_SURFACE_GENERATOR = PlanarPatchPartingSurfaceGenerator()
DEFAULT_PARTING_SURFACE_VALIDATOR = ConservativePartingSurfaceValidator()
DEFAULT_INITIAL_PARTING_SURFACE_REFINER = SafeInitialPartingSurfaceRefiner()


def _project_bounding_box_center(
    bounding_box: BoundingBox,
    direction: Vector3D,
) -> float:
    center_x = (bounding_box.minimum.x + bounding_box.maximum.x) / 2.0
    center_y = (bounding_box.minimum.y + bounding_box.maximum.y) / 2.0
    center_z = (bounding_box.minimum.z + bounding_box.maximum.z) / 2.0
    return round(
        (center_x * direction.x) + (center_y * direction.y) + (center_z * direction.z),
        6,
    )


def select_accepted_parting_surface(
    generated_surface: PreliminaryPartingSurface | None,
    validation: PartingSurfaceValidationResult | None,
    refinement: PartingSurfaceRefinementResult | None,
    refined_validation: PartingSurfaceValidationResult | None,
) -> tuple[PreliminaryPartingSurface | None, MoldGenerationFinding]:
    """Select the accepted preliminary surface and explain the decision."""
    if (
        refinement is not None
        and refinement.refined_surface is not None
        and refined_validation is not None
        and refined_validation.status is PartingSurfaceValidationStatus.VALID
    ):
        return (
            refinement.refined_surface,
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_ACCEPTED,
                IssueSeverity.INFO,
                "Accepted the refined preliminary parting surface.",
            ),
        )

    if (
        generated_surface is not None
        and validation is not None
        and validation.status is PartingSurfaceValidationStatus.VALID
    ):
        return (
            generated_surface,
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_ACCEPTED,
                IssueSeverity.INFO,
                "Accepted the generated preliminary parting surface.",
            ),
        )

    return (
        None,
        _finding(
            MoldGenerationFindingCode.PARTING_SURFACE_ACCEPTANCE_BLOCKED,
            IssueSeverity.ERROR,
            "No validated preliminary parting surface is available for acceptance.",
            is_blocking=True,
        ),
    )


def _construction_steps(strategy_type: PartingStrategyType) -> tuple[str, ...]:
    if strategy_type is PartingStrategyType.CORE_ASSISTED_PLANAR:
        return (
            "establish_planar_reference_normal_to_selected_pull_direction",
            "anchor_reference_at_model_bounding_box_center",
            "reserve_core_target_review_zones_from_chapter_4_evidence",
            "defer_core_clearance_and_motion_validation_to_later_stage",
        )

    return (
        "establish_planar_reference_normal_to_selected_pull_direction",
        "anchor_reference_at_model_bounding_box_center",
        "defer_parting_loop_and_shutoff_geometry_to_later_stage",
    )


def _blocked_plan(
    message: str,
    selection: PreliminaryPartingStrategySelection,
) -> InitialPartingSurfacePlan:
    return InitialPartingSurfacePlan(
        status=InitialPartingSurfacePlanStatus.BLOCKED,
        surface_type=InitialPartingSurfaceType.UNAVAILABLE,
        selected_strategy_id=None,
        pull_direction=None,
        reference="unavailable",
        reference_offset_mm=None,
        construction_steps=(),
        required_later_validations=(),
        reasons=(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_PLAN_BLOCKED,
                IssueSeverity.ERROR,
                message,
                is_blocking=True,
            ),
        ),
        warnings=selection.warnings,
    )


def _surface_without_patches(
    status: PreliminaryPartingSurfaceStatus,
    surface_plan: InitialPartingSurfacePlan,
    code: MoldGenerationFindingCode,
    message: str,
    severity: IssueSeverity,
    *,
    is_blocking: bool = False,
) -> PreliminaryPartingSurface:
    return PreliminaryPartingSurface(
        status=status,
        patches=(),
        source_plan_status=surface_plan.status,
        source_strategy_id=surface_plan.selected_strategy_id,
        reasons=(
            _finding(
                code,
                severity,
                message,
                is_blocking=is_blocking,
            ),
        ),
        warnings=surface_plan.warnings,
    )


def _bounding_box_center(bounding_box: BoundingBox) -> Vector3D:
    return Vector3D(
        x=(bounding_box.minimum.x + bounding_box.maximum.x) / 2.0,
        y=(bounding_box.minimum.y + bounding_box.maximum.y) / 2.0,
        z=(bounding_box.minimum.z + bounding_box.maximum.z) / 2.0,
    )


def _bounding_box_is_usable(bounding_box: BoundingBox) -> bool:
    components = (
        bounding_box.minimum.x,
        bounding_box.minimum.y,
        bounding_box.minimum.z,
        bounding_box.maximum.x,
        bounding_box.maximum.y,
        bounding_box.maximum.z,
    )
    if not all(isfinite(component) for component in components):
        return False

    return any(
        abs(maximum - minimum) > DEFAULT_LINEAR_TOLERANCE_MM
        for minimum, maximum in (
            (bounding_box.minimum.x, bounding_box.maximum.x),
            (bounding_box.minimum.y, bounding_box.maximum.y),
            (bounding_box.minimum.z, bounding_box.maximum.z),
        )
    )


def _stable_basis_for_normal(normal: Vector3D) -> tuple[Vector3D, Vector3D]:
    reference = (
        Vector3D(0.0, 0.0, 1.0) if abs(normal.z) < 0.9 else Vector3D(1.0, 0.0, 0.0)
    )
    basis_u = reference.cross(normal).normalized()
    basis_v = normal.cross(basis_u).normalized()
    return basis_u, basis_v


def _bounding_box_corners(bounding_box: BoundingBox) -> tuple[Vector3D, ...]:
    return tuple(
        Vector3D(x, y, z)
        for x in (bounding_box.minimum.x, bounding_box.maximum.x)
        for y in (bounding_box.minimum.y, bounding_box.maximum.y)
        for z in (bounding_box.minimum.z, bounding_box.maximum.z)
    )


def _project_bounding_box_to_basis(
    bounding_box: BoundingBox,
    origin: Vector3D,
    basis_u: Vector3D,
    basis_v: Vector3D,
) -> tuple[float, float, float, float] | None:
    projected = [
        ((corner - origin).dot(basis_u), (corner - origin).dot(basis_v))
        for corner in _bounding_box_corners(bounding_box)
    ]
    if not projected:
        return None

    u_values = [value[0] for value in projected]
    v_values = [value[1] for value in projected]
    if not all(isfinite(value) for value in (*u_values, *v_values)):
        return None

    return min(u_values), max(u_values), min(v_values), max(v_values)


def _point_from_basis(
    origin: Vector3D,
    basis_u: Vector3D,
    basis_v: Vector3D,
    u: float,
    v: float,
) -> Vector3D:
    return origin + (basis_u * u) + (basis_v * v)


def _validate_patch_metrics(
    context: MoldGenerationContext,
    surface_plan: InitialPartingSurfacePlan,
    surface: PreliminaryPartingSurface,
    findings: list[MoldGenerationFinding],
) -> PartingSurfaceValidationMetrics:
    total_area = 0.0
    minimum_edge_length: float | None = None
    maximum_planarity_deviation = 0.0
    covers_model_projection = True

    for patch in sorted(surface.patches, key=lambda item: item.patch_id):
        _validate_patch_vectors(patch, surface_plan, findings)
        edge_lengths = _boundary_edge_lengths(patch.boundary_points)
        if edge_lengths:
            patch_min_edge = min(edge_lengths)
            minimum_edge_length = (
                patch_min_edge
                if minimum_edge_length is None
                else min(minimum_edge_length, patch_min_edge)
            )
        area = _patch_area_sq_mm(patch)
        total_area += area
        maximum_planarity_deviation = max(
            maximum_planarity_deviation,
            _maximum_planarity_deviation(patch),
        )
        if area <= DEFAULT_LINEAR_TOLERANCE_MM:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                    IssueSeverity.ERROR,
                    "Parting surface patch area is degenerate.",
                    is_blocking=True,
                    metadata={"patch_id": patch.patch_id},
                )
            )
        if not _patch_covers_model_projection(context.model.bounding_box, patch):
            covers_model_projection = False
            findings.append(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                    IssueSeverity.WARNING,
                    "Parting surface patch does not cover the model projection.",
                    metadata={"patch_id": patch.patch_id},
                )
            )

    return PartingSurfaceValidationMetrics(
        patch_count=len(surface.patches),
        total_area_sq_mm=round(total_area, 6),
        minimum_edge_length_mm=(
            None if minimum_edge_length is None else round(minimum_edge_length, 6)
        ),
        maximum_planarity_deviation_mm=round(maximum_planarity_deviation, 6),
        covers_model_projection=covers_model_projection,
    )


def _validate_patch_vectors(
    patch: PreliminaryPartingSurfacePatch,
    surface_plan: InitialPartingSurfacePlan,
    findings: list[MoldGenerationFinding],
) -> None:
    vectors = (
        patch.origin,
        patch.normal,
        patch.basis_u,
        patch.basis_v,
        *patch.boundary_points,
    )
    if not all(vector.is_finite() for vector in vectors):
        findings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                IssueSeverity.ERROR,
                "Parting surface patch contains non-finite coordinates.",
                is_blocking=True,
                metadata={"patch_id": patch.patch_id},
            )
        )
        return

    if len(patch.boundary_points) < _MINIMUM_BOUNDARY_POINT_COUNT:
        findings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                IssueSeverity.ERROR,
                "Parting surface patch has too few boundary points.",
                is_blocking=True,
                metadata={"patch_id": patch.patch_id},
            )
        )

    _validate_direction(patch.patch_id, "normal", patch.normal, findings)
    _validate_direction(patch.patch_id, "basis_u", patch.basis_u, findings)
    _validate_direction(patch.patch_id, "basis_v", patch.basis_v, findings)

    if (
        abs(patch.normal.dot(patch.basis_u))
        > DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE
    ):
        _recommend_refinement(
            findings,
            patch.patch_id,
            "Patch basis_u is not orthogonal to normal.",
        )
    if (
        abs(patch.normal.dot(patch.basis_v))
        > DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE
    ):
        _recommend_refinement(
            findings,
            patch.patch_id,
            "Patch basis_v is not orthogonal to normal.",
        )
    if (
        abs(patch.basis_u.dot(patch.basis_v))
        > DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE
    ):
        _recommend_refinement(
            findings,
            patch.patch_id,
            "Patch basis vectors are not orthogonal.",
        )

    handedness = patch.basis_u.cross(patch.basis_v).dot(patch.normal)
    if handedness <= 0.0:
        _recommend_refinement(
            findings,
            patch.patch_id,
            "Patch basis handedness is inconsistent with the normal.",
        )

    if surface_plan.pull_direction is not None:
        try:
            plan_direction = surface_plan.pull_direction.normalized()
        except InvalidVectorError:
            plan_direction = None
        if (
            plan_direction is not None
            and patch.normal.dot(plan_direction)
            < 1.0 - DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE
        ):
            findings.append(
                _finding(
                    MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                    IssueSeverity.ERROR,
                    "Parting surface normal is inconsistent with the planned pull direction.",
                    is_blocking=True,
                    metadata={"patch_id": patch.patch_id},
                )
            )

    if (
        patch.extent_u_mm <= DEFAULT_LINEAR_TOLERANCE_MM
        or patch.extent_v_mm <= DEFAULT_LINEAR_TOLERANCE_MM
    ):
        findings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                IssueSeverity.ERROR,
                "Parting surface patch extents are degenerate.",
                is_blocking=True,
                metadata={"patch_id": patch.patch_id},
            )
        )

    for edge_length in _boundary_edge_lengths(patch.boundary_points):
        if edge_length <= DEFAULT_LINEAR_TOLERANCE_MM:
            _recommend_refinement(
                findings,
                patch.patch_id,
                "Parting surface patch contains duplicate or degenerate boundary points.",
            )
            break

    if _maximum_planarity_deviation(patch) > DEFAULT_LINEAR_TOLERANCE_MM:
        findings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                IssueSeverity.ERROR,
                "Parting surface boundary points are not planar within tolerance.",
                is_blocking=True,
                metadata={"patch_id": patch.patch_id},
            )
        )


def _validate_direction(
    patch_id: str,
    label: str,
    direction: Vector3D,
    findings: list[MoldGenerationFinding],
) -> None:
    magnitude = direction.magnitude() if direction.is_finite() else 0.0
    if magnitude <= DEFAULT_LINEAR_TOLERANCE_MM:
        findings.append(
            _finding(
                MoldGenerationFindingCode.PARTING_SURFACE_INVALID_GEOMETRY,
                IssueSeverity.ERROR,
                f"Parting surface {label} is zero length.",
                is_blocking=True,
                metadata={"patch_id": patch_id},
            )
        )
        return

    if abs(magnitude - 1.0) > DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE:
        _recommend_refinement(
            findings,
            patch_id,
            f"Parting surface {label} is not normalized.",
        )


def _recommend_refinement(
    findings: list[MoldGenerationFinding],
    patch_id: str,
    message: str,
) -> None:
    findings.append(
        _finding(
            MoldGenerationFindingCode.PARTING_SURFACE_REFINEMENT_RECOMMENDED,
            IssueSeverity.WARNING,
            message,
            metadata={"patch_id": patch_id},
        )
    )


def _boundary_edge_lengths(points: tuple[Vector3D, ...]) -> tuple[float, ...]:
    if len(points) < 2:
        return ()

    return tuple(
        (points[(index + 1) % len(points)] - point).magnitude()
        for index, point in enumerate(points)
    )


def _patch_area_sq_mm(patch: PreliminaryPartingSurfacePatch) -> float:
    if len(patch.boundary_points) < _MINIMUM_BOUNDARY_POINT_COUNT:
        return 0.0

    coordinates = [
        (
            (point - patch.origin).dot(patch.basis_u),
            (point - patch.origin).dot(patch.basis_v),
        )
        for point in patch.boundary_points
    ]
    twice_area = 0.0
    for index, (u, v) in enumerate(coordinates):
        next_u, next_v = coordinates[(index + 1) % len(coordinates)]
        twice_area += (u * next_v) - (next_u * v)

    return abs(twice_area) / 2.0


def _maximum_planarity_deviation(patch: PreliminaryPartingSurfacePatch) -> float:
    if not patch.boundary_points or not patch.normal.is_finite():
        return 0.0

    try:
        normal = patch.normal.normalized()
    except InvalidVectorError:
        return 0.0

    return max(
        abs((point - patch.origin).dot(normal)) for point in patch.boundary_points
    )


def _patch_covers_model_projection(
    bounding_box: BoundingBox,
    patch: PreliminaryPartingSurfacePatch,
) -> bool:
    patch_u = tuple(
        (point - patch.origin).dot(patch.basis_u) for point in patch.boundary_points
    )
    patch_v = tuple(
        (point - patch.origin).dot(patch.basis_v) for point in patch.boundary_points
    )
    bbox_projection = _project_bounding_box_to_basis(
        bounding_box,
        patch.origin,
        patch.basis_u,
        patch.basis_v,
    )
    if not patch_u or not patch_v or bbox_projection is None:
        return False

    bbox_min_u, bbox_max_u, bbox_min_v, bbox_max_v = bbox_projection
    return (
        min(patch_u) <= bbox_min_u + DEFAULT_LINEAR_TOLERANCE_MM
        and max(patch_u) >= bbox_max_u - DEFAULT_LINEAR_TOLERANCE_MM
        and min(patch_v) <= bbox_min_v + DEFAULT_LINEAR_TOLERANCE_MM
        and max(patch_v) >= bbox_max_v - DEFAULT_LINEAR_TOLERANCE_MM
    )


def _validation_blocked(
    findings: list[MoldGenerationFinding],
) -> PartingSurfaceValidationResult:
    return PartingSurfaceValidationResult(
        status=PartingSurfaceValidationStatus.BLOCKED,
        findings=_ordered_unique_findings(tuple(findings)),
        refinement_recommended=False,
        manual_review_required=True,
        direct_progression_blocked=True,
    )


def _refine_patch(
    patch: PreliminaryPartingSurfacePatch,
) -> tuple[PreliminaryPartingSurfacePatch | None, tuple[str, ...]]:
    if not patch.normal.is_finite():
        return None, ()

    try:
        normal = patch.normal.normalized()
        basis_u, basis_v = _stable_basis_for_normal(normal)
    except InvalidVectorError:
        return None, ()

    boundary = _remove_duplicate_boundary_points(patch.boundary_points)
    if len(boundary) < _MINIMUM_BOUNDARY_POINT_COUNT:
        return None, ()

    actions = [
        "normalized_normal",
        "rebuilt_orthonormal_basis",
    ]
    if len(boundary) != len(patch.boundary_points):
        actions.append("removed_duplicate_boundary_points")

    refined = PreliminaryPartingSurfacePatch(
        patch_id=patch.patch_id,
        origin=patch.origin,
        normal=normal,
        basis_u=basis_u,
        basis_v=basis_v,
        boundary_points=boundary,
        extent_u_mm=patch.extent_u_mm,
        extent_v_mm=patch.extent_v_mm,
        source_strategy_id=patch.source_strategy_id,
        source_plan_reference=patch.source_plan_reference,
    )
    if _signed_patch_area(refined) < 0.0:
        refined = PreliminaryPartingSurfacePatch(
            patch_id=refined.patch_id,
            origin=refined.origin,
            normal=refined.normal,
            basis_u=refined.basis_u,
            basis_v=refined.basis_v,
            boundary_points=tuple(reversed(refined.boundary_points)),
            extent_u_mm=refined.extent_u_mm,
            extent_v_mm=refined.extent_v_mm,
            source_strategy_id=refined.source_strategy_id,
            source_plan_reference=refined.source_plan_reference,
        )
        actions.append("corrected_boundary_orientation")

    return refined, tuple(actions)


def _remove_duplicate_boundary_points(
    points: tuple[Vector3D, ...],
) -> tuple[Vector3D, ...]:
    deduplicated: list[Vector3D] = []
    for point in points:
        if deduplicated and point.is_approximately_equal(deduplicated[-1]):
            continue
        deduplicated.append(point)

    if len(deduplicated) > 1 and deduplicated[0].is_approximately_equal(
        deduplicated[-1]
    ):
        deduplicated.pop()

    return tuple(deduplicated)


def _signed_patch_area(patch: PreliminaryPartingSurfacePatch) -> float:
    if len(patch.boundary_points) < _MINIMUM_BOUNDARY_POINT_COUNT:
        return 0.0

    coordinates = [
        (
            (point - patch.origin).dot(patch.basis_u),
            (point - patch.origin).dot(patch.basis_v),
        )
        for point in patch.boundary_points
    ]
    twice_area = 0.0
    for index, (u, v) in enumerate(coordinates):
        next_u, next_v = coordinates[(index + 1) % len(coordinates)]
        twice_area += (u * next_v) - (next_u * v)

    return twice_area / 2.0


def _ordered_unique_findings(
    findings: tuple[MoldGenerationFinding, ...],
) -> tuple[MoldGenerationFinding, ...]:
    return tuple({finding: None for finding in findings}.keys())


def _finding(
    code: MoldGenerationFindingCode,
    severity: IssueSeverity,
    message: str,
    *,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> MoldGenerationFinding:
    return MoldGenerationFinding(
        code=code,
        source=MoldGenerationFindingSource.MOLD_GENERATION_PLANNER,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )
