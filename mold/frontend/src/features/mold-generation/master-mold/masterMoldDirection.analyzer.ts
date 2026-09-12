import type { Bounds3 } from "../split-face/splitFace.contracts";
import {
  MASTER_MOLD_DIRECTIONS,
  type MasterMoldDirection,
  type MasterMoldDirectionAnalysis,
  type MasterMoldDirectionCandidate,
} from "./masterMold.contracts";

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
 * Bounding box of the Master Stock that would enclose `bounds` for the given
 * open direction and wall/bottom thickness: full wall clearance on every
 * side except the open face, which sits flush with the target (per the V1
 * geometric contract, so the Boolean subtraction naturally leaves it open).
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

function stageAFilter(
  bounds: Bounds3,
  direction: MasterMoldDirection,
  wallThicknessMm: number,
  bottomThicknessMm: number,
  geometryToleranceMm: number,
): { readonly requiredDepthMm: number; readonly stockVolumeMm3: number } | null {
  const stock = masterStockBoundsFor(bounds, direction, wallThicknessMm, bottomThicknessMm);
  const sizeX = stock.max.x - stock.min.x;
  const sizeY = stock.max.y - stock.min.y;
  const sizeZ = stock.max.z - stock.min.z;

  if (![sizeX, sizeY, sizeZ].every(Number.isFinite) || sizeX <= geometryToleranceMm || sizeY <= geometryToleranceMm || sizeZ <= geometryToleranceMm) {
    return null;
  }

  const axis = axisOf(direction);
  const requiredDepthMm = stock.max[axis] - stock.min[axis];
  const stockVolumeMm3 = sizeX * sizeY * sizeZ;

  if (!Number.isFinite(requiredDepthMm) || requiredDepthMm <= geometryToleranceMm || !Number.isFinite(stockVolumeMm3) || stockVolumeMm3 <= 0) {
    return null;
  }

  return { requiredDepthMm, stockVolumeMm3 };
}

/** Lower is better: mm-scale combined cost of print height and stock bulk. No learned weights -- pure deterministic geometry. */
function scoreOf(requiredDepthMm: number, stockVolumeMm3: number): number {
  return -(requiredDepthMm + Math.cbrt(stockVolumeMm3));
}

export interface MasterMoldDirectionAnalyzerParams {
  readonly wallThicknessMm: number;
  readonly bottomThicknessMm: number;
  readonly geometryToleranceMm: number;
}

/**
 * Article 02 Stage A (broad phase): cheaply eliminate only directions whose
 * Master Stock would be degenerate. This is a geometry-independent bounds
 * check -- it cannot see undercuts and never rejects an otherwise-fittable
 * direction as physically infeasible. A candidate marked `valid` here means
 * only "worth building and precisely verifying" (Article 02 Stage B, run
 * against the actual generated tool geometry by the generator), never a
 * final manufacturability conclusion.
 */
export function analyzeMasterMoldOpenDirection(
  bounds: Bounds3,
  params: MasterMoldDirectionAnalyzerParams,
): MasterMoldDirectionAnalysis {
  const { wallThicknessMm, bottomThicknessMm, geometryToleranceMm } = params;
  const candidates: MasterMoldDirectionCandidate[] = [];

  for (const direction of MASTER_MOLD_DIRECTIONS) {
    const stageA = stageAFilter(bounds, direction, wallThicknessMm, bottomThicknessMm, geometryToleranceMm);

    if (stageA === null) {
      candidates.push({ direction, valid: false, reasonCode: "stock_bounds_invalid", requiredDepthMm: 0, stockVolumeMm3: 0, score: Number.NEGATIVE_INFINITY });
      continue;
    }

    candidates.push({
      direction,
      valid: true,
      reasonCode: "stock_bounds_valid",
      requiredDepthMm: stageA.requiredDepthMm,
      stockVolumeMm3: stageA.stockVolumeMm3,
      score: scoreOf(stageA.requiredDepthMm, stageA.stockVolumeMm3),
    });
  }

  let selected: MasterMoldDirection | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.valid && candidate.score > bestScore) {
      bestScore = candidate.score;
      selected = candidate.direction;
    }
  }

  return { candidates, selected, feasible: selected !== null };
}
