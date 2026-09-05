import type { ReferenceMoldDefinition } from "./referenceMoldDefinition.contracts";

export const DEFAULT_REFERENCE_MOLD_CLEARANCE_MM = 10;
export const MIN_REFERENCE_MOLD_CLEARANCE_MM = 1;
/**
 * Shared across every clearance flow (Cut by Face, Manual, One Mold,
 * Automatic Segmentation), so this is not simply
 * AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM plus a fixed headroom -- it
 * is a general usability/safety ceiling on Mold Scale's numeric input.
 * Retained at 225 when the Segmentation floor dropped 150 -> 100 rather
 * than tightened to floor+75=175: existing Mold Scale/topology-change
 * coverage (cuttingWorkflow.store.test.ts) legitimately drives clearance up
 * to 210mm above the floor to force a genuinely different segment count,
 * which a 175 ceiling would make unreachable. 225 remains reachable,
 * harmless (it never lowers below the floor, only raises the ceiling a
 * scale-up gesture can reach), and is not itself the value Segmentation
 * targets by default.
 */
export const MAX_REFERENCE_MOLD_CLEARANCE_MM = 225;
export const AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM = 100;

type Bounds = ReferenceMoldDefinition["selectionBoxBounds"];

export interface ReferenceMoldFrameBounds {
  readonly partOffset: { readonly x: 0; readonly y: 0; readonly z: number };
  readonly selectionBoxBounds: Bounds;
  readonly referenceMoldBlockBounds: Bounds;
}

export const clampReferenceMoldClearance = (clearanceMm: number): number =>
  Math.min(MAX_REFERENCE_MOLD_CLEARANCE_MM, Math.max(
    MIN_REFERENCE_MOLD_CLEARANCE_MM,
    Number.isFinite(clearanceMm) ? clearanceMm : DEFAULT_REFERENCE_MOLD_CLEARANCE_MM,
  ));

/**
 * Workflow policy for the complete mold envelope considered by automatic
 * Segmentation. Normal Split Face molds retain the standard reference-mold
 * minimum; automatic Segmentation must plan the printable 100 mm-minimum
 * envelope even when the imported part itself fits.
 */
export const resolveAutomaticSegmentationMoldClearance = (
  clearanceMm: number,
): number =>
  Math.max(
    AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM,
    clampReferenceMoldClearance(clearanceMm),
  );

export const createReferenceMoldBlockBounds = (
  innerBounds: Bounds,
  clearanceMm: number,
): Bounds | null => {
  const values = [
    innerBounds.min.x, innerBounds.min.y, innerBounds.min.z,
    innerBounds.max.x, innerBounds.max.y, innerBounds.max.z,
  ];
  if (values.some((value) => !Number.isFinite(value)) ||
      innerBounds.min.x >= innerBounds.max.x ||
      innerBounds.min.y >= innerBounds.max.y ||
      innerBounds.min.z >= innerBounds.max.z ||
      !Number.isFinite(clearanceMm) || clearanceMm < MIN_REFERENCE_MOLD_CLEARANCE_MM ||
      clearanceMm > MAX_REFERENCE_MOLD_CLEARANCE_MM) return null;

  return {
    min: {
      x: innerBounds.min.x - clearanceMm,
      y: innerBounds.min.y - clearanceMm,
      z: innerBounds.min.z - clearanceMm,
    },
    max: {
      x: innerBounds.max.x + clearanceMm,
      y: innerBounds.max.y + clearanceMm,
      z: innerBounds.max.z + clearanceMm,
    },
  };
};

/**
 * Places an imported, grounded part into the canonical manufactured mold
 * frame. The mold bottom remains at Z=0 and the part receives the same bottom
 * clearance used on every other side.
 */
export const createReferenceMoldFrameBounds = (
  groundedPartBounds: Bounds,
  clearanceMm: number,
): ReferenceMoldFrameBounds | null => {
  const partOffset = { x: 0, y: 0, z: clearanceMm } as const;
  const selectionBoxBounds: Bounds = {
    min: {
      x: groundedPartBounds.min.x,
      y: groundedPartBounds.min.y,
      z: groundedPartBounds.min.z + partOffset.z,
    },
    max: {
      x: groundedPartBounds.max.x,
      y: groundedPartBounds.max.y,
      z: groundedPartBounds.max.z + partOffset.z,
    },
  };
  const referenceMoldBlockBounds = createReferenceMoldBlockBounds(
    selectionBoxBounds,
    clearanceMm,
  );
  return referenceMoldBlockBounds === null
    ? null
    : { partOffset, selectionBoxBounds, referenceMoldBlockBounds };
};

export const createAutomaticSegmentationMoldFrameBounds = (
  groundedPartBounds: Bounds,
  requestedClearanceMm: number,
): ReferenceMoldFrameBounds | null =>
  createReferenceMoldFrameBounds(
    groundedPartBounds,
    resolveAutomaticSegmentationMoldClearance(requestedClearanceMm),
  );
