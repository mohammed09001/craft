import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import { DoubleSide, Ray, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { buildMeshGeometry, RAY_INTERSECTION_EPSILON_MM } from "../../geometry/meshBvh";
import {
  boundsFromManifold,
  createBlankSolid,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
  type ManifoldSolid,
} from "../../geometry/manifold";
import { buildGeometryTolerancePolicy, type GeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { meshTopology } from "../../geometry/meshTopology";
import { cylinderPrismPayload, directionIdToVector } from "../../geometry/meshPrimitives";
import { verifyDemoldTranslationByVector } from "../masterMoldDemold.verifier";
import { basisAround, halfSpacePrismPayload } from "../planning/workingMoldConstructor";
import { axisOf, isPositive, masterStockBoundsFor } from "../masterMoldDirection.analyzer";
import type { MasterCastTarget, MasterCastingProcessProfile, MasterMoldDirection, MasterMoldProjectSnapshot, MasterToolingPiece, MasterToolingPull, MasterToolingRegistrationFeature, MasterVentFeature } from "./contracts";

/**
 * Execution 05 Article 10: Master Tooling Piece Construction.
 *
 * Constructs printable solids from the selected tooling plan: an enclosing
 * case with Master-specific parameters, an assembled casting void equal to
 * the MasterCastTarget, Master-tooling-only registration features (never
 * Final Mold Registration), and printer build-volume checks.
 */

/** Centralized construction limits (Execution 05 Article 09: no scattered magic constants). */
export const TOOLING_CONSTRUCTION_LIMITS = {
  /** Safety factor on the tolerance-policy surface tolerance for open-face extension. */
  openFaceExtensionSafetyFactor: 8,
  /** The demold sweep samples out to required depth plus this margin. */
  demoldClearanceSafetyFactor: 1.1,
  /** Tooling-only registration pin radius (mm), clamped by available wall. */
  registrationPinRadiusMm: 2.5,
  /** Registration pin placement inset from the case corner, as a fraction of the side length. */
  registrationPinCornerInsetFraction: 0.2,
  /** Segments for registration pin cylinders. */
  registrationPinSegments: 16,
} as const;

export interface MasterToolingParameters {
  readonly caseWallThicknessMm: number;
  readonly caseBaseThicknessMm: number;
  readonly pourOpeningMarginMm: number;
  readonly partingFlangeWidthMm: number;
  readonly geometryToleranceMm: number;
  /** Profile-driven printable panel cap per tooling set (Execution 06 Article 09/12). */
  readonly maxToolingPieces: number;
}

export function toolingParametersFromSnapshot(snapshot: MasterMoldProjectSnapshot): MasterToolingParameters {
  return toolingParametersFromProfile(snapshot.processProfile);
}

/** Execution 06: profile-driven parameters without requiring the legacy project snapshot. */
export function toolingParametersFromProfile(profile: MasterCastingProcessProfile): MasterToolingParameters {
  return {
    caseWallThicknessMm: Math.max(profile.minimumToolingWallMm, 3),
    caseBaseThicknessMm: 3,
    pourOpeningMarginMm: 2,
    partingFlangeWidthMm: 0,
    geometryToleranceMm: profile.releaseClearanceMm ?? 1e-3,
    maxToolingPieces: profile.maximumToolingPieceCount,
  };
}

/** Tolerance policy bound to the case envelope (neutral, scale-aware). */
export function toolingTolerancePolicy(caseBounds: Bounds3): GeometryTolerancePolicy {
  return buildGeometryTolerancePolicy(caseBounds, 0);
}

/** Bounds of the one-piece-flush case envelope around `targetBounds` opening along `pourFace`. */
export function caseEnvelopeFor(targetBounds: Bounds3, pourFace: MasterMoldDirection, wallMm: number, baseMm: number): Bounds3 {
  return masterStockBoundsFor(targetBounds, pourFace, wallMm, baseMm);
}

function extensionBoxBounds(bounds: Bounds3, direction: MasterMoldDirection, extensionMm: number): Bounds3 {
  const axis = axisOf(direction);
  const min = { ...bounds.min };
  const max = { ...bounds.max };
  if (isPositive(direction)) {
    min[axis] = bounds.max[axis];
    max[axis] = bounds.max[axis] + extensionMm;
  } else {
    max[axis] = bounds.min[axis];
    min[axis] = bounds.min[axis] - extensionMm;
  }
  return { min, max };
}

export interface ConstructPieceInput {
  readonly castTarget: MasterCastTarget;
  readonly pourFace: MasterMoldDirection;
  /**
   * Optional planar split: pieces are the case clipped to the half-space on
   * `splitSide` of the plane. Axis-aligned when `normal` is undefined (the
   * plane sits at `coordinateMm` along `axis`); otherwise the plane passes
   * through `point` with unit normal `normal` (Execution 07 LOOP 04: bounded
   * oblique planar tooling splits).
   */
  readonly split?: {
    readonly axis: MasterMoldDirection;
    readonly coordinateMm: number;
    readonly side: "positive" | "negative";
    readonly normal?: { readonly x: number; readonly y: number; readonly z: number };
    readonly point?: { readonly x: number; readonly y: number; readonly z: number };
  };
  /**
   * The part-negative tool mesh (the functional core shape). With a split,
   * `coreMode` assigns the core volume between the pieces (Priyadarshi–Gupta
   * core construction): "split" anchors each side's fill to its own piece;
   * "full-negative"/"full-positive" mount the ENTIRE core on that side's
   * piece — the physically correct anchoring when the core's base rests on
   * that piece's parting face (e.g. a pocket opening away from the pour
   * face).
   */
  readonly coreToolMesh: MoldMeshPayload | null;
  readonly coreMode: CoreAssignmentMode;
  readonly ventPaths?: readonly MasterVentFeature[];
  readonly parameters: MasterToolingParameters;
}

export type CoreAssignmentMode = "split" | "full-negative" | "full-positive" | "localized-removable-core";

/**
 * Execution 07 LOOP 07: exact mesh proof inputs for vent candidates. The
 * vent route must never re-enter the cast-target solid nor cross the
 * protected functional surface (the original-part negative); both checks are
 * exact mesh ray crossings over the candidate segment.
 */
export interface VentProofContext {
  readonly targetMesh: MoldMeshPayload;
  readonly protectedMesh: MoldMeshPayload | null;
}

/** Unique forward mesh crossings of the ray along direction from origin, up to maxLength (exclusive). */
function segmentCrossingCount(bvh: MeshBVH, origin: Vector3, direction: Vector3, maxLengthMm: number): number {
  const ray = new Ray(origin, direction);
  const intersections = bvh
    .raycast(ray, DoubleSide, RAY_INTERSECTION_EPSILON_MM, maxLengthMm)
    .map((intersection) => intersection.distance)
    .filter((distance) => Number.isFinite(distance) && distance > RAY_INTERSECTION_EPSILON_MM)
    .sort((left, right) => left - right);
  let uniqueCount = 0;
  let previousDistance = -Infinity;
  for (const distance of intersections) {
    if (distance - previousDistance > RAY_INTERSECTION_EPSILON_MM) {
      uniqueCount += 1;
      previousDistance = distance;
    }
  }
  return uniqueCount;
}

/**
 * Vent-path candidate generation (Execution 07 LOOP 07). Broad phase is
 * AABB/ray: each pocket tries the six axis channels out to the case
 * envelope, prefiltered with a ray/AABB slab test. When a VentProofContext
 * is supplied, the final proof is exact mesh/protected-surface checking --
 * the channel may not re-enter the cast target or cross the protected
 * functional surface -- and a proven path is an automatic mesh-verified
 * vent. Without the context the conservative planning-time AABB check
 * applies (pocket on the protected boundary, straight outward route) and the
 * path stays marked as such. Unproven pockets remain user-review
 * recommendations; the caller owns final CSG and re-verification of the
 * resulting geometry.
 */
export function safeVentPathsFor(
  targetBounds: Bounds3,
  caseBounds: Bounds3,
  protectedBounds: Bounds3,
  recommendations: readonly { readonly recommendationId: string; readonly pocketPosition: { readonly x: number; readonly y: number; readonly z: number } }[],
  wallThicknessMm: number,
  proofContext?: VentProofContext,
): MasterVentFeature[] {
  const tolerance = Math.max(1e-3, wallThicknessMm * 0.05);
  const radiusMm = Math.max(0.25, Math.min(wallThicknessMm * 0.2, 1));
  const faces = [
    { axis: "x" as const, side: "min" as const }, { axis: "x" as const, side: "max" as const },
    { axis: "y" as const, side: "min" as const }, { axis: "y" as const, side: "max" as const },
    { axis: "z" as const, side: "min" as const }, { axis: "z" as const, side: "max" as const },
  ];
  let targetBvh: MeshBVH | null = null;
  let protectedBvh: MeshBVH | null = null;
  let targetGeometry: ReturnType<typeof buildMeshGeometry> | null = null;
  let protectedGeometry: ReturnType<typeof buildMeshGeometry> | null = null;
  if (proofContext !== undefined) {
    try {
      targetGeometry = buildMeshGeometry(proofContext.targetMesh);
      targetBvh = new MeshBVH(targetGeometry);
      if (proofContext.protectedMesh !== null) {
        protectedGeometry = buildMeshGeometry(proofContext.protectedMesh);
        protectedBvh = new MeshBVH(protectedGeometry);
      }
    } catch {
      targetBvh = null;
      protectedBvh = null;
    }
  }

  const paths: MasterVentFeature[] = [];
  for (const recommendation of recommendations) {
    const point = recommendation.pocketPosition;
    const withinTarget = (["x", "y", "z"] as const).every((axis) => point[axis] >= targetBounds.min[axis] - tolerance && point[axis] <= targetBounds.max[axis] + tolerance);
    if (!withinTarget) continue;
    const origin = new Vector3(point.x, point.y, point.z);
    const candidates: { face: (typeof faces)[number]; end: { x: number; y: number; z: number }; lengthMm: number; boundaryFirst: boolean }[] = [];
    for (const face of faces) {
      const outward = face.side === "min" ? -1 : 1;
      const end = { x: point.x, y: point.y, z: point.z };
      end[face.axis] = face.side === "min" ? caseBounds.min[face.axis] + radiusMm : caseBounds.max[face.axis] - radiusMm;
      const lengthMm = (end[face.axis] - point[face.axis]) * outward;
      if (lengthMm <= radiusMm * 2) continue;
      // Broad phase: ray/AABB slab test against the target bounds. The
      // channel must actually leave the target AABB along its length (a
      // pocket buried along every axis direction cannot vent in a straight
      // line); the exact mesh proof decides the rest.
      const direction = new Vector3(
        face.axis === "x" ? outward : 0,
        face.axis === "y" ? outward : 0,
        face.axis === "z" ? outward : 0,
      );
      let tExit = Infinity;
      let slabAdmits = true;
      for (const axis of ["x", "y", "z"] as const) {
        const o = origin[axis];
        const d = direction[axis];
        if (Math.abs(d) <= 1e-12) {
          if (o < targetBounds.min[axis] - tolerance || o > targetBounds.max[axis] + tolerance) {
            slabAdmits = false;
            break;
          }
          continue;
        }
        const tNear = (targetBounds.min[axis] - o) / d;
        const tFar = (targetBounds.max[axis] - o) / d;
        tExit = Math.min(tExit, Math.max(tNear, tFar));
      }
      if (!slabAdmits || !Number.isFinite(tExit) || tExit > lengthMm + tolerance) continue;
      const boundaryFirst = Math.abs(point[face.axis] - (face.side === "min" ? protectedBounds.min[face.axis] : protectedBounds.max[face.axis])) <= tolerance;
      candidates.push({ face, end, lengthMm, boundaryFirst });
    }
    // Boundary channels first (the historical conservative case), then by
    // shortest route, both deterministic.
    candidates.sort((a, b) =>
      Number(b.boundaryFirst) - Number(a.boundaryFirst) ||
      a.lengthMm - b.lengthMm ||
      faces.indexOf(a.face) - faces.indexOf(b.face),
    );
    for (const candidate of candidates) {
      const outward = candidate.face.side === "min" ? -1 : 1;
      let proof: MasterVentFeature["proof"] = "aabb-conservative";
      if (targetBvh !== null) {
        const direction = new Vector3(
          candidate.face.axis === "x" ? outward : 0,
          candidate.face.axis === "y" ? outward : 0,
          candidate.face.axis === "z" ? outward : 0,
        );
        const proofOrigin = origin.clone().addScaledVector(direction, 1e-3);
        const proofLengthMm = candidate.lengthMm - 1e-3;
        // Final proof: exact mesh crossings. The vent route must not pass
        // through cast-target material nor through the protected functional
        // surface anywhere along the channel.
        if (segmentCrossingCount(targetBvh, proofOrigin, direction, proofLengthMm) !== 0) continue;
        if (protectedBvh !== null && segmentCrossingCount(protectedBvh, proofOrigin, direction, proofLengthMm) !== 0) continue;
        proof = "mesh-verified";
      } else {
        // Conservative fallback without a mesh proof: only the protected
        // boundary channel straight outward is admissible.
        if (!candidate.boundaryFirst) continue;
      }
      paths.push({ featureId: recommendation.recommendationId, kind: "vent", start: point, end: candidate.end, radiusMm, proof });
      break;
    }
  }
  targetGeometry?.dispose();
  protectedGeometry?.dispose();
  return paths;
}

export interface ConstructedPiece {
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
  readonly triangleCount: number;
  readonly solid: ManifoldSolid;
}

/**
 * Constructs one case piece as a printable solid: case envelope (∩ half-space
 * when split) − (target ∪ pour-face extension). The extension guarantees the
 * Boolean genuinely breaches the opening face instead of relying on exact
 * coplanar coincidence.
 */
export async function constructCasePiece(input: ConstructPieceInput): Promise<ConstructedPiece> {
  const { castTarget, pourFace, parameters } = input;
  const module = await getManifoldModule();
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const policy = toolingTolerancePolicy(caseBounds);
  const extensionMm = policy.surfaceToleranceMm * TOOLING_CONSTRUCTION_LIMITS.openFaceExtensionSafetyFactor + parameters.pourOpeningMarginMm;

  const caseSolid = createBlankSolid(module, caseBounds);
  // Without a split the piece IS the whole case solid; with a split it is a
  // distinct clipped solid. Delete exactly once in either case.
  const pieceSide: ManifoldSolid = input.split === undefined ? caseSolid : clipToHalfSpace(module, caseSolid, input.split, policy.booleanToleranceMm);
  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  const extensionSolid = createBlankSolid(module, extensionBoxBounds(castTarget.bounds, pourFace, extensionMm));
  const coreSolid = input.coreToolMesh === null ? null : manifoldFromPayload(module, input.coreToolMesh, policy.booleanToleranceMm);
  let extendedTarget: ReturnType<typeof targetSolid.add> | null = null;
  let void_: ReturnType<typeof pieceSide.subtract> | null = null;
  let coreOwnSide: ReturnType<typeof pieceSide.intersect> | null = null;
  let coreOtherSide: ManifoldSolid | null = null;
  let coreWhole: ManifoldSolid | null = null;
  let withCoreAdded: ManifoldSolid | null = null;

  try {
    extendedTarget = targetSolid.add(extensionSolid);

    // Core handling (split pieces only). Execution 06 Article 09: the
    // default "split" mode subtracts ONLY this side's half of the target
    // (+extension) so the two cavities tile the negative directly --
    // legacy sibling-fill plugs mechanically lock over blind-hole bosses
    // and are no longer produced. The "full-negative"/"full-positive"
    // modes anchor the ENTIRE core volume onto one side for cavities whose
    // portion would otherwise be unanchored by the parting plane.
    let removal: ManifoldSolid = extendedTarget;
    let removalOwned = false;
    let plainRemoval = true;
    if (coreSolid !== null && input.split !== undefined && input.coreMode !== "split") {
      plainRemoval = false;
      const side = input.split.side;
      const ownClip = halfSpaceClipSolid(module, caseBounds, input.split, side, policy.booleanToleranceMm);
      const otherClip = halfSpaceClipSolid(module, caseBounds, input.split, side === "positive" ? "negative" : "positive", policy.booleanToleranceMm);
      const ownBox = ownClip;
      const otherBox = otherClip;
      try {
        coreOwnSide = coreSolid.intersect(ownBox);
        coreOtherSide = coreSolid.intersect(otherBox);
        const ownsWholeCore =
          (input.coreMode === "full-negative" && side === "negative") ||
          (input.coreMode === "full-positive" && side === "positive");
        if (!coreOwnSide.isEmpty()) {
          const unioned = removal.add(coreOwnSide);
          removal.delete();
          removal = unioned;
          removalOwned = true;
        }
        if (ownsWholeCore) {
          coreWhole = coreSolid.asOriginal();
          withCoreAdded = coreWhole;
          coreWhole = null;
        }
        if (removesAllCore(input.coreMode, side)) {
          const unioned = removal.add(coreSolid.asOriginal());
          if (removalOwned) removal.delete();
          removal = unioned;
          removalOwned = true;
        }
      } finally {
        ownBox.delete();
        otherBox.delete();
      }
    }
    if (plainRemoval && input.split !== undefined) {
      const ownBox = halfSpaceClipSolid(module, caseBounds, input.split, input.split.side, policy.booleanToleranceMm);
      try {
        const clipped = extendedTarget.intersect(ownBox);
        extendedTarget.delete();
        extendedTarget = clipped;
        removal = extendedTarget;
      } finally {
        ownBox.delete();
      }
    }

    void_ = pieceSide.subtract(removal);
    if (removalOwned) removal.delete();

    // Vent subtraction is deliberately applied before topology and release
    // validation. A candidate is conservative at planning time, but the
    // final case geometry remains the source of truth for every proof.
    for (const vent of input.ventPaths ?? []) {
      const dx = vent.end.x - vent.start.x;
      const dy = vent.end.y - vent.start.y;
      const dz = vent.end.z - vent.start.z;
      const length = Math.hypot(dx, dy, dz);
      if (length <= 1e-6 || void_ === null) continue;
      const ventSolid = manifoldFromPayload(
        module,
        cylinderPrismPayload({ x: dx / length, y: dy / length, z: dz / length }, {
          x: (vent.start.x + vent.end.x) / 2,
          y: (vent.start.y + vent.end.y) / 2,
          z: (vent.start.z + vent.end.z) / 2,
        }, vent.radiusMm, length, TOOLING_CONSTRUCTION_LIMITS.registrationPinSegments),
        policy.booleanToleranceMm,
      );
      try {
        const next = void_.subtract(ventSolid);
        void_.delete();
        void_ = next;
      } finally {
        ventSolid.delete();
      }
    }

    if (withCoreAdded !== null) {
      if (withCoreAdded.isEmpty()) {
        withCoreAdded.delete();
        withCoreAdded = null;
      } else {
        const merged = void_.add(withCoreAdded);
        void_.delete();
        void_ = null;
        withCoreAdded.delete();
        withCoreAdded = null;
        void_ = merged;
      }
    }

    const result = void_;
    if (result === null) throw new Error(`${castTarget.moldPartName}: case piece Boolean construction failed.`);
    const status = result.status();
    if (status !== "NoError" || result.isEmpty()) {
      throw new Error(`${castTarget.moldPartName}: case piece Boolean construction failed.`);
    }
    // Connectivity gate: a piece with a floating fragment (an unanchored
    // core plug) can never be printed or disassembled as one rigid body.
    const components = result.decompose();
    const componentCount = components.length;
    for (const component of components) component.delete();
    if (componentCount > 1) {
      throw new Error(`${castTarget.moldPartName}: case piece is not a single connected solid.`);
    }
    const mesh = payloadFromManifold(result);
    const bounds = boundsFromManifold(result);
    return {
      mesh,
      bounds,
      volumeMm3: result.volume(),
      triangleCount: mesh.indices.length / 3,
      // Detached from the kernel objects below; caller owns this solid.
      solid: result.asOriginal(),
    };
  } finally {
    void_?.delete();
    withCoreAdded?.delete();
    coreOwnSide?.delete();
    coreOtherSide?.delete();
    coreWhole?.delete();
    extendedTarget?.delete();
    extensionSolid.delete();
    coreSolid?.delete();
    targetSolid.delete();
    if (input.split !== undefined) pieceSide.delete();
    caseSolid.delete();
  }
}

function removesAllCore(mode: CoreAssignmentMode, side: "positive" | "negative"): boolean {
  return (
    (mode === "full-negative" && side === "positive") ||
    (mode === "full-positive" && side === "negative")
  );
}

function halfSpaceBoundsFor(caseBounds: Bounds3, axis: MasterMoldDirection, coordinateMm: number, side: "positive" | "negative"): Bounds3 {
  const axisName = axisOf(axis);
  const min: { x: number; y: number; z: number } = { ...caseBounds.min };
  const max: { x: number; y: number; z: number } = { ...caseBounds.max };
  if (side === "positive") {
    min[axisName] = coordinateMm;
  } else {
    max[axisName] = coordinateMm;
  }
  return { min, max };
}

/**
 * The half-space on `side` of the split plane as a Manifold solid: an
 * axis-aligned box for axis splits, an oriented prism (via the shared
 * half-space payload the working-mold constructor uses) for oblique splits.
 * One clipping primitive for both, so oblique planar tooling splits reuse the
 * exact same Boolean path instead of a second engine.
 */
function halfSpaceClipSolid(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  caseBounds: Bounds3,
  split: NonNullable<ConstructPieceInput["split"]>,
  side: "positive" | "negative",
  toleranceMm: number,
): ManifoldSolid {
  if (split.normal === undefined || split.point === undefined) {
    return createBlankSolid(module, halfSpaceBoundsFor(caseBounds, split.axis, split.coordinateMm, side));
  }
  const sign = side === "positive" ? 1 : -1;
  const direction = { x: split.normal.x * sign, y: split.normal.y * sign, z: split.normal.z * sign };
  const planeOffsetMm = split.normal.x * split.point.x + split.normal.y * split.point.y + split.normal.z * split.point.z;
  return manifoldFromPayload(module, halfSpacePrismPayload(direction, sign * planeOffsetMm, caseBounds), toleranceMm);
}

function clipToHalfSpace(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  caseSolid: ManifoldSolid,
  split: NonNullable<ConstructPieceInput["split"]>,
  toleranceMm: number,
): ManifoldSolid {
  const halfSpace = halfSpaceClipSolid(module, boundsFromManifold(caseSolid), split, split.side, toleranceMm);
  try {
    return caseSolid.intersect(halfSpace);
  } finally {
    halfSpace.delete();
  }
}

/**
 * Execution 05 Article 10 "Negative Geometry" invariant check.
 *
 * `overlapVolumeMm3` (assembled tooling material inside the cast target)
 * must be ~0: the target sits entirely inside the assembled casting void.
 * `residualVoidVolumeMm3` = envelope − assembled − target must be ≈ the
 * designed pour-opening channel (never negative, never enormous): it is the
 * void volume beyond the target itself.
 */
export async function validateAssembledNegative(
  pieceSolids: readonly ManifoldSolid[],
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: MasterToolingParameters,
): Promise<{ readonly overlapVolumeMm3: number; readonly residualVoidVolumeMm3: number }> {
  const module = await getManifoldModule();
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const policy = toolingTolerancePolicy(caseBounds);
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-4);

  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let assembled: ManifoldSolid | null = null;
  let overlap: ManifoldSolid | null = null;

  try {
    for (const piece of pieceSolids) {
      if (assembled === null) {
        assembled = piece.asOriginal();
      } else {
        const union: ManifoldSolid = assembled.add(piece);
        assembled.delete();
        assembled = union;
      }
    }
    if (assembled === null) return { overlapVolumeMm3: Number.POSITIVE_INFINITY, residualVoidVolumeMm3: Number.POSITIVE_INFINITY };

    overlap = assembled.intersect(targetSolid);
    const overlapVolumeMm3 = overlap.volume();
    const envelopeVolume =
      (caseBounds.max.x - caseBounds.min.x) * (caseBounds.max.y - caseBounds.min.y) * (caseBounds.max.z - caseBounds.min.z);
    const residualVoidVolumeMm3 = envelopeVolume - assembled.volume() - targetSolid.volume();

    return {
      overlapVolumeMm3,
      residualVoidVolumeMm3: Math.abs(residualVoidVolumeMm3) <= volumeTolerance ? 0 : residualVoidVolumeMm3,
    };
  } finally {
    overlap?.delete();
    assembled?.delete();
    targetSolid.delete();
  }
}

/**
 * Master Tooling Registration (Execution 05 Article 10, connected by
 * Execution 06 Article 10): tooling-only alignment pins between split
 * pieces, placed on the parting plane away from the cast target. Mirrored
 * male/female pairing with deterministic IDs. Pins are constructed as
 * explicit prism payloads oriented along the split axis, so any parting
 * orientation is supported (the previous Z-only limitation is gone); an
 * interface is skipped only with an explicit reason, never silently.
 */
export interface ToolingPinPlacement {
  readonly feature: MasterToolingRegistrationFeature;
  readonly payload: MoldMeshPayload;
}

export function planToolingRegistrationPinPlacements(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  split: NonNullable<ConstructPieceInput["split"]>,
  parameters: MasterToolingParameters,
  functionalBounds?: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
): { readonly placements: readonly ToolingPinPlacement[]; readonly reason: string | null } {
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const radius = Math.min(TOOLING_CONSTRUCTION_LIMITS.registrationPinRadiusMm, parameters.caseWallThicknessMm / 2);
  if (radius < 1) {
    return { placements: [], reason: "wall too thin for tooling alignment pins" };
  }

  const oblique = split.normal !== undefined && split.point !== undefined;
  const pinAxis = oblique ? split.normal : directionIdToVector(split.axis);
  const splitAxisName = axisOf(split.axis);
  const sideAxes = (["x", "y", "z"] as const).filter((axis) => axis !== splitAxisName);
  const pinCenters: { x: number; y: number; z: number }[] = oblique
    ? (() => {
        // Oblique split: pins sit on the actual split plane, offset along the
        // plane's own basis so they bridge the interface at opposite corners.
        const normal = split.normal!;
        const planeOffsetMm = normal.x * split.point!.x + normal.y * split.point!.y + normal.z * split.point!.z;
        const { u, v } = basisAround(normal);
        const caseCenter = {
          x: (caseBounds.min.x + caseBounds.max.x) / 2,
          y: (caseBounds.min.y + caseBounds.max.y) / 2,
          z: (caseBounds.min.z + caseBounds.max.z) / 2,
        };
        const along = normal.x * caseCenter.x + normal.y * caseCenter.y + normal.z * caseCenter.z;
        const projected = {
          x: caseCenter.x + normal.x * (planeOffsetMm - along),
          y: caseCenter.y + normal.y * (planeOffsetMm - along),
          z: caseCenter.z + normal.z * (planeOffsetMm - along),
        };
        const diagonal = Math.hypot(caseBounds.max.x - caseBounds.min.x, caseBounds.max.y - caseBounds.min.y, caseBounds.max.z - caseBounds.min.z);
        const inset = diagonal * TOOLING_CONSTRUCTION_LIMITS.registrationPinCornerInsetFraction;
        return [projected, projected].map((point, index) => {
          const sign = index === 0 ? -1 : 1;
          return {
            x: point.x + sign * (u.x + v.x) * inset,
            y: point.y + sign * (u.y + v.y) * inset,
            z: point.z + sign * (u.z + v.z) * inset,
          };
        });
      })()
    : [0, 1].map((index) => {
        const point = { x: 0, y: 0, z: 0 };
        point[splitAxisName] = split.coordinateMm;
        const insetBase = sideAxes.map((axis) => caseBounds.min[axis] + (caseBounds.max[axis] - caseBounds.min[axis]) * TOOLING_CONSTRUCTION_LIMITS.registrationPinCornerInsetFraction);
        const insetTop = sideAxes.map((axis) => caseBounds.max[axis] - (caseBounds.max[axis] - caseBounds.min[axis]) * TOOLING_CONSTRUCTION_LIMITS.registrationPinCornerInsetFraction);
        point[sideAxes[0]!] = index === 0 ? insetBase[0]! : insetTop[0]!;
        point[sideAxes[1]!] = index === 0 ? insetBase[1]! : insetTop[1]!;
        return point as { x: number; y: number; z: number };
      });

  // Pins must clear the FUNCTIONAL part footprint (the source-part cavity),
  // not the piece's whole bounding box -- the piece extends far beyond the
  // functional region into its own walls (Execution 06 Article 10).
  const targetBounds = functionalBounds ?? castTarget.bounds;
  const pinClearOfTarget = pinCenters.every((center) => {
    const distance = Math.hypot(
      Math.max(targetBounds.min.x - center.x, 0, center.x - targetBounds.max.x),
      Math.max(targetBounds.min.y - center.y, 0, center.y - targetBounds.max.y),
      Math.max(targetBounds.min.z - center.z, 0, center.z - targetBounds.max.z),
    );
    return distance > radius + parameters.geometryToleranceMm;
  });
  if (!pinClearOfTarget) {
    return { placements: [], reason: "no interference-safe pin placement on the parting plane" };
  }

  const pinHeightMm = parameters.caseWallThicknessMm * 2;
  const placements: ToolingPinPlacement[] = pinCenters.map((center, index) => ({
    feature: {
      featureId: `tooling-pin-${split.axis}-${index}`,
      kind: "pin",
      malePieceId: "piece-positive-side",
      femalePieceId: "piece-negative-side",
    },
    payload: cylinderPrismPayload(pinAxis, center, radius, pinHeightMm, TOOLING_CONSTRUCTION_LIMITS.registrationPinSegments),
  }));
  return { placements, reason: null };
}

export interface RegisteredPiecePair {
  readonly positivePiece: ConstructedPiece;
  readonly negativePiece: ConstructedPiece;
  readonly features: readonly MasterToolingRegistrationFeature[];
  readonly reason: string | null;
}

function copyConstructed(piece: ConstructedPiece): ConstructedPiece {
  return { ...piece, solid: piece.solid.asOriginal() };
}

/**
 * Applies the planned registration pins to the verified piece pair: male
 * pins are unioned into the positive-side piece, matching sockets are
 * subtracted from the negative-side piece, and the positive piece's release
 * sweep is re-verified against the socketed sibling (the pins retract along
 * the release axis, but the proof is re-run, not assumed).
 *
 * Ownership: the inputs are never mutated or released; the returned pair is
 * ALWAYS freshly created and the caller owns/releases exactly the returned
 * solids.
 */
export async function applyToolingRegistration(input: {
  readonly castTarget: MasterCastTarget;
  readonly pourFace: MasterMoldDirection;
  readonly split: NonNullable<ConstructPieceInput["split"]>;
  readonly parameters: MasterToolingParameters;
  readonly positivePiece: ConstructedPiece;
  readonly negativePiece: ConstructedPiece;
  readonly functionalBounds?: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } };
}): Promise<RegisteredPiecePair> {
  const { placements, reason } = planToolingRegistrationPinPlacements(input.castTarget, input.pourFace, input.split, input.parameters, input.functionalBounds);
  if (placements.length === 0 || reason !== null) {
    return {
      positivePiece: copyConstructed(input.positivePiece),
      negativePiece: copyConstructed(input.negativePiece),
      features: [],
      reason: reason ?? "no registration placements generated",
    };
  }

  const module = await getManifoldModule();
  const caseBounds = caseEnvelopeFor(input.castTarget.bounds, input.pourFace, input.parameters.caseWallThicknessMm, input.parameters.caseBaseThicknessMm);
  const policy = toolingTolerancePolicy(caseBounds);
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, input.castTarget.volumeMm3 * 1e-3);
  const sweepClearanceMm =
    (input.castTarget.bounds.max[axisOf(input.split.axis)] - input.castTarget.bounds.min[axisOf(input.split.axis)]) *
      TOOLING_CONSTRUCTION_LIMITS.demoldClearanceSafetyFactor +
    input.parameters.caseWallThicknessMm * 2;

  let positiveSolid: ManifoldSolid = input.positivePiece.solid.asOriginal();
  let negativeSolid: ManifoldSolid = input.negativePiece.solid.asOriginal();
  try {
    for (const placement of placements) {
      const pinSolid = manifoldFromPayload(module, placement.payload, policy.booleanToleranceMm);
      try {
        const withPin = positiveSolid.add(pinSolid);
        positiveSolid.delete();
        positiveSolid = withPin;
        const withSocket = negativeSolid.subtract(pinSolid);
        negativeSolid.delete();
        negativeSolid = withSocket;
      } finally {
        pinSolid.delete();
      }
    }

    // Re-verify the positive piece's release now that it carries pins. The
    // sweep runs along the split plane's normal (the registered pair's only
    // guaranteed free direction), axis or oblique alike.
    const sweepDirection: readonly [number, number, number] =
      input.split.normal === undefined
        ? (({ x, y, z }) => [x, y, z] as const)(directionIdToVector(input.split.axis))
        : [input.split.normal.x, input.split.normal.y, input.split.normal.z];
    const sweep = verifyDemoldTranslationByVector(negativeSolid, positiveSolid, sweepDirection, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    if (!sweep.removable) {
      return {
        positivePiece: constructedFromSolid(positiveSolid),
        negativePiece: constructedFromSolid(negativeSolid),
        features: [],
        reason: "registered pieces failed the re-verified release sweep",
      };
    }

    const positiveMesh = payloadFromManifold(positiveSolid);
    const negativeMesh = payloadFromManifold(negativeSolid);
    return {
      positivePiece: {
        mesh: positiveMesh,
        bounds: boundsFromManifold(positiveSolid),
        volumeMm3: positiveSolid.volume(),
        triangleCount: positiveMesh.indices.length / 3,
        solid: positiveSolid.asOriginal(),
      },
      negativePiece: {
        mesh: negativeMesh,
        bounds: boundsFromManifold(negativeSolid),
        volumeMm3: negativeSolid.volume(),
        triangleCount: negativeMesh.indices.length / 3,
        solid: negativeSolid.asOriginal(),
      },
      features: placements.map((placement) => placement.feature),
      reason: null,
    };
  } finally {
    // The asOriginal() copies handed to the caller keep the underlying
    // geometry alive; these working solids are always released here.
    positiveSolid.delete();
    negativeSolid.delete();
  }
}

