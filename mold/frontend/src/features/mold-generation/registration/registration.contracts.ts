import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { RegistrationSizingPolicy } from "./registrationSizing.policy";

export type RegistrationInterfaceRole = "primary-parting" | (string & {});
export type RegistrationEligibility = "current-workflow" | "eligible" | "ineligible";
export type RegistrationAxis = "x" | "y" | "z";

export interface RegistrationVector3 { readonly x:number; readonly y:number; readonly z:number }
export interface MoldInterface {
  readonly id:string; readonly bodyAId:string; readonly bodyBId:string;
  readonly role:RegistrationInterfaceRole; readonly axis:RegistrationAxis;
  readonly planeCoordinateMm:number; readonly matingBounds:Bounds3;
  readonly assemblyDirection:RegistrationVector3;
}
export type LinearKeySide = "left" | "right" | "top" | "bottom";

export interface LinearKeyGeometryParameters {
  readonly shape: "linear-tongue-and-groove";
  readonly widthMm: number;
  readonly depthMm: number;
  readonly lengthMm: number;
  readonly taperAngleDeg: number;
  readonly leadInMm: number;
  readonly rootFilletMm: number;
}

export type RegistrationGeometryParameters = LinearKeyGeometryParameters;

export type RegistrationFeatureStatus = "planned" | "generated" | "skipped";
export interface RegistrationFeature {
  readonly id: string;
  readonly interfaceId: string;
  readonly logicalKeyId: string;
  readonly segmentIndex: number;
  readonly side: LinearKeySide;
  readonly maleBodyId: string;
  readonly femaleBodyId: string;
  readonly startPoint: RegistrationVector3;
  readonly endPoint: RegistrationVector3;
  readonly anchor: RegistrationVector3;
  readonly direction: RegistrationVector3;
  readonly normal: RegistrationVector3;
  readonly geometry: LinearKeyGeometryParameters;
  readonly clearanceMm: number;
  readonly status: RegistrationFeatureStatus;
  readonly reason: string | null;
}
export interface RegistrationManufacturingProfile {
  readonly process:"fdm"|"resin"|"unknown"; readonly nozzleDiameterMm?:number;
  readonly layerHeightMm?:number; readonly xyAccuracyMm?:number;
}
export interface RegistrationTolerancePolicy {
  readonly policyId:string; readonly radialClearanceMm:number; readonly booleanToleranceMm:number;
  readonly minimumWallMm:number; readonly cavitySafetyMarginMm:number; readonly outerEdgeMarginMm:number;
  readonly minimumFeatureRadiusMm:number; readonly maximumFeatureRadiusMm:number;
}
export interface RegistrationToleranceResolver { resolve(profile:RegistrationManufacturingProfile|null):RegistrationTolerancePolicy }
export interface RegistrationProtectedRegion {
  readonly id:string; readonly kind:"cavity"|"sprue"|"vent"|"functional";
  readonly bounds:Bounds3; readonly mesh?:MoldMeshPayload;
}
export interface RegistrationSourceBody {
  readonly id:string; readonly name:string; readonly visible:boolean; readonly bounds:Bounds3;
  readonly centroid?:RegistrationVector3; readonly triangleCount:number; readonly volumeMm3:number;
  readonly watertight:true; readonly mesh:MoldMeshPayload; readonly geometryVersion:string;
}
export interface RegistrationRequest<TBody extends RegistrationSourceBody> {
  readonly sourceRevision:string; readonly bodies:readonly TBody[];
  readonly protectedRegions:readonly RegistrationProtectedRegion[];
  readonly manufacturingProfile?:RegistrationManufacturingProfile|null;
  readonly sizingPolicy?:RegistrationSizingPolicy;
  readonly eligibility?:RegistrationEligibility;
}
export type RegistrationReasonCode = "registration_generated"|"registration_ineligible"|
  "registration_interface_not_found"|"registration_insufficient_safe_area"|
  "registration_insufficient_wall_thickness"|
  "registration_boolean_failed"|"registration_validation_failed";
export interface RegistrationReport {
  readonly schemaVersion:1; readonly sourceRevision:string; readonly status:"generated"|"blocked";
  readonly reasonCode:RegistrationReasonCode; readonly message:string;
  readonly interfaces:readonly MoldInterface[]; readonly features:readonly RegistrationFeature[];
  readonly tolerancePolicy:RegistrationTolerancePolicy;
  readonly attempts:readonly {readonly radiusMm:number;readonly requestedCount:number;readonly selectedCount:number}[];
}
export interface RegistrationResult<TBody extends RegistrationSourceBody> {
  readonly bodies:readonly TBody[]; readonly report:RegistrationReport;
}
