import { MOLD_GEOMETRY_TOLERANCE_MM, type CutPlaneData } from "../reference-mold-definition/orthogonalMold";
import { PART_BOUNDING_BOX_FACE_IDS, type Bounds3, type CuttingPlaneAxis, type CuttingPlaneProvenance, type CuttingPlaneRecord, type PartBoundingBoxFaceId, type PartBoundingBoxFacePlane, type Point3 } from "./splitFace.contracts";

export const CUTTING_PLANE_INSET_MM = MOLD_GEOMETRY_TOLERANCE_MM;
export const CUTTING_PLANE_NORMALIZED_EPSILON = 1e-6;

const FACE_DATA: Record<PartBoundingBoxFaceId, { axis: CuttingPlaneAxis; normal: Point3; initial: 0 | 1 }> = {
  front: { axis: "y", normal: { x: 0, y: 1, z: 0 }, initial: 1 },
  back: { axis: "y", normal: { x: 0, y: -1, z: 0 }, initial: 0 },
  left: { axis: "x", normal: { x: -1, y: 0, z: 0 }, initial: 0 },
  right: { axis: "x", normal: { x: 1, y: 0, z: 0 }, initial: 1 },
  top: { axis: "z", normal: { x: 0, y: 0, z: 1 }, initial: 1 },
  bottom: { axis: "z", normal: { x: 0, y: 0, z: -1 }, initial: 0 },
};
const opposite: Record<PartBoundingBoxFaceId, PartBoundingBoxFaceId> = { front: "back", back: "front", left: "right", right: "left", top: "bottom", bottom: "top" };

export function safeNormalizedInterval(bounds: Bounds3, axis: CuttingPlaneAxis) {
  const span = bounds.max[axis] - bounds.min[axis];
  if (!Number.isFinite(span) || span <= CUTTING_PLANE_INSET_MM * 2) throw new Error("Part bounding box bounds are too small for a cutting plane.");
  const inset = Math.max(CUTTING_PLANE_NORMALIZED_EPSILON, CUTTING_PLANE_INSET_MM / span);
  return { min: inset, max: 1 - inset };
}
export function clampNormalizedPosition(value: number, bounds?: Bounds3, axis?: CuttingPlaneAxis) {
  if (!Number.isFinite(value)) throw new Error("Cutting-plane position must be finite.");
  const interval = bounds !== undefined && axis !== undefined ? safeNormalizedInterval(bounds, axis) : { min: CUTTING_PLANE_NORMALIZED_EPSILON, max: 1 - CUTTING_PLANE_NORMALIZED_EPSILON };
  return Math.min(interval.max, Math.max(interval.min, value));
}
export function normalizedToWorldCoordinate(bounds: Bounds3, axis: CuttingPlaneAxis, normalized: number) {
  const safe = clampNormalizedPosition(normalized, bounds, axis);
  return bounds.min[axis] + (bounds.max[axis] - bounds.min[axis]) * safe;
}
export function worldToNormalizedPosition(bounds: Bounds3, axis: CuttingPlaneAxis, coordinate: number) {
  if (!Number.isFinite(coordinate)) throw new Error("Cutting-plane coordinate must be finite.");
  return clampNormalizedPosition((coordinate - bounds.min[axis]) / (bounds.max[axis] - bounds.min[axis]), bounds, axis);
}
export function createCuttingPlane(
  face: PartBoundingBoxFaceId,
  overrides?: { readonly normalizedPosition: number; readonly provenance: CuttingPlaneProvenance },
): CuttingPlaneRecord {
  const order = PART_BOUNDING_BOX_FACE_IDS.indexOf(face); const data = FACE_DATA[face];
  const normalizedPosition = overrides
    ? overrides.normalizedPosition
    : data.initial === 0 ? CUTTING_PLANE_NORMALIZED_EPSILON : 1 - CUTTING_PLANE_NORMALIZED_EPSILON;
  return { id: `cutting-plane:${face}`, sourceFaceId: face, axis: data.axis, normal: data.normal,
    normalizedPosition,
    initialNormalizedPosition: overrides ? overrides.normalizedPosition : data.initial,
    enabled: true, creationOrder: order, validationState: "valid",
    provenance: overrides ? overrides.provenance : "manual" };
}

/** One canonical face per axis, used when an axis (not a specific face) is
 * the unit of selection -- e.g. a General Segmentation extension plane. The
 * choice of which of the two faces per axis is an implementation detail:
 * the actual cut coordinate comes from the plane's normalizedPosition, not
 * from this face's own default endpoint. */
export const CANONICAL_FACE_FOR_AXIS: Readonly<Record<CuttingPlaneAxis, PartBoundingBoxFaceId>> = {
  x: "right",
  y: "back",
  z: "top",
};
export const buildPartBoundingBoxFacePlanes = (bounds: Bounds3): readonly PartBoundingBoxFacePlane[] | null => {
  const v=[bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z];
  if(!v.every(Number.isFinite)||bounds.max.x-bounds.min.x<=MOLD_GEOMETRY_TOLERANCE_MM||bounds.max.y-bounds.min.y<=MOLD_GEOMETRY_TOLERANCE_MM||bounds.max.z-bounds.min.z<=MOLD_GEOMETRY_TOLERANCE_MM)return null;
  const mid={x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2,z:(bounds.min.z+bounds.max.z)/2};
  return PART_BOUNDING_BOX_FACE_IDS.map((id,order)=>{const d=FACE_DATA[id];const coordinate=d.initial ? bounds.max[d.axis] : bounds.min[d.axis];return {id,axis:d.axis,coordinate,normal:d.normal,center:{...mid,[d.axis]:coordinate},bounds:structuredClone(bounds),sourcePartBoundingBox:structuredClone(bounds),oppositeFaceId:opposite[id],order};});
};
export const cuttingPlanesToCutPlaneData=(bounds:Bounds3,planes:readonly CuttingPlaneRecord[]):readonly CutPlaneData[]=>
  [...planes].filter(p=>p.enabled).sort((a,b)=>a.creationOrder-b.creationOrder).map(p=>({axis:p.axis,coordinate:normalizedToWorldCoordinate(bounds,p.axis,p.normalizedPosition),normal:p.normal,sourceSketchId:p.id,sourceFace:p.sourceFaceId,order:p.creationOrder}));
export const selectedPartBoundingBoxFacesToCutPlanes=(bounds:Bounds3,selected:readonly PartBoundingBoxFaceId[]):readonly CutPlaneData[]=>cuttingPlanesToCutPlaneData(bounds,selected.map(face=>createCuttingPlane(face)));
