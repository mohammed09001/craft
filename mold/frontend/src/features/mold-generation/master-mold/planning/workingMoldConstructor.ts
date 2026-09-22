import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import {
  assertManifoldStatus,
  boundsFromManifold,
  createBlankSolid,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
  type ManifoldSolid,
} from "../../geometry/manifold";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { meshTopology } from "../../geometry/meshTopology";
import { hashStableValues, meshGeometryVersion } from "../../geometry/geometryFingerprint";
import { cylinderPrismPayload } from "../../geometry/meshPrimitives";
import { verifyDemoldTranslationByVector } from "../masterMoldDemold.verifier";
import type {
  PlanningVector3,
  WorkingMoldPieceTarget,
  WorkingMoldReleaseStep,
  WorkingMoldRegistrationFeature,
  WorkingMoldRegistrationPlan,
} from "./masterMoldPlanning.contracts";
import { workingMoldEnvelopeWallMm, inflatedBounds } from "./masterMoldPlanning.contracts";
import { volumetricAssignmentSolid } from "./volumetricPartition";
import { buildMultiLabelPartitionSolids } from "./multiLabelPartition";

/**
 * Execution 06 Article 08: virtual Working Mold construction.
 *
 *   Working Mold Envelope − Source Part Negative = Gross Working Mold
 *
 * The gross mold is partitioned by the selected ordered half-space prisms
 * into piece regions; the part negative is carved from each region. Every
 * piece must exactly verify: single connected watertight solid, collision-
 * free translation release against the part and the remaining assembled
 * pieces, and an assembled negative that reproduces the part cavity exactly.
 * This is the late exact-CSG stage: planning has already reduced candidates.
 */

/** Sweep safety margin over the envelope extent along the release direction. */
const RELEASE_SWEEP_SAFETY_FACTOR = 1.1;
const REGISTRATION_PIN_SEGMENTS = 16;
const REGISTRATION_PIN_RADIUS_MM = 2.5;
/** Pin-center offsets from the interface center, as envelope-span fractions. */
const REGISTRATION_PIN_INSET_FRACTIONS = [-0.3, 0, 0.3] as const;

export interface PlannedPieceRegion {
  /** Unit release direction of this piece. */
  readonly releaseDirection: PlanningVector3;
  /** Parting plane (unit direction + offset): piece occupies dot(p,d) >= offset minus earlier pieces. null for the catch-all remainder. */
  readonly plane: { readonly direction: PlanningVector3; readonly offsetMm: number } | null;
  /**
   * Execution 08 LOOP 14: a height-field cutting tool -- `plane`'s own flat
   * cut everywhere except near this piece's own real parting curve(s) (from
   * the planning-level patch assignment, Loop 13's ordered/simplified
   * curves), where the true curve's own per-point height is followed
   * instead. `plane` MUST still be supplied alongside `curve`, not null:
   * the height field's far field, and its fallback if this piece is
   * rejected, are both the flat cut. Registration-pin placement (which
   * reuses `plane`) still lands correctly almost everywhere, since pins are
   * placed away from the part by design.
   *
   * One entry per NEIGHBOR this piece borders: a piece with a single
   * neighbor supplies one curve group (`heightFieldPartingSolid`); a piece
   * bordering several neighbors supplies one group per neighbor
   * (`multiNeighborHeightFieldSolid`, one independent local correction per
   * group -- their own local footprints must not overlap). Each group must
   * be this piece's FULL boundary against that ONE neighbor, which is only
   * guaranteed to be one simple closed loop per neighbor, not per piece.
   */
  readonly curve?: readonly (readonly PlanningVector3[])[] | null;
  /**
   * Execution 08 LOOP 14: this piece's own real per-patch assignment
   * (`ownPoints`) and every OTHER piece's (`otherPoints`) -- driven
   * directly by the real assignment, not by a single global flat offset.
   * When EVERY non-last piece in a `constructWorkingMold` call carries
   * this (and the last has `plane: null`), the whole call switches to the
   * simultaneous, order-independent partition construction mode (each
   * piece built directly via `localBoundedAssignmentSolid`, not the
   * sequential remainder-carving loop) -- see that function's and
   * `constructWorkingMold`'s own doc comments for why. `otherPoints` is
   * symmetric in that mode: ALL other pieces, not just later ones, since
   * there is no carving order to make "later" meaningful.
   */
  readonly grid?: {
    readonly ownPoints: readonly PlanningVector3[];
    readonly otherPoints: readonly PlanningVector3[];
    /**
     * The largest own patch's own equivalent radius (`sqrt(areaMm2 / PI)`).
     * `localBoundedAssignmentSolid`'s footprint is built from patch
     * CENTROIDS, which sit strictly inside each triangle -- on a coarsely
     * triangulated mesh (a handful of large patches), centroid-to-centroid
     * spread alone badly underestimates the real surface extent (measured:
     * a simple box's own top-half claim came out at 1445 of an expected
     * ~5324). This inflates the footprint radius enough to comfortably
     * cover each own patch's actual triangle, not just its centroid.
     */
    readonly ownPatchRadiusMm: number;
  } | null;
  /**
   * Execution 08 LOOP 02/14/28 (volumetric reconstruction): this piece's
   * own assigned patch centroids (`ownPoints`) and every OTHER physical
   * piece's (`otherPoints`), built into a genuine 3D nearest-patch
   * partition via `volumetricAssignmentSolid` (see that function's own
   * doc comment for the full mechanism and why it replaces every
   * CSG-boundary construction mode this file also offers). When EVERY
   * piece in a `constructWorkingMold` call carries this, the whole call
   * switches to the volumetric partition construction mode -- no
   * `plane`/`grid`/`curve` needed at all, and no catch-all: a real 3D
   * Voronoi-style partition already covers the whole envelope by
   * construction, so every piece, including what would be "the last one"
   * in every other mode this file supports, is built the exact same way.
   */
  readonly volumetric?: { readonly ownTriangleIndices: readonly number[]; readonly otherTriangleIndices: readonly number[] } | null;
  /**
   * Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
   * this piece's own assigned triangles, solved JOINTLY with every other
   * piece via `buildMultiLabelPartitionSolids` -- a discrete voxel
   * labeling with an ICM/Potts-model smoothness term that directly
   * penalizes a voxel disagreeing with its neighbors (see that function's
   * and `multiLabelReconstruction.ts`'s own doc comments for the full
   * mechanism). Unlike `volumetric` above (each piece built independently,
   * compared only to a merged "everyone else"), this is inherently a
   * single joint computation across every piece at once -- when EVERY
   * piece in a `constructWorkingMold` call carries this, the whole call
   * switches to the multi-label partition construction mode, computes all
   * pieces' solids in ONE call, and distributes them positionally.
   */
  readonly multiLabel?: { readonly ownTriangleIndices: readonly number[] } | null;
}

export interface WorkingMoldConstructionInput {
  readonly sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array };
  readonly sourceBounds: Bounds3;
  readonly releaseClearanceMm: number;
  readonly minimumToolingWallMm: number;
  readonly pieces: readonly PlannedPieceRegion[];
  /**
   * Execution 08 LOOP 02/14/28 (multi-label release-direction gap, full
   * candidate broadening): additional release-direction candidates every
   * piece may try if its own assigned direction fails (see
   * `verifyWorkingMoldRelease`'s own doc comment for the original,
   * narrower version of this idea -- every other piece's own direction).
   * Optional and unused by default; every existing call site is
   * unaffected. Set by `masterMoldEngine.ts`'s multi-label fallback to the
   * FULL planning candidate-direction set (not just the pieces actually
   * used), so a release failure genuinely means "no direction in the
   * entire planning search releases this piece", not just "the 9 other
   * pieces' own directions do not" -- the stronger, principle-10-honest
   * standard before calling anything a physical constraint rather than a
   * search-budget artifact.
   */
  readonly extraReleaseDirections?: readonly PlanningVector3[] | null;
  /**
   * Execution 08 LOOP 02/14/28 (release-ORDER search): when true, release
   * verification searches over removal ORDER, not just per-piece
   * direction -- see `verifyWorkingMoldRelease`'s own `useGreedyReleaseOrder`
   * doc comment for the full mechanism and why it is a genuinely different
   * question from `extraReleaseDirections`. Deliberately NOT the default
   * for any mode, including multi-label: measured directly, this is
   * computationally impractical for anything but a small piece count (an
   * O(n^2) search, and a real 10-piece attempt did not complete in 15+
   * minutes) -- only opt in when a caller specifically wants to try
   * harder for one stuck piece and can tolerate that cost, never as a
   * blanket default that would slow down every already-working case.
   */
  readonly useGreedyReleaseOrder?: boolean;
}

export interface WorkingMoldConstructionOutput {
  readonly pieces: readonly WorkingMoldPieceTarget[];
  readonly releaseSequence: readonly WorkingMoldReleaseStep[];
  readonly registrationPlan: WorkingMoldRegistrationPlan;
  /** Execution 08 LOOP 35 (audit fix): total release-direction candidates the final release verification swept across every piece -- real "release sweeps" telemetry (Section 35's own tracking list). */
  readonly releaseSweepCount: number;
}

export interface OrthonormalBasis {
  readonly u: PlanningVector3;
  readonly v: PlanningVector3;
  readonly w: PlanningVector3;
}

