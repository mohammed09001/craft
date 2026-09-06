import { create } from "zustand";
import { isViewportToolAvailable, isViewportToolStillActive, type ViewportToolContext } from "./viewportTool.capabilities";

export type ViewportToolId =
  | "pointer"
  | "orientation"
  | "line"
  | "eraser"
  | "sprue"
  | "mold-scale"
  | "measure-distance";
export type LegacyMeasurementToolId = "select" | "measure-distance";

export function resolveViewportTool(toolbarTool: ViewportToolId, measurementTool: LegacyMeasurementToolId): ViewportToolId {
  return measurementTool === "measure-distance" ? "measure-distance" : toolbarTool;
}

interface ViewportToolState {
  activeTool: ViewportToolId;
  context: ViewportToolContext;
  setActiveTool(tool: ViewportToolId): void;
  setContext(context: ViewportToolContext): void;
  isAvailable(tool: ViewportToolId): boolean;
  resetActiveTool(): void;
}

const DEFAULT_VIEWPORT_TOOL: ViewportToolId = "pointer";
const DEFAULT_CONTEXT: ViewportToolContext = { workflow: "modelReady", evaluationPhase: "idle", hasReferenceGeometry: false, hasCuttingPlanes: false };

export const useViewportToolStore = create<ViewportToolState>((set, get) => ({
  activeTool: DEFAULT_VIEWPORT_TOOL,
  context: DEFAULT_CONTEXT,
  setActiveTool: (tool) => set((state) => !isViewportToolAvailable(tool, state.context) || state.activeTool === tool ? state : { activeTool: tool }),
  setContext: (context) => set((state) => ({ context, activeTool: isViewportToolStillActive(state.activeTool, context) ? state.activeTool : DEFAULT_VIEWPORT_TOOL })),
  isAvailable: (tool) => isViewportToolAvailable(tool, get().context),
  resetActiveTool: () => set({ activeTool: DEFAULT_VIEWPORT_TOOL }),
}));
