import type { SprueScalarDesignResult } from "./sprueDesignResult";
import { designEntryNeckDiameterMm } from "./sprueEntryNeckDesigner";
import { designEntryNeckLengthMm } from "./sprueEntryNeckLengthDesigner";
import type { SprueGeometryContext } from "./sprueGeometryContext";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
} from "./sprueGeometryPolicy";
import type { SprueGeometryPolicy } from "./sprueGeometryPolicy";
import { designMainSprueDiameterMm } from "./sprueMainSectionDesigner";
import {
  DEFAULT_SPRUE_PROFILE,
  isValidSprueProfile,
} from "./sprueProfile";
import type {
  SprueProfileCalculationSource,
  SprueProfileDimensions,
} from "./sprueProfile";

export interface SprueProfileDesignResult {
  readonly profile: SprueProfileDimensions;
  readonly source: SprueProfileCalculationSource;
  readonly mainSection: SprueScalarDesignResult | null;
  readonly entryNeckDiameter: SprueScalarDesignResult | null;
  readonly entryNeckLength: SprueScalarDesignResult | null;
  readonly warnings: readonly string[];
}

function createFallbackResult(
  warning: string,
): SprueProfileDesignResult {
  return {
    profile: {
      ...DEFAULT_SPRUE_PROFILE,
    },
    source: "fallback",
    mainSection: null,
    entryNeckDiameter: null,
    entryNeckLength: null,
    warnings: [warning],
  };
}

export function designSprueProfile(
  context: SprueGeometryContext | null,
  policy: SprueGeometryPolicy = GENERIC_SPRUE_GEOMETRY_POLICY,
): SprueProfileDesignResult {
  if (context === null) {
    return createFallbackResult(
      "Sprue geometry context is unavailable. Default profile applied.",
    );
  }

  const mainSection = designMainSprueDiameterMm(
    context,
    policy,
  );

  if (mainSection === null) {
    return createFallbackResult(
      "Main sprue diameter design failed. Default profile applied.",
    );
  }

  const entryNeckDiameter = designEntryNeckDiameterMm(
    mainSection.valueMm,
    policy,
  );

  if (entryNeckDiameter === null) {
    return createFallbackResult(
      "Entry neck diameter design failed. Default profile applied.",
    );
  }

  const entryNeckLength = designEntryNeckLengthMm(
    context,
    mainSection,
    entryNeckDiameter,
    policy,
  );

  if (entryNeckLength === null) {
    return createFallbackResult(
      "Entry neck length design failed. Default profile applied.",
    );
  }

  const profile: SprueProfileDimensions = {
    mainDiameterMm: mainSection.valueMm,
    entryNeckDiameterMm: entryNeckDiameter.valueMm,
    entryNeckLengthMm: entryNeckLength.valueMm,
  };

  if (!isValidSprueProfile(profile)) {
    return createFallbackResult(
      "Geometry-derived sprue profile is invalid. Default profile applied.",
    );
  }

  return {
    profile,
    source: "geometry-derived",
    mainSection,
    entryNeckDiameter,
    entryNeckLength,
    warnings: [],
  };
}
