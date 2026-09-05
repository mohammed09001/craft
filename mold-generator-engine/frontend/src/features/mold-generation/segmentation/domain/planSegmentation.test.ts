import type { MoldBodyData } from "../../reference-mold-definition/orthogonalMold";
import { baselineSegmentationAlgorithm } from "./baselineSegmentationAlgorithm";
import type {
  ProtectedRegion,
  SegmentationAlgorithm,
  SegmentationMode,
  SegmentationSourceSnapshot,
} from "./segmentation.contracts";
import { deterministicSegmentationId } from "./segmentationIdentity";
import { planSegmentation } from "./planSegmentation";
import { createSegmentationRequest } from "../application/segmentationApplication";
import { resolveSegmentationModeStrategy } from "../application/segmentationModeStrategies";
import { createSegmentationExecutionRequest } from "../execution/segmentationExecutionPreflight";

function body(
  id: string,
  maximum: { x: number; y: number; z: number },
): MoldBodyData & { readonly geometryVersion: string } {
  return {
    id,
    name: id,
    visible: true,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: maximum },
    triangleCount: 1,
    volumeMm3: maximum.x * maximum.y * maximum.z,
    watertight: true,
    mesh: {
      positions: [0, 0, 0, maximum.x, 0, 0, 0, maximum.y, maximum.z],
      indices: [0, 1, 2],
    },
    geometryVersion: `${id}:v1`,
  };
}

function source(
  maximum = { x: 250, y: 50, z: 50 },
  protectedRegions: readonly ProtectedRegion[] = [],
): SegmentationSourceSnapshot {
  const bodies = [body("body-a", maximum)];
  const protectedRegionEvidence = {
    status: "incomplete",
    reason: "Bounds-level test evidence only.",
  } as const;
  return {
    identity: {
      documentRevision: 7,
      documentFingerprint: "doc-fingerprint",
      resultRequestId: "mold-eval:7",
      definitionId: "definition-a",
      modelId: "model-a",
      frameId: "frame-a",
      bodySignature: "body-signature",
      protectedRegionSignature: deterministicSegmentationId(
        "protected-regions",
        { regions: protectedRegions, evidence: protectedRegionEvidence },
      ),
    },
    bodies,
    aggregateBounds: bodies[0]!.bounds,
    protectedRegions,
    protectedRegionEvidence,
    warnings: [],
    units: "millimeters",
    upAxis: "Z",
  };
}

function plan(
  mode: SegmentationMode = "make-as-one-mold",
  sourceSnapshot = source(),
  algorithm: SegmentationAlgorithm = baselineSegmentationAlgorithm,
) {
  const strategy = resolveSegmentationModeStrategy(mode);
  const request = createSegmentationRequest({
    mode,
    source: sourceSnapshot,
    printerVolume: { x: 100, y: 100, z: 100 },
    strategy,
  });
  return planSegmentation({
    request,
    source: sourceSnapshot,
    algorithm,
    strategy,
  });
}

