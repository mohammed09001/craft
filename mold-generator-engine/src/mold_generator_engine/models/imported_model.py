from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING

from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityAssessment,
)
from mold_generator_engine.models.issues import (
    GeometryValidationError,
    ImportWarning,
    IssueSeverity,
    ModelIssue,
    TopologyIssue,
)

if TYPE_CHECKING:
    from mold_generator_engine.geometry.model_statistics import ModelStatistics
    from mold_generator_engine.geometry.model_topology import ModelTopologyAnalysis
    from mold_generator_engine.pipeline.processing_suitability import (
        ModelProcessingDecision,
        ProcessingSuitabilityPolicy,
    )


class ModelFormat(Enum):
    STL = "stl"
    OBJ = "obj"


@dataclass(frozen=True)
class Vertex:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class Face:
    vertex_1: int
    vertex_2: int
    vertex_3: int


@dataclass(frozen=True)
class BoundingBox:
    minimum: Vertex
    maximum: Vertex


@dataclass(frozen=True)
class Dimensions:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class GeometryValidationResult:
    warnings: tuple[ImportWarning, ...] = ()
    errors: tuple[GeometryValidationError, ...] = ()
    blocking_severities: tuple[IssueSeverity, ...] = (
        IssueSeverity.ERROR,
        IssueSeverity.CRITICAL,
    )

    @property
    def issues(self) -> tuple[ModelIssue, ...]:
        """Return all geometry-validation issues in report order."""
        return self.warnings + self.errors

    @property
    def is_valid(self) -> bool:
        """Return whether validation completed without detector-level errors."""
        return not self.errors

    @property
    def can_analyze_topology(self) -> bool:
        """Return whether topology analysis can safely run."""
        return self.is_valid

    @property
    def highest_severity(self) -> IssueSeverity | None:
        """Return the highest issue severity present in this result."""
        return _highest_issue_severity(self.issues)

    @property
    def has_warnings(self) -> bool:
        """Return whether the result contains any warning-level issue."""
        return _has_issue_severity(self.issues, IssueSeverity.WARNING)

    @property
    def has_errors(self) -> bool:
        """Return whether the result contains any error-level issue."""
        return _has_issue_severity(self.issues, IssueSeverity.ERROR)

    @property
    def has_critical_issues(self) -> bool:
        """Return whether the result contains any critical issue."""
        return _has_issue_severity(self.issues, IssueSeverity.CRITICAL)

    @property
    def has_blocking_issues(self) -> bool:
        """Return whether the result contains any blocking issue."""
        return _has_blocking_issues(self.issues, self.blocking_severities)


class TopologyValidationStatus(Enum):
    NOT_RUN = "not_run"
    COMPLETED = "completed"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class TopologyValidationResult:
    status: TopologyValidationStatus
    analysis: ModelTopologyAnalysis | None = None
    skip_reason: str | None = None
    issues: tuple[TopologyIssue, ...] = ()
    blocking_severities: tuple[IssueSeverity, ...] = (
        IssueSeverity.ERROR,
        IssueSeverity.CRITICAL,
    )

    @classmethod
    def not_run(cls) -> TopologyValidationResult:
        """Return the default state before topology analysis has been attempted."""
        return cls(status=TopologyValidationStatus.NOT_RUN)

    @classmethod
    def completed(
        cls,
        analysis: ModelTopologyAnalysis,
        issues: tuple[TopologyIssue, ...] = (),
        blocking_severities: tuple[IssueSeverity, ...] = (
            IssueSeverity.ERROR,
            IssueSeverity.CRITICAL,
        ),
    ) -> TopologyValidationResult:
        """Return a completed topology analysis result."""
        return cls(
            status=TopologyValidationStatus.COMPLETED,
            analysis=analysis,
            issues=issues,
            blocking_severities=blocking_severities,
        )

    @classmethod
    def skipped(cls, reason: str) -> TopologyValidationResult:
        """Return a skipped topology analysis result."""
        return cls(
            status=TopologyValidationStatus.SKIPPED,
            skip_reason=reason,
        )

    @property
    def was_run(self) -> bool:
        """Return whether topology analysis was executed."""
        return self.status is TopologyValidationStatus.COMPLETED

    @property
    def highest_severity(self) -> IssueSeverity | None:
        """Return the highest issue severity present in this result."""
        return _highest_issue_severity(self.issues)

    @property
    def has_warnings(self) -> bool:
        """Return whether the result contains any warning-level issue."""
        return _has_issue_severity(self.issues, IssueSeverity.WARNING)

    @property
    def has_errors(self) -> bool:
        """Return whether the result contains any error-level issue."""
        return _has_issue_severity(self.issues, IssueSeverity.ERROR)

    @property
    def has_critical_issues(self) -> bool:
        """Return whether the result contains any critical issue."""
        return _has_issue_severity(self.issues, IssueSeverity.CRITICAL)

    @property
    def has_blocking_issues(self) -> bool:
        """Return whether the result contains any blocking issue."""
        return _has_blocking_issues(self.issues, self.blocking_severities)


