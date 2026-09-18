import { beforeEach, describe, expect, it, vi } from "vitest";

import { GENERIC_RIGID_CAST_PROFILE, type MasterCastTarget } from "./contracts";
import {
  attemptRecursiveSplit,
  candidateSplits,
  MULTI_PIECE_PLANNER_LIMITS,
  planMultiPieceTooling,
} from "./multiPiecePlanner";
import { toolingParametersFromProfile } from "./toolingConstruction";
import { boundsFromManifold, createBlankSolid, getManifoldModule, payloadFromManifold, type ManifoldSolid } from "../../geometry/manifold";

/**
 * Execution 07 LOOP 04: geometry-driven Master Tooling split search.
 *
 * Candidate parting planes are derived from the cast target's own feature
 * planes, the part-negative tool's feature planes, build-volume constraints,
 * and bounded oblique planes from the target's oblique normal clusters. The
 * fixed axis/fraction set is FALLBACK ONLY, searched after every
 * geometry-derived family. Oblique planar splits are real clipped solids with
 * real release verification, bounded by `maxObliqueExactAttempts`.
 */

// The gate test forces every axis-aligned candidate to fail at exact
// construction (the "axis candidates fail" premise) while oblique candidates
// run the REAL exact construction and verification -- proving a non-axis
// plan succeeds where the axis families fail, with bounded attempts. The
// seam is toolingConstruction (imported across the module boundary, so the
// partial mock intercepts it).
const attemptCalls = { axisAligned: 0, oblique: 0 };

vi.mock("./toolingConstruction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./toolingConstruction")>();
  return {
    ...actual,
    constructCasePiece: vi.fn(async (input: Parameters<typeof actual.constructCasePiece>[0]) => {
      if (input.split !== undefined && input.split.normal === undefined) {
        attemptCalls.axisAligned += 1;
        throw new Error("test: axis-aligned case construction rejected");
      }
      attemptCalls.oblique += 1;
      return actual.constructCasePiece(input);
    }),
  };
});

/** A box rotated 45° about X then 45° about Y: every face normal is oblique to the world axes. */
async function skewBoxCastTarget(): Promise<MasterCastTarget> {
  const module = await getManifoldModule();
  const box = createBlankSolid(module, { min: { x: -4, y: -4, z: -4 }, max: { x: 4, y: 4, z: 4 } });
  let rotated: ManifoldSolid | null = null;
  try {
    rotated = box.rotate(45, 45, 0);
    const mesh = payloadFromManifold(rotated);
    const bounds = boundsFromManifold(rotated);
    const volumeMm3 = rotated.volume();
    return {
      moldPartId: "skew-box",
      moldPartName: "Skew Box",
      mesh,
      bounds,
      volumeMm3,
      geometryVersion: "skew-box-v1",
      featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
      warnings: [],
    };
  } finally {
    rotated?.delete();
    box.delete();
  }
}

const isAxisAligned = (normal: { readonly x: number; readonly y: number; readonly z: number }) =>
  Math.abs(normal.x) > 0.999 || Math.abs(normal.y) > 0.999 || Math.abs(normal.z) > 0.999;

beforeEach(() => {
  attemptCalls.axisAligned = 0;
  attemptCalls.oblique = 0;
  vi.clearAllMocks();
});

