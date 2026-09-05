import { create, type StoreApi, type UseBoundStore } from "zustand";

import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import { createCavityWorkerRunner } from "../cavity-generation/cavityGeneration.workerClient";
import { createDerivedMoldEvaluationRunner } from "../workflow/derivedMoldEvaluation.workerClient";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import {
  createSplitFaceStoreCreator,
  useSplitFaceStore,
  type SplitFaceState,
} from "../split-face/splitFace.store";
import {
  createSegmentationModeStoreCreator,
  useSegmentationModeStore,
  type SegmentationModeStore,
} from "../segmentation/segmentationMode.store";
import { createSegmentationExecutionRunner } from "../segmentation/execution/segmentationExecution.workerClient";
import type { SegmentationExecutionResult } from "../segmentation/execution/segmentationExecution.contracts";
import type { SegmentationMode, SegmentationPlan } from "../segmentation/domain/segmentation.contracts";
import { readCurrentSegmentationSourceSnapshot } from "../segmentation/application/segmentationSourceSnapshot";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import {
  computeEffectivePlan,
  deriveAxisOwnership,
  isAxisAvailableForExtension,
  suggestExtensionAxisPosition,
  type Axis3,
  type AxisOwnership,
} from "../segmentation";
import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";
import {
  CANONICAL_FACE_FOR_AXIS,
  worldToNormalizedPosition,
} from "../split-face/splitFace.geometry";
import {
  isManualMoreMoldsInteractionOwner,
  type CuttingSessionTab,
  type CuttingWorkflowState,
  type MoreMoldsCommitProvenance,
  type MoreMoldsDraftKind,
  type MoreMoldsReopenBlockedReason,
  type OneMoldCommitProvenance,
} from "./cuttingWorkflow.contracts";

type SegmentationDraftStore = UseBoundStore<StoreApi<SegmentationModeStore>>;
type SplitFaceDraftStore = UseBoundStore<StoreApi<SplitFaceState>>;

// Draft instances are created ONCE and live for the app's lifetime -- a
// React hook (useAutomaticDraftStore/useManualDraftStore below) cannot be
// conditionally created/destroyed across renders without violating the
// Rules of Hooks, since Viewport.tsx needs to read whichever draft is
// active reactively. "Discarding" a draft means resetting it to idle
// (resetStrategy / clearForModelReplacement, both of which already cancel
// any in-flight worker request), never destroying the instance.
// Automatic's own segmentation-execution runner, isolated from the module-
// level singleton `useSegmentationModeStore` (still used by the panel's own
// "oneMold" tab) for the same reason Manual's draft below owns its own
// derivedMoldEvaluation/cavity runners: a shared runner has a single cancel
// slot, so an Automatic request in one session could silently cancel an
// unrelated in-flight execution still owned by the singleton (e.g. a
// lingering One Mold request from earlier in the same session, before the
// user switched tabs), and vice versa.
const automaticSegmentationExecutionRunner = createSegmentationExecutionRunner();
const automaticDraft: SegmentationDraftStore = create(
  createSegmentationModeStoreCreator({
    runSegmentationExecutionInWorker: automaticSegmentationExecutionRunner,
    cancelActiveSegmentationExecution: (reason) =>
      automaticSegmentationExecutionRunner.cancel(reason),
  }),
) as SegmentationDraftStore;

// Each runner instance's own `.cancel` must be used to cancel exactly that
// instance's in-flight work -- a different instance's `.cancel` would be a
// silent no-op, so the run function and its cancel are always derived from
// the same object, never two separate `create...Runner()` calls.
const manualDerivedMoldEvaluationRunner = createDerivedMoldEvaluationRunner();
const manualCavityRunner = createCavityWorkerRunner();

const manualDraft: SplitFaceDraftStore = create(
  createSplitFaceStoreCreator({
    runDerivedMoldEvaluation: manualDerivedMoldEvaluationRunner,
    cancelDerivedMoldEvaluation: (reason) => manualDerivedMoldEvaluationRunner.cancel(reason),
    runCavityGenerationInWorker: manualCavityRunner,
    cancelActiveCavityGeneration: (reason) => manualCavityRunner.cancel(reason),
  }),
) as SplitFaceDraftStore;

// Exported as the store hook objects themselves (callable as a React hook,
// with .getState()/.setState()/.subscribe() static methods for non-React
// reads), matching every other store in this codebase (e.g. useSplitFaceStore).
export const useAutomaticDraftStore = automaticDraft;
export const useManualDraftStore = manualDraft;

/**
 * Captured by openSession() before any tab can touch the singleton --
 * restored verbatim by cancelSession() so a cancelled session leaves the
 * singleton exactly as it was before the panel opened, regardless of which
 * tab(s) were visited or how far Cut by Face's own direct edits (it has no
 * separate draft -- see CuttingSessionPanel's doc comment) got before
 * Cancel. A full-object snapshot (not an enumerated field subset) is
 * deliberate: it naturally reverts any undo-stack entries pushed meanwhile
 * too, which a narrower field-by-field restore would miss.
 */
let preSessionSplitFaceSnapshot: SplitFaceState | null = null;

/**
 * Whether this session has already started the One Mold / More Molds tab's
 * own draft at least once -- explicit per-session flags, reset by
 * openSession, rather than inferring "not yet initialized" from the
 * draft's own idle shape (mode `null` / workflow `"modelReady"`). A winning
 * draft deliberately keeps its settled state after commitActiveTab (see its
 * own comment), so that shape is NOT a reliable "never touched" signal --
 * reopening a session after a commit would otherwise misread the winning
 * draft's own retained result as "already initialized this session" and
 * skip re-running requestMode/the reopen-provenance check entirely.
 */
let oneMoldTabInitializedThisSession = false;
let moreMoldsTabInitializedThisSession = false;

function ensureOneMoldTabInitialized() {
  if (oneMoldTabInitializedThisSession) return;
  oneMoldTabInitializedThisSession = true;
  useSegmentationModeStore.getState().requestMode("make-as-one-mold");
}

