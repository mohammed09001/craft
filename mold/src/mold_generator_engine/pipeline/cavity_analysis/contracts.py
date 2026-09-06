from __future__ import annotations

from typing import Protocol

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityAnalysisDecision,
    CavityCandidateDetectionResult,
    CavityClassificationResult,
    CavityEvidenceAssessment,
    CavityOpeningDetectionResult,
    CoreTrappingRiskAnalysisResult,
    InternalAccessDirectionGenerationResult,
    InternalAccessibilityAnalysisResult,
    InternalUndercutAnalysisResult,
    PreliminaryCoreStrategyAssessment,
)


class CavityEvidenceAssessor(Protocol):
    """Contract for structured cavity-evidence assessment without geometry search."""

    def assess(
        self,
        context: CavityAnalysisContext,
    ) -> CavityEvidenceAssessment:
        """Assess upstream structured evidence without mutating prior reports."""


class CavityCandidateDetector(Protocol):
    """Contract for geometric cavity candidate detection behind Chapter 4 DI."""

    def detect(
        self,
        context: CavityAnalysisContext,
    ) -> CavityCandidateDetectionResult:
        """Detect internal cavity candidates without mutating the original model."""


class CavityOpeningDetector(Protocol):
    """Contract for internal-surface and line-of-sight opening witness detection."""

    def detect(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
    ) -> CavityOpeningDetectionResult:
        """Detect internal regions and opening witnesses from bounded evidence."""


class CavityClassifier(Protocol):
    """Contract for conservative cavity feature classification."""

    def classify(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
    ) -> CavityClassificationResult:
        """Classify cavity candidates without proving mold-core feasibility."""


class InternalAccessibilityAnalyzer(Protocol):
    """Contract for preliminary line-of-sight internal accessibility analysis."""

    def analyze(
        self,
        context: CavityAnalysisContext,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
    ) -> InternalAccessibilityAnalysisResult:
        """Assess line-of-sight access without inferring insertion paths."""


class InternalAccessDirectionGenerator(Protocol):
    """Contract for candidate internal access direction generation."""

    def generate(
        self,
        context: CavityAnalysisContext,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
    ) -> InternalAccessDirectionGenerationResult:
        """Generate target-scoped directions without selecting a core direction."""


class InternalUndercutAnalyzer(Protocol):
    """Contract for directional internal obstruction/undercut evidence."""

    def analyze(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        access_directions: InternalAccessDirectionGenerationResult,
    ) -> InternalUndercutAnalysisResult:
        """Assess each target and direction without proving core clearance."""


class CoreTrappingRiskAnalyzer(Protocol):
    """Contract for preliminary core trapping risk assessment."""

    def analyze(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
    ) -> CoreTrappingRiskAnalysisResult:
        """Assess preliminary trapping risk without final core feasibility claims."""


class CoreStrategySynthesizer(Protocol):
    """Contract for target-scoped preliminary core-strategy synthesis."""

    def synthesize(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
        core_trapping_risk: CoreTrappingRiskAnalysisResult,
    ) -> PreliminaryCoreStrategyAssessment:
        """Synthesize strategy evidence without running geometry queries."""


class CavityAnalysisDecisionMaker(Protocol):
    """Contract for the final Chapter 4 cavity-analysis decision."""

    def decide(
        self,
        context: CavityAnalysisContext,
        assessment: CavityEvidenceAssessment,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
        core_trapping_risk: CoreTrappingRiskAnalysisResult,
        preliminary_core_strategy: PreliminaryCoreStrategyAssessment,
    ) -> CavityAnalysisDecision:
        """Resolve the final Chapter 4 decision from structured results only."""
