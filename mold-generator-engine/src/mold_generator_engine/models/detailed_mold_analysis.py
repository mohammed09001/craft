from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from math import isfinite
from pathlib import Path
from typing import cast

from mold_generator_engine.config.geometry import (
    DEFAULT_MINIMUM_RECOMMENDED_DRAFT_DEGREES,
    DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE,
)
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReport,
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
)
from mold_generator_engine.models.imported_model import BoundingBox, ImportedModel
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingDecision,
)

DETAILED_MOLD_ANALYSIS_REPORT_SCHEMA_VERSION = "1.0"


class DetailedMoldAnalysisStatus(Enum):
    """Execution status shared by detailed mold-analysis reports and sections."""

    NOT_RUN = "not_run"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


class FaceDegeneracyReason(Enum):
    """Typed reason explaining why one triangle face could not be analyzed safely."""

    INVALID_VERTEX_INDEX = "invalid_vertex_index"
    NON_FINITE_VERTEX = "non_finite_vertex"
    ZERO_OR_NEAR_ZERO_AREA = "zero_or_near_zero_area"


class PullDirectionSource(Enum):
    """Origin category for one candidate pull direction contribution."""

    GLOBAL_AXIS = "global_axis"
    FACE_NORMAL = "face_normal"


class PullDirectionSideClassification(Enum):
    """Which side of the pull axis one face normal falls on locally."""

    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class PullDirectionEvaluationWarningCode(Enum):
    """Structured diagnostics emitted by candidate pull-direction evaluation."""

    NON_ANALYZABLE_FACES_IGNORED = "non_analyzable_faces_ignored"
    NO_ANALYZABLE_FACE_AREA = "no_analyzable_face_area"


class PreliminaryPullDirectionSelectionStatus(Enum):
    """High-level outcome of preliminary pull-direction selection."""

    SELECTED = "selected"
    AMBIGUOUS = "ambiguous"
    UNAVAILABLE = "unavailable"


class PreliminaryPullDirectionSelectionDecisiveness(Enum):
    """How decisively the current evidence supports the preliminary choice."""

    CLEAR = "clear"
    CLOSE = "close"
    AMBIGUOUS = "ambiguous"


class DraftReleaseSide(Enum):
    """Which signed side of the selected pull axis one face releases toward."""

    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    AMBIGUOUS = "ambiguous"
    UNEVALUABLE = "unevaluable"


class DraftSurfaceType(Enum):
    """Geometric draft classification for one face against the selected pull axis."""

    PULL_FACING = "pull_facing"
    DRAFTED = "drafted"
    NEAR_ZERO_DRAFT = "near_zero_draft"
    AMBIGUOUS = "ambiguous"
    UNEVALUABLE = "unevaluable"


class DraftAdequacy(Enum):
    """Policy outcome for whether one face has enough local draft."""

    SUFFICIENT = "sufficient"
    INSUFFICIENT = "insufficient"
    ZERO_OR_NEAR_ZERO = "zero_or_near_zero"
    NOT_APPLICABLE = "not_applicable"
    AMBIGUOUS = "ambiguous"
    UNEVALUABLE = "unevaluable"


class DraftAnalysisWarningCode(Enum):
    """Structured warning codes emitted by stage-6 draft-angle analysis."""

    NO_SELECTED_PULL_DIRECTION = "no_selected_pull_direction"
    INVALID_SELECTED_PULL_DIRECTION = "invalid_selected_pull_direction"
    AMBIGUOUS_PULL_DIRECTION_SELECTION = "ambiguous_pull_direction_selection"
    NO_ANALYZABLE_FACES = "no_analyzable_faces"
    UNEVALUABLE_FACES_PRESENT = "unevaluable_faces_present"


class UndercutFaceClassification(Enum):
    """Preliminary bidirectional accessibility classification for one face."""

    CLEAR = "clear"
    POTENTIAL_UNDERCUT = "potential_undercut"
    CONFIRMED_UNDERCUT = "confirmed_undercut"
    AMBIGUOUS = "ambiguous"


class UndercutFaceReasonCode(Enum):
    """Typed reasoning emitted while classifying one face."""

    DIRECTIONALLY_ACCESSIBLE = "directionally_accessible"
    PARTIALLY_BLOCKED = "partially_blocked"
    BIDIRECTIONALLY_BLOCKED = "bidirectionally_blocked"
    DEGENERATE_FACE = "degenerate_face"
    INVALID_NORMAL = "invalid_normal"
    NUMERICALLY_AMBIGUOUS = "numerically_ambiguous"
    ENCLOSED_OR_DIRECTIONALLY_BLOCKED = "enclosed_or_directionally_blocked"


