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
interface WorkspaceMasterMoldPiece {
  readonly watertight: boolean;
  readonly manifold: boolean;
  readonly triangleCount: number;
  readonly volumeMm3: number;
}

interface WorkspaceMasterMoldSet {
  readonly status: string;
  readonly failureMessage: string | null;
  readonly set: {
    readonly releaseMode: string;
    readonly warnings: readonly string[];
    readonly assembly: {
      readonly pieces: readonly WorkspaceMasterMoldPiece[];
      readonly releaseSequence: readonly { readonly collisionVerified: boolean }[];
    };
  } | null;
}

interface WorkspaceMasterMoldState {
  readonly status: string;
  readonly sets: readonly WorkspaceMasterMoldSet[];
  readonly plan: { readonly moldPieces: readonly unknown[]; readonly releaseSequence: readonly { readonly collisionVerified: boolean }[] } | null;
  readonly pieceVisibility: Readonly<Record<string, boolean>>;
}

interface E2eWorkspaceStores {
  readonly useSplitFaceStore: {
    getState: () => {
      cuttingPlanes: readonly unknown[];
      definition: unknown;
      cavity: { status: string };
    };
  };
  readonly useMasterMoldStore: {
    getState: () => WorkspaceMasterMoldState;
  };
}

interface MasterViewportObservation {
  readonly groupPresent: boolean;
  readonly meshCount: number;
}

/**
 * Master Mold Execution 06, Article 19: the real user journey is
 * Master-ONLY. The test imports a real STL through the real file input and
 * then clicks the REAL "Master Mold" toolbar button -- never Constructed
 * Cutting Plan, never Cut by Face, never Segmentation, never Create Cavity.
 * The autonomous engine plans the working mold, cases every piece, and the
 * result is proven in the real app shell: watertight/manifold printable
 * tooling with collision-verified release sequences, a live viewport, a
 * responsive main thread during Worker planning (heartbeat), and working
 * hide/show visibility controls on the real generated pieces.
 *
 * Requires the `e2e` build (`npm run build:e2e`) -- the store-exposing hook
 * this test evaluates against does not exist in a normal production build.
 */
