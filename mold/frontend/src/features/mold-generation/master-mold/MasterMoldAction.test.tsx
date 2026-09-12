import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CavityAction } from "../cavity-generation/CavityAction";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { useCuttingWorkflowStore } from "../cutting-workflow/cuttingWorkflow.store";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { designSprueProfile, type SpruePreviewPlacement } from "../sprue-generation";
import { MasterMoldAction } from "./MasterMoldAction";
import { useMasterMoldStore } from "./masterMold.store";

const validSpruePlacement = (x = 5): SpruePreviewPlacement => ({
  status: "valid",
  topPoint: { x, y: 5, z: 30 },
  cavityPoint: { x, y: 5, z: 20 },
  inwardDirection: { x: 0, y: 0, z: -1 },
  stemLengthMm: 10,
  profileDesign: designSprueProfile(null),
  coordinateSpace: "mold-local",
});

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

it("marks Master Mold stale (never current) the moment the final-mold document changes, without waiting for another click", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // Mold Scale change: an authoritative input to the final-mold target changes.
  useSplitFaceStore.getState().setClearanceMm(useSplitFaceStore.getState().clearanceMm + 5);

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });
  expect(useMasterMoldStore.getState().bodies.every((body) => body.status === "stale")).toBe(true);
  expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-pressed", "false");

  // Article 06: a non-interrupting, accessible ("status", not "alert") notice -- stale is not an error -- and the button describes it.
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent(/needs regeneration/i);
  expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-describedby", status.id);
});

it("shows an accessible alert with the blocked reason when a Master Mold part cannot be generated", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  render(<MasterMoldAction sourcePartMesh={partMesh} />);

  const blockedBody = {
    source: { finalMoldPartId: "a", finalMoldPartName: "Final Mold a", finalMoldGeometryVersion: "geom:a:1" },
    status: "blocked" as const,
    direction: null,
    directionAnalysis: { candidates: [], selected: null, feasible: false },
    mesh: null,
    bounds: null,
    volumeMm3: null,
    triangleCount: null,
    watertight: false,
    manifold: false,
    failureReason: "no_valid_open_direction" as const,
    failureMessage: "Final Mold a: no one-piece open-face Master Mold is feasible.",
    fingerprint: { finalMoldGeometryVersion: "geom:a:1", parametersSignature: "sig", directionOverride: null, value: "master-mold:x" },
  };
  act(() => {
    useMasterMoldStore.setState({ status: "blocked", bodies: [blockedBody] });
  });

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/no one-piece open-face Master Mold is feasible/);
  expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-describedby", alert.id);
});

it("reports which part failed for a partial multi-part failure, without implying the whole result is invalid", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  render(<MasterMoldAction sourcePartMesh={partMesh} />);

  const validBody = {
    source: { finalMoldPartId: "a", finalMoldPartName: "Final Mold a", finalMoldGeometryVersion: "geom:a:1" },
    status: "current" as const,
    direction: "+Z" as const,
    directionAnalysis: { candidates: [], selected: "+Z" as const, feasible: true },
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    volumeMm3: 1,
    triangleCount: 1,
    watertight: true,
    manifold: true,
    failureReason: null,
    failureMessage: null,
    fingerprint: { finalMoldGeometryVersion: "geom:a:1", parametersSignature: "sig", directionOverride: null, value: "master-mold:a" },
  };
  const blockedBody = {
    source: { finalMoldPartId: "b", finalMoldPartName: "Final Mold b", finalMoldGeometryVersion: "geom:b:1" },
    status: "blocked" as const,
    direction: null,
    directionAnalysis: { candidates: [], selected: null, feasible: false },
    mesh: null,
    bounds: null,
    volumeMm3: null,
    triangleCount: null,
    watertight: false,
    manifold: false,
    failureReason: "no_valid_open_direction" as const,
    failureMessage: "Final Mold b: no one-piece open-face Master Mold is feasible.",
    fingerprint: { finalMoldGeometryVersion: "geom:b:1", parametersSignature: "sig", directionOverride: null, value: "master-mold:b" },
  };
  act(() => {
    useMasterMoldStore.setState({ status: "blocked", bodies: [validBody, blockedBody] });
  });

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/1 of 2 Master Mold part\(s\) could not be generated; the rest remain valid/);
  expect(alert).toHaveTextContent(/Final Mold b/);
});

