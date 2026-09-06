from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisDecisionOutcome,
    CavityCoreStrategyOutcome,
    CoreTrappingRiskOutcome,
    InternalUndercutAnalysisOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    UndercutRiskSeverity,
    UndercutTreatmentRequirement,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.models.mold_generation import (
    CoreCavitySidePlan,
    InitialPartingSurfacePlan,
    InitialPartingSurfacePlanStatus,
    InsertPlan,
    InsertPlanPurpose,
    MoldComponentPlanKind,
    MoldComponentPlanningResult,
    MoldComponentPlanningStatus,
    MoldComponentPlanValidationResult,
    MoldComponentSide,
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationFinding,
    MoldGenerationFindingCode,
    MoldGenerationFindingSource,
    MoldSpecialRegionKind,
    MoldSpecialRegionPlan,
    PreliminaryCoreCavityPlan,
    PreliminaryMoldGenerationPlan,
    PreliminaryPartingStrategySelection,
    PreliminaryPartingStrategySelectionStatus,
    PreliminaryPartingSurface,
    ReliefPlan,
    ReliefPlanPurpose,
    SupportPlan,
    SupportPlanPurpose,
)


@dataclass(frozen=True, slots=True)
class EvidenceCoreCavityPlanner:
    """Create semantic core/cavity side plans from accepted Chapter 5 evidence."""

    def plan(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        strategy_selection: PreliminaryPartingStrategySelection,
        surface_plan: InitialPartingSurfacePlan,
        accepted_surface: PreliminaryPartingSurface | None,
    ) -> PreliminaryCoreCavityPlan:
        """Plan logical mold sides without creating solids or mold halves."""
        if preliminary_plan.disposition is MoldGenerationDisposition.BLOCKED:
            return _core_cavity_without_sides(
                MoldComponentPlanningStatus.BLOCKED,
                MoldGenerationFindingCode.COMPONENT_PLANNING_UPSTREAM_BLOCKED,
                "Core/cavity planning is blocked by upstream Chapter 2-4 evidence.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        if accepted_surface is None:
            status = (
                MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
                if preliminary_plan.disposition
                is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
                else MoldComponentPlanningStatus.BLOCKED
            )
            return _core_cavity_without_sides(
                status,
                MoldGenerationFindingCode.COMPONENT_PLANNING_ACCEPTED_SURFACE_MISSING,
                "Core/cavity planning requires an accepted preliminary parting surface.",
                IssueSeverity.WARNING
                if status is MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
                else IssueSeverity.ERROR,
                is_blocking=status is MoldComponentPlanningStatus.BLOCKED,
            )

        unsupported = _unsupported_component_capability(context)
        if unsupported is not None:
            return _core_cavity_without_sides(
                MoldComponentPlanningStatus.UNSUPPORTED,
                MoldGenerationFindingCode.COMPONENT_PLANNING_UNSUPPORTED,
                unsupported,
                IssueSeverity.WARNING,
            )

        if (
            strategy_selection.status
            is not PreliminaryPartingStrategySelectionStatus.SELECTED
            or strategy_selection.selected_candidate is None
            or strategy_selection.selected_candidate.pull_direction is None
            or surface_plan.status is not InitialPartingSurfacePlanStatus.PLANNED
        ):
            return _core_cavity_without_sides(
                MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED,
                MoldGenerationFindingCode.CORE_CAVITY_PLAN_REQUIRES_MANUAL_REVIEW,
                "Core/cavity planning requires a selected strategy and planned surface.",
                IssueSeverity.WARNING,
            )

        try:
            opening_direction = (
                strategy_selection.selected_candidate.pull_direction.normalized()
            )
        except InvalidVectorError:
            return _core_cavity_without_sides(
                MoldComponentPlanningStatus.BLOCKED,
                MoldGenerationFindingCode.COMPONENT_PLAN_NON_FINITE_VALUE,
                "Core/cavity planning received an invalid opening direction.",
                IssueSeverity.ERROR,
                is_blocking=True,
            )

        selected_strategy_id = strategy_selection.selected_candidate.candidate_id
        patch_ids = tuple(patch.patch_id for patch in accepted_surface.patches)
        reasons = (
            _finding(
                MoldGenerationFindingCode.CORE_CAVITY_PLAN_CREATED,
                IssueSeverity.INFO,
                "Created semantic core/cavity side assignments.",
                metadata={"selected_strategy_id": selected_strategy_id},
            ),
        )
        sides = (
            CoreCavitySidePlan(
                side=MoldComponentSide.CAVITY,
                opening_direction=opening_direction,
                selected_strategy_id=selected_strategy_id,
                accepted_parting_surface_patch_ids=patch_ids,
                role="positive_opening_side",
                reason_codes=(MoldGenerationFindingCode.CORE_CAVITY_SIDE_ASSIGNED,),
                provenance=(
                    "preliminary_parting_strategy_selection",
                    "accepted_parting_surface",
                ),
            ),
            CoreCavitySidePlan(
                side=MoldComponentSide.CORE,
                opening_direction=-opening_direction,
                selected_strategy_id=selected_strategy_id,
                accepted_parting_surface_patch_ids=patch_ids,
                role="negative_opening_side",
                reason_codes=(MoldGenerationFindingCode.CORE_CAVITY_SIDE_ASSIGNED,),
                provenance=(
                    "preliminary_parting_strategy_selection",
                    "accepted_parting_surface",
                ),
            ),
        )
        regions = _special_regions_from_context(context)
        status = (
            MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
            if any(region.requires_manual_review for region in regions)
            or preliminary_plan.disposition
            is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED
            else MoldComponentPlanningStatus.READY
        )
        return PreliminaryCoreCavityPlan(
            status=status,
            plan_id="core-cavity-plan-0001",
            selected_strategy_id=selected_strategy_id,
            accepted_parting_surface_patch_ids=patch_ids,
            sides=sides,
            special_regions=regions,
            assumptions=(
                "semantic_plan_only_no_mold_half_geometry",
                "accepted_parting_surface_is_preliminary",
                "opening_direction_uses_chapter_3_selected_pull_axis",
            ),
            reasons=reasons,
            warnings=preliminary_plan.warnings,
        )


@dataclass(frozen=True, slots=True)
class EvidenceInsertPlanner:
    """Plan semantic inserts only when Chapter 3 or Chapter 4 evidence exists."""

    def plan(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
    ) -> tuple[InsertPlan, ...]:
        """Return deterministic insert plans supported by upstream evidence."""
        if core_cavity_plan.status in {
            MoldComponentPlanningStatus.BLOCKED,
            MoldComponentPlanningStatus.UNSUPPORTED,
        }:
            return ()

        plans: list[InsertPlan] = []
        for index, region in enumerate(core_cavity_plan.special_regions, start=1):
            purpose = _insert_purpose_for_region(region.kind)
            if purpose is None:
                continue

            plans.append(
                InsertPlan(
                    plan_id=f"insert-plan-{index:04d}-{_stable_suffix(region.region_id)}",
                    status=(
                        MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
                        if region.requires_manual_review
                        else MoldComponentPlanningStatus.READY
                    ),
                    purpose=purpose,
                    source_reference=region.source_reference,
                    related_region_ids=(region.region_id,),
                    reason_codes=(MoldGenerationFindingCode.INSERT_PLAN_CREATED,),
                    provenance=region.provenance,
                    confidence=0.65 if region.requires_manual_review else 0.82,
                    requires_manual_review=region.requires_manual_review,
                )
            )

        return tuple(sorted(plans, key=lambda item: item.plan_id))


@dataclass(frozen=True, slots=True)
class EvidenceSupportPlanner:
    """Plan semantic support needs from insert and core-region evidence."""

    def plan(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
    ) -> tuple[SupportPlan, ...]:
        """Return deterministic support plans supported by upstream evidence."""
        if core_cavity_plan.status in {
            MoldComponentPlanningStatus.BLOCKED,
            MoldComponentPlanningStatus.UNSUPPORTED,
        }:
            return ()

        plans: list[SupportPlan] = []
        for index, insert_plan in enumerate(insert_plans, start=1):
            plans.append(
                SupportPlan(
                    plan_id=f"support-plan-{index:04d}-{_stable_suffix(insert_plan.plan_id)}",
                    status=insert_plan.status,
                    purpose=SupportPlanPurpose.INSERT_RELATED_SUPPORT,
                    source_reference=insert_plan.plan_id,
                    related_region_ids=insert_plan.related_region_ids,
                    reason_codes=(MoldGenerationFindingCode.SUPPORT_PLAN_CREATED,),
                    provenance=(
                        *insert_plan.provenance,
                        "insert_plan",
                    ),
                    confidence=max(0.0, round(insert_plan.confidence - 0.08, 6)),
                    requires_manual_review=insert_plan.requires_manual_review,
                )
            )

        offset = len(plans)
        for region in core_cavity_plan.special_regions:
            if region.kind is not MoldSpecialRegionKind.HIGH_UNDERCUT_RISK:
                continue
            plans.append(
                SupportPlan(
                    plan_id=f"support-plan-{offset + 1:04d}-{_stable_suffix(region.region_id)}",
                    status=MoldComponentPlanningStatus.READY,
                    purpose=SupportPlanPurpose.HIGH_RISK_REGION_SUPPORT,
                    source_reference=region.source_reference,
                    related_region_ids=(region.region_id,),
                    reason_codes=(MoldGenerationFindingCode.SUPPORT_PLAN_CREATED,),
                    provenance=region.provenance,
                    confidence=0.72,
                    requires_manual_review=False,
                )
            )
            offset += 1

        return tuple(sorted(plans, key=lambda item: item.plan_id))


@dataclass(frozen=True, slots=True)
class EvidenceReliefPlanner:
    """Plan semantic relief needs from insert and core-region evidence."""

    def plan(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
    ) -> tuple[ReliefPlan, ...]:
        """Return deterministic relief plans supported by upstream evidence."""
        if core_cavity_plan.status in {
            MoldComponentPlanningStatus.BLOCKED,
            MoldComponentPlanningStatus.UNSUPPORTED,
        }:
            return ()

        plans: list[ReliefPlan] = []
        for index, insert_plan in enumerate(insert_plans, start=1):
            plans.append(
                ReliefPlan(
                    plan_id=f"relief-plan-{index:04d}-{_stable_suffix(insert_plan.plan_id)}",
                    status=insert_plan.status,
                    purpose=ReliefPlanPurpose.INSERT_CLEARANCE,
                    source_reference=insert_plan.plan_id,
                    related_region_ids=insert_plan.related_region_ids,
                    reason_codes=(MoldGenerationFindingCode.RELIEF_PLAN_CREATED,),
                    provenance=(
                        *insert_plan.provenance,
                        "insert_plan",
                    ),
                    confidence=max(0.0, round(insert_plan.confidence - 0.1, 6)),
                    requires_manual_review=insert_plan.requires_manual_review,
                )
            )

        existing_regions = {
            region_id for plan in plans for region_id in plan.related_region_ids
        }
        offset = len(plans)
        for region in core_cavity_plan.special_regions:
            if (
                region.kind is not MoldSpecialRegionKind.CORE_TARGET
                or region.region_id in existing_regions
            ):
                continue
            plans.append(
                ReliefPlan(
                    plan_id=f"relief-plan-{offset + 1:04d}-{_stable_suffix(region.region_id)}",
                    status=(
                        MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
                        if region.requires_manual_review
                        else MoldComponentPlanningStatus.READY
                    ),
                    purpose=ReliefPlanPurpose.CORE_PULL_CLEARANCE,
                    source_reference=region.source_reference,
                    related_region_ids=(region.region_id,),
                    reason_codes=(MoldGenerationFindingCode.RELIEF_PLAN_CREATED,),
                    provenance=region.provenance,
                    confidence=0.7 if region.requires_manual_review else 0.78,
                    requires_manual_review=region.requires_manual_review,
                )
            )
            offset += 1

        return tuple(sorted(plans, key=lambda item: item.plan_id))


@dataclass(frozen=True, slots=True)
class ConservativeMoldComponentPlanValidator:
    """Validate semantic component plans without CAD operations."""

    def validate(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
        support_plans: tuple[SupportPlan, ...],
        relief_plans: tuple[ReliefPlan, ...],
        accepted_surface: PreliminaryPartingSurface | None,
    ) -> MoldComponentPlanValidationResult:
        """Validate references, identifiers, finite values, and decisions."""
        findings: list[MoldGenerationFinding] = []
        if core_cavity_plan.status is MoldComponentPlanningStatus.BLOCKED:
            findings.extend(core_cavity_plan.reasons)
            return _validation_result(
                MoldComponentPlanningStatus.BLOCKED,
                findings,
                manual_review_required=True,
                direct_progression_blocked=True,
            )

        if core_cavity_plan.status is MoldComponentPlanningStatus.UNSUPPORTED:
            findings.extend(core_cavity_plan.reasons)
            return _validation_result(
                MoldComponentPlanningStatus.UNSUPPORTED,
                findings,
                manual_review_required=True,
            )

        if (
            core_cavity_plan.status
            is MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
            and not core_cavity_plan.sides
        ):
            findings.extend(core_cavity_plan.reasons)
            return _validation_result(
                MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED,
                findings,
                manual_review_required=True,
            )

        if accepted_surface is None:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLANNING_ACCEPTED_SURFACE_MISSING,
                    IssueSeverity.ERROR,
                    "Component planning validation requires an accepted parting surface.",
                    is_blocking=True,
                )
            )

        _validate_unique_ids(
            core_cavity_plan,
            insert_plans,
            support_plans,
            relief_plans,
            findings,
        )
        _validate_core_cavity_plan(core_cavity_plan, accepted_surface, findings)
        region_ids = {region.region_id for region in core_cavity_plan.special_regions}
        _validate_component_plans(
            MoldComponentPlanKind.INSERT,
            insert_plans,
            region_ids,
            findings,
        )
        _validate_component_plans(
            MoldComponentPlanKind.SUPPORT,
            support_plans,
            region_ids,
            findings,
        )
        _validate_component_plans(
            MoldComponentPlanKind.RELIEF,
            relief_plans,
            region_ids,
            findings,
        )

        if any(finding.is_blocking for finding in findings):
            return _validation_result(
                MoldComponentPlanningStatus.BLOCKED,
                findings,
                manual_review_required=True,
                direct_progression_blocked=True,
            )

        manual_review = (
            core_cavity_plan.status
            is MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED
            or any(plan.requires_manual_review for plan in insert_plans)
            or any(plan.requires_manual_review for plan in support_plans)
            or any(plan.requires_manual_review for plan in relief_plans)
        )
        if manual_review:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLANNING_REQUIRES_MANUAL_REVIEW,
                    IssueSeverity.WARNING,
                    "Component planning contains reviewable ambiguity.",
                )
            )
            return _validation_result(
                MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED,
                findings,
                manual_review_required=True,
            )

        findings.append(
            _finding(
                MoldGenerationFindingCode.COMPONENT_PLAN_VALIDATED,
                IssueSeverity.INFO,
                "Semantic mold-component plans passed validation.",
            )
        )
        return _validation_result(MoldComponentPlanningStatus.READY, findings)


