import { describe, expect, it } from "vitest";

import { buildFreeFormObliqueLockFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { runMasterMoldEngine } from "./masterMoldEngine";

/**
 * Execution 08 LOOP 02: the real user failure, made a permanent regression.
 *
 * The observed real-part failure (`Segmentation_Segment_1.stl`, 1,576
 * triangles) could not be committed as a fixture -- it is not available in
 * this repository. `buildFreeFormObliqueLockFixture` (planning/
 * masterMoldGoldenFixtures.ts) is a minimized derivative that reproduces the
 * SAME planner failure class from a real geometric cause, not a contrived
 * one: a smoothly curved free-form body (no flat faces) at a comparable
 * triangle density, carrying a blind pocket whose true release axis is never
 * captured as a candidate direction because the area-greedy, 8-seed-bounded
 * normal-cluster source is dominated by the curved body's own continuum of
 * surface normals. The nearest surviving candidate for that pocket sits
 * ~22 degrees off its true axis -- outside the narrow occlusion cone a
 * radius-0.8mm/height-~4mm blind bore allows -- so a small patch group stays
 * permanently unassignable at every piece count up to the profile default
 * cap of 4, and the search reports 0 exact construction attempts: the exact
 * symptom from the real part. (LOOP 04's full-resolution sampling fix
 * changed the exact unassignable-patch count from 1 to 5 -- more of the
 * pocket's marginal, grazing geometry is now visible to the search instead
 * of being skipped by stride sampling; the failure class itself is
 * unchanged, which is the point of this regression.)
 *
 * This test currently documents that failure (pre-fix baseline, LOOP 02's
 * first gate item). LOOP 08 (adaptive direction discovery) and LOOP 16
 * (automatic piece count up to the 6-piece safety ceiling, not a hardcoded
 * 4) both landed since this was first written, and LOOP 11's region
 * set-cover now PROVES 5 directions can release every region of this
 * fixture (regionSetCoverMinimumPieceEstimate: 5,
 * regionSetCoverUncoveredRegionCount: 0) -- so the remaining gap is no
 * longer "no direction exists" (LOOP 08's target, closed) but this
 * planner's bounded prism-ORDERING search failing to find a geometric
 * arrangement that realizes a proven-achievable direction set (visible
 * directly in the piece-count-5 rejection reason below). That is LOOP
 * 10/12-14's target (region-owned assignment landed in LOOP 10; general,
 * non-half-space parting surfaces have not). LOOP 02's remaining gate items
 * are NOT met until exact construction succeeds; do not read this file's
 * current passing status as full LOOP 02 closure.
 */
describe("Real free-form regression (Execution 08 LOOP 02)", () => {
  it("PRE-FIX BASELINE: reproduces 2..6-piece rejection with zero exact construction attempts", { timeout: 120_000 }, async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const seed = seedFromFixture(fixture);
    const result = await runMasterMoldEngine(seed);

    expect(result.plan).toBeNull();
    expect(result.toolingSets).toEqual([]);
    expect(result.budget.workingMoldConstructionAttempts).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.reason).toBe("no_release_plan");
    expect(result.failures[0]!.family).toBe("budget-exhausted");

    // Every piece count up to the automatic safety ceiling (6, LOOP 16) was
    // attempted and rejected -- planning diagnostics (LOOP 01) name the
    // exact cause at each.
    expect(result.planningDiagnostics.map((diagnostic) => diagnostic.pieceCount)).toEqual([2, 3, 4, 5, 6]);
    for (const diagnostic of result.planningDiagnostics) {
      expect(diagnostic.planningCandidatesFeasible).toBe(0);
      expect(diagnostic.rejectionReason).not.toBeNull();
      expect(diagnostic.bestUnassignablePatchCount).toBeGreaterThan(0);
    }
    // LOOP 11: region set-cover proves full coverage IS achievable (with 5
    // directions) -- the failure family stays "budget-exhausted", never
    // escalated to a false claim of physical impossibility.
    const lastDiagnostic = result.planningDiagnostics[result.planningDiagnostics.length - 1]!;
    expect(lastDiagnostic.regionSetCoverUncoveredRegionCount).toBe(0);
    expect(lastDiagnostic.regionSetCoverMinimumPieceEstimate).not.toBeNull();
    expect(lastDiagnostic.rejectionReason).toMatch(/region set-cover proves/);
  });
});