it("never shows Master Mold as current again after Undo, even when Undo restores the exact revision it was generated from -- an explicit regenerate is required, and reuses cheaply", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  useSplitFaceStore.getState().setClearanceMm(useSplitFaceStore.getState().clearanceMm + 5);
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });

  useSplitFaceStore.getState().undo();

  // Conservative by design (Article 01/05): Undo restoring the same document
  // revision Master Mold was built from does not silently flip it back to
  // "current" on its own -- it stays "stale" until an explicit regenerate
  // re-validates it, so a truthful "current" is never shown without proof.
  expect(useMasterMoldStore.getState().status).toBe("stale");

  const run = vi.mocked((await import("./masterMoldGeneration.workerClient")).runMasterMoldGenerationInWorker);
  const callsBefore = run.mock.calls.length;

  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // The regenerate was cheap: per-part geometry fingerprints matched exactly, so it reused rather than re-ran the Worker.
  expect(run.mock.calls.length).toBe(callsBefore);
});

it("fully resets Master Mold (not merely stale) once the workflow leaves partsReady, e.g. on model replacement", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  useSplitFaceStore.getState().clearForModelReplacement();

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("unavailable");
  });
  expect(useMasterMoldStore.getState().bodies).toHaveLength(0);
});

it("survives merely reopening (and cancelling out of) the Constructed Cutting Plan session without any edit", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });
  const bodiesBefore = useMasterMoldStore.getState().bodies;

  // Opening the session activates Cut by Face's own selection workflow
  // (leaving "partsReady") without touching `definition` -- merely looking,
  // then Cancelling, must not destroy an already-valid Master Mold result
  // (Article 05: switching tools/sessions must not corrupt either result).
  act(() => {
    useCuttingWorkflowStore.getState().openSession();
  });
  expect(screen.queryByRole("button", { name: "Master Mold" })).toBeNull();
  expect(useMasterMoldStore.getState().status).toBe("current");

  act(() => {
    useCuttingWorkflowStore.getState().cancelSession();
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Master Mold" })).toBeInTheDocument();
  });
  expect(useMasterMoldStore.getState().status).toBe("current");
  expect(useMasterMoldStore.getState().bodies).toBe(bodiesBefore);
});

it("fully resets Master Mold on a real Cut by Face edit (toggleFace), which invalidates the committed final-mold basis itself", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  act(() => {
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("back");
  });

  expect(useSplitFaceStore.getState().definition).toBeNull();
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("unavailable");
  });
  expect(useMasterMoldStore.getState().bodies).toHaveLength(0);
});

it("marks Master Mold stale (not a full reset) when a committed Segmentation result replaces the final-mold definition", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  const before = useSplitFaceStore.getState();
  act(() => {
    useSplitFaceStore.getState().adoptCommittedSegmentationResult({
      sourceSignature: partMesh.sourceSignature,
      sourceDefinition: before.definition!,
      bodies: before.lastCommittedResult!.bodies,
      warnings: [],
    });
  });

  // `definition` is replaced (segmentation-derived), never nulled -- this is
  // the general "upstream input changed" case (stale), not the stronger
  // "no final-mold basis at all" reset that a Cut by Face edit triggers.
  expect(useSplitFaceStore.getState().definition).not.toBeNull();
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });
  expect(useMasterMoldStore.getState().bodies.length).toBeGreaterThan(0);
});

it("marks Master Mold stale when the user adds a real Sprue (Article 04: Master Mold reproduces current Sprue geometry, it does not own an independent copy)", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });
  const geometryVersionsBefore = useMasterMoldStore.getState().bodies.map((body) => body.source.finalMoldGeometryVersion);

  await act(async () => {
    expect(await useSplitFaceStore.getState().createSprue(validSpruePlacement())).toBe(true);
  });

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });

  // Regenerating picks up the real Sprue geometry through the one shared
  // final-mold-target pipeline (synthesizeFinalMoldTarget), not a Master
  // Mold-specific copy: the target actually carries the sprue channel now,
  // so at least one part's real geometry version changes (it may even make
  // that part's one-piece pull infeasible -- a genuine geometric outcome of
  // reproducing the real sprue, not a bug). It must never come back "stale".
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(["current", "blocked"]).toContain(useMasterMoldStore.getState().status);
  });
  const geometryVersionsAfter = useMasterMoldStore.getState().bodies.map((body) => body.source.finalMoldGeometryVersion);
  expect(geometryVersionsAfter).not.toEqual(geometryVersionsBefore);
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
