from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from pathlib import Path
from typing import cast

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisDecisionOutcome,
    CavityAnalysisReport,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    MoldabilityStatus,
)
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReport,
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
)
from mold_generator_engine.models.imported_model import ImportedModel
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingDecision,
)

MOLD_GENERATION_REPORT_SCHEMA_VERSION = "1.0"


class MoldGenerationDisposition(Enum):
    """High-level Chapter 5 hand-off disposition."""

    READY_FOR_PARTING_STRATEGY = "ready_for_parting_strategy"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"


class PreliminaryMoldGenerationMode(Enum):
    """Non-geometric preliminary generation mode."""

    SIMPLE_TWO_PART_CANDIDATE = "simple_two_part_candidate"
    CORE_ASSISTED_CANDIDATE = "core_assisted_candidate"
    UNSUPPORTED_CANDIDATE = "unsupported_candidate"


class MoldGenerationNextCapability(Enum):
    """Next engine capability needed after the preliminary plan."""

    PARTING_STRATEGY = "parting_strategy"
    CORE_FEASIBILITY_VERIFICATION = "core_feasibility_verification"
    MANUAL_ENGINEERING_REVIEW = "manual_engineering_review"
    UPSTREAM_REMEDIATION = "upstream_remediation"
    PARTING_SURFACE_REFINEMENT = "parting_surface_refinement"


class MoldGenerationFindingSource(Enum):
    """Structured source category for one Chapter 5 finding."""

    IMPORT_ANALYSIS = "import_analysis"
    DETAILED_MOLD_ANALYSIS = "detailed_mold_analysis"
    CAVITY_ANALYSIS = "cavity_analysis"
    MOLD_GENERATION_PLANNER = "mold_generation_planner"


