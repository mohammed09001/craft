import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { CavityAction } from "./CavityAction";
import { canonicalCube } from "./cavityGeneration.testFixtures";
import { useSplitFaceStore } from "../split-face/splitFace.store";

vi.mock(
  "./cavityGeneration.workerClient",
  () => ({
    cancelActiveCavityGeneration:vi.fn(),
    runCavityGenerationInWorker: vi.fn(
      async (
        input: import("./cavityGeneration.contracts").CavityGenerationInput,
      ) => {
        const [
          { validateAndPreparePartSolid },
          { createCavityTool },
          { generateCavityBodies },
        ] = await Promise.all([
          import("./partSolid.validator"),
          import("./manifold.engine"),
          import("./cavityBody.generator"),
        ]);

        const validation = validateAndPreparePartSolid(input);

        if (!validation.ok || validation.prepared === null) {
          throw new Error(
            validation.blockers[0]?.message ??
              "Uploaded model is not a subtractable solid.",
          );
        }

        const tool = await createCavityTool(
          validation.prepared,
          input.cavityClearanceMm,
          input.qualityMode,
          input.geometryToleranceMm,
        );

        const result = await generateCavityBodies(
          input,
          tool,
        );

        return {
          result,
          validationWarnings: validation.warnings,
        };
      },
    ),
  }),
);

const k1 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 10, z: 10 },
};

beforeEach(() => {
  useSplitFaceStore
    .getState()
    .clearForModelReplacement();
});

it("keeps Create Cavity available after Mold Scale invalidates a prior base result", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);
  useSplitFaceStore.getState().setClearanceMm(12);

  render(<CavityAction sourcePartMesh={partMesh} />);

  expect(screen.getByRole("button", { name: "Create Cavity" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Rebuild Cavity" })).toBeNull();
});

it("disables the cavity action and shows a truthful label while Segmentation regeneration is pending after Mold Scale", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);

  useSplitFaceStore.getState().beginSegmentationRegeneration();

  render(<CavityAction sourcePartMesh={partMesh} />);

  const button = screen.getByRole("button", { name: "Segmentation regenerating…" });
  expect(button).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Create Cavity" })).toBeNull();

  // Matches existing product truth once the pending replan clears.
  act(() => {
    useSplitFaceStore.getState().endSegmentationRegeneration();
  });
  expect(screen.getByRole("button", { name: "Create Cavity" })).toBeEnabled();
});

it("supports the repeated create and rebuild cavity loop", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();

  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");

  expect(
    await useSplitFaceStore
      .getState()
      .createMoldParts("m", k1),
  ).toBe(true);

  render(<CavityAction sourcePartMesh={partMesh} />);

  expect(
    screen.queryByRole("button", {
      name: "Mold It",
    }),
  ).toBeNull();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Create Cavity",
    }),
  );

  await waitFor(() => {
    expect(
      screen.getByRole("button", {
        name: "Rebuild Cavity",
      }),
    ).toBeVisible();
  });

  expect(
    useSplitFaceStore.getState().cavity.status,
  ).toBe("complete");

  const firstResultBodies = useSplitFaceStore.getState().cavity.result!.bodies;

  fireEvent.click(
    screen.getByRole("button", {
      name: "Rebuild Cavity",
    }),
  );

  // Rebuild Cavity re-runs the same atomic action in place: no reset to cutting-plane edit mode,
  // no "Create Cavity"/"Mold It" reappearing, cutting planes untouched.
  expect(
    screen.queryByRole("button", {
      name: "Create Cavity",
    }),
  ).toBeNull();

  expect(
    screen.queryByRole("button", {
      name: "Mold It",
    }),
  ).toBeNull();

  expect(
    useSplitFaceStore.getState().workflow,
  ).toBe("partsReady");

  expect(
    useSplitFaceStore.getState().cuttingPlanes,
  ).toHaveLength(1);

  await waitFor(() => {
    expect(
      screen.getByRole("button", {
        name: "Rebuild Cavity",
      }),
    ).toBeVisible();
  });

  expect(
    useSplitFaceStore.getState().cavity.status,
  ).toBe("complete");

  expect(
    useSplitFaceStore.getState().cavity.result!.bodies.map((body) => body.id),
  ).toEqual(firstResultBodies.map((body) => body.id));
});

it("keeps the atomic pipeline in partsReady across a rebuild instead of resetting to cutting-plane edit mode", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();

  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(partMesh)).toBe(true);

  render(<CavityAction sourcePartMesh={partMesh} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Rebuild Cavity",
    }),
  );

  const duringRebuild = useSplitFaceStore.getState();

  expect(duringRebuild.workflow).toBe("partsReady");
  expect(duringRebuild.cuttingPlanes).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Create Cavity" })).toBeNull();

  await waitFor(() => {
    expect(useSplitFaceStore.getState().cavity.status).toBe("complete");
  });
});
