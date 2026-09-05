import type {
  SegmentationExecutionRequest,
  SegmentationExecutionResult,
} from "./segmentationExecution.contracts";
import type {
  SegmentationExecutionWorkerFailure,
  SegmentationExecutionWorkerRequest,
  SegmentationExecutionWorkerResponse,
} from "./segmentationExecution.worker.contracts";

interface WorkerLike {
  onmessage: ((event: MessageEvent<SegmentationExecutionWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: SegmentationExecutionWorkerRequest): void;
  terminate(): void;
}

export type SegmentationExecutionWorkerFactory = () => WorkerLike;

export class SegmentationExecutionWorkerError extends Error {
  constructor(
    readonly code: SegmentationExecutionWorkerFailure["code"],
    message: string,
  ) {
    super(message);
  }
}

const browserWorker: SegmentationExecutionWorkerFactory = () =>
  new Worker(new URL("./segmentationExecution.worker.ts", import.meta.url), {
    type: "module",
  });

export const DEFAULT_SEGMENTATION_EXECUTION_TIMEOUT_MS = 180_000;

export function createSegmentationExecutionRunner(
  createWorker: SegmentationExecutionWorkerFactory = browserWorker,
  timeoutMs = DEFAULT_SEGMENTATION_EXECUTION_TIMEOUT_MS,
) {
  let cancelActive: (reason?: string) => void = () => undefined;
  const run = (
    request: SegmentationExecutionRequest,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<SegmentationExecutionResult> => {
    cancelActive("A newer segmentation execution replaced this request.");
    const worker = createWorker();
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
        if (cancelActive === cancel) cancelActive = () => undefined;
        action();
      };
      const cancel = (reason = "Segmentation execution was cancelled.") => {
        if (settled) return;
        worker.postMessage({ type: "cancel", requestId: request.id });
        finish(() => reject(new SegmentationExecutionWorkerError("execution_cancelled", reason)));
      };
      const abort = () => cancel();
      cancelActive = cancel;
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) {
        abort();
        return;
      }
      timeout = setTimeout(
        () =>
          finish(() =>
            reject(
              new SegmentationExecutionWorkerError(
                "worker_timeout",
                `Segmentation execution exceeded ${timeoutMs} ms.`,
              ),
            ),
          ),
        timeoutMs,
      );
      worker.onmessage = (event) => {
        const response = event.data;
        if (response.requestId !== request.id) return;
        if (response.type === "success") {
          finish(() => resolve(response.result));
        } else {
          finish(() => reject(new SegmentationExecutionWorkerError(response.failure.code, response.failure.message)));
        }
      };
      worker.onerror = (event) =>
        finish(() => reject(new SegmentationExecutionWorkerError("worker_error", event.message || "Segmentation worker failed.")));
      worker.onmessageerror = () =>
        finish(() => reject(new SegmentationExecutionWorkerError("worker_error", "Segmentation worker returned an unreadable response.")));
      worker.postMessage({ type: "execute", requestId: request.id, request });
    });
  };
  return Object.assign(run, {
    cancel: (reason?: string) => cancelActive(reason),
  });
}

export const runSegmentationExecutionInWorker =
  createSegmentationExecutionRunner();

export const cancelActiveSegmentationExecution = (reason?: string) =>
  runSegmentationExecutionInWorker.cancel(reason);
