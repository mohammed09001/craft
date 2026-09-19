import { describe, expect, it } from "vitest";

import type { MasterCastTarget } from "./contracts";
import { candidateDirections, detectSealedHighPockets, planPourFace, planarFaceExposureByDirection, sealedAirPockets } from "./pourFace";
import { safeVentPathsFor } from "./toolingConstruction";
import { buildOpenCavityCubeFixture } from "../planning/masterMoldGoldenFixtures";

function boxTarget(bounds: MasterCastTarget["bounds"], withTunnel = false): MasterCastTarget {
  const { min, max } = bounds;
  const positions = [
    min.x, min.y, min.z, max.x, min.y, min.z, max.x, max.y, min.z, min.x, max.y, min.z,
    min.x, min.y, max.z, max.x, min.y, max.z, max.x, max.y, max.z, min.x, max.y, max.z,
  ];
  let indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  if (withTunnel) {
    // Not a true tunnel in a box; tunnel geometry tests live in fixtures —
    // the detector is exercised for the plain box here.
    indices = [...indices];
  }
  return {
    moldPartId: "p",
    moldPartName: "P",
    mesh: { positions, indices },
    bounds,
    volumeMm3: (max.x - min.x) * (max.y - min.y) * (max.z - min.z),
    geometryVersion: "cast:1",
    featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
    warnings: [],
  };
}

const unitBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 40, z: 40 } };

function planInput(overrides: Partial<Parameters<typeof planPourFace>[0]> = {}) {
  return {
    castTarget: boxTarget(unitBounds),
    negativeToolMesh: { positions: [5, 5, 5, 6, 5, 5, 5, 6, 5], indices: [0, 1, 2] },
    negativeToolBounds: { min: { x: 10, y: 10, z: 10 }, max: { x: 20, y: 20, z: 20 } },
    caseWallThicknessMm: 3,
    caseBaseThicknessMm: 3,
    geometryToleranceMm: 1e-3,
    userOverride: null,
    ...overrides,
  };
}

describe("Pour-Face Planner (Execution 05 Article 07)", () => {
  it("selects a valid pour face deterministically for a simple part", () => {
    const a = planPourFace(planInput());
    const b = planPourFace(planInput());
    expect(a.selected).not.toBeNull();
    expect(a.selected).toBe(b.selected);
    expect(a.candidates.every((candidate) => candidate.valid === (candidate.rejectionReason === null))).toBe(true);
    expect(a.ventPlan.status).toBe("clear");
    expect(a.ventPlan.unresolvedRecommendations).toEqual([]);
  });

  it("rejects a pour face that cuts through functional cavity geometry", () => {
    // Negative reaches the +Z face plane: +Z must be rejected.
    const decision = planPourFace(
      planInput({
        negativeToolBounds: { min: { x: 10, y: 10, z: 10 }, max: { x: 20, y: 20, z: 40 } },
      }),
    );
    const plusZ = decision.candidates.find((candidate) => candidate.direction === "+Z")!;
    expect(plusZ.valid).toBe(false);
    expect(plusZ.rejectionReason).toBe("cuts_functional_cavity_geometry");
    expect(decision.selected).not.toBe("+Z");
  });

  it("honors a user override with a scoring bonus", () => {
    const undirected = planPourFace(planInput());
    const overridden = planPourFace(planInput({ userOverride: "-Z" }));
    expect(overridden.selected).toBe("-Z");
    expect(overridden.candidates.find((candidate) => candidate.direction === "-Z")!.source).toBe("user-override");
    // And the plain planner's own choice is still deterministic baseline.
    expect(undirected.selected).not.toBeNull();
  });

  it("orders candidates with the override first", () => {
    const ordered = candidateDirections(boxTarget(unitBounds), "+Y");
    expect(ordered[0]).toBe("+Y");
    expect(new Set(ordered).size).toBe(6);
  });

  it("reports no obvious sealed pockets for a plain convex target", () => {
    const target = boxTarget(unitBounds);
    expect(detectSealedHighPockets(target, "+Z")).toBe(0);
  });

  it("creates only outward vent candidates from a protected boundary", () => {
    const target = { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 40, z: 40 } };
    const paths = safeVentPathsFor(
      target,
      { min: { x: -3, y: -3, z: -3 }, max: { x: 43, y: 43, z: 43 } },
      target,
      [
        { recommendationId: "boundary", pocketPosition: { x: 20, y: 20, z: 40 } },
        { recommendationId: "interior", pocketPosition: { x: 20, y: 20, z: 20 } },
      ],
      3,
    );
    expect(paths).toHaveLength(1);
    expect(paths[0]!.start.z).toBe(40);
    expect(paths[0]!.end.z).toBeGreaterThan(paths[0]!.start.z);
  });
});

