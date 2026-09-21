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
 * What remains open, tracked through five further real, verified
 * investigations (each precisely root-caused; full derivations in
 * regionDirectConstruction.ts's, workingMoldConstructor.ts's, and
 * volumetricPartition.ts's own doc comments) that still have not closed
 * release verification for this specific, deliberately hard fixture:
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
 *  5. A full paradigm change, not a correction: replaced CSG boundary
 *     construction entirely with a genuine 3D nearest-SURFACE partition
 *     (`volumetricAssignmentSolid`), extracted via `Manifold.levelSet` (a
 *     native marching-tetrahedra level-set-to-mesh constructor, manifoldness
 *     guaranteed by the algorithm itself -- no hand-written marching cubes
 *     needed). This eliminates the single-direction-projection bias
 *     entirely -- there is no half-space, no local footprint, nothing
 *     derived from any one direction anywhere in it. Proven CORRECT for
 *     well-behaved geometry (exact analytic tiling for separated flat
 *     faces; real, tested infrastructure kept regardless of this fixture's
 *     outcome). But it surfaces a DIFFERENT, equally fundamental limitation:
 *     wherever two pieces' patches share an edge, the region beyond that
 *     edge is a genuine mathematical TIE (both pieces' nearest-point query
 *     clamps to the identical shared point), which `Manifold.levelSet`
 *     assigns to NEITHER piece -- a real structural gap, not a grid-
 *     resolution artifact (confirmed: refining the grid 2.5x left the gap
 *     unchanged). Against the real regression fixture: physical piece count
 *     climbed to 38 -- worse than every CSG-boundary attempt's own worst
 *     point of 25. A secondary tie-breaking term (`volumetricPartition.ts`'s
 *     own doc comment has the full mechanism) then closed the exact
 *     structural gap this diagnosed -- verified directly on controlled
 *     cases and the real fixture's own simple-box sanity case -- but made
 *     the real regression fixture WORSE again (piece count 101). A
 *     refined, SMOOTHED version of that same tie-break (a fixed average
 *     plane per piece instead of a per-point nearest-triangle lookup)
 *     confirmed the flickering diagnosis partly right (101 -> 41) but
 *     still did not beat the 38-piece baseline with no tie-break at all.
 *     Three controlled, consistent measurements (38, then 101, then 41)
 *     converge on the same conclusion: no single-criterion tie-break
 *     bolted onto this metric helps this fixture's own real, highly
 *     fragmented, curved assignment, however well it helps simpler cases.
 *
 * That trajectory -- 5, then 11, then 23, then 25, then 38/101/41 physical
 * pieces, across FIVE increasingly large fixes including two full paradigm
 * changes (sequential to simultaneous CSG, then CSG to genuine volumetric
 * reconstruction) plus two further within-paradigm refinements, each fix
 * genuinely closing the specific defect it targeted -- is the honest
 * stopping point, not a specific remaining bug: representing this
 * fixture's true per-patch assignment via EITHER a half-space-/local-
 * footprint-derived CSG boundary OR a bounded-nearest-surface Voronoi
 * partition (with or without a tie-break) does not converge to a small,
 * valid set of physical pieces. Closing this for real would need a
 * fundamentally different distance/boundary notion again (e.g. a true
 * generalized Voronoi/power diagram with a PER-REGION, geometry-aware
 * tie-break rather than one global criterion, or true multi-label surface
 * reconstruction) -- out of scope here after two large paradigm attempts
 * and two further refinements of the second. The fixes above are all real
 * and kept (each is a correctness improvement independent of whether this
 * specific fixture ever closes). LOOP 02's remaining gate items are NOT
 * met until release verification succeeds too; do not read this file's
 * current passing status as full LOOP 02 closure.
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