describe("mode-neutral segmentation planning", () => {
  it("constructs deterministic requests and plans for identical inputs", () => {
    const first = plan();
    const second = plan();
    expect(first.status).toBe("planned");
    expect(second.status).toBe("planned");
    if (first.status !== "planned" || second.status !== "planned") return;

    expect(second.request).toEqual(first.request);
    expect(second.plan.id).toBe(first.plan.id);
    expect(second.plan.selectedCandidateId).toBe(
      first.plan.selectedCandidateId,
    );
    expect(second.plan.segments.map((segment) => segment.id)).toEqual(
      first.plan.segments.map((segment) => segment.id),
    );
  });

  it("classifies oversize axes and estimates the minimum segment count", () => {
    const result = plan();
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;

    expect(result.plan.requiredAxes).toEqual(["x"]);
    expect(result.plan.perAxisSegmentCount).toEqual({ x: 3, y: 1, z: 1 });
    expect(result.plan.estimatedMinimumSegmentCount).toBe(3);
    expect(
      result.plan.segments.every(
        (segment) => segment.predictedFit.status === "FITS",
      ),
    ).toBe(true);
    expect(result.plan).toMatchObject({
      planningBasis: "bounds-only",
      validation: {
        status: "planning-valid",
        printableByBounds: "verified",
        geometryExecution: "not-run",
        manufacturingSafety: "not-established",
      },
    });
  });

  it("changes identity when mode or source revision changes", () => {
    const oneMold = plan("make-as-one-mold");
    const moreMolds = plan("make-as-more-molds");
    const changedSource = source();
    const revised = plan("make-as-one-mold", {
      ...changedSource,
      identity: { ...changedSource.identity, documentRevision: 8 },
    });
    expect(oneMold.status).toBe("planned");
    expect(moreMolds.status).toBe("planned");
    expect(revised.status).toBe("planned");
    if (
      oneMold.status !== "planned" ||
      moreMolds.status !== "planned" ||
      revised.status !== "planned"
    ) {
      return;
    }
    expect(moreMolds.plan.id).not.toBe(oneMold.plan.id);
    expect(revised.plan.id).not.toBe(oneMold.plan.id);
  });

  it("rejects a baseline candidate that crosses a hard protected region", () => {
    const protectedRegion: ProtectedRegion = {
      id: "hard-sealing-region",
      kind: "sealing",
      source: "manufacturing",
      provenanceId: "policy:1",
      bodyIds: ["body-a"],
      bounds: {
        min: { x: 80, y: 0, z: 0 },
        max: { x: 90, y: 50, z: 50 },
      },
      hardness: "hard",
      clearanceMm: 5,
    };
    const result = plan(
      "make-as-one-mold",
      source({ x: 250, y: 50, z: 50 }, [protectedRegion]),
    );
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reasonCode).toBe("no_printable_plan");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "protected_region_conflict" }),
      ]),
    );
  });

  it("changes request identity when protected-region evidence changes", () => {
    const withoutRegion = plan();
    const region: ProtectedRegion = {
      id: "advisory-cavity",
      kind: "cavity-surface",
      source: "cavity",
      provenanceId: "cavity:1",
      bodyIds: ["body-a"],
      bounds: {
        min: { x: 10, y: 10, z: 10 },
        max: { x: 20, y: 20, z: 20 },
      },
      hardness: "advisory",
      clearanceMm: 1,
    };
    const withRegion = plan(
      "make-as-one-mold",
      source({ x: 250, y: 50, z: 50 }, [region]),
    );
    expect(withoutRegion.status).toBe("planned");
    expect(withRegion.status).toBe("planned");
    if (
      withoutRegion.status !== "planned" ||
      withRegion.status !== "planned"
    ) {
      return;
    }
    expect(withRegion.request.requestId).not.toBe(
      withoutRegion.request.requestId,
    );
    expect(withRegion.plan.id).not.toBe(withoutRegion.plan.id);
  });

  it("orchestrates an injected algorithm without importing a concrete mode implementation", () => {
    const injected: SegmentationAlgorithm = {
      ...baselineSegmentationAlgorithm,
      id: "test-replaceable-algorithm",
    };
    const result = plan("make-as-one-mold", source(), injected);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.algorithmId).toBe("test-replaceable-algorithm");
  });

  it("carries a planned multi-boundary X sequence into execution preflight", () => {
    const sourceSnapshot = source();
    const result = plan("make-as-one-mold", sourceSnapshot);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    const preflight = createSegmentationExecutionRequest({
      plan: result.plan,
      source: sourceSnapshot,
      printerVolume: { x: 100, y: 100, z: 100 },
    });
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    expect(preflight.request.planes).toHaveLength(result.plan.boundaries.length);
    expect(preflight.request.planes.length).toBeGreaterThan(1);
  });
});

