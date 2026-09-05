export type EngineJobId = string;
export type EngineCommandId = string;
export type EngineArtifactId = string;

export type EngineIntegrationPhase =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type EngineInputModelReference = {
  source: "active-viewport-model";
  modelId: string;
  fileName: string;
  format: "STL";
  units: "model-units";
};

export type EngineCommandScope = "active-model";

export type EngineCommandRequest = {
  commandId: EngineCommandId;
  jobId: EngineJobId;
  scope: EngineCommandScope;
  inputModel: EngineInputModelReference;
  parameters?: Record<string, unknown>;
};

export type EngineJobStatus = {
  jobId: EngineJobId;
  commandId: EngineCommandId;
  phase: EngineIntegrationPhase;
  message?: string;
  progressRatio?: number;
};

export type EngineArtifactKind =
  | "mesh"
  | "overlay"
  | "report"
  | "export"
  | "diagnostic";

export type EngineResultArtifact = {
  artifactId: EngineArtifactId;
  kind: EngineArtifactKind;
  label: string;
  payloadRef?: string;
};

export type ImportAnalysisPreviewSummary = {
  sourceFile: string;
  format: "STL";
  executionMode: "UI Bridge Preview";
  python: "Not run";
  backend: "Not required";
  stlTransfer: "Not sent";
  result: "Ready for future mold generation engine execution";
};

export type EngineCommandResult =
  | {
      jobId: EngineJobId;
      commandId: EngineCommandId;
      phase: "succeeded";
      artifacts: EngineResultArtifact[];
      importAnalysisPreview?: ImportAnalysisPreviewSummary;
    }
  | {
      jobId: EngineJobId;
      commandId: EngineCommandId;
      phase: "failed";
      error: string;
      artifacts?: EngineResultArtifact[];
      importAnalysisPreview?: ImportAnalysisPreviewSummary;
    };

export type EngineIntegrationAdapter = {
  runCommand: (request: EngineCommandRequest) => Promise<EngineCommandResult>;
};
