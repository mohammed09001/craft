import { describe, expect, it } from "vitest";

import { buildMasterMoldSeedSnapshot, worldMeshFromSnapshot } from "../seed/masterMoldSeed";
import { buildFreeFormObliqueLockFixture, buildSimpleBoxFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";

const BOX_VERTICES = [
  [-2, -2, -2], [2, -2, -2], [2, 2, -2], [-2, 2, -2],
  [-2, -2, 2], [2, -2, 2], [2, 2, 2], [-2, 2, 2],
];
function openBoxSeed() {
  const positions = BOX_VERTICES.flat();
  // Drop the top face (last two triangles): the box is open.
  const indices = [
    0, 2, 1, 0, 3, 2,
    0, 5, 4, 0, 1, 5,
    1, 6, 5, 1, 2, 6,
    2, 7, 6, 2, 3, 7,
    3, 4, 7, 3, 0, 4,
  ];
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "loop26-open",
      positions,
      indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: { min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } },
      geometryVersion: "loop26-open",
      sourceSignature: "loop26-open",
    },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: "loop26-rev",
  }));
}

/**
 * Execution 08 LOOP 26: one consolidated, inspectable planner snapshot --
 * a failed generation must be diagnosable from ONE captured report, no
 * source-code spelunking required.
 */
describe("Working Mold intelligence telemetry (Execution 08 LOOP 26)", () => {
  it("reports a full, consistent debug snapshot on a successful plan", async () => {
    const fixture = await buildSimpleBoxFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.failures).toEqual([]);
    const snapshot = result.debugSnapshot!;
    expect(snapshot).not.toBeNull();
    expect(snapshot.sourceValidity).toBe("valid");
    expect(snapshot.regionCount).toBeGreaterThan(0);
    expect(snapshot.candidateDirectionCount).toBeGreaterThan(0);
    expect(snapshot.coverageMatrixSummary.totalRegions).toBe(snapshot.regionCount);
    expect(snapshot.coverageMatrixSummary.uncoveredRegionCount).toBe(0);
    expect(snapshot.uncoveredRegionIndexes).toEqual([]);
    expect(snapshot.pieceCountAttempts).toEqual([2]);
    expect(snapshot.thresholdAttemptsByPieceCount).toHaveLength(1);
    expect(snapshot.exactConstructionAttempts).toBeGreaterThan(0);
    expect(snapshot.selectedPieceCount).toBe(2);
  });

  it("diagnoses a failed generation from the snapshot alone: region count, uncovered regions, piece-count attempts, zero selection", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.plan).toBeNull();
    const snapshot = result.debugSnapshot!;
    expect(snapshot).not.toBeNull();
    expect(snapshot.regionCount).toBeGreaterThan(0);
    // LOOP 11's own finding: every region IS individually coverable.
    expect(snapshot.coverageMatrixSummary.uncoveredRegionCount).toBe(0);
    expect(snapshot.coverageMatrixSummary.minimumPieceEstimate).not.toBeNull();
    expect(snapshot.pieceCountAttempts).toEqual([2, 3, 4, 5, 6]);
    expect(snapshot.thresholdAttemptsByPieceCount.map((entry) => entry.pieceCount)).toEqual([2, 3, 4, 5, 6]);
    // Execution 08 LOOP 14 (real-regression root cause fix): the ordinary
    // search still finds 0 feasible candidates at every piece count, but
    // the engine's region-direct-assignment last resort IS eligible for
    // this fixture (region set-cover proves 5 directions suffice) and DOES
    // reach one real exact construction attempt -- honestly reported here,
    // not the hardcoded 0 this snapshot used to report before that fallback
    // existed (masterMoldEngine.loop02RealRegression.test.ts covers why it
    // still fails release for this specific hard fixture).
    expect(snapshot.exactConstructionAttempts).toBe(1);
    expect(snapshot.selectedPieceCount).toBeNull();
    expect(snapshot.partingSurfaceCandidateCount).toBe(1);
  }, 60_000);

  it("is null only for the invalid-source-mesh early return, where planning never ran", async () => {
    const invalidResult = await runMasterMoldEngine(openBoxSeed());
    expect(invalidResult.failures[0]!.reason).toBe("invalid_source_mesh");
    expect(invalidResult.debugSnapshot).toBeNull();

    // The sanity counterpart: a valid mesh always gets a real snapshot.
    const validFixture = await buildSimpleBoxFixture();
    const validResult = await runMasterMoldEngine(seedFromFixture(validFixture));
    expect(validResult.debugSnapshot).not.toBeNull();
  });
});
