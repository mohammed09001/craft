import { beforeEach, describe, expect, it } from "vitest";

import type { Bounds3 } from "./splitFace.contracts";
import { useSplitFaceStore } from "./splitFace.store";

const k1: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 30, y: 30, z: 30 },
};

describe("remove selected split face and rebuild", () => {
  beforeEach(() => {
    useSplitFaceStore.getState().clearForModelReplacement();
  });

  it("removes only the selected face and rebuilds from the remainder", async () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.toggleFace("right");

    expect(
      await useSplitFaceStore
        .getState()
        .createMoldParts("model", k1),
    ).toBe(true);

    const previousBodyCount =
      useSplitFaceStore.getState().definition
        ?.moldBodies?.length;

    expect(previousBodyCount).toBe(4);

    useSplitFaceStore
      .getState()
      .selectSplitFace("right");

    expect(
      await useSplitFaceStore
        .getState()
        .removeSelectedSplitFaceAndRebuild(
          "model",
          k1,
        ),
    ).toBe(true);

    const rebuilt =
      useSplitFaceStore.getState();

    expect(rebuilt.selectedFaceIds).toEqual([
      "front",
    ]);

    expect(rebuilt.selectedSplitFaceId).toBe(
      "front",
    );

    expect(rebuilt.cuttingPlanes).toHaveLength(1);
    expect(rebuilt.workflow).toBe("partsReady");

    expect(
      rebuilt.definition?.moldBodies,
    ).toHaveLength(2);
  });

  it("returns to face selection after deleting the final face", async () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("top");

    expect(
      await useSplitFaceStore
        .getState()
        .createMoldParts("model", k1),
    ).toBe(true);

    expect(
      await useSplitFaceStore
        .getState()
        .removeSelectedSplitFaceAndRebuild(
          "model",
          k1,
        ),
    ).toBe(true);

    const state =
      useSplitFaceStore.getState();

    expect(state.selectedFaceIds).toEqual([]);
    expect(state.selectedSplitFaceId).toBeNull();
    expect(state.cuttingPlanes).toEqual([]);
    expect(state.definition).toBeNull();
    expect(state.workflow).toBe("selectingFaces");
  });

  it("restores the previous mold with one undo", async () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.toggleFace("right");

    await useSplitFaceStore
      .getState()
      .createMoldParts("model", k1);

    const originalDefinition =
      useSplitFaceStore.getState().definition;

    useSplitFaceStore
      .getState()
      .selectSplitFace("right");

    const undoCountBefore =
      useSplitFaceStore.getState().undoStack.length;

    await useSplitFaceStore
      .getState()
      .removeSelectedSplitFaceAndRebuild(
        "model",
        k1,
      );

    expect(
      useSplitFaceStore.getState().undoStack,
    ).toHaveLength(undoCountBefore + 1);

    useSplitFaceStore.getState().undo();

    const restored =
      useSplitFaceStore.getState();

    expect(restored.selectedFaceIds).toEqual([
      "front",
      "right",
    ]);

    expect(restored.definition).toEqual(
      originalDefinition,
    );

    expect(restored.workflow).toBe("partsReady");
  });

  it("does nothing when no cutting face is selected", async () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.selectSplitFace(null);

    expect(
      await useSplitFaceStore
        .getState()
        .removeSelectedSplitFaceAndRebuild(
          "model",
          k1,
        ),
    ).toBe(false);

    expect(
      useSplitFaceStore.getState().selectedFaceIds,
    ).toEqual(["front"]);
  });

  it("removes a requested face without relying on selectedSplitFaceId", async () => {
    const store = useSplitFaceStore.getState();

    store.enterSelection();
    store.toggleFace("front");
    store.toggleFace("right");

    expect(
      await useSplitFaceStore
        .getState()
        .createMoldParts("model", k1),
    ).toBe(true);

    useSplitFaceStore
      .getState()
      .selectSplitFace("front");

    expect(
      await useSplitFaceStore
        .getState()
        .removeSplitFaceAndRebuild(
          "right",
          "model",
          k1,
        ),
    ).toBe(true);

    const rebuilt =
      useSplitFaceStore.getState();

    expect(rebuilt.selectedFaceIds).toEqual([
      "front",
    ]);

    expect(rebuilt.cuttingPlanes).toHaveLength(1);
    expect(rebuilt.workflow).toBe("partsReady");

    expect(
      rebuilt.definition?.moldBodies,
    ).toHaveLength(2);
  });
});

