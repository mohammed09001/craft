import type { MoldEvaluationPhase } from "@/features/mold-generation/workflow";
import type { SplitWorkflowState } from "@/features/mold-generation/split-face";
import { getPartOrientationCapability } from "./partOrientation.store";
import type { ViewportToolId } from "./viewportTool.store";

export interface ViewportToolContext {
  readonly workflow: SplitWorkflowState;
  readonly evaluationPhase: MoldEvaluationPhase;
  readonly hasReferenceGeometry: boolean;
  readonly hasCuttingPlanes: boolean;
}

export interface ViewportToolDescriptor {
  readonly id: ViewportToolId;
  readonly interactionMode: "selection" | "orientation" | "cutting-plane" | "sprue" | "mold-scale" | "measurement" | "future";
  readonly interactionGroup: "viewport-primary";
  readonly mutatesDocument: boolean;
  readonly requirement: "none" | "reference-geometry" | "cutting-planes";
  readonly futureCapability: boolean;
}

export const VIEWPORT_TOOL_REGISTRY: Readonly<Record<ViewportToolId, ViewportToolDescriptor>> = {
  pointer: { id: "pointer", interactionMode: "selection", interactionGroup: "viewport-primary", mutatesDocument: false, requirement: "none", futureCapability: false },
  orientation: { id: "orientation", interactionMode: "orientation", interactionGroup: "viewport-primary", mutatesDocument: true, requirement: "none", futureCapability: false },
  eraser: { id: "eraser", interactionMode: "cutting-plane", interactionGroup: "viewport-primary", mutatesDocument: true, requirement: "cutting-planes", futureCapability: false },
  sprue: { id: "sprue", interactionMode: "sprue", interactionGroup: "viewport-primary", mutatesDocument: true, requirement: "reference-geometry", futureCapability: false },
  "mold-scale": { id: "mold-scale", interactionMode: "mold-scale", interactionGroup: "viewport-primary", mutatesDocument: true, requirement: "none", futureCapability: false },
  "measure-distance": { id: "measure-distance", interactionMode: "measurement", interactionGroup: "viewport-primary", mutatesDocument: false, requirement: "none", futureCapability: false },
  line: { id: "line", interactionMode: "future", interactionGroup: "viewport-primary", mutatesDocument: false, requirement: "none", futureCapability: true },
};

export function isViewportToolAvailable(tool: ViewportToolId, context: ViewportToolContext): boolean {
  const descriptor = VIEWPORT_TOOL_REGISTRY[tool];
  if (tool === "orientation" && !getPartOrientationCapability().available) return false;
  if (descriptor.futureCapability) return false;
  if (descriptor.mutatesDocument && context.evaluationPhase === "evaluating") return false;
  if (context.workflow === "draggingPlane" && tool !== "pointer") return false;
  if (descriptor.requirement === "reference-geometry" && !context.hasReferenceGeometry) return false;
  if (descriptor.requirement === "cutting-planes" && !context.hasCuttingPlanes) return false;
  return true;
}

/**
 * Whether the currently active tool should remain selected under a new context. Unlike
 * `isViewportToolAvailable` (which also gates newly *selecting* a tool), this intentionally omits the
 * transient `evaluationPhase === "evaluating"` check: a mutating tool's own action (e.g. placing a Sprue)
 * routinely causes a brief evaluating phase, and that should not auto-deselect the tool performing it.
 */
export function isViewportToolStillActive(tool: ViewportToolId, context: ViewportToolContext): boolean {
  const descriptor = VIEWPORT_TOOL_REGISTRY[tool];
  if (tool === "orientation" && !getPartOrientationCapability().available) return false;
  if (descriptor.futureCapability) return false;
  if (context.workflow === "draggingPlane" && tool !== "pointer") return false;
  if (descriptor.requirement === "reference-geometry" && !context.hasReferenceGeometry) return false;
  if (descriptor.requirement === "cutting-planes" && !context.hasCuttingPlanes) return false;
  return true;
}
