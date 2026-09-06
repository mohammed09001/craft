from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Self


class IssueSeverity(Enum):
    """Severity level assigned to a reported model issue."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class IssueSource(Enum):
    """Subsystem that reported an issue before severity classification."""

    IMPORT = "import"
    GEOMETRY_VALIDATION = "geometry_validation"
    TOPOLOGY_VALIDATION = "topology_validation"


@dataclass(frozen=True, slots=True)
class ModelIssue:
    """Structured issue data shared across validation and pipeline stages."""

    code: str
    message: str
    source: IssueSource
    severity: IssueSeverity | None = None
    metadata: dict[str, object] = field(default_factory=dict, hash=False)

    def with_severity(self, severity: IssueSeverity) -> Self:
        """Return a copy of the issue with a resolved severity."""
        return replace(self, severity=severity)


@dataclass(frozen=True, slots=True)
class ImportWarning(ModelIssue):
    """Non-fatal issue reported during model import."""

    source: IssueSource = IssueSource.IMPORT


@dataclass(frozen=True, slots=True)
class GeometryValidationError(ModelIssue):
    """Geometry-validation issue reported by shared mesh checks."""

    source: IssueSource = IssueSource.GEOMETRY_VALIDATION


@dataclass(frozen=True, slots=True)
class TopologyIssue(ModelIssue):
    """Issue derived from neutral topology-analysis facts."""

    source: IssueSource = IssueSource.TOPOLOGY_VALIDATION
