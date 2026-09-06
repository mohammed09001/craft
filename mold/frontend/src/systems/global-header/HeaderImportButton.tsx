import { Upload } from "lucide-react";

import { IconButton } from "@/design-system/primitives";
import { useModelImportStatus, useViewportCommandRunner } from "@/features/viewport";

/**
 * The single dynamic import/replace trigger, reusing the same
 * import-stl/replace-stl viewport commands (and therefore the same
 * file-selection and model-loading workflow) ContextArea used to expose --
 * only the label/tooltip changes based on whether a model is loaded.
 */
export function HeaderImportButton() {
  const modelStatus = useModelImportStatus();
  const runViewportCommand = useViewportCommandRunner();
  const hasModel = modelStatus.phase === "ready";
  const label = hasModel ? "Replace Object" : "Import Object";

  return (
    <IconButton
      label={label}
      onClick={() => runViewportCommand(hasModel ? "replace-stl" : "import-stl")}
      title={label}
    >
      <Upload aria-hidden="true" size={18} />
    </IconButton>
  );
}