class MoldGenerationFindingCode(Enum):
    """Stable reason codes emitted by the preliminary generation planner."""

    CHAPTER_2_PROCESSING_DECISION_MISSING = "chapter_2_processing_decision_missing"
    CHAPTER_2_BLOCKS_PROCESSING = "chapter_2_blocks_processing"
    CHAPTER_2_STATUS_NOT_READY = "chapter_2_status_not_ready"
    CHAPTER_3_STATUS_BLOCKS_GENERATION = "chapter_3_status_blocks_generation"
    CHAPTER_3_MOLDABILITY_BLOCKS_GENERATION = "chapter_3_moldability_blocks_generation"
    CHAPTER_3_MANUAL_REVIEW_REQUIRED = "chapter_3_manual_review_required"
    CHAPTER_3_MOLDABILITY_NOT_ASSESSABLE = "chapter_3_moldability_not_assessable"
    CHAPTER_3_MOLDABILITY_EVIDENCE_MISSING = "chapter_3_moldability_evidence_missing"
    CHAPTER_3_SIMPLE_MOLD_EVIDENCE_PRESENT = "chapter_3_simple_mold_evidence_present"
    CHAPTER_4_STATUS_BLOCKS_GENERATION = "chapter_4_status_blocks_generation"
    CHAPTER_4_DECISION_BLOCKS_GENERATION = "chapter_4_decision_blocks_generation"
    CHAPTER_4_MANUAL_REVIEW_REQUIRED = "chapter_4_manual_review_required"
    CHAPTER_4_SPECIAL_STRATEGY_REQUIRED = "chapter_4_special_strategy_required"
    CHAPTER_4_MULTI_DIRECTION_REQUIRED = "chapter_4_multi_direction_required"
    CHAPTER_4_DECISION_NOT_ASSESSABLE = "chapter_4_decision_not_assessable"
    CHAPTER_4_CAVITY_DECISION_MISSING = "chapter_4_cavity_decision_missing"
    CHAPTER_4_PRELIMINARY_LINEAR_CORE_CANDIDATE = (
        "chapter_4_preliminary_linear_core_candidate"
    )
    CHAPTER_4_NO_CORE_STRATEGY_REQUIRED = "chapter_4_no_core_strategy_required"
    PRELIMINARY_CORE_STRATEGY_IS_NOT_FEASIBILITY_PROOF = (
        "preliminary_core_strategy_is_not_feasibility_proof"
    )
    PRELIMINARY_PLAN_READY_FOR_PARTING_STRATEGY = (
        "preliminary_plan_ready_for_parting_strategy"
    )
    REPORT_CONFLICT_REQUIRES_REVIEW = "report_conflict_requires_review"
    PARTING_PULL_DIRECTION_SELECTED = "parting_pull_direction_selected"
    PARTING_PULL_DIRECTION_MISSING = "parting_pull_direction_missing"
    PARTING_PULL_DIRECTION_AMBIGUOUS = "parting_pull_direction_ambiguous"
    PARTING_SIMPLE_TWO_PART_CANDIDATE_GENERATED = (
        "parting_simple_two_part_candidate_generated"
    )
    PARTING_CORE_ASSISTED_CANDIDATE_GENERATED = (
        "parting_core_assisted_candidate_generated"
    )
    PARTING_STRATEGY_ACCEPTABLE = "parting_strategy_acceptable"
    PARTING_STRATEGY_REQUIRES_MANUAL_REVIEW = "parting_strategy_requires_manual_review"
    PARTING_STRATEGY_BLOCKED = "parting_strategy_blocked"
    PARTING_STRATEGY_AMBIGUOUS = "parting_strategy_ambiguous"
    PARTING_SURFACE_PLAN_CREATED = "parting_surface_plan_created"
    PARTING_SURFACE_PLAN_REQUIRES_MANUAL_REVIEW = (
        "parting_surface_plan_requires_manual_review"
    )
    PARTING_SURFACE_PLAN_BLOCKED = "parting_surface_plan_blocked"
    PARTING_SURFACE_GENERATED = "parting_surface_generated"
    PARTING_SURFACE_GENERATION_BLOCKED = "parting_surface_generation_blocked"
    PARTING_SURFACE_UNSUPPORTED = "parting_surface_unsupported"
    PARTING_SURFACE_INVALID_GEOMETRY = "parting_surface_invalid_geometry"
    PARTING_SURFACE_VALIDATED = "parting_surface_validated"
    PARTING_SURFACE_REFINEMENT_RECOMMENDED = "parting_surface_refinement_recommended"
    PARTING_SURFACE_REFINEMENT_NOT_NEEDED = "parting_surface_refinement_not_needed"
    PARTING_SURFACE_REFINED = "parting_surface_refined"
    PARTING_SURFACE_REFINEMENT_NOT_SAFE = "parting_surface_refinement_not_safe"
    PARTING_SURFACE_ACCEPTED = "parting_surface_accepted"
    PARTING_SURFACE_ACCEPTANCE_BLOCKED = "parting_surface_acceptance_blocked"
    CORE_CAVITY_PLAN_CREATED = "core_cavity_plan_created"
    CORE_CAVITY_PLAN_BLOCKED = "core_cavity_plan_blocked"
    CORE_CAVITY_PLAN_REQUIRES_MANUAL_REVIEW = "core_cavity_plan_requires_manual_review"
    CORE_CAVITY_SIDE_ASSIGNED = "core_cavity_side_assigned"
    CORE_CAVITY_SPECIAL_REGION_FROM_CHAPTER_4 = (
        "core_cavity_special_region_from_chapter_4"
    )
    COMPONENT_PLANNING_READY = "component_planning_ready"
    COMPONENT_PLANNING_REQUIRES_MANUAL_REVIEW = (
        "component_planning_requires_manual_review"
    )
    COMPONENT_PLANNING_BLOCKED = "component_planning_blocked"
    COMPONENT_PLANNING_UNSUPPORTED = "component_planning_unsupported"
    COMPONENT_PLANNING_UPSTREAM_BLOCKED = "component_planning_upstream_blocked"
    COMPONENT_PLANNING_ACCEPTED_SURFACE_MISSING = (
        "component_planning_accepted_surface_missing"
    )
    COMPONENT_PLAN_VALIDATED = "component_plan_validated"
    COMPONENT_PLAN_DUPLICATE_ID = "component_plan_duplicate_id"
    COMPONENT_PLAN_MISSING_REFERENCE = "component_plan_missing_reference"
    COMPONENT_PLAN_NON_FINITE_VALUE = "component_plan_non_finite_value"
    COMPONENT_PLAN_MISSING_EVIDENCE = "component_plan_missing_evidence"
    INSERT_PLAN_CREATED = "insert_plan_created"
    INSERT_PLAN_NOT_INDICATED = "insert_plan_not_indicated"
    SUPPORT_PLAN_CREATED = "support_plan_created"
    SUPPORT_PLAN_NOT_INDICATED = "support_plan_not_indicated"
    RELIEF_PLAN_CREATED = "relief_plan_created"
    RELIEF_PLAN_NOT_INDICATED = "relief_plan_not_indicated"
    MOLD_ENVELOPE_PLAN_CREATED = "mold_envelope_plan_created"
    MOLD_ENVELOPE_PLAN_BLOCKED = "mold_envelope_plan_blocked"
    MOLD_ENVELOPE_PLAN_REQUIRES_MANUAL_REVIEW = (
        "mold_envelope_plan_requires_manual_review"
    )
    MOLD_ENVELOPE_PLAN_UNSUPPORTED = "mold_envelope_plan_unsupported"
    MOLD_ENVELOPE_INVALID_BOUNDS = "mold_envelope_invalid_bounds"
    MOLD_ENVELOPE_NON_FINITE_VALUE = "mold_envelope_non_finite_value"
    MOLD_BLOCK_PLAN_CREATED = "mold_block_plan_created"
    MOLD_BLOCK_PLAN_BLOCKED = "mold_block_plan_blocked"
    MOLD_BLOCK_PLAN_REQUIRES_MANUAL_REVIEW = "mold_block_plan_requires_manual_review"
    MOLD_BLOCK_PLAN_UNSUPPORTED = "mold_block_plan_unsupported"
    MOLD_BLOCK_INVALID_BOUNDS = "mold_block_invalid_bounds"
    GLOBAL_VALIDATION_PASSED = "global_validation_passed"
    GLOBAL_VALIDATION_BLOCKED = "global_validation_blocked"
    GLOBAL_VALIDATION_MANUAL_REVIEW_REQUIRED = (
        "global_validation_manual_review_required"
    )
    GLOBAL_VALIDATION_UNSUPPORTED = "global_validation_unsupported"
    GLOBAL_VALIDATION_MISSING_REFERENCE = "global_validation_missing_reference"
    GLOBAL_VALIDATION_DUPLICATE_ID = "global_validation_duplicate_id"
    GLOBAL_VALIDATION_INCONSISTENT_OPENING_DIRECTION = (
        "global_validation_inconsistent_opening_direction"
    )
    GLOBAL_VALIDATION_INCOMPLETE_PLAN = "global_validation_incomplete_plan"
    FINAL_DECISION_READY = "final_decision_ready"
    FINAL_DECISION_MANUAL_REVIEW = "final_decision_manual_review"
    FINAL_DECISION_BLOCKED = "final_decision_blocked"
    FINAL_DECISION_UNSUPPORTED = "final_decision_unsupported"


