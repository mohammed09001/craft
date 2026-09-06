import {
  PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  PULL_DIRECTION_REPORT_TYPE,
  type PullDirectionReport,
} from "./pullDirectionReport.contracts";

export function createMockPullDirectionReport(): PullDirectionReport {
  const now = new Date().toISOString();

  return {
    reportId: "pull-direction-report-mock",
    reportType: PULL_DIRECTION_REPORT_TYPE,
    schemaVersion: PULL_DIRECTION_REPORT_SCHEMA_VERSION,

    status: "not_analyzed",

    summary: {
      title: "Pull Direction",
      description: "Pull direction analysis has not been executed yet.",
      isComplete: false,
      bestCandidateId: null,
      evaluatedCandidateCount: 0,
      selectionReason: null,
      solutionQuality: "unknown",
    },

    bestCandidate: null,
    candidates: [],

    statistics: {
      evaluatedDirectionsCount: 0,
      validDirectionsCount: 0,
      rejectedDirectionsCount: 0,
      highestScore: null,
      lowestScore: null,
      averageScore: null,
    },

    execution: {
      startedAt: null,
      completedAt: null,
      durationMs: null,
      algorithmName: null,
      algorithmVersion: null,
      executionMode: "mock",
    },

    metadata: {
      createdAt: now,
      updatedAt: null,
      source: "mock",
      modelId: null,
      analysisSessionId: null,
      coordinateSystem: "unknown",
      units: "unknown",
    },

    warnings: [],
    errors: [],
  };
}
