import { describe, expect, it } from "vitest";

import { buildFreeFormObliqueLockFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { MASTER_PLANNER_LIMITS } from "../planning/masterMoldPlanning.contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";

/**
 * Execution 08 LOOP 16/17: automatic mode is not hard-stopped at 4 pieces,
 * and failure text never recommends an action that is not actually
 * available (Article 41).
 */

describe("Automatic piece-count escalation (Execution 08 LOOP 16)", () => {
  it("the default profile carries no artificial cap below the internal safety ceiling", () => {
    expect(GENERIC_RIGID_CAST_PROFILE.maximumWorkingMoldPieceCount).toBe(MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces);
  });

  it("automatic mode searches every piece count up to the safety ceiling, not a hardcoded 4", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.planningDiagnostics.map((diagnostic) => diagnostic.pieceCount)).toEqual([2, 3, 4, 5, 6]);
  }, 60_000);
});

describe("Truthful recovery guidance (Execution 08 LOOP 17)", () => {
  it("does not recommend raising the cap when automatic mode already reached the safety ceiling", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.message).not.toMatch(/raise the piece-count cap/);
    expect(result.failures[0]!.message).toMatch(/safety ceiling/);
  }, 60_000);

  it("does recommend raising the cap when a profile/user setting deliberately capped below the safety ceiling", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const seed = seedFromFixture(fixture, { processProfile: { ...GENERIC_RIGID_CAST_PROFILE, maximumWorkingMoldPieceCount: 2 } });
    const result = await runMasterMoldEngine(seed);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.message).toMatch(/raise the piece-count cap/);
  }, 60_000);
});
