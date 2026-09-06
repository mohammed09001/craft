import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import { baselineSegmentationAlgorithm } from "../domain/baselineSegmentationAlgorithm";
import type {
  SegmentationApplicationDependencies,
} from "./segmentationApplication";
import type {
  SegmentationSourceSnapshot,
} from "../domain/segmentation.contracts";
import {
  createSegmentationRequest,
  requestSegmentationPlan,
} from "./segmentationApplication";

const moldBody: MoldBodyData = {
  id: "body-a",
  name: "Body A",
  visible: true,
  bounds: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 250, y: 50, z: 50 },
  },
  triangleCount: 1,
  volumeMm3: 625_000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 250, 0, 0, 0, 50, 50],
    indices: [0, 1, 2],
  },
};

const source: SegmentationSourceSnapshot = {
  identity: {
    documentRevision: 4,
    documentFingerprint: "fingerprint-4",
    resultRequestId: "mold-eval:4",
    definitionId: "definition-a",
    modelId: "model-a",
    frameId: "frame-a",
    bodySignature: "body-signature",
    protectedRegionSignature: "protected-region-signature",
  },
  bodies: [moldBody],
  aggregateBounds: moldBody.bounds,
  protectedRegions: [],
  protectedRegionEvidence: {
    status: "incomplete",
    reason: "Bounds-level test evidence only.",
  },
  warnings: [],
  units: "millimeters",
  upAxis: "Z",
};

const definition: ReferenceMoldDefinition = {
  schemaVersion: 1,
  definitionId: "definition-a",
  modelId: "model-a",
  coordinateSystem: { units: "millimeters", upAxis: "Z" },
  selectionBoxBounds: moldBody.bounds,
  referenceMoldBlock: { clearanceMm: 10, bounds: moldBody.bounds },
  usedFaces: [],
  moldBodies: [moldBody],
};

function dependencies(
  printerVolume: { x: number; y: number; z: number } | null,
): SegmentationApplicationDependencies {
  return {
    readSource: () => ({ status: "ready", snapshot: source, definition }),
    readPrinterVolume: () => printerVolume,
    algorithm: baselineSegmentationAlgorithm,
  };
}

describe("segmentation application boundary", () => {
  it("constructs a deterministic planning request", () => {
    const request = createSegmentationRequest({
      source,
      printerVolume: { x: 100, y: 100, z: 100 },
    });
    expect(request).toMatchObject({
      schemaVersion: 1,
      operation: "plan",
      source: source.identity,
      policyId: "printer-fit-baseline",
    });
    expect(request.requestId).toBe(
      createSegmentationRequest({
        source,
        printerVolume: { x: 100, y: 100, z: 100 },
      }).requestId,
    );
  });

  it("returns structured invalid-printer-volume failure", () => {
    expect(
      requestSegmentationPlan(dependencies({ x: 0, y: 100, z: 100 })),
    ).toMatchObject({
      status: "failed",
      stage: "request-creation",
      reasonCode: "invalid_printer_volume",
    });
  });

  it("returns structured missing-geometry failure from the source boundary", () => {
    const missing: SegmentationApplicationDependencies = {
      ...dependencies({ x: 100, y: 100, z: 100 }),
      readSource: () => ({
        status: "failed",
        reasonCode: "missing_authoritative_geometry",
        issues: [
          {
            severity: "blocker",
            reasonCode: "missing_authoritative_geometry",
            message: "Missing.",
          },
        ],
      }),
    };
    expect(requestSegmentationPlan(missing)).toMatchObject({
      status: "failed",
      stage: "source-snapshot",
      reasonCode: "missing_authoritative_geometry",
    });
  });

  it("plans through the shared policy and planner", () => {
    const one = requestSegmentationPlan(dependencies({ x: 100, y: 100, z: 100 }));
    expect(one.status).toBe("planned");
    if (one.status !== "planned") return;
    expect(one.request.policyId).toBe("printer-fit-baseline");
  });

  it("rejects a plan when the authoritative revision changes during planning", () => {
    let sourceRead = 0;
    const changingDependencies: SegmentationApplicationDependencies = {
      ...dependencies({ x: 100, y: 100, z: 100 }),
      readSource: () => {
        sourceRead += 1;
        return {
          status: "ready",
          definition,
          snapshot:
            sourceRead === 1
              ? source
              : {
                  ...source,
                  identity: {
                    ...source.identity,
                    documentRevision: source.identity.documentRevision + 1,
                    documentFingerprint: "fingerprint-5",
                  },
                },
        };
      },
    };

    expect(
      requestSegmentationPlan(changingDependencies),
    ).toMatchObject({
      status: "stale",
      stage: "result-validation",
      reasonCode: "stale_source_revision",
    });
  });
});
