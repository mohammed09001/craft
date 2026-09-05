import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import {
  calculateTransformedBounds,
  evaluateOrientationCandidates,
  ORIENTATION_CANDIDATES,
  prepareAutomaticModelOrientation,
  selectBestOrientationCandidate,
} from "@/features/viewport/runtime/automaticModelOrientation";

function rotateAxis(
  axis: Vector3,
  rotation: { x: number; y: number; z: number; w: number },
) {
  return axis
    .clone()
    .applyQuaternion(
      new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    );
}

function expectAxisAlignedUnitVector(vector: Vector3) {
  const rounded = [vector.x, vector.y, vector.z].map((value) =>
    Math.round(value),
  );
  const nonZeroCount = rounded.filter((value) => value !== 0).length;

  expect(nonZeroCount).toBe(1);
  expect(rounded.every((value) => Math.abs(value) <= 1)).toBe(true);
  expect(vector.distanceTo(new Vector3(...rounded))).toBeLessThan(1e-10);
}

describe("automaticModelOrientation", () => {
  it("defines a fixed deterministic candidate set", () => {
    expect(ORIENTATION_CANDIDATES.map((candidate) => candidate.id)).toEqual([
      "negative-z-down",
      "positive-z-down",
      "positive-x-down",
      "negative-x-down",
      "positive-y-down",
      "negative-y-down",
    ]);
    expect(new Set(ORIENTATION_CANDIDATES.map((candidate) => candidate.id)).size)
      .toBe(ORIENTATION_CANDIDATES.length);
  });

  it("uses finite axis-aligned 90-degree candidate rotations only", () => {
    for (const candidate of ORIENTATION_CANDIDATES) {
      expect(Number.isFinite(candidate.rotation.x)).toBe(true);
      expect(Number.isFinite(candidate.rotation.y)).toBe(true);
      expect(Number.isFinite(candidate.rotation.z)).toBe(true);
      expect(Number.isFinite(candidate.rotation.w)).toBe(true);

      expectAxisAlignedUnitVector(
        rotateAxis(new Vector3(1, 0, 0), candidate.rotation),
      );
      expectAxisAlignedUnitVector(
        rotateAxis(new Vector3(0, 1, 0), candidate.rotation),
      );
      expectAxisAlignedUnitVector(
        rotateAxis(new Vector3(0, 0, 1), candidate.rotation),
      );
    }
  });

  it("keeps a flat horizontal model in its source orientation", () => {
    const geometry = new BoxGeometry(10, 6, 1);
    const preparation = prepareAutomaticModelOrientation(geometry);

    expect(preparation?.candidateId).toBe("negative-z-down");
    expect(preparation?.grounding.groundedBounds.min.z).toBeCloseTo(0);
  });

  it("prefers a lower stable orientation for a tall model", () => {
    const geometry = new BoxGeometry(1, 1, 10);
    const preparation = prepareAutomaticModelOrientation(geometry);

    expect(preparation).not.toBeNull();
    expect(preparation?.candidateId).not.toBe("negative-z-down");
    expect(
      preparation!.grounding.groundedBounds.max.z -
        preparation!.grounding.groundedBounds.min.z,
    ).toBeCloseTo(1);
  });

  it("prefers the clear larger base over standing on a side", () => {
    const geometry = new BoxGeometry(8, 5, 2);
    const preparation = prepareAutomaticModelOrientation(geometry);

    expect(preparation?.candidateId).toBe("negative-z-down");
    expect(preparation?.score.supportArea).toBeCloseTo(40);
  });

  it("uses stable tie-breaking when candidate scores match", () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const best = selectBestOrientationCandidate(
      evaluateOrientationCandidates(geometry),
    );

    expect(best?.id).toBe("negative-z-down");
  });

  it("is deterministic across repeated evaluations", () => {
    const geometry = new BoxGeometry(2, 8, 3);

    const first = prepareAutomaticModelOrientation(geometry);
    const second = prepareAutomaticModelOrientation(geometry);

    expect(second).toEqual(first);
  });

  it("calculates transformed bounds without grounding", () => {
    const geometry = new BoxGeometry(2, 4, 8);
    const bounds = calculateTransformedBounds(geometry, {
      x: 0,
      y: Math.SQRT1_2,
      z: 0,
      w: Math.SQRT1_2,
    });

    expect(bounds).not.toBeNull();
    expect(bounds!.max.x - bounds!.min.x).toBeCloseTo(8);
    expect(bounds!.max.y - bounds!.min.y).toBeCloseTo(4);
    expect(bounds!.max.z - bounds!.min.z).toBeCloseTo(2);
  });

  it("does not mutate geometry vertices", () => {
    const geometry = new BoxGeometry(2, 4, 8);
    const position = geometry.getAttribute("position");
    const before = Array.from(position.array);

    prepareAutomaticModelOrientation(geometry);

    expect(Array.from(position.array)).toEqual(before);
  });

  it("returns finite grounding and adaptive grid data", () => {
    const geometry = new BoxGeometry(3, 11, 2);
    const preparation = prepareAutomaticModelOrientation(geometry);

    expect(preparation).not.toBeNull();
    expect(Number.isFinite(preparation!.rotation.x)).toBe(true);
    expect(Number.isFinite(preparation!.rotation.y)).toBe(true);
    expect(Number.isFinite(preparation!.rotation.z)).toBe(true);
    expect(Number.isFinite(preparation!.rotation.w)).toBe(true);
    expect(preparation!.grounding.groundedBounds.min.z).toBeCloseTo(0);
    expect(preparation!.gridConfig.size).toBeGreaterThan(0);
    expect(preparation!.gridConfig.majorStep).toBeGreaterThan(
      preparation!.gridConfig.minorStep,
    );
  });

  it("rejects invalid numeric geometry without producing a preparation", () => {
    const geometry = new BufferGeometry();

    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0, 0, Number.NaN, 1, 1]), 3),
    );

    expect(prepareAutomaticModelOrientation(geometry)).toBeNull();
  });

  it("rejects empty geometry", () => {
    expect(prepareAutomaticModelOrientation(new BufferGeometry())).toBeNull();
  });
});
