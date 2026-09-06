import { describe, expect, it } from "vitest";

import type { SprueGeometryContext } from "./sprueGeometryContext";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
} from "./sprueGeometryPolicy";
import { designMainSprueDiameterMm } from "./sprueMainSectionDesigner";

function createContext(
  equivalentDiameterMm: number,
): SprueGeometryContext {
  return {
    cavityVolumeMm3: 1000,
    cavityBounds: {
      xLengthMm: 10,
      yLengthMm: 10,
      zLengthMm: 10,
    },
    totalSprueLengthMm: 20,
    equivalentDiameterMm,
    aspectRatio: 1,
  };
}

describe("sprueMainSectionDesigner", () => {
  it("returns the equation result when no limit is applied", () => {
    const result = designMainSprueDiameterMm(
      createContext(100),
    );

    expect(result).toEqual({
      valueMm: 8,
      unconstrainedValueMm: 8,
      source: "equation",
    });
  });

  it("reports when the minimum main diameter is applied", () => {
    const result = designMainSprueDiameterMm(
      createContext(10),
    );

    expect(result).toEqual({
      valueMm:
        GENERIC_SPRUE_GEOMETRY_POLICY.minimumMainDiameterMm,
      unconstrainedValueMm: 0.8,
      source: "minimum-limit",
    });
  });

  it("reports when the maximum main diameter is applied", () => {
    const result = designMainSprueDiameterMm(
      createContext(1000),
    );

    expect(result).toEqual({
      valueMm:
        GENERIC_SPRUE_GEOMETRY_POLICY.maximumMainDiameterMm,
      unconstrainedValueMm: 80,
      source: "maximum-limit",
    });
  });

  it("supports an injected geometry policy", () => {
    const result = designMainSprueDiameterMm(
      createContext(100),
      {
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        mainDiameterRatio: 0.1,
        minimumMainDiameterMm: 1,
        maximumMainDiameterMm: 50,
      },
    );

    expect(result).toEqual({
      valueMm: 10,
      unconstrainedValueMm: 10,
      source: "equation",
    });
  });

  it("rejects invalid equivalent diameters", () => {
    expect(
      designMainSprueDiameterMm(createContext(0)),
    ).toBeNull();

    expect(
      designMainSprueDiameterMm(
        createContext(Number.NaN),
      ),
    ).toBeNull();

    expect(
      designMainSprueDiameterMm(
        createContext(Number.POSITIVE_INFINITY),
      ),
    ).toBeNull();
  });

  it("rejects an invalid geometry policy", () => {
    const result = designMainSprueDiameterMm(
      createContext(100),
      {
        ...GENERIC_SPRUE_GEOMETRY_POLICY,
        mainDiameterRatio: 0,
      },
    );

    expect(result).toBeNull();
  });
});
