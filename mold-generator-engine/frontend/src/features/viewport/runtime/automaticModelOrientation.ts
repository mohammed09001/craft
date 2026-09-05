import type { BufferGeometry } from "three";

import {
  deriveAdaptiveGridConfig,
  type AdaptiveGridConfig,
} from "@/features/viewport/runtime/adaptiveGrid";
import {
  calculateModelGroundingTransform,
  type ModelGroundingTransform,
  type NumericBounds3,
  type NumericPoint3,
} from "@/features/viewport/runtime/modelGrounding";

const MIN_DISPLAYABLE_SIZE = 1e-9;
const SUPPORT_TOLERANCE_FACTOR = 1e-4;
const MIN_SUPPORT_TOLERANCE = 1e-6;
const AREA_EPSILON_FACTOR = 1e-8;
const HEIGHT_EPSILON_FACTOR = 1e-8;
const SQRT_HALF = Math.SQRT1_2;

export type OrientationCandidateId =
  | "negative-z-down"
  | "positive-z-down"
  | "positive-x-down"
  | "negative-x-down"
  | "positive-y-down"
  | "negative-y-down";

export type NumericQuaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type OrientationCandidate = {
  id: OrientationCandidateId;
  rotation: NumericQuaternion;
};

export type OrientationCandidateScore = {
  footprintArea: number;
  height: number;
  supportArea: number;
  supportPointRatio: number;
};

export type OrientationCandidateEvaluation = OrientationCandidate & {
  bounds: NumericBounds3;
  score: OrientationCandidateScore;
};

export type AutomaticOrientationPreparation = {
  candidateId: OrientationCandidateId;
  rotation: NumericQuaternion;
  transformedBounds: NumericBounds3;
  grounding: ModelGroundingTransform;
  gridConfig: AdaptiveGridConfig;
  score: OrientationCandidateScore;
};

export const ORIENTATION_CANDIDATES: readonly OrientationCandidate[] = [
  {
    id: "negative-z-down",
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  },
  {
    id: "positive-z-down",
    rotation: { x: 1, y: 0, z: 0, w: 0 },
  },
  {
    id: "positive-x-down",
    rotation: { x: 0, y: SQRT_HALF, z: 0, w: SQRT_HALF },
  },
  {
    id: "negative-x-down",
    rotation: { x: 0, y: -SQRT_HALF, z: 0, w: SQRT_HALF },
  },
  {
    id: "positive-y-down",
    rotation: { x: -SQRT_HALF, y: 0, z: 0, w: SQRT_HALF },
  },
  {
    id: "negative-y-down",
    rotation: { x: SQRT_HALF, y: 0, z: 0, w: SQRT_HALF },
  },
];

function isFiniteQuaternion(rotation: NumericQuaternion) {
  return (
    Number.isFinite(rotation.x) &&
    Number.isFinite(rotation.y) &&
    Number.isFinite(rotation.z) &&
    Number.isFinite(rotation.w)
  );
}

function isFiniteBounds(bounds: NumericBounds3) {
  return (
    Number.isFinite(bounds.min.x) &&
    Number.isFinite(bounds.min.y) &&
    Number.isFinite(bounds.min.z) &&
    Number.isFinite(bounds.max.x) &&
    Number.isFinite(bounds.max.y) &&
    Number.isFinite(bounds.max.z) &&
    bounds.max.x >= bounds.min.x &&
    bounds.max.y >= bounds.min.y &&
    bounds.max.z >= bounds.min.z
  );
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  rotation: NumericQuaternion,
): NumericPoint3 {
  const qx = rotation.x;
  const qy = rotation.y;
  const qz = rotation.z;
  const qw = rotation.w;

  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function createEmptyBounds(): NumericBounds3 {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
}

function expandBounds(bounds: NumericBounds3, point: NumericPoint3) {
  bounds.min.x = Math.min(bounds.min.x, point.x);
  bounds.min.y = Math.min(bounds.min.y, point.y);
  bounds.min.z = Math.min(bounds.min.z, point.z);
  bounds.max.x = Math.max(bounds.max.x, point.x);
  bounds.max.y = Math.max(bounds.max.y, point.y);
  bounds.max.z = Math.max(bounds.max.z, point.z);
}

function getMaxDimension(bounds: NumericBounds3) {
  return Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
}

function calculateProjectedTriangleArea(
  a: NumericPoint3,
  b: NumericPoint3,
  c: NumericPoint3,
) {
  return Math.abs(
    ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2,
  );
}

function getVertexIndex(
  geometry: BufferGeometry,
  triangleVertexIndex: number,
) {
  const index = geometry.getIndex();

  if (index === null) {
    return triangleVertexIndex;
  }

  return index.getX(triangleVertexIndex);
}

export function calculateTransformedBounds(
  geometry: BufferGeometry,
  rotation: NumericQuaternion,
): NumericBounds3 | null {
  if (!isFiniteQuaternion(rotation)) {
    return null;
  }

  const position = geometry.getAttribute("position");

  if (position === undefined || position.count === 0 || position.itemSize < 3) {
    return null;
  }

  const bounds = createEmptyBounds();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    expandBounds(bounds, rotatePoint(x, y, z, rotation));
  }

  if (!isFiniteBounds(bounds) || getMaxDimension(bounds) <= MIN_DISPLAYABLE_SIZE) {
    return null;
  }

  return bounds;
}

