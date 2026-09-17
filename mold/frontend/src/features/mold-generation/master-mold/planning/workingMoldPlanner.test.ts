import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections, principalAxesOfCovariance } from "./candidateDirections";
import { analyzeDirectionAccessibility, directionPreliminaryScore, pruneDirections } from "./accessibility";
import { exactPartingThreshold, planWorkingMoldDecomposition } from "./workingMoldPlanner";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { buildObliqueHoleCubeFixture, buildSimpleBoxFixture, buildThreeHoleCubeFixture, seedFromFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 06 Articles 03-05 + Article 20 research-fidelity invariants:
 * candidate direction sets contain geometry-derived directions; global
 * accessibility is computed by occlusion; accessibility regions affect the
 * shortlist; piece count is adaptive from 2 upward; parting thresholds come
 * from the geometry; exact CSG is reserved for the shortlist.
 */

async function planningFor(fixture: { mesh: { positions: readonly number[]; indices: readonly number[] }; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }) {
  const seed = seedFromFixture(fixture);
  const planningMesh = buildPlanningMesh({
    positions: seed.sourceMesh.positions,
    indices: seed.sourceMesh.indices,
    bounds: seed.sourceBounds,
    sourceGeometryVersion: seed.sourceGeometryVersion,
  });
  const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
  const analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
  const pruned = pruneDirections(analysis.directions, analysis, planningMesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
  return { seed, planningMesh, analysis: pruned.analysis };
}

describe("PlanningMesh (Article 03)", () => {
  it("samples patches with provenance and bounded count", async () => {
    const fixture = buildHighPolyLocal();
    const mesh = buildPlanningMesh({
      positions: fixture.positions,
      indices: fixture.indices,
      bounds: { min: { x: -15, y: -15, z: -15 }, max: { x: 15, y: 15, z: 15 } },
      sourceGeometryVersion: "sphere",
    });
    expect(mesh.patches.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxPlanningPatches);
    expect(mesh.patches.length).toBeGreaterThan(100);
    for (const patch of mesh.patches) {
      expect(patch.sourceTriangle).toBeLessThan(fixture.indices.length / 3);
      expect(patch.areaMm2).toBeGreaterThan(0);
    }
    expect(mesh.adjacency.length).toBe(mesh.patches.length);
  });

  it("does not modify the manufacturing mesh (two-resolution rule)", async () => {
    const fixture = await buildSimpleBoxFixture();
    const original = [...fixture.mesh.positions];
    buildPlanningMesh({ positions: fixture.mesh.positions, indices: fixture.mesh.indices, bounds: fixture.bounds, sourceGeometryVersion: "x" });
    expect(fixture.mesh.positions).toEqual(original);
  });
});

function buildHighPolyLocal() {
  const rings = 48;
  const sectors = 96;
  const radius = 15;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (Math.PI * ring) / rings;
    for (let sector = 0; sector <= sectors; sector += 1) {
      const theta = (2 * Math.PI * sector) / sectors;
      positions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = ring * (sectors + 1) + sector;
      const b = (ring + 1) * (sectors + 1) + sector;
      const c = (ring + 1) * (sectors + 1) + sector + 1;
      const d = ring * (sectors + 1) + sector + 1;
      if (ring !== 0) indices.push(a, b, d);
      if (ring !== rings - 1) indices.push(b, c, d);
    }
  }
  return { positions, indices };
}

describe("Candidate directions (Article 04)", () => {
  it("contains geometry-derived directions for an oblique fixture (Article 20)", async () => {
    const fixture = await buildObliqueHoleCubeFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const worldAxis = (v: { x: number; y: number; z: number }) => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) > 1.999;
    const geometryDerived = analysis.directions.filter((direction) => direction.source !== "world-axis" && !worldAxis(direction.vector));
    expect(geometryDerived.length).toBeGreaterThan(0);
    // One of them matches the rotated face normal (0, ±0.707, ±0.707).
    const rotated = geometryDerived.find((direction) => Math.abs(direction.vector.y) > 0.6 && Math.abs(direction.vector.z) > 0.6);
    expect(rotated).toBeDefined();
    void planningMesh;
  });

  it("deduplicates to the centralized budget with both polarities available", async () => {
    const fixture = await buildSimpleBoxFixture();
    const { analysis } = await planningFor(fixture);
    expect(analysis.directions.length).toBeLessThanOrEqual(MASTER_PLANNER_LIMITS.maxCandidateDirections);
    for (const direction of analysis.directions) {
      const opposite = analysis.directions.find(
        (candidate) => candidate.vector.x === -direction.vector.x && candidate.vector.y === -direction.vector.y && candidate.vector.z === -direction.vector.z,
      );
      expect(opposite).toBeDefined();
    }
  });

  it("PCA recovers the principal axes of an anisotropic distribution", () => {
    // Points stretched strongly along Z.
    const positions: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      positions.push((i % 2) - 0.5, ((i * 7) % 3) - 1, i * 4 - 400);
    }
    const axes = principalAxesOfCovariance([
      0.25, 0, 0,
      0, 0.7, 0,
      0, 0, 53000,
    ]);
    expect(Math.abs(axes[0]!.z)).toBeGreaterThan(0.9);
  });
});

