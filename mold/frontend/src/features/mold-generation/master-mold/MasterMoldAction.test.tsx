import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CavityAction } from "../cavity-generation/CavityAction";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { useCuttingWorkflowStore } from "../cutting-workflow/cuttingWorkflow.store";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { designSprueProfile, type SpruePreviewPlacement } from "../sprue-generation";
import { MasterMoldAction } from "./MasterMoldAction";
import { useMasterMoldStore } from "./masterMold.store";
import { buildMasterMoldProjectSnapshot } from "./masterMoldSnapshot";
import { castTargetInputVersion } from "./engine/castTarget";

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

// Engine-faithful Worker fake: deterministic current tooling sets keyed on
// the snapshot's own input signatures, so the store's Article 13 reuse and
// the action's granular staleness behave exactly as with the real engine.
vi.mock(
  "./masterMoldGeneration.workerClient",
  () => ({
    cancelActiveMasterMoldGeneration: vi.fn(),
    runMasterMoldGenerationInWorker: vi.fn(async (request: import("./masterMold.contracts").MasterMoldRequest) => {
      const { castTargetInputVersion: inputVersion } = await import("./engine/castTarget");
      return {
        operationId: request.operationId,
        generationVersion: request.generationVersion,
        elapsedMs: 1,
        sets: request.snapshot.committedMoldParts.map((part) => {
          const sourceSignature = inputVersion(request.snapshot, part);
          return {
            moldPartId: part.id,
            moldPartName: part.name,
            status: "current" as const,
            sourceSignature,
            contentVersion: `ct:${part.geometryVersion}`,
            set: {
              moldPartId: part.id,
              moldPartName: part.name,
              castTargetVersion: `ct:${part.geometryVersion}`,
              sourceSignature,
              pourFaceDecision: { selected: "+Z", castingOrientation: "+Z", score: 1, candidates: [], fillabilityWarnings: [] },
              accessibility: { directions: [], onePieceReleaseFeasible: true },
              releaseMode: "one-piece" as const,
              partingSurfaces: [],
              assembly: { pieces: [], registrationFeatures: [], releaseSequence: [] },
              warnings: [],
              fingerprint: `set:${part.id}:${part.geometryVersion}`,
            },
            failureMessage: null,
          };
        }),
      };
    }),
  }),
);

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
  useMasterMoldStore.setState({ status: "unavailable", generationVersion: 0, sets: [], progress: 0, lastError: null, sourceDocumentIdentity: null });
});

async function reachPartsReadyWithCommittedCavity(face: "front" | "top" = "front") {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace(face);
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(partMesh)).toBe(true);
  return partMesh;
}

it("is not rendered before a committed cutting result exists", () => {
  render(<MasterMoldAction sourcePartMesh={canonicalCube("m", k1)} />);
  expect(screen.queryByRole("button", { name: "Master Mold" })).toBeNull();
});

it("generates Master tooling sets for every committed mold part", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  const committedBodies = useSplitFaceStore.getState().lastCommittedResult!.bodies;

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  const sets = useMasterMoldStore.getState().sets;
  expect(sets.map((entry) => entry.moldPartId).sort()).toEqual(committedBodies.map((body) => body.id).sort());
  expect(sets.every((entry) => entry.status === "current" && entry.set !== null)).toBe(true);
});

it("Article 09: a rapid duplicate click before the button disables never corrupts the final result", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  const committedBodies = useSplitFaceStore.getState().lastCommittedResult!.bodies;

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  const button = screen.getByRole("button", { name: "Master Mold" });
  fireEvent.click(button);
  fireEvent.click(button);

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  const state = useMasterMoldStore.getState();
  expect(state.sets).toHaveLength(committedBodies.length);
  expect(state.sets.every((entry) => entry.status === "current")).toBe(true);
  expect(new Set(state.sets.map((entry) => entry.moldPartId)).size).toBe(state.sets.length);
});

it("generates from the committed stock without requiring the user to press Create Cavity first", async () => {
  const partMesh = canonicalCube("m", k1);
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(partMesh.sourceSignature);
  state.enterSelection();
  state.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);

  expect(useSplitFaceStore.getState().cavity.status).not.toBe("complete");

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  expect(useMasterMoldStore.getState().sets.length).toBeGreaterThan(0);
  // Master Mold's own generation never touched Create Cavity's state.
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

it("marks Master Mold stale (never current) the moment the project document changes, without waiting for another click", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // Mold Scale change: an authoritative project input changes.
  act(() => {
    useSplitFaceStore.getState().setClearanceMm(useSplitFaceStore.getState().clearanceMm + 5);
  });

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });
  expect(useMasterMoldStore.getState().sets.every((entry) => entry.status === "stale")).toBe(true);
  expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-pressed", "false");

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent(/needs regeneration/i);
  expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-describedby", status.id);
});

