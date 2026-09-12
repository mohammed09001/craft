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
