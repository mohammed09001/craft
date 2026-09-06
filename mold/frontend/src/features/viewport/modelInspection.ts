import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * 1024;

export type ModelInspectionInput = {
  fileName: string;
  fileSize: number;
  geometryVertexCount: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }

  if (bytes < BYTES_PER_KIB) {
    return `${bytes} B`;
  }

  if (bytes < BYTES_PER_MIB) {
    return `${(bytes / BYTES_PER_KIB).toFixed(1)} KB`;
  }

  return `${(bytes / BYTES_PER_MIB).toFixed(1)} MB`;
}

export function createModelInspectionStatus({
  fileName,
  fileSize,
  geometryVertexCount,
}: ModelInspectionInput): ModelImportStatus {
  const triangleCount =
    Number.isInteger(geometryVertexCount) &&
    geometryVertexCount > 0 &&
    geometryVertexCount % 3 === 0
      ? geometryVertexCount / 3
      : undefined;

  return {
    phase: "ready",
    fileName,
    fileSize,
    fileSizeLabel: formatFileSize(fileSize),
    format: "STL",
    geometryVertexCount,
    geometryVertexCountLabel: formatCount(geometryVertexCount),
    ...(triangleCount === undefined
      ? {}
      : {
          triangleCount,
          triangleCountLabel: formatCount(triangleCount),
        }),
  };
}

