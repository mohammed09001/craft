import { create } from "zustand";

import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import { useSplitFaceStore, type SplitFaceState } from "../split-face/splitFace.store";
import { useSegmentationStore } from "../segmentation/segmentation.store";
import type { SegmentationExecutionResult } from "../segmentation/execution/segmentationExecution.contracts";
import type { SegmentationPlan } from "../segmentation/domain/segmentation.contracts";
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
  type CuttingSessionTab,
  type CuttingWorkflowState,
  type SegmentationCommitProvenance,
} from "./cuttingWorkflow.contracts";

/**
 * Captured by openSession() before any tab can touch the singleton --
 * restored verbatim by cancelSession() so a cancelled session leaves the
 * singleton exactly as it was before the panel opened, regardless of which
 * tab was visited or how far Cut by Face's own direct edits (it has no
 * separate draft -- see CuttingSessionPanel's doc comment) got before
 * Cancel. A full-object snapshot (not an enumerated field subset) is
 * deliberate: it naturally reverts any undo-stack entries pushed meanwhile
 * too, which a narrower field-by-field restore would miss.
 */
let preSessionSplitFaceSnapshot: SplitFaceState | null = null;

/**
 * Whether this session has already started the Segmentation tab's own
 * engine at least once -- an explicit per-session flag, reset by
 * openSession, rather than inferring "not yet initialized" from the
 * engine's own idle shape (mode `null`). A winning segmentation engine
 * deliberately keeps its settled state after commitActiveTab (see its own
 * comment), so that shape is NOT a reliable "never touched" signal --
 * reopening a session after a commit would otherwise misread the retained
 * result as "already initialized this session" and skip re-running
 * requestPlan entirely.
 */
let segmentationTabInitializedThisSession = false;

