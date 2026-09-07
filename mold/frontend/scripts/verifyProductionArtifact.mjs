#!/usr/bin/env node
// Execution 07 Objective A: a normal production build (`npm run build`) must
// ship only the real application entry -- never the Playwright-only
// `e2e-harness.html` probe (see e2e/cavityGeometry.spec.ts /
// src/test-harness/cavityGeometryProbe.ts). This runs as part of `npm run
// build` itself so the invariant is enforced on every build, not just in CI.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const forbiddenNamePatterns = [/^e2e-harness\.html$/, /^e2e-harness[-.]/, /cavityGeometryProbe/i];

let failed = false;

function checkDir(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(entryPath);
      continue;
    }
    if (forbiddenNamePatterns.some((pattern) => pattern.test(entry.name))) {
      console.error(
        `Production artifact check failed: found test-harness-only output "${path.relative(distDir, entryPath)}" in the production build.`,
      );
      failed = true;
    }
  }
}

checkDir(distDir);

if (failed) {
  console.error(
    "A normal production build must not contain the E2E harness entry or any chunk owned only by it. " +
      "Use `npm run build:e2e` for the Playwright-facing build instead.",
  );
  process.exit(1);
}

console.log("Production artifact check passed: dist/ contains no E2E harness artifacts.");
