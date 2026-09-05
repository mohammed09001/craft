import type { DraftAnalysisEngine } from "./draftAnalysis.contracts";
import {
  createDraftAnalysisBoundarySnapshot,
  type DraftAnalysisBoundarySnapshot,
} from "./draftAnalysis.boundarySnapshot";
import {
  runDraftAnalysisForSession,
  type DraftAnalysisSessionRunnerOptions,
} from "./draftAnalysis.sessionRunner";
import type { DraftAnalysisSessionLike } from "./draftAnalysis.sessionAdapter";

export interface DraftAnalysisSessionBoundaryOptions {
  readonly engine?: DraftAnalysisEngine;
}

/**
 * Creates a draft analysis boundary snapshot directly from an Analysis Session.
 */
export const createDraftAnalysisBoundaryFromSession = (
  session: DraftAnalysisSessionLike,
  options: DraftAnalysisSessionBoundaryOptions = {},
): DraftAnalysisBoundarySnapshot => {
  const runnerOptions: DraftAnalysisSessionRunnerOptions =
    options.engine === undefined ? {} : { engine: options.engine };

  const draftAnalysisResult = runDraftAnalysisForSession(session, runnerOptions);

  return createDraftAnalysisBoundarySnapshot(draftAnalysisResult);
};

