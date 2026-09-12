import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import {
  boundsFromManifold,
  createBlankSolid,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
} from "../cavity-generation/manifold.engine";
import { classifyFragmentVolumes, topology } from "../cavity-generation/cavityBody.generator";
import { buildCavityGeometryTolerancePolicy } from "../cavity-generation/cavityGeometryTolerance.policy";
import { buildGeometry, classifyPointInside, countUniqueForwardIntersections } from "../cavity-generation/cavitySignedDistance.bvh";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import { axisOf, analyzeMasterMoldOpenDirection, DIRECTION_VECTORS, isPositive, masterStockBoundsFor } from "./masterMoldDirection.analyzer";
import { verifyDemoldTranslation } from "./masterMoldDemold.verifier";
import { buildMasterMoldSourceFingerprint } from "./masterMold.fingerprint";
import {
  MASTER_MOLD_DIRECTIONS,
  MIN_MASTER_MOLD_BOTTOM_MM,
  MIN_MASTER_MOLD_WALL_MM,
  type MasterMoldBodyResult,
  type MasterMoldDirection,
  type MasterMoldDirectionAnalysis,
  type MasterMoldDirectionCandidate,
  type MasterMoldFailureReason,
  type MasterMoldParameters,
  type MasterMoldTargetInput,
} from "./masterMold.contracts";

function blocked(
  target: MasterMoldTargetInput,
  parameters: MasterMoldParameters,
  directionOverride: MasterMoldDirection | null,
  failureReason: MasterMoldFailureReason,
  failureMessage: string,
  directionAnalysis: MasterMoldBodyResult["directionAnalysis"] = { candidates: [], selected: null, feasible: false },
): MasterMoldBodyResult {
  return {
    source: target.source,
    status: "blocked",
    direction: null,
    directionAnalysis,
    mesh: null,
    bounds: null,
    volumeMm3: null,
    triangleCount: null,
    watertight: false,
    manifold: false,
    failureReason,
    failureMessage,
    fingerprint: buildMasterMoldSourceFingerprint(target.source.finalMoldGeometryVersion, parameters, directionOverride),
  };
}

function isFiniteMesh(mesh: MasterMoldTargetInput["mesh"]): boolean {
  return (
    mesh.positions.length > 0 &&
    mesh.indices.length > 0 &&
    mesh.positions.length % 3 === 0 &&
    mesh.indices.length % 3 === 0 &&
    mesh.positions.every(Number.isFinite) &&
    mesh.indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < mesh.positions.length / 3)
  );
}

/**
 * Article 02: dimensionless headroom on top of the tolerance policy's own
 * coplanar-surface tolerance. The target's open face sits exactly flush with
 * the Master Stock boundary by construction (`masterStockBoundsFor`) -- an
 * exact-coincidence Boolean subtraction is an ill-conditioned degenerate case
 * for the Manifold kernel, regardless of floating-point precision, so the
 * extension only needs to be safely larger than that coincidence band, not
 * large relative to the part itself.
 */
const OPEN_FACE_EXTENSION_SAFETY_FACTOR = 8;

/** Article 02: the precise demold sweep samples out to the candidate's required stock depth plus this margin, so the target is proven fully clear of tool material, not merely past its own footprint. */
const DEMOLD_CLEARANCE_SAFETY_FACTOR = 1.1;

/** Bounds of a box spanning the target's own footprint, from its open face outward past the (flush) Master Stock boundary by `extensionMm` -- Article 02's "extend through chosen open plane" construction. */
function openFaceExtensionBoxBounds(bounds: Bounds3, direction: MasterMoldDirection, extensionMm: number): Bounds3 {
  const axis = axisOf(direction);
  const min = { ...bounds.min };
  const max = { ...bounds.max };

  if (isPositive(direction)) {
    min[axis] = bounds.max[axis];
    max[axis] = bounds.max[axis] + extensionMm;
  } else {
    max[axis] = bounds.min[axis];
    min[axis] = bounds.min[axis] - extensionMm;
  }

  return { min, max };
}

