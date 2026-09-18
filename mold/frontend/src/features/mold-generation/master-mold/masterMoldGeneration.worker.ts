import { evaluateMasterMoldGeneration } from "./masterMoldGeneration.evaluate";
import { worldMeshFromSnapshot, type MasterMoldSeedSnapshot } from "./seed/masterMoldSeed";
import type { MasterMoldWorkerFailure, MasterMoldWorkerRequest, MasterMoldWorkerResponse } from "./masterMoldGeneration.worker.contracts";

type MasterMoldWorkerScope = {
  onmessage: ((event: MessageEvent<MasterMoldWorkerRequest>) => void) | null;
  postMessage: (message: MasterMoldWorkerResponse) => void;
};

const workerScope = self as unknown as MasterMoldWorkerScope;
const controllers = new Map<string, AbortController>();

const failure = (error: unknown): MasterMoldWorkerFailure => ({
  code: error instanceof Error && "code" in error ? String(error.code) : "master_mold_generation_failed",
  message: error instanceof Error ? error.message : "Master Mold generation failed.",
});

/**
 * Rehydrates the full seed snapshot contract from the compact transferred
 * payload. The transferred typed arrays are consumed directly (no Array.from
 * copy), and the world transform is applied HERE -- off the UI thread
 * (Execution 07 LOOP 02).
 */
function seedFromPayload(payload: Extract<MasterMoldWorkerRequest, { type: "generate" }>["seed"]): MasterMoldSeedSnapshot {
  return worldMeshFromSnapshot({
    schemaVersion: 1,
    seedId: payload.seedId,
    sourceModelId: payload.sourceModelId,
    sourceGeometryVersion: payload.sourceGeometryVersion,
    sourceMesh: {
      modelId: payload.sourceModelId,
      positions: payload.positions,
      indices: payload.indices,
      bounds: payload.bounds,
      geometryVersion: payload.sourceGeometryVersion,
    },
    sourceTransform: payload.sourceTransform,
    sourceBounds: payload.bounds,
    printerBuildVolume: payload.printerBuildVolume,
    processProfile: payload.processProfile,
    userPreferences: payload.userPreferences,
    sourceProjectRevision: payload.sourceProjectRevision,
  });
}

async function processMasterMoldRequest(request: Extract<MasterMoldWorkerRequest, { type: "generate" }>): Promise<void> {
  const controller = new AbortController();
  controllers.set(request.requestId, controller);

  try {
    const result = await evaluateMasterMoldGeneration(
      {
        operationId: request.operationId,
        generationVersion: request.generationVersion,
        seed: seedFromPayload(request.seed),
        priorSets: request.priorSets,
      },
      {
        signal: controller.signal,
        onStage: (stage) => workerScope.postMessage({ type: "progress", requestId: request.requestId, stage }),
      },
    );
    workerScope.postMessage({ type: "success", requestId: request.requestId, result });
  } catch (error) {
    workerScope.postMessage({ type: "failure", requestId: request.requestId, failure: failure(error) });
  } finally {
    controllers.delete(request.requestId);
  }
}

workerScope.onmessage = (event) => {
  const request = event.data;

  if (request.type === "cancel") {
    controllers.get(request.requestId)?.abort();
    return;
  }

  void processMasterMoldRequest(request);
};
