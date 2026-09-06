export type MoldCoordinateFrameSource =
  | "analysis_pull_direction"
  | "analysis_readiness"
  | "part_bounds"
  | "manual_input"
  | "conservative_fallback";

export type MoldCoordinateFrameConfidence = "none" | "low" | "medium" | "high";

export type MoldCoordinateFrameStatus = "blocked" | "fallback" | "manual_review" | "ready";

export type MoldCoordinateFrameReasonCode =
  | "missing_pull_axis"
  | "missing_part_center"
  | "missing_part_bounds"
  | "invalid_pull_axis"
  | "fallback_axis_used"
  | "fallback_origin_used"
  | "chapter9_data_incomplete"
  | "analysis_readiness_blocked"
  | "manual_review_required"
  | "coordinate_frame_ready";

export interface MoldVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MoldBounds3 {
  readonly min: MoldVector3;
  readonly max: MoldVector3;
}

export interface MoldCoordinateFrameInput {
  readonly pullAxis?: MoldVector3;
  readonly partCenter?: MoldVector3;
  readonly partBounds?: MoldBounds3;
  readonly readinessStatus?: string;
  readonly readinessReasonCodes?: readonly string[];
  readonly source?: MoldCoordinateFrameSource;
}

export interface MoldCoordinateFrameDirections {
  readonly pullAxis: MoldVector3;
  readonly moldAxis: MoldVector3;
  readonly topDirection: MoldVector3;
  readonly bottomDirection: MoldVector3;
  readonly m1Direction: MoldVector3;
  readonly m2Direction: MoldVector3;
}

export interface MoldCoordinateFrame {
  readonly frameId: string;
  readonly source: MoldCoordinateFrameSource;
  readonly status: MoldCoordinateFrameStatus;
  readonly origin: MoldVector3;
  readonly partCenter?: MoldVector3;
  readonly partBounds?: MoldBounds3;
  readonly directions: MoldCoordinateFrameDirections;
  readonly confidence: MoldCoordinateFrameConfidence;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly requiresManualReview: boolean;
  readonly reasonCodes: readonly MoldCoordinateFrameReasonCode[];
}

export interface MoldCoordinateFrameBuildOptions {
  readonly fallbackPullAxis?: MoldVector3;
  readonly fallbackOrigin?: MoldVector3;
  readonly frameIdPrefix?: string;
}