@dataclass(frozen=True, slots=True)
class DefaultMoldComponentPlanningIntegrator:
    """Integrate validated semantic component plans into one report section."""

    def integrate(
        self,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
        support_plans: tuple[SupportPlan, ...],
        relief_plans: tuple[ReliefPlan, ...],
        validation: MoldComponentPlanValidationResult,
    ) -> MoldComponentPlanningResult:
        """Combine component plans and validation with deterministic ordering."""
        reason_code = {
            MoldComponentPlanningStatus.READY: (
                MoldGenerationFindingCode.COMPONENT_PLANNING_READY
            ),
            MoldComponentPlanningStatus.MANUAL_REVIEW_REQUIRED: (
                MoldGenerationFindingCode.COMPONENT_PLANNING_REQUIRES_MANUAL_REVIEW
            ),
            MoldComponentPlanningStatus.BLOCKED: (
                MoldGenerationFindingCode.COMPONENT_PLANNING_BLOCKED
            ),
            MoldComponentPlanningStatus.UNSUPPORTED: (
                MoldGenerationFindingCode.COMPONENT_PLANNING_UNSUPPORTED
            ),
        }[validation.status]
        return MoldComponentPlanningResult(
            status=validation.status,
            core_cavity_plan=core_cavity_plan,
            insert_plans=tuple(sorted(insert_plans, key=lambda item: item.plan_id)),
            support_plans=tuple(sorted(support_plans, key=lambda item: item.plan_id)),
            relief_plans=tuple(sorted(relief_plans, key=lambda item: item.plan_id)),
            validation=validation,
            reasons=(
                _finding(
                    reason_code,
                    IssueSeverity.INFO
                    if validation.status is MoldComponentPlanningStatus.READY
                    else IssueSeverity.WARNING,
                    "Integrated semantic mold-component planning result.",
                    metadata={"status": validation.status.value},
                ),
            ),
        )