class PartingStrategyType(Enum):
    """Preliminary Chapter 5 parting strategy family."""

    SIMPLE_TWO_PART_PLANAR = "simple_two_part_planar"
    CORE_ASSISTED_PLANAR = "core_assisted_planar"


class PartingStrategyEvaluationStatus(Enum):
    """Evaluation outcome for one preliminary parting strategy candidate."""

    ACCEPTABLE = "acceptable"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"


class PreliminaryPartingStrategySelectionStatus(Enum):
    """Outcome of deterministic preliminary parting strategy selection."""

    SELECTED = "selected"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"


class InitialPartingSurfacePlanStatus(Enum):
    """Initial surface planning status for later Chapter 5+ geometry stages."""

    PLANNED = "planned"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"


class InitialPartingSurfaceType(Enum):
    """Structured initial surface type without final mold geometry."""

    PLANAR_MIDPLANE = "planar_midplane"
    CORE_ASSISTED_PLANAR_MIDPLANE = "core_assisted_planar_midplane"
    UNAVAILABLE = "unavailable"


class PreliminaryPartingSurfaceStatus(Enum):
    """Generation status for a preliminary bounded parting surface."""

    GENERATED = "generated"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"
    UNSUPPORTED = "unsupported"


class PartingSurfaceValidationStatus(Enum):
    """Validation outcome for a preliminary parting surface."""

    VALID = "valid"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"


