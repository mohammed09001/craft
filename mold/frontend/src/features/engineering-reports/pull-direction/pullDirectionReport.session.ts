import {
  completePullDirection,
  type PullDirectionCompletionCandidate,
} from "./pullDirectionCompletion";
import type {
  PullDirectionCandidate,
  PullDirectionCandidateQuality,
  PullDirectionReport,
  PullDirectionReportSource,
  PullDirectionReportStatus,
  PullDirectionUnits,
  PullDirectionCoordinateSystem,
} from "./pullDirectionReport.contracts";
import { createMockPullDirectionReport } from "./pullDirectionReport.mock";

export type CreatePullDirectionSessionReportInput = Readonly<{
  analysisSessionId: string;
  modelId: string | null;

  status?: PullDirectionReportStatus;
  source?: PullDirectionReportSource;

  coordinateSystem?: PullDirectionCoordinateSystem;
  units?: PullDirectionUnits;
}>;

export function createPullDirectionSessionReport(
  input: CreatePullDirectionSessionReportInput,
): PullDirectionReport {
  const baseReport = createMockPullDirectionReport();
  const now = new Date().toISOString();

  return {
    ...baseReport,

    status: input.status ?? "waiting_for_analysis",

    summary: {
      ...baseReport.summary,
      description:
        "Pull direction analysis is registered for this analysis session but has not been executed yet.",
    },

    metadata: {
      ...baseReport.metadata,
      updatedAt: now,
      source: input.source ?? "frontend",
      modelId: input.modelId,
      analysisSessionId: input.analysisSessionId,
      coordinateSystem: input.coordinateSystem ?? "unknown",
      units: input.units ?? "unknown",
    },

    execution: {
      ...baseReport.execution,
      algorithmName: null,
      algorithmVersion: null,
      executionMode: "mock",
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

    warnings: [],
    errors: [],
  };
}

export function createCompletedPullDirectionSessionReport(
  input: CreatePullDirectionSessionReportInput,
): PullDirectionReport {
  const baseReport = createPullDirectionSessionReport({
    ...input,
    status: "completed",
  });

  const now = new Date().toISOString();

  const completionCandidates: readonly PullDirectionCompletionCandidate[] = [
    {
      id: "pull-positive-z",
      label: "+Z",
      direction: [0, 0, 1],
      rank: 1,
      score: 88,
    },
    {
      id: "pull-positive-x",
      label: "+X",
      direction: [1, 0, 0],
      rank: 2,
      score: 71,
    },
    {
      id: "pull-positive-y",
      label: "+Y",
      direction: [0, 1, 0],
      rank: 3,
      score: 52,
      warnings: ["Low confidence candidate."],
    },
  ];

  const completion = completePullDirection(completionCandidates);

  const candidates = completionCandidates.map((candidate) =>
    toReportCandidate({
      candidate,
      now,
      selectedCandidateId: completion.selectedCandidate?.id ?? null,
    }),
  );

  const bestCandidate =
    completion.selectedCandidate == null
      ? null
      : toReportCandidate({
          candidate: completion.selectedCandidate,
          now,
          selectedCandidateId: completion.selectedCandidate.id,
        });

  const scores = candidates.map((candidate) => candidate.score ?? 0);

  return {
    ...baseReport,

    status: "completed",

    summary: {
      title: "Pull Direction",
      description: completion.summary,
      isComplete: bestCandidate != null,
      bestCandidateId: bestCandidate?.id ?? null,
      evaluatedCandidateCount: candidates.length,
      selectionReason:
        completion.selectedCandidate == null
          ? "No usable pull direction candidate was selected."
          : "The selected direction has the strongest score and sufficient confidence for MVP mold generation.",
      solutionQuality:
        completion.status === "Good"
          ? "strong"
          : completion.status === "Review"
            ? "acceptable"
            : "weak",
    },

    bestCandidate,
    candidates,

    statistics: {
      evaluatedDirectionsCount: candidates.length,
      validDirectionsCount: candidates.filter(
        (candidate) => candidate.validation.state === "valid",
      ).length,
      rejectedDirectionsCount: candidates.filter(
        (candidate) => candidate.validation.state !== "valid",
      ).length,
      highestScore: scores.length > 0 ? Math.max(...scores) : null,
      lowestScore: scores.length > 0 ? Math.min(...scores) : null,
      averageScore:
        scores.length > 0
          ? scores.reduce((total, score) => total + score, 0) / scores.length
          : null,
    },

    execution: {
      ...baseReport.execution,
      completedAt: now,
      algorithmName: "MVP Pull Direction Completion",
      algorithmVersion: "1.0.0",
      executionMode: "heuristic",
    },

    warnings: completion.warnings.map((warning) => ({
      code: "PULL_DIRECTION_REVIEW",
      message: warning,
      severity: "warning",
    })),

    errors: [],
  };
}

function toReportCandidate(params: {
  candidate: PullDirectionCompletionCandidate;
  now: string;
  selectedCandidateId: string | null;
}): PullDirectionCandidate {
  const confidence = normalizeConfidence(params.candidate.score ?? 0);
  const isSelected = params.candidate.id === params.selectedCandidateId;

  return {
    id: params.candidate.id,
    direction: {
      x: params.candidate.direction[0],
      y: params.candidate.direction[1],
      z: params.candidate.direction[2],
      normalized: true,
    },
    rank: params.candidate.rank ?? null,
    score: params.candidate.score ?? null,
    confidence,
    quality: resolveCandidateQuality(confidence, isSelected),
    validation: {
      state: confidence >= 0.55 ? "valid" : "warning",
      messages: params.candidate.warnings ?? [],
    },
    reason: isSelected
      ? "Selected by the MVP pull direction completion layer."
      : "Alternative candidate kept for comparison.",
    evaluationNotes: isSelected
      ? [
          "Selected by the MVP pull direction completion layer.",
          "Advanced draft and undercut analysis will be handled in later stages.",
        ]
      : [],
    metadata: {
      source: "algorithm",
      generatedAt: params.now,
    },
  };
}

function normalizeConfidence(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score <= 1) {
    return Math.max(0, Math.min(1, score));
  }

  return Math.max(0, Math.min(1, score / 100));
}

function resolveCandidateQuality(
  confidence: number,
  isSelected: boolean,
): PullDirectionCandidateQuality {
  if (confidence >= 0.82 && isSelected) {
    return "good";
  }

  if (confidence >= 0.75) {
    return "good";
  }

  if (confidence >= 0.55) {
    return "acceptable";
  }

  if (confidence > 0) {
    return "poor";
  }

  return "unknown";
}
