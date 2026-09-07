import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig, type Plugin } from "vitest/config";
import { LAZY_SHARED_BUDGET_KB } from "./scripts/bundleBudgets.mjs";

// Emits dist/bundle-meta.json (chunk name/size/entry-kind) from the real
// Rolldown bundle graph so scripts/checkBundleBudget.mjs can enforce the
// Execution 07 bundle budgets against structured data instead of parsing
// Vite's human-readable console output.
function bundleBudgetMeta(): Plugin {
  return {
    name: "craft-bundle-budget-meta",
    apply: "build",
    generateBundle(_options, bundle) {
      const meta = Object.values(bundle).map((item) =>
        item.type === "chunk"
          ? {
              type: "chunk" as const,
              fileName: item.fileName,
              isEntry: item.isEntry,
              isDynamicEntry: item.isDynamicEntry,
              size: Buffer.byteLength(item.code, "utf8"),
            }
          : {
              type: "asset" as const,
              fileName: item.fileName,
              size:
                typeof item.source === "string"
                  ? Buffer.byteLength(item.source, "utf8")
                  : item.source.length,
            },
      );
      this.emitFile({
        type: "asset",
        fileName: "bundle-meta.json",
        source: JSON.stringify(meta, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  cacheDir: "./.tmp/vite",
  plugins: [react(), bundleBudgetMeta()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // The generic Vite/Rolldown large-chunk warning cannot distinguish an
    // eager-path regression from a legitimate lazy/shared vendor chunk.
    // scripts/checkBundleBudget.mjs (run as part of `npm run build`) is the
    // real, structured regression gate now -- see scripts/bundleBudgets.mjs
    // for the measured baseline and why the remaining `three.module` chunk
    // is a confirmed pure-vendor, already-lazy boundary. This just raises
    // the generic threshold enough to stop re-warning about that known,
    // budgeted chunk.
    chunkSizeWarningLimit: LAZY_SHARED_BUDGET_KB,
    rolldownOptions: {
      input:
        mode === "e2e"
          ? {
              app: fileURLToPath(new URL("./index.html", import.meta.url)),
              // Test-only Playwright entry (see e2e/cavityGeometry.spec.ts /
              // src/test-harness/cavityGeometryProbe.ts) -- never linked
              // from the real app, and included only in the explicit `e2e`
              // build mode (`npm run build:e2e`) so a normal production
              // build never ships it. Built by this same production
              // toolchain so the browser proof exercises the real
              // production geometry modules.
              "e2e-harness": fileURLToPath(
                new URL("./e2e-harness.html", import.meta.url),
              ),
            }
          : {
              app: fileURLToPath(new URL("./index.html", import.meta.url)),
            },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
    // e2e/ holds Playwright browser specs (see playwright.config.ts) --
    // they call Playwright's own test(), not Vitest's, and must never be
    // collected by Vitest's default *.spec.ts discovery.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));
