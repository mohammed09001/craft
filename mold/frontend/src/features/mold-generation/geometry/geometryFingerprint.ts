import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../split-face/splitFace.contracts";

/**
 * Execution 05 Article 04: neutral geometry fingerprint utilities. These are
 * generic content hashes over compact metadata and mesh payloads -- their
 * contracts make sense without the words Cavity, Master Mold, Sprue, or
 * Registration, so any domain may consume them without coupling to another
 * domain's signature module (Section 4.4).
 */

function updateHash(hash: number, text: string): number {
  let result = hash;
  for (let index = 0; index < text.length; index += 1) result = Math.imul(result ^ text.charCodeAt(index), 16777619);
  return result;
}

const finishHash = (hash: number) => (hash >>> 0).toString(16).padStart(8, "0");

/** Hashes compact metadata. Geometry arrays use hashNumericArray to avoid giant JSON strings. */
export function hashStableValues(value: unknown): string {
  return finishHash(updateHash(2166136261, JSON.stringify(value)));
}

export function hashNumericArray(values: readonly number[], seed = 2166136261): number {
  let hash = seed;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  for (const value of values) {
    view.setFloat64(0, value, true);
    for (let byte = 0; byte < 8; byte += 1) hash = Math.imul(hash ^ view.getUint8(byte), 16777619);
  }
  return hash;
}

/**
 * Deterministic geometry version for one mesh body: identical (id, mesh
 * payload, bounds) always produces the identical version string, so stale
 * detection can diff geometry by content instead of trusting IDs.
 */
export function meshGeometryVersion(body: Pick<MoldMeshPayloadHolder, "id" | "mesh" | "bounds">): string {
  let hash = updateHash(2166136261, body.id);
  hash = updateHash(hash, JSON.stringify(body.bounds));
  hash = hashNumericArray(body.mesh.positions, hash);
  hash = hashNumericArray(body.mesh.indices, hash);
  return `body:${finishHash(hash)}`;
}

interface MoldMeshPayloadHolder {
  readonly id: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
}
