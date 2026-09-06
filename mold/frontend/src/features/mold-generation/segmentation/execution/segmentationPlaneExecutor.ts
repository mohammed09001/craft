import {
  assertManifoldStatus,
  boundsFromManifold,
  getManifoldModule,
  manifoldFromPayload,
  payloadFromManifold,
  type ManifoldModuleInstance,
  type ManifoldSolid,
} from "../../geometry/manifold";
import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { SegmentationReasonCode } from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";
import { evaluatePrintableSize, sizeOfBounds } from "../fitAnalysis";
import type {
  SegmentationBodyExecutionValidation,
  SegmentationCutExecutionValidation,
  SegmentationExecutedBodyData,
  SegmentationExecutionAxis,
  SegmentationExecutionRequest,
  SegmentationExecutionResult,
  SegmentationSide,
  SupportedPlaneCutIntent,
} from "./segmentationExecution.contracts";

class ExecutionFailure extends Error {
  constructor(readonly reasonCode: SegmentationReasonCode, message: string) {
    super(message);
  }
}

export interface SegmentationExecutionControl {
  readonly isCancelled?: () => boolean;
  readonly yieldBetweenCuts?: () => Promise<void>;
}

interface WorkingBody {
  readonly body: (MoldBodyData & { readonly geometryVersion: string }) | SegmentationExecutedBodyData;
  readonly validation?: SegmentationBodyExecutionValidation;
}

interface CutOutput {
  readonly body: SegmentationExecutedBodyData;
  readonly validation: SegmentationBodyExecutionValidation;
}

interface CutResult {
  readonly negative: CutOutput;
  readonly positive: CutOutput;
  readonly validation: SegmentationCutExecutionValidation;
}

function fail(reasonCode: SegmentationReasonCode, message: string): never {
  throw new ExecutionFailure(reasonCode, message);
}

function finiteBounds(bounds: Bounds3): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Number.isFinite(bounds.min[axis]) &&
      Number.isFinite(bounds.max[axis]) &&
      bounds.max[axis] > bounds.min[axis],
  );
}

function boundsFromPayload(payload: MoldBodyData["mesh"]): Bounds3 {
  const { positions } = payload;
  if (positions.length < 3 || positions.length % 3 !== 0) {
    fail("invalid_output_geometry", "Serialized split output has invalid vertex positions.");
  }
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      fail("invalid_output_geometry", "Serialized split output has non-finite vertex positions.");
    }
    bounds.min.x = Math.min(bounds.min.x, x);
    bounds.min.y = Math.min(bounds.min.y, y);
    bounds.min.z = Math.min(bounds.min.z, z);
    bounds.max.x = Math.max(bounds.max.x, x);
    bounds.max.y = Math.max(bounds.max.y, y);
    bounds.max.z = Math.max(bounds.max.z, z);
  }
  if (!finiteBounds(bounds)) {
    fail("invalid_output_geometry", "Serialized split output has invalid mesh bounds.");
  }
  return bounds;
}

function boundsMatch(left: Bounds3, right: Bounds3, tolerance: number): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.abs(left.min[axis] - right.min[axis]) <= tolerance &&
      Math.abs(left.max[axis] - right.max[axis]) <= tolerance,
  );
}

/** One Float32 unit in the last place at the largest serialized coordinate. */
function payloadSerializationTolerance(bounds: Bounds3): number {
  const maximumMagnitude = Math.max(
    1,
    ...(["x", "y", "z"] as const).flatMap((axis) => [
      Math.abs(bounds.min[axis]),
      Math.abs(bounds.max[axis]),
    ]),
  );
  return maximumMagnitude * 2 ** -23;
}

function validSource(request: SegmentationExecutionRequest): boolean {
  const body = request.sourceBody.body;
  const vertexCount = body.mesh.positions.length / 3;
  return (
    body.watertight === true &&
    request.sourceBody.geometryVersion.trim() !== "" &&
    body.mesh.positions.length > 0 &&
    body.mesh.positions.length % 3 === 0 &&
    body.mesh.positions.every(Number.isFinite) &&
    body.mesh.indices.length > 0 &&
    body.mesh.indices.length % 3 === 0 &&
    body.mesh.indices.every(
      (index) =>
        Number.isSafeInteger(index) && index >= 0 && index < vertexCount,
    ) &&
    Number.isFinite(body.volumeMm3) &&
    body.volumeMm3 > 0 &&
    finiteBounds(body.bounds)
  );
}

