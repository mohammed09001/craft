import { describe, expect, it } from "vitest";

import type { Bounds3 } from "../split-face/splitFace.contracts";
import { cubeMesh } from "../cavity-generation/cavityGeneration.testFixtures";
import { analyzeMasterMoldOpenDirection } from "./masterMoldDirection.analyzer";
import { buildPedestalMesh } from "./masterMold.testFixtures";

const buildBoxMesh = cubeMesh;

const PARAMS = { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 };

describe("analyzeMasterMoldOpenDirection", () => {
  it("accepts every direction for a plain box and deterministically prefers its shortest axis", () => {
    const bounds: Bounds3 = { min: { x: -5, y: -3, z: -2 }, max: { x: 5, y: 3, z: 2 } };
    const mesh = buildBoxMesh(bounds);

    const analysis = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);

    expect(analysis.feasible).toBe(true);
    expect(analysis.candidates.every((c) => c.valid)).toBe(true);
    // Z is the shortest axis (extent 4 vs 6 and 10), and +Z precedes -Z in
    // direction order, so it must win the depth/volume tie deterministically.
    expect(analysis.selected).toBe("+Z");
  });

  it("blocks every direction except the one through the wide end of a shouldered pedestal", () => {
    const { mesh, bounds } = buildPedestalMesh();

    const analysis = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);

    expect(analysis.feasible).toBe(true);
    expect(analysis.selected).toBe("-Z");

    const byDirection = new Map(analysis.candidates.map((c) => [c.direction, c]));
    expect(byDirection.get("-Z")?.valid).toBe(true);

    for (const direction of ["+X", "-X", "+Y", "-Y", "+Z"] as const) {
      const candidate = byDirection.get(direction)!;
      expect(candidate.valid).toBe(false);
      expect(candidate.reasonCode).toBe("undercut_detected");
    }
  });

  it("reports infeasibility rather than inventing a direction when geometry is degenerate", () => {
    const bounds: Bounds3 = { min: { x: -5, y: -3, z: -2 }, max: { x: 5, y: 3, z: 2 } };
    const mesh = buildBoxMesh(bounds);

    const analysis = analyzeMasterMoldOpenDirection(mesh, bounds, { ...PARAMS, geometryToleranceMm: 100 });

    expect(analysis.feasible).toBe(false);
    expect(analysis.selected).toBeNull();
    expect(analysis.candidates.every((c) => !c.valid && c.reasonCode === "stock_bounds_invalid")).toBe(true);
  });

  it("is deterministic across repeated runs on the same input", () => {
    const { mesh, bounds } = buildPedestalMesh();

    const first = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);
    const second = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);

    expect(second).toEqual(first);
  });
});
