import {
  AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM,
  clampReferenceMoldClearance,
  createAutomaticSegmentationMoldFrameBounds,
  createReferenceMoldBlockBounds,
  DEFAULT_REFERENCE_MOLD_CLEARANCE_MM,
  MAX_REFERENCE_MOLD_CLEARANCE_MM,
  MIN_REFERENCE_MOLD_CLEARANCE_MM,
} from "./referenceMoldBlock.geometry";

const inner = { min: { x: 0, y: 10, z: -5 }, max: { x: 20, y: 30, z: 15 } };

describe("reference mold block geometry", () => {
  it("expands all six sides by the default 10 mm without mutating K1", () => {
    const before = structuredClone(inner);
    const outer = createReferenceMoldBlockBounds(inner, DEFAULT_REFERENCE_MOLD_CLEARANCE_MM);
    expect(outer).toEqual({ min: { x: -10, y: 0, z: -15 }, max: { x: 30, y: 40, z: 25 } });
    expect(inner).toEqual(before);
  });

  it("preserves the center and changes deterministically", () => {
    const outer = createReferenceMoldBlockBounds(inner, 150)!;
    expect(outer).toEqual(createReferenceMoldBlockBounds(inner, 150));
    expect((outer.min.x + outer.max.x) / 2).toBe((inner.min.x + inner.max.x) / 2);
    expect((outer.min.y + outer.max.y) / 2).toBe((inner.min.y + inner.max.y) / 2);
    expect((outer.min.z + outer.max.z) / 2).toBe((inner.min.z + inner.max.z) / 2);
  });

  it("clamps controls and rejects invalid bounds or direct invalid clearances", () => {
    expect(clampReferenceMoldClearance(-5)).toBe(MIN_REFERENCE_MOLD_CLEARANCE_MM);
    expect(clampReferenceMoldClearance(500)).toBe(MAX_REFERENCE_MOLD_CLEARANCE_MM);
    expect(createReferenceMoldBlockBounds(inner, 0)).toBeNull();
    expect(createReferenceMoldBlockBounds({ ...inner, max: { ...inner.max, z: Number.NaN } }, 10)).toBeNull();
    expect(createReferenceMoldBlockBounds({ ...inner, min: inner.max }, 10)).toBeNull();
  });

  it("keeps normal clearance policy unchanged while automatic Segmentation enforces 100 mm", () => {
    expect(DEFAULT_REFERENCE_MOLD_CLEARANCE_MM).toBe(10);
    expect(AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM).toBe(100);

    const frame = createAutomaticSegmentationMoldFrameBounds(inner, 10)!;
    expect(frame.partOffset.z).toBe(100);
    expect(frame.selectionBoxBounds).toEqual({
      min: { x: 0, y: 10, z: 95 },
      max: { x: 20, y: 30, z: 115 },
    });
    expect(frame.referenceMoldBlockBounds).toEqual({
      min: { x: -100, y: -90, z: -5 },
      max: { x: 120, y: 130, z: 215 },
    });
  });

  it("allows automatic Segmentation clearance to increase but never fall below 100 mm", () => {
    expect(
      createAutomaticSegmentationMoldFrameBounds(inner, 1)!.partOffset.z,
    ).toBe(100);
    expect(
      createAutomaticSegmentationMoldFrameBounds(inner, 200)!.partOffset.z,
    ).toBe(200);
  });
});
