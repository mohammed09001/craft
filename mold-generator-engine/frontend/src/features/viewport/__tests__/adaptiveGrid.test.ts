import {
  calculateNiceStep,
  DEFAULT_GRID_CONFIG,
  deriveAdaptiveGridConfig,
} from "@/features/viewport/runtime/adaptiveGrid";

function groundedBounds(width: number, depth: number) {
  return {
    min: { x: -width / 2, y: -depth / 2, z: 0 },
    max: { x: width / 2, y: depth / 2, z: 10 },
  };
}

it.each([
  [0.03, 0.05, 20, 1],
  [120, 80, 200, 10],
  [2400, 1200, 4000, 200],
])(
  "derives a readable adaptive grid for a %s by %s model",
  (width, depth, expectedMinimumSize, expectedMinorStep) => {
    const config = deriveAdaptiveGridConfig(groundedBounds(width, depth));

    expect(config.size).toBeGreaterThanOrEqual(expectedMinimumSize);
    expect(config.minorStep).toBe(expectedMinorStep);
    expect(config.majorStep).toBe(expectedMinorStep * 5);
    expect(config.size % (config.majorStep * 2)).toBe(0);
    expect(config.size).toBeGreaterThanOrEqual(width * 1.5);
    expect(config.size).toBeGreaterThanOrEqual(depth * 1.5);
  },
);

it("uses 1/2/5 x 10^n minor spacing", () => {
  expect(calculateNiceStep(0.7)).toBe(1);
  expect(calculateNiceStep(1.1)).toBe(2);
  expect(calculateNiceStep(2.1)).toBe(5);
  expect(calculateNiceStep(6)).toBe(10);
  expect(calculateNiceStep(60)).toBe(100);
});

it("is deterministic for equivalent bounds", () => {
  const first = deriveAdaptiveGridConfig(groundedBounds(310, 125));
  const second = deriveAdaptiveGridConfig(groundedBounds(310, 125));

  expect(first).toEqual(second);
});

it("falls back to the default grid for invalid input", () => {
  expect(deriveAdaptiveGridConfig(null)).toEqual(DEFAULT_GRID_CONFIG);
  expect(
    deriveAdaptiveGridConfig({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    }),
  ).toEqual(DEFAULT_GRID_CONFIG);
});
