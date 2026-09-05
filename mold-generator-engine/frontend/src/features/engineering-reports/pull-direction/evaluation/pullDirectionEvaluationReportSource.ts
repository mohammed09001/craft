import {
  createPullDirectionEvaluationBundle,
  type PullDirectionEvaluationBundle,
} from "./pullDirectionEvaluationBundle";
import type { PullDirectionRankedCandidateLike } from "./pullDirectionEvaluationAdapter";
import type { PullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

export interface PullDirectionEvaluationReportSource {
  readonly rankedCandidates?: readonly PullDirectionRankedCandidateLike[] | null;
}

export interface PullDirectionEvaluationReportSourceInput {
  readonly report: PullDirectionEvaluationReportSource | null | undefined;
  readonly scoreProfile?: PullDirectionEvaluationScoreProfile | undefined;
}

const readRankedCandidatesFromReport = (
  report: PullDirectionEvaluationReportSource | null | undefined,
): readonly PullDirectionRankedCandidateLike[] => {
  if (report === null || report === undefined) {
    return [];
  }

  if (report.rankedCandidates === null || report.rankedCandidates === undefined) {
    return [];
  }

  return report.rankedCandidates;
};

export const createPullDirectionEvaluationBundleFromReportSource = (
  input: PullDirectionEvaluationReportSourceInput,
): PullDirectionEvaluationBundle => {
  return createPullDirectionEvaluationBundle({
    rankedCandidates: readRankedCandidatesFromReport(input.report),
    scoreProfile: input.scoreProfile,
  });
};


