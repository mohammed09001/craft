from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.mold_generation import (
    MoldGenerationContext,
    MoldGenerationDisposition,
    MoldGenerationReport,
)
from mold_generator_engine.pipeline.mold_generation.component_planning import (
    DEFAULT_CORE_CAVITY_PLANNER,
    DEFAULT_INSERT_PLANNER,
    DEFAULT_MOLD_COMPONENT_PLAN_VALIDATOR,
    DEFAULT_MOLD_COMPONENT_PLANNING_INTEGRATOR,
    DEFAULT_RELIEF_PLANNER,
    DEFAULT_SUPPORT_PLANNER,
)
from mold_generator_engine.pipeline.mold_generation.contracts import (
    CoreCavityPlanner,
    FinalMoldGenerationDecisionMaker,
    GlobalMoldGenerationValidator,
    InitialPartingSurfacePlanner,
    InitialPartingSurfaceRefiner,
    InsertPlanner,
    MoldBlockPlanner,
    MoldComponentPlanningIntegrator,
    MoldComponentPlanValidator,
    MoldEnvelopePlanner,
    MoldGenerationPlanner,
    PartingStrategyCandidateGenerator,
    PartingStrategyEvaluator,
    PartingSurfaceValidator,
    PreliminaryPartingStrategySelector,
    PreliminaryPartingSurfaceGenerator,
    ReliefPlanner,
    SupportPlanner,
)
from mold_generator_engine.pipeline.mold_generation.finalization import (
    DEFAULT_FINAL_MOLD_GENERATION_DECISION_MAKER,
    DEFAULT_GLOBAL_MOLD_GENERATION_VALIDATOR,
    DEFAULT_MOLD_BLOCK_PLANNER,
    DEFAULT_MOLD_ENVELOPE_PLANNER,
)
from mold_generator_engine.pipeline.mold_generation.parting_strategy import (
    DEFAULT_PARTING_STRATEGY_CANDIDATE_GENERATOR,
    DEFAULT_PARTING_STRATEGY_EVALUATOR,
    DEFAULT_PRELIMINARY_PARTING_STRATEGY_SELECTOR,
)
from mold_generator_engine.pipeline.mold_generation.parting_surface import (
    DEFAULT_INITIAL_PARTING_SURFACE_PLANNER,
    DEFAULT_INITIAL_PARTING_SURFACE_REFINER,
    DEFAULT_PARTING_SURFACE_VALIDATOR,
    DEFAULT_PRELIMINARY_PARTING_SURFACE_GENERATOR,
    select_accepted_parting_surface,
)
from mold_generator_engine.pipeline.mold_generation.planning import (
    DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER,
)


