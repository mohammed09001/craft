import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import { MASTER_MOLD_DIRECTIONS, type MasterMoldDirection } from "../masterMold.contracts";
import { axisOf, DIRECTION_VECTORS, isPositive } from "../masterMoldDirection.analyzer";
import { buildMeshGeometry, countUniqueForwardIntersections } from "../../geometry/meshBvh";
import type { MasterCastTarget, MasterPourFaceCandidate, MasterPourFaceDecision } from "./contracts";

/**
 * Execution 05 Article 07: Pour-Face and casting-orientation planner.
 *
 * Decides where casting material enters the Master tooling. Deliberately
 * independent from release analysis (Article 08): Pour Face ≠ demold
 * direction. Candidate sources are extensible beyond ±X/±Y/±Z (semantic
 * axes, planar exterior face normals, user override), hard constraints are
 * rejected before scoring, weights are centralized and deterministic, and
 * fillability analysis detects sealed high pockets. Execution 07 LOOP 07:
 * candidate ranking/provenance is geometry-derived (measured planar face
 * exposure), pocket samples are grouped into actual air pockets, and provable
 * pocket vents become automatic mesh-verified features while the rest remain
 * user-review-only recommendations (the exact conversion happens at tooling
 * construction via safeVentPathsFor's mesh proof).
 */

/** Centralized, deterministic scoring weights (Execution 05 Article 07 "Scoring"). Lower total = better. */
export const POUR_FACE_WEIGHTS = {
  /** Reward (mm^-2 scale): larger exposed pour opening. */
  openingArea: 0.05,
  /** Penalty per mm of casting depth below the pour plane. */
  castingDepth: 0.02,
  /** Penalty per sealed high pocket detected (trapped-air risk). */
  trappedAirPocket: 5,
  /** Penalty when the negative surface sits close to the pour plane (functional interference). */
  functionalInterference: 3,
  /** Penalty per extra opening face count beyond one (expected case complexity). */
  caseComplexity: 1,
  /** Penalty per mm of print height in casting orientation (support burden proxy). */
  supportHeight: 0.01,
  /** Bonus applied once to a user-override candidate. */
  userOverrideBonus: 10,
} as const;

/** Minimum pour opening area (mm²) for the opening to be fillable at all. */
const MINIMUM_OPENING_AREA_MM2 = 25;
/** Bounded deterministic sample count for sealed-pocket ray analysis. */
const SEALED_POCKET_SAMPLE_LIMIT = 32;
/** Execution 07 LOOP 07: bounded limits for geometry-derived pour candidates and pocket grouping. */
export const POUR_FACE_GEOMETRY_LIMITS = {
  /** Bounded deterministic triangle sample cap for planar-face exposure measurement. */
  exposureSampleCap: 512,
  /** A triangle counts toward a direction's planar exposure when its normal aligns this closely with the axis. */
  planarNormalDot: 0.999,
  /** Air-pocket clustering grid divisions across the target's largest span. */
  pocketGridDivisions: 8,
} as const;

/** A trapped-air pocket: grouped sealed-pocket samples with a stable centroid (Execution 07 LOOP 07). */
export interface AirPocket {
  readonly centroid: { readonly x: number; readonly y: number; readonly z: number };
  readonly sampleCount: number;
  readonly bounds: Bounds3;
}

export interface PourFacePlanInput {
  readonly castTarget: MasterCastTarget;
  /** The original-part negative-tool mesh in mold coordinates (functional cavity geometry the pour face must not cut). */
  readonly negativeToolMesh: MoldMeshPayload;
  readonly negativeToolBounds: Bounds3;
  readonly caseWallThicknessMm: number;
  readonly caseBaseThicknessMm: number;
  readonly geometryToleranceMm: number;
  readonly userOverride: MasterMoldDirection | null;
}

function faceAreaOfBounds(bounds: Bounds3, direction: MasterMoldDirection): number {
  const axis = axisOf(direction);
  const others = (["x", "y", "z"] as const).filter((candidate) => candidate !== axis);
  return (bounds.max[others[0]!] - bounds.min[others[0]!]) * (bounds.max[others[1]!] - bounds.min[others[1]!]);
}

