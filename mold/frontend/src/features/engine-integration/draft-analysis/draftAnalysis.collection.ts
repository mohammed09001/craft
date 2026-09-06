import type {
  DraftAnalysisOptions,
  DraftAnalysisPullDirection,
  DraftAnalysisSummary,
  DraftAnalysisSummarySignals,
  DraftFaceSample,
  DraftVector3,
} from "./draftAnalysis.contracts";
import { analyzeDraftFaceSample } from "./draftAnalysis.face";
import { createDraftAnalysisSummaryFromFaceSamples } from "./draftAnalysis.summary";

export interface DraftFaceInput {
  readonly faceId: string;
  readonly normal: DraftVector3;
  readonly centroid?: DraftVector3;
  readonly area?: number;
}

export interface DraftFaceCollectionAnalysisInput {
  readonly faces: readonly DraftFaceInput[];
  readonly pullDirection: DraftAnalysisPullDirection;
  readonly options: DraftAnalysisOptions;
}

export interface DraftFaceCollectionAnalysisResult {
  readonly faceSamples: readonly DraftFaceSample[];
  readonly summary: DraftAnalysisSummary;
  readonly draftAnalysisSummarySignals: DraftAnalysisSummarySignals;
  /** Legacy compatibility property */
  readonly chapter10Signals?: DraftAnalysisSummarySignals;
}

export const createDraftAnalysisSummarySignals = (
  summary: DraftAnalysisSummary,
): DraftAnalysisSummarySignals => ({
  hasNegativeDraftFaces: summary.negativeDraftFaceCount > 0,
  hasUndeterminedFaces: summary.undeterminedFaceCount > 0,
  algorithmCompleted: true,
});

/** Backward compatibility function export */
export const createChapter10Signals = createDraftAnalysisSummarySignals;

export const analyzeDraftFaceCollection = ({
  faces,
  pullDirection,
  options,
}: DraftFaceCollectionAnalysisInput): DraftFaceCollectionAnalysisResult => {
  const limitedFaces = faces.slice(0, options.maxStoredFaceSamples);

  const faceSamples = limitedFaces.map((face) =>
    analyzeDraftFaceSample({
      faceId: face.faceId,
      normal: face.normal,
      pullDirection: pullDirection.vector,
      zeroDraftToleranceDegrees: options.zeroDraftToleranceDegrees,
      ...(face.centroid === undefined ? {} : { centroid: face.centroid }),
      ...(face.area === undefined ? {} : { area: face.area }),
    }),
  );

  const summary = createDraftAnalysisSummaryFromFaceSamples(faceSamples);
  const signals = createDraftAnalysisSummarySignals(summary);

  return {
    faceSamples,
    summary,
    draftAnalysisSummarySignals: signals,
    chapter10Signals: signals,
  };
};
