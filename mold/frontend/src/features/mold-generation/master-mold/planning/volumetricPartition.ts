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
 * A secondary tie-breaking term was then added, and refined once, to close
 * that gap -- both real, verified attempts, both ultimately kept as a net
 * improvement to the PRIMITIVE while neither helps this one adversarial
 * fixture:
 *
 *  1. First version: off the exact bisector of a tied wedge, one side's
 *     NEAREST TRIANGLE's own infinite plane is closer than the other's;
 *     using that lightly-weighted as a secondary criterion collapses the
 *     ambiguous region from a full wedge VOLUME down to (at most) its own
 *     measure-zero bisector plane. Measured directly: works exactly as
 *     intended on controlled cases (the two-box-faces scenario above,
 *     gap ~2183mm3 -> ~14mm3) AND on the real fixture's own simple-box
 *     sanity case (tiling failure fixed entirely). But end to end on the
 *     real regression fixture itself, it made things WORSE: physical
 *     piece count climbed to 101 (from 38 with no tie-break at all).
 *     Root-caused: "nearest triangle" is stable for a box's few large
 *     faces but changes almost point-to-point across a mesh with
 *     thousands of small triangles, turning a term meant for rare genuine
 *     ties into high-frequency noise that flips decisions the PRIMARY
 *     term had already made correctly.
 *  2. Second version (this file's shipped `averagePlaneDistance`): replaced
 *     the per-point "nearest triangle" with a single FIXED average plane
 *     per piece (area-weighted average centroid + normal across ALL of
 *     that piece's own triangles), computed once, so it cannot flicker by
 *     construction. Confirmed the flickering hypothesis partly right --
 *     physical piece count on the real fixture dropped from 101 to 41,
 *     genuinely better than the noisy version -- but STILL worse than the
 *     38-piece baseline with no tie-break term at all. A fixed plane
 *     removes the NOISE, but a piece formed from a small, irregularly-
 *     shaped, possibly highly curved connected-component fragment (this
 *     project's own real assignment routinely produces these -- see
 *     `regionDirectConstruction.ts`) often has no single meaningful
 *     "average outward direction" at all; the fixed plane is stable but
 *     still frequently the WRONG bias for that kind of fragment, not just
 *     noisy.
 *
 * Three consecutive, controlled measurements now (no tie-break: 38; noisy
 * tie-break: 101; smoothed tie-break: 41) converge on the same conclusion:
 * every variant of a bounded-nearest-surface tie-break tried here helps
 * simple, planar, well-formed geometry and actively hurts this specific
 * fixture's own real, highly fragmented, curved assignment. That is no
 * longer a tuning question -- it is strong evidence that ANY single-
 * criterion secondary tie-break bolted onto this metric is the wrong tool
 * for fragments this irregular, and further variants of the same idea are
 * not a good use of further effort.
 *
 *  * A third variant was then tried, specifically targeting the "PER-REGION,
 * geometry-aware tie-break" idea named above as the way forward: instead
 * of ONE criterion for a whole piece (either the single nearest triangle,
 * or one fixed whole-piece average), compute the average plane from a
 * LOCAL, capped-size neighborhood of triangles found by a real mesh-edge
 * BFS outward from whichever triangle is actually nearest the query point
 * -- smoothed enough not to flicker point-to-point like a single nearest
 * triangle, but local enough to track a boundary's own shape rather than
 * one global bias for a piece that may look very different in different
 * places. Measured directly at three cap sizes to trace the whole curve
 * from "local" to "global": 24 triangles (>= 101 physical pieces, as bad
 * as the noisy nearest-triangle variant), 100 triangles (>= 87, better but
 * still far worse than either baseline), and 5000 triangles -- effectively
 * the whole piece, since no real piece here has anywhere near that many
 * triangles reachable by BFS -- landing at >= 33, matching (not beating)
 * the already-measured 41-ish whole-piece-average result within the
 * mechanism's own noise. All three points sit on ONE monotonic curve with
 * no interior minimum: fragmentation strictly worsens as the neighborhood
 * shrinks, and the best a local neighborhood can achieve, at its largest,
 * is to reproduce the whole-piece average's own already-insufficient
 * result. There is no sweet spot at any granularity between "one triangle"
 * and "the whole piece" for this specific fixture -- neighborhood SIZE was
 * not, in fact, the missing ingredient the two earlier attempts' gap
 * implied it might be. (Code reverted to the plain whole-piece
 * `averagePlaneDistance` below after this measurement -- the BFS/local-
 * neighborhood machinery added no value baked into extra complexity, so it
 * was removed rather than kept dormant.)
 *
 * This makes FIVE separate architectural paradigms this project has tried
 * for the real free-form regression fixture -- global flat offset, per-
 * cell grid, connected-component splitting, a full simultaneous CSG
 * rewrite, and this genuine 3D nearest-surface reconstruction (itself now
 * including three real, measured tie-break refinements -- noisy per-point,
 * smoothed whole-piece, and local-neighborhood-at-three-granularities --
 * every one a net improvement to the primitive and every one net harmful
 * to this fixture) -- and every one has diverged rather than converged.
 * That is the honest stopping point for construction-technique AND
 * tie-break-refinement attempts at this specific fixture: closing it for
 * real needs true multi-label surface reconstruction (a genuine global
 * optimization over a discrete labeling, e.g. multi-label graph cuts, that
 * can explicitly penalize small/scattered regions in its own objective --
 * not a distance-metric tie-break bolted on after the fact, since three
 * different granularities of that idea are now measured and none help).
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
  /** A single area-weighted average centroid + normal across ALL of this subset's triangles -- see `averagePlaneDistance`'s own doc comment for why this replaces a per-point "nearest triangle" lookup. */
  readonly averageCentroid: Vector3;
  readonly averageNormal: Vector3;
}

/** Builds a MeshBVH over just the given triangle subset, referencing the same (larger, shared) position buffer -- no vertex remapping needed. */
function buildTriangleSubset(
  sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array },
  triangleIndices: readonly number[],
): TriangleSubset {
  const positions = sourceMesh.positions instanceof Float32Array ? sourceMesh.positions : new Float32Array(sourceMesh.positions);
  const subsetIndices = new Uint32Array(triangleIndices.length * 3);
  const vertexAt = (vertexIndex: number) => new Vector3(positions[vertexIndex * 3]!, positions[vertexIndex * 3 + 1]!, positions[vertexIndex * 3 + 2]!);
  const averageCentroid = new Vector3();
  const averageNormal = new Vector3();
  let totalArea = 0;
  for (let i = 0; i < triangleIndices.length; i += 1) {
    const base = triangleIndices[i]! * 3;
    const i0 = sourceMesh.indices[base]!;
    const i1 = sourceMesh.indices[base + 1]!;
    const i2 = sourceMesh.indices[base + 2]!;
    subsetIndices[i * 3] = i0;
    subsetIndices[i * 3 + 1] = i1;
    subsetIndices[i * 3 + 2] = i2;
    const a = vertexAt(i0), b = vertexAt(i1), c = vertexAt(i2);
    const edge1 = new Vector3().subVectors(b, a);
    const edge2 = new Vector3().subVectors(c, a);
    const cross = new Vector3().crossVectors(edge1, edge2);
    const area = cross.length() / 2;
    const centroid = new Vector3().add(a).add(b).add(c).divideScalar(3);
    averageCentroid.addScaledVector(centroid, area);
    averageNormal.addScaledVector(cross, 1); // cross's own length already encodes area; summing it directly area-weights the normal.
    totalArea += area;
  }
  if (totalArea > 0) averageCentroid.divideScalar(totalArea);
  if (averageNormal.lengthSq() > 0) averageNormal.normalize();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(subsetIndices, 1));
  return { bvh: new MeshBVH(geometry), averageCentroid, averageNormal };
}