class PartingSurfaceRefinementStatus(Enum):
    """Outcome of safe deterministic parting surface refinement."""

    NOT_NEEDED = "not_needed"
    APPLIED = "applied"
    NOT_APPLIED = "not_applied"
    BLOCKED = "blocked"


class MoldComponentPlanningStatus(Enum):
    """Decision status for semantic core/cavity, insert, support, and relief plans."""

    READY = "ready"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED = "blocked"
    UNSUPPORTED = "unsupported"


class FinalMoldGenerationDecisionStatus(Enum):
    """Final Chapter 5 decision after preliminary global validation."""

    READY = "ready"
    MANUAL_REVIEW = "manual_review"
    BLOCKED = "blocked"
    UNSUPPORTED = "unsupported"


class MoldComponentSide(Enum):
    """Logical side of a preliminary two-part mold plan."""

    CORE = "core"
    CAVITY = "cavity"


class MoldComponentPlanKind(Enum):
    """Kind of semantic mold-component plan emitted by Chapter 5."""

    CORE_CAVITY = "core_cavity"
    INSERT = "insert"
    SUPPORT = "support"
    RELIEF = "relief"


class MoldSpecialRegionKind(Enum):
    """Conservative region category carried into component planning."""

    CORE_TARGET = "core_target"
    INTERNAL_UNDERCUT = "internal_undercut"
    TRAPPING_RISK = "trapping_risk"
    HIGH_UNDERCUT_RISK = "high_undercut_risk"
    MANUAL_REVIEW = "manual_review"


class InsertPlanPurpose(Enum):
    """Preliminary insert purpose without final mechanical design."""

    INTERNAL_CAVITY_ACCESS = "internal_cavity_access"
    INTERNAL_UNDERCUT_ACCESS = "internal_undercut_access"
    TRAPPING_RISK_REVIEW = "trapping_risk_review"


class SupportPlanPurpose(Enum):
    """Preliminary support purpose without structural analysis."""

    INSERT_RELATED_SUPPORT = "insert_related_support"
    CORE_TARGET_SUPPORT = "core_target_support"
    HIGH_RISK_REGION_SUPPORT = "high_risk_region_support"


class ReliefPlanPurpose(Enum):
    """Preliminary relief purpose without boolean or CAD operations."""

    INSERT_CLEARANCE = "insert_clearance"
    CORE_PULL_CLEARANCE = "core_pull_clearance"
    PARTING_TRANSITION_CLEARANCE = "parting_transition_clearance"


@dataclass(frozen=True, slots=True)
class MoldGenerationFinding:
    """Structured Chapter 5 reason or warning."""

    code: MoldGenerationFindingCode
    source: MoldGenerationFindingSource
    severity: IssueSeverity
    message: str
    is_blocking: bool = False
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class MoldGenerationTraceability:
    """Compact links back to Chapter 2-4 report decisions."""

    source_name: str
    chapter_2_status: ImportAnalysisReportStatus
    chapter_3_status: DetailedMoldAnalysisStatus
    chapter_4_status: DetailedMoldAnalysisStatus
    processing_decision_status: str | None = None
    preliminary_moldability_status: MoldabilityStatus | None = None
    cavity_analysis_decision_outcome: CavityAnalysisDecisionOutcome | None = None


