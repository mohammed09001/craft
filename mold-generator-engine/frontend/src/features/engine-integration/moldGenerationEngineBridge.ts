import type {
  EngineCommandRequest,
  EngineCommandResult,
  EngineIntegrationAdapter,
  EngineInputModelReference,
  ImportAnalysisPreviewSummary,
} from "@/features/engine-integration/engineIntegration.contracts";

export const MOLD_GENERATION_COMMAND_ID =
  "mold-generation.import-analysis" as const;

export const MOLD_GENERATION_READY_MESSAGE =
  "Mold generation command prepared successfully.";

export type MoldGenerationCommandId =
  typeof MOLD_GENERATION_COMMAND_ID;

export type MoldGenerationEngineCapability = {
  engine: "mold-generation";
  capability: "import-analysis";
  commandId: MoldGenerationCommandId;
  phase: "bridge-ready";
  message: string;
};

export type MoldGenerationCommandInput = {
  fileName: string;
  format: "STL";
  modelId: string;
};

export function getMoldGenerationEngineBridgeStatus(): MoldGenerationEngineCapability {
  return {
    engine: "mold-generation",
    capability: "import-analysis",
    commandId: MOLD_GENERATION_COMMAND_ID,
    phase: "bridge-ready",
    message:
      "Mold generation engine boundary is ready for UI integration.",
  };
}

export function createMoldGenerationPreviewSummary(
  request: EngineCommandRequest,
): ImportAnalysisPreviewSummary {
  return {
    sourceFile: request.inputModel.fileName,
    format: request.inputModel.format,
    executionMode: "UI Bridge Preview",
    python: "Not run",
    backend: "Not required",
    stlTransfer: "Not sent",
    result: "Ready for future mold generation engine execution",
  };
}

export function createMoldGenerationCommandRequest({
  fileName,
  format,
  modelId,
}: MoldGenerationCommandInput): EngineCommandRequest {
  const inputModel: EngineInputModelReference = {
    source: "active-viewport-model",
    modelId,
    fileName,
    format,
    units: "model-units",
  };

  return {
    commandId: MOLD_GENERATION_COMMAND_ID,
    jobId: "mold-generation-import-analysis-preview",
    scope: "active-model",
    inputModel,
    parameters: {
      executionMode: "ui-bridge-preview",
      runsPython: false,
      sendsModelFile: false,
      requiresBackend: false,
    },
  };
}

export const moldGenerationSafeAdapter: EngineIntegrationAdapter = {
  async runCommand(
    request: EngineCommandRequest,
  ): Promise<EngineCommandResult> {
    if (request.commandId !== MOLD_GENERATION_COMMAND_ID) {
      return {
        jobId: request.jobId,
        commandId: request.commandId,
        phase: "failed",
        error: `Unsupported engine command: ${request.commandId}`,
      };
    }

    return {
      jobId: request.jobId,
      commandId: request.commandId,
      phase: "succeeded",
      artifacts: [
        {
          artifactId: `${request.commandId}-preview-report`,
          kind: "report",
          label: "Import Analysis Bridge: Ready",
        },
      ],
      importAnalysisPreview: createMoldGenerationPreviewSummary(request),
    };
  },
};