export function evaluateOrientationCandidate(
  geometry: BufferGeometry,
  candidate: OrientationCandidate,
): OrientationCandidateEvaluation | null {
  const bounds = calculateTransformedBounds(geometry, candidate.rotation);

  if (bounds === null) {
    return null;
  }

  const position = geometry.getAttribute("position");

  if (position === undefined) {
    return null;
  }

  const modelSize = getMaxDimension(bounds);
  const supportTolerance = Math.max(
    modelSize * SUPPORT_TOLERANCE_FACTOR,
    MIN_SUPPORT_TOLERANCE,
  );
  const footprintWidth = bounds.max.x - bounds.min.x;
  const footprintDepth = bounds.max.y - bounds.min.y;
  const footprintArea = footprintWidth * footprintDepth;
  const height = bounds.max.z - bounds.min.z;
  let supportArea = 0;
  let groundPointCount = 0;

  for (let index = 0; index < position.count; index += 1) {
    const point = rotatePoint(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
      candidate.rotation,
    );

    if (point.z <= bounds.min.z + supportTolerance) {
      groundPointCount += 1;
    }
  }

  const index = geometry.getIndex();
  const triangleVertexCount = index === null ? position.count : index.count;
  const triangleCount = Math.floor(triangleVertexCount / 3);

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const aIndex = getVertexIndex(geometry, triangleIndex * 3);
    const bIndex = getVertexIndex(geometry, triangleIndex * 3 + 1);
    const cIndex = getVertexIndex(geometry, triangleIndex * 3 + 2);

    const a = rotatePoint(
      position.getX(aIndex),
      position.getY(aIndex),
      position.getZ(aIndex),
      candidate.rotation,
    );
    const b = rotatePoint(
      position.getX(bIndex),
      position.getY(bIndex),
      position.getZ(bIndex),
      candidate.rotation,
    );
    const c = rotatePoint(
      position.getX(cIndex),
      position.getY(cIndex),
      position.getZ(cIndex),
      candidate.rotation,
    );

    if (
      a.z <= bounds.min.z + supportTolerance &&
      b.z <= bounds.min.z + supportTolerance &&
      c.z <= bounds.min.z + supportTolerance
    ) {
      supportArea += calculateProjectedTriangleArea(a, b, c);
    }
  }

  return {
    ...candidate,
    bounds,
    score: {
      footprintArea,
      height,
      supportArea,
      supportPointRatio: groundPointCount / position.count,
    },
  };
}

export function evaluateOrientationCandidates(
  geometry: BufferGeometry,
): OrientationCandidateEvaluation[] {
  return ORIENTATION_CANDIDATES.flatMap((candidate) => {
    const evaluation = evaluateOrientationCandidate(geometry, candidate);

    return evaluation === null ? [] : [evaluation];
  });
}

function compareNumbers(
  left: number,
  right: number,
  epsilon: number,
  preferHigher: boolean,
) {
  const difference = left - right;

  if (Math.abs(difference) <= epsilon) {
    return 0;
  }

  if (preferHigher) {
    return difference > 0 ? 1 : -1;
  }

  return difference < 0 ? 1 : -1;
}

function compareCandidateEvaluations(
  left: OrientationCandidateEvaluation,
  right: OrientationCandidateEvaluation,
) {
  const modelSize = Math.max(getMaxDimension(left.bounds), getMaxDimension(right.bounds));
  const areaEpsilon = Math.max(modelSize * modelSize * AREA_EPSILON_FACTOR, 1e-12);
  const heightEpsilon = Math.max(modelSize * HEIGHT_EPSILON_FACTOR, 1e-12);

  return (
    compareNumbers(
      left.score.supportArea,
      right.score.supportArea,
      areaEpsilon,
      true,
    ) ||
    compareNumbers(
      left.score.footprintArea,
      right.score.footprintArea,
      areaEpsilon,
      true,
    ) ||
    compareNumbers(left.score.height, right.score.height, heightEpsilon, false)
  );
}

export function selectBestOrientationCandidate(
  evaluations: readonly OrientationCandidateEvaluation[],
): OrientationCandidateEvaluation | null {
  const firstEvaluation = evaluations[0];

  if (firstEvaluation === undefined) {
    return null;
  }

  let best: OrientationCandidateEvaluation = firstEvaluation;

  for (let index = 1; index < evaluations.length; index += 1) {
    const candidate = evaluations[index];

    if (
      candidate !== undefined &&
      compareCandidateEvaluations(candidate, best) > 0
    ) {
      best = candidate;
    }
  }

  return best;
}

export function prepareAutomaticModelOrientation(
  geometry: BufferGeometry,
): AutomaticOrientationPreparation | null {
  const bestCandidate = selectBestOrientationCandidate(
    evaluateOrientationCandidates(geometry),
  );

  if (bestCandidate === null) {
    return null;
  }

  const grounding = calculateModelGroundingTransform(bestCandidate.bounds);

  if (grounding === null) {
    return null;
  }

  return {
    candidateId: bestCandidate.id,
    rotation: { ...bestCandidate.rotation },
    transformedBounds: bestCandidate.bounds,
    grounding,
    gridConfig: deriveAdaptiveGridConfig(grounding.groundedBounds),
    score: bestCandidate.score,
  };
}

