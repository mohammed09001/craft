import { describe, expect, it } from "vitest";

import type { Bounds3 } from "../split-face/splitFace.contracts";
import { analyzeMasterMoldOpenDirection } from "./masterMoldDirection.analyzer";
import { MASTER_MOLD_DIRECTIONS } from "./masterMold.contracts";

const PARAMS = { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 };

describe("analyzeMasterMoldOpenDirection", () => {
  it("accepts every direction for a plain box's bounds and deterministically prefers its shortest axis", () => {
    const bounds: Bounds3 = { min: { x: -5, y: -3, z: -2 }, max: { x: 5, y: 3, z: 2 } };

    const analysis = analyzeMasterMoldOpenDirection(bounds, PARAMS);

    expect(analysis.feasible).toBe(true);
    expect(analysis.candidates.every((c) => c.valid)).toBe(true);
    expect(analysis.candidates.every((c) => c.reasonCode === "stock_bounds_valid")).toBe(true);
    // Z is the shortest axis (extent 4 vs 6 and 10), and +Z precedes -Z in
    // direction order, so it must win the depth/volume tie deterministically.
    expect(analysis.selected).toBe("+Z");
  });

  it("marks every orthogonal direction bounds-valid regardless of shape -- Stage A is geometry-independent and cannot see undercuts", () => {
    // A shouldered pedestal's bounding box is dimensionally fine for every
    // orthogonal Master Stock; the fact that only one direction is actually
    // demoldable is a Stage B (precise, real-geometry) question, proven
    // instead by masterMoldGeometry.generator.test.ts against the real
    // generated tool -- never by this bounds-only Stage A (Article 02).
    const bounds: Bounds3 = { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 5 } };

    const analysis = analyzeMasterMoldOpenDirection(bounds, PARAMS);

    expect(analysis.feasible).toBe(true);
    expect(analysis.candidates).toHaveLength(MASTER_MOLD_DIRECTIONS.length);
    for (const candidate of analysis.candidates) {
      expect(candidate.valid).toBe(true);
      expect(candidate.reasonCode).toBe("stock_bounds_valid");
    }
  });

  it("reports infeasibility rather than inventing a direction when the stock bounds are degenerate", () => {
    const bounds: Bounds3 = { min: { x: -5, y: -3, z: -2 }, max: { x: 5, y: 3, z: 2 } };

    const analysis = analyzeMasterMoldOpenDirection(bounds, { ...PARAMS, geometryToleranceMm: 100 });

    expect(analysis.feasible).toBe(false);
    expect(analysis.selected).toBeNull();
    expect(analysis.candidates.every((c) => !c.valid && c.reasonCode === "stock_bounds_invalid")).toBe(true);
  });

  it("is deterministic across repeated runs on the same input", () => {
    const bounds: Bounds3 = { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 5 } };

    const first = analyzeMasterMoldOpenDirection(bounds, PARAMS);
    const second = analyzeMasterMoldOpenDirection(bounds, PARAMS);

    expect(second).toEqual(first);
  });
});
