import {
  MOLD_GENERATION_READY_MESSAGE,
  createMoldGenerationCommandRequest,
  deriveEngineCommandVisibleMessage,
  useEngineIntegrationStore,
} from "@/features/engine-integration";
import type { EngineCommandResult } from "@/features/engine-integration";

beforeEach(() => {
  useEngineIntegrationStore.getState().clearCommandState();
});

it("starts from an idle engine command UI state", () => {
  expect(useEngineIntegrationStore.getState()).toMatchObject({
    activeRequest: undefined,
    lastCommandResult: undefined,
    phase: "idle",
    visibleMessage: undefined,
  });
});

it("stores the active engine command request while running", () => {
  const request = createMoldGenerationCommandRequest({
    fileName: "part.stl",
    format: "STL",
    modelId: "model-1",
  });

  useEngineIntegrationStore.getState().startCommand(request);

  expect(useEngineIntegrationStore.getState()).toMatchObject({
    activeRequest: request,
    lastCommandResult: undefined,
    phase: "running",
    visibleMessage: "Preparing Import Analysis command.",
  });
});

it("stores the last successful engine command result and visible message", () => {
  const request = createMoldGenerationCommandRequest({
    fileName: "part.stl",
    format: "STL",
    modelId: "model-1",
  });
  const result: EngineCommandResult = {
    artifacts: [
      {
        artifactId: "mold-generation-import-analysis-preview-report",
        kind: "report",
        label: "Import Analysis Bridge: Ready",
      },
    ],
    commandId: request.commandId,
    jobId: request.jobId,
    phase: "succeeded",
  };

  useEngineIntegrationStore.getState().startCommand(request);
  useEngineIntegrationStore.getState().finishCommand(result);

  expect(useEngineIntegrationStore.getState()).toMatchObject({
    activeRequest: undefined,
    lastCommandResult: result,
    phase: "succeeded",
    visibleMessage: MOLD_GENERATION_READY_MESSAGE,
  });
});

it("derives failed command messages from the result error", () => {
  const result: EngineCommandResult = {
    commandId: "mold-generation.import-analysis",
    error: "Engine failed safely.",
    jobId: "job-1",
    phase: "failed",
  };

  expect(deriveEngineCommandVisibleMessage(result)).toBe(
    "Engine failed safely.",
  );

  useEngineIntegrationStore.getState().finishCommand(result);

  expect(useEngineIntegrationStore.getState()).toMatchObject({
    lastCommandResult: result,
    phase: "failed",
    visibleMessage: "Engine failed safely.",
  });
});

it("clears command UI state without touching engine contracts", () => {
  const result: EngineCommandResult = {
    commandId: "chapter5.import-analysis",
    error: "Engine failed safely.",
    jobId: "job-1",
    phase: "failed",
  };

  useEngineIntegrationStore.getState().finishCommand(result);
  useEngineIntegrationStore.getState().clearCommandState();

  expect(useEngineIntegrationStore.getState()).toMatchObject({
    activeRequest: undefined,
    lastCommandResult: undefined,
    phase: "idle",
    visibleMessage: undefined,
  });
});
