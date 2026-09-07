#!/usr/bin/env node
// Execution 07 Objective A: the explicit E2E build (`npm run build:e2e`) must
// deterministically include the Playwright-only harness entry, so the
// Playwright webServer (`npm run preview`) never silently serves a stale
// `dist/` left over from a prior plain `npm run build`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const harnessFile = path.join(distDir, "e2e-harness.html");

if (!existsSync(harnessFile)) {
  console.error(
    `E2E artifact check failed: "${path.relative(distDir, harnessFile)}" is missing. ` +
      "`npm run build:e2e` must build with --mode e2e so the harness entry is included.",
  );
  process.exit(1);
}

console.log("E2E artifact check passed: dist/e2e-harness.html is present.");
