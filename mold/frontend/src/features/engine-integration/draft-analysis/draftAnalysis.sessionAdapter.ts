import {
  DEFAULT_DRAFT_ANALYSIS_OPTIONS,
  type DraftAnalysisFaceInput,
  type DraftAnalysisGeometryReference,
  type DraftAnalysisInput,
  type DraftAnalysisPullDirection,
  type DraftVector3,
} from "./draftAnalysis.contracts";

export interface DraftAnalysisSessionGeometryLike {
  readonly modelId?: string;
  readonly fileName?: string;
  readonly triangleCount?: number;
  readonly vertexCount?: number;
  readonly units?: string;
}

export interface DraftAnalysisSessionPullDirectionLike {
  readonly vector?: DraftVector3;
  readonly direction?: DraftVector3;
  readonly confidence?: number;
}

export interface DraftAnalysisSessionFaceLike {
  readonly faceId: string;
  readonly normal: DraftVector3;
  readonly centroid?: DraftVector3;
  readonly area?: number;
}

export interface DraftAnalysisSessionLike {
  readonly id?: string;
  readonly sessionId?: string;
  readonly modelId?: string;
  readonly fileName?: string;
  readonly geometry?: DraftAnalysisSessionGeometryLike;
  readonly pullDirection?: DraftAnalysisSessionPullDirectionLike;
  readonly faces?: readonly DraftAnalysisSessionFaceLike[];
}

const DEFAULT_PULL_DIRECTION_VECTOR: DraftVector3 = {
  x: 0,
  y: 0,
  z: 1,
};

const resolveSessionId = (session: DraftAnalysisSessionLike): string | undefined =>
  session.sessionId ?? session.id;

const assignIfDefined = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const resolveGeometry = (
  session: DraftAnalysisSessionLike,
): DraftAnalysisGeometryReference => {
  const geometry: Record<string, unknown> = {
    source: "analysis_session",
  };

  assignIfDefined(geometry, "modelId", session.geometry?.modelId ?? session.modelId);
  assignIfDefined(geometry, "fileName", session.geometry?.fileName ?? session.fileName);
  assignIfDefined(geometry, "triangleCount", session.geometry?.triangleCount);
  assignIfDefined(geometry, "vertexCount", session.geometry?.vertexCount);
  assignIfDefined(geometry, "units", session.geometry?.units);

  return geometry as unknown as DraftAnalysisGeometryReference;
};

const resolvePullDirection = (
  session: DraftAnalysisSessionLike,
): DraftAnalysisPullDirection => {
  const vector =
    session.pullDirection?.vector ??
    session.pullDirection?.direction ??
    DEFAULT_PULL_DIRECTION_VECTOR;

  const pullDirection: Record<string, unknown> = {
    vector,
    source: session.pullDirection === undefined ? "fallback" : "pull_direction_engine",
  };

  assignIfDefined(pullDirection, "confidence", session.pullDirection?.confidence);

  return pullDirection as unknown as DraftAnalysisPullDirection;
};

const resolveFaces = (
  session: DraftAnalysisSessionLike,
): readonly DraftAnalysisFaceInput[] | undefined => {
  if (session.faces === undefined) {
    return undefined;
  }

  return session.faces.map((face) => {
    const mappedFace: Record<string, unknown> = {
      faceId: face.faceId,
      normal: face.normal,
    };

    assignIfDefined(mappedFace, "centroid", face.centroid);
    assignIfDefined(mappedFace, "area", face.area);

    return mappedFace as unknown as DraftAnalysisFaceInput;
  });
};

/**
 * Creates the internal Draft Analysis input from the current Analysis Session.
 *
 * Stage 8C strengthens the integration boundary by forwarding optional face
 * inputs when the Analysis Session can provide them.
 */
export const createDraftAnalysisInputFromSession = (
  session: DraftAnalysisSessionLike,
): DraftAnalysisInput => {
  const input: Record<string, unknown> = {
    geometry: resolveGeometry(session),
    pullDirection: resolvePullDirection(session),
    options: DEFAULT_DRAFT_ANALYSIS_OPTIONS,
  };

  assignIfDefined(input, "analysisSessionId", resolveSessionId(session));
  assignIfDefined(input, "faces", resolveFaces(session));

  return input as unknown as DraftAnalysisInput;
};
