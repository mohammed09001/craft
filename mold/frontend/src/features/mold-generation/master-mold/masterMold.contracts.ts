import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";

export const MASTER_MOLD_SCHEMA_VERSION = 1 as const;

export const DEFAULT_MASTER_MOLD_WALL_MM = 3;
export const MIN_MASTER_MOLD_WALL_MM = 1;
export const DEFAULT_MASTER_MOLD_BOTTOM_MM = 3;
export const MIN_MASTER_MOLD_BOTTOM_MM = 1;

/** The six orthogonal candidate pull/open directions Article 04 evaluates. Deterministic order matters for tie-breaking. */
export const MASTER_MOLD_DIRECTIONS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;
export type MasterMoldDirection = (typeof MASTER_MOLD_DIRECTIONS)[number];

export type MasterMoldStatus =
  | "unavailable"
  | "ready"
  | "generating"
  | "current"
  | "stale"
  | "blocked"
  | "error";

export type MasterMoldFailureReason =
  | "invalid_source_geometry"
  | "no_valid_open_direction"
  | "master_stock_invalid"
  | "boolean_failed"
  | "insufficient_wall_thickness"
  | "insufficient_bottom_thickness"
  | "detached_fragment"
  | "open_face_inaccessible"
  | "multiple_open_faces"
  | "non_manifold_result"
  | "cancelled"
  | "stale_request";

export interface MasterMoldParameters {
  readonly wallThicknessMm: number;
  readonly bottomThicknessMm: number;
  readonly geometryToleranceMm: number;
}

/** Provenance: which committed final-mold part this Master Mold reproduces. */
export interface MasterMoldSource {
  readonly finalMoldPartId: string;
  readonly finalMoldPartName: string;
  readonly finalMoldGeometryVersion: string;
}

export interface MasterMoldSourceFingerprint {
  readonly finalMoldGeometryVersion: string;
  readonly parametersSignature: string;
  readonly directionOverride: MasterMoldDirection | null;
  readonly value: string;
}

export interface MasterMoldDirectionCandidate {
  readonly direction: MasterMoldDirection;
  readonly valid: boolean;
  readonly reasonCode: string;
  readonly requiredDepthMm: number;
  readonly stockVolumeMm3: number;
  readonly score: number;
}

export interface MasterMoldDirectionAnalysis {
  readonly candidates: readonly MasterMoldDirectionCandidate[];
  readonly selected: MasterMoldDirection | null;
  readonly feasible: boolean;
}

/** One committed final-mold part, ready to be turned into a Master Mold. */
export interface MasterMoldTargetInput {
  readonly source: MasterMoldSource;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
  readonly directionOverride?: MasterMoldDirection;
}

export interface MasterMoldRequest {
  readonly operationId: string;
  readonly generationVersion: number;
  readonly parameters: MasterMoldParameters;
  readonly targets: readonly MasterMoldTargetInput[];
}

export interface MasterMoldBodyResult {
  readonly source: MasterMoldSource;
  readonly status: "current" | "stale" | "blocked";
  readonly direction: MasterMoldDirection | null;
  readonly directionAnalysis: MasterMoldDirectionAnalysis;
  readonly mesh: MoldMeshPayload | null;
  readonly bounds: Bounds3 | null;
  readonly volumeMm3: number | null;
  readonly triangleCount: number | null;
  readonly watertight: boolean;
  readonly manifold: boolean;
  readonly failureReason: MasterMoldFailureReason | null;
  readonly failureMessage: string | null;
  readonly fingerprint: MasterMoldSourceFingerprint;
}

export interface MasterMoldResult {
  readonly operationId: string;
  readonly generationVersion: number;
  readonly elapsedMs: number;
  readonly bodies: readonly MasterMoldBodyResult[];
}
