/**
 * Algorithmic initial-position suggestion for a user-added extension plane
 * on a newly-available axis (see spec: automatic initial position for a
 * user-added axis). Reuses the same protected-region conflict rule as the
 * baseline algorithm's own candidate evaluation rather than re-deriving it.
 */
import type { SegmentationSourceSnapshot } from "./segmentation.contracts";
import type { FitAxis } from "../fitAnalysis";
import { coordinateConflictsWithRegion } from "./baselineSegmentationAlgorithm";

/** Minimum margin from either bound, as a fraction of the axis span, so the
 * suggestion never lands degenerately close to an edge. */
const MARGIN_FRACTION = 0.02;
/** Fractions of the axis span probed outward from the midpoint, in order. */
const SEARCH_STEP_FRACTIONS: readonly number[] = [
  0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.25, -0.25, 0.3, -0.3,
  0.35, -0.35, 0.4, -0.4, 0.45, -0.45,
];

function hasHardConflict(
  source: SegmentationSourceSnapshot,
  axis: FitAxis,
  coordinateMm: number,
): boolean {
  return source.protectedRegions.some(
    (region) =>
      region.hardness === "hard" &&
      coordinateConflictsWithRegion(region, axis, coordinateMm),
  );
}

/**
 * Suggests an absolute millimeter coordinate for a new extension plane on
 * `axis`, bisecting the source geometry's own bounds on that axis and
 * nudging away from any hard protected region. Falls back to the plain
 * midpoint when no conflict-free candidate is found within the search
 * range -- the user can still drag the plane manually afterward. Callers
 * pass this coordinate directly to applyExtensionBoundary/
 * mergeExtensionBoundary, both of which operate in millimeters, not a
 * normalized 0..1 fraction.
 */
export function suggestExtensionAxisPosition(
  source: SegmentationSourceSnapshot,
  axis: FitAxis,
): number {
  const bounds = source.aggregateBounds;
  const minimum = bounds.min[axis];
  const maximum = bounds.max[axis];
  const span = maximum - minimum;
  const midpointMm = minimum + span / 2;

  if (span <= 0 || !Number.isFinite(span)) {
    return midpointMm;
  }

  const marginMm = MARGIN_FRACTION * span;
  const clamp = (coordinateMm: number) =>
    Math.min(maximum - marginMm, Math.max(minimum + marginMm, coordinateMm));

  for (const fraction of SEARCH_STEP_FRACTIONS) {
    const candidateMm = midpointMm + fraction * span;
    if (!hasHardConflict(source, axis, candidateMm)) {
      return clamp(candidateMm);
    }
  }

  return clamp(midpointMm);
}
