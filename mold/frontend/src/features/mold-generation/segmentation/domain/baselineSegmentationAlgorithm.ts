import type { Bounds3 } from "../../split-face/splitFace.contracts";
import {
  evaluatePrintableSize,
  type FitAxis,
  type Size3,
} from "../fitAnalysis";
import type {
  BoundaryIntent,
  SegmentDefinition,
  SegmentationAlgorithm,
  SegmentationContext,
  SegmentationIssue,
} from "./segmentation.contracts";
import { deterministicSegmentationId } from "./segmentationIdentity";

const AXES: readonly FitAxis[] = ["x", "y", "z"];

function axisCoordinates(
  bounds: Bounds3,
  axis: FitAxis,
  count: number,
): readonly number[] {
  const minimum = bounds.min[axis];
  const length = bounds.max[axis] - minimum;
  return Array.from(
    { length: count + 1 },
    (_, index) => minimum + (length * index) / count,
  );
}

function createBoundaryIntents(
  context: SegmentationContext,
): readonly BoundaryIntent[] {
  const boundaries = AXES.flatMap((axis) => {
    const executionTargeting = context.requiredAxes.indexOf(axis) > 0
      ? "all-straddling" as const
      : undefined;
    const coordinates = axisCoordinates(
      context.source.aggregateBounds,
      axis,
      context.perAxisSegmentCount[axis],
    );
    return coordinates.slice(1, -1).map((coordinateMm, index) => {
      const ordinal = index + 1;
      const identity = {
        requestId: context.request.requestId,
        source: context.request.source,
        axis,
        coordinateMm,
        ordinal,
        executionTargeting,
        algorithmId: baselineSegmentationAlgorithm.id,
        algorithmVersion: baselineSegmentationAlgorithm.version,
        policyId: context.request.policyId,
        policyVersion: context.request.policyVersion,
      };
      return {
        id: deterministicSegmentationId("boundary", identity),
        axis,
        coordinateMm,
        ordinal,
        ...(executionTargeting === undefined ? {} : { executionTargeting }),
      };
    });
  });
  // sequenceIndex is assigned after boundary identity hashing so existing
  // boundary ids are unaffected; it is a global (cross-axis) running position,
  // unlike ordinal which restarts per axis by design.
  return boundaries.map((boundary, index) => ({
    ...boundary,
    sequenceIndex: index + 1,
  }));
}

function createSegments(
  context: SegmentationContext,
  boundaries: readonly BoundaryIntent[],
): readonly SegmentDefinition[] {
  const coordinates = Object.fromEntries(
    AXES.map((axis) => [
      axis,
      axisCoordinates(
        context.source.aggregateBounds,
        axis,
        context.perAxisSegmentCount[axis],
      ),
    ]),
  ) as Readonly<Record<FitAxis, readonly number[]>>;
  const segments: SegmentDefinition[] = [];

  for (let x = 0; x < context.perAxisSegmentCount.x; x += 1) {
    for (let y = 0; y < context.perAxisSegmentCount.y; y += 1) {
      for (let z = 0; z < context.perAxisSegmentCount.z; z += 1) {
        const predictedBounds: Bounds3 = {
          min: {
            x: coordinates.x[x]!,
            y: coordinates.y[y]!,
            z: coordinates.z[z]!,
          },
          max: {
            x: coordinates.x[x + 1]!,
            y: coordinates.y[y + 1]!,
            z: coordinates.z[z + 1]!,
          },
        };
        const size: Size3 = {
          x: predictedBounds.max.x - predictedBounds.min.x,
          y: predictedBounds.max.y - predictedBounds.min.y,
          z: predictedBounds.max.z - predictedBounds.min.z,
        };
        const gridIndex = { x, y, z } as const;
        const ordinal = segments.length + 1;
        segments.push({
          id: deterministicSegmentationId("segment", {
            requestId: context.request.requestId,
            gridIndex,
            predictedBounds,
          }),
          ordinal,
          gridIndex,
          sourceBodyIds: context.source.bodies.map((body) => body.id).sort(),
          predictedBounds,
          predictedFit: evaluatePrintableSize(
            size,
            context.request.printerVolume,
          ),
          boundaryIntentIds: boundaries
            .filter((boundary) => {
              const coordinate = boundary.coordinateMm;
              return (
                coordinate === predictedBounds.min[boundary.axis] ||
                coordinate === predictedBounds.max[boundary.axis]
              );
            })
            .map((boundary) => boundary.id),
          requiredValidation: ["geometry-execution", "result-validation"],
        });
      }
    }
  }
  return segments;
}

