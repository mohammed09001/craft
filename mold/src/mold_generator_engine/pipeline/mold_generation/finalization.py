from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from mold_generator_engine.config.geometry import (
    DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
    DEFAULT_LINEAR_TOLERANCE_MM,
)
from mold_generator_engine.config.mold_generation import (
    DEFAULT_MOLD_BLOCK_CLEARANCE_RATIO,
    DEFAULT_MOLD_BLOCK_MIN_CLEARANCE_MM,
    DEFAULT_MOLD_ENVELOPE_MARGIN_RATIO,
    DEFAULT_MOLD_ENVELOPE_MIN_MARGIN_MM,
)
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import CavityAnalysisDecisionOutcome
from mold_generator_engine.models.imported_model import BoundingBox
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.models.mold_generation import (
    FinalMoldGenerationDecision,
    FinalMoldGenerationDecisionStatus,
    GlobalMoldGenerationValidationResult,
    InitialPartingSurfacePlan,
    MoldBlockPlan,
    MoldComponentPlanningResult,
    MoldComponentPlanningStatus,
    MoldComponentSide,
    MoldEnvelopePlan,
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationFinding,
    MoldGenerationFindingCode,
    MoldGenerationFindingSource,
    PreliminaryMoldGenerationPlan,
    PreliminaryPartingStrategySelection,
    PreliminaryPartingStrategySelectionStatus,
    PreliminaryPartingSurface,
)


@dataclass(frozen=True, slots=True)
class ConservativeMoldEnvelopePlanner:
    """Create bounded preliminary mold-envelope plans from accepted evidence."""

    margin_ratio: float = DEFAULT_MOLD_ENVELOPE_MARGIN_RATIO
    minimum_margin_mm: float = DEFAULT_MOLD_ENVELOPE_MIN_MARGIN_MM
    clearance_mm: float = DEFAULT_LINEAR_TOLERANCE_MM

    def plan(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        accepted_surface: PreliminaryPartingSurface | None,
        component_planning: MoldComponentPlanningResult,
    ) -> MoldEnvelopePlan | None:
        """Return a deterministic envelope plan only when prerequisites are ready."""
        if (
            preliminary_plan.disposition
            is not MoldGenerationDisposition.READY_FOR_PARTING_STRATEGY
            or accepted_surface is None
            or component_planning.status is not MoldComponentPlanningStatus.READY
            or component_planning.core_cavity_plan is None
        ):
            return None

        direction = _opening_direction(component_planning)
        if direction is None:
            return None

        bounds = context.model.bounding_box
        if not _bounding_box_is_valid(bounds):
            return None

        dimensions = _dimensions(bounds)
        largest_extent = max(dimensions.x, dimensions.y, dimensions.z)
        margin = max(self.minimum_margin_mm, largest_extent * self.margin_ratio)
        bounds_min = Vector3D(
            bounds.minimum.x - margin,
            bounds.minimum.y - margin,
            bounds.minimum.z - margin,
        )
        bounds_max = Vector3D(
            bounds.maximum.x + margin,
            bounds.maximum.y + margin,
            bounds.maximum.z + margin,
        )
        envelope_dimensions = bounds_max - bounds_min
        patch_ids = tuple(sorted(patch.patch_id for patch in accepted_surface.patches))
        component_plan_ids = _component_plan_ids(component_planning)
        return MoldEnvelopePlan(
            status=MoldComponentPlanningStatus.READY,
            envelope_id="mold-envelope-plan-0001",
            bounds_min=bounds_min,
            bounds_max=bounds_max,
            dimensions_mm=envelope_dimensions,
            center=_center(bounds_min, bounds_max),
            opening_direction=direction,
            margin_mm=round(margin, 6),
            clearance_mm=round(self.clearance_mm, 6),
            source_model_bounds_reference="imported_model.bounding_box",
            accepted_parting_surface_patch_ids=patch_ids,
            component_plan_ids=component_plan_ids,
            reason_codes=(MoldGenerationFindingCode.MOLD_ENVELOPE_PLAN_CREATED,),
            provenance=(
                "imported_model.bounding_box",
                "accepted_parting_surface",
                "component_planning",
            ),
            reasons=(
                _finding(
                    MoldGenerationFindingCode.MOLD_ENVELOPE_PLAN_CREATED,
                    IssueSeverity.INFO,
                    "Created a bounded preliminary mold-envelope plan.",
                    metadata={"margin_mm": round(margin, 6)},
                ),
            ),
        )