/** Deterministic right-handed orthonormal basis with w as the given unit direction. */
export function basisAround(w: PlanningVector3): OrthonormalBasis {
  const reference = Math.abs(w.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = {
    x: reference.y * w.z - reference.z * w.y,
    y: reference.z * w.x - reference.x * w.z,
    z: reference.x * w.y - reference.y * w.x,
  };
  const uLength = Math.hypot(u.x, u.y, u.z);
  u.x /= uLength;
  u.y /= uLength;
  u.z /= uLength;
  const v = {
    x: w.y * u.z - w.z * u.y,
    y: w.z * u.x - w.x * u.z,
    z: w.x * u.y - w.y * u.x,
  };
  return { u, v, w };
}

/**
 * Explicit hexahedron payload for the half-space { p : dot(p, w) >= offset },
 * expanded well past `bounds` so intersecting with the envelope is exact.
 * Corner layout matches the repository's standard box indexing.
 */
export function halfSpacePrismPayload(
  direction: PlanningVector3,
  offsetMm: number,
  bounds: Bounds3,
): MoldMeshPayload {
  const { u, v, w } = basisAround(direction);
  const diagonal = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const radius = diagonal * 0.75 + 1;
  const depth = diagonal * 1.5 + 2;
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const along = w.x * center.x + w.y * center.y + w.z * center.z;
  const faceCenter = {
    x: center.x + w.x * (offsetMm - along),
    y: center.y + w.y * (offsetMm - along),
    z: center.z + w.z * (offsetMm - along),
  };
  const corner = (iu: number, iv: number, iw: number): number[] => [
    faceCenter.x + u.x * radius * iu + v.x * radius * iv + w.x * depth * iw,
    faceCenter.y + u.y * radius * iu + v.y * radius * iv + w.y * depth * iw,
    faceCenter.z + u.z * radius * iu + v.z * radius * iv + w.z * depth * iw,
  ];
  const positions = [
    ...corner(-1, -1, 0), ...corner(1, -1, 0), ...corner(1, 1, 0), ...corner(-1, 1, 0),
    ...corner(-1, -1, 1), ...corner(1, -1, 1), ...corner(1, 1, 1), ...corner(-1, 1, 1),
  ];
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  return { positions, indices };
}

/**
 * Execution 08 LOOP 14: a "ruled surface" solid -- the piece's own REAL
 * parting curve (Loop 13's ordered, simplified curve extracted from the
 * planning-level patch assignment, not a half-space plane search result),
 * projected onto the plane perpendicular to `direction` and extruded far
 * enough to span the whole envelope.
 *
 * NOT a drop-in replacement for `halfSpacePrismPayload` in
 * `remainder.intersect(...)`/`remainder.subtract(...)` carving, despite the
 * resemblance -- this is bounded to the curve's own (u, v) footprint, while
 * a flat half-space plane is unbounded in the plane perpendicular to
 * `direction` and so correctly reaches the mold envelope's WALL material far
 * from the part. Naively substituting this for the plane excludes all of
 * that far-field material (measured directly: a piece roughly 4.5x smaller
 * than the flat plane's own cut of the same envelope, which then correctly
 * failed release verification). A general fix needs the parting surface to
 * follow the curve's real 3D shape NEAR the part while reverting to the
 * flat plane's own offset FAR from it -- a height field varying over (u, v),
 * which a single flat 2D polygon extrusion cannot represent (a
 * locally-corrected CSG composition -- flat plane outside the curve's
 * footprint, this extrusion inside it -- was attempted and produced
 * volume-correct but topologically fragmented, disconnected pieces:
 * "inside the curve's own polygon, for all sweep heights" is not the same
 * shape as "beyond the true curved boundary at each (u, v)"). Not yet wired
 * into `constructWorkingMold`; this primitive is tested here in isolation
 * as real, verified infrastructure for that further work.
 *
 * The curve is treated as ONE simple closed loop in the plane perpendicular
 * to `direction` (its own points projected there, implicitly closed back to
 * the first point) -- multi-loop/disconnected boundaries are not supported
 * here (Loop 13's own curve extraction assumes a single loop too). The
 * caller must reject a `selfIntersecting` curve before calling this: a
 * self-intersecting projection is not a simple polygon and Manifold's
 * `CrossSection` construction requires one.
 */
export function ruledPartingSurfaceSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  curvePoints: readonly PlanningVector3[],
  direction: PlanningVector3,
  bounds: Bounds3,
): ManifoldSolid {
  if (curvePoints.length < 3) throw new Error("a ruled parting surface needs at least 3 curve points.");
  const { u, v, w } = basisAround(direction);
  const diagonal = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const height = diagonal * 1.5 + 2;

  const polygon: [number, number][] = curvePoints.map((point) => [
    point.x * u.x + point.y * u.y + point.z * u.z,
    point.x * v.x + point.y * v.y + point.z * v.z,
  ]);

  const crossSection = new module.CrossSection([polygon], "NonZero");
  let extruded: ManifoldSolid | null = null;
  try {
    // scaleTop MUST be an explicit [1, 1] Vec2, not the bare number 1: the
    // manifold-3d WASM binding's number overload for this parameter does not
    // broadcast the way its own declared type suggests -- it silently halves
    // the resulting volume (reproduced directly against a known 10x10x10 box:
    // bare `1` gives volume 500, `[1, 1]` gives the correct 1000).
    extruded = module.Manifold.extrude(crossSection, height, 0, 0, [1, 1], true);
    assertManifoldStatus(extruded, "Ruled parting-surface extrusion");
    // Column-major 4x4: maps the extrusion's local (x,y,z) onto the world
    // basis (u,v,w) built around `direction` -- local Z (the extrude axis)
    // becomes the release direction, matching `halfSpacePrismPayload`'s own
    // use of `basisAround`. No translation: the polygon's own coordinates
    // are already absolute world-frame dot products, not offsets from a
    // moving local origin.
    const rotation: [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ] = [
      u.x, u.y, u.z, 0,
      v.x, v.y, v.z, 0,
      w.x, w.y, w.z, 0,
      0, 0, 0, 1,
    ];
    const transformed = extruded.transform(rotation);
    assertManifoldStatus(transformed, "Ruled parting-surface transform");
    return transformed;
  } finally {
    crossSection.delete();
    extruded?.delete();
  }
}

/**
 * Execution 08 LOOP 14: a genuine height-field cutting tool -- the correct
 * fix `ruledPartingSurfaceSolid` alone could not provide (see its own doc
 * comment for why a flat 2D polygon extrusion cannot replace a half-space
 * plane). The lower boundary of this solid is a real surface that follows
 * the curve's own actual per-point height NEAR the part, and is EXACTLY
 * `flatOffsetMm` (the flat plane's own value) at and beyond a generous
 * outer radius -- so it is a genuine drop-in replacement for
 * `halfSpacePrismPayload` in `remainder.intersect(...)` /
 * `remainder.subtract(...)` carving: identical to the flat plane far from
 * the part, following the real (possibly non-planar) boundary near it.
 *
 * Built as one explicit, watertight mesh (not a boolean composition of
 * separate tools, which an earlier attempt found produces a gap and
 * fragmented pieces):
 *   - a fan cap from the curve's own centroid to the curve loop, each
 *     triangle carrying the curve's own real per-point height (the wavy
 *     "floor" near the part);
 *   - a collar strip connecting the curve loop to a circle of the same
 *     angular sampling at a generous outer radius, height 0 (flat, matching
 *     the plane) -- closing the gap between the curve's real shape and the
 *     flat far field with NO seam;
 *   - a cylindrical side wall from that outer circle up to a ceiling circle
 *     far above (matching `halfSpacePrismPayload`'s own oversized "depth"
 *     convention for an effectively unbounded half-space), and a flat
 *     ceiling cap.
 *
 * Requires the curve to be star-shaped around its own centroid when
 * projected onto the plane perpendicular to `flatDirection` (points are
 * explicitly re-sorted by angle around that centroid before building the
 * fan/collar, regardless of the curve's own stored order, to guarantee
 * this): a real single-loop parting curve around one piece's own moldable
 * region satisfies this in the cases this loop targets. A curve that
 * doubles back on itself in angle (not star-shaped) would produce
 * self-intersecting fan triangles -- `selfIntersecting` from Loop 13's own
 * curve extraction is a necessary but not sufficient guard for that; the
 * caller should treat a `NoError`-but-implausible-volume result here as a
 * signal to fall back to the flat plane.
 *
 * `outerRadiusMm`: how far out the collar reaches before the surface is
 * EXACTLY flat (`flatOffsetMm`). Left unset, it defaults to comfortably
 * spanning the whole envelope (a genuine drop-in half-space replacement).
 * `multiNeighborHeightFieldSolid` passes an explicit, much smaller radius
 * instead, so several single-curve solids like this one can be composed
 * as independent LOCAL corrections (each one is exactly flat at ITS OWN
 * `outerRadiusMm`, so composing several together never leaves a seam).
 */
