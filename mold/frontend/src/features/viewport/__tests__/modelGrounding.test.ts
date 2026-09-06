import {
  calculateModelGroundingTransform,
  type NumericBounds3,
} from "@/features/viewport/runtime/modelGrounding";

function bounds(min: [number, number, number], max: [number, number, number]) {
  return {
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] },
  } satisfies NumericBounds3;
}

it("grounds a model whose lowest point starts above the ground plane", () => {
  const result = calculateModelGroundingTransform(
    bounds([10, 20, 8], [30, 60, 18]),
  );

  expect(result?.translation).toEqual({ x: -20, y: -40, z: -8 });
  expect(result?.groundedBounds.min.z).toBeCloseTo(0);
  expect(result?.groundedBounds.max.z).toBeCloseTo(10);
});

it("grounds a model whose lowest point starts below the ground plane", () => {
  const result = calculateModelGroundingTransform(
    bounds([-10, -20, -12], [30, 20, 8]),
  );

  expect(result?.translation.z).toBe(12);
  expect(result?.groundedBounds.min.z).toBeCloseTo(0);
});

it("centers an off-axis model on the XY ground plane without rotation or scale", () => {
  const result = calculateModelGroundingTransform(
    bounds([25, -5, 2], [45, 15, 22]),
  );

  expect(result?.groundedBounds.min.x).toBeCloseTo(-10);
  expect(result?.groundedBounds.max.x).toBeCloseTo(10);
  expect(result?.groundedBounds.min.y).toBeCloseTo(-10);
  expect(result?.groundedBounds.max.y).toBeCloseTo(10);
  expect(result?.groundedBounds.max.z).toBeCloseTo(20);
});

it("does not mutate the input bounds object", () => {
  const input = bounds([1, 2, 3], [4, 5, 6]);
  const copy = structuredClone(input);

  calculateModelGroundingTransform(input);

  expect(input).toEqual(copy);
});

it("rejects invalid bounds", () => {
  expect(
    calculateModelGroundingTransform(bounds([2, 0, 0], [1, 1, 1])),
  ).toBeNull();
});
