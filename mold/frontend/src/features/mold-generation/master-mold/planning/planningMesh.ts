import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { PlanningMesh, PlanningPatch, PlanningVector3 } from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { boundsOf, weldedVertexIds, weldToleranceMmFor } from "./meshPreflight";

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
 *
 * Execution 08 LOOP 04: below `fullResolutionPlanningTriangleBudget`, every
 * triangle becomes its own patch -- exact topology, no sampling at all. At
 * or above it, a spatial+normal clustering reduces to a bounded patch count
 * (a real topology-preserving reduction, not picking every Nth triangle by
 * raw index). Neither path depends on triangle array order: the same
 * geometry, triangles listed in a different order, produces the same patch
 * SET (mapping keys are content-derived, and cluster patch indices are
 * assigned in sorted-key order, not encounter order).
 */

export interface PlanningMeshInput {
  /** World-space flat x,y,z triplets (plain or typed array; Execution 07 LOOP 02). */
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
  readonly bounds: Bounds3;
  readonly sourceGeometryVersion: string;
}

interface TriangleGeometry {
  readonly triangle: number;
  readonly centroid: PlanningVector3;
  readonly normal: PlanningVector3;
  readonly areaMm2: number;
}

/** Per-triangle geometry (centroid/unit normal/area); degenerate (zero-area) triangles are dropped. */
function triangleGeometryFor(mesh: PlanningMeshInput): TriangleGeometry[] {
  const triangleCount = mesh.indices.length / 3;
  const result: TriangleGeometry[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const i0 = mesh.indices[triangle * 3]! * 3;
    const i1 = mesh.indices[triangle * 3 + 1]! * 3;
    const i2 = mesh.indices[triangle * 3 + 2]! * 3;
    const ax = mesh.positions[i0]!, ay = mesh.positions[i0 + 1]!, az = mesh.positions[i0 + 2]!;
    const bx = mesh.positions[i1]!, by = mesh.positions[i1 + 1]!, bz = mesh.positions[i1 + 2]!;
    const cx = mesh.positions[i2]!, cy = mesh.positions[i2 + 1]!, cz = mesh.positions[i2 + 2]!;
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0 || !Number.isFinite(length)) continue;
    nx /= length;
    ny /= length;
    nz /= length;
    result.push({
      triangle,
      centroid: { x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3, z: (az + bz + cz) / 3 },
      normal: { x: nx, y: ny, z: nz },
      areaMm2: length / 2,
    });
  }
  return result;
}

/** Below-budget path: one patch per triangle, exact topology. */
function fullResolutionPatches(triangles: readonly TriangleGeometry[]): PlanningPatch[] {
  return triangles.map((triangle, patchIndex) => ({
    patchIndex,
    centroid: triangle.centroid,
    normal: triangle.normal,
    areaMm2: triangle.areaMm2,
    sourceTriangle: triangle.triangle,
  }));
}

/**
 * Adjacency through shared vertices: two patches are adjacent when any of
 * their triangles' vertices coincide. `triangleOf` maps a patch to the
 * (single, in the full-resolution case) triangle whose vertices define it.
 *
 * Identity is POSITION-welded (`weldId`), never a raw vertex INDEX: real
 * imported STL geometry is a triangle soup (`captureCanonicalPartGeometry`
 * falls back to an identity index whenever STLLoader's non-indexed
 * geometry has no index attribute), so adjacent triangles from a real part
 * essentially never share a vertex INDEX even though they share a vertex
 * POSITION. An index-only adjacency check leaves every patch with zero
 * neighbors on a real part -- discovered live via the real /workspace E2E
 * high-poly spec failing end to end although the equivalent Manifold-built
 * (pre-welded) test fixture passed: the region graph, undercut grouping,
 * and everything downstream silently degenerate to one patch per region.
 */
function adjacencyFromTriangles(
  mesh: PlanningMeshInput,
  weldId: Int32Array,
  patchCount: number,
  trianglesOf: (patchIndex: number) => readonly number[],
): number[][] {
  const adjacency: number[][] = Array.from({ length: patchCount }, () => []);
  if (patchCount === 0) return adjacency;
  const vertexToPatches = new Map<number, Set<number>>();
  for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
    for (const triangle of trianglesOf(patchIndex)) {
      for (let corner = 0; corner < 3; corner += 1) {
        const rawVertex = mesh.indices[triangle * 3 + corner]!;
        const vertex = weldId[rawVertex]!;
        let bucket = vertexToPatches.get(vertex);
        if (bucket === undefined) {
          bucket = new Set();
          vertexToPatches.set(vertex, bucket);
        }
        bucket.add(patchIndex);
      }
    }
  }
  const adjacencySets: Set<number>[] = Array.from({ length: patchCount }, () => new Set());
  for (const bucket of vertexToPatches.values()) {
    if (bucket.size < 2) continue;
    const members = [...bucket];
    for (let a = 0; a < members.length; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        const patchA = members[a]!;
        const patchB = members[b]!;
        if (patchA === patchB) continue;
        adjacencySets[patchA]!.add(patchB);
        adjacencySets[patchB]!.add(patchA);
      }
    }
  }
  for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) adjacency[patchIndex] = [...adjacencySets[patchIndex]!];
  return adjacency;
}

interface ClusterAccumulator {
  readonly key: string;
  areaSum: number;
  representativeTriangle: number;
  representativeAreaMm2: number;
  representativeCentroid: PlanningVector3;
  representativeNormal: PlanningVector3;
  readonly memberTriangles: number[];
}

