import { describe, expect, it } from "vitest";

import {
  PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  PULL_DIRECTION_REPORT_TYPE,
  createMockPullDirectionReport,
  type PullDirectionCandidate,
  type PullDirectionReport,
} from "./index";

describe("PullDirectionReport contract", () => {
  it("creates a stable not-analyzed mock report", () => {
    const report = createMockPullDirectionReport();

    expect(report.reportType).toBe(PULL_DIRECTION_REPORT_TYPE);
    expect(report.schemaVersion).toBe(PULL_DIRECTION_REPORT_SCHEMA_VERSION);

    expect(report.status).toBe("not_analyzed");

    expect(report.summary.title).toBe("Pull Direction");
    expect(report.summary.isComplete).toBe(false);
    expect(report.summary.bestCandidateId).toBeNull();
    expect(report.summary.evaluatedCandidateCount).toBe(0);
    expect(report.summary.solutionQuality).toBe("unknown");

    expect(report.bestCandidate).toBeNull();
    expect(report.candidates).toEqual([]);

    expect(report.statistics.evaluatedDirectionsCount).toBe(0);
    expect(report.statistics.validDirectionsCount).toBe(0);
    expect(report.statistics.rejectedDirectionsCount).toBe(0);

    expect(report.execution.executionMode).toBe("mock");
    expect(report.execution.algorithmName).toBeNull();
    expect(report.execution.algorithmVersion).toBeNull();

    expect(report.metadata.source).toBe("mock");
    expect(report.metadata.coordinateSystem).toBe("unknown");
    expect(report.metadata.units).toBe("unknown");

    expect(report.warnings).toEqual([]);
    expect(report.errors).toEqual([]);
  });

  it("supports candidates as first-class entities instead of raw vectors", () => {
    const candidate: PullDirectionCandidate = {
      id: "candidate-z-positive",
      direction: {
        x: 0,
        y: 0,
        z: 1,
        normalized: true,
      },
      rank: 1,
      score: 0.82,
      confidence: 0.76,
      quality: "good",
      validation: {
        state: "valid",
        messages: [],
      },
      reason: "Mock candidate used only to validate the contract shape.",
      evaluationNotes: ["No real geometry analysis is performed in Stage 4."],
      metadata: {
        source: "mock",
        generatedAt: "2026-07-06T00:00:00.000Z",
      },
    };

    expect(candidate.id).toBe("candidate-z-positive");
    expect(candidate.direction.normalized).toBe(true);
    expect(candidate.rank).toBe(1);
    expect(candidate.quality).toBe("good");
    expect(candidate.validation.state).toBe("valid");
  });

  it("allows a completed report without coupling the contract to an algorithm", () => {
    const candidate: PullDirectionCandidate = {
      id: "candidate-x-positive",
      direction: {
        x: 1,
        y: 0,
        z: 0,
        normalized: true,
      },
      rank: 1,
      score: 0.91,
      confidence: 0.88,
      quality: "excellent",
      validation: {
        state: "valid",
        messages: [],
      },
      reason: "Highest mock score.",
      evaluationNotes: ["Contract-only test data."],
      metadata: {
        source: "mock",
        generatedAt: "2026-07-06T00:00:00.000Z",
      },
    };

    const base = createMockPullDirectionReport();

    const completedReport: PullDirectionReport = {
      ...base,
      status: "completed",
      summary: {
        ...base.summary,
        isComplete: true,
        bestCandidateId: candidate.id,
        evaluatedCandidateCount: 1,
        selectionReason: "Selected by mock score.",
        solutionQuality: "strong",
      },
      bestCandidate: candidate,
      candidates: [candidate],
      statistics: {
        evaluatedDirectionsCount: 1,
        validDirectionsCount: 1,
        rejectedDirectionsCount: 0,
        highestScore: 0.91,
        lowestScore: 0.91,
        averageScore: 0.91,
      },
      execution: {
        ...base.execution,
        completedAt: "2026-07-06T00:00:00.000Z",
        durationMs: 1,
        algorithmName: "mock_contract_validation",
        algorithmVersion: "0.0.0",
        executionMode: "mock",
      },
    };

    expect(completedReport.bestCandidate?.id).toBe(candidate.id);
    expect(completedReport.candidates).toHaveLength(1);
    expect(completedReport.execution.algorithmName).toBe("mock_contract_validation");
  });
});