function boundsInside(inner: Bounds3, outer: Bounds3, tolerance: number): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      inner.min[axis] >= outer.min[axis] - tolerance &&
      inner.max[axis] <= outer.max[axis] + tolerance,
  );
}

function boundsOverlap(left: Bounds3, right: Bounds3, tolerance: number): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      left.min[axis] < right.max[axis] - tolerance &&
      left.max[axis] > right.min[axis] + tolerance,
  );
}

function straddlesPlane(
  bounds: Bounds3,
  plane: SupportedPlaneCutIntent,
  tolerance: number,
): boolean {
  return (
    bounds.min[plane.axis] < plane.coordinateMm - tolerance &&
    bounds.max[plane.axis] > plane.coordinateMm + tolerance
  );
}

const CANONICAL_AXIS_ORDER: readonly SegmentationExecutionAxis[] = ["x", "y", "z"];

// Fixed X, then Y, then Z bounds comparison, then id. For a single-axis
// sequence the other two axes are constant across the working set, so this
// is provably identical to the prior single-axis-only comparator; it only
// starts doing work once a mixed-axis sequence makes more than one axis vary.
function sortBodies(left: WorkingBody, right: WorkingBody): number {
  for (const axis of CANONICAL_AXIS_ORDER) {
    const delta =
      left.body.bounds.min[axis] - right.body.bounds.min[axis] ||
      left.body.bounds.max[axis] - right.body.bounds.max[axis];
    if (delta !== 0) return delta;
  }
  return left.body.id.localeCompare(right.body.id);
}

function outputIdentity(
  request: SegmentationExecutionRequest,
  parent: WorkingBody["body"],
  plane: SupportedPlaneCutIntent,
  side: SegmentationSide,
  cutIndex: number,
): { readonly id: string; readonly geometryVersion: string } {
  const seed = {
    parentBodyId: parent.id,
    parentGeometryVersion: parent.geometryVersion,
    acceptedPlanId: request.acceptedPlanId,
    planeSequenceSignature: request.planeSequenceSignature,
    boundary: plane.boundary,
    side,
    cutIndex,
    policyId: request.policy.id,
    policyVersion: request.policy.version,
  };
  return {
    id: deterministicSegmentationId("segmentation-body", seed),
    geometryVersion: deterministicSegmentationId("segmentation-geometry", seed),
  };
}

function boundaryLineage(
  parent: WorkingBody["body"],
  boundaryId: string,
): readonly string[] {
  const prior =
    "provenance" in parent ? parent.provenance.boundaryLineage : [];
  return [...prior, boundaryId];
}

function hasFutureCut(
  bounds: Bounds3,
  remainingPlanes: readonly SupportedPlaneCutIntent[],
  tolerance: number,
): boolean {
  return remainingPlanes.some((plane) => straddlesPlane(bounds, plane, tolerance));
}

