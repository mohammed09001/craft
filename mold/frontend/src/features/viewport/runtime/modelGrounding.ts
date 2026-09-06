export type NumericPoint3 = {
  x: number;
  y: number;
  z: number;
};

export type NumericBounds3 = {
  min: NumericPoint3;
  max: NumericPoint3;
};

export type ModelGroundingTransform = {
  translation: NumericPoint3;
  groundedBounds: NumericBounds3;
};

export const MODEL_GROUND_LEVEL = 0;

function isFinitePoint(point: NumericPoint3) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

export function calculateModelGroundingTransform(
  bounds: NumericBounds3,
  groundLevel = MODEL_GROUND_LEVEL,
): ModelGroundingTransform | null {
  if (
    !Number.isFinite(groundLevel) ||
    !isFinitePoint(bounds.min) ||
    !isFinitePoint(bounds.max) ||
    bounds.max.x < bounds.min.x ||
    bounds.max.y < bounds.min.y ||
    bounds.max.z < bounds.min.z
  ) {
    return null;
  }

  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const translation = {
    x: -centerX,
    y: -centerY,
    z: groundLevel - bounds.min.z,
  };

  return {
    translation,
    groundedBounds: {
      min: {
        x: bounds.min.x + translation.x,
        y: bounds.min.y + translation.y,
        z: bounds.min.z + translation.z,
      },
      max: {
        x: bounds.max.x + translation.x,
        y: bounds.max.y + translation.y,
        z: bounds.max.z + translation.z,
      },
    },
  };
}
