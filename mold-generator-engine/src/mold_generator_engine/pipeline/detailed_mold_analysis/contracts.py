from __future__ import annotations

from typing import Protocol

from mold_generator_engine.geometry.ray_mesh_query import RayMeshHit
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisContext,
    DraftAnalysisResult,
    FaceGeometryAnalysis,
    FacePullDirectionEvaluation,
    MoldabilityEvidenceSummary,
    MoldAnalysisModuleResult,
    PreliminaryMoldabilityAssessment,
    PreliminaryPullDirectionSelection,
    PullDirectionAggregateMetrics,
    PullDirectionCandidates,
    PullDirectionEvaluationSettings,
    PullDirectionRankingResult,
    UndercutAnalysisResult,
    UndercutRiskAssessmentResult,
    UndercutRegionAnalysis,
)


class MoldAnalysisModule(Protocol):
    """Contract for one deterministic detailed-analysis module."""

    @property
    def module_id(self) -> str:
        """Return the stable identifier used in the aggregate report."""

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
    ) -> MoldAnalysisModuleResult:
        """Analyze the shared context without mutating the original model."""


class CandidatePullDirectionProvider(Protocol):
    """Contract for deterministic candidate pull-direction generation."""

    def generate_candidates(
        self,
        face_analysis: FaceGeometryAnalysis,
    ) -> PullDirectionCandidates:
        """Generate candidate pull directions from analyzed triangle faces."""


class PullDirectionScoringPolicy(Protocol):
    """Contract for deterministic engineering scoring of one candidate direction."""

    def score(
        self,
        *,
        face_evaluations: tuple[FacePullDirectionEvaluation, ...],
        aggregate_metrics: PullDirectionAggregateMetrics,
        settings: PullDirectionEvaluationSettings,
    ) -> float:
        """Return a score in the inclusive range 0 to 100."""


class CandidatePullDirectionEvaluator(Protocol):
    """Contract for engineering evaluation of candidate pull directions."""

    def evaluate_candidates(
        self,
        face_analysis: FaceGeometryAnalysis,
        candidates: PullDirectionCandidates,
    ) -> tuple[CandidatePullDirectionEvaluation, ...]:
        """Evaluate candidates without mutating the analyzed faces."""


class PullDirectionRankingPolicy(Protocol):
    """Contract for deterministic ranking of evaluated pull-direction candidates."""

    @property
    def policy_id(self) -> str:
        """Return the stable identifier for the active ranking policy."""

    def rank(
        self,
        evaluations: tuple[CandidatePullDirectionEvaluation, ...],
    ) -> PullDirectionRankingResult:
        """Rank stage-3 pull-direction evaluations without recomputing them."""


class MeshRayQueryBackend(Protocol):
    """Contract for replaceable ray/triangle mesh queries."""

    def first_hit(
        self,
        origin: Vector3D,
        direction: Vector3D,
        *,
        ignored_face_index: int | None = None,
        min_distance_mm: float | None = None,
    ) -> RayMeshHit | None:
        """Return the nearest hit or ``None`` when the ray remains clear."""


class PreliminaryUndercutAnalyzer(Protocol):
    """Contract for preliminary undercut detection after stage-4 selection."""

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis: FaceGeometryAnalysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
    ) -> UndercutAnalysisResult:
        """Analyze bidirectional accessibility without changing stage-4 ranking."""


class DraftAngleAnalyzer(Protocol):
    """Contract for stage-6 draft-angle analysis after preliminary selection."""

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis: FaceGeometryAnalysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
    ) -> DraftAnalysisResult:
        """Analyze face draft against the selected pull axis without re-ranking."""


class UndercutRegionAnalyzer(Protocol):
    """Contract for stage-7 connected undercut-region analysis."""

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis: FaceGeometryAnalysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_analysis: UndercutAnalysisResult | None,
        draft_analysis: DraftAnalysisResult | None,
    ) -> UndercutRegionAnalysis:
        """Analyze confirmed undercut regions without re-running ray queries."""


class UndercutRiskAssessor(Protocol):
    """Contract for stage-8/9 undercut risk and treatment assessment."""

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_region_analysis: UndercutRegionAnalysis | None,
    ) -> UndercutRiskAssessmentResult:
        """Assess connected undercut regions without selecting a final mold action."""


class MoldabilityEvidenceSummarizer(Protocol):
    """Contract for stage-10 evidence aggregation without new geometry analysis."""

    def summarize(
        self,
        context: DetailedMoldAnalysisContext,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_analysis: UndercutAnalysisResult | None,
        draft_analysis: DraftAnalysisResult | None,
        undercut_region_analysis: UndercutRegionAnalysis | None,
        undercut_risk_assessment: UndercutRiskAssessmentResult | None,
    ) -> MoldabilityEvidenceSummary:
        """Summarize upstream structured results without re-running analysis."""


class PreliminaryMoldabilityDecider(Protocol):
    """Contract for stage-11 preliminary moldability decision policy."""

    def decide(
        self,
        evidence_summary: MoldabilityEvidenceSummary,
    ) -> PreliminaryMoldabilityAssessment:
        """Map summarized evidence to a deterministic preliminary decision."""
