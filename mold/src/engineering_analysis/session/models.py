from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Mapping
from uuid import uuid4


class AnalysisSessionState(str, Enum):
    CREATED = "Created"
    QUEUED = "Queued"
    RUNNING = "Running"
    COMPLETED = "Completed"
    COMPLETED_WITH_WARNINGS = "CompletedWithWarnings"
    FAILED = "Failed"
    CANCELLED = "Cancelled"


IssueSeverity = Literal["warning", "fatal"]
ReportStatus = Literal["ok", "warning", "failed"]


@dataclass(frozen=True)
class AnalysisIssue:
    severity: IssueSeverity
    code: str
    message: str
    analysis_id: str | None = None


@dataclass(frozen=True)
class AnalysisReport:
    report_id: str
    analysis_id: str
    title: str
    status: ReportStatus
    summary: str
    issues: tuple[AnalysisIssue, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @property
    def has_warning(self) -> bool:
        return any(issue.severity == "warning" for issue in self.issues)

    @property
    def has_fatal_error(self) -> bool:
        return self.status == "failed" or any(
            issue.severity == "fatal" for issue in self.issues
        )


@dataclass
class AnalysisSession:
    session_id: str = field(default_factory=lambda: str(uuid4()))
    state: AnalysisSessionState = AnalysisSessionState.CREATED
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    ended_at: datetime | None = None
    current_analysis_id: str | None = None
    queued_analysis_ids: list[str] = field(default_factory=list)
    executed_analysis_ids: list[str] = field(default_factory=list)
    reports: list[AnalysisReport] = field(default_factory=list)
    issues: list[AnalysisIssue] = field(default_factory=list)

    def mark_queued(self, analysis_ids: list[str]) -> None:
        self.queued_analysis_ids = list(analysis_ids)
        if self.state == AnalysisSessionState.CREATED:
            self.state = AnalysisSessionState.QUEUED

    def mark_running(self) -> None:
        if self.state in {
            AnalysisSessionState.COMPLETED,
            AnalysisSessionState.COMPLETED_WITH_WARNINGS,
            AnalysisSessionState.FAILED,
            AnalysisSessionState.CANCELLED,
        }:
            raise RuntimeError(f"Cannot run session in terminal state: {self.state.value}")

        self.state = AnalysisSessionState.RUNNING
        if self.started_at is None:
            self.started_at = datetime.now(timezone.utc)

    def mark_analysis_started(self, analysis_id: str) -> None:
        self.current_analysis_id = analysis_id
        self.executed_analysis_ids.append(analysis_id)

    def add_report(self, report: AnalysisReport) -> None:
        self.reports.append(report)
        self.issues.extend(report.issues)

    def complete(self) -> None:
        self.current_analysis_id = None
        self.ended_at = datetime.now(timezone.utc)

        if any(issue.severity == "warning" for issue in self.issues):
            self.state = AnalysisSessionState.COMPLETED_WITH_WARNINGS
        else:
            self.state = AnalysisSessionState.COMPLETED

    def fail(self, issue: AnalysisIssue) -> None:
        self.current_analysis_id = None
        self.issues.append(issue)
        self.ended_at = datetime.now(timezone.utc)
        self.state = AnalysisSessionState.FAILED

    def cancel(self) -> None:
        self.current_analysis_id = None
        self.ended_at = datetime.now(timezone.utc)
        self.state = AnalysisSessionState.CANCELLED

    @property
    def is_terminal(self) -> bool:
        return self.state in {
            AnalysisSessionState.COMPLETED,
            AnalysisSessionState.COMPLETED_WITH_WARNINGS,
            AnalysisSessionState.FAILED,
            AnalysisSessionState.CANCELLED,
        }
