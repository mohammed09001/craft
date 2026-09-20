import { Matrix4 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { buildMeshGeometry } from "../../geometry/meshBvh";

/**
 * Execution 08 LOOP 03: source mesh preflight, run BEFORE any planning work.
 *
 * `buildMasterMoldSeedSnapshot` only proves the mesh payload is
 * structurally well-formed (non-empty, triple-aligned, finite numbers). It
 * does not prove manufacturing topology: a mesh can pass that check and
 * still be open, non-manifold, self-intersecting, or otherwise unusable as
 * a Boolean solid. Planning must never be blamed (`planning_budget_exhausted`
 * / `no_release_plan`) for a mesh that was never constructible in the first
 * place (Article 41 / LOOP 36 failure semantics) -- this module tells the
 * two apart before the planner runs at all.
 *
 * Real imported STL geometry is a triangle SOUP, not shared topology: the
 * import path (`captureCanonicalPartGeometry`) falls back to an identity
 * index (0,1,2,3,...) whenever `STLLoader`'s non-indexed geometry has no
 * index attribute, so two adjacent triangles almost never share a vertex
 * INDEX even when they share a vertex POSITION. Every topological check here
 * (edges, manifoldness, winding, components, self-intersection adjacency)
 * therefore runs over POSITION-welded vertex identity, not raw indices --
 * an index-only check would misclassify essentially every real part as
 * "open" and reject it before planning ever saw real geometry.
 */

export type MeshPreflightIssueCode =
  | "non_finite_geometry"
  | "degenerate_triangle"
  | "duplicate_face"
  | "non_manifold_edge"
  | "open_boundary_edge"
  | "inconsistent_winding"
  | "disconnected_component"
  | "invalid_volume"
  | "self_intersection";

export interface MeshPreflightIssue {
  readonly code: MeshPreflightIssueCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  /** How many triangles/edges/components this issue covers. */
  readonly count: number;
}

export type MeshPreflightStatus = "valid" | "repairable-warning" | "invalid-for-master-mold";

export interface MeshPreflightResult {
  readonly status: MeshPreflightStatus;
  readonly issues: readonly MeshPreflightIssue[];
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly componentCount: number;
  /** Signed volume from the divergence theorem; meaningful only when the mesh is closed. */
  readonly volumeMm3: number;
  /** False when the mesh exceeded the bounded self-intersection budget (Article 15/41: bounded, not skipped silently -- reported here). */
  readonly selfIntersectionChecked: boolean;
}

export interface MeshPreflightInput {
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
}

export interface MeshPreflightOptions {
  /** Above this triangle count, the bounded self-intersection pass is skipped rather than run unbounded (Article 15). */
  readonly maxSelfIntersectionTriangleCount?: number;
  /** Relative-area threshold (fraction of mean triangle area) below which a triangle is degenerate. */
  readonly degenerateAreaFraction?: number;
}

const DEFAULT_MAX_SELF_INTERSECTION_TRIANGLES = 20_000;
const DEFAULT_DEGENERATE_AREA_FRACTION = 1e-6;

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Groups vertex indices whose positions coincide within `toleranceMm` into
 * shared welded ids (spatial-hash weld, 3x3x3 neighbor-cell search so a
 * true duplicate is found regardless of which side of a bucket boundary it
 * quantizes to). Bounded average cost: one hash-bucket scan per vertex.
 */
export function weldedVertexIds(positions: readonly number[] | Float32Array, vertexCount: number, toleranceMm: number): Int32Array {
  const cellSize = Math.max(toleranceMm, 1e-9);
  const toleranceSq = toleranceMm * toleranceMm;
  const buckets = new Map<string, number[]>();
  const weldId = new Int32Array(vertexCount).fill(-1);
  let nextId = 0;
  const cellIndexOf = (coordinate: number) => Math.floor(coordinate / cellSize);

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = positions[vertex * 3]!;
    const y = positions[vertex * 3 + 1]!;
    const z = positions[vertex * 3 + 2]!;
    const cx = cellIndexOf(x);
    const cy = cellIndexOf(y);
    const cz = cellIndexOf(z);
    let matched = -1;
    for (let dx = -1; dx <= 1 && matched === -1; dx += 1) {
      for (let dy = -1; dy <= 1 && matched === -1; dy += 1) {
        for (let dz = -1; dz <= 1 && matched === -1; dz += 1) {
          const bucket = buckets.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
          if (bucket === undefined) continue;
          for (const other of bucket) {
            const ox = positions[other * 3]! - x;
            const oy = positions[other * 3 + 1]! - y;
            const oz = positions[other * 3 + 2]! - z;
            if (ox * ox + oy * oy + oz * oz <= toleranceSq) {
              matched = weldId[other]!;
              break;
            }
          }
        }
      }
    }
    weldId[vertex] = matched === -1 ? nextId++ : matched;
    const key = `${cx}:${cy}:${cz}`;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(vertex);
  }
  return weldId;
}

