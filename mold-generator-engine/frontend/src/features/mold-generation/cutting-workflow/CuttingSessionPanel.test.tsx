import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";

import { useSegmentationModeStore } from "../segmentation/segmentationMode.store";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { CuttingSessionPanel } from "./CuttingSessionPanel";
import { useAutomaticDraftStore, useCuttingWorkflowStore, useManualDraftStore } from "./cuttingWorkflow.store";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const K1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const canonicalPartGeometry: CanonicalPartGeometry = {
  modelId: "model-1",
  geometryVersion: "v1",
  units: "millimeters",
  upAxis: "Z",
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
  transform: IDENTITY,
  localBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
  winding: "source",
  validationStatus: "captured",
  sourceSignature: "sig",
};

function setModelBounds(size: { x: number; y: number; z: number }) {
  const geometry: CanonicalPartGeometry = { ...canonicalPartGeometry, localBounds: { min: { x: 0, y: 0, z: 0 }, max: size } };
  useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(geometry);
}

function renderPanel() {
  return render(
    <CuttingSessionPanel
      canonicalPartGeometry={canonicalPartGeometry}
      modelId="model-1"
      selectionBoxBounds={K1}
    />,
  );
}

beforeEach(() => {
  useCuttingWorkflowStore.setState({
    state: { kind: "idle" },
    lastMoreMoldsProvenance: null,
    lastReopenBlockedReason: null,
    lastCommitBlockedReason: null,
  });
  useSegmentationModeStore.getState().resetStrategy();
  useAutomaticDraftStore.getState().resetStrategy();
  useManualDraftStore.getState().clearForModelReplacement();
  useSplitFaceStore.getState().clearForModelReplacement();
  usePrinterBuildVolumeStore.getState().setPrinterBuildVolume({ x: 100, y: 100, z: 100 });
  setModelBounds({ x: 150, y: 50, z: 50 }); // oversized only on X
});

describe("CuttingSessionPanel", () => {
  it("renders nothing while idle", () => {
    renderPanel();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("renders the three tabs, defaulting to Cut by Face", () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    renderPanel();

    expect(
      screen.getByRole("tab", { name: "Cutting by Face", selected: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Segmentation as One Mold", selected: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Segmentation as More Molds", selected: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(useSplitFaceStore.getState().workflow).toBe("selectingFaces");
  });

  it("switches tabs on click, each showing its own tab-specific controls", async () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByLabelText("Cutting")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Segmentation as One Mold" }));
    expect(screen.getByLabelText("Extension axis")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Segmentation as More Molds" }));
    expect(screen.getByLabelText("Strategy")).toBeInTheDocument();
  });

  it("Done is disabled on Cut by Face with no cutting planes, enabled once one exists", async () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    act(() => {
      useSplitFaceStore.getState().toggleFace("front");
    });

    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    void user;
  });

  it("Done commits Cut by Face and closes the panel", async () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();
    act(() => {
      useSplitFaceStore.getState().toggleFace("front");
    });

    await user.click(screen.getByRole("button", { name: "Done" }));

    // See the One Mold "real accept -> execute -> promote chain" test below
    // for why this polls rather than asserting immediately after the click.
    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  });

  it("Done commits the One Mold tab's real accept -> execute -> promote chain", async () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("tab", { name: "Segmentation as One Mold" }));

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeEnabled();
    await user.click(doneButton);

    // The real accept -> execute -> promote chain's async tail
    // (executeAcceptedPlan) may settle after more macrotask ticks than a
    // single userEvent.click's own act() flush covers -- waitFor polls
    // until it actually lands, rather than asserting on a race.
    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });
    expect(useSegmentationModeStore.getState().phase).toBe("valid");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  });

  it("Done commits the More Molds tab (Automatic)", async () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("tab", { name: "Segmentation as More Molds" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await user.click(screen.getByRole("button", { name: "Done" }));

    // See the One Mold "real accept -> execute -> promote chain" test above
    // for why this polls rather than asserting immediately after the click.
    await waitFor(() => {
      expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    });
    expect(useCuttingWorkflowStore.getState().lastMoreMoldsProvenance?.producedBy).toBe("automatic");
    expect(useSplitFaceStore.getState().workflow).toBe("partsReady");
  });

  it("Cancel discards all in-progress work and restores the pre-session singleton", async () => {
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    const preSessionPlanes = useSplitFaceStore.getState().cuttingPlanes;

    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("tab", { name: "Segmentation as One Mold" }));
    expect(useSegmentationModeStore.getState().mode).toBe("make-as-one-mold");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(useCuttingWorkflowStore.getState().state).toEqual({ kind: "idle" });
    expect(useSegmentationModeStore.getState().mode).toBeNull();
    expect(useSplitFaceStore.getState().cuttingPlanes).toEqual(preSessionPlanes);
  });

  it("shows a commit-blocked reason instead of closing when a commit fails", async () => {
    act(() => useCuttingWorkflowStore.getState().openSession());
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("tab", { name: "Segmentation as More Molds" }));
    await user.click(screen.getByRole("button", { name: "Manual" }));

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(useCuttingWorkflowStore.getState().state).toMatchObject({ commitPhase: "editing" });
    expect(screen.getByRole("alert")).toHaveTextContent(/at least one cutting plane/i);
  });
});
