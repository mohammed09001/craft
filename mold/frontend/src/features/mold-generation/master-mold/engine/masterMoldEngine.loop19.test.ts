import { describe, expect, it } from "vitest";

import { buildFreeFormObliqueLockFixture, buildSimpleBoxFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { runMasterMoldEngine } from "./masterMoldEngine";

/**
 * Execution 08 LOOP 19: search budgets must be observable and causal -- a
 * budget-exhausted failure names which budget exhausted, and 0 exact
 * construction attempts must never be confusable with an exact-CSG engine
 * failure.
 */

const BUDGET_NAMES = [
  "candidate_directions",
  "combination_directions",
  "parting_thresholds",
  "beam_width",
  "piece_count",
  "exact_construction_attempts",
  "parting_surface",
] as const;

describe("Observable, causal search budgets (Execution 08 LOOP 19)", () => {
  it("reports every named budget with limit/used/pruned/reason on a successful plan", async () => {
    const fixture = await buildSimpleBoxFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.failures).toEqual([]);
    expect(result.budget.budgetDetails.map((item) => item.name).sort()).toEqual([...BUDGET_NAMES].sort());
    for (const item of result.budget.budgetDetails) {
      expect(item.limit).toBeGreaterThanOrEqual(0);
      expect(item.used).toBeGreaterThanOrEqual(0);
      expect(item.pruned).toBeGreaterThanOrEqual(0);
      expect(item.reason.length).toBeGreaterThan(0);
    }
    const pieceCountBudget = result.budget.budgetDetails.find((item) => item.name === "piece_count")!;
    expect(pieceCountBudget.used).toBe(2); // the box succeeds at the minimum 2-piece attempt.
  }, 60_000);

  it("0 exact construction attempts is distinguishable from an exact-CSG engine failure via the exact_construction_attempts budget", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    // Execution 08 LOOP 14 (real-regression root cause fix): this fixture's
    // ordinary search still finds 0 feasible candidates, but the engine now
    // has a real last-resort fallback (region-set-cover-driven direct
    // assignment) that IS eligible here (region set-cover proves 5
    // directions suffice, within the default 6-piece ceiling) and DOES
    // reach real exact construction -- so this fixture no longer exhibits
    // 0 attempts on its own. Capping the piece-count preference below the
    // 5 directions that fallback needs keeps it ineligible
    // (`directCover.steps.length <= maxPieces` fails), preserving a genuine
    // 0-feasible-candidates-AND-0-attempts scenario to test this budget's
    // own reporting distinction, independent of that fallback's own
    // separate (and separately tested: masterMoldEngine.loop02RealRegression.test.ts)
    // success/failure.
    const result = await runMasterMoldEngine(seedFromFixture(fixture, { userPreferences: { preferredMaximumWorkingMoldPieces: 3 } }));
    expect(result.plan).toBeNull();
    expect(result.budget.workingMoldConstructionAttempts).toBe(0);
    const exactBudget = result.budget.budgetDetails.find((item) => item.name === "exact_construction_attempts")!;
    expect(exactBudget.used).toBe(0);
    expect(exactBudget.reason).toMatch(/never reached exact construction/);
    // The top-level failure message is explicit about this too -- never a
    // generic "search failed" with no causal account.
    expect(result.failures[0]!.message).toMatch(/No individual search budget was exhausted|Exhausted budget\(s\)/);
  }, 60_000);

  it("names an actually-exhausted budget (piece_count) when the search reaches its escalation ceiling with rejected counts", async () => {
    const fixture = await buildFreeFormObliqueLockFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    const pieceCountBudget = result.budget.budgetDetails.find((item) => item.name === "piece_count")!;
    // Automatic mode reaches the 6-piece safety ceiling for this fixture.
    expect(pieceCountBudget.used).toBe(pieceCountBudget.limit);
    expect(result.failures[0]!.message).toMatch(/piece_count/);
  }, 60_000);
});