/** Deterministic, content-derived tie-break ordering (lexicographic on coordinates). */
function centroidLexLess(a: PlanningVector3, b: PlanningVector3): boolean {
  if (a.x !== b.x) return a.x < b.x;
  if (a.y !== b.y) return a.y < b.y;
  return a.z < b.z;
}

/** Dominant-axis-and-sign bucket (a coarse "cube face"), one of 6 values. */
function normalFaceBucket(normal: PlanningVector3): number {
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return normal.x >= 0 ? 0 : 1;
  if (ay >= ax && ay >= az) return normal.y >= 0 ? 2 : 3;
  return normal.z >= 0 ? 4 : 5;
}

/**
 * At/above `fullResolutionPlanningTriangleBudget`: a real topology-preserving
 * reduction, not index striding. Triangles are grouped by (spatial grid
 * cell x dominant-normal-face bucket) -- both purely content-derived, so
 * identical geometry in a different triangle order produces the exact same
 * grouping. The grid resolution is chosen so the total number of POSSIBLE
 * buckets (before accounting for which are actually populated) is provably
 * <= maxPlanningPatches, regardless of mesh shape.
 */
function clusteredPatches(triangles: readonly TriangleGeometry[], bounds: Bounds3): { patches: PlanningPatch[]; trianglesByPatch: number[][] } {
  const sizeX = Math.max(bounds.max.x - bounds.min.x, 1e-9);
  const sizeY = Math.max(bounds.max.y - bounds.min.y, 1e-9);
  const sizeZ = Math.max(bounds.max.z - bounds.min.z, 1e-9);
  const NORMAL_BUCKET_COUNT = 6;
  const resolutionPerAxis = Math.max(1, Math.floor(Math.cbrt(MASTER_PLANNER_LIMITS.maxPlanningPatches / NORMAL_BUCKET_COUNT)));
  const cellSizeX = sizeX / resolutionPerAxis;
  const cellSizeY = sizeY / resolutionPerAxis;
  const cellSizeZ = sizeZ / resolutionPerAxis;

  const clusters = new Map<string, ClusterAccumulator>();
  for (const triangle of triangles) {
    const cx = Math.min(resolutionPerAxis - 1, Math.max(0, Math.floor((triangle.centroid.x - bounds.min.x) / cellSizeX)));
    const cy = Math.min(resolutionPerAxis - 1, Math.max(0, Math.floor((triangle.centroid.y - bounds.min.y) / cellSizeY)));
    const cz = Math.min(resolutionPerAxis - 1, Math.max(0, Math.floor((triangle.centroid.z - bounds.min.z) / cellSizeZ)));
    const face = normalFaceBucket(triangle.normal);
    const key = `${cx}:${cy}:${cz}:${face}`;
    let cluster = clusters.get(key);
    if (cluster === undefined) {
      cluster = { key, areaSum: 0, representativeTriangle: triangle.triangle, representativeAreaMm2: -1, representativeCentroid: triangle.centroid, representativeNormal: triangle.normal, memberTriangles: [] };
      clusters.set(key, cluster);
    }
    const weight = triangle.areaMm2;
    cluster.areaSum += weight;
    cluster.memberTriangles.push(triangle.triangle);
    // Content-derived tie-break (not array-encounter order): a mesh with
    // many exactly-equal-area triangles (regular tessellation) must still
    // pick the same representative regardless of triangle array order.
    if (weight > cluster.representativeAreaMm2 || (weight === cluster.representativeAreaMm2 && centroidLexLess(triangle.centroid, cluster.representativeCentroid))) {
      cluster.representativeAreaMm2 = weight;
      cluster.representativeTriangle = triangle.triangle;
      cluster.representativeCentroid = triangle.centroid;
      cluster.representativeNormal = triangle.normal;
    }
  }

  // The output centroid/normal is always an UNMODIFIED point taken directly
  // from the real mesh (the cluster's largest member triangle), never a
  // synthetic average: on a curved surface, an area-weighted average
  // centroid/normal can drift inward of the true surface (a chord instead
  // of the arc), which silently breaks the accessibility probe's "just
  // outside the solid" assumption for every member of that cluster. Only
  // the aggregate area (used for scoring/statistics, not for probing) is
  // actually summed across members.
  const ordered = [...clusters.values()].sort((a, b) => a.key.localeCompare(b.key));
  const patches: PlanningPatch[] = ordered.map((cluster, patchIndex) => {
    return {
      patchIndex,
      centroid: cluster.representativeCentroid,
      normal: cluster.representativeNormal,
      areaMm2: cluster.areaSum,
      sourceTriangle: cluster.representativeTriangle,
    };
  });
  const trianglesByPatch = ordered.map((cluster) => cluster.memberTriangles);
  return { patches, trianglesByPatch };
}

export function buildPlanningMesh(mesh: PlanningMeshInput): PlanningMesh {
  const triangles = triangleGeometryFor(mesh);
  const useFullResolution = triangles.length <= MASTER_PLANNER_LIMITS.fullResolutionPlanningTriangleBudget;
  const vertexCount = mesh.positions.length / 3;
  const weldId = weldedVertexIds(mesh.positions, vertexCount, weldToleranceMmFor(boundsOf(mesh.positions, vertexCount)));

  let patches: PlanningPatch[];
  let adjacency: number[][];
  if (useFullResolution) {
    patches = fullResolutionPatches(triangles);
    adjacency = adjacencyFromTriangles(mesh, weldId, patches.length, (patchIndex) => [patches[patchIndex]!.sourceTriangle]);
  } else {
    const clustered = clusteredPatches(triangles, mesh.bounds);
    patches = clustered.patches;
    adjacency = adjacencyFromTriangles(mesh, weldId, patches.length, (patchIndex) => clustered.trianglesByPatch[patchIndex]!);
  }

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