describe("Geometry-driven split candidates (Execution 07 LOOP 04)", () => {
  it("searches geometry-derived families before the axis/fraction fallback", async () => {
    const castTarget = await skewBoxCastTarget();
    const splits = candidateSplits(castTarget, null);
    const lastGeometryDerived = splits.map((split) => split.origin !== "span-fraction" && split.origin !== "target-face").lastIndexOf(true);
    const firstFallback = splits.findIndex((split) => split.origin === "span-fraction" || split.origin === "target-face");
    expect(lastGeometryDerived).toBeGreaterThanOrEqual(0);
    expect(firstFallback).toBeGreaterThan(lastGeometryDerived);
    // Fallback families are still searched (fallback, not removal). A
    // candidate that dedupes against an identical earlier plane is absent --
    // e.g. "target-face" always collides with the target's own min/max
    // feature levels -- so only assert the families that survive on this
    // fixture.
    expect(splits.some((split) => split.origin === "span-fraction")).toBe(true);
  });

  it("derives bounded oblique planes from the target's oblique normal clusters", async () => {
    const castTarget = await skewBoxCastTarget();
    const splits = candidateSplits(castTarget, null);
    const oblique = splits.filter((split) => split.origin === "oblique-normal-cluster");
    expect(oblique.length).toBeGreaterThan(0);
    expect(oblique.length).toBeLessThanOrEqual(MULTI_PIECE_PLANNER_LIMITS.maxObliqueSplitPlanes);
    for (const split of oblique) {
      expect(split.normal).toBeDefined();
      expect(split.point).toBeDefined();
      expect(isAxisAligned(split.normal!)).toBe(false);
      // The plane must actually cut the target: its point lies inside the bounds.
      expect(split.point!.x).toBeGreaterThanOrEqual(castTarget.bounds.min.x);
      expect(split.point!.x).toBeLessThanOrEqual(castTarget.bounds.max.x);
      expect(split.point!.z).toBeGreaterThanOrEqual(castTarget.bounds.min.z);
      expect(split.point!.z).toBeLessThanOrEqual(castTarget.bounds.max.z);
    }
  });

  it("adds build-volume-mandated cut positions when the case span exceeds the printer extent", async () => {
    const castTarget = await skewBoxCastTarget();
    const spanX = castTarget.bounds.max.x - castTarget.bounds.min.x;
    const splits = candidateSplits(castTarget, null, { x: spanX / 3, y: 1e4, z: 1e4 });
    const buildVolumeSplits = splits.filter((split) => split.origin === "build-volume");
    expect(buildVolumeSplits.length).toBe(2);
    for (const split of buildVolumeSplits) {
      expect(split.axis).toBe("+X");
      expect(split.coordinateMm).toBeGreaterThan(castTarget.bounds.min.x);
      expect(split.coordinateMm).toBeLessThan(castTarget.bounds.max.x);
    }
    // Build-volume cuts lead their axis: hard printer constraints are
    // searched before the optional families, so bounded per-axis attempts
    // cannot be starved by candidates the printer forbids anyway.
    const firstNonBuildVolumeX = splits.findIndex((split) => split.axis === "+X" && split.origin !== "build-volume");
    expect(splits.findIndex((split) => split.origin === "build-volume")).toBeLessThan(firstNonBuildVolumeX);
  });

  it("deduplicates axis-aligned candidates so no attempt budget is wasted twice on one plane", async () => {
    const castTarget = await skewBoxCastTarget();
    const splits = candidateSplits(castTarget, null);
    const seen = new Set<string>();
    for (const split of splits) {
      if (split.normal !== undefined) continue;
      const key = `${split.axis}:${Math.round(split.coordinateMm * 1e4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("Bounded oblique planar tooling splits (Execution 07 LOOP 04)", () => {
  it("exactly constructs and verifies an oblique split with real CSG", { timeout: 300_000 }, async () => {
    const castTarget = await skewBoxCastTarget();
    const oblique = candidateSplits(castTarget, null).find((split) => split.origin === "oblique-normal-cluster");
    expect(oblique).toBeDefined();
    const parameters = toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE);
    const attempt = await attemptRecursiveSplit(castTarget, "+Z", oblique!, parameters, null, "split", 4);
    expect(attempt.rejectionReason).toBeNull();
    expect(attempt.plan).not.toBeNull();
    expect(attempt.plan!.pieces.length).toBeGreaterThanOrEqual(2);
    expect(attempt.plan!.partingSurface.planeNormal).toBeDefined();
    expect(attempt.plan!.partingSurface.origin).toBe("oblique-normal-cluster");
    expect(attempt.plan!.releaseSequence.length).toBe(attempt.plan!.pieces.length);
    for (const step of attempt.plan!.releaseSequence) expect(step.collisionVerified).toBe(true);
  });

  it("gate: a non-axis plan succeeds where axis candidates fail, with bounded exact attempts", { timeout: 300_000 }, async () => {
    const castTarget = await skewBoxCastTarget();
    const parameters = toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE);
    const attempt = await planMultiPieceTooling(castTarget, "+Z", parameters, null);
    // The axis families were genuinely searched first and failed: exactly the
    // bounded budget (2 attempts x 3 axes), then the search moved on.
    expect(attemptCalls.axisAligned).toBe(3 * MULTI_PIECE_PLANNER_LIMITS.maxExactAttemptsPerAxis);
    // The winning plan is geometry-derived and oblique: real clipped solids,
    // real release proof -- not the mock.
    expect(attempt.plan).not.toBeNull();
    expect(attempt.plan!.partingSurface.origin).toBe("oblique-normal-cluster");
    expect(attempt.plan!.partingSurface.planeNormal).toBeDefined();
    for (const step of attempt.plan!.releaseSequence) expect(step.collisionVerified).toBe(true);
    // Exact attempts stay bounded.
    expect(attemptCalls.oblique).toBeLessThanOrEqual(MULTI_PIECE_PLANNER_LIMITS.maxObliqueExactAttempts);
  });
});
