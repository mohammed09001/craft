import type { MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";
import type { MasterMoldWorkerFailure, MasterMoldWorkerRequest, MasterMoldWorkerResponse } from "./masterMoldGeneration.worker.contracts";
import type { MasterMoldProgressStage } from "./engine/contracts";

type MasterMoldWorkerLike = {
  onmessage: ((event: MessageEvent<MasterMoldWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: MasterMoldWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
};

export type MasterMoldWorkerFactory = () => MasterMoldWorkerLike;

export interface MasterMoldWorkerRunOptions {
  readonly onStage?: (stage: MasterMoldProgressStage) => void;
  readonly signal?: AbortSignal;
}

export class MasterMoldWorkerError extends Error {
  readonly code: string;

  constructor(failure: MasterMoldWorkerFailure) {
    super(failure.message);
    this.name = "MasterMoldWorkerError";
    this.code = failure.code;
  }
}

const createBrowserWorker: MasterMoldWorkerFactory = () =>
  new Worker(new URL("./masterMoldGeneration.worker.ts", import.meta.url), { type: "module" }) as unknown as MasterMoldWorkerLike;

export const DEFAULT_MASTER_MOLD_WORKER_TIMEOUT_MS = 180_000;

/**
 * Execution 06 Article 13.1 + Execution 07 LOOP 02: the Worker request
 * geometry travels as the seed's OWN local-space typed arrays whose buffers
 * are TRANSFERRED (zero-copy) -- no conversion, no world transform, and no
 * full-array copy on the main thread. The seed snapshot exclusively owns
 * its buffers (built via Float32Array.from/Uint32Array.from), so transferring
 * them never detaches an array another consumer still reads. The Worker
 * applies the world transform (see worldMeshFromSnapshot).
 */
export function buildWorkerSeedPayload(request: MasterMoldRequest): {
  payload: Extract<MasterMoldWorkerRequest, { type: "generate" }>["seed"];
  transfer: Transferable[];
} {
  const seed = request.seed;
  const positions = seed.sourceMesh.positions;
  const indices = seed.sourceMesh.indices;
  return {
    payload: {
      seedId: seed.seedId,
      sourceModelId: seed.sourceModelId,
      sourceGeometryVersion: seed.sourceGeometryVersion,
      positions,
      indices,
      bounds: seed.sourceBounds,
      sourceTransform: seed.sourceTransform,
      printerBuildVolume: seed.printerBuildVolume,
      processProfile: seed.processProfile,
      userPreferences: seed.userPreferences,
      sourceProjectRevision: seed.sourceProjectRevision,
    },
    transfer: [positions.buffer, indices.buffer],
  };
}

export function createMasterMoldWorkerRunner(
  createWorker: MasterMoldWorkerFactory = createBrowserWorker,
  timeoutMs = DEFAULT_MASTER_MOLD_WORKER_TIMEOUT_MS,
) {
  let cancelActive: (reason?: string) => void = () => undefined;

  const run = (request: MasterMoldRequest, options: MasterMoldWorkerRunOptions = {}): Promise<MasterMoldResult> => {
    cancelActive("A newer Master Mold generation request replaced this request.");

    // Worker-less fallback pulls in the whole Manifold/three-mesh-bvh Master
    // Mold engine transitively -- a dynamic import keeps it out of the
    // eagerly-loaded main bundle, matching the cavity Worker client's policy.
    if (createWorker === createBrowserWorker && typeof Worker === "undefined") {
      return import("./masterMoldGeneration.evaluate").then(({ evaluateMasterMoldGeneration }) =>
        evaluateMasterMoldGeneration(request, options),
      );
    }

    const worker = createWorker();
    const requestId = `${request.operationId}:${request.generationVersion}`;
    const { payload, transfer } = buildWorkerSeedPayload(request);

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
        options.signal?.removeEventListener("abort", abort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
        if (cancelActive === cancel) cancelActive = () => undefined;
        action();
      };

      const cancel = (reason = "Master Mold generation was cancelled.") => {
        if (settled) return;
        worker.postMessage({ type: "cancel", requestId });
        finish(() => reject(new MasterMoldWorkerError({ code: "cancelled", message: reason })));
      };

      const abort = () => cancel();
      cancelActive = cancel;
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) {
        abort();
        return;
      }

      timeoutHandle = setTimeout(
        () =>
          finish(() =>
            reject(
              new MasterMoldWorkerError({
                code: "master_mold_timeout",
                message: `Master Mold generation exceeded ${timeoutMs} ms.`,
              }),
            ),
          ),
        timeoutMs,
      );

      worker.onmessage = (event) => {
        const response = event.data;
        if (response.requestId !== requestId) return;

        if (response.type === "progress") {
          options.onStage?.(response.stage);
          return;
        }

        if (response.type === "success") {
          finish(() => resolve(response.result));
          return;
        }

        finish(() => reject(new MasterMoldWorkerError(response.failure)));
      };

      worker.onerror = (event) =>
        finish(() => reject(new MasterMoldWorkerError({ code: "master_mold_worker_error", message: event.message || "Master Mold Worker execution failed." })));
      worker.onmessageerror = () =>
        finish(() => reject(new MasterMoldWorkerError({ code: "master_mold_worker_message_error", message: "Master Mold Worker returned an unreadable response." })));

      worker.postMessage({ type: "generate", requestId, operationId: request.operationId, generationVersion: request.generationVersion, seed: payload, priorSets: request.priorSets }, transfer);
    });
  };

  return Object.assign(run, { cancel: (reason?: string) => cancelActive(reason) });
}

export const runMasterMoldGenerationInWorker = createMasterMoldWorkerRunner();
export const cancelActiveMasterMoldGeneration = (reason?: string) => runMasterMoldGenerationInWorker.cancel(reason);