DEFAULT_CORE_CAVITY_PLANNER = EvidenceCoreCavityPlanner()
DEFAULT_INSERT_PLANNER = EvidenceInsertPlanner()
DEFAULT_SUPPORT_PLANNER = EvidenceSupportPlanner()
DEFAULT_RELIEF_PLANNER = EvidenceReliefPlanner()
DEFAULT_MOLD_COMPONENT_PLAN_VALIDATOR = ConservativeMoldComponentPlanValidator()
DEFAULT_MOLD_COMPONENT_PLANNING_INTEGRATOR = DefaultMoldComponentPlanningIntegrator()


def _unsupported_component_capability(context: MoldGenerationContext) -> str | None:
    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is None:
        return None
    if (
        decision.outcome
        is CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
    ):
        return "Special core strategy component planning is not supported yet."
    if (
        decision.outcome
        is CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED
    ):
        return "Multi-direction component planning is not supported yet."
    return None


def _special_regions_from_context(
    context: MoldGenerationContext,
) -> tuple[MoldSpecialRegionPlan, ...]:
    regions: list[MoldSpecialRegionPlan] = []
    seen: set[str] = set()

    def add(region: MoldSpecialRegionPlan) -> None:
        if region.region_id in seen:
            return
        seen.add(region.region_id)
        regions.append(region)

    decision = context.cavity_analysis_report.cavity_analysis_decision
    if decision is not None:
        for target_id in decision.linear_candidate_target_ids:
            add(
                _region(
                    target_id,
                    MoldSpecialRegionKind.CORE_TARGET,
                    f"cavity_analysis_decision:{target_id}",
                    (target_id,),
                    (
                        MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                    ),
                    (
                        "cavity_analysis_decision",
                        "preliminary_core_strategy",
                    ),
                    requires_manual_review=False,
                )
            )
        for target_id in (
            *decision.manual_review_target_ids,
            *decision.multi_direction_target_ids,
        ):
            add(
                _region(
                    target_id,
                    MoldSpecialRegionKind.MANUAL_REVIEW,
                    f"cavity_analysis_decision:{target_id}",
                    (target_id,),
                    (
                        MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                    ),
                    ("cavity_analysis_decision",),
                    requires_manual_review=True,
                )
            )

    strategy = context.cavity_analysis_report.preliminary_core_strategy
    if strategy is not None:
        for assessment in strategy.assessments:
            if (
                assessment.strategy_outcome
                is CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
            ):
                add(
                    _region(
                        assessment.target_id,
                        MoldSpecialRegionKind.CORE_TARGET,
                        f"preliminary_core_strategy:{assessment.target_id}",
                        (assessment.target_id,),
                        (
                            MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                        ),
                        ("preliminary_core_strategy",),
                        requires_manual_review=False,
                    )
                )
            elif assessment.strategy_outcome in {
                CavityCoreStrategyOutcome.MANUAL_REVIEW_REQUIRED,
                CavityCoreStrategyOutcome.AMBIGUOUS,
                CavityCoreStrategyOutcome.NOT_ASSESSABLE,
            }:
                add(
                    _region(
                        assessment.target_id,
                        MoldSpecialRegionKind.MANUAL_REVIEW,
                        f"preliminary_core_strategy:{assessment.target_id}",
                        (assessment.target_id,),
                        (
                            MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                        ),
                        ("preliminary_core_strategy",),
                        requires_manual_review=True,
                    )
                )

    internal_undercuts = context.cavity_analysis_report.internal_undercut_analysis
    if (
        internal_undercuts is not None
        and internal_undercuts.outcome
        is InternalUndercutAnalysisOutcome.OBSTRUCTIONS_DETECTED
    ):
        for obstruction in internal_undercuts.obstruction_regions:
            add(
                _region(
                    obstruction.region_id,
                    MoldSpecialRegionKind.INTERNAL_UNDERCUT,
                    f"internal_undercut_analysis:{obstruction.region_id}",
                    (obstruction.target_id,),
                    (
                        MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                        MoldGenerationFindingCode.INSERT_PLAN_CREATED,
                    ),
                    ("internal_undercut_analysis",),
                    requires_manual_review=(
                        obstruction.classification.value == "ambiguous"
                    ),
                )
            )

    trapping = context.cavity_analysis_report.core_trapping_risk
    if trapping is not None:
        for assessment in trapping.assessments:
            if assessment.risk_outcome in {
                CoreTrappingRiskOutcome.POTENTIAL_RISK,
                CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK,
            }:
                add(
                    _region(
                        assessment.target_id,
                        MoldSpecialRegionKind.TRAPPING_RISK,
                        f"core_trapping_risk:{assessment.target_id}",
                        (assessment.target_id,),
                        (
                            MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                            MoldGenerationFindingCode.INSERT_PLAN_CREATED,
                        ),
                        ("core_trapping_risk",),
                        requires_manual_review=(
                            assessment.risk_outcome
                            is CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK
                        ),
                    )
                )

    risk = context.detailed_mold_analysis_report.undercut_risk_assessment
    if risk is not None:
        for assessment in risk.region_assessments:
            if assessment.treatment_requirement in {
                UndercutTreatmentRequirement.CORE_OR_INSERT_LIKELY_REQUIRED,
                UndercutTreatmentRequirement.SIDE_ACTION_LIKELY_REQUIRED,
            } or assessment.severity in {
                UndercutRiskSeverity.HIGH,
                UndercutRiskSeverity.CRITICAL,
            }:
                add(
                    _region(
                        assessment.region_id,
                        MoldSpecialRegionKind.HIGH_UNDERCUT_RISK,
                        f"undercut_risk_assessment:{assessment.region_id}",
                        (assessment.region_id,),
                        (
                            MoldGenerationFindingCode.CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4,
                        ),
                        ("undercut_risk_assessment",),
                        requires_manual_review=assessment.requires_manual_review,
                    )
                )

    return tuple(sorted(regions, key=lambda item: item.region_id))


