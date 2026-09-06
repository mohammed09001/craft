import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { selectActiveMoldBodies, useSplitFaceStore } from "../split-face/splitFace.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import * as registrationModule from "../registration";

vi.mock("../cavity-generation/cavityGeneration.workerClient", () => ({
  cancelActiveCavityGeneration: vi.fn(),
  runCavityGenerationInWorker: vi.fn(async (input: import("../cavity-generation").CavityGenerationInput) => {
    const [{ validateAndPreparePartSolid }, { createCavityTool }, { generateCavityBodies }] = await Promise.all([
      import("../cavity-generation/partSolid.validator"), import("../cavity-generation/manifold.engine"), import("../cavity-generation/cavityBody.generator"),
    ]);
    if (input.sourcePartMesh.sourceSignature === "failing-cavity") {
      throw Object.assign(new Error("The cavity tool did not intersect any mold material."), { code: "cavity_no_material_intersection" });
    }
    const validation = validateAndPreparePartSolid(input);
    if (!validation.ok || validation.prepared === null) throw new Error("Invalid cavity fixture.");
    const tool = await createCavityTool(validation.prepared, input.cavityClearanceMm, input.qualityMode, input.geometryToleranceMm);
    return { result: await generateCavityBodies(input, tool), validationWarnings: validation.warnings };
  }),
}));

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const canonicalPartGeometry = canonicalCube("decoupling-test", k1);

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
  useViewportToolStore.getState().resetActiveTool();
});

describe("Cavity Success Decoupling Regression Test Suite", () => {
  it("commits cavity independently when linear registration is unavailable", async () => {
    const state = useSplitFaceStore.getState();
    state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    state.enterSelection();
    state.toggleFace("front");

    // 1. Create mold parts (registration succeeds and status becomes "generated")
    const partsCreated = await useSplitFaceStore.getState().createMoldParts("decoupling", k1);
    expect(partsCreated).toBe(true);
    expect(useSplitFaceStore.getState().registration.status).toBe("generated");

    // 2. Spy on generateDerivedRegistration to return blocked/unavailable registration when cavity is created
    vi.spyOn(registrationModule, "generateDerivedRegistration").mockImplementation(async (snapshot) => {
      const policy = new registrationModule.DefaultRegistrationToleranceResolver().resolve(null);
      if (snapshot.protectedRegions.some(r => r.kind === "cavity")) {
        return {
          status: "blocked",
          revision: snapshot.revision,
          bodies: snapshot.bodies,
          report: {
            schemaVersion: 1,
            sourceRevision: snapshot.revision,
            status: "blocked",
            reasonCode: "registration_insufficient_wall_thickness",
            message: "Linear alignment could not be generated for this interface. The cavity remains valid.",
            tolerancePolicy: policy,
            interfaces: [],
            features: [],
            attempts: [],
          },
        };
      }
      return {
        status: "generated",
        revision: snapshot.revision,
        bodies: snapshot.bodies,
        report: {
          schemaVersion: 1,
          sourceRevision: snapshot.revision,
          status: "generated",
          reasonCode: "registration_generated",
          message: "Linear registration generated.",
          tolerancePolicy: policy,
          interfaces: [],
          features: [],
          attempts: [],
        },
      };
    });

    // 3. Create cavity - MUST SUCCEED even though registration becomes unavailable
    const cavityCreated = await useSplitFaceStore.getState().createCavity(canonicalPartGeometry);
    expect(cavityCreated).toBe(true);

    const storeState = useSplitFaceStore.getState();

    // Assert cavity is committed
    expect(storeState.cavity.status).toBe("complete");
    expect(storeState.cavity.result).not.toBeNull();
    expect(storeState.cavity.result!.bodies.length).toBeGreaterThan(0);

    // Assert active bodies are the cavity bodies (not empty, not pre-cavity)
    const activeBodies = selectActiveMoldBodies(storeState);
    expect(activeBodies).toBeDefined();
    expect(activeBodies!.length).toBeGreaterThan(0);
    expect(activeBodies).toEqual(storeState.cavity.result!.bodies);

    // Assert final mold result is committed and valid
    expect(storeState.lastCommittedResult).not.toBeNull();
    expect(storeState.lastCommittedResult!.bodies).toEqual(storeState.cavity.result!.bodies);
    expect(storeState.lastCommittedResult!.keyed).toBe(false);

    // Assert registration feature list is empty and status reflects unavailable/blocked
    expect(storeState.registration.report?.features ?? []).toEqual([]);
    expect(["blocked", "unavailable"]).toContain(storeState.registration.status);

    // Assert exportable bodies return the cavity bodies
    const exportBodies = storeState.lastCommittedResult?.bodies;
    expect(exportBodies).toBeDefined();
    expect(exportBodies).toEqual(storeState.cavity.result!.bodies);

    // Assert UI receives a non-blocking warning rather than a blocking error
    expect(storeState.evaluation.phase).toBe("complete");
    expect(storeState.error).toBeNull();
  });

  it("does not falsely commit cavity when cavity generation fails", async () => {
    const state = useSplitFaceStore.getState();
    state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    state.enterSelection();
    state.toggleFace("front");
    await useSplitFaceStore.getState().createMoldParts("decoupling-fail", k1);

    const beforeResult = useSplitFaceStore.getState().lastCommittedResult;

    // Pass cavity geometry with failing signature
    const invalidPartGeometry = {
      ...canonicalPartGeometry,
      sourceSignature: "failing-cavity",
    };

    const cavityCreated = await useSplitFaceStore.getState().createCavity(invalidPartGeometry);
    expect(cavityCreated).toBe(false);

    const storeState = useSplitFaceStore.getState();
    expect(storeState.cavity.result).toBeNull();
    expect(storeState.lastCommittedResult).toEqual(beforeResult);
  });
});
