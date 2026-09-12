import { expect, test } from "@playwright/test";

// Mirrors MasterMoldProbeResult in src/test-harness/masterMoldGenerationProbe.ts.
// Duplicated (not imported) because e2e/ compiles under tsconfig.node.json,
// a separate TypeScript project from src/ with no DOM lib -- see that
// file's declare global for the authoritative shape.
interface MasterMoldProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly bodyCount: number | null;
  readonly status: string | null;
  readonly direction: string | null;
  readonly volumeMm3: number | null;
  readonly watertight: boolean | null;
  readonly manifold: boolean | null;
}

/**
 * Real-browser proof of Master Mold's Manifold + three-mesh-bvh pipeline,
 * mirroring cavityGeometry.spec.ts's rationale: the product UI drives the
 * Master Mold toolbar button only after a WebGL-canvas-raycast face
 * selection and a full cutting/cavity commit, which has no stable,
 * non-brittle Playwright-addressable path. This uses the same sanctioned
 * Path B fallback: a test-only browser probe
 * (src/test-harness/masterMoldGenerationProbe.ts, served from
 * e2e-harness.html) that imports and invokes the exact same production
 * `runMasterMoldGenerationInWorker` path a real "Master Mold" click drives,
 * against a deterministic fixture.
 *
 * This proves, in real Chromium against the production build: the real
 * masterMoldGeneration.worker.ts Worker starts, the real manifold-3d WASM
 * module loads and runs a real Boolean subtraction, the real three-mesh-bvh
 * open-direction analysis runs, and the result is a genuine, deterministic
 * geometry change -- not a mock.
 */
test("runs a real Manifold + three-mesh-bvh Master Mold generation through the production Worker path in Chromium", async ({
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
  expect(result.bodyCount).toBe(1);
  expect(result.status).toBe("current");
  expect(result.watertight).toBe(true);
  expect(result.manifold).toBe(true);

  // Deterministic values proven by the identical fixture in
  // masterMoldGeometry.generator.test.ts -- a 10x6x4mm box wrapped with a
  // 3mm wall and 3mm bottom, open on its shortest (Z) axis.
  expect(result.direction).toBe("+Z");
  const stockVolume = (10 + 2 * 3) * (6 + 2 * 3) * (4 + 3);
  const targetVolume = 10 * 6 * 4;
  expect(result.volumeMm3).toBeCloseTo(stockVolume - targetVolume, 3);

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
  readonly registrationStatus: string | null;
  readonly bodyCountBeforeSprue: number | null;
  readonly statusBeforeSprue: string | null;
  readonly bodyCountAfterSprue: number | null;
  readonly statusAfterSprue: string | null;
  readonly geometryChangedAfterSprue: boolean | null;
  readonly volumesAfterSprueMm3: readonly number[] | null;
}

/**
 * Article 01/10: the probe above proves the Worker/Manifold/three-mesh-bvh
 * plumbing runs for real, but deliberately skips final-mold-target synthesis
 * entirely (a bare box, no cavity, no Sprue, no Registration) -- exactly the
 * gap Execution 03 calls out ("Do not use a direct worker probe as the only
 * E2E evidence"). This drives the SAME production store creators the real
 * toolbar uses (createSplitFaceStoreCreator, createMasterMoldStoreCreator),
 * wired to their real Worker-backed clients, through Create Cavity -> Sprue
 * -> Master Mold against a realistic cavity-bearing, Sprue-and-Registration
 * final-mold target, and proves the result reaches a usable `current` state
 * both before and after the Sprue is added -- never `blocked` for this
 * manufacturable fixture (Product Invariants: blocked/stale is not a
 * successful result for an ordinary integration case).
 */
test("drives the real Create Cavity -> Sprue -> Master Mold production stores against a realistic cavity + Sprue + Registration fixture in Chromium", async ({
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
  expect(result.registrationStatus).toBe("generated");

  expect(result.statusBeforeSprue).toBe("current");
  expect(result.bodyCountBeforeSprue).toBeGreaterThan(0);

  // The Product Invariant this whole spec exists to enforce: a valid Sprue
  // addition must regenerate to a usable `current` Master Mold, not `blocked`.
  expect(result.statusAfterSprue).toBe("current");
  expect(result.bodyCountAfterSprue).toBe(result.bodyCountBeforeSprue);
  expect(result.geometryChangedAfterSprue).toBe(true);
  expect(result.volumesAfterSprueMm3?.every((volume) => volume > 0)).toBe(true);

  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(consoleErrors, `Console errors: ${consoleErrors.join("; ")}`).toHaveLength(0);
});
