import type { BoundaryIntent, SegmentationPlan, SegmentationSourceSnapshot } from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";
import type { Size3 } from "../fitAnalysis";
import type {
  SegmentationExecutionAxis,
  SegmentationExecutionRequest,
  SegmentationExecutionResult,
  SupportedPlaneCutIntent,
} from "./segmentationExecution.contracts";
import { createSegmentationExecutionPolicy } from "./segmentationExecution.policy";

const AXIS_NORMALS: Readonly<
  Record<SegmentationExecutionAxis, readonly [number, number, number]>
> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

function isSupportedExecutionAxis(
  axis: string | undefined,
): axis is SegmentationExecutionAxis {
  return axis === "x" || axis === "y" || axis === "z";
}

function unsupported(
  plan: SegmentationPlan,
  reasonCode: "unsupported_execution_shape" | "unsupported_boundary_intent",
  message: string,
): SegmentationExecutionResult {
  return {
    status: "unsupported",
    stage: "geometry-execution",
    reasonCode,
    request: plan.request,
    plan,
    issues: [{ severity: "blocker", reasonCode, message }],
    diagnostics: [{ stage: "preflight", reasonCode, message }],
  };
}

/**
 * Simulates the executor's own body-count growth for an ordered boundary
 * sequence. A plain boundary contributes net +1. A legacy extension
 * broadcast doubles the current total because every current body must
 * straddle its new axis. A Cartesian-grid boundary cuts every body in the
 * current interval for its axis, preserving the planner's product topology.
 */
function expectedSegmentCount(orderedBoundaries: readonly BoundaryIntent[]): number | undefined {
  let count = 1;
  const intervalsByAxis = { x: 1, y: 1, z: 1 };
  for (const boundary of orderedBoundaries) {
    if (
      boundary.broadcastToAllStraddlingBodies === true &&
      boundary.executionTargeting === "all-straddling"
    ) {
      return undefined;
    }
    if (boundary.broadcastToAllStraddlingBodies === true) {
      count *= 2;
      intervalsByAxis[boundary.axis] *= 2;
      continue;
    }
    if (boundary.executionTargeting === "all-straddling") {
      const targets = count / intervalsByAxis[boundary.axis];
      if (!Number.isInteger(targets) || targets < 1) return undefined;
      count += targets;
      intervalsByAxis[boundary.axis] += 1;
      continue;
    }
    count += 1;
    intervalsByAxis[boundary.axis] += 1;
  }
  return count;
}

export type SegmentationExecutionPreflight =
  | { readonly ok: true; readonly request: SegmentationExecutionRequest }
  | { readonly ok: false; readonly result: SegmentationExecutionResult };

