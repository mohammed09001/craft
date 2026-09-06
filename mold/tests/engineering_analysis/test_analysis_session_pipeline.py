from engineering_analysis.session import AnalysisPipeline, AnalysisSessionState
from engineering_analysis.session.mock_runners import (
    MockAnalysisTask,
    build_default_mock_analysis_queue,
)


def test_pipeline_completes_and_collects_reports() -> None:
    pipeline = AnalysisPipeline()

    for task in build_default_mock_analysis_queue():
        pipeline.register(task)

    session = pipeline.run()

    assert session.state == AnalysisSessionState.COMPLETED
    assert session.started_at is not None
    assert session.ended_at is not None
    assert len(session.reports) == 4
    assert session.executed_analysis_ids == [
        "mock_pull_direction_placeholder",
        "mock_draft_placeholder",
        "mock_undercut_placeholder",
        "mock_parting_placeholder",
    ]


def test_warning_does_not_stop_pipeline() -> None:
    pipeline = AnalysisPipeline()
    pipeline.register(MockAnalysisTask("analysis_a", "Analysis A"))
    pipeline.register(MockAnalysisTask("analysis_b", "Analysis B", outcome="warning"))
    pipeline.register(MockAnalysisTask("analysis_c", "Analysis C"))

    session = pipeline.run()

    assert session.state == AnalysisSessionState.COMPLETED_WITH_WARNINGS
    assert len(session.reports) == 3
    assert session.executed_analysis_ids == [
        "analysis_a",
        "analysis_b",
        "analysis_c",
    ]
    assert any(issue.severity == "warning" for issue in session.issues)


def test_fatal_error_stops_pipeline() -> None:
    pipeline = AnalysisPipeline()
    pipeline.register(MockAnalysisTask("analysis_a", "Analysis A"))
    pipeline.register(MockAnalysisTask("analysis_b", "Analysis B", outcome="fatal"))
    pipeline.register(MockAnalysisTask("analysis_c", "Analysis C"))

    session = pipeline.run()

    assert session.state == AnalysisSessionState.FAILED
    assert len(session.reports) == 2
    assert session.executed_analysis_ids == [
        "analysis_a",
        "analysis_b",
    ]
    assert any(issue.severity == "fatal" for issue in session.issues)


def test_exception_is_converted_to_failed_session() -> None:
    pipeline = AnalysisPipeline()
    pipeline.register(MockAnalysisTask("analysis_a", "Analysis A"))
    pipeline.register(MockAnalysisTask("analysis_b", "Analysis B", outcome="exception"))
    pipeline.register(MockAnalysisTask("analysis_c", "Analysis C"))

    session = pipeline.run()

    assert session.state == AnalysisSessionState.FAILED
    assert len(session.reports) == 2
    assert session.reports[-1].status == "failed"
    assert session.executed_analysis_ids == [
        "analysis_a",
        "analysis_b",
    ]


def test_pipeline_supports_add_and_remove_without_core_changes() -> None:
    pipeline = AnalysisPipeline()
    pipeline.register(MockAnalysisTask("analysis_a", "Analysis A"))
    pipeline.register(MockAnalysisTask("analysis_b", "Analysis B"))
    pipeline.unregister("analysis_a")
    pipeline.register(MockAnalysisTask("analysis_c", "Analysis C"))

    session = pipeline.run()

    assert session.state == AnalysisSessionState.COMPLETED
    assert session.executed_analysis_ids == [
        "analysis_b",
        "analysis_c",
    ]
    assert len(session.reports) == 2
