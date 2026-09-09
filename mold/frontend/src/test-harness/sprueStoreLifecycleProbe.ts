/**
 * E2E-only proof of the real SplitFace Sprue coordinator.  This deliberately
 * uses the production store creator and its normal Worker-backed dependencies;
 * the separate sprueLatestWinsProbe remains the direct derived-engine cache
 * proof.  This module is reachable only from e2e-harness.html.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import { cancelActiveCavityGeneration, runCavityGenerationInWorker } from "@/features/mold-generation/cavity-generation/cavityGeneration.workerClient";
import { designSprueProfile, type ValidSpruePreviewPlacement } from "@/features/mold-generation/sprue-generation";
import { createSplitFaceStoreCreator, type SplitFaceState } from "@/features/mold-generation/split-face/splitFace.store";
import { cancelDerivedMoldEvaluation, runDerivedMoldEvaluation as productionRunDerivedMoldEvaluation } from "@/features/mold-generation/workflow";

export interface SprueStoreLifecycleResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly createAccepted: boolean;
  readonly resizeAccepted: boolean;
  readonly entryResizeAccepted: boolean;
  readonly burstAccepted: boolean;
  readonly pendingObserved: boolean;
  readonly dispatchCount: number;
  readonly resolvedSprueCount: number;
  readonly finalMainDiameterMm: number | null;
  readonly finalEntryNeckDiameterMm: number | null;
  readonly registrationStatus: string;
  readonly documentMatchesResult: boolean;
  readonly historyDelta: number;
}

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const profileDesign = designSprueProfile(null);
const placement: ValidSpruePreviewPlacement = {
  status: "valid",
  topPoint: { x: 5, y: 5, z: 30 },
  cavityPoint: { x: 5, y: 5, z: 20 },
  inwardDirection: { x: 0, y: 0, z: -1 },
  stemLengthMm: 10,
  profileDesign,
  coordinateSpace: "mold-local",
};

async function waitForState(
  store: StoreApi<SplitFaceState>,
  predicate: (state: SplitFaceState) => boolean,
): Promise<SplitFaceState> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for production store lifecycle state."));
    }, 30_000);
    const check = (state: SplitFaceState) => {
      if (!predicate(state)) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    };
    const unsubscribe = store.subscribe(check);
    check(store.getState());
  });
}

async function runSprueStoreLifecycleProbe(): Promise<SprueStoreLifecycleResult> {
  let dispatchCount = 0;
  try {
    const runDerivedMoldEvaluation = Object.assign(
      async (...args: Parameters<typeof productionRunDerivedMoldEvaluation>) => {
        dispatchCount += 1;
        return productionRunDerivedMoldEvaluation(...args);
      },
      { cancel: (reason?: string) => cancelDerivedMoldEvaluation(reason) },
    );
    const store = createStore(createSplitFaceStoreCreator({
      runDerivedMoldEvaluation,
      cancelDerivedMoldEvaluation,
      runCavityGenerationInWorker,
      cancelActiveCavityGeneration,
    }));
    const state = store.getState();
    const canonicalPartGeometry = canonicalCube("e2e-sprue-store", k1);
    state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    state.enterSelection();
    state.toggleFace("front");
    if (!await state.createMoldParts("e2e-sprue-store", k1)) throw new Error("Mold parts were not created.");
    if (!await store.getState().createCavity(canonicalPartGeometry)) throw new Error("Cavity was not created.");
    // Mold creation and cavity creation also use the shared derived runner.
    // The lifecycle metric begins only after those prerequisite operations.
    const sprueDispatchBase = dispatchCount;

    const beforeCreateHistory = store.getState().undoStack.length;
    const createAccepted = await store.getState().createSprue(placement);
    const pendingObserved = store.getState().sprueStatus === "generating" && store.getState().sprueDefinitions[0]?.validation.status === "pending";
    await waitForState(store, (next) => next.sprueStatus === "idle" && next.sprues.length === 1 && next.registration.status === "generated");

    const first = store.getState().sprues[0]!;
    const resizeAccepted = await store.getState().resizeSprue(first.operationId, first.profile.mainDiameterMm + 0.8);
    await waitForState(store, (next) => next.sprueStatus === "idle" && next.sprues[0]?.profile.mainDiameterMm === first.profile.mainDiameterMm + 0.8);

    const second = store.getState().sprues[0]!;
    const entryResizeAccepted = await store.getState().resizeSprueEntryNeck(second.operationId, second.profile.entryNeckDiameterMm + 0.2);
    await waitForState(store, (next) => next.sprueStatus === "idle" && next.sprues[0]?.profile.entryNeckDiameterMm === second.profile.entryNeckDiameterMm + 0.2);

    const burstBase = store.getState().sprues[0]!;
    const burstPromises = Array.from({ length: 20 }, (_, index) =>
      store.getState().resizeSprue(burstBase.operationId, burstBase.profile.mainDiameterMm + 0.1 * (index + 1)),
    );
    const burstAccepted = (await Promise.all(burstPromises)).every(Boolean);
    const expectedMainDiameterMm = burstBase.profile.mainDiameterMm + 2;
    const final = await waitForState(store, (next) => next.sprueStatus === "idle" && next.sprues[0]?.profile.mainDiameterMm === expectedMainDiameterMm);
    return {
      ok: true, error: null, createAccepted, resizeAccepted, entryResizeAccepted, burstAccepted, pendingObserved,
      dispatchCount: dispatchCount - sprueDispatchBase, resolvedSprueCount: final.sprues.length,
      finalMainDiameterMm: final.sprues[0]?.profile.mainDiameterMm ?? null,
      finalEntryNeckDiameterMm: final.sprues[0]?.profile.entryNeckDiameterMm ?? null,
      registrationStatus: final.registration.status,
      documentMatchesResult: final.lastCommittedResult?.sourceFingerprint === final.document.fingerprint,
      historyDelta: final.undoStack.length - beforeCreateHistory,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), createAccepted: false, resizeAccepted: false, entryResizeAccepted: false, burstAccepted: false, pendingObserved: false, dispatchCount, resolvedSprueCount: 0, finalMainDiameterMm: null, finalEntryNeckDiameterMm: null, registrationStatus: "unknown", documentMatchesResult: false, historyDelta: 0 };
  }
}

declare global { interface Window { __sprueStoreLifecycleProbe: () => Promise<SprueStoreLifecycleResult>; } }
window.__sprueStoreLifecycleProbe = runSprueStoreLifecycleProbe;