describe("Global accessibility (Article 05)", () => {
  it("classifies hidden surfaces by occlusion, not normal sign", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const byId = new Map(analysis.directions.map((direction, index) => [direction.directionId, analysis.perDirection[index]!]));
    const up = byId.get("world:world+Z")!;
    // The ±X blind holes' interiors cannot see out along +Z (occlusion), and
    // the +Z blind hole's interior cannot see out along +X.
    const sideHoleInteriors = planningMesh.patches.filter((patch) => {
      const radial = Math.hypot(patch.centroid.y, patch.centroid.z);
      return (patch.centroid.x > 2 || patch.centroid.x < -2) && radial < 1.6;
    });
    expect(sideHoleInteriors.length).toBeGreaterThan(0);
    expect(sideHoleInteriors.every((patch) => up.visible[patch.patchIndex] !== 1)).toBe(true);
    const plusX = byId.get("world:world+X")!;
    const topHoleInteriors = planningMesh.patches.filter((patch) => patch.centroid.z > 2 && Math.hypot(patch.centroid.x, patch.centroid.y) < 1.6);
    expect(topHoleInteriors.length).toBeGreaterThan(0);
    expect(topHoleInteriors.every((patch) => plusX.visible[patch.patchIndex] !== 1)).toBe(true);
    expect(up.inaccessibleAreaMm2).toBeGreaterThan(0);
  });

  it("ranks directions by preliminary score so accessibility prunes the search", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const scores = analysis.perDirection.map((entry) => directionPreliminaryScore(entry, planningMesh));
    // Score ordering follows undercut severity: more inaccessible area scores worse.
    const areas = analysis.perDirection.map((entry) => entry.inaccessibleAreaMm2);
    const worstArea = Math.max(...areas);
    const worstScore = Math.max(...scores);
    const worstIndex = areas.indexOf(worstArea);
    expect(scores[worstIndex]).toBe(worstScore);
    expect(worstScore).toBeGreaterThan(Math.min(...scores));
  });
});

describe("Working mold decomposition (Articles 06/07)", () => {
  it("chooses the minimum feasible piece count for a simple part", async () => {
    const fixture = await buildSimpleBoxFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const plan = planWorkingMoldDecomposition({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    expect(plan).not.toBeNull();
    expect(plan!.candidate.pieceCount).toBe(2);
    expect(plan!.rejectedPieceCounts).toEqual([]);
  });

  it("requires three pieces for the three-blind-hole part with evidence", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const plan = planWorkingMoldDecomposition({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    expect(plan).not.toBeNull();
    expect(plan!.candidate.pieceCount).toBe(3);
    expect(plan!.rejectedPieceCounts.map((entry) => entry.pieceCount)).toEqual([2]);
  });

  it("extracts parting interfaces from region adjacency (silhouette-style curves)", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const plan = planWorkingMoldDecomposition({ planningMesh, analysis, maxWorkingMoldPieces: 4 });
    expect(plan!.finalists[0]!.interfaces.length).toBeGreaterThan(0);
    for (const entry of plan!.finalists[0]!.interfaces) {
      expect(entry.samplePoints.length).toBeGreaterThan(0);
      expect(entry.pieceAIndex).not.toBe(entry.pieceBIndex);
    }
  });

  it("exact parting threshold places every direction-exclusive patch inside the prism", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis } = await planningFor(fixture);
    const plusZ = analysis.directions.findIndex((direction) => direction.directionId === "world:world+Z");
    const threshold = exactPartingThreshold(planningMesh, analysis.perDirection[plusZ]!.visible, new Array(planningMesh.patches.length).fill(0), analysis.directions[plusZ]!.vector);
    expect(threshold).not.toBeNull();
    for (const patch of planningMesh.patches) {
      if (analysis.perDirection[plusZ]!.visible[patch.patchIndex] !== 1) continue;
      const dot = patch.centroid.x * analysis.directions[plusZ]!.vector.x + patch.centroid.y * analysis.directions[plusZ]!.vector.y + patch.centroid.z * analysis.directions[plusZ]!.vector.z;
      expect(dot).toBeGreaterThanOrEqual(threshold!);
    }
  });
});
