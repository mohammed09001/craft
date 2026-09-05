import { calculateCavityAspectRatio } from "./sprueGeometryCalculator";
import type { SprueCavityBoundsDimensions } from "./sprueGeometryCalculator";
import { calculateEquivalentDiameterMm } from "./sprueProfile";

export interface SprueGeometryContextInput {
  readonly cavityVolumeMm3: number;
  readonly cavityBounds: SprueCavityBoundsDimensions;
  readonly totalSprueLengthMm: number;
}

export interface SprueGeometryContext {
  readonly cavityVolumeMm3: number;
  readonly cavityBounds: SprueCavityBoundsDimensions;
  readonly totalSprueLengthMm: number;
  readonly equivalentDiameterMm: number;
  readonly aspectRatio: number;
}

export function buildSprueGeometryContext(
  input: SprueGeometryContextInput,
): SprueGeometryContext | null {
  if (
    !Number.isFinite(input.totalSprueLengthMm) ||
    input.totalSprueLengthMm <= 0
  ) {
    return null;
  }

  const equivalentDiameterMm =
    calculateEquivalentDiameterMm(input.cavityVolumeMm3);

  if (equivalentDiameterMm === null) {
    return null;
  }

  const aspectRatio = calculateCavityAspectRatio(
    input.cavityBounds,
  );

  if (aspectRatio === null) {
    return null;
  }

  return {
    cavityVolumeMm3: input.cavityVolumeMm3,
    cavityBounds: {
      xLengthMm: input.cavityBounds.xLengthMm,
      yLengthMm: input.cavityBounds.yLengthMm,
      zLengthMm: input.cavityBounds.zLengthMm,
    },
    totalSprueLengthMm: input.totalSprueLengthMm,
    equivalentDiameterMm,
    aspectRatio,
  };
}