def _region(
    source_id: str,
    kind: MoldSpecialRegionKind,
    source_reference: str,
    target_ids: tuple[str, ...],
    reason_codes: tuple[MoldGenerationFindingCode, ...],
    provenance: tuple[str, ...],
    *,
    requires_manual_review: bool,
) -> MoldSpecialRegionPlan:
    return MoldSpecialRegionPlan(
        region_id=f"region-{kind.value}-{_stable_suffix(source_id)}",
        kind=kind,
        source_reference=source_reference,
        related_target_ids=tuple(sorted({target_id for target_id in target_ids})),
        reason_codes=reason_codes,
        provenance=provenance,
        requires_manual_review=requires_manual_review,
    )


def _insert_purpose_for_region(
    kind: MoldSpecialRegionKind,
) -> InsertPlanPurpose | None:
    if kind is MoldSpecialRegionKind.CORE_TARGET:
        return InsertPlanPurpose.INTERNAL_CAVITY_ACCESS
    if kind is MoldSpecialRegionKind.INTERNAL_UNDERCUT:
        return InsertPlanPurpose.INTERNAL_UNDERCUT_ACCESS
    if kind is MoldSpecialRegionKind.TRAPPING_RISK:
        return InsertPlanPurpose.TRAPPING_RISK_REVIEW
    return None


