from __future__ import annotations

from collections.abc import Mapping

from .dto import AnalysisSessionDTO, analysis_session_to_dto
from .mock_runners import (
    MockAnalysisTask,
    MockOutcome,
    build_default_mock_analysis_queue,
)
from .pipeline import AnalysisPipeline


def build_mock_analysis_pipeline(
    outcomes_by_analysis_id: Mapping[str, MockOutcome] | None = None,
) -> AnalysisPipeline:
    outcomes = outcomes_by_analysis_id or {}
    pipeline = AnalysisPipeline()

    for task in build_default_mock_analysis_queue():
        pipeline.register(
            MockAnalysisTask(
                analysis_id=task.analysis_id,
                title=task.title,
                outcome=outcomes.get(task.analysis_id, task.outcome),
            )
        )

    return pipeline


def run_mock_analysis_session(
    outcomes_by_analysis_id: Mapping[str, MockOutcome] | None = None,
) -> AnalysisSessionDTO:
    pipeline = build_mock_analysis_pipeline(outcomes_by_analysis_id)
    session = pipeline.run()
    return analysis_session_to_dto(session)
