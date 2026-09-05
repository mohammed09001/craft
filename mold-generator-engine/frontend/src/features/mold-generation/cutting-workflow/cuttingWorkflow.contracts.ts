/**
 * The unified "Constructed Cutting Plan" orchestrator's own state -- which
 * cutting session is open and which of its three tabs is active,
 * independent of any tab's own geometry state (owned by splitFace.store.ts /
 * segmentationMode.store.ts instances). A tagged union so impossible
 * combinations (two tabs "active" at once, a panel visible with no session,
 * etc.) are unrepresentable.
 */

import type { Bounds3, CuttingPlaneRecord } from "../split-face/splitFace.contracts";
import type { FitAxis } from "../segmentation/fitAnalysis";
import type { ExtensionBoundaryRequest } from "../segmentation/segmentationMode.store";

/**
 * The three peer tabs the Constructed Cutting Plan panel hosts. Cutting by
 * Face reuses the singleton splitFace store directly (as it always has --
 * see CuttingSessionPanel's own doc comment for why it needs no separate
 * draft); the two Segmentation tabs each reuse their own existing draft
 * (`useSegmentationModeStore` for One Mold, `automaticDraft`/`manualDraft`
 * for More Molds).
 */
export type CuttingSessionTab = "cutByFace" | "oneMold" | "moreMolds";

export type MoreMoldsDraftKind = "automatic" | "manual";

export interface PrinterVolumeSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Automatic's committed inputs -- restoration re-runs planning against current model/printer state (deterministic), validated first against these. */
export interface AutomaticCommitProvenanceDetail {
  readonly settingsSignature: string;
}

/**
 * Manual's committed INPUTS only (not the computed mesh/definition output).
 * Restoration replays these into a fresh draft, then recomputes geometry
 * (createMoldParts) against current model state -- never carries over
 * stale mesh/worker-result data.
 */
export interface ManualCommitProvenanceDetail {
  readonly modelId: string;
  readonly selectionBoxBounds: Bounds3;
  readonly clearanceMm: number;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
}

/**
 * Written only when a "make it as more molds" session commits (Done), never
 * inferred from visual/render state -- read back when the committed result
 * is reopened to decide which strategy (Automatic/Manual) restores as the
 * editable draft. Exactly one of `automatic`/`manual` is non-null, matching
 * `producedBy`.
 */
export interface MoreMoldsCommitProvenance {
  readonly schemaVersion: 1;
  readonly producedBy: MoreMoldsDraftKind;
  readonly committedAt: string;
  /** The imported model's own geometry identity at commit time (the singleton splitFace store's partGeometrySignature) -- ties the committed result to a specific model, independent of which draft produced it. Reopening is blocked if this no longer matches the current model. */
  readonly modelGeometrySignature: string | null;
  readonly printerVolumeAtCommit: PrinterVolumeSnapshot | null;
  readonly automatic: AutomaticCommitProvenanceDetail | null;
  readonly manual: ManualCommitProvenanceDetail | null;
}

/**
 * One Mold's committed inputs -- unlike More Molds Automatic (which always
 * fully replans and accepts whatever piece count results), One Mold's
 * product contract is "preserve the same logical segmentation topology
 * across a Mold Scale edit where still geometrically valid." `requiredAxes`
 * + `perAxisSegmentCount` are the algorithm's own base-plan topology,
 * captured at commit time so a later Scale-triggered replan can be compared
 * against it before being accepted: a matching topology is adopted, a
 * differing one is rejected in favor of the truthful whole-K2 fallback
 * (never silently promoted as if it were the same mold). `extensionBoundaries`
 * are the user's own added Split-by-Face axes on top of that base plan (see
 * `ExtensionBoundaryRequest`) -- replayed against the fresh base plan by
 * `regenerateSegmentationAfterScale` the same way the user originally
 * applied them; a replay that becomes geometrically invalid after Scale
 * falls back to the whole-K2 base exactly like a topology mismatch does.
 */
export interface OneMoldCommitProvenance {
  readonly schemaVersion: 1;
  readonly committedAt: string;
  readonly modelGeometrySignature: string | null;
  readonly requiredAxes: readonly FitAxis[];
  readonly perAxisSegmentCount: Readonly<Record<FitAxis, number>>;
  readonly extensionBoundaries: readonly ExtensionBoundaryRequest[];
}

/** Why a committed more-molds result could not be safely reopened -- surfaced to the user instead of guessing/silently discarding it. */
export type MoreMoldsReopenBlockedReason =
  | "unsupported_schema_version"
  | "missing_provenance_detail"
  | "stale_model_geometry"
  | "missing_cutting_definitions"
  | "incompatible_printer_dimensions"
  | "model_unavailable";

/**
 * Reopening a committed More Molds result is fully synchronous from this
 * state machine's point of view (switching to the "moreMolds" tab validates
 * provenance and restores/blocks in one tick -- the only async work,
 * createMoldParts' geometry regeneration for Manual, is observed through
 * the draft's own workflow field, not a separate top-level state), so there
 * is deliberately no distinct "reopening" kind here.
 */
export type CuttingWorkflowState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "sessionOpen";
      readonly activeTab: CuttingSessionTab;
      readonly moreMoldsActiveDraft: MoreMoldsDraftKind;
      readonly commitPhase: "editing" | "committing";
    };

export type CuttingWorkflowKind = CuttingWorkflowState["kind"];

/**
 * The one draft/document owner allowed to receive interactive cutting
 * commands for the current session state. This deliberately derives from
 * `CuttingWorkflowState`: it is not another active-mode flag.
 *
 * Consumers which render, route pointer input, or route history must use
 * this contract instead of independently interpreting `activeTab` and
 * `moreMoldsActiveDraft`. That keeps a segmentation tab from accidentally
 * mutating hidden singleton Split Face data while a different draft owns the
 * session.
 */
export type CuttingSessionInteractionOwner =
  | "singleton-split-face"
  | "one-mold-segmentation"
  | "automatic-more-molds-segmentation"
  | "manual-more-molds-split-face";

export function getCuttingSessionInteractionOwner(
  state: CuttingWorkflowState,
): CuttingSessionInteractionOwner {
  if (state.kind === "idle" || state.activeTab === "cutByFace") {
    return "singleton-split-face";
  }
  if (state.activeTab === "oneMold") {
    return "one-mold-segmentation";
  }
  return state.moreMoldsActiveDraft === "manual"
    ? "manual-more-molds-split-face"
    : "automatic-more-molds-segmentation";
}

/** True only while the Manual More Molds Split Face draft owns interaction. */
export function isManualMoreMoldsInteractionOwner(
  state: CuttingWorkflowState,
): boolean {
  return getCuttingSessionInteractionOwner(state) === "manual-more-molds-split-face";
}

/**
 * The canonical Split Face store remains interactive while no session is
 * open or while Cut by Face owns the open session. Segmentation drafts must
 * never fall through to its hidden cutting planes.
 */
export function canUseSingletonSplitFaceInteraction(
  state: CuttingWorkflowState,
): boolean {
  return getCuttingSessionInteractionOwner(state) === "singleton-split-face";
}