def _validate_unique_ids(
    core_cavity_plan: PreliminaryCoreCavityPlan,
    insert_plans: tuple[InsertPlan, ...],
    support_plans: tuple[SupportPlan, ...],
    relief_plans: tuple[ReliefPlan, ...],
    findings: list[MoldGenerationFinding],
) -> None:
    ids = [core_cavity_plan.plan_id]
    ids.extend(region.region_id for region in core_cavity_plan.special_regions)
    ids.extend(plan.plan_id for plan in insert_plans)
    ids.extend(plan.plan_id for plan in support_plans)
    ids.extend(plan.plan_id for plan in relief_plans)
    duplicated = tuple(sorted({item for item in ids if ids.count(item) > 1}))
    for duplicate_id in duplicated:
        findings.append(
            _finding(
                MoldGenerationFindingCode.COMPONENT_PLAN_DUPLICATE_ID,
                IssueSeverity.ERROR,
                "Component planning produced a duplicate identifier.",
                is_blocking=True,
                metadata={"plan_id": duplicate_id},
            )
        )


def _validate_core_cavity_plan(
    core_cavity_plan: PreliminaryCoreCavityPlan,
    accepted_surface: PreliminaryPartingSurface | None,
    findings: list[MoldGenerationFinding],
) -> None:
    if core_cavity_plan.selected_strategy_id is None:
        findings.append(
            _finding(
                MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_REFERENCE,
                IssueSeverity.ERROR,
                "Core/cavity plan is missing a selected strategy reference.",
                is_blocking=True,
            )
        )

    patch_ids = (
        set()
        if accepted_surface is None
        else {patch.patch_id for patch in accepted_surface.patches}
    )
    for patch_id in core_cavity_plan.accepted_parting_surface_patch_ids:
        if patch_id not in patch_ids:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_REFERENCE,
                    IssueSeverity.ERROR,
                    "Core/cavity plan references a missing parting surface patch.",
                    is_blocking=True,
                    metadata={"patch_id": patch_id},
                )
            )

    sides = {side.side: side for side in core_cavity_plan.sides}
    if set(sides) != {MoldComponentSide.CORE, MoldComponentSide.CAVITY}:
        findings.append(
            _finding(
                MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_REFERENCE,
                IssueSeverity.ERROR,
                "Core/cavity plan must contain exactly core and cavity sides.",
                is_blocking=True,
            )
        )
        return

    for side in core_cavity_plan.sides:
        if not _vector_is_finite_unitish(side.opening_direction):
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLAN_NON_FINITE_VALUE,
                    IssueSeverity.ERROR,
                    "Core/cavity side opening direction is not finite or usable.",
                    is_blocking=True,
                    metadata={"side": side.side.value},
                )
            )
        if not side.reason_codes or not side.provenance:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_EVIDENCE,
                    IssueSeverity.ERROR,
                    "Core/cavity side is missing evidence or reason codes.",
                    is_blocking=True,
                    metadata={"side": side.side.value},
                )
            )

    if (
        _vector_is_finite_unitish(sides[MoldComponentSide.CORE].opening_direction)
        and _vector_is_finite_unitish(sides[MoldComponentSide.CAVITY].opening_direction)
        and sides[MoldComponentSide.CORE].opening_direction.dot(
            sides[MoldComponentSide.CAVITY].opening_direction
        )
        > -0.99
    ):
        findings.append(
            _finding(
                MoldGenerationFindingCode.COMPONENT_PLAN_NON_FINITE_VALUE,
                IssueSeverity.ERROR,
                "Core and cavity opening directions are not opposing.",
                is_blocking=True,
            )
        )


