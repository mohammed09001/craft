import { clampGuideProgress, createCuttingGuides, deriveCuttingGuideGeometry, deriveGroundZ } from "./cuttingGuide.geometry";

const bounds = { min: { x: -10, y: -20, z: -30 }, max: { x: 40, y: 60, z: 70 } };

describe("K2 cutting guide geometry", () => {
  it("derives Z2 and Z4 dimensions and directional ranges from K2", () => {
    expect(deriveCuttingGuideGeometry(bounds, "topToBottom", 0.25)).toEqual({ position: 45, width: 50, height: 80, travelRange: { from: 70, to: -30 } });
    expect(deriveCuttingGuideGeometry(bounds, "frontToBack", 0.25)).toEqual({ position: 0, width: 50, height: 100, travelRange: { from: -20, to: 60 } });
  });
  it("clamps progress and rejects invalid bounds", () => {
    expect(clampGuideProgress(-2)).toBe(0); expect(clampGuideProgress(2)).toBe(1); expect(clampGuideProgress(Number.NaN)).toBe(0);
    expect(createCuttingGuides({ ...bounds, max: { ...bounds.max, z: Number.NaN } })).toBeNull();
  });
  it("grounds at K2 bottom with fallback when K2 is absent", () => {
    expect(deriveGroundZ(0, null)).toBe(0); expect(deriveGroundZ(0, bounds)).toBe(-30);
    expect(deriveGroundZ(0, { ...bounds, min: { ...bounds.min, z: -50 } })).toBe(-50);
  });
});
