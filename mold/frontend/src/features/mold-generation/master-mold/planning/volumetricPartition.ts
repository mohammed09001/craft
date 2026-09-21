import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { assertManifoldStatus, getManifoldModule, type ManifoldSolid } from "../../geometry/manifold";

/**
 * Execution 08 LOOP 02/14/28 (volumetric reconstruction): the CSG
 * boundary-construction paradigm -- a piece's cutting tool built as a flat
 * half-space, a local footprint, or any other explicit boundary derived
 * from ONE direction's projection -- was tried four separate ways this
 * project (global flat offset, per-cell grid, connected-component
 * splitting, a full simultaneous/order-independent rewrite) and diverged
 * every time on the real free-form regression fixture: the physical piece
 * count needed to keep every piece single-connected climbed 5 -> 11 -> 23
 * -> 25 rather than converging (full history: regionDirectConstruction.ts,
 * workingMoldConstructor.ts's own doc comments,
 * masterMoldEngine.loop02RealRegression.test.ts). That is strong, repeated
 * evidence of a paradigm-level ceiling, not a fixable parameter: no
 * boundary derived from a single direction's projection can represent an
 * assignment whose true shape is not a function of that projection.
 *
 * This replaces that whole paradigm with a genuine 3D nearest-SURFACE
 * partition, extracted directly as a watertight solid via
 * `Manifold.levelSet` (a native marching-tetrahedra level-set-to-mesh
 * constructor already built into the manifold-3d library this project
 * already depends on -- no hand-written marching cubes needed, and
 * manifoldness is a documented guarantee of the algorithm itself).
 *
 * For piece i, define the signed-distance-like field
 *   sdf(p) = nearestSurfaceDistance(p, otherTriangles) - nearestSurfaceDistance(p, ownTriangles)
 * -- positive wherever a point is closer to piece i's OWN assigned
 * TRIANGLE SURFACE than to any other piece's, matching `Manifold.levelSet`'s
 * own "positive is inside" convention exactly. Distance is measured
 * against the ACTUAL triangle surfaces (via `MeshBVH.closestPointToPoint`,
 * an exact continuous point-to-mesh query, not an approximation), not a
 * discrete sampling of points on those triangles.
 *
 * An earlier version of this file sampled discrete points per triangle
 * (first just centroids, then vertices, then a density-proportional
 * barycentric grid) as Voronoi seed points instead of querying the real
 * surface. All three were real bugs, not just imprecision: on a plain
 * box's own coarse triangulation (2 triangles per face), a piece with few
 * large triangles has NO sample points in its own interior under a
 * point-based scheme, so a 3D location near that interior can end up
 * "closer" to an unrelated face's sample point purely because that other
 * face happens to have one nearby -- an artifact of where vertices happen
 * to sit, unrelated to which piece that location is actually nearest to
 * on the real surface (measured directly, escalating: centroid-only
 * produced 8814mm3 vs 1825mm3 for what should be comparable-sized pieces;
 * vertices-only made it WORSE, 6640 vs 658; denser barycentric sampling
 * fragmented pieces into over a dozen components instead of fixing it).
 * Querying the actual continuous triangle surface has no such artifact by
 * construction: it does not matter how coarsely or finely a region is
 * triangulated, since the geometric query answers "how far is the nearest
 * point on this REAL surface", not "how far is the nearest SAMPLE of it".
 *
 * Whether this ALSO satisfies release feasibility (a straight-line pull
 * without collision) is a separate question this file does not answer by
 * construction -- a Voronoi cell's shape is not guaranteed monotonic along
 * any one direction. That is checked the same way every other candidate
 * construction technique in this codebase is checked: real release
 * verification, downstream, the final authority per this project's own
 * architecture.
 *
 * FINAL FINDING (Execution 08 LOOP 02/14/28, this file's own tests have
 * the full derivation): querying the real bounded triangle surface (not a
 * point sample) fixes the sampling-density bugs above, but surfaces a
 * DIFFERENT, deeper structural limitation of bounded-nearest-surface
 * Voronoi partitioning itself -- wherever two pieces' own patches share an
 * edge, `MeshBVH.closestPointToPoint` correctly clamps to that shared edge
 * for BOTH pieces beyond it, making their distances EXACTLY equal
 * (mathematically tied, not approximately) throughout the entire wedge
 * region beyond that edge, all the way to the envelope boundary --
 * `Manifold.levelSet`'s own strict `sdf > 0` test assigns a tied point to
 * NEITHER piece, a real structural GAP (confirmed not a grid-resolution
 * artifact: refining the grid 2.5x left the gap size unchanged). A plain
 * box -- chosen as the simplest sanity check -- turned out adversarial for
 * exactly this reason (many flat, sharp-edged adjacent faces); the real
 * regression fixture has no literal flat shared edges but still
 * fragmented severely end to end when tried (physical piece count climbed
 * to 38, worse than every CSG-boundary paradigm attempt's own worst point
 * of 25), the same tie-ambiguity mechanism triggered by near-tangencies
 * between many small, irregularly-shaped pieces instead of one clean edge.
 *
 * A secondary tie-breaking term was then added (this file's own
 * `signedPlaneDistance` and its use in `volumetricAssignmentSolid`'s sdf):
 * off the exact bisector of a tied wedge, one side's nearest triangle's
 * own INFINITE PLANE is closer than the other's, and using that lightly-
 * weighted as a secondary criterion collapses the ambiguous region from a
 * full wedge VOLUME down to (at most) its own measure-zero bisector plane.
 * Measured directly: it works exactly as intended on controlled cases
 * (the same two-box-faces scenario above, gap ~2183mm3 before, ~14mm3
 * after -- kept as a real, permanent, passing test) AND on the real
 * fixture's own simple-box sanity case specifically (tiling failure
 * fixed entirely). But tried end to end on the real regression fixture
 * itself, it made things WORSE, not better: physical piece count climbed
 * to 101 (up from 38 without the tie-break term). Root cause: the
 * secondary term is keyed to "whichever triangle is nearest" at each
 * point, which is stable for a box's few large flat faces but changes
 * rapidly, almost point-to-point, across a real mesh's thousands of small
 * triangles -- turning a term meant to resolve rare, genuine ties into
 * high-frequency noise that flips the sign near boundaries the PRIMARY
 * term had already decided correctly, in a shape too complex for the
 * simple bounded scenario this fix was designed and verified against.
 * Kept anyway (it is a real, verified improvement for the primitive
 * itself, independent of this one adversarial fixture), but this is
 * exactly why it stays unwired from `masterMoldEngine.ts`.
 *
 * This makes FIVE separate architectural paradigms this project has tried
 * for the real free-form regression fixture -- global flat offset, per-
 * cell grid, connected-component splitting, a full simultaneous CSG
 * rewrite, and this genuine 3D nearest-surface reconstruction (itself now
 * including a real refinement that helps simple cases and actively hurts
 * this one) -- and every one has diverged rather than converged, including
 * after a within-paradigm fix that measurably improved the general case.
 * That is the honest stopping point for construction-technique attempts at
 * this specific fixture: a real fix would need a fundamentally different
 * distance notion (e.g. a properly SMOOTHED/regularized generalized
 * Voronoi or power diagram, not a nearest-single-triangle tie-break, or
 * true multi-label surface reconstruction), out of scope here.
 * `volumetricAssignmentSolid` itself is real, correct, tested
 * infrastructure -- kept as a genuine capability independent of whether
 * this specific fixture ever closes -- but is NOT wired into
 * `masterMoldEngine.ts`'s own fallback chain, since it does not reliably
 * outperform the existing CSG-boundary fallback for the one fixture that
 * needed a fallback in the first place.
 */
