/**
 * Merges a user-added extension axis (see spec: Split by Face as a
 * controlled extension) into an existing algorithm SegmentationPlan,
 * producing a NEW plan -- the original algorithm plan object is never
 * mutated (callers keep the base plan separately and always re-derive the
 * merged plan from it, so removing/adjusting the extension never needs an
 * "undo the merge" step).
 *
 * The new boundary is always appended LAST in sequence order and is the
 * only boundary ever marked `broadcastToAllStraddlingBodies`. This is
 * deliberate, not arbitrary: every existing boundary keeps executing
 * against exactly one body as before (zero behavior change), and by the
 * time the new axis's boundary runs, every currently-live body is
 * necessarily uncut on that axis (it is a genuinely new axis), so all of
 * them legitimately need the same cut -- the one case broadcast execution
 * exists for.
 */
import type {
  BoundaryIntent,
  ProtectedRegion,
  SegmentDefinition,
  SegmentationIssue,
  SegmentationPlan,
  SegmentationValidation,
} from "./segmentation.contracts";
import { evaluatePrintableSize, type FitAxis } from "../fitAnalysis";
import { deterministicSegmentationId } from "./segmentationIdentity";
import { coordinateConflictsWithRegion, minimumPrintableMargin } from "./baselineSegmentationAlgorithm";

/** A segment degenerates (zero or negative extent) when the boundary
 * coordinate is not strictly interior to that segment's own bounds on the
 * merge axis -- this can happen for a manually-dragged coordinate that
 * lands at or beyond a segment's edge. */
function isDegenerateSplit(
  segment: SegmentDefinition,
  axis: FitAxis,
  coordinateMm: number,
): boolean {
  return (
    coordinateMm <= segment.predictedBounds.min[axis] ||
    coordinateMm >= segment.predictedBounds.max[axis]
  );
}

function splitSegment(
  segment: SegmentDefinition,
  axis: FitAxis,
  coordinateMm: number,
  boundaryId: string,
  printerVolume: SegmentationPlan["request"]["printerVolume"],
): readonly SegmentDefinition[] {
  const sides = [
    { key: 0, bounds: { ...segment.predictedBounds, max: { ...segment.predictedBounds.max, [axis]: coordinateMm } } },
    { key: 1, bounds: { ...segment.predictedBounds, min: { ...segment.predictedBounds.min, [axis]: coordinateMm } } },
  ] as const;
  return sides.map(({ key, bounds }): SegmentDefinition => {
    const size = {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
    };
    return {
      id: deterministicSegmentationId("extension-segment", {
        parentSegmentId: segment.id,
        axis,
        coordinateMm,
        side: key,
        boundaryId,
      }),
      ordinal: 0, // reassigned by the caller once the full list is known
      gridIndex: { ...segment.gridIndex, [axis]: key },
      sourceBodyIds: segment.sourceBodyIds,
      predictedBounds: bounds,
      predictedFit: evaluatePrintableSize(size, printerVolume),
      boundaryIntentIds: [...segment.boundaryIntentIds, boundaryId],
      requiredValidation: segment.requiredValidation,
    };
  });
}

function mergeValidation(
  base: SegmentationValidation,
  newIssues: readonly SegmentationIssue[],
): SegmentationValidation {
  const warnings = [...base.warnings, ...newIssues.filter((issue) => issue.severity === "warning")];
  const blockers = [...base.blockers, ...newIssues.filter((issue) => issue.severity === "blocker")];
  return {
    ...base,
    status: blockers.length === 0 ? "planning-valid" : "invalid",
    warnings,
    blockers,
  };
}

/**
 * Returns a new plan with `axis` merged in at `coordinateMm`. Defensive
 * no-op (returns `plan` unchanged) if `axis` is already required -- the
 * real axis-ownership rejection happens earlier, at the orchestrator layer,
 * before this is ever called; this guard only prevents silent corruption if
 * that contract is ever violated by a future caller.
 *
 * `protectedRegions` and the degenerate-bounds check govern BOTH the
 * initial algorithm-suggested position and any later manually-adjusted one
 * -- the same authoritative validation applies regardless of how the
 * coordinate was chosen, per spec: "the same authoritative domain
 * validation must govern both preview validity and commit eligibility."
 * A hard-region conflict or a degenerate split is recorded as a blocker
 * (never silently dropped or auto-corrected) so the caller can surface it
 * and block Done/commit while leaving the user's chosen coordinate in place.
 */