/**
 * A point guaranteed to sit inside the target's own solid volume (i.e. inside
 * the cavity void once subtracted from the Master Stock), used as the origin
 * for Article 02's open-access raycast. The target's own bounds center is
 * tried first (correct for the common convex-ish case); otherwise falls back
 * to a small inward offset from a surface triangle's centroid along its
 * inward normal, which is inside any non-degenerate closed manifold.
 */
export function findInteriorProbePoint(bvh: MeshBVH, mesh: MoldMeshPayload, bounds: Bounds3): Vector3 | null {
  const center = new Vector3((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2);
  if (classifyPointInside(bvh, center)) return center;

  const diagonal = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const inwardStep = Math.max(diagonal * 1e-4, 1e-6);

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
  const probe = new Vector3();

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
    centroid.set((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    probe.copy(centroid).addScaledVector(normal, -inwardStep);

    if (classifyPointInside(bvh, probe)) return probe.clone();
  }

  return null;
}

export interface OpenFaceAccessValidation {
  readonly openDirections: readonly MasterMoldDirection[];
}

/**
 * Article 02: proves the intended cavity is actually connected to the
 * exterior through the selected opening (not merely that the result is
 * watertight) by raycasting from a point known to sit in the cavity void
 * outward along each of the six orthogonal directions and counting how many
 * times it crosses the Master Mold shell. A direction with zero crossings is
 * a genuine unobstructed path to open air; the intended direction must be
 * the only one.
 */
export function validateOpenFaceAccess(resultMesh: MoldMeshPayload, interiorProbe: Vector3): OpenFaceAccessValidation {
  const geometry = buildGeometry(resultMesh);
  const bvh = new MeshBVH(geometry);

  try {
    const openDirections = MASTER_MOLD_DIRECTIONS.filter((direction) => {
      const [dx, dy, dz] = DIRECTION_VECTORS[direction];
      return countUniqueForwardIntersections(bvh, interiorProbe, new Vector3(dx, dy, dz)) === 0;
    });

    return { openDirections };
  } finally {
    geometry.dispose();
  }
}

type DirectionAttemptOutcome =
  | { readonly kind: "success"; readonly mesh: MoldMeshPayload; readonly bounds: Bounds3; readonly volumeMm3: number }
  | { readonly kind: "failure"; readonly failureReason: MasterMoldFailureReason; readonly failureMessage: string };

/**
 * Article 02/03: build the actual candidate Master Mold tool for one
 * direction and precisely verify it -- watertight/manifold/single-opening as
 * before, plus (new) a real translation collision sweep of the actual target
 * against the actual generated tool. The direction ultimately reported
 * `current` is always the one this function accepted, never a separate
 * heuristic guess (Article 03's required invariant).
 */
async function attemptDirection(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  target: MasterMoldTargetInput,
  parameters: MasterMoldParameters,
  direction: MasterMoldDirection,
  requiredDepthMm: number,
): Promise<DirectionAttemptOutcome> {
  const name = target.source.finalMoldPartName;
  const fail = (failureReason: MasterMoldFailureReason, failureMessage: string): DirectionAttemptOutcome => ({
    kind: "failure",
    failureReason,
    failureMessage,
  });

  const stockBounds = masterStockBoundsFor(target.bounds, direction, parameters.wallThicknessMm, parameters.bottomThicknessMm);
  const tolerancePolicy = buildCavityGeometryTolerancePolicy(stockBounds, 0);
  const openFaceExtensionMm = tolerancePolicy.surfaceToleranceMm * OPEN_FACE_EXTENSION_SAFETY_FACTOR;

  const targetSolid = manifoldFromPayload(module, target.mesh, tolerancePolicy.booleanToleranceMm);
  const stockSolid = createBlankSolid(module, stockBounds);
  const extensionSolid = createBlankSolid(module, openFaceExtensionBoxBounds(target.bounds, direction, openFaceExtensionMm));
  let extendedTargetSolid: ReturnType<typeof targetSolid.add> | null = null;
  let resultSolid: ReturnType<typeof stockSolid.subtract> | null = null;
  let intersectionSolid: ReturnType<typeof stockSolid.intersect> | null = null;

  try {
    // Article 02: never rely on exact coplanar coincidence between the
    // target and the Master Stock at the open face -- extend the target
    // through that plane by a tolerance-safe distance first, so the
    // subtraction unambiguously breaches the stock's boundary there instead
    // of leaving an ill-conditioned zero-thickness coincidence for the
    // Boolean kernel to resolve arbitrarily.
    extendedTargetSolid = targetSolid.add(extensionSolid);
    resultSolid = stockSolid.subtract(extendedTargetSolid);

    if (resultSolid.status() !== "NoError" || resultSolid.isEmpty()) {
      return fail("boolean_failed", `${name}: Master Mold Boolean subtraction failed.`);
    }

    // Expected volume is derived independently of resultSolid (via an
    // intersection, not the subtraction under test) so this remains a real
    // sanity check; it uses the extended target's volume actually inside the
    // stock, since the extension itself removes a (tolerance-scale) sliver
    // beyond the target's own volume by design.
    intersectionSolid = stockSolid.intersect(extendedTargetSolid);
    const resultVolume = resultSolid.volume();
    const expectedVolume = stockSolid.volume() - intersectionSolid.volume();
    const volumeTolerance = Math.max(tolerancePolicy.volumeToleranceMm3, expectedVolume * 1e-6);

    if (!Number.isFinite(resultVolume) || resultVolume <= tolerancePolicy.volumeToleranceMm3 || Math.abs(resultVolume - expectedVolume) > volumeTolerance) {
      return fail("master_stock_invalid", `${name}: Master Mold volume is invalid or its open face may have been unexpectedly sealed.`);
    }

    const components = resultSolid.decompose();

    try {
      const volumes = components.map((component) => component.volume());
      const classification = classifyFragmentVolumes(volumes, tolerancePolicy.minimumFragmentVolumeMm3);

      if (classification.meaningfulVolumes.length === 0) {
        return fail("master_stock_invalid", `${name}: Master Mold has no meaningful material after subtraction.`);
      }

      if (classification.meaningfulVolumes.length > 1) {
        return fail("detached_fragment", `${name}: Master Mold separated into ${classification.meaningfulVolumes.length} disconnected pieces.`);
      }

      const mesh = payloadFromManifold(resultSolid);
      const meshTopology = topology(mesh);

      if (meshTopology.openEdgeCount > 0 || meshTopology.nonManifoldEdgeCount > 0) {
        return fail("non_manifold_result", `${name}: Master Mold result is not a closed manifold.`);
      }

      if (!mesh.positions.every(Number.isFinite)) {
        return fail("master_stock_invalid", `${name}: Master Mold result contains non-finite geometry.`);
      }

      // Article 02: watertight + manifold is not sufficient proof of a real
      // casting opening -- prove the cavity is actually reachable from the
      // exterior through the intended face, and that no unintended second
      // opening exists, before ever reporting "current".
      const targetGeometry = buildGeometry(target.mesh);
      let interiorProbe: Vector3 | null;
      try {
        interiorProbe = findInteriorProbePoint(new MeshBVH(targetGeometry), target.mesh, target.bounds);
      } finally {
        targetGeometry.dispose();
      }

      if (interiorProbe === null) {
        return fail("master_stock_invalid", `${name}: could not locate a point inside the target to verify casting access.`);
      }

      const access = validateOpenFaceAccess(mesh, interiorProbe);

      if (!access.openDirections.includes(direction)) {
        return fail("open_face_inaccessible", `${name}: the casting cavity is not reachable through the ${direction} opening.`);
      }

      if (access.openDirections.length > 1) {
        return fail(
          "multiple_open_faces",
          `${name}: Master Mold has ${access.openDirections.length} exterior openings (${access.openDirections.join(", ")}); exactly one is required.`,
        );
      }

      // Article 02/03: the physical decision -- can the actual target
      // translate out of this actual generated tool along `direction`
      // without penetrating tool material beyond tolerance? This, not the
      // broad-phase bounds check above, is the final authority on
      // demoldability.
      const clearanceMm = requiredDepthMm * DEMOLD_CLEARANCE_SAFETY_FACTOR;
      // `minimumFragmentVolumeMm3`, not `volumeToleranceMm3` -- the latter is
      // `linearToleranceMm**3`, orders of magnitude below the floating-point
      // noise floor a real Boolean intersection carries at this scale (a
      // genuinely non-colliding sample can still read as a ~1e-13 mm3
      // residual), which would flag every direction as colliding. The
      // "smallest volume that counts as a real fragment" scale-aware
      // threshold the rest of the pipeline already uses for the same
      // "is this actually material or just numerical noise" question.
      const demold = verifyDemoldTranslation(
        resultSolid,
        targetSolid,
        direction,
        clearanceMm,
        tolerancePolicy.surfaceToleranceMm,
        tolerancePolicy.minimumFragmentVolumeMm3,
      );

      if (!demold.removable) {
        const atMm = demold.firstCollisionDistanceMm !== null ? demold.firstCollisionDistanceMm.toFixed(3) : "?";
        return fail(
          "no_valid_open_direction",
          `${name}: the target collides with Master Mold material ${atMm} mm into the ${direction} pull -- no one-piece open-face Master Mold is feasible along this direction.`,
        );
      }

      return {
        kind: "success",
        mesh,
        bounds: boundsFromManifold(resultSolid),
        volumeMm3: resultVolume,
      };
    } finally {
      components.forEach((component) => component.delete());
    }
  } finally {
    intersectionSolid?.delete();
    resultSolid?.delete();
    extendedTargetSolid?.delete();
    extensionSolid.delete();
    stockSolid.delete();
    targetSolid.delete();
  }
}

function buildFinalAnalysis(
  stageA: MasterMoldDirectionAnalysis,
  attempted: ReadonlyMap<MasterMoldDirection, MasterMoldDirectionCandidate>,
  selected: MasterMoldDirection | null,
): MasterMoldDirectionAnalysis {
  const candidates = stageA.candidates.map((candidate) => attempted.get(candidate.direction) ?? candidate);
  return { candidates, selected, feasible: selected !== null };
}

/**
 * Article 05: generate one printable, watertight, single-open-face Master
 * Mold for one committed final-mold target, reusing the same Manifold
 * infrastructure (module, mesh conversion, tolerance policy, fragment
 * classification, topology check) the cavity pipeline already validates
 * with -- no second Boolean engine, no manual mesh surgery.
 *
 * Article 02/03: direction selection and geometry generation are the same
 * pass -- every candidate direction is actually built and precisely
 * verified (Stage B) in best-first order (Stage A's bounds-only score), and
 * the first one that survives Boolean/topology/open-face/demold
 * verification is the one returned as `current`. There is no separate
 * heuristic-only decision that the generated geometry merely happens to
 * agree with.
 */
export async function generateMasterMoldBody(
  target: MasterMoldTargetInput,
  parameters: MasterMoldParameters,
): Promise<MasterMoldBodyResult> {
  const directionOverride = target.directionOverride ?? null;

  if (!isFiniteMesh(target.mesh)) {
    return blocked(target, parameters, directionOverride, "invalid_source_geometry", `${target.source.finalMoldPartName}: source geometry contains non-finite or malformed data.`);
  }

  if (parameters.wallThicknessMm < MIN_MASTER_MOLD_WALL_MM) {
    return blocked(target, parameters, directionOverride, "insufficient_wall_thickness", `Wall thickness must be at least ${MIN_MASTER_MOLD_WALL_MM} mm.`);
  }

  if (parameters.bottomThicknessMm < MIN_MASTER_MOLD_BOTTOM_MM) {
    return blocked(target, parameters, directionOverride, "insufficient_bottom_thickness", `Bottom thickness must be at least ${MIN_MASTER_MOLD_BOTTOM_MM} mm.`);
  }

  const stageA = analyzeMasterMoldOpenDirection(target.bounds, {
    wallThicknessMm: parameters.wallThicknessMm,
    bottomThicknessMm: parameters.bottomThicknessMm,
    geometryToleranceMm: parameters.geometryToleranceMm,
  });

  const stageAByDirection = new Map(stageA.candidates.map((candidate) => [candidate.direction, candidate]));

  const candidateOrder: MasterMoldDirection[] =
    directionOverride === null
      ? stageA.candidates
          .filter((candidate) => candidate.valid)
          .slice()
          .sort((a, b) => b.score - a.score)
          .map((candidate) => candidate.direction)
      : (stageAByDirection.get(directionOverride)?.valid ?? false)
        ? [directionOverride]
        : [];

  if (candidateOrder.length === 0) {
    return blocked(
      target,
      parameters,
      directionOverride,
      "no_valid_open_direction",
      `${target.source.finalMoldPartName}: no one-piece open-face Master Mold is feasible${directionOverride === null ? "" : ` for the requested ${directionOverride} direction`}.`,
      stageA,
    );
  }

  const module = await getManifoldModule();
  const attempted = new Map<MasterMoldDirection, MasterMoldDirectionCandidate>();
  let best: { readonly direction: MasterMoldDirection; readonly outcome: Extract<DirectionAttemptOutcome, { kind: "success" }> } | null = null;
  // Article 02 exit gate: "every final no_valid_open_direction result means
  // all allowed orthogonal candidates failed precise verification" -- every
  // bounds-valid candidate is actually attempted, never skipped once a
  // winner is found, so a body's directionAnalysis truthfully reports each
  // direction's own precisely-verified outcome (not just the winner's).
  let firstNonDemoldFailure: { readonly failureReason: MasterMoldFailureReason; readonly failureMessage: string } | null = null;
  let lastDemoldFailure: { readonly failureReason: MasterMoldFailureReason; readonly failureMessage: string } | null = null;

  for (const direction of candidateOrder) {
    const stageACandidate = stageAByDirection.get(direction)!;
    const outcome = await attemptDirection(module, target, parameters, direction, stageACandidate.requiredDepthMm);

    if (outcome.kind === "success") {
      attempted.set(direction, { ...stageACandidate, valid: true, reasonCode: "demold_path_verified" });
      if (best === null) best = { direction, outcome };
      continue;
    }

    attempted.set(direction, { ...stageACandidate, valid: false, reasonCode: outcome.failureReason });
    if (outcome.failureReason === "no_valid_open_direction") {
      lastDemoldFailure = outcome;
    } else if (firstNonDemoldFailure === null) {
      firstNonDemoldFailure = outcome;
    }
  }

  if (best !== null) {
    return {
      source: target.source,
      status: "current",
      direction: best.direction,
      directionAnalysis: buildFinalAnalysis(stageA, attempted, best.direction),
      mesh: best.outcome.mesh,
      bounds: best.outcome.bounds,
      volumeMm3: best.outcome.volumeMm3,
      triangleCount: best.outcome.mesh.indices.length / 3,
      watertight: true,
      manifold: true,
      failureReason: null,
      failureMessage: null,
      fingerprint: buildMasterMoldSourceFingerprint(target.source.finalMoldGeometryVersion, parameters, directionOverride),
    };
  }

  // A demold-collision failure means at least one candidate was actually
  // proven physically infeasible by the precise verifier -- that is a
  // decisive, meaningful answer and takes priority as the overall summary
  // even if an unrelated candidate also failed earlier (e.g. a direction
  // that was structurally never going to produce a single connected body,
  // independent of demoldability). Only when NO candidate ever reached the
  // demold check -- every one failed at an earlier Boolean/topology/access
  // stage -- does that earlier, more specific engineering defect become the
  // overall reason, since physical feasibility was never actually assessed
  // for any candidate in that case (Article 07).
  const failure = lastDemoldFailure ??
    firstNonDemoldFailure ?? {
      failureReason: "no_valid_open_direction" as const,
      failureMessage: `${target.source.finalMoldPartName}: no one-piece open-face Master Mold is feasible.`,
    };

  return blocked(target, parameters, directionOverride, failure.failureReason, failure.failureMessage, buildFinalAnalysis(stageA, attempted, null));
}