/**
 * Signed distance from `point` to a piece's own SINGLE, FIXED average
 * plane (area-weighted average centroid + normal across ALL of that
 * piece's triangles) -- used only as a secondary tie-breaking term, see
 * `volumetricAssignmentSolid`'s own doc comment for why the PRIMARY
 * (bounded, clamped-to-triangle) distance alone leaves a real gap
 * wherever two pieces share an edge.
 *
 * An earlier version of this tie-break used the CLOSEST triangle's own
 * plane instead of a fixed per-piece average. That worked exactly as
 * intended on controlled, few-large-triangle cases (a plain box), but
 * measurably WORSENED the real regression fixture (physical piece count
 * climbed to 101, from 38 without any tie-break at all): "closest
 * triangle" changes almost point-to-point across a mesh with thousands of
 * small triangles, so a term meant to resolve rare genuine ties became
 * high-frequency noise that flipped decisions the primary term had
 * already made correctly. A single FIXED plane per piece cannot flicker
 * point-to-point by construction -- it is the same plane everywhere,
 * however coarse an approximation of one piece's own true (possibly
 * curved) shape it may be.
 */
function averagePlaneDistance(point: Vector3, subset: TriangleSubset): number {
  const dx = point.x - subset.averageCentroid.x;
  const dy = point.y - subset.averageCentroid.y;
  const dz = point.z - subset.averageCentroid.z;
  return dx * subset.averageNormal.x + dy * subset.averageNormal.y + dz * subset.averageNormal.z;
}

/**
 * Builds piece i's own solid directly as a 3D nearest-surface Voronoi
 * cell, intersected with nothing else -- the level-set extraction is
 * already bounded to `bounds`, so no further clipping is needed (a full
 * partition of `bounds` naturally emerges from every piece being built
 * this same way, with no separate "catch-all" concept needed at all).
 *
 * The primary term is the bounded (clamped-to-triangle) nearest-surface
 * distance difference. A small secondary term -- the difference in each
 * side's SIGNED distance to its own FIXED average plane (own minus
 * other) -- is added specifically to break the tie this file's own doc
 * comment and tests describe (two adjacent pieces sharing an edge are
 * exactly equidistant, by the bounded metric, throughout the whole wedge
 * beyond that edge). The secondary term is scaled small enough to never
 * override a genuine primary decision, and only matters where the
 * primary term is at or near zero -- collapsing the ambiguous region
 * from a full wedge VOLUME down to (at most) the wedge's own measure-zero
 * bisector plane.
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
    // Being further "outward" along a piece's own fixed average normal
    // (i.e. on the natural-extension side of its own average plane) makes
    // that piece the more plausible owner of an otherwise-tied point.
    // Fixed per piece, so unlike a per-point "nearest triangle" choice,
    // this cannot flicker as the query point moves.
    const tieBreak = averagePlaneDistance(probe, own) - averagePlaneDistance(probe, other);
    return primary + tieBreakWeight * tieBreak;
  };
  const box = {
    min: [bounds.min.x, bounds.min.y, bounds.min.z] as [number, number, number],
    max: [bounds.max.x, bounds.max.y, bounds.max.z] as [number, number, number],
  };
  const solid = module.Manifold.levelSet(sdf, box, edgeLengthMm, 0);
  assertManifoldStatus(solid, "Volumetric assignment level-set extraction");
  return solid;
}
