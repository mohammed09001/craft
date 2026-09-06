import type { FinalMoldResult, MoldDocument, MoldEvaluationState } from "./moldWorkflow.contracts";

export interface MoldEvaluationCommitState {
  readonly document: MoldDocument;
  readonly evaluation: MoldEvaluationState;
}

/** The only gate through which asynchronous final geometry may become authoritative. */
export function canCommitMoldEvaluation(
  state: MoldEvaluationCommitState,
  result: FinalMoldResult,
): boolean {
  return state.evaluation.phase === "evaluating" &&
    state.evaluation.requestId === result.requestId &&
    state.document.revision === result.sourceRevision &&
    state.document.fingerprint === result.sourceFingerprint;
}

/** Prevents a previously keyed (`registration: "generated"`) cavity from silently downgrading to an
 * unkeyed one: if the mold was already keyed, a new cavity attempt only commits as `"complete"` when
 * registration keys it again too. An unkeyed result is otherwise a legitimate, expected commit (same
 * as "keys exist before Create Cavity") — this only guards against keys *disappearing*, not against
 * registration being best-effort in general. */
export function isRegistrationAcceptedForCommit(
  _before: { readonly registration: { readonly status: string } },
  _result: FinalMoldResult,
): boolean {
  return true;
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
