import { create, type StateCreator } from "zustand";

import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import {
  unavailableRegistration,
  type DerivedRegistrationState,
} from "@/features/mold-generation/registration/registrationState";

import {
  executeSegmentationPlan,
  requestSegmentationPlan,
} from "./application/segmentationApplication";
import {
  currentSegmentationSourceToken,
  readCurrentSegmentationSourceSnapshot,
} from "./application/segmentationSourceSnapshot";
import {
  buildSegmentationPlanPreviewBodies,
  generateCommittedSegmentationRegistration,
  generateSegmentationPlanPreview,
  type SegmentationPlanPreview,
} from "./application/segmentationPreview";
import type {
  SegmentationLifecyclePhase,
  SegmentationPlan,
  SegmentationRequest,
  SegmentationResult,
} from "./domain/segmentation.contracts";
import { deterministicSegmentationId } from "./domain/segmentationIdentity";
import { mergeExtensionBoundary } from "./domain/extensionBoundaryMerge";
import type { FitAxis } from "./fitAnalysis";
import { canCommitSegmentationExecution } from "./execution/segmentationExecutionCommitGate";
import {
  cancelActiveSegmentationExecution as defaultCancelActiveSegmentationExecution,
  runSegmentationExecutionInWorker as defaultRunSegmentationExecutionInWorker,
} from "./execution/segmentationExecution.workerClient";
import type {
  SegmentationExecutionRequest,
  SegmentationExecutionResult,
} from "./execution/segmentationExecution.contracts";
import { readFitAnalysisFromStores } from "./useFitAnalysis";

/**
 * A user-added Split-by-Face extension boundary on an axis the algorithm
 * plan left available (see spec: Split by Face as a controlled extension).
 * Deliberately not a CuttingPlaneRecord -- this store stays decoupled from
 * splitFace's plane model; the orchestrator (cutting-workflow) translates
 * between the two.
 */
export interface ExtensionBoundaryRequest {
  readonly axis: FitAxis;
  readonly coordinateMm: number;
}

/**
 * The plan actually accepted/executed: the pure algorithm `plan` (the
 * "Required Core Plan," never mutated) with every current extension
 * boundary folded in on top, in order. Returns `null` unchanged if there is
 * no base plan yet.
 */
export function computeEffectivePlan(
  plan: SegmentationPlan | null,
  extensionBoundaries: readonly ExtensionBoundaryRequest[],
): SegmentationPlan | null {
  if (plan === null) return null;
  // Best-effort: reads the CURRENT authoritative protected regions (the
  // same ones planning itself would see) so a manually-adjusted extension
  // coordinate is validated against them too, not just the initial
  // algorithm suggestion. If the source is transiently not "ready", region
  // conflicts simply aren't checked this call -- the existing staleness/
  // geometry-fingerprint machinery (markStale, planDependencyIsCurrent)
  // handles that case independently and takes precedence once it fires.
  const source = readCurrentSegmentationSourceSnapshot();
  const protectedRegions = source.status === "ready" ? source.snapshot.protectedRegions : [];
  return extensionBoundaries.reduce(
    (current, extension) =>
      mergeExtensionBoundary(current, extension.axis, extension.coordinateMm, protectedRegions),
    plan,
  );
}

interface SegmentationSnapshot {
  readonly phase: SegmentationLifecyclePhase;
  readonly request: SegmentationRequest | null;
  readonly plan: SegmentationPlan | null;
  readonly result: SegmentationResult | null;
  readonly preview: SegmentationPlanPreview | null;
  readonly registration: DerivedRegistrationState;
  readonly extensionBoundaries: readonly ExtensionBoundaryRequest[];
}