@dataclass(frozen=True, slots=True)
class ConservativeMoldBlockPlanner:
    """Create preliminary mold-block plans from envelope and surface evidence."""

    clearance_ratio: float = DEFAULT_MOLD_BLOCK_CLEARANCE_RATIO
    minimum_clearance_mm: float = DEFAULT_MOLD_BLOCK_MIN_CLEARANCE_MM

    def plan(
        self,
        context: MoldGenerationContext,
        envelope_plan: MoldEnvelopePlan | None,
        accepted_surface: PreliminaryPartingSurface | None,
        component_planning: MoldComponentPlanningResult,
    ) -> MoldBlockPlan | None:
        """Return a deterministic preliminary block plan when envelope is ready."""
        if (
            envelope_plan is None
            or envelope_plan.status is not MoldComponentPlanningStatus.READY
            or accepted_surface is None
            or component_planning.status is not MoldComponentPlanningStatus.READY
        ):
            return None

        largest_extent = max(
            envelope_plan.dimensions_mm.x,
            envelope_plan.dimensions_mm.y,
            envelope_plan.dimensions_mm.z,
        )
        clearance = max(
            self.minimum_clearance_mm,
            largest_extent * self.clearance_ratio,
        )
        bounds_min = Vector3D(
            envelope_plan.bounds_min.x - clearance,
            envelope_plan.bounds_min.y - clearance,
            envelope_plan.bounds_min.z - clearance,
        )
        bounds_max = Vector3D(
            envelope_plan.bounds_max.x + clearance,
            envelope_plan.bounds_max.y + clearance,
            envelope_plan.bounds_max.z + clearance,
        )
        referenced_plan_ids = (
            envelope_plan.envelope_id,
            *_component_plan_ids(component_planning),
        )
        patch_ids = tuple(sorted(patch.patch_id for patch in accepted_surface.patches))
        return MoldBlockPlan(
            status=MoldComponentPlanningStatus.READY,
            block_id="mold-block-plan-0001",
            envelope_id=envelope_plan.envelope_id,
            bounds_min=bounds_min,
            bounds_max=bounds_max,
            dimensions_mm=bounds_max - bounds_min,
            center=_center(bounds_min, bounds_max),
            opening_direction=envelope_plan.opening_direction,
            clearance_mm=round(clearance, 6),
            representation="preliminary_axis_aligned_bounded_block_plan",
            parting_surface_patch_ids=patch_ids,
            referenced_plan_ids=referenced_plan_ids,
            reason_codes=(MoldGenerationFindingCode.MOLD_BLOCK_PLAN_CREATED,),
            provenance=(
                "mold_envelope_plan",
                "accepted_parting_surface",
                "component_planning",
            ),
            reasons=(
                _finding(
                    MoldGenerationFindingCode.MOLD_BLOCK_PLAN_CREATED,
                    IssueSeverity.INFO,
                    "Created a preliminary bounded mold-block plan.",
                    metadata={"clearance_mm": round(clearance, 6)},
                ),
            ),
        )


