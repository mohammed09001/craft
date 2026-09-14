import type { Bounds3 } from "../split-face/splitFace.contracts";

/**
 * Execution 05 Article 04: neutral connected-component (Boolean fragment)
 * classification and deterministic ordering. Operates on plain volume
 * numbers and bounds -- no product-domain semantics.
 */

export interface FragmentVolumeClassification {
  readonly meaningfulVolumes: readonly number[];
  readonly discardedVolumes: readonly number[];
}

export interface ComponentOrderingDescriptor {
  readonly volumeMm3: number;
  readonly bounds: Bounds3;
}

function quantizeComponentValue(value: number, tolerance: number): number {
  return Math.round(value / tolerance);
}

export function compareComponentDescriptors(
  left: ComponentOrderingDescriptor,
  right: ComponentOrderingDescriptor,
  geometryToleranceMm: number,
): number {
  if (!Number.isFinite(geometryToleranceMm) || geometryToleranceMm <= 0) {
    throw new Error("Component ordering tolerance must be positive.");
  }

  const volumeToleranceMm3 = geometryToleranceMm ** 3;

  const comparisons = [
    quantizeComponentValue(right.volumeMm3, volumeToleranceMm3) -
      quantizeComponentValue(left.volumeMm3, volumeToleranceMm3),
    quantizeComponentValue(left.bounds.min.x, geometryToleranceMm) -
      quantizeComponentValue(right.bounds.min.x, geometryToleranceMm),
    quantizeComponentValue(left.bounds.min.y, geometryToleranceMm) -
      quantizeComponentValue(right.bounds.min.y, geometryToleranceMm),
    quantizeComponentValue(left.bounds.min.z, geometryToleranceMm) -
      quantizeComponentValue(right.bounds.min.z, geometryToleranceMm),
    quantizeComponentValue(left.bounds.max.x, geometryToleranceMm) -
      quantizeComponentValue(right.bounds.max.x, geometryToleranceMm),
    quantizeComponentValue(left.bounds.max.y, geometryToleranceMm) -
      quantizeComponentValue(right.bounds.max.y, geometryToleranceMm),
    quantizeComponentValue(left.bounds.max.z, geometryToleranceMm) -
      quantizeComponentValue(right.bounds.max.z, geometryToleranceMm),
  ];

  for (const comparison of comparisons) {
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

export function classifyFragmentVolumes(
  volumes: readonly number[],
  minimumVolumeMm3: number,
): FragmentVolumeClassification {
  if (
    !Number.isFinite(minimumVolumeMm3) ||
    minimumVolumeMm3 < 0 ||
    volumes.some(volume => !Number.isFinite(volume) || volume < 0)
  ) {
    throw new Error("Fragment volume classification inputs are invalid.");
  }

  const meaningfulVolumes: number[] = [];
  const discardedVolumes: number[] = [];

  for (const volume of volumes) {
    if (volume > minimumVolumeMm3) {
      meaningfulVolumes.push(volume);
    } else {
      discardedVolumes.push(volume);
    }
  }

  meaningfulVolumes.sort((a, b) => b - a);
  discardedVolumes.sort((a, b) => b - a);

  return {
    meaningfulVolumes,
    discardedVolumes,
  };
}
