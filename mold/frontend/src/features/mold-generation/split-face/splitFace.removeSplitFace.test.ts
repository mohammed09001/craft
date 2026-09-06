import { beforeEach, describe, expect, it } from "vitest";

import { useSplitFaceStore } from "./splitFace.store";

describe("removeSplitFace", () => {
  beforeEach(() => {
    useSplitFaceStore.getState().clearForModelReplacement();
  });

  it("removes only the requested face and preserves the remaining cutting planes", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.toggleFace("back");

    expect(useSplitFaceStore.getState().selectedFaceIds).toEqual([
      "front",
      "back",
    ]);

    useSplitFaceStore.getState().removeSplitFace("front");

    const result = useSplitFaceStore.getState();

    expect(result.selectedFaceIds).toEqual(["back"]);
    expect(result.cuttingPlanes).toHaveLength(1);
    expect(result.cuttingPlanes[0]?.sourceFaceId).toBe("back");
    expect(result.workflow).toBe("planesReady");
    expect(result.definition).toBeNull();
    expect(result.cavity.status).toBe("unavailable");
    expect(result.activePlaneId).toBeNull();
  });

  it("returns to face selection when the final split face is removed", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("top");

    expect(useSplitFaceStore.getState().cuttingPlanes).toHaveLength(1);

    useSplitFaceStore.getState().removeSplitFace("top");

    const result = useSplitFaceStore.getState();

    expect(result.selectedFaceIds).toEqual([]);
    expect(result.cuttingPlanes).toEqual([]);
    expect(result.workflow).toBe("selectingFaces");
    expect(result.definition).toBeNull();
    expect(result.cavity.status).toBe("unavailable");
    expect(result.activePlaneId).toBeNull();
  });

  it("does nothing when the requested face is not part of the split", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("left");

    const before = useSplitFaceStore.getState();

    before.removeSplitFace("right");

    const after = useSplitFaceStore.getState();

    expect(after.selectedFaceIds).toEqual(["left"]);
    expect(after.cuttingPlanes).toHaveLength(1);
    expect(after.undoStack).toHaveLength(before.undoStack.length);
    expect(after.workflow).toBe("planesReady");
  });
});