/**
 * Cut by Face has no panel-local selection state: this is the canonical
 * split-face transition that makes the viewport's existing face-selection
 * gate active. Re-entering an already editable Cut by Face draft must not
 * manufacture history or clear its current planes.
 */
function activateCutByFaceSelection() {
  const splitFace = useSplitFaceStore.getState();
  if (splitFace.workflow === "selectingFaces" || splitFace.workflow === "planesReady") return;
  splitFace.enterSelection();
}

/**
 * The single authoritative check for "is Manual the active, visible,
 * interactive draft right now" -- both Viewport.tsx's interaction/rendering
 * redirection and the panel's own More Molds tab derive from this one
 * definition, rather than each re-deriving `state.kind`/`activeTab`
 * independently.
 */
export function useIsManualDraftActive(): boolean {
  return useCuttingWorkflowStore((s) =>
    isManualMoreMoldsInteractionOwner(s.state),
  );
}

/**
 * Whichever segmentation draft currently owns axis decisions -- the
 * singleton for the One Mold tab (which, like Cut by Face, drives its own
 * dedicated store directly rather than through the draft-isolation system),
 * or the Automatic draft while the More Molds tab's Automatic sub-strategy
 * is active. Manual has no algorithm-generated core plan to extend (its own
 * faces are the section intent), so it is intentionally excluded here.
 */
function activeSegmentationDraft(): SegmentationDraftStore | null {
  const state = useCuttingWorkflowStore.getState().state;
  if (state.kind !== "sessionOpen") return null;
  if (state.activeTab === "oneMold") return useSegmentationModeStore;
  if (state.activeTab === "moreMolds" && state.moreMoldsActiveDraft === "automatic") {
    return automaticDraft;
  }
  return null;
}

/**
 * `executeAcceptedPlan` has already accepted this exact source identity
 * before reporting an executed result. Re-read it synchronously at the
 * promotion boundary so the definition travelling with the bodies is the
 * same authoritative mold-local frame, K1, and K2 used by execution.
 */
function definitionForExecutedSegmentation(
  result: Extract<SegmentationExecutionResult, { readonly status: "executed" }>,
): ReferenceMoldDefinition | null {
  const source = readCurrentSegmentationSourceSnapshot();
  if (source.status !== "ready") return null;
  const request = result.executionRequest;
  const identity = source.snapshot.identity;
  if (
    identity.resultRequestId !== request.committedResultRequestId ||
    identity.documentRevision !== request.documentRevision ||
    identity.documentFingerprint !== request.documentFingerprint
  ) {
    return null;
  }
  return source.definition;
}

/**
 * A single stable empty-array reference for every "no axes" case below --
 * `plan?.requiredAxes ?? []` would otherwise allocate a fresh array on every
 * selector invocation, which breaks Zustand's reference-equality snapshot
 * check and causes an infinite render loop ("Maximum update depth
 * exceeded") the moment any component reads this through a store selector.
 */
const NO_AXES: readonly Axis3[] = [];

/** Non-reactive; for use inside action functions, not component rendering (see useActiveAxisOwnership for that). */
function currentAxisOwnership(): AxisOwnership {
  const draft = activeSegmentationDraft();
  if (draft === null) return deriveAxisOwnership(NO_AXES, NO_AXES);
  const state = draft.getState();
  return deriveAxisOwnership(
    state.plan?.requiredAxes ?? NO_AXES,
    state.extensionBoundaries.map((extension) => extension.axis),
  );
}

/**
 * Reactive axis-ownership read for rendering (e.g. disabling an axis-picker
 * button). Always subscribes to both the singleton and the Automatic draft
 * unconditionally (Rules of Hooks), then picks whichever is authoritative
 * for the current cutting-workflow state -- same pattern Viewport.tsx
 * already uses for singleton-vs-draft reads. Each selector returns a raw,
 * store-owned reference (the plan object, the extensionBoundaries array)
 * rather than a `.map()`-derived array, so Zustand's snapshot comparison
 * stays stable; the axis list itself is derived afterward, outside the
 * selector, where a fresh array every render is harmless.
 */
export function useActiveAxisOwnership(): AxisOwnership {
  const workflowState = useCuttingWorkflowStore((s) => s.state);
  const singletonPlan = useSegmentationModeStore((s) => s.plan);
  const singletonExtensions = useSegmentationModeStore((s) => s.extensionBoundaries);
  const automaticPlan = useAutomaticDraftStore((s) => s.plan);
  const automaticExtensions = useAutomaticDraftStore((s) => s.extensionBoundaries);

  if (workflowState.kind !== "sessionOpen") return deriveAxisOwnership(NO_AXES, NO_AXES);
  if (workflowState.activeTab === "oneMold") {
    return deriveAxisOwnership(
      singletonPlan?.requiredAxes ?? NO_AXES,
      singletonExtensions.map((extension) => extension.axis),
    );
  }
  if (workflowState.activeTab === "moreMolds" && workflowState.moreMoldsActiveDraft === "automatic") {
    return deriveAxisOwnership(
      automaticPlan?.requiredAxes ?? NO_AXES,
      automaticExtensions.map((extension) => extension.axis),
    );
  }
  return deriveAxisOwnership(NO_AXES, NO_AXES);
}

/**
 * Adds a user extension boundary on `axis` to whichever segmentation draft
 * currently owns axis decisions (see activeSegmentationDraft). Rejects
 * (returns false, no state change) if no draft is active or the axis is
 * already used -- validated both here and, redundantly but safely, inside
 * applyExtensionBoundary itself. The initial position is the algorithm's
 * own suggestion (suggestExtensionAxisPosition), evaluated against the same
 * authoritative source snapshot planning already uses -- never an arbitrary
 * default.
 */
