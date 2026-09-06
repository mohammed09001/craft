/// <reference lib="webworker" />
import { evaluateDerivedMold } from "./evaluateDerivedMold";
import type { DerivedMoldWorkerRequest, DerivedMoldWorkerResponse } from "./derivedMoldEvaluation.contracts";

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const cancelled = new Set<string>();
scope.onmessage = (event: MessageEvent<DerivedMoldWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") { cancelled.add(request.requestId); return; }
  const { input } = request;
  void evaluateDerivedMold(input, (stage, progress) => {
    if (!cancelled.has(input.requestId)) scope.postMessage({ type: "progress", requestId: input.requestId, stage, progress } satisfies DerivedMoldWorkerResponse);
  }).then((result) => {
    if (!cancelled.delete(input.requestId)) scope.postMessage({ type: "success", requestId: input.requestId, result } satisfies DerivedMoldWorkerResponse);
  }).catch((error: unknown) => {
    if (!cancelled.delete(input.requestId)) scope.postMessage({ type: "failure", requestId: input.requestId, reasonCode: "derived_evaluation_failed", message: error instanceof Error ? error.message : "Derived mold evaluation failed." } satisfies DerivedMoldWorkerResponse);
  });
};