@dataclass(frozen=True, slots=True)
class MoldGenerationContext:
    """Bind Chapter 2, Chapter 3, and Chapter 4 reports to the source model."""

    import_report: ImportAnalysisReport
    detailed_mold_analysis_report: DetailedMoldAnalysisReport
    cavity_analysis_report: CavityAnalysisReport
    model: ImportedModel

    @classmethod
    def from_reports(
        cls,
        import_report: ImportAnalysisReport,
        detailed_mold_analysis_report: DetailedMoldAnalysisReport,
        cavity_analysis_report: CavityAnalysisReport,
        model: ImportedModel,
    ) -> MoldGenerationContext:
        """Create context without copying geometry or rerunning upstream analysis."""
        if import_report.source.source_name != model.source_name:
            raise ValueError("Mold generation context requires matching source names.")

        if Path(import_report.source.source_path) != model.source_path:
            raise ValueError("Mold generation context requires matching source paths.")

        if (
            import_report.source.file_format is not None
            and import_report.source.file_format != model.file_format.value
        ):
            raise ValueError(
                "Mold generation context requires matching source formats."
            )

        if detailed_mold_analysis_report.source != import_report.source:
            raise ValueError(
                "Mold generation context requires matching Chapter 2 and "
                "Chapter 3 sources."
            )

        if cavity_analysis_report.source != import_report.source:
            raise ValueError(
                "Mold generation context requires matching Chapter 2 and "
                "Chapter 4 sources."
            )

        if detailed_mold_analysis_report.chapter_2_status is not import_report.status:
            raise ValueError(
                "Mold generation context requires matching Chapter 2 statuses."
            )

        if cavity_analysis_report.chapter_2_status is not import_report.status:
            raise ValueError(
                "Mold generation context requires matching Chapter 2 and "
                "Chapter 4 statuses."
            )

        if (
            cavity_analysis_report.chapter_3_status
            is not detailed_mold_analysis_report.status
        ):
            raise ValueError(
                "Mold generation context requires matching Chapter 3 and "
                "Chapter 4 statuses."
            )

        _validate_processing_decisions_match(
            import_report.processing_decision,
            detailed_mold_analysis_report.processing_decision,
            "Chapter 2 and Chapter 3",
        )
        _validate_processing_decisions_match(
            import_report.processing_decision,
            cavity_analysis_report.processing_decision,
            "Chapter 2 and Chapter 4",
        )

        return cls(
            import_report=import_report,
            detailed_mold_analysis_report=detailed_mold_analysis_report,
            cavity_analysis_report=cavity_analysis_report,
            model=model,
        )

    @property
    def source(self) -> ImportAnalysisSource:
        """Return the canonical Chapter 2 source descriptor."""
        return self.import_report.source

    @property
    def processing_decision(self) -> ModelProcessingDecision | None:
        """Return the Chapter 2 processing decision without recalculation."""
        return self.import_report.processing_decision


@dataclass(frozen=True, slots=True)
class PreliminaryMoldGenerationPlan:
    """Non-geometric preliminary Chapter 5 generation plan."""

    disposition: MoldGenerationDisposition
    generation_mode: PreliminaryMoldGenerationMode
    required_next_capabilities: tuple[MoldGenerationNextCapability, ...]
    reasons: tuple[MoldGenerationFinding, ...]
    warnings: tuple[MoldGenerationFinding, ...] = ()
    traceability: MoldGenerationTraceability | None = None

    def to_dict(self) -> dict[str, object]:
        """Return a serialization-safe representation of the preliminary plan."""
        return cast(dict[str, object], _serialize_value(self))


