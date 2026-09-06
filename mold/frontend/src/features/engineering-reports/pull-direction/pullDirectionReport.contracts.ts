export const PULL_DIRECTION_REPORT_TYPE = "pull_direction" as const;
export const PULL_DIRECTION_REPORT_SCHEMA_VERSION = "1.0.0" as const;

export type PullDirectionReportType = typeof PULL_DIRECTION_REPORT_TYPE;

export type PullDirectionReportSchemaVersion =
  typeof PULL_DIRECTION_REPORT_SCHEMA_VERSION;

export type PullDirectionReportStatus =
  | "not_analyzed"
  | "waiting_for_analysis"
  | "ready"
  | "completed"
  | "partial"
  | "failed";

export type PullDirectionSolutionQuality =
  | "unknown"
  | "weak"
  | "acceptable"
  | "strong"
  | "optimal";

export type PullDirectionCandidateQuality =
  | "unknown"
  | "poor"
  | "acceptable"
  | "good"
  | "excellent";

export type PullDirectionValidationState =
  | "not_validated"
  | "valid"
  | "invalid"
  | "warning";

export type PullDirectionExecutionMode =
  | "mock"
  | "deterministic"
  | "heuristic"
  | "ai"
  | "unknown";

export type PullDirectionReportSource =
  | "mock"
  | "engine"
  | "frontend"
  | "import_pipeline";

export type PullDirectionCandidateSource =
  | "mock"
  | "engine"
  | "algorithm"
  | "unknown";

export type PullDirectionCoordinateSystem =
  | "model"
  | "world"
  | "unknown";

export type PullDirectionUnits =
  | "mm"
  | "cm"
  | "m"
  | "inch"
  | "unknown";

export type PullDirectionVector3 = Readonly<{
  x: number;
  y: number;
  z: number;
  normalized: boolean;
}>;

export type PullDirectionCandidateValidation = Readonly<{
  state: PullDirectionValidationState;
  messages: readonly string[];
}>;

export type PullDirectionCandidateMetadata = Readonly<{
  source: PullDirectionCandidateSource;
  generatedAt: string | null;
}>;

export type PullDirectionCandidate = Readonly<{
  id: string;

  direction: PullDirectionVector3;

  rank: number | null;

  score: number | null;
  confidence: number | null;

  quality: PullDirectionCandidateQuality;

  validation: PullDirectionCandidateValidation;

  reason: string | null;

  evaluationNotes: readonly string[];

  metadata: PullDirectionCandidateMetadata;
}>;

export type PullDirectionSummary = Readonly<{
  title: string;
  description: string;

  isComplete: boolean;

  bestCandidateId: string | null;

  evaluatedCandidateCount: number;

  selectionReason: string | null;

  solutionQuality: PullDirectionSolutionQuality;
}>;

export type PullDirectionStatistics = Readonly<{
  evaluatedDirectionsCount: number;
  validDirectionsCount: number;
  rejectedDirectionsCount: number;

  highestScore: number | null;
  lowestScore: number | null;
  averageScore: number | null;
}>;

export type PullDirectionExecutionInfo = Readonly<{
  startedAt: string | null;
  completedAt: string | null;

  durationMs: number | null;

  algorithmName: string | null;
  algorithmVersion: string | null;

  executionMode: PullDirectionExecutionMode;
}>;

export type PullDirectionMetadata = Readonly<{
  createdAt: string;
  updatedAt: string | null;

  source: PullDirectionReportSource;

  modelId: string | null;
  analysisSessionId: string | null;

  coordinateSystem: PullDirectionCoordinateSystem;

  units: PullDirectionUnits;
}>;

export type PullDirectionReportWarning = Readonly<{
  code: string;
  message: string;
  severity: "info" | "warning";
}>;

export type PullDirectionReportError = Readonly<{
  code: string;
  message: string;
  severity: "error" | "critical";
}>;

export type PullDirectionReport = Readonly<{
  reportId: string;
  reportType: PullDirectionReportType;
  schemaVersion: PullDirectionReportSchemaVersion;

  status: PullDirectionReportStatus;

  summary: PullDirectionSummary;

  bestCandidate: PullDirectionCandidate | null;
  candidates: readonly PullDirectionCandidate[];

  statistics: PullDirectionStatistics;
  execution: PullDirectionExecutionInfo;
  metadata: PullDirectionMetadata;

  warnings: readonly PullDirectionReportWarning[];
  errors: readonly PullDirectionReportError[];
}>;
