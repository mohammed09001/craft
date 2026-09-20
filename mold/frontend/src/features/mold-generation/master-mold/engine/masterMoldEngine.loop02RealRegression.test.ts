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
 * triangle density.
 *
 * LOOP 08 (adaptive direction discovery) and LOOP 16 (automatic piece count
 * to the 6-piece safety ceiling) landed first: region set-cover proves 5
 * directions collectively see every region of this fixture
 * (regionSetCoverMinimumPieceEstimate: 5, regionSetCoverUncoveredRegionCount:
 * 0) -- "no direction exists" is closed.
 *
 * The remaining gap, found by directly testing region set-cover's own
 * 5-direction combination as an ordered half-space prism sequence: the
 * ordered half-space search's assignment rule (`dot(patch.centroid,
 * direction) >= offset`, claimed in a fixed prism sequence) is a DIFFERENT,
 * weaker criterion than "this region is fully visible from direction D",
 * which is all set-cover proves. Set-cover's own region-to-direction proof
 * was never actually used to drive real patch assignment -- even trying its
 * own proven-sufficient combination directly left 198 patches unassigned.
 * `regionDirectAssignment.ts` fixes exactly this: it assigns patches DIRECTLY
 * from set-cover's own proof (zero unassigned patches, verified directly
 * against this fixture), and `masterMoldEngine.ts` now tries it as a real
 * last-resort fallback when the ordinary search exhausts. This closes the
 * PLANNING-level gap -- the engine now genuinely reaches real exact-CSG
 * construction for this fixture (previously 0 attempts, ever).
 *
 * What remains open, found the same way (checked directly, an all-flat-plane
 * variant of the SAME correct assignment fails at the identical point): full
 * release verification for this specific, deliberately hard fixture's
 * catch-all piece does not currently succeed, and it is not a curve-fitting
 * precision gap -- something deeper about sequential single-direction-per-
 * piece removal not sufficing here, even with a provably correct patch
 * assignment, not yet root-caused further (regionDirectConstruction.ts's own
 * doc comment). LOOP 02's remaining gate items are NOT met until release
 * verification succeeds too; do not read this file's current passing status
 * as full LOOP 02 closure.
 */
describe("Real free-form regression (Execution 08 LOOP 02)", () => {
  it("reaches real exact-CSG construction via the region-direct-assignment fallback (previously 0 attempts, ever), still fails release for this specific hard fixture", { timeout: 120_000 }, async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const seed = seedFromFixture(fixture);
    const result = await runMasterMoldEngine(seed);

    expect(result.plan).toBeNull();
    expect(result.toolingSets).toEqual([]);
    // The region-direct-assignment fallback (Execution 08 LOOP 14) genuinely
    // reaches real exact-CSG construction now -- this is the fixed gap.
    expect(result.budget.workingMoldConstructionAttempts).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.reason).toBe("no_release_plan");
    expect(result.failures[0]!.family).toBe("budget-exhausted");
    // The real construction attempt's own failure reason is preserved, not
    // silently dropped.
    expect(result.failures[0]!.message).toMatch(/region-set-cover-driven direct assignment/);

    // Every piece count up to the automatic safety ceiling (6, LOOP 16) was
    // still attempted and rejected by the ORDINARY search first -- planning
    // diagnostics (LOOP 01) name the exact cause at each; the direct
    // assignment is a fallback AFTER this, not a replacement for it.
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
