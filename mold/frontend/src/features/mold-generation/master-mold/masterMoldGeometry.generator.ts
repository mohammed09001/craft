import {
  boundsFromManifold,
  createBlankSolid,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
} from "../cavity-generation/manifold.engine";
import { classifyFragmentVolumes, topology } from "../cavity-generation/cavityBody.generator";
import { buildCavityGeometryTolerancePolicy } from "../cavity-generation/cavityGeometryTolerance.policy";
import { analyzeMasterMoldOpenDirection, masterStockBoundsFor } from "./masterMoldDirection.analyzer";
import { buildMasterMoldSourceFingerprint } from "./masterMold.fingerprint";
import {
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

  const module = await getManifoldModule();
  const targetSolid = manifoldFromPayload(module, target.mesh, tolerancePolicy.booleanToleranceMm);
  const stockSolid = createBlankSolid(module, stockBounds);
  let resultSolid: ReturnType<typeof stockSolid.subtract> | null = null;

  try {
    resultSolid = stockSolid.subtract(targetSolid);

    if (resultSolid.status() !== "NoError" || resultSolid.isEmpty()) {
      return blocked(target, parameters, directionOverride, "boolean_failed", `${target.source.finalMoldPartName}: Master Mold Boolean subtraction failed.`, directionAnalysis, direction);
    }

    const resultVolume = resultSolid.volume();
    const expectedVolume = stockSolid.volume() - targetSolid.volume();
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
    resultSolid?.delete();
    stockSolid.delete();
    targetSolid.delete();
  }
}
