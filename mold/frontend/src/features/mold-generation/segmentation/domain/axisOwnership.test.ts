import { describe, expect, it } from "vitest";

import { deriveAxisOwnership, isAxisAvailableForExtension } from "./axisOwnership";

describe("deriveAxisOwnership", () => {
  it("reports no axes used and all axes available when nothing has run", () => {
    const ownership = deriveAxisOwnership([], []);
    expect(ownership.algorithmUsedAxes).toEqual([]);
    expect(ownership.userExtensionAxes).toEqual([]);
    expect(ownership.combinedUsedAxes).toEqual([]);
    expect(ownership.availableAxes).toEqual(["x", "y", "z"]);
  });

  it("treats several algorithm planes on the same axis as one used axis", () => {
    const ownership = deriveAxisOwnership(["x", "x", "x"], []);
    expect(ownership.algorithmUsedAxes).toEqual(["x"]);
    expect(ownership.availableAxes).toEqual(["y", "z"]);
  });

  it("computes X and Z used, Y available", () => {
    const ownership = deriveAxisOwnership(["x", "z"], []);
    expect(ownership.algorithmUsedAxes).toEqual(["x", "z"]);
    expect(ownership.combinedUsedAxes).toEqual(["x", "z"]);
    expect(ownership.availableAxes).toEqual(["y"]);
    expect(isAxisAvailableForExtension(ownership, "y")).toBe(true);
    expect(isAxisAvailableForExtension(ownership, "x")).toBe(false);
    expect(isAxisAvailableForExtension(ownership, "z")).toBe(false);
  });

  it("combines algorithm axes with a user extension axis", () => {
    const ownership = deriveAxisOwnership(["x", "z"], ["y"]);
    expect(ownership.userExtensionAxes).toEqual(["y"]);
    expect(ownership.combinedUsedAxes).toEqual(["x", "y", "z"]);
    expect(ownership.availableAxes).toEqual([]);
  });

  it("dedupes a user axis that is already an algorithm axis without double-counting", () => {
    const ownership = deriveAxisOwnership(["x"], ["x"]);
    expect(ownership.combinedUsedAxes).toEqual(["x"]);
    expect(ownership.availableAxes).toEqual(["y", "z"]);
  });

  it("rejects re-adding an already-used axis (no available slot left for it)", () => {
    const ownership = deriveAxisOwnership(["x", "z"], ["y"]);
    expect(isAxisAvailableForExtension(ownership, "x")).toBe(false);
    expect(isAxisAvailableForExtension(ownership, "y")).toBe(false);
    expect(isAxisAvailableForExtension(ownership, "z")).toBe(false);
  });
});