/** True when the original-part negative reaches the candidate face plane -- the pour opening would cut functional cavity geometry. */
function negativeReachesFace(negativeBounds: Bounds3, targetBounds: Bounds3, direction: MasterMoldDirection, toleranceMm: number): boolean {
  const axis = axisOf(direction);
  return isPositive(direction)
    ? negativeBounds.max[axis] >= targetBounds.max[axis] - toleranceMm
    : negativeBounds.min[axis] <= targetBounds.min[axis] + toleranceMm;
}

/** Deterministic candidate directions: user override first, then geometry-derived planar-face-normal axes, then remaining semantic axes. */
export function candidateDirections(castTarget: MasterCastTarget, userOverride: MasterMoldDirection | null): MasterMoldDirection[] {
  const ordered: MasterMoldDirection[] = [];
  if (userOverride !== null) ordered.push(userOverride);
  // Execution 07 LOOP 07: the candidate order is geometry-derived. Planar
  // exterior face exposure is measured from the mesh (bounded deterministic
  // sampling) and backs the "planar-face-normal" candidate source; the
  // semantic axes remain the bounded deterministic baseline for parts
  // without axis-aligned planar faces (e.g. doubly curved surfaces). The
  // candidate structure keeps future free-form normals open (Article 07
  // "Candidate Sources").
  const exposure = planarFaceExposureByDirection(castTarget);
  const byGeometry = [...MASTER_MOLD_DIRECTIONS].sort(
    (a, b) =>
      exposure[b] - exposure[a] ||
      faceAreaOfBounds(castTarget.bounds, b) - faceAreaOfBounds(castTarget.bounds, a) ||
      a.localeCompare(b),
  );
  for (const direction of byGeometry) {
    if (!ordered.includes(direction)) ordered.push(direction);
  }
  return ordered;
}

/**
 * Execution 07 LOOP 07: measures, per Master Mold direction, how much
 * exterior planar face area actually faces that direction. Bounded
 * deterministic triangle sampling (stride = triCount / cap); a triangle
 * contributes its area to a direction when its outward normal aligns with
 * the axis within the planar tolerance. This is what makes the pour
 * candidates geometry-derived: ranking and provenance come from the mesh,
 * not from the case envelope.
 */
export function planarFaceExposureByDirection(castTarget: MasterCastTarget): Readonly<Record<MasterMoldDirection, number>> {
  const exposure: Record<MasterMoldDirection, number> = { "+X": 0, "-X": 0, "+Y": 0, "-Y": 0, "+Z": 0, "-Z": 0 };
  const indices = castTarget.mesh.indices;
  const positions = castTarget.mesh.positions;
  const triangleCount = indices.length / 3;
  const stride = Math.max(1, Math.floor(triangleCount / POUR_FACE_GEOMETRY_LIMITS.exposureSampleCap));
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    const i0 = indices[triangle * 3]! * 3;
    const i1 = indices[triangle * 3 + 1]! * 3;
    const i2 = indices[triangle * 3 + 2]! * 3;
    const ax = positions[i0]!;
    const ay = positions[i0 + 1]!;
    const az = positions[i0 + 2]!;
    const bx = positions[i1]!;
    const by = positions[i1 + 1]!;
    const bz = positions[i1 + 2]!;
    const cx = positions[i2]!;
    const cy = positions[i2 + 1]!;
    const cz = positions[i2 + 2]!;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length <= 1e-12) continue;
    // Twice the triangle area; accumulated consistently so relative
    // exposure is unchanged.
    for (const direction of MASTER_MOLD_DIRECTIONS) {
      const [dx, dy, dz] = DIRECTION_VECTORS[direction];
      if ((nx * dx + ny * dy + nz * dz) / length >= POUR_FACE_GEOMETRY_LIMITS.planarNormalDot) {
        exposure[direction] += length / 2;
      }
    }
  }
  return exposure;
}

/**
 * Detects obvious sealed high pockets relative to gravity: downward-facing
 * cast-target surfaces (excluding the seating face) that (a) have
 * cast-target material directly above them along the casting-up direction
 * AND (b) have no horizontal escape path out of the target's own footprint.
 * Bounded deterministic sampling; produces a structured warning (never an
 * invented vent hole).
 */
