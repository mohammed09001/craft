import type {
  MoldBounds3,
  MoldCoordinateFrame,
  MoldCoordinateFrameBuildOptions,
  MoldCoordinateFrameConfidence,
  MoldCoordinateFrameInput,
  MoldCoordinateFrameReasonCode,
  MoldCoordinateFrameSource,
  MoldCoordinateFrameStatus,
  MoldVector3,
} from "./moldCoordinateFrame.types";

const VECTOR_EPSILON = 1e-9;

const DEFAULT_FALLBACK_PULL_AXIS: MoldVector3 = Object.freeze({ x: 0, y: 0, z: 1 });
const DEFAULT_FALLBACK_ORIGIN: MoldVector3 = Object.freeze({ x: 0, y: 0, z: 0 });

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export const isValidMoldVector3 = (value: MoldVector3 | undefined): value is MoldVector3 => {
  if (!value) {
    return false;
  }

  return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
};

const magnitude = (vector: MoldVector3): number =>
  Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

export const isNonZeroMoldVector3 = (value: MoldVector3 | undefined): value is MoldVector3 =>
  isValidMoldVector3(value) && magnitude(value) > VECTOR_EPSILON;

export const normalizeMoldVector3 = (vector: MoldVector3): MoldVector3 => {
  const length = magnitude(vector);

  if (length <= VECTOR_EPSILON) {
    return { ...DEFAULT_FALLBACK_PULL_AXIS };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

export const negateMoldVector3 = (vector: MoldVector3): MoldVector3 => ({
  x: -vector.x,
  y: -vector.y,
  z: -vector.z,
});

const isValidMoldBounds3 = (bounds: MoldBounds3 | undefined): bounds is MoldBounds3 => {
  if (!bounds || !isValidMoldVector3(bounds.min) || !isValidMoldVector3(bounds.max)) {
    return false;
  }

  return (
    bounds.min.x <= bounds.max.x &&
    bounds.min.y <= bounds.max.y &&
    bounds.min.z <= bounds.max.z
  );
};

const getBoundsCenter = (bounds: MoldBounds3): MoldVector3 => ({
  x: (bounds.min.x + bounds.max.x) / 2,
  y: (bounds.min.y + bounds.max.y) / 2,
  z: (bounds.min.z + bounds.max.z) / 2,
});

const uniqueReasonCodes = (
  reasonCodes: readonly MoldCoordinateFrameReasonCode[],
): readonly MoldCoordinateFrameReasonCode[] => Array.from(new Set(reasonCodes));

const createFrameId = (
  input: MoldCoordinateFrameInput,
  options: MoldCoordinateFrameBuildOptions,
): string => {
  const prefix = options.frameIdPrefix?.trim() || "mold-coordinate-frame";
  const source = input.source || "conservative_fallback";

  return `${prefix}:${source}`;
};

const getReadinessBlocked = (input: MoldCoordinateFrameInput): boolean => {
  const readinessStatus = input.readinessStatus?.toLowerCase();

  return readinessStatus === "blocked";
};

const getSource = (
  input: MoldCoordinateFrameInput,
  hasValidPullAxis: boolean,
  usedFallbackPullAxis: boolean,
): MoldCoordinateFrameSource => {
  if (input.source) {
    return input.source;
  }

  if (hasValidPullAxis) {
    return "analysis_pull_direction";
  }

  if (usedFallbackPullAxis) {
    return "conservative_fallback";
  }

  return "analysis_readiness";
};

const getConfidence = (parameters: {
  readonly hasValidPullAxis: boolean;
  readonly hasValidPartCenter: boolean;
  readonly hasValidPartBounds: boolean;
  readonly hasInvalidPullAxis: boolean;
  readonly readinessBlocked: boolean;
}): MoldCoordinateFrameConfidence => {
  if (parameters.readinessBlocked || parameters.hasInvalidPullAxis) {
    return "none";
  }

  if (parameters.hasValidPullAxis && parameters.hasValidPartCenter) {
    return "high";
  }

  if (parameters.hasValidPullAxis && parameters.hasValidPartBounds) {
    return "medium";
  }

  if (parameters.hasValidPullAxis) {
    return "low";
  }

  return "none";
};

const getStatus = (parameters: {
  readonly confidence: MoldCoordinateFrameConfidence;
  readonly hasInvalidPullAxis: boolean;
  readonly readinessBlocked: boolean;
  readonly usedFallbackPullAxis: boolean;
  readonly requiresManualReview: boolean;
}): MoldCoordinateFrameStatus => {
  if (parameters.readinessBlocked || parameters.hasInvalidPullAxis) {
    return "blocked";
  }

  if (parameters.usedFallbackPullAxis) {
    return "fallback";
  }

  if (parameters.requiresManualReview) {
    return "manual_review";
  }

  if (parameters.confidence === "high" || parameters.confidence === "medium") {
    return "ready";
  }

  return "manual_review";
};

export const buildMoldCoordinateFrame = (
  input: MoldCoordinateFrameInput = {},
  options: MoldCoordinateFrameBuildOptions = {},
): MoldCoordinateFrame => {
  const hasPullAxisValue = input.pullAxis !== undefined;
  const hasValidPullAxis = isNonZeroMoldVector3(input.pullAxis);
  const hasInvalidPullAxis = hasPullAxisValue && !hasValidPullAxis;

  const hasValidPartCenter = isValidMoldVector3(input.partCenter);
  const hasValidPartBounds = isValidMoldBounds3(input.partBounds);

  const fallbackPullAxis = isNonZeroMoldVector3(options.fallbackPullAxis)
    ? normalizeMoldVector3(options.fallbackPullAxis)
    : { ...DEFAULT_FALLBACK_PULL_AXIS };

  const usedFallbackPullAxis = !hasValidPullAxis;
  const pullAxis = hasValidPullAxis ? normalizeMoldVector3(input.pullAxis) : fallbackPullAxis;

  const fallbackOrigin = isValidMoldVector3(options.fallbackOrigin)
    ? options.fallbackOrigin
    : DEFAULT_FALLBACK_ORIGIN;

  const centerFromBounds = hasValidPartBounds ? getBoundsCenter(input.partBounds) : undefined;
  const origin = hasValidPartCenter
    ? input.partCenter
    : centerFromBounds ?? fallbackOrigin;

  const reasonCodes: MoldCoordinateFrameReasonCode[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const readinessBlocked = getReadinessBlocked(input);

  if (readinessBlocked) {
    reasonCodes.push("analysis_readiness_blocked");
    blockers.push("Analysis readiness is blocked.");
  }

  if (!hasPullAxisValue) {
    reasonCodes.push("missing_pull_axis", "fallback_axis_used");
    warnings.push("Pull axis is missing; conservative fallback axis was used.");
  }

  if (hasInvalidPullAxis) {
    reasonCodes.push("invalid_pull_axis");
    blockers.push("Pull axis is invalid or zero-length.");
  }

  if (!hasValidPartCenter) {
    reasonCodes.push("missing_part_center");

    if (hasValidPartBounds) {
      warnings.push("Part center is missing; bounds center was used as origin.");
    } else {
      reasonCodes.push("fallback_origin_used");
      warnings.push("Part center is missing; fallback origin was used.");
    }
  }

  if (!hasValidPartBounds) {
    reasonCodes.push("missing_part_bounds");
    warnings.push("Part bounds are missing or incomplete.");
  }

  if (input.readinessReasonCodes && input.readinessReasonCodes.length > 0) {
    reasonCodes.push("chapter9_data_incomplete");
  }

  const requiresManualReview =
    readinessBlocked ||
    hasInvalidPullAxis ||
    !hasValidPullAxis ||
    !hasValidPartCenter ||
    input.readinessReasonCodes !== undefined;

  if (requiresManualReview) {
    reasonCodes.push("manual_review_required");
  }

  if (!requiresManualReview) {
    reasonCodes.push("coordinate_frame_ready");
  }

  const confidence = getConfidence({
    hasValidPullAxis,
    hasValidPartCenter,
    hasValidPartBounds,
    hasInvalidPullAxis,
    readinessBlocked,
  });

  const status = getStatus({
    confidence,
    hasInvalidPullAxis,
    readinessBlocked,
    usedFallbackPullAxis,
    requiresManualReview,
  });

  return {
    frameId: createFrameId(input, options),
    source: getSource(input, hasValidPullAxis, usedFallbackPullAxis),
    status,
    origin,
    ...(hasValidPartCenter ? { partCenter: input.partCenter } : {}),
    ...(hasValidPartBounds ? { partBounds: input.partBounds } : {}),
    directions: {
      pullAxis,
      moldAxis: pullAxis,
      topDirection: pullAxis,
      bottomDirection: negateMoldVector3(pullAxis),
      m1Direction: pullAxis,
      m2Direction: negateMoldVector3(pullAxis),
    },
    confidence,
    warnings,
    blockers,
    requiresManualReview,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
};
