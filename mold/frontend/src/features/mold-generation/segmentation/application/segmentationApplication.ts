import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";

import { baselineSegmentationAlgorithm } from "../domain/baselineSegmentationAlgorithm";
import type {
  SegmentationAlgorithm,
  SegmentationPlan,
  SegmentationRequest,
  SegmentationResult,
  SegmentationSourceSnapshot,
} from "../domain/segmentation.contracts";
import {
  SEGMENTATION_POLICY_ID,
  SEGMENTATION_POLICY_VERSION,
} from "../domain/segmentation.contracts";
import { deterministicSegmentationId } from "../domain/segmentationIdentity";
import { planSegmentation } from "../domain/planSegmentation";
import {
  captureSegmentationSourceSnapshot,
  readCurrentSegmentationSourceSnapshot,
  type SegmentationSourceSnapshotResult,
} from "./segmentationSourceSnapshot";
import {
  createSegmentationExecutionRequest,
} from "../execution/segmentationExecutionPreflight";
import {
  runSegmentationExecutionInWorker,
  SegmentationExecutionWorkerError,
} from "../execution/segmentationExecution.workerClient";
import type {
  SegmentationExecutionRequest,
  SegmentationExecutionResult,
} from "../execution/segmentationExecution.contracts";

export interface SegmentationApplicationDependencies {
  readonly readSource: () => SegmentationSourceSnapshotResult;
  readonly readPrinterVolume: () => {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null;
  readonly algorithm: SegmentationAlgorithm;
}

const defaultDependencies: SegmentationApplicationDependencies = {
  readSource: readCurrentSegmentationSourceSnapshot,
  readPrinterVolume: () =>
    usePrinterBuildVolumeStore.getState().dimensions,
  algorithm: baselineSegmentationAlgorithm,
};

function validPrinterVolume(
  printerVolume: ReturnType<
    SegmentationApplicationDependencies["readPrinterVolume"]
  >,
): printerVolume is { readonly x: number; readonly y: number; readonly z: number } {
  return (
    printerVolume !== null &&
    [printerVolume.x, printerVolume.y, printerVolume.z].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  );
}

export function createSegmentationRequest(input: {
  readonly source: SegmentationSourceSnapshot;
  readonly printerVolume: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}): SegmentationRequest {
  const printerVolumeSignature = deterministicSegmentationId(
    "printer-volume",
    input.printerVolume,
  );
  const settingsSignature = deterministicSegmentationId(
    "segmentation-settings",
    {
      policyId: SEGMENTATION_POLICY_ID,
      policyVersion: SEGMENTATION_POLICY_VERSION,
    },
  );
  const semanticIdentity = {
    source: input.source.identity,
    printerVolumeSignature,
    settingsSignature,
    policyId: SEGMENTATION_POLICY_ID,
    policyVersion: SEGMENTATION_POLICY_VERSION,
  };
  return {
    schemaVersion: 1,
    requestId: deterministicSegmentationId(
      "segmentation-request",
      semanticIdentity,
    ),
    operation: "plan",
    source: input.source.identity,
    printerVolume: input.printerVolume,
    printerVolumeSignature,
    settingsSignature,
    policyId: SEGMENTATION_POLICY_ID,
    policyVersion: SEGMENTATION_POLICY_VERSION,
  };
}

export function requestSegmentationPlan(
  dependencies: SegmentationApplicationDependencies = defaultDependencies,
): SegmentationResult {
  const source = dependencies.readSource();
  if (source.status === "stale") {
    return {
      status: "stale",
      stage: "source-snapshot",
      reasonCode: source.reasonCode,
      issues: source.issues,
    };
  }
  if (source.status === "failed") {
    return {
      status: "failed",
      stage: "source-snapshot",
      reasonCode: source.reasonCode,
      issues: source.issues,
    };
  }
  const printerVolume = dependencies.readPrinterVolume();
  if (!validPrinterVolume(printerVolume)) {
    return {
      status: "failed",
      stage: "request-creation",
      reasonCode: "invalid_printer_volume",
      issues: [
        {
          severity: "blocker",
          reasonCode: "invalid_printer_volume",
          message: "A finite positive printer volume is required.",
        },
      ],
    };
  }
  const request = createSegmentationRequest({
    source: source.snapshot,
    printerVolume,
  });
  const result = planSegmentation({
    request,
    source: source.snapshot,
    algorithm: dependencies.algorithm,
  });
  const latestSource = dependencies.readSource();
  const latestPrinterVolume = dependencies.readPrinterVolume();
  const sourceIsCurrent =
    latestSource.status === "ready" &&
    deterministicSegmentationId(
      "segmentation-source",
      latestSource.snapshot.identity,
    ) === deterministicSegmentationId("segmentation-source", request.source);
  const printerIsCurrent =
    validPrinterVolume(latestPrinterVolume) &&
    deterministicSegmentationId(
      "printer-volume",
      latestPrinterVolume,
    ) === request.printerVolumeSignature;
  if (!sourceIsCurrent || !printerIsCurrent) {
    return {
      status: "stale",
      stage: "result-validation",
      reasonCode: "stale_source_revision",
      request,
      issues: [
        {
          severity: "blocker",
          reasonCode: "stale_source_revision",
          message:
            "Segmentation dependencies changed while the plan was being created.",
        },
      ],
    };
  }
  return result;
}

export interface SegmentationExecutionDependencies {
  readonly readSource: () => SegmentationSourceSnapshotResult;
  readonly readPrinterVolume: SegmentationApplicationDependencies["readPrinterVolume"];
  readonly runExecution: (
    request: SegmentationExecutionRequest,
  ) => Promise<SegmentationExecutionResult>;
}

const defaultExecutionDependencies: SegmentationExecutionDependencies = {
  readSource: readCurrentSegmentationSourceSnapshot,
  readPrinterVolume: defaultDependencies.readPrinterVolume,
  runExecution: async (request) => {
    if (typeof Worker === "undefined") {
      // The Worker-less fallback pulls in the whole manifold-3d/three.js-BVH
      // segmentation execution engine transitively (see
      // segmentationPlaneExecutor.ts). A dynamic import keeps that entire
      // engine out of the eagerly-loaded main bundle -- every real browser
      // has `Worker`, so this branch exists only for environments that
      // genuinely lack it, never the normal runtime path.
      const { executePlaneSegmentation } = await import(
        "../execution/segmentationPlaneExecutor"
      );

      return executePlaneSegmentation(request);
    }

    return runSegmentationExecutionInWorker(request);
  },
};

function executionSourceIsCurrent(
  executionRequest: SegmentationExecutionRequest,
  source: SegmentationSourceSnapshotResult,
  printerVolume: ReturnType<SegmentationExecutionDependencies["readPrinterVolume"]>,
): boolean {
  if (source.status !== "ready" || !validPrinterVolume(printerVolume)) return false;
  const body = source.snapshot.bodies[0];
  const geometryVersion =
    body !== undefined &&
    "geometryVersion" in body &&
    typeof body.geometryVersion === "string"
      ? body.geometryVersion
      : null;
  return (
    source.snapshot.identity.documentRevision === executionRequest.documentRevision &&
    source.snapshot.identity.documentFingerprint === executionRequest.documentFingerprint &&
    source.snapshot.identity.resultRequestId === executionRequest.committedResultRequestId &&
    source.snapshot.identity.bodySignature === executionRequest.sourceBody.bodySignature &&
    source.snapshot.bodies.length === 1 &&
    body?.id === executionRequest.sourceBody.bodyId &&
    geometryVersion === executionRequest.sourceBody.geometryVersion &&
    deterministicSegmentationId("printer-volume", printerVolume) ===
      executionRequest.printerVolumeSignature
  );
}

export async function executeSegmentationPlan(
  plan: SegmentationPlan,
  dependencies: SegmentationExecutionDependencies = defaultExecutionDependencies,
): Promise<SegmentationResult> {
  const source = dependencies.readSource();
  const printerVolume = dependencies.readPrinterVolume();
  if (source.status !== "ready" || !validPrinterVolume(printerVolume)) {
    return {
      status: "stale",
      stage: "source-snapshot",
      reasonCode: "stale_execution_source",
      request: plan.request,
      plan,
      issues: [{ severity: "blocker", reasonCode: "stale_execution_source", message: "The accepted execution source is no longer current." }],
      diagnostics: [{ stage: "preflight", reasonCode: "stale_execution_source", message: "Authoritative source or printer volume is unavailable." }],
    };
  }
  const preflight = createSegmentationExecutionRequest({
    plan,
    source: source.snapshot,
    printerVolume,
  });
  if (!preflight.ok) return preflight.result;
  if (!executionSourceIsCurrent(preflight.request, dependencies.readSource(), dependencies.readPrinterVolume())) {
    return {
      status: "stale",
      stage: "source-snapshot",
      reasonCode: "stale_execution_source",
      request: plan.request,
      plan,
      executionRequest: preflight.request,
      issues: [{ severity: "blocker", reasonCode: "stale_execution_source", message: "Execution dependencies changed before worker dispatch." }],
      diagnostics: [{ stage: "preflight", reasonCode: "stale_execution_source", message: "Pre-dispatch freshness check failed." }],
    };
  }
  let result: SegmentationExecutionResult;
  try {
    result = await dependencies.runExecution(preflight.request);
  } catch (error) {
    const cancelled =
      error instanceof SegmentationExecutionWorkerError &&
      error.code === "execution_cancelled";
    const reasonCode = cancelled ? "execution_cancelled" : "split_operation_failed";
    return {
      status: cancelled ? "cancelled" : "failed",
      stage: "geometry-execution",
      reasonCode,
      request: plan.request,
      plan,
      executionRequest: preflight.request,
      issues: [{ severity: "blocker", reasonCode, message: error instanceof Error ? error.message : "Segmentation execution failed." }],
      diagnostics: [{ stage: "split", reasonCode, message: error instanceof Error ? error.message : "Segmentation execution failed." }],
    } as SegmentationExecutionResult;
  }
  if (!executionSourceIsCurrent(preflight.request, dependencies.readSource(), dependencies.readPrinterVolume())) {
    return {
      status: "stale",
      stage: "result-validation",
      reasonCode: "stale_execution_source",
      request: plan.request,
      plan,
      executionRequest: preflight.request,
      issues: [{ severity: "blocker", reasonCode: "stale_execution_source", message: "Execution dependencies changed before result commit." }],
      diagnostics: [{ stage: "commit", reasonCode: "stale_execution_source", message: "Post-execution freshness check failed." }],
    };
  }
  return result;
}

export { captureSegmentationSourceSnapshot };
