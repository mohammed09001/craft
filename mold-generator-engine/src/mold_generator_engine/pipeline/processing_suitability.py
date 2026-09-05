from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Protocol

from mold_generator_engine.models.issues import IssueSeverity, IssueSource, ModelIssue
from mold_generator_engine.pipeline.issue_policy import DEFAULT_ISSUE_SEVERITY_POLICY

if TYPE_CHECKING:
    from mold_generator_engine.models.imported_model import ImportedModel


class ModelProcessingStatus(Enum):
    """Unified suitability status for continuing model processing."""

    READY = "ready"
    READY_WITH_WARNINGS = "ready_with_warnings"
    REQUIRES_REPAIR = "requires_repair"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class IssueSeverityCounts:
    """Count of issues by classified severity."""

    info_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    critical_count: int = 0

    @classmethod
    def from_issues(cls, issues: Sequence[ModelIssue]) -> IssueSeverityCounts:
        """Build severity counts from the provided issues."""
        severity_counts = Counter(
            issue.severity for issue in issues if issue.severity is not None
        )

        return cls(
            info_count=severity_counts[IssueSeverity.INFO],
            warning_count=severity_counts[IssueSeverity.WARNING],
            error_count=severity_counts[IssueSeverity.ERROR],
            critical_count=severity_counts[IssueSeverity.CRITICAL],
        )

    @property
    def total_count(self) -> int:
        """Return the total number of counted issues."""
        return (
            self.info_count
            + self.warning_count
            + self.error_count
            + self.critical_count
        )


@dataclass(frozen=True, slots=True)
class ModelProcessingDecision:
    """Structured suitability decision derived from classified issues."""

    status: ModelProcessingStatus
    issue_counts: IssueSeverityCounts
    contributing_issues: tuple[ModelIssue, ...] = ()
    blocking_issues: tuple[ModelIssue, ...] = ()

    @property
    def is_processable(self) -> bool:
        """Return whether processing may continue without a repair step."""
        return self.status in (
            ModelProcessingStatus.READY,
            ModelProcessingStatus.READY_WITH_WARNINGS,
        )

    @property
    def requires_repair(self) -> bool:
        """Return whether repair is required before processing may continue."""
        return self.status is ModelProcessingStatus.REQUIRES_REPAIR

    @property
    def is_rejected(self) -> bool:
        """Return whether the current processing path must reject the model."""
        return self.status is ModelProcessingStatus.REJECTED

    @property
    def summary(self) -> str:
        """Return a concise human-readable explanation of the decision."""
        if self.status is ModelProcessingStatus.READY:
            if self.issue_counts.total_count:
                return "Model is ready for processing with informational issues only."

            return "Model is ready for processing."

        if self.status is ModelProcessingStatus.READY_WITH_WARNINGS:
            return "Model is ready for processing with warnings."

        if self.status is ModelProcessingStatus.REQUIRES_REPAIR:
            return "Model requires repair before processing may continue."

        return "Model is rejected for the current processing path."


class ProcessingSuitabilityPolicy(Protocol):
    """Maps classified issues to unified processing suitability outcomes."""

    def status_for_issue(self, issue: ModelIssue) -> ModelProcessingStatus:
        """Return the minimum final status imposed by a single issue."""


class DefaultProcessingSuitabilityPolicy:
    """Default policy for turning classified issues into processability outcomes."""

    _STATUS_BY_CODE: dict[tuple[IssueSource, str], ModelProcessingStatus] = {
        (
            IssueSource.GEOMETRY_VALIDATION,
            "degenerate_face",
        ): ModelProcessingStatus.REQUIRES_REPAIR,
        (
            IssueSource.GEOMETRY_VALIDATION,
            "missing_vertices",
        ): ModelProcessingStatus.REJECTED,
        (
            IssueSource.GEOMETRY_VALIDATION,
            "missing_faces",
        ): ModelProcessingStatus.REJECTED,
        (
            IssueSource.GEOMETRY_VALIDATION,
            "face_index_out_of_range",
        ): ModelProcessingStatus.REJECTED,
        (
            IssueSource.TOPOLOGY_VALIDATION,
            "open_boundary_edges",
        ): ModelProcessingStatus.REQUIRES_REPAIR,
        (
            IssueSource.TOPOLOGY_VALIDATION,
            "non_manifold_edges",
        ): ModelProcessingStatus.REJECTED,
        (
            IssueSource.TOPOLOGY_VALIDATION,
            "isolated_vertices",
        ): ModelProcessingStatus.READY_WITH_WARNINGS,
        (
            IssueSource.TOPOLOGY_VALIDATION,
            "duplicate_faces",
        ): ModelProcessingStatus.READY_WITH_WARNINGS,
        (
            IssueSource.TOPOLOGY_VALIDATION,
            "multiple_connected_components",
        ): ModelProcessingStatus.READY_WITH_WARNINGS,
    }

    def status_for_issue(self, issue: ModelIssue) -> ModelProcessingStatus:
        """Return the minimum final status imposed by a single issue."""
        mapped_status = self._STATUS_BY_CODE.get((issue.source, issue.code))

        if mapped_status is not None:
            return mapped_status

        return _status_from_severity(issue.severity)