export function addSegmentationExtensionAxis(axis: Axis3): boolean {
  const draft = activeSegmentationDraft();
  if (draft === null) return false;
  const ownership = currentAxisOwnership();
  if (!isAxisAvailableForExtension(ownership, axis)) return false;
  const source = readCurrentSegmentationSourceSnapshot();
  if (source.status !== "ready") return false;
  const coordinateMm = suggestExtensionAxisPosition(source.snapshot, axis);
  const accepted = draft.getState().applyExtensionBoundary(axis, coordinateMm);
  if (!accepted) return false;

  // Visual mirror only -- a real, draggable CuttingPlaneRecord on the
  // singleton splitFace store, the same store Viewport.tsx already renders
  // cutting planes from while a segmentation tab owns the model (see
  // Viewport.tsx's cuttingPlanes prop, filtered to extension provenance in
  // that state). The execution-authoritative coordinate lives on `draft`
  // above, set independently of whether this visual step succeeds.
  const k1 = useModelSelectionStore.getState().selection.selectionBoxBounds;
  if (k1 !== undefined) {
    const faceId = CANONICAL_FACE_FOR_AXIS[axis];
    const normalizedPosition = worldToNormalizedPosition(k1, axis, coordinateMm);
    useSplitFaceStore.getState().addExtensionCuttingPlane(faceId, ownership.algorithmUsedAxes, normalizedPosition);
  }
  return true;
}

export function removeSegmentationExtensionAxis(axis: Axis3): void {
  activeSegmentationDraft()?.getState().removeExtensionBoundary(axis);
  const faceId = CANONICAL_FACE_FOR_AXIS[axis];
  const existingVisual = useSplitFaceStore
    .getState()
    .cuttingPlanes.find((plane) => plane.sourceFaceId === faceId);
  if (existingVisual !== undefined && existingVisual.provenance.startsWith("segmentation-extension")) {
    useSplitFaceStore.getState().removeSplitFace(faceId);
  }
}

/**
 * Forwards a user drag's new world coordinate (from splitFace's own
 * commitPlaneDrag, in the same absolute grounded-world mm space
 * segmentation's own aggregateBounds already uses -- no unit/frame
 * conversion needed, see the investigation this design is based on) to
 * whichever segmentation draft currently owns axis decisions. Never
 * rejects on validity -- see moveExtensionBoundary's own doc comment.
 */
export function moveSegmentationExtensionAxis(axis: Axis3, coordinateMm: number): boolean {
  const draft = activeSegmentationDraft();
  if (draft === null) return false;
  return draft.getState().moveExtensionBoundary(axis, coordinateMm);
}

function sameTopology(
  actual: Pick<SegmentationPlan, "requiredAxes" | "perAxisSegmentCount">,
  expected: Pick<OneMoldCommitProvenance, "requiredAxes" | "perAxisSegmentCount">,
): boolean {
  const axes = ["x", "y", "z"] as const;
  const actualAxes = new Set(actual.requiredAxes);
  const expectedAxes = new Set(expected.requiredAxes);
  if (actualAxes.size !== expectedAxes.size) return false;
  for (const axis of actualAxes) if (!expectedAxes.has(axis)) return false;
  return axes.every(
    (axis) =>
      (actual.perAxisSegmentCount[axis] ?? 1) === (expected.perAxisSegmentCount[axis] ?? 1),
  );
}

/**
 * Re-derives the current Segmentation-promoted result after Mold Scale has
 * already committed a new clearance -- called exactly once per completed
 * Scale gesture (pointer-up or numeric Enter), never per pointer-move (see
 * Viewport.tsx's onMoldScaleCommit wiring). A no-op for Cut by Face/Manual
 * More Molds (their own `setClearanceMm`/`commitClearanceEdit` live-rebuild
 * already handles them) and for a mold with no committed segmentation
 * lineage at all.
 *
 * One Mold: replans against the current (post-Scale) K2, then replays each
 * committed extension boundary (see OneMoldCommitProvenance) on top of that
 * fresh base plan the same way the user originally applied it. Adopts the
 * result only if the base topology (requiredAxes + perAxisSegmentCount)
 * matches what was originally committed -- preserving the product contract
 * that One Mold never silently changes piece count/axis choice -- and every
 * extension boundary re-applies and remains valid. A topology mismatch, an
 * extension boundary that no longer applies, or any planning/execution
 * failure all leave the truthful whole-K2 base (already current from the
 * Scale commit itself) as the final result, with the One Mold draft's own
 * phase/result as the honest record of why -- never silently retried, never
 * faked as success.
 *
 * Automatic More Molds: always replans and adopts whatever piece count
 * results (genuinely adaptive, per its own product contract) -- printer fit
 * is re-evaluated against the current K2 exactly as a fresh Automatic
 * session would.
 *
 * Never calls requestMode/acceptPlan/executeAcceptedPlan from Viewport.tsx
 * itself (see its own "read-only" doc comment) -- this is the one
 * orchestrator allowed to drive them outside an open Cutting Plan session,
 * matching how commitActiveTab already does for an interactive commit.
 */