def _validate_component_plans(
    kind: MoldComponentPlanKind,
    plans: tuple[InsertPlan, ...] | tuple[SupportPlan, ...] | tuple[ReliefPlan, ...],
    region_ids: set[str],
    findings: list[MoldGenerationFinding],
) -> None:
    expected_order = tuple(sorted(plans, key=lambda item: item.plan_id))
    if plans != expected_order:
        findings.append(
            _finding(
                MoldGenerationFindingCode.COMPONENT_PLAN_DUPLICATE_ID,
                IssueSeverity.ERROR,
                "Component plans are not in deterministic identifier order.",
                is_blocking=True,
                metadata={"kind": kind.value},
            )
        )

    for plan in plans:
        if not plan.related_region_ids or not plan.reason_codes or not plan.provenance:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_EVIDENCE,
                    IssueSeverity.ERROR,
                    "Component plan is missing required evidence links.",
                    is_blocking=True,
                    metadata={"plan_id": plan.plan_id, "kind": kind.value},
                )
            )
        for region_id in plan.related_region_ids:
            if region_id not in region_ids:
                findings.append(
                    _finding(
                        MoldGenerationFindingCode.COMPONENT_PLAN_MISSING_REFERENCE,
                        IssueSeverity.ERROR,
                        "Component plan references a missing special region.",
                        is_blocking=True,
                        metadata={"plan_id": plan.plan_id, "region_id": region_id},
                    )
                )
        if not isfinite(plan.confidence) or not 0.0 <= plan.confidence <= 1.0:
            findings.append(
                _finding(
                    MoldGenerationFindingCode.COMPONENT_PLAN_NON_FINITE_VALUE,
                    IssueSeverity.ERROR,
                    "Component plan confidence must be finite and normalized.",
                    is_blocking=True,
                    metadata={"plan_id": plan.plan_id},
                )
            )