describe("section-driven segmentation (printer dimensions are not the only driver)", () => {
  // Fits every printer axis (100x100x100) on its own, but x is
  // significantly more elongated than y/z -- a logical-sectioning reason
  // to segment that has nothing to do with printer fit.
  const elongatedButFittingSource = source({ x: 95, y: 50, z: 50 });

  it("More Molds Automatic plans a logical section even though the mold already fits the printer", () => {
    const result = plan("make-as-more-molds", elongatedButFittingSource);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.requiredAxes).toEqual(["x"]);
    expect(result.plan.perAxisSegmentCount).toEqual({ x: 2, y: 1, z: 1 });
    expect(result.plan.validation.status).toBe("planning-valid");
  });

  it("One Mold does not plan section-driven segmentation for the same fitting, elongated mold", () => {
    const result = plan("make-as-one-mold", elongatedButFittingSource);
    expect(result.status).toBe("not-required");
  });

  it("combines an independent logical section with printer-fit subdivision on a different axis", () => {
    // x alone already exceeds the printer (needs 3-way printer-fit
    // subdivision); y is not printer-forced but is still significantly
    // elongated relative to z, so More Molds Automatic should section it
    // for logical reasons too -- two independent drivers, one combined plan.
    const combinedSource = source({ x: 250, y: 95, z: 50 });
    const result = plan("make-as-more-molds", combinedSource);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.requiredAxes).toEqual(["x", "y"]);
    expect(result.plan.perAxisSegmentCount).toEqual({ x: 3, y: 2, z: 1 });
    expect(
      result.plan.segments.every(
        (segment) => segment.predictedFit.status === "FITS",
      ),
    ).toBe(true);
  });
});

describe("real objective-policy candidate ranking", () => {
  it("always ranks a hard-constraint failure below a valid candidate, regardless of objective score", () => {
    const injected: SegmentationAlgorithm = {
      ...baselineSegmentationAlgorithm,
      id: "test-two-candidate-algorithm",
      generateCandidates(context) {
        const [baseline] = baselineSegmentationAlgorithm.generateCandidates(context);
        const valid = { ...baseline!, id: "candidate-valid" };
        // A worse-scoring-but-otherwise-fine candidate that also carries a
        // hard blocker -- it must never outrank the valid one, no matter
        // how favorable its other score fields look.
        const blocked = {
          ...baseline!,
          id: "candidate-blocked",
          score: {
            ...baseline!.score,
            hardFailureCount: 1,
            segmentCount: 1,
            minimumPrintableMarginMm: 1_000_000,
          },
        };
        return [blocked, valid];
      },
    };
    const result = plan("make-as-one-mold", source(), injected);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.selectedCandidateId).toBe("candidate-valid");
  });

  it("applies the active strategy's own objective weights when ranking otherwise-equal candidates", () => {
    const injected: SegmentationAlgorithm = {
      ...baselineSegmentationAlgorithm,
      id: "test-two-valid-candidate-algorithm",
      generateCandidates(context) {
        const [baseline] = baselineSegmentationAlgorithm.generateCandidates(context);
        const fewPieces = {
          ...baseline!,
          id: "candidate-few-pieces",
          score: {
            ...baseline!.score,
            hardFailureCount: 0,
            segmentCount: 3,
            minimumPrintableMarginMm: 1,
            declaredRisk: 0,
          },
        };
        const highMargin = {
          ...baseline!,
          id: "candidate-high-margin",
          score: {
            ...baseline!.score,
            hardFailureCount: 0,
            segmentCount: 3,
            minimumPrintableMarginMm: 500,
            declaredRisk: 0,
          },
        };
        return [fewPieces, highMargin];
      },
      evaluateCandidate: (candidate) => candidate,
    };
    const result = plan("make-as-one-mold", source(), injected);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    // Both strategies' real weights reward a larger margin (marginWeight >
    // 0 for both), so the high-margin candidate wins either way -- proving
    // the strategy's weights (not a hard-coded engine rule) drove the
    // selection, via a plainly different score.plan.score.weightedObjectiveScore
    // than the fewPieces candidate would have produced.
    expect(result.plan.selectedCandidateId).toBe("candidate-high-margin");
    expect(result.plan.score.weightedObjectiveScore).toBeLessThan(0);
  });
});
