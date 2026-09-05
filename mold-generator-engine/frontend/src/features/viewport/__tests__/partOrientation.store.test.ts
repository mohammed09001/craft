import { beforeEach, describe, expect, it } from "vitest";

import { useSplitFaceStore } from "@/features/mold-generation/split-face";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition";
import { useModelImportStore } from "@/features/viewport/modelImport.store";
import {
  composePartFlip,
  IDENTITY_PART_ORIENTATION,
  getPartOrientationCapability,
  usePartOrientationStore,
} from "@/features/viewport/partOrientation.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";

describe("part orientation engineering state", () => {
  beforeEach(() => {
    useSplitFaceStore.getState().clearForModelReplacement();
    useModelImportStore.getState().resetModelImportStatus();
    usePartOrientationStore.getState().resetForModelReplacement();
    useViewportToolStore.getState().resetActiveTool();
    useViewportToolStore.getState().setContext({
      workflow: "modelReady",
      evaluationPhase: "idle",
      hasReferenceGeometry: false,
      hasCuttingPlanes: false,
    });
  });

  it("is unavailable without an imported part", () => {
    expect(getPartOrientationCapability()).toEqual({
      available: false,
      reason: "Import a valid model before changing its orientation.",
    });
    expect(
      usePartOrientationStore
        .getState()
        .commitOrientation({ x: 0, y: 0, z: 1, w: 1 }),
    ).toBe(false);
  });

  it("normalizes and persists an approved orientation before mold generation", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });

    expect(
      usePartOrientationStore
        .getState()
        .commitOrientation({ x: 0, y: 0, z: 1, w: 1 }),
    ).toBe(true);
    const orientation = usePartOrientationStore.getState().orientation;
    expect(orientation.x).toBe(0);
    expect(orientation.y).toBe(0);
    expect(orientation.z).toBeCloseTo(Math.SQRT1_2);
    expect(orientation.w).toBeCloseTo(Math.SQRT1_2);

    expect(usePartOrientationStore.getState().resetOrientation()).toBe(true);
    expect(usePartOrientationStore.getState().orientation).toStrictEqual(
      IDENTITY_PART_ORIENTATION,
    );
  });

  it("composes exact canonical world-axis flip steps", () => {
    const left = composePartFlip(IDENTITY_PART_ORIENTATION, "left");
    expect(left.x).toBe(0);
    expect(left.y).toBeCloseTo(-Math.SQRT1_2);
    expect(left.z).toBe(0);
    expect(left.w).toBeCloseTo(Math.SQRT1_2);
    expect(composePartFlip(left, "right")).toEqual(
      IDENTITY_PART_ORIENTATION,
    );

    const forward = composePartFlip(IDENTITY_PART_ORIENTATION, "forward");
    expect(composePartFlip(forward, "backward")).toEqual(
      IDENTITY_PART_ORIENTATION,
    );
    expect(composePartFlip(IDENTITY_PART_ORIENTATION, "upside-down")).toEqual({
      x: 1,
      y: 0,
      z: 0,
      w: 0,
    });
  });

  it("pre-multiplies world-axis steps and snaps four quarter-turns to identity", () => {
    const backward = composePartFlip(
      IDENTITY_PART_ORIENTATION,
      "backward",
    );
    const worldRightAfterBackward = composePartFlip(backward, "right");
    expect(worldRightAfterBackward.x).toBeCloseTo(0.5);
    expect(worldRightAfterBackward.y).toBeCloseTo(0.5);
    expect(worldRightAfterBackward.z).toBeCloseTo(-0.5);
    expect(worldRightAfterBackward.w).toBeCloseTo(0.5);

    let orientation = IDENTITY_PART_ORIENTATION;
    for (let index = 0; index < 4; index += 1) {
      orientation = composePartFlip(orientation, "left");
    }
    expect(orientation).toEqual(IDENTITY_PART_ORIENTATION);
    expect(Math.hypot(
      orientation.x,
      orientation.y,
      orientation.z,
      orientation.w,
    )).toBe(1);
    expect(JSON.parse(JSON.stringify(orientation))).toEqual(
      IDENTITY_PART_ORIENTATION,
    );
  });

  it("commits one authoritative revision for one discrete flip", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });
    const revisionBefore = usePartOrientationStore.getState().revision;

    expect(
      usePartOrientationStore.getState().flipOrientation("right"),
    ).toBe(true);

    expect(usePartOrientationStore.getState().revision).toBe(
      revisionBefore + 1,
    );
  });

  it("centrally rejects mutation and programmatic activation after mold generation", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });
    useSplitFaceStore.setState({
      definition: {} as ReferenceMoldDefinition,
    });

    expect(getPartOrientationCapability().available).toBe(false);
    expect(getPartOrientationCapability().reason).toContain(
      "locked after mold generation",
    );
    expect(
      usePartOrientationStore
        .getState()
        .commitOrientation({ x: 1, y: 0, z: 0, w: 0 }),
    ).toBe(false);
    expect(
      usePartOrientationStore.getState().flipOrientation("left"),
    ).toBe(false);

    useViewportToolStore.getState().setActiveTool("orientation");
    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });

  it("deactivates orientation when generated geometry appears", () => {
    useModelImportStore
      .getState()
      .setModelImportStatus({ phase: "ready", fileName: "part.stl" });
    useViewportToolStore.getState().setActiveTool("orientation");
    expect(useViewportToolStore.getState().activeTool).toBe("orientation");

    useSplitFaceStore.setState({
      definition: {} as ReferenceMoldDefinition,
    });
    useViewportToolStore.getState().setContext({
      workflow: "partsReady",
      evaluationPhase: "complete",
      hasReferenceGeometry: true,
      hasCuttingPlanes: true,
    });

    expect(useViewportToolStore.getState().activeTool).toBe("pointer");
  });
});