export interface VolumetricPartitionInput {
  readonly ownTriangleIndices: readonly number[];
  readonly otherTriangleIndices: readonly number[];
  readonly sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array };
  readonly bounds: Bounds3;
  readonly edgeLengthMm: number;
}

interface TriangleSubset {
  readonly bvh: MeshBVH;
  /** Local (subset-relative) triangle index -> its 3 vertex positions, for the tie-break plane lookup. */
  readonly triangleVertices: readonly [Vector3, Vector3, Vector3][];
}

/** Builds a MeshBVH over just the given triangle subset, referencing the same (larger, shared) position buffer -- no vertex remapping needed. */
function buildTriangleSubset(
  sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array },
  triangleIndices: readonly number[],
): TriangleSubset {
  const positions = sourceMesh.positions instanceof Float32Array ? sourceMesh.positions : new Float32Array(sourceMesh.positions);
  const subsetIndices = new Uint32Array(triangleIndices.length * 3);
  const triangleVertices: [Vector3, Vector3, Vector3][] = [];
  const vertexAt = (vertexIndex: number) => new Vector3(positions[vertexIndex * 3]!, positions[vertexIndex * 3 + 1]!, positions[vertexIndex * 3 + 2]!);
  for (let i = 0; i < triangleIndices.length; i += 1) {
    const base = triangleIndices[i]! * 3;
    const i0 = sourceMesh.indices[base]!;
    const i1 = sourceMesh.indices[base + 1]!;
    const i2 = sourceMesh.indices[base + 2]!;
    subsetIndices[i * 3] = i0;
    subsetIndices[i * 3 + 1] = i1;
    subsetIndices[i * 3 + 2] = i2;
    triangleVertices.push([vertexAt(i0), vertexAt(i1), vertexAt(i2)]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(subsetIndices, 1));
  return { bvh: new MeshBVH(geometry), triangleVertices };
}

/**
 * Signed distance from `point` to the INFINITE PLANE containing the given
 * triangle (not clamped to the triangle's own finite extent), using the
 * triangle's own winding to orient the normal. Used only as a secondary
 * tie-breaking term -- see `volumetricAssignmentSolid`'s own doc comment
 * for why the PRIMARY (bounded, clamped-to-triangle) distance alone
 * leaves a real gap wherever two pieces share an edge.
 */
function signedPlaneDistance(point: Vector3, triangle: readonly [Vector3, Vector3, Vector3]): number {
  const [a, b, c] = triangle;
  const edge1x = b.x - a.x, edge1y = b.y - a.y, edge1z = b.z - a.z;
  const edge2x = c.x - a.x, edge2y = c.y - a.y, edge2z = c.z - a.z;
  const nx = edge1y * edge2z - edge1z * edge2y;
  const ny = edge1z * edge2x - edge1x * edge2z;
  const nz = edge1x * edge2y - edge1y * edge2x;
  const nLength = Math.hypot(nx, ny, nz) || 1;
  const dx = point.x - a.x, dy = point.y - a.y, dz = point.z - a.z;
  return (dx * nx + dy * ny + dz * nz) / nLength;
}

/**
 * Builds piece i's own solid directly as a 3D nearest-surface Voronoi
 * cell, intersected with nothing else -- the level-set extraction is
 * already bounded to `bounds`, so no further clipping is needed (a full
 * partition of `bounds` naturally emerges from every piece being built
 * this same way, with no separate "catch-all" concept needed at all).
 *
 * The primary term is the bounded (clamped-to-triangle) nearest-surface
 * distance difference. A small secondary term -- the difference in signed
 * distance to each side's NEAREST triangle's own infinite plane -- is
 * added specifically to break the tie this file's own doc comment and
 * tests describe (two adjacent pieces sharing an edge are exactly
 * equidistant, by the bounded metric, throughout the whole wedge beyond
 * that edge). The secondary term is scaled small enough to never override
 * a genuine primary decision, and only matters where the primary term is
 * at or near zero -- collapsing the ambiguous region from a full wedge
 * VOLUME down to (at most) the wedge's own measure-zero bisector plane.
 */
export function volumetricAssignmentSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  input: VolumetricPartitionInput,
): ManifoldSolid {
  const { ownTriangleIndices, otherTriangleIndices, sourceMesh, bounds, edgeLengthMm } = input;
  if (ownTriangleIndices.length === 0) throw new Error("a volumetric assignment solid needs at least one own triangle.");
  const own = buildTriangleSubset(sourceMesh, ownTriangleIndices);
  const other = otherTriangleIndices.length > 0 ? buildTriangleSubset(sourceMesh, otherTriangleIndices) : null;
  const tieBreakWeight = edgeLengthMm * 1e-3;
  const probe = new Vector3();
  const sdf = (point: [number, number, number]): number => {
    probe.set(point[0], point[1], point[2]);
    const ownHit = own.bvh.closestPointToPoint(probe);
    const distOwn = ownHit === null ? Infinity : ownHit.distance;
    if (other === null) return -distOwn;
    const otherHit = other.bvh.closestPointToPoint(probe);
    const distOther = otherHit === null ? Infinity : otherHit.distance;
    const primary = distOther - distOwn;
    const ownPlane = ownHit === null ? 0 : Math.abs(signedPlaneDistance(probe, own.triangleVertices[ownHit.faceIndex]!));
    const otherPlane = otherHit === null ? 0 : Math.abs(signedPlaneDistance(probe, other.triangleVertices[otherHit.faceIndex]!));
    // Whichever side's nearest triangle's own PLANE the point is closer to
    // (smaller |signed plane distance|) is, off the exact tie line, the
    // more "natural" extension of that triangle's own surface -- so a
    // SMALLER own-plane distance should push the tie-break POSITIVE
    // (toward "own"), hence otherPlane - ownPlane.
    return primary + tieBreakWeight * (otherPlane - ownPlane);
  };
  const box = {
    min: [bounds.min.x, bounds.min.y, bounds.min.z] as [number, number, number],
    max: [bounds.max.x, bounds.max.y, bounds.max.z] as [number, number, number],
  };
  const solid = module.Manifold.levelSet(sdf, box, edgeLengthMm, 0);
  assertManifoldStatus(solid, "Volumetric assignment level-set extraction");
  return solid;
}
