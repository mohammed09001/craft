import { describe, expect, it } from "vitest";

import { buildMushroomOverhangFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { runMasterMoldEngine } from "./masterMoldEngine";

/**
 * Execution 08 LOOP 23: Execution 07's escalation proof
 * (masterMoldEngine.escalation.test.ts) used a vi.mock to force exact
 * construction failure -- sufficient to prove the CONTROL FLOW escalates,
 * insufficient as PHYSICAL proof that a real part can hit this path. This
 * test uses no mock at all: buildMushroomOverhangFixture is a real
 * mushroom/T-shaped solid where planning reports every piece count as
 * feasible (per-patch ray visibility alone cannot see the interference),
 * but the exact collision sweep genuinely fails at 2 AND 3 pieces before
 * genuinely succeeding at 4 -- exercising both the 2->3 and 3->4
 * escalation steps with real geometry.
 */
describe("Real-geometry exact-failure escalation (Execution 08 LOOP 23)", () => {
  it("escalates past two real exact-construction failures (2 and 3 pieces) to a real 4-piece success, with no mock", { timeout: 120_000 }, async () => {
    const fixture = await buildMushroomOverhangFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.moldPieces.length).toBe(4);
    expect(result.budget.workingMoldConstructionAttempts).toBeGreaterThan(0);

    const rejectedCounts = result.plan!.rejectedPieceCounts.map((entry) => entry.pieceCount).sort();
    expect(rejectedCounts).toEqual([2, 3]);
    for (const entry of result.plan!.rejectedPieceCounts) {
      expect(entry.reason).toContain("failed exact construction");
      // Real geometric interference, never a mocked message.
      expect(entry.reason).not.toContain("mock");
    }

    for (const piece of result.plan!.moldPieces) {
      expect(piece.watertight).toBe(true);
      expect(piece.manifold).toBe(true);
    }
    expect(result.plan!.releaseSequence.length).toBe(4);
    expect(result.plan!.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    expect(result.toolingSets.length).toBe(4);
  });
});
