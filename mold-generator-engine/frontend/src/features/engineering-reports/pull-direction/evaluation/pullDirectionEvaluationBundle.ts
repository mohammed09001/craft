import {
  evaluatePullDirectionForEngineeringReport,
  type PullDirectionEvaluationFacadeInput,
} from "./pullDirectionEvaluationFacade";
import {
  createPullDirectionEvaluationPresentation,
  type PullDirectionEvaluationPresentation,
} from "./pullDirectionEvaluationPresentation";
import {
  createPullDirectionEvaluationReportSnapshot,
  type PullDirectionEvaluationReportSnapshot,
} from "./pullDirectionEvaluationSnapshot";
import {
  validatePullDirectionEvaluationReportSnapshot,
  type PullDirectionEvaluationSnapshotValidationResult,
} from "./pullDirectionEvaluationSnapshotValidation";
import type { PullDirectionEvaluationReportSection } from "./pullDirectionEvaluationReportBridge";

export type PullDirectionEvaluationBundleInput =
  PullDirectionEvaluationFacadeInput;

export interface PullDirectionEvaluationBundle {
  readonly reportSection: PullDirectionEvaluationReportSection;
  readonly snapshot: PullDirectionEvaluationReportSnapshot;
  readonly snapshotValidation: PullDirectionEvaluationSnapshotValidationResult;
  readonly presentation: PullDirectionEvaluationPresentation;
}

export const createPullDirectionEvaluationBundle = (
  input: PullDirectionEvaluationBundleInput,
): PullDirectionEvaluationBundle => {
  const facadeResult = evaluatePullDirectionForEngineeringReport(input);
  const snapshot = createPullDirectionEvaluationReportSnapshot(
    facadeResult.reportSection,
  );
  const snapshotValidation =
    validatePullDirectionEvaluationReportSnapshot(snapshot);
  const presentation = createPullDirectionEvaluationPresentation(snapshot);

  return {
    reportSection: facadeResult.reportSection,
    snapshot,
    snapshotValidation,
    presentation,
  };
};