function sealedHighPocketSamples(castTarget: MasterCastTarget, upDirection: MasterMoldDirection): { readonly x: number; readonly y: number; readonly z: number }[] {
  const [ux, uy, uz] = DIRECTION_VECTORS[upDirection];
  const up = new Vector3(ux, uy, uz);
  const horizontal: Vector3[] = uz !== 0
    ? [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0)]
    : [up.clone(), up.clone().negate(), new Vector3(ux, uy, uz).cross(new Vector3(0, 0, 1)), new Vector3(ux, uy, uz).cross(new Vector3(0, 0, -1))];
  const axis = uz !== 0 ? "z" : uy !== 0 ? "y" : "x";
  const seatingPlane = isPositive(upDirection) ? castTarget.bounds.min[axis] : castTarget.bounds.max[axis];

  const samples: { readonly x: number; readonly y: number; readonly z: number }[] = [];
  let sampled = 0;
  let geometry: ReturnType<typeof buildMeshGeometry> | null = null;

  try {
    geometry = buildMeshGeometry(castTarget.mesh);
    const bvh = new MeshBVH(geometry);
    const indices = castTarget.mesh.indices;
    const positions = castTarget.mesh.positions;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const ab = new Vector3();
    const ac = new Vector3();
    const normal = new Vector3();
    const centroid = new Vector3();

    for (let triangle = 0; triangle < indices.length / 3 && sampled < SEALED_POCKET_SAMPLE_LIMIT; triangle += 1) {
      const i0 = indices[triangle * 3]! * 3;
      const i1 = indices[triangle * 3 + 1]! * 3;
      const i2 = indices[triangle * 3 + 2]! * 3;
      a.set(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!);
      b.set(positions[i1]!, positions[i1 + 1]!, positions[i1 + 2]!);
      c.set(positions[i2]!, positions[i2 + 1]!, positions[i2 + 2]!);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac).normalize();
      const downwardDot = -(normal.x * ux + normal.y * uy + normal.z * uz);
      if (downwardDot <= 0.1) continue;
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      // The seating face (global minimum along -up) is not an air trap.
      if (Math.abs(centroid[axis] - seatingPlane) <= 1e-3) continue;
      sampled += 1;
      // Probe strictly OUTSIDE the surface along its own normal (into the
      // air pocket). The previous +up nudge cancelled the normal offset on
      // exactly horizontal ceilings, leaving the ray grazing the surface
      // and every real pocket undetected (fixed in Execution 07 LOOP 07).
      const probe = centroid.clone().addScaledVector(normal, 1e-3);
      // (a) material directly above?
      if (countUniqueForwardIntersections(bvh, probe, up) < 2) continue;
      // (b) any horizontal escape path (no further target crossing)?
      const escaped = horizontal.some((direction) => countUniqueForwardIntersections(bvh, probe.clone(), direction) === 0);
      if (!escaped) {
        samples.push({ x: centroid.x, y: centroid.y, z: centroid.z });
      }
    }
  } finally {
    geometry?.dispose();
  }

  return samples;
}

export function detectSealedHighPockets(castTarget: MasterCastTarget, upDirection: MasterMoldDirection): number {
  return sealedAirPockets(castTarget, upDirection).length;
}

/**
 * Execution 07 LOOP 07: groups raw sealed-pocket samples into actual air
 * pockets. Samples are grid-clustered (6-connected flood fill over a bounded
 * grid across the target's largest span) so one physical trap produces one
 * pocket with a stable centroid -- not one recommendation per sampled
 * triangle.
 */
