import { describe, expect, it } from "vitest";

import type { Bounds3 } from "../split-face/splitFace.contracts";
import { cubeMesh } from "../cavity-generation/cavityGeneration.testFixtures";
import { createBlankSolid, getManifoldModule, payloadFromManifold, boundsFromManifold } from "../cavity-generation/manifold.engine";
import { analyzeMasterMoldOpenDirection } from "./masterMoldDirection.analyzer";
import { buildPedestalMesh } from "./masterMold.testFixtures";
import { MASTER_MOLD_DIRECTIONS } from "./masterMold.contracts";

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

  it("blocks every orthogonal direction for a narrow-neck 'hourglass' trap (wide base and wide top separated by a narrow waist)", async () => {
    // Wide base (z:[0,2]) fused to a narrow waist (z:[2,4]) fused to a wide top
    // (z:[4,6]), all centered on Z -- built via real Manifold unions so the
    // fixture is guaranteed watertight/manifold. Pulling up traps the wide
    // base behind the waist's narrower shoulder; pulling down traps the wide
    // top the same way; pulling sideways scrapes the waist against the shell
    // that fills the space the wide ends occupy at that height. No orthogonal
    // direction is a genuine one-piece pull (Article 03's "narrow-neck trap").
    const module = await getManifoldModule();
    const base = createBlankSolid(module, { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 2 } });
    const waist = createBlankSolid(module, { min: { x: -1, y: -1, z: 2 }, max: { x: 1, y: 1, z: 4 } });
    const top = createBlankSolid(module, { min: { x: -5, y: -5, z: 4 }, max: { x: 5, y: 5, z: 6 } });
    const hourglass = base.add(waist).add(top);
    const mesh = payloadFromManifold(hourglass);
    const bounds = boundsFromManifold(hourglass);
    base.delete();
    waist.delete();
    top.delete();
    hourglass.delete();

    const analysis = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);

    expect(analysis.feasible).toBe(false);
    expect(analysis.selected).toBeNull();
    expect(analysis.candidates).toHaveLength(MASTER_MOLD_DIRECTIONS.length);
    for (const candidate of analysis.candidates) {
      expect(candidate.valid).toBe(false);
      expect(candidate.reasonCode).toBe("undercut_detected");
    }
  });

  it("is deterministic across repeated runs on the same input", () => {
    const { mesh, bounds } = buildPedestalMesh();

    const first = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);
    const second = analyzeMasterMoldOpenDirection(mesh, bounds, PARAMS);

    expect(second).toEqual(first);
  });
});