export function mergeExtensionBoundary(
  plan: SegmentationPlan,
  axis: FitAxis,
  coordinateMm: number,
  protectedRegions: readonly ProtectedRegion[] = [],
): SegmentationPlan {
  if (plan.requiredAxes.includes(axis)) {
    return plan;
  }

  const sequenceIndex =
    Math.max(0, ...plan.boundaries.map((boundary) => boundary.sequenceIndex)) + 1;
  const newBoundary: BoundaryIntent = {
    id: deterministicSegmentationId("extension-boundary", {
      basePlanId: plan.id,
      axis,
      coordinateMm,
      sequenceIndex,
    }),
    axis,
    coordinateMm,
    ordinal: 1,
    sequenceIndex,
    broadcastToAllStraddlingBodies: true,
  };

  const splitSegments = plan.segments.flatMap((segment) =>
    splitSegment(segment, axis, coordinateMm, newBoundary.id, plan.request.printerVolume),
  );
  const segments = splitSegments.map((segment, index) => ({
    ...segment,
    ordinal: index + 1,
  }));

  const unfitSegments = segments.filter((segment) => segment.predictedFit.status !== "FITS");
  const printerFitIssues: readonly SegmentationIssue[] =
    unfitSegments.length > 0
      ? [
          {
            severity: "blocker",
            reasonCode: "no_printable_plan",
            message:
              "One or more predicted segments exceed the printer volume after the extension axis was added.",
            details: { unprintableSegmentCount: unfitSegments.length },
          },
        ]
      : [];

  const degenerateSegments = plan.segments.filter((segment) =>
    isDegenerateSplit(segment, axis, coordinateMm),
  );
  const degenerateIssues: readonly SegmentationIssue[] =
    degenerateSegments.length > 0
      ? [
          {
            severity: "blocker",
            reasonCode: "invalid_authoritative_geometry",
            message:
              "The extension plane's coordinate is not strictly interior to the body -- it would produce a degenerate or empty piece.",
            details: { degenerateSegmentCount: degenerateSegments.length },
          },
        ]
      : [];

  const conflictingRegions = protectedRegions.filter(
    (region) => region.hardness === "hard" && coordinateConflictsWithRegion(region, axis, coordinateMm),
  );
  const protectedRegionIssues: readonly SegmentationIssue[] =
    conflictingRegions.length > 0
      ? [
          {
            severity: "blocker",
            reasonCode: "protected_region_conflict",
            message: `The extension plane intersects protected region ${conflictingRegions[0]!.id}.`,
            details: {
              protectedRegionId: conflictingRegions[0]!.id,
              conflictCount: conflictingRegions.length,
            },
          },
        ]
      : [];

  const newIssues: readonly SegmentationIssue[] = [
    ...printerFitIssues,
    ...degenerateIssues,
    ...protectedRegionIssues,
  ];

  const boundaries = [...plan.boundaries, newBoundary];
  const requiredAxes = [...plan.requiredAxes, axis];
  const perAxisSegmentCount = {
    ...plan.perAxisSegmentCount,
    [axis]: plan.perAxisSegmentCount[axis] * 2,
  };
  const estimatedMinimumSegmentCount = plan.estimatedMinimumSegmentCount * 2;
  const blockerCount = newIssues.filter((issue) => issue.severity === "blocker").length;
  const score = {
    hardFailureCount: plan.score.hardFailureCount + blockerCount,
    segmentCount: segments.length,
    minimumPrintableMarginMm: minimumPrintableMargin(segments, plan.request.printerVolume),
    declaredRisk: plan.score.declaredRisk + blockerCount,
    weightedObjectiveScore: plan.score.weightedObjectiveScore,
  };
  const validation = mergeValidation(plan.validation, newIssues);
  const id = deterministicSegmentationId("segmentation-plan-extended", {
    basePlanId: plan.id,
    axis,
    coordinateMm,
    boundaryIds: boundaries.map((boundary) => boundary.id),
    segmentIds: segments.map((segment) => segment.id),
  });

  return {
    ...plan,
    id,
    requiredAxes,
    perAxisSegmentCount,
    estimatedMinimumSegmentCount,
    boundaries,
    segments,
    score,
    validation,
  };
}