class ModelProcessingEvaluator:
    """Deterministically evaluate processing suitability from classified issues."""

    def __init__(
        self,
        policy: ProcessingSuitabilityPolicy | None = None,
    ) -> None:
        self._policy = policy or DEFAULT_PROCESSING_SUITABILITY_POLICY

    def evaluate_model(self, model: ImportedModel) -> ModelProcessingDecision:
        """Evaluate unified suitability for an imported model."""
        return self.evaluate_issues(model.issues)

    def evaluate_issues(
        self,
        issues: Sequence[ModelIssue],
    ) -> ModelProcessingDecision:
        """Evaluate unified suitability from the provided classified issues."""
        unique_issues = tuple(
            {issue: None for issue in self._resolve_issues(issues)}.keys()
        )
        issue_counts = IssueSeverityCounts.from_issues(unique_issues)

        if not unique_issues:
            return ModelProcessingDecision(
                status=ModelProcessingStatus.READY,
                issue_counts=issue_counts,
            )

        statuses_by_issue = {
            issue: self._policy.status_for_issue(issue) for issue in unique_issues
        }

        final_status = max(
            statuses_by_issue.values(),
            key=_PROCESSING_STATUS_ORDER.__getitem__,
        )
        contributing_issues = tuple(
            sorted(
                (
                    issue
                    for issue, issue_status in statuses_by_issue.items()
                    if issue_status is final_status
                ),
                key=lambda issue: _issue_sort_key(issue, statuses_by_issue[issue]),
            )
        )
        blocking_issues = tuple(
            sorted(
                (
                    issue
                    for issue, issue_status in statuses_by_issue.items()
                    if issue_status
                    in (
                        ModelProcessingStatus.REQUIRES_REPAIR,
                        ModelProcessingStatus.REJECTED,
                    )
                ),
                key=lambda issue: _issue_sort_key(issue, statuses_by_issue[issue]),
            )
        )

        return ModelProcessingDecision(
            status=final_status,
            issue_counts=issue_counts,
            contributing_issues=contributing_issues,
            blocking_issues=blocking_issues,
        )

    @staticmethod
    def _resolve_issues(issues: Sequence[ModelIssue]) -> tuple[ModelIssue, ...]:
        return tuple(
            issue.with_severity(DEFAULT_ISSUE_SEVERITY_POLICY.classify(issue))
            if issue.severity is None
            else issue
            for issue in issues
        )


DEFAULT_PROCESSING_SUITABILITY_POLICY = DefaultProcessingSuitabilityPolicy()
DEFAULT_MODEL_PROCESSING_EVALUATOR = ModelProcessingEvaluator()


_PROCESSING_STATUS_ORDER = {
    ModelProcessingStatus.READY: 0,
    ModelProcessingStatus.READY_WITH_WARNINGS: 1,
    ModelProcessingStatus.REQUIRES_REPAIR: 2,
    ModelProcessingStatus.REJECTED: 3,
}
_SEVERITY_ORDER = {
    None: -1,
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}


def _status_from_severity(
    severity: IssueSeverity | None,
) -> ModelProcessingStatus:
    if severity is IssueSeverity.INFO:
        return ModelProcessingStatus.READY

    if severity is IssueSeverity.WARNING:
        return ModelProcessingStatus.READY_WITH_WARNINGS

    if severity is IssueSeverity.ERROR:
        return ModelProcessingStatus.REQUIRES_REPAIR

    return ModelProcessingStatus.REJECTED


def _issue_sort_key(
    issue: ModelIssue,
    status: ModelProcessingStatus,
) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in issue.metadata.items())
    )

    return (
        _PROCESSING_STATUS_ORDER[status],
        _SEVERITY_ORDER[issue.severity],
        issue.source.value,
        issue.code,
        issue.message,
        metadata_key,
    )
