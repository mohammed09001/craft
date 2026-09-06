import type { FinalMoldResult, MoldDocument, MoldEvaluationState } from "./moldWorkflow.contracts";

export interface MoldEvaluationCommitState {
  readonly document: MoldDocument;
  readonly evaluation: MoldEvaluationState;
}

/** The identity a caller captured before starting an async derived-mold evaluation. Both the success
 * path (a full `FinalMoldResult`) and a failure/cancellation path (which never produced one) can supply
 * this same shape, so one gate covers both. */
export type MoldEvaluationRequestIdentity = Pick<FinalMoldResult, "requestId" | "sourceRevision" | "sourceFingerprint">;

/** The only gate through which an asynchronous derived-mold evaluation outcome -- success, failure, or
 * cancellation -- may mutate authoritative state. A stale/superseded outcome must be discarded silently
 * regardless of whether it resolved or rejected; only the request that still matches current phase,
 * requestId, document revision, and fingerprint may commit. */
export function canCommitMoldEvaluation(
  state: MoldEvaluationCommitState,
  result: MoldEvaluationRequestIdentity,
): boolean {
  return state.evaluation.phase === "evaluating" &&
    state.evaluation.requestId === result.requestId &&
    state.document.revision === result.sourceRevision &&
    state.document.fingerprint === result.sourceFingerprint;
}

/** True when a derived-mold evaluation rejected because it was superseded (see
 * `derivedMoldEvaluation.workerClient.ts`'s `cancel`), not because it genuinely failed. A cancelled
 * request is lifecycle information, not a product failure, and must never be turned into
 * `evaluation.phase === "failed"`. */
export function isEvaluationCancelled(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: unknown }).code === "evaluation_cancelled";
}

export function nextEvaluationRequest(document: MoldDocument): MoldEvaluationState {
  return {
    phase: "evaluating",
    requestId: `mold-eval:${document.revision}:${document.fingerprint}`,
    sourceRevision: document.revision,
    sourceFingerprint: document.fingerprint,
    stage: "base",
    progress: 0,
    failure: null,
  };
}