class UndercutAnalysisWarningCode(Enum):
    """Structured warning codes for preliminary undercut analysis."""

    NO_SELECTED_PULL_DIRECTION = "no_selected_pull_direction"
    INVALID_SELECTED_PULL_DIRECTION = "invalid_selected_pull_direction"
    AMBIGUOUS_PULL_DIRECTION_SELECTION = "ambiguous_pull_direction_selection"
    NO_ANALYZABLE_FACES = "no_analyzable_faces"
    DEGENERATE_FACES_IGNORED = "degenerate_faces_ignored"
    AMBIGUOUS_FACE_RESULTS_PRESENT = "ambiguous_face_results_present"
    TINY_REGIONS_PRESENT = "tiny_regions_present"


class UndercutRegionAnalysisWarningCode(Enum):
    """Structured warning codes for stage-7 undercut region analysis."""

    NO_PRELIMINARY_UNDERCUT_ANALYSIS = "no_preliminary_undercut_analysis"
    UNEVALUABLE_PRELIMINARY_UNDERCUT_ANALYSIS = (
        "unevaluable_preliminary_undercut_analysis"
    )
    NO_SELECTED_PULL_DIRECTION = "no_selected_pull_direction"
    INVALID_SELECTED_PULL_DIRECTION = "invalid_selected_pull_direction"
    AMBIGUOUS_PULL_DIRECTION_SELECTION = "ambiguous_pull_direction_selection"
    DRAFT_ANALYSIS_UNAVAILABLE = "draft_analysis_unavailable"
    INCOMPLETE_FACE_ASSESSMENTS = "incomplete_face_assessments"
    NON_MANIFOLD_CONNECTIVITY_PRESENT = "non_manifold_connectivity_present"
    OPEN_BOUNDARY_CONNECTIVITY_PRESENT = "open_boundary_connectivity_present"
    AMBIGUOUS_FACE_BRIDGES_PRESENT = "ambiguous_face_bridges_present"


class UndercutRiskAssessmentWarningCode(Enum):
    """Structured warning codes for stage-8/9 undercut risk assessment."""

    NO_UNDERCUT_REGION_ANALYSIS = "no_undercut_region_analysis"
    UNEVALUABLE_UNDERCUT_REGION_ANALYSIS = "unevaluable_undercut_region_analysis"
    NO_SELECTED_PULL_DIRECTION = "no_selected_pull_direction"
    INVALID_SELECTED_PULL_DIRECTION = "invalid_selected_pull_direction"
    AMBIGUOUS_PULL_DIRECTION_SELECTION = "ambiguous_pull_direction_selection"
    NO_CONNECTED_UNDERCUT_REGIONS = "no_connected_undercut_regions"
    DRAFT_ANALYSIS_UNAVAILABLE = "draft_analysis_unavailable"
    AMBIGUOUS_BOUNDARY_EVIDENCE_PRESENT = "ambiguous_boundary_evidence_present"
    TOPOLOGY_RISK_EVIDENCE_PRESENT = "topology_risk_evidence_present"


class UndercutAnalysisOutcome(Enum):
    """High-level aggregate outcome for preliminary undercut analysis."""

    UNEVALUABLE = "unevaluable"
    CLEAR = "clear"
    AMBIGUOUS = "ambiguous"
    POTENTIAL_UNDERCUTS_FOUND = "potential_undercuts_found"
    CONFIRMED_UNDERCUTS_FOUND = "confirmed_undercuts_found"


class UndercutRegionClassification(Enum):
    """Region-level preliminary undercut classification."""

    POTENTIAL_UNDERCUT = "potential_undercut"
    CONFIRMED_UNDERCUT = "confirmed_undercut"


