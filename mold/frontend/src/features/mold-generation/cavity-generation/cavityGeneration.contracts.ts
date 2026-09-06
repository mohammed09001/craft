import type { MoldBodyData, MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import type { Bounds3, CuttingPlaneRecord } from "../split-face/splitFace.contracts";
import type { CavityGeometryTolerancePolicy } from "./cavityGeometryTolerance.policy";
import type { CavityProgressStage } from "./cavityGeneration.worker.contracts";

export const CAVITY_GENERATION_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CAVITY_CLEARANCE_MM = 0;
export const MIN_CAVITY_CLEARANCE_MM = 0;
export const MAX_CAVITY_CLEARANCE_MM = 5;
export const DEFAULT_MINIMUM_WALL_MM = 1;
export type CavityQualityMode = "standard" | "high";
export type CavityWorkflowStatus = "unavailable" | "ready" | "generating" | "complete" | "blocked" | "error";
export type CavityIssueSeverity = "warning" | "blocker";

export interface CavityIssue { readonly severity:CavityIssueSeverity; readonly reasonCode:string; readonly message:string }
export interface CavityIssue { readonly severity:CavityIssueSeverity; readonly reasonCode:string; readonly message:string }
export interface CanonicalPartGeometry {
  readonly modelId:string; readonly geometryVersion:string; readonly units:"millimeters"; readonly upAxis:"Z";
  readonly sourceUnits?:"millimeters"|"centimeters"|"meters"|"inches"|"unknown"; readonly scaleToMillimeters?:number;
  readonly positions:readonly number[]; readonly indices:readonly number[]; readonly transform:readonly number[];
  readonly localBounds:Bounds3; readonly winding:"source"; readonly validationStatus:"captured";
  readonly connectedComponentCount?:number; readonly sourceSignature:string;
}

export interface MoldCoordinateFrameSnapshot {
  readonly frameId:string; readonly version:1; readonly units:"millimeters"; readonly upAxis:"Z";
  readonly origin:{readonly x:number;readonly y:number;readonly z:number};
  readonly xAxis:{readonly x:number;readonly y:number;readonly z:number};
  readonly yAxis:{readonly x:number;readonly y:number;readonly z:number};
  readonly zAxis:{readonly x:number;readonly y:number;readonly z:number};
  readonly worldFromMold:readonly number[]; readonly moldFromWorld:readonly number[];
}
export interface CavityGenerationInput {
  readonly schemaVersion:typeof CAVITY_GENERATION_SCHEMA_VERSION; readonly operationId:string; readonly generationVersion:number;
  readonly sourcePartMesh:CanonicalPartGeometry; readonly coordinateFrame:MoldCoordinateFrameSnapshot;
  readonly partBoundingBox:Bounds3; readonly referenceMoldBlockBounds:Bounds3; readonly referenceMoldBlockClearanceMm:number;
  readonly cuttingPlanes:readonly CuttingPlaneRecord[]; readonly moldBodies:readonly CavitySourceBody[];
  readonly cavityClearanceMm:number; readonly geometryToleranceMm:number; readonly minimumWallMm:number;
  readonly tolerancePolicy:CavityGeometryTolerancePolicy;
  readonly qualityMode:CavityQualityMode; readonly upstreamInputSignature:string;
}
export interface CavitySourceBody extends Omit<MoldBodyData,"visible"> { readonly geometryVersion:string }
export interface WatertightPartSolid { readonly mesh:MoldMeshPayload; readonly bounds:Bounds3; readonly volumeMm3:number; readonly triangleCount:number; readonly connectedComponentCount:number; readonly watertight:boolean; readonly manifold:boolean; readonly warnings:readonly CavityIssue[] }

export type CavityImplementationMethod =
  | "exact-watertight-part-solid"
  | "manifold-minkowski-sphere"
  | "manifold-level-set-sdf";

export interface CavityToolData extends WatertightPartSolid {
  readonly clearanceMm:number;
  readonly implementationMethod:CavityImplementationMethod;
  readonly qualityMode:CavityQualityMode;
}
export interface CavityBodyValidation {
  readonly bodyId:string; readonly bodyName:string; readonly parentBodyId:string; readonly cavityAffected:boolean;
  readonly finiteGeometry:boolean; readonly validBounds:boolean; readonly positiveVolume:boolean; readonly volumeMm3:number;
  readonly triangleCount:number; readonly connectedComponentCount:number; readonly watertight:boolean; readonly manifold:boolean;
  readonly openEdgeCount:number; readonly nonManifoldEdgeCount:number; readonly minimumWallMm:number;
  readonly warnings:readonly CavityIssue[]; readonly blockers:readonly CavityIssue[]; readonly reasonCodes:readonly string[];
}
export interface CavityMoldBodyData extends MoldBodyData { readonly geometryVersion:string; readonly parentBodyId:string; readonly cavityAffected:boolean; readonly cavityValidation:CavityBodyValidation }
export interface CavityGenerationResult {
  readonly operationId:string; readonly generationVersion:number; readonly sourceSignature:string;
  readonly implementation:"manifold-3d-wasm"; readonly elapsedMs:number; readonly cavityTool:CavityToolData;
  readonly bodies:readonly CavityMoldBodyData[]; readonly warnings:readonly CavityIssue[]; readonly blockers:readonly CavityIssue[];
  readonly diagnostics?:CavityGenerationDiagnostics;
  readonly subtractionDiagnostics?:CavitySubtractionDiagnostics;
}
export interface CavitySubtractionDiagnostics { readonly sourceBodyCount:number; readonly affectedBodyCount:number; readonly unaffectedBodyCount:number; readonly originalVolumeMm3:number; readonly resultVolumeMm3:number; readonly removedVolumeMm3:number; readonly cavityToolVolumeMm3:number }
export interface CavityGenerationDiagnostics {
  readonly selectedEngine:string;
  readonly engineReasonCodes:readonly string[];
  readonly attempts:readonly {readonly engine:string;readonly status:"succeeded"|"failed";readonly errorMessage:string|null}[];
  readonly usedFallback:boolean;
  readonly timings:{readonly validationMs:number;readonly auditMs:number;readonly offsetMs:number;readonly booleanMs:number;readonly totalMs:number};
  readonly distanceFieldProfile?:unknown;
  readonly tolerancePolicy:CavityGeometryTolerancePolicy;
  readonly subtraction:CavitySubtractionDiagnostics;
}
export interface CavityWorkflowState {
  readonly status:CavityWorkflowStatus; readonly clearanceMm:number; readonly qualityMode:CavityQualityMode;
  readonly progressStage:CavityProgressStage|null; readonly progress:number;
  readonly generationVersion:number; readonly sourceSignature:string|null; readonly result:CavityGenerationResult|null;
  readonly warnings:readonly CavityIssue[]; readonly blockers:readonly CavityIssue[]; readonly lastError:string|null;
}
export interface CavityBooleanEngine { readonly implementation:string; subtract(body:CavitySourceBody,tool:CavityToolData):Promise<readonly CavityMoldBodyData[]> }
export interface CavityOffsetEngine { readonly implementation:string; build(prepared:WatertightPartSolid,clearanceMm:number,qualityMode:CavityQualityMode):Promise<CavityToolData> }