/** Builds a ConstructedPiece from an owned solid, exporting fresh mesh metadata. */
function constructedFromSolid(solid: ManifoldSolid): ConstructedPiece {
  const mesh = payloadFromManifold(solid);
  return {
    mesh,
    bounds: boundsFromManifold(solid),
    volumeMm3: solid.volume(),
    triangleCount: mesh.indices.length / 3,
    solid: solid.asOriginal(),
  };
}

/** Printer build-volume check (Execution 05 Article 10). */
export function fitsBuildVolume(piece: MasterToolingPiece, snapshot: MasterMoldProjectSnapshot): boolean {
  const volume = snapshot.printerBuildVolume;
  if (volume === null) return true;
  return (
    piece.bounds.max.x - piece.bounds.min.x <= volume.x &&
    piece.bounds.max.y - piece.bounds.min.y <= volume.y &&
    piece.bounds.max.z - piece.bounds.min.z <= volume.z
  );
}

/** Assembles a MasterToolingPiece from a constructed solid (validating finiteness/topology). */
export function pieceFromConstructed(
  pieceId: string,
  name: string,
  constructed: ConstructedPiece,
  releaseDirection: MasterToolingPull,
  regions: readonly string[],
  toolingRegistrationFeatureIds: readonly string[] = [],
  directionVector?: { readonly x: number; readonly y: number; readonly z: number },
): MasterToolingPiece {
  const topology = meshTopology(constructed.mesh);
  return {
    pieceId,
    name,
    mesh: constructed.mesh,
    bounds: constructed.bounds,
    volumeMm3: constructed.volumeMm3,
    // Derived from the emitted mesh itself (Execution 07 LOOP 10): some
    // multi-panel construction paths pass placeholder counts, and a piece's
    // reported triangle count must always describe the actual geometry.
    triangleCount: constructed.mesh.indices.length / 3,
    watertight: topology.openEdgeCount === 0,
    manifold: topology.openEdgeCount === 0 && topology.nonManifoldEdgeCount === 0,
    releaseDirection,
    ...(directionVector === undefined ? {} : { directionVector }),
    regions,
    toolingRegistrationFeatureIds,
    fitsBuildVolume: true,
  };
}