export function heightFieldPartingSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  curvePoints: readonly PlanningVector3[],
  flatDirection: PlanningVector3,
  flatOffsetMm: number,
  bounds: Bounds3,
  toleranceMm: number,
  outerRadiusMm?: number,
): ManifoldSolid {
  if (curvePoints.length < 3) throw new Error("a height-field parting surface needs at least 3 curve points.");
  const { u, v, w } = basisAround(flatDirection);

  const local = curvePoints.map((point) => ({
    pu: point.x * u.x + point.y * u.y + point.z * u.z,
    pv: point.x * v.x + point.y * v.y + point.z * v.z,
    h: point.x * w.x + point.y * w.y + point.z * w.z - flatOffsetMm,
  }));
  const centroidU = local.reduce((sum, point) => sum + point.pu, 0) / local.length;
  const centroidV = local.reduce((sum, point) => sum + point.pv, 0) / local.length;
  const centroidH = local.reduce((sum, point) => sum + point.h, 0) / local.length;

  const sorted = [...local].sort(
    (a, b) => Math.atan2(a.pv - centroidV, a.pu - centroidU) - Math.atan2(b.pv - centroidV, b.pu - centroidU),
  );
  let maxCurveRadius = 0;
  for (const point of sorted) {
    const radius = Math.hypot(point.pu - centroidU, point.pv - centroidV);
    if (radius > maxCurveRadius) maxCurveRadius = radius;
  }

  const diagonal = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const outerRadius = outerRadiusMm ?? diagonal + maxCurveRadius + 1;
  if (outerRadius <= maxCurveRadius) {
    throw new Error("a height-field parting surface's outer radius must comfortably exceed the curve's own extent.");
  }
  const depth = diagonal * 1.5 + 2;

  const positions: number[] = [];
  const pushVertex = (pu: number, pv: number, hRelative: number): number => {
    const height = flatOffsetMm + hRelative;
    positions.push(
      u.x * pu + v.x * pv + w.x * height,
      u.y * pu + v.y * pv + w.y * height,
      u.z * pu + v.z * pv + w.z * height,
    );
    return positions.length / 3 - 1;
  };

  const centerIndex = pushVertex(centroidU, centroidV, centroidH);
  const n = sorted.length;
  const curveIndices: number[] = new Array(n);
  const outerIndices: number[] = new Array(n);
  const ceilingOuterIndices: number[] = new Array(n);
  const angles: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const point = sorted[i]!;
    angles[i] = Math.atan2(point.pv - centroidV, point.pu - centroidU);
    curveIndices[i] = pushVertex(point.pu, point.pv, point.h);
  }
  for (let i = 0; i < n; i += 1) {
    const outerU = centroidU + Math.cos(angles[i]!) * outerRadius;
    const outerV = centroidV + Math.sin(angles[i]!) * outerRadius;
    outerIndices[i] = pushVertex(outerU, outerV, 0);
    ceilingOuterIndices[i] = pushVertex(outerU, outerV, depth);
  }
  const ceilingCenterIndex = pushVertex(centroidU, centroidV, depth);

  const indices: number[] = [];
  const addTri = (a: number, b: number, c: number) => indices.push(a, b, c);
  const addQuad = (a: number, b: number, c: number, d: number) => {
    addTri(a, b, c);
    addTri(a, c, d);
  };
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    // Fan cap (the wavy floor near the part).
    addTri(centerIndex, curveIndices[next]!, curveIndices[i]!);
    // Collar (curve loop -> flat outer circle, no seam).
    addQuad(curveIndices[i]!, curveIndices[next]!, outerIndices[next]!, outerIndices[i]!);
    // Side wall (outer circle -> ceiling circle).
    addQuad(outerIndices[i]!, outerIndices[next]!, ceilingOuterIndices[next]!, ceilingOuterIndices[i]!);
    // Ceiling cap (flat, opposite winding to the fan cap).
    addTri(ceilingCenterIndex, ceilingOuterIndices[i]!, ceilingOuterIndices[next]!);
  }

  const solid = manifoldFromPayload(module, { positions, indices }, toleranceMm);
  // The winding convention above is empirically verified (workingMoldConstructor.loop14.test.ts)
  // to produce outward-facing normals (positive volume); a negative volume
  // here would mean every triangle above needs its last two indices swapped.
  assertManifoldStatus(solid, "Height-field parting-surface construction");
  if (solid.volume() < 0) {
    solid.delete();
    throw new Error("height-field parting surface produced an inward-facing (negative-volume) solid.");
  }
  return solid;
}

/**
 * Execution 08 LOOP 14, multi-neighbor increment: a piece bordering SEVERAL
 * other pieces has a boundary that is not one simple loop in general --
 * `heightFieldPartingSolid` alone only handles a single neighbor. This
 * composes one independent LOCAL correction per neighbor's own real
 * parting curve onto a shared flat base, instead of attempting one general
 * multi-loop triangulation (a full constrained 2D triangulation problem):
 * for each curve, subtract a small local footprint circle (centered on
 * that curve's own centroid, radius comfortably beyond its own extent)
 * from the accumulated tool, and add back a `heightFieldPartingSolid` for
 * that SAME curve built with `outerRadiusMm` set to that SAME radius --
 * `heightFieldPartingSolid` is then, by construction, EXACTLY
 * `flatOffsetMm` at that radius, identical to the flat base there, so the
 * seam between the subtracted footprint and the added correction cannot
 * gap (the mismatch that fragmented an earlier attempt at this).
 *
 * Requires each curve's own local footprint to not overlap any other
 * curve's -- true whenever the neighbors are genuinely separate regions of
 * the piece's boundary, which is the case this increment targets. Curves
 * are applied in order without checking pairwise overlap; an unexpectedly
 * close pair would surface as a real construction/release failure
 * downstream (never silently wrong geometry), the same safety net every
 * other fallback in this file relies on.
 *
 * What this DOES guarantee (verified: workingMoldConstructor.loop14.test.ts,
 * and against a real fixture's own real curves in
 * workingMoldConstructor.loop14.integration.test.ts): a watertight,
 * single-connected solid that exactly partitions the envelope with its
 * flat-plane far field intact. What it does NOT guarantee: that the
 * resulting surface is monotonic enough along the release direction for
 * a straight-line pull to actually clear it -- checked directly against
 * that same real fixture, full release verification through
 * `constructWorkingMold`'s complete pipeline failed for a curve with real
 * geometric complexity (64+ points), even though this tool's own topology
 * was valid. The caller (masterMoldEngine.ts's fallback) treats this as a
 * best-effort retry inside a try/catch and falls through to ordinary
 * piece-count escalation on failure -- never a silent wrong result, but
 * also not a guarantee this closes every case it is tried against.
 */
export function multiNeighborHeightFieldSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  curveGroups: readonly (readonly PlanningVector3[])[],
  flatDirection: PlanningVector3,
  flatOffsetMm: number,
  bounds: Bounds3,
  toleranceMm: number,
): ManifoldSolid {
  if (curveGroups.length === 0) throw new Error("multiNeighborHeightFieldSolid needs at least one curve.");
  const { u, v } = basisAround(flatDirection);
  const CIRCLE_SEGMENTS = 32;

  let tool = manifoldFromPayload(module, halfSpacePrismPayload(flatDirection, flatOffsetMm, bounds), toleranceMm);
  try {
    for (const curvePoints of curveGroups) {
      if (curvePoints.length < 3) throw new Error("a height-field parting surface needs at least 3 curve points.");
      const local = curvePoints.map((point) => ({
        pu: point.x * u.x + point.y * u.y + point.z * u.z,
        pv: point.x * v.x + point.y * v.y + point.z * v.z,
      }));
      // Matches heightFieldPartingSolid's own centroid convention (the
      // average of the curve's points) exactly -- the footprint circle
      // built here and that function's own outer boundary must be
      // concentric for the seam between them to close with no gap.
      const centroidU = local.reduce((sum, point) => sum + point.pu, 0) / local.length;
      const centroidV = local.reduce((sum, point) => sum + point.pv, 0) / local.length;
      let maxCurveRadius = 0;
      for (const point of local) {
        const radius = Math.hypot(point.pu - centroidU, point.pv - centroidV);
        if (radius > maxCurveRadius) maxCurveRadius = radius;
      }
      const localRadius = maxCurveRadius * 2 + toleranceMm * 8 + 1;

      const footprintCircle: PlanningVector3[] = Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
        const angle = (index / CIRCLE_SEGMENTS) * Math.PI * 2;
        const pu = centroidU + Math.cos(angle) * localRadius;
        const pv = centroidV + Math.sin(angle) * localRadius;
        return { x: u.x * pu + v.x * pv, y: u.y * pu + v.y * pv, z: u.z * pu + v.z * pv };
      });

      let footprintSolid: ManifoldSolid | null = null;
      let localHeightField: ManifoldSolid | null = null;
      let toolMinusFootprint: ManifoldSolid | null = null;
      try {
        footprintSolid = ruledPartingSurfaceSolid(module, footprintCircle, flatDirection, bounds);
        localHeightField = heightFieldPartingSolid(module, curvePoints, flatDirection, flatOffsetMm, bounds, toleranceMm, localRadius);
        toolMinusFootprint = tool.subtract(footprintSolid);
        const composed = toolMinusFootprint.add(localHeightField);
        assertManifoldStatus(composed, "Multi-neighbor height-field composition");
        tool.delete();
        tool = composed;
      } finally {
        footprintSolid?.delete();
        localHeightField?.delete();
        toolMinusFootprint?.delete();
      }
    }
    return tool;
  } catch (error) {
    tool.delete();
    throw error;
  }
}

