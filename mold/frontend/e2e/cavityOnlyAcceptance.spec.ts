import { expect, test } from "@playwright/test";

// Mirrors CavityOnlyAcceptanceResult in src/test-harness/cavityOnlyAcceptanceProbe.ts.
// Duplicated (not imported) because e2e/ compiles under tsconfig.node.json,
// a separate TypeScript project from src/ with no DOM lib -- the same
// convention as cavityGeometry.spec.ts.
interface CavityOnlyAcceptanceResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly moldPartsCommitted: boolean | null;
  readonly moldPartBodyCount: number | null;
  readonly cavityStatus: string | null;
  readonly committedBodyCount: number | null;
  readonly allBodiesWatertight: boolean | null;
  readonly allBodiesVisible: boolean | null;
  readonly totalVolumeMm3: number | null;
  readonly masterWorkerInvoked: boolean;
  readonly masterStatusAfterCavity: string | null;
}

/**
 * Execution 05 Article 01 -- mandatory Create Cavity baseline acceptance.
 *
 * Real-browser proof that the full Create Cavity product loop completes and
 * leaves a finished, visible Final Mold committed, without generating
 * Master Mold: the Master Mold worker is replaced by a tripwire inside the
 * same page, so any hidden dependency of the Cavity loop on the Master Mold
 * engine fails this spec.
 */
test("Create Cavity completes the finished Final Mold without generating Master Mold", async ({
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
    () =>
      typeof (globalThis as { __cavityOnlyAcceptanceProbe?: unknown })
        .__cavityOnlyAcceptanceProbe === "function",
  );

  const result = await page.evaluate<CavityOnlyAcceptanceResult>(() =>
    (
      globalThis as unknown as {
        __cavityOnlyAcceptanceProbe: () => Promise<CavityOnlyAcceptanceResult>;
      }
    ).__cavityOnlyAcceptanceProbe(),
  );

  expect(result.error, `Cavity-only acceptance failed: ${result.error}`).toBeNull();
  expect(result.ok).toBe(true);
  expect(result.moldPartsCommitted).toBe(true);
  expect(result.moldPartBodyCount ?? 0).toBeGreaterThan(0);
  expect(result.cavityStatus).toBe("complete");
  expect(result.committedBodyCount ?? 0).toBeGreaterThan(0);
  expect(result.allBodiesWatertight).toBe(true);
  expect(result.allBodiesVisible).toBe(true);
  expect(result.totalVolumeMm3 ?? 0).toBeGreaterThan(0);
  expect(result.masterWorkerInvoked).toBe(false);
  expect(result.masterStatusAfterCavity).toBe("unavailable");

  expect(
    pageErrors,
    `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
  expect(
    consoleErrors,
    `Console errors: ${consoleErrors.join("; ")}`,
  ).toHaveLength(0);
});
