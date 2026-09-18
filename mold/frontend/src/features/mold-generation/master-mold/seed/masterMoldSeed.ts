import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { hashStableValues } from "../../geometry/geometryFingerprint";
import type { MasterCastingProcessProfile } from "../engine/contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "../engine/contracts";

/**
 * Execution 06 Articles 02/12: the Master Mold seed snapshot.
 *
 * The seed is the smallest deterministic snapshot required to reproduce a
 * Master Mold result straight from the imported part -- no committed mold
 * parts, no cutting planes, no mold definition, no Create Cavity provenance.
 * Master Mold owns this contract; it is never populated from the Split Face
 * or Cavity domains.
 */

export const MASTER_MOLD_SEED_SCHEMA_VERSION = 1 as const;

/** User-level Master Mold planning preferences (Article 14 staleness inputs). */
export interface MasterMoldPlanningPreferences {
  /** Upper bound the user places on working-mold piece count; null = process profile default. */
  readonly preferredMaximumWorkingMoldPieces: number | null;
}

export const DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES: MasterMoldPlanningPreferences = {
  preferredMaximumWorkingMoldPieces: null,
};

/**
 * Source geometry for one Master Mold run. The seed snapshot carries the
 * LOCAL-space triangles as typed arrays (so the generation Worker can receive
 * them zero-copy) plus the part transform; `worldMeshFromSnapshot` rehydrates
 * the world-space mesh in the generation context, so the heavy full-array
 * transform never runs on the UI thread (Execution 07 LOOP 02).
 */
export interface MasterSeedSourceMesh {
  readonly modelId: string;
  /** Local-space positions: flat x,y,z triplets (world after rehydration). */
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  /** World-space bounds of the transformed geometry. */
  readonly bounds: Bounds3;
  /** Content hash over the source triangles + transform. */
  readonly geometryVersion: string;
}

export interface MasterMoldSeedSnapshot {
  readonly schemaVersion: typeof MASTER_MOLD_SEED_SCHEMA_VERSION;
  /** Stable identity over every seed input (Article 14 staleness key). */
  readonly seedId: string;
  readonly sourceModelId: string;
  readonly sourceGeometryVersion: string;
  readonly sourceMesh: MasterSeedSourceMesh;
  /** The part-from-local transform, kept as provenance (column-major 4x4). */
  readonly sourceTransform: readonly number[];
  readonly sourceBounds: Bounds3;
  readonly printerBuildVolume: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly processProfile: MasterCastingProcessProfile;
  readonly userPreferences: MasterMoldPlanningPreferences;
  readonly sourceProjectRevision: string;
}

/** Master-owned structural input for a seed build -- deliberately not the Cavity domain's `CanonicalPartGeometry` type (Article 16). */
export interface MasterSeedGeometryInput {
  readonly modelId: string;
  /** Local-space positions: flat x,y,z triplets (plain or typed array). */
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
  /** Column-major 4x4 part-from-local transform. */
  readonly transform: readonly number[];
  readonly localBounds: Bounds3;
  readonly geometryVersion: string;
  readonly sourceSignature: string;
}

export interface MasterMoldSeedInput {
  readonly sourcePartGeometry: MasterSeedGeometryInput;
  readonly printerBuildVolume: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly processProfile?: MasterCastingProcessProfile;
  readonly userPreferences?: MasterMoldPlanningPreferences;
  readonly projectRevision: string;
}

function applyTransformToPositions(
  positions: ArrayLike<number>,
  transform: readonly number[],
): Float32Array {
  const world = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    // Column-major 4x4 (three.js toArray() convention).
    world[index] = transform[0]! * x + transform[4]! * y + transform[8]! * z + transform[12]!;
    world[index + 1] = transform[1]! * x + transform[5]! * y + transform[9]! * z + transform[13]!;
    world[index + 2] = transform[2]! * x + transform[6]! * y + transform[10]! * z + transform[14]!;
  }
  return world;
}

const IDENTITY_TRANSFORM = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

function transformIsIdentity(transform: readonly number[]): boolean {
  if (transform.length !== IDENTITY_TRANSFORM.length) return false;
  for (let index = 0; index < transform.length; index += 1) {
    if (Math.abs(transform[index]! - IDENTITY_TRANSFORM[index]!) > 1e-12) return false;
  }
  return true;
}

/**
 * Execution 07 LOOP 02: rehydrates the world-space mesh the engine consumes.
 * The seed snapshot travels with local-space typed geometry plus its
 * transform; this runs ONCE in the generation context (the Worker, or the
 * Worker-less fallback), never on the UI thread. Identity transforms skip
 * the full-array pass entirely.
 */
