import type { SprueScalarDesignResult } from "./sprueDesignResult";
import type { SprueGeometryContext } from "./sprueGeometryContext";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
  isValidSprueGeometryPolicy,
} from "./sprueGeometryPolicy";
import type { SprueGeometryPolicy } from "./sprueGeometryPolicy";

export function designEntryNeckLengthMm(
  context: SprueGeometryContext,
  mainDiameterDesign: SprueScalarDesignResult,
  entryNeckDiameterDesign: SprueScalarDesignResult,
  policy: SprueGeometryPolicy = GENERIC_SPRUE_GEOMETRY_POLICY,
): SprueScalarDesignResult | null {
  if (!isValidSprueGeometryPolicy(policy)) {
    return null;
  }

  if (
    !Number.isFinite(context.totalSprueLengthMm) ||
    context.totalSprueLengthMm <= 0
  ) {
    return null;
  }

  if (
    !Number.isFinite(mainDiameterDesign.valueMm) ||
    mainDiameterDesign.valueMm <= 0
  ) {
    return null;
  }

  if (
    !Number.isFinite(entryNeckDiameterDesign.valueMm) ||
    entryNeckDiameterDesign.valueMm <= 0 ||
    entryNeckDiameterDesign.valueMm >
      mainDiameterDesign.valueMm
  ) {
    return null;
  }

  const unconstrainedValueMm =
    entryNeckDiameterDesign.valueMm *
    policy.entryNeckLengthToDiameterRatio;

  if (
    !Number.isFinite(unconstrainedValueMm) ||
    unconstrainedValueMm <= 0
  ) {
    return null;
  }

  const maximumLengthFromSprueShareMm =
    context.totalSprueLengthMm *
    policy.maximumEntryNeckLengthShare;

  const effectiveMaximumLengthMm = Math.min(
    policy.maximumEntryNeckLengthMm,
    maximumLengthFromSprueShareMm,
  );

  if (
    !Number.isFinite(effectiveMaximumLengthMm) ||
    effectiveMaximumLengthMm <= 0
  ) {
    return null;
  }

  if (
    effectiveMaximumLengthMm <
    policy.minimumEntryNeckLengthMm
  ) {
    return {
      valueMm: effectiveMaximumLengthMm,
      unconstrainedValueMm,
      source: "maximum-limit",
    };
  }

  if (
    unconstrainedValueMm <
    policy.minimumEntryNeckLengthMm
  ) {
    return {
      valueMm: policy.minimumEntryNeckLengthMm,
      unconstrainedValueMm,
      source: "minimum-limit",
    };
  }

  if (unconstrainedValueMm > effectiveMaximumLengthMm) {
    return {
      valueMm: effectiveMaximumLengthMm,
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