it("Article 04: marks Master Mold stale (never falsely current) when a new mold part appears that has no Master tooling set yet", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity("top");
  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // A new committed STOCK part appears (the snapshot's committed parts are
  // the stock bodies): Master Mold has no set for it yet.
  const beforeState = useSplitFaceStore.getState();
  const newStockBody = {
    ...beforeState.definition!.moldBodies![0]!,
    id: "brand-new-stock-part",
    name: "Brand New Stock Part",
  };
  act(() => {
    useSplitFaceStore.setState((s) => ({
      ...s,
      document: { ...s.document, revision: s.document.revision + 1, fingerprint: `${s.document.fingerprint}-added-part` },
      definition: {
        ...beforeState.definition!,
        moldBodies: [...beforeState.definition!.moldBodies!, newStockBody],
      },
    }));
  });

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });
  expect(useMasterMoldStore.getState().sets.every((entry) => entry.status === "stale")).toBe(true);
});

it("shows an accessible alert with the blocked reason when a Master tooling set cannot be generated", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  render(<MasterMoldAction sourcePartMesh={partMesh} />);

  act(() => {
    useMasterMoldStore.setState({
      status: "blocked",
      sets: [{
        moldPartId: "a",
        moldPartName: "Mold a",
        status: "blocked",
        sourceSignature: "",
        contentVersion: "",
        set: null,
        failureMessage: "Mold a: no verified reusable tooling plan.",
      }],
    });
  });

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/no verified reusable tooling plan/);
  expect(screen.getByRole("button", { name: "Master Mold" })).toHaveAttribute("aria-describedby", alert.id);
});

it("reports which part failed for a partial multi-part failure, without implying the whole result is invalid", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();
  render(<MasterMoldAction sourcePartMesh={partMesh} />);

  act(() => {
    useMasterMoldStore.setState({
      status: "blocked",
      sets: [
        { moldPartId: "a", moldPartName: "Mold a", status: "current", sourceSignature: "s:a", contentVersion: "c:a", set: null, failureMessage: null },
        { moldPartId: "b", moldPartName: "Mold b", status: "blocked", sourceSignature: "", contentVersion: "", set: null, failureMessage: "Mold b: no verified reusable tooling plan." },
      ],
    });
  });

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/1 of 2 Master Mold part\(s\) could not be generated; the rest remain valid/);
  expect(alert).toHaveTextContent(/Mold b/);
});

it("never shows Master Mold as current again after Undo, even when Undo restores the exact revision it was generated from -- an explicit regenerate is required, and reuses cheaply", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  act(() => {
    useSplitFaceStore.getState().setClearanceMm(useSplitFaceStore.getState().clearanceMm + 5);
  });
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });

  act(() => {
    useSplitFaceStore.getState().undo();
  });

  // Conservative by design (Article 12): Undo restoring the same document
  // revision Master Mold was built from does not silently flip it back to
  // "current" on its own -- it stays "stale" until an explicit regenerate
  // re-validates it.
  expect(useMasterMoldStore.getState().status).toBe("stale");

  const run = vi.mocked((await import("./masterMoldGeneration.workerClient")).runMasterMoldGenerationInWorker);
  const callsBefore = run.mock.calls.length;

  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // The regenerate was cheap: per-part input signatures matched exactly, so
  // the store revived the sets without re-running the Worker.
  expect(run.mock.calls.length).toBe(callsBefore);
});

it("fully resets Master Mold (not merely stale) once the workflow leaves partsReady, e.g. on model replacement", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  act(() => {
    useSplitFaceStore.getState().clearForModelReplacement();
  });

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("unavailable");
  });
  expect(useMasterMoldStore.getState().sets).toHaveLength(0);
});

it("survives merely reopening (and cancelling out of) the Constructed Cutting Plan session without any edit", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });
  const setsBefore = useMasterMoldStore.getState().sets;

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
  expect(useMasterMoldStore.getState().sets).toBe(setsBefore);
});

it("fully resets Master Mold on a real Cut by Face edit (toggleFace), which invalidates the committed mold-part basis itself", async () => {
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
  expect(useMasterMoldStore.getState().sets).toHaveLength(0);
});

