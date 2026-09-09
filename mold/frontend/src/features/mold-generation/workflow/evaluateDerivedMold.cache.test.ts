import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { buildCavityGenerationInput } from "../cavity-generation/cavityGeneration.input";
import type { CavityGenerationResult } from "../cavity-generation/cavityGeneration.contracts";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { generateMoldBodies, type CutPlaneData } from "../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import { designSprueProfile, type SprueDefinition, type SprueGenerationInput, type SprueGenerationResult, type SprueOperationDefinition, type SprueUpdatedBody } from "../sprue-generation";
import type { DerivedMoldEvaluationInput, DerivedMoldEvaluationResult } from "./derivedMoldEvaluation.contracts";

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const k2 = { min: { x: -10, y: -10, z: -10 }, max: { x: 20, y: 20, z: 20 } };
const cuttingPlane: CutPlaneData = {
  axis: "x", coordinate: 5, normal: { x: 1, y: 0, z: 0 }, sourceSketchId: "middle", sourceFace: "left", order: 0,
};

function buildDefinition(): ReferenceMoldDefinition {
  const base: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId: "cache-fixture",
    modelId: "cache-fixture-model",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: k1,
    referenceMoldBlock: { clearanceMm: 10, bounds: k2 },
    usedFaces: ["left"],
  };
  return { ...base, moldBodies: generateMoldBodies(base, [cuttingPlane]) };
}

let definition: ReferenceMoldDefinition;
let cavityResult: CavityGenerationResult;

const profile = designSprueProfile(null);
const operation = (operationId: string, order: number, mainDiameterMm = 2.5): SprueOperationDefinition => ({
  operationId,
  anchor: { position: { x: 5, y: 5, z: 30 }, surfaceId: "reference-mold:top" },
  inwardDirection: { x: 0, y: 0, z: -1 },
  profileDesign: {
    ...profile,
    profile: { ...profile.profile, mainDiameterMm, entryNeckDiameterMm: Math.min(profile.profile.entryNeckDiameterMm, mainDiameterMm) },
  },
  creationOrder: order,
  coordinateSpace: "mold-local",
  validation: { status: "pending", reasonCode: null, message: null },
});

let evaluateDerivedMold: (input: DerivedMoldEvaluationInput) => Promise<DerivedMoldEvaluationResult>;
let generateSpy: MockInstance<(input: SprueGenerationInput) => Promise<SprueGenerationResult>>;

/** Deterministic canned Sprue generation: returns a success whose updated
 * body geometryVersion depends only on the operation + requested profile, so
 * the evaluation's downstream `moldRevision` advances exactly when a Sprue's
 * own output would really change -- letting the test observe cache reuse and
 * upstream invalidation without running a Boolean kernel per assertion. */
function cannedGenerate({ request, targetBodies }: SprueGenerationInput): Promise<SprueGenerationResult> {
  const body = targetBodies[0];
  const updatedBodies: SprueUpdatedBody[] = body === undefined
    ? []
    : [{
        ...body,
        centroid: body.centroid ?? { x: 5, y: 5, z: 5 },
        geometryVersion: `canned:${request.profileDesign.profile.mainDiameterMm}:${request.operationId}`,
        sprueOperationId: request.operationId,
      }];
  const sprue: SprueDefinition = {
    operationId: request.operationId,
    targetBodyIds: body === undefined ? [] : [body.id],
    position: request.position,
    inwardDirection: { x: 0, y: 0, z: -1 },
    profile: request.profileDesign.profile,
    depthMm: 10,
    circularSegments: 32,
    coordinateSpace: "mold-local",
    moldFrameId: "cache-fixture:z-up",
    tolerancePolicy: { linearToleranceMm: 0.01, areaToleranceMm2: 0.01, volumeToleranceMm3: 0.01, meaningfulVolumeMm3: 0.01, surfaceToleranceMm: 0.01, outsideMarginMm: 0, beyondMarginMm: 0 },
  };
  return Promise.resolve({ status: "success", operationId: request.operationId, sourceRevision: request.moldRevision, sprue, beforeBodies: [], updatedBodies, replacedBodyIds: [], warnings: [] });
}

function inputFor(operationIds: string[], mains: number[]): DerivedMoldEvaluationInput {
  const sprues = operationIds.map((id, index) => operation(id, index, mains[index]));
  return {
    requestId: `cache-test:${operationIds.join(",")}:${mains.join(",")}`,
    sourceRevision: 1,
    sourceFingerprint: `fingerprint:${operationIds.join(",")}:${mains.join(",")}`,
    cavityResult,
    definition,
    cuttingPlanes: [],
    sprueDefinitions: sprues,
  };
}