export async function regenerateSegmentationAfterScale(): Promise<void> {
  const splitFace = useSplitFaceStore.getState();
  if (splitFace.definition?.segmentationLineage !== true) return;

  // Marks the singleton's mold body source as "temporary whole-K2 base,
  // final segmented bodies pending" for the whole lifetime of this replan --
  // a reference count (not a boolean) because a second Scale gesture can
  // start its own regenerateSegmentationAfterScale call before this one's
  // async tail (executeAcceptedPlan) resolves; createCavity's own guard
  // checks this independently of any UI disabled state (see its doc
  // comment). Always paired via finally so every exit path -- including
  // every early "not required" return below -- clears its own increment.
  useSplitFaceStore.getState().beginSegmentationRegeneration();
  try {
    const cuttingWorkflow = useCuttingWorkflowStore.getState();
    const oneMoldProvenance = cuttingWorkflow.lastOneMoldProvenance;
    const isAutomatic = cuttingWorkflow.lastMoreMoldsProvenance?.producedBy === "automatic";
    const isOneMold = oneMoldProvenance !== null;
    if (!isOneMold && !isAutomatic) return;

    const draft: SegmentationDraftStore = isOneMold ? useSegmentationModeStore : automaticDraft;
    const mode: SegmentationMode = isOneMold ? "make-as-one-mold" : "make-as-more-molds";
    const expectedPriorRevision = splitFace.document.revision;

    const planned = draft.getState().requestMode(mode);
    // "not-required": the whole-K2 base already current from the Scale commit
    // IS the correct final result at this size -- nothing further to promote.
    // Any other non-"planned" status (failed/stale/unsupported) leaves that
    // same truthful base current, with the draft's own result as the reason.
    if (planned.status !== "planned") return;

    // Replays each committed extension boundary against the fresh base plan,
    // exactly as the user originally applied it, BEFORE the topology check
    // below -- `oneMoldProvenance.requiredAxes`/`perAxisSegmentCount` were
    // captured from the EFFECTIVE (base + extensions) plan at commit time
    // (see commitActiveTab), so the comparison must use the same effective
    // plan, not the pre-extension base. applyExtensionBoundary rejects
    // outright if the axis is no longer available; acceptPlan below already
    // validates the resulting effective plan (protected-region conflicts,
    // out-of-bounds coordinates) before anything executes. Either failure
    // falls through to the same whole-K2 fallback as a topology mismatch,
    // never silently dropping the extension from the result.
    if (isOneMold) {
      for (const extension of oneMoldProvenance.extensionBoundaries) {
        if (!draft.getState().applyExtensionBoundary(extension.axis, extension.coordinateMm)) return;
      }
      const effectivePlan = computeEffectivePlan(draft.getState().plan, draft.getState().extensionBoundaries);
      if (effectivePlan === null || !sameTopology(effectivePlan, oneMoldProvenance)) return;
    }

    if (!draft.getState().acceptPlan()) return;
    const executed = await draft.getState().executeAcceptedPlan();
    if (executed.status !== "executed") return;

    // Belt-and-suspenders alongside promoteReplannedSegmentationResult's own
    // atomic revision check: avoids reading a now-stale source snapshot after
    // a superseding edit landed while execution was in flight.
    if (useSplitFaceStore.getState().document.revision !== expectedPriorRevision) return;

    const sourceDefinition = definitionForExecutedSegmentation(executed);
    if (sourceDefinition === null) return;

    useSplitFaceStore.getState().promoteReplannedSegmentationResult({
      expectedPriorRevision,
      sourceSignature: isOneMold
        ? oneMoldProvenance.modelGeometrySignature
        : (cuttingWorkflow.lastMoreMoldsProvenance?.modelGeometrySignature ?? null),
      sourceDefinition,
      bodies: executed.bodies,
      warnings: executed.issues.map((issue) => issue.message),
    });
  } finally {
    useSplitFaceStore.getState().endSegmentationRegeneration();
  }
}

/**
 * Whether the currently active tab's segmentation plan (base + extension
 * boundaries) is valid -- for gating Done. Returns true when the active tab
 * has no algorithm-generated plan to validate (Cut by Face, More Molds
 * Manual), since this check does not apply there; the caller combines it
 * with whatever other gates already apply.
 */
export function useIsActiveSegmentationPlanValid(): boolean {
  const workflowState = useCuttingWorkflowStore((s) => s.state);
  const singletonPlan = useSegmentationModeStore((s) => s.plan);
  const singletonExtensions = useSegmentationModeStore((s) => s.extensionBoundaries);
  const automaticPlan = useAutomaticDraftStore((s) => s.plan);
  const automaticExtensions = useAutomaticDraftStore((s) => s.extensionBoundaries);

  if (workflowState.kind !== "sessionOpen") return true;
  if (workflowState.activeTab === "oneMold") {
    if (singletonPlan === null) return true;
    return computeEffectivePlan(singletonPlan, singletonExtensions)?.validation.status === "planning-valid";
  }
  if (workflowState.activeTab === "moreMolds" && workflowState.moreMoldsActiveDraft === "automatic") {
    if (automaticPlan === null) return true;
    return computeEffectivePlan(automaticPlan, automaticExtensions)?.validation.status === "planning-valid";
  }
  return true;
}

/**
 * Whether a committed more-molds result is still safe to restore as an
 * editable draft. Every check is evidence-based (compared against current
 * store state), never a guess -- an unsupported/missing/stale provenance
 * blocks reopening with a specific reason instead of silently starting
 * fresh or resurrecting something that may no longer be valid.
 */
function validateProvenanceForReopen(
  provenance: MoreMoldsCommitProvenance,
): { readonly ok: true } | { readonly ok: false; readonly reason: MoreMoldsReopenBlockedReason } {
  if (provenance.schemaVersion !== 1) {
    return { ok: false, reason: "unsupported_schema_version" };
  }

  const currentModelSignature = useSplitFaceStore.getState().partGeometrySignature;
  if (currentModelSignature === null) {
    return { ok: false, reason: "model_unavailable" };
  }
  if (
    provenance.modelGeometrySignature === null ||
    provenance.modelGeometrySignature !== currentModelSignature
  ) {
    return { ok: false, reason: "stale_model_geometry" };
  }

  if (provenance.producedBy === "automatic") {
    if (provenance.automatic === null) {
      return { ok: false, reason: "missing_provenance_detail" };
    }
    const currentPrinterVolume = usePrinterBuildVolumeStore.getState().dimensions;
    const printerMatches =
      provenance.printerVolumeAtCommit !== null &&
      currentPrinterVolume !== null &&
      provenance.printerVolumeAtCommit.x === currentPrinterVolume.x &&
      provenance.printerVolumeAtCommit.y === currentPrinterVolume.y &&
      provenance.printerVolumeAtCommit.z === currentPrinterVolume.z;
    if (!printerMatches) {
      return { ok: false, reason: "incompatible_printer_dimensions" };
    }
    return { ok: true };
  }

  if (provenance.manual === null) {
    return { ok: false, reason: "missing_provenance_detail" };
  }
  if (provenance.manual.cuttingPlanes.length === 0) {
    return { ok: false, reason: "missing_cutting_definitions" };
  }
  return { ok: true };
}

