import {
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from "three";
import { describe, expect, it } from "vitest";

import { createMoldAppearanceMaterial, MOLD_RED } from "../runtime/moldAppearance.material";

describe("mold appearance material", () => {
  it("creates a clear solid red CAD material matching model surface quality", () => {
    const material = createMoldAppearanceMaterial("solid");

    expect(material).toBeInstanceOf(MeshStandardMaterial);

    const solid = material as MeshStandardMaterial;

    expect(solid.color.getHex()).toBe(MOLD_RED);
    expect(solid.metalness).toBe(0.06);
    expect(solid.roughness).toBe(0.38);
    expect(solid.opacity).toBe(1);
    expect(solid.transparent).toBe(false);
    expect(solid.depthWrite).toBe(true);
    expect(solid.side).toBe(DoubleSide);

    solid.dispose();
  });

  it("creates an independent red glass material", () => {
    const material = createMoldAppearanceMaterial("glass");

    expect(material).toBeInstanceOf(MeshPhysicalMaterial);

    const glass = material as MeshPhysicalMaterial;

    expect(glass.color.getHex()).toBe(MOLD_RED);
    expect(glass.transmission).toBe(0.68);
    expect(glass.roughness).toBe(0.18);
    expect(glass.opacity).toBe(0.3);
    expect(glass.transparent).toBe(true);
    expect(glass.depthWrite).toBe(false);
    expect(glass.side).toBe(DoubleSide);

    glass.dispose();
  });

  it("returns separate disposable material instances", () => {
    const first = createMoldAppearanceMaterial("solid");
    const second = createMoldAppearanceMaterial("solid");

    expect(first).not.toBe(second);

    first.dispose();
    second.dispose();
  });

  it("does not alter the imported-model material role across repeated calls", () => {
    const before = createMoldAppearanceMaterial(
      "solid",
      "imported-part",
    ) as MeshStandardMaterial;
    const after = createMoldAppearanceMaterial(
      "solid",
      "imported-part",
    ) as MeshStandardMaterial;

    expect(after.color.getHex()).toBe(before.color.getHex());
    expect(after.opacity).toBe(before.opacity);
    expect(after.transparent).toBe(before.transparent);

    before.dispose();
    after.dispose();
  });
});
