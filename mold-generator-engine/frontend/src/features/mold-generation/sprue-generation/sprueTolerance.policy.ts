import type { SprueSourceBody, SprueTolerancePolicy } from "./sprueGeneration.contracts";

export function buildSprueTolerancePolicy(
  body: SprueSourceBody,
  requestedToleranceMm: number,
): SprueTolerancePolicy {
  const dimensions = [
    body.bounds.max.x - body.bounds.min.x,
    body.bounds.max.y - body.bounds.min.y,
    body.bounds.max.z - body.bounds.min.z,
  ];
  if (
    !dimensions.every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isFinite(requestedToleranceMm) ||
    requestedToleranceMm <= 0
  ) {
    throw new Error("Sprue tolerance inputs are invalid.");
  }
  const diagonal = Math.hypot(...dimensions);
  const linearToleranceMm = Math.max(requestedToleranceMm, diagonal * 1e-8);
  const volumeToleranceMm3 = linearToleranceMm ** 3;
  return Object.freeze({
    linearToleranceMm,
    areaToleranceMm2: linearToleranceMm ** 2,
    volumeToleranceMm3,
    meaningfulVolumeMm3: Math.max(volumeToleranceMm3 * 64, body.volumeMm3 * 1e-12),
    surfaceToleranceMm: linearToleranceMm * 4,
    outsideMarginMm: Math.max(linearToleranceMm * 8, diagonal * 1e-6),
    beyondMarginMm: Math.max(linearToleranceMm * 16, diagonal * 2e-6),
  });
}