export function sealedAirPockets(castTarget: MasterCastTarget, upDirection: MasterMoldDirection): readonly AirPocket[] {
  const samples = sealedHighPocketSamples(castTarget, upDirection);
  if (samples.length === 0) return [];
  const span = {
    x: castTarget.bounds.max.x - castTarget.bounds.min.x,
    y: castTarget.bounds.max.y - castTarget.bounds.min.y,
    z: castTarget.bounds.max.z - castTarget.bounds.min.z,
  };
  const maxSpan = Math.max(span.x, span.y, span.z);
  const cellMm = Math.max(1e-3, maxSpan / POUR_FACE_GEOMETRY_LIMITS.pocketGridDivisions);
  const cellOf = (point: { readonly x: number; readonly y: number; readonly z: number }) => ({
    x: Math.min(POUR_FACE_GEOMETRY_LIMITS.pocketGridDivisions - 1, Math.max(0, Math.floor((point.x - castTarget.bounds.min.x) / cellMm))),
    y: Math.min(POUR_FACE_GEOMETRY_LIMITS.pocketGridDivisions - 1, Math.max(0, Math.floor((point.y - castTarget.bounds.min.y) / cellMm))),
    z: Math.min(POUR_FACE_GEOMETRY_LIMITS.pocketGridDivisions - 1, Math.max(0, Math.floor((point.z - castTarget.bounds.min.z) / cellMm))),
  });
  type ClusterCell = { count: number; sumX: number; sumY: number; sumZ: number };
  const cells = new Map<string, ClusterCell>();
  for (const point of samples) {
    const cell = cellOf(point);
    const key = `${cell.x},${cell.y},${cell.z}`;
    const existing = cells.get(key) ?? { count: 0, sumX: 0, sumY: 0, sumZ: 0 };
    existing.count += 1;
    existing.sumX += point.x;
    existing.sumY += point.y;
    existing.sumZ += point.z;
    cells.set(key, existing);
  }
  // Flood fill over occupied cells. Samples are sparse triangle centroids,
  // so adjacency is 26-connected: a one-cell diagonal gap inside one
  // physical cavity must not split it into two pockets.
  const visited = new Set<string>();
  const pockets: AirPocket[] = [];
  for (const [key, cell] of cells) {
    if (visited.has(key)) continue;
    const component: string[] = [];
    const queue = [key];
    visited.add(key);
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      const parts = current.split(",");
      const cx = Number(parts[0]);
      const cy = Number(parts[1]);
      const cz = Number(parts[2]);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const nextKey = `${cx + dx},${cy + dy},${cz + dz}`;
            if (cells.has(nextKey) && !visited.has(nextKey)) {
              visited.add(nextKey);
              queue.push(nextKey);
            }
          }
        }
      }
    }
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const memberKey of component) {
      const member = cells.get(memberKey)!;
      count += member.count;
      sumX += member.sumX;
      sumY += member.sumY;
      sumZ += member.sumZ;
      const parts = memberKey.split(",");
      const mx = Number(parts[0]);
      const my = Number(parts[1]);
      const mz = Number(parts[2]);
      minX = Math.min(minX, castTarget.bounds.min.x + mx * cellMm);
      minY = Math.min(minY, castTarget.bounds.min.y + my * cellMm);
      minZ = Math.min(minZ, castTarget.bounds.min.z + mz * cellMm);
      maxX = Math.max(maxX, castTarget.bounds.min.x + (mx + 1) * cellMm);
      maxY = Math.max(maxY, castTarget.bounds.min.y + (my + 1) * cellMm);
      maxZ = Math.max(maxZ, castTarget.bounds.min.z + (mz + 1) * cellMm);
    }
    void cell;
    pockets.push({
      centroid: { x: sumX / count, y: sumY / count, z: sumZ / count },
      sampleCount: count,
      bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    });
  }
  // Deterministic pocket order: by descending sample count, then centroid.
  pockets.sort((a, b) =>
    b.sampleCount - a.sampleCount ||
    a.centroid.x - b.centroid.x ||
    a.centroid.y - b.centroid.y ||
    a.centroid.z - b.centroid.z,
  );
  return pockets;
}

