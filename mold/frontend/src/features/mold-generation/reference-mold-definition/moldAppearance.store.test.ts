import { beforeEach, describe, expect, it } from "vitest";

import { useMoldAppearanceStore } from "./moldAppearance.store";

describe("mold appearance store", () => {
  beforeEach(() => {
    useMoldAppearanceStore.getState().reset();
  });

  it("starts in solid mode", () => {
    expect(useMoldAppearanceStore.getState().mode).toBe("solid");
  });

  it("toggles independently between solid and glass modes", () => {
    useMoldAppearanceStore.getState().toggleGlassMode();

    expect(useMoldAppearanceStore.getState().mode).toBe("glass");

    useMoldAppearanceStore.getState().toggleGlassMode();

    expect(useMoldAppearanceStore.getState().mode).toBe("solid");
  });

  it("supports explicitly selecting an appearance mode", () => {
    useMoldAppearanceStore.getState().setMode("glass");

    expect(useMoldAppearanceStore.getState().mode).toBe("glass");
  });

  it("resets without changing mold geometry or workflow state", () => {
    useMoldAppearanceStore.getState().setMode("glass");
    useMoldAppearanceStore.getState().reset();

    expect(useMoldAppearanceStore.getState().mode).toBe("solid");
  });
});