@dataclass(frozen=True, slots=True)
class ConservativeGlobalMoldGenerationValidator:
    """Validate integrated Chapter 5 results without mutating upstream reports."""

    def validate(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        selection: PreliminaryPartingStrategySelection,
        surface_plan: InitialPartingSurfacePlan,
        accepted_surface: PreliminaryPartingSurface | None,
        component_planning: MoldComponentPlanningResult,
        envelope_plan: MoldEnvelopePlan | None,
        block_plan: MoldBlockPlan | None,
    ) -> GlobalMoldGenerationValidationResult:
        """Return deterministic global validation findings for Chapter 5."""
        findings: list[MoldGenerationFinding] = []

        if preliminary_plan.disposition is MoldGenerationDisposition.BLOCKED:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_BLOCKED,
                    IssueSeverity.ERROR,
                    "Global validation is blocked by upstream Chapter 2-4 evidence.",
                    is_blocking=True,
                )
            )
            return _global_result(MoldComponentPlanningStatus.BLOCKED, findings)

        if _unsupported_capability_required(context, preliminary_plan):
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_UNSUPPORTED,
                    IssueSeverity.WARNING,
                    "Global validation found a valid but unsupported capability requirement.",
                )
            )
            return _global_result(
                MoldComponentPlanningStatus.UNSUPPORTED,
                findings,
                manual_review_required=True,
            )

        if preliminary_plan.disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_MANUAL_REVIEW_REQUIRED,
                    IssueSeverity.WARNING,
                    "Global validation preserves an upstream manual-review requirement.",
                )
            )
            return _global_result(
                MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED,
                findings,
                manual_review_required=True,
            )

        _validate_prerequisites(
            selection,
            surface_plan,
            accepted_surface,
            component_planning,
            envelope_plan,
            block_plan,
            findings,
        )
        _validate_unique_ids(
            accepted_surface,
            component_planning,
            envelope_plan,
            block_plan,
            findings,
        )
        _validate_envelope(envelope_plan, accepted_surface, component_planning, findings)
        _validate_block(block_plan, envelope_plan, accepted_surface, findings)
        _validate_opening_direction(component_planning, envelope_plan, block_plan, findings)

        if any(finding.is_blocking for finding in findings):
            return _global_result(MoldComponentPlanningStatus.BLOCKED, findings)

        if component_planning.status is MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_MANUAL_REVIEW_REQUIRED,
                    IssueSeverity.WARNING,
                    "Component planning still requires manual review.",
                )
            )
            return _global_result(
                MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED,
                findings,
                manual_review_required=True,
            )

        if component_planning.status is MoldComponentPlanningStatus.UNSUPPORTED:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_UNSUPPORTED,
                    IssueSeverity.WARNING,
                    "Component planning requires unsupported capability.",
                )
            )
            return _global_result(
                MoldComponentPlanningStatus.UNSUPPORTED,
                findings,
                manual_review_required=True,
            )

        findings.append(
            _finding(
                MoldGenerationFindingCode.GLOBAL_VALIDATION_PASSED,
                IssueSeverity.INFO,
                "Integrated Chapter 5 preliminary plans passed global validation.",
            )
        )
        return _global_result(MoldComponentPlanningStatus.READY, findings)


@dataclass(frozen=True, slots=True)
class ConservativeFinalMoldGenerationDecisionMaker:
    """Resolve the final Chapter 5 preliminary generation decision."""

    def decide(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        component_planning: MoldComponentPlanningResult,
        envelope_plan: MoldEnvelopePlan | None,
        block_plan: MoldBlockPlan | None,
        global_validation: GlobalMoldGenerationValidationResult,
    ) -> FinalMoldGenerationDecision:
        """Resolve ready, manual-review, blocked, or unsupported final status."""
        if (
            preliminary_plan.disposition is MoldGenerationDisposition.BLOCKED
            or global_validation.status is MoldComponentPlanningStatus.BLOCKED
            or global_validation.direct_progression_blocked
        ):
            return _decision(
                FinalMoldGenerationDecisionStatus.BLOCKED,
                "Preliminary mold generation is blocked.",
                MoldGenerationFindingCode.FINAL_DECISION_BLOCKED,
                preliminary_plan,
                global_validation,
            )

        if (
            global_validation.status is MoldComponentPlanningStatus.UNSUPPORTED
            or component_planning.status is MoldComponentPlanningStatus.UNSUPPORTED
            or _unsupported_capability_required(context, preliminary_plan)
        ):
            return _decision(
                FinalMoldGenerationDecisionStatus.UNSUPPORTED,
                "Preliminary mold generation needs unsupported capability.",
                MoldGenerationFindingCode.FINAL_DECISION_UNSUPPORTED,
                preliminary_plan,
                global_validation,
            )

        if (
            preliminary_plan.disposition
            is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
            or global_validation.status
            is MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
            or global_validation.manual_review_required
            or component_planning.status
            is MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
        ):
            return _decision(
                FinalMoldGenerationDecisionStatus.MANUAL_REVIEW,
                "Preliminary mold generation requires manual review.",
                MoldGenerationFindingCode.FINAL_DECISION_MANUAL_REVIEW,
                preliminary_plan,
                global_validation,
            )

        if envelope_plan is None or block_plan is None:
            return _decision(
                FinalMoldGenerationDecisionStatus.BLOCKED,
                "Preliminary mold generation is missing envelope or block planning.",
                MoldGenerationFindingCode.FINAL_DECISION_BLOCKED,
                preliminary_plan,
                global_validation,
            )

        return _decision(
            FinalMoldGenerationDecisionStatus.READY,
            "Preliminary envelope and block planning are ready for the next stage.",
            MoldGenerationFindingCode.FINAL_DECISION_READY,
            preliminary_plan,
            global_validation,
        )


