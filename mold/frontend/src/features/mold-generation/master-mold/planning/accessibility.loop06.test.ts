import { describe, expect, it } from "vitest";

import { buildPlanningMesh } from "./planningMesh";
import { generateCandidateDirections } from "./candidateDirections";
import { analyzeDirectionAccessibility } from "./accessibility";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { buildThreeHoleCubeFixture, type GoldenFixture } from "./masterMoldGoldenFixtures";

/**
 * Execution 08 LOOP 06: accessibility classification must be stable across
 * model scale (a fixed absolute probe offset is simultaneously too coarse
 * for small parts and numerically marginal for large ones), and grazing
 * surfaces must resolve to a deterministic, explained classification
 * instead of flipping on offset luck.
 */

function scaledFixture(fixture: GoldenFixture, factor: number): GoldenFixture {
  const positions = fixture.mesh.positions.map((value) => value * factor);
  const scaleBounds = (bounds: Bounds3): Bounds3 => ({
    min: { x: bounds.min.x * factor, y: bounds.min.y * factor, z: bounds.min.z * factor },
    max: { x: bounds.max.x * factor, y: bounds.max.y * factor, z: bounds.max.z * factor },
  });
  return { mesh: { positions, indices: fixture.mesh.indices }, bounds: scaleBounds(fixture.bounds) };
}

function accessibilityFor(fixture: GoldenFixture) {
  const planningMesh = buildPlanningMesh({
    positions: fixture.mesh.positions,
    indices: fixture.mesh.indices,
    bounds: fixture.bounds,
    sourceGeometryVersion: "loop06",
  });
  const directions = generateCandidateDirections(planningMesh, fixture.mesh.positions);
  const analysis = analyzeDirectionAccessibility(fixture.mesh, planningMesh, directions);
  return { planningMesh, directions, analysis };
}

describe("Scale-aware accessibility (Execution 08 LOOP 06)", () => {
  it("classifies identical relative geometry the same way at 0.1x, 1x, and 10x scale", async () => {
    const base = await buildThreeHoleCubeFixture();
    const scales = [0.1, 1, 10];
    const results = scales.map((factor) => accessibilityFor(scaledFixture(base, factor)));

    // Same topology (same triangle/patch order) at every scale, so per-patch
    // visibility is directly comparable index-for-index.
    const byId = (result: (typeof results)[number]) => new Map(result.analysis.directions.map((direction, index) => [direction.directionId, index]));

    for (const directionId of ["world:world+Z", "world:world+X", "world:world+X:neg"]) {
      const reference = results[1]!; // 1x is the baseline.
      const referenceIndex = byId(reference).get(directionId)!;
      const referenceVisible = reference.analysis.perDirection[referenceIndex]!.visible;

      for (let scaleIndex = 0; scaleIndex < scales.length; scaleIndex += 1) {
        const result = results[scaleIndex]!;
        const directionIndex = byId(result).get(directionId);
        expect(directionIndex).toBeDefined();
        const visible = result.analysis.perDirection[directionIndex!]!.visible;
        expect(visible).toEqual(referenceVisible);
      }
    }
  });

  it("reports scale-aware inaccessible area proportionally (area scales as factor^2)", async () => {
    const base = await buildThreeHoleCubeFixture();
    const small = accessibilityFor(scaledFixture(base, 0.1));
    const large = accessibilityFor(scaledFixture(base, 10));
    const upIndexSmall = small.analysis.directions.findIndex((d) => d.directionId === "world:world+Z");
    const upIndexLarge = large.analysis.directions.findIndex((d) => d.directionId === "world:world+Z");
    const smallInaccessible = small.analysis.perDirection[upIndexSmall]!.inaccessibleAreaMm2;
    const largeInaccessible = large.analysis.perDirection[upIndexLarge]!.inaccessibleAreaMm2;
    expect(smallInaccessible).toBeGreaterThan(0);
    // 10x linear scale -> 100x area, both directions (0.1x vs 10x is a 100x linear / 10,000x area span).
    expect(largeInaccessible / smallInaccessible).toBeCloseTo(10_000, -2);
  });

  it("gives every patch a classification, and 'clear'/'blocked' patches are unambiguous (agree at every probe scale by construction)", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const { planningMesh, analysis } = accessibilityFor(fixture);
    const upIndex = analysis.directions.findIndex((d) => d.directionId === "world:world+Z");
    const perDirection = analysis.perDirection[upIndex]!;
    expect(perDirection.classification.length).toBe(planningMesh.patches.length);
    for (let patchIndex = 0; patchIndex < planningMesh.patches.length; patchIndex += 1) {
      const classification = perDirection.classification[patchIndex]!;
      expect(["clear", "grazing", "blocked", "uncertain"]).toContain(classification);
      if (classification === "clear") expect(perDirection.visible[patchIndex]).toBe(1);
      if (classification === "blocked") expect(perDirection.visible[patchIndex]).toBe(0);
    }
  });

  it("classifies a true sliding-wall (tangent) surface deterministically across repeated runs", async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const runs = [accessibilityFor(fixture), accessibilityFor(fixture), accessibilityFor(fixture)];
    const upIndexes = runs.map((run) => run.analysis.directions.findIndex((d) => d.directionId === "world:world+Z"));
    const classifications = runs.map((run, index) => run.analysis.perDirection[upIndexes[index]!]!.classification);
    // Deterministic: identical classification array across independent runs on the same geometry.
    expect(classifications[1]).toEqual(classifications[0]);
    expect(classifications[2]).toEqual(classifications[0]);
  });
});
