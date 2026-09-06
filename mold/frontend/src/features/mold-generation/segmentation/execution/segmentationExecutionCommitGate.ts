import type { SegmentationLifecyclePhase, SegmentationPlan, SegmentationRequest, SegmentationSourceSnapshot } from "../domain/segmentation.contracts";
import type { Size3 } from "../fitAnalysis";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";
import type { SegmentationExecutionRequest } from "./segmentationExecution.contracts";
import { createSegmentationExecutionPolicy } from "./segmentationExecution.policy";
import { createSegmentationExecutionRequest } from "./segmentationExecutionPreflight";

export function canCommitSegmentationExecution(input: {
  readonly phase: SegmentationLifecyclePhase;
  readonly activeRequest: SegmentationRequest | null;
  readonly acceptedPlan: SegmentationPlan | null;
  readonly executionRequest: SegmentationExecutionRequest;
  readonly currentSource: SegmentationSourceSnapshot;
  readonly currentPrinterVolume: Size3;
}): boolean {
  const body = input.currentSource.bodies[0];
  const geometryVersion =
    body !== undefined &&
    "geometryVersion" in body &&
    typeof body.geometryVersion === "string"
      ? body.geometryVersion
      : null;
  const currentPolicy =
    body === undefined
      ? null
      : createSegmentationExecutionPolicy(body.bounds, body.volumeMm3);
  const recreated =
    input.acceptedPlan === null
      ? null
      : createSegmentationExecutionRequest({
          plan: input.acceptedPlan,
          source: input.currentSource,
          printerVolume: input.currentPrinterVolume,
        });
  return (
    input.phase === "executing" &&
    input.activeRequest?.requestId === input.executionRequest.segmentationRequestId &&
    input.acceptedPlan?.id === input.executionRequest.acceptedPlanId &&
    input.currentSource.identity.documentRevision === input.executionRequest.documentRevision &&
    input.currentSource.identity.documentFingerprint === input.executionRequest.documentFingerprint &&
    input.currentSource.identity.resultRequestId === input.executionRequest.committedResultRequestId &&
    input.currentSource.identity.bodySignature === input.executionRequest.sourceBody.bodySignature &&
    input.currentSource.bodies.length === 1 &&
    body?.id === input.executionRequest.sourceBody.bodyId &&
    geometryVersion === input.executionRequest.sourceBody.geometryVersion &&
    currentPolicy?.id === input.executionRequest.policy.id &&
    currentPolicy.version === input.executionRequest.policy.version &&
    currentPolicy.toleranceVersion === input.executionRequest.policy.toleranceVersion &&
    recreated?.ok === true &&
    recreated.request.id === input.executionRequest.id &&
    recreated.request.executionAxis === input.executionRequest.executionAxis &&
    recreated.request.planeSequenceSignature ===
      input.executionRequest.planeSequenceSignature &&
    deterministicSegmentationId("printer-volume", input.currentPrinterVolume) ===
      input.executionRequest.printerVolumeSignature
  );
}
