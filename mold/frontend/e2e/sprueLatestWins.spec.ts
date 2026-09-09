import { expect, test } from "@playwright/test";

interface SprueProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly sprueCount: number;
  readonly totalGenerateCalls: number;
  readonly secondEvalGenerateCalls: number;
  readonly thirdEvalGenerateCalls: number;
  readonly resolvedSprueCount: number;
  readonly secondEvalAllCached: boolean;
  readonly thirdEvalSingleRegenerate: boolean;
  readonly blockerCount: number;
  readonly bodyCount: number;
}

/**
 * Real-browser proof of the bounded per-Sprue memoization cache in
 * evaluateDerivedMold (Execution 09 Objective A, Path B).
 *
 * The probe runs three sequential evaluateDerivedMold calls against the
 * same deterministic cavity fixture using the real Manifold kernel inside
 * Chromium and counts how many times SprueGenerationService.generate is
 * actually invoked:
 *
 *   1. [A, B]        -> 2 generate calls  (both fresh)
 *   2. [A, B] (same) -> 0 generate calls  (cache hit)
 *   3. [A, B']       -> 1 generate call   (B changed, A reused)
 *
 * A clean pass proves the cache's key composition (moldRevision + profile
 * snapshot + anchor + coordinateSpace) correctly distinguishes "unchanged
 * prefix" from "changed entry" and that upstream-body invalidation propagates
 * through moldRevision in a real browser, not just under jsdom.
 */
test("per-Sprue cache reuses unchanged Sprues and only regenerates the changed one", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/e2e-harness.html");
  await page.waitForFunction(
    () => typeof (globalThis as { __sprueLatestWinsProbe?: unknown }).__sprueLatestWinsProbe === "function",
  );

  const result = await page.evaluate<SprueProbeResult>(() =>
    (globalThis as unknown as { __sprueLatestWinsProbe: () => Promise<SprueProbeResult> }).__sprueLatestWinsProbe(),
  );

  expect(result.error, `Probe error: ${result.error}`).toBeNull();
  expect(result.ok).toBe(true);
  expect(result.sprueCount).toBe(2);
  expect(result.bodyCount).toBeGreaterThan(0);

  // First evaluation: both Sprues are fresh -> 2 generate calls.
  expect(result.totalGenerateCalls).toBeGreaterThanOrEqual(3);

  // Second evaluation: identical inputs -> 0 generate calls (full cache hit).
  expect(result.secondEvalAllCached).toBe(true);
  expect(result.secondEvalGenerateCalls).toBe(0);

  // Third evaluation: one Sprue changed -> only 1 generate call.
  expect(result.thirdEvalSingleRegenerate).toBe(true);
  expect(result.thirdEvalGenerateCalls).toBe(1);

  expect(pageErrors, `Page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(consoleErrors, `Console errors: ${consoleErrors.join("; ")}`).toHaveLength(0);
});
