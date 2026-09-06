from engineering_analysis.session import run_mock_analysis_session


def test_mock_analysis_session_contract_shape() -> None:
    result = run_mock_analysis_session()

    assert result["sessionId"]
    assert result["state"] == "Completed"
    assert result["createdAt"]
    assert result["startedAt"] is not None
    assert result["endedAt"] is not None
    assert result["currentAnalysisId"] is None

    assert result["queuedAnalysisIds"] == [
        "mock_pull_direction_placeholder",
        "mock_draft_placeholder",
        "mock_undercut_placeholder",
        "mock_parting_placeholder",
    ]
    assert result["executedAnalysisIds"] == [
        "mock_pull_direction_placeholder",
        "mock_draft_placeholder",
        "mock_undercut_placeholder",
        "mock_parting_placeholder",
    ]

    assert result["reportCount"] == 4
    assert result["issueCount"] == 0
    assert len(result["reports"]) == 4
    assert result["issues"] == []

    first_report = result["reports"][0]

    assert first_report["reportId"]
    assert first_report["analysisId"] == "mock_pull_direction_placeholder"
    assert first_report["title"] == "Mock Pull Direction Placeholder"
    assert first_report["status"] == "ok"
    assert first_report["summary"]
    assert first_report["issues"] == []
    assert first_report["metadata"] == {"mock": True}


def test_mock_analysis_session_contract_supports_warning_state() -> None:
    result = run_mock_analysis_session(
        {
            "mock_draft_placeholder": "warning",
        }
    )

    assert result["state"] == "CompletedWithWarnings"
    assert result["reportCount"] == 4
    assert result["issueCount"] == 1
    assert result["issues"][0]["severity"] == "warning"
    assert result["issues"][0]["analysisId"] == "mock_draft_placeholder"


def test_mock_analysis_session_contract_supports_failed_state() -> None:
    result = run_mock_analysis_session(
        {
            "mock_undercut_placeholder": "fatal",
        }
    )

    assert result["state"] == "Failed"
    assert result["reportCount"] == 3
    assert result["issueCount"] >= 1
    assert result["issues"][-1]["severity"] == "fatal"

    assert result["executedAnalysisIds"] == [
        "mock_pull_direction_placeholder",
        "mock_draft_placeholder",
        "mock_undercut_placeholder",
    ]