// Execution 07 LOOP 07: geometry-derived pour candidates, grouped air
// pockets, and mesh-proven automatic vents.
describe("Pour-Face and Vent Intelligence (Execution 07 LOOP 07)", () => {
  it("ranks pour candidates by measured planar face exposure from the mesh", () => {
    // A plate: only the ±Z faces carry real planar pour area, and the
    // geometry-derived order must put them first.
    const plate = boxTarget({ min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 40, z: 10 } });
    const exposure = planarFaceExposureByDirection(plate);
    expect(exposure["+Z"]).toBeCloseTo(1600, 3);
    expect(exposure["-Z"]).toBeCloseTo(1600, 3);
    expect(exposure["+X"]).toBeCloseTo(400, 3);
    const ordered = candidateDirections(plate, null);
    // ±Z carry the real planar pour area and lead; the exact order between
    // tied faces is the deterministic collation order.
    expect(new Set(ordered.slice(0, 2))).toEqual(new Set(["+Z", "-Z"]));
    expect(ordered.slice(2)).toEqual(expect.arrayContaining(["+X", "-X", "+Y", "-Y"]));
    // Every mesh-backed direction is provenance-stamped as geometry-derived.
    const decision = planPourFace(planInput());
    expect(decision.candidates.every((candidate) => candidate.source === "planar-face-normal")).toBe(true);
  });

  it("groups sealed-pocket samples into actual air pockets with a stable centroid", { timeout: 120_000 }, async () => {
    const fixture = await buildOpenCavityCubeFixture();
    const cup = castTargetFromFixture(fixture, "cup");
    // One cavity ceiling, sampled as several downward-facing triangles, must
    // group into exactly one pocket.
    const pockets = sealedAirPockets(cup, "+Z");
    expect(pockets).toHaveLength(1);
    expect(pockets[0]!.sampleCount).toBeGreaterThanOrEqual(2);
    expect(Math.abs(pockets[0]!.centroid.x)).toBeLessThan(2);
    expect(Math.abs(pockets[0]!.centroid.y)).toBeLessThan(2);
    expect(pockets[0]!.centroid.z).toBeGreaterThan(0);
    // The pocket is not on the seating face and the convex box itself has none.
    expect(detectSealedHighPockets(cup, "+Z")).toBe(1);
    // Recommendations are per pocket, not per sample. The user overrides the
    // pour to the top face (otherwise the planner may pour through the
    // cavity opening itself, where nothing is trapped).
    const decision = planPourFace(planInput({ castTarget: cup, negativeToolBounds: { min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } }, userOverride: "+Z" }));
    expect(decision.selected).toBe("+Z");
    expect(decision.ventPlan.status).toBe("user-review");
    expect(decision.ventPlan.unresolvedRecommendations.length).toBe(sealedAirPockets(cup, decision.selected!).length);
    expect(decision.ventPlan.unresolvedRecommendations.length).toBeGreaterThanOrEqual(1);
    for (const recommendation of decision.ventPlan.unresolvedRecommendations) {
      expect(recommendation.kind).toBe("vent_required_user_review");
    }
  });

  it("proves automatic vents with the exact mesh and rejects unprovable pockets", { timeout: 120_000 }, async () => {
    const fixture = await buildOpenCavityCubeFixture();
    const cup = castTargetFromFixture(fixture, "cup-proof");
    const pockets = sealedAirPockets(cup, "+Z");
    expect(pockets).toHaveLength(1);
    // Mesh proof: the cavity centroid has a clear straight channel down
    // through the cavity opening -- an automatic mesh-verified vent.
    const proven = safeVentPathsFor(
      fixture.bounds,
      { min: { x: -8, y: -8, z: -8 }, max: { x: 8, y: 8, z: 8 } },
      fixture.bounds,
      [{ recommendationId: "vent-auto-1", pocketPosition: pockets[0]!.centroid }],
      3,
      { targetMesh: fixture.mesh, protectedMesh: null },
    );
    expect(proven).toHaveLength(1);
    expect(proven[0]!.proof).toBe("mesh-verified");
    expect(proven[0]!.end.x).toBe(proven[0]!.start.x);
    expect(proven[0]!.end.z).toBeLessThan(proven[0]!.start.z);
    expect(proven[0]!.end.z).toBeGreaterThan(-8);
    // Mesh proof also protects: a pocket buried in solid material has no
    // straight mesh-clear channel and stays a user-review recommendation.
    const box = boxTarget(unitBounds);
    const buried = safeVentPathsFor(
      unitBounds,
      { min: { x: -3, y: -3, z: -3 }, max: { x: 43, y: 43, z: 43 } },
      unitBounds,
      [{ recommendationId: "vent-review-1", pocketPosition: { x: 20, y: 20, z: 20 } }],
      3,
      { targetMesh: box.mesh, protectedMesh: null },
    );
    expect(buried).toHaveLength(0);
  });
});

function castTargetFromFixture(fixture: { mesh: MasterCastTarget["mesh"]; bounds: MasterCastTarget["bounds"] }, id: string): MasterCastTarget {
  return {
    moldPartId: id,
    moldPartName: id,
    mesh: fixture.mesh,
    bounds: fixture.bounds,
    volumeMm3: 10 * 10 * 10 - 4 * 4 * 7.5,
    geometryVersion: `${id}-v1`,
    featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
    warnings: [],
  };
}
