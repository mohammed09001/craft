import {
  moldGenerationSafeAdapter,
  createMoldGenerationCommandRequest,
  type EngineCommandRequest,
  type EngineCommandResult,
  type EngineIntegrationAdapter,
  type EngineJobStatus,
} from "@/features/engine-integration";

it("keeps engine integration as serializable contracts only", async () => {
  const request: EngineCommandRequest = {
    commandId: "future-engine-command",
    jobId: "job-1",
    scope: "active-model",
    inputModel: {
      source: "active-viewport-model",
      modelId: "model-1",
      fileName: "part.stl",
      format: "STL",
      units: "model-units",
    },
    parameters: {
      tolerance: 0.1,
    },
  };

  const status: EngineJobStatus = {
    commandId: request.commandId,
    jobId: request.jobId,
    message: "Queued.",
    phase: "queued",
    progressRatio: 0,
  };

  const adapter: EngineIntegrationAdapter = {
    runCommand: async (): Promise<EngineCommandResult> => ({
      artifacts: [
        {
          artifactId: "artifact-1",
          kind: "report",
          label: "Future report",
        },
      ],
      commandId: request.commandId,
      jobId: request.jobId,
      phase: "succeeded",
    }),
  };

  await expect(adapter.runCommand(request)).resolves.toEqual(
    expect.objectContaining({
      commandId: "future-engine-command",
      jobId: "job-1",
      phase: "succeeded",
    }),
  );

  expect(status).toEqual(
    expect.objectContaining({
      phase: "queued",
      progressRatio: 0,
    }),
  );
});

it("keeps failed engine results serializable", () => {
  const result: EngineCommandResult = {
    commandId: "future-engine-command",
    error: "Engine failed safely.",
    jobId: "job-2",
    phase: "failed",
  };

  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});
it("keeps mold generation import analysis bridge as a UI-only safe preview", async () => {
  const request = createMoldGenerationCommandRequest({
    fileName: "acceptance-part.stl",
    format: "STL",
    modelId: "model-acceptance",
  });

  expect(request.parameters).toMatchObject({
    executionMode: "ui-bridge-preview",
    requiresBackend: false,
    runsPython: false,
    sendsModelFile: false,
  });

  const result = await moldGenerationSafeAdapter.runCommand(request);

  expect(result).toMatchObject({
    commandId: "mold-generation.import-analysis",
    importAnalysisPreview: {
      backend: "Not required",
      executionMode: "UI Bridge Preview",
      format: "STL",
      python: "Not run",
      result: "Ready for future mold generation engine execution",
      sourceFile: "acceptance-part.stl",
      stlTransfer: "Not sent",
    },
    jobId: "mold-generation-import-analysis-preview",
    phase: "succeeded",
  });
});
