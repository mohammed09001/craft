import ManifoldModule from "manifold-3d";

import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../split-face/splitFace.contracts";

export type ManifoldModuleInstance = Awaited<ReturnType<typeof ManifoldModule>>;
export type ManifoldSolid = InstanceType<ManifoldModuleInstance["Manifold"]>;

/**
 * `ManifoldSolid.asOriginal()`'s return value is tagged at runtime with an `originalID()` accessor
 * that manifold-3d's public types don't declare on `ManifoldSolid`. Cast through this narrow shape
 * wherever that tagged ID is read, instead of `any`.
 */
export type OriginalTaggedManifold = ManifoldSolid & { originalID(): number };

let modulePromise: Promise<ManifoldModuleInstance> | null = null;

export async function getManifoldModule(): Promise<ManifoldModuleInstance> {
  modulePromise ??= ManifoldModule().then((module) => {
    module.setup();
    return module;
  });
  return modulePromise;
}

export function assertManifoldStatus(solid: ManifoldSolid, operation: string): void {
  const status = solid.status();
  if (status !== "NoError") throw new Error(`${operation} failed: ${status}.`);
}

export function manifoldFromPayload(
  module: ManifoldModuleInstance,
  payload: MoldMeshPayload,
  tolerance: number,
): ManifoldSolid {
  const mesh = new module.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(payload.positions),
    triVerts: new Uint32Array(payload.indices),
    tolerance,
  });
  mesh.merge();
  const solid = new module.Manifold(mesh);
  assertManifoldStatus(solid, "Mesh preparation");
  return solid;
}

export function payloadFromManifold(
  solid: ManifoldSolid,
  roleMap?: Readonly<Record<number, "registration-key" | "sprue-funnel" | "cavity-surface" | "outer-mold">>,
): MoldMeshPayload {
  assertManifoldStatus(solid, "Mesh export");
  const mesh = solid.getMesh();
  const positions: number[] = [];
  for (let index = 0; index < mesh.numVert; index += 1) {
    const point = mesh.position(index);
    positions.push(point[0]!, point[1]!, point[2]!);
  }
  const indices = Array.from(mesh.triVerts);

  if (mesh.numRun > 0 && mesh.runIndex && mesh.runOriginalID) {
    const runIndices = Array.from(mesh.runIndex);
    const runOriginalIDs = Array.from(mesh.runOriginalID);
    const faceRuns: import("../reference-mold-definition/orthogonalMold").MoldMeshFaceRun[] = [];

    for (let r = 0; r < mesh.numRun; r += 1) {
      const startTriangle = runIndices[r]! / 3;
      const endTriangle = runIndices[r + 1]! / 3;
      const triangleCount = endTriangle - startTriangle;
      if (triangleCount <= 0) continue;

      const origID = runOriginalIDs[r]!;
      const role = roleMap?.[origID] ?? "outer-mold";

      faceRuns.push({ startTriangle, triangleCount, role });
    }

    return { positions, indices, faceRuns };
  }

  return { positions, indices };
}

export function boundsFromManifold(solid: ManifoldSolid): Bounds3 {
  const bounds = solid.boundingBox();
  return {
    min: { x: bounds.min[0], y: bounds.min[1], z: bounds.min[2] },
    max: { x: bounds.max[0], y: bounds.max[1], z: bounds.max[2] },
  };
}
