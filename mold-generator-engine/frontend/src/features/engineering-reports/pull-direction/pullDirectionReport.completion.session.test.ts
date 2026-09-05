import { describe, expect, it } from "vitest";

import { createCompletedPullDirectionSessionReport } from "./pullDirectionReport.session";

describe("Completed Pull Direction Session Report", () => {
  it("creates a completed MVP pull direction report with a best candidate", () => {
    const report = createCompletedPullDirectionSessionReport({
      analysisSessionId: "test-session",
      modelId: "test-model",
      source: "frontend",
      coordinateSystem: "model",
      units: "mm",
    });

    expect(report.status).toBe("completed");
    expect(report.summary.isComplete).toBe(true);
    expect(report.bestCandidate?.id).toBe("pull-positive-z");
    expect(report.bestCandidate?.confidence).toBe(0.88);
    expect(report.statistics.evaluatedDirectionsCount).toBe(3);
    expect(report.warnings).toEqual([]);
    expect(report.errors).toEqual([]);
  });
});