DEFAULT_MOLD_ENVELOPE_PLANNER = ConservativeMoldEnvelopePlanner()
DEFAULT_MOLD_BLOCK_PLANNER = ConservativeMoldBlockPlanner()
DEFAULT_GLOBAL_MOLD_GENERATION_VALIDATOR = ConservativeGlobalMoldGenerationValidator()
DEFAULT_FINAL_MOLD_GENERATION_DECISION_MAKER = (
    ConservativeFinalMoldGenerationDecisionMaker()
)


def _validate_prerequisites(
    selection: PreliminaryPartingStrategySelection,
    surface_plan: InitialPartingSurfacePlan,
    accepted_surface: PreliminaryPartingSurface | None,
    component_planning: MoldComponentPlanningResult,
    envelope_plan: MoldEnvelopePlan | None,
    block_plan: MoldBlockPlan | None,
    findings: list[MoldGenerationFinding],
) -> None:
    if selection.status is not PreliminaryPartingStrategySelectionStatus.SELECTED:
        findings.append(_blocking_incomplete("A selected parting strategy is required."))

    if surface_plan.selected_strategy_id is None:
        findings.append(
            _blocking_missing_reference("Initial parting surface plan is unlinked.")
        )

    if accepted_surface is None:
        findings.append(_blocking_incomplete("Accepted parting surface is required."))

    if component_planning.core_cavity_plan is None:
        findings.append(_blocking_incomplete("Core/cavity plan is required."))

    if envelope_plan is None:
        findings.append(_blocking_incomplete("Mold envelope plan is required."))

    if block_plan is None:
        findings.append(_blocking_incomplete("Mold block plan is required."))


def _validate_unique_ids(
    accepted_surface: PreliminaryPartingSurface | None,
    component_planning: MoldComponentPlanningResult,
    envelope_plan: MoldEnvelopePlan | None,
    block_plan: MoldBlockPlan | None,
    findings: list[MoldGenerationFinding],
) -> None:
    ids: list[str] = []
    if accepted_surface is not None:
        ids.extend(patch.patch_id for patch in accepted_surface.patches)
    if component_planning.core_cavity_plan is not None:
        core_cavity = component_planning.core_cavity_plan
        ids.append(core_cavity.plan_id)
        ids.extend(region.region_id for region in core_cavity.special_regions)
    ids.extend(plan.plan_id for plan in component_planning.insert_plans)
    ids.extend(plan.plan_id for plan in component_planning.support_plans)
    ids.extend(plan.plan_id for plan in component_planning.relief_plans)
    if envelope_plan is not None:
        ids.append(envelope_plan.envelope_id)
    if block_plan is not None:
        ids.append(block_plan.block_id)

    for duplicate_id in tuple(sorted({item for item in ids if ids.count(item) > 1})):
        findings.append(
            _finding(
                MoldGenerationFindingCode.GLOBAL_VALIDATION_DUPLICATE_ID,
                IssueSeverity.ERROR,
                "Global validation found a duplicate identifier.",
                is_blocking=True,
                metadata={"id": duplicate_id},
            )
        )


