export interface SprueGeometryPolicy {
  readonly mainDiameterRatio: number;
  readonly minimumMainDiameterMm: number;
  readonly maximumMainDiameterMm: number;

  readonly entryNeckDiameterRatio: number;
  readonly minimumEntryNeckDiameterMm: number;
  readonly maximumEntryNeckDiameterMm: number;

  readonly entryNeckLengthToDiameterRatio: number;
  readonly minimumEntryNeckLengthMm: number;
  readonly maximumEntryNeckLengthMm: number;
  readonly maximumEntryNeckLengthShare: number;
}

export const GENERIC_SPRUE_GEOMETRY_POLICY: SprueGeometryPolicy = {
  mainDiameterRatio: 0.08,
  minimumMainDiameterMm: 2.5,
  maximumMainDiameterMm: 20,

  entryNeckDiameterRatio: 0.7,
  minimumEntryNeckDiameterMm: 2.5,
  maximumEntryNeckDiameterMm: 12,

  entryNeckLengthToDiameterRatio: 1.6,
  minimumEntryNeckLengthMm: 2,
  maximumEntryNeckLengthMm: 12,
  maximumEntryNeckLengthShare: 0.4,
};

export function isValidSprueGeometryPolicy(
  policy: SprueGeometryPolicy,
): boolean {
  const values = [
    policy.mainDiameterRatio,
    policy.minimumMainDiameterMm,
    policy.maximumMainDiameterMm,
    policy.entryNeckDiameterRatio,
    policy.minimumEntryNeckDiameterMm,
    policy.maximumEntryNeckDiameterMm,
    policy.entryNeckLengthToDiameterRatio,
    policy.minimumEntryNeckLengthMm,
    policy.maximumEntryNeckLengthMm,
    policy.maximumEntryNeckLengthShare,
  ];

  if (
    values.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    return false;
  }

  if (
    policy.minimumMainDiameterMm >
    policy.maximumMainDiameterMm
  ) {
    return false;
  }

  if (
    policy.minimumEntryNeckDiameterMm >
    policy.maximumEntryNeckDiameterMm
  ) {
    return false;
  }

  if (
    policy.minimumEntryNeckLengthMm >
    policy.maximumEntryNeckLengthMm
  ) {
    return false;
  }

  if (
    policy.entryNeckDiameterRatio > 1 ||
    policy.maximumEntryNeckLengthShare > 1
  ) {
    return false;
  }

  return true;
}
