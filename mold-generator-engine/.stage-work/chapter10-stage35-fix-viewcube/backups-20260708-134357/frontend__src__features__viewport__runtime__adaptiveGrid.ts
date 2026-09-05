import type { NumericBounds3 } from "@/features/viewport/runtime/modelGrounding";

export type AdaptiveGridConfig = {
  majorStep: number;
  minorStep: number;
  size: number;
};

export const DEFAULT_GRID_CONFIG: AdaptiveGridConfig = {
  majorStep: 50,
  minorStep: 10,
  size: 220,
};

const MIN_GRID_SIZE = 20;
const GRID_MARGIN_FACTOR = 1.5;
const TARGET_MINOR_DIVISIONS = 20;
const NICE_STEP_FACTORS = [1, 2, 5, 10] as const;

function isValidPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function calculateNiceStep(rawStep: number) {
  if (!isValidPositiveNumber(rawStep)) {
    return null;
  }

  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;
  const factor =
    NICE_STEP_FACTORS.find((candidate) => normalized <= candidate) ?? 10;

  return factor * magnitude;
}

function roundUpToMultiple(value: number, step: number) {
  return Math.ceil(value / step) * step;
}

export function deriveAdaptiveGridConfig(
  groundedBounds: NumericBounds3 | null,
): AdaptiveGridConfig {
  if (groundedBounds === null) {
    return DEFAULT_GRID_CONFIG;
  }

  const width = groundedBounds.max.x - groundedBounds.min.x;
  const depth = groundedBounds.max.y - groundedBounds.min.y;
  const footprint = Math.max(width, depth);

  if (!isValidPositiveNumber(footprint)) {
    return DEFAULT_GRID_CONFIG;
  }

  const targetSize = Math.max(footprint * GRID_MARGIN_FACTOR, MIN_GRID_SIZE);
  const minorStep = calculateNiceStep(targetSize / TARGET_MINOR_DIVISIONS);

  if (minorStep === null) {
    return DEFAULT_GRID_CONFIG;
  }

  const majorStep = minorStep * 5;
  const size = roundUpToMultiple(targetSize, majorStep * 2);

  return {
    majorStep,
    minorStep,
    size,
  };
}
