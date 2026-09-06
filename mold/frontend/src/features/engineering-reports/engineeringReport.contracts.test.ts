import { describe, expect, it } from "vitest";

import {
  ENGINEERING_REPORT_SCHEMA,
  ENGINEERING_REPORT_SCHEMA_VERSION,
  type EngineeringReport,
  type EngineeringReportData,
} from "./engineeringReport.contracts";

interface ContractTestReportData extends EngineeringReportData {
  readonly value: number;
  readonly label: string;
  readonly nested: {
    readonly valid: boolean;
    readonly tags: readonly string[];
  };
}

describe("engineeringReport.contracts", () => {
  it("supports the Python engine bridge report shape", () => {
    const report = {
      schema: ENGINEERING_REPORT_SCHEMA,
      schemaVersion: ENGINEERING_REPORT_SCHEMA_VERSION,
      metadata: {
        reportId: "report-001",
        analysisName: "contract_test",
        reportName: "Contract Test Report",
        createdAt: "2026-07-05T00:00:00.000Z",
        source: "python-engine",
        engineVersion: null,
        contractVersion: ENGINEERING_REPORT_SCHEMA_VERSION,
      },
      status: "success",
      success: true,
      warnings: [],
      errors: [],
      statistics: {
        durationMs: 5,
      },
      data: {
        value: 42,
        label: "ok",
        nested: {
          valid: true,
          tags: ["contract", "chapter-9"],
        },
      },
    } satisfies EngineeringReport<ContractTestReportData>;

    expect(report.schema).toBe("engineering_report");
    expect(report.schemaVersion).toBe("1.0.0");
    expect(report.metadata.source).toBe("python-engine");
    expect(report.status).toBe("success");
    expect(report.success).toBe(true);
    expect(report.statistics.durationMs).toBe(5);
    expect(report.data.value).toBe(42);
  });

  it("supports warnings and errors without requiring geometry logic", () => {
    const report = {
      schema: ENGINEERING_REPORT_SCHEMA,
      schemaVersion: ENGINEERING_REPORT_SCHEMA_VERSION,
      metadata: {
        reportId: "report-002",
        analysisName: "failed_contract_test",
        reportName: "Failed Contract Test Report",
        createdAt: "2026-07-05T00:00:00.000Z",
        source: "engine-bridge",
      },
      status: "failed",
      success: false,
      warnings: [
        {
          code: "MODEL_NON_FATAL_ISSUE",
          message: "Model contains a non-fatal issue.",
          source: "contract-test",
          details: {
            faceIndex: 12,
          },
        },
      ],
      errors: [
        {
          code: "ANALYSIS_FAILED",
          message: "Analysis failed before execution.",
          source: "contract-test",
          recoverable: true,
          details: {
            reason: "contract-only test",
          },
        },
      ],
      statistics: {},
      data: {},
    } satisfies EngineeringReport;

    expect(report.status).toBe("failed");
    expect(report.success).toBe(false);
    expect(report.warnings[0]?.code).toBe("MODEL_NON_FATAL_ISSUE");
    expect(report.errors[0]?.recoverable).toBe(true);
  });
});
