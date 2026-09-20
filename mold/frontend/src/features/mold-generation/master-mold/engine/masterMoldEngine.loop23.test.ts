import { describe, expect, it } from "vitest";

import { buildMushroomOverhangFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
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
});
