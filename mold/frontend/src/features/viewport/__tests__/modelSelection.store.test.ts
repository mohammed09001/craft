import { useModelSelectionStore } from "@/features/viewport/modelSelection.store";

beforeEach(() => {
  useModelSelectionStore.getState().resetSelectionAfterReplacement();
});

it("selects the current model and clears selection", () => {
  useModelSelectionStore.getState().selectCurrentModel("model-1");

  expect(useModelSelectionStore.getState().selection).toEqual({
    isModelSelected: true,
    selectedModelId: "model-1",
    announcement: "Model selected.",
  });

  useModelSelectionStore.getState().clearSelection();

  expect(useModelSelectionStore.getState().selection).toEqual({
    isModelSelected: false,
    announcement: "Selection cleared.",
  });
});

it("does not create a new transition when selecting the already selected model", () => {
  useModelSelectionStore.getState().selectCurrentModel("model-1");
  const selectedState = useModelSelectionStore.getState().selection;

  useModelSelectionStore.getState().selectCurrentModel("model-1");

  expect(useModelSelectionStore.getState().selection).toBe(selectedState);
});

it("resets selection after successful replacement", () => {
  useModelSelectionStore.getState().selectCurrentModel("model-1");
  useModelSelectionStore.getState().resetSelectionAfterReplacement();

  expect(useModelSelectionStore.getState().selection).toEqual({
    isModelSelected: false,
  });
});
