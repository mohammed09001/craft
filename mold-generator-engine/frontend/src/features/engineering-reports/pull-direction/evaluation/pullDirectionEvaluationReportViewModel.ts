import {
  createPullDirectionEvaluationBundleFromReportSource,
  type PullDirectionEvaluationReportSource,
} from "./pullDirectionEvaluationReportSource";
import type { PullDirectionEvaluationBundle } from "./pullDirectionEvaluationBundle";
import type { PullDirectionEvaluationPresentation } from "./pullDirectionEvaluationPresentation";
import type {
  PullDirectionEvaluationReportSnapshot,
  PullDirectionEvaluationVectorSnapshot,
} from "./pullDirectionEvaluationSnapshot";
import type { PullDirectionEvaluationSnapshotValidationResult } from "./pullDirectionEvaluationSnapshotValidation";
import type { PullDirectionEvaluationReportStatus } from "./pullDirectionEvaluationReportBridge";
import type { PullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

export interface PullDirectionEvaluationReportViewModelInput {
  readonly report: PullDirectionEvaluationReportSource | null | undefined;
  readonly scoreProfile?: PullDirectionEvaluationScoreProfile | undefined;
}

export interface PullDirectionEvaluationReportViewModelState {
  readonly status: PullDirectionEvaluationReportStatus;
  readonly isReady: boolean;
  readonly requiresReview: boolean;
  readonly isBlocked: boolean;
  readonly canUseBestCandidate: boolean;
}

export interface PullDirectionEvaluationReportViewModelBestCandidate {
  readonly candidateId: string;
  readonly score: number;
  readonly normalizedDirection: PullDirectionEvaluationVectorSnapshot | null;
  readonly label: string;
}

export interface PullDirectionEvaluationReportViewModel {
  readonly state: PullDirectionEvaluationReportViewModelState;
  readonly bestCandidate: PullDirectionEvaluationReportViewModelBestCandidate | null;
  readonly snapshot: PullDirectionEvaluationReportSnapshot;
  readonly validation: PullDirectionEvaluationSnapshotValidationResult;
  readonly presentation: PullDirectionEvaluationPresentation;
  readonly bundle: PullDirectionEvaluationBundle;
}

const createBundle = (
  input: PullDirectionEvaluationReportViewModelInput,
): PullDirectionEvaluationBundle => {
  if (input.scoreProfile === undefined) {
    return createPullDirectionEvaluationBundleFromReportSource({
      report: input.report,
    });
  }

  return createPullDirectionEvaluationBundleFromReportSource({
    report: input.report,
    scoreProfile: input.scoreProfile,
  });
};

const createState = (
  status: PullDirectionEvaluationReportStatus,
  validation: PullDirectionEvaluationSnapshotValidationResult,
): PullDirectionEvaluationReportViewModelState => {
  const isReady = status === "ready";
  const requiresReview = status === "review_required";
  const isBlocked = status === "blocked";

  return {
    status,
    isReady,
    requiresReview,
    isBlocked,
    canUseBestCandidate: validation.isValid && (isReady || requiresReview),
  };
};

const createBestCandidateViewModel = (
  snapshot: PullDirectionEvaluationReportSnapshot,
  presentation: PullDirectionEvaluationPresentation,
): PullDirectionEvaluationReportViewModelBestCandidate | null => {
  if (snapshot.bestCandidate === null) {
    return null;
  }

  return {
    candidateId: snapshot.bestCandidate.candidateId,
    score: snapshot.bestCandidate.score,
    normalizedDirection: snapshot.bestCandidate.normalizedDirection,
    label: presentation.summary.bestCandidateLabel,
  };
};

export const createPullDirectionEvaluationReportViewModel = (
  input: PullDirectionEvaluationReportViewModelInput,
): PullDirectionEvaluationReportViewModel => {
  const bundle = createBundle(input);

  return {
    state: createState(bundle.reportSection.status, bundle.snapshotValidation),
    bestCandidate: createBestCandidateViewModel(
      bundle.snapshot,
      bundle.presentation,
    ),
    snapshot: bundle.snapshot,
    validation: bundle.snapshotValidation,
    presentation: bundle.presentation,
    bundle,
  };
};