export type SegmentationStore = SegmentationSnapshot & {
  readonly undoStack: readonly SegmentationSnapshot[];
  readonly redoStack: readonly SegmentationSnapshot[];
  requestPlan: () => SegmentationResult;
  acceptPlan: () => boolean;
  executeAcceptedPlan: () => Promise<SegmentationResult>;
  markStale: (message: string) => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  /** Rejects (returns false, no state change) if there is no base plan, the
   * axis is already required by the algorithm plan, or already has an
   * extension boundary on it. */
  applyExtensionBoundary: (axis: FitAxis, coordinateMm: number) => boolean;
  removeExtensionBoundary: (axis: FitAxis) => void;
  /**
   * Updates an EXISTING extension boundary's coordinate (e.g. from a user
   * drag) -- unlike applyExtensionBoundary, this never rejects on validity:
   * an invalid new position is still recorded (so the preview reflects
   * exactly where the user left the plane) and the resulting invalidity is
   * surfaced only through the effective plan's own validation, which
   * acceptPlan/executeAcceptedPlan already gate on. Rejects only the
   * structural precondition -- no such extension boundary exists yet (use
   * applyExtensionBoundary to create one first).
   */
  moveExtensionBoundary: (axis: FitAxis, coordinateMm: number) => boolean;
};

const idleState: SegmentationSnapshot = {
  phase: "idle",
  request: null,
  plan: null,
  result: null,
  preview: null,
  registration: unavailableRegistration(),
  extensionBoundaries: [],
};

const snap = (s: SegmentationSnapshot): SegmentationSnapshot => ({
  phase: s.phase,
  request: s.request,
  plan: s.plan,
  result: s.result,
  preview: s.preview,
  registration: s.registration,
  extensionBoundaries: s.extensionBoundaries,
});

const history = (s: SegmentationStore) => ({
  undoStack: [...s.undoStack.slice(-49), snap(s)],
  redoStack: [] as readonly SegmentationSnapshot[],
});

const generatingRegistration = (revision: string): DerivedRegistrationState => ({
  status: "generating",
  revision,
  bodies: null,
  report: null,
});

function resultPhase(result: SegmentationResult): SegmentationLifecyclePhase {
  switch (result.status) {
    case "planned":
      return "preview";
    case "not-required":
    case "executed":
      return "valid";
    case "cancelled":
      return "cancelled";
    case "stale":
      return "stale";
    case "unsupported":
      return "unsupported";
    case "failed":
      return "failed";
  }
}

export interface SegmentationStoreDeps {
  readonly cancelActiveSegmentationExecution: typeof defaultCancelActiveSegmentationExecution;
  readonly runSegmentationExecutionInWorker: typeof defaultRunSegmentationExecutionInWorker;
}
const defaultSegmentationStoreDeps: SegmentationStoreDeps = {
  cancelActiveSegmentationExecution: defaultCancelActiveSegmentationExecution,
  runSegmentationExecutionInWorker: defaultRunSegmentationExecutionInWorker,
};

/**
 * Factory so an isolated Segmentation store instance (see cutting-workflow/) can own its own
 * segmentation-execution worker runner and lifecycle epoch instead of sharing the module-level
 * singleton below. Default args keep `useSegmentationStore` behaviorally identical to before this
 * extraction. Undo/redo covers the planning/execution lifecycle state (phase/plan/result/
 * preview/registration) -- the same fields the singleton already treats as its current
 * Segmentation lifecycle state. The engine reads the shared splitFace singleton's clearanceMm for
 * mold-frame geometry; a dedicated clearance parameter is a deliberately deferred follow-up,
 * not silently assumed.
 */
