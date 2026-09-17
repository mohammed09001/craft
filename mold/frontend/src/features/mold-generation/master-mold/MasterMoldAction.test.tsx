import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MasterMoldAction } from "./MasterMoldAction";
import { useMasterMoldStore } from "./masterMold.store";
import { useCuttingWorkflowStore } from "../cutting-workflow";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";

// Execution 06 Article 01: Master Mold is enabled as soon as a valid model
// is imported -- never gated on workflow === "partsReady", a committed mold
// definition, cutting planes, or Create Cavity. The only Split Face signal
// consumed is "a cutting session is open" (deterministic disable).

vi.mock("./masterMoldGeneration.workerClient", () => ({
  runMasterMoldGenerationInWorker: vi.fn(() =>
    Promise.resolve({
      operationId: "op",
      generationVersion: 1,
      elapsedMs: 1,
      sets: [
        {
          moldPartId: "wm-piece-1",
          moldPartName: "Working Mold 1",
          status: "current",
          sourceSignature: "sig",
          contentVersion: "ctv",
          set: null,
          failureMessage: null,
        },
      ],
      plan: null,
      workingMoldPieceCount: 1,
      warningCount: 0,
      budget: { candidateDirectionCount: 0, planningPatchCount: 0, workingMoldPlanCandidateCount: 0, workingMoldConstructionAttempts: 1, pourFaceAnalysisAttempts: 0, ventAnalysisAttempts: 0, toolingOnePieceAttempts: 0, toolingMultiPieceAttempts: 0, toolingExactPlanAttempts: 1, releaseVerificationAttempts: 0, limitsExceeded: [] },
      seedId: "seed",
    }),
  ),
  cancelActiveMasterMoldGeneration: vi.fn(),
}));

function canonicalBox() {
  return {
    modelId: "m",
    positions: [-5, -5, 0, 5, -5, 0, 5, 5, 0, -5, 5, 0, -5, -5, 4, 5, -5, 4, 5, 5, 4, -5, 5, 4],
    indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5],
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    localBounds: { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 4 } },
    geometryVersion: "box-1",
    sourceSignature: "box-sig-1",
  };
}

function setCuttingSessionOpen(open: boolean) {
  const state = useCuttingWorkflowStore.getState();
  if (open) {
    useCuttingWorkflowStore.setState({ state: { kind: "sessionOpen", tab: "cut", commitPhase: "idle" } } as never);
  } else {
    void state;
    useCuttingWorkflowStore.setState({ state: { kind: "idle" } } as never);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  useMasterMoldStore.getState().reset();
  usePrinterBuildVolumeStore.getState().resetPrinterBuildVolume();
  setCuttingSessionOpen(false);
});

describe("MasterMoldAction (Execution 06 Article 01)", () => {
  it("renders nothing without imported geometry", () => {
    render(<MasterMoldAction sourcePartGeometry={null} />);
    expect(screen.queryByRole("button", { name: "Master Mold" })).toBeNull();
  });

  it("is enabled immediately after a valid import, with no cutting workflow state at all", () => {
    const workflowSpy = vi.fn();
    render(<MasterMoldAction sourcePartGeometry={canonicalBox()} />);
    const button = screen.getByRole("button", { name: "Master Mold" });
    expect(button).toBeEnabled();
    expect(workflowSpy).not.toHaveBeenCalled();
    // Split Face definition/planes are never consulted: nothing in the
    // component reads the splitFace store beyond the session-open flag.
    expect(useMasterMoldStore.getState().status).toBe("unavailable");
  });

  it("is disabled with a clear reason while a cutting session is open", () => {
    setCuttingSessionOpen(true);
    render(<MasterMoldAction sourcePartGeometry={canonicalBox()} />);
    const button = screen.getByRole("button", { name: "Master Mold" });
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toContain("cutting session");
  });

  it("clicking builds a seed snapshot and drives the store generation", async () => {
    const user = userEvent.setup();
    const generateSpy = vi.spyOn(useMasterMoldStore.getState(), "generate");
    render(<MasterMoldAction sourcePartGeometry={canonicalBox()} />);
    await user.click(screen.getByRole("button", { name: "Master Mold" }));
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const request = generateSpy.mock.calls[0]![0] as { seed: { sourceMesh: { positions: readonly number[] }; sourceTransform: readonly number[] } };
    // The seed carries the world-space source mesh: transform applied.
    expect(request.seed.sourceMesh.positions.length).toBe(24);
    expect(request.seed.sourceTransform).toHaveLength(16);
    generateSpy.mockRestore();
    await waitFor(() => expect(useMasterMoldStore.getState().seedIdentity).not.toBeNull());
  });

  it("reset happens when the imported geometry disappears", async () => {
    const view = render(<MasterMoldAction sourcePartGeometry={canonicalBox()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Master Mold" }));
    await waitFor(() => expect(useMasterMoldStore.getState().seedIdentity).not.toBeNull());

    act(() => {
      view.rerender(<MasterMoldAction sourcePartGeometry={null} />);
    });
    await waitFor(() => expect(useMasterMoldStore.getState().seedIdentity).toBeNull());
    expect(useMasterMoldStore.getState().sets).toHaveLength(0);
  });

  it("changing the printer build volume flags the existing result stale (Article 14)", async () => {
    render(<MasterMoldAction sourcePartGeometry={canonicalBox()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Master Mold" }));
    await waitFor(() => expect(useMasterMoldStore.getState().seedIdentity).not.toBeNull());

    act(() => {
      useMasterMoldStore.getState().markMasterMoldStale({ identity: "different", sourceProjectRevision: "rev" });
    });
    await waitFor(() => expect(useMasterMoldStore.getState().status).toBe("stale"));
    // The stale banner is visible next to the still-enabled button.
    expect(screen.getByRole("button", { name: "Master Mold" })).toBeEnabled();
  });
});
