import { expect, test } from "@playwright/test";

// Mirrors MasterMoldProbeResult in src/test-harness/masterMoldGenerationProbe.ts.
// Duplicated (not imported) because e2e/ compiles under tsconfig.node.json,
// a separate TypeScript project from src/ with no DOM lib -- see that
// file's declare global for the authoritative shape.
interface MasterMoldProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly setCount: number | null;
  readonly releaseMode: string | null;
  readonly pieceCount: number | null;
  readonly pourFace: string | null;
  readonly pieceVolumeMm3: number | null;
  readonly watertight: boolean | null;
  readonly manifold: boolean | null;
}

/**
 * Real-browser proof of Master Mold's Execution 05 engine pipeline,
 * mirroring cavityGeometry.spec.ts's rationale: the product UI drives the
 * Master Mold toolbar button only after a WebGL-canvas-raycast face
 * selection and a full cutting commit, which has no stable,
 * non-brittle Playwright-addressable path. This uses the same sanctioned
 * Path B fallback: a test-only browser probe
 * (src/test-harness/masterMoldGenerationProbe.ts, served from
 * e2e-harness.html) that imports and invokes the exact same production
 * `runMasterMoldGenerationInWorker` path a real "Master Mold" click drives
 * -- the Master Mold Engine (cast target builder, pour-face planner,
 * release analysis, tooling construction) -- against a deterministic
 * fixture.
 *
 * This proves, in real Chromium against the production build: the real
 * masterMoldGeneration.worker.ts Worker starts, the real manifold-3d WASM
 * module loads and runs real Boolean operations, the pour-face planner and
 * release verifier run, and the result is a genuine, deterministic
 * one-piece tooling set -- not a mock.
 */
test("runs the real Master Mold Engine through the production Worker path in Chromium", async ({
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
    () => typeof (globalThis as { __masterMoldProbe?: unknown }).__masterMoldProbe === "function",
  );

  const result = await page.evaluate<MasterMoldProbeResult>(() =>
    (globalThis as unknown as { __masterMoldProbe: () => Promise<MasterMoldProbeResult> }).__masterMoldProbe(),
  );

  expect(result.error, `Master Mold probe reported an error: ${result.error}`).toBeNull();
  expect(result.ok).toBe(true);
  // Execution 06: the 10mm cube plans the minimum TWO-piece working mold,
  // each piece cased with a verified one-piece printable case.
  expect(result.setCount).toBe(2);
  expect(result.releaseMode).toBe("one-piece");
  expect(result.pieceCount).toBe(1);
  expect(result.pourFace).not.toBeNull();
  expect(result.watertight).toBe(true);
  expect(result.manifold).toBe(true);
  expect(result.pieceVolumeMm3 ?? 0).toBeGreaterThan(0);

  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(
    consoleErrors,
    `Console errors: ${consoleErrors.join("; ")}`,
  ).toHaveLength(0);
});

// Mirrors MasterMoldRealisticWorkflowResult in
// src/test-harness/masterMoldRealisticWorkflowProbe.ts.
interface MasterMoldRealisticWorkflowResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly setCount: number | null;
  readonly status: string | null;
  readonly releaseMode: string | null;
  readonly pieceCount: number | null;
  readonly watertight: boolean | null;
}

/**
 * Execution 05 Articles 05/12: the probe above proves the Worker/engine
 * plumbing runs for real against a hand-built snapshot; this drives the
 * SAME production store creators the real toolbar uses
 * (createSplitFaceStoreCreator through the real committed-segmentation
 * seam, createMasterMoldStoreCreator) wired to their real Worker-backed
 * clients, builds the authoritative project snapshot through the production
 * snapshot assembly, and proves the engine reaches a verified `current`
 * one-piece tooling set for a manufacturable fixture.
 */
test("drives the real Master Mold production stores from committed project truth to a verified tooling set in Chromium", async ({
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
    () => typeof (globalThis as { __masterMoldRealisticWorkflowProbe?: unknown }).__masterMoldRealisticWorkflowProbe === "function",
  );

  const result = await page.evaluate<MasterMoldRealisticWorkflowResult>(() =>
    (globalThis as unknown as { __masterMoldRealisticWorkflowProbe: () => Promise<MasterMoldRealisticWorkflowResult> }).__masterMoldRealisticWorkflowProbe(),
  );

  expect(result.error, `Master Mold realistic workflow probe reported an error: ${result.error}`).toBeNull();
  expect(result.ok).toBe(true);
  // Execution 06: generated straight from the imported part (no committed
  // cutting state) -- the autonomous plan is the two-piece working mold,
  // each piece tooled with a verified one-piece case.
  expect(result.setCount).toBe(2);
  expect(result.status).toBe("current");
  expect(result.releaseMode).toBe("one-piece");
  expect(result.pieceCount).toBe(1);
  expect(result.watertight).toBe(true);

  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(consoleErrors, `Console errors: ${consoleErrors.join("; ")}`).toHaveLength(0);
});
