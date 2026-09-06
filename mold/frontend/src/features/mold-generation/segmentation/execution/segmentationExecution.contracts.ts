import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { FitAxis, Size3 } from "../fitAnalysis";
import type {
  BoundaryIntent,
  SegmentationIssue,
  SegmentationPlan,
  SegmentationReasonCode,
  SegmentationRequest,
} from "../domain/segmentation.contracts";

export type SegmentationSide = "positive" | "negative";
export type SegmentationExecutionAxis = Extract<FitAxis, "x" | "y" | "z">;

export interface SegmentationExecutionPolicy {
  readonly id: "manifold-plane-split";
  readonly version: 1;
  readonly engine: "manifold-3d";
  readonly toleranceVersion: "scale-aware-v1";
  readonly linearToleranceMm: number;
  readonly boundsToleranceMm: number;
  readonly sideToleranceMm: number;
  readonly volumeToleranceMm3: number;
  readonly overlapToleranceMm3: number;
}

export interface SegmentationSourceBodyReference {
  readonly bodyId: string;
  readonly geometryVersion: string;
  readonly bodySignature: string;
  readonly committedResultRequestId: string;
  readonly body: MoldBodyData & { readonly geometryVersion: string };
}

export interface SupportedPlaneCutIntent {
  readonly boundary: BoundaryIntent;
  readonly boundaryId: string;
  readonly axis: SegmentationExecutionAxis;
  readonly coordinateMm: number;
  readonly normal: readonly [number, number, number];
  readonly originOffset: number;
  readonly coordinateSpace: "mold-local";
  readonly units: "millimeters";
  readonly upAxis: "Z";
  readonly sides: readonly ["positive", "negative"];
}

export interface SegmentationExecutionRequest {
  readonly id: string;
  readonly segmentationRequestId: string;
  readonly acceptedPlanId: string;
  readonly acceptedPlan: SegmentationPlan;
  readonly documentRevision: number;
  readonly documentFingerprint: string;
  readonly committedResultRequestId: string;
  readonly sourceBody: SegmentationSourceBodyReference;
  readonly printerVolume: Size3;
  readonly printerVolumeSignature: string;
  readonly executionAxis: SegmentationExecutionAxis;
  readonly planes: readonly SupportedPlaneCutIntent[];
  readonly planeSequenceSignature: string;
  readonly policy: SegmentationExecutionPolicy;
}

export interface SegmentationExecutionDiagnostic {
  readonly stage: "preflight" | "split" | "body-validation" | "aggregate-validation" | "commit";
  readonly reasonCode?: SegmentationReasonCode;
  readonly message: string;
  readonly axis?: SegmentationExecutionAxis;
  readonly bodyId?: string;
  readonly boundaryId?: string;
  readonly side?: SegmentationSide;
  readonly cutIndex?: number;
  readonly cutCount?: number;
  readonly measurements?: Readonly<Record<string, number>>;
}

export interface SegmentationOutputProvenance {
  readonly sourceBodyId: string;
  readonly sourceGeometryVersion: string;
  readonly segmentationRequestId: string;
  readonly acceptedPlanId: string;
  readonly axis: SegmentationExecutionAxis;
  readonly boundaryId: string;
  readonly side: SegmentationSide;
  readonly parentBodyId: string;
  readonly parentGeometryVersion: string;
  readonly cutIndex: number;
  readonly boundaryLineage: readonly string[];
  readonly executionRequestId: string;
  readonly executionPolicyId: string;
  readonly executionPolicyVersion: number;
}

export interface SegmentationExecutedBodyData extends MoldBodyData {
  readonly geometryVersion: string;
  readonly provenance: SegmentationOutputProvenance;
}

export interface SegmentationBodyExecutionValidation {
  readonly bodyId: string;
  readonly side: SegmentationSide;
  readonly volumeMm3: number;
  readonly bounds: Bounds3;
  readonly printableByBounds: true | "deferred";
  readonly manifold: true;
  readonly connectedComponentCount: 1;
}

export interface SegmentationCutExecutionValidation {
  readonly cutIndex: number;
  readonly axis: SegmentationExecutionAxis;
  readonly boundaryId: string;
  readonly inputBodyId: string;
  readonly inputVolumeMm3: number;
  readonly outputBodyIds: readonly [string, string];
  readonly outputVolumeMm3: number;
  readonly volumeDeltaMm3: number;
  readonly overlapVolumeMm3: number;
  readonly bodies: readonly [
    SegmentationBodyExecutionValidation,
    SegmentationBodyExecutionValidation,
  ];
}

export interface SegmentationExecutionValidation {
  readonly boundsPrintable: "verified" | "failed";
  readonly geometryExecuted: "verified" | "failed";
  readonly geometryValid: "verified" | "failed";
  readonly manufacturingSafety: "not-established";
  readonly bodies: readonly SegmentationBodyExecutionValidation[];
  readonly cuts: readonly SegmentationCutExecutionValidation[];
  readonly sourceVolumeMm3: number;
  readonly outputVolumeMm3: number;
  readonly volumeDeltaMm3: number;
  readonly overlapVolumeMm3: number;
  readonly policy: SegmentationExecutionPolicy;
}

interface ExecutionResultBase {
  readonly request: SegmentationRequest;
  readonly plan: SegmentationPlan;
  readonly executionRequest?: SegmentationExecutionRequest;
  readonly issues: readonly SegmentationIssue[];
  readonly diagnostics: readonly SegmentationExecutionDiagnostic[];
}

export type SegmentationExecutionResult =
  | (ExecutionResultBase & {
      readonly status: "executed";
      readonly executionRequest: SegmentationExecutionRequest;
      readonly bodies: readonly SegmentationExecutedBodyData[];
      readonly validation: SegmentationExecutionValidation;
    })
  | (ExecutionResultBase & {
      readonly status: "failed";
      readonly stage: "geometry-execution" | "result-validation";
      readonly reasonCode: SegmentationReasonCode;
    })
  | (ExecutionResultBase & {
      readonly status: "unsupported";
      readonly stage: "geometry-execution";
      readonly reasonCode: "unsupported_execution_shape" | "unsupported_boundary_intent";
    })
  | (ExecutionResultBase & {
      readonly status: "cancelled";
      readonly stage: "geometry-execution";
      readonly reasonCode: "execution_cancelled";
    })
  | (ExecutionResultBase & {
      readonly status: "stale";
      readonly stage: "source-snapshot" | "result-validation";
      readonly reasonCode: "stale_execution_source";
    });
