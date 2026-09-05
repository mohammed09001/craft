import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";

type ModelImportState = {
  status: ModelImportStatus;
};

type ModelImportActions = {
  setModelImportStatus: (status: ModelImportStatus) => void;
  resetModelImportStatus: () => void;
};

export type ModelImportStore = ModelImportState & ModelImportActions;

export const initialModelImportStatus: ModelImportStatus = {
  phase: "no-model",
};

export const useModelImportStore = create<ModelImportStore>()((set) => ({
  status: initialModelImportStatus,
  setModelImportStatus: (status) => set({ status }),
  resetModelImportStatus: () => set({ status: initialModelImportStatus }),
}));

export const useModelImportStatus = () =>
  useModelImportStore((state) => state.status);

export const useModelImportActions = () =>
  useModelImportStore(
    useShallow((state) => ({
      resetModelImportStatus: state.resetModelImportStatus,
      setModelImportStatus: state.setModelImportStatus,
    })),
  );
