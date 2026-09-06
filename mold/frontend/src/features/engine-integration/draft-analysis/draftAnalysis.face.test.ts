import { describe, expect, it } from "vitest";

import { analyzeDraftFaceSample } from "./draftAnalysis.face";

describe("analyzeDraftFaceSample", () => {
  it("creates a positive draft face sample", () => {
    const sample = analyzeDraftFaceSample({
      faceId: "face-positive",
      normal: { x: 0, y: 0, z: 1 },
      pullDirection: { x: 0, y: 0, z: 1 },
      zeroDraftToleranceDegrees: 0.25,
      centroid: { x: 1, y: 2, z: 3 },
      area: 12,
    });

    expect(sample.faceId).toBe("face-positive");
    expect(sample.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(sample.centroid).toEqual({ x: 1, y: 2, z: 3 });
    expect(sample.area).toBe(12);
    expect(sample.draftAngleDegrees).toBeCloseTo(90);
    expect(sample.band).toBe("positive_draft");
  });

  it("creates a zero draft face sample around the side-wall baseline", () => {
    const sample = analyzeDraftFaceSample({
      faceId: "face-zero",
      normal: { x: 1, y: 0, z: 0 },
      pullDirection: { x: 0, y: 0, z: 1 },
      zeroDraftToleranceDegrees: 0.25,
    });

    expect(sample.draftAngleDegrees).toBeCloseTo(0);
    expect(sample.band).toBe("zero_draft");
    expect("centroid" in sample).toBe(false);
    expect("area" in sample).toBe(false);
  });

  it("creates a negative draft face sample", () => {
    const sample = analyzeDraftFaceSample({
      faceId: "face-negative",
      normal: { x: 0, y: 0, z: -1 },
      pullDirection: { x: 0, y: 0, z: 1 },
      zeroDraftToleranceDegrees: 0.25,
    });

    expect(sample.draftAngleDegrees).toBeCloseTo(-90);
    expect(sample.band).toBe("negative_draft");
  });

  it("marks invalid normals as undetermined and omits draftAngleDegrees", () => {
    const sample = analyzeDraftFaceSample({
      faceId: "face-invalid",
      normal: { x: 0, y: 0, z: 0 },
      pullDirection: { x: 0, y: 0, z: 1 },
      zeroDraftToleranceDegrees: 0.25,
    });

    expect(sample.band).toBe("undetermined");
    expect("draftAngleDegrees" in sample).toBe(false);
  });
});