beforeAll(async () => {
  definition = buildDefinition();
  const canonical = canonicalCube("cache-fixture-model", k1);
  const input = buildCavityGenerationInput({
    sourcePartMesh: canonical,
    definition,
    cuttingPlanes: [],
    cavityClearanceMm: 0,
    qualityMode: "standard",
    generationVersion: 1,
  });
  const validation = validateAndPreparePartSolid(input);
  if (!validation.ok || validation.prepared === null) throw new Error(validation.blockers[0]?.message ?? "Invalid cavity fixture.");
  const tool = await createCavityTool(validation.prepared, input.cavityClearanceMm, input.qualityMode, input.geometryToleranceMm);
  cavityResult = await generateCavityBodies(input, tool);
  expect(cavityResult.bodies.length).toBeGreaterThan(0);
});

beforeEach(async () => {
  vi.resetModules();
  const evaluate = await import("./evaluateDerivedMold");
  const service = await import("../sprue-generation/SprueGenerationService");
  evaluateDerivedMold = evaluate.evaluateDerivedMold;
  generateSpy = vi.spyOn(service.SprueGenerationService.prototype, "generate").mockImplementation(cannedGenerate);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("per-Sprue evaluation cache dependencies", () => {
  it("reuses the exact same operation + input and recomputes when the main diameter changes", async () => {
    await evaluateDerivedMold(inputFor(["A"], [2.5]));
    expect(generateSpy.mock.calls).toHaveLength(1);

    await evaluateDerivedMold(inputFor(["A"], [2.5]));
    expect(generateSpy.mock.calls).toHaveLength(1);

    await evaluateDerivedMold(inputFor(["A"], [3.5]));
    expect(generateSpy.mock.calls).toHaveLength(2);
  });

  it("recomputes when any profile input that reaches the kernel changes", async () => {
    await evaluateDerivedMold(inputFor(["A"], [2.5]));
    expect(generateSpy.mock.calls).toHaveLength(1);

    // Same key again: cache hit, no extra generate.
    await evaluateDerivedMold(inputFor(["A"], [2.5]));
    expect(generateSpy.mock.calls).toHaveLength(1);

    // Entry-neck diameter differs -> the profile snapshot differs -> recompute.
    const changed = inputFor(["A"], [2.5]);
    const definitionChanged = {
      ...changed.sprueDefinitions[0]!,
      profileDesign: { ...changed.sprueDefinitions[0]!.profileDesign, profile: { ...changed.sprueDefinitions[0]!.profileDesign.profile, entryNeckDiameterMm: 1.5 } },
    };
    await evaluateDerivedMold({ ...changed, sprueDefinitions: [definitionChanged] });
    expect(generateSpy.mock.calls).toHaveLength(2);
  });

  it("reuses the unchanged prefix (A) when a later Sprue (B) is edited", async () => {
    await evaluateDerivedMold(inputFor(["A"], [2.5]));
    const afterFirst = generateSpy.mock.calls.length;

    await evaluateDerivedMold(inputFor(["A", "B"], [2.5, 3.5]));
    expect(generateSpy.mock.calls).toHaveLength(afterFirst + 1);

    // B edit: only B recomputes; A is untouched and reused.
    await evaluateDerivedMold(inputFor(["A", "B"], [2.5, 4.5]));
    expect(generateSpy.mock.calls).toHaveLength(afterFirst + 2);
    expect(generateSpy.mock.calls.at(-1)![0].request.operationId).toBe("B");
  });

  it("recomputes a downstream Sprue when an upstream Sprue's output changes (A resized -> B recomputes)", async () => {
    await evaluateDerivedMold(inputFor(["A", "B"], [2.5, 3.5]));
    const afterFirst = generateSpy.mock.calls.length;
    expect(generateSpy.mock.calls.map((call) => call[0].request.operationId)).toEqual(["A", "B"]);

    // A edited: A recomputes AND B recomputes because A's updated body
    // geometry changed B's upstream moldRevision.
    await evaluateDerivedMold(inputFor(["A", "B"], [4.5, 3.5]));
    expect(generateSpy.mock.calls).toHaveLength(afterFirst + 2);
    expect(generateSpy.mock.calls.at(-2)![0].request.operationId).toBe("A");
    expect(generateSpy.mock.calls.at(-1)![0].request.operationId).toBe("B");
  });

  it("three-Sprue chain: C-only edit reuses A and B; B edit recomputes B and C", async () => {
    await evaluateDerivedMold(inputFor(["A", "B", "C"], [2.5, 3.5, 4.5]));
    expect(generateSpy.mock.calls.map((call) => call[0].request.operationId)).toEqual(["A", "B", "C"]);

    // C-only edit: A and B reuse; only C recomputes.
    await evaluateDerivedMold(inputFor(["A", "B", "C"], [2.5, 3.5, 5.5]));
    expect(generateSpy.mock.calls).toHaveLength(4);
    expect(generateSpy.mock.calls.at(-1)![0].request.operationId).toBe("C");

    // B edit: A reuse; B recompute; C recompute (upstream changed).
    await evaluateDerivedMold(inputFor(["A", "B", "C"], [2.5, 5.5, 5.5]));
    expect(generateSpy.mock.calls).toHaveLength(6);
    expect(generateSpy.mock.calls.at(-1)![0].request.operationId).toBe("C");
  });
});
