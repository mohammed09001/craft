import type {
  DraftAnalysisEngine,
  DraftAnalysisResult,
} from "./draftAnalysis.contracts";
import { createDraftAnalysisFoundationEngine } from "./draftAnalysis.foundation";
import {
  createDraftAnalysisInputFromSession,
  type DraftAnalysisSessionLike,
} from "./draftAnalysis.sessionAdapter";

export interface DraftAnalysisSessionRunnerOptions {
  readonly engine?: DraftAnalysisEngine;
}

/**
 * Runs the internal Draft Analysis foundation flow for an Analysis Session.
 *
 * Stage 8A responsibility:
 * - Convert an Analysis Session-like object into DraftAnalysisInput.
 * - Run the foundation Draft Analysis engine.
 * - Return internal DraftAnalysisResult for Chapter 10 preparation.
 *
 * Not included:
 * - No real draft-angle algorithm.
 * - No heatmap.
 * - No Engineering Report.
 * - No dashboard.
 * - No user recommendation.
 */
export const runDraftAnalysisForSession = (
  session: DraftAnalysisSessionLike,
  options: DraftAnalysisSessionRunnerOptions = {},
): DraftAnalysisResult => {
  const engine = options.engine ?? createDraftAnalysisFoundationEngine();
  const input = createDraftAnalysisInputFromSession(session);

  return engine.analyze(input);
};
