export interface SprueCavityBoundsDimensions {
  readonly xLengthMm: number;
  readonly yLengthMm: number;
  readonly zLengthMm: number;
}

export function calculateCavityAspectRatio(
  bounds: SprueCavityBoundsDimensions,
): number | null {
  const dimensions = [
    bounds.xLengthMm,
    bounds.yLengthMm,
    bounds.zLengthMm,
  ];

  if (
    dimensions.some(
      (dimension) =>
        !Number.isFinite(dimension) || dimension <= 0,
    )
  ) {
    return null;
  }

  const longestDimensionMm = Math.max(...dimensions);
  const shortestDimensionMm = Math.min(...dimensions);

  const aspectRatio =
    longestDimensionMm / shortestDimensionMm;

  if (!Number.isFinite(aspectRatio) || aspectRatio < 1) {
    return null;
  }

  return aspectRatio;
}
