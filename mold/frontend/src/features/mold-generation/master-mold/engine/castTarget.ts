import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import {
  boundsFromManifold,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
} from "../../geometry/manifold";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { meshGeometryVersion } from "../../geometry/geometryFingerprint";
import { meshTopology } from "../../geometry/meshTopology";
import { SprueGenerationService, type SprueDefinition } from "../../sprue-generation";
import {
  buildRegistrationDependencySnapshot,
  generateDerivedRegistration,
  registrationSizingPolicyFor,
} from "../../registration";
import type {
  MasterCastTarget,
  MasterCommittedMoldPart,
  MasterMoldFailure,
  MasterMoldProjectSnapshot,
} from "./contracts";

/**
 * Execution 05 Article 06: Master Cast Target Builder.
 *
 * Inside the Master Mold Engine, constructs the exact physical Final Mold
 * Parts each tooling set must cast:
 *
 *   committed mold stock bodies
 *   + canonical original-part geometry (negative, cut by the engine itself
 *     with neutral Boolean primitives -- never by calling Cavity algorithms)
 *   + Final Mold Sprue intent geometry (via the shared Sprue intent domain)
 *   + Final Mold Registration geometry (via the shared Registration domain)
 *   → MasterCastTarget[]
 *
 * Mathematical similarity to Create Cavity's Boolean work creates no domain
 * ownership: every geometry primitive used here is neutral (Execution 05
 * Sections 3/6.2, Article 06 "Important Rule"). Cavity state, results, and
 * workers are neither read nor invoked.
 */

/** Sphere tessellation for the Master clearance offset solid (Minkowski sum). */
const MASTER_CLEARANCE_SPHERE_SEGMENTS = 16;

export interface CastTargetsBuildOutcome {
  readonly targets: readonly MasterCastTarget[];
  readonly failures: readonly MasterMoldFailure[];
}

function isFinitePayload(mesh: MoldMeshPayload): boolean {
  return (
    mesh.positions.length > 0 &&
    mesh.indices.length > 0 &&
    mesh.positions.every(Number.isFinite) &&
    mesh.indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < mesh.positions.length / 3)
  );
}

/** Applies the part's mold-frame placement to the canonical part mesh (mold-local coordinates, matching the committed stock bodies). */
export function partMeshInMoldFrame(
  sourcePartMesh: MasterMoldProjectSnapshot["sourcePartMesh"],
  moldPartOffset: MasterMoldProjectSnapshot["moldPartOffset"],
): MoldMeshPayload {
  return {
    positions: sourcePartMesh.positions.map((value, index) => {
      switch (index % 3) {
        case 0: return value + moldPartOffset.x;
        case 1: return value + moldPartOffset.y;
        default: return value + moldPartOffset.z;
      }
    }),
    indices: [...sourcePartMesh.indices],
  };
}

/**
 * Builds cast targets for the whole committed mold-part set. Sprue and
 * Registration are applied across the full set (features can span adjacent
 * parts), mirroring the physical casting operation, then each part becomes
 * one MasterCastTarget.
 */