interface CuttingWorkflowStore {
  readonly state: CuttingWorkflowState;
  readonly lastMoreMoldsProvenance: MoreMoldsCommitProvenance | null;
  /**
   * One Mold's committed inputs, written only when the "oneMold" tab
   * commits -- mirrors `lastMoreMoldsProvenance`'s "any other tab's
   * successful commit supersedes and clears it" rule (see commitActiveTab).
   * Consumed by `regenerateSegmentationAfterScale` to decide whether the
   * currently promoted result is One-Mold-sourced and, if so, what topology
   * a Scale-triggered replan must match to be accepted.
   */
  readonly lastOneMoldProvenance: OneMoldCommitProvenance | null;
  /** Set only when switching to the More Molds tab refuses to reopen a committed result -- the committed provenance itself is never discarded because of this. */
  readonly lastReopenBlockedReason: MoreMoldsReopenBlockedReason | null;
  /**
   * Set only when commitActiveTab returns false -- a human-readable reason
   * the active tab could not be committed, so the UI can show it instead of
   * leaving Done looking unresponsive. Cleared on session entry, on
   * switching tabs, and on the next successful commit.
   */
  readonly lastCommitBlockedReason: string | null;
  /**
   * Opens the unified Constructed Cutting Plan panel, defaulting to the Cut
   * by Face tab (the singleton's own current state, unmodified -- no
   * snapshot-then-clear step is needed for it the way More Molds' drafts
   * need one, since Cut by Face has no separate draft to seed). Captures
   * `preSessionSplitFaceSnapshot` unconditionally so Cancel can restore the
   * singleton exactly regardless of which tab(s) get edited afterward.
   * No-op outside "idle".
   */
  openSession(): void;
  /**
   * Switches which tab is active. Neither tab's own draft state or history
   * is touched by switching -- exactly one initialization happens per tab
   * per session, on first visit (see ensureOneMoldTabInitialized and the
   * More Molds reopen-or-fresh-start branch below), so returning to a
   * previously-visited tab resumes exactly where the user left it. No-op
   * outside an editing session, or if `tab` is already active.
   */
  setActiveTab(tab: CuttingSessionTab): void;
  /** Switches which draft is visible/interactive within the More Molds tab. No-op outside that tab. */
  switchToAutomatic(): void;
  switchToManual(): void;
  /**
   * Commits only the currently active tab's result into the singleton --
   * the sole shared committed-body state every downstream tool (Create
   * Cavity, Sprue, Glass/Ghosted) already reads -- then closes the panel.
   * `modelId`/`k1` are required for Cut by Face and (when Manual is active)
   * More Molds; `sourceSignature` is required for the One Mold tab, so its
   * promoted definition satisfies Create Cavity's existing precondition the
   * same way a committed More Molds Automatic result already does. Returns
   * false without transitioning if the active tab could not reach a valid,
   * committable result -- the panel stays open so the user can see why
   * (lastCommitBlockedReason) and retry.
   */
  commitActiveTab(
    modelId?: string,
    k1?: Bounds3,
    sourceSignature?: string | null,
  ): Promise<boolean>;
  /**
   * Discards the entire open session -- commits nothing, promotes nothing
   * into the singleton, regardless of which tab(s) were visited or edited --
   * and returns to idle exactly as if the panel had never been opened.
   * Cancels every draft's in-flight worker requests, resets all of them to
   * idle, restores the singleton to its pre-session snapshot (see
   * `preSessionSplitFaceSnapshot`), resets the active viewport tool to
   * Pointer, and clears session-local blocked reasons.
   * `lastMoreMoldsProvenance` is never touched. No-op (idempotent) unless
   * currently editing -- in particular, a no-op while a commit is already
   * "committing", so Cancel can never race a Done that has already begun
   * its irreversible promotion.
   */
  cancelSession(): void;
}

const idle: CuttingWorkflowState = { kind: "idle" };

function resetBothMoreMoldsDrafts() {
  automaticDraft.getState().resetStrategy();
  manualDraft.getState().clearForModelReplacement();
}

/**
 * A leftover viewport tool from a previous tab (e.g. Sprue, Eraser,
 * Orientation) must not stay live once the active tab changes -- its
 * interaction targets a specific draft/the singleton, which becomes inert
 * for a different tab (see Viewport.tsx's tab-gated routing), so a stale
 * tool selection would otherwise silently mutate hidden state with no
 * visible affordance. Must be called AFTER the state transition has already
 * committed, not before: calling it first creates a real (if brief)
 * intermediate render where activeTool has already changed but the new tab
 * hasn't yet, during which the previous tab's own guard sees a stale read.
 */
function resetActiveToolForTabChange() {
  useViewportToolStore.getState().resetActiveTool();
}

/**
 * Enters (or re-enters) the More Molds tab: with no prior committed result,
 * starts both drafts fresh (Automatic active by default); with a committed
 * result, inspects its provenance and, if still valid, restores the
 * originating strategy as the active, editable draft (from authoritative
 * committed inputs, not stale transient geometry) and resets the other to a
 * clean idle draft. If invalid/stale, refuses to restore it and records why
 * in `lastReopenBlockedReason`, preserving the committed result untouched,
 * and starts Automatic fresh instead so the tab is still usable.
 */
