import { describe, expect, it } from "vitest";

import { masterStockBoundsFor } from "./masterMoldDirection.analyzer";

describe("masterStockBoundsFor (case envelope geometry)", () => {
  it("opens the case flush on the pour face and keeps wall thickness on every other side", () => {
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
    expect(masterStockBoundsFor(bounds, "+Z", 3, 3)).toEqual({
      min: { x: -3, y: -3, z: -3 },
      max: { x: 13, y: 13, z: 10 },
    });
    expect(masterStockBoundsFor(bounds, "-Z", 3, 3)).toEqual({
      min: { x: -3, y: -3, z: 0 },
      max: { x: 13, y: 13, z: 13 },
    });
    expect(masterStockBoundsFor(bounds, "+X", 2, 5)).toEqual({
      min: { x: -5, y: -2, z: -2 },
      max: { x: 10, y: 12, z: 12 },
    });
    expect(masterStockBoundsFor(bounds, "-Y", 2, 5)).toEqual({
      min: { x: -2, y: 0, z: -2 },
      max: { x: 12, y: 15, z: 12 },
    });
  });

  it("keeps the envelope non-degenerate for positive-thickness walls", () => {
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
    for (const direction of ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const) {
      const envelope = masterStockBoundsFor(bounds, direction, 1, 1);
      expect(envelope.max.x - envelope.min.x).toBeGreaterThan(0);
      expect(envelope.max.y - envelope.min.y).toBeGreaterThan(0);
      expect(envelope.max.z - envelope.min.z).toBeGreaterThan(0);
    }
  });
});