function createOutput(
  request: SegmentationExecutionRequest,
  parent: WorkingBody["body"],
  solid: ManifoldSolid,
  plane: SupportedPlaneCutIntent,
  side: SegmentationSide,
  cutIndex: number,
  remainingPlanes: readonly SupportedPlaneCutIntent[],
): CutOutput {
  if (solid.status() !== "NoError") {
    fail("non_manifold_output", `${side} split output is not a valid Manifold solid.`);
  }
  if (solid.isEmpty() || solid.numTri() <= 0) {
    fail("invalid_output_geometry", `${side} split output is empty.`);
  }
  const components = solid.decompose();
  try {
    if (components.length !== 1) {
      fail("detached_fragment_detected", `${side} split output contains ${components.length} connected components.`);
    }
  } finally {
    for (const component of components) component.delete();
  }

  const volumeMm3 = solid.volume();
  if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0) {
    fail("invalid_output_geometry", `${side} split output has invalid volume.`);
  }
  const manifoldBounds = boundsFromManifold(solid);
  const payload = payloadFromManifold(solid);
  const bounds = boundsFromPayload(payload);
  if (
    !finiteBounds(manifoldBounds) ||
    payload.positions.some((value) => !Number.isFinite(value)) ||
    payload.indices.some(
      (index) =>
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= payload.positions.length / 3,
    )
  ) {
    fail("invalid_output_geometry", `${side} split output has invalid indexed geometry.`);
  }

  const serializationTolerance = Math.max(
    request.policy.boundsToleranceMm,
    payloadSerializationTolerance(manifoldBounds),
  );
  if (!boundsMatch(bounds, manifoldBounds, serializationTolerance)) {
    fail("invalid_output_geometry", `${side} split output changed beyond Float32 serialization precision.`);
  }

  const onExpectedSide =
    side === "positive"
      ? bounds.min[plane.axis] >= plane.coordinateMm - request.policy.sideToleranceMm
      : bounds.max[plane.axis] <= plane.coordinateMm + request.policy.sideToleranceMm;
  if (
    !onExpectedSide ||
    !boundsInside(
      bounds,
      parent.bounds,
      request.policy.boundsToleranceMm + serializationTolerance,
    )
  ) {
    fail("invalid_output_geometry", `${side} split output is outside its immediate input bounds or plane side.`);
  }

  const size = sizeOfBounds(bounds);
  const fits =
    size !== null &&
    evaluatePrintableSize(size, request.printerVolume).status === "FITS";
  const futureCut = hasFutureCut(
    bounds,
    remainingPlanes,
    request.policy.sideToleranceMm,
  );
  if (!fits && !futureCut) {
    fail("printer_fit_failed", `${side} terminal split output does not fit the printer volume.`);
  }

  const identity = outputIdentity(request, parent, plane, side, cutIndex);
  const lineage = boundaryLineage(parent, plane.boundaryId);
  const provenance = {
    sourceBodyId: request.sourceBody.bodyId,
    sourceGeometryVersion: request.sourceBody.geometryVersion,
    segmentationRequestId: request.segmentationRequestId,
    acceptedPlanId: request.acceptedPlanId,
    axis: plane.axis,
    boundaryId: plane.boundaryId,
    side,
    parentBodyId: parent.id,
    parentGeometryVersion: parent.geometryVersion,
    cutIndex,
    boundaryLineage: lineage,
    executionRequestId: request.id,
    executionPolicyId: request.policy.id,
    executionPolicyVersion: request.policy.version,
  } as const;
  const body: SegmentationExecutedBodyData = {
    id: identity.id,
    name: `${request.sourceBody.body.name} (segment ${cutIndex + 1} ${side})`,
    visible: request.sourceBody.body.visible,
    bounds,
    centroid: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    },
    triangleCount: solid.numTri(),
    volumeMm3,
    watertight: true,
    mesh: payload,
    geometryVersion: identity.geometryVersion,
    provenance,
  };
  return {
    body,
    validation: {
      bodyId: body.id,
      side,
      volumeMm3,
      bounds,
      printableByBounds: fits ? true : "deferred",
      manifold: true,
      connectedComponentCount: 1,
    },
  };
}

