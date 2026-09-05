import { create } from "zustand";

import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

export type WorldBounds = {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
};

type ModelBoundsStore = {
  groundedWorldBounds: WorldBounds | null;
  setGroundedWorldBoundsFromGeometry: (
    geometry: CanonicalPartGeometry | null,
  ) => void;
};

/**
 * The one authoritative "current physical size of the imported model" value.
 * Grounding and orientation are already baked into vertex data before
 * `captureCanonicalPartGeometry` runs (see runtime/localStlImport.ts and
 * runtime/automaticModelOrientation.ts, which reset the model root's
 * position/quaternion to identity after baking), so transforming the
 * captured local bounds by the captured world transform reproduces exactly
 * what the renderer shows — no independent bounds computation is introduced.
 */
export function deriveGroundedWorldBounds(
  geometry: CanonicalPartGeometry | null,
): WorldBounds | null {
  if (geometry === null) return null;

  const { localBounds, transform } = geometry;
  if (transform.length !== 16) return null;

  const corners: readonly [number, number, number][] = [
    [localBounds.min.x, localBounds.min.y, localBounds.min.z],
    [localBounds.min.x, localBounds.min.y, localBounds.max.z],
    [localBounds.min.x, localBounds.max.y, localBounds.min.z],
    [localBounds.min.x, localBounds.max.y, localBounds.max.z],
    [localBounds.max.x, localBounds.min.y, localBounds.min.z],
    [localBounds.max.x, localBounds.min.y, localBounds.max.z],
    [localBounds.max.x, localBounds.max.y, localBounds.min.z],
    [localBounds.max.x, localBounds.max.y, localBounds.max.z],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const m = transform;
  const e = (index: number): number => m[index] ?? 0;

  for (const [x, y, z] of corners) {
    const wx = e(0) * x + e(4) * y + e(8) * z + e(12);
    const wy = e(1) * x + e(5) * y + e(9) * z + e(13);
    const wz = e(2) * x + e(6) * y + e(10) * z + e(14);
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}

export const useModelBoundsStore = create<ModelBoundsStore>()((set) => ({
  groundedWorldBounds: null,
  setGroundedWorldBoundsFromGeometry: (geometry) =>
    set({ groundedWorldBounds: deriveGroundedWorldBounds(geometry) }),
}));

export const useGroundedWorldBounds = () =>
  useModelBoundsStore((state) => state.groundedWorldBounds);
