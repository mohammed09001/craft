import { describe, expect, it } from "vitest";

import { buildMasterMoldSeedSnapshot, worldMeshFromSnapshot } from "../seed/masterMoldSeed";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";

/**
 * Execution 08 LOOP 03: source mesh preflight wired into the engine.
 * Planning must never run on -- and never be blamed for -- a mesh that was
 * never a constructible manufacturing solid in the first place.
 */

const BOX_VERTICES = [
  [-2, -2, -2], [2, -2, -2], [2, 2, -2], [-2, 2, -2],
  [-2, -2, 2], [2, -2, 2], [2, 2, 2], [-2, 2, 2],
];

function closedBoxIndices(): number[] {
  return [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 5, 4, 0, 1, 5,
    1, 6, 5, 1, 2, 6,
    2, 7, 6, 2, 3, 7,
    3, 4, 7, 3, 0, 4,
  ];
}

function seedFromRawMesh(positions: readonly number[], indices: readonly number[], geometryVersion: string) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]!); maxX = Math.max(maxX, positions[i]!);
    minY = Math.min(minY, positions[i + 1]!); maxY = Math.max(maxY, positions[i + 1]!);
    minZ = Math.min(minZ, positions[i + 2]!); maxZ = Math.max(maxZ, positions[i + 2]!);
  }
  const bounds = { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "loop03",
      positions,
      indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: bounds,
      geometryVersion,
      sourceSignature: geometryVersion,
    },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: "loop03-rev",
  }));
}

describe("Master Mold engine mesh preflight (Execution 08 LOOP 03)", () => {
  it("rejects an open (non-watertight) source mesh before planning runs, with a truthful reason", async () => {
    const positions = BOX_VERTICES.flat();
    const indices = closedBoxIndices().slice(0, -6); // drop the top face: the box is open.
    const seed = seedFromRawMesh(positions, indices, "loop03-open");

    const result = await runMasterMoldEngine(seed);

    expect(result.plan).toBeNull();
    expect(result.toolingSets).toEqual([]);
    expect(result.budget.workingMoldConstructionAttempts).toBe(0);
    expect(result.planningDiagnostics).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.reason).toBe("invalid_source_mesh");
    expect(result.failures[0]!.family).toBe("invalid-input");
    expect(result.failures[0]!.message).toMatch(/open_boundary_edge|not closed/i);
  }, 60_000);

  it("proceeds to a real plan for a valid closed mesh, carrying no preflight warning", async () => {
    const positions = BOX_VERTICES.flat();
    const indices = closedBoxIndices();
    const seed = seedFromRawMesh(positions, indices, "loop03-valid");

    const result = await runMasterMoldEngine(seed);

    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.warnings.some((warning) => warning.code === "source_mesh_repairable_warning")).toBe(false);
  }, 60_000);
});
