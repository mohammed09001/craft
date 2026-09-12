import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import {
  buildGeometry,
  classifyPointInside,
} from "../cavity-generation/cavitySignedDistance.bvh";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
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

/** Dimensionless threshold on a unit-normal dot a unit pull vector -- not a length, so it is never geometryToleranceMm. */
const NORMAL_ALIGNMENT_EPSILON = 1e-9;

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

/**
 * A boundary point can collide with the fixed Master Mold shell as the
 * target retracts along `direction` iff (a) its outward normal faces the
 * pull direction (n.d > 0 -- a "negative draft" surface for this direction)
 * and (b) it is not already sitting on the open-face plane, where there is
 * no shell material to begin with. Faces at or past that plane, and faces
 * tangential/back-facing relative to `direction`, recede into their own
 * material or into open air and are always safe.
 *
 * This is the complete local condition for a target enclosed by a uniform
 * bounding-box stock (verified against box/cone/frustum/dome test cases):
 * stepping out of the target anywhere else lands in shell material given
 * the stock's non-zero wall clearance. The one gap -- two close-but-separate
 * lobes of the target where stepping "out" of one immediately re-enters the
 * other -- is resolved conservatively below by an inside/outside probe
 * before a candidate point is treated as a genuine collision.
 */

/**
 * Article 03: how far each near-vertex probe sits between the triangle's
 * centroid (0) and its own vertex (1). Kept strictly below 1 so every probe
 * origin stays inside the triangle (never exactly on a shared edge/vertex,
 * which would make the inside/outside classification depend on neighboring
 * triangle winding rather than this triangle's own local geometry).
 */
const NEAR_VERTEX_PROBE_BLEND = 0.9;

/**
 * Article 03: a single centroid probe per reverse-facing triangle is not
 * enough evidence on its own -- a large or irregularly tessellated triangle
 * (narrow necks, shoulders, re-entrant geometry, and other adversarial
 * fixtures all produce these) can have a centroid that happens to clear a
 * nearby obstruction while a corner of the same triangle does not. This
 * samples the centroid AND all three near-vertex points (adaptive refinement
 * scoped to exactly the triangles already flagged as candidates, never a
 * blanket grid over the whole mesh) and treats the triangle as blocking the
 * moment ANY sample collides -- strictly more conservative than centroid-only.
 */
function triangleBlocksDirection(
  bvh: MeshBVH,
  a: Vector3,
  b: Vector3,
  c: Vector3,
  centroid: Vector3,
  directionVector: Vector3,
  probeDistanceMm: number,
): boolean {
  const sample = new Vector3();
  const probe = new Vector3();

  for (const vertex of [centroid, a, b, c]) {
    if (vertex === centroid) {
      sample.copy(centroid);
    } else {
      sample.copy(centroid).lerp(vertex, NEAR_VERTEX_PROBE_BLEND);
    }

    probe.copy(sample).addScaledVector(directionVector, probeDistanceMm);

    if (!classifyPointInside(bvh, probe)) {
      return true;
    }
  }

  return false;
}

function findUndercut(
  bvh: MeshBVH,
  mesh: MoldMeshPayload,
  bounds: Bounds3,
  direction: MasterMoldDirection,
  geometryToleranceMm: number,
): boolean {
  const [dx, dy, dz] = DIRECTION_VECTORS[direction];
  const directionVector = new Vector3(dx, dy, dz);
  const axis = axisOf(direction);
  const openPlaneCoordinate = isPositive(direction) ? bounds.max[axis] : bounds.min[axis];
  const probeDistanceMm = Math.max(geometryToleranceMm * 4, 1e-6);

  const positions = mesh.positions;
  const indices = mesh.indices;
  const triangleCount = indices.length / 3;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const edgeAB = new Vector3();
  const edgeAC = new Vector3();
  const normal = new Vector3();
  const centroid = new Vector3();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const i0 = indices[triangle * 3]! * 3;
    const i1 = indices[triangle * 3 + 1]! * 3;
    const i2 = indices[triangle * 3 + 2]! * 3;
    a.set(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!);
    b.set(positions[i1]!, positions[i1 + 1]!, positions[i1 + 2]!);
    c.set(positions[i2]!, positions[i2 + 1]!, positions[i2 + 2]!);
    edgeAB.subVectors(b, a);
    edgeAC.subVectors(c, a);
    normal.crossVectors(edgeAB, edgeAC).normalize();

    if (normal.dot(directionVector) <= NORMAL_ALIGNMENT_EPSILON) {
      continue;
    }

    centroid.set((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);

    if (Math.abs(centroid[axis] - openPlaneCoordinate) <= geometryToleranceMm) {
      continue;
    }

    if (triangleBlocksDirection(bvh, a, b, c, centroid, directionVector, probeDistanceMm)) {
      return true;
    }
  }

  return false;
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
 * Article 04: evaluate the six orthogonal candidates and deterministically
 * select the best feasible one-piece open-face pull direction, or report
 * infeasibility rather than inventing a multi-piece Master Mold.
 */
export function analyzeMasterMoldOpenDirection(
  mesh: MoldMeshPayload,
  bounds: Bounds3,
  params: MasterMoldDirectionAnalyzerParams,
): MasterMoldDirectionAnalysis {
  const { wallThicknessMm, bottomThicknessMm, geometryToleranceMm } = params;
  const geometry = buildGeometry(mesh);
  const bvh = new MeshBVH(geometry);

  try {
    const candidates: MasterMoldDirectionCandidate[] = [];

    for (const direction of MASTER_MOLD_DIRECTIONS) {
      const stageA = stageAFilter(bounds, direction, wallThicknessMm, bottomThicknessMm, geometryToleranceMm);

      if (stageA === null) {
        candidates.push({ direction, valid: false, reasonCode: "stock_bounds_invalid", requiredDepthMm: 0, stockVolumeMm3: 0, score: Number.NEGATIVE_INFINITY });
        continue;
      }

      const blocked = findUndercut(bvh, mesh, bounds, direction, geometryToleranceMm);

      if (blocked) {
        candidates.push({ direction, valid: false, reasonCode: "undercut_detected", requiredDepthMm: stageA.requiredDepthMm, stockVolumeMm3: stageA.stockVolumeMm3, score: Number.NEGATIVE_INFINITY });
        continue;
      }

      candidates.push({
        direction,
        valid: true,
        reasonCode: "direction_geometrically_possible",
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
  } finally {
    geometry.dispose();
  }
}
