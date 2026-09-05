from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Protocol, TypeVar

from mold_generator_engine.models.issues import (
    GeometryValidationError,
    ImportWarning,
    IssueSeverity,
    IssueSource,
    ModelIssue,
    TopologyIssue,
)

IssueT = TypeVar("IssueT", bound=ModelIssue)


class IssueSeverityPolicy(Protocol):
    """Maps detected issue codes to severity and blocking rules."""

    @property
    def blocking_severities(self) -> tuple[IssueSeverity, ...]:
        """Return severities that should block downstream processing."""

    def classify(self, issue: ModelIssue) -> IssueSeverity:
        """Resolve the severity for a single issue."""

    def classify_issues(self, issues: Sequence[IssueT]) -> tuple[IssueT, ...]:
        """Return issues with severity populated."""

    def highest_severity(
        self,
        issues: Iterable[ModelIssue],
    ) -> IssueSeverity | None:
        """Return the highest severity present in the issues."""

    def is_blocking(self, severity: IssueSeverity) -> bool:
        """Return whether the severity should block downstream work."""


class DefaultIssueSeverityPolicy:
    """Default centralized severity mapping for current engine issue codes.

    Unknown issue codes resolve to ``IssueSeverity.ERROR`` so new diagnostics are
    never treated as harmless until they are deliberately classified here.
    """

    _SEVERITY_ORDER = (
        IssueSeverity.INFO,
        IssueSeverity.WARNING,
        IssueSeverity.ERROR,
        IssueSeverity.CRITICAL,
    )
    _ORDER_INDEX = {severity: index for index, severity in enumerate(_SEVERITY_ORDER)}
    _CLASSIFICATIONS: dict[tuple[IssueSource, str], IssueSeverity] = {
        (IssueSource.GEOMETRY_VALIDATION, "degenerate_face"): IssueSeverity.ERROR,
        (IssueSource.GEOMETRY_VALIDATION, "missing_vertices"): IssueSeverity.CRITICAL,
        (IssueSource.GEOMETRY_VALIDATION, "missing_faces"): IssueSeverity.CRITICAL,
        (
            IssueSource.GEOMETRY_VALIDATION,
            "face_index_out_of_range",
        ): IssueSeverity.CRITICAL,
        (IssueSource.TOPOLOGY_VALIDATION, "open_boundary_edges"): IssueSeverity.ERROR,
        (IssueSource.TOPOLOGY_VALIDATION, "non_manifold_edges"): IssueSeverity.CRITICAL,
        (IssueSource.TOPOLOGY_VALIDATION, "isolated_vertices"): IssueSeverity.WARNING,
        (IssueSource.TOPOLOGY_VALIDATION, "duplicate_faces"): IssueSeverity.WARNING,
        (
            IssueSource.TOPOLOGY_VALIDATION,
            "multiple_connected_components",
        ): IssueSeverity.WARNING,
    }

    @property
    def blocking_severities(self) -> tuple[IssueSeverity, ...]:
        """Return the default blocking severities."""
        return (IssueSeverity.ERROR, IssueSeverity.CRITICAL)

    def classify(self, issue: ModelIssue) -> IssueSeverity:
        """Resolve the severity for a single issue."""
        if issue.severity is not None:
            return issue.severity

        return self._CLASSIFICATIONS.get(
            (issue.source, issue.code),
            IssueSeverity.ERROR,
        )

    def classify_issues(self, issues: Sequence[IssueT]) -> tuple[IssueT, ...]:
        """Return copies of the issues with resolved severities."""
        return tuple(
            issue.with_severity(self.classify(issue))
            if issue.severity is None
            else issue
            for issue in issues
        )

    def highest_severity(
        self,
        issues: Iterable[ModelIssue],
    ) -> IssueSeverity | None:
        """Return the highest severity present in the issues."""
        resolved_issues = tuple(issues)

        if not resolved_issues:
            return None

        return max(
            (self.classify(issue) for issue in resolved_issues),
            key=self._ORDER_INDEX.__getitem__,
        )

    def is_blocking(self, severity: IssueSeverity) -> bool:
        """Return whether the severity should block downstream work."""
        return severity in self.blocking_severities


DEFAULT_ISSUE_SEVERITY_POLICY = DefaultIssueSeverityPolicy()


def classify_geometry_validation_result(
    warnings: Sequence[ImportWarning],
    errors: Sequence[GeometryValidationError],
    policy: IssueSeverityPolicy = DEFAULT_ISSUE_SEVERITY_POLICY,
) -> tuple[tuple[ImportWarning, ...], tuple[GeometryValidationError, ...]]:
    """Return geometry issues with policy-resolved severity."""
    return (
        policy.classify_issues(warnings),
        policy.classify_issues(errors),
    )


def classify_topology_issues(
    issues: Sequence[TopologyIssue],
    policy: IssueSeverityPolicy = DEFAULT_ISSUE_SEVERITY_POLICY,
) -> tuple[TopologyIssue, ...]:
    """Return topology issues with policy-resolved severity."""
    return policy.classify_issues(issues)
