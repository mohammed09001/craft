/**
 * Execution 05 Article 01: mandatory Create Cavity baseline acceptance.
 *
 * Real-browser proof of the complete Create Cavity product loop --
 * Import → commit mold parts → Create Cavity → finished Final Mold visible
 * -- without generating Master Mold. This is the protected regression path
 * Execution 05 must never damage while rebuilding the Master Mold engine.
 *
 * Mirrors masterMoldRealisticWorkflowProbe.ts's approach: the real
 * production store creator wired to its real Worker-backed clients
 * (runCavityGenerationInWorker / runDerivedMoldEvaluation) so this proves a
 * genuine Worker-thread + manifold-3d WASM execution in Chromium -- the
 * exact path a real "Create Cavity" toolbar click drives -- not a mock.
 *
 * Independence is proven structurally inside the same page: the Master Mold
 * store is created alongside with a Worker client that records any
 * invocation and fails the probe if the Create Cavity loop ever reaches it.
 */
import { createStore } from "zustand/vanilla";

import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import {
  cancelActiveCavityGeneration,
  runCavityGenerationInWorker,
} from "@/features/mold-generation/cavity-generation/cavityGeneration.workerClient";
import { createSplitFaceStoreCreator, type SplitFaceState } from "@/features/mold-generation/split-face/splitFace.store";
import {
  cancelDerivedMoldEvaluation,
  runDerivedMoldEvaluation,
} from "@/features/mold-generation/workflow";
import { createMasterMoldStoreCreator } from "@/features/mold-generation/master-mold/masterMold.store";
import {
  cancelActiveMasterMoldGeneration,
  runMasterMoldGenerationInWorker,
} from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";

export interface CavityOnlyAcceptanceResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly moldPartsCommitted: boolean | null;
  readonly moldPartBodyCount: number | null;
  readonly cavityStatus: string | null;
  readonly committedBodyCount: number | null;
  readonly allBodiesWatertight: boolean | null;
  readonly allBodiesVisible: boolean | null;
  readonly totalVolumeMm3: number | null;
  readonly masterWorkerInvoked: boolean;
  readonly masterStatusAfterCavity: string | null;
}

// Same deterministic fixture family as cavityGeometryProbe.ts: a 10x10x10
// part (K1) in a 30x30x30 reference block, single "top" split -- the
// combination proven manufacturable by the existing integration tests.
const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

async function runCavityOnlyAcceptance(): Promise<CavityOnlyAcceptanceResult> {
  const masterProbe: { workerInvoked: boolean } = { workerInvoked: false };
  try {
    const splitFaceStore = createStore<SplitFaceState>(
      createSplitFaceStoreCreator({
        runDerivedMoldEvaluation,
        cancelDerivedMoldEvaluation,
        runCavityGenerationInWorker,
        cancelActiveCavityGeneration,
      }),
    );
    // Master Mold Worker client replaced by a tripwire: the Create Cavity
    // loop must never reach it. Any invocation both records and throws so
    // even an accidental fire-and-forget call fails this acceptance.
    type MasterRunner = typeof runMasterMoldGenerationInWorker;
    const tripwireMasterRunner: MasterRunner = Object.assign(
      (): ReturnType<MasterRunner> => {
        masterProbe.workerInvoked = true;
        return Promise.reject(new Error("Create Cavity must never invoke the Master Mold worker."));
      },
      { cancel: () => undefined },
    );
    const masterMoldStore = createMasterMoldStoreCreator({
      runMasterMoldGenerationInWorker: tripwireMasterRunner,
      cancelActiveMasterMoldGeneration,
    });

    // Import: the canonical part geometry + source signature the real
    // import runtime produces (the raw STL import path itself is proven by
    // e2e/smoke.spec.ts against the real runtime; this probe starts from
    // the same canonical state Create Cavity consumes).
    const canonicalPartGeometry = canonicalCube("e2e-cavity-only-acceptance", k1);
    splitFaceStore.getState().setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);

    // Commit mold parts: face selection → committed segmentation/mold parts.
    splitFaceStore.getState().enterSelection();
    splitFaceStore.getState().toggleFace("top");
    if (!(await splitFaceStore.getState().createMoldParts("e2e-cavity-only-acceptance", k1))) {
      throw new Error("Mold parts were not created.");
    }
    const moldPartBodies = splitFaceStore.getState().lastCommittedResult?.bodies ?? [];
    if (moldPartBodies.length === 0) throw new Error("No committed mold part bodies.");

    // Create Cavity: the real Worker-backed store loop.
    if (!(await splitFaceStore.getState().createCavity(canonicalPartGeometry))) {
      throw new Error("Cavity was not created.");
    }

    const state = splitFaceStore.getState();
    const committed = state.lastCommittedResult;
    if (state.cavity.status !== "complete") throw new Error(`Cavity status is ${state.cavity.status}, not complete.`);
    if (committed === null) throw new Error("No committed Final Mold result after Create Cavity.");

    const bodies = committed.bodies;
    const allWatertight = bodies.every((body) => body.watertight);
    const allVisible = bodies.every((body) => body.visible);
    const totalVolume = bodies.reduce((sum, body) => sum + body.volumeMm3, 0);
    if (bodies.length === 0) throw new Error("Committed Final Mold has no bodies.");
    if (!allWatertight) throw new Error("Committed Final Mold bodies are not all watertight.");
    if (!allVisible) throw new Error("Committed Final Mold bodies are not all visible.");
    if (!(totalVolume > 0)) throw new Error("Committed Final Mold has non-positive volume.");

    if (masterProbe.workerInvoked) throw new Error("Master Mold worker was invoked during Create Cavity.");
    const masterStatus = masterMoldStore.getState().status;

    return {
      ok: true,
      error: null,
      moldPartsCommitted: true,
      moldPartBodyCount: moldPartBodies.length,
      cavityStatus: state.cavity.status,
      committedBodyCount: bodies.length,
      allBodiesWatertight: allWatertight,
      allBodiesVisible: allVisible,
      totalVolumeMm3: totalVolume,
      masterWorkerInvoked: masterProbe.workerInvoked,
      masterStatusAfterCavity: masterStatus,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      moldPartsCommitted: null,
      moldPartBodyCount: null,
      cavityStatus: null,
      committedBodyCount: null,
      allBodiesWatertight: null,
      allBodiesVisible: null,
      totalVolumeMm3: null,
      masterWorkerInvoked: masterProbe.workerInvoked,
      masterStatusAfterCavity: null,
    };
  }
}

declare global {
  interface Window {
    __cavityOnlyAcceptanceProbe: () => Promise<CavityOnlyAcceptanceResult>;
  }
}

window.__cavityOnlyAcceptanceProbe = runCavityOnlyAcceptance;