/**
 * Execution 08 LOOP 14 (simultaneous-partition rewrite): given a BASE
 * cutting-tool solid already built (`localBoundedAssignmentSolid`'s own
 * local footprint, the only caller now that `grid` always routes through
 * the simultaneous partition mode -- an earlier flat-half-space-based
 * caller, `assignmentGridPartingSolid`, is gone; see
 * `buildDirectAssignmentConstructionPieces`'s and this file's own carving
 * doc comments for that history), drills the same local "give-back"
 * exclusions -- one full-height (well, near-side-bounded) cylinder per
 * cluster of `otherPoints` the base solid would otherwise wrongly claim
 * (`point.h >= flatOffsetMm`). Consumes and returns ownership of `base`
 * (deletes it on both the normal and error paths).
 */
function applyStolenMaterialExclusions(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  base: ManifoldSolid,
  otherPoints: readonly PlanningVector3[],
  direction: PlanningVector3,
  flatOffsetMm: number,
  bounds: Bounds3,
  toleranceMm: number,
): ManifoldSolid {
  const { u, v, w } = basisAround(direction);
  const project = (point: PlanningVector3) => ({
    pu: point.x * u.x + point.y * u.y + point.z * u.z,
    pv: point.x * v.x + point.y * v.y + point.z * v.z,
    h: point.x * w.x + point.y * w.y + point.z * w.z,
  });

  let tool = base;
  const stolen = otherPoints.map(project).filter((point) => point.h >= flatOffsetMm);
  if (stolen.length === 0) return tool;

  // Characteristic spacing among the stolen points themselves, to cluster
  // by proximity without a hardcoded radius: two stolen points closer than
  // a few multiples of this spacing belong to the same real cluster of
  // material, further apart belong to different (possibly unrelated)
  // clusters that should get their own independent, tightly-fitted
  // exclusion instead of one giant one spanning both.
  let stolenUMin = Infinity, stolenUMax = -Infinity, stolenVMin = Infinity, stolenVMax = -Infinity;
  for (const point of stolen) {
    if (point.pu < stolenUMin) stolenUMin = point.pu;
    if (point.pu > stolenUMax) stolenUMax = point.pu;
    if (point.pv < stolenVMin) stolenVMin = point.pv;
    if (point.pv > stolenVMax) stolenVMax = point.pv;
  }
  const stolenArea = Math.max(stolenUMax - stolenUMin, 1e-6) * Math.max(stolenVMax - stolenVMin, 1e-6);
  const stolenSpacing = Math.sqrt(stolenArea / stolen.length);
  const clusterLinkRadius = Math.max(stolenSpacing * 4, toleranceMm * 16, 1e-3);
  const clusterLinkRadiusSq = clusterLinkRadius * clusterLinkRadius;

  // Union-find clustering by in-plane proximity (O(n^2), fine for the
  // hundreds of points this deals with).
  const parent = stolen.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    let current = index;
    while (parent[current] !== root) {
      const next = parent[current]!;
      parent[current] = root;
      current = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  };
  for (let i = 0; i < stolen.length; i += 1) {
    for (let j = i + 1; j < stolen.length; j += 1) {
      const du = stolen[i]!.pu - stolen[j]!.pu;
      const dv = stolen[i]!.pv - stolen[j]!.pv;
      if (du * du + dv * dv <= clusterLinkRadiusSq) union(i, j);
    }
  }
  const clusters = new Map<number, { pu: number; pv: number; h: number }[]>();
  for (let i = 0; i < stolen.length; i += 1) {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push({ pu: stolen[i]!.pu, pv: stolen[i]!.pv, h: stolen[i]!.h });
    clusters.set(root, list);
  }

  try {
    for (const cluster of clusters.values()) {
      const centroidU = cluster.reduce((sum, point) => sum + point.pu, 0) / cluster.length;
      const centroidV = cluster.reduce((sum, point) => sum + point.pv, 0) / cluster.length;
      let maxRadius = 0;
      let clusterHMin = Infinity;
      let clusterHMax = -Infinity;
      for (const point of cluster) {
        const radius = Math.hypot(point.pu - centroidU, point.pv - centroidV);
        if (radius > maxRadius) maxRadius = radius;
        if (point.h < clusterHMin) clusterHMin = point.h;
        if (point.h > clusterHMax) clusterHMax = point.h;
      }
      const radiusMm = maxRadius + toleranceMm * 8 + 1e-3;
      // Bounded on the NEAR side only (just below the stolen material's
      // own shallowest point, plus margin): this piece's own real surface
      // can pass through the SAME in-plane column at a shallower height (a
      // fold or wrap-around in a free-form shape), and drilling that too
      // would strip legitimate material and split the piece (found
      // empirically: an unbounded-both-sides version left 2 of 5 pieces
      // fragmented). Left UNBOUNDED on the far side, out past the whole
      // envelope: everything beyond a later piece's own surface, in the
      // SAME direction the flat half-space itself was already claiming,
      // genuinely belongs to that later piece too (matching the convention
      // a piece's own flat offset already uses -- "everything beyond my
      // shallowest point is mine"), not just the thin slab at its exact
      // height (bounding both sides was tried and measurably under-
      // excludes: real wall material beyond the stolen patches stayed
      // wrongly claimed, and pieces roughly doubled in volume).
      const diagonal = Math.hypot(
        bounds.max.x - bounds.min.x,
        bounds.max.y - bounds.min.y,
        bounds.max.z - bounds.min.z,
      );
      const marginH = Math.max(toleranceMm * 8, (clusterHMax - clusterHMin) * 0.2, 1e-3);
      const hLow = clusterHMin - marginH;
      const hHigh = flatOffsetMm + diagonal * 1.5 + 2;
      const centerAlong = (hLow + hHigh) / 2;
      const lengthMm = hHigh - hLow;
      const centerPoint = {
        x: u.x * centroidU + v.x * centroidV + w.x * centerAlong,
        y: u.y * centroidU + v.y * centroidV + w.y * centerAlong,
        z: u.z * centroidU + v.z * centroidV + w.z * centerAlong,
      };
      const exclusionPayload = cylinderPrismPayload(direction, centerPoint, radiusMm, lengthMm, 24);
      const exclusionSolid = manifoldFromPayload(module, exclusionPayload, toleranceMm);
      try {
        const next = tool.subtract(exclusionSolid);
        assertManifoldStatus(next, "Assignment-exclusion parting-surface subtraction");
        tool.delete();
        tool = next;
      } finally {
        exclusionSolid.delete();
      }
    }
    return tool;
  } catch (error) {
    tool.delete();
    throw error;
  }
}

/**
 * Execution 08 LOOP 14 (simultaneous-partition rewrite): a piece's cutting
 * tool bounded to its OWN local footprint from the start, instead of an
 * infinite flat half-space corrected after the fact by exclusions.
 *
 * Diagnosed against the real free-form regression fixture: the flat-plane-
 * plus-exclusions model (`assignmentGridPartingSolid`) works well when a
 * piece's own territory is most of its half-space, but for a piece with a
 * small or scattered territory surrounded by many OTHER pieces' patches, it
 * still starts from "claim (almost) everything" and drills enough holes to
 * give most of it back -- a fragile shape (verified: pieces this happens to
 * fragment into multiple disconnected components even with per-cluster
 * exclusions correctly computed). Building the piece's own local extent
 * DIRECTLY, instead of subtracting it out of a much bigger claim, removes
 * that fragility at the source.
 *
 * This is also the basis of the simultaneous (order-independent) partition
 * this loop introduces: because each piece's tool is bounded to its OWN
 * local footprint, computing all pieces' raw claims INDEPENDENTLY (using
 * ALL other pieces' patches as `otherPoints`, not just later ones) no
 * longer risks one piece unboundedly claiming another's whole territory the
 * way two independently-computed infinite half-spaces could -- residual
 * overlap, if any, is small and local, safely resolved by a single
 * deterministic subtraction pass afterward (see the construction call
 * site) instead of a fragile, order-dependent sequential carve.
 *
 * Built as: a cylinder around `ownPoints`' own in-plane footprint (centroid
 * + max radius + margin), spanning comfortably beyond the whole envelope
 * both ways along `direction`, intersected with the flat half-space
 * `dot(p, direction) >= flatOffsetMm` (`flatOffsetMm` is still the minimum
 * projection of `ownPoints` -- it says how deep this piece's own material
 * reaches, exactly as it always has); then the same per-cluster exclusion
 * treatment (`applyStolenMaterialExclusions`, shared with this file's
 * curve- and flat-based tools) for any `otherPoints` that still fall
 * within that bounded footprint.
 */
