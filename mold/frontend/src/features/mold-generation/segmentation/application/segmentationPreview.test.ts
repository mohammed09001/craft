import {
  createWholeMoldBody,
  type MoldBodyData,
} from "../../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../../reference-mold-definition/referenceMoldDefinition.contracts";
import { baselineSegmentationAlgorithm } from "../domain/baselineSegmentationAlgorithm";
import type { SegmentationSourceSnapshot } from "../domain/segmentation.contracts";
import { requestSegmentationPlan } from "./segmentationApplication";
import {
  buildSegmentationPlanPreviewBodies,
  generateCommittedSegmentationRegistration,
  generateSegmentationPlanPreview,
} from "./segmentationPreview";
import {
  AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM,
  REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM,
} from "../../registration";

const wholeBounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 40, y: 40, z: 20 },
} as const;

const baseDefinition: ReferenceMoldDefinition = {
  schemaVersion: 1,
  definitionId: "oversized-preview-definition",
  modelId: "oversized-preview-model",
  coordinateSystem: { units: "millimeters", upAxis: "Z" },
  selectionBoxBounds: {
    min: { x: 10, y: 10, z: 5 },
    max: { x: 30, y: 30, z: 15 },
  },
  referenceMoldBlock: { clearanceMm: 10, bounds: wholeBounds },
  moldFrame: {
    frameId: "oversized-preview-frame",
    version: 1,
    units: "millimeters",
    upAxis: "Z",
    partOffset: { x: 0, y: 0, z: 5 },
    semanticFaces: {
      front: { axis: "y", direction: 1 },
      back: { axis: "y", direction: -1 },
      left: { axis: "x", direction: -1 },
      right: { axis: "x", direction: 1 },
      top: { axis: "z", direction: 1 },
      bottom: { axis: "z", direction: -1 },
    },
  },
  usedFaces: [],
};

const wholeBody = createWholeMoldBody(baseDefinition, {
  id: "oversized-preview-whole",
  name: "Canonical preliminary mold",
  geometryVersion: "oversized-preview-whole:v1",
}) as MoldBodyData & { readonly geometryVersion: string };

const definition: ReferenceMoldDefinition = {
  ...baseDefinition,
  moldBodies: [wholeBody],
};

const source: SegmentationSourceSnapshot = {
  identity: {
    documentRevision: 1,
    documentFingerprint: "oversized-preview-document:v1",
    resultRequestId: "oversized-preview-result:v1",
    definitionId: definition.definitionId,
    modelId: definition.modelId,
    frameId: definition.moldFrame!.frameId,
    bodySignature: wholeBody.geometryVersion,
    protectedRegionSignature: "none",
  },
  bodies: [wholeBody],
  aggregateBounds: wholeBounds,
  protectedRegions: [],
  protectedRegionEvidence: {
    status: "complete",
    reason: "No excluded regions exist in this preliminary mold fixture.",
  },
  warnings: [],
  units: "millimeters",
  upAxis: "Z",
};

function plan(printerVolume: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}) {
  const result = requestSegmentationPlan({
    readSource: () => ({ status: "ready", snapshot: source, definition }),
    readPrinterVolume: () => printerVolume,
    algorithm: baselineSegmentationAlgorithm,
  });
  expect(result.status).toBe("planned");
  if (result.status !== "planned") {
    throw new Error("Expected a planned Segmentation result.");
  }
  return result.plan;
}

