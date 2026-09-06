import { createContext, useContext } from "react";

export type ViewportCommandId =
  | "clear-measurement"
  | "fit-view"
  | "import-stl"
  | "measure-distance"
  | "orient-model"
  | "replace-stl"
  | "reset-view"
  | "return-to-select";

export type ViewportCommandHandlers = Record<ViewportCommandId, () => void>;

export type PartialViewportCommandHandlers = Partial<
  Record<ViewportCommandId, (() => void) | undefined>
>;

export type ViewportCommandContextValue = {
  registerViewportCommands: (
    commands: PartialViewportCommandHandlers,
  ) => () => void;
  runViewportCommand: (commandId: ViewportCommandId) => void;
};

export const ViewportCommandContext =
  createContext<ViewportCommandContextValue | null>(null);

export function useViewportCommandRegistration() {
  const context = useContext(ViewportCommandContext);

  if (context === null) {
    throw new Error("ViewportCommandProvider is required.");
  }

  return context.registerViewportCommands;
}

export function useViewportCommandRunner() {
  const context = useContext(ViewportCommandContext);

  if (context === null) {
    throw new Error("ViewportCommandProvider is required.");
  }

  return context.runViewportCommand;
}

