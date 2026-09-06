import { describe, expect, it } from "vitest";

import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
  isValidSprueGeometryPolicy,
} from "./sprueGeometryPolicy";

describe("sprueGeometryPolicy", () => {
  it("defines a valid generic geometry-only policy", () => {
    expect(
      isValidSprueGeometryPolicy(
        GENERIC_SPRUE_GEOMETRY_POLICY,
      ),
    ).toBe(true);
  });

  it("keeps the protected entry neck no larger than the main section", () => {
    expect(
      GENERIC_SPRUE_GEOMETRY_POLICY.entryNeckDiameterRatio,
    ).toBeLessThanOrEqual(1);
  });

  it("prevents the protected neck from occupying the whole sprue", () => {
    expect(
      GENERIC_SPRUE_GEOMETRY_POLICY.maximumEntryNeckLengthShare,
    ).toBeGreaterThan(0);

    expect(
      GENERIC_SPRUE_GEOMETRY_POLICY.maximumEntryNeckLengthShare,
    ).toBeLessThanOrEqual(1);
  });

  it("rejects inverted limits and invalid ratios", () => {
    expect(
      isValidSprueGeometryPolicy({
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        minimumMainDiameterMm: 10,
        maximumMainDiameterMm: 5,
      }),
    ).toBe(false);

    expect(
      isValidSprueGeometryPolicy({
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        entryNeckDiameterRatio: 1.2,
      }),
    ).toBe(false);

    expect(
      isValidSprueGeometryPolicy({
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        maximumEntryNeckLengthShare: 1.1,
      }),
    ).toBe(false);
  });

  it("rejects non-finite and non-positive policy values", () => {
    expect(
      isValidSprueGeometryPolicy({
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        mainDiameterRatio: Number.NaN,
      }),
    ).toBe(false);

    expect(
      isValidSprueGeometryPolicy({
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        minimumEntryNeckLengthMm: 0,
      }),
    ).toBe(false);
  });
});
