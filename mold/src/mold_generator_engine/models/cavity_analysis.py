from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from pathlib import Path
from typing import cast

from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    MoldabilityActionIndication,
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

CAVITY_ANALYSIS_REPORT_SCHEMA_VERSION = "1.0"


class CavityAssessmentOutcome(Enum):
    """Engineering meaning of the current cavity-analysis result."""

    NO_STRUCTURED_CAVITY_EVIDENCE = "no_structured_cavity_evidence"
    CORE_OR_INSERT_REVIEW_INDICATED = "core_or_insert_review_indicated"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    NOT_YET_GEOMETRICALLY_ASSESSED = "not_yet_geometrically_assessed"


class CavityConnectivityClassification(Enum):
    """Conservative connectivity classification for one detected internal shell."""

    ENCLOSED = "enclosed"
    EXTERIOR_CONNECTED = "exterior_connected"
    MESH_BOUNDARY_OPEN = "mesh_boundary_open"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class CavityCandidateDetectionOutcome(Enum):
    """High-level result produced by the geometric cavity candidate detector."""

    CANDIDATES_DETECTED = "candidates_detected"
    NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD = "no_candidate_detected_by_current_method"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class CavityFindingSource(Enum):
    """Structured source category for one cavity-analysis finding."""

    IMPORT_ANALYSIS = "import_analysis"
    DETAILED_MOLD_ANALYSIS = "detailed_mold_analysis"
    PRELIMINARY_MOLDABILITY_ASSESSMENT = "preliminary_moldability_assessment"
    CAVITY_EVIDENCE_ASSESSOR = "cavity_evidence_assessor"
    CAVITY_CANDIDATE_DETECTOR = "cavity_candidate_detector"
    CAVITY_OPENING_DETECTOR = "cavity_opening_detector"
    CAVITY_CLASSIFIER = "cavity_classifier"
    INTERNAL_ACCESSIBILITY_ANALYZER = "internal_accessibility_analyzer"
    INTERNAL_ACCESS_DIRECTION_GENERATOR = "internal_access_direction_generator"
    INTERNAL_UNDERCUT_ANALYZER = "internal_undercut_analyzer"
    CORE_TRAPPING_RISK_ANALYZER = "core_trapping_risk_analyzer"
    CORE_STRATEGY_SYNTHESIZER = "core_strategy_synthesizer"
    CAVITY_ANALYSIS_DECISION_MAKER = "cavity_analysis_decision_maker"