export function localBoundedAssignmentSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  ownPoints: readonly PlanningVector3[],
  otherPoints: readonly PlanningVector3[],
  direction: PlanningVector3,
  bounds: Bounds3,
  toleranceMm: number,
  ownPatchRadiusMm: number,
): ManifoldSolid {
  if (ownPoints.length === 0) throw new Error("a local-bounded assignment solid needs at least one own patch point.");
  const { u, v, w } = basisAround(direction);
  const project = (point: PlanningVector3) => ({
    pu: point.x * u.x + point.y * u.y + point.z * u.z,
    pv: point.x * v.x + point.y * v.y + point.z * v.z,
    h: point.x * w.x + point.y * w.y + point.z * w.z,
  });
  const own = ownPoints.map(project);

  const centroidU = own.reduce((sum, point) => sum + point.pu, 0) / own.length;
  const centroidV = own.reduce((sum, point) => sum + point.pv, 0) / own.length;
  let maxRadius = 0;
  let flatOffsetMm = Infinity;
  for (const point of own) {
    const radius = Math.hypot(point.pu - centroidU, point.pv - centroidV);
    if (radius > maxRadius) maxRadius = radius;
    if (point.h < flatOffsetMm) flatOffsetMm = point.h;
  }
  flatOffsetMm -= 1e-4;
  // `ownPatchRadiusMm` (largest own patch's own equivalent radius) covers
  // the gap between "own patches' CENTROIDS reach this far" and "own
  // patches' actual TRIANGLES reach this far" -- see PlannedPieceRegion's
  // own `grid.ownPatchRadiusMm` doc comment for the measured box-fixture
  // regression this fixes.
  const footprintRadiusMm = maxRadius + ownPatchRadiusMm * 2 + toleranceMm * 8 + Math.max(maxRadius * 0.15, 1e-3);

  const diagonal = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const boundsCenter = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const centerAlong = boundsCenter.x * w.x + boundsCenter.y * w.y + boundsCenter.z * w.z;
  const footprintCenter = {
    x: u.x * centroidU + v.x * centroidV + w.x * centerAlong,
    y: u.y * centroidU + v.y * centroidV + w.y * centerAlong,
    z: u.z * centroidU + v.z * centroidV + w.z * centerAlong,
  };
  const footprintPayload = cylinderPrismPayload(direction, footprintCenter, footprintRadiusMm, diagonal * 4 + 4, 24);
  const footprintSolid = manifoldFromPayload(module, footprintPayload, toleranceMm);
  const flatPayload = halfSpacePrismPayload(direction, flatOffsetMm, bounds);
  const flatSolid = manifoldFromPayload(module, flatPayload, toleranceMm);
  let base: ManifoldSolid;
  try {
    base = footprintSolid.intersect(flatSolid);
    assertManifoldStatus(base, "Local-bounded assignment footprint intersection");
  } finally {
    footprintSolid.delete();
    flatSolid.delete();
  }
  return applyStolenMaterialExclusions(module, base, otherPoints, direction, flatOffsetMm, bounds, toleranceMm);
}

/** Explicit n-gon prism payload (registration pin) along `direction`, centered on `center` spanning ±length/2. */
function cylinderPayload(direction: PlanningVector3, center: PlanningVector3, radiusMm: number, lengthMm: number): MoldMeshPayload {
  return cylinderPrismPayload(direction, center, radiusMm, lengthMm, REGISTRATION_PIN_SEGMENTS);
}

function sweepClearance(bounds: Bounds3, direction: PlanningVector3): number {
  const extent =
    Math.abs(direction.x) * (bounds.max.x - bounds.min.x) +
    Math.abs(direction.y) * (bounds.max.y - bounds.min.y) +
    Math.abs(direction.z) * (bounds.max.z - bounds.min.z);
  return extent * RELEASE_SWEEP_SAFETY_FACTOR + 1;
}

interface RegistrationPlacement {
  readonly pieceIndex: number;
  readonly siblingIndex: number;
  readonly center: PlanningVector3;
  readonly direction: PlanningVector3;
}

function verifyWorkingMoldRelease(
  input: WorkingMoldConstructionInput,
  envelopeBounds: Bounds3,
  policy: ReturnType<typeof buildGeometryTolerancePolicy>,
  volumeTolerance: number,
  partSolid: ManifoldSolid,
  carved: readonly ManifoldSolid[],
  /**
   * Execution 08 LOOP 02/14/28 (multi-label partition, release-direction
   * gap): a piece's release direction is inherited from the region-cover
   * step (Loop 11), which only ever proves "this region is fully VISIBLE
   * from direction D" -- never that the piece a joint reconstruction
   * (`multiLabelPartition.ts`) actually shapes for that region can
   * physically be swept clear along D. Measured directly against the real
   * free-form regression fixture: 9 of 10 multi-label pieces release fine
   * along their own assigned direction; exactly one does not, along
   * EITHER polarity, regardless of the reconstruction's own smoothness
   * tuning (confirmed stable across four separate weight settings) --
   * strong evidence this is a direction-assignment gap, not a
   * reconstruction-shape defect. Since every direction in this mold
   * already comes from the same validated region-cover candidate pool
   * (never an arbitrary/unbounded search), trying every OTHER piece's own
   * already-useful direction (and its negation) as an additional
   * candidate for THIS piece is a small, bounded, well-motivated
   * broadening -- not a blind direction search. Only populated for
   * multi-label mode (`constructWorkingMold`'s own call site); every other
   * construction mode keeps its original, narrower candidate set exactly
   * as before, so this cannot change their already-verified behavior.
   */
  extraCandidateDirections: readonly PlanningVector3[] = [],
  /**
   * Execution 08 LOOP 02/14/28 (release-ORDER search, not just direction):
   * the default loop below tests each piece against ALL OTHER pieces at
   * once, in a FIXED reverse-construction-index order -- it never asks
   * whether some OTHER removal order might let a piece out once
   * non-blocking siblings are already gone. That is a real gap distinct
   * from `extraCandidateDirections` (which only broadens the DIRECTION
   * search per piece, not the ORDER). Measured directly against the real
   * free-form regression fixture's own remaining island: it is always the
   * highest-index physical piece, so the fixed reverse order always tests
   * it FIRST, against ALL 9 siblings simultaneously -- the single most
   * constrained scenario possible, regardless of whether a different
   * disassembly order would actually free it. When true, this switches to
   * a genuine greedy search: at each step, try every still-remaining piece
   * against only the CURRENTLY remaining set (already-released siblings no
   * longer block anything), and release whichever one succeeds first,
   * repeating until none remain or none of the remaining pieces can be
   * released against each other. Only enabled for multi-label mode (this
   * function's own call site) -- every other construction mode keeps its
   * original fixed-order behavior exactly as before, so this cannot change
   * their already-verified release sequences or piece ordering.
   */
  useGreedyReleaseOrder: boolean = false,
): { readonly steps: readonly WorkingMoldReleaseStep[]; readonly candidatesSwept: number } {
  const releaseSequence: WorkingMoldReleaseStep[] = [];
  const remaining = new Set<number>(carved.keys());
  // Execution 08 LOOP 35 (audit fix): total release-direction candidates
  // examined across every `tryRelease` call this verification makes --
  // real "release sweeps" telemetry (Section 35's own tracking list),
  // previously computed implicitly (one loop iteration per candidate) and
  // then discarded once a working direction was found or none were.
  let candidatesSwept = 0;

  const tryRelease = (pieceIndex: number): { readonly direction: PlanningVector3; readonly clearance: number } | null => {
    const direction = input.pieces[pieceIndex]!.releaseDirection;
    const planeDirection = input.pieces[pieceIndex]!.plane?.direction ?? null;
    const candidateDirections = [
      direction,
      ...(planeDirection === null ? [] : [planeDirection, { x: -planeDirection.x, y: -planeDirection.y, z: -planeDirection.z }]),
      { x: -direction.x, y: -direction.y, z: -direction.z },
      ...extraCandidateDirections,
      ...extraCandidateDirections.map((d) => ({ x: -d.x, y: -d.y, z: -d.z })),
    ];
    let remainingUnion: ManifoldSolid | null = null;
    try {
      for (const siblingIndex of remaining) {
        if (siblingIndex === pieceIndex) continue;
        const sibling = carved[siblingIndex]!;
        if (remainingUnion === null) {
          remainingUnion = sibling.asOriginal();
        } else {
          const nextUnion: ManifoldSolid = remainingUnion.add(sibling);
          remainingUnion.delete();
          remainingUnion = nextUnion;
        }
      }
      for (const candidate of candidateDirections) {
        candidatesSwept += 1;
        const candidateClearance = sweepClearance(envelopeBounds, candidate);
        const vsPart = verifyDemoldTranslationByVector(partSolid, carved[pieceIndex]!, [candidate.x, candidate.y, candidate.z], candidateClearance, policy.surfaceToleranceMm, volumeTolerance);
        const vsSiblings = remainingUnion === null
          ? { removable: true }
          : verifyDemoldTranslationByVector(remainingUnion, carved[pieceIndex]!, [candidate.x, candidate.y, candidate.z], candidateClearance, policy.surfaceToleranceMm, volumeTolerance);
        if (vsPart.removable && vsSiblings.removable) {
          return { direction: candidate, clearance: candidateClearance };
        }
      }
      return null;
    } finally {
      remainingUnion?.delete();
    }
  };

  if (useGreedyReleaseOrder) {
    while (remaining.size > 0) {
      let releasedThisRound: { readonly pieceIndex: number; readonly direction: PlanningVector3; readonly clearance: number } | null = null;
      for (const pieceIndex of remaining) {
        const result = tryRelease(pieceIndex);
        if (result !== null) {
          releasedThisRound = { pieceIndex, ...result };
          break;
        }
      }
      if (releasedThisRound === null) {
        const stuckPieceIndexes = [...remaining].sort((a, b) => a - b).map((i) => i + 1).join(", ");
        throw new Error(`working mold piece(s) ${stuckPieceIndexes} cannot release against each other in any tried order or direction.`);
      }
      remaining.delete(releasedThisRound.pieceIndex);
      releaseSequence.push({
        stepIndex: releaseSequence.length,
        pieceIndex: releasedThisRound.pieceIndex,
        direction: releasedThisRound.direction,
        clearanceDistanceMm: releasedThisRound.clearance,
        collisionVerified: true,
      });
    }
    return { steps: releaseSequence, candidatesSwept };
  }

  for (const pieceIndex of [...carved.keys()].reverse()) {
    const result = tryRelease(pieceIndex);
    if (result === null) {
      throw new Error(`working mold piece ${pieceIndex + 1} cannot release along either polarity of its final registered direction.`);
    }
    remaining.delete(pieceIndex);
    releaseSequence.push({
      stepIndex: releaseSequence.length,
      pieceIndex,
      direction: result.direction,
      clearanceDistanceMm: result.clearance,
      collisionVerified: true,
    });
  }
  return { steps: releaseSequence, candidatesSwept };
}

