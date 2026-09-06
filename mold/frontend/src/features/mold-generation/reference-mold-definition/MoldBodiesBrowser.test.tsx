import { fireEvent, render, screen } from "@testing-library/react";

import { selectActiveMoldBodies, useSplitFaceStore } from "../split-face/splitFace.store";
import type { ReferenceMoldDefinition } from "./referenceMoldDefinition.contracts";
import { MoldBodiesBrowser } from "./MoldBodiesBrowser";

const base = {
  schemaVersion: 1,
  definitionId: "d",
  modelId: "m",
  coordinateSystem: { units: "millimeters", upAxis: "Z" },
  selectionBoxBounds: {
    min: { x: 1, y: 1, z: 1 },
    max: { x: 2, y: 2, z: 2 },
  },
  referenceMoldBlock: {
    clearanceMm: 1,
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 3, y: 3, z: 3 },
    },
  },
  usedFaces: [],
  selectedFaceIds: [],
} as const;

const body = (id: string, name: string) => ({
  id,
  name,
  visible: true,
  bounds: base.referenceMoldBlock.bounds,
  triangleCount: 12,
  volumeMm3: 1,
  watertight: true as const,
  mesh: {
    positions: [0, 0, 0],
    indices: [],
  },
});

function setReadyBodies() {
  useSplitFaceStore.setState({
    definition: {
      ...base,
      moldBodies: [
        body("1", "Mold 1"),
        body("2", "Mold 2"),
      ],
    } as ReferenceMoldDefinition,
    workflow: "partsReady",
  });
}

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
});

it("is absent before results and toggles mold bodies independently", () => {
  const view = render(<MoldBodiesBrowser />);

  expect(screen.queryByRole("complementary")).toBeNull();

  setReadyBodies();
  view.rerender(<MoldBodiesBrowser />);

  fireEvent.click(screen.getByRole("button", { name: "Hide Mold 1" }));

  expect(
    selectActiveMoldBodies(useSplitFaceStore.getState())?.map(
      (entry) => entry.visible,
    ),
  ).toEqual([false, true]);

  expect(
    screen.getByRole("button", { name: "Show Mold 1" }),
  ).toBeVisible();
});

it("toggles the original model independently from mold bodies", () => {
  const onModelVisibilityChange = vi.fn();

  setReadyBodies();

  const view = render(
    <MoldBodiesBrowser
      modelVisible
      onModelVisibilityChange={onModelVisibilityChange}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Hide Model" }));

  expect(onModelVisibilityChange).toHaveBeenLastCalledWith(false);
  expect(
    useSplitFaceStore.getState().definition?.moldBodies?.map(
      (entry) => entry.visible,
    ),
  ).toEqual([true, true]);

  view.rerender(
    <MoldBodiesBrowser
      modelVisible={false}
      onModelVisibilityChange={onModelVisibilityChange}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Show Model" }));

  expect(onModelVisibilityChange).toHaveBeenLastCalledWith(true);
});
