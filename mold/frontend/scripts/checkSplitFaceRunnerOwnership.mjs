import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(frontendRoot, "src");
const ignoredDirectories = new Set(["node_modules", "dist", ".tmp", "test-harness"]);
const consumers = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await walk(fullPath);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    if ((await readFile(fullPath, "utf8")).includes("createSplitFaceStoreCreator(")) {
      consumers.push(path.relative(frontendRoot, fullPath).split(path.sep).join("/"));
    }
  }
}

await walk(sourceRoot);
consumers.sort();
console.log("SplitFace store creator production consumers:");
for (const consumer of consumers) console.log(`- ${consumer}`);
const expected = ["src/features/mold-generation/split-face/splitFace.store.ts"];
if (JSON.stringify(consumers) !== JSON.stringify(expected)) {
  console.error(`Expected exactly: ${expected.join(", ")}`);
  process.exitCode = 1;
}
