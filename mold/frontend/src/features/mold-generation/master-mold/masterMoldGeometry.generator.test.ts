import { describe, expect, it } from "vitest";

import type { Bounds3 } from "../split-face/splitFace.contracts";
import { cubeMesh } from "../cavity-generation/cavityGeneration.testFixtures";
import { generateMasterMoldBody } from "./masterMoldGeometry.generator";
import { buildPedestalMesh } from "./masterMold.testFixtures";
import type { MasterMoldParameters, MasterMoldTargetInput } from "./masterMold.contracts";

const PARAMETERS: MasterMoldParameters = { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 };

function targetFor(bounds: Bounds3, id = "part-a"): MasterMoldTargetInput {
  const mesh = cubeMesh(bounds);
  const size = { x: bounds.max.x - bounds.min.x, y: bounds.max.y - bounds.min.y, z: bounds.max.z - bounds.min.z };

  return {
    source: { finalMoldPartId: id, finalMoldPartName: `Final Mold ${id}`, finalMoldGeometryVersion: `geom:${id}:1` },
    mesh,
    bounds,
    volumeMm3: size.x * size.y * size.z,
  };
}

describe("generateMasterMoldBody", () => {
  it("wraps a simple box target in a watertight Master Mold with the expected volume", async () => {
    const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 4 } };
    const target = targetFor(bounds);

    const result = await generateMasterMoldBody(target, PARAMETERS);

    expect(result.status).toBe("current");
    expect(result.failureReason).toBeNull();
    expect(result.watertight).toBe(true);
    expect(result.manifold).toBe(true);
    expect(result.direction).toBe("+Z");
    expect(result.mesh).not.toBeNull();
    expect(result.volumeMm3).not.toBeNull();

    // Stock: X/Y expanded by wall on both sides, Z expanded by bottom on the closed end only, flush on the open end.
    const stockVolume = (10 + 2 * 3) * (6 + 2 * 3) * (4 + 3);
    const targetVolume = 10 * 6 * 4;
    expect(result.volumeMm3!).toBeCloseTo(stockVolume - targetVolume, 3);
  });

  it("blocks generation when the requested wall thickness is below the safe minimum", async () => {
    const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 4 } };
    const target = targetFor(bounds);

    const result = await generateMasterMoldBody(target, { ...PARAMETERS, wallThicknessMm: 0.1 });

    expect(result.status).toBe("blocked");
    expect(result.failureReason).toBe("insufficient_wall_thickness");
    expect(result.mesh).toBeNull();
  });

  it("reports no_valid_open_direction for a target with no feasible one-piece pull direction", async () => {
    const { mesh, bounds } = buildPedestalMesh();
    const target: MasterMoldTargetInput = {
      source: { finalMoldPartId: "pedestal", finalMoldPartName: "Pedestal", finalMoldGeometryVersion: "geom:pedestal:1" },
      mesh,
      bounds,
      volumeMm3: 10 * 10 * 2 + 4 * 4 * 3,
      directionOverride: "+Z",
    };

    const result = await generateMasterMoldBody(target, PARAMETERS);

    expect(result.status).toBe("blocked");
    expect(result.failureReason).toBe("no_valid_open_direction");
    expect(result.direction).toBeNull();
  });

  it("honors a valid direction override instead of the analyzer's own best pick", async () => {
    const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 4 } };
    const target: MasterMoldTargetInput = { ...targetFor(bounds), directionOverride: "-X" };

    const result = await generateMasterMoldBody(target, PARAMETERS);

    expect(result.status).toBe("current");
    expect(result.direction).toBe("-X");
  });

  it("rejects non-finite source geometry up front", async () => {
    const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 4 } };
    const target = targetFor(bounds);
    const brokenTarget: MasterMoldTargetInput = { ...target, mesh: { positions: [...target.mesh.positions.slice(0, -1), Number.NaN], indices: target.mesh.indices } };

    const result = await generateMasterMoldBody(brokenTarget, PARAMETERS);

    expect(result.status).toBe("blocked");
    expect(result.failureReason).toBe("invalid_source_geometry");
  });
});
