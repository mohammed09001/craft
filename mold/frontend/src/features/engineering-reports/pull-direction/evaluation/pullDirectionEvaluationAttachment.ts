import type {
  PullDirectionEvaluationBundle,
} from "./pullDirectionEvaluationBundle";
import {
  createPullDirectionEvaluationBundleFromReportSource,
  type PullDirectionEvaluationReportSource,
} from "./pullDirectionEvaluationReportSource";
import type {
  PullDirectionEvaluationScoreProfile,
} from "./pullDirectionEvaluationScoring";

export interface PullDirectionEvaluationAttachment {
  readonly pullDirectionEvaluation: PullDirectionEvaluationBundle;
}

export interface PullDirectionEvaluationAttachmentInput {
  readonly report: PullDirectionEvaluationReportSource | null | undefined;
  readonly scoreProfile?: PullDirectionEvaluationScoreProfile | undefined;
}

export interface PullDirectionEvaluationReportAttachmentInput<
  TReport extends PullDirectionEvaluationReportSource,
> {
  readonly report: TReport;
  readonly scoreProfile?: PullDirectionEvaluationScoreProfile | undefined;
}

export type PullDirectionEvaluationAttachedReport<
  TReport extends PullDirectionEvaluationReportSource,
> = TReport & PullDirectionEvaluationAttachment;

const createBundleFromReport = (
  report: PullDirectionEvaluationReportSource | null | undefined,
  scoreProfile?: PullDirectionEvaluationScoreProfile,
): PullDirectionEvaluationBundle => {
  if (scoreProfile === undefined) {
    return createPullDirectionEvaluationBundleFromReportSource({
      report,
    });
  }

  return createPullDirectionEvaluationBundleFromReportSource(scoreProfile === undefined
    ? { report }
    : { report, scoreProfile });
};

export const createPullDirectionEvaluationAttachment = (
  input: PullDirectionEvaluationAttachmentInput,
): PullDirectionEvaluationAttachment => {
  return {
    pullDirectionEvaluation: createBundleFromReport(
      input.report,
      input.scoreProfile,
    ),
  };
};

export const attachPullDirectionEvaluationToReport = <
  TReport extends PullDirectionEvaluationReportSource,
>(
  input: PullDirectionEvaluationReportAttachmentInput<TReport>,
): PullDirectionEvaluationAttachedReport<TReport> => {
  const attachment = createPullDirectionEvaluationAttachment({
    report: input.report,
    scoreProfile: input.scoreProfile,
  });

  return {
    ...input.report,
    ...attachment,
  } as PullDirectionEvaluationAttachedReport<TReport>;
};


