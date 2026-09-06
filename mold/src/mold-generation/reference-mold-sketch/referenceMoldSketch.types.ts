export type ReferenceMoldSketchDrawingMode = "line" | "freehand";

export type ReferenceMoldSketchStatus = "accepted" | "rejected";

export type ReferenceMoldSketchConfidence = "none" | "low" | "medium" | "high";

export type ReferenceMoldSketchBoundarySide = "left" | "right" | "bottom" | "top";

export type ReferenceMoldSketchReasonCode =
  | "invalid_bounds"
  | "invalid_tolerance"
  | "unsupported_drawing_mode"
  | "insufficient_points"
  | "non_finite_point"
  | "zero_length_path"
  | "start_not_on_box_boundary"
  | "end_not_on_box_boundary"
  | "endpoint_snapped_to_box_boundary"
  | "manual_review_required"
  | "reference_mold_sketch_ready";

export interface MoldPoint2 {
  readonly x: number;
  readonly y: number;
}

export interface MoldBounds2 {
  readonly min: MoldPoint2;
  readonly max: MoldPoint2;
}

export interface ReferenceMoldSketchFaceView {
  readonly faceViewId?: string;
  readonly boxFaceId?: string;
  readonly bounds: MoldBounds2;
}

export interface ReferenceMoldSketchInput {
  readonly faceView: ReferenceMoldSketchFaceView;
  readonly drawingMode: ReferenceMoldSketchDrawingMode;
  readonly points: readonly MoldPoint2[];
  readonly tolerance: number;
}

export interface ReferenceMoldSketchBoundaryTouch {
  readonly touched: boolean;
  readonly sides: readonly ReferenceMoldSketchBoundarySide[];
  readonly point: MoldPoint2;
  readonly distance: number;
}

export interface ReferenceMoldSketch {
  readonly sketchId: string;
  readonly status: "ready_for_parting_line_generation";
  readonly drawingMode: ReferenceMoldSketchDrawingMode;
  readonly faceView: ReferenceMoldSketchFaceView;
  readonly points: readonly MoldPoint2[];
  readonly startBoundaryTouch: ReferenceMoldSketchBoundaryTouch;
  readonly endBoundaryTouch: ReferenceMoldSketchBoundaryTouch;
  readonly tolerance: number;
  readonly pathLength: number;
  readonly isFinalMoldGeometry: false;
}

export interface ReferenceMoldSketchValidationResult {
  readonly status: ReferenceMoldSketchStatus;
  readonly normalizedPoints: readonly MoldPoint2[];
  readonly startBoundaryTouch: ReferenceMoldSketchBoundaryTouch | null;
  readonly endBoundaryTouch: ReferenceMoldSketchBoundaryTouch | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly reasonCodes: readonly ReferenceMoldSketchReasonCode[];
  readonly confidence: ReferenceMoldSketchConfidence;
  readonly requiresManualReview: boolean;
  readonly referenceMoldSketch?: ReferenceMoldSketch;
}

export interface ReferenceMoldSketchValidationOptions {
  readonly sketchIdPrefix?: string;
}