function initializeMoreMoldsTab(
  get: () => CuttingWorkflowStore,
  set: (partial: Partial<CuttingWorkflowStore>) => void,
): MoreMoldsDraftKind {
  const provenance = get().lastMoreMoldsProvenance;
  if (provenance !== null) {
    const validation = validateProvenanceForReopen(provenance);
    if (!validation.ok) {
      set({ lastReopenBlockedReason: validation.reason });
    } else {
      resetBothMoreMoldsDrafts();
      if (provenance.producedBy === "automatic") {
        automaticDraft.getState().requestMode("make-as-more-molds");
        set({ lastReopenBlockedReason: null });
        return "automatic";
      }
      // manual -- already validated non-null and non-empty above.
      const manual = provenance.manual!;
      manualDraft.getState().seedCuttingPlanesForReopen(manual.cuttingPlanes, manual.clearanceMm);
      void manualDraft.getState().createMoldParts(manual.modelId, manual.selectionBoxBounds);
      set({ lastReopenBlockedReason: null });
      return "manual";
    }
  }
  resetBothMoreMoldsDrafts();
  automaticDraft.getState().requestMode("make-as-more-molds");
  return "automatic";
}

export const useCuttingWorkflowStore = create<CuttingWorkflowStore>((set, get) => ({
  state: idle,
  lastMoreMoldsProvenance: null,
  lastOneMoldProvenance: null,
  lastReopenBlockedReason: null,
  lastCommitBlockedReason: null,
  openSession: () => {
    if (get().state.kind !== "idle") return;
    preSessionSplitFaceSnapshot = useSplitFaceStore.getState();
    oneMoldTabInitializedThisSession = false;
    moreMoldsTabInitializedThisSession = false;
    set({
      state: {
        kind: "sessionOpen",
        activeTab: "cutByFace",
        moreMoldsActiveDraft: "automatic",
        commitPhase: "editing",
      },
      lastReopenBlockedReason: null,
      lastCommitBlockedReason: null,
    });
    activateCutByFaceSelection();
    resetActiveToolForTabChange();
  },
  setActiveTab: (tab) => {
    const before = get();
    if (before.state.kind !== "sessionOpen" || before.state.commitPhase !== "editing") return;
    if (before.state.activeTab === tab) return;

    let moreMoldsActiveDraft = before.state.moreMoldsActiveDraft;
    if (tab === "oneMold") {
      ensureOneMoldTabInitialized();
    } else if (tab === "moreMolds" && !moreMoldsTabInitializedThisSession) {
      moreMoldsTabInitializedThisSession = true;
      moreMoldsActiveDraft = initializeMoreMoldsTab(get, (partial) => set(partial));
    }

    set({
      state: { ...before.state, activeTab: tab, moreMoldsActiveDraft },
      lastCommitBlockedReason: null,
    });
    if (tab === "cutByFace") activateCutByFaceSelection();
    resetActiveToolForTabChange();
  },
  switchToAutomatic: () =>
    set((s) =>
      s.state.kind === "sessionOpen" && s.state.activeTab === "moreMolds" && s.state.commitPhase === "editing"
        ? {
            state: { ...s.state, moreMoldsActiveDraft: "automatic" },
            lastCommitBlockedReason: null,
          }
        : s,
    ),
  switchToManual: () =>
    set((s) =>
      s.state.kind === "sessionOpen" && s.state.activeTab === "moreMolds" && s.state.commitPhase === "editing"
        ? {
            state: { ...s.state, moreMoldsActiveDraft: "manual" },
            lastCommitBlockedReason: null,
          }
        : s,
    ),
  commitActiveTab: async (modelId, k1, sourceSignature) => {
    const before = get();
    if (before.state.kind !== "sessionOpen" || before.state.commitPhase !== "editing") {
      return false;
    }
    const { activeTab, moreMoldsActiveDraft } = before.state;
    set({ state: { ...before.state, commitPhase: "committing" } });

    const modelGeometrySignature = useSplitFaceStore.getState().partGeometrySignature;
    const printerVolumeAtCommit = usePrinterBuildVolumeStore.getState().dimensions;
    let committed = false;
    // A more-molds-specific commit also writes provenance -- null for the
    // other two tabs, whose successful commit supersedes (and must
    // therefore clear) any earlier more-molds provenance, since it no
    // longer describes what the singleton now holds.
    let provenance: MoreMoldsCommitProvenance | null = null;
    // Mirrors `provenance` above for the "oneMold" tab -- see
    // OneMoldCommitProvenance's doc comment. Any other tab's successful
    // commit must clear this the same way a non-more-molds commit already
    // clears `lastMoreMoldsProvenance` (see the final `set` below).
    let oneMoldProvenance: OneMoldCommitProvenance | null = null;
    let commitBlockedReason: string | null = null;

    if (activeTab === "cutByFace") {
      if (modelId === undefined || k1 === undefined) {
        commitBlockedReason = "No model is selected to commit against.";
      } else if (useSplitFaceStore.getState().cuttingPlanes.length === 0) {
        commitBlockedReason = "Add at least one cutting plane before committing.";
      } else {
        // Cut by Face has always edited the singleton directly (see
        // CuttingSessionPanel's doc comment) -- committing it is simply
        // running its own existing split, already the singleton's own
        // committed state the moment it succeeds. No separate promotion
        // step, unlike the other two tabs.
        committed = await useSplitFaceStore.getState().createMoldParts(modelId, k1);
        if (!committed) {
          commitBlockedReason =
            useSplitFaceStore.getState().error ?? "Cut by Face could not reach a committable result.";
        }
      }
    } else if (activeTab === "oneMold") {
      const segmentation = useSegmentationModeStore.getState();
      if (segmentation.phase !== "preview" || segmentation.plan === null) {
        commitBlockedReason = "Segmentation has not produced a committable plan yet.";
      } else if (!segmentation.acceptPlan()) {
        commitBlockedReason =
          "The current extension plane position is invalid -- move it to a valid location before Done can commit.";
      } else if (modelId === undefined) {
        commitBlockedReason = "No model is selected to commit against.";
      } else {
        const result = await useSegmentationModeStore.getState().executeAcceptedPlan();
        if (result.status === "executed") {
          const sourceDefinition = definitionForExecutedSegmentation(result);
          if (sourceDefinition === null) {
            commitBlockedReason = "Segmentation's authoritative mold definition changed before the result could be committed.";
          } else {
          // Bridges the executed result into the singleton so Create
          // Cavity's existing `definition.moldBodies` precondition is
          // satisfiable for it too -- reusing the exact pipeline Cut by
          // Face and a committed More Molds Automatic result already use,
          // never a parallel one.
          useSplitFaceStore.getState().adoptCommittedSegmentationResult({
            sourceSignature: sourceSignature ?? null,
            sourceDefinition,
            bodies: result.bodies,
            warnings: result.issues.map((issue) => issue.message),
          });
          oneMoldProvenance = {
            schemaVersion: 1,
            committedAt: new Date().toISOString(),
            // sourceSignature (not the generic modelGeometrySignature local)
            // is the same identity value adoptCommittedSegmentationResult
            // above was just given for this tab -- see commitActiveTab's own
            // doc comment: it, not the singleton's own partGeometrySignature
            // (not necessarily set yet for a fresh One Mold commit), is
            // authoritative here.
            modelGeometrySignature: sourceSignature ?? null,
            requiredAxes: result.plan.requiredAxes,
            perAxisSegmentCount: result.plan.perAxisSegmentCount,
            extensionBoundaries: segmentation.extensionBoundaries,
          };
          committed = true;
          }
        } else if (result.status === "failed") {
          commitBlockedReason = result.issues[0]?.message ?? "Segmentation failed.";
        } else {
          commitBlockedReason = `Segmentation plan is ${result.status} and cannot be committed yet.`;
        }
      }
    } else {
      // activeTab === "moreMolds"
      if (moreMoldsActiveDraft === "automatic") {
        let draftState = automaticDraft.getState();
        if (draftState.phase === "preview" && draftState.plan !== null) {
          const effectivePlanBeforeAccept = computeEffectivePlan(
            draftState.plan,
            draftState.extensionBoundaries,
          );
          if (
            effectivePlanBeforeAccept === null ||
            effectivePlanBeforeAccept.validation.status !== "planning-valid"
          ) {
            // A manually-adjusted extension boundary left the effective plan
            // invalid -- acceptPlan() would already refuse this internally,
            // but checking here first produces a specific, actionable
            // message instead of the generic "missing_accepted_plan"
            // fallback acceptPlan()'s silent refusal would otherwise surface.
            commitBlockedReason =
              effectivePlanBeforeAccept?.validation.blockers[0]?.message ??
              "The current extension plane position is invalid and must be corrected before Done can commit.";
          } else {
            draftState.acceptPlan();
            await automaticDraft.getState().executeAcceptedPlan();
            draftState = automaticDraft.getState();
          }
        }
        if (commitBlockedReason !== null) {
          // Already explained above (invalid extension boundary) -- do not
          // let the generic branches below overwrite that specific reason.
        } else if (
          draftState.phase === "valid" &&
          draftState.plan !== null &&
          draftState.request !== null &&
          draftState.result?.status === "executed"
        ) {
          const sourceDefinition = definitionForExecutedSegmentation(draftState.result);
          if (sourceDefinition === null) {
            commitBlockedReason = "Segmentation's authoritative mold definition changed before the result could be committed.";
          } else {
          useSplitFaceStore.getState().adoptCommittedSegmentationResult({
            sourceSignature: modelGeometrySignature,
            sourceDefinition,
            bodies: draftState.result.bodies,
            warnings: draftState.result.issues.map((issue) => issue.message),
          });
          provenance = {
            schemaVersion: 1,
            producedBy: "automatic",
            committedAt: new Date().toISOString(),
            modelGeometrySignature,
            printerVolumeAtCommit,
            automatic: { settingsSignature: draftState.request.settingsSignature },
            manual: null,
          };
          committed = true;
          }
        } else if (draftState.result?.status === "failed") {
          commitBlockedReason =
            draftState.result.reasonCode === "invalid_printer_volume"
              ? "Automatic needs printer dimensions before it can plan a cutting strategy. Enter them above, then try Done again."
              : (draftState.result.issues[0]?.message ??
                `Automatic's segmentation plan failed (${draftState.result.reasonCode}).`);
        } else if (draftState.phase === "unsupported" || draftState.phase === "stale" || draftState.phase === "cancelled") {
          commitBlockedReason = `Automatic's plan is ${draftState.phase} and cannot be committed yet.`;
        } else {
          commitBlockedReason = "Automatic has not produced a committable plan yet.";
        }
      } else if (modelId !== undefined && k1 !== undefined) {
        const draftCommitted = await manualDraft.getState().createMoldParts(modelId, k1);
        const draftState = manualDraft.getState();
        if (draftCommitted && draftState.workflow === "partsReady") {
          // Promote Manual's committed cutting-plane inputs into the
          // singleton by rebuilding through the exact same authoritative
          // pipeline Cut by Face itself uses (seed inputs, then recompute)
          // -- never a direct transfer of the draft's own transient
          // geometry/meshes.
          useSplitFaceStore.getState().seedCuttingPlanesForReopen(draftState.cuttingPlanes, draftState.clearanceMm);
          // seedCuttingPlanesForReopen resets to a fresh baseline (correct
          // for a draft, which tracks no model-identity signature of its
          // own) -- but on the singleton this would wipe
          // partGeometrySignature, which reopen-validation depends on, so
          // it must be restored explicitly.
          useSplitFaceStore.getState().setCanonicalPartGeometrySignature(modelGeometrySignature);
          const promoted = await useSplitFaceStore.getState().createMoldParts(modelId, k1);
          if (promoted && useSplitFaceStore.getState().workflow === "partsReady") {
            provenance = {
              schemaVersion: 1,
              producedBy: "manual",
              committedAt: new Date().toISOString(),
              modelGeometrySignature,
              printerVolumeAtCommit,
              automatic: null,
              manual: {
                modelId,
                selectionBoxBounds: k1,
                clearanceMm: draftState.clearanceMm,
                cuttingPlanes: draftState.cuttingPlanes,
              },
            };
            committed = true;
          } else {
            commitBlockedReason = "The cutting planes could not be promoted to the final result. Try again.";
          }
        } else if (draftState.cuttingPlanes.length === 0) {
          commitBlockedReason = "Add at least one cutting plane before committing.";
        } else {
          commitBlockedReason = draftState.error ?? "Manual could not reach a committable result.";
        }
      } else {
        commitBlockedReason = "No model is selected to commit against.";
      }
    }

    if (!committed) {
      // Could not reach a committable result -- return to the editing
      // session so the user can adjust and retry, rather than silently
      // discarding their work.
      set((s) =>
        s.state.kind === "sessionOpen"
          ? { state: { ...s.state, commitPhase: "editing" }, lastCommitBlockedReason: commitBlockedReason }
          : s,
      );
      return false;
    }

    // Discard every draft that did NOT just win the commit -- reset to
    // idle, not destroyed. The winning draft (whichever tab just committed)
    // keeps its own settled state (phase "valid", mode, etc.) as the record
    // of what was just promoted into the singleton above; nothing here can
    // undo that promotion, only tidy up the tabs that didn't produce it.
    if (activeTab === "moreMolds") {
      if (moreMoldsActiveDraft === "automatic") manualDraft.getState().clearForModelReplacement();
      else automaticDraft.getState().resetStrategy();
      useSegmentationModeStore.getState().resetStrategy();
    } else if (activeTab === "oneMold") {
      resetBothMoreMoldsDrafts();
    } else {
      resetBothMoreMoldsDrafts();
      useSegmentationModeStore.getState().resetStrategy();
    }

    // A successful commit supersedes whatever the pre-session snapshot was
    // for -- Cancel can never legitimately roll back to it after this point
    // (commitPhase leaves "editing" for good once committed), so drop the
    // reference rather than let it linger unused.
    preSessionSplitFaceSnapshot = null;

    set({
      state: idle,
      // Cut by Face and One Mold both commit directly against the
      // singleton -- any earlier More Molds provenance no longer describes
      // what it now holds, so it must not survive to be (incorrectly)
      // reopened later. A More Molds commit overwrites it with its own
      // fresh provenance instead.
      lastMoreMoldsProvenance: provenance,
      // Same rule, mirrored: only a successful "oneMold" commit leaves this
      // non-null; Cut by Face or More Molds committing supersedes it.
      lastOneMoldProvenance: oneMoldProvenance,
      lastReopenBlockedReason: null,
      lastCommitBlockedReason: null,
    });
    // The session's own tool (Pointer/Eraser) has no meaning once the
    // singleton becomes interactive again -- start fresh. Called after the
    // state transition for the same reason as resetActiveToolForTabChange's
    // own doc comment.
    useViewportToolStore.getState().resetActiveTool();
    return true;
  },
  cancelSession: () => {
    const before = get();
    if (before.state.kind !== "sessionOpen" || before.state.commitPhase !== "editing") {
      // Idempotent no-op: already idle, or a commit has already begun its
      // irreversible promotion phase -- Cancel must never interrupt that.
      return;
    }

    // Cancels every draft's in-flight worker requests (each reset function
    // already does this synchronously before wiping state) and returns all
    // of them to a clean idle draft -- discarded, not destroyed, matching
    // every other exit from this session.
    resetBothMoreMoldsDrafts();
    useSegmentationModeStore.getState().resetStrategy();

    // Restore the singleton exactly as it was before this session began --
    // see preSessionSplitFaceSnapshot's doc comment. Absent only if this
    // session's own openSession entry somehow never ran (defensive; not an
    // expected path given cancelSession requires an active session, which
    // only openSession can create).
    if (preSessionSplitFaceSnapshot !== null) {
      useSplitFaceStore.setState(preSessionSplitFaceSnapshot);
      preSessionSplitFaceSnapshot = null;
    }

    useViewportToolStore.getState().resetActiveTool();

    set({
      state: idle,
      lastReopenBlockedReason: null,
      lastCommitBlockedReason: null,
    });
  },
}));