export function createSegmentationExecutionRequest(input: {
  readonly plan: SegmentationPlan;
  readonly source: SegmentationSourceSnapshot;
  readonly printerVolume: Size3;
}): SegmentationExecutionPreflight {
  const { plan, source, printerVolume } = input;
  const executionAxis = plan.requiredAxes[0];
  const mixedAxis = plan.requiredAxes.length > 1;
  if (
    source.bodies.length !== 1 ||
    plan.requiredAxes.length < 1 ||
    !plan.requiredAxes.every(isSupportedExecutionAxis) ||
    !isSupportedExecutionAxis(executionAxis) ||
    plan.boundaries.length < 1 ||
    !plan.boundaries.every((boundary) => isSupportedExecutionAxis(boundary.axis))
  ) {
    return {
      ok: false,
      result: unsupported(plan, "unsupported_execution_shape", "Execution supports one source body and one or more boundaries on one or more of the X, Y, or Z axes."),
    };
  }
  const body = source.bodies[0]!;
  if (
    plan.segments.some(
      (segment) =>
        segment.sourceBodyIds.length !== 1 ||
        segment.sourceBodyIds[0] !== body.id,
    )
  ) {
    return {
      ok: false,
      result: unsupported(plan, "unsupported_execution_shape", "Every segment must reference the sole authoritative source body."),
    };
  }
  const geometryVersion =
    "geometryVersion" in body && typeof body.geometryVersion === "string"
      ? body.geometryVersion
      : "";
  if (geometryVersion.trim() === "") {
    const reasonCode = "invalid_source_body" as const;
    return {
      ok: false,
      result: {
        status: "failed",
        stage: "geometry-execution",
        reasonCode,
        request: plan.request,
        plan,
        issues: [{ severity: "blocker", reasonCode, message: "The committed source body has no authoritative geometry version." }],
        diagnostics: [{ stage: "preflight", reasonCode, message: "Missing source geometry version.", bodyId: body.id }],
      },
    };
  }
  const policy = createSegmentationExecutionPolicy(body.bounds, body.volumeMm3);
  // Single-axis plans keep the exact ordering established for Multi-Plane
  // X/Y/Z: coordinateMm ascending, with ordinal/id as tie-break only.
  // coordinateMm is not comparable across axes, so a mixed-axis plan is
  // instead ordered by its explicit, author-assigned sequenceIndex.
  const boundaries = mixedAxis
    ? [...plan.boundaries].sort(
        (left, right) =>
          left.sequenceIndex - right.sequenceIndex || left.id.localeCompare(right.id),
      )
    : [...plan.boundaries].sort(
        (left, right) =>
          left.coordinateMm - right.coordinateMm ||
          left.ordinal - right.ordinal ||
          left.id.localeCompare(right.id),
      );
  if (boundaries.some(
    (boundary) =>
      (boundary.executionTargeting !== undefined &&
        boundary.executionTargeting !== "all-straddling") ||
      (boundary.executionTargeting === "all-straddling" &&
        boundary.broadcastToAllStraddlingBodies === true),
  )) {
    return {
      ok: false,
      result: unsupported(plan, "unsupported_boundary_intent", "An accepted boundary cannot combine Cartesian all-straddling targeting with legacy extension broadcast targeting."),
    };
  }
  const expectedCount = expectedSegmentCount(boundaries);
  if (expectedCount === undefined || plan.segments.length !== expectedCount) {
    return {
      ok: false,
      result: unsupported(plan, "unsupported_execution_shape", "The plan's segment count does not match the body count its ordered boundary sequence and targeting semantics would produce."),
    };
  }
  if (
    new Set(boundaries.map((boundary) => boundary.id)).size !== boundaries.length ||
    (mixedAxis &&
      new Set(boundaries.map((boundary) => boundary.sequenceIndex)).size !== boundaries.length)
  ) {
    const reasonCode = "duplicate_cut_plane" as const;
    return {
      ok: false,
      result: {
        status: "failed",
        stage: "result-validation",
        reasonCode,
        request: plan.request,
        plan,
        issues: [{ severity: "blocker", reasonCode, message: "Accepted boundaries must have unique identities and, for mixed-axis plans, unique sequence positions." }],
        diagnostics: [{ stage: "preflight", reasonCode, axis: executionAxis, message: "Duplicate boundary identities or sequence positions cannot produce stable execution provenance." }],
      },
    };
  }
  if (boundaries.some(
    (boundary) =>
      !plan.requiredAxes.includes(boundary.axis) ||
      !Number.isFinite(boundary.coordinateMm) ||
      boundary.coordinateMm <= body.bounds.min[boundary.axis] + policy.sideToleranceMm ||
      boundary.coordinateMm >= body.bounds.max[boundary.axis] - policy.sideToleranceMm,
  )) {
    return {
      ok: false,
      result: unsupported(plan, "unsupported_boundary_intent", "Every accepted boundary must convert into an interior plane on one of the plan's required axes."),
    };
  }
  // Coincidence is a spatial check within one axis, independent of where in
  // a mixed-axis sequence each occurrence falls (e.g. a repeated-axis
  // sequence may legitimately revisit an axis far from its prior cut).
  for (const axis of new Set(boundaries.map((boundary) => boundary.axis))) {
    const sameAxis = boundaries
      .filter((boundary) => boundary.axis === axis)
      .slice()
      .sort((left, right) => left.coordinateMm - right.coordinateMm);
    for (let index = 1; index < sameAxis.length; index += 1) {
      if (
        sameAxis[index]!.coordinateMm - sameAxis[index - 1]!.coordinateMm <=
        policy.sideToleranceMm
      ) {
        const reasonCode = "duplicate_cut_plane" as const;
        return {
          ok: false,
          result: {
            status: "failed",
            stage: "result-validation",
            reasonCode,
            request: plan.request,
            plan,
            issues: [{ severity: "blocker", reasonCode, message: `Accepted ${axis.toUpperCase()} boundaries are coincident within execution tolerance.` }],
            diagnostics: [{ stage: "preflight", reasonCode, axis, message: `Coincident ${axis.toUpperCase()}-axis boundaries cannot be executed deterministically.` }],
          },
        };
      }
    }
  }
  const planes: readonly SupportedPlaneCutIntent[] = boundaries.map(
    (boundary) => ({
      boundary,
      boundaryId: boundary.id,
      axis: boundary.axis,
      coordinateMm: boundary.coordinateMm,
      normal: AXIS_NORMALS[boundary.axis],
      originOffset: boundary.coordinateMm,
      coordinateSpace: "mold-local",
      units: "millimeters",
      upAxis: "Z",
      sides: ["positive", "negative"],
    }),
  );
  const planeSequenceSignature = deterministicSegmentationId(
    "segmentation-plane-sequence",
    planes,
  );
  const identity = {
    segmentationRequestId: plan.request.requestId,
    acceptedPlanId: plan.id,
    source: plan.request.source,
    bodyId: body.id,
    geometryVersion,
    printerVolumeSignature: plan.request.printerVolumeSignature,
    planeSequenceSignature,
    policyId: policy.id,
    policyVersion: policy.version,
  };
  return {
    ok: true,
    request: {
      id: deterministicSegmentationId("segmentation-execution", identity),
      segmentationRequestId: plan.request.requestId,
      acceptedPlanId: plan.id,
      acceptedPlan: plan,
      documentRevision: plan.request.source.documentRevision,
      documentFingerprint: plan.request.source.documentFingerprint,
      committedResultRequestId: plan.request.source.resultRequestId,
      sourceBody: {
        bodyId: body.id,
        geometryVersion,
        bodySignature: plan.request.source.bodySignature,
        committedResultRequestId: plan.request.source.resultRequestId,
        body: body as typeof body & { readonly geometryVersion: string },
      },
      printerVolume,
      printerVolumeSignature: plan.request.printerVolumeSignature,
      executionAxis,
      planes,
      planeSequenceSignature,
      policy,
    },
  };
}
