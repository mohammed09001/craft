import type {
  MoldBounds2,
  MoldPoint2,
  ReferenceMoldSketch,
  ReferenceMoldSketchBoundarySide,
  ReferenceMoldSketchBoundaryTouch,
  ReferenceMoldSketchConfidence,
  ReferenceMoldSketchDrawingMode,
  ReferenceMoldSketchInput,
  ReferenceMoldSketchReasonCode,
  ReferenceMoldSketchValidationOptions,
  ReferenceMoldSketchValidationResult,
} from "./referenceMoldSketch.types";

const PATH_EPSILON = 1e-9;

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export const isValidMoldPoint2 = (value: MoldPoint2 | undefined): value is MoldPoint2 => {
  if (!value) {
    return false;
  }

  return isFiniteNumber(value.x) && isFiniteNumber(value.y);
};

export const isValidMoldBounds2 = (bounds: MoldBounds2 | undefined): bounds is MoldBounds2 => {
  if (!bounds || !isValidMoldPoint2(bounds.min) || !isValidMoldPoint2(bounds.max)) {
    return false;
  }

  return bounds.min.x < bounds.max.x && bounds.min.y < bounds.max.y;
};

const isSupportedDrawingMode = (mode: ReferenceMoldSketchDrawingMode): boolean =>
  mode === "line" || mode === "freehand";

const uniqueReasonCodes = (
  reasonCodes: readonly ReferenceMoldSketchReasonCode[],
): readonly ReferenceMoldSketchReasonCode[] => Array.from(new Set(reasonCodes));

const distanceBetween = (start: MoldPoint2, end: MoldPoint2): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return Math.sqrt(dx * dx + dy * dy);
};

const measurePathLength = (points: readonly MoldPoint2[]): number => {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];

    if (!previousPoint || !currentPoint) {
      continue;
    }

    length += distanceBetween(previousPoint, currentPoint);
  }

  return length;
};

const isWithinRange = (value: number, min: number, max: number, tolerance: number): boolean =>
  value >= min - tolerance && value <= max + tolerance;

const getBoundaryTouch = (
  point: MoldPoint2,
  bounds: MoldBounds2,
  tolerance: number,
): ReferenceMoldSketchBoundaryTouch => {
  const distances: Record<ReferenceMoldSketchBoundarySide, number> = {
    left: Math.abs(point.x - bounds.min.x),
    right: Math.abs(point.x - bounds.max.x),
    bottom: Math.abs(point.y - bounds.min.y),
    top: Math.abs(point.y - bounds.max.y),
  };

  const sides: ReferenceMoldSketchBoundarySide[] = [];

  if (
    distances.left <= tolerance &&
    isWithinRange(point.y, bounds.min.y, bounds.max.y, tolerance)
  ) {
    sides.push("left");
  }

  if (
    distances.right <= tolerance &&
    isWithinRange(point.y, bounds.min.y, bounds.max.y, tolerance)
  ) {
    sides.push("right");
  }

  if (
    distances.bottom <= tolerance &&
    isWithinRange(point.x, bounds.min.x, bounds.max.x, tolerance)
  ) {
    sides.push("bottom");
  }

  if (
    distances.top <= tolerance &&
    isWithinRange(point.x, bounds.min.x, bounds.max.x, tolerance)
  ) {
    sides.push("top");
  }

  const distance = sides.reduce(
    (nearestDistance, side) => Math.min(nearestDistance, distances[side]),
    Number.POSITIVE_INFINITY,
  );

  return {
    touched: sides.length > 0,
    sides,
    point,
    distance: Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY,
  };
};

const snapBoundaryPoint = (
  point: MoldPoint2,
  touch: ReferenceMoldSketchBoundaryTouch,
  bounds: MoldBounds2,
): MoldPoint2 => {
  if (!touch.touched) {
    return point;
  }

  const snappedPoint = { ...point };

  if (touch.sides.includes("left")) {
    snappedPoint.x = bounds.min.x;
  } else if (touch.sides.includes("right")) {
    snappedPoint.x = bounds.max.x;
  }

  if (touch.sides.includes("bottom")) {
    snappedPoint.y = bounds.min.y;
  } else if (touch.sides.includes("top")) {
    snappedPoint.y = bounds.max.y;
  }

  return snappedPoint;
};

const normalizePoints = (
  points: readonly MoldPoint2[],
  bounds: MoldBounds2,
  startTouch: ReferenceMoldSketchBoundaryTouch,
  endTouch: ReferenceMoldSketchBoundaryTouch,
): readonly MoldPoint2[] =>
  points.map((point, index) => {
    if (index === 0) {
      return snapBoundaryPoint(point, startTouch, bounds);
    }

    if (index === points.length - 1) {
      return snapBoundaryPoint(point, endTouch, bounds);
    }

    return { ...point };
  });

const hasSnappedEndpoint = (
  original: MoldPoint2,
  normalized: MoldPoint2,
): boolean => original.x !== normalized.x || original.y !== normalized.y;

const createSketchId = (
  input: ReferenceMoldSketchInput,
  options: ReferenceMoldSketchValidationOptions,
): string => {
  const prefix = options.sketchIdPrefix?.trim() || "reference-mold-sketch";
  const faceViewId = input.faceView.faceViewId?.trim() || input.faceView.boxFaceId?.trim() || "face-view";

  return `${prefix}:${faceViewId}`;
};

const getConfidence = (parameters: {
  readonly hasBlockers: boolean;
  readonly drawingMode: ReferenceMoldSketchDrawingMode;
}): ReferenceMoldSketchConfidence => {
  if (parameters.hasBlockers) {
    return "none";
  }

  if (parameters.drawingMode === "line") {
    return "high";
  }

  return "medium";
};

