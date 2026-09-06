/// <reference lib="webworker" />

import { executePlaneSegmentation } from "./segmentationPlaneExecutor";
import type {
  SegmentationExecutionWorkerRequest,
  SegmentationExecutionWorkerResponse,
} from "./segmentationExecution.worker.contracts";

const scope = self as DedicatedWorkerGlobalScope;
const cancelled = new Set<string>();

scope.onmessage = async (event: MessageEvent<SegmentationExecutionWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.requestId);
    return;
  }
  try {
    if (cancelled.has(message.requestId)) return;
    const result = await executePlaneSegmentation(message.request, {
      isCancelled: () => cancelled.has(message.requestId),
      yieldBetweenCuts: () =>
        new Promise<void>((resolve) => setTimeout(resolve, 0)),
    });
    if (cancelled.has(message.requestId)) return;
    const response: SegmentationExecutionWorkerResponse = {
      type: "success",
      requestId: message.requestId,
      result,
    };
    scope.postMessage(response);
  } catch (error) {
    if (cancelled.has(message.requestId)) return;
    const response: SegmentationExecutionWorkerResponse = {
      type: "failure",
      requestId: message.requestId,
      failure: {
        code: "worker_error",
        message: error instanceof Error ? error.message : "Segmentation worker failed.",
      },
    };
    scope.postMessage(response);
  } finally {
    cancelled.delete(message.requestId);
  }
};

export {};
