import { describe, expect, it } from "vitest";

import { calculateCavityAspectRatio } from "./sprueGeometryCalculator";

describe("sprueGeometryCalculator", () => {
  it("returns one for a cubic cavity", () => {
    expect(
      calculateCavityAspectRatio({
        xLengthMm: 100,
        yLengthMm: 100,
        zLengthMm: 100,
      }),
    ).toBe(1);
  });

  it("measures elongation independently of axis orientation", () => {
    expect(
      calculateCavityAspectRatio({
        xLengthMm: 600,
        yLengthMm: 15,
        zLengthMm: 15,
      }),
    ).toBe(40);

    expect(
      calculateCavityAspectRatio({
        xLengthMm: 15,
        yLengthMm: 600,
        zLengthMm: 15,
      }),
    ).toBe(40);

    expect(
      calculateCavityAspectRatio({
        xLengthMm: 15,
        yLengthMm: 15,
        zLengthMm: 600,
      }),
    ).toBe(40);
  });

  it("supports non-integer cavity dimensions", () => {
    expect(
      calculateCavityAspectRatio({
        xLengthMm: 42.5,
        yLengthMm: 20,
        zLengthMm: 10,
      }),
    ).toBeCloseTo(4.25, 10);
  });

  it("rejects zero and negative dimensions", () => {
    expect(
      calculateCavityAspectRatio({
        xLengthMm: 0,
        yLengthMm: 10,
        zLengthMm: 10,
      }),
    ).toBeNull();

    expect(
      calculateCavityAspectRatio({
        xLengthMm: -5,
        yLengthMm: 10,
        zLengthMm: 10,
      }),
    ).toBeNull();
  });

  it("rejects non-finite dimensions", () => {
    expect(
      calculateCavityAspectRatio({
        xLengthMm: Number.NaN,
        yLengthMm: 10,
        zLengthMm: 10,
      }),
    ).toBeNull();

    expect(
      calculateCavityAspectRatio({
        xLengthMm: Number.POSITIVE_INFINITY,
        yLengthMm: 10,
        zLengthMm: 10,
      }),
    ).toBeNull();
  });
});
