import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition";
import {
  SplitFaceControls,
  useSplitFaceStore,
} from "@/features/mold-generation/split-face";
import { useModelImportStore } from "@/features/viewport/modelImport.store";
import { usePartOrientationStore } from "@/features/viewport/partOrientation.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";

const noSelection = { isModelSelected: false } as const;

describe("Flip toolbar lifecycle", () => {
  beforeEach(() => {
    useSplitFaceStore.getState().clearForModelReplacement();
    useModelImportStore.getState().resetModelImportStatus();
    usePartOrientationStore.getState().resetForModelReplacement();
    useViewportToolStore.getState().resetActiveTool();
  });

  it("is absent until a valid part has been imported", () => {
    render(<SplitFaceControls selection={noSelection} />);
    expect(
      screen.queryByRole("button", { name: "Flip" }),
    ).not.toBeInTheDocument();
  });

  it("is available after import and toggles back to the pointer tool", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });
    render(<SplitFaceControls selection={noSelection} />);

    const button = screen.getByRole("button", { name: "Flip" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute(
      "title",
      "Use arrow keys to flip the part.",
    );
    expect(screen.getAllByRole("button", { name: "Flip" })).toHaveLength(1);

    fireEvent.click(button);
    expect(useViewportToolStore.getState().activeTool).toBe("orientation");
    expect(
      screen.queryByRole("group", { name: "Flip actions" }),
    ).not.toBeInTheDocument();
    for (const name of [
      "Flip Left",
      "Flip Right",
      "Flip Forward",
      "Flip Backward",
      "Flip Upside Down",
      "Reset Flip",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }

    fireEvent.click(button);
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });

  it("remains visible with a clear disabled explanation after mold generation", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });
    render(<SplitFaceControls selection={noSelection} />);

    act(() => {
      useSplitFaceStore.setState({
        definition: {} as ReferenceMoldDefinition,
      });
    });

    const button = screen.getByRole("button", { name: "Flip" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      expect.stringContaining("locked after mold generation"),
    );
  });

  it("exits when another registered interaction tool is selected", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });
    useViewportToolStore.getState().setActiveTool("orientation");

    useViewportToolStore.getState().setActiveTool("measure-distance");

    expect(useViewportToolStore.getState().activeTool).toBe("measure-distance");
  });
});
