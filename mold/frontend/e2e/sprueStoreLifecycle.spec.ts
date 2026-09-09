import { expect, test } from "@playwright/test";

interface Result {
  readonly ok: boolean; readonly error: string | null; readonly createAccepted: boolean;
  readonly resizeAccepted: boolean; readonly entryResizeAccepted: boolean; readonly burstAccepted: boolean;
  readonly pendingObserved: boolean; readonly dispatchCount: number; readonly resolvedSprueCount: number;
  readonly finalMainDiameterMm: number | null; readonly finalEntryNeckDiameterMm: number | null;
  readonly registrationStatus: string; readonly documentMatchesResult: boolean; readonly historyDelta: number;
}

test("production SplitFace store completes Sprue lifecycle and coalesces a resize burst", async ({ page }) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/e2e-harness.html");
  await page.waitForFunction(() => typeof (globalThis as { __sprueStoreLifecycleProbe?: unknown }).__sprueStoreLifecycleProbe === "function");
  const result = await page.evaluate<Result>(() => (globalThis as unknown as { __sprueStoreLifecycleProbe: () => Promise<Result> }).__sprueStoreLifecycleProbe());
  expect(result.ok, result.error ?? "unknown probe failure").toBe(true);
  expect(result.createAccepted).toBe(true);
  expect(result.resizeAccepted).toBe(true);
  expect(result.entryResizeAccepted).toBe(true);
  expect(result.burstAccepted).toBe(true);
  expect(result.pendingObserved).toBe(true);
  expect(result.resolvedSprueCount).toBe(1);
  expect(result.finalMainDiameterMm).toBeCloseTo(5.3, 6);
  expect(result.finalEntryNeckDiameterMm).toBeCloseTo(2.7, 6);
  expect(result.dispatchCount).toBeLessThanOrEqual(5);
  expect(result.registrationStatus).toBe("generated");
  expect(result.documentMatchesResult).toBe(true);
  expect(result.historyDelta).toBe(4);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