/**
 * Whether a single axis coordinate falls inside a protected region's
 * clearance envelope on that axis. Exported so other planning-adjacent code
 * (e.g. user-extension initial-position suggestion) can reuse the exact same
 * conflict rule instead of re-deriving it.
 */
export function coordinateConflictsWithRegion(
  region: { readonly bounds: Bounds3; readonly clearanceMm: number },
  axis: FitAxis,
  coordinateMm: number,
): boolean {
  const minimum = region.bounds.min[axis] - region.clearanceMm;
  const maximum = region.bounds.max[axis] + region.clearanceMm;
  return coordinateMm > minimum && coordinateMm < maximum;
}

function protectedRegionIssues(
  context: SegmentationContext,
  boundaries: readonly BoundaryIntent[],
): readonly SegmentationIssue[] {
  return context.protectedRegions.flatMap((region) => {
    const conflicts = boundaries.filter((boundary) =>
      coordinateConflictsWithRegion(region, boundary.axis, boundary.coordinateMm),
    );
    if (conflicts.length === 0) return [];
    return [
      {
        severity: region.hardness === "hard" ? "blocker" : "warning",
        reasonCode: "protected_region_conflict",
        message: `Candidate boundaries intersect protected region ${region.id}.`,
        details: {
          protectedRegionId: region.id,
          conflictCount: conflicts.length,
        },
      } satisfies SegmentationIssue,
    ];
  });
}

export function minimumPrintableMargin(
  segments: readonly SegmentDefinition[],
  printerVolume: Size3,
): number {
  return Math.min(
    ...segments.flatMap((segment) =>
      AXES.map(
        (axis) =>
          printerVolume[axis] -
          (segment.predictedBounds.max[axis] -
            segment.predictedBounds.min[axis]),
      ),
    ),
  );
}

/**
 * Deterministic, bounds-only baseline. Its cells are theoretical planning
 * envelopes, not cut bodies, executable geometry, or manufacturing evidence.
 */
export const baselineSegmentationAlgorithm: SegmentationAlgorithm = {
  id: "deterministic-axis-grid-bounds-baseline",
  version: 1,
  planningBasis: "bounds-only",
  generateCandidates(context) {
    const boundaries = createBoundaryIntents(context);
    const segments = createSegments(context, boundaries);
    const issues = protectedRegionIssues(context, boundaries);
    const candidateSeed = {
      algorithmId: this.id,
      algorithmVersion: this.version,
      requestId: context.request.requestId,
      boundaries,
      segmentIds: segments.map((segment) => segment.id),
    };
    return [
      {
        id: deterministicSegmentationId("candidate", candidateSeed),
        algorithmId: this.id,
        algorithmVersion: this.version,
        planningBasis: this.planningBasis,
        requiredAxes: context.requiredAxes,
        boundaries,
        segments,
        protectedRegionConflicts: issues.map(
          (issue) =>
            String(issue.details?.protectedRegionId ?? "unknown-region"),
        ),
        issues,
        score: {
          hardFailureCount: issues.filter(
            (issue) => issue.severity === "blocker",
          ).length,
          segmentCount: segments.length,
          minimumPrintableMarginMm: minimumPrintableMargin(
            segments,
            context.request.printerVolume,
          ),
          declaredRisk: issues.length,
          // Planner-neutral default; planSegmentation's scoring pass
          // overwrites this from the fixed objective weights. The generic
          // algorithm never picks a policy-specific value here.
          weightedObjectiveScore: 0,
        },
      },
    ];
  },
  evaluateCandidate(candidate) {
    const unprintableSegments = candidate.segments.filter(
      (segment) => segment.predictedFit.status !== "FITS",
    );
    if (unprintableSegments.length === 0) return candidate;
    const issue: SegmentationIssue = {
      severity: "blocker",
      reasonCode: "no_printable_plan",
      message: "One or more predicted segments exceed the printer volume.",
      details: { unprintableSegmentCount: unprintableSegments.length },
    };
    return {
      ...candidate,
      issues: [...candidate.issues, issue],
      score: {
        ...candidate.score,
        hardFailureCount: candidate.score.hardFailureCount + 1,
      },
    };
  },
};
