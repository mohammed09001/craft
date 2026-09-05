import { evaluateDerivedMold } from "./evaluateDerivedMold";
import type { DerivedMoldEvaluationInput, DerivedMoldEvaluationResult, DerivedMoldWorkerRequest, DerivedMoldWorkerResponse } from "./derivedMoldEvaluation.contracts";

type WorkerLike = { onmessage: ((event: MessageEvent<DerivedMoldWorkerResponse>) => void) | null; onerror: ((event: ErrorEvent) => void) | null; postMessage(message: DerivedMoldWorkerRequest): void; terminate(): void };
export type DerivedMoldWorkerFactory = () => WorkerLike;
const browserWorker: DerivedMoldWorkerFactory = () => new Worker(new URL("./derivedMoldEvaluation.worker.ts", import.meta.url), { type: "module" });

/**
 * Builds a runner that reuses a single lazily-created Worker across every evaluation instead of
 * spawning/terminating a fresh one per call. Sprue edits (resize/move/commit) call this on every commit, and a
 * fresh Worker would re-instantiate the Manifold WASM module from zero each time — the dominant cost behind
 * sluggish Sprue interaction. Superseded requests are still stopped from resolving via the requestId-scoped
 * `cancel` message (see worker.ts); we no longer hard-kill the thread, so an already-superseded computation may
 * keep running harmlessly in the background until the requestId/cache checks discard its result.
 */
export function createDerivedMoldEvaluationRunner(createWorker: DerivedMoldWorkerFactory = browserWorker) {
  let worker: WorkerLike | null = null;
  const getWorker = (): WorkerLike => (worker ??= createWorker());
  let cancelActive: (reason?: string) => void = () => undefined;

  const run = (
    input: DerivedMoldEvaluationInput,
    onProgress?: (stage: "sprues" | "registration", progress: number) => void,
  ): Promise<DerivedMoldEvaluationResult> => {
    cancelActive("A newer mold evaluation replaced this request.");
    if (createWorker === browserWorker && typeof Worker === "undefined") return evaluateDerivedMold(input, onProgress);
    const activeWorker = getWorker();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => { if (settled) return; settled = true; activeWorker.onmessage = null; activeWorker.onerror = null; if (cancelActive === cancel) cancelActive = () => undefined; action(); };
      const cancel = (reason = "Derived mold evaluation was cancelled.") => { activeWorker.postMessage({ type: "cancel", requestId: input.requestId }); finish(() => reject(Object.assign(new Error(reason), { code: "evaluation_cancelled" }))); };
      cancelActive = cancel;
      activeWorker.onmessage = (event) => {
        const response = event.data;
        if (response.requestId !== input.requestId) return;
        if (response.type === "progress") { onProgress?.(response.stage, response.progress); return; }
        if (response.type === "success") { finish(() => resolve(response.result)); return; }
        finish(() => reject(Object.assign(new Error(response.message), { code: response.reasonCode })));
      };
      activeWorker.onerror = (event) => finish(() => reject(Object.assign(new Error(event.message || "Derived mold Worker failed."), { code: "derived_worker_error" })));
      activeWorker.postMessage({ type: "evaluate", input });
    });
  };

  return Object.assign(run, { cancel: (reason?: string) => cancelActive(reason) });
}

export const runDerivedMoldEvaluation = createDerivedMoldEvaluationRunner();
export const cancelDerivedMoldEvaluation = (reason?: string) => runDerivedMoldEvaluation.cancel(reason);
