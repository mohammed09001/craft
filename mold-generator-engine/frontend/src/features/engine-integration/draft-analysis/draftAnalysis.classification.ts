import type { DraftFaceBand } from "./draftAnalysis.contracts";

export interface DraftBandClassificationInput {
  readonly draftAngleDegrees: number | null;
  readonly zeroDraftToleranceDegrees: number;
}

export const classifyDraftFaceBand = ({
  draftAngleDegrees,
  zeroDraftToleranceDegrees,
}: DraftBandClassificationInput): DraftFaceBand => {
  if (draftAngleDegrees === null || Number.isNaN(draftAngleDegrees)) {
    return "undetermined";
  }

  const tolerance = Math.max(0, zeroDraftToleranceDegrees);

  if (draftAngleDegrees > tolerance) {
    return "positive_draft";
  }

  if (draftAngleDegrees < -tolerance) {
    return "negative_draft";
  }

  return "zero_draft";
};
