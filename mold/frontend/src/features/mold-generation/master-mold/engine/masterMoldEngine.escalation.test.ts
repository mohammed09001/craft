import { describe, expect, it, vi } from "vitest";

import { MASTER_PLANNER_LIMITS } from "../planning/masterMoldPlanning.contracts";

// Execution 07 LOOP 01: exact failure at piece count N must escalate to N+1
// instead of returning no_release_plan. The working-mold constructor is the
// exact-verification stage; a deterministic mock rejects the first K exact
// attempts so the escalation path (and its rejection evidence) is observable
// without a fixture that is naturally planning-feasible but exactly locked.
const mockState = { exactFailuresRemaining: 0 };

vi.mock("../planning/workingMoldConstructor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../planning/workingMoldConstructor")>();
  return {
    ...actual,
    constructWorkingMold: async (input: Parameters<typeof actual.constructWorkingMold>[0]) => {
      if (mockState.exactFailuresRemaining > 0) {
        mockState.exactFailuresRemaining -= 1;
        throw new Error("mock exact construction failure");
      }
      return actual.constructWorkingMold(input);
    },
  };
});

import { runMasterMoldEngine } from "./masterMoldEngine";
import { buildSimpleBoxFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";

describe("Execution 07 LOOP 01: exact-failure piece-count escalation", () => {
  it("escalates to the next piece count when every finalist at N fails exact construction", { timeout: 300_000 }, async () => {
    const fixture = await buildSimpleBoxFixture();
    // Reject every exact attempt the planner offers at the minimum count:
    // maxExactPlansPerPieceCount top-scored finalists, plus the one
    // additional direction-diverse insurance finalist the shortlist can add
    // (Execution 08 Loop 28 E2E fix) when a genuinely different release
    // direction exists.
    mockState.exactFailuresRemaining = MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount + 1;
    try {
      const result = await runMasterMoldEngine(seedFromFixture(fixture));
      expect(result.failures).toEqual([]);
      expect(result.plan).not.toBeNull();
      // The minimum exactly verified count wins: 2 failed exact, 3 verified.
      expect(result.plan!.moldPieces.length).toBe(3);
      const rejection = result.plan!.rejectedPieceCounts.find((entry) => entry.pieceCount === 2);
      expect(rejection).toBeDefined();
      expect(rejection!.reason).toContain("failed exact construction");
      // The score describes the verified finalist (3 pieces), not the
      // rejected planning preference.
      expect(result.plan!.score.interfaceCount).toBe(2);
    } finally {
      mockState.exactFailuresRemaining = 0;
    }
  });

  it("stops at the first exactly verified count when the minimum succeeds", { timeout: 300_000 }, async () => {
    const fixture = await buildSimpleBoxFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.moldPieces.length).toBe(2);
    expect(result.plan!.rejectedPieceCounts).toEqual([]);
  });
});
