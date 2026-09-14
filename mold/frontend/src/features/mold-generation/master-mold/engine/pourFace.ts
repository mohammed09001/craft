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
 * fillability analysis detects obvious sealed high pockets without ever
 * inventing vent holes.
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

/** Deterministic candidate directions: user override first, then planar face-normal-aligned axes, then all semantic axes. */
export function candidateDirections(castTarget: MasterCastTarget, userOverride: MasterMoldDirection | null): MasterMoldDirection[] {
  const ordered: MasterMoldDirection[] = [];
  if (userOverride !== null) ordered.push(userOverride);
  // Planar-face-normal candidates and semantic axes coincide in the current
  // deterministic set; the axes remain the bounded deterministic baseline and
  // the candidate structure keeps future free-form normals open (Article 07
  // "Candidate Sources"). Order by descending exposed face area for
  // determinism beyond the override.
  const byFaceArea = [...MASTER_MOLD_DIRECTIONS].sort(
    (a, b) => faceAreaOfBounds(castTarget.bounds, b) - faceAreaOfBounds(castTarget.bounds, a),
  );
  for (const direction of byFaceArea) {
    if (!ordered.includes(direction)) ordered.push(direction);
  }
  return ordered;
}

/**
 * Detects obvious sealed high pockets relative to gravity: downward-facing
 * cast-target surfaces (excluding the seating face) that (a) have
 * cast-target material directly above them along the casting-up direction
 * AND (b) have no horizontal escape path out of the target's own footprint.
 * Bounded deterministic sampling; produces a structured warning (never an
 * invented vent hole).
 */
export function detectSealedHighPockets(castTarget: MasterCastTarget, upDirection: MasterMoldDirection): number {
  const [ux, uy, uz] = DIRECTION_VECTORS[upDirection];
  const up = new Vector3(ux, uy, uz);
  const horizontal: Vector3[] = uz !== 0
    ? [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0)]
    : [up.clone(), up.clone().negate(), new Vector3(ux, uy, uz).cross(new Vector3(0, 0, 1)), new Vector3(ux, uy, uz).cross(new Vector3(0, 0, -1))];
  const axis = uz !== 0 ? "z" : uy !== 0 ? "y" : "x";
  const seatingPlane = isPositive(upDirection) ? castTarget.bounds.min[axis] : castTarget.bounds.max[axis];

  let sealedSamples = 0;
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
      // (a) material directly above?
      const probe = centroid.clone().addScaledVector(normal, 1e-3).addScaledVector(up, 1e-3);
      if (countUniqueForwardIntersections(bvh, probe, up) < 2) continue;
      // (b) any horizontal escape path (no further target crossing)?
      const escaped = horizontal.some((direction) => countUniqueForwardIntersections(bvh, probe.clone(), direction) === 0);
      if (!escaped) sealedSamples += 1;
    }
  } finally {
    geometry?.dispose();
  }

  return sealedSamples;
}

export function planPourFace(input: PourFacePlanInput): MasterPourFaceDecision {
  const { castTarget, negativeToolBounds, geometryToleranceMm, userOverride } = input;
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
      score =
        POUR_FACE_WEIGHTS.openingArea * -exposedOpeningAreaMm2 +
        POUR_FACE_WEIGHTS.castingDepth * castingDepthMm +
        POUR_FACE_WEIGHTS.supportHeight * castingDepthMm +
        interferencePenalty +
        (direction === userOverride ? -POUR_FACE_WEIGHTS.userOverrideBonus : 0);
    } else {
      score = Number.POSITIVE_INFINITY;
    }

    candidates.push({ direction, source: direction === userOverride ? "user-override" : "semantic-axis", exposedOpeningAreaMm2, castingDepthMm, valid, rejectionReason: rejection, score });
  }

  // Mutable working copies for post-analysis penalties; frozen into the
  // readonly decision below.
  const working = candidates.map((candidate) => ({ ...candidate }));
  const validWorking = working.filter((candidate) => candidate.valid);

  const fillabilityWarnings: string[] = [];
  for (const candidate of validWorking) {
    const sealedPockets = detectSealedHighPockets(castTarget, candidate.direction);
    if (sealedPockets > 0) {
      candidate.score += POUR_FACE_WEIGHTS.trappedAirPocket * sealedPockets;
      fillabilityWarnings.push(
        `Pour face ${candidate.direction}: ${sealedPockets} sealed high pocket${sealedPockets === 1 ? "" : "s"} detected in casting orientation. Provide a user-managed vent; the engine will not drill vents through functional surfaces.`,
      );
    }
  }

  validWorking.sort((a, b) => a.score - b.score || a.direction.localeCompare(b.direction));
  const best = validWorking[0] ?? null;
  const selected = best?.direction ?? null;
  const scoreByDirection = new Map(working.map((candidate) => [candidate.direction, candidate.score] as const));
  return {
    selected,
    castingOrientation: selected,
    score: best?.score ?? Number.POSITIVE_INFINITY,
    candidates: working.map((candidate) => ({ ...candidate, score: scoreByDirection.get(candidate.direction)! })),
    fillabilityWarnings,
  };
}
