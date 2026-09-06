import { defineConfig, devices } from "@playwright/test";

/**
 * Minimum critical-path browser smoke harness (see docs/agent/PROJECT_MAP.md
 * / Execution 04 Objective I). Deliberately one deterministic spec, not a
 * large E2E suite: proves the app boots, the viewport initializes with
 * exactly one canvas, a deterministic STL fixture imports through the real
 * (non-mocked) runtime, and no page/console error occurs -- the minimum
 * needed to catch a real-browser regression that Vitest's jsdom suite
 * cannot, such as the manifold-3d/Vite WASM entry actually breaking at
 * runtime.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    // Vite's default preview host resolves "localhost" to the IPv6 loopback
    // (::1) only on this toolchain/Node combination -- it does not also bind
    // 127.0.0.1. baseURL/url above are IPv4 explicitly, so an unbound host
    // here leaves Playwright polling an address the server never listens on
    // until the startup timeout expires. Bind the same IPv4 loopback address
    // Playwright polls so readiness can actually be observed.
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
