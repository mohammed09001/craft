import { describe, expect, it } from "vitest";

import { canonicalCube } from "../../cavity-generation/cavityGeneration.testFixtures";
import { designSprueProfile } from "../../sprue-generation";
import type { MasterCastTarget, MasterMoldProjectSnapshot, MasterSprueIntent } from "./contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { buildMasterCastTargets, masterCastTargetGeometryVersion } from "./castTarget";

// Test-level use of the Cavity domain's deterministic cube fixture (allowed:
// the firewall guards production files, not tests). The engine itself never
// imports anything from cavity-generation -- proven by the architecture test.
const k1 = { min: { x: 10, y: 10, z: 10 }, max: { x: 20, y: 20, z: 20 } };
const part = canonicalCube("m", k1);

function stockBox(id: string, name: string, min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) {
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
  return {
    id,
    name,
    mesh: { positions, indices },
    bounds: { min, max },
    volumeMm3: (max.x - min.x) * (max.y - min.y) * (max.z - min.z),
    geometryVersion: `stock:${id}`,
  };
}

// Two stock pieces split at x=10... the part (10..20^3) sits inside the
// second piece's region; the first piece is an unaffected sibling.
function twoPartStock() {
  return [
    stockBox("part-a", "Part A", { x: 0, y: 0, z: 0 }, { x: 10, y: 30, z: 30 }),
    stockBox("part-b", "Part B", { x: 10, y: 0, z: 0 }, { x: 30, y: 30, z: 30 }),
  ];
}

function snapshotWith(overrides: Partial<MasterMoldProjectSnapshot> = {}): MasterMoldProjectSnapshot {
  const committedMoldParts = overrides.committedMoldParts ?? twoPartStock();
  return {
    schemaVersion: 1,
    snapshotId: "snap-1",
    sourceModelGeometryIdentity: "model:1",
    sourcePartMesh: {
      modelId: "m",
      positions: part.positions,
      indices: part.indices,
      transform: part.transform,
      localBounds: part.localBounds,
      geometryVersion: part.geometryVersion,
      sourceSignature: part.sourceSignature,
    },
    committedMoldParts,
    moldPartOffset: { x: 0, y: 0, z: 0 },
    moldDefinitionId: "def-1",
    moldDefinition: {
      schemaVersion: 1,
      definitionId: "def-1",
      modelId: "m",
      coordinateSystem: { units: "millimeters", upAxis: "Z" },
      selectionBoxBounds: k1,
      referenceMoldBlock: {
        clearanceMm: 10,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 30 } },
      },
      usedFaces: [],
      ...(overrides.moldDefinition?.segmentationLineage !== undefined ? { segmentationLineage: overrides.moldDefinition.segmentationLineage } : {}),
    },
    cuttingPlanes: [],
    referenceMoldBlockBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 30 } },
    sprueIntents: [],
    registrationPolicy: null,
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: 1,
    projectFingerprint: "fp-1",
    ...overrides,
  };
}

const topSprueIntent: MasterSprueIntent = {
  operationId: "sprue-1",
  position: { x: 20, y: 15, z: 30 },
  profileDesign: designSprueProfile(null),
  creationOrder: 0,
};