export async function buildMasterCastTargets(
  snapshot: MasterMoldProjectSnapshot,
): Promise<CastTargetsBuildOutcome> {
  const failures: MasterMoldFailure[] = [];
  const partPayload = partMeshInMoldFrame(snapshot.sourcePartMesh, snapshot.moldPartOffset);

  if (!isFinitePayload(partPayload) || snapshot.committedMoldParts.length === 0) {
    return {
      targets: [],
      failures: [{
        moldPartId: snapshot.committedMoldParts[0]?.id ?? "unknown",
        reason: "invalid_source_geometry",
        message: "Canonical part geometry is non-finite or no committed mold parts exist.",
      }],
    };
  }
  for (const part of snapshot.committedMoldParts) {
    if (!isFinitePayload(part.mesh)) {
      return {
        targets: [],
        failures: [{ moldPartId: part.id, reason: "invalid_source_geometry", message: `${part.name}: committed mold part geometry is non-finite or malformed.` }],
      };
    }
  }

  const module = await getManifoldModule();
  const tolerancePolicy = buildGeometryTolerancePolicy(snapshot.referenceMoldBlockBounds, 0);
  const booleanTolerance = tolerancePolicy.booleanToleranceMm;
  const clearanceMm = snapshot.processProfile.releaseClearanceMm ?? MASTER_CAST_TARGET_CLEARANCE_MM;

  // Stage 1: stock − part(+Master clearance), per committed stock body, with
  // neutral Boolean primitives only.
  const partSolid = manifoldFromPayload(module, partPayload, booleanTolerance);
  let negativeTool = partSolid;
  const subtracted: { part: MasterCommittedMoldPart; solid: ReturnType<typeof partSolid.subtract>; mesh: MoldMeshPayload; bounds: Bounds3; volumeMm3: number }[] = [];

  try {
    if (clearanceMm > 0) {
      const sphere = module.Manifold.sphere(clearanceMm, MASTER_CLEARANCE_SPHERE_SEGMENTS);
      try {
        negativeTool = partSolid.minkowskiSum(sphere);
      } finally {
        sphere.delete();
      }
    }

    const negativeToolMesh = payloadFromManifold(negativeTool);

    for (const part of snapshot.committedMoldParts) {
      const stockSolid = manifoldFromPayload(module, part.mesh, booleanTolerance);
      let resultSolid: ReturnType<typeof stockSolid.subtract> | null = null;
      try {
        resultSolid = stockSolid.subtract(negativeTool);
        const status = resultSolid.status();
        if (status !== "NoError" || resultSolid.isEmpty()) {
          failures.push({ moldPartId: part.id, reason: "boolean_failed", message: `${part.name}: cast-target Boolean subtraction failed.` });
          continue;
        }
        const mesh = payloadFromManifold(resultSolid);
        const topology = meshTopology(mesh);
        if (topology.openEdgeCount > 0 || topology.nonManifoldEdgeCount > 0) {
          failures.push({ moldPartId: part.id, reason: "non_manifold_result", message: `${part.name}: cast target is not a closed manifold.` });
          continue;
        }
        const bounds = boundsFromManifold(resultSolid);
        const volumeMm3 = resultSolid.volume();
        if (!Number.isFinite(volumeMm3) || volumeMm3 <= tolerancePolicy.volumeToleranceMm3) {
          failures.push({ moldPartId: part.id, reason: "cast_target_invalid", message: `${part.name}: cast target has non-positive volume.` });
          continue;
        }
        subtracted.push({ part, solid: resultSolid, mesh, bounds, volumeMm3 });
      } finally {
        if (resultSolid !== null && !subtracted.some((entry) => entry.solid === resultSolid)) resultSolid.delete();
        stockSolid.delete();
      }
    }

    if (subtracted.length === 0) {
      return { targets: [], failures };
    }

    // Stage 2: Final Mold Sprue intent geometry (shared Sprue intent domain;
    // the negative-tool mesh is Master's own, never a Cavity result).
    let bodies: { part: MasterCommittedMoldPart; mesh: MoldMeshPayload; bounds: Bounds3; volumeMm3: number }[] =
      subtracted.map(({ part, mesh, bounds, volumeMm3 }) => ({ part, mesh, bounds, volumeMm3 }));
    const warnings: string[] = [];
    const resolvedSprues: SprueDefinition[] = [];

    if (snapshot.sprueIntents.length > 0) {
      const service = new SprueGenerationService();
      const sortedIntents = [...snapshot.sprueIntents].sort((a, b) => a.creationOrder - b.creationOrder);
      for (const intent of sortedIntents) {
        const result = await service.generate({
          request: {
            operationId: intent.operationId,
            position: intent.position,
            profileDesign: intent.profileDesign,
            moldRevision: `master-cast-target:${snapshot.snapshotId}`,
          },
          targetBodies: bodies.map(({ part, mesh, bounds, volumeMm3 }) => ({
            id: part.id,
            name: part.name,
            visible: true,
            bounds,
            triangleCount: mesh.indices.length / 3,
            volumeMm3,
            watertight: true,
            mesh,
            geometryVersion: meshGeometryVersion({ id: part.id, mesh, bounds }),
          })),
          cavity: negativeToolMesh,
          moldFrame: {
            frameId: `${snapshot.moldDefinitionId}:z-up`,
            units: "millimeters",
            origin: { x: 0, y: 0, z: 0 },
            xAxis: { x: 1, y: 0, z: 0 },
            yAxis: { x: 0, y: 1, z: 0 },
            zAxis: { x: 0, y: 0, z: 1 },
          },
          geometryToleranceMm: tolerancePolicy.booleanToleranceMm,
        });
        if (result.status === "failure") {
          warnings.push(`${intent.operationId}: ${result.message}`);
          continue;
        }
        resolvedSprues.push(result.sprue);
        bodies = bodies.map((body) => {
          const replacement = result.updatedBodies.find((updated) => updated.id === body.part.id);
          if (replacement === undefined) return body;
          return { ...body, mesh: replacement.mesh, bounds: replacement.bounds, volumeMm3: replacement.volumeMm3 };
        });
      }
    }

    // Stage 3: Final Mold Registration geometry (shared Registration domain;
    // protected regions include Master's own negative tool so features never
    // imprint on the product cavity surface).
    const registrationSnapshot = buildRegistrationDependencySnapshot({
      bodies: bodies.map(({ part, mesh, bounds, volumeMm3 }) => ({
        id: part.id,
        name: part.name,
        visible: true,
        bounds,
        triangleCount: mesh.indices.length / 3,
        volumeMm3,
        watertight: true,
        mesh,
        geometryVersion: meshGeometryVersion({ id: part.id, mesh, bounds }),
      })),
      definition: snapshot.moldDefinition,
      cuttingPlanes: snapshot.cuttingPlanes,
      cavityTool: {
        mesh: negativeToolMesh,
        bounds: boundsFromManifold(negativeTool),
        volumeMm3: negativeTool.volume(),
        triangleCount: negativeToolMesh.indices.length / 3,
        connectedComponentCount: 1,
        watertight: true,
        manifold: true,
        warnings: [],
        clearanceMm,
        // Structural union value shared with the registration snapshot's
        // CavityToolData contract; Master's tool is a Minkowski-style offset
        // of the part when clearance > 0, else the exact part solid.
        implementationMethod: clearanceMm > 0 ? "manifold-minkowski-sphere" : "exact-watertight-part-solid",
        qualityMode: "standard",
      },
      cavityRevision: `master-cast-negative:${snapshot.snapshotId}`,
      sprues: resolvedSprues,
      manufacturingProfile: null,
      ...registrationSizingPolicyFor(snapshot.moldDefinition),
    });
    const registration = await generateDerivedRegistration(registrationSnapshot);
    if (registration.status === "generated" && registration.bodies !== null) {
      bodies = bodies.map((body) => {
        const replacement = registration.bodies?.find((updated) => updated.id === body.part.id);
        if (replacement === undefined) return body;
        return { ...body, mesh: replacement.mesh, bounds: replacement.bounds, volumeMm3: replacement.volumeMm3 };
      });
    } else if (registration.report !== null && registration.report.reasonCode !== "registration_generated") {
      warnings.push(`registration: ${registration.report.message}`);
    }

    // Stage 4: per-part MasterCastTarget with Master-owned geometry identity.
    const featureIntents = featureIntentIdentityOf(snapshot);
    const targets: MasterCastTarget[] = bodies.map(({ part, mesh, bounds, volumeMm3 }) => ({
      moldPartId: part.id,
      moldPartName: part.name,
      mesh,
      bounds,
      volumeMm3,
      geometryVersion: masterCastTargetGeometryVersion({
        moldPartId: part.id,
        mesh,
        bounds,
        stockGeometryVersion: part.geometryVersion,
        sourcePartGeometryVersion: snapshot.sourcePartMesh.geometryVersion,
        featureIntents,
        processProfileId: snapshot.processProfile.profileId,
        clearanceMm,
      }),
      featureIntents,
      warnings: [...warnings],
    }));

    return { targets, failures };
  } finally {
    for (const entry of subtracted) entry.solid.delete();
    if (negativeTool !== partSolid) negativeTool.delete();
    partSolid.delete();
  }
}

// Execution 05 Articles 06/13: the identity helpers (featureIntentIdentityOf,
// masterCastTargetGeometryVersion, castTargetInputVersion,
// MASTER_CAST_TARGET_CLEARANCE_MM) live in the dependency-light
// `castTargetIdentity.ts` so eagerly-loaded consumers (store, toolbar) never
// drag the manifold-3d loader into the eager bundle. Re-exported here for
// the engine's internal use and existing import sites.
export {
  MASTER_CAST_TARGET_CLEARANCE_MM,
  castTargetInputVersion,
  featureIntentIdentityOf,
  masterCastTargetGeometryVersion,
} from "./castTargetIdentity";
import {
  MASTER_CAST_TARGET_CLEARANCE_MM,
  featureIntentIdentityOf,
  masterCastTargetGeometryVersion,
} from "./castTargetIdentity";
