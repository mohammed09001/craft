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
 * What remains open, tracked through four further real, verified fixes
 * (each precisely root-caused; full derivations in
 * regionDirectConstruction.ts's and workingMoldConstructor.ts's own doc
 * comments) that still have not closed release verification for this
 * specific, deliberately hard fixture:
 *
 *  1. The FIRST construction attempt used one global flat offset (the
 *     minimum projection of a piece's own patches) per region-cover
 *     direction. A single outlier patch could drag that one global scalar
 *     low enough to also claim large amounts of another piece's material
 *     that was not even topologically adjacent -- measured directly, a
 *     159-patch piece claimed 964 patches, 805 wrong. Fixed by a LOCAL,
 *     per-region decision that a distant outlier cannot drag.
 *  2. That local fix eliminated the over-capture but fragmented pieces
 *     into many disconnected solid components (measured: up to 21 per
 *     piece). Root-caused: a region-cover DIRECTION's own assigned patches
 *     are not guaranteed to be one connected surface region (visibility
 *     does not require adjacency) -- 3 of 5 directions' own assignments
 *     were themselves split across 2-4 mesh-disconnected components for
 *     this fixture. Fixed by splitting each direction's assignment into
 *     its own connected components FIRST, each becoming its own physical
 *     piece released along the same direction (`buildDirectAssignment
 *     ConstructionPieces`) -- raised the physical piece count from 5 to
 *     11.
 *  3. Some regions still fragmented further DURING carving (a later
 *     piece's local correction can slice through an earlier piece's own
 *     connectivity). Fixed with a post-hoc safety net in
 *     `constructWorkingMold` itself: any region that still decomposes into
 *     multiple components after carving is split into that many final
 *     pieces (a no-op on the ordinary threshold-search path, which never
 *     produces this) -- raised the physical piece count further, to 23.
 *  4. A genuine architectural rewrite: sequential remainder-carving (each
 *     piece's tool threaded through a single shrinking volume, so a later
 *     piece's correction could ripple into an earlier piece's already-
 *     finalized shape) replaced with a SIMULTANEOUS, order-independent
 *     partition -- every non-last piece built directly from the full
 *     envelope via `localBoundedAssignmentSolid` (a footprint bounded to
 *     its OWN territory from the start, not a global flat claim corrected
 *     after the fact), with symmetric `otherPoints` (every other piece, not
 *     just later ones) and only a single deterministic pass to resolve
 *     small residual overlaps. This fixed two REAL, independently
 *     confirmed bugs along the way (a simple box fixture regressed under
 *     the rewrite, and the root cause -- patch-centroid-based footprints
 *     badly underestimating a coarse mesh's true surface extent -- was a
 *     genuine defect, not specific to this hard fixture). Against the real
 *     regression fixture itself: the physical piece count climbed further
 *     still, to 25, and it still fails release.
 *
 * That trajectory -- 5, then 11, then 23, then 25 physical pieces, across
 * FOUR increasingly large fixes including one full paradigm change
 * (sequential to simultaneous), each fix genuinely closing the specific
 * defect it targeted -- is the honest stopping point, not a specific
 * remaining bug: representing this fixture's true per-patch assignment via
 * ANY half-space- or local-footprint-derived CSG boundary construction does
 * not converge to a small, valid set of physical pieces, regardless of
 * whether that construction is sequential or simultaneous. Closing this for
 * real needs true volumetric reconstruction (e.g. marching cubes over a 3D
 * nearest-assignment field, not a boundary derived from any single
 * direction's projection) -- a fundamentally different KIND of
 * infrastructure, not a further correction to boundary-based construction,
 * and out of scope here. The fixes above are all real and kept (each is a
 * correctness improvement independent of whether this specific fixture ever
 * closes). LOOP 02's remaining gate items are NOT met until release
 * verification succeeds too; do not read this file's current passing
 * status as full LOOP 02 closure.
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