class CavityFindingCode(Enum):
    """Stable reason codes emitted by the cavity-analysis engine."""

    CHAPTER_3_REPORT_NOT_AVAILABLE = "chapter_3_report_not_available"
    CHAPTER_3_PRELIMINARY_ASSESSMENT_UNAVAILABLE = (
        "chapter_3_preliminary_assessment_unavailable"
    )
    CHAPTER_3_NOT_ASSESSABLE = "chapter_3_not_assessable"
    UPSTREAM_MANUAL_REVIEW_REQUIRED = "upstream_manual_review_required"
    UPSTREAM_CORE_OR_INSERT_INDICATED = "upstream_core_or_insert_indicated"
    NO_STRUCTURED_CAVITY_EVIDENCE = "no_structured_cavity_evidence"
    INVALID_CAVITY_DETECTION_INPUT = "invalid_cavity_detection_input"
    NESTED_CLOSED_SHELL_CANDIDATE_DETECTED = "nested_closed_shell_candidate_detected"
    NESTED_OPEN_SHELL_DETECTED = "nested_open_shell_detected"
    MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION = (
        "mesh_boundary_prevents_reliable_connectivity_classification"
    )
    NON_MANIFOLD_SHELL_NOT_ASSESSABLE = "non_manifold_shell_not_assessable"
    AMBIGUOUS_SHELL_CONTAINMENT = "ambiguous_shell_containment"
    DISCONNECTED_SOLID_COMPONENTS_ARE_NOT_TREATED_AS_CAVITIES = (
        "disconnected_solid_components_are_not_treated_as_cavities"
    )
    NO_CANDIDATE_DETECTED_BY_CURRENT_SHELL_TOPOLOGY_METHOD = (
        "no_candidate_detected_by_current_shell_topology_method"
    )
    INTERNAL_SHELL_PARITY_INDICATES_SOLID_ISLAND = (
        "internal_shell_parity_indicates_solid_island"
    )
    EXTERIOR_CONNECTED_CAVITY_CLASS_NOT_ASSESSED_BY_CURRENT_METHOD = (
        "exterior_connected_cavity_class_not_assessed_by_current_method"
    )
    INTERNAL_SURFACE_REGION_CANDIDATE_DETECTED = (
        "internal_surface_region_candidate_detected"
    )
    CAVITY_OPENING_LINE_OF_SIGHT_WITNESS_DETECTED = (
        "cavity_opening_line_of_sight_witness_detected"
    )
    NO_INTERNAL_SURFACE_REGION_DETECTED_BY_CURRENT_METHOD = (
        "no_internal_surface_region_detected_by_current_method"
    )
    NO_OPENING_WITNESS_DETECTED_BY_CURRENT_METHOD = (
        "no_opening_witness_detected_by_current_method"
    )
    OPENING_WITNESS_IS_NOT_MANUFACTURING_OPENING_PROOF = (
        "opening_witness_is_not_manufacturing_opening_proof"
    )
    LINE_OF_SIGHT_IS_NOT_CORE_INSERTION_PATH_PROOF = (
        "line_of_sight_is_not_core_insertion_path_proof"
    )
    CAVITY_CLASSIFIED_FROM_CONSERVATIVE_EVIDENCE = (
        "cavity_classified_from_conservative_evidence"
    )
    INTERNAL_ACCESSIBILITY_ASSESSED_FROM_LINE_OF_SIGHT = (
        "internal_accessibility_assessed_from_line_of_sight"
    )
    INTERNAL_ACCESSIBILITY_NOT_CORE_FEASIBILITY_PROOF = (
        "internal_accessibility_not_core_feasibility_proof"
    )
    INTERNAL_ACCESS_DIRECTIONS_GENERATED_FROM_OPENING_EVIDENCE = (
        "internal_access_directions_generated_from_opening_evidence"
    )
    INTERNAL_ACCESS_DIRECTION_IS_NOT_CORE_PULL_DIRECTION = (
        "internal_access_direction_is_not_core_pull_direction"
    )
    CHAPTER_3_PULL_DIRECTION_USED_AS_LOW_PRIORITY_HINT = (
        "chapter_3_pull_direction_used_as_low_priority_hint"
    )
    NO_SUPPORTED_INTERNAL_ACCESS_DIRECTION = "no_supported_internal_access_direction"
    INTERNAL_DIRECTIONAL_OBSTRUCTION_ASSESSED = (
        "internal_directional_obstruction_assessed"
    )
    INTERNAL_DIRECTIONAL_OBSTRUCTION_DETECTED = (
        "internal_directional_obstruction_detected"
    )
    INTERNAL_UNDERCUT_ANALYSIS_NOT_CLEARANCE_PROOF = (
        "internal_undercut_analysis_not_clearance_proof"
    )
    LOW_OBSERVED_TRAPPING_RISK_IS_NOT_CORE_FEASIBILITY_PROOF = (
        "low_observed_trapping_risk_is_not_core_feasibility_proof"
    )
    CORE_TRAPPING_RISK_ASSESSED_FROM_PRELIMINARY_EVIDENCE = (
        "core_trapping_risk_assessed_from_preliminary_evidence"
    )
    ENCLOSED_CAVITY_HAS_HIGH_STRUCTURAL_TRAPPING_RISK = (
        "enclosed_cavity_has_high_structural_trapping_risk"
    )
    NO_SUPPORTED_OPENING = "no_supported_opening"
    MULTIPLE_INDEPENDENT_DIRECTIONS = "multiple_independent_directions"
    HIGH_STRUCTURAL_TRAPPING_RISK = "high_structural_trapping_risk"
    CURRENT_METHOD_BLOCKED = "current_method_blocked"
    UPSTREAM_RESULT_MISSING = "upstream_result_missing"
    UPSTREAM_RESULT_CONFLICT = "upstream_result_conflict"
    TOPOLOGY_UNRELIABLE = "topology_unreliable"
    NUMERICAL_AMBIGUITY = "numerical_ambiguity"
    MESH_BOUNDARY_DEFECT_EXCLUDED = "mesh_boundary_defect_excluded"
    STATIC_ANALYSIS_ONLY = "static_analysis_only"
    CLEARANCE_NOT_EVALUATED = "clearance_not_evaluated"
    MOTION_NOT_EVALUATED = "motion_not_evaluated"


