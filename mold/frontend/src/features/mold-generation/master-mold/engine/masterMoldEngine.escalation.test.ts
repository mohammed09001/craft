import { describe, expect, it, vi } from "vitest";

// Execution 07 LOOP 01: exact failure at piece count N must escalate to N+1
// instead of returning no_release_plan. The working-mold constructor is the
// exact-verification stage; a deterministic mock rejects every attempt at
// the minimum piece count so the escalation path (and its rejection
// evidence) is observable without a fixture that is naturally
// planning-feasible but exactly locked.
//
// Rejects by the SEMANTIC piece count (input.pieces.length), not a raw call
// counter: the engine can retry a single finalist more than once (Execution
// 08's finalist-diversity insurance slot, and LOOP 14's height-field
// fallback both add real extra constructWorkingMold calls at the SAME piece
// count when eligible), and a fixed call-count budget drifts out of sync
// with that internal retry count every time a new, legitimate retry is
// added. Tying rejection to the piece count itself is robust to any number
// of internal attempts, and never risks eating into the NEXT piece count's
// (meant-to-succeed) attempts either.
const mockState = { rejectPieceCount: 0 };

vi.mock("../planning/workingMoldConstructor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../planning/workingMoldConstructor")>();
  return {
    ...actual,
    constructWorkingMold: async (input: Parameters<typeof actual.constructWorkingMold>[0]) => {
      if (input.pieces.length === mockState.rejectPieceCount) {
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
    mockState.rejectPieceCount = 2;
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
      mockState.rejectPieceCount = 0;
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
