import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { FitAxis, FitStageResult, Size3 } from "../fitAnalysis";
import type { SegmentationExecutionResult } from "../execution/segmentationExecution.contracts";

export const SEGMENTATION_SCHEMA_VERSION = 1 as const;

/**
 * Explicit owner tag for every boundary the General Segmentation Algorithm
 * itself produces (a SegmentationPlan's `boundaries`). These are always
 * locked -- non-editable, non-draggable, not individually removable -- by
 * construction: a BoundaryIntent only ever comes from plan generation, never
 * from user interaction. This constant exists so that fact is an assertable
 * value (tests, viewport runtime) rather than only an implicit consequence
 * of which runtime renders a given plane.
 */
export const LOCKED_PLANE_OWNER = "segmentation-algorithm" as const;

/**
 * The one hard-coded planning policy. Segmentation is printer-fit-driven
 * only -- there is no mode/strategy selection anymore, so the policy is a
 * constant rather than a resolved strategy object.
 */
export const SEGMENTATION_POLICY_ID = "printer-fit-baseline" as const;
export const SEGMENTATION_POLICY_VERSION = 1 as const;

export type SegmentationPlanningBasis =
  | "bounds-only"
  | "geometry-informed";

export type SegmentationStage =
  | "request-creation"
  | "source-snapshot"
  | "printable-volume-analysis"
  | "protected-region-analysis"
  | "candidate-generation"
  | "candidate-scoring"
  | "plan-selection"
  | "geometry-execution"
  | "result-validation";

export type SegmentationReasonCode =
  | "no_printable_plan"
  | "invalid_printer_volume"
  | "missing_authoritative_geometry"
  | "stale_source_revision"
  | "invalid_authoritative_geometry"
  | "insufficient_wall_thickness"
  | "protected_region_conflict"
  | "protected_region_evidence_incomplete"
  | "unsupported_execution_shape"
  | "unsupported_boundary_intent"
  | "missing_accepted_plan"
  | "stale_execution_source"
  | "invalid_source_body"
  | "split_operation_failed"
  | "unexpected_output_count"
  | "invalid_output_geometry"
  | "non_manifold_output"
  | "detached_fragment_detected"
  | "volume_conservation_failed"
  | "printer_fit_failed"
  | "duplicate_cut_plane"
  | "missing_cut_target"
  | "ambiguous_cut_target"
  | "intermediate_cut_failed"
  | "execution_cancelled"
  | "geometry_execution_not_implemented";