export function createSegmentationStoreCreator(
  deps: SegmentationStoreDeps = defaultSegmentationStoreDeps,
): StateCreator<SegmentationStore> {
  const { cancelActiveSegmentationExecution, runSegmentationExecutionInWorker } = deps;
  const runExecution = async (
    request: SegmentationExecutionRequest,
  ): Promise<SegmentationExecutionResult> => {
    if (typeof Worker === "undefined") {
      // The Worker-less fallback pulls in the whole manifold-3d/three.js-BVH
      // segmentation execution engine transitively (see
      // segmentationPlaneExecutor.ts). A dynamic import keeps that entire
      // engine out of the eagerly-loaded main bundle -- every real browser
      // has `Worker`, so this branch exists only for environments that
      // genuinely lack it, never the normal runtime path.
      const { executePlaneSegmentation } = await import(
        "./execution/segmentationPlaneExecutor"
      );

      return executePlaneSegmentation(request);
    }

    return runSegmentationExecutionInWorker(request);
  };
  let lifecycleEpoch = 0;
  return (set, get) => {
    /**
     * Shared by applyExtensionBoundary/removeExtensionBoundary: regenerates
     * the preview against the current effective (merged) plan, mirroring
     * requestPlan's own preview-generation path (epoch/phase-guarded so a
     * stale async result never overwrites newer state).
     */
    function regenerateExtensionPreview(effectivePlan: SegmentationPlan, requestEpoch: number) {
      const source = readCurrentSegmentationSourceSnapshot();
      if (source.status !== "ready") return;
      // An invalid effective plan (e.g. a manually-dragged coordinate that
      // produces a degenerate/empty segment) must not be handed to real
      // geometry construction -- it can throw. Leave whatever preview
      // already exists in place (the plane itself still visually tracks the
      // user's drag through the separate, always-live cuttingPlane3dRuntime;
      // only this envelope-body preview skips regenerating) rather than
      // crash or show garbage. acceptPlan/executeAcceptedPlan already block
      // on this same validation, so nothing is silently accepted either.
      if (effectivePlan.validation.status !== "planning-valid") return;
      const unkeyedBodies = buildSegmentationPlanPreviewBodies({
        plan: effectivePlan,
        definition: source.definition,
      });
      set({
        preview: {
          planId: effectivePlan.id,
          definition: source.definition,
          unkeyedBodies,
          registration: generatingRegistration(effectivePlan.id),
        },
      });
      void generateSegmentationPlanPreview({
        plan: effectivePlan,
        source: source.snapshot,
        definition: source.definition,
        unkeyedBodies,
      })
        .then((generated) => {
          const current = get();
          if (
            lifecycleEpoch === requestEpoch &&
            current.preview?.planId === generated.planId &&
            ["preview", "accepted", "executing"].includes(current.phase)
          ) {
            set({ preview: generated });
          }
        })
        .catch(() => {
          const current = get();
          if (current.preview?.planId === effectivePlan.id) set({ preview: null });
        });
    }

    return {
    ...idleState,
    undoStack: [],
    redoStack: [],
    requestPlan: () => {
      const before = get();
      const requestEpoch = ++lifecycleEpoch;
      cancelActiveSegmentationExecution("A new segmentation request replaced the active execution.");
      set({
        phase: "planning",
        request: null,
        plan: null,
        result: null,
        preview: null,
        registration: unavailableRegistration(),
        extensionBoundaries: [],
      });
      const result = requestSegmentationPlan();
      const source = readCurrentSegmentationSourceSnapshot();
      let preview: SegmentationPlanPreview | null = null;
      if (result.status === "planned" && source.status === "ready") {
        const unkeyedBodies = buildSegmentationPlanPreviewBodies({
          plan: result.plan,
          definition: source.definition,
        });
        preview = {
          planId: result.plan.id,
          definition: source.definition,
          unkeyedBodies,
          registration: generatingRegistration(result.plan.id),
        };
        void generateSegmentationPlanPreview({
          plan: result.plan,
          source: source.snapshot,
          definition: source.definition,
          unkeyedBodies,
        })
          .then((generated) => {
            const current = get();
            if (
              current.plan?.id === generated.planId &&
              lifecycleEpoch === requestEpoch &&
              current.preview?.planId === generated.planId &&
              ["preview", "accepted", "executing"].includes(current.phase) &&
              planDependencyIsCurrent(result.plan)
            ) {
              set({ preview: generated });
            }
          })
          .catch(() => {
            const current = get();
            if (current.plan?.id === result.plan.id) set({ preview: null });
          });
      }
      set(() => ({
        ...history(before),
        phase: resultPhase(result),
        request: "request" in result ? (result.request ?? null) : null,
        plan: result.status === "planned" ? result.plan : null,
        result,
        preview,
      }));
      return result;
    },
    acceptPlan: () => {
      const before = get();
      if (before.phase !== "preview" || before.plan === null) return false;
      // The base plan (before.plan) is already guaranteed valid by
      // construction (planSegmentation never returns a "planned" result
      // that fails its own validation) -- but the EFFECTIVE plan (base +
      // any user extension boundaries) is what will actually execute, and
      // an invalid manually-adjusted extension coordinate must block
      // acceptance here, per spec: "Done or Commit must remain unavailable
      // while the preview is invalid."
      const effectivePlan = computeEffectivePlan(before.plan, before.extensionBoundaries);
      if (effectivePlan === null || effectivePlan.validation.status !== "planning-valid") {
        return false;
      }
      set({ phase: "accepted" });
      return true;
    },
    executeAcceptedPlan: async () => {
      const before = get();
      const executionEpoch = lifecycleEpoch;
      const basePlan = before.plan;
      // The Required Core Plan is never mutated -- `plan` below is always a
      // freshly-derived merge of basePlan + current extensionBoundaries,
      // recomputed here and nowhere stored, so removing/adjusting an
      // extension never needs to "undo" a prior merge.
      const plan = computeEffectivePlan(basePlan, before.extensionBoundaries);
      if (
        before.phase !== "accepted" ||
        basePlan === null ||
        plan === null ||
        before.request === null ||
        plan.validation.status !== "planning-valid"
      ) {
        const result: SegmentationResult = {
          status: "failed",
          stage: "geometry-execution",
          reasonCode: "missing_accepted_plan",
          issues: [{ severity: "blocker", reasonCode: "missing_accepted_plan", message: "An accepted segmentation plan is required before execution." }],
        };
        set({ phase: "failed", result });
        return result;
      }
      set({ phase: "executing" });
      let result = await executeSegmentationPlan(plan, {
        readSource: readCurrentSegmentationSourceSnapshot,
        readPrinterVolume: () => usePrinterBuildVolumeStore.getState().dimensions,
        runExecution,
      });
      const current = get();
      let committedSource:
        | Extract<
            ReturnType<typeof readCurrentSegmentationSourceSnapshot>,
            { readonly status: "ready" }
          >
        | null = null;
      if (result.status === "executed") {
        const source = readCurrentSegmentationSourceSnapshot();
        const printerVolume = usePrinterBuildVolumeStore.getState().dimensions;
        const canCommit =
          source.status === "ready" &&
          printerVolume !== null &&
          canCommitSegmentationExecution({
            phase: current.phase,
            activeRequest: current.request,
            acceptedPlan: plan,
            executionRequest: result.executionRequest,
            currentSource: source.snapshot,
            currentPrinterVolume: printerVolume,
          });
        if (!canCommit) {
          result = {
            status: "stale",
            stage: "result-validation",
            reasonCode: "stale_execution_source",
            request: plan.request,
            plan,
            executionRequest: result.executionRequest,
            issues: [{ severity: "blocker", reasonCode: "stale_execution_source", message: "The execution result no longer matches the active accepted plan." }],
            diagnostics: [{ stage: "commit", reasonCode: "stale_execution_source", message: "Lifecycle commit gate rejected the result." }],
          };
        } else if (source.status === "ready") {
          committedSource = source;
        }
      } else if (
        current.phase !== "executing" ||
        current.request?.requestId !== basePlan.request.requestId ||
        current.plan?.id !== basePlan.id
      ) {
        return current.result ?? result;
      }
      if (result.status === "executed" && committedSource !== null) {
        set({
          phase: "executing",
          result,
          registration: generatingRegistration(result.executionRequest.id),
        });
        const registration = await generateCommittedSegmentationRegistration({
          plan,
          source: committedSource.snapshot,
          definition: committedSource.definition,
          bodies: result.bodies,
        });
        const afterRegistration = get();
        if (
          afterRegistration.phase !== "executing" ||
          lifecycleEpoch !== executionEpoch ||
          afterRegistration.plan?.id !== basePlan.id ||
          afterRegistration.request?.requestId !== basePlan.request.requestId ||
          afterRegistration.result?.status !== "executed" ||
          afterRegistration.result.executionRequest.id !==
            result.executionRequest.id ||
          !planDependencyIsCurrent(basePlan)
        ) {
          return afterRegistration.result ?? result;
        }
        set(() => ({ ...history(before), phase: "valid", result, registration }));
        return result;
      }
      set(() => ({
        ...history(before),
        phase: resultPhase(result),
        result,
        registration: unavailableRegistration(),
      }));
      return result;
    },
    markStale: (message) => {
      const current = get();
      if (
        current.plan === null ||
        !["preview", "accepted", "executing", "valid"].includes(current.phase)
      ) {
        return;
      }
      cancelActiveSegmentationExecution(message);
      lifecycleEpoch += 1;
      const result: SegmentationResult = {
        status: "stale",
        stage: "result-validation",
        reasonCode: "stale_source_revision",
        ...(current.request === null ? {} : { request: current.request }),
        issues: [
          {
            severity: "blocker",
            reasonCode: "stale_source_revision",
            message,
          },
        ],
      };
      set({
        phase: "stale",
        result,
        preview: null,
        registration: unavailableRegistration(),
        // The base plan is invalidated -- any extension boundary targeted
        // an axis of that specific (now-stale) plan and cannot be assumed
        // valid against whatever plan eventually replaces it. Re-applying a
        // still-valid extension after a fresh plan is the orchestrator's
        // job (it can re-derive suggested positions against the new plan).
        extensionBoundaries: [],
      });
    },
    reset: () => {
      const before = get();
      cancelActiveSegmentationExecution("Segmentation was reset.");
      lifecycleEpoch += 1;
      // A full reset (idle -> idle is a no-op, otherwise wipes undo/redo too
      // -- reset is "start over," never a state a later undo should
      // be able to reach back through).
      set(() =>
        before.phase === "idle"
          ? idleState
          : { ...idleState, undoStack: [], redoStack: [] },
      );
    },
    undo: () => {
      cancelActiveSegmentationExecution("Undo changed the Segmentation state.");
      lifecycleEpoch += 1;
      set((s) => {
        const previous = s.undoStack.at(-1);
        if (previous === undefined) return s;
        return {
          ...previous,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [snap(s), ...s.redoStack].slice(0, 50),
        };
      });
    },
    redo: () => {
      cancelActiveSegmentationExecution("Redo changed the Segmentation state.");
      lifecycleEpoch += 1;
      set((s) => {
        const next = s.redoStack[0];
        if (next === undefined) return s;
        return {
          ...next,
          undoStack: [...s.undoStack.slice(-49), snap(s)],
          redoStack: s.redoStack.slice(1),
        };
      });
    },
    applyExtensionBoundary: (axis, coordinateMm) => {
      const before = get();
      if (before.plan === null || !["preview", "accepted"].includes(before.phase)) {
        return false;
      }
      if (before.plan.requiredAxes.includes(axis)) return false;
      if (before.extensionBoundaries.some((extension) => extension.axis === axis)) {
        return false;
      }

      const requestEpoch = ++lifecycleEpoch;
      cancelActiveSegmentationExecution("An extension boundary was added.");
      const extensionBoundaries = [...before.extensionBoundaries, { axis, coordinateMm }];
      const effectivePlan = computeEffectivePlan(before.plan, extensionBoundaries);
      // `result` is deliberately left as-is (the base plan's own last
      // planning result) -- the base plan is still exactly as valid as it
      // was, and nulling it here would spuriously flip Viewport's own
      // segmentationResult-derived visualization/executed-body reads for no
      // reason.
      set({
        ...history(before),
        phase: "preview",
        extensionBoundaries,
      });
      if (effectivePlan !== null) {
        regenerateExtensionPreview(effectivePlan, requestEpoch);
      }
      return true;
    },
    removeExtensionBoundary: (axis) => {
      const before = get();
      if (!before.extensionBoundaries.some((extension) => extension.axis === axis)) {
        return;
      }
      const requestEpoch = ++lifecycleEpoch;
      cancelActiveSegmentationExecution("An extension boundary was removed.");
      const extensionBoundaries = before.extensionBoundaries.filter(
        (extension) => extension.axis !== axis,
      );
      set({
        ...history(before),
        phase: before.plan !== null ? "preview" : before.phase,
        extensionBoundaries,
      });
      if (before.plan !== null) {
        const effectivePlan = computeEffectivePlan(before.plan, extensionBoundaries);
        if (effectivePlan !== null) {
          regenerateExtensionPreview(effectivePlan, requestEpoch);
        }
      }
    },
    moveExtensionBoundary: (axis, coordinateMm) => {
      const before = get();
      if (before.plan === null) return false;
      if (!before.extensionBoundaries.some((extension) => extension.axis === axis)) {
        return false;
      }
      const requestEpoch = ++lifecycleEpoch;
      cancelActiveSegmentationExecution("An extension boundary was moved.");
      const extensionBoundaries = before.extensionBoundaries.map((extension) =>
        extension.axis === axis ? { axis, coordinateMm } : extension,
      );
      // Deliberately unconditional: an invalid new coordinate is still
      // recorded (never reverted/snapped back -- the algorithm must not
      // fight the user's placement), and any resulting invalidity is
      // surfaced only through the effective plan's own validation, which
      // acceptPlan/executeAcceptedPlan already gate on. Re-entering
      // "preview" (even from "accepted") forces re-acceptance after any
      // move, so a stale acceptance can never carry an outdated coordinate
      // into execution.
      set({
        ...history(before),
        phase: "preview",
        extensionBoundaries,
      });
      const effectivePlan = computeEffectivePlan(before.plan, extensionBoundaries);
      if (effectivePlan !== null) {
        regenerateExtensionPreview(effectivePlan, requestEpoch);
      }
      return true;
    },
    };
  };
}