function splitOneBody(
  module: ManifoldModuleInstance,
  request: SegmentationExecutionRequest,
  input: WorkingBody,
  plane: SupportedPlaneCutIntent,
  cutIndex: number,
  remainingPlanes: readonly SupportedPlaneCutIntent[],
): CutResult {
  let source: ManifoldSolid | null = null;
  let positive: ManifoldSolid | null = null;
  let negative: ManifoldSolid | null = null;
  let overlap: ManifoldSolid | null = null;
  try {
    source = manifoldFromPayload(
      module,
      input.body.mesh,
      request.policy.linearToleranceMm,
    );
    const inputComponents = source.decompose();
    try {
      if (inputComponents.length !== 1) {
        fail(
          "detached_fragment_detected",
          "Cut input contains detached connected components.",
        );
      }
    } finally {
      for (const component of inputComponents) component.delete();
    }
    const inputVolumeMm3 = source.volume();
    if (
      !Number.isFinite(inputVolumeMm3) ||
      inputVolumeMm3 <= 0 ||
      Math.abs(inputVolumeMm3 - input.body.volumeMm3) >
        request.policy.volumeToleranceMm3
    ) {
      fail(
        cutIndex === 0 ? "invalid_source_body" : "intermediate_cut_failed",
        "Cut input metadata does not match its Manifold geometry.",
      );
    }

    [positive, negative] = source.splitByPlane(
      plane.normal,
      plane.originOffset,
    );
    if (positive === undefined || negative === undefined) {
      fail("unexpected_output_count", "Plane split did not return two outputs.");
    }
    const positiveOutput = createOutput(
      request,
      input.body,
      positive,
      plane,
      "positive",
      cutIndex,
      remainingPlanes,
    );
    const negativeOutput = createOutput(
      request,
      input.body,
      negative,
      plane,
      "negative",
      cutIndex,
      remainingPlanes,
    );

    overlap = positive.intersect(negative);
    assertManifoldStatus(overlap, "Split overlap validation");
    const overlapVolumeMm3 = Math.abs(overlap.volume());
    if (overlapVolumeMm3 > request.policy.overlapToleranceMm3) {
      fail("invalid_output_geometry", "Split outputs overlap beyond tolerance.");
    }
    const outputVolumeMm3 =
      positiveOutput.body.volumeMm3 + negativeOutput.body.volumeMm3;
    const volumeDeltaMm3 = Math.abs(outputVolumeMm3 - inputVolumeMm3);
    if (volumeDeltaMm3 > request.policy.volumeToleranceMm3) {
      fail("volume_conservation_failed", "Split output volume does not conserve its immediate input volume.");
    }

    return {
      negative: negativeOutput,
      positive: positiveOutput,
      validation: {
        cutIndex,
        axis: plane.axis,
        boundaryId: plane.boundaryId,
        inputBodyId: input.body.id,
        inputVolumeMm3,
        outputBodyIds: [negativeOutput.body.id, positiveOutput.body.id],
        outputVolumeMm3,
        volumeDeltaMm3,
        overlapVolumeMm3,
        bodies: [negativeOutput.validation, positiveOutput.validation],
      },
    };
  } finally {
    overlap?.delete();
    positive?.delete();
    negative?.delete();
    source?.delete();
  }
}

function cancellationResult(
  request: SegmentationExecutionRequest,
  cutIndex: number,
): SegmentationExecutionResult {
  const reasonCode = "execution_cancelled" as const;
  return {
    status: "cancelled",
    stage: "geometry-execution",
    reasonCode,
    request: request.acceptedPlan.request,
    plan: request.acceptedPlan,
    executionRequest: request,
    issues: [{ severity: "blocker", reasonCode, message: "Segmentation execution was cancelled." }],
    diagnostics: [{
      stage: "split",
      reasonCode,
      message: "Execution stopped at a request-scoped cancellation checkpoint.",
      axis: request.executionAxis,
      cutIndex,
      cutCount: request.planes.length,
    }],
  };
}

async function aggregateOverlapVolume(
  module: ManifoldModuleInstance,
  request: SegmentationExecutionRequest,
  bodies: readonly SegmentationExecutedBodyData[],
): Promise<number> {
  let total = 0;
  for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bodies.length; rightIndex += 1) {
      const leftBody = bodies[leftIndex]!;
      const rightBody = bodies[rightIndex]!;
      if (!boundsOverlap(leftBody.bounds, rightBody.bounds, request.policy.boundsToleranceMm)) {
        continue;
      }
      let left: ManifoldSolid | null = null;
      let right: ManifoldSolid | null = null;
      let overlap: ManifoldSolid | null = null;
      try {
        left = manifoldFromPayload(module, leftBody.mesh, request.policy.linearToleranceMm);
        right = manifoldFromPayload(module, rightBody.mesh, request.policy.linearToleranceMm);
        overlap = left.intersect(right);
        assertManifoldStatus(overlap, "Aggregate overlap validation");
        total += Math.abs(overlap.volume());
      } finally {
        overlap?.delete();
        right?.delete();
        left?.delete();
      }
    }
  }
  return total;
}

