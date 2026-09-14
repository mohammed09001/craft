import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import { hashStableValues, meshGeometryVersion } from "../../geometry/geometryFingerprint";
import type {
  MasterCommittedMoldPart,
  MasterFeatureIntentIdentity,
  MasterMoldProjectSnapshot,
} from "./contracts";

/**
 * Execution 05 Articles 06/13: pure, dependency-light cast-target identity
 * helpers. Deliberately separate from `castTarget.ts` (whose Boolean
 * pipeline pulls the manifold-3d WASM loader) so eagerly-loaded consumers
 * -- the Master Mold store and toolbar action -- never drag geometry-kernel
 * weight into the app's eager bundle.
 */

/** Master-specific release clearance between the cast target's part-negative surface and the original part. Deliberately NOT Cavity's clearance policy (Execution 05 Article 10). */
export const MASTER_CAST_TARGET_CLEARANCE_MM = 0;

export function featureIntentIdentityOf(snapshot: MasterMoldProjectSnapshot): MasterFeatureIntentIdentity {
  const sprueIntentVersion =
    snapshot.sprueIntents.length === 0
      ? null
      : hashStableValues(
          [...snapshot.sprueIntents]
            .sort((a, b) => a.creationOrder - b.creationOrder)
            .map((intent) => ({ operationId: intent.operationId, position: intent.position, profileDesign: intent.profileDesign })),
        );
  const registrationPolicyVersion = snapshot.registrationPolicy === null
    ? null
    : hashStableValues(snapshot.registrationPolicy);
  return { sprueIntentVersion, registrationPolicyVersion };
}

/**
 * Master-owned cast-target geometry identity (Execution 05 Article 06
 * "Independent Geometry Identity"): neutral fingerprint over the produced
 * cast-target geometry plus the Master input provenance that produced it.
 * Never a Cavity-named signature.
 */
export function masterCastTargetGeometryVersion(input: {
  readonly moldPartId: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly stockGeometryVersion: string;
  readonly sourcePartGeometryVersion: string;
  readonly featureIntents: MasterFeatureIntentIdentity;
  readonly processProfileId: string;
  readonly clearanceMm: number;
}): string {
  const meshVersion = meshGeometryVersion({ id: input.moldPartId, mesh: input.mesh, bounds: input.bounds });
  const provenance = hashStableValues({
    meshVersion,
    stockGeometryVersion: input.stockGeometryVersion,
    sourcePartGeometryVersion: input.sourcePartGeometryVersion,
    featureIntents: input.featureIntents,
    processProfileId: input.processProfileId,
    clearanceMm: input.clearanceMm,
  });
  return `master-cast-target:${provenance}`;
}

/**
 * Input-only cast-target identity (Article 13): provable WITHOUT any
 * Boolean work. Equal input versions mean the pipeline would deterministically
 * produce an identical cast target, so a generation run may reuse a prior
 * tooling set for this part instead of recomputing it.
 */
export function castTargetInputVersion(
  snapshot: MasterMoldProjectSnapshot,
  moldPart: MasterCommittedMoldPart,
  featureIntents: MasterFeatureIntentIdentity = featureIntentIdentityOf(snapshot),
): string {
  const clearanceMm = snapshot.processProfile.releaseClearanceMm ?? MASTER_CAST_TARGET_CLEARANCE_MM;
  return hashStableValues({
    stockGeometryVersion: moldPart.geometryVersion,
    sourcePartGeometryVersion: snapshot.sourcePartMesh.geometryVersion,
    featureIntents,
    processProfileId: snapshot.processProfile.profileId,
    clearanceMm,
  });
}
