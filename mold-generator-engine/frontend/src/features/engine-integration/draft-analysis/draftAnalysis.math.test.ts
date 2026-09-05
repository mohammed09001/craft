import { describe, expect, it } from "vitest";

import {
  clampDraftCosine,
  computeNormalPullAngleDegrees,
  computeSignedDraftAngleDegrees,
  dotDraftVectors,
  getDraftVectorLength,
  normalizeDraftVector,
} from "./draftAnalysis.math";

describe("draftAnalysis.math", () => {
  it("computes vector length and dot product", () => {
    expect(getDraftVectorLength({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(
      dotDraftVectors({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }),
    ).toBe(32);
  });

  it("normalizes valid vectors and rejects zero-length vectors", () => {
    const normalized = normalizeDraftVector({ x: 0, y: 0, z: 2 });

    expect(normalized.length).toBe(2);
    expect(normalized.vector).toEqual({ x: 0, y: 0, z: 1 });

    const zero = normalizeDraftVector({ x: 0, y: 0, z: 0 });

    expect(zero.vector).toBeNull();
    expect(zero.length).toBe(0);
  });

  it("clamps cosine values into the safe acos range", () => {
    expect(clampDraftCosine(-2)).toBe(-1);
    expect(clampDraftCosine(0.5)).toBe(0.5);
    expect(clampDraftCosine(2)).toBe(1);
  });

  it("computes the angle between a normal and pull direction", () => {
    expect(
      computeNormalPullAngleDegrees(
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeCloseTo(0);

    expect(
      computeNormalPullAngleDegrees(
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeCloseTo(90);

    expect(
      computeNormalPullAngleDegrees(
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeCloseTo(180);
  });

  it("computes a signed draft-angle foundation around the side-wall baseline", () => {
    expect(
      computeSignedDraftAngleDegrees(
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeCloseTo(0);

    expect(
      computeSignedDraftAngleDegrees(
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeCloseTo(90);

    expect(
      computeSignedDraftAngleDegrees(
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeCloseTo(-90);
  });

  it("returns null angle when normal or pull direction cannot be normalized", () => {
    expect(
      computeSignedDraftAngleDegrees(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ).angleDegrees,
    ).toBeNull();

    expect(
      computeSignedDraftAngleDegrees(
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ).angleDegrees,
    ).toBeNull();
  });
});
