import { beforeEach, describe, expect, it } from "vitest";

import {
  resolveViewportTool,
  useViewportToolStore,
} from "./viewportTool.store";

describe("viewport tool store", () => {
  beforeEach(() => {
    useViewportToolStore.getState().resetActiveTool();
    useViewportToolStore.getState().setContext({ workflow: "planesReady", evaluationPhase: "complete", hasReferenceGeometry: true, hasCuttingPlanes: true });
  });

  it("starts with the pointer tool active", () => {
    expect(
      useViewportToolStore.getState().activeTool,
    ).toBe("pointer");
  });

  it("activates one viewport tool at a time", () => {
    useViewportToolStore
      .getState()
      .setActiveTool("eraser");

    expect(
      useViewportToolStore.getState().activeTool,
    ).toBe("eraser");

    useViewportToolStore.getState().setActiveTool("sprue");

    expect(
      useViewportToolStore.getState().activeTool,
    ).toBe("sprue");
  });

  it("rejects future tools but keeps a mutating tool active through its own evaluation", () => {
    useViewportToolStore.getState().setActiveTool("line");
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
    useViewportToolStore.getState().setActiveTool("sprue");
    useViewportToolStore.getState().setContext({ workflow: "partsReady", evaluationPhase: "evaluating", hasReferenceGeometry: true, hasCuttingPlanes: true });
    expect(useViewportToolStore.getState().activeTool).toBe("sprue");
    expect(useViewportToolStore.getState().isAvailable("sprue")).toBe(false);
    useViewportToolStore.getState().setContext({ workflow: "partsReady", evaluationPhase: "complete", hasReferenceGeometry: true, hasCuttingPlanes: true });
    expect(useViewportToolStore.getState().activeTool).toBe("sprue");
  });

  it("still deselects the active tool when its hard requirements are lost", () => {
    useViewportToolStore.getState().setActiveTool("sprue");
    useViewportToolStore.getState().setContext({ workflow: "modelReady", evaluationPhase: "idle", hasReferenceGeometry: false, hasCuttingPlanes: true });
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });

  it("returns to the pointer tool", () => {
    useViewportToolStore
      .getState()
      .setActiveTool("eraser");

    useViewportToolStore
      .getState()
      .resetActiveTool();

    expect(
      useViewportToolStore.getState().activeTool,
    ).toBe("pointer");
  });

  it("lets measurement temporarily override a toolbar tool", () => {
    expect(
      resolveViewportTool(
        "eraser",
        "measure-distance",
      ),
    ).toBe("measure-distance");
  });

  it("returns to the toolbar tool when measurement is inactive", () => {
    expect(
      resolveViewportTool(
        "eraser",
        "select",
      ),
    ).toBe("eraser");
  });
});