class InternalSurfaceRegionOutcome(Enum):
    """Conservative status for one detected internal-surface region."""

    CANDIDATE = "candidate"
    STRUCTURAL_ENCLOSED = "structural_enclosed"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class CavityOpeningDetectionOutcome(Enum):
    """High-level result for line-of-sight opening witness detection."""

    OPENING_CANDIDATES_DETECTED = "opening_candidates_detected"
    NO_OPENING_CANDIDATE_DETECTED_BY_CURRENT_METHOD = (
        "no_opening_candidate_detected_by_current_method"
    )
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"
    BLOCKED = "blocked"


class CavityOpeningCandidateOutcome(Enum):
    """Meaning of one grouped exterior-to-internal line-of-sight witness set."""

    LINE_OF_SIGHT_WITNESS = "line_of_sight_witness"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class CavityType(Enum):
    """Conservative cavity feature classification used by Chapter 4."""

    NESTED_SHELL_VOID = "nested_shell_void"
    EXTERIOR_CONNECTED_POCKET_CANDIDATE = "exterior_connected_pocket_candidate"
    THROUGH_CHANNEL_CANDIDATE = "through_channel_candidate"
    MULTI_OPENING_REGION_CANDIDATE = "multi_opening_region_candidate"
    MESH_BOUNDARY_DEFECT = "mesh_boundary_defect"
    AMBIGUOUS_INTERNAL_REGION = "ambiguous_internal_region"
    NOT_ASSESSABLE = "not_assessable"


class CavityClassificationOutcome(Enum):
    """Certainty level for one conservative cavity classification."""

    CLASSIFIED = "classified"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class InternalAccessibilityOutcome(Enum):
    """Line-of-sight accessibility result, not a core feasibility result."""

    ACCESSIBLE = "accessible"
    PARTIALLY_ACCESSIBLE = "partially_accessible"
    ENCLOSED = "enclosed"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class InternalAccessDirectionSource(Enum):
    """Evidence source used to derive an internal access direction candidate."""

    OPENING_WITNESS = "opening_witness"
    OPENING_REPRESENTATIVE = "opening_representative"
    CHAPTER_3_PULL_DIRECTION_HINT = "chapter_3_pull_direction_hint"


class InternalAccessDirectionGenerationOutcome(Enum):
    """High-level result for candidate internal access direction generation."""

    DIRECTIONS_GENERATED = "directions_generated"
    NO_SUPPORTED_DIRECTION = "no_supported_direction"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class InternalDirectionEvaluationOutcome(Enum):
    """Directional line-of-sight obstruction result for one target and direction."""

    CLEAR = "clear"
    PARTIALLY_OBSTRUCTED = "partially_obstructed"
    OBSTRUCTED = "obstructed"
    AMBIGUOUS = "ambiguous"
    ENCLOSED = "enclosed"
    NOT_ASSESSABLE = "not_assessable"


class InternalObstructionRegionClassification(Enum):
    """Conservative classification for a connected directional obstruction region."""

    DIRECTIONAL_OBSTRUCTION = "directional_obstruction"
    AMBIGUOUS = "ambiguous"


class InternalUndercutAnalysisOutcome(Enum):
    """Aggregate outcome for directional internal obstruction analysis."""

    CLEAR_BY_CURRENT_DIRECTIONAL_TEST = "clear_by_current_directional_test"
    OBSTRUCTIONS_DETECTED = "obstructions_detected"
    AMBIGUOUS = "ambiguous"
    ENCLOSED = "enclosed"
    NOT_ASSESSABLE = "not_assessable"


class CoreTrappingRiskOutcome(Enum):
    """Preliminary structural risk outcome; not a final core feasibility result."""

    LOW_OBSERVED_RISK = "low_observed_risk"
    POTENTIAL_RISK = "potential_risk"
    HIGH_STRUCTURAL_RISK = "high_structural_risk"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"


class CavityCoreStrategyOutcome(Enum):
    """Preliminary strategy meaning for one cavity target."""

    PRELIMINARY_LINEAR_CORE_CANDIDATE = "preliminary_linear_core_candidate"
    MULTI_DIRECTION_ACCESS_REQUIRED = "multi_direction_access_required"
    SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED = (
        "special_core_strategy_investigation_required"
    )
    BLOCKED_BY_CURRENT_METHOD = "blocked_by_current_method"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    AMBIGUOUS = "ambiguous"
    NOT_ASSESSABLE = "not_assessable"
    NOT_APPLICABLE = "not_applicable"