/**
 * Whichever segmentation draft was blocked on missing printer dimensions
 * for the CURRENT cutting-workflow state, if any -- One Mold and More
 * Molds' Automatic sub-strategy both get the same automatic retry. Manual
 * is deliberately excluded (per its own doc comment elsewhere: it never
 * needs printer dimensions to enter or operate).
 */
function draftPendingPrinterVolumeRetry(): {
  readonly draft: SegmentationDraftStore;
  readonly mode: "make-as-one-mold" | "make-as-more-molds";
} | null {
  const state = useCuttingWorkflowStore.getState().state;
  if (state.kind !== "sessionOpen") return null;
  if (state.activeTab === "oneMold") {
    return { draft: useSegmentationModeStore, mode: "make-as-one-mold" };
  }
  if (state.activeTab === "moreMolds" && state.moreMoldsActiveDraft === "automatic") {
    return { draft: automaticDraft, mode: "make-as-more-molds" };
  }
  return null;
}

usePrinterBuildVolumeStore.subscribe((state) => {
  if (state.dimensions === null) return;
  const pending = draftPendingPrinterVolumeRetry();
  if (pending === null) return;
  const draftState = pending.draft.getState();
  if (draftState.result?.status === "failed" && draftState.result.reasonCode === "invalid_printer_volume") {
    pending.draft.getState().requestMode(pending.mode);
    // The blocked-reason banner (if Done was already tried and failed for
    // this exact cause) is now stale -- the retry above just started a
    // fresh attempt, so leaving the old message up would tell the user
    // something no longer true about state they just corrected.
    useCuttingWorkflowStore.setState((s) =>
      s.lastCommitBlockedReason !== null ? { lastCommitBlockedReason: null } : s,
    );
  }
});
