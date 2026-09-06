import type {
  DraftAnalysisSummary,
  DraftFaceBand,
  DraftFaceSample,
} from "./draftAnalysis.contracts";

const countBand = (
  faceSamples: readonly DraftFaceSample[],
  band: DraftFaceBand,
): number => faceSamples.filter((sample) => sample.band === band).length;

const getNumericDraftAngles = (
  faceSamples: readonly DraftFaceSample[],
): readonly number[] =>
  faceSamples
    .map((sample) => sample.draftAngleDegrees)
    .filter((angle): angle is number => angle !== undefined && !Number.isNaN(angle));

const averageNonEmpty = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export const createDraftAnalysisSummaryFromFaceSamples = (
  faceSamples: readonly DraftFaceSample[],
): DraftAnalysisSummary => {
  const numericDraftAngles = getNumericDraftAngles(faceSamples);

  const summary: DraftAnalysisSummary = {
    totalFaceCount: faceSamples.length,
    analyzedFaceCount: numericDraftAngles.length,
    positiveDraftFaceCount: countBand(faceSamples, "positive_draft"),
    zeroDraftFaceCount: countBand(faceSamples, "zero_draft"),
    negativeDraftFaceCount: countBand(faceSamples, "negative_draft"),
    undeterminedFaceCount: countBand(faceSamples, "undetermined"),
  };

  if (numericDraftAngles.length === 0) {
    return summary;
  }

  return {
    ...summary,
    minimumDraftAngleDegrees: Math.min(...numericDraftAngles),
    maximumDraftAngleDegrees: Math.max(...numericDraftAngles),
    meanDraftAngleDegrees: averageNonEmpty(numericDraftAngles),
  };
};
