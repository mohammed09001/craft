import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "./accessibility";
import { buildSurfaceRegionGraph, summarizeRegionAccessibility, unresolvedSurfaceRegions } from "./surfaceRegions";
import { runAdaptiveDirectionDiscovery } from "./adaptiveDirectionDiscovery";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildFreeFormObliqueLockFixture, buildThreeHoleCubeFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 08: adaptive direction discovery must find a new
 * direction from an unresolved region, carry real provenance, and stay
 * bounded -- and it must actually resolve the LOOP 02 real regression's
 * permanently-locked region, which is the whole point.
 */

async function pipelineFor(seed: Awaited<ReturnType<typeof seedFromFixture>>) {
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
  return { planningMesh, analysis, sourceMesh: seed.sourceMesh };
}

describe("Adaptive direction discovery (Execution 08 LOOP 08)", () => {
  it("discovers and resolves a region no candidate in the original set covers at all", async () => {
    // LOOP 05's region growing is now cone-capped (bounded to
    // surfaceRegionMergeAngleDeg), which makes most individual regions
    // resolvable by SOME direction in a normal candidate set -- the real
    // regression's actual gap turned out to be combinatorial coverage
    // (LOOP 10/11), not a missing direction (see surfaceRegions.test.ts).
    // This proves LOOP 08's own mechanism directly: a region whose true
    // release axis is absent from the ENTIRE original candidate set (not
    // merely pruned) must still get discovered and resolved.
    const fixture = await buildThreeHoleCubeFixture();
    const seed = seedFromFixture(fixture);
    const planningMesh = buildPlanningMesh({
      positions: seed.sourceMesh.positions,
      indices: seed.sourceMesh.indices,
      bounds: seed.sourceBounds,
      sourceGeometryVersion: seed.sourceGeometryVersion,
    });
    // A deliberately impoverished candidate set: world axes only, with the
    // +X and -X axes removed -- exactly the two directions the side holes
    // need. Nothing else in this set can release them.
    const impoverished = generateCandidateDirections(planningMesh, seed.sourceMesh.positions).filter(
      (direction) => direction.source === "world-axis" && !direction.directionId.startsWith("world:world+X"),
    );
    const initialAnalysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, impoverished);

    const regionGraph = buildSurfaceRegionGraph(planningMesh);
    const initialSummaries = summarizeRegionAccessibility(regionGraph, planningMesh, initialAnalysis);
    const initialUnresolved = unresolvedSurfaceRegions(initialSummaries, regionGraph);
    expect(initialUnresolved.length).toBeGreaterThan(0); // the two side-hole regions.

    const result = runAdaptiveDirectionDiscovery({ planningMesh, sourceMesh: seed.sourceMesh, analysis: initialAnalysis });

    expect(result.roundsRun).toBeGreaterThan(0);
    expect(result.discoveredDirections.length).toBeGreaterThan(0);
    // Every discovered direction carries explicit provenance (LOOP 08 gate: "generated direction has provenance").
    for (const direction of result.discoveredDirections) {
      expect(direction.source).toBe("adaptive-region");
      expect(direction.origin).toMatch(/^adaptive-region-\d+-/);
      expect(direction.directionId).toMatch(/^adaptive:region-\d+:/);
    }

    const finalSummaries = summarizeRegionAccessibility(regionGraph, planningMesh, result.analysis);
    const finalUnresolved = unresolvedSurfaceRegions(finalSummaries, regionGraph);
    expect(finalUnresolved.length).toBeLessThan(initialUnresolved.length);
  }, 60_000);

  it("is a safe no-op on the real regression fixture: every region already resolves individually (the gap is elsewhere)", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const { planningMesh, analysis, sourceMesh } = await pipelineFor(seedFromFixture(fixture));
    const result = runAdaptiveDirectionDiscovery({ planningMesh, sourceMesh, analysis });
    expect(result.discoveredDirections).toEqual([]);
    expect(result.roundsRun).toBe(0);
  }, 60_000);

  it("stays bounded: rounds, regions-per-round, and directions-per-region never exceed the centralized limits", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const { planningMesh, analysis, sourceMesh } = await pipelineFor(seedFromFixture(fixture));
    const result = runAdaptiveDirectionDiscovery({ planningMesh, sourceMesh, analysis });

    expect(result.roundsRun).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxAdaptiveDirectionRounds);
    const maxPossible =
      MASTER_PLANNER_LIMITS.maxAdaptiveDirectionRounds *
      MASTER_PLANNER_LIMITS.maxAdaptiveRegionsPerRound *
      MASTER_PLANNER_LIMITS.maxAdaptiveDirectionsPerRegion;
    expect(result.discoveredDirections.length).toBeLessThanOrEqual(maxPossible);
  }, 60_000);

  it("produces nothing (and does not loop) once every region is already covered", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis, sourceMesh } = await pipelineFor(seedFromFixture(fixture));
    const result = runAdaptiveDirectionDiscovery({ planningMesh, sourceMesh, analysis });
    expect(result.discoveredDirections).toEqual([]);
    expect(result.roundsRun).toBe(0);
    expect(result.analysis).toBe(analysis); // unchanged reference: no wasted work.
  });
});
