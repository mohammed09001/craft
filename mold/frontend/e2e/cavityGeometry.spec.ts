import { expect, test } from "@playwright/test";

// Mirrors CavityProbeResult in src/test-harness/cavityGeometryProbe.ts.
// Duplicated (not imported) because e2e/ compiles under tsconfig.node.json,
// a separate TypeScript project from src/ with no DOM lib -- see that
// file's declare global for the authoritative shape.
interface CavityProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly originalVolumeMm3: number | null;
  readonly removedVolumeMm3: number | null;
  readonly resultVolumeMm3: number | null;
  readonly affectedBodyCount: number | null;
  readonly resultBodyCount: number | null;
  readonly allBodiesWatertightAndManifold: boolean | null;
  readonly blockerCount: number | null;
}

/**
 * Real-browser proof of Manifold-backed geometry, extending the smoke spec's
 * "app boots and imports an STL" coverage to a real Boolean operation (see
 * Execution 06 Objective C). The current product UI drives face selection
 * through raycasting on the WebGL canvas, which has no stable, non-brittle
 * Playwright-addressable coordinates -- so this uses the sanctioned Path B
 * fallback: a test-only browser probe (src/test-harness/cavityGeometryProbe.ts,
 * served from e2e-harness.html, a separate production build entry) that
 * imports and invokes the exact same production `runCavityGenerationInWorker`
 * path a real "Create Cavity" click drives, against a deterministic fixture.
 *
 * This proves, in real Chromium against the production build: the real
 * cavityGeneration.worker.ts Worker starts, the real manifold-3d WASM module
 * loads and runs a real Boolean subtraction, and the result is a genuine,
 * deterministic geometry change -- not a mock.
 */
test("runs a real Manifold-backed Boolean subtraction through the production Worker path in Chromium", async ({
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
    () => typeof (globalThis as { __cavityProbe?: unknown }).__cavityProbe === "function",
  );

  const result = await page.evaluate<CavityProbeResult>(() =>
    (globalThis as unknown as { __cavityProbe: () => Promise<CavityProbeResult> }).__cavityProbe(),
  );

  expect(result.error, `Cavity probe reported an error: ${result.error}`).toBeNull();
  expect(result.ok).toBe(true);
  expect(result.blockerCount).toBe(0);
  expect(result.allBodiesWatertightAndManifold).toBe(true);

  // Deterministic values proven by the identical fixture in
  // cavityGeneration.integration.test.ts -- a real 10x10x10 part subtracted
  // from a 30x30x30 reference block split around it.
  expect(result.originalVolumeMm3).toBeCloseTo(27_000, 8);
  expect(result.removedVolumeMm3).toBeCloseTo(1_000, 8);
  expect(result.resultVolumeMm3).toBeCloseTo(26_000, 8);
  expect(result.affectedBodyCount).toBe(2);
  expect(result.resultBodyCount).toBe(2);

  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(
    consoleErrors,
    `Console errors: ${consoleErrors.join("; ")}`,
  ).toHaveLength(0);
});