export interface SegmentationIssue {
  readonly severity: "warning" | "blocker";
  readonly reasonCode: SegmentationReasonCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface SegmentationSourceIdentity {
  readonly documentRevision: number;
  readonly documentFingerprint: string;
  readonly resultRequestId: string;
  readonly definitionId: string;
  readonly modelId: string;
  readonly frameId: string;
  readonly bodySignature: string;
  readonly protectedRegionSignature: string;
}

export interface ProtectedRegion {
  readonly id: string;
  readonly kind: string;
  readonly source: "cavity" | "sprue" | "registration" | "manufacturing";
  readonly provenanceId: string;
  readonly bodyIds: readonly string[];
  readonly bounds: Bounds3;
  readonly hardness: "hard" | "advisory";
  readonly clearanceMm: number;
}

export interface ProtectedRegionEvidence {
  readonly status: "complete" | "incomplete";
  readonly reason: string;
}

export interface SegmentationSourceSnapshot {
  readonly identity: SegmentationSourceIdentity;
  readonly bodies: readonly MoldBodyData[];
  readonly aggregateBounds: Bounds3;
  readonly protectedRegions: readonly ProtectedRegion[];
  readonly protectedRegionEvidence: ProtectedRegionEvidence;
  readonly warnings: readonly SegmentationIssue[];
  readonly units: "millimeters";
  readonly upAxis: "Z";
}

export interface SegmentationRequest {
  readonly schemaVersion: typeof SEGMENTATION_SCHEMA_VERSION;
  readonly requestId: string;
  readonly operation: "plan";
  readonly source: SegmentationSourceIdentity;
  readonly printerVolume: Size3;
  readonly printerVolumeSignature: string;
  readonly settingsSignature: string;
  readonly policyId: string;
  readonly policyVersion: number;
}

export interface BoundaryIntent {
  readonly id: string;
  readonly axis: FitAxis;
  readonly coordinateMm: number;
  // Per-axis tie-break only (see prior Multi-Plane design); coordinateMm is
  // the ascending order key for single-axis plans, never sequenceIndex.
  readonly ordinal: number;
  // Author-assigned canonical position of this boundary in the accepted cut
  // sequence across all axes. Authoritative only when requiredAxes.length > 1;
  // single-axis plans continue to order by coordinateMm ascending.
  readonly sequenceIndex: number;
  /**
   * Opt-in only, default falsy/absent for every algorithm-authored boundary
   * (zero behavior change to existing plans). When true, the execution
   * engine splits every currently-straddling body for this one boundary
   * instead of requiring (and enforcing) exactly one -- the only way a
   * user-added extension axis can cut across a plan that already has
   * boundaries on another axis, since a plain axis-aligned plane cannot
   * otherwise distinguish between bodies that differ only along a
   * different axis. Only a General Segmentation user-extension boundary
   * (see extensionBoundaryMerge.ts) ever sets this.
   */
  readonly broadcastToAllStraddlingBodies?: boolean;
  /**
   * Planner-owned Cartesian-grid execution intent. Unlike an extension
   * broadcast, this cuts every current body that straddles the plane and
   * deliberately permits bodies already separated along this axis to remain
   * untouched. It is how later axes of a multi-axis baseline plan preserve
   * the previewed grid topology.
   */
  readonly executionTargeting?: "all-straddling";
}

export interface SegmentDefinition {
  readonly id: string;
  readonly ordinal: number;
  readonly gridIndex: Readonly<Record<FitAxis, number>>;
  readonly sourceBodyIds: readonly string[];
  readonly predictedBounds: Bounds3;
  readonly predictedFit: FitStageResult;
  readonly boundaryIntentIds: readonly string[];
  readonly requiredValidation: readonly SegmentationStage[];
}

export interface CandidateScore {
  readonly hardFailureCount: number;
  readonly segmentCount: number;
  readonly minimumPrintableMarginMm: number;
  readonly declaredRisk: number;
  /**
   * Strategy-computed, lower-is-better objective score (see
   * SegmentationObjectiveWeights) -- 0 until the planner's scoring pass
   * sets it. Ranking always considers hardFailureCount first (hard
   * constraints override scoring unconditionally); this field is the
   * primary tie-break among otherwise-valid candidates, before the older
   * fixed tie-breakers (segmentCount/margin/declaredRisk/id) that remain as
   * a deterministic fallback.
   */
  readonly weightedObjectiveScore: number;
}

/**
 * Fixed planning objective weights consumed by the planner's candidate
 * scoring to compute CandidateScore.weightedObjectiveScore. All weights are
 * non-negative; a larger weight makes that term matter more in the final
 * (lower-is-better) score.
 */
export interface SegmentationObjectiveWeights {
  /** Penalizes higher segment counts -- "minimum practical piece count". */
  readonly pieceCountWeight: number;
  /** Rewards a larger minimum printable margin -- stable, comfortably-fitting interfaces. */
  readonly marginWeight: number;
  /** Penalizes declared risk (protected-region proximity, etc.). */
  readonly riskWeight: number;
}

export interface SplitCandidate {
  readonly id: string;
  readonly algorithmId: string;
  readonly algorithmVersion: number;
  readonly planningBasis: SegmentationPlanningBasis;
  readonly requiredAxes: readonly FitAxis[];
  readonly boundaries: readonly BoundaryIntent[];
  readonly segments: readonly SegmentDefinition[];
  readonly protectedRegionConflicts: readonly string[];
  readonly issues: readonly SegmentationIssue[];
  readonly score: CandidateScore;
}

export interface SegmentationValidation {
  readonly status: "planning-valid" | "invalid" | "not-run";
  readonly stage: SegmentationStage;
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
  readonly printableByBounds: "verified" | "failed" | "not-applicable";
  readonly geometryExecution: "not-run" | "verified" | "failed";
  readonly manufacturingSafety:
    | "not-established"
    | "verified"
    | "failed"
    | "not-applicable";
  readonly warnings: readonly SegmentationIssue[];
  readonly blockers: readonly SegmentationIssue[];
}

export interface SegmentationPlan {
  readonly schemaVersion: typeof SEGMENTATION_SCHEMA_VERSION;
  readonly id: string;
  readonly request: SegmentationRequest;
  readonly algorithmId: string;
  readonly algorithmVersion: number;
  readonly planningBasis: SegmentationPlanningBasis;
  readonly requiredAxes: readonly FitAxis[];
  readonly perAxisSegmentCount: Readonly<Record<FitAxis, number>>;
  readonly estimatedMinimumSegmentCount: number;
  readonly candidateIds: readonly string[];
  readonly rejectedCandidateIds: readonly string[];
  readonly selectedCandidateId: string;
  readonly boundaries: readonly BoundaryIntent[];
  readonly segments: readonly SegmentDefinition[];
  readonly score: CandidateScore;
  readonly validation: SegmentationValidation;
  readonly extensionObligations: readonly string[];
}

export interface SegmentationContext {
  readonly request: SegmentationRequest;
  readonly source: SegmentationSourceSnapshot;
  readonly sourceSize: Size3;
  readonly printableFit: FitStageResult;
  readonly requiredAxes: readonly FitAxis[];
  readonly perAxisSegmentCount: Readonly<Record<FitAxis, number>>;
  readonly estimatedMinimumSegmentCount: number;
  readonly protectedRegions: readonly ProtectedRegion[];
}

/**
 * Deferred, out-of-scope obligations this plan hands to later manufacturing
 * stages -- recorded on the plan so downstream consumers can see what was
 * deliberately NOT done at planning time.
 */
export const SEGMENTATION_EXTENSION_OBLIGATIONS: readonly string[] = [
  "assembly-joint-planning",
  "alignment-and-sealing-validation",
  "assembly-sequence-planning",
];

export interface SegmentationAlgorithm {
  readonly id: string;
  readonly version: number;
  readonly planningBasis: SegmentationPlanningBasis;
  generateCandidates(context: SegmentationContext): readonly SplitCandidate[];
  evaluateCandidate(
    candidate: SplitCandidate,
    context: SegmentationContext,
  ): SplitCandidate;
}

export type SegmentationPlanningResult =
  | {
      readonly status: "planned";
      readonly request: SegmentationRequest;
      readonly plan: SegmentationPlan;
    }
  | {
      readonly status: "not-required";
      readonly request: SegmentationRequest;
      readonly validation: SegmentationValidation;
    }
  | {
      readonly status: "failed";
      readonly stage: SegmentationStage;
      readonly reasonCode: SegmentationReasonCode;
      readonly issues: readonly SegmentationIssue[];
      readonly request?: SegmentationRequest;
    }
  | {
      readonly status: "stale";
      readonly stage: "source-snapshot" | "result-validation";
      readonly reasonCode: "stale_source_revision";
      readonly issues: readonly SegmentationIssue[];
      readonly request?: SegmentationRequest;
    }
  | {
      readonly status: "unsupported";
      readonly stage: SegmentationStage;
      readonly reasonCode: SegmentationReasonCode;
      readonly issues: readonly SegmentationIssue[];
      readonly request?: SegmentationRequest;
      readonly plan?: SegmentationPlan;
    };

export type SegmentationResult =
  | SegmentationPlanningResult
  | SegmentationExecutionResult;

export type SegmentationLifecyclePhase =
  | "idle"
  | "planning"
  | "preview"
  | "accepted"
  | "executing"
  | "valid"
  | "failed"
  | "cancelled"
  | "stale"
  | "unsupported";
