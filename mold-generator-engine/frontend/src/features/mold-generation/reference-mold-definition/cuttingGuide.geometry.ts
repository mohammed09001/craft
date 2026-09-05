import type { ReferenceMoldDefinition } from "./referenceMoldDefinition.contracts";
export type ReferenceMoldCuttingGuideId = "topToBottom" | "frontToBack";
export interface ReferenceMoldCuttingGuide { readonly id: ReferenceMoldCuttingGuideId; readonly source:"K2"; readonly normalizedProgress:number; readonly travelRange:{readonly from:number;readonly to:number}; readonly normal:{readonly x:number;readonly y:number;readonly z:number}; readonly state:"idle"|"previewing"|"cut" }

type Bounds = ReferenceMoldDefinition["selectionBoxBounds"];
export interface CuttingGuideGeometry { readonly position: number; readonly width: number; readonly height: number; readonly travelRange: { readonly from: number; readonly to: number }; }

export const isValidReferenceMoldBounds = ({ min, max }: Bounds): boolean =>
  [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) && max.x > min.x && max.y > min.y && max.z > min.z;
export const clampGuideProgress = (progress: number): number => Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;

export function createCuttingGuides(bounds: Bounds): readonly ReferenceMoldCuttingGuide[] | null {
  if (!isValidReferenceMoldBounds(bounds)) return null;
  return [
    { id: "topToBottom", source: "K2", normalizedProgress: 0, travelRange: { from: bounds.max.z, to: bounds.min.z }, normal: { x: 0, y: 0, z: -1 }, state: "idle" },
    { id: "frontToBack", source: "K2", normalizedProgress: 0, travelRange: { from: bounds.min.y, to: bounds.max.y }, normal: { x: 0, y: 1, z: 0 }, state: "idle" },
  ];
}

export function deriveCuttingGuideGeometry(bounds: Bounds, id: ReferenceMoldCuttingGuideId, progress: number): CuttingGuideGeometry | null {
  if (!isValidReferenceMoldBounds(bounds)) return null;
  const t = clampGuideProgress(progress);
  if (id === "topToBottom") { const from = bounds.max.z; const to = bounds.min.z; return { position: from + (to - from) * t, width: maxSpan(bounds, "x"), height: maxSpan(bounds, "y"), travelRange: { from, to } }; }
  const from = bounds.min.y; const to = bounds.max.y;
  return { position: from + (to - from) * t, width: maxSpan(bounds, "x"), height: maxSpan(bounds, "z"), travelRange: { from, to } };
}
const maxSpan = (bounds: Bounds, axis: "x" | "y" | "z") => bounds.max[axis] - bounds.min[axis];
export const deriveGroundZ = (fallbackGroundZ: number, bounds: Bounds | null): number => bounds !== null && isValidReferenceMoldBounds(bounds) ? bounds.min.z : fallbackGroundZ;