class UndercutRegionSeverity(Enum):
    """Ordered severity used to sort preliminary undercut regions."""

    TINY = "tiny"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class UndercutRiskSeverity(Enum):
    """Stage-8/9 engineering severity assigned to one connected undercut region."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class UndercutRegionComplexity(Enum):
    """Geometric complexity assigned to one connected undercut region."""

    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    HIGHLY_COMPLEX = "highly_complex"


class UndercutTreatmentRequirement(Enum):
    """Preliminary treatment requirement inferred from one assessed region."""

    NO_SPECIAL_ACTION = "no_special_action"
    MINOR_DRAFT_ADJUSTMENT_CANDIDATE = "minor_draft_adjustment_candidate"
    LOCAL_PARTING_REVIEW_REQUIRED = "local_parting_review_required"
    SIDE_ACTION_LIKELY_REQUIRED = "side_action_likely_required"
    CORE_OR_INSERT_LIKELY_REQUIRED = "core_or_insert_likely_required"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKING_UNDERCUT_RISK = "blocking_undercut_risk"


class MoldabilityStatus(Enum):
    """Preliminary moldability status synthesized from Chapter-3 evidence."""

    SIMPLE_MOLD_POSSIBLE = "simple_mold_possible"
    ADDITIONAL_ACTIONS_LIKELY = "additional_actions_likely"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    BLOCKED_FOR_DIRECT_GENERATION = "blocked_for_direct_generation"
    NOT_ASSESSABLE = "not_assessable"


class ManufacturabilityRisk(Enum):
    """Overall manufacturability risk synthesized from available evidence."""

    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class MoldabilityActionIndication(Enum):
    """Likelihood state for an additional mold action requirement."""

    NOT_INDICATED = "not_indicated"
    POSSIBLE = "possible"
    LIKELY = "likely"
    NOT_ASSESSED = "not_assessed"


class MoldabilityEvidenceQuality(Enum):
    """How complete and decisive the current moldability evidence appears."""

    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"
    INSUFFICIENT = "insufficient"


class MoldabilityFindingSource(Enum):
    """Structured source category for one moldability finding."""

    PULL_DIRECTION_SELECTION = "pull_direction_selection"
    UNDERCUT_ANALYSIS = "undercut_analysis"
    DRAFT_ANALYSIS = "draft_analysis"
    UNDERCUT_REGION_ANALYSIS = "undercut_region_analysis"
    UNDERCUT_RISK_ASSESSMENT = "undercut_risk_assessment"
    EVIDENCE_SUMMARY = "evidence_summary"
    DECISION_POLICY = "decision_policy"


class MoldabilityFindingCode(Enum):
    """Stable reason codes emitted by stage-10/11 evidence and decision synthesis."""

    SELECTED_PULL_DIRECTION_UNAVAILABLE = "selected_pull_direction_unavailable"
    SELECTED_PULL_DIRECTION_AMBIGUOUS = "selected_pull_direction_ambiguous"
    SELECTED_PULL_DIRECTION_LOW_CONFIDENCE = (
        "selected_pull_direction_low_confidence"
    )
    UNDERCUT_ANALYSIS_UNAVAILABLE = "undercut_analysis_unavailable"
    UNDERCUT_REGION_ANALYSIS_UNAVAILABLE = "undercut_region_analysis_unavailable"
    UNDERCUT_RISK_ASSESSMENT_UNAVAILABLE = "undercut_risk_assessment_unavailable"
    DRAFT_ANALYSIS_UNAVAILABLE = "draft_analysis_unavailable"
    NO_CONFIRMED_UNDERCUT_REGIONS = "no_confirmed_undercut_regions"
    HIGH_UNDERCUT_RISK_PRESENT = "high_undercut_risk_present"
    CRITICAL_UNDERCUT_RISK_PRESENT = "critical_undercut_risk_present"
    SIDE_ACTION_TREATMENT_INDICATED = "side_action_treatment_indicated"
    CORE_OR_INSERT_TREATMENT_INDICATED = "core_or_insert_treatment_indicated"
    MANUAL_REVIEW_REGION_PRESENT = "manual_review_region_present"
    BLOCKING_UNDERCUT_RISK_PRESENT = "blocking_undercut_risk_present"
    TOPOLOGY_LIMITATIONS_PRESENT = "topology_limitations_present"
    CORE_REQUIREMENT_NOT_ASSESSED = "core_requirement_not_assessed"
    SIMPLE_MOLD_EVIDENCE_PRESENT = "simple_mold_evidence_present"
    ADDITIONAL_ACTIONS_EVIDENT = "additional_actions_evident"
    AUTOMATED_DIRECT_GENERATION_BLOCKED = "automated_direct_generation_blocked"
    MOLDABILITY_MANUAL_REVIEW_REQUIRED = "moldability_manual_review_required"
    MOLDABILITY_NOT_ASSESSABLE = "moldability_not_assessable"


@dataclass(frozen=True, slots=True)
class DetailedMoldAnalysisBlocker:
    """Typed reason that prevented detailed mold analysis from proceeding."""

    code: str
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class DetailedMoldAnalysisContext:
    """Bind the Chapter 2 report to the original imported model geometry."""

    import_report: ImportAnalysisReport
    model: ImportedModel

    @classmethod
    def from_report(
        cls,
        import_report: ImportAnalysisReport,
        model: ImportedModel,
    ) -> DetailedMoldAnalysisContext:
        """Create context without copying geometry or recomputing Chapter 2 data."""
        if import_report.source.source_name != model.source_name:
            raise ValueError(
                "Detailed mold analysis context requires matching source names."
            )

        if Path(import_report.source.source_path) != model.source_path:
            raise ValueError(
                "Detailed mold analysis context requires matching source paths."
            )

        if (
            import_report.source.file_format is not None
            and import_report.source.file_format != model.file_format.value
        ):
            raise ValueError(
                "Detailed mold analysis context requires matching source formats."
            )

        return cls(import_report=import_report, model=model)

    @property
    def source(self) -> ImportAnalysisSource:
        """Return the canonical Chapter 2 source descriptor."""
        return self.import_report.source

    @property
    def processing_decision(self) -> ModelProcessingDecision | None:
        """Return the Chapter 2 processing decision without recalculation."""
        return self.import_report.processing_decision


@dataclass(frozen=True, slots=True)
class FaceGeometry:
    """Basic deterministic geometry facts for one triangle face."""

    face_index: int
    vertex_indices: tuple[int, int, int]
    centroid: Vector3D | None
    raw_normal: Vector3D | None
    unit_normal: Vector3D | None
    area: float
    is_degenerate: bool
    degeneracy_reason: FaceDegeneracyReason | None = None


@dataclass(frozen=True, slots=True)
class FaceGeometryAnalysis:
    """Aggregate face-analysis result aligned with the original model face order."""

    faces: tuple[FaceGeometry, ...]
    total_face_count: int
    valid_face_count: int
    degenerate_face_count: int
    valid_surface_area_sq_mm: float
    degenerate_face_indices: tuple[int, ...] = ()


@dataclass(frozen=True, slots=True)
class PullDirectionSourceReference:
    """Link one candidate direction back to a contributing source."""

    source: PullDirectionSource
    face_index: int | None = None
    is_reversed: bool = False


@dataclass(frozen=True, slots=True)
class PullDirectionCandidate:
    """One deterministic candidate pull direction with merged source metadata."""

    candidate_id: str
    order_index: int
    direction: Vector3D
    source: PullDirectionSource
    source_references: tuple[PullDirectionSourceReference, ...]

    @property
    def face_indices(self) -> tuple[int, ...]:
        """Return contributing face indices in stable order without duplicates."""
        seen_face_indices: set[int] = set()
        ordered_face_indices: list[int] = []

        for reference in self.source_references:
            if (
                reference.face_index is None
                or reference.face_index in seen_face_indices
            ):
                continue

            ordered_face_indices.append(reference.face_index)
            seen_face_indices.add(reference.face_index)

        return tuple(ordered_face_indices)


@dataclass(frozen=True, slots=True)
class PullDirectionCandidates:
    """Deterministic collection of candidate pull directions."""

    candidates: tuple[PullDirectionCandidate, ...]

    @property
    def candidate_count(self) -> int:
        """Return the number of candidate pull directions."""
        return len(self.candidates)


@dataclass(frozen=True, slots=True)
class PullDirectionEvaluationSettings:
    """Engineering thresholds used to evaluate one pull-direction candidate."""

    minimum_recommended_draft_degrees: float = DEFAULT_MINIMUM_RECOMMENDED_DRAFT_DEGREES
    alignment_tolerance: float = DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE

    def __post_init__(self) -> None:
        if not isfinite(self.minimum_recommended_draft_degrees):
            raise ValueError("Minimum recommended draft must be finite.")
        if self.minimum_recommended_draft_degrees <= 0.0:
            raise ValueError("Minimum recommended draft must be greater than zero.")
        if not isfinite(self.alignment_tolerance):
            raise ValueError("Alignment tolerance must be finite.")
        if self.alignment_tolerance < 0.0:
            raise ValueError("Alignment tolerance cannot be negative.")
        if self.alignment_tolerance >= 1.0:
            raise ValueError("Alignment tolerance must be smaller than 1.0.")


@dataclass(frozen=True, slots=True)
class PullDirectionEvaluationWarning:
    """Structured warning explaining reduced confidence in a candidate result."""

    code: PullDirectionEvaluationWarningCode
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class FacePullDirectionEvaluation:
    """Local draft-angle result for one face against one pull direction."""

    face_index: int
    face_area_sq_mm: float
    signed_alignment: float | None
    draft_angle_degrees: float | None
    side_classification: PullDirectionSideClassification | None
    meets_recommended_draft: bool
    is_analyzable: bool


@dataclass(frozen=True, slots=True)
class PullDirectionAggregateMetrics:
    """Area-based engineering metrics aggregated for one candidate direction."""

    analyzed_face_count: int
    ignored_face_count: int
    total_analyzed_area_sq_mm: float
    positive_side_area_sq_mm: float
    negative_side_area_sq_mm: float
    neutral_area_sq_mm: float
    positive_side_area_ratio: float
    negative_side_area_ratio: float
    neutral_area_ratio: float
    low_draft_area_sq_mm: float
    low_draft_area_ratio: float
    area_weighted_mean_draft_angle_degrees: float
    minimum_observed_draft_angle_degrees: float | None
    faces_meeting_recommended_draft_count: int


@dataclass(frozen=True, slots=True)
class CandidatePullDirectionEvaluation:
    """Full engineering evaluation result for one candidate pull direction."""

    candidate: PullDirectionCandidate
    aggregate_metrics: PullDirectionAggregateMetrics
    engineering_score: float
    is_evaluable: bool
    face_evaluations: tuple[FacePullDirectionEvaluation, ...] = ()
    warnings: tuple[PullDirectionEvaluationWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class PullDirectionRankingScoreBreakdown:
    """Display-safe stage-3 metrics carried into deterministic ranking."""

    engineering_score: float
    low_draft_area_ratio: float
    area_weighted_mean_draft_angle_degrees: float
    total_analyzed_area_sq_mm: float
    warning_count: int


@dataclass(frozen=True, slots=True)
class RankedPullDirectionEvaluation:
    """One ranked candidate evaluation with deterministic tie diagnostics."""

    evaluation: CandidatePullDirectionEvaluation
    rank: int
    preliminary_score: float
    score_breakdown: PullDirectionRankingScoreBreakdown
    score_delta_from_top: float
    score_delta_from_previous: float | None
    is_engineering_tie_with_top: bool
    is_near_tie_with_top: bool
    shares_axis_with_top: bool
    axis_equivalence_key: tuple[int, int, int]
    ranking_reasons: tuple[str, ...] = ()
    ranking_warnings: tuple[str, ...] = ()

    @property
    def candidate(self) -> PullDirectionCandidate:
        """Return the ranked candidate without duplicating the nested model."""
        return self.evaluation.candidate


@dataclass(frozen=True, slots=True)
class PullDirectionRankingResult:
    """Deterministic ranking result for a set of pull-direction evaluations."""

    ranked_evaluations: tuple[RankedPullDirectionEvaluation, ...]
    policy_id: str
    has_engineering_tie_for_top_rank: bool
    has_near_tie_for_top_rank: bool
    top_score: float | None
    score_margin_to_runner_up: float | None

    @property
    def candidate_count(self) -> int:
        """Return the number of ranked candidates."""
        return len(self.ranked_evaluations)

    @property
    def leading_evaluation(self) -> RankedPullDirectionEvaluation | None:
        """Return the deterministic first ranked candidate when available."""
        if not self.ranked_evaluations:
            return None

        return self.ranked_evaluations[0]


@dataclass(frozen=True, slots=True)
class PreliminaryPullDirectionSelection:
    """Preliminary best-direction selection built on deterministic ranking."""

    status: PreliminaryPullDirectionSelectionStatus
    ranked_evaluations: tuple[RankedPullDirectionEvaluation, ...]
    selected_evaluation: RankedPullDirectionEvaluation | None = None
    decisiveness: PreliminaryPullDirectionSelectionDecisiveness | None = None
    score_margin_to_runner_up: float | None = None
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def selected_candidate(self) -> PullDirectionCandidate | None:
        """Return the selected candidate when a representative exists."""
        if self.selected_evaluation is None:
            return None

        return self.selected_evaluation.candidate

    @property
    def selected_direction(self) -> Vector3D | None:
        """Return the selected pull direction when a representative exists."""
        if self.selected_candidate is None:
            return None

        return self.selected_candidate.direction


@dataclass(frozen=True, slots=True)
class DraftAnalysisWarning:
    """Structured warning emitted by draft-angle analysis."""

    code: DraftAnalysisWarningCode
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class FaceDraftAnalysis:
    """Stage-6 draft-angle analysis result for one face."""

    face_index: int
    face_area_sq_mm: float
    alignment: float | None
    signed_draft_angle_degrees: float | None
    draft_angle_magnitude_degrees: float | None
    release_side: DraftReleaseSide
    surface_type: DraftSurfaceType
    adequacy: DraftAdequacy
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class DraftAnalysisSummary:
    """Stable area-weighted aggregate metrics for stage-6 draft analysis."""

    total_face_count: int
    evaluated_face_count: int
    unevaluable_face_count: int
    total_surface_area_sq_mm: float
    evaluated_surface_area_sq_mm: float
    draft_relevant_area_sq_mm: float
    pull_facing_area_sq_mm: float
    near_zero_draft_area_sq_mm: float
    sufficient_draft_area_sq_mm: float
    insufficient_draft_area_sq_mm: float
    ambiguous_area_sq_mm: float
    face_count_by_surface_type: dict[DraftSurfaceType, int] = field(
        default_factory=dict,
        hash=False,
    )
    face_count_by_adequacy: dict[DraftAdequacy, int] = field(
        default_factory=dict,
        hash=False,
    )
    surface_area_by_surface_type: dict[DraftSurfaceType, float] = field(
        default_factory=dict,
        hash=False,
    )
    surface_area_by_adequacy: dict[DraftAdequacy, float] = field(
        default_factory=dict,
        hash=False,
    )
    surface_area_ratio_by_surface_type: dict[DraftSurfaceType, float] = field(
        default_factory=dict,
        hash=False,
    )
    surface_area_ratio_by_adequacy: dict[DraftAdequacy, float] = field(
        default_factory=dict,
        hash=False,
    )
    evaluated_surface_area_ratio: float = 0.0
    draft_relevant_area_ratio: float = 0.0
    pull_facing_area_ratio: float = 0.0
    near_zero_draft_area_ratio: float = 0.0
    sufficient_draft_area_ratio: float = 0.0
    insufficient_draft_area_ratio: float = 0.0
    ambiguous_area_ratio: float = 0.0
    minimum_drafted_magnitude_degrees: float | None = None
    maximum_drafted_magnitude_degrees: float | None = None
    area_weighted_mean_drafted_magnitude_degrees: float = 0.0


@dataclass(frozen=True, slots=True)
class DraftAnalysisResult:
    """Aggregate stage-6 draft-angle analysis aligned to the selected pull axis."""

    status: DetailedMoldAnalysisStatus
    selected_pull_direction: PullDirectionCandidate | None
    is_evaluable: bool
    face_results: tuple[FaceDraftAnalysis, ...] = ()
    summary: DraftAnalysisSummary | None = None
    warnings: tuple[DraftAnalysisWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutAnalysisWarning:
    """Structured warning emitted by the preliminary undercut detector."""

    code: UndercutAnalysisWarningCode
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class UndercutFaceAssessment:
    """Preliminary bidirectional accessibility result for one face."""

    face_index: int
    face_area_sq_mm: float
    classification: UndercutFaceClassification
    sample_count: int
    accessible_sample_count: int
    bidirectionally_blocked_sample_count: int
    ambiguous_sample_count: int
    blocked_ratio: float
    confidence: float
    reason_codes: tuple[UndercutFaceReasonCode, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutRegion:
    """Connected region of potential or confirmed preliminary undercut faces."""

    region_id: str
    face_indices: tuple[int, ...]
    face_count: int
    total_area_sq_mm: float
    area_ratio: float
    area_weighted_centroid: Vector3D | None
    bounding_box: BoundingBox | None
    classification: UndercutRegionClassification
    severity: UndercutRegionSeverity
    confidence: float
    confirmed_face_count: int
    potential_face_count: int
    reason_summary: tuple[UndercutFaceReasonCode, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutAnalysisResult:
    """Aggregate preliminary undercut analysis aligned to the selected pull axis."""

    selected_pull_direction: PullDirectionCandidate | None
    is_evaluable: bool
    outcome: UndercutAnalysisOutcome
    face_assessments: tuple[UndercutFaceAssessment, ...] = ()
    regions: tuple[UndercutRegion, ...] = ()
    confirmed_region_count: int = 0
    potential_region_count: int = 0
    total_undercut_area_sq_mm: float = 0.0
    undercut_area_ratio: float = 0.0
    highest_severity: UndercutRegionSeverity | None = None
    confidence: float = 0.0
    warnings: tuple[UndercutAnalysisWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutRegionAnalysisWarning:
    """Structured warning emitted by stage-7 undercut region analysis."""

    code: UndercutRegionAnalysisWarningCode
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class UndercutRegionDraftSummary:
    """Optional draft-angle enrichment attached to one connected undercut region."""

    negative_release_face_count: int
    neutral_release_face_count: int
    positive_release_face_count: int
    ambiguous_face_count: int
    unevaluable_face_count: int
    minimum_signed_draft_angle_degrees: float | None = None
    maximum_signed_draft_angle_degrees: float | None = None
    area_weighted_mean_signed_draft_angle_degrees: float | None = None
    boundary_surface_types: tuple[DraftSurfaceType, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutConnectedRegion:
    """Connected component of confirmed undercut faces for stage-7 reporting."""

    region_id: str
    order_index: int
    seed_face_index: int
    face_indices: tuple[int, ...]
    face_count: int
    total_area_sq_mm: float
    area_ratio: float
    area_weighted_centroid: Vector3D | None
    measurable_face_count: int
    degenerate_face_count: int
    axial_projection_min_mm: float | None
    axial_projection_max_mm: float | None
    axial_extent_mm: float
    lateral_extent_u_mm: float
    lateral_extent_v_mm: float
    maximum_lateral_extent_mm: float
    axial_to_lateral_extent_ratio: float | None
    bounding_box: BoundingBox | None
    boundary_edge_count: int
    boundary_face_indices: tuple[int, ...]
    adjacent_pullable_face_indices: tuple[int, ...] = ()
    adjacent_ambiguous_face_indices: tuple[int, ...] = ()
    adjacent_potential_face_indices: tuple[int, ...] = ()
    ambiguous_bridge_region_ids: tuple[str, ...] = ()
    touches_open_boundary: bool = False
    open_boundary_edge_count: int = 0
    touches_non_manifold_edge: bool = False
    affected_non_manifold_edge_count: int = 0
    confirmed_sample_count: int = 0
    ambiguous_sample_count: int = 0
    accessible_sample_count: int = 0
    total_sample_count: int = 0
    blocked_sample_ratio: float = 0.0
    confidence: float = 0.0
    draft_summary: UndercutRegionDraftSummary | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutRegionAnalysis:
    """Aggregate stage-7 analysis of connected confirmed undercut regions."""

    status: DetailedMoldAnalysisStatus
    selected_pull_direction: PullDirectionCandidate | None
    is_evaluable: bool
    regions: tuple[UndercutConnectedRegion, ...] = ()
    region_count: int = 0
    confirmed_face_count: int = 0
    total_area_sq_mm: float = 0.0
    area_ratio: float = 0.0
    largest_region_id: str | None = None
    largest_region_area_sq_mm: float = 0.0
    regions_touching_ambiguous_faces_count: int = 0
    regions_touching_non_manifold_count: int = 0
    affected_non_manifold_edge_count: int = 0
    regions_touching_open_boundaries_count: int = 0
    warnings: tuple[UndercutRegionAnalysisWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutRiskAssessmentWarning:
    """Structured warning emitted by stage-8/9 undercut risk assessment."""

    code: UndercutRiskAssessmentWarningCode
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class UndercutRegionRiskAssessment:
    """Risk and treatment assessment for one connected confirmed undercut region."""

    region_id: str
    severity: UndercutRiskSeverity
    complexity: UndercutRegionComplexity
    treatment_requirement: UndercutTreatmentRequirement
    risk_score: int
    complexity_score: int
    face_count: int
    total_area_sq_mm: float
    area_ratio: float
    axial_extent_mm: float
    maximum_lateral_extent_mm: float
    boundary_edge_count: int
    blocked_sample_ratio: float
    confidence: float
    minimum_signed_draft_angle_degrees: float | None = None
    adjacent_ambiguous_face_count: int = 0
    adjacent_potential_face_count: int = 0
    touches_open_boundary: bool = False
    touches_non_manifold_edge: bool = False
    requires_manual_review: bool = False
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutRiskAssessmentResult:
    """Aggregate stage-8/9 assessment built on connected undercut regions."""

    status: DetailedMoldAnalysisStatus
    selected_pull_direction: PullDirectionCandidate | None
    is_evaluable: bool
    region_assessments: tuple[UndercutRegionRiskAssessment, ...] = ()
    assessed_region_count: int = 0
    highest_severity: UndercutRiskSeverity | None = None
    highest_complexity: UndercutRegionComplexity | None = None
    overall_treatment_requirement: UndercutTreatmentRequirement | None = None
    severity_counts: dict[UndercutRiskSeverity, int] = field(
        default_factory=dict,
        hash=False,
    )
    treatment_counts: dict[UndercutTreatmentRequirement, int] = field(
        default_factory=dict,
        hash=False,
    )
    manual_review_region_count: int = 0
    blocking_region_count: int = 0
    warnings: tuple[UndercutRiskAssessmentWarning, ...] = ()


@dataclass(frozen=True, slots=True)
class MoldabilityFinding:
    """Structured evidence or policy reason emitted by stage-10/11 synthesis."""

    code: MoldabilityFindingCode
    source: MoldabilityFindingSource
    severity: IssueSeverity
    message: str
    is_blocking: bool = False
    related_region_ids: tuple[str, ...] = ()
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class MoldabilityEvidenceSummary:
    """Structured summary of upstream Chapter-3 evidence before policy mapping."""

    is_assessable: bool
    has_selected_pull_direction: bool
    selected_pull_direction_status: PreliminaryPullDirectionSelectionStatus | None
    selected_pull_direction_decisiveness: (
        PreliminaryPullDirectionSelectionDecisiveness | None
    )
    selected_direction_evidence_quality: MoldabilityEvidenceQuality
    draft_analysis_available: bool
    draft_analysis_status: DetailedMoldAnalysisStatus | None
    undercut_analysis_available: bool
    undercut_analysis_outcome: UndercutAnalysisOutcome | None
    undercut_region_analysis_available: bool
    undercut_risk_assessment_available: bool
    confirmed_undercut_region_count: int
    high_risk_region_count: int
    critical_risk_region_count: int
    manual_review_region_count: int
    blocking_region_count: int
    highest_undercut_risk: UndercutRiskSeverity | None
    highest_treatment_requirement: UndercutTreatmentRequirement | None
    ambiguity_detected: bool
    topology_limitations_detected: bool
    evidence_quality: MoldabilityEvidenceQuality
    summary: str
    findings: tuple[MoldabilityFinding, ...] = ()


@dataclass(frozen=True, slots=True)
class PreliminaryMoldabilityAssessment:
    """Preliminary moldability decision derived from aggregated Chapter-3 evidence."""

    status: MoldabilityStatus
    is_assessable: bool
    overall_risk: ManufacturabilityRisk
    simple_mold_possible: bool
    side_action_indication: MoldabilityActionIndication
    core_or_insert_indication: MoldabilityActionIndication
    manual_review_required: bool
    direct_generation_blocked: bool
    ambiguity_detected: bool
    evidence_quality: MoldabilityEvidenceQuality
    summary: str
    reasons: tuple[MoldabilityFinding, ...] = ()
    blocking_reasons: tuple[MoldabilityFinding, ...] = ()
    evidence_summary: MoldabilityEvidenceSummary | None = None


@dataclass(frozen=True, slots=True)
class MoldAnalysisModuleResult:
    """Structured outcome returned by one independent analysis module."""

    module_id: str
    status: DetailedMoldAnalysisStatus
    summary: str


@dataclass(frozen=True, slots=True)
class DetailedMoldAnalysisReport:
    """Unified result returned by the detailed mold-analysis orchestration layer."""

    status: DetailedMoldAnalysisStatus
    source: ImportAnalysisSource
    summary: str
    chapter_2_status: ImportAnalysisReportStatus
    processing_decision: ModelProcessingDecision | None = None
    blockers: tuple[DetailedMoldAnalysisBlocker, ...] = ()
    module_results: tuple[MoldAnalysisModuleResult, ...] = ()
    pull_direction_evaluations: tuple[CandidatePullDirectionEvaluation, ...] = ()
    pull_direction_ranking: PullDirectionRankingResult | None = None
    preliminary_pull_direction_selection: PreliminaryPullDirectionSelection | None = (
        None
    )
    undercut_analysis: UndercutAnalysisResult | None = None
    draft_analysis: DraftAnalysisResult | None = None
    undercut_region_analysis: UndercutRegionAnalysis | None = None
    undercut_risk_assessment: UndercutRiskAssessmentResult | None = None
    preliminary_moldability_assessment: PreliminaryMoldabilityAssessment | None = None
    schema_version: str = DETAILED_MOLD_ANALYSIS_REPORT_SCHEMA_VERSION

    def to_dict(self) -> dict[str, object]:
        """Return a serialization-safe representation of the detailed report."""
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
