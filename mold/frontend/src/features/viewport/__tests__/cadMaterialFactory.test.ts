import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import { createCadMaterial } from "../runtime/cadMaterialFactory";
import { CAD_DARK_THEME } from "../runtime/viewportVisualTheme";

describe("CAD Material Factory", () => {
  it("creates distinct CAD materials for different surface roles", () => {
    const outer = createCadMaterial("outer-mold", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const cavity = createCadMaterial("cavity-surface", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const sprue = createCadMaterial("sprue-funnel", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const key = createCadMaterial("registration-key", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const stl = createCadMaterial("imported-part", "solid", CAD_DARK_THEME) as MeshStandardMaterial;

    expect(outer).toBeInstanceOf(MeshStandardMaterial);
    expect(cavity).toBeInstanceOf(MeshStandardMaterial);
    expect(sprue).toBeInstanceOf(MeshStandardMaterial);
    expect(key).toBeInstanceOf(MeshStandardMaterial);
    expect(stl).toBeInstanceOf(MeshStandardMaterial);

    // Verify distinct color/roughness hierarchy
    expect(cavity.color.getHex()).toBe(CAD_DARK_THEME.cavitySurfaceColor);
    expect(cavity.roughness).toBe(CAD_DARK_THEME.cavityRoughness);

    expect(outer.color.getHex()).toBe(CAD_DARK_THEME.outerMoldColor);
    expect(outer.roughness).toBe(CAD_DARK_THEME.outerRoughness);

    expect(sprue.color.getHex()).toBe(CAD_DARK_THEME.sprueFunnelColor);
    expect(key.color.getHex()).toBe(CAD_DARK_THEME.registrationKeyColor);
    expect(stl.color.getHex()).toBe(CAD_DARK_THEME.importedPartColor);

    // Verify Engineering Yellow satin material properties
    expect(key.color.getHex()).toBe(0xd4a338);
    expect(sprue.color.getHex()).toBe(0xdfad3c);
    expect(key.roughness).toBe(0.35);
    expect(key.metalness).toBe(0.06);
    expect(sprue.roughness).toBe(0.32);
    expect(sprue.metalness).toBe(0.08);

    outer.dispose();
    cavity.dispose();
    sprue.dispose();
    key.dispose();
    stl.dispose();
  });

  it("creates transparent physical glass material in glass mode", () => {
    const glass = createCadMaterial("outer-mold", "glass", CAD_DARK_THEME) as MeshPhysicalMaterial;

    expect(glass).toBeInstanceOf(MeshPhysicalMaterial);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBe(0.3);
    expect(glass.transmission).toBe(0.68);
    expect(glass.side).toBe(DoubleSide);

    glass.dispose();
  });
});
