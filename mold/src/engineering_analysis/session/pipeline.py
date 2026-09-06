from __future__ import annotations

from .models import AnalysisIssue, AnalysisReport, AnalysisSession
from .tasks import AnalysisTask


class AnalysisPipeline:
    def __init__(self) -> None:
        self._tasks: list[AnalysisTask] = []

    @property
    def tasks(self) -> tuple[AnalysisTask, ...]:
        return tuple(self._tasks)

    def register(self, task: AnalysisTask) -> AnalysisPipeline:
        if any(existing.analysis_id == task.analysis_id for existing in self._tasks):
            raise ValueError(f"Analysis task already registered: {task.analysis_id}")

        self._tasks.append(task)
        return self

    def unregister(self, analysis_id: str) -> AnalysisPipeline:
        self._tasks = [task for task in self._tasks if task.analysis_id != analysis_id]
        return self

    def run(self, session: AnalysisSession | None = None) -> AnalysisSession:
        active_session = session or AnalysisSession()
        active_session.mark_queued([task.analysis_id for task in self._tasks])
        active_session.mark_running()

        for task in self._tasks:
            active_session.mark_analysis_started(task.analysis_id)

            try:
                report = task.run(active_session)
            except Exception as exc:
                issue = AnalysisIssue(
                    severity="fatal",
                    code="ANALYSIS_TASK_EXCEPTION",
                    message=str(exc),
                    analysis_id=task.analysis_id,
                )
                failure_report = AnalysisReport(
                    report_id=f"{task.analysis_id}:exception",
                    analysis_id=task.analysis_id,
                    title=task.title,
                    status="failed",
                    summary="Analysis task raised an exception.",
                    issues=(issue,),
                )
                active_session.add_report(failure_report)
                active_session.fail(issue)
                return active_session

            active_session.add_report(report)

            if report.has_fatal_error:
                fatal_issue = next(
                    (issue for issue in report.issues if issue.severity == "fatal"),
                    AnalysisIssue(
                        severity="fatal",
                        code="ANALYSIS_TASK_FAILED",
                        message=f"Analysis task failed: {task.analysis_id}",
                        analysis_id=task.analysis_id,
                    ),
                )
                active_session.fail(fatal_issue)
                return active_session

        active_session.complete()
        return active_session
