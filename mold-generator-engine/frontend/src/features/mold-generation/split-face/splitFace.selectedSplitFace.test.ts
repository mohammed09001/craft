import { beforeEach, describe, expect, it } from "vitest";

import { useSplitFaceStore } from "./splitFace.store";

describe("selected split face", () => {
  beforeEach(() => {
    useSplitFaceStore.getState().clearForModelReplacement();
  });

  it("automatically selects the newest cutting face", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("front");

    useSplitFaceStore.getState().toggleFace("top");

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("top");
  });

  it("selects only faces that own cutting planes", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("left");

    store.selectSplitFace("right");

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("left");

    useSplitFaceStore.getState().toggleFace("right");
    useSplitFaceStore.getState().selectSplitFace("left");

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("left");
  });

  it("moves selection to a remaining face after deletion", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.toggleFace("back");

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("back");

    useSplitFaceStore.getState().removeSplitFace("back");

    const state = useSplitFaceStore.getState();

    expect(state.selectedFaceIds).toEqual(["front"]);
    expect(state.selectedSplitFaceId).toBe("front");
  });

  it("clears selection after removing the final face", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("bottom");
    store.removeSplitFace("bottom");

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBeNull();
  });

  it("preserves selected face through undo and redo", () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.toggleFace("right");
    store.selectSplitFace("front");

    store.toggleFace("top");
    store.undo();

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("front");

    useSplitFaceStore.getState().redo();

    expect(
      useSplitFaceStore.getState().selectedSplitFaceId,
    ).toBe("top");
  });
});
