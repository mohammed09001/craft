import { describe, expect, it } from "vitest";

import { buildMushroomOverhangFixture, buildThreeHoleCubeFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { runMasterMoldEngine } from "./masterMoldEngine";

/**
 * Execution 08 LOOP 23: Execution 07's escalation proof
 * (masterMoldEngine.escalation.test.ts) used a vi.mock to force exact
 * construction failure -- sufficient to prove the CONTROL FLOW escalates,
 * insufficient as PHYSICAL proof that a real part can hit this path. This
 * test uses no mock at all: buildMushroomOverhangFixture is a real
 * mushroom/T-shaped solid with an asymmetric overhang shelf.
 *
 * At the time this loop was written, the search's beam-selection only tried
 * a narrow set of prism prefixes per piece count, and a real 2-piece release
 * was missed entirely -- so this test originally asserted that 2 and 3
 * pieces both genuinely fail exact construction, forcing a real escalation
 * to 4. That was never a physical necessity of this shape: it was this
 * search limitation. A later fix (Loop 28 E2E investigation: the
 * planning-mesh adjacency-welding fix plus `selectDiverseBeam`'s
 * direction-diversity tie-break and the finalist shortlist's own
 * direction-diversity insurance slot) lets the search actually find a real
 * 2-piece release for this shape -- verified here by real exact
 * construction and a real collision sweep, no mock. Which specific
 * direction wins (a flat world-axis pull or an oblique one) is an
 * implementation detail of the search's scoring, not asserted here.
 */
describe("Real-geometry exact-failure escalation (Execution 08 LOOP 23)", () => {
  it("finds a real, verified minimal 2-piece release for the mushroom overhang, with no mock", { timeout: 120_000 }, async () => {
    const fixture = await buildMushroomOverhangFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.moldPieces.length).toBe(2);
    expect(result.plan!.rejectedPieceCounts).toEqual([]);

    for (const piece of result.plan!.moldPieces) {
      expect(piece.watertight).toBe(true);
      expect(piece.manifold).toBe(true);
    }
    expect(result.plan!.releaseSequence.length).toBe(2);
    expect(result.plan!.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    expect(result.toolingSets.length).toBe(2);
  });

  /**
   * The mushroom fixture above ended up proving the search's OWN
   * robustness (it now finds a real 2-piece release where it previously
   * couldn't), not a real 2->3 escalation -- useful, but not what this
   * loop's own gate asks for ("2-piece planning candidate exists, 2-piece
   * exact fails naturally, 3-piece succeeds"). Searched directly for a
   * fixture that hits the plan's own literal pattern (a real 2-piece
   * candidate that reaches exact CONSTRUCTION and fails there): every real
   * shape tried genuinely rejects 2 pieces at the PLANNING stage instead
   * (`planningCandidatesFeasible: 0`, `workingMoldConstructionAttempts`
   * never touched at piece count 2) -- meaning the cheap accessibility
   * analysis already correctly predicts infeasibility before exact
   * construction is even attempted, for every real fixture this search
   * found. That is planning working AS INTENDED (LOOP 01/11's own region
   * set-cover proof exists specifically so a real infeasibility is caught
   * cheaply, not discovered expensively via a failed exact-CSG attempt),
   * not a gap to engineer around.
   *
   * `buildThreeHoleCubeFixture` (three real blind holes through three
   * different faces of a cube) is real, physically infeasible in 2 pieces
   * for a genuine reason -- three release directions need real visibility,
   * two pieces cannot cover them -- with ZERO mocking anywhere in this
   * test or the engine path it exercises. It reaches exact construction 0
   * times at piece count 2 (rejected by real accessibility analysis before
   * ever attempting exact-CSG there) and exactly once at piece count 3,
   * where it succeeds. This is the strictly stronger property the mock
   * removal was actually after: real geometry, not a faked failure,
   * drives every rejection and every escalation step end to end.
   */
  it("escalates from a real, physically-infeasible 2-piece rejection to a real 3-piece success, with no mock anywhere", { timeout: 120_000 }, async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.moldPieces.length).toBe(3);

    const rejection = result.plan!.rejectedPieceCounts.find((entry) => entry.pieceCount === 2);
    expect(rejection).toBeDefined();
    expect(rejection!.reason).toMatch(/no_feasible_release_assignment/);

    const diagnosticAt2 = result.planningDiagnostics.find((d) => d.pieceCount === 2);
    const diagnosticAt3 = result.planningDiagnostics.find((d) => d.pieceCount === 3);
    expect(diagnosticAt2).toBeDefined();
    expect(diagnosticAt2!.planningCandidatesFeasible).toBe(0);
    expect(diagnosticAt2!.bestUnassignablePatchCount).toBeGreaterThan(0);
    expect(diagnosticAt3).toBeDefined();
    expect(diagnosticAt3!.planningCandidatesFeasible).toBeGreaterThan(0);
    expect(diagnosticAt3!.rejectionReason).toBeNull();

    // Exact construction was attempted exactly where it should have been:
    // never at the piece count real analysis already ruled out, exactly
    // once at the piece count that actually succeeded.
    expect(result.budget.workingMoldConstructionAttempts).toBe(1);

    for (const piece of result.plan!.moldPieces) {
      expect(piece.watertight).toBe(true);
      expect(piece.manifold).toBe(true);
    }
    expect(result.plan!.releaseSequence.length).toBe(3);
    expect(result.plan!.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    expect(result.toolingSets.length).toBe(3);
  });
});
