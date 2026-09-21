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
 *  6. A sixth angle, one level further upstream of every construction
 *     technique above: `buildRegionDirectAssignment` itself assigns each
 *     region to the FIRST direction (in greedy cover order) that fully
 *     sees it -- a purely visibility-driven, first-match rule with zero
 *     regard for whether the result is spatially compact. Measured
 *     directly: 132 of this fixture's 187 regions (70%) are fully visible
 *     from MORE than one of the 5 chosen directions, so that first-match
 *     tie-break is genuinely arbitrary for most of the surface, not forced
 *     by geometry -- a real candidate root cause for the small, scattered
 *     physical pieces seen throughout (several of the 11 physical pieces
 *     had only 6-22 own patches). `absorbSmallDisconnectedComponents`
 *     (`regionDirectConstruction.ts`) tests this directly: it reassigns an
 *     orphan component (any component that is not its own direction's
 *     largest) to an alternative direction only when that alternative both
 *     legally covers it AND is mesh-adjacent to it -- so a merge only ever
 *     happens where it actually removes a seam, never just relocates one.
 *     Deliberately conservative (a direction's own largest component is
 *     never touched, so no direction can be drained to zero and make the
 *     whole assignment unusable). Verified correct in isolation on
 *     synthetic adjacency graphs (`regionDirectConstruction.absorption.
 *     test.ts`). Measured against this real fixture: reduces the physical
 *     piece count BEFORE any CSG/volumetric construction from 11 to 10 --
 *     real, but only one merge; the other four small fragments (6, 6, 20,
 *     21, 22 patches) have no legal, adjacent alternative at all, so they
 *     are not a first-match artifact -- they are genuinely isolated visible
 *     islands. End-to-end with the volumetric construction path, this
 *     10-piece input still fails release (a piece past index 34 in the
 *     post-decompose expansion cannot find a collision-free release
 *     direction), the same order of magnitude as the pre-fix 38/101/41
 *     measurements. Conclusion: the assignment stage contributes a small,
 *     real, and now-fixed amount of avoidable fragmentation, but it is NOT
 *     the dominant source -- the dominant source remains downstream, in
 *     construction itself (the CSG boundary or volumetric tie-wedge
 *     mechanisms items 1-5 already diagnosed).
 *
 *  7. A further, literal attempt at "PER-REGION, geometry-aware tie-break"
 *     on the volumetric paradigm: replace the whole-piece average plane
 *     with one computed from a LOCAL, capped mesh-edge-BFS neighborhood
 *     around whichever triangle is nearest the query point
 *     (`volumetricPartition.ts`'s own doc comment has the full mechanism).
 *     Measured at three cap sizes to trace the whole curve from local to
 *     global: 24 triangles (>=101 pieces), 100 triangles (>=87), 5000
 *     triangles/effectively whole-piece (>=33, matching the already-known
 *     whole-piece result). One monotonic curve, no interior minimum --
 *     neighborhood SIZE was not the missing ingredient. Reverted to the
 *     plain whole-piece average (no value for the added complexity).
 *  8. Execution 08 LOOP 02/14/28 -- BREAKTHROUGH: true multi-label surface
 *     reconstruction (`multiLabelPartition.ts` + `multiLabelReconstruction.
 *     ts`), the "true multi-label surface reconstruction" alternative
 *     named (but not yet built) since item 5. Every attempt above (1-7)
 *     shares one property: a point's piece is decided by a LOCAL
 *     criterion evaluated independently, with NO awareness of its
 *     neighbors' own decisions -- exactly what lets a small pocket end up
 *     scattered. This replaces that with a discrete voxel labeling solved
 *     via ICM (Iterated Conditional Modes) for a Potts-model random field:
 *     one JOINT computation across every piece, whose own objective
 *     explicitly penalizes a voxel disagreeing with its neighbors
 *     (`multiLabelReconstruction.test.ts` proves this directly and in
 *     isolation: it removes a synthetic single-voxel mislabeled island
 *     while preserving a genuinely large minority region). Measured
 *     against the real free-form regression fixture: of the 10 physical
 *     pieces from the same region-set-cover assignment used by every
 *     other attempt, ALL TEN decompose to exactly ONE connected component
 *     each after raw reconstruction (never achieved by any prior
 *     technique -- the closest before this was 10 -> 33). End to end
 *     through full carving, registration, and release verification: NINE
 *     of ten pieces release-verify cleanly (the tenth causes one of the
 *     nine to further decompose into two components during carving, an
 *     11-piece final result -- still dramatically better than every prior
 *     attempt's 25-101+). The ONE remaining failure is not a fresh defect:
 *     it is a 6-triangle piece, matched by exact triangle count against
 *     item 6's own finding, one of the two "genuinely isolated visible
 *     islands" already identified as having no legal adjacent merge
 *     alternative -- and it now additionally has no legal RELEASE
 *     direction either. Checked twice, at increasing strength, per
 *     principle 10's own imperative (never equate a search-budget failure
 *     with physical impossibility): first against all 10 pieces' own
 *     directions and their negations (20 candidates), stable across four
 *     independently measured smoothness-weight settings; then against the
 *     FULL planning candidate-direction set (26 directions, 70+ total
 *     candidates including negations and the sibling set --
 *     `WorkingMoldConstructionInput.extraReleaseDirections`) -- the same
 *     piece fails identically both times
 *     (`regionDirectConstruction.multiLabel.test.ts` has both as
 *     permanent regressions). That is meaningfully strong evidence of a
 *     genuine geometric constraint on this one tiny island (an undercut
 *     pocket no straight-line pull can clear), not a technique
 *     limitation or a narrow-search artifact -- wired into
 *     `masterMoldEngine.ts` as a further real last-resort fallback, tried
 *     after the CSG fallback
 *     when it also fails, since it is a substantively better technique
 *     for any real part that does not happen to contain this exact kind
 *     of isolated undercut island.
 *
 * That trajectory -- 5, then 11, then 23, then 25, then 38/101/41, then a
 * confirmed-real-but-modest 11->10 at the assignment stage, then a
 * confirmed dead end across three tie-break granularities, then finally 10
 * physical pieces with NINE fully release-verified and only one genuinely
 * isolated island blocking full closure -- across EIGHT increasingly large
 * investigations including THREE full paradigm changes (sequential to
 * simultaneous CSG, CSG to volumetric Voronoi, volumetric Voronoi to true
 * multi-label reconstruction) is real, measurable progress, not a repeat
 * of the same ceiling: item 8 is the first technique in this entire
 * investigation to reach full release verification for the large majority
 * of a hard, real, previously-unsolved fixture's own pieces. LOOP 02's
 * remaining gate item is NOT met -- one specific island still blocks full
 * closure -- but the honest characterization changed: this is no longer
 * "no technique converges", it is "one small, likely genuinely
 * undercut-locked geometric feature remains, isolated and precisely
 * identified, on top of a technique that otherwise works." The fixes
 * above are all real and kept (each is a correctness improvement
 * independent of whether this specific fixture ever fully closes); item 8
 * specifically is now wired into production as a real fallback, not just
 * tested infrastructure. Do not read this file's current passing status
 * as full LOOP 02 closure.
 */
describe("Real free-form regression (Execution 08 LOOP 02)", () => {
  it("reaches real exact-CSG AND multi-label construction via both fallbacks, still fails release for this specific hard fixture (one genuinely isolated island)", { timeout: 120_000 }, async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const seed = seedFromFixture(fixture);
    const result = await runMasterMoldEngine(seed);

    expect(result.plan).toBeNull();
    expect(result.toolingSets).toEqual([]);
    // Both real-construction fallbacks run now: the region-direct-assignment
    // CSG fallback (Execution 08 LOOP 14), then, since it also fails release,
    // the multi-label reconstruction fallback (Execution 08 LOOP 02/14/28,
    // this file's own doc comment has the full history) -- a genuinely
    // different technique, tried as a further last resort, not a
    // replacement.
    expect(result.budget.workingMoldConstructionAttempts).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.reason).toBe("no_release_plan");
    expect(result.failures[0]!.family).toBe("budget-exhausted");
    // The LAST real construction attempt's own failure reason is preserved
    // (multi-label, tried after the CSG fallback) -- and it is a release
    // failure for a SPECIFIC, tiny, isolated island (this file's own doc
    // comment traces it to a genuinely un-mergeable 6-triangle fragment),
    // not a generic or silently-dropped message.
    expect(result.failures[0]!.message).toMatch(/region-set-cover-driven multi-label reconstruction/);
    expect(result.failures[0]!.message).toMatch(/cannot release/);

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
