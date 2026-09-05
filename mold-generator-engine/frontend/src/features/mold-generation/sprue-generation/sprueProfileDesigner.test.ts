import { describe, expect, it } from "vitest";

import type { SprueGeometryContext } from "./sprueGeometryContext";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
} from "./sprueGeometryPolicy";
import {
  DEFAULT_SPRUE_PROFILE,
} from "./sprueProfile";
import { designSprueProfile } from "./sprueProfileDesigner";

function createContext(
  overrides: Partial<SprueGeometryContext> = {},
): SprueGeometryContext {
  return {
    cavityVolumeMm3: 1000,
    cavityBounds: {
      xLengthMm: 10,
      yLengthMm: 10,
      zLengthMm: 10,
    },
    totalSprueLengthMm: 30,
    equivalentDiameterMm: 50,
    aspectRatio: 1,
    ...overrides,
  };
}

describe("sprueProfileDesigner", () => {
  it("assembles a complete geometry-derived sprue profile", () => {
    const result = designSprueProfile(createContext());

    expect(result.source).toBe("geometry-derived");
    expect(result.profile.mainDiameterMm).toBeCloseTo(4, 10);
    expect(result.profile.entryNeckDiameterMm).toBeCloseTo(
      2.8,
      10,
    );
    expect(result.profile.entryNeckLengthMm).toBeCloseTo(
      4.48,
      10,
    );

    expect(result.mainSection?.source).toBe("equation");
    expect(result.entryNeckDiameter?.source).toBe("equation");
    expect(result.entryNeckLength?.source).toBe("equation");
    expect(result.warnings).toEqual([]);
  });

  it("preserves explainable limit decisions", () => {
    const result = designSprueProfile(
      createContext({
        equivalentDiameterMm: 10,
      }),
    );

    expect(result.source).toBe("geometry-derived");
    expect(result.profile.mainDiameterMm).toBe(
      GENERIC_SPRUE_GEOMETRY_POLICY.minimumMainDiameterMm,
    );
    expect(result.mainSection?.source).toBe("minimum-limit");
    expect(result.entryNeckDiameter?.source).toBe(
      "minimum-limit",
    );
  });

  it("uses the default profile when context is unavailable", () => {
    const result = designSprueProfile(null);

    expect(result).toEqual({
      profile: DEFAULT_SPRUE_PROFILE,
      source: "fallback",
      mainSection: null,
      entryNeckDiameter: null,
      entryNeckLength: null,
      warnings: [
        "Sprue geometry context is unavailable. Default profile applied.",
      ],
    });
  });

  it("uses the default profile when the geometry is invalid", () => {
    const result = designSprueProfile(
      createContext({
        equivalentDiameterMm: Number.NaN,
      }),
    );

    expect(result.profile).toEqual(DEFAULT_SPRUE_PROFILE);
    expect(result.source).toBe("fallback");
    expect(result.mainSection).toBeNull();
    expect(result.entryNeckDiameter).toBeNull();
    expect(result.entryNeckLength).toBeNull();
    expect(result.warnings).toEqual([
      "Main sprue diameter design failed. Default profile applied.",
    ]);
  });

  it("uses the default profile when the policy is invalid", () => {
    const result = designSprueProfile(createContext(), {
      ...GENERIC_SPRUE_GEOMETRY_POLICY,
      mainDiameterRatio: 0,
    });

    expect(result.profile).toEqual(DEFAULT_SPRUE_PROFILE);
    expect(result.source).toBe("fallback");
    expect(result.warnings).toEqual([
      "Main sprue diameter design failed. Default profile applied.",
    ]);
  });
});
