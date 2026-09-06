from __future__ import annotations

from typing import Protocol

from mold_generator_engine.models.mold_generation import (
    FinalMoldGenerationDecision,
    GlobalMoldGenerationValidationResult,
    InitialPartingSurfacePlan,
    InsertPlan,
    MoldBlockPlan,
    MoldComponentPlanningResult,
    MoldComponentPlanValidationResult,
    MoldEnvelopePlan,
    MoldGenerationContext,
    PartingStrategyCandidate,
    PartingStrategyEvaluation,
    PartingSurfaceRefinementResult,
    PartingSurfaceValidationResult,
    PreliminaryCoreCavityPlan,
    PreliminaryMoldGenerationPlan,
    PreliminaryPartingStrategySelection,
    PreliminaryPartingSurface,
    ReliefPlan,
    SupportPlan,
)


class MoldGenerationPlanner(Protocol):
    """Contract for converting Chapter 2-4 reports into a preliminary plan."""

    def plan(
        self,
        context: MoldGenerationContext,
    ) -> PreliminaryMoldGenerationPlan:
        """Plan mold generation without running geometry or upstream services."""


class PartingStrategyCandidateGenerator(Protocol):
    """Contract for deterministic Chapter 5 strategy candidate generation."""

    def generate(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
    ) -> tuple[PartingStrategyCandidate, ...]:
        """Generate preliminary parting strategy candidates from stable evidence."""


class PartingStrategyEvaluator(Protocol):
    """Contract for deterministic evaluation of parting strategy candidates."""

    def evaluate(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        candidates: tuple[PartingStrategyCandidate, ...],
    ) -> tuple[PartingStrategyEvaluation, ...]:
        """Score candidates and emit reasons, warnings, and blocking signals."""


class PreliminaryPartingStrategySelector(Protocol):
    """Contract for selecting one preliminary strategy when evidence is safe."""

    def select(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        evaluations: tuple[PartingStrategyEvaluation, ...],
    ) -> PreliminaryPartingStrategySelection:
        """Select the best preliminary strategy or return a review/block result."""


class InitialPartingSurfacePlanner(Protocol):
    """Contract for initial parting surface planning from a selected strategy."""

    def plan(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        selection: PreliminaryPartingStrategySelection,
    ) -> InitialPartingSurfacePlan:
        """Create a structured preliminary parting surface plan, not geometry."""


class PreliminaryPartingSurfaceGenerator(Protocol):
    """Contract for generating preliminary bounded parting surface geometry."""

    def generate(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
    ) -> PreliminaryPartingSurface:
        """Generate preliminary surface patches from a validated plan."""


class PartingSurfaceValidator(Protocol):
    """Contract for validating preliminary parting surface geometry."""

    def validate(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
        surface: PreliminaryPartingSurface | None,
    ) -> PartingSurfaceValidationResult:
        """Validate a generated or refined surface without CAD claims."""


class InitialPartingSurfaceRefiner(Protocol):
    """Contract for safe initial parting surface refinement."""

    def refine(
        self,
        context: MoldGenerationContext,
        surface_plan: InitialPartingSurfacePlan,
        surface: PreliminaryPartingSurface | None,
        validation: PartingSurfaceValidationResult,
    ) -> PartingSurfaceRefinementResult:
        """Apply deterministic safe refinements or return an explicit reason."""


class CoreCavityPlanner(Protocol):
    """Contract for semantic preliminary core/cavity planning."""

    def plan(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        strategy_selection: PreliminaryPartingStrategySelection,
        surface_plan: InitialPartingSurfacePlan,
        accepted_surface: PreliminaryPartingSurface | None,
    ) -> PreliminaryCoreCavityPlan:
        """Plan logical core and cavity sides without creating mold halves."""


class InsertPlanner(Protocol):
    """Contract for conservative semantic insert planning."""

    def plan(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
    ) -> tuple[InsertPlan, ...]:
        """Return insert plans only when upstream evidence supports them."""


class SupportPlanner(Protocol):
    """Contract for conservative semantic support planning."""

    def plan(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
    ) -> tuple[SupportPlan, ...]:
        """Return support plans only when upstream evidence supports them."""


class ReliefPlanner(Protocol):
    """Contract for conservative semantic relief and clearance planning."""

    def plan(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
    ) -> tuple[ReliefPlan, ...]:
        """Return relief plans only when upstream evidence supports them."""


class MoldComponentPlanValidator(Protocol):
    """Contract for validating semantic mold-component plans."""

    def validate(
        self,
        context: MoldGenerationContext,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
        support_plans: tuple[SupportPlan, ...],
        relief_plans: tuple[ReliefPlan, ...],
        accepted_surface: PreliminaryPartingSurface | None,
    ) -> MoldComponentPlanValidationResult:
        """Validate references, identifiers, finite values, and stage decisions."""


class MoldComponentPlanningIntegrator(Protocol):
    """Contract for integrating component-planning decisions."""

    def integrate(
        self,
        core_cavity_plan: PreliminaryCoreCavityPlan,
        insert_plans: tuple[InsertPlan, ...],
        support_plans: tuple[SupportPlan, ...],
        relief_plans: tuple[ReliefPlan, ...],
        validation: MoldComponentPlanValidationResult,
    ) -> MoldComponentPlanningResult:
        """Combine component plans and validation into one report section."""


class MoldEnvelopePlanner(Protocol):
    """Contract for preliminary mold-envelope planning."""

    def plan(
        self,
        context: MoldGenerationContext,
        preliminary_plan: PreliminaryMoldGenerationPlan,
        accepted_surface: PreliminaryPartingSurface | None,
        component_planning: MoldComponentPlanningResult,
    ) -> MoldEnvelopePlan | None:
        """Return a bounded envelope plan only when prerequisites are safe."""


class MoldBlockPlanner(Protocol):
    """Contract for preliminary mold-block planning."""

    def plan(
        self,
        context: MoldGenerationContext,
        envelope_plan: MoldEnvelopePlan | None,
        accepted_surface: PreliminaryPartingSurface | None,
        component_planning: MoldComponentPlanningResult,
    ) -> MoldBlockPlan | None:
        """Return a preliminary block plan linked to the envelope and surface."""


class GlobalMoldGenerationValidator(Protocol):
    """Contract for global Chapter 5 consistency validation."""

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
        """Validate integrated Chapter 5 outputs without mutating upstream results."""


class FinalMoldGenerationDecisionMaker(Protocol):
    """Contract for resolving the final Chapter 5 decision."""

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
