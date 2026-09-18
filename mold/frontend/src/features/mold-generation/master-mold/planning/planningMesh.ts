import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { PlanningMesh, PlanningPatch } from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";

/**
 * Execution 06 Article 03: two-resolution geometry architecture.
 *
 * The PlanningMesh is a compact, deterministic surface sample of the
 * full-resolution source mesh: patches carry centroid/normal/area plus
 * source-triangle provenance; adjacency reflects shared mesh vertices.
 * The manufacturing mesh is never modified or decimated -- it remains the
 * authority for Boolean construction, exact verification, and export.
 *
 *   Planning decides. Exact geometry verifies.
 */

export interface PlanningMeshInput {
  /** World-space flat x,y,z triplets (plain or typed array; Execution 07 LOOP 02). */
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
  readonly bounds: Bounds3;
  readonly sourceGeometryVersion: string;
}

function patchesFor(mesh: PlanningMeshInput): { patches: PlanningPatch[]; stride: number } {
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount === 0) return { patches: [], stride: 1 };
  const stride = Math.max(1, Math.ceil(triangleCount / MASTER_PLANNER_LIMITS.maxPlanningPatches));
  const patches: PlanningPatch[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    const i0 = mesh.indices[triangle * 3]! * 3;
    const i1 = mesh.indices[triangle * 3 + 1]! * 3;
    const i2 = mesh.indices[triangle * 3 + 2]! * 3;
    const ax = mesh.positions[i0]!;
    const ay = mesh.positions[i0 + 1]!;
    const az = mesh.positions[i0 + 2]!;
    const bx = mesh.positions[i1]!;
    const by = mesh.positions[i1 + 1]!;
    const bz = mesh.positions[i1 + 2]!;
    const cx = mesh.positions[i2]!;
    const cy = mesh.positions[i2 + 1]!;
    const cz = mesh.positions[i2 + 2]!;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0 || !Number.isFinite(length)) continue;
    nx /= length;
    ny /= length;
    nz /= length;
    patches.push({
      patchIndex: patches.length,
      centroid: { x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3, z: (az + bz + cz) / 3 },
      normal: { x: nx, y: ny, z: nz },
      areaMm2: length / 2,
      sourceTriangle: triangle,
    });
  }
  return { patches, stride };
}

/**
 * Adjacency through shared vertices: two sampled patches are adjacent when
 * any of their triangles' vertex indexes coincide. Vertex incidence is built
 * once over the sampled triangles only (bounded work), giving exact
 * connectivity for the sampled surface graph.
 */
function adjacencyFor(mesh: PlanningMeshInput, patches: readonly PlanningPatch[]): number[][] {
  const adjacency: number[][] = patches.map(() => []);
  if (patches.length === 0) return adjacency;
  const vertexToPatches = new Map<number, number[]>();
  for (const patch of patches) {
    const triangle = patch.sourceTriangle;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = mesh.indices[triangle * 3 + corner]!;
      const bucket = vertexToPatches.get(vertex);
      if (bucket === undefined) vertexToPatches.set(vertex, [patch.patchIndex]);
      else if (bucket[bucket.length - 1] !== patch.patchIndex) bucket.push(patch.patchIndex);
    }
  }
  for (const bucket of vertexToPatches.values()) {
    for (let a = 0; a < bucket.length; a += 1) {
      for (let b = a + 1; b < bucket.length; b += 1) {
        const patchA = bucket[a]!;
        const patchB = bucket[b]!;
        if (!adjacency[patchA]!.includes(patchB)) adjacency[patchA]!.push(patchB);
        if (!adjacency[patchB]!.includes(patchA)) adjacency[patchB]!.push(patchA);
      }
    }
  }
  return adjacency;
}

export function buildPlanningMesh(mesh: PlanningMeshInput): PlanningMesh {
  const { patches } = patchesFor(mesh);
  const adjacency = adjacencyFor(mesh, patches);
  const totalAreaMm2 = patches.reduce((sum, patch) => sum + patch.areaMm2, 0);
  return {
    patches,
    adjacency,
    totalAreaMm2,
    bounds: mesh.bounds,
    sourceGeometryVersion: mesh.sourceGeometryVersion,
    vertexCount: mesh.positions.length / 3,
    triangleCount: mesh.indices.length / 3,
  };
}