/**
 * Candidate pin placements on each prism interface. Strict region rule: a
 * pin for piece i is placed only where the point lies behind every OTHER
 * plane by more than the pin radius, so the whole pin disk lives inside
 * piece i (whose region is its own half-space minus earlier planes) on one
 * side and inside the catch-all piece on the other side. The pin must also
 * clear the part footprint and fit inside the envelope along its axis.
 */
function candidatePlacements(
  input: WorkingMoldConstructionInput,
  envelopeBounds: Bounds3,
  radiusMm: number,
  clearanceMm: number,
  pinHeightMm: number,
): RegistrationPlacement[] {
  const placements: RegistrationPlacement[] = [];
  const margin = radiusMm * 1.5;
  const catchAllIndex = input.pieces.length - 1;
  for (let pieceIndex = 0; pieceIndex < input.pieces.length; pieceIndex += 1) {
    const plane = input.pieces[pieceIndex]!.plane;
    if (plane === null) continue;
    const { u, v, w } = basisAround(plane.direction);
    const center = {
      x: (envelopeBounds.min.x + envelopeBounds.max.x) / 2,
      y: (envelopeBounds.min.y + envelopeBounds.max.y) / 2,
      z: (envelopeBounds.min.z + envelopeBounds.max.z) / 2,
    };
    const along = w.x * center.x + w.y * center.y + w.z * center.z;
    const faceCenter = {
      x: center.x + w.x * (plane.offsetMm - along),
      y: center.y + w.y * (plane.offsetMm - along),
      z: center.z + w.z * (plane.offsetMm - along),
    };
    const spanU =
      Math.abs(u.x) * (envelopeBounds.max.x - envelopeBounds.min.x) +
      Math.abs(u.y) * (envelopeBounds.max.y - envelopeBounds.min.y) +
      Math.abs(u.z) * (envelopeBounds.max.z - envelopeBounds.min.z);
    const spanV =
      Math.abs(v.x) * (envelopeBounds.max.x - envelopeBounds.min.x) +
      Math.abs(v.y) * (envelopeBounds.max.y - envelopeBounds.min.y) +
      Math.abs(v.z) * (envelopeBounds.max.z - envelopeBounds.min.z);

    for (const insetU of REGISTRATION_PIN_INSET_FRACTIONS) {
      for (const insetV of REGISTRATION_PIN_INSET_FRACTIONS) {
        const point = {
          x: faceCenter.x + u.x * spanU * insetU + v.x * spanV * insetV,
          y: faceCenter.y + u.y * spanU * insetU + v.y * spanV * insetV,
          z: faceCenter.z + u.z * spanU * insetU + v.z * spanV * insetV,
        };
        // Behind every other plane by more than the pin radius: the pin disk
        // stays wholly inside piece i and wholly inside the catch-all.
        let withinRegions = true;
        for (let k = 0; k < input.pieces.length && withinRegions; k += 1) {
          if (k === pieceIndex) continue;
          const other = input.pieces[k]!.plane;
          if (other === null) continue;
          const otherAlong = other.direction.x * point.x + other.direction.y * point.y + other.direction.z * point.z;
          if (otherAlong >= other.offsetMm - margin) withinRegions = false;
        }
        if (!withinRegions) continue;

        // The pin must fit inside the envelope along its own axis.
        const reach = pinHeightMm / 2;
        const lowEnd = {
          x: point.x - plane.direction.x * reach,
          y: point.y - plane.direction.y * reach,
          z: point.z - plane.direction.z * reach,
        };
        const highEnd = {
          x: point.x + plane.direction.x * reach,
          y: point.y + plane.direction.y * reach,
          z: point.z + plane.direction.z * reach,
        };
        const insideEnvelope = [lowEnd, highEnd].every((end) =>
          end.x >= envelopeBounds.min.x + margin &&
          end.x <= envelopeBounds.max.x - margin &&
          end.y >= envelopeBounds.min.y + margin &&
          end.y <= envelopeBounds.max.y - margin &&
          end.z >= envelopeBounds.min.z + margin &&
          end.z <= envelopeBounds.max.z - margin,
        );
        if (!insideEnvelope) continue;

        const distanceToPart = Math.hypot(
          Math.max(input.sourceBounds.min.x - point.x, 0, point.x - input.sourceBounds.max.x),
          Math.max(input.sourceBounds.min.y - point.y, 0, point.y - input.sourceBounds.max.y),
          Math.max(input.sourceBounds.min.z - point.z, 0, point.z - input.sourceBounds.max.z),
        );
        if (distanceToPart <= radiusMm + clearanceMm) continue;
        placements.push({ pieceIndex, siblingIndex: catchAllIndex, center: point, direction: plane.direction });
      }
    }
  }
  return placements;
}

/**
 * Places alignment pins across safe planar interfaces; records an explicit
 * reason when none can be placed (Article 10: never a silent empty plan).
 * Manifold solids are immutable: mutated pieces are reassigned with their
 * predecessors released.
 */
