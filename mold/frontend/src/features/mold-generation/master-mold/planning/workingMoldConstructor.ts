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
   * Execution 08 LOOP 14: a height-field cutting tool (`heightFieldPartingSolid`)
   * -- `plane`'s own flat cut everywhere except near this piece's own real
   * parting curve (from the planning-level patch assignment, Loop 13's
   * ordered/simplified curve), where the true curve's own per-point height
   * is followed instead. `plane` MUST still be supplied alongside `curve`,
   * not null: the height field's far field, and its fallback if this piece
   * is rejected, are both the flat cut. Registration-pin placement (which
   * reuses `plane`) still lands correctly almost everywhere, since pins are
   * placed away from the part by design. Only meaningful for a two-piece
   * decomposition (this piece plus the catch-all remainder): the curve is
   * this piece's FULL boundary against everything else, which is only
   * guaranteed to be one simple closed loop when there is exactly one
   * other piece.
   */
  readonly curve?: { readonly points: readonly PlanningVector3[] } | null;
}

export interface WorkingMoldConstructionInput {
  readonly sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array };
  readonly sourceBounds: Bounds3;
  readonly releaseClearanceMm: number;
  readonly minimumToolingWallMm: number;
  readonly pieces: readonly PlannedPieceRegion[];
}

export interface WorkingMoldConstructionOutput {
  readonly pieces: readonly WorkingMoldPieceTarget[];
  readonly releaseSequence: readonly WorkingMoldReleaseStep[];
  readonly registrationPlan: WorkingMoldRegistrationPlan;
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
 */
export function heightFieldPartingSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  curvePoints: readonly PlanningVector3[],
  flatDirection: PlanningVector3,
  flatOffsetMm: number,
  bounds: Bounds3,
  toleranceMm: number,
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
  const outerRadius = diagonal + maxCurveRadius + 1;
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
): WorkingMoldReleaseStep[] {
  const releaseSequence: WorkingMoldReleaseStep[] = [];
  const remaining = new Set<number>(carved.keys());
  for (const pieceIndex of [...carved.keys()].reverse()) {
      const direction = input.pieces[pieceIndex]!.releaseDirection;
      const clearance = sweepClearance(envelopeBounds, direction);
      const planeDirection = input.pieces[pieceIndex]!.plane?.direction ?? null;
      const candidateDirections = [
        direction,
        ...(planeDirection === null ? [] : [planeDirection, { x: -planeDirection.x, y: -planeDirection.y, z: -planeDirection.z }]),
        { x: -direction.x, y: -direction.y, z: -direction.z },
      ];
      let remainingUnion: ManifoldSolid | null = null;
      try {
      for (const siblingIndex of remaining) {
        if (siblingIndex === pieceIndex) continue;
        const sibling = carved[siblingIndex]!;
        remainingUnion = remainingUnion === null ? sibling.asOriginal() : remainingUnion.add(sibling);
      }
      const verifies = (candidate: readonly [number, number, number]): boolean => {
        const vsPart = verifyDemoldTranslationByVector(partSolid, carved[pieceIndex]!, candidate, clearance, policy.surfaceToleranceMm, volumeTolerance);
        const vsSiblings = remainingUnion === null
          ? { removable: true }
          : verifyDemoldTranslationByVector(remainingUnion, carved[pieceIndex]!, candidate, clearance, policy.surfaceToleranceMm, volumeTolerance);
        return vsPart.removable && vsSiblings.removable;
      };
      const verifiedDirection = candidateDirections.find((candidate) =>
        verifies([candidate.x, candidate.y, candidate.z]),
      ) ?? null;
      if (verifiedDirection === null) {
        throw new Error(`working mold piece ${pieceIndex + 1} cannot release along either polarity of its final registered direction.`);
      }
      remaining.delete(pieceIndex);
      releaseSequence.push({
        stepIndex: releaseSequence.length,
        pieceIndex,
        direction: verifiedDirection,
        clearanceDistanceMm: clearance,
        collisionVerified: true,
      });
    } finally {
      remainingUnion?.delete();
    }
  }
  return releaseSequence;
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
  try {
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
      if (curve !== null && curve !== undefined && curve.points.length < 3) {
        throw new Error("a height-field cutting tool needs at least 3 curve points.");
      }
      // Execution 08 LOOP 14: a curve-based cutting tool (present) takes
      // priority over the plain half-space plane -- the same
      // intersect/subtract carving either way, just following the real
      // parting curve's own per-point height near the part instead of a
      // pure infinite half-plane.
      const cuttingSolid = curve
        ? heightFieldPartingSolid(module, curve.points, plane.direction, plane.offsetMm, envelopeBounds, policy.booleanToleranceMm)
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

    if (pieceSolids.length !== input.pieces.length) {
      throw new Error("working mold partition did not produce one region per planned piece.");
    }

    // Carve the part negative out of every region; everything downstream
    // (release verification, assembly validation, registration, export)
    // operates on the carved working-mold pieces.
    for (const region of pieceSolids) {
      carved.push(region.subtract(negativeTool));
    }

    // Registration mutates the carved solids. It must happen before any
    // release or assembly proof so those proofs describe the geometry that
    // will actually be emitted to the rest of the product.
    const registrationPlan = await placeWorkingMoldRegistration(module, input, envelopeBounds, policy, volumeTolerance, partSolid, carved);

    // Release verification in reverse assignment order (innermost region
    // first): each FINAL registered piece sweeps against the part AND the
    // remaining assembled siblings.
    const releaseSequence = verifyWorkingMoldRelease(input, envelopeBounds, policy, volumeTolerance, partSolid, carved);

    // Assembled-negative invariant on the FINAL registered pieces: union(pieces)
    // ∩ part ≈ 0 and envelope − union(pieces) − part ≈ 0.
    let assembled: ManifoldSolid | null = null;
    let overlap: ManifoldSolid | null = null;
    try {
      for (const piece of carved) {
        assembled = assembled === null ? piece.asOriginal() : assembled.add(piece);
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
      const direction = input.pieces[index]!.releaseDirection;
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

    return { pieces: targets, releaseSequence, registrationPlan };
  } finally {
    for (const solid of pieceSolids) solid.delete();
    for (const solid of carved) solid.delete();
    if (negativeTool !== partSolid) negativeTool.delete();
    clearanceSphere?.delete();
    remainder?.delete();
    partSolid.delete();
  }
}