def _validate_envelope(
    envelope_plan: MoldEnvelopePlan | None,
    accepted_surface: PreliminaryPartingSurface | None,
    component_planning: MoldComponentPlanningResult,
    findings: list[MoldGenerationFinding],
) -> None:
    if envelope_plan is None:
        return

    _validate_bounds(
        envelope_plan.bounds_min,
        envelope_plan.bounds_max,
        envelope_plan.dimensions_mm,
        MoldGenerationFindingCode.MOLD_ENVELOPE_INVALID_BOUNDS,
        "Mold envelope bounds or dimensions are invalid.",
        findings,
    )
    if not envelope_plan.opening_direction.is_finite():
        findings.append(
            _non_finite(
                MoldGenerationFindingCode.MOLD_ENVELOPE_NON_FINITE_VALUE,
                "Mold envelope opening direction is non-finite.",
            )
        )
    patch_ids = _patch_ids(accepted_surface)
    _require_known_references(
        envelope_plan.accepted_parting_surface_patch_ids,
        patch_ids,
        "Mold envelope references a missing parting surface patch.",
        findings,
    )
    known_component_ids = set(_component_plan_ids(component_planning))
    _require_known_references(
        envelope_plan.component_plan_ids,
        known_component_ids,
        "Mold envelope references a missing component plan.",
        findings,
    )
    if not envelope_plan.reason_codes or not envelope_plan.provenance:
        findings.append(_missing_evidence("Mold envelope is missing provenance."))


def _validate_block(
    block_plan: MoldBlockPlan | None,
    envelope_plan: MoldEnvelopePlan | None,
    accepted_surface: PreliminaryPartingSurface | None,
    findings: list[MoldGenerationFinding],
) -> None:
    if block_plan is None:
        return

    _validate_bounds(
        block_plan.bounds_min,
        block_plan.bounds_max,
        block_plan.dimensions_mm,
        MoldGenerationFindingCode.MOLD_BLOCK_INVALID_BOUNDS,
        "Mold block bounds or dimensions are invalid.",
        findings,
    )
    if envelope_plan is None or block_plan.envelope_id != envelope_plan.envelope_id:
        findings.append(
            _blocking_missing_reference("Mold block references a missing envelope.")
        )
    if envelope_plan is not None and not _bounds_contain(
        block_plan.bounds_min,
        block_plan.bounds_max,
        envelope_plan.bounds_min,
        envelope_plan.bounds_max,
    ):
        findings.append(
            _finding(
                MoldGenerationFindingCode.MOLD_BLOCK_INVALID_BOUNDS,
                IssueSeverity.ERROR,
                "Mold block bounds do not contain the envelope bounds.",
                is_blocking=True,
            )
        )
    _require_known_references(
        block_plan.parting_surface_patch_ids,
        _patch_ids(accepted_surface),
        "Mold block references a missing parting surface patch.",
        findings,
    )
    if not block_plan.reason_codes or not block_plan.provenance:
        findings.append(_missing_evidence("Mold block is missing provenance."))


def _validate_opening_direction(
    component_planning: MoldComponentPlanningResult,
    envelope_plan: MoldEnvelopePlan | None,
    block_plan: MoldBlockPlan | None,
    findings: list[MoldGenerationFinding],
) -> None:
    direction = _opening_direction(component_planning)
    if direction is None:
        return

    for label, candidate in (
        ("mold_envelope_plan", None if envelope_plan is None else envelope_plan.opening_direction),
        ("mold_block_plan", None if block_plan is None else block_plan.opening_direction),
    ):
        if candidate is None:
            continue
        try:
            normalized = candidate.normalized()
        except InvalidVectorError:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_INCONSISTENT_OPENING_DIRECTION,
                    IssueSeverity.ERROR,
                    "Opening direction is invalid.",
                    is_blocking=True,
                    metadata={"plan": label},
                )
            )
            continue
        if normalized.dot(direction) < 1.0 - DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_INCONSISTENT_OPENING_DIRECTION,
                    IssueSeverity.ERROR,
                    "Opening direction is inconsistent across Chapter 5 plans.",
                    is_blocking=True,
                    metadata={"plan": label},
                )
            )