export function worldMeshFromSnapshot(snapshot: MasterMoldSeedSnapshot): MasterMoldSeedSnapshot {
  if (transformIsIdentity(snapshot.sourceTransform)) return snapshot;
  return {
    ...snapshot,
    sourceMesh: {
      ...snapshot.sourceMesh,
      positions: applyTransformToPositions(snapshot.sourceMesh.positions, snapshot.sourceTransform),
    },
  };
}

export function worldBoundsFromLocal(localBounds: Bounds3, transform: readonly number[]): Bounds3 {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const cornerX of [localBounds.min.x, localBounds.max.x]) {
    for (const cornerY of [localBounds.min.y, localBounds.max.y]) {
      for (const cornerZ of [localBounds.min.z, localBounds.max.z]) {
        const x = transform[0]! * cornerX + transform[4]! * cornerY + transform[8]! * cornerZ + transform[12]!;
        const y = transform[1]! * cornerX + transform[5]! * cornerY + transform[9]! * cornerZ + transform[13]!;
        const z = transform[2]! * cornerX + transform[6]! * cornerY + transform[10]! * cornerZ + transform[14]!;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

export function masterSourceGeometryVersion(input: {
  readonly geometryVersion: string;
  readonly localBounds: Bounds3;
  readonly transform: readonly number[];
}): string {
  const bounds = worldBoundsFromLocal(input.localBounds, input.transform);
  return `master-seed-mesh:${hashStableValues({ local: input.geometryVersion, transform: input.transform, bounds })}`;
}

/**
 * Assembles the seed snapshot from authoritative imported-part truth only.
 * Fails fast on non-finite/empty geometry -- the engine's later stages assume
 * a constructible solid.
 */
export function buildMasterMoldSeedSnapshot(input: MasterMoldSeedInput): MasterMoldSeedSnapshot {
  const geometry = input.sourcePartGeometry;
  if (geometry.positions.length === 0 || geometry.indices.length === 0) {
    throw new Error("Master Mold requires imported part geometry; none was captured.");
  }
  if (geometry.positions.length % 3 !== 0 || geometry.indices.length % 3 !== 0) {
    throw new Error("Master Mold source geometry payload is malformed.");
  }
  if (geometry.positions.some((value) => !Number.isFinite(value)) || geometry.transform.some((value) => !Number.isFinite(value))) {
    throw new Error("Master Mold source geometry contains non-finite values.");
  }

  const processProfile = input.processProfile ?? GENERIC_RIGID_CAST_PROFILE;
  const userPreferences = input.userPreferences ?? DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES;
  // Execution 07 LOOP 02: one typed conversion pass, no world transform and
  // no spread copies on the UI thread. The snapshot exclusively owns these
  // buffers so the Worker client can transfer them zero-copy; the world
  // transform runs in the generation context (worldMeshFromSnapshot).
  const positions = Float32Array.from(geometry.positions);
  const indices = Uint32Array.from(geometry.indices);
  const bounds = worldBoundsFromLocal(geometry.localBounds, geometry.transform);
  const sourceGeometryVersion = masterSourceGeometryVersion({
    geometryVersion: geometry.geometryVersion,
    localBounds: geometry.localBounds,
    transform: geometry.transform,
  });

  const seedId = hashStableValues({
    schemaVersion: MASTER_MOLD_SEED_SCHEMA_VERSION,
    sourceModelId: geometry.modelId,
    sourceGeometryVersion,
    printerBuildVolume: input.printerBuildVolume,
    processProfileId: processProfile.profileId,
    userPreferences,
    sourceProjectRevision: input.projectRevision,
  });

  return {
    schemaVersion: MASTER_MOLD_SEED_SCHEMA_VERSION,
    seedId,
    sourceModelId: geometry.modelId,
    sourceGeometryVersion,
    sourceMesh: {
      modelId: geometry.modelId,
      positions,
      indices,
      bounds,
      geometryVersion: sourceGeometryVersion,
    },
    sourceTransform: [...geometry.transform],
    sourceBounds: bounds,
    printerBuildVolume: input.printerBuildVolume,
    processProfile,
    userPreferences,
    sourceProjectRevision: input.projectRevision,
  };
}

/**
 * Identity of everything a generation's staleness depends on (Article 14):
 * source geometry, process profile, printer build volume, and Master
 * preferences. Deliberately excludes Create Cavity state and Split Face
 * definition/plan state. Accepts the seed itself or any object carrying the
 * same Master-relevant fields (e.g. the live toolbar's lightweight identity).
 */
export function masterSeedStalenessIdentity(input: {
  readonly sourceGeometryVersion: string;
  readonly printerBuildVolume: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly processProfile: MasterCastingProcessProfile;
  readonly userPreferences: MasterMoldPlanningPreferences;
}): string {
  return hashStableValues({
    sourceGeometryVersion: input.sourceGeometryVersion,
    printerBuildVolume: input.printerBuildVolume,
    processProfileId: input.processProfile.profileId,
    userPreferences: input.userPreferences,
  });
}
