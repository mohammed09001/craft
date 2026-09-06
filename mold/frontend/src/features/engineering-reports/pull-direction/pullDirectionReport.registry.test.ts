import { describe, expect, it } from "vitest";

import {
  PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  PULL_DIRECTION_REPORT_TYPE,
  pullDirectionReportRegistryEntry,
} from "./index";

describe("PullDirectionReport registry entry", () => {
  it("registers Pull Direction as a contract-ready engineering report", () => {
    expect(pullDirectionReportRegistryEntry.id).toBe("pull-direction");
    expect(pullDirectionReportRegistryEntry.reportType).toBe(
      PULL_DIRECTION_REPORT_TYPE,
    );
    expect(pullDirectionReportRegistryEntry.schemaVersion).toBe(
      PULL_DIRECTION_REPORT_SCHEMA_VERSION,
    );

    expect(pullDirectionReportRegistryEntry.title).toBe("Pull Direction");
    expect(pullDirectionReportRegistryEntry.category).toBe("mold_engineering");
    expect(pullDirectionReportRegistryEntry.lifecycleStage).toBe(
      "contract_ready",
    );
  });

  it("explicitly confirms that Stage 4 does not provide an algorithm or viewport visualization", () => {
    expect(pullDirectionReportRegistryEntry.supportsMockData).toBe(true);
    expect(pullDirectionReportRegistryEntry.hasAlgorithm).toBe(false);
    expect(pullDirectionReportRegistryEntry.hasViewportVisualization).toBe(
      false,
    );
  });

  it("creates a stable initial PullDirectionReport through the registry entry", () => {
    const report = pullDirectionReportRegistryEntry.createInitialReport();

    expect(report.reportType).toBe(PULL_DIRECTION_REPORT_TYPE);
    expect(report.schemaVersion).toBe(PULL_DIRECTION_REPORT_SCHEMA_VERSION);

    expect(report.status).toBe("not_analyzed");
    expect(report.summary.title).toBe("Pull Direction");

    expect(report.bestCandidate).toBeNull();
    expect(report.candidates).toEqual([]);

    expect(report.statistics.evaluatedDirectionsCount).toBe(0);
    expect(report.execution.executionMode).toBe("mock");
  });
});
