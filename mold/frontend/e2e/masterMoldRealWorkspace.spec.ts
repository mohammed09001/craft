import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOX_STL = path.join(__dirname, "fixtures/box_30mm_ascii.stl");

// Mirrors the shape src/test-harness/e2eWorkspaceStoreHooks.ts attaches to
// `window.__e2eWorkspaceStores`. Duplicated (not imported), same reason
// masterMoldGeneration.spec.ts duplicates MasterMoldProbeResult: e2e/
// compiles under tsconfig.node.json, a separate TypeScript project from
// src/ with no DOM lib.
interface WorkspaceBounds3 {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

interface WorkspaceMasterMoldBody {
  readonly status: string;
  readonly direction: string | null;
  readonly watertight: boolean;
  readonly manifold: boolean;
  readonly triangleCount: number | null;
  readonly volumeMm3: number | null;
}

interface WorkspaceMasterMoldState {
  readonly status: string;
  readonly bodies: readonly WorkspaceMasterMoldBody[];
}

interface E2eWorkspaceStores {
  readonly useSplitFaceStore: {
    getState: () => {
      enterSelection: () => void;
      toggleFace: (face: string) => void;
      createMoldParts: (modelId: string, k1: WorkspaceBounds3) => Promise<boolean>;
      cavity: { status: string };
    };
  };
  readonly useModelBoundsStore: {
    getState: () => { groundedWorldBounds: WorkspaceBounds3 | null };
  };
  readonly useMasterMoldStore: {
    getState: () => WorkspaceMasterMoldState;
  };
}


/**
 * Master Mold Execution 04, Article 08: the real user-facing path this
 * covers that neither masterMoldGeneration.spec.ts nor
 * masterMoldRealisticWorkflowProbe.ts can -- both run against the isolated
 * e2e-harness.html page and call production functions directly, never
 * touching the real `/workspace` app shell or its buttons at all.
 *
 * Real bounding-box face selection is a WebGL-canvas raycast with no
 * stable, non-brittle Playwright-addressable DOM path (see those probes'
 * own doc comments -- this repository already made that call once).
 * Everything downstream of it is not: this test imports a real STL through
 * the real file input, drives only the face-selection step through the
 * real store (window.__e2eWorkspaceStores, e2e-build-only -- see
 * src/test-harness/e2eWorkspaceStoreHooks.ts), using the real imported
 * model's own real grounded world bounds, and then clicks the REAL "Create
 * Cavity" and "Master Mold" toolbar buttons for everything else. This is
 * the real MasterMoldAction/CavityAction React click handlers, the real
 * masterMoldGeneration.worker.ts Worker, and the real manifold-3d Boolean
 * pipeline, running in the real app shell.
 *
 * Requires the `e2e` build (`npm run build:e2e`) -- the store-exposing hook
 * this test evaluates against does not exist in a normal production build.
 */
test("drives the real Create Cavity -> Master Mold toolbar buttons against a real imported model in the real /workspace app", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/workspace");

  await expect(page.locator("#viewport-live-status")).toContainText("Viewport: Ready", { timeout: 30_000 });

  const fileInput = page.getByLabel("Local STL file", { exact: true });
  await fileInput.setInputFiles(BOX_STL);

  await expect(page.getByText(/Ready: box_30mm_ascii\.stl \(STL, .+, 12 triangles\)/)).toBeVisible({ timeout: 30_000 });

  // Drive only the canvas-raycast-dependent step (face selection) through
  // the real store, using the real imported model's own real bounds.
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { __e2eWorkspaceStores?: unknown }).__e2eWorkspaceStores !== "undefined",
  );
  const commitOk = await page.evaluate(async () => {
    const { useSplitFaceStore, useModelBoundsStore } = (
      globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }
    ).__e2eWorkspaceStores;
    const k1 = useModelBoundsStore.getState().groundedWorldBounds;
    if (k1 === null) return false;
    useSplitFaceStore.getState().enterSelection();
    useSplitFaceStore.getState().toggleFace("front");
    return useSplitFaceStore.getState().createMoldParts("e2e-workspace-model", k1);
  });
  expect(commitOk).toBe(true);

  // Everything from here is a real DOM interaction against the real toolbar.
  const createCavityButton = page.getByRole("button", { name: "Create Cavity" });
  await expect(createCavityButton).toBeEnabled();
  await createCavityButton.click();

  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores
              .useSplitFaceStore.getState().cavity.status,
        ),
      { timeout: 30_000 },
    )
    .toBe("complete");

  const masterMoldButton = page.getByRole("button", { name: "Master Mold" });
  await expect(masterMoldButton).toBeEnabled();
  await masterMoldButton.click();

  await expect(masterMoldButton).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

  const masterMoldState = await page.evaluate<WorkspaceMasterMoldState>(() =>
    (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores.useMasterMoldStore.getState(),
  );

  expect(masterMoldState.status).toBe("current");
  expect(masterMoldState.bodies.length).toBeGreaterThan(0);
  for (const body of masterMoldState.bodies) {
    expect(body.status).toBe("current");
    expect(body.watertight).toBe(true);
    expect(body.manifold).toBe(true);
    expect(body.triangleCount ?? 0).toBeGreaterThan(0);
    expect(body.volumeMm3 ?? 0).toBeGreaterThan(0);
  }

  // The real UI/viewport did not break: still exactly one canvas, no
  // uncaught errors from the real Worker/Boolean/viewport pipeline.
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  expect(consoleErrors, `Console errors: ${consoleErrors.join("; ")}`).toHaveLength(0);
});