@dataclass(frozen=True, slots=True)
class PartingStrategyCandidate:
    """One deterministic preliminary parting strategy candidate."""

    candidate_id: str
    order_index: int
    strategy_type: PartingStrategyType
    pull_direction: Vector3D | None
    generation_mode: PreliminaryMoldGenerationMode
    core_target_ids: tuple[str, ...] = ()
    evidence_codes: tuple[MoldGenerationFindingCode, ...] = ()
    reasons: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class PartingStrategyEvaluation:
    """Deterministic score and decision evidence for one strategy candidate."""

    candidate: PartingStrategyCandidate
    status: PartingStrategyEvaluationStatus
    score: float
    confidence: float
    reasons: tuple[MoldGenerationFinding, ...]
    warnings: tuple[MoldGenerationFinding, ...] = ()
    is_blocking: bool = False
    requires_manual_review: bool = False

    @property
    def candidate_id(self) -> str:
        """Return the evaluated candidate identifier."""
        return self.candidate.candidate_id


@dataclass(frozen=True, slots=True)
class PreliminaryPartingStrategySelection:
    """Selected preliminary strategy or clear non-selection result."""

    status: PreliminaryPartingStrategySelectionStatus
    selected_evaluation: PartingStrategyEvaluation | None
    reasons: tuple[MoldGenerationFinding, ...]
    warnings: tuple[MoldGenerationFinding, ...] = ()

    @property
    def selected_candidate(self) -> PartingStrategyCandidate | None:
        """Return the selected strategy candidate when one is safe to advance."""
        if self.selected_evaluation is None:
            return None

        return self.selected_evaluation.candidate


@dataclass(frozen=True, slots=True)
class InitialPartingSurfacePlan:
    """Structured preliminary parting surface plan, not final mold geometry."""

    status: InitialPartingSurfacePlanStatus
    surface_type: InitialPartingSurfaceType
    selected_strategy_id: str | None
    pull_direction: Vector3D | None
    reference: str
    reference_offset_mm: float | None
    construction_steps: tuple[str, ...]
    required_later_validations: tuple[str, ...]
    reasons: tuple[MoldGenerationFinding, ...]
    warnings: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class PreliminaryPartingSurfacePatch:
    """One bounded preliminary parting-surface patch."""

    patch_id: str
    origin: Vector3D
    normal: Vector3D
    basis_u: Vector3D
    basis_v: Vector3D
    boundary_points: tuple[Vector3D, ...]
    extent_u_mm: float
    extent_v_mm: float
    source_strategy_id: str | None
    source_plan_reference: str


@dataclass(frozen=True, slots=True)
class PreliminaryPartingSurface:
    """Generated preliminary parting surface geometry, not final CAD."""

    status: PreliminaryPartingSurfaceStatus
    patches: tuple[PreliminaryPartingSurfacePatch, ...]
    source_plan_status: InitialPartingSurfacePlanStatus | None
    source_strategy_id: str | None
    reasons: tuple[MoldGenerationFinding, ...]
    warnings: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class PartingSurfaceValidationMetrics:
    """Deterministic validation metrics for preliminary surface checks."""

    patch_count: int
    total_area_sq_mm: float
    minimum_edge_length_mm: float | None
    maximum_planarity_deviation_mm: float
    covers_model_projection: bool


@dataclass(frozen=True, slots=True)
class PartingSurfaceValidationResult:
    """Validation result for generated or refined preliminary parting surfaces."""

    status: PartingSurfaceValidationStatus
    findings: tuple[MoldGenerationFinding, ...]
    metrics: PartingSurfaceValidationMetrics | None = None
    refinement_recommended: bool = False
    manual_review_required: bool = False
    direct_progression_blocked: bool = False


@dataclass(frozen=True, slots=True)
class PartingSurfaceRefinementResult:
    """Result of initial safe refinement for a preliminary parting surface."""

    status: PartingSurfaceRefinementStatus
    refinement_applied: bool
    actions: tuple[str, ...]
    reasons: tuple[MoldGenerationFinding, ...]
    refined_surface: PreliminaryPartingSurface | None = None
    unresolved_findings: tuple[MoldGenerationFinding, ...] = ()
    revalidation_required: bool = False


