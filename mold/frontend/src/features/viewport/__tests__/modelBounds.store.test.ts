import { deriveGroundedWorldBounds, useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function geometryWith(
  localBounds: CanonicalPartGeometry["localBounds"],
  transform: readonly number[],
): CanonicalPartGeometry {
  return {
    modelId: "model",
    geometryVersion: "v1",
    units: "millimeters",
    upAxis: "Z",
    positions: [],
    indices: [],
    transform,
    localBounds,
    winding: "source",
    validationStatus: "captured",
    sourceSignature: "sig",
  };
}

describe("deriveGroundedWorldBounds", () => {
  it("returns null when there is no geometry", () => {
    expect(deriveGroundedWorldBounds(null)).toBeNull();
  });

  it("reproduces local bounds under an identity transform", () => {
    const geometry = geometryWith(
      { min: { x: -10, y: -5, z: 0 }, max: { x: 10, y: 5, z: 20 } },
      IDENTITY,
    );

    expect(deriveGroundedWorldBounds(geometry)).toEqual({
      min: { x: -10, y: -5, z: 0 },
      max: { x: 10, y: 5, z: 20 },
      size: { x: 20, y: 10, z: 20 },
    });
  });

  it("applies a baked translation (grounding) to produce world-space bounds", () => {
    // Column-major mat4 translating by (100, 200, 0) — matches Three.js Matrix4.elements layout.
    const translated = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 200, 0, 1];
    const geometry = geometryWith(
      { min: { x: -10, y: -10, z: 0 }, max: { x: 10, y: 10, z: 30 } },
      translated,
    );

    expect(deriveGroundedWorldBounds(geometry)).toEqual({
      min: { x: 90, y: 190, z: 0 },
      max: { x: 110, y: 210, z: 30 },
      size: { x: 20, y: 20, z: 30 },
    });
  });

  it("applies a rotated transform using Three.js's column-major Matrix4 element order", () => {
    // 90-degree rotation about Z: x'=-y, y'=x, z'=z (Three.js Matrix4.elements layout:
    // e[0..3]=col0, e[4..7]=col1, e[8..11]=col2, e[12..15]=col3/translation).
    const rotateZ90 = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const geometry = geometryWith(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 20, z: 5 } },
      rotateZ90,
    );

    expect(deriveGroundedWorldBounds(geometry)).toEqual({
      min: { x: -20, y: 0, z: 0 },
      max: { x: 0, y: 10, z: 5 },
      size: { x: 20, y: 10, z: 5 },
    });
  });

  it("is null for a malformed transform", () => {
    const geometry = geometryWith({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, [1, 0, 0]);
    expect(deriveGroundedWorldBounds(geometry)).toBeNull();
  });
});

describe("useModelBoundsStore", () => {
  it("derives and stores grounded world bounds from a captured geometry snapshot", () => {
    const geometry = geometryWith(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 5 } },
      IDENTITY,
    );

    useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(geometry);

    expect(useModelBoundsStore.getState().groundedWorldBounds).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 5, y: 5, z: 5 },
      size: { x: 5, y: 5, z: 5 },
    });

    useModelBoundsStore.getState().setGroundedWorldBoundsFromGeometry(null);
    expect(useModelBoundsStore.getState().groundedWorldBounds).toBeNull();
  });
});