def _validate_bounds(
    bounds_min: Vector3D,
    bounds_max: Vector3D,
    dimensions: Vector3D,
    code: MoldGenerationFindingCode,
    message: str,
    findings: list[MoldGenerationFinding],
) -> None:
    if not bounds_min.is_finite() or not bounds_max.is_finite() or not dimensions.is_finite():
        findings.append(_non_finite(code, message))
        return

    positive_dimensions = (
        dimensions.x > DEFAULT_LINEAR_TOLERANCE_MM
        and dimensions.y > DEFAULT_LINEAR_TOLERANCE_MM
        and dimensions.z > DEFAULT_LINEAR_TOLERANCE_MM
    )
    matches_bounds = (
        abs((bounds_max.x - bounds_min.x) - dimensions.x) <= DEFAULT_LINEAR_TOLERANCE_MM
        and abs((bounds_max.y - bounds_min.y) - dimensions.y) <= DEFAULT_LINEAR_TOLERANCE_MM
        and abs((bounds_max.z - bounds_min.z) - dimensions.z) <= DEFAULT_LINEAR_TOLERANCE_MM
    )
    if not positive_dimensions or not matches_bounds:
        findings.append(
            _finding(code, IssueSeverity.ERROR, message, is_blocking=True)
        )


def _global_result(
    status: MoldComponentPlanningStatus,
    findings: list[MoldGenerationFinding],
    *,
    manual_review_required: bool = False,
) -> GlobalMoldGenerationValidationResult:
    return GlobalMoldGenerationValidationResult(
        status=status,
        findings=tuple({finding: None for finding in findings}.keys()),
        manual_review_required=manual_review_required,
        direct_progression_blocked=status is MoldComponentPlanningStatus.BLOCKED,
    )


def _decision(
    status: FinalMoldGenerationDecisionStatus,
    summary: str,
    code: MoldGenerationFindingCode,
    preliminary_plan: PreliminaryMoldGenerationPlan,
    global_validation: GlobalMoldGenerationValidationResult,
) -> FinalMoldGenerationDecision:
    severity = IssueSeverity.INFO if status is FinalMoldGenerationDecisionStatus.READY else IssueSeverity.WARNING
    return FinalMoldGenerationDecision(
        status=status,
        summary=summary,
        reasons=(
            _finding(
                code,
                severity,
                summary,
                is_blocking=status is FinalMoldGenerationDecisionStatus.BLOCKED,
            ),
        ),
        validation_status=global_validation.status,
        preliminary_disposition=preliminary_plan.disposition,
    )


def _unsupported_capability_required(
    context: MoldGenerationContext,
    preliminary_plan: PreliminaryMoldGenerationPlan,
) -> bool:
    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is not None and decision.outcome in {
        CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED,
        CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED,
    }:
        return True

    return any(
        reason.code
        in {
            MoldGenerationFindingCode.CHAPTER_4_SPECIAL_STRATEGY_REQUIRED,
            MoldGenerationFindingCode.CHAPTER_4_MULTI_DIRECTION_REQUIRED,
            MoldGenerationFindingCode.COMPONENT_PLANNING_UNSUPPORTED,
        }
        for reason in (*preliminary_plan.reasons, *preliminary_plan.warnings)
    )


def _opening_direction(
    component_planning: MoldComponentPlanningResult,
) -> Vector3D | None:
    core_cavity = component_planning.core_cavity_plan
    if core_cavity is None:
        return None

    for side in core_cavity.sides:
        if side.side is MoldComponentSide.CAVITY:
            try:
                return side.opening_direction.normalized()
            except InvalidVectorError:
                return None

    return None