test("drives the real Master-ONLY journey: import STL -> Master Mold -> verified tooling -> visibility controls", async ({ page }) => {
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

  // Article 19 precondition assertions: the Master journey starts from a
  // clean state -- no cutting planes, no committed mold definition, no
  // Create Cavity run. A small e2e-only hook observes state; it never
  // creates mold geometry.
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { __e2eWorkspaceStores?: unknown }).__e2eWorkspaceStores !== "undefined",
  );
  const preconditions = await page.evaluate(() => {
    const { useSplitFaceStore } = (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores;
    const state = useSplitFaceStore.getState();
    return { cuttingPlanes: state.cuttingPlanes.length, hasDefinition: state.definition !== null, cavityStatus: state.cavity.status };
  });
  expect(preconditions.cuttingPlanes).toBe(0);
  expect(preconditions.hasDefinition).toBe(false);
  expect(preconditions.cavityStatus).not.toBe("complete");

  // Main-thread heartbeat: Worker planning must leave the UI responsive.
  await page.evaluate(() => {
    const globalWindow = globalThis as unknown as { __masterHeartbeats: number; __heartbeatTimer: number } & typeof globalThis;
    globalWindow.__masterHeartbeats = 0;
    globalWindow.__heartbeatTimer = (globalWindow.setInterval(() => {
      globalWindow.__masterHeartbeats += 1;
    }, 50) as unknown) as number;
  });

  // The real toolbar button, driven with zero Split Face interactions.
  const masterMoldButton = page.getByRole("button", { name: "Master Mold", exact: true });
  await expect(masterMoldButton).toBeEnabled();
  await masterMoldButton.click();

  // The engine runs the autonomous multi-stage pipeline in the Worker:
  // poll until it settles (not generating) before asserting the outcome.
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores
              .useMasterMoldStore.getState().status,
        ),
      { timeout: 180_000 },
    )
    .not.toBe("generating");

  const masterMoldState = await page.evaluate<WorkspaceMasterMoldState>(() =>
    (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores.useMasterMoldStore.getState(),
  );

  // Article 19: the Master journey succeeded independently. Every tooling
  // set is either a verified current result (watertight, manifold pieces
  // with collision-checked releases) or a structured blocked-with-reason
  // outcome -- never fake geometry.
  expect(masterMoldState.sets.length).toBeGreaterThan(0);
  for (const entry of masterMoldState.sets) {
    if (entry.status === "current") {
      expect(entry.set).not.toBeNull();
      expect(entry.set!.assembly.pieces.length).toBeGreaterThan(0);
      for (const piece of entry.set!.assembly.pieces) {
        expect(piece.watertight).toBe(true);
        expect(piece.manifold).toBe(true);
        expect(piece.volumeMm3).toBeGreaterThan(0);
      }
      expect(entry.set!.assembly.releaseSequence.length).toBe(entry.set!.assembly.pieces.length);
      expect(entry.set!.assembly.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    } else {
      expect(entry.status).toBe("blocked");
      expect(entry.failureMessage).toMatch(/reusable_plan_not_found|working-mold plan survived exact verification/);
    }
  }
  expect(masterMoldState.status).toBe("current");

  const viewportObservation = await page.evaluate<MasterViewportObservation | null>(() =>
    (globalThis as unknown as { __e2eMasterMoldViewport?: MasterViewportObservation }).__e2eMasterMoldViewport ?? null,
  );
  expect(viewportObservation).not.toBeNull();
  expect(viewportObservation!.groupPresent).toBe(true);
  expect(viewportObservation!.meshCount).toBeGreaterThan(0);

  // The autonomous plan exists with 2..N working mold pieces and a verified
  // release sequence.
  expect(masterMoldState.plan).not.toBeNull();
  const workingMoldPieceCount = masterMoldState.plan!.moldPieces.length;
  expect(workingMoldPieceCount).toBeGreaterThanOrEqual(2);
  expect(masterMoldState.plan!.releaseSequence.length).toBe(workingMoldPieceCount);
  expect(masterMoldState.plan!.releaseSequence.every((step) => step.collisionVerified)).toBe(true);

  // The main thread stayed alive during Worker planning.
  const heartbeats = await page.evaluate(() => {
    const globalWindow = globalThis as unknown as { __masterHeartbeats: number; __heartbeatTimer: number } & typeof globalThis;
    globalWindow.clearInterval(globalWindow.__heartbeatTimer);
    return globalWindow.__masterHeartbeats;
  });
  expect(heartbeats).toBeGreaterThan(2);

  // The real viewport renders the Master tooling (the canvas is alive and
  // the Master body group holds the generated pieces).
  await expect(page.locator("canvas")).toHaveCount(1);

  // Hide one tooling piece through the REAL browser UI, verify it
  // disappears, show it again, verify it returns.
  const piecesBrowserButton = page.getByRole("button", { name: "Master Mold pieces", exact: true });
  await expect(piecesBrowserButton).toBeEnabled();
  await piecesBrowserButton.click();

  const firstPieceCheckbox = page.getByLabel(/Show .* Master Case/).first();
  await expect(firstPieceCheckbox).toBeChecked();
  await firstPieceCheckbox.uncheck();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores.useMasterMoldStore.getState();
        return Object.values(state.pieceVisibility).some((visible) => visible === false);
      }),
    )
    .toBe(true);

  await firstPieceCheckbox.check();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = (globalThis as unknown as { __e2eWorkspaceStores: E2eWorkspaceStores }).__e2eWorkspaceStores.useMasterMoldStore.getState();
        return Object.values(state.pieceVisibility).some((visible) => visible === false);
      }),
    )
    .toBe(false);

  // The real UI/viewport did not break: still exactly one canvas, no
  // uncaught errors from the real Worker/Boolean/viewport pipeline.
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors, `Uncaught page errors: ${pageErrors.map((error) => error.message).join("; ")}`).toHaveLength(0);
  expect(consoleErrors, `Console errors: ${consoleErrors.join("; ")}`).toHaveLength(0);
});
