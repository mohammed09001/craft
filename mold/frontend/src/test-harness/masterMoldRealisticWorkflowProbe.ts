/**
 * Execution 05 Articles 05/12: real-browser proof that the Master Mold store
 * produces a verified `current` tooling set from authoritative project truth
 * through the SAME production store creators the toolbar drives -- a
 * committed stock body (adopted through the real committed-segmentation
 * store seam), the canonical part, and the real Worker-backed engine. The
 * fixture is physically manufacturable: the part sits flush with the stock's
 * bottom face, so the pocket is formed by tooling material anchored to the
 * case floor and withdraws with the case (no floating core).
 */
import { createStore } from "zustand/vanilla";

import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import {
  cancelActiveCavityGeneration,
  runCavityGenerationInWorker,
} from "@/features/mold-generation/cavity-generation/cavityGeneration.workerClient";
import { createSplitFaceStoreCreator, type SplitFaceState } from "@/features/mold-generation/split-face/splitFace.store";
import { cancelDerivedMoldEvaluation, runDerivedMoldEvaluation } from "@/features/mold-generation/workflow";
import { createMasterMoldStoreCreator } from "@/features/mold-generation/master-mold/masterMold.store";
import {
  cancelActiveMasterMoldGeneration,
  runMasterMoldGenerationInWorker,
} from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";
import { buildMasterMoldProjectSnapshot } from "@/features/mold-generation/master-mold/masterMoldSnapshot";
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

// Stock block 30x30x20 with the part (10x10x8) flush against its bottom
// face: the pocket opens downward, so a one-piece case with the pocket bump
// on its floor withdraws cleanly -- a genuinely manufacturable combination.
const STOCK = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 20 } };
const PART = { min: { x: 10, y: 10, z: 0 }, max: { x: 20, y: 20, z: 8 } };

async function runMasterMoldRealisticWorkflowProbe(): Promise<MasterMoldRealisticWorkflowResult> {
  try {
    const splitFaceStore = createStore<SplitFaceState>(
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

    // Commit a real stock body through the production committed-segmentation
    // seam (the same path Automatic Segmentation uses), then assemble the
    // snapshot from project truth.
    const module = await getManifoldModule();
    const stockSolid = createBlankSolid(module, STOCK);
    const stockMesh = payloadFromManifold(stockSolid);
    const stockBounds = boundsFromManifold(stockSolid);
    stockSolid.delete();

    const partMesh = canonicalCube("e2e-master-realistic", PART);
    const sourceDefinition = {
      schemaVersion: 1 as const,
      definitionId: "e2e-master-realistic-def",
      modelId: "e2e-master-realistic",
      coordinateSystem: { units: "millimeters" as const, upAxis: "Z" as const },
      selectionBoxBounds: PART,
      referenceMoldBlock: { clearanceMm: 10, bounds: STOCK },
      usedFaces: ["bottom"] as const,
    };
    splitFaceStore.getState().adoptCommittedSegmentationResult({
      sourceSignature: partMesh.sourceSignature,
      sourceDefinition,
      bodies: [
        {
          id: "e2e-stock-part",
          name: "E2E Stock Part",
          visible: true,
          mesh: stockMesh,
          bounds: stockBounds,
          triangleCount: stockMesh.indices.length / 3,
          volumeMm3: (STOCK.max.x - STOCK.min.x) * (STOCK.max.y - STOCK.min.y) * (STOCK.max.z - STOCK.min.z),
          watertight: true as const,
        },
      ],
      warnings: [],
    });

    const state = splitFaceStore.getState();
    const snapshot = buildMasterMoldProjectSnapshot({
      sourcePartMesh: {
        modelId: partMesh.modelId,
        positions: partMesh.positions,
        indices: partMesh.indices,
        transform: partMesh.transform,
        localBounds: partMesh.localBounds,
        geometryVersion: partMesh.geometryVersion,
        sourceSignature: partMesh.sourceSignature,
      },
      definition: state.definition!,
      cuttingPlanes: state.cuttingPlanes,
      sprueDefinitions: state.sprueDefinitions,
      printerBuildVolume: null,
      projectRevision: state.document.revision,
      projectFingerprint: state.document.fingerprint,
    });

    const ok = await masterMoldStore
      .getState()
      .generate({ snapshot }, { revision: snapshot.projectRevision, fingerprint: snapshot.projectFingerprint });
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
