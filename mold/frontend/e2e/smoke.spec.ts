import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TETRAHEDRON_STL = path.join(
  __dirname,
  "fixtures/closed_tetrahedron_ascii.stl",
);

/**
 * Minimum critical-path smoke: app boots, the viewport reaches "Ready" with
 * exactly one canvas, a deterministic ASCII STL fixture imports through the
 * real (non-mocked) runtime and reaches "ready", and nothing throws along
 * the way. This is the browser-realistic proof unit tests (which run in
 * jsdom, with no real WebGL/WASM) cannot provide -- in particular, it
 * exercises the real `manifold-3d` package entry Vite's build reports a
 * `node:module` externalization warning for, so a genuine runtime break
 * there would surface here even though the build itself exits 0.
 */
test("app boots, imports a deterministic STL, and stays error-free", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/workspace");

  const viewportStatus = page.locator("#viewport-live-status");
  await expect(viewportStatus).toContainText("Viewport: Ready", {
    timeout: 30_000,
  });

  await expect(page.locator("canvas")).toHaveCount(1);

  // exact: true avoids a strict-mode collision with the empty-state overlay's
  // "Drop zone for one local STL file" label, which case-insensitively
  // contains this input's accessible name as a substring.
  const fileInput = page.getByLabel("Local STL file", { exact: true });
  await fileInput.setInputFiles(TETRAHEDRON_STL);

  await expect(
    page.getByText(
      /Ready: closed_tetrahedron_ascii\.stl \(STL, .+, 4 triangles\)/,
    ),
  ).toBeVisible({ timeout: 30_000 });

  // The import must not have replaced the single runtime canvas with a
  // second one, and the app must remain interactive afterward.
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(viewportStatus).toContainText("Viewport: Ready");

  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(
    consoleErrors,
    `Console errors: ${consoleErrors.join("; ")}`,
  ).toHaveLength(0);
});
