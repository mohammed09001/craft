import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "./.tmp/vite",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
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
});
