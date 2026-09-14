import { describe, expect, it, vi } from "vitest";

import { canonicalCube } from "../../cavity-generation/cavityGeneration.testFixtures";
import type { MasterMoldProjectSnapshot } from "./contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";

// Execution 05 Articles 05/08/09 engine acceptance:
//   Golden Case A -- simple part, one obvious pour face, one-piece release.
//   Golden Case B -- undercut/shoulder part with a recess opening on a stock
//   face; one-piece release must fail and the multi-piece planner must
//   produce a verified 2-piece tooling set with a planar parting surface.
// Both run from pure project truth: Create Cavity is never touched.

function stockBoxPayload(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) {
  const positions = [
    min.x, min.y, min.z, max.x, min.y, min.z, max.x, max.y, min.z, min.x, max.y, min.z,
    min.x, min.y, max.z, max.x, min.y, max.z, max.x, max.y, max.z, min.x, max.y, max.z,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  return { mesh: { positions, indices }, bounds: { min, max }, volumeMm3: (max.x - min.x) * (max.y - min.y) * (max.z - min.z) };
}

/**
 * A stepped through-hole: a wide 10x10 section (z in [0,6]) and a narrow 4x4
 * section (z in [6,12]), spanning the full stock. No rigid one-piece case
 * can release it (the step shears in every translation direction), but a
 * planar parting at the step level yields two verified pieces: each half's
 * fill withdraws through its own, wider hole section.
 */
async function steppedThroughPartPayload() {
  const { getManifoldModule, createBlankSolid, payloadFromManifold, boundsFromManifold } = await import("../../geometry/manifold");
  const module = await getManifoldModule();
  const wide = createBlankSolid(module, { min: { x: -5, y: -5, z: -1 }, max: { x: 5, y: 5, z: 6 } });
  const narrow = createBlankSolid(module, { min: { x: -2, y: -2, z: 6 }, max: { x: 2, y: 2, z: 13 } });
  const shape = wide.add(narrow);
  const mesh = payloadFromManifold(shape);
  const bounds = boundsFromManifold(shape);
  wide.delete();
  narrow.delete();
  shape.delete();
  return { mesh, bounds };
}

async function snapshotFor(part: { positions: readonly number[]; indices: readonly number[]; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }): Promise<MasterMoldProjectSnapshot> {
  const stock = stockBoxPayload({ x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 12 });
  return {
    schemaVersion: 1,
    snapshotId: "engine-snap-1",
    sourceModelGeometryIdentity: "model:engine-test",
    sourcePartMesh: {
      modelId: "m",
      positions: part.positions,
      indices: part.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: part.bounds,
      geometryVersion: "part:engine-test",
      sourceSignature: "engine-test-signature",
    },
    committedMoldParts: [
      { id: "mold-1", name: "Mold 1", mesh: stock.mesh, bounds: stock.bounds, volumeMm3: stock.volumeMm3, geometryVersion: "stock:1" },
    ],
    moldPartOffset: { x: 0, y: 0, z: 0 },
    moldDefinitionId: "def-engine",
    moldDefinition: {
      schemaVersion: 1,
      definitionId: "def-engine",
      modelId: "m",
      coordinateSystem: { units: "millimeters", upAxis: "Z" },
      selectionBoxBounds: part.bounds,
      referenceMoldBlock: { clearanceMm: 10, bounds: stock.bounds },
      usedFaces: [],
    },
    cuttingPlanes: [],
    referenceMoldBlockBounds: stock.bounds,
    sprueIntents: [],
    registrationPolicy: null,
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: 1,
    projectFingerprint: "engine-fp",
  };
}

vi.mock("../../cavity-generation/cavityGeneration.workerClient", () => ({
  runCavityGenerationInWorker: vi.fn(() => {
    throw new Error("The Master Mold engine must never invoke the Cavity worker.");
  }),
  cancelActiveCavityGeneration: vi.fn(),
}));

describe("Master Mold Engine end-to-end (Execution 05 Articles 05–09)", () => {
  it("Golden Case A: a simple part yields a verified one-piece tooling set", { timeout: 120_000 }, async () => {
    // A recess-free cast target (the part does not cut the stock here) is
    // the simple case: one obvious pour face, one-piece case release.
    const part = canonicalCube("m", { min: { x: -3, y: -3, z: 13 }, max: { x: 3, y: 3, z: 15 } });
    const result = await runMasterMoldEngine(await snapshotFor({ ...part, bounds: part.localBounds }));

    expect(result.failures).toEqual([]);
    expect(result.toolingSets).toHaveLength(1);
    const set = result.toolingSets[0]!;
    expect(set.releaseMode).toBe("one-piece");
    expect(set.assembly.pieces).toHaveLength(1);
    expect(set.assembly.releaseSequence).toHaveLength(1);
    expect(set.assembly.releaseSequence[0]!.collisionVerified).toBe(true);
    expect(set.pourFaceDecision.selected).not.toBeNull();
    expect(set.assembly.pieces[0]!.watertight).toBe(true);
    expect(set.assembly.pieces[0]!.manifold).toBe(true);
  });

  it("Golden Case B: an undercut part fails one-piece release and converts into a verified multi-piece tooling set", { timeout: 120_000 }, async () => {
    const stepped = await steppedThroughPartPayload();
    const result = await runMasterMoldEngine(await snapshotFor({ ...stepped.mesh, bounds: stepped.bounds }));

    expect(result.failures).toEqual([]);
    expect(result.toolingSets).toHaveLength(1);
    const set = result.toolingSets[0]!;
    expect(set.releaseMode).toBe("multi-piece");
    expect(set.assembly.pieces.length).toBeGreaterThanOrEqual(2);
    expect(set.partingSurfaces).toHaveLength(1);
    expect(set.partingSurfaces[0]!.kind).toBe("planar");
    expect(set.assembly.releaseSequence.length).toBe(set.assembly.pieces.length);
    expect(set.assembly.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    for (const piece of set.assembly.pieces) {
      expect(piece.manifold).toBe(true);
      expect(piece.volumeMm3).toBeGreaterThan(0);
    }
    // A multi-piece valid result is a real result, never "blocked".
    expect(set.warnings.some((warning) => warning.includes("reusable_plan_not_found"))).toBe(false);
  });

  it("determinism: identical snapshots produce identical tooling set fingerprints", { timeout: 120_000 }, async () => {
    const part = canonicalCube("m", { min: { x: -3, y: -3, z: 13 }, max: { x: 3, y: 3, z: 15 } });
    const a = await runMasterMoldEngine(await snapshotFor({ ...part, bounds: part.localBounds }));
    const b = await runMasterMoldEngine(await snapshotFor({ ...part, bounds: part.localBounds }));
    expect(a.toolingSets.map((set) => set.fingerprint)).toEqual(b.toolingSets.map((set) => set.fingerprint));
  });
});
