import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";

export const MAX_LOCAL_STL_FILE_SIZE_BYTES = 25 * 1024 * 1024;

type ValidationResult =
  | {
      ok: true;
      file: File;
    }
  | {
      ok: false;
      status: ModelImportStatus;
    };

function createInvalidStatus(message: string): ModelImportStatus {
  return {
    phase: "invalid",
    message,
  };
}

export function validateLocalStlFiles(
  files: FileList | readonly File[] | null,
): ValidationResult {
  const selectedFiles = files === null ? [] : Array.from(files);

  if (selectedFiles.length !== 1) {
    return {
      ok: false,
      status: createInvalidStatus("Choose exactly one STL file."),
    };
  }

  const [file] = selectedFiles;

  if (file === undefined || !file.name.toLowerCase().endsWith(".stl")) {
    return {
      ok: false,
      status: createInvalidStatus("Only .stl files are supported."),
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      status: createInvalidStatus("The STL file is empty."),
    };
  }

  if (file.size > MAX_LOCAL_STL_FILE_SIZE_BYTES) {
    return {
      ok: false,
      status: createInvalidStatus("The STL file is too large for local loading."),
    };
  }

  return {
    ok: true,
    file,
  };
}

