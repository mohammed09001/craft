/**
 * Axis ownership across the current Constructed Cutting Plan operation.
 * An axis is "used" once one or more cutting planes belong to it -- several
 * planes on the same axis still count as one used axis (see spec: General
 * Segmentation axis-ownership requirements). Pure derivation only; callers
 * own where algorithmAxes/userAxes actually come from.
 */
import type { FitAxis } from "../fitAnalysis";

export type Axis3 = FitAxis;

const ALL_AXES: readonly Axis3[] = ["x", "y", "z"];

export interface AxisOwnership {
  readonly algorithmUsedAxes: readonly Axis3[];
  readonly userExtensionAxes: readonly Axis3[];
  readonly combinedUsedAxes: readonly Axis3[];
  readonly availableAxes: readonly Axis3[];
}

function dedupeAxes(axes: readonly Axis3[]): readonly Axis3[] {
  return ALL_AXES.filter((axis) => axes.includes(axis));
}

export function deriveAxisOwnership(
  algorithmAxes: readonly Axis3[],
  userAxes: readonly Axis3[],
): AxisOwnership {
  const algorithmUsedAxes = dedupeAxes(algorithmAxes);
  const userExtensionAxes = dedupeAxes(userAxes);
  const combinedUsedAxes = dedupeAxes([...algorithmUsedAxes, ...userExtensionAxes]);
  const availableAxes = ALL_AXES.filter((axis) => !combinedUsedAxes.includes(axis));
  return { algorithmUsedAxes, userExtensionAxes, combinedUsedAxes, availableAxes };
}

export function isAxisAvailableForExtension(
  ownership: AxisOwnership,
  axis: Axis3,
): boolean {
  return ownership.availableAxes.includes(axis);
}
