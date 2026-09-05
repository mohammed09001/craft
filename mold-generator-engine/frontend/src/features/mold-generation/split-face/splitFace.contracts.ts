export const PART_BOUNDING_BOX_FACE_IDS = ["front", "back", "left", "right", "top", "bottom"] as const;
export type PartBoundingBoxFaceId = (typeof PART_BOUNDING_BOX_FACE_IDS)[number];

export type CuttingPlaneAxis = "x" | "y" | "z";
export type SplitWorkflowState = "modelReady" | "selectingFaces" | "planesReady" | "draggingPlane" | "generatingParts" | "partsReady" | "error";
export interface Point3 { readonly x: number; readonly y: number; readonly z: number }
export interface Bounds3 { readonly min: Point3; readonly max: Point3 }
/**
 * Where a cutting plane came from. "manual" is ordinary standalone
 * Split-by-Face usage (unchanged default). The "segmentation-extension-*"
 * values mark a plane added on an axis a General Segmentation plan left
 * available -- "suggested" until the user drags it, then "adjusted"
 * permanently (the algorithm never snaps it back).
 */
export type CuttingPlaneProvenance =
  | "manual"
  | "segmentation-extension-suggested"
  | "segmentation-extension-adjusted";
export interface CuttingPlaneRecord {
  readonly id: `cutting-plane:${PartBoundingBoxFaceId}`;
  readonly sourceFaceId: PartBoundingBoxFaceId;
  readonly axis: CuttingPlaneAxis;
  readonly normal: Point3;
  readonly normalizedPosition: number;
  readonly initialNormalizedPosition: number;
  readonly enabled: boolean;
  readonly creationOrder: number;
  readonly validationState: "valid";
  readonly lastValidWorldCoordinate?: number;
  readonly provenance: CuttingPlaneProvenance;
}
export interface PartBoundingBoxFacePlane {
  readonly id: PartBoundingBoxFaceId; readonly axis: CuttingPlaneAxis; readonly coordinate:number;
  readonly normal: Point3; readonly center: Point3; readonly bounds: Bounds3;
  readonly sourcePartBoundingBox: Bounds3; readonly oppositeFaceId: PartBoundingBoxFaceId; readonly order:number;
}

