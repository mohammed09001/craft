import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
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
import { axisOf, isPositive, masterStockBoundsFor } from "../masterMoldDirection.analyzer";
import type { MasterCastTarget, MasterMoldProjectSnapshot, MasterToolingPiece, MasterToolingRegistrationFeature } from "./contracts";

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
}

export function toolingParametersFromSnapshot(snapshot: MasterMoldProjectSnapshot): MasterToolingParameters {
  return {
    caseWallThicknessMm: Math.max(snapshot.processProfile.minimumToolingWallMm, 3),
    caseBaseThicknessMm: 3,
    pourOpeningMarginMm: 2,
    partingFlangeWidthMm: 0,
    geometryToleranceMm: snapshot.processProfile.releaseClearanceMm ?? 1e-3,
  };
}

/** Tolerance policy bound to the case envelope (neutral, scale-aware). */
export function toolingTolerancePolicy(caseBounds: Bounds3): GeometryTolerancePolicy {
  return buildGeometryTolerancePolicy(caseBounds, 0);
}

/** Bounds of the one-piece-flush case envelope around `targetBounds` opening along `pourFace`. */
export function caseEnvelopeFor(targetBounds: Bounds3, pourFace: MasterToolingPiece["releaseDirection"], wallMm: number, baseMm: number): Bounds3 {
  return masterStockBoundsFor(targetBounds, pourFace, wallMm, baseMm);
}

function extensionBoxBounds(bounds: Bounds3, direction: MasterToolingPiece["releaseDirection"], extensionMm: number): Bounds3 {
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
  readonly pourFace: MasterToolingPiece["releaseDirection"];
  /**
   * Optional planar split: pieces are the case clipped to the half-space on
   * `splitSide` of the plane.
   */
  readonly split?: { readonly axis: MasterToolingPiece["releaseDirection"]; readonly coordinateMm: number; readonly side: "positive" | "negative" };
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
  readonly parameters: MasterToolingParameters;
}

