export type ModelImportPhase =
  | "no-model"
  | "validating"
  | "loading"
  | "ready"
  | "invalid"
  | "error";

export type ModelImportStatus = {
  phase: ModelImportPhase;
  fileName?: string;
  fileSize?: number;
  fileSizeLabel?: string;
  format?: "STL";
  triangleCount?: number;
  triangleCountLabel?: string;
  geometryVertexCount?: number;
  geometryVertexCountLabel?: string;
  message?: string;
  lastImportError?: string;
};
