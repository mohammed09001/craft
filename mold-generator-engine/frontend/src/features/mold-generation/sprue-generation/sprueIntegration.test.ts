import { describe, expect, it } from "vitest";

import { DEFAULT_SPRUE_PROFILE } from "./sprueProfile";
import { resolveSprueIntegration } from "./sprueIntegration";

describe("resolveSprueIntegration", () => {
  it("returns one geometry-derived profile for downstream preview and Boolean consumers", () => {
    const result = resolveSprueIntegration({
      cavityVolumeMm3: 1_000,
      cavityBounds: {
        xLengthMm: 10,
        yLengthMm: 10,
        zLengthMm: 10,
      },
      totalSprueLengthMm: 20,
    });

    expect(result.context).not.toBeNull();
    expect(result.design.source).toBe("geometry-derived");
    expect(result.design.profile.mainDiameterMm).toBeGreaterThan(0);
    expect(result.design.profile.entryNeckDiameterMm).toBeGreaterThan(0);
    expect(result.design.profile.entryNeckLengthMm).toBeGreaterThan(0);
  });

  it("returns the controlled fallback profile when geometry context is invalid", () => {
    const result = resolveSprueIntegration({
      cavityVolumeMm3: 1_000,
      cavityBounds: {
        xLengthMm: 10,
        yLengthMm: 10,
        zLengthMm: 10,
      },
      totalSprueLengthMm: 0,
    });

    expect(result.context).toBeNull();
    expect(result.design.source).toBe("fallback");
    expect(result.design.profile).toEqual(DEFAULT_SPRUE_PROFILE);
    expect(result.design.warnings).toHaveLength(1);
  });
});
