import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CavityAction } from "../cavity-generation/CavityAction";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { MasterMoldAction } from "./MasterMoldAction";
import { useMasterMoldStore } from "./masterMold.store";

vi.mock(
  "../cavity-generation/cavityGeneration.workerClient",
  () => ({
    cancelActiveCavityGeneration: vi.fn(),
    runCavityGenerationInWorker: vi.fn(async (input: import("../cavity-generation/cavityGeneration.contracts").CavityGenerationInput) => {
      const [{ validateAndPreparePartSolid }, { createCavityTool }, { generateCavityBodies }] = await Promise.all([
        import("../cavity-generation/partSolid.validator"),
        import("../cavity-generation/manifold.engine"),
        import("../cavity-generation/cavityBody.generator"),
      ]);

      const validation = validateAndPreparePartSolid(input);
      if (!validation.ok || validation.prepared === null) {
        throw new Error(validation.blockers[0]?.message ?? "Uploaded model is not a subtractable solid.");
      }

      const tool = await createCavityTool(validation.prepared, input.cavityClearanceMm, input.qualityMode, input.geometryToleranceMm);
      const result = await generateCavityBodies(input, tool);
      return { result, validationWarnings: validation.warnings };
    }),
  }),
);

vi.mock(
  "./masterMoldGeneration.workerClient",
  () => ({
    cancelActiveMasterMoldGeneration: vi.fn(),
    runMasterMoldGenerationInWorker: vi.fn(async (request: import("./masterMold.contracts").MasterMoldRequest) => {
      const { evaluateMasterMoldGeneration } = await import("./masterMoldGeneration.evaluate");
      return evaluateMasterMoldGeneration(request);
    }),
  }),
);

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
  useMasterMoldStore.setState({ status: "unavailable", generationVersion: 0, bodies: [], progress: 0, lastError: null });
});

async function reachPartsReadyWithCommittedCavity() {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(partMesh)).toBe(true);
  return partMesh;
}

it("is not rendered before a committed cutting result exists", () => {
  const partMesh = canonicalCube("m", k1);
  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  expect(screen.queryByRole("button", { name: "Master Mold" })).toBeNull();
});

it("generates a Master Mold by reusing an already-committed cavity result", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  const committedBodies = useSplitFaceStore.getState().lastCommittedResult!.bodies;

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  const bodies = useMasterMoldStore.getState().bodies;
  expect(bodies).toHaveLength(committedBodies.length);
  expect(bodies.every((body) => body.status === "current")).toBe(true);
  expect(bodies.map((body) => body.source.finalMoldPartId).sort()).toEqual(committedBodies.map((body) => body.id).sort());
});

it("generates a Master Mold without requiring the user to press Create Cavity first", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);

  // A "Committed Cutting Result" already exists at this point, but without
  // cavity geometry -- Master Mold must not mistake that for a final mold part.
  expect(useSplitFaceStore.getState().lastCommittedResult?.stages.cavityResult).toBeNull();
  expect(useSplitFaceStore.getState().cavity.status).not.toBe("complete");

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  expect(useMasterMoldStore.getState().bodies.length).toBeGreaterThan(0);
  // Master Mold's own synthesis path never touched Create Cavity's state.
  expect(useSplitFaceStore.getState().cavity.status).not.toBe("complete");
});

it("marks the toolbar control active once Master Mold is current", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-pressed", "true");
  });
});

it("is disabled while Segmentation regeneration is pending, matching Create Cavity's own gate", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  useSplitFaceStore.getState().beginSegmentationRegeneration();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);

  expect(screen.getByRole("button", { name: "Master Mold" })).toBeDisabled();
});

it("is keyboard-focusable once enabled", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  const button = screen.getByRole("button", { name: "Master Mold" });

  button.focus();
  expect(document.activeElement).toBe(button);
});

it("never activates Create Cavity as a side effect of generating a Master Mold", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);

  render(
    <>
      <CavityAction sourcePartMesh={partMesh} />
      <MasterMoldAction sourcePartMesh={partMesh} />
    </>,
  );

  expect(screen.getByRole("button", { name: "Create Cavity" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // Create Cavity's own button/state is untouched -- still says "Create
  // Cavity" (not "Rebuild Cavity"), and its store status never left "ready".
  expect(screen.getByRole("button", { name: "Create Cavity" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Rebuild Cavity" })).toBeNull();
  expect(useSplitFaceStore.getState().cavity.status).not.toBe("complete");
  expect(useSplitFaceStore.getState().cavity.status).not.toBe("generating");
});
