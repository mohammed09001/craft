/**
 * The unified "Constructed Cutting Plan" orchestrator's own state -- which
 * cutting session is open and which of its two tabs is active, independent
 * of any tab's own geometry state (owned by splitFace.store.ts /
 * segmentationMode.store.ts instances). A tagged union so impossible
 * combinations (two tabs "active" at once, a panel visible with no session,
 * etc.) are unrepresentable.
 */

import type { FitAxis } from "../segmentation/fitAnalysis";
import type { ExtensionBoundaryRequest } from "../segmentation/segmentationMode.store";

/**
 * The two peer tabs the Constructed Cutting Plan panel hosts. Cutting by
 * Face reuses the singleton splitFace store directly (as it always has --
 * see CuttingSessionPanel's own doc comment for why it needs no separate
 * draft); the Segmentation tab reuses `useSegmentationModeStore` directly.
 */
export type CuttingSessionTab = "cutByFace" | "segmentation";

/**
 * Segmentation's committed inputs -- its product contract is "preserve the
 * same logical segmentation topology across a Mold Scale edit where still
 * geometrically valid." `requiredAxes` + `perAxisSegmentCount` are the
 * algorithm's own base-plan topology, captured at commit time so a later
 * Scale-triggered replan can be compared against it before being accepted:
 * a matching topology is adopted, a differing one is rejected in favor of
 * the truthful whole-K2 fallback (never silently promoted as if it were the
 * same mold). `extensionBoundaries` are the user's own added Split-by-Face
 * axes on top of that base plan (see `ExtensionBoundaryRequest`) -- replayed
 * against the fresh base plan by `regenerateSegmentationAfterScale` the same
 * way the user originally applied them; a replay that becomes geometrically
 * invalid after Scale falls back to the whole-K2 base exactly like a
 * topology mismatch does.
 */
export interface SegmentationCommitProvenance {
  readonly schemaVersion: 1;
  readonly committedAt: string;
  readonly modelGeometrySignature: string | null;
  readonly requiredAxes: readonly FitAxis[];
  readonly perAxisSegmentCount: Readonly<Record<FitAxis, number>>;
  readonly extensionBoundaries: readonly ExtensionBoundaryRequest[];
}

export type CuttingWorkflowState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "sessionOpen";
      readonly activeTab: CuttingSessionTab;
      readonly commitPhase: "editing" | "committing";
    };

export type CuttingWorkflowKind = CuttingWorkflowState["kind"];

/**
 * The one draft/document owner allowed to receive interactive cutting
 * commands for the current session state. This deliberately derives from
 * `CuttingWorkflowState`: it is not another active-mode flag.
 *
 * Consumers which render, route pointer input, or route history must use
 * this contract instead of independently interpreting `activeTab`. That
 * keeps a segmentation tab from accidentally mutating hidden singleton
 * Split Face data while a different owner holds the session.
 */
export type CuttingSessionInteractionOwner =
  | "singleton-split-face"
  | "segmentation";

export function getCuttingSessionInteractionOwner(
  state: CuttingWorkflowState,
): CuttingSessionInteractionOwner {
  if (state.kind === "idle" || state.activeTab === "cutByFace") {
    return "singleton-split-face";
  }
  return "segmentation";
}

/**
 * The canonical Split Face store remains interactive while no session is
 * open or while Cut by Face owns the open session. Segmentation must never
 * fall through to its hidden cutting planes.
 */
export function canUseSingletonSplitFaceInteraction(
  state: CuttingWorkflowState,
): boolean {
  return getCuttingSessionInteractionOwner(state) === "singleton-split-face";
}