@dataclass(frozen=True, slots=True)
class MoldSpecialRegionPlan:
    """Semantic region needing special handling in later mold-component design."""

    region_id: str
    kind: MoldSpecialRegionKind
    source_reference: str
    related_target_ids: tuple[str, ...]
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]
    requires_manual_review: bool = False


@dataclass(frozen=True, slots=True)
class CoreCavitySidePlan:
    """Logical assignment for one preliminary mold side."""

    side: MoldComponentSide
    opening_direction: Vector3D
    selected_strategy_id: str
    accepted_parting_surface_patch_ids: tuple[str, ...]
    role: str
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PreliminaryCoreCavityPlan:
    """Semantic preliminary split between core and cavity sides."""

    status: MoldComponentPlanningStatus
    plan_id: str
    selected_strategy_id: str | None
    accepted_parting_surface_patch_ids: tuple[str, ...]
    sides: tuple[CoreCavitySidePlan, ...]
    special_regions: tuple[MoldSpecialRegionPlan, ...] = ()
    assumptions: tuple[str, ...] = ()
    reasons: tuple[MoldGenerationFinding, ...] = ()
    warnings: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class InsertPlan:
    """Semantic preliminary insert need derived only from upstream evidence."""

    plan_id: str
    status: MoldComponentPlanningStatus
    purpose: InsertPlanPurpose
    source_reference: str
    related_region_ids: tuple[str, ...]
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]
    confidence: float
    requires_manual_review: bool = False


@dataclass(frozen=True, slots=True)
class SupportPlan:
    """Semantic preliminary support need derived only from upstream evidence."""

    plan_id: str
    status: MoldComponentPlanningStatus
    purpose: SupportPlanPurpose
    source_reference: str
    related_region_ids: tuple[str, ...]
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]
    confidence: float
    requires_manual_review: bool = False


@dataclass(frozen=True, slots=True)
class ReliefPlan:
    """Semantic preliminary relief or clearance need."""

    plan_id: str
    status: MoldComponentPlanningStatus
    purpose: ReliefPlanPurpose
    source_reference: str
    related_region_ids: tuple[str, ...]
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]
    confidence: float
    requires_manual_review: bool = False


@dataclass(frozen=True, slots=True)
class MoldComponentPlanValidationResult:
    """Validation result for semantic mold-component plans."""

    status: MoldComponentPlanningStatus
    findings: tuple[MoldGenerationFinding, ...]
    manual_review_required: bool = False
    direct_progression_blocked: bool = False


