import type {
  DraftFaceSample,
  DraftVector3,
} from "./draftAnalysis.contracts";
import { classifyDraftFaceBand } from "./draftAnalysis.classification";
import { computeSignedDraftAngleDegrees } from "./draftAnalysis.math";

export interface DraftFaceAnalysisInput {
  readonly faceId: string;
  readonly normal: DraftVector3;
  readonly pullDirection: DraftVector3;
  readonly zeroDraftToleranceDegrees: number;
  readonly centroid?: DraftVector3;
  readonly area?: number;
}

export const analyzeDraftFaceSample = ({
  faceId,
  normal,
  pullDirection,
  zeroDraftToleranceDegrees,
  centroid,
  area,
}: DraftFaceAnalysisInput): DraftFaceSample => {
  const angleResult = computeSignedDraftAngleDegrees(normal, pullDirection);
  const draftAngleDegrees = angleResult.angleDegrees;

  const sample: DraftFaceSample = {
    faceId,
    normal,
    band: classifyDraftFaceBand({
      draftAngleDegrees,
      zeroDraftToleranceDegrees,
    }),
  };

  if (draftAngleDegrees !== null) {
    return {
      ...sample,
      draftAngleDegrees,
      ...(centroid === undefined ? {} : { centroid }),
      ...(area === undefined ? {} : { area }),
    };
  }

  return {
    ...sample,
    ...(centroid === undefined ? {} : { centroid }),
    ...(area === undefined ? {} : { area }),
  };
};
