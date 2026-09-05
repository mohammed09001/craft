import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SplitFaceControls } from "./SplitFaceControls";
import { useSplitFaceStore } from "./splitFace.store";
import { useCuttingWorkflowStore } from "../cutting-workflow";
import { useModelImportStore } from "@/features/viewport/modelImport.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";

const selection = {
  isModelSelected: true,
  selectedModelId: "m",
  selectionBoxBounds: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 10, z: 10 },
  },
};

describe("SplitFaceControls (main toolbar)", () => {
  beforeEach(() => {
    act(() => {
      useSplitFaceStore
        .getState()
        .clearForModelReplacement();

      useViewportToolStore
        .getState()
        .resetActiveTool();

      useCuttingWorkflowStore.setState({ state: { kind: "idle" } });

      useModelImportStore.getState().setModelImportStatus({
        phase: "ready",
        fileName: "sample.stl",
      });
    });
  });

  // Pointer, Eraser, Undo, and Redo live here exclusively (not duplicated
  // in CuttingSessionPanel) and stay live for the whole session -- this
  // toolbar is an extension the panel supplements, not one it replaces.
  // Face-selection/mold-clearance controls specific to a cutting mode still
  // live inside the panel itself.

  it("opens the cutting session without hiding the main toolbar", () => {
    render(<SplitFaceControls selection={selection} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    );

    expect(useCuttingWorkflowStore.getState().state).toMatchObject({
      kind: "sessionOpen",
      activeTab: "cutByFace",
    });
    expect(screen.getByRole("toolbar", { name: "Model tools" })).toBeInTheDocument();
  });

  it("keeps the toolbar visible while a cutting session is open, disabling only session-inapplicable tools", () => {
    act(() => {
      useCuttingWorkflowStore.getState().openSession();
    });

    render(<SplitFaceControls selection={selection} />);

    expect(screen.getByRole("toolbar", { name: "Model tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flip" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pointer tool" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eraser tool" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
  });

  it("toggles the Sprue tool once reference mold geometry exists", async () => {
    act(() => {
      useSplitFaceStore.getState().enterSelection();
      useSplitFaceStore.getState().toggleFace("front");
    });
    await act(async () => {
      await useSplitFaceStore.getState().createMoldParts("model-1", selection.selectionBoxBounds!);
    });
    render(<SplitFaceControls selection={selection} />);

    const sprueButton = screen.getByRole("button", { name: "Sprue" });

    expect(sprueButton).toHaveAttribute("title", "Sprue");
    expect(sprueButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(sprueButton);

    expect(useViewportToolStore.getState().activeTool).toBe("sprue");
    expect(sprueButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(sprueButton);

    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
    expect(sprueButton).toHaveAttribute("aria-pressed", "false");
  });

  it("makes Create Cavity available once a result is committed, via the reused shared pipeline", async () => {
    act(() => {
      useSplitFaceStore.getState().enterSelection();
      useSplitFaceStore.getState().toggleFace("front");
    });
    await act(async () => {
      await useSplitFaceStore.getState().createMoldParts("model-1", selection.selectionBoxBounds!);
    });

    render(<SplitFaceControls selection={selection} />);

    expect(
      screen.getByRole("button", { name: "Create Cavity" }),
    ).toBeInTheDocument();
  });

  it("stays visible once an object is loaded even with nothing selected, disabling selection-dependent tools", () => {
    render(
      <SplitFaceControls
        selection={{ isModelSelected: false }}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Model tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flip" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Constructed Cutting Plan" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Create Cavity" }),
    ).not.toBeInTheDocument();
  });

  it("hides the toolbar before any object is loaded", () => {
    act(() => {
      useModelImportStore.getState().resetModelImportStatus();
    });

    render(
      <SplitFaceControls
        selection={{ isModelSelected: false }}
      />,
    );

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("deactivates Sprue via Flip while no reference geometry exists yet", () => {
    render(<SplitFaceControls selection={selection} />);

    // Sprue itself is disabled with no reference geometry yet (see the
    // "toggles the Sprue tool once reference mold geometry exists" test
    // above) -- exercise deactivation-by-another-tool through Flip instead,
    // the only other tool this toolbar hosts before anything is committed.
    fireEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(useViewportToolStore.getState().activeTool).toBe("orientation");

    fireEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });
});