def _component_plan_ids(
    component_planning: MoldComponentPlanningResult,
) -> tuple[str, ...]:
    ids: list[str] = []
    if component_planning.core_cavity_plan is not None:
        ids.append(component_planning.core_cavity_plan.plan_id)
    ids.extend(plan.plan_id for plan in component_planning.insert_plans)
    ids.extend(plan.plan_id for plan in component_planning.support_plans)
    ids.extend(plan.plan_id for plan in component_planning.relief_plans)
    return tuple(sorted(ids))


def _bounding_box_is_valid(bounding_box: BoundingBox) -> bool:
    values = (
        bounding_box.minimum.x,
        bounding_box.minimum.y,
        bounding_box.minimum.z,
        bounding_box.maximum.x,
        bounding_box.maximum.y,
        bounding_box.maximum.z,
    )
    if not all(isfinite(value) for value in values):
        return False

    dimensions = _dimensions(bounding_box)
    return (
        dimensions.x > DEFAULT_LINEAR_TOLERANCE_MM
        and dimensions.y > DEFAULT_LINEAR_TOLERANCE_MM
        and dimensions.z > DEFAULT_LINEAR_TOLERANCE_MM
    )


def _dimensions(bounding_box: BoundingBox) -> Vector3D:
    return Vector3D(
        bounding_box.maximum.x - bounding_box.minimum.x,
        bounding_box.maximum.y - bounding_box.minimum.y,
        bounding_box.maximum.z - bounding_box.minimum.z,
    )


def _center(bounds_min: Vector3D, bounds_max: Vector3D) -> Vector3D:
    return Vector3D(
        (bounds_min.x + bounds_max.x) / 2.0,
        (bounds_min.y + bounds_max.y) / 2.0,
        (bounds_min.z + bounds_max.z) / 2.0,
    )


def _bounds_contain(
    outer_min: Vector3D,
    outer_max: Vector3D,
    inner_min: Vector3D,
    inner_max: Vector3D,
) -> bool:
    return (
        outer_min.x <= inner_min.x + DEFAULT_LINEAR_TOLERANCE_MM
        and outer_min.y <= inner_min.y + DEFAULT_LINEAR_TOLERANCE_MM
        and outer_min.z <= inner_min.z + DEFAULT_LINEAR_TOLERANCE_MM
        and outer_max.x >= inner_max.x - DEFAULT_LINEAR_TOLERANCE_MM
        and outer_max.y >= inner_max.y - DEFAULT_LINEAR_TOLERANCE_MM
        and outer_max.z >= inner_max.z - DEFAULT_LINEAR_TOLERANCE_MM
    )


def _patch_ids(surface: PreliminaryPartingSurface | None) -> set[str]:
    if surface is None:
        return set()

    return {patch.patch_id for patch in surface.patches}


def _require_known_references(
    referenced_ids: tuple[str, ...],
    known_ids: set[str],
    message: str,
    findings: list[MoldGenerationFinding],
) -> None:
    for referenced_id in referenced_ids:
        if referenced_id not in known_ids:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.GLOBAL_VALIDATION_MISSING_REFERENCE,
                    IssueSeverity.ERROR,
                    message,
                    is_blocking=True,
                    metadata={"referenced_id": referenced_id},
                )
            )


def _blocking_incomplete(message: str) -> MoldGenerationFinding:
    return _finding(
        MoldGenerationFindingCode.GLOBAL_VALIDATION_INCOMPLETE_PLAN,
        IssueSeverity.ERROR,
        message,
        is_blocking=True,
    )


def _blocking_missing_reference(message: str) -> MoldGenerationFinding:
    return _finding(
        MoldGenerationFindingCode.GLOBAL_VALIDATION_MISSING_REFERENCE,
        IssueSeverity.ERROR,
        message,
        is_blocking=True,
    )


def _missing_evidence(message: str) -> MoldGenerationFinding:
    return _finding(
        MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_EVIDENCE,
        IssueSeverity.ERROR,
        message,
        is_blocking=True,
    )


def _non_finite(
    code: MoldGenerationFindingCode,
    message: str,
) -> MoldGenerationFinding:
    return _finding(code, IssueSeverity.ERROR, message, is_blocking=True)


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
