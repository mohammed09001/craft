import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MasterMoldDirection } from "./masterMold.contracts";

export const DIRECTION_VECTORS: Readonly<Record<MasterMoldDirection, Readonly<[number, number, number]>>> = {
  "+X": [1, 0, 0],
  "-X": [-1, 0, 0],
  "+Y": [0, 1, 0],
  "-Y": [0, -1, 0],
  "+Z": [0, 0, 1],
  "-Z": [0, 0, -1],
};

export function axisOf(direction: MasterMoldDirection): "x" | "y" | "z" {
  return direction[1]!.toLowerCase() as "x" | "y" | "z";
}

export function isPositive(direction: MasterMoldDirection): boolean {
  return direction[0] === "+";
}

/**
 * Bounding box of the case envelope that would enclose `bounds` for the given
 * opening direction and wall/bottom thickness: full wall clearance on every
 * side except the opening face, which sits flush with the cast target (so
 * the Boolean subtraction naturally leaves it open).
 */
export function masterStockBoundsFor(
  bounds: Bounds3,
  direction: MasterMoldDirection,
  wallThicknessMm: number,
  bottomThicknessMm: number,
): Bounds3 {
  const axis = axisOf(direction);
  const positive = isPositive(direction);
  const min = { x: bounds.min.x - wallThicknessMm, y: bounds.min.y - wallThicknessMm, z: bounds.min.z - wallThicknessMm };
  const max = { x: bounds.max.x + wallThicknessMm, y: bounds.max.y + wallThicknessMm, z: bounds.max.z + wallThicknessMm };

  if (positive) {
    max[axis] = bounds.max[axis];
    min[axis] = bounds.min[axis] - bottomThicknessMm;
  } else {
    min[axis] = bounds.min[axis];
    max[axis] = bounds.max[axis] + bottomThicknessMm;
  }

  return { min, max };
}
