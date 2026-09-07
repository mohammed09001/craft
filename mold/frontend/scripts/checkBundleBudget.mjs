#!/usr/bin/env node
// Craft Execution 07 Objective D: measure the real build output (via the
// `craft-bundle-meta` Vite plugin's dist/bundle-meta.json, not parsed human
// console text) and fail if the eager app entry or the largest lazy/shared
// JS chunk exceeds its budget. See scripts/bundleBudgets.mjs for the policy
// this enforces and why.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EAGER_APP_BUDGET_BYTES,
  EAGER_APP_BUDGET_KB,
  LAZY_SHARED_BUDGET_BYTES,
  LAZY_SHARED_BUDGET_KB,
} from "./bundleBudgets.mjs";

const APP_ENTRY_PATTERN = /(^|\/)app-[^/]+\.js$/;

export function evaluateBundleBudget(
  meta,
  budgets = {
    eagerAppBudgetBytes: EAGER_APP_BUDGET_BYTES,
    lazySharedBudgetBytes: LAZY_SHARED_BUDGET_BYTES,
  },
) {
  const jsChunks = meta.filter((entry) => entry.type === "chunk");
  const appEntryChunks = jsChunks.filter(
    (entry) => entry.isEntry && APP_ENTRY_PATTERN.test(entry.fileName),
  );

  const violations = [];

  if (appEntryChunks.length === 0) {
    violations.push(
      "could not identify the eager `app` entry chunk (expected a chunk matching app-*.js with isEntry=true).",
    );
  }

  const eagerAppBytes = appEntryChunks.reduce((sum, entry) => sum + entry.size, 0);
  if (appEntryChunks.length > 0 && eagerAppBytes > budgets.eagerAppBudgetBytes) {
    violations.push(
      `eager app entry is ${(eagerAppBytes / 1000).toFixed(2)} kB, exceeding the ${(
        budgets.eagerAppBudgetBytes / 1000
      ).toFixed(0)} kB budget.`,
    );
  }

  const otherChunks = jsChunks.filter((entry) => !appEntryChunks.includes(entry));
  let largestOther = null;
  for (const entry of otherChunks) {
    if (!largestOther || entry.size > largestOther.size) {
      largestOther = entry;
    }
  }
  if (largestOther && largestOther.size > budgets.lazySharedBudgetBytes) {
    violations.push(
      `largest lazy/shared chunk "${largestOther.fileName}" is ${(largestOther.size / 1000).toFixed(
        2,
      )} kB, exceeding the ${(budgets.lazySharedBudgetBytes / 1000).toFixed(0)} kB budget.`,
    );
  }

  return {
    ok: violations.length === 0,
    violations,
    measurements: {
      eagerAppBytes,
      eagerAppChunkNames: appEntryChunks.map((entry) => entry.fileName),
      largestOtherChunk: largestOther
        ? { fileName: largestOther.fileName, size: largestOther.size }
        : null,
    },
  };
}

function main() {
  const distDir = fileURLToPath(new URL("../dist", import.meta.url));
  const metaPath = path.join(distDir, "bundle-meta.json");

  if (!existsSync(metaPath)) {
    console.error(
      `Bundle budget check failed: ${metaPath} not found. Run \`npm run build\` (or \`npm run build:e2e\`) first.`,
    );
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const result = evaluateBundleBudget(meta);

  console.log(
    `Eager app entry: ${(result.measurements.eagerAppBytes / 1000).toFixed(2)} kB ` +
      `(budget ${EAGER_APP_BUDGET_KB} kB) [${
        result.measurements.eagerAppChunkNames.join(", ") || "none found"
      }]`,
  );
  if (result.measurements.largestOtherChunk) {
    console.log(
      `Largest lazy/shared JS chunk: ${result.measurements.largestOtherChunk.fileName} = ${(
        result.measurements.largestOtherChunk.size / 1000
      ).toFixed(2)} kB (budget ${LAZY_SHARED_BUDGET_KB} kB)`,
    );
  }

  if (!result.ok) {
    for (const violation of result.violations) {
      console.error(`Bundle budget violation: ${violation}`);
    }
    process.exit(1);
  }

  console.log("Bundle budget check passed.");
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