class CavityAnalysisDecisionOutcome(Enum):
    """Final Chapter 4 decision over all cavity strategy assessments."""

    NOT_ASSESSABLE = "not_assessable"
    CURRENT_METHOD_BLOCKED = "current_method_blocked"
    SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED = (
        "special_core_strategy_investigation_required"
    )
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    MULTI_DIRECTION_ACCESS_REQUIRED = "multi_direction_access_required"
    PRELIMINARY_LINEAR_CORE_CANDIDATE = "preliminary_linear_core_candidate"
    NO_CAVITY_REQUIRING_CORE_STRATEGY = "no_cavity_requiring_core_strategy"
    NO_APPLICABLE_INTERNAL_CAVITY = "no_applicable_internal_cavity"


@dataclass(frozen=True, slots=True)
class CavityAnalysisBlocker:
    """Typed reason that prevented cavity analysis from proceeding."""

    code: str
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class CavityFinding:
    """Structured evidence or limitation carried by cavity analysis."""

    code: CavityFindingCode
    source: CavityFindingSource
    severity: IssueSeverity
    message: str
    is_blocking: bool = False
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class CavityAnalysisContext:
    """Bind Chapter 2 and Chapter 3 reports to the original imported model."""

    import_report: ImportAnalysisReport
    detailed_mold_analysis_report: DetailedMoldAnalysisReport
    model: ImportedModel

    @classmethod
    def from_reports(
        cls,
        import_report: ImportAnalysisReport,
        detailed_mold_analysis_report: DetailedMoldAnalysisReport,
        model: ImportedModel,
    ) -> CavityAnalysisContext:
        """Create context without copying geometry or duplicating upstream data."""
        if import_report.source.source_name != model.source_name:
            raise ValueError("Cavity analysis context requires matching source names.")

        if Path(import_report.source.source_path) != model.source_path:
            raise ValueError("Cavity analysis context requires matching source paths.")

        if (
            import_report.source.file_format is not None
            and import_report.source.file_format != model.file_format.value
        ):
            raise ValueError(
                "Cavity analysis context requires matching source formats."
            )

        if detailed_mold_analysis_report.source != import_report.source:
            raise ValueError(
                "Cavity analysis context requires matching Chapter 2 and Chapter 3 sources."
            )

        if detailed_mold_analysis_report.chapter_2_status is not import_report.status:
            raise ValueError(
                "Cavity analysis context requires matching Chapter 2 statuses."
            )

        if (
            detailed_mold_analysis_report.processing_decision is not None
            and import_report.processing_decision is not None
            and detailed_mold_analysis_report.processing_decision
            != import_report.processing_decision
        ):
            raise ValueError(
                "Cavity analysis context requires matching processing decisions."
            )

        return cls(
            import_report=import_report,
            detailed_mold_analysis_report=detailed_mold_analysis_report,
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
class CavityEvidenceAssessment:
    """Structured assessment returned by the injected evidence assessor."""

    outcome: CavityAssessmentOutcome
    summary: str
    findings: tuple[CavityFinding, ...] = ()
    upstream_preliminary_moldability_status: MoldabilityStatus | None = None
    upstream_core_or_insert_indication: MoldabilityActionIndication | None = None


@dataclass(frozen=True, slots=True)
class InternalCavityCandidate:
    """Structured internal-shell candidate emitted by geometric cavity detection."""

    candidate_id: str
    component_index: int
    connectivity_classification: CavityConnectivityClassification
    parent_component_index: int | None = None
    nesting_depth: int | None = None
    is_potential_void_boundary: bool = False
    minimum_face_index: int = 0
    source_face_indices: tuple[int, ...] = ()
    boundary_edge_count: int = 0
    non_manifold_edge_count: int = 0
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityCandidateDetectionResult:
    """Independent result returned by the injected geometric candidate detector."""

    status: DetailedMoldAnalysisStatus
    outcome: CavityCandidateDetectionOutcome
    summary: str
    candidates: tuple[InternalCavityCandidate, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalSurfaceRegion:
    """Candidate internal surface region from finite deterministic sampling.

    Region evidence is conservative and incomplete. It records bounded line-of-sight
    and occlusion facts only; it does not prove manufacturability or core insertion.
    """

    region_id: str
    source_candidate_id: str | None = None
    face_indices: tuple[int, ...] = ()
    assessed_sample_count: int = 0
    visible_sample_count: int = 0
    blocked_sample_count: int = 0
    ambiguous_sample_count: int = 0
    evidence: tuple[str, ...] = ()
    outcome: InternalSurfaceRegionOutcome = InternalSurfaceRegionOutcome.CANDIDATE
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityOpeningCandidate:
    """Grouped line-of-sight witnesses from outside toward an internal region.

    An opening candidate is not a confirmed manufacturing opening and does not imply
    insertion clearance or collision-free core motion.
    """

    opening_id: str
    region_id: str
    source_candidate_id: str | None = None
    witness_count: int = 0
    representative_direction: tuple[float, float, float] = (0.0, 0.0, 0.0)
    witness_directions: tuple[tuple[float, float, float], ...] = ()
    support_face_indices: tuple[int, ...] = ()
    outcome: CavityOpeningCandidateOutcome = (
        CavityOpeningCandidateOutcome.LINE_OF_SIGHT_WITNESS
    )
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityOpeningDetectionResult:
    """Independent Chapter 4 result for internal regions and opening witnesses."""

    status: DetailedMoldAnalysisStatus
    outcome: CavityOpeningDetectionOutcome
    summary: str
    regions: tuple[InternalSurfaceRegion, ...] = ()
    openings: tuple[CavityOpeningCandidate, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityTypeClassification:
    """Conservative classification for one cavity candidate or internal region."""

    target_id: str
    cavity_type: CavityType
    outcome: CavityClassificationOutcome
    opening_ids: tuple[str, ...] = ()
    evidence_codes: tuple[str, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityClassificationResult:
    """Independent Chapter 4 result for cavity feature classification."""

    status: DetailedMoldAnalysisStatus
    summary: str
    classifications: tuple[CavityTypeClassification, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalAccessibilityAssessment:
    """Line-of-sight accessibility facts for one target.

    The result does not prove core feasibility, clearance, swept volume, trapping, or
    absence of internal undercuts.
    """

    target_id: str
    outcome: InternalAccessibilityOutcome
    opening_ids: tuple[str, ...] = ()
    assessed_sample_count: int = 0
    accessible_sample_count: int = 0
    blocked_sample_count: int = 0
    ambiguous_sample_count: int = 0
    direction_evidence: tuple[tuple[float, float, float], ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalAccessibilityAnalysisResult:
    """Independent result for preliminary internal line-of-sight accessibility."""

    status: DetailedMoldAnalysisStatus
    summary: str
    assessments: tuple[InternalAccessibilityAssessment, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalAccessDirectionCandidate:
    """Normalized candidate direction from an internal target toward expected exit.

    This is not a selected core pull direction and does not imply insertion clearance
    or collision-free motion.
    """

    direction_id: str
    target_id: str
    direction: tuple[float, float, float]
    source: InternalAccessDirectionSource
    supporting_opening_ids: tuple[str, ...] = ()
    witness_count: int = 0
    finding_codes: tuple[CavityFindingCode, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalAccessDirectionGenerationResult:
    """Independent result for ordered internal access direction candidates."""

    status: DetailedMoldAnalysisStatus
    outcome: InternalAccessDirectionGenerationOutcome
    summary: str
    directions: tuple[InternalAccessDirectionCandidate, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalDirectionEvaluation:
    """Directional obstruction evidence for one target and access direction."""

    target_id: str
    direction_id: str
    assessed_face_count: int = 0
    assessed_sample_count: int = 0
    clear_face_indices: tuple[int, ...] = ()
    obstructed_region_ids: tuple[str, ...] = ()
    ambiguous_face_indices: tuple[int, ...] = ()
    outcome: InternalDirectionEvaluationOutcome = (
        InternalDirectionEvaluationOutcome.NOT_ASSESSABLE
    )
    finding_codes: tuple[CavityFindingCode, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalObstructionRegion:
    """Connected faces obstructed for a specific internal access direction."""

    region_id: str
    target_id: str
    direction_id: str
    face_indices: tuple[int, ...]
    assessed_sample_count: int = 0
    obstructed_sample_count: int = 0
    ambiguous_sample_count: int = 0
    classification: InternalObstructionRegionClassification = (
        InternalObstructionRegionClassification.DIRECTIONAL_OBSTRUCTION
    )
    finding_codes: tuple[CavityFindingCode, ...] = ()


@dataclass(frozen=True, slots=True)
class InternalUndercutAnalysisResult:
    """Independent result for directional internal obstruction evidence."""

    status: DetailedMoldAnalysisStatus
    outcome: InternalUndercutAnalysisOutcome
    summary: str
    evaluations: tuple[InternalDirectionEvaluation, ...] = ()
    obstruction_regions: tuple[InternalObstructionRegion, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CoreTrappingRiskAssessment:
    """Preliminary core trapping risk for one cavity target."""

    target_id: str
    assessed_direction_ids: tuple[str, ...] = ()
    best_supported_direction_id: str | None = None
    uncovered_face_indices: tuple[int, ...] = ()
    conflicting_direction_ids: tuple[str, ...] = ()
    risk_outcome: CoreTrappingRiskOutcome = CoreTrappingRiskOutcome.NOT_ASSESSABLE
    finding_codes: tuple[CavityFindingCode, ...] = ()


@dataclass(frozen=True, slots=True)
class CoreTrappingRiskAnalysisResult:
    """Independent result for preliminary core trapping risk assessment."""

    status: DetailedMoldAnalysisStatus
    summary: str
    assessments: tuple[CoreTrappingRiskAssessment, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityCoreStrategyAssessment:
    """Preliminary core-strategy assessment for one cavity target.

    This assessment summarizes existing Chapter 4 evidence only. It does not
    select a core mechanism, prove clearance, validate motion, or prove final
    moldability.
    """

    target_id: str
    supporting_opening_ids: tuple[str, ...] = ()
    candidate_access_direction_ids: tuple[str, ...] = ()
    best_supported_direction_id: str | None = None
    required_direction_count: int = 0
    internal_accessibility_outcome: InternalAccessibilityOutcome | None = None
    internal_undercut_outcome: InternalDirectionEvaluationOutcome | None = None
    core_trapping_risk_outcome: CoreTrappingRiskOutcome | None = None
    strategy_outcome: CavityCoreStrategyOutcome = (
        CavityCoreStrategyOutcome.NOT_ASSESSABLE
    )
    blocking_finding_codes: tuple[CavityFindingCode, ...] = ()
    manual_review_finding_codes: tuple[CavityFindingCode, ...] = ()
    limitations: tuple[CavityFindingCode, ...] = ()


@dataclass(frozen=True, slots=True)
class PreliminaryCoreStrategyAssessment:
    """Aggregate preliminary core-strategy result for Chapter 4 targets."""

    status: DetailedMoldAnalysisStatus
    summary: str
    assessments: tuple[CavityCoreStrategyAssessment, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityAnalysisDecision:
    """Final Chapter 4 decision derived from strategy assessments."""

    status: DetailedMoldAnalysisStatus
    outcome: CavityAnalysisDecisionOutcome
    summary: str
    applicable_target_ids: tuple[str, ...] = ()
    blocking_target_ids: tuple[str, ...] = ()
    manual_review_target_ids: tuple[str, ...] = ()
    multi_direction_target_ids: tuple[str, ...] = ()
    linear_candidate_target_ids: tuple[str, ...] = ()
    finding_codes: tuple[CavityFindingCode, ...] = ()
    limitations: tuple[CavityFindingCode, ...] = ()
    findings: tuple[CavityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class CavityAnalysisReport:
    """Independent Chapter 4 report for internal-cavity evidence assessment."""

    status: DetailedMoldAnalysisStatus
    source: ImportAnalysisSource
    summary: str
    chapter_2_status: ImportAnalysisReportStatus
    chapter_3_status: DetailedMoldAnalysisStatus
    assessment_outcome: CavityAssessmentOutcome
    processing_decision: ModelProcessingDecision | None = None
    blockers: tuple[CavityAnalysisBlocker, ...] = ()
    findings: tuple[CavityFinding, ...] = ()
    candidate_detection: CavityCandidateDetectionResult | None = None
    opening_detection: CavityOpeningDetectionResult | None = None
    cavity_classification: CavityClassificationResult | None = None
    internal_accessibility: InternalAccessibilityAnalysisResult | None = None
    internal_access_directions: InternalAccessDirectionGenerationResult | None = None
    internal_undercut_analysis: InternalUndercutAnalysisResult | None = None
    core_trapping_risk: CoreTrappingRiskAnalysisResult | None = None
    preliminary_core_strategy: PreliminaryCoreStrategyAssessment | None = None
    cavity_analysis_decision: CavityAnalysisDecision | None = None
    upstream_preliminary_moldability_status: MoldabilityStatus | None = None
    upstream_core_or_insert_indication: MoldabilityActionIndication | None = None
    schema_version: str = CAVITY_ANALYSIS_REPORT_SCHEMA_VERSION

    def to_dict(self) -> dict[str, object]:
        """Return a serialization-safe representation of the cavity report."""
        return cast(dict[str, object], _serialize_value(self))


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
