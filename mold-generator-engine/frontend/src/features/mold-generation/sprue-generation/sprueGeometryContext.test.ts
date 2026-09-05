import { describe, expect, it } from "vitest";

import { buildSprueGeometryContext } from "./sprueGeometryContext";

describe("sprueGeometryContext", () => {
  it("builds a reusable geometry context from valid cavity data", () => {
    const sphereDiameterMm = 10;
    const sphereVolumeMm3 =
      (Math.PI / 6) * sphereDiameterMm ** 3;

    const context = buildSprueGeometryContext({
      cavityVolumeMm3: sphereVolumeMm3,
      cavityBounds: {
        xLengthMm: 40,
        yLengthMm: 20,
        zLengthMm: 10,
      },
      totalSprueLengthMm: 30,
    });

    expect(context).not.toBeNull();
    expect(context?.equivalentDiameterMm).toBeCloseTo(10, 10);
    expect(context?.aspectRatio).toBe(4);
    expect(context?.totalSprueLengthMm).toBe(30);
    expect(context?.cavityVolumeMm3).toBeCloseTo(
      sphereVolumeMm3,
      10,
    );
    expect(context?.cavityBounds).toEqual({
      xLengthMm: 40,
      yLengthMm: 20,
      zLengthMm: 10,
    });
  });

  it("rejects an invalid cavity volume", () => {
    expect(
      buildSprueGeometryContext({
        cavityVolumeMm3: 0,
        cavityBounds: {
          xLengthMm: 10,
          yLengthMm: 10,
          zLengthMm: 10,
        },
        totalSprueLengthMm: 20,
      }),
    ).toBeNull();
  });

  it("rejects invalid cavity bounds", () => {
    expect(
      buildSprueGeometryContext({
        cavityVolumeMm3: 1000,
        cavityBounds: {
          xLengthMm: 10,
          yLengthMm: 0,
          zLengthMm: 10,
        },
        totalSprueLengthMm: 20,
      }),
    ).toBeNull();
  });

  it("rejects invalid total sprue lengths", () => {
    const baseInput = {
      cavityVolumeMm3: 1000,
      cavityBounds: {
        xLengthMm: 10,
        yLengthMm: 10,
        zLengthMm: 10,
      },
    };

    expect(
      buildSprueGeometryContext({
        ...baseInput,
        totalSprueLengthMm: 0,
      }),
    ).toBeNull();

    expect(
      buildSprueGeometryContext({
        ...baseInput,
        totalSprueLengthMm: -5,
      }),
    ).toBeNull();

    expect(
      buildSprueGeometryContext({
        ...baseInput,
        totalSprueLengthMm: Number.NaN,
      }),
    ).toBeNull();

    expect(
      buildSprueGeometryContext({
        ...baseInput,
        totalSprueLengthMm: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});