it("marks Master Mold stale (not a full reset) when a committed Segmentation result replaces the mold definition", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity();

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  const before = useSplitFaceStore.getState();
  const resegmentedBodies = before.lastCommittedResult!.bodies.map((body) => ({
    ...body,
    mesh: { ...body.mesh, positions: body.mesh.positions.map((value, index) => (index === 0 ? value + 0.5 : value)) },
  }));
  act(() => {
    useSplitFaceStore.getState().adoptCommittedSegmentationResult({
      sourceSignature: partMesh.sourceSignature,
      sourceDefinition: before.definition!,
      bodies: resegmentedBodies,
      warnings: [],
    });
  });

  expect(useSplitFaceStore.getState().definition).not.toBeNull();
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });
  expect(useMasterMoldStore.getState().sets.length).toBeGreaterThan(0);
});

it("marks Master Mold stale when the user adds a real Sprue, then regenerates to a usable current result whose inputs changed (Article 04/05)", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity("top");

  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });
  const signaturesBefore = useMasterMoldStore.getState().sets.map((entry) => entry.sourceSignature);

  await act(async () => {
    expect(await useSplitFaceStore.getState().createSprue(validSpruePlacement())).toBe(true);
  });

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });

  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });
  const signaturesAfter = useMasterMoldStore.getState().sets.map((entry) => entry.sourceSignature);
  // The Sprue intent is part of every part's cast-target inputs: after
  // regeneration every set's provenance reflects it (Article 06).
  expect(signaturesAfter).not.toEqual(signaturesBefore);
});

it("Article 07: a stock edit marks only the Master tooling set whose own committed stock actually changed stale, leaving unaffected siblings current", async () => {
  const partMesh = await reachPartsReadyWithCommittedCavity("top");
  render(<MasterMoldAction sourcePartMesh={partMesh} />);
  fireEvent.click(screen.getByRole("button", { name: "Master Mold" }));
  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("current");
  });

  // Resegmentation commits new stock bodies: one body's mesh genuinely
  // changes, its sibling's does not (same body replayed verbatim).
  const before = useSplitFaceStore.getState();
  const resegmentedBodies = before.definition!.moldBodies!.map((body, index) =>
    index === 0
      ? { ...body, mesh: { ...body.mesh, positions: body.mesh.positions.map((value, positionIndex) => (positionIndex === 0 ? value + 0.5 : value)) } }
      : body,
  );
  act(() => {
    useSplitFaceStore.getState().adoptCommittedSegmentationResult({
      sourceSignature: partMesh.sourceSignature,
      sourceDefinition: before.definition!,
      bodies: resegmentedBodies,
      warnings: [],
    });
  });

  await waitFor(() => {
    expect(useMasterMoldStore.getState().status).toBe("stale");
  });

  // Ground truth: rebuild the fresh snapshot exactly like the action does
  // and compare each part's cast-target input signature against the stored
  // one -- independent of Master Mold's own `stale` flag, so this isn't
  // circular.
  const state = useSplitFaceStore.getState();
  const freshSnapshot = buildMasterMoldProjectSnapshot({
    sourcePartMesh: partMesh,
    definition: state.definition!,
    cuttingPlanes: state.cuttingPlanes,
    sprueDefinitions: state.sprueDefinitions,
    printerBuildVolume: null,
    projectRevision: state.document.revision,
    projectFingerprint: state.document.fingerprint,
  });
  const after = useMasterMoldStore.getState().sets;
  const actuallyChangedPartIds = new Set(
    freshSnapshot.committedMoldParts
      .filter((part) => {
        const entry = after.find((candidate) => candidate.moldPartId === part.id);
        return entry !== undefined && entry.sourceSignature !== castTargetInputVersion(freshSnapshot, part);
      })
      .map((part) => part.id),
  );
  expect(actuallyChangedPartIds.size).toBeGreaterThan(0);

  for (const entry of after) {
    const changed = actuallyChangedPartIds.has(entry.moldPartId);
    expect(entry.status, `part ${entry.moldPartId} (changed=${changed}) has unexpected status`).toBe(changed ? "stale" : "current");
  }
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

it("never activates Create Cavity as a side effect of generating Master tooling", async () => {
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

  expect(screen.getByRole("button", { name: "Create Cavity" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Rebuild Cavity" })).toBeNull();
  expect(useSplitFaceStore.getState().cavity.status).not.toBe("complete");
  expect(useSplitFaceStore.getState().cavity.status).not.toBe("generating");
});