export const useSegmentationStore = create<SegmentationStore>()(
  createSegmentationStoreCreator(),
);

function planDependencyIsCurrent(plan: SegmentationPlan): boolean {
  const sourceToken = currentSegmentationSourceToken();
  const expectedSourceToken = deterministicSegmentationId(
    "source-token",
    plan.request.source,
  );
  const printer = usePrinterBuildVolumeStore.getState().dimensions;
  const printerToken =
    printer === null
      ? null
      : deterministicSegmentationId("printer-volume", printer);
  return (
    sourceToken === expectedSourceToken &&
    printerToken === plan.request.printerVolumeSignature
  );
}

/**
 * Which tab the Constructed Cutting Plan panel shows is an explicit user
 * choice owned by cutting-workflow's orchestrator, not this fit signal
 * directly. This subscription still keeps planning lifecycle state
 * invalidated against the existing printer and mold-document authorities,
 * and still resets the plan/result once a model that needed Segmentation
 * stops needing it.
 */
let wasActive = false;
function handleUpstreamChange() {
  const isActive = readFitAnalysisFromStores().overall === "DOES_NOT_FIT";
  const store = useSegmentationStore.getState();
  if (store.plan !== null && !planDependencyIsCurrent(store.plan)) {
    store.markStale(
      "Printer volume or authoritative mold geometry changed after planning.",
    );
  }
  if (wasActive && !isActive) {
    // The model no longer requires Segmentation (it now fits the printer, or
    // its authoritative geometry was replaced). A plan/result computed while
    // it was oversized is not valid for a fitting model and must not be
    // retained -- reset fully, not just the plan/result, so no stale
    // plan/result/phase survives into the normal small-model workflow.
    store.reset();
  }
  wasActive = isActive;
}

usePrinterBuildVolumeStore.subscribe(handleUpstreamChange);
useModelBoundsStore.subscribe(handleUpstreamChange);
useSplitFaceStore.subscribe(handleUpstreamChange);

