import { describe, expect, it } from "vitest";

import {
  CAD_DARK_THEME,
  CAD_LIGHT_THEME,
  isLightColor,
  resolveCadTheme,
} from "../runtime/viewportVisualTheme";

describe("viewportVisualTheme", () => {
  it("correctly identifies light computed RGB colors from browser getComputedStyle", () => {
    expect(isLightColor("rgb(248, 249, 250)")).toBe(true);
    expect(isLightColor("rgb(245, 247, 250)")).toBe(true);
    expect(isLightColor("rgb(240, 240, 240)")).toBe(true);
    expect(isLightColor("#f8f9fa")).toBe(true);
  });

  it("correctly identifies dark computed RGB colors", () => {
    expect(isLightColor("rgb(15, 23, 42)")).toBe(false);
    expect(isLightColor("rgb(11, 17, 24)")).toBe(false);
    expect(isLightColor("#0b1118")).toBe(false);
  });

  it("resolves CAD_LIGHT_THEME for light background palette", () => {
    const theme = resolveCadTheme({
      background: "rgb(248, 249, 250)",
      gridMajor: "rgb(200, 200, 200)",
      gridMinor: "rgb(220, 220, 220)",
    });

    expect(theme).toBe(CAD_LIGHT_THEME);
    expect(theme.backgroundTop).toBe("#f5f7fa");
    expect(theme.backgroundBottom).toBe("#e2e7ec");
  });

  it("resolves CAD_DARK_THEME for dark background palette", () => {
    const theme = resolveCadTheme({
      background: "rgb(15, 23, 42)",
      gridMajor: "rgb(40, 40, 40)",
      gridMinor: "rgb(30, 30, 30)",
    });

    expect(theme).toBe(CAD_DARK_THEME);
    expect(theme.backgroundTop).toBe("#161c24");
    expect(theme.backgroundBottom).toBe("#0a0e13");
  });
});