export type CoreAssignmentMode = "split" | "full-negative" | "full-positive";

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
  const pieceSide: ManifoldSolid = input.split === undefined ? caseSolid : clipToHalfSpace(module, caseSolid, input.split);
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

    // Core handling (split pieces only): remove this piece's unassigned core
    // volume together with the target in ONE Boolean (coincident-face
    // double-subtracts are degenerate), then anchor the assigned core
    // portion onto this piece as a single add.
    let removal: ManifoldSolid = extendedTarget;
    let removalOwned = false;
    if (coreSolid !== null && input.split !== undefined) {
      const side = input.split.side;
      const ownClip = halfSpaceBoundsFor(caseBounds, input.split.axis, input.split.coordinateMm, side);
      const otherClip = halfSpaceBoundsFor(caseBounds, input.split.axis, input.split.coordinateMm, side === "positive" ? "negative" : "positive");
      const ownBox = createBlankSolid(module, ownClip);
      const otherBox = createBlankSolid(module, otherClip);
      try {
        coreOwnSide = coreSolid.intersect(ownBox);
        coreOtherSide = coreSolid.intersect(otherBox);
        const ownsWholeCore =
          (input.coreMode === "full-negative" && side === "negative") ||
          (input.coreMode === "full-positive" && side === "positive");
        const keepsOwnCore = input.coreMode === "split";
        if (!coreOwnSide.isEmpty() && !keepsOwnCore) {
          const unioned = removal.add(coreOwnSide);
          if (removalOwned) removal.delete();
          removal = unioned;
          removalOwned = true;
        }
        if (!coreOtherSide.isEmpty() && keepsOwnCore) {
          withCoreAdded = coreOtherSide;
          coreOtherSide = null;
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

    void_ = pieceSide.subtract(removal);
    if (removalOwned) removal.delete();

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

function halfSpaceBoundsFor(caseBounds: Bounds3, axis: MasterToolingPiece["releaseDirection"], coordinateMm: number, side: "positive" | "negative"): Bounds3 {
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

function clipToHalfSpace(module: Awaited<ReturnType<typeof getManifoldModule>>, caseSolid: ManifoldSolid, split: NonNullable<ConstructPieceInput["split"]>): ManifoldSolid {
  const axis = axisOf(split.axis);
  const caseBounds = boundsFromManifold(caseSolid);
  const min: { x: number; y: number; z: number } = { ...caseBounds.min };
  const max: { x: number; y: number; z: number } = { ...caseBounds.max };
  const halfBounds: Bounds3 = { min, max };
  if (split.side === "positive") {
    min[axis] = split.coordinateMm;
  } else {
    max[axis] = split.coordinateMm;
  }
  const size = { x: halfBounds.max.x - halfBounds.min.x, y: halfBounds.max.y - halfBounds.min.y, z: halfBounds.max.z - halfBounds.min.z };
  if (Object.values(size).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Case-piece half-space clip produced a degenerate volume.");
  }
  const halfSpace = createBlankSolid(module, halfBounds);
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
  pourFace: MasterToolingPiece["releaseDirection"],
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
 * Master Tooling Registration (Execution 05 Article 10): tooling-only
 * alignment pins between split pieces, placed on the parting plane away from
 * the cast target. Mirrored male/female pairing with deterministic IDs.
 * V1 pins run perpendicular to the parting plane, which requires the parting
 * plane to be perpendicular to Z (the cylinder primitive's axis); other
 * parting orientations are reported, never silently skipped.
 */
export async function buildToolingRegistrationFeatures(
  castTarget: MasterCastTarget,
  pourFace: MasterToolingPiece["releaseDirection"],
  split: NonNullable<ConstructPieceInput["split"]>,
  parameters: MasterToolingParameters,
): Promise<{ readonly features: readonly MasterToolingRegistrationFeature[]; readonly solids: readonly ManifoldSolid[]; readonly reason: string | null }> {
  const module = await getManifoldModule();
  if (axisOf(split.axis) !== "z") {
    return { features: [], solids: [], reason: `tooling pins not yet supported for ${split.axis} parting planes` };
  }
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const radius = Math.min(TOOLING_CONSTRUCTION_LIMITS.registrationPinRadiusMm, parameters.caseWallThicknessMm / 2);
  if (radius < 1) {
    return { features: [], solids: [], reason: "wall too thin for tooling alignment pins" };
  }

  const splitAxis = axisOf(split.axis);
  const sideAxes = (["x", "y", "z"] as const).filter((axis) => axis !== splitAxis);
  const pinCenters = [0, 1].map((index) => {
    const point = { x: 0, y: 0, z: 0 };
    point[splitAxis] = split.coordinateMm;
    const insetBase = sideAxes.map((axis) => caseBounds.min[axis] + (caseBounds.max[axis] - caseBounds.min[axis]) * TOOLING_CONSTRUCTION_LIMITS.registrationPinCornerInsetFraction);
    const insetTop = sideAxes.map((axis) => caseBounds.max[axis] - (caseBounds.max[axis] - caseBounds.min[axis]) * TOOLING_CONSTRUCTION_LIMITS.registrationPinCornerInsetFraction);
    point[sideAxes[0]!] = index === 0 ? insetBase[0]! : insetTop[0]!;
    point[sideAxes[1]!] = index === 0 ? insetBase[1]! : insetTop[1]!;
    return point as { x: number; y: number; z: number };
  });

  // Pins must clear the cast target's footprint on the parting plane.
  const targetBounds = castTarget.bounds;
  const pinClearOfTarget = pinCenters.every((center) => {
    const distance = Math.hypot(
      Math.max(targetBounds.min.x - center.x, 0, center.x - targetBounds.max.x),
      Math.max(targetBounds.min.y - center.y, 0, center.y - targetBounds.max.y),
      Math.max(targetBounds.min.z - center.z, 0, center.z - targetBounds.max.z),
    );
    return distance > radius + parameters.geometryToleranceMm;
  });
  if (!pinClearOfTarget) {
    return { features: [], solids: [], reason: "no interference-safe pin placement on the parting plane" };
  }

  const features: MasterToolingRegistrationFeature[] = [];
  const solids: ManifoldSolid[] = [];
  const pinHeightMm = parameters.caseWallThicknessMm * 2;
  for (const [index, center] of pinCenters.entries()) {
    // Manifold cylinders run 0..height along Z; center the pin on the
    // parting plane so it protrudes equally into both piece halves.
    const male = module.Manifold.cylinder(pinHeightMm, radius, radius, TOOLING_CONSTRUCTION_LIMITS.registrationPinSegments)
      .translate(center.x, center.y, center.z - pinHeightMm / 2);
    solids.push(male);
    features.push({
      featureId: `tooling-pin-${split.axis}-${index}`,
      kind: "pin",
      malePieceId: split.side === "negative" ? "piece-negative-side" : "piece-positive-side",
      femalePieceId: split.side === "negative" ? "piece-positive-side" : "piece-negative-side",
    });
  }
  return { features, solids, reason: null };
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
  releaseDirection: MasterToolingPiece["releaseDirection"],
  regions: readonly string[],
): MasterToolingPiece {
  const topology = meshTopology(constructed.mesh);
  return {
    pieceId,
    name,
    mesh: constructed.mesh,
    bounds: constructed.bounds,
    volumeMm3: constructed.volumeMm3,
    triangleCount: constructed.triangleCount,
    watertight: topology.openEdgeCount === 0,
    manifold: topology.openEdgeCount === 0 && topology.nonManifoldEdgeCount === 0,
    releaseDirection,
    regions,
    toolingRegistrationFeatureIds: [],
    fitsBuildVolume: true,
  };
}