@dataclass(frozen=True, slots=True)
class MoldComponentPlanningResult:
    """Integrated Chapter 5 component-planning result."""

    status: MoldComponentPlanningStatus
    core_cavity_plan: PreliminaryCoreCavityPlan | None
    insert_plans: tuple[InsertPlan, ...]
    support_plans: tuple[SupportPlan, ...]
    relief_plans: tuple[ReliefPlan, ...]
    validation: MoldComponentPlanValidationResult | None = None
    reasons: tuple[MoldGenerationFinding, ...] = ()
    warnings: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class MoldEnvelopePlan:
    """Preliminary bounded mold-envelope plan, not final mold geometry."""

    status: MoldComponentPlanningStatus
    envelope_id: str
    bounds_min: Vector3D
    bounds_max: Vector3D
    dimensions_mm: Vector3D
    center: Vector3D
    opening_direction: Vector3D
    margin_mm: float
    clearance_mm: float
    source_model_bounds_reference: str
    accepted_parting_surface_patch_ids: tuple[str, ...]
    component_plan_ids: tuple[str, ...]
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]
    reasons: tuple[MoldGenerationFinding, ...] = ()
    warnings: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class MoldBlockPlan:
    """Preliminary bounded mold-block representation for later geometry stages."""

    status: MoldComponentPlanningStatus
    block_id: str
    envelope_id: str
    bounds_min: Vector3D
    bounds_max: Vector3D
    dimensions_mm: Vector3D
    center: Vector3D
    opening_direction: Vector3D
    clearance_mm: float
    representation: str
    parting_surface_patch_ids: tuple[str, ...]
    referenced_plan_ids: tuple[str, ...]
    reason_codes: tuple[MoldGenerationFindingCode, ...]
    provenance: tuple[str, ...]
    reasons: tuple[MoldGenerationFinding, ...] = ()
    warnings: tuple[MoldGenerationFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class GlobalMoldGenerationValidationResult:
    """Global consistency validation result for integrated Chapter 5 outputs."""

    status: MoldComponentPlanningStatus
    findings: tuple[MoldGenerationFinding, ...]
    manual_review_required: bool = False
    direct_progression_blocked: bool = False


@dataclass(frozen=True, slots=True)
class FinalMoldGenerationDecision:
    """Final Chapter 5 hand-off decision for preliminary mold generation."""

    status: FinalMoldGenerationDecisionStatus
    summary: str
    reasons: tuple[MoldGenerationFinding, ...]
    validation_status: MoldComponentPlanningStatus | None = None
    preliminary_disposition: MoldGenerationDisposition | None = None


@dataclass(frozen=True, slots=True)
class MoldGenerationReport:
    """Standalone Chapter 5 report for preliminary mold generation planning."""

    status: MoldGenerationDisposition
    source: ImportAnalysisSource
    summary: str
    chapter_2_status: ImportAnalysisReportStatus
    chapter_3_status: DetailedMoldAnalysisStatus
    chapter_4_status: DetailedMoldAnalysisStatus
    preliminary_plan: PreliminaryMoldGenerationPlan
    parting_strategy_candidates: tuple[PartingStrategyCandidate, ...] = ()
    parting_strategy_evaluations: tuple[PartingStrategyEvaluation, ...] = ()
    preliminary_parting_strategy_selection: (
        PreliminaryPartingStrategySelection | None
    ) = None
    initial_parting_surface_plan: InitialPartingSurfacePlan | None = None
    generated_parting_surface: PreliminaryPartingSurface | None = None
    parting_surface_validation: PartingSurfaceValidationResult | None = None
    parting_surface_refinement: PartingSurfaceRefinementResult | None = None
    refined_parting_surface_validation: PartingSurfaceValidationResult | None = None
    accepted_parting_surface: PreliminaryPartingSurface | None = None
    accepted_parting_surface_reason: MoldGenerationFinding | None = None
    component_planning: MoldComponentPlanningResult | None = None
    mold_envelope_plan: MoldEnvelopePlan | None = None
    mold_block_plan: MoldBlockPlan | None = None
    global_validation: GlobalMoldGenerationValidationResult | None = None
    final_decision: FinalMoldGenerationDecision | None = None
    schema_version: str = MOLD_GENERATION_REPORT_SCHEMA_VERSION

    def to_dict(self) -> dict[str, object]:
        """Return a serialization-safe representation of the report."""
        return cast(dict[str, object], _serialize_value(self))


def _validate_processing_decisions_match(
    expected: ModelProcessingDecision | None,
    actual: ModelProcessingDecision | None,
    label: str,
) -> None:
    if expected is not None and actual is not None and expected != actual:
        raise ValueError(
            f"Mold generation context requires matching {label} processing decisions."
        )


def _serialize_value(value: object) -> object:
    if isinstance(value, Enum):
        return value.value

    if isinstance(value, Path):
        return str(value)

    if is_dataclass(value):
        return {
            data_field.name: _serialize_value(getattr(value, data_field.name))
            for data_field in fields(value)
        }

    if isinstance(value, Mapping):
        return {
            _serialize_mapping_key(key): _serialize_value(mapped_value)
            for key, mapped_value in value.items()
        }

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_serialize_value(item) for item in value]

    return value


def _serialize_mapping_key(value: object) -> str:
    serialized_value = _serialize_value(value)
    if isinstance(serialized_value, str):
        return serialized_value

    return str(serialized_value)
