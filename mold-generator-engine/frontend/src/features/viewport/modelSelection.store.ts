import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type ModelSelectionStatus = {
  isModelSelected: boolean;
  selectedModelId?: string;
  selectionBoxBounds?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  announcement?: string;
};

type ModelSelectionState = {
  selection: ModelSelectionStatus;
};

type ModelSelectionActions = {
  clearSelection: () => void;
  resetSelectionAfterReplacement: () => void;
  selectCurrentModel: (modelId: string) => void;
  setModelSelectionStatus: (selection: ModelSelectionStatus) => void;
};

export type ModelSelectionStore = ModelSelectionState & ModelSelectionActions;

export const initialModelSelectionStatus: ModelSelectionStatus = {
  isModelSelected: false,
};

export const useModelSelectionStore = create<ModelSelectionStore>()((set) => ({
  selection: initialModelSelectionStatus,
  clearSelection: () =>
    set((state) =>
      state.selection.isModelSelected
        ? {
            selection: {
              isModelSelected: false,
              announcement: "Selection cleared.",
            },
          }
        : state,
    ),
  resetSelectionAfterReplacement: () =>
    set({
      selection: {
        isModelSelected: false,
      },
    }),
  selectCurrentModel: (modelId) =>
    set((state) =>
      state.selection.isModelSelected &&
      state.selection.selectedModelId === modelId
        ? state
        : {
            selection: {
              isModelSelected: true,
              selectedModelId: modelId,
              announcement: "Model selected.",
            },
          },
    ),
  setModelSelectionStatus: (selection) => set({ selection }),
}));

export const useModelSelectionStatus = () =>
  useModelSelectionStore((state) => state.selection);

export const useModelSelectionActions = () =>
  useModelSelectionStore(
    useShallow((state) => ({
      clearSelection: state.clearSelection,
      resetSelectionAfterReplacement: state.resetSelectionAfterReplacement,
      selectCurrentModel: state.selectCurrentModel,
      setModelSelectionStatus: state.setModelSelectionStatus,
    })),
  );