/**
 * `buildGeometryTolerancePolicy` requires strictly positive extent on every
 * axis (an exact-CSG precondition); a preflight must still classify a
 * degenerate flat/pathological mesh instead of throwing, so a genuinely
 * zero-extent axis falls back to a fixed conservative weld tolerance.
 */
export function weldToleranceMmFor(bounds: Bounds3): number {
  try {
    return buildGeometryTolerancePolicy(bounds, 0).containmentToleranceMm;
  } catch {
    return 1e-4;
  }
}

export function boundsOf(positions: readonly number[] | Float32Array, vertexCount: number): Bounds3 {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = positions[vertex * 3]!, y = positions[vertex * 3 + 1]!, z = positions[vertex * 3 + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

interface UnionFind {
  readonly parent: Int32Array;
  find(x: number): number;
  union(a: number, b: number): void;
}

function createUnionFind(size: number): UnionFind {
  const parent = new Int32Array(size);
  for (let index = 0; index < size; index += 1) parent[index] = index;
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = x;
    while (parent[cursor] !== root) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  return {
    parent,
    find,
    union(a: number, b: number): void {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent[rootA] = rootB;
    },
  };
}

/**
 * Runs the full manufacturing-topology preflight over the FULL-resolution
 * source mesh (never the sampled planning mesh) and classifies the result:
 * `valid` (planning may proceed unconditionally), `repairable-warning`
 * (planning proceeds but the plan carries a warning), or
 * `invalid-for-master-mold` (planning must not run -- the source geometry
 * itself is the failure, not the search).
 */
export function runMeshPreflight(mesh: MeshPreflightInput, options: MeshPreflightOptions = {}): MeshPreflightResult {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const triangleCount = Math.floor(indices.length / 3);
  const vertexCount = Math.floor(positions.length / 3);
  const issues: MeshPreflightIssue[] = [];

  if (positions.length % 3 !== 0 || indices.length % 3 !== 0 || triangleCount === 0 || vertexCount === 0) {
    return {
      status: "invalid-for-master-mold",
      issues: [{ code: "non_finite_geometry", severity: "error", message: "source geometry is empty or malformed (positions/indices not triangle-aligned).", count: 0 }],
      triangleCount,
      vertexCount,
      componentCount: 0,
      volumeMm3: 0,
      selfIntersectionChecked: false,
    };
  }

  let nonFiniteCount = 0;
  for (let index = 0; index < positions.length; index += 1) {
    if (!Number.isFinite(positions[index]!)) nonFiniteCount += 1;
  }
  for (let index = 0; index < indices.length; index += 1) {
    const vertex = indices[index]!;
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) nonFiniteCount += 1;
  }
  if (nonFiniteCount > 0) {
    issues.push({ code: "non_finite_geometry", severity: "error", message: `${nonFiniteCount} non-finite coordinate(s) or out-of-range vertex index(es).`, count: nonFiniteCount });
    return { status: "invalid-for-master-mold", issues, triangleCount, vertexCount, componentCount: 0, volumeMm3: 0, selfIntersectionChecked: false };
  }

  // Position-welded vertex identity backs every topological check below
  // (see module doc comment): a real imported STL triangle soup shares no
  // raw indices at all between adjacent triangles.
  const bounds = boundsOf(positions, vertexCount);
  const weldToleranceMm = weldToleranceMmFor(bounds);
  const weldId = weldedVertexIds(positions, vertexCount, weldToleranceMm);

  // Per-triangle geometry: area (degeneracy), signed-volume contribution,
  // and the three directed edges (winding/manifold/boundary/adjacency),
  // the latter keyed by welded vertex identity.
  const areas = new Float64Array(triangleCount);
  let totalArea = 0;
  let signedVolume6 = 0;
  const edgeOccurrences = new Map<string, { count: number; directed: string[]; triangles: number[] }>();
  const duplicateFaceKeys = new Map<string, number>();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = indices[triangle * 3]!;
    const b = indices[triangle * 3 + 1]!;
    const c = indices[triangle * 3 + 2]!;
    const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!;
    const bx = positions[b * 3]!, by = positions[b * 3 + 1]!, bz = positions[b * 3 + 2]!;
    const cx = positions[c * 3]!, cy = positions[c * 3 + 1]!, cz = positions[c * 3 + 2]!;
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const area = Math.hypot(nx, ny, nz) / 2;
    areas[triangle] = area;
    totalArea += area;
    // Divergence-theorem contribution: 6*V = sum(dot(a, cross(b, c))) over
    // triangles wound consistently outward.
    signedVolume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);

    const wa = weldId[a]!, wb = weldId[b]!, wc = weldId[c]!;
    const faceKey = [wa, wb, wc].slice().sort((x, y) => x - y).join(":");
    duplicateFaceKeys.set(faceKey, (duplicateFaceKeys.get(faceKey) ?? 0) + 1);

    for (const [u, v] of [[wa, wb], [wb, wc], [wc, wa]] as const) {
      if (u === v) continue; // degenerate-triangle self-loop; reported separately.
      const key = edgeKey(u, v);
      let entry = edgeOccurrences.get(key);
      if (entry === undefined) {
        entry = { count: 0, directed: [], triangles: [] };
        edgeOccurrences.set(key, entry);
      }
      entry.count += 1;
      entry.directed.push(`${u}:${v}`);
      entry.triangles.push(triangle);
    }
  }

  const meanArea = triangleCount > 0 ? totalArea / triangleCount : 0;
  const degenerateAreaThreshold = meanArea * (options.degenerateAreaFraction ?? DEFAULT_DEGENERATE_AREA_FRACTION);
  let degenerateCount = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (areas[triangle]! <= degenerateAreaThreshold) degenerateCount += 1;
  }
  if (degenerateCount > 0) {
    issues.push({
      code: "degenerate_triangle",
      severity: degenerateCount / triangleCount > 0.05 ? "error" : "warning",
      message: `${degenerateCount} degenerate/zero-area triangle(s) out of ${triangleCount}.`,
      count: degenerateCount,
    });
  }

  let duplicateFaceCount = 0;
  for (const occurrences of duplicateFaceKeys.values()) {
    if (occurrences > 1) duplicateFaceCount += occurrences - 1;
  }
  if (duplicateFaceCount > 0) {
    issues.push({ code: "duplicate_face", severity: "warning", message: `${duplicateFaceCount} duplicate/overlapping face(s) share the same three vertices as another face.`, count: duplicateFaceCount });
  }

  let openBoundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let inconsistentWindingEdgeCount = 0;
  const unionFind = createUnionFind(triangleCount);
  for (const entry of edgeOccurrences.values()) {
    if (entry.count === 1) {
      openBoundaryEdgeCount += 1;
      continue;
    }
    if (entry.count > 2) {
      nonManifoldEdgeCount += 1;
      for (let index = 1; index < entry.triangles.length; index += 1) unionFind.union(entry.triangles[0]!, entry.triangles[index]!);
      continue;
    }
    // count === 2: connected regardless of winding; winding consistency is a separate issue.
    unionFind.union(entry.triangles[0]!, entry.triangles[1]!);
    if (entry.directed[0] === entry.directed[1]) inconsistentWindingEdgeCount += 1;
  }
  if (openBoundaryEdgeCount > 0) {
    issues.push({ code: "open_boundary_edge", severity: "error", message: `${openBoundaryEdgeCount} boundary edge(s) used by only one triangle: the surface is not closed.`, count: openBoundaryEdgeCount });
  }
  if (nonManifoldEdgeCount > 0) {
    issues.push({ code: "non_manifold_edge", severity: "error", message: `${nonManifoldEdgeCount} non-manifold edge(s) shared by more than two triangles.`, count: nonManifoldEdgeCount });
  }
  if (inconsistentWindingEdgeCount > 0) {
    issues.push({ code: "inconsistent_winding", severity: "error", message: `${inconsistentWindingEdgeCount} edge(s) whose two triangles share the same winding direction (a flipped face).`, count: inconsistentWindingEdgeCount });
  }

  const componentRoots = new Set<number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) componentRoots.add(unionFind.find(triangle));
  const componentCount = componentRoots.size;
  if (componentCount > 1) {
    issues.push({ code: "disconnected_component", severity: "warning", message: `${componentCount} disconnected surface components; Master Mold plans one continuous solid.`, count: componentCount });
  }

  const volumeMm3 = signedVolume6 / 6;
  const scaleMm3 = Math.pow(Math.max(1e-6, Math.cbrt(totalArea)), 3);
  if (!Number.isFinite(volumeMm3) || volumeMm3 <= scaleMm3 * 1e-9) {
    issues.push({ code: "invalid_volume", severity: "error", message: `computed enclosed volume (${volumeMm3.toFixed(4)} mm^3) is not a valid positive solid -- the mesh may be open, inverted, or degenerate.`, count: 1 });
  }

  let selfIntersectionChecked = false;
  const maxSelfIntersectionTriangles = options.maxSelfIntersectionTriangleCount ?? DEFAULT_MAX_SELF_INTERSECTION_TRIANGLES;
  if (triangleCount > 0 && triangleCount <= maxSelfIntersectionTriangles) {
    const selfIntersectingTriangles = countSelfIntersectingTriangles({ positions, indices, triangleCount, weldId });
    selfIntersectionChecked = true;
    if (selfIntersectingTriangles > 0) {
      issues.push({ code: "self_intersection", severity: "error", message: `${selfIntersectingTriangles} triangle(s) intersect non-adjacent geometry elsewhere on the same surface.`, count: selfIntersectingTriangles });
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  const status: MeshPreflightStatus = hasError ? "invalid-for-master-mold" : hasWarning ? "repairable-warning" : "valid";

  return { status, issues, triangleCount, vertexCount, componentCount, volumeMm3, selfIntersectionChecked };
}

/**
 * Bounded exact self-intersection count: BVH-vs-itself triangle pair
 * traversal (Article 15), skipping pairs that share a vertex (adjacent
 * triangles legitimately touch along a shared edge/vertex -- that is not a
 * self-intersection).
 */
function countSelfIntersectingTriangles(mesh: { positions: readonly number[] | Float32Array; indices: readonly number[] | Uint32Array; triangleCount: number; weldId: Int32Array }): number {
  const geometry = buildMeshGeometry({ positions: [...mesh.positions], indices: [...mesh.indices] });
  try {
    const bvh = new MeshBVH(geometry);
    // MeshBVH reorders geometry.index in place to match its leaf layout by
    // default: bvhcast's triangle indexes refer to THAT (reordered) buffer,
    // never the original `mesh.indices` array -- reading adjacency from the
    // original array here silently mismatches every triangle and turns
    // every ordinary shared edge into a false-positive self-intersection.
    // The reordered buffer still indexes into the SAME position/weldId
    // arrays (only face order changed, not vertex identity), so welded ids
    // stay valid looked up this way.
    const indexArray = geometry.index!.array;
    const identity = new Matrix4();
    const offending = new Set<number>();
    const sharesVertex = (t1: number, t2: number): boolean => {
      for (let a = 0; a < 3; a += 1) {
        const va = mesh.weldId[indexArray[t1 * 3 + a]!]!;
        for (let b = 0; b < 3; b += 1) {
          if (va === mesh.weldId[indexArray[t2 * 3 + b]!]!) return true;
        }
      }
      return false;
    };
    bvh.bvhcast(bvh, identity, {
      intersectsTriangles: (triangle1, triangle2, i1, i2) => {
        if (i1 >= i2) return false;
        if (sharesVertex(i1, i2)) return false;
        if (triangle1.intersectsTriangle(triangle2)) {
          offending.add(i1);
          offending.add(i2);
        }
        return false;
      },
    });
    return offending.size;
  } finally {
    geometry.dispose();
  }
}
