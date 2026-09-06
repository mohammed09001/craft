import type { SprueScalarDesignResult } from "./sprueDesignResult";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
  isValidSprueGeometryPolicy,
} from "./sprueGeometryPolicy";
import type { SprueGeometryPolicy } from "./sprueGeometryPolicy";

export function designEntryNeckDiameterMm(
  mainDiameterMm: number,
  policy: SprueGeometryPolicy = GENERIC_SPRUE_GEOMETRY_POLICY,
): SprueScalarDesignResult | null {
  if (!isValidSprueGeometryPolicy(policy)) {
    return null;
  }

  if (
    !Number.isFinite(mainDiameterMm) ||
    mainDiameterMm <= 0
  ) {
    return null;
  }

  const unconstrainedValueMm =
    mainDiameterMm * policy.entryNeckDiameterRatio;

  if (
    !Number.isFinite(unconstrainedValueMm) ||
    unconstrainedValueMm <= 0
  ) {
    return null;
  }

  if (
    unconstrainedValueMm <
    policy.minimumEntryNeckDiameterMm
  ) {
    const valueMm = Math.min(
      mainDiameterMm,
      policy.minimumEntryNeckDiameterMm,
    );

    return {
      valueMm,
      unconstrainedValueMm,
      source: "minimum-limit",
    };
  }

  if (
    unconstrainedValueMm >
    policy.maximumEntryNeckDiameterMm
  ) {
    const valueMm = Math.min(
      mainDiameterMm,
      policy.maximumEntryNeckDiameterMm,
    );

    return {
      valueMm,
      unconstrainedValueMm,
      source: "maximum-limit",
    };
  }

  return {
    valueMm: Math.min(
      mainDiameterMm,
      unconstrainedValueMm,
    ),
    unconstrainedValueMm,
    source: "equation",
  };
}