def _core_cavity_without_sides(
    status: MoldComponentPlanningStatus,
    code: MoldGenerationFindingCode,
    message: str,
    severity: IssueSeverity,
    *,
    is_blocking: bool = False,
) -> PreliminaryCoreCavityPlan:
    return PreliminaryCoreCavityPlan(
        status=status,
        plan_id="core-cavity-plan-0001",
        selected_strategy_id=None,
        accepted_parting_surface_patch_ids=(),
        sides=(),
        reasons=(
            _finding(
                code,
                severity,
                message,
                is_blocking=is_blocking,
            ),
        ),
    )


def _validation_result(
    status: MoldComponentPlanningStatus,
    findings: list[MoldGenerationFinding],
    *,
    manual_review_required: bool = False,
    direct_progression_blocked: bool = False,
) -> MoldComponentPlanValidationResult:
    return MoldComponentPlanValidationResult(
        status=status,
        findings=tuple({finding: None for finding in findings}.keys()),
        manual_review_required=manual_review_required,
        direct_progression_blocked=direct_progression_blocked,
    )


def _vector_is_finite_unitish(vector: Vector3D) -> bool:
    if not vector.is_finite():
        return False
    magnitude = vector.magnitude()
    return isfinite(magnitude) and magnitude > 0.0


def _stable_suffix(value: str) -> str:
    return (
        value.lower()
        .replace(":", "-")
        .replace("_", "-")
        .replace(" ", "-")
        .replace("/", "-")
        .replace("\\", "-")
    )


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
