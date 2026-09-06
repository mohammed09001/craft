import type { MoldBodyData, MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import type { SprueProfileDimensions } from "./sprueProfile";
import type { SprueProfileDesignResult } from "./sprueProfileDesigner";

export interface SerializableVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SprueMoldCoordinateFrame {
  readonly frameId: string;
  readonly units: "millimeters";
  readonly origin: SerializableVector3;
  readonly xAxis: SerializableVector3;
  readonly yAxis: SerializableVector3;
  readonly zAxis: SerializableVector3;
}

export interface SpruePlacementRequest {
  readonly operationId: string;
  readonly position: SerializableVector3;
  readonly profileDesign: SprueProfileDesignResult;
  readonly moldRevision: string;
}

export interface SpruePreviewPlacementBase {
  readonly topPoint: SerializableVector3;
  readonly inwardDirection: SerializableVector3;
  readonly stemLengthMm: number;
  readonly profileDesign: SprueProfileDesignResult;
  readonly coordinateSpace: "mold-local";
}

export interface InvalidSpruePreviewPlacement extends SpruePreviewPlacementBase {
  readonly status: "invalid";
}

export interface ValidSpruePreviewPlacement extends SpruePreviewPlacementBase {
  readonly status: "valid";
  readonly cavityPoint: SerializableVector3;
}

export type SpruePreviewPlacement =
  | InvalidSpruePreviewPlacement
  | ValidSpruePreviewPlacement;

/** Canonical Sprue intent.  Boolean-specific depth/targets live only in the resolved result. */
export interface SprueOperationDefinition {
  readonly operationId: string;
  readonly anchor: {
    readonly position: SerializableVector3;
    readonly surfaceId: "reference-mold:top";
  };
  readonly inwardDirection: SerializableVector3;
  readonly profileDesign: SprueProfileDesignResult;
  readonly creationOrder: number;
  readonly coordinateSpace: "mold-local";
  readonly validation: {
    readonly status: "pending" | "resolved" | "invalid";
    readonly reasonCode: SprueFailureReasonCode | null;
    readonly message: string | null;
  };
}

/** Lightweight committed presentation data; pending intent never masquerades as Boolean output. */
export interface SpruePresentationDefinition {
  readonly operationId: string;
  readonly position: SerializableVector3;
  readonly inwardDirection: SerializableVector3;
  readonly profile: SprueProfileDimensions;
  /** Distance from `position` to the lower (entry neck) opening along `inwardDirection`; undefined until the Sprue is resolved. */
  readonly depthMm?: number;
  /** Mold body ids this Sprue actually cuts into; undefined until the Sprue is resolved. Used to scope body visibility to the owning body only. */
  readonly targetBodyIds?: readonly string[];
  readonly status?: "pending" | "resolved" | "invalid";
}

export interface SprueTolerancePolicy {
  readonly linearToleranceMm: number;
  readonly areaToleranceMm2: number;
  readonly volumeToleranceMm3: number;
  readonly meaningfulVolumeMm3: number;
  readonly surfaceToleranceMm: number;
  readonly outsideMarginMm: number;
  readonly beyondMarginMm: number;
}

export interface SprueSourceBody extends MoldBodyData {
  readonly geometryVersion: string;
  readonly parentBodyId?: string;
}

export interface SprueGenerationInput {
  readonly request: SpruePlacementRequest;
  readonly targetBodies: readonly SprueSourceBody[];
  readonly cavity: MoldMeshPayload | null;
  readonly moldFrame: SprueMoldCoordinateFrame;
  readonly geometryToleranceMm: number;
}

export type SprueFailureReasonCode =
  | "SPRUE_TARGET_BODY_MISSING"
  | "SPRUE_CAVITY_MISSING"
  | "SPRUE_INVALID_PROFILE"
  | "SPRUE_INVALID_PLACEMENT"
  | "SPRUE_NOT_ON_TOP_FACE"
  | "SPRUE_INLET_OUTSIDE_BODY"
  | "SPRUE_DOES_NOT_ENTER_BODY"
  | "SPRUE_DOES_NOT_REACH_CAVITY"
  | "SPRUE_TANGENTIAL_CAVITY_CONTACT"
  | "SPRUE_BOOLEAN_FAILED"
  | "SPRUE_RESULT_INVALID"
  | "SPRUE_STALE_INPUT"
  | "SPRUE_GENERATION_IN_PROGRESS";

export interface SprueFailure {
  readonly status: "failure";
  readonly reasonCode: SprueFailureReasonCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface SprueDefinition {
  readonly operationId: string;
  readonly targetBodyIds: readonly string[];
  readonly position: SerializableVector3;
  readonly inwardDirection: SerializableVector3;
  readonly profile: SprueProfileDimensions;
  readonly depthMm: number;
  readonly circularSegments: 32;
  readonly coordinateSpace: "mold-local";
  readonly moldFrameId: string;
  readonly tolerancePolicy: SprueTolerancePolicy;
}

export interface SprueUpdatedBody extends SprueSourceBody {
  readonly centroid: SerializableVector3;
  readonly sprueOperationId: string;
}

export interface SprueGenerationSuccess {
  readonly status: "success";
  readonly operationId: string;
  readonly sourceRevision: string;
  readonly sprue: SprueDefinition;
  readonly beforeBodies: readonly SprueSourceBody[];
  readonly updatedBodies: readonly SprueUpdatedBody[];
  readonly replacedBodyIds: readonly string[];
  readonly warnings: readonly string[];
}

export type SprueGenerationResult = SprueGenerationSuccess | SprueFailure;

export type SprueWorkflowStatus = "idle" | "validating" | "generating" | "ready";

export interface SprueApplicationSnapshot {
  readonly revision: string;
  readonly bodies: readonly SprueSourceBody[];
  readonly lastSuccess: SprueGenerationSuccess | null;
}

export interface SprueApplicationState extends SprueApplicationSnapshot {
  readonly status: SprueWorkflowStatus;
  readonly failure: SprueFailure | null;
  readonly undoStack: readonly SprueApplicationSnapshot[];
  readonly redoStack: readonly SprueApplicationSnapshot[];
  readonly committedOperationIds: readonly string[];
}

