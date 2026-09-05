export const DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM = 2.5;
export const DEFAULT_SPRUE_ENTRY_NECK_LENGTH_MM = 4;
export const SPRUE_CIRCULAR_SEGMENTS = 32 as const;
export const MIN_SPRUE_DIAMETER_MM = 2;
export const MAX_SPRUE_DIAMETER_MM = 50;

export function normalizeSprueDiameterMm(
  diameterMm: number,
  minimumCoupledDiameterMm = 0,
): number | null {
  if (!Number.isFinite(diameterMm)) return null;
  return Math.min(
    MAX_SPRUE_DIAMETER_MM,
    Math.max(MIN_SPRUE_DIAMETER_MM, minimumCoupledDiameterMm, diameterMm),
  );
}

/** Entry neck (lower opening) diameter is coupled to an upper bound, not a lower one: it may never exceed the main diameter. */
export function normalizeSprueEntryNeckDiameterMm(
  diameterMm: number,
  maximumCoupledDiameterMm: number,
): number | null {
  if (!Number.isFinite(diameterMm)) return null;
  return Math.min(
    MAX_SPRUE_DIAMETER_MM,
    maximumCoupledDiameterMm,
    Math.max(MIN_SPRUE_DIAMETER_MM, diameterMm),
  );
}

export interface SprueProfileDimensions {
  readonly mainDiameterMm: number;
  readonly entryNeckDiameterMm: number;
  readonly entryNeckLengthMm: number;
}

export interface SprueProfileCalculatorInput {
  readonly cavityVolumeMm3: number | null;
  readonly totalSprueLengthMm: number;
}

export type SprueProfileCalculationSource =
  | "geometry-derived"
  | "fallback";

export interface SprueProfileCalculationResult {
  readonly dimensions: SprueProfileDimensions;
  readonly source: SprueProfileCalculationSource;
  readonly warnings: readonly string[];
}

export const DEFAULT_SPRUE_PROFILE: SprueProfileDimensions = {
  mainDiameterMm: DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM,
  entryNeckDiameterMm: DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM,
  entryNeckLengthMm: DEFAULT_SPRUE_ENTRY_NECK_LENGTH_MM,
};

export function calculateEquivalentDiameterMm(
  cavityVolumeMm3: number,
): number | null {
  if (!Number.isFinite(cavityVolumeMm3) || cavityVolumeMm3 <= 0) {
    return null;
  }

  const equivalentDiameterMm = Math.cbrt(
    (6 * cavityVolumeMm3) / Math.PI,
  );

  if (
    !Number.isFinite(equivalentDiameterMm) ||
    equivalentDiameterMm <= 0
  ) {
    return null;
  }

  return equivalentDiameterMm;
}
export function isValidSprueProfile(
  profile: SprueProfileDimensions,
): boolean {
  return (
    Number.isFinite(profile.mainDiameterMm) &&
    Number.isFinite(profile.entryNeckDiameterMm) &&
    Number.isFinite(profile.entryNeckLengthMm) &&
    profile.mainDiameterMm > 0 &&
    profile.entryNeckDiameterMm > 0 &&
    profile.entryNeckLengthMm > 0 &&
    profile.mainDiameterMm >= profile.entryNeckDiameterMm
  );
}

