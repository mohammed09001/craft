/**
 * Article 01/10: real-browser proof that Master Mold produces a `current`
 * result from the SAME production final-mold-target pipeline the toolbar
 * drives -- committed cavity geometry, a real Sprue in a manufacturable
 * orientation, and Registration -- not a bare box fed straight into the
 * Boolean generator (see masterMoldGenerationProbe.ts, which is a distinct,
 * narrower "does the Worker/Manifold plumbing itself run" proof and stays
 * classified as a diagnostic test, never product acceptance on its own).
 *
 * Mirrors sprueStoreLifecycleProbe.ts's approach: the real production store
 * creators, wired to their real Worker-backed clients (runCavityGenerationInWorker,
 * runDerivedMoldEvaluation, runMasterMoldGenerationInWorker) so this proves a
 * genuine Worker-thread + manifold-3d WASM execution in Chromium, the exact
 * path a real toolbar click drives -- not a mock, not the jsdom worker-less
 * fallback masterMold.store.test.ts and the vitest-side
 * masterMoldWorkflow.integration.test.ts necessarily use instead.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import { cancelActiveCavityGeneration, runCavityGenerationInWorker } from "@/features/mold-generation/cavity-generation/cavityGeneration.workerClient";
import { designSprueProfile, type ValidSpruePreviewPlacement } from "@/features/mold-generation/sprue-generation";
import { createSplitFaceStoreCreator, type SplitFaceState } from "@/features/mold-generation/split-face/splitFace.store";
import { cancelDerivedMoldEvaluation, runDerivedMoldEvaluation } from "@/features/mold-generation/workflow";
import { createMasterMoldStoreCreator, type MasterMoldFinalBodyInput } from "@/features/mold-generation/master-mold/masterMold.store";
import { cancelActiveMasterMoldGeneration, runMasterMoldGenerationInWorker } from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";

// Mirrors sprueStoreLifecycleProbe.ts: createSprue() resolving true does not
// itself guarantee lastCommittedResult/document already reflect the
// resolved Sprue -- Registration re-evaluation finishes slightly later.
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

export interface MasterMoldRealisticWorkflowResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly registrationStatus: string | null;
  readonly bodyCountBeforeSprue: number | null;
  readonly statusBeforeSprue: string | null;
  readonly bodyCountAfterSprue: number | null;
  readonly statusAfterSprue: string | null;
  readonly geometryChangedAfterSprue: boolean | null;
  readonly volumesAfterSprueMm3: readonly number[] | null;
}

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

// A "top" (Z-axis) cut so this block's own demold axis matches the Sprue's
// vertical (topPoint/-Z inwardDirection) orientation below -- a genuinely
// manufacturable combination, proven against the real geometry engine by
// masterMoldWorkflow.integration.test.ts's "Case B"/"Case D" pair. Using a
// "front" cut with this same Sprue is real Case D (a genuine undercut, not a
// bug); this probe proves the ordinary Case B path instead.
async function runMasterMoldRealisticWorkflowProbe(): Promise<MasterMoldRealisticWorkflowResult> {
  try {
    const splitFaceStore = createStore(
      createSplitFaceStoreCreator({
        runDerivedMoldEvaluation,
        cancelDerivedMoldEvaluation,
        runCavityGenerationInWorker,
        cancelActiveCavityGeneration,
      }),
    );
    const masterMoldStore = createMasterMoldStoreCreator({
      runMasterMoldGenerationInWorker,
      cancelActiveMasterMoldGeneration,
    });

    const canonicalPartGeometry = canonicalCube("e2e-master-mold-realistic", k1);
    const splitFace = splitFaceStore.getState();
    splitFace.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    splitFace.enterSelection();
    splitFace.toggleFace("top");
    if (!(await splitFaceStore.getState().createMoldParts("e2e-master-mold-realistic", k1))) {
      throw new Error("Mold parts were not created.");
    }
    if (!(await splitFaceStore.getState().createCavity(canonicalPartGeometry))) {
      throw new Error("Cavity was not created.");
    }

    const registrationStatus = splitFaceStore.getState().registration.status;
    const finalMoldBodyInputs = (): readonly MasterMoldFinalBodyInput[] => {
      const committed = splitFaceStore.getState().lastCommittedResult;
      if (committed === null) throw new Error("No committed final-mold result.");
      return committed.bodies.map((body) => ({ id: body.id, name: body.name, mesh: body.mesh, bounds: body.bounds, volumeMm3: body.volumeMm3 }));
    };

    const documentBefore = splitFaceStore.getState().document;
    const okBefore = await masterMoldStore
      .getState()
      .generate(finalMoldBodyInputs(), { revision: documentBefore.revision, fingerprint: documentBefore.fingerprint });
    if (!okBefore) throw new Error("Master Mold generation (pre-Sprue) did not complete.");
    const beforeState = masterMoldStore.getState();

    const placement: ValidSpruePreviewPlacement = {
      status: "valid",
      topPoint: { x: 5, y: 5, z: 30 },
      cavityPoint: { x: 5, y: 5, z: 20 },
      inwardDirection: { x: 0, y: 0, z: -1 },
      stemLengthMm: 10,
      profileDesign: designSprueProfile(null),
      coordinateSpace: "mold-local",
    };
    if (!(await splitFaceStore.getState().createSprue(placement))) throw new Error("Sprue was not created.");
    await waitForState(splitFaceStore, (next) => next.sprueStatus === "idle" && next.sprues.length === 1 && next.registration.status === "generated");

    const documentAfter = splitFaceStore.getState().document;
    const okAfter = await masterMoldStore
      .getState()
      .generate(finalMoldBodyInputs(), { revision: documentAfter.revision, fingerprint: documentAfter.fingerprint });
    if (!okAfter) throw new Error("Master Mold regeneration (post-Sprue) did not complete.");
    const afterState = masterMoldStore.getState();

    return {
      ok: true,
      error: null,
      registrationStatus,
      bodyCountBeforeSprue: beforeState.bodies.length,
      statusBeforeSprue: beforeState.status,
      bodyCountAfterSprue: afterState.bodies.length,
      statusAfterSprue: afterState.status,
      geometryChangedAfterSprue:
        JSON.stringify(beforeState.bodies.map((b) => b.source.finalMoldGeometryVersion)) !==
        JSON.stringify(afterState.bodies.map((b) => b.source.finalMoldGeometryVersion)),
      volumesAfterSprueMm3: afterState.bodies.map((b) => b.volumeMm3 ?? -1),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      registrationStatus: null,
      bodyCountBeforeSprue: null,
      statusBeforeSprue: null,
      bodyCountAfterSprue: null,
      statusAfterSprue: null,
      geometryChangedAfterSprue: null,
      volumesAfterSprueMm3: null,
    };
  }
}

declare global {
  interface Window {
    __masterMoldRealisticWorkflowProbe: () => Promise<MasterMoldRealisticWorkflowResult>;
  }
}

window.__masterMoldRealisticWorkflowProbe = runMasterMoldRealisticWorkflowProbe;