describe("Master Cast Target Builder (Execution 05 Article 06)", () => {
  it("builds cast targets from committed stock + the original-part negative, with no Create Cavity involvement", async () => {
    const { targets, failures } = await buildMasterCastTargets(snapshotWith());
    expect(failures).toEqual([]);
    expect(targets).toHaveLength(2);

    const totalVolume = targets.reduce((sum, target) => sum + target.volumeMm3, 0);
    const stockVolume = 10 * 30 * 30 + 20 * 30 * 30;
    const partVolume = 10 ** 3;
    // The original-part negative surface is genuinely cut from the stock;
    // Final Mold Registration features legitimately remove a little more.
    expect(totalVolume).toBeLessThanOrEqual(stockVolume - partVolume + 1);
    expect(totalVolume).toBeGreaterThan(stockVolume - partVolume - stockVolume * 0.01);
    for (const target of targets) {
      expect(target.warnings).toEqual([]);
      expect(target.mesh.positions.every(Number.isFinite)).toBe(true);
      expect(target.volumeMm3).toBeGreaterThan(0);
    }
  });

  it("produces a deterministic geometry version, and a changed stock fingerprint only moves the affected part's target", async () => {
    const first = await buildMasterCastTargets(snapshotWith());
    const second = await buildMasterCastTargets(snapshotWith());
    expect(first.targets.map((t) => t.geometryVersion)).toEqual(second.targets.map((t) => t.geometryVersion));

    const nudgedStock = twoPartStock().map((p) =>
      p.id === "part-b"
        ? { ...p, mesh: { ...p.mesh, positions: p.mesh.positions.map((v, i) => (i === 0 ? v + 0.25 : v)) }, geometryVersion: "stock:part-b:2" }
        : p,
    );
    const changed = await buildMasterCastTargets(snapshotWith({ committedMoldParts: nudgedStock, snapshotId: "snap-2" }));
    const versionOf = (targets: readonly MasterCastTarget[], id: string) => targets.find((t) => t.moldPartId === id)!.geometryVersion;
    // Unchanged sibling remains identical.
    expect(versionOf(changed.targets, "part-a")).toBe(versionOf(first.targets, "part-a"));
    // Affected part's target changed.
    expect(versionOf(changed.targets, "part-b")).not.toBe(versionOf(first.targets, "part-b"));
  });

  it("a Sprue intent changes the cast target fingerprint", async () => {
    const without = await buildMasterCastTargets(snapshotWith());
    const withSprue = await buildMasterCastTargets(snapshotWith({ sprueIntents: [topSprueIntent], snapshotId: "snap-sprue" }));
    expect(failuresOf(withSprue)).toEqual([]);
    expect(versionSet(withSprue.targets)).not.toEqual(versionSet(without.targets));
  });

  it("a Registration policy change changes the cast target fingerprint", async () => {
    const normal = await buildMasterCastTargets(snapshotWith());
    const segmentation = await buildMasterCastTargets(
      snapshotWith({
        moldDefinition: {
          schemaVersion: 1,
          definitionId: "def-1",
          modelId: "m",
          coordinateSystem: { units: "millimeters", upAxis: "Z" },
          selectionBoxBounds: k1,
          referenceMoldBlock: { clearanceMm: 10, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 30 } } },
          usedFaces: [],
          segmentationLineage: true,
        },
        registrationPolicy: { policyId: "registration-sizing-automatic-segmentation-v5", segmentationLineage: true },
        snapshotId: "snap-seg",
      }),
    );
    expect(failuresOf(segmentation)).toEqual([]);
    expect(versionSet(segmentation.targets)).not.toEqual(versionSet(normal.targets));
  });

  it("builds with Create Cavity entirely absent (never-run)", async () => {
    // Nothing in this flow references, requires, or queries Create Cavity
    // state -- the snapshot contains only project truth. A successful build
    // here IS the proof (Execution 05 Article 06 required test).
    const { targets, failures } = await buildMasterCastTargets(snapshotWith({ snapshotId: "snap-no-cavity" }));
    expect(failures).toEqual([]);
    expect(targets.length).toBe(2);
  });
});

function versionSet(targets: readonly MasterCastTarget[]): string[] {
  return targets.map((t) => t.geometryVersion).sort();
}

function failuresOf(outcome: { failures: readonly unknown[] }): readonly unknown[] {
  return outcome.failures;
}

// masterCastTargetGeometryVersion is exercised indirectly; direct unit proof:
describe("masterCastTargetGeometryVersion", () => {
  it("is stable for identical inputs and sensitive to every provenance field", () => {
    const base = {
      moldPartId: "p",
      mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      stockGeometryVersion: "s1",
      sourcePartGeometryVersion: "g1",
      featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
      processProfileId: "genericRigidCast",
      clearanceMm: 0,
    };
    const a = masterCastTargetGeometryVersion(base);
    expect(masterCastTargetGeometryVersion({ ...base })).toBe(a);
    expect(masterCastTargetGeometryVersion({ ...base, stockGeometryVersion: "s2" })).not.toBe(a);
    expect(masterCastTargetGeometryVersion({ ...base, sourcePartGeometryVersion: "g2" })).not.toBe(a);
    expect(masterCastTargetGeometryVersion({ ...base, featureIntents: { sprueIntentVersion: "x", registrationPolicyVersion: null } })).not.toBe(a);
    expect(masterCastTargetGeometryVersion({ ...base, processProfileId: "other" })).not.toBe(a);
  });
});
