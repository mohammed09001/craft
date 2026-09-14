import { describe, expect, it } from "vitest";

import type { MasterCastTarget } from "./contracts";
import { candidateDirections, detectSealedHighPockets, planPourFace } from "./pourFace";

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
});
