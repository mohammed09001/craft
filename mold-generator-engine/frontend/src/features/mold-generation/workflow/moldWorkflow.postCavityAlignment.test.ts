import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { selectActiveMoldBodies, useSplitFaceStore } from "../split-face/splitFace.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";

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

// 60mm mold block bounds
const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 60, y: 60, z: 60 } };
// 30mm product model centered inside 60mm mold block (15mm side corridors)
const partBox = { min: { x: 15, y: 15, z: 15 }, max: { x: 45, y: 45, z: 45 } };
const canonicalPartGeometry = canonicalCube("product-model", partBox);

// Massive cavity box that leaves < 1mm wall thickness everywhere
const massiveCavityBox = { min: { x: -9.5, y: 0.5, z: -9.5 }, max: { x: 69.5, y: 59.5, z: 69.5 } };
const massiveCavityPart = canonicalCube("massive-cavity", massiveCavityBox);

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
  useViewportToolStore.getState().resetActiveTool();
});

describe("Post-Cavity Linear Alignment Restoration Test Suite", () => {
  it("Scenario A — regenerates valid linear alignment keys on post-cavity bodies", async () => {
    const state = useSplitFaceStore.getState();
    state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    state.enterSelection();
    state.toggleFace("front");

    // Move split plane to center of mold block
    const plane = useSplitFaceStore.getState().cuttingPlanes[0];
    if (plane) {
      useSplitFaceStore.getState().commitPlaneDrag(plane.id, 0.5, k1);
    }

    // 1. Create mold parts (pre-cavity registration succeeds)
    const partsCreated = await useSplitFaceStore.getState().createMoldParts("post-cavity-a", k1);
    if (useSplitFaceStore.getState().registration.status !== "generated") {
      console.log("PARTS REGISTRATION STATUS:", useSplitFaceStore.getState().registration);
    }
    expect(partsCreated).toBe(true);
    expect(useSplitFaceStore.getState().registration.status).toBe("generated");

    // 2. Create cavity
    const cavityCreated = await useSplitFaceStore.getState().createCavity(canonicalPartGeometry);
    expect(cavityCreated).toBe(true);

    const storeState = useSplitFaceStore.getState();

    // Assert cavity remains committed and complete
    expect(storeState.cavity.status).toBe("complete");
    expect(storeState.cavity.result).not.toBeNull();

    expect(storeState.registration.status).toBe("generated");
    expect(storeState.lastCommittedResult?.keyed).toBe(true);

    // Assert exactly two logical keys exist (left and right), running top-to-bottom
    const features = storeState.registration.report?.features ?? [];
    expect(features.length).toBeGreaterThan(0);
    const logicalKeyIds = Array.from(new Set(features.map((f) => f.logicalKeyId)));
    expect(logicalKeyIds.length).toBe(2);
    expect(logicalKeyIds.some((id) => id.includes("left"))).toBe(true);
    expect(logicalKeyIds.some((id) => id.includes("right"))).toBe(true);

    // Assert active final bodies contain both cavity and linear alignment keys
    const activeBodies = selectActiveMoldBodies(storeState);
    expect(activeBodies).toBeDefined();
    expect(activeBodies).toEqual(storeState.lastCommittedResult!.bodies);
    expect((activeBodies![0] as import("../registration").RegistrationSourceBody).geometryVersion).toContain("registration:");
  });

  it("Scenario B — safely falls back to unkeyed cavity bodies when cavity genuinely removes safe corridors", async () => {
    const state = useSplitFaceStore.getState();
    state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    state.enterSelection();
    state.toggleFace("front");

    const plane = useSplitFaceStore.getState().cuttingPlanes[0];
    if (plane) {
      useSplitFaceStore.getState().commitPlaneDrag(plane.id, 0.5, k1);
    }

    await useSplitFaceStore.getState().createMoldParts("post-cavity-b", k1);

    // Pass cavity with signature matching store so input signature check passes
    const invalidCavityPart = {
      ...massiveCavityPart,
      sourceSignature: canonicalPartGeometry.sourceSignature,
    };

    // Create massive cavity that consumes almost the entire block
    const cavityCreated = await useSplitFaceStore.getState().createCavity(invalidCavityPart);
    expect(cavityCreated).toBe(true);

    const storeState = useSplitFaceStore.getState();

    // Cavity remains committed and visible
    expect(storeState.cavity.status).toBe("complete");
    expect(storeState.cavity.result).not.toBeNull();

    // Registration falls back cleanly to blocked/unavailable
    expect(["blocked", "unavailable"]).toContain(storeState.registration.status);
    expect(storeState.lastCommittedResult?.keyed).toBe(false);

    // Active bodies return unkeyed cavity bodies without error
    const activeBodies = selectActiveMoldBodies(storeState);
    expect(activeBodies).toBeDefined();
    expect(activeBodies).toEqual(storeState.cavity.result!.bodies);
    expect(storeState.error).toBeNull();
  });

  it("Scenario C — keeps linear key profiles thin, narrow, and restrained across mold scales", async () => {
    const state = useSplitFaceStore.getState();
    state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
    state.enterSelection();
    state.toggleFace("front");

    const plane = useSplitFaceStore.getState().cuttingPlanes[0];
    if (plane) {
      useSplitFaceStore.getState().commitPlaneDrag(plane.id, 0.5, k1);
    }

    await useSplitFaceStore.getState().createMoldParts("post-cavity-c", k1);
    await useSplitFaceStore.getState().createCavity(canonicalPartGeometry);

    const features = useSplitFaceStore.getState().registration.report?.features ?? [];
    expect(features.length).toBeGreaterThan(0);

    for (const f of features) {
      // Width must be narrow guide rail (<= 4.5mm), not bulky block (> 5.5mm)
      expect(f.geometry.widthMm).toBeLessThanOrEqual(4.5);
      // Depth must be shallow (<= 2.0mm), not deep lock (> 3.5mm)
      expect(f.geometry.depthMm).toBeLessThanOrEqual(2.0);
    }
  });
});
