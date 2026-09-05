import { describe, expect, it } from "vitest";

import { designEntryNeckDiameterMm } from "./sprueEntryNeckDesigner";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
} from "./sprueGeometryPolicy";

describe("sprueEntryNeckDesigner", () => {
  it("returns the equation result when no limit is applied", () => {
    expect(
      designEntryNeckDiameterMm(10),
    ).toEqual({
      valueMm: 7,
      unconstrainedValueMm: 7,
      source: "equation",
    });
  });

  it("reports when the minimum neck diameter is applied", () => {
    const result = designEntryNeckDiameterMm(3);

    expect(result).not.toBeNull();
    expect(result?.valueMm).toBe(
      GENERIC_SPRUE_GEOMETRY_POLICY
        .minimumEntryNeckDiameterMm,
    );
    expect(result?.unconstrainedValueMm).toBeCloseTo(
      2.1,
      10,
    );
    expect(result?.source).toBe("minimum-limit");
  });

  it("reports when the maximum neck diameter is applied", () => {
    expect(
      designEntryNeckDiameterMm(20, {
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        entryNeckDiameterRatio: 1,
        maximumEntryNeckDiameterMm: 8,
      }),
    ).toEqual({
      valueMm: 8,
      unconstrainedValueMm: 20,
      source: "maximum-limit",
    });
  });

  it("never makes the entry neck wider than the main section", () => {
    expect(
      designEntryNeckDiameterMm(2, {
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        minimumMainDiameterMm: 1,
        minimumEntryNeckDiameterMm: 2.5,
      }),
    ).toEqual({
      valueMm: 2,
      unconstrainedValueMm: 1.4,
      source: "minimum-limit",
    });
  });

  it("supports an injected geometry policy", () => {
    expect(
      designEntryNeckDiameterMm(10, {
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        entryNeckDiameterRatio: 0.5,
        minimumEntryNeckDiameterMm: 1,
        maximumEntryNeckDiameterMm: 20,
      }),
    ).toEqual({
      valueMm: 5,
      unconstrainedValueMm: 5,
      source: "equation",
    });
  });

  it("rejects invalid main diameters", () => {
    expect(
      designEntryNeckDiameterMm(0),
    ).toBeNull();

    expect(
      designEntryNeckDiameterMm(-5),
    ).toBeNull();

    expect(
      designEntryNeckDiameterMm(Number.NaN),
    ).toBeNull();

    expect(
      designEntryNeckDiameterMm(
        Number.POSITIVE_INFINITY,
      ),
    ).toBeNull();
  });

  it("rejects an invalid geometry policy", () => {
    expect(
      designEntryNeckDiameterMm(10, {
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        entryNeckDiameterRatio: 0,
      }),
    ).toBeNull();
  });
});

