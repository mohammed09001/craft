/**
 * Execution 06 Article 19: real-browser proof that the Master Mold store
 * produces a verified `current` result from the imported part ALONE through
 * the SAME production store creator the toolbar drives -- no cutting plan,
 * no committed segmentation, no Create Cavity. The real Worker-backed
 * autonomous engine plans the working mold and cases each piece.
 */
import { createMasterMoldStoreCreator } from "@/features/mold-generation/master-mold/masterMold.store";
import {
  cancelActiveMasterMoldGeneration,
  runMasterMoldGenerationInWorker,
} from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";
import { buildMasterMoldSeedSnapshot } from "@/features/mold-generation/master-mold/seed/masterMoldSeed";
import { getManifoldModule, payloadFromManifold, boundsFromManifold, createBlankSolid } from "@/features/mold-generation/geometry/manifold";

export interface MasterMoldRealisticWorkflowResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly setCount: number | null;
  readonly status: string | null;
  readonly releaseMode: string | null;
  readonly pieceCount: number | null;
  readonly watertight: boolean | null;
}

// A 10x10x8 mm part: a genuinely manufacturable shape whose autonomous plan
// is the minimum two-piece working mold with verified tooling.
const PART = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 8 } };

async function runMasterMoldRealisticWorkflowProbe(): Promise<MasterMoldRealisticWorkflowResult> {
  try {
    const masterMoldStore = createMasterMoldStoreCreator({
      runMasterMoldGenerationInWorker,
      cancelActiveMasterMoldGeneration,
    });

    const module = await getManifoldModule();
    const partSolid = createBlankSolid(module, PART);
    const partMesh = payloadFromManifold(partSolid);
    const partBounds = boundsFromManifold(partSolid);
    partSolid.delete();

    const seed = buildMasterMoldSeedSnapshot({
      sourcePartGeometry: {
        modelId: "e2e-master-realistic",
        positions: partMesh.positions,
        indices: partMesh.indices,
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        localBounds: partBounds,
        geometryVersion: "e2e-master-realistic:1",
        sourceSignature: "e2e-master-realistic-sig:1",
      },
      printerBuildVolume: null,
      projectRevision: "e2e-master-realistic-rev",
    });

    const ok = await masterMoldStore.getState().generate({ seed });
    if (!ok) throw new Error("Master Mold generation did not complete.");

    const after = masterMoldStore.getState();
    const set = after.sets[0]?.set ?? null;

    return {
      ok: true,
      error: null,
      setCount: after.sets.length,
      status: after.status,
      releaseMode: set?.releaseMode ?? null,
      pieceCount: set?.assembly.pieces.length ?? null,
      watertight: set?.assembly.pieces.every((piece) => piece.watertight && piece.manifold) ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      setCount: null,
      status: null,
      releaseMode: null,
      pieceCount: null,
      watertight: null,
    };
  }
}

declare global {
  interface Window {
    __masterMoldRealisticWorkflowProbe: () => Promise<MasterMoldRealisticWorkflowResult>;
  }
}

window.__masterMoldRealisticWorkflowProbe = runMasterMoldRealisticWorkflowProbe;
