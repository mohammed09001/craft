import type { SprueScalarDesignResult } from "./sprueDesignResult";
import type { SprueGeometryContext } from "./sprueGeometryContext";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
  isValidSprueGeometryPolicy,
} from "./sprueGeometryPolicy";
import type { SprueGeometryPolicy } from "./sprueGeometryPolicy";

export function designMainSprueDiameterMm(
  context: SprueGeometryContext,
  policy: SprueGeometryPolicy = GENERIC_SPRUE_GEOMETRY_POLICY,
): SprueScalarDesignResult | null {
  if (!isValidSprueGeometryPolicy(policy)) {
    return null;
  }

  if (
    !Number.isFinite(context.equivalentDiameterMm) ||
    context.equivalentDiameterMm <= 0
  ) {
    return null;
  }

  const unconstrainedValueMm =
    context.equivalentDiameterMm *
    policy.mainDiameterRatio;

  if (
    !Number.isFinite(unconstrainedValueMm) ||
    unconstrainedValueMm <= 0
  ) {
    return null;
  }

  if (
    unconstrainedValueMm <
    policy.minimumMainDiameterMm
  ) {
    return {
      valueMm: policy.minimumMainDiameterMm,
      unconstrainedValueMm,
      source: "minimum-limit",
    };
  }

  if (
    unconstrainedValueMm >
    policy.maximumMainDiameterMm
  ) {
    return {
      valueMm: policy.maximumMainDiameterMm,
      unconstrainedValueMm,
      source: "maximum-limit",
    };
  }

  return {
    valueMm: unconstrainedValueMm,
    unconstrainedValueMm,
    source: "equation",
  };
}