async function placeWorkingMoldRegistration(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  input: WorkingMoldConstructionInput,
  envelopeBounds: Bounds3,
  policy: ReturnType<typeof buildGeometryTolerancePolicy>,
  volumeTolerance: number,
  partSolid: ManifoldSolid,
  carved: ManifoldSolid[],
): Promise<WorkingMoldRegistrationPlan> {
  const features: WorkingMoldRegistrationFeature[] = [];
  const originals = carved.map((solid) => solid.asOriginal());
  const radius = Math.min(REGISTRATION_PIN_RADIUS_MM, input.minimumToolingWallMm);
  if (radius < 1) {
    for (const original of originals) original.delete();
    return { features, reason: "walls too thin for working-mold alignment pins" };
  }
  // Keep engagement local to the interface. A full-span pin can cross a
  // neighbouring release corridor even when its centre is interference-safe.
  const pinHeightMm = radius * 2;
  const placements = candidatePlacements(input, envelopeBounds, radius, policy.surfaceToleranceMm, pinHeightMm);

  const perPiecePlaced = new Map<number, number>();
  for (const placement of placements) {
    const placed = perPiecePlaced.get(placement.pieceIndex) ?? 0;
    if (placed >= 2) continue;
    const beforePlacement = carved.map((solid) => solid.asOriginal());
    const male = cylinderPayload(placement.direction, placement.center, radius, pinHeightMm);
    const maleSolid = manifoldFromPayload(module, male, policy.booleanToleranceMm);
    try {
      const withPin = carved[placement.pieceIndex]!.add(maleSolid);
      carved[placement.pieceIndex]!.delete();
      carved[placement.pieceIndex] = withPin;
      const withSocket = carved[placement.siblingIndex]!.subtract(maleSolid);
      carved[placement.siblingIndex]!.delete();
      carved[placement.siblingIndex] = withSocket;
      try {
        verifyWorkingMoldRelease(input, envelopeBounds, policy, volumeTolerance, partSolid, carved);
      } catch {
        for (const solid of carved) solid.delete();
        carved.splice(0, carved.length, ...beforePlacement);
        continue;
      }
    } finally {
      maleSolid.delete();
    }
    for (const solid of beforePlacement) solid.delete();
    features.push({
      featureId: `wm-pin-${placement.pieceIndex}-${placed}`,
      interfaceId: `wm-interface-plane-${placement.pieceIndex}`,
      kind: "pin",
      malePieceIndex: placement.pieceIndex,
      femalePieceIndex: placement.siblingIndex,
      position: placement.center,
      direction: placement.direction,
    });
    perPiecePlaced.set(placement.pieceIndex, placed + 1);
  }

  const prismPieces = input.pieces.filter((piece) => piece.plane !== null).length;
  for (let pieceIndex = 0; pieceIndex < prismPieces; pieceIndex += 1) {
    if (!features.some((feature) => feature.malePieceIndex === pieceIndex)) {
      for (const original of originals) original.delete();
      return {
        features,
        reason: `no interference-safe working-mold pin placement on interface ${pieceIndex}`,
      };
    }
  }
  if (features.length === 0) {
    for (const original of originals) original.delete();
    return { features, reason: "no planar working-mold interface available for pins" };
  }

  try {
    verifyWorkingMoldRelease(input, envelopeBounds, policy, volumeTolerance, partSolid, carved);
  } catch (error) {
    for (const solid of carved) solid.delete();
    carved.splice(0, carved.length, ...originals);
    return {
      features: [],
      reason: `automatic alignment features rejected by final release verification: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  for (const original of originals) original.delete();
  return { features, reason: null };
}

export async function constructWorkingMold(input: WorkingMoldConstructionInput): Promise<WorkingMoldConstructionOutput> {
  const module = await getManifoldModule();
  const wallMm = workingMoldEnvelopeWallMm(input.sourceBounds, input.minimumToolingWallMm);
  const envelopeBounds = inflatedBounds(input.sourceBounds, wallMm);
  const policy = buildGeometryTolerancePolicy(envelopeBounds, 0);
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, 1e-3);

  const partSolid = manifoldFromPayload(module, { positions: [...input.sourceMesh.positions], indices: [...input.sourceMesh.indices] }, policy.booleanToleranceMm);
  let negativeTool: ManifoldSolid = partSolid;
  let clearanceSphere: ManifoldSolid | null = null;
  if (input.releaseClearanceMm > 0) {
    clearanceSphere = module.Manifold.sphere(input.releaseClearanceMm, 16);
    negativeTool = partSolid.minkowskiSum(clearanceSphere);
  }

  const pieceSolids: ManifoldSolid[] = [];
  const carved: ManifoldSolid[] = [];
  let remainder: ManifoldSolid | null = null;
  // Execution 08 LOOP 14 (simultaneous-partition rewrite): the
  // region-direct-assignment fallback supplies `grid` on every non-last
  // piece. That signal is used here to pick construction MODE, not just a
  // tool: sequential remainder-carving (below) threads a single shrinking
  // volume through every piece in order, so a LATER piece's own local
  // correction can slice through an EARLIER piece's already-finalized
  // shape, and a piece with small/scattered territory has to start from
  // "claim the whole half-space" and drill enough holes to give most of it
  // back -- both diagnosed, real fragmentation mechanisms on the real free-
  // form regression fixture (piece count climbed 5 -> 11 -> 23 chasing
  // them one at a time). The simultaneous path removes the ordering
  // dependency (every non-last piece's raw claim is computed independently
  // and locally-bounded via `localBoundedAssignmentSolid`, using ALL other
  // pieces as `otherPoints`, not just later ones) and only falls back to a
  // single deterministic subtraction pass for whatever small overlap
  // remains between two independently-computed local claims -- never the
  // fragile "everything, minus many holes" shape. The ordinary
  // threshold-search path (planar / curve-based pieces, `grid` unset)
  // keeps the original sequential carving entirely unchanged.
  const isSimultaneousPartition =
    input.pieces.length >= 2 &&
    input.pieces.slice(0, -1).every((piece) => piece.grid !== null && piece.grid !== undefined) &&
    input.pieces[input.pieces.length - 1]!.plane === null;
  // Execution 08 LOOP 02/14/28 (volumetric reconstruction): EVERY piece
  // carries `volumetric`, no catch-all -- see `volumetricPartition.ts`'s
  // own doc comment for the full mechanism and why it replaces the
  // CSG-boundary modes above (all of which diverged on the real free-form
  // regression fixture across four separate architectural attempts).
  const isVolumetricPartition =
    input.pieces.length >= 2 && input.pieces.every((piece) => piece.volumetric !== null && piece.volumetric !== undefined);
  // Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
  // EVERY piece carries `multiLabel`, no catch-all -- see
  // `multiLabelPartition.ts`'s own doc comment for the full mechanism.
  // Unlike `isVolumetricPartition` above (each piece independently
  // compared against a merged "everyone else"), this is a single joint
  // computation across every piece -- solved once, not mapped per piece.
  const isMultiLabelPartition =
    input.pieces.length >= 2 && input.pieces.every((piece) => piece.multiLabel !== null && piece.multiLabel !== undefined);
  try {
    if (isMultiLabelPartition) {
      const diagonal = Math.hypot(
        envelopeBounds.max.x - envelopeBounds.min.x,
        envelopeBounds.max.y - envelopeBounds.min.y,
        envelopeBounds.max.z - envelopeBounds.min.z,
      );
      const voxelSizeMm = diagonal / 60;
      const multiLabelResult = buildMultiLabelPartitionSolids(module, {
        pieceTriangleIndices: input.pieces.map((piece) => piece.multiLabel!.ownTriangleIndices),
        sourceMesh: input.sourceMesh,
        bounds: envelopeBounds,
        voxelSizeMm,
        // Measured directly against the real free-form regression fixture:
        // 2x voxel size resolves the same tie-ambiguity a distance-only
        // metric leaves (own doc comment) without being so strong it
        // starts eating genuinely small-but-real regions.
        smoothnessWeight: voxelSizeMm * 2,
        maxIterations: 15,
      });
      const rawClaims = [...multiLabelResult.solids];
      // Independent per-label level-set extractions can leave the same
      // small grid-discretization residue at shared boundaries every other
      // construction mode in this file already carries a safety net for.
      let claimedSoFar: ManifoldSolid | null = null;
      for (let index = 0; index < rawClaims.length; index += 1) {
        if (claimedSoFar !== null) {
          const resolved = rawClaims[index]!.subtract(claimedSoFar);
          assertManifoldStatus(resolved, "Multi-label partition overlap resolution");
          rawClaims[index]!.delete();
          rawClaims[index] = resolved;
        }
        if (claimedSoFar === null) {
          claimedSoFar = rawClaims[index]!.asOriginal();
        } else {
          const nextClaimed: ManifoldSolid = claimedSoFar.add(rawClaims[index]!);
          claimedSoFar.delete();
          claimedSoFar = nextClaimed;
        }
      }
      claimedSoFar?.delete();
      pieceSolids.push(...rawClaims);
    } else if (isVolumetricPartition) {
      // Grid spacing for Manifold.levelSet's body-centered-cubic grid.
      // Measured directly against the real free-form regression fixture:
      // envelope-diagonal/60 extracts all pieces correctly in ~1.3s each;
      // envelope-diagonal/120 (8x the grid cells) exhausted the WASM
      // heap outright ("memory access out of bounds") -- finer is not
      // free, and this margin has real headroom below the crash point.
      const diagonal = Math.hypot(
        envelopeBounds.max.x - envelopeBounds.min.x,
        envelopeBounds.max.y - envelopeBounds.min.y,
        envelopeBounds.max.z - envelopeBounds.min.z,
      );
      const edgeLengthMm = diagonal / 60;
      const rawClaims: ManifoldSolid[] = input.pieces.map((piece) => {
        const volumetric = piece.volumetric!;
        const solid = volumetricAssignmentSolid(module, {
          ownTriangleIndices: volumetric.ownTriangleIndices,
          otherTriangleIndices: volumetric.otherTriangleIndices,
          sourceMesh: input.sourceMesh,
          bounds: envelopeBounds,
          edgeLengthMm,
        });
        assertManifoldStatus(solid, "Volumetric partition raw claim");
        return solid;
      });
      // A true nearest-patch partition should have ~zero overlap by
      // construction (verified directly: an exact 864.0/864.0 split of a
      // 1728 box in volumetricPartition's own tests) -- this pass exists
      // only for whatever small grid-discretization residue remains at the
      // shared boundary between two pieces, the same safety net every
      // other construction mode in this file also carries.
      let claimedSoFar: ManifoldSolid | null = null;
      for (let index = 0; index < rawClaims.length; index += 1) {
        if (claimedSoFar !== null) {
          const resolved = rawClaims[index]!.subtract(claimedSoFar);
          assertManifoldStatus(resolved, "Volumetric partition overlap resolution");
          rawClaims[index]!.delete();
          rawClaims[index] = resolved;
        }
        if (claimedSoFar === null) {
          claimedSoFar = rawClaims[index]!.asOriginal();
        } else {
          const nextClaimed: ManifoldSolid = claimedSoFar.add(rawClaims[index]!);
          claimedSoFar.delete();
          claimedSoFar = nextClaimed;
        }
      }
      claimedSoFar?.delete();
      pieceSolids.push(...rawClaims);
    } else if (isSimultaneousPartition) {
      const envelopeBlank = createBlankSolid(module, envelopeBounds);
      try {
        const nonLast = input.pieces.slice(0, -1);
        const rawClaims: ManifoldSolid[] = nonLast.map((piece) => {
          const grid = piece.grid!;
          const localTool = localBoundedAssignmentSolid(
            module, grid.ownPoints, grid.otherPoints, piece.releaseDirection, envelopeBounds, policy.booleanToleranceMm, grid.ownPatchRadiusMm,
          );
          try {
            const claim = envelopeBlank.intersect(localTool);
            assertManifoldStatus(claim, "Simultaneous-partition raw claim");
            return claim;
          } finally {
            localTool.delete();
          }
        });
        // Deterministic overlap resolution: each claim keeps only what no
        // EARLIER claim already took. Any two independently-computed local
        // claims should barely overlap at all (each already gives back
        // material near the other's own patches) -- this pass exists for
        // the small residual case, not to define each piece's shape.
        let claimedSoFar: ManifoldSolid | null = null;
        for (let index = 0; index < rawClaims.length; index += 1) {
          if (claimedSoFar !== null) {
            const resolved = rawClaims[index]!.subtract(claimedSoFar);
            assertManifoldStatus(resolved, "Simultaneous-partition overlap resolution");
            rawClaims[index]!.delete();
            rawClaims[index] = resolved;
          }
          if (claimedSoFar === null) {
            claimedSoFar = rawClaims[index]!.asOriginal();
          } else {
            const nextClaimed: ManifoldSolid = claimedSoFar.add(rawClaims[index]!);
            claimedSoFar.delete();
            claimedSoFar = nextClaimed;
          }
        }
        pieceSolids.push(...rawClaims);
        const catchAll = claimedSoFar === null ? envelopeBlank.asOriginal() : envelopeBlank.subtract(claimedSoFar);
        assertManifoldStatus(catchAll, "Simultaneous-partition catch-all");
        pieceSolids.push(catchAll);
        claimedSoFar?.delete();
      } finally {
        envelopeBlank.delete();
      }
    } else {
      remainder = createBlankSolid(module, envelopeBounds);
      for (let index = 0; index < input.pieces.length; index += 1) {
        const piece = input.pieces[index]!;
        const plane = piece.plane;
        const curve = piece.curve;
        if (plane === null) {
          pieceSolids.push(remainder);
          remainder = null;
          break;
        }
        if (curve !== null && curve !== undefined) {
          if (curve.length === 0) throw new Error("a height-field cutting tool needs at least one curve group.");
          for (const group of curve) {
            if (group.length < 3) throw new Error("a height-field cutting tool needs at least 3 curve points per neighbor group.");
          }
        }
        // A curve-based cutting tool (present) takes priority over the
        // plain half-space plane -- the same intersect/subtract carving
        // either way, just following the real parting curve's own
        // per-point height near the part instead of a pure infinite
        // half-plane. (`grid` never appears here: `isSimultaneousPartition`
        // already routed that case to the branch above.)
        const cuttingSolid = curve
          ? curve.length === 1
            ? heightFieldPartingSolid(module, curve[0]!, plane.direction, plane.offsetMm, envelopeBounds, policy.booleanToleranceMm)
            : multiNeighborHeightFieldSolid(module, curve, plane.direction, plane.offsetMm, envelopeBounds, policy.booleanToleranceMm)
          : manifoldFromPayload(module, halfSpacePrismPayload(plane.direction, plane.offsetMm, envelopeBounds), policy.booleanToleranceMm);
        try {
          const region = remainder.intersect(cuttingSolid);
          const nextRemainder = remainder.subtract(cuttingSolid);
          remainder.delete();
          remainder = nextRemainder;
          pieceSolids.push(region);
        } finally {
          cuttingSolid.delete();
        }
      }
    }

    if (pieceSolids.length !== input.pieces.length) {
      throw new Error("working mold partition did not produce one region per planned piece.");
    }

    // Execution 08 LOOP 14 (fragmentation completeness fix): even after
    // splitting each region-cover DIRECTION into its own mesh-adjacency-
    // connected components upstream (regionDirectConstruction.ts), the
    // ordered carving process itself can still leave a region fragmented
    // -- a later-carved piece's own exclusion cylinders (or, on the
    // ordinary threshold-search path, nothing at all: this never fires
    // there) can slice through an EARLIER-carved region's connectivity.
    // Rather than reject that outright, split any genuinely fragmented
    // region into its own real components here, each becoming its own
    // final piece released along the SAME direction as its parent --
    // still fully collision-verified below like any other piece, never a
    // silent wrong result. `pieceSourceIndex[k]` records which ORIGINAL
    // `input.pieces` entry expanded piece `k` came from, so its release
    // direction and plane (needed by registration/release below) can
    // still be looked up. A single-component region decomposes to exactly
    // itself, so this is a no-op wherever fragmentation never happens.
    const pieceSourceIndex: number[] = [];
    {
      const expanded: ManifoldSolid[] = [];
      for (let index = 0; index < pieceSolids.length; index += 1) {
        const original = pieceSolids[index]!;
        const components = original.decompose();
        original.delete();
        for (const component of components) {
          expanded.push(component);
          pieceSourceIndex.push(index);
        }
      }
      pieceSolids.length = 0;
      pieceSolids.push(...expanded);
    }
    const expandedPieces: readonly PlannedPieceRegion[] = pieceSourceIndex.map((sourceIndex) => input.pieces[sourceIndex]!);
    const expandedInput: WorkingMoldConstructionInput = { ...input, pieces: expandedPieces };

    // Carve the part negative out of every region; everything downstream
    // (release verification, assembly validation, registration, export)
    // operates on the carved working-mold pieces.
    for (const region of pieceSolids) {
      carved.push(region.subtract(negativeTool));
    }

    // Registration mutates the carved solids. It must happen before any
    // release or assembly proof so those proofs describe the geometry that
    // will actually be emitted to the rest of the product.
    const registrationPlan = await placeWorkingMoldRegistration(module, expandedInput, envelopeBounds, policy, volumeTolerance, partSolid, carved);

    // Release verification in reverse assignment order (innermost region
    // first): each FINAL registered piece sweeps against the part AND the
    // remaining assembled siblings. Multi-label mode additionally offers
    // every OTHER piece's own release direction as a candidate (see
    // `verifyWorkingMoldRelease`'s own doc comment for why), plus whatever
    // broader set the caller supplied via `extraReleaseDirections` (see
    // `WorkingMoldConstructionInput`'s own doc comment). `useGreedyOrder`
    // is a SEPARATE, explicit opt-in (`input.useGreedyReleaseOrder`), not
    // automatically enabled for multi-label mode -- measured directly: an
    // O(n^2) search over removal order, combined with any non-trivial
    // candidate-direction count, is computationally impractical even for
    // 10 pieces (a real run exceeded 15 minutes without completing). The
    // FAST fixed-order path is what the already-verified "9 of 10 release
    // cleanly" result used, and stays the default even for multi-label, so
    // ordinary calls are not slowed down chasing one hard piece.
    const { steps: releaseSequence, candidatesSwept: releaseSweepCount } = verifyWorkingMoldRelease(
      expandedInput,
      envelopeBounds,
      policy,
      volumeTolerance,
      partSolid,
      carved,
      [
        ...(isMultiLabelPartition ? input.pieces.map((piece) => piece.releaseDirection) : []),
        ...(input.extraReleaseDirections ?? []),
      ],
      input.useGreedyReleaseOrder ?? false,
    );

    // Assembled-negative invariant on the FINAL registered pieces: union(pieces)
    // ∩ part ≈ 0 and envelope − union(pieces) − part ≈ 0.
    let assembled: ManifoldSolid | null = null;
    let overlap: ManifoldSolid | null = null;
    try {
      for (const piece of carved) {
        if (assembled === null) {
          assembled = piece.asOriginal();
        } else {
          const nextAssembled: ManifoldSolid = assembled.add(piece);
          assembled.delete();
          assembled = nextAssembled;
        }
      }
      overlap = assembled!.intersect(partSolid);
      if (overlap.volume() > volumeTolerance) {
        throw new Error("assembled registered working mold intersects the source part.");
      }
      const envelopeVolume =
        (envelopeBounds.max.x - envelopeBounds.min.x) *
        (envelopeBounds.max.y - envelopeBounds.min.y) *
        (envelopeBounds.max.z - envelopeBounds.min.z);
      const complement = envelopeVolume - assembled!.volume() - partSolid.volume();
      if (Math.abs(complement) > Math.max(volumeTolerance, partSolid.volume() * 1e-3)) {
        throw new Error("assembled registered working mold does not tile its envelope.");
      }
    } finally {
      overlap?.delete();
      assembled?.delete();
    }

    const targets: WorkingMoldPieceTarget[] = [];
    for (let index = 0; index < carved.length; index += 1) {
      const solid = carved[index]!;
      const status = solid.status();
      if (status !== "NoError" || solid.isEmpty()) {
        throw new Error(`working mold piece ${index + 1} construction failed.`);
      }
      const components = solid.decompose();
      const componentCount = components.length;
      for (const component of components) component.delete();
      if (componentCount > 1) {
        throw new Error(`working mold piece ${index + 1} is not a single connected solid.`);
      }
      const mesh = payloadFromManifold(solid);
      const topology = meshTopology(mesh);
      if (topology.openEdgeCount > 0 || topology.nonManifoldEdgeCount > 0) {
        throw new Error(`working mold piece ${index + 1} is not a closed manifold.`);
      }
      const bounds = boundsFromManifold(solid);
      const direction = expandedPieces[index]!.releaseDirection;
      const releaseStep = releaseSequence.find((step) => step.pieceIndex === index)!;
      const geometryVersion = `working-mold-piece:${hashStableValues({
        mesh: meshGeometryVersion({ id: `piece-${index + 1}`, mesh, bounds }),
        source: input.sourceMesh,
        direction,
        releaseOrder: releaseStep.stepIndex,
      })}`;
      targets.push({
        pieceId: `wm-piece-${index + 1}`,
        name: `Working Mold ${index + 1}`,
        mesh,
        bounds,
        volumeMm3: solid.volume(),
        geometryVersion,
        assignedDirection: direction,
        directionId: `piece-${index + 1}`,
        releaseOrder: releaseStep.stepIndex,
        interfaceIds: [],
        triangleCount: mesh.indices.length / 3,
        watertight: topology.openEdgeCount === 0,
        manifold: topology.openEdgeCount === 0 && topology.nonManifoldEdgeCount === 0,
      });
    }

    return { pieces: targets, releaseSequence, registrationPlan, releaseSweepCount };
  } finally {
    for (const solid of pieceSolids) solid.delete();
    for (const solid of carved) solid.delete();
    if (negativeTool !== partSolid) negativeTool.delete();
    clearanceSphere?.delete();
    remainder?.delete();
    partSolid.delete();
  }
}
