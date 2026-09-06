import { create } from "zustand";

import {
  MOLD_GENERATION_COMMAND_ID,
  MOLD_GENERATION_READY_MESSAGE,
} from "@/features/engine-integration/moldGenerationEngineBridge";
import type {
  EngineCommandRequest,
  EngineCommandResult,
} from "@/features/engine-integration/engineIntegration.contracts";

export type EngineCommandUiPhase =
  | "idle"
  | "running"
  | "succeeded"
  | "failed";

export type EngineIntegrationUiState = {
  activeRequest: EngineCommandRequest | undefined;
  lastCommandResult: EngineCommandResult | undefined;
  phase: EngineCommandUiPhase;
  visibleMessage: string | undefined;
  clearCommandState: () => void;
  finishCommand: (result: EngineCommandResult) => void;
  startCommand: (request: EngineCommandRequest) => void;
};

const INITIAL_ENGINE_INTEGRATION_STATE = {
  activeRequest: undefined,
  lastCommandResult: undefined,
  phase: "idle" as const,
  visibleMessage: undefined,
};

export function deriveEngineCommandVisibleMessage(
  result: EngineCommandResult,
): string {
  if (result.phase === "failed") {
    return result.error;
  }

  if (result.commandId === MOLD_GENERATION_COMMAND_ID) {
    return MOLD_GENERATION_READY_MESSAGE;
  }

  return result.artifacts[0]?.label ?? "Engine command completed successfully.";
}

export const useEngineIntegrationStore = create<EngineIntegrationUiState>(
  (set) => ({
    ...INITIAL_ENGINE_INTEGRATION_STATE,

    clearCommandState: () => {
      set(INITIAL_ENGINE_INTEGRATION_STATE);
    },

    finishCommand: (result) => {
      set({
        activeRequest: undefined,
        lastCommandResult: result,
        phase: result.phase,
        visibleMessage: deriveEngineCommandVisibleMessage(result),
      });
    },

    startCommand: (request) => {
      set({
        activeRequest: request,
        lastCommandResult: undefined,
        phase: "running",
        visibleMessage: "Preparing Import Analysis command.",
      });
    },
  }),
);