export const validateReferenceMoldSketch = (
  input: ReferenceMoldSketchInput,
  options: ReferenceMoldSketchValidationOptions = {},
): ReferenceMoldSketchValidationResult => {
  const reasonCodes: ReferenceMoldSketchReasonCode[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const bounds = input.faceView.bounds;
  const hasValidBounds = isValidMoldBounds2(bounds);
  const hasValidTolerance = isFiniteNumber(input.tolerance) && input.tolerance >= 0;
  const hasEnoughPoints = input.points.length >= 2;
  const hasFinitePoints = input.points.every(isValidMoldPoint2);
  const hasSupportedDrawingMode = isSupportedDrawingMode(input.drawingMode);

  if (!hasValidBounds) {
    reasonCodes.push("invalid_bounds");
    blockers.push("Selected box face bounds are invalid.");
  }

  if (!hasValidTolerance) {
    reasonCodes.push("invalid_tolerance");
    blockers.push("Reference sketch tolerance must be a finite non-negative number.");
  }

  if (!hasSupportedDrawingMode) {
    reasonCodes.push("unsupported_drawing_mode");
    blockers.push("Reference sketch drawing mode is not supported.");
  }

  if (!hasEnoughPoints) {
    reasonCodes.push("insufficient_points");
    blockers.push("Reference sketch requires at least two ordered points.");
  }

  if (!hasFinitePoints) {
    reasonCodes.push("non_finite_point");
    blockers.push("Reference sketch points must be finite 2D numbers.");
  }

  if (!hasValidBounds || !hasValidTolerance || !hasEnoughPoints || !hasFinitePoints) {
    reasonCodes.push("manual_review_required");

    return {
      status: "rejected",
      normalizedPoints: [],
      startBoundaryTouch: null,
      endBoundaryTouch: null,
      blockers,
      warnings,
      reasonCodes: uniqueReasonCodes(reasonCodes),
      confidence: "none",
      requiresManualReview: true,
    };
  }

  const pathLength = measurePathLength(input.points);

  if (pathLength <= PATH_EPSILON) {
    reasonCodes.push("zero_length_path");
    blockers.push("Reference sketch path length must be greater than zero.");
  }

  const startPoint = input.points[0];
  const endPoint = input.points[input.points.length - 1];

  if (!startPoint || !endPoint) {
    reasonCodes.push("insufficient_points", "manual_review_required");

    return {
      status: "rejected",
      normalizedPoints: [],
      startBoundaryTouch: null,
      endBoundaryTouch: null,
      blockers: [...blockers, "Reference sketch requires start and end points."],
      warnings,
      reasonCodes: uniqueReasonCodes(reasonCodes),
      confidence: "none",
      requiresManualReview: true,
    };
  }

  const startBoundaryTouch = getBoundaryTouch(startPoint, bounds, input.tolerance);
  const endBoundaryTouch = getBoundaryTouch(endPoint, bounds, input.tolerance);

  if (!startBoundaryTouch.touched) {
    reasonCodes.push("start_not_on_box_boundary");
    blockers.push("Reference sketch start boundary point must touch the box face boundary.");
  }

  if (!endBoundaryTouch.touched) {
    reasonCodes.push("end_not_on_box_boundary");
    blockers.push("Reference sketch end boundary point must touch the box face boundary.");
  }

  const normalizedPoints = normalizePoints(input.points, bounds, startBoundaryTouch, endBoundaryTouch);
  const normalizedStartPoint = normalizedPoints[0];
  const normalizedEndPoint = normalizedPoints[normalizedPoints.length - 1];

  if (
    normalizedStartPoint &&
    hasSnappedEndpoint(startPoint, normalizedStartPoint)
  ) {
    reasonCodes.push("endpoint_snapped_to_box_boundary");
    warnings.push("Reference sketch start point was snapped to the box face boundary.");
  }

  if (normalizedEndPoint && hasSnappedEndpoint(endPoint, normalizedEndPoint)) {
    reasonCodes.push("endpoint_snapped_to_box_boundary");
    warnings.push("Reference sketch end point was snapped to the box face boundary.");
  }

  const hasBlockers = blockers.length > 0;

  if (hasBlockers) {
    reasonCodes.push("manual_review_required");

    return {
      status: "rejected",
      normalizedPoints,
      startBoundaryTouch,
      endBoundaryTouch,
      blockers,
      warnings,
      reasonCodes: uniqueReasonCodes(reasonCodes),
      confidence: getConfidence({ hasBlockers, drawingMode: input.drawingMode }),
      requiresManualReview: true,
    };
  }

  reasonCodes.push("reference_mold_sketch_ready");

  const referenceMoldSketch: ReferenceMoldSketch = {
    sketchId: createSketchId(input, options),
    status: "ready_for_parting_line_generation",
    drawingMode: input.drawingMode,
    faceView: input.faceView,
    points: normalizedPoints,
    startBoundaryTouch: {
      ...startBoundaryTouch,
      point: normalizedStartPoint ?? startBoundaryTouch.point,
    },
    endBoundaryTouch: {
      ...endBoundaryTouch,
      point: normalizedEndPoint ?? endBoundaryTouch.point,
    },
    tolerance: input.tolerance,
    pathLength: measurePathLength(normalizedPoints),
    isFinalMoldGeometry: false,
  };

  return {
    status: "accepted",
    normalizedPoints,
    startBoundaryTouch: referenceMoldSketch.startBoundaryTouch,
    endBoundaryTouch: referenceMoldSketch.endBoundaryTouch,
    blockers,
    warnings,
    reasonCodes: uniqueReasonCodes(reasonCodes),
    confidence: getConfidence({ hasBlockers, drawingMode: input.drawingMode }),
    requiresManualReview: false,
    referenceMoldSketch,
  };
};
