import type { Axis3 } from "../segmentation";
import {
  addSegmentationExtensionAxis,
  removeSegmentationExtensionAxis,
  useActiveAxisOwnership,
} from "../cutting-workflow/cuttingWorkflow.store";
import toolbarStyles from "./MoldToolbar.module.css";

const AXES: readonly Axis3[] = ["x", "y", "z"];

/**
 * Lets the user add a Split-by-Face extension boundary on any axis the
 * active General Segmentation plan (One Mold, or More Molds Automatic)
 * left available. A used axis's button is disabled and shows why via its
 * title -- algorithm-used axes and user-extension axes are visually
 * indistinguishable here (both simply "unavailable"); the plan's own
 * preview already shows which planes came from which source.
 */
export function AxisExtensionPicker() {
  const ownership = useActiveAxisOwnership();

  return (
    <div aria-label="Extension axis" className={toolbarStyles.group}>
      {AXES.map((axis) => {
        const isAlgorithmUsed = ownership.algorithmUsedAxes.includes(axis);
        const isUserExtended = ownership.userExtensionAxes.includes(axis);
        const label = axis.toUpperCase();
        const title = isAlgorithmUsed
          ? `${label} is already used by the segmentation plan`
          : isUserExtended
            ? `${label} already has an extension plane -- click again to remove it`
            : `Add a ${label} extension plane`;
        return (
          <button
            aria-label={`${label} axis`}
            aria-pressed={isUserExtended}
            className={`${toolbarStyles.iconButton} ${
              isUserExtended ? toolbarStyles.primaryButton : ""
            }`}
            disabled={isAlgorithmUsed}
            key={axis}
            onClick={() =>
              isUserExtended
                ? removeSegmentationExtensionAxis(axis)
                : addSegmentationExtensionAxis(axis)
            }
            title={title}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
