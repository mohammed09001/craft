import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM,
  DEFAULT_SPRUE_ENTRY_NECK_LENGTH_MM,
  DEFAULT_SPRUE_PROFILE,
  MAX_SPRUE_DIAMETER_MM,
  MIN_SPRUE_DIAMETER_MM,
  calculateEquivalentDiameterMm,
  isValidSprueProfile,
  normalizeSprueDiameterMm,
  normalizeSprueEntryNeckDiameterMm,
  type SprueProfileCalculationResult,
} from "./sprueProfile";

describe("sprueProfile", () => {
  it("normalizes diameter limits and preserves the coupled entry-neck constraint", () => {
    expect(normalizeSprueDiameterMm(-10)).toBe(MIN_SPRUE_DIAMETER_MM);
    expect(normalizeSprueDiameterMm(100)).toBe(MAX_SPRUE_DIAMETER_MM);
    expect(normalizeSprueDiameterMm(2, 2.5)).toBe(2.5);
    expect(normalizeSprueDiameterMm(12.5)).toBe(12.5);
    expect(normalizeSprueDiameterMm(Number.NaN)).toBeNull();
  });

  it("normalizes the entry neck (lower opening) diameter and never exceeds the main diameter", () => {
    expect(normalizeSprueEntryNeckDiameterMm(-10, 10)).toBe(MIN_SPRUE_DIAMETER_MM);
    expect(normalizeSprueEntryNeckDiameterMm(100, 10)).toBe(10);
    expect(normalizeSprueEntryNeckDiameterMm(3, 10)).toBe(3);
    expect(normalizeSprueEntryNeckDiameterMm(Number.NaN, 10)).toBeNull();
  });
  it("defines the protected 4 mm entry zone with the existing 2.5 mm diameter", () => {
    expect(DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM).toBe(2.5);
    expect(DEFAULT_SPRUE_ENTRY_NECK_LENGTH_MM).toBe(4);
    expect(DEFAULT_SPRUE_PROFILE).toEqual({
      mainDiameterMm: 2.5,
      entryNeckDiameterMm: 2.5,
      entryNeckLengthMm: 4,
    });
  });

  it("describes whether dimensions were calculated or supplied by fallback", () => {
    const result: SprueProfileCalculationResult = {
      dimensions: DEFAULT_SPRUE_PROFILE,
      source: "fallback",
      warnings: ["Cavity volume is unavailable."],
    };

    expect(result).toEqual({
      dimensions: {
        mainDiameterMm: 2.5,
        entryNeckDiameterMm: 2.5,
        entryNeckLengthMm: 4,
      },
      source: "fallback",
      warnings: ["Cavity volume is unavailable."],
    });
  });
  it("calculates the diameter of a sphere with the same cavity volume", () => {
    const sphereDiameterMm = 10;
    const sphereVolumeMm3 =
      (Math.PI / 6) * sphereDiameterMm ** 3;

    expect(
      calculateEquivalentDiameterMm(sphereVolumeMm3),
    ).toBeCloseTo(10, 10);
  });

  it("rejects invalid cavity volumes", () => {
    expect(calculateEquivalentDiameterMm(0)).toBeNull();
    expect(calculateEquivalentDiameterMm(-100)).toBeNull();
    expect(calculateEquivalentDiameterMm(Number.NaN)).toBeNull();
    expect(
      calculateEquivalentDiameterMm(Number.POSITIVE_INFINITY),
    ).toBeNull();
  });
  it("accepts an enlarged main section while preserving the smaller entry neck", () => {
    expect(
      isValidSprueProfile({
        mainDiameterMm: 8,
        entryNeckDiameterMm: 2.5,
        entryNeckLengthMm: 4,
      }),
    ).toBe(true);
  });

  it("rejects a main diameter smaller than the entry neck", () => {
    expect(
      isValidSprueProfile({
        mainDiameterMm: 2,
        entryNeckDiameterMm: 2.5,
        entryNeckLengthMm: 4,
      }),
    ).toBe(false);
  });

  it("rejects non-finite and non-positive dimensions", () => {
    expect(
      isValidSprueProfile({
        mainDiameterMm: Number.NaN,
        entryNeckDiameterMm: 2.5,
        entryNeckLengthMm: 4,
      }),
    ).toBe(false);


    expect(
      isValidSprueProfile({
        mainDiameterMm: 4,
        entryNeckDiameterMm: 0,
        entryNeckLengthMm: 4,
      }),
    ).toBe(false);

    expect(
      isValidSprueProfile({
        mainDiameterMm: 4,
        entryNeckDiameterMm: 2.5,
        entryNeckLengthMm: 0,
      }),
    ).toBe(false);
  });
});