def merge_import_warnings(
    existing_warnings: Sequence[ImportWarning],
    geometry_warnings: tuple[ImportWarning, ...],
) -> list[ImportWarning]:
    """Merge legacy warnings with shared geometry warnings without duplicates."""
    merged_warnings = list(existing_warnings)
    seen_warnings = set(existing_warnings)

    for warning in geometry_warnings:
        if warning in seen_warnings:
            continue

        merged_warnings.append(warning)
        seen_warnings.add(warning)

    return merged_warnings


@dataclass
class ImportedModel:
    source_path: Path
    source_name: str
    file_format: ModelFormat
    vertices: list[Vertex]
    faces: list[Face]
    bounding_box: BoundingBox
    dimensions: Dimensions
    warnings: list[ImportWarning]
    metadata: dict[str, object]
    geometry_validation: GeometryValidationResult = field(
        default_factory=GeometryValidationResult
    )
    topology_validation: TopologyValidationResult = field(
        default_factory=TopologyValidationResult.not_run
    )
    statistics: ModelStatistics | None = None
    initial_moldability_assessment: InitialMoldabilityAssessment | None = None

    def __post_init__(self) -> None:
        if self.geometry_validation.warnings:
            self.warnings = list(self.geometry_validation.warnings)
            return

        if self.warnings:
            self.geometry_validation = GeometryValidationResult(
                warnings=tuple(self.warnings),
                errors=self.geometry_validation.errors,
                blocking_severities=self.geometry_validation.blocking_severities,
            )

    @property
    def issues(self) -> tuple[ModelIssue, ...]:
        """Return all issues reported through the unified import result."""
        issues: list[ModelIssue] = []
        seen_issues: set[ModelIssue] = set()

        for issue in (
            *self.warnings,
            *self.geometry_validation.errors,
            *self.topology_validation.issues,
        ):
            if issue in seen_issues:
                continue

            issues.append(issue)
            seen_issues.add(issue)

        return tuple(issues)

    @property
    def highest_issue_severity(self) -> IssueSeverity | None:
        """Return the highest issue severity present on the imported model."""
        return _highest_issue_severity(self.issues)

    @property
    def has_warnings(self) -> bool:
        """Return whether the imported model contains any warning-level issue."""
        return _has_issue_severity(self.issues, IssueSeverity.WARNING)

    @property
    def has_errors(self) -> bool:
        """Return whether the imported model contains any error-level issue."""
        return _has_issue_severity(self.issues, IssueSeverity.ERROR)

    @property
    def has_critical_issues(self) -> bool:
        """Return whether the imported model contains any critical issue."""
        return _has_issue_severity(self.issues, IssueSeverity.CRITICAL)

    @property
    def has_blocking_issues(self) -> bool:
        """Return whether the imported model contains any blocking issue."""
        return any(
            (
                self.geometry_validation.has_blocking_issues,
                self.topology_validation.has_blocking_issues,
                any(
                    issue.severity in self.geometry_validation.blocking_severities
                    for issue in self.warnings
                ),
            )
        )

    @property
    def processing_decision(self) -> ModelProcessingDecision:
        """Return the default unified processing suitability decision."""
        from mold_generator_engine.pipeline.processing_suitability import (
            DEFAULT_MODEL_PROCESSING_EVALUATOR,
        )

        return DEFAULT_MODEL_PROCESSING_EVALUATOR.evaluate_model(self)

    def evaluate_processing_decision(
        self,
        policy: ProcessingSuitabilityPolicy,
    ) -> ModelProcessingDecision:
        """Return a suitability decision using the provided policy."""
        from mold_generator_engine.pipeline.processing_suitability import (
            ModelProcessingEvaluator,
        )

        return ModelProcessingEvaluator(policy).evaluate_model(self)


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}


def _highest_issue_severity(
    issues: Sequence[ModelIssue],
) -> IssueSeverity | None:
    resolved_severities = [
        issue.severity for issue in issues if issue.severity is not None
    ]

    if not resolved_severities:
        return None

    return max(resolved_severities, key=_SEVERITY_ORDER.__getitem__)


def _has_issue_severity(
    issues: Sequence[ModelIssue],
    severity: IssueSeverity,
) -> bool:
    return any(issue.severity is severity for issue in issues)


def _has_blocking_issues(
    issues: Sequence[ModelIssue],
    blocking_severities: tuple[IssueSeverity, ...],
) -> bool:
    return any(issue.severity in blocking_severities for issue in issues)
