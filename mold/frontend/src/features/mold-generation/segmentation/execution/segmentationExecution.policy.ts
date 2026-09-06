import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { SegmentationExecutionPolicy } from "./segmentationExecution.contracts";

export function createSegmentationExecutionPolicy(
  bounds: Bounds3,
  sourceVolumeMm3: number,
): SegmentationExecutionPolicy {
  const diagonal = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const linearToleranceMm = Math.max(1e-6, diagonal * 1e-7);
  const volumeToleranceMm3 = Math.max(1e-6, Math.abs(sourceVolumeMm3) * 1e-6);
  return Object.freeze({
    id: "manifold-plane-split",
    version: 1,
    engine: "manifold-3d",
    toleranceVersion: "scale-aware-v1",
    linearToleranceMm,
    boundsToleranceMm: linearToleranceMm * 2,
    sideToleranceMm: linearToleranceMm * 2,
    volumeToleranceMm3,
    overlapToleranceMm3: volumeToleranceMm3,
  });
}

