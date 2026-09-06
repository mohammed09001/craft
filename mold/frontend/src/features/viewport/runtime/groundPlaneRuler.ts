import { Vector3, type Camera } from "three";

export const RULER_MIN_LABEL_PIXELS = 60;
export const RULER_MAX_LABEL_PIXELS = 140;
export const RULER_MINOR_DIVISIONS = 5;

export type GroundPlaneRulerTick = {
  readonly position: number;
  readonly major: boolean;
};

export type GroundPlaneRulerLabel = {
  readonly value: number;
  readonly position: number;
};

export type GroundPlaneRulerLayout = {
  readonly step: number;
  readonly ticks: readonly GroundPlaneRulerTick[];
  readonly labels: readonly GroundPlaneRulerLabel[];
};

export type RulerStepSelection = {
  pixelsPerWorldUnit: number;
  minStep: number;
  maxStep: number;
  currentStep?: number | null;
  minLabelPixels?: number;
  maxLabelPixels?: number;
};

export function rulerStepBounds(config: {
  readonly minorStep: number;
  readonly size: number;
}) {
  return {
    minStep: config.minorStep,
    maxStep: config.size / 2,
  };
}

function niceStepCandidates(minStep: number, maxStep: number): number[] {
  const candidates: number[] = [];

  if (
    !Number.isFinite(minStep) ||
    !Number.isFinite(maxStep) ||
    minStep <= 0 ||
    maxStep < minStep
  ) {
    return candidates;
  }

  const startExponent = Math.floor(Math.log10(minStep));
  const endExponent = Math.ceil(Math.log10(maxStep));

  for (let exponent = startExponent; exponent <= endExponent; exponent += 1) {
    const magnitude = 10 ** exponent;

    for (const factor of [1, 2, 5]) {
      const value = factor * magnitude;
      if (value >= minStep && value <= maxStep) {
        candidates.push(value);
      }
    }
  }

  return candidates;
}

/**
 * Selects the ruler label step for the current camera zoom.
 *
 * Steps come from the 1/2/5 x 10^n nice sequence, clamped to the ruler's
 * grid-derived bounds. A current step is kept while its projected on-screen
 * span stays inside the readable pixel band, which provides hysteresis and
 * prevents label flicker at zoom boundaries. Otherwise the step whose span is
 * closest to the band center is chosen, so label spacing stays roughly
 * constant on screen while zooming.
 */
export function selectRulerLabelStep(
  selection: RulerStepSelection,
): number | null {
  const {
    pixelsPerWorldUnit,
    minStep,
    maxStep,
    currentStep = null,
    minLabelPixels = RULER_MIN_LABEL_PIXELS,
    maxLabelPixels = RULER_MAX_LABEL_PIXELS,
  } = selection;

  if (
    !Number.isFinite(pixelsPerWorldUnit) ||
    pixelsPerWorldUnit <= 0 ||
    !Number.isFinite(minStep) ||
    !Number.isFinite(maxStep) ||
    minStep <= 0 ||
    maxStep < minStep ||
    !Number.isFinite(minLabelPixels) ||
    minLabelPixels <= 0 ||
    maxLabelPixels < minLabelPixels
  ) {
    return null;
  }

  if (
    currentStep !== null &&
    Number.isFinite(currentStep) &&
    currentStep >= minStep &&
    currentStep <= maxStep
  ) {
    const currentPixels = currentStep * pixelsPerWorldUnit;
    if (
      currentPixels >= minLabelPixels &&
      currentPixels <= maxLabelPixels
    ) {
      return currentStep;
    }
  }

  const candidates = niceStepCandidates(minStep, maxStep);
  if (candidates.length === 0) {
    return null;
  }

  const target = (minLabelPixels + maxLabelPixels) / 2;
  let best: number | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate * pixelsPerWorldUnit - target);
    if (best === null || distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

/**
 * Builds deterministic tick and label positions for one ruler axis spanning
 * `halfExtent` on both sides of the origin. Major ticks sit at label steps;
 * minor ticks subdivide each label interval into `minorDivisions` parts.
 */
export function computeGroundPlaneRulerLayout(
  halfExtent: number,
  step: number,
  minorDivisions: number = RULER_MINOR_DIVISIONS,
): GroundPlaneRulerLayout {
  const ticks: GroundPlaneRulerTick[] = [];
  const labels: GroundPlaneRulerLabel[] = [];

  if (
    !Number.isFinite(halfExtent) ||
    halfExtent <= 0 ||
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isInteger(minorDivisions) ||
    minorDivisions <= 0
  ) {
    return { step, ticks, labels };
  }

  const tick = step / minorDivisions;
  const firstTickIndex = Math.ceil(-halfExtent / tick);
  const lastTickIndex = Math.floor(halfExtent / tick);

  for (let index = firstTickIndex; index <= lastTickIndex; index += 1) {
    ticks.push({
      position: index * tick,
      major: index % minorDivisions === 0,
    });
  }

  const firstLabelIndex = Math.ceil(-halfExtent / step);
  const lastLabelIndex = Math.floor(halfExtent / step);

  for (let index = firstLabelIndex; index <= lastLabelIndex; index += 1) {
    const value = index * step;
    labels.push({ value, position: value });
  }

  return { step, ticks, labels };
}

export function formatRulerLabel(value: number): string {
  return String(Math.round(value));
}

/**
 * Measures the on-screen pixel length of a world-space segment lying on the
 * ground plane, using the camera projection. Returns null when the projection
 * is unavailable or produces non-finite results.
 */
export function projectWorldLengthToPixels(
  camera: Camera,
  origin: { readonly x: number; readonly y: number; readonly z: number },
  axisUnit: { readonly x: number; readonly y: number; readonly z: number },
  worldLength: number,
  viewportHeightPx: number,
): number | null {
  if (
    camera.matrixWorldInverse === undefined ||
    !Number.isFinite(worldLength) ||
    worldLength <= 0 ||
    !Number.isFinite(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return null;
  }

  const start = new Vector3(origin.x, origin.y, origin.z).project(camera);
  const end = new Vector3(
    origin.x + axisUnit.x * worldLength,
    origin.y + axisUnit.y * worldLength,
    origin.z + axisUnit.z * worldLength,
  ).project(camera);

  if (
    ![start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)
  ) {
    return null;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return Math.hypot(dx, dy) * (viewportHeightPx / 2);
}