export function planPourFace(input: PourFacePlanInput): MasterPourFaceDecision {
  const { castTarget, negativeToolBounds, geometryToleranceMm, userOverride } = input;
  const geometryExposure = planarFaceExposureByDirection(castTarget);
  const candidates: MasterPourFaceCandidate[] = [];

  for (const direction of candidateDirections(castTarget, userOverride)) {
    const axis = axisOf(direction);
    const castingDepthMm = castTarget.bounds.max[axis] - castTarget.bounds.min[axis];
    const exposedOpeningAreaMm2 = faceAreaOfBounds(castTarget.bounds, direction);
    const rejection: string | null =
      !Number.isFinite(exposedOpeningAreaMm2) || exposedOpeningAreaMm2 <= 0
        ? "no_exposed_opening"
        : exposedOpeningAreaMm2 < MINIMUM_OPENING_AREA_MM2
          ? "opening_too_small"
          : negativeReachesFace(negativeToolBounds, castTarget.bounds, direction, geometryToleranceMm)
            ? "cuts_functional_cavity_geometry"
            : castingDepthMm <= geometryToleranceMm
              ? "zero_case_wall"
              : null;

    const valid = rejection === null;
    let score: number;
    if (valid) {
      const faceTopGap = isPositive(direction)
        ? castTarget.bounds.max[axis] - negativeToolBounds.max[axis]
        : negativeToolBounds.min[axis] - castTarget.bounds.min[axis];
      const interferencePenalty = faceTopGap < geometryToleranceMm * 2 ? POUR_FACE_WEIGHTS.functionalInterference : 0;
      // A measured planar pour face is worth more than a curved envelope
      // cross-section: prefer directions the mesh actually backs with a
      // flat opening (Execution 07 LOOP 07).
      const openingAreaMm2 = Math.max(geometryExposure[direction], exposedOpeningAreaMm2 * 0.5);
      score =
        POUR_FACE_WEIGHTS.openingArea * -openingAreaMm2 +
        POUR_FACE_WEIGHTS.castingDepth * castingDepthMm +
        POUR_FACE_WEIGHTS.supportHeight * castingDepthMm +
        interferencePenalty +
        (direction === userOverride ? -POUR_FACE_WEIGHTS.userOverrideBonus : 0);
    } else {
      score = Number.POSITIVE_INFINITY;
    }

    const source: MasterPourFaceCandidate["source"] =
      direction === userOverride ? "user-override" : geometryExposure[direction] > 0 ? "planar-face-normal" : "semantic-axis";
    candidates.push({ direction, source, exposedOpeningAreaMm2, castingDepthMm, valid, rejectionReason: rejection, score });
  }

  // Mutable working copies for post-analysis penalties; frozen into the
  // readonly decision below.
  const working = candidates.map((candidate) => ({ ...candidate }));
  const validWorking = working.filter((candidate) => candidate.valid);

  const fillabilityWarnings: string[] = [];
  const airPocketsByDirection = new Map<MasterMoldDirection, readonly AirPocket[]>();
  for (const candidate of validWorking) {
    // Execution 07 LOOP 07: samples are grouped into actual air pockets;
    // scoring, warnings, and recommendations are per pocket.
    const pockets = sealedAirPockets(castTarget, candidate.direction);
    airPocketsByDirection.set(candidate.direction, pockets);
    if (pockets.length > 0) {
      candidate.score += POUR_FACE_WEIGHTS.trappedAirPocket * pockets.length;
      fillabilityWarnings.push(
        `Pour face ${candidate.direction}: ${pockets.length} sealed high pocket${pockets.length === 1 ? "" : "s"} detected in casting orientation. A mesh-verified vent path is generated automatically when one exists; otherwise the pocket requires user-managed venting.`,
      );
    }
  }

  validWorking.sort((a, b) => a.score - b.score || a.direction.localeCompare(b.direction));
  const best = validWorking[0] ?? null;
  const selected = best?.direction ?? null;
  const selectedAirPockets = selected === null ? [] : airPocketsByDirection.get(selected) ?? [];
  const scoreByDirection = new Map(working.map((candidate) => [candidate.direction, candidate.score] as const));
  return {
    selected,
    castingOrientation: selected,
    score: best?.score ?? Number.POSITIVE_INFINITY,
    candidates: working.map((candidate) => ({ ...candidate, score: scoreByDirection.get(candidate.direction)! })),
    fillabilityWarnings,
    ventPlan: {
      status: selectedAirPockets.length > 0 ? "user-review" : "clear",
      features: [],
      unresolvedRecommendations: selectedAirPockets.map((pocket, index) => ({
        recommendationId: `vent-review-${castTarget.moldPartId}-${selected ?? "unselected"}-${index + 1}`,
        kind: "vent_required_user_review" as const,
        target: "cast-target" as const,
        pocketIndex: index + 1,
        pocketPosition: pocket.centroid,
        message: `Sealed high pocket ${index + 1} (${pocket.sampleCount} sample${pocket.sampleCount === 1 ? "" : "s"}) requires a vent path: generated automatically when a mesh-verified route exists, otherwise user review.`,
      })),
    },
  };
}
