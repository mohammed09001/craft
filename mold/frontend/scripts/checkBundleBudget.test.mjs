import { describe, expect, it } from "vitest";
import { evaluateBundleBudget } from "./checkBundleBudget.mjs";

const budgets = { eagerAppBudgetBytes: 410_000, lazySharedBudgetBytes: 575_000 };

function chunk(overrides) {
  return {
    type: "chunk",
    fileName: "app-TEST.js",
    isEntry: true,
    isDynamicEntry: false,
    size: 0,
    ...overrides,
  };
}

describe("evaluateBundleBudget", () => {
  it("passes when the eager app entry and largest lazy chunk are within budget", () => {
    const meta = [
      chunk({ fileName: "app-abc123.js", size: 384_487 }),
      chunk({ fileName: "three.module-xyz.js", isEntry: false, size: 546_707 }),
    ];

    const result = evaluateBundleBudget(meta, budgets);

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.measurements.eagerAppBytes).toBe(384_487);
    expect(result.measurements.largestOtherChunk?.fileName).toBe("three.module-xyz.js");
  });

  it("fails when the eager app entry exceeds its budget", () => {
    const meta = [
      chunk({ fileName: "app-abc123.js", size: 500_000 }),
      chunk({ fileName: "three.module-xyz.js", isEntry: false, size: 546_707 }),
    ];

    const result = evaluateBundleBudget(meta, budgets);

    expect(result.ok).toBe(false);
    expect(result.violations.some((violation) => violation.includes("eager app entry"))).toBe(true);
  });

  it("fails when the largest lazy/shared chunk exceeds its budget", () => {
    const meta = [
      chunk({ fileName: "app-abc123.js", size: 384_487 }),
      chunk({ fileName: "three.module-xyz.js", isEntry: false, size: 900_000 }),
    ];

    const result = evaluateBundleBudget(meta, budgets);

    expect(result.ok).toBe(false);
    expect(
      result.violations.some((violation) => violation.includes("lazy/shared chunk")),
    ).toBe(true);
  });

  it("fails when no eager app entry chunk can be identified", () => {
    const meta = [chunk({ fileName: "three.module-xyz.js", isEntry: false, size: 100 })];

    const result = evaluateBundleBudget(meta, budgets);

    expect(result.ok).toBe(false);
    expect(result.violations.some((violation) => violation.includes("could not identify"))).toBe(
      true,
    );
  });

  it("ignores non-chunk (asset) entries such as the wasm binary", () => {
    const meta = [
      chunk({ fileName: "app-abc123.js", size: 384_487 }),
      { type: "asset", fileName: "manifold-abc.wasm", size: 541_470 },
    ];

    const result = evaluateBundleBudget(meta, budgets);

    expect(result.ok).toBe(true);
    expect(result.measurements.largestOtherChunk).toBeNull();
  });
});
