import { describe, expect, it } from "vitest";

import {
  PULL_DIRECTION_REPORT_TYPE,
  createPullDirectionSessionReport,
} from "./index";

describe("PullDirectionReport analysis session adapter", () => {
  it("creates a PullDirectionReport bound to an analysis session", () => {
    const report = createPullDirectionSessionReport({
      analysisSessionId: "analysis-session-001",
      modelId: "model-001",
      coordinateSystem: "model",
      units: "mm",
    });

    expect(report.reportType).toBe(PULL_DIRECTION_REPORT_TYPE);
    expect(report.status).toBe("waiting_for_analysis");

    expect(report.metadata.analysisSessionId).toBe("analysis-session-001");
    expect(report.metadata.modelId).toBe("model-001");
    expect(report.metadata.source).toBe("frontend");
    expect(report.metadata.coordinateSystem).toBe("model");
    expect(report.metadata.units).toBe("mm");

    expect(report.bestCandidate).toBeNull();
    expect(report.candidates).toEqual([]);
    expect(report.statistics.evaluatedDirectionsCount).toBe(0);

    expect(report.execution.executionMode).toBe("mock");
    expect(report.execution.algorithmName).toBeNull();
    expect(report.execution.algorithmVersion).toBeNull();
  });

  it("supports explicit status and source without introducing an algorithm", () => {
    const report = createPullDirectionSessionReport({
      analysisSessionId: "analysis-session-002",
      modelId: null,
      status: "not_analyzed",
      source: "import_pipeline",
    });

    expect(report.status).toBe("not_analyzed");
    expect(report.metadata.source).toBe("import_pipeline");
    expect(report.metadata.modelId).toBeNull();

    expect(report.bestCandidate).toBeNull();
    expect(report.candidates).toHaveLength(0);

    expect(report.execution.executionMode).toBe("mock");
    expect(report.execution.algorithmName).toBeNull();
  });

  it("keeps Stage 4 contract-only with no evaluated directions", () => {
    const report = createPullDirectionSessionReport({
      analysisSessionId: "analysis-session-003",
      modelId: "model-003",
    });

    expect(report.summary.isComplete).toBe(false);
    expect(report.summary.bestCandidateId).toBeNull();
    expect(report.summary.evaluatedCandidateCount).toBe(0);
    expect(report.summary.selectionReason).toBeNull();
    expect(report.summary.solutionQuality).toBe("unknown");

    expect(report.statistics.validDirectionsCount).toBe(0);
    expect(report.statistics.rejectedDirectionsCount).toBe(0);
    expect(report.statistics.highestScore).toBeNull();
    expect(report.statistics.lowestScore).toBeNull();
    expect(report.statistics.averageScore).toBeNull();
  });
});
