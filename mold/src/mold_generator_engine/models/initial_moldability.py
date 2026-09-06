from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from mold_generator_engine.models.issues import IssueSeverity


class InitialMoldabilityStatus(Enum):
    """Preliminary readiness state for advanced mold-analysis stages."""

    READY_FOR_DETAILED_ANALYSIS = "ready_for_detailed_analysis"
    REQUIRES_REPAIR = "requires_repair"
    PRELIMINARILY_UNSUITABLE = "preliminarily_unsuitable"
    NOT_ASSESSABLE = "not_assessable"


class InitialMoldabilityFindingCode(Enum):
    """Structured reason codes for the preliminary assessment outcome."""

    MODEL_PROCESSING_REJECTED = "model_processing_rejected"
    MISSING_GEOMETRY = "missing_geometry"
    MISSING_REQUIRED_ANALYSIS_DATA = "missing_required_analysis_data"
    NON_FINITE_MODEL_DATA = "non_finite_model_data"
    ZERO_OR_NEAR_ZERO_EXTENT = "zero_or_near_zero_extent"
    OPEN_MESH = "open_mesh"
    NON_MANIFOLD_TOPOLOGY = "non_manifold_topology"
    CRITICAL_GEOMETRY_ISSUES = "critical_geometry_issues"
    READY_FOR_ADVANCED_MOLD_ANALYSIS = "ready_for_advanced_mold_analysis"


@dataclass(frozen=True, slots=True)
class InitialMoldabilityFinding:
    """Structured evidence that contributed to the preliminary assessment."""

    code: InitialMoldabilityFindingCode
    severity: IssueSeverity
    message: str
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class InitialMoldabilityAssessment:
    """Preliminary moldability readiness based on existing import diagnostics.

    This assessment only answers whether the current imported model is ready to
    enter later mold-analysis stages. It does not perform draft-angle,
    undercut, parting-direction, wall-thickness, or mold-geometry analysis.
    """

    status: InitialMoldabilityStatus
    is_assessable: bool
    is_ready_for_detailed_analysis: bool
    summary: str
    recommended_next_step: str
    findings: tuple[InitialMoldabilityFinding, ...] = ()