describe("oversized Segmentation outer-mold and Registration preview", () => {
  it("uses the real one-axis plan sections and deterministically derives orange-lock manufacturing previews", async () => {
    const acceptedPlan = plan({ x: 40, y: 40, z: 10 });
    const bodies = buildSegmentationPlanPreviewBodies({
      plan: acceptedPlan,
      definition,
    });

    expect(acceptedPlan.requiredAxes).toEqual(["z"]);
    expect(bodies.map((body) => body.bounds)).toEqual(
      acceptedPlan.segments.map((segment) => segment.predictedBounds),
    );

    const first = await generateSegmentationPlanPreview({
      plan: acceptedPlan,
      source,
      definition,
      unkeyedBodies: bodies,
    });
    const rebuilt = await generateSegmentationPlanPreview({
      plan: acceptedPlan,
      source,
      definition,
      unkeyedBodies: bodies,
    });

    expect(first.registration.status).toBe("generated");
    expect(first.registration.report!.features.length).toBeGreaterThan(0);
    // The universal 5mm floor is gone: this interface's own usable span sets its width,
    // bounded by the shared manufacturing minimum and Segmentation's 5mm preferred target.
    expect(
      first.registration.report!.features.every(
        (feature) =>
          feature.geometry.widthMm >= REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM &&
          feature.geometry.widthMm <= AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM,
      ),
    ).toBe(true);
    expect(first.registration.report!.tolerancePolicy.radialClearanceMm).toBeGreaterThan(0);
    expect(first.registration.report!.features).toEqual(
      rebuilt.registration.report!.features,
    );
    expect(first.registration.bodies).not.toBe(bodies);
    expect(
      first.registration.report!.features.every((feature) =>
        first.registration.report!.interfaces.some(
          (moldInterface) => moldInterface.id === feature.interfaceId,
        ),
      ),
    ).toBe(true);
  });

  it("renders exactly the future sections authored by a real Multi-Axis plan", () => {
    const acceptedPlan = plan({ x: 20, y: 20, z: 20 });
    const bodies = buildSegmentationPlanPreviewBodies({
      plan: acceptedPlan,
      definition,
    });

    expect(acceptedPlan.requiredAxes).toEqual(["x", "y"]);
    expect(bodies).toHaveLength(acceptedPlan.segments.length);
    expect(bodies.map((body) => body.bounds)).toEqual(
      acceptedPlan.segments.map((segment) => segment.predictedBounds),
    );
    expect(new Set(bodies.map((body) => body.geometryVersion)).size).toBe(
      bodies.length,
    );
  });

  it("blocks an unsafe 5 mm preview without replacing the valid unkeyed sections", async () => {
    const acceptedPlan = plan({ x: 40, y: 40, z: 10 });
    const bodies = buildSegmentationPlanPreviewBodies({
      plan: acceptedPlan,
      definition,
    });
    const blockedSource: SegmentationSourceSnapshot = {
      ...source,
      protectedRegions: [
        {
          id: "all-interface-area",
          kind: "excluded",
          source: "manufacturing",
          provenanceId: "all-interface-area",
          bodyIds: bodies.map((body) => body.id),
          bounds: wholeBounds,
          hardness: "hard",
          clearanceMm: 0,
        },
      ],
      protectedRegionEvidence: {
        status: "complete",
        reason: "The whole interface is intentionally excluded.",
      },
    };

    const preview = await generateSegmentationPlanPreview({
      plan: acceptedPlan,
      source: blockedSource,
      definition,
      unkeyedBodies: bodies,
    });

    expect(preview.registration.status).toBe("blocked");
    expect(preview.registration.report?.reasonCode).toBe(
      "registration_insufficient_safe_area",
    );
    expect(preview.registration.bodies).toEqual(bodies);
    expect(preview.unkeyedBodies).toBe(bodies);
  });

  it("uses the same adaptive Segmentation sizing policy for committed bodies and preserves them when Registration is unsafe", async () => {
    const acceptedPlan = plan({ x: 40, y: 40, z: 10 });
    const bodies = buildSegmentationPlanPreviewBodies({
      plan: acceptedPlan,
      definition,
    });
    const generated = await generateCommittedSegmentationRegistration({
      plan: acceptedPlan,
      source,
      definition,
      bodies,
    });

    expect(generated.status).toBe("generated");
    expect(
      generated.report!.features.every(
        (feature) =>
          feature.geometry.widthMm >= REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM &&
          feature.geometry.widthMm <= AUTOMATIC_SEGMENTATION_PREFERRED_REGISTRATION_WIDTH_MM,
      ),
    ).toBe(true);

    const unsafeSource: SegmentationSourceSnapshot = {
      ...source,
      protectedRegions: [
        {
          id: "committed-interface-exclusion",
          kind: "excluded",
          source: "manufacturing",
          provenanceId: "committed-interface-exclusion",
          bodyIds: bodies.map((body) => body.id),
          bounds: wholeBounds,
          hardness: "hard",
          clearanceMm: 0,
        },
      ],
    };
    const blocked = await generateCommittedSegmentationRegistration({
      plan: acceptedPlan,
      source: unsafeSource,
      definition,
      bodies,
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.report?.reasonCode).toBe(
      "registration_insufficient_safe_area",
    );
    expect(blocked.bodies).toEqual(bodies);
  });
});
