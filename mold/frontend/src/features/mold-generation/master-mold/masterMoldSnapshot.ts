import type { CuttingPlaneRecord } from "../split-face/splitFace.contracts";
import type { ReferenceMoldDefinition } from "../reference-mold-definition";
import type { SprueOperationDefinition } from "../sprue-generation";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY } from "../registration/registrationSizing.policy";
import { hashStableValues, meshGeometryVersion } from "../geometry/geometryFingerprint";
import type { MasterCastingProcessProfile, MasterMoldProjectSnapshot, MasterSourcePartMesh } from "./engine/contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "./engine/contracts";

/**
 * Execution 05 Article 12: assembles the authoritative
 * `MasterMoldProjectSnapshot` from project truth at click time -- committed
 * mold stock, the canonical imported part, committed segmentation
 * provenance, Sprue/Registration intents, printer context, and the process
 * profile. Nothing here reads Create Cavity state, results, or workers
 * (Section 7.2).
 */
export interface MasterSnapshotInput {
  readonly sourcePartMesh: MasterSourcePartMesh;
  readonly definition: ReferenceMoldDefinition;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
  readonly sprueDefinitions: readonly SprueOperationDefinition[];
  readonly printerBuildVolume: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly processProfile?: MasterCastingProcessProfile;
  readonly projectRevision: number;
  readonly projectFingerprint: string;
}

export function buildMasterMoldProjectSnapshot(input: MasterSnapshotInput): MasterMoldProjectSnapshot {
  const definition = input.definition;
  const stockBodies = definition.moldBodies ?? [];
  const committedMoldParts = stockBodies.map((body) => ({
    id: body.id,
    name: body.name,
    mesh: body.mesh,
    bounds: body.bounds,
    volumeMm3: body.volumeMm3,
    geometryVersion: meshGeometryVersion(body),
  }));

  const sprueIntents = [...input.sprueDefinitions]
    .sort((a, b) => a.creationOrder - b.creationOrder)
    .map((definition2) => ({
      operationId: definition2.operationId,
      position: definition2.anchor.position,
      profileDesign: definition2.profileDesign,
      creationOrder: definition2.creationOrder,
    }));

  const registrationPolicy =
    definition.segmentationLineage === true
      ? { policyId: AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY.policyId, segmentationLineage: true }
      : null;

  const processProfile = input.processProfile ?? GENERIC_RIGID_CAST_PROFILE;

  const snapshotId = hashStableValues({
    schemaVersion: 1,
    projectRevision: input.projectRevision,
    projectFingerprint: input.projectFingerprint,
    sourcePartGeometryVersion: input.sourcePartMesh.geometryVersion,
    definitionId: definition.definitionId,
    committedMoldParts: committedMoldParts.map((part) => ({ id: part.id, geometryVersion: part.geometryVersion })),
    sprueIntents: sprueIntents.map((intent) => ({ operationId: intent.operationId, position: intent.position, profileDesign: intent.profileDesign })),
    registrationPolicy,
    processProfileId: processProfile.profileId,
    printerBuildVolume: input.printerBuildVolume,
  });

  return {
    schemaVersion: 1,
    snapshotId,
    sourceModelGeometryIdentity: input.sourcePartMesh.sourceSignature,
    sourcePartMesh: input.sourcePartMesh,
    committedMoldParts,
    moldPartOffset: definition.moldFrame?.partOffset ?? { x: 0, y: 0, z: 0 },
    moldDefinitionId: definition.definitionId,
    moldDefinition: definition,
    cuttingPlanes: input.cuttingPlanes,
    referenceMoldBlockBounds: definition.referenceMoldBlock.bounds,
    sprueIntents,
    registrationPolicy,
    printerBuildVolume: input.printerBuildVolume,
    processProfile,
    projectRevision: input.projectRevision,
    projectFingerprint: input.projectFingerprint,
  };
}
