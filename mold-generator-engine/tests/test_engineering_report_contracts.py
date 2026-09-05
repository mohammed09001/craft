from engineering_reports import (
    ENGINEERING_REPORT_SCHEMA,
    ENGINEERING_REPORT_SCHEMA_VERSION,
    EngineeringReportError,
    EngineeringReportStatus,
    EngineeringReportWarning,
    create_engineering_report,
    create_failed_engineering_report,
)


def test_engineering_report_serializes_to_bridge_contract() -> None:
    report = create_engineering_report(
        report_id="report-001",
        analysis_name="contract_test",
        report_name="Contract Test Report",
        data={"value": 42},
        statistics={"durationMs": 5},
    )

    payload = report.to_dict()

    assert payload["schema"] == ENGINEERING_REPORT_SCHEMA
    assert payload["schemaVersion"] == ENGINEERING_REPORT_SCHEMA_VERSION
    assert payload["metadata"]["reportId"] == "report-001"
    assert payload["metadata"]["analysisName"] == "contract_test"
    assert payload["metadata"]["reportName"] == "Contract Test Report"
    assert payload["metadata"]["source"] == "python-engine"
    assert payload["status"] == "success"
    assert payload["success"] is True
    assert payload["warnings"] == []
    assert payload["errors"] == []
    assert payload["statistics"] == {"durationMs": 5}
    assert payload["data"] == {"value": 42}


def test_engineering_report_supports_warnings() -> None:
    warning = EngineeringReportWarning(
        code="MODEL_NON_FATAL_ISSUE",
        message="Model contains a non-fatal issue.",
        source="contract-test",
        details={"faceIndex": 12},
    )

    report = create_engineering_report(
        report_id="report-002",
        analysis_name="warning_test",
        report_name="Warning Test Report",
        status=EngineeringReportStatus.SUCCESS_WITH_WARNINGS,
        warnings=(warning,),
    )

    payload = report.to_dict()

    assert payload["status"] == "success_with_warnings"
    assert payload["success"] is True
    assert payload["warnings"][0]["code"] == "MODEL_NON_FATAL_ISSUE"
    assert payload["warnings"][0]["details"] == {"faceIndex": 12}


def test_failed_engineering_report_serializes_errors() -> None:
    error = EngineeringReportError(
        code="ANALYSIS_FAILED",
        message="Analysis failed before execution.",
        source="contract-test",
        recoverable=True,
        details={"reason": "contract-only test"},
    )

    report = create_failed_engineering_report(
        report_id="report-003",
        analysis_name="failed_test",
        report_name="Failed Test Report",
        error=error,
    )

    payload = report.to_dict()

    assert payload["status"] == "failed"
    assert payload["success"] is False
    assert payload["errors"][0]["code"] == "ANALYSIS_FAILED"
    assert payload["errors"][0]["recoverable"] is True
    assert payload["data"] == {}