function ensureSegmentationTabInitialized() {
  if (segmentationTabInitializedThisSession) return;
  segmentationTabInitializedThisSession = true;
  useSegmentationStore.getState().requestPlan();
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
 * Whichever segmentation engine currently owns axis decisions -- the
 * singleton `useSegmentationStore`, driven directly by the
 * Segmentation tab (which, like Cut by Face, uses no draft-isolation
 * system), while that tab is open.
 */
function activeSegmentationEngine() {
  const state = useCuttingWorkflowStore.getState().state;
  if (state.kind !== "sessionOpen") return null;
  if (state.activeTab === "segmentation") return useSegmentationStore;
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
  const engine = activeSegmentationEngine();
  if (engine === null) return deriveAxisOwnership(NO_AXES, NO_AXES);
  const state = engine.getState();
  return deriveAxisOwnership(
    state.plan?.requiredAxes ?? NO_AXES,
    state.extensionBoundaries.map((extension) => extension.axis),
  );
}

/**
 * Reactive axis-ownership read for rendering (e.g. disabling an axis-picker
 * button). Subscribes to the singleton unconditionally (Rules of Hooks).
 * Each selector returns a raw, store-owned reference (the plan object, the
 * extensionBoundaries array) rather than a `.map()`-derived array, so
 * Zustand's snapshot comparison stays stable; the axis list itself is
 * derived afterward, outside the selector, where a fresh array every render
 * is harmless.
 */
export function useActiveAxisOwnership(): AxisOwnership {
  const workflowState = useCuttingWorkflowStore((s) => s.state);
  const singletonPlan = useSegmentationStore((s) => s.plan);
  const singletonExtensions = useSegmentationStore((s) => s.extensionBoundaries);

  if (workflowState.kind !== "sessionOpen") return deriveAxisOwnership(NO_AXES, NO_AXES);
  if (workflowState.activeTab === "segmentation") {
    return deriveAxisOwnership(
      singletonPlan?.requiredAxes ?? NO_AXES,
      singletonExtensions.map((extension) => extension.axis),
    );
  }
  return deriveAxisOwnership(NO_AXES, NO_AXES);
}

/**
 * Adds a user extension boundary on `axis` to whichever segmentation engine
 * currently owns axis decisions (see activeSegmentationEngine). Rejects
 * (returns false, no state change) if no engine is active or the axis is
 * already used -- validated both here and, redundantly but safely, inside
 * applyExtensionBoundary itself. The initial position is the algorithm's
 * own suggestion (suggestExtensionAxisPosition), evaluated against the same
 * authoritative source snapshot planning already uses -- never an arbitrary
 * default.
 */
export function addSegmentationExtensionAxis(axis: Axis3): boolean {
  const engine = activeSegmentationEngine();
  if (engine === null) return false;
  const ownership = currentAxisOwnership();
  if (!isAxisAvailableForExtension(ownership, axis)) return false;
  const source = readCurrentSegmentationSourceSnapshot();
  if (source.status !== "ready") return false;
  const coordinateMm = suggestExtensionAxisPosition(source.snapshot, axis);
  const accepted = engine.getState().applyExtensionBoundary(axis, coordinateMm);
  if (!accepted) return false;

  // Visual mirror only -- a real, draggable CuttingPlaneRecord on the
  // singleton splitFace store, the same store Viewport.tsx already renders
  // cutting planes from while a segmentation tab owns the model (see
  // Viewport.tsx's cuttingPlanes prop, filtered to extension provenance in
  // that state). The execution-authoritative coordinate lives on `engine`
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
  activeSegmentationEngine()?.getState().removeExtensionBoundary(axis);
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
 * whichever segmentation engine currently owns axis decisions. Never
 * rejects on validity -- see moveExtensionBoundary's own doc comment.
 */
export function moveSegmentationExtensionAxis(axis: Axis3, coordinateMm: number): boolean {
  const engine = activeSegmentationEngine();
  if (engine === null) return false;
  return engine.getState().moveExtensionBoundary(axis, coordinateMm);
}

function sameTopology(
  actual: Pick<SegmentationPlan, "requiredAxes" | "perAxisSegmentCount">,
  expected: Pick<SegmentationCommitProvenance, "requiredAxes" | "perAxisSegmentCount">,
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
 * Viewport.tsx's onMoldScaleCommit wiring). A no-op for Cut by Face (its
 * own `setClearanceMm`/`commitClearanceEdit` live-rebuild already handles
 * it) and for a mold with no committed segmentation lineage at all.
 *
 * Replans against the current (post-Scale) K2, then replays each committed
 * extension boundary (see SegmentationCommitProvenance) on top of that fresh
 * base plan the same way the user originally applied it. Adopts the result
 * only if the base topology (requiredAxes + perAxisSegmentCount) matches
 * what was originally committed -- preserving the product contract that
 * Segmentation never silently changes piece count/axis choice -- and every
 * extension boundary re-applies and remains valid. A topology mismatch, an
 * extension boundary that no longer applies, or any planning/execution
 * failure all leave the truthful whole-K2 base (already current from the
 * Scale commit itself) as the final result, with the segmentation engine's
 * own phase/result as the honest record of why -- never silently retried,
 * never faked as success.
 *
 * Never calls requestPlan/acceptPlan/executeAcceptedPlan from Viewport.tsx
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
    const segmentationProvenance = useCuttingWorkflowStore.getState().lastSegmentationProvenance;
    if (segmentationProvenance === null) return;

    const engine = useSegmentationStore;
    const expectedPriorRevision = splitFace.document.revision;

    const planned = engine.getState().requestPlan();
    // "not-required": the whole-K2 base already current from the Scale commit
    // IS the correct final result at this size -- nothing further to promote.
    // Any other non-"planned" status (failed/stale/unsupported) leaves that
    // same truthful base current, with the engine's own result as the reason.
    if (planned.status !== "planned") return;

    // Replays each committed extension boundary against the fresh base plan,
    // exactly as the user originally applied it, BEFORE the topology check
    // below -- `segmentationProvenance.requiredAxes`/`perAxisSegmentCount` were
    // captured from the EFFECTIVE (base + extensions) plan at commit time
    // (see commitActiveTab), so the comparison must use the same effective
    // plan, not the pre-extension base. applyExtensionBoundary rejects
    // outright if the axis is no longer available; acceptPlan below already
    // validates the resulting effective plan (protected-region conflicts,
    // out-of-bounds coordinates) before anything executes. Either failure
    // falls through to the same whole-K2 fallback as a topology mismatch,
    // never silently dropping the extension from the result.
    for (const extension of segmentationProvenance.extensionBoundaries) {
      if (!engine.getState().applyExtensionBoundary(extension.axis, extension.coordinateMm)) return;
    }
    const effectivePlan = computeEffectivePlan(engine.getState().plan, engine.getState().extensionBoundaries);
    if (effectivePlan === null || !sameTopology(effectivePlan, segmentationProvenance)) return;

    if (!engine.getState().acceptPlan()) return;
    const executed = await engine.getState().executeAcceptedPlan();
    if (executed.status !== "executed") return;

    // Belt-and-suspenders alongside promoteReplannedSegmentationResult's own
    // atomic revision check: avoids reading a now-stale source snapshot after
    // a superseding edit landed while execution was in flight.
    if (useSplitFaceStore.getState().document.revision !== expectedPriorRevision) return;

    const sourceDefinition = definitionForExecutedSegmentation(executed);
    if (sourceDefinition === null) return;

    useSplitFaceStore.getState().promoteReplannedSegmentationResult({
      expectedPriorRevision,
      sourceSignature: segmentationProvenance.modelGeometrySignature,
      sourceDefinition,
      bodies: executed.bodies,
      warnings: executed.issues.map((issue) => issue.message),
    });
  } finally {
    useSplitFaceStore.getState().endSegmentationRegeneration();
  }
}

