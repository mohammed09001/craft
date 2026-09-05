from __future__ import annotations

from datetime import datetime
from typing import Any, TypedDict

from .models import AnalysisIssue, AnalysisReport, AnalysisSession


class AnalysisIssueDTO(TypedDict):
    severity: str
    code: str
    message: str
    analysisId: str | None


class AnalysisReportDTO(TypedDict):
    reportId: str
    analysisId: str
    title: str
    status: str
    summary: str
    issues: list[AnalysisIssueDTO]
    metadata: dict[str, Any]


class AnalysisSessionDTO(TypedDict):
    sessionId: str
    state: str
    createdAt: str
    startedAt: str | None
    endedAt: str | None
    currentAnalysisId: str | None
    queuedAnalysisIds: list[str]
    executedAnalysisIds: list[str]
    reportCount: int
    issueCount: int
    reports: list[AnalysisReportDTO]
    issues: list[AnalysisIssueDTO]


def _datetime_to_contract(value: datetime | None) -> str | None:
    if value is None:
        return None

    return value.isoformat()


def analysis_issue_to_dto(issue: AnalysisIssue) -> AnalysisIssueDTO:
    return {
        "severity": issue.severity,
        "code": issue.code,
        "message": issue.message,
        "analysisId": issue.analysis_id,
    }


def analysis_report_to_dto(report: AnalysisReport) -> AnalysisReportDTO:
    return {
        "reportId": report.report_id,
        "analysisId": report.analysis_id,
        "title": report.title,
        "status": report.status,
        "summary": report.summary,
        "issues": [analysis_issue_to_dto(issue) for issue in report.issues],
        "metadata": dict(report.metadata),
    }


def analysis_session_to_dto(session: AnalysisSession) -> AnalysisSessionDTO:
    return {
        "sessionId": session.session_id,
        "state": session.state.value,
        "createdAt": _datetime_to_contract(session.created_at) or "",
        "startedAt": _datetime_to_contract(session.started_at),
        "endedAt": _datetime_to_contract(session.ended_at),
        "currentAnalysisId": session.current_analysis_id,
        "queuedAnalysisIds": list(session.queued_analysis_ids),
        "executedAnalysisIds": list(session.executed_analysis_ids),
        "reportCount": len(session.reports),
        "issueCount": len(session.issues),
        "reports": [analysis_report_to_dto(report) for report in session.reports],
        "issues": [analysis_issue_to_dto(issue) for issue in session.issues],
    }
