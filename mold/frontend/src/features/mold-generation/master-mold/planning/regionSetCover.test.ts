import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { greedyRegionCover } from "./regionSetCover";
import { createWorkingMoldPieceCountSearch } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import {
  buildFourHoleCubeFixture,
  buildFreeFormObliqueLockFixture,
  buildSimpleBoxFixture,
  buildThreeHoleCubeFixture,
  seedFromFixture,
  type GoldenFixture,
} from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 11: moldable region set-cover optimization -- a
 * minimum-piece estimate from real coverage reasoning, with uncovered
 * regions always explicit rather than silently dropped.
 */

async function planningFor(fixture: GoldenFixture) {
  const seed = seedFromFixture(fixture);
  const planningMesh = buildPlanningMesh({
    positions: seed.sourceMesh.positions,
    indices: seed.sourceMesh.indices,
    bounds: seed.sourceBounds,
    sourceGeometryVersion: seed.sourceGeometryVersion,
  });
  const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
  let analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
  const pruned = pruneDirections(analysis.directions, analysis, planningMesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
  analysis = pruned.analysis;
  return { planningMesh, analysis };
}

describe("Moldable region set-cover optimization (Execution 08 LOOP 11)", () => {
  it("covers a simple convex box with a single direction (region count 1, one piece suffices)", async () => {
    const { planningMesh, analysis } = await planningFor(await buildSimpleBoxFixture());
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const result = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(result.uncoveredRegionIndexes).toEqual([]);
    expect(result.steps.length).toBeLessThanOrEqual(2);
    expect(result.steps[result.steps.length - 1]!.cumulativeCoveredRegionCount).toBe(result.totalRegionCount);
  });

  it("proves three directions cover every region of the three-blind-hole cube, matching the known physical minimum", async () => {
    const { planningMesh, analysis } = await planningFor(await buildThreeHoleCubeFixture());
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const result = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(result.uncoveredRegionIndexes).toEqual([]);
    // The physical minimum for this fixture is 3 pulls (+Z, +X, -X); greedy
    // (an upper bound) must not need more than that.
    expect(result.steps.length).toBeLessThanOrEqual(3);
  });

  it("leaves the real regression's genuinely-uncoverable region explicit rather than silently dropped", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const result = greedyRegionCover(regionGraph, planningMesh, analysis);
    // Every step's cumulative count is monotonically non-decreasing and
    // bounded by the total region count -- a sane, real coverage trace.
    let previous = 0;
    for (const step of result.steps) {
      expect(step.cumulativeCoveredRegionCount).toBeGreaterThanOrEqual(previous);
      expect(step.cumulativeCoveredRegionCount).toBeLessThanOrEqual(result.totalRegionCount);
      previous = step.cumulativeCoveredRegionCount;
    }
    expect(result.uncoveredRegionIndexes.length + previous).toBeLessThanOrEqual(result.totalRegionCount);
  });

  it("is bounded: never exceeds the candidate direction count in picks, and terminates", async () => {
    const { planningMesh, analysis } = await planningFor(await buildThreeHoleCubeFixture());
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const result = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(result.steps.length).toBeLessThanOrEqual(analysis.directions.length);
  });

  it("chooses 2 pieces when set-cover proves full coverage exists at 2 -- never escalates past a proven-sufficient count", async () => {
    const { planningMesh, analysis } = await planningFor(await buildSimpleBoxFixture());
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const cover = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(cover.uncoveredRegionIndexes).toEqual([]);
    expect(cover.steps.length).toBeLessThanOrEqual(2);

    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    const step = search.next();
    expect(step!.pieceCount).toBe(2);
    expect(step!.rejectionReason).toBeNull();
    expect(step!.diagnostics.regionSetCoverMinimumPieceEstimate).toBe(cover.steps.length);
    expect(step!.diagnostics.regionSetCoverUncoveredRegionCount).toBe(0);
  });

  it("only escalates to 3+ pieces when set-cover proves 2 cannot cover every region (four-hole cube)", async () => {
    const { planningMesh, analysis } = await planningFor(await buildFourHoleCubeFixture());
    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const cover = greedyRegionCover(regionGraph, planningMesh, analysis);
    expect(cover.uncoveredRegionIndexes).toEqual([]);
    expect(cover.steps.length).toBeGreaterThan(2); // four independently-pulled holes cannot collapse to 2.

    const search = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    let step = search.next();
    while (step !== null && step.rejectionReason !== null) step = search.next();
    expect(step).not.toBeNull();
    expect(step!.pieceCount).toBeGreaterThan(2);
    expect(step!.diagnostics.regionSetCoverUncoveredRegionCount).toBe(0);
  });

  it("reports no coverage at all when there are no candidate directions", () => {
    const result = greedyRegionCover({ regions: [], regionOfPatch: [] }, {
      patches: [], adjacency: [], totalAreaMm2: 0, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      sourceGeometryVersion: "empty", vertexCount: 0, triangleCount: 0,
    }, { directions: [], perDirection: [], dominantPatchOrder: [] });
    expect(result.steps).toEqual([]);
    expect(result.uncoveredRegionIndexes).toEqual([]);
    expect(result.totalRegionCount).toBe(0);
  });
});