/**
 * Whether the active tab's segmentation plan (base + extension boundaries)
 * is valid -- for gating Done. Returns true when the active tab has no
 * algorithm-generated plan to validate (Cut by Face), since this check does
 * not apply there; the caller combines it with whatever other gates already
 * apply.
 */
export function useIsActiveSegmentationPlanValid(): boolean {
  const workflowState = useCuttingWorkflowStore((s) => s.state);
  const singletonPlan = useSegmentationStore((s) => s.plan);
  const singletonExtensions = useSegmentationStore((s) => s.extensionBoundaries);

  if (workflowState.kind !== "sessionOpen") return true;
  if (workflowState.activeTab === "segmentation") {
    if (singletonPlan === null) return true;
    return computeEffectivePlan(singletonPlan, singletonExtensions)?.validation.status === "planning-valid";
  }
  return true;
}

interface CuttingWorkflowStore {
  readonly state: CuttingWorkflowState;
  /**
   * Segmentation's committed inputs, written only when the "segmentation" tab
   * commits -- any other tab's successful commit supersedes and clears it
   * (see commitActiveTab). Consumed by `regenerateSegmentationAfterScale`
   * to decide whether the currently promoted result is Segmentation-sourced
   * and, if so, what topology a Scale-triggered replan must match to be
   * accepted.
   */
  readonly lastSegmentationProvenance: SegmentationCommitProvenance | null;
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
   * snapshot-then-clear step is needed for it, since Cut by Face has no
   * separate draft to seed). Captures `preSessionSplitFaceSnapshot`
   * unconditionally so Cancel can restore the singleton exactly regardless
   * of which tab gets edited afterward. No-op outside "idle".
   */
  openSession(): void;
  /**
   * Switches which tab is active. Neither tab's own engine state or history
   * is touched by switching -- exactly one initialization happens for the
   * Segmentation tab per session, on first visit (see
   * ensureSegmentationTabInitialized), so returning to a
   * previously-visited tab resumes exactly where the user left it. No-op
   * outside an editing session, or if `tab` is already active.
   */
  setActiveTab(tab: CuttingSessionTab): void;
  /**
   * Commits only the currently active tab's result into the singleton --
   * the sole shared committed-body state every downstream tool (Create
   * Cavity, Sprue, Glass/Ghosted) already reads -- then closes the panel.
   * `modelId`/`k1` are required for Cut by Face; `sourceSignature` is
   * required for the Segmentation tab, so its promoted definition satisfies
   * Create Cavity's existing precondition. Returns false without
   * transitioning if the active tab could not reach a valid, committable
   * result -- the panel stays open so the user can see why
   * (lastCommitBlockedReason) and retry.
   */
  commitActiveTab(
    modelId?: string,
    k1?: Bounds3,
    sourceSignature?: string | null,
  ): Promise<boolean>;
  /**
   * Discards the entire open session -- commits nothing, promotes nothing
   * into the singleton, regardless of which tab was visited or edited --
   * and returns to idle exactly as if the panel had never been opened.
   * Cancels in-flight worker requests, resets the segmentation engine to
   * idle, restores the singleton to its pre-session snapshot (see
   * `preSessionSplitFaceSnapshot`), resets the active viewport tool to
   * Pointer, and clears session-local blocked reasons.
   * `lastSegmentationProvenance` is never touched. No-op (idempotent) unless
   * currently editing -- in particular, a no-op while a commit is already
   * "committing", so Cancel can never race a Done that has already begun
   * its irreversible promotion.
   */
  cancelSession(): void;
}

