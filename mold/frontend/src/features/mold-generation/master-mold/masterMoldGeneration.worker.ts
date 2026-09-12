import { evaluateMasterMoldGeneration } from "./masterMoldGeneration.evaluate";
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

async function processMasterMoldRequest(request: Extract<MasterMoldWorkerRequest, { type: "generate" }>): Promise<void> {
  const controller = new AbortController();
  controllers.set(request.requestId, controller);

  try {
    const result = await evaluateMasterMoldGeneration(request.request, {
      signal: controller.signal,
      onProgress: (completed, total) => workerScope.postMessage({ type: "progress", requestId: request.requestId, completed, total }),
    });
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