@dataclass(frozen=True, slots=True)
class MoldGenerationService:
    """Coordinate preliminary mold generation planning from existing reports."""

    planner: MoldGenerationPlanner = DEFAULT_CONSERVATIVE_MOLD_GENERATION_PLANNER
    parting_strategy_candidate_generator: PartingStrategyCandidateGenerator = (
        DEFAULT_PARTING_STRATEGY_CANDIDATE_GENERATOR
    )
    parting_strategy_evaluator: PartingStrategyEvaluator = (
        DEFAULT_PARTING_STRATEGY_EVALUATOR
    )
    preliminary_parting_strategy_selector: PreliminaryPartingStrategySelector = (
        DEFAULT_PRELIMINARY_PARTING_STRATEGY_SELECTOR
    )
    initial_parting_surface_planner: InitialPartingSurfacePlanner = (
        DEFAULT_INITIAL_PARTING_SURFACE_PLANNER
    )
    preliminary_parting_surface_generator: PreliminaryPartingSurfaceGenerator = (
        DEFAULT_PRELIMINARY_PARTING_SURFACE_GENERATOR
    )
    parting_surface_validator: PartingSurfaceValidator = (
        DEFAULT_PARTING_SURFACE_VALIDATOR
    )
    initial_parting_surface_refiner: InitialPartingSurfaceRefiner = (
        DEFAULT_INITIAL_PARTING_SURFACE_REFINER
    )
    core_cavity_planner: CoreCavityPlanner = DEFAULT_CORE_CAVITY_PLANNER
    insert_planner: InsertPlanner = DEFAULT_INSERT_PLANNER
    support_planner: SupportPlanner = DEFAULT_SUPPORT_PLANNER
    relief_planner: ReliefPlanner = DEFAULT_RELIEF_PLANNER
    mold_component_plan_validator: MoldComponentPlanValidator = (
        DEFAULT_MOLD_COMPONENT_PLAN_VALIDATOR
    )
    mold_component_planning_integrator: MoldComponentPlanningIntegrator = (
        DEFAULT_MOLD_COMPONENT_PLANNING_INTEGRATOR
    )
    mold_envelope_planner: MoldEnvelopePlanner = DEFAULT_MOLD_ENVELOPE_PLANNER
    mold_block_planner: MoldBlockPlanner = DEFAULT_MOLD_BLOCK_PLANNER
    global_mold_generation_validator: GlobalMoldGenerationValidator = (
        DEFAULT_GLOBAL_MOLD_GENERATION_VALIDATOR
    )
    final_mold_generation_decision_maker: FinalMoldGenerationDecisionMaker = (
        DEFAULT_FINAL_MOLD_GENERATION_DECISION_MAKER
    )

    def generate(
        self,
        context: MoldGenerationContext,
    ) -> MoldGenerationReport:
        """Generate a standalone Chapter 5 report without geometry operations."""
        preliminary_plan = self.planner.plan(context)
        candidates = self.parting_strategy_candidate_generator.generate(
            context,
            preliminary_plan,
        )
        evaluations = self.parting_strategy_evaluator.evaluate(
            context,
            preliminary_plan,
            candidates,
        )
        selection = self.preliminary_parting_strategy_selector.select(
            context,
            preliminary_plan,
            evaluations,
        )
        surface_plan = self.initial_parting_surface_planner.plan(
            context,
            preliminary_plan,
            selection,
        )
        generated_surface = self.preliminary_parting_surface_generator.generate(
            context,
            surface_plan,
        )
        surface_validation = self.parting_surface_validator.validate(
            context,
            surface_plan,
            generated_surface,
        )
        surface_refinement = self.initial_parting_surface_refiner.refine(
            context,
            surface_plan,
            generated_surface,
            surface_validation,
        )
        refined_validation = None
        if (
            surface_refinement.revalidation_required
            and surface_refinement.refined_surface is not None
        ):
            refined_validation = self.parting_surface_validator.validate(
                context,
                surface_plan,
                surface_refinement.refined_surface,
            )

        accepted_surface, accepted_reason = select_accepted_parting_surface(
            generated_surface,
            surface_validation,
            surface_refinement,
            refined_validation,
        )
        core_cavity_plan = self.core_cavity_planner.plan(
            context,
            preliminary_plan,
            selection,
            surface_plan,
            accepted_surface,
        )
        insert_plans = self.insert_planner.plan(context, core_cavity_plan)
        support_plans = self.support_planner.plan(
            context,
            core_cavity_plan,
            insert_plans,
        )
        relief_plans = self.relief_planner.plan(
            context,
            core_cavity_plan,
            insert_plans,
        )
        component_validation = self.mold_component_plan_validator.validate(
            context,
            core_cavity_plan,
            insert_plans,
            support_plans,
            relief_plans,
            accepted_surface,
        )
        component_planning = self.mold_component_planning_integrator.integrate(
            core_cavity_plan,
            insert_plans,
            support_plans,
            relief_plans,
            component_validation,
        )
        envelope_plan = self.mold_envelope_planner.plan(
            context,
            preliminary_plan,
            accepted_surface,
            component_planning,
        )
        block_plan = self.mold_block_planner.plan(
            context,
            envelope_plan,
            accepted_surface,
            component_planning,
        )
        global_validation = self.global_mold_generation_validator.validate(
            context,
            preliminary_plan,
            selection,
            surface_plan,
            accepted_surface,
            component_planning,
            envelope_plan,
            block_plan,
        )
        final_decision = self.final_mold_generation_decision_maker.decide(
            context,
            preliminary_plan,
            component_planning,
            envelope_plan,
            block_plan,
            global_validation,
        )

        return MoldGenerationReport(
            status=preliminary_plan.disposition,
            source=context.source,
            summary=_summary_for_disposition(preliminary_plan.disposition),
            chapter_2_status=context.import_report.status,
            chapter_3_status=context.detailed_mold_analysis_report.status,
            chapter_4_status=context.cavity_analysis_report.status,
            preliminary_plan=preliminary_plan,
            parting_strategy_candidates=candidates,
            parting_strategy_evaluations=evaluations,
            preliminary_parting_strategy_selection=selection,
            initial_parting_surface_plan=surface_plan,
            generated_parting_surface=generated_surface,
            parting_surface_validation=surface_validation,
            parting_surface_refinement=surface_refinement,
            refined_parting_surface_validation=refined_validation,
            accepted_parting_surface=accepted_surface,
            accepted_parting_surface_reason=accepted_reason,
            component_planning=component_planning,
            mold_envelope_plan=envelope_plan,
            mold_block_plan=block_plan,
            global_validation=global_validation,
            final_decision=final_decision,
        )


def _summary_for_disposition(disposition: MoldGenerationDisposition) -> str:
    if disposition is MoldGenerationDisposition.BLOCKED:
        return "Preliminary mold generation is blocked by upstream report evidence."

    if disposition is MoldGenerationDisposition.MANUAL_REVIEW_REQUIRED:
        return "Preliminary mold generation requires manual engineering review."

    return "Preliminary mold generation may advance to parting strategy."