export async function executePlaneSegmentation(
  request: SegmentationExecutionRequest,
  control: SegmentationExecutionControl = {},
): Promise<SegmentationExecutionResult> {
  const sourceBody = request.sourceBody.body;
  if (!validSource(request)) {
    const reasonCode = "invalid_source_body" as const;
    return {
      status: "failed",
      stage: "geometry-execution",
      reasonCode,
      request: request.acceptedPlan.request,
      plan: request.acceptedPlan,
      executionRequest: request,
      issues: [{ severity: "blocker", reasonCode, message: "The authoritative source body is invalid." }],
      diagnostics: [{ stage: "preflight", reasonCode, axis: request.executionAxis, message: "Source mesh validation failed.", bodyId: sourceBody.id }],
    };
  }

  const module = await getManifoldModule();
  const working: WorkingBody[] = [{ body: sourceBody }];
  const cuts: SegmentationCutExecutionValidation[] = [];
  let activePlane: SupportedPlaneCutIntent | undefined;
  let activeCutIndex = 0;
  // Each target split contributes net +1 body (1 in, 2 out). An ordinary
  // boundary always has exactly one target; Cartesian targeting and the
  // legacy extension broadcast may split several targets, so accumulate the
  // expected count rather than assuming planes.length + 1.
  let expectedFinalBodyCount = 1;
  const isCancelled = control.isCancelled ?? (() => false);
  const yieldBetweenCuts =
    control.yieldBetweenCuts ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  try {
    for (let cutIndex = 0; cutIndex < request.planes.length; cutIndex += 1) {
      activeCutIndex = cutIndex;
      activePlane = request.planes[cutIndex]!;
      if (isCancelled()) return cancellationResult(request, cutIndex);

      const targets = working.filter((candidate) =>
        straddlesPlane(
          candidate.body.bounds,
          activePlane!,
          request.policy.sideToleranceMm,
        ),
      );
      const isExtensionBroadcast = activePlane.boundary.broadcastToAllStraddlingBodies === true;
      const isGridTargeting = activePlane.boundary.executionTargeting === "all-straddling";
      const allowsMultipleTargets = isExtensionBroadcast || isGridTargeting;
      if (targets.length === 0) {
        fail("missing_cut_target", `No current body straddles the accepted ${activePlane.axis.toUpperCase()} plane.`);
      }
      if (!allowsMultipleTargets && targets.length > 1) {
        fail("ambiguous_cut_target", `Multiple current bodies straddle the accepted ${activePlane.axis.toUpperCase()} plane.`);
      }
      // A broadcast boundary (only ever set on a user-added extension axis --
      // see extensionBoundaryMerge.ts) is only valid the moment every current
      // body is genuinely uncut on that axis; if some straddle and some don't,
      // the plan/geometry no longer matches what broadcast execution assumes.
      if (isExtensionBroadcast && targets.length !== working.length) {
        fail("missing_cut_target", `A broadcast ${activePlane.axis.toUpperCase()} plane must straddle every currently active body, but only ${targets.length} of ${working.length} do.`);
      }
      expectedFinalBodyCount += targets.length;

      if (targets.length === 1) {
        // Exact prior behavior, unchanged: single-target replace-in-place.
        const target = targets[0]!;
        const result = splitOneBody(
          module,
          request,
          target,
          activePlane,
          cutIndex,
          request.planes.slice(cutIndex + 1),
        );
        const targetIndex = working.indexOf(target);
        working.splice(
          targetIndex,
          1,
          { body: result.negative.body, validation: result.negative.validation },
          { body: result.positive.body, validation: result.positive.validation },
        );
        cuts.push(result.validation);
      } else {
        // Multi-target boundary: split every current straddling target.
        const produced: WorkingBody[] = [];
        for (const target of targets) {
          const result = splitOneBody(
            module,
            request,
            target,
            activePlane,
            cutIndex,
            request.planes.slice(cutIndex + 1),
          );
          produced.push({ body: result.negative.body, validation: result.negative.validation });
          produced.push({ body: result.positive.body, validation: result.positive.validation });
          cuts.push(result.validation);
        }
        const untouched = working.filter((candidate) => !targets.includes(candidate));
        working.length = 0;
        working.push(...untouched, ...produced);
      }
      working.sort(sortBodies);

      if (cutIndex < request.planes.length - 1) {
        await yieldBetweenCuts();
        if (isCancelled()) return cancellationResult(request, cutIndex + 1);
      }
    }

    if (working.length !== expectedFinalBodyCount) {
      fail("unexpected_output_count", "The final body count does not match the accepted plane sequence.");
    }
    if (
      request.planes.some((plane) => plane.boundary.executionTargeting === "all-straddling") &&
      working.length !== request.acceptedPlan.segments.length
    ) {
      fail("unexpected_output_count", "The final body count does not match the accepted Cartesian segmentation plan.");
    }
    const bodies = working.map((entry) => {
      if (!("provenance" in entry.body)) {
        fail("invalid_output_geometry", "The final working set contains an unexecuted source body.");
      }
      return entry.body;
    });
    const validations = working.map((entry) => {
      if (entry.validation?.printableByBounds !== true) {
        fail("printer_fit_failed", "Every final segmented body must fit the captured printer volume.");
      }
      return entry.validation;
    });
    if (
      new Set(bodies.map((body) => body.id)).size !== bodies.length ||
      new Set(bodies.map((body) => body.geometryVersion)).size !== bodies.length
    ) {
      fail("invalid_output_geometry", "Final body identities are not unique.");
    }

    const overlapVolumeMm3 = await aggregateOverlapVolume(module, request, bodies);
    if (overlapVolumeMm3 > request.policy.overlapToleranceMm3) {
      fail("invalid_output_geometry", "Final bodies overlap beyond execution tolerance.");
    }
    const sourceVolumeMm3 = sourceBody.volumeMm3;
    const outputVolumeMm3 = bodies.reduce(
      (total, body) => total + body.volumeMm3,
      0,
    );
    const volumeDeltaMm3 = Math.abs(outputVolumeMm3 - sourceVolumeMm3);
    // Scaled by the actual number of individual splits performed (cuts.length),
    // not request.planes.length -- a single broadcast boundary can perform
    // more than one real split, each contributing its own rounding error.
    const aggregateVolumeToleranceMm3 =
      request.policy.volumeToleranceMm3 * cuts.length;
    if (volumeDeltaMm3 > aggregateVolumeToleranceMm3) {
      fail("volume_conservation_failed", "Final body volume does not conserve root source volume.");
    }
    if (
      bodies.some((body) =>
        !boundsInside(
          body.bounds,
          sourceBody.bounds,
          request.policy.boundsToleranceMm,
        ),
      )
    ) {
      fail("invalid_output_geometry", "A final body lies outside the authoritative source bounds.");
    }

    return {
      status: "executed",
      request: request.acceptedPlan.request,
      plan: request.acceptedPlan,
      executionRequest: request,
      bodies,
      validation: {
        boundsPrintable: "verified",
        geometryExecuted: "verified",
        geometryValid: "verified",
        manufacturingSafety: "not-established",
        bodies: validations,
        cuts,
        sourceVolumeMm3,
        outputVolumeMm3,
        volumeDeltaMm3,
        overlapVolumeMm3,
        policy: request.policy,
      },
      issues: [],
      diagnostics: [{
        stage: "aggregate-validation",
        axis: request.executionAxis,
        message: `${request.planes.length} ordered plane cut(s) produced ${bodies.length} valid bodies; manufacturing safety is not established.`,
        cutCount: request.planes.length,
        measurements: {
          sourceVolumeMm3,
          outputVolumeMm3,
          volumeDeltaMm3,
          aggregateVolumeToleranceMm3,
          overlapVolumeMm3,
        },
      }],
    };
  } catch (error) {
    const reasonCode =
      error instanceof ExecutionFailure ? error.reasonCode : "split_operation_failed";
    if (reasonCode === "execution_cancelled") {
      return cancellationResult(request, activeCutIndex);
    }
    const message = error instanceof Error ? error.message : "Plane sequence execution failed.";
    return {
      status: "failed",
      stage: reasonCode === "split_operation_failed" ? "geometry-execution" : "result-validation",
      reasonCode,
      request: request.acceptedPlan.request,
      plan: request.acceptedPlan,
      executionRequest: request,
      issues: [{ severity: "blocker", reasonCode, message }],
      diagnostics: [{
        stage: "split",
        reasonCode,
        message,
        axis: activePlane?.axis ?? request.executionAxis,
        ...(activePlane === undefined
          ? {}
          : { boundaryId: activePlane.boundaryId }),
        cutIndex: activeCutIndex,
        cutCount: request.planes.length,
      }],
    };
  }
}