const idle: CuttingWorkflowState = { kind: "idle" };

/**
 * A leftover viewport tool from a previous tab (e.g. Sprue, Eraser,
 * Orientation) must not stay live once the active tab changes -- its
 * interaction targets a specific owner, which becomes inert for a different
 * tab (see Viewport.tsx's tab-gated routing), so a stale tool selection
 * would otherwise silently mutate hidden state with no visible affordance.
 * Must be called AFTER the state transition has already committed, not
 * before: calling it first creates a real (if brief) intermediate render
 * where activeTool has already changed but the new tab hasn't yet, during
 * which the previous tab's own guard sees a stale read.
 */
function resetActiveToolForTabChange() {
  useViewportToolStore.getState().resetActiveTool();
}

export const useCuttingWorkflowStore = create<CuttingWorkflowStore>((set, get) => ({
  state: idle,
  lastSegmentationProvenance: null,
  lastCommitBlockedReason: null,
  openSession: () => {
    if (get().state.kind !== "idle") return;
    preSessionSplitFaceSnapshot = useSplitFaceStore.getState();
    segmentationTabInitializedThisSession = false;
    set({
      state: {
        kind: "sessionOpen",
        activeTab: "cutByFace",
        commitPhase: "editing",
      },
      lastCommitBlockedReason: null,
    });
    activateCutByFaceSelection();
    resetActiveToolForTabChange();
  },
  setActiveTab: (tab) => {
    const before = get();
    if (before.state.kind !== "sessionOpen" || before.state.commitPhase !== "editing") return;
    if (before.state.activeTab === tab) return;

    if (tab === "segmentation") {
      ensureSegmentationTabInitialized();
    }

    set({
      state: { ...before.state, activeTab: tab },
      lastCommitBlockedReason: null,
    });
    if (tab === "cutByFace") activateCutByFaceSelection();
    resetActiveToolForTabChange();
  },
  commitActiveTab: async (modelId, k1, sourceSignature) => {
    const before = get();
    if (before.state.kind !== "sessionOpen" || before.state.commitPhase !== "editing") {
      return false;
    }
    const { activeTab } = before.state;
    set({ state: { ...before.state, commitPhase: "committing" } });

    let committed = false;
    // Only a successful "segmentation" commit writes this; a Cut by Face commit
    // supersedes (and must therefore clear) any earlier segmentation
    // provenance, since it no longer describes what the singleton now holds.
    let segmentationProvenance: SegmentationCommitProvenance | null = null;
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
        // step, unlike the Segmentation tab.
        committed = await useSplitFaceStore.getState().createMoldParts(modelId, k1);
        if (!committed) {
          commitBlockedReason =
            useSplitFaceStore.getState().error ?? "Cut by Face could not reach a committable result.";
        }
      }
    } else {
      const segmentation = useSegmentationStore.getState();
      if (segmentation.phase !== "preview" || segmentation.plan === null) {
        commitBlockedReason = "Segmentation has not produced a committable plan yet.";
      } else if (!segmentation.acceptPlan()) {
        commitBlockedReason =
          "The current extension plane position is invalid -- move it to a valid location before Done can commit.";
      } else if (modelId === undefined) {
        commitBlockedReason = "No model is selected to commit against.";
      } else {
        const result = await useSegmentationStore.getState().executeAcceptedPlan();
        if (result.status === "executed") {
          const sourceDefinition = definitionForExecutedSegmentation(result);
          if (sourceDefinition === null) {
            commitBlockedReason = "Segmentation's authoritative mold definition changed before the result could be committed.";
          } else {
          // Bridges the executed result into the singleton so Create
          // Cavity's existing `definition.moldBodies` precondition is
          // satisfiable for it too -- reusing the exact pipeline Cut by
          // Face already uses, never a parallel one.
          useSplitFaceStore.getState().adoptCommittedSegmentationResult({
            sourceSignature: sourceSignature ?? null,
            sourceDefinition,
            bodies: result.bodies,
            warnings: result.issues.map((issue) => issue.message),
          });
          segmentationProvenance = {
            schemaVersion: 1,
            committedAt: new Date().toISOString(),
            // sourceSignature (not a model-identity read from the
            // singleton) is the same identity value
            // adoptCommittedSegmentationResult above was just given for
            // this tab -- it, not the singleton's own
            // partGeometrySignature (not necessarily set yet for a fresh
            // Segmentation commit), is authoritative here.
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

    // A Cut by Face commit supersedes whatever the segmentation engine
    // still holds -- reset it to idle so a stale preview can neither render
    // nor be committed later. A winning Segmentation commit keeps its own
    // settled state (phase "valid") as the record of what was just
    // promoted into the singleton above.
    if (activeTab !== "segmentation") {
      useSegmentationStore.getState().reset();
    }

    // A successful commit supersedes whatever the pre-session snapshot was
    // for -- Cancel can never legitimately roll back to it after this point
    // (commitPhase leaves "editing" for good once committed), so drop the
    // reference rather than let it linger unused.
    preSessionSplitFaceSnapshot = null;

    set({
      state: idle,
      // Only a successful "segmentation" commit leaves this non-null; a Cut by
      // Face commit supersedes it.
      lastSegmentationProvenance: segmentationProvenance,
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

    // Cancels the segmentation engine's in-flight worker requests (its
    // reset already does this synchronously before wiping state) and
    // returns it to a clean idle engine -- discarded, not destroyed,
    // matching every other exit from this session.
    useSegmentationStore.getState().reset();

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
      lastCommitBlockedReason: null,
    });
  },
}));

/**
 * Whether the Segmentation engine was blocked on missing printer dimensions
 * for the CURRENT cutting-workflow state -- it gets the same automatic
 * retry it has always had.
 */
function segmentationEnginePendingPrinterVolumeRetry() {
  const state = useCuttingWorkflowStore.getState().state;
  if (state.kind !== "sessionOpen") return null;
  if (state.activeTab === "segmentation") return useSegmentationStore;
  return null;
}

usePrinterBuildVolumeStore.subscribe((state) => {
  if (state.dimensions === null) return;
  const pending = segmentationEnginePendingPrinterVolumeRetry();
  if (pending === null) return;
  const engineState = pending.getState();
  if (engineState.result?.status === "failed" && engineState.result.reasonCode === "invalid_printer_volume") {
    pending.getState().requestPlan();
    // The blocked-reason banner (if Done was already tried and failed for
    // this exact cause) is now stale -- the retry above just started a
    // fresh attempt, so leaving the old message up would tell the user
    // something no longer true about state they just corrected.
    useCuttingWorkflowStore.setState((s) =>
      s.lastCommitBlockedReason !== null ? { lastCommitBlockedReason: null } : s,
    );
  }
});
