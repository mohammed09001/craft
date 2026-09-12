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
import { buildMasterMoldSourceFingerprint } from "./masterMold.fingerprint";
import {
  MASTER_MOLD_DIRECTIONS,
  MIN_MASTER_MOLD_BOTTOM_MM,
  MIN_MASTER_MOLD_WALL_MM,
  type MasterMoldBodyResult,
  type MasterMoldDirection,
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
  direction: MasterMoldDirection | null = null,
): MasterMoldBodyResult {
  return {
    source: target.source,
    status: "blocked",
    direction,
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

/**
 * Article 05: generate one printable, watertight, single-open-face Master
 * Mold for one committed final-mold target, reusing the same Manifold
 * infrastructure (module, mesh conversion, tolerance policy, fragment
 * classification, topology check) the cavity pipeline already validates
 * with -- no second Boolean engine, no manual mesh surgery.
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

  const directionAnalysis = analyzeMasterMoldOpenDirection(target.mesh, target.bounds, {
    wallThicknessMm: parameters.wallThicknessMm,
    bottomThicknessMm: parameters.bottomThicknessMm,
    geometryToleranceMm: parameters.geometryToleranceMm,
  });

  const candidate = directionOverride === null
    ? (directionAnalysis.selected === null ? null : directionAnalysis.candidates.find((c) => c.direction === directionAnalysis.selected) ?? null)
    : directionAnalysis.candidates.find((c) => c.direction === directionOverride) ?? null;

  if (candidate === null || !candidate.valid) {
    return blocked(
      target,
      parameters,
      directionOverride,
      "no_valid_open_direction",
      `${target.source.finalMoldPartName}: no one-piece open-face Master Mold is feasible${directionOverride === null ? "" : ` for the requested ${directionOverride} direction`}.`,
      directionAnalysis,
    );
  }

  const direction = candidate.direction;
  const stockBounds = masterStockBoundsFor(target.bounds, direction, parameters.wallThicknessMm, parameters.bottomThicknessMm);
  const tolerancePolicy = buildCavityGeometryTolerancePolicy(stockBounds, 0);
  const openFaceExtensionMm = tolerancePolicy.surfaceToleranceMm * OPEN_FACE_EXTENSION_SAFETY_FACTOR;

  const module = await getManifoldModule();
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
      return blocked(target, parameters, directionOverride, "boolean_failed", `${target.source.finalMoldPartName}: Master Mold Boolean subtraction failed.`, directionAnalysis, direction);
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
      return blocked(target, parameters, directionOverride, "master_stock_invalid", `${target.source.finalMoldPartName}: Master Mold volume is invalid or its open face may have been unexpectedly sealed.`, directionAnalysis, direction);
    }

    const components = resultSolid.decompose();

    try {
      const volumes = components.map((component) => component.volume());
      const classification = classifyFragmentVolumes(volumes, tolerancePolicy.minimumFragmentVolumeMm3);

      if (classification.meaningfulVolumes.length === 0) {
        return blocked(target, parameters, directionOverride, "master_stock_invalid", `${target.source.finalMoldPartName}: Master Mold has no meaningful material after subtraction.`, directionAnalysis, direction);
      }

      if (classification.meaningfulVolumes.length > 1) {
        return blocked(target, parameters, directionOverride, "detached_fragment", `${target.source.finalMoldPartName}: Master Mold separated into ${classification.meaningfulVolumes.length} disconnected pieces.`, directionAnalysis, direction);
      }

      const mesh = payloadFromManifold(resultSolid);
      const meshTopology = topology(mesh);

      if (meshTopology.openEdgeCount > 0 || meshTopology.nonManifoldEdgeCount > 0) {
        return blocked(target, parameters, directionOverride, "non_manifold_result", `${target.source.finalMoldPartName}: Master Mold result is not a closed manifold.`, directionAnalysis, direction);
      }

      if (!mesh.positions.every(Number.isFinite)) {
        return blocked(target, parameters, directionOverride, "master_stock_invalid", `${target.source.finalMoldPartName}: Master Mold result contains non-finite geometry.`, directionAnalysis, direction);
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
        return blocked(target, parameters, directionOverride, "master_stock_invalid", `${target.source.finalMoldPartName}: could not locate a point inside the target to verify casting access.`, directionAnalysis, direction);
      }

      const access = validateOpenFaceAccess(mesh, interiorProbe);

      if (!access.openDirections.includes(direction)) {
        return blocked(target, parameters, directionOverride, "open_face_inaccessible", `${target.source.finalMoldPartName}: the casting cavity is not reachable through the ${direction} opening.`, directionAnalysis, direction);
      }

      if (access.openDirections.length > 1) {
        return blocked(
          target,
          parameters,
          directionOverride,
          "multiple_open_faces",
          `${target.source.finalMoldPartName}: Master Mold has ${access.openDirections.length} exterior openings (${access.openDirections.join(", ")}); exactly one is required.`,
          directionAnalysis,
          direction,
        );
      }

      return {
        source: target.source,
        status: "current",
        direction,
        directionAnalysis,
        mesh,
        bounds: boundsFromManifold(resultSolid),
        volumeMm3: resultVolume,
        triangleCount: mesh.indices.length / 3,
        watertight: true,
        manifold: true,
        failureReason: null,
        failureMessage: null,
        fingerprint: buildMasterMoldSourceFingerprint(target.source.finalMoldGeometryVersion, parameters, directionOverride),
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
