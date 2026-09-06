import { describe, expect, it } from "vitest";

import type { SprueScalarDesignResult } from "./sprueDesignResult";
import { designEntryNeckLengthMm } from "./sprueEntryNeckLengthDesigner";
import type { SprueGeometryContext } from "./sprueGeometryContext";
import {
  GENERIC_SPRUE_GEOMETRY_POLICY,
} from "./sprueGeometryPolicy";

function createContext(
  totalSprueLengthMm = 30,
): SprueGeometryContext {
  return {
    cavityVolumeMm3: 1000,
    cavityBounds: {
      xLengthMm: 10,
      yLengthMm: 10,
      zLengthMm: 10,
    },
    totalSprueLengthMm,
    equivalentDiameterMm: 10,
    aspectRatio: 1,
  };
}

function createDesignResult(
  valueMm: number,
): SprueScalarDesignResult {
  return {
    valueMm,
    unconstrainedValueMm: valueMm,
    source: "equation",
  };
}

describe("sprueEntryNeckLengthDesigner", () => {
  it("derives the neck length from the neck diameter", () => {
    const result = designEntryNeckLengthMm(
      createContext(),
      createDesignResult(10),
      createDesignResult(5),
    );

    expect(result).toEqual({
      valueMm: 8,
      unconstrainedValueMm: 8,
      source: "equation",
    });
  });

  it("reports when the minimum neck length is applied", () => {
    const result = designEntryNeckLengthMm(
      createContext(),
      createDesignResult(3),
      createDesignResult(1),
    );

    expect(result).not.toBeNull();
    expect(result?.valueMm).toBe(
      GENERIC_SPRUE_GEOMETRY_POLICY
        .minimumEntryNeckLengthMm,
    );
    expect(result?.unconstrainedValueMm).toBeCloseTo(
      1.6,
      10,
    );
    expect(result?.source).toBe("minimum-limit");
  });

  it("reports when the absolute maximum length is applied", () => {
    const result = designEntryNeckLengthMm(
      createContext(100),
      createDesignResult(20),
      createDesignResult(10),
    );

    expect(result).toEqual({
      valueMm:
        GENERIC_SPRUE_GEOMETRY_POLICY
          .maximumEntryNeckLengthMm,
      unconstrainedValueMm: 16,
      source: "maximum-limit",
    });
  });

  it("limits the neck length to a share of total sprue length", () => {
    const result = designEntryNeckLengthMm(
      createContext(10),
      createDesignResult(10),
      createDesignResult(5),
    );

    expect(result).toEqual({
      valueMm: 4,
      unconstrainedValueMm: 8,
      source: "maximum-limit",
    });
  });

  it("never makes the protected neck longer than the sprue", () => {
    const result = designEntryNeckLengthMm(
      createContext(3),
      createDesignResult(4),
      createDesignResult(2.5),
    );

    expect(result).not.toBeNull();
    expect(result?.valueMm).toBeCloseTo(1.2, 10);
    expect(result?.valueMm).toBeLessThan(3);
    expect(result?.source).toBe("maximum-limit");
  });

  it("rejects a neck diameter wider than the main section", () => {
    expect(
      designEntryNeckLengthMm(
        createContext(),
        createDesignResult(5),
        createDesignResult(6),
      ),
    ).toBeNull();
  });

  it("rejects invalid inputs and invalid policies", () => {
    expect(
      designEntryNeckLengthMm(
        createContext(0),
        createDesignResult(5),
        createDesignResult(3),
      ),
    ).toBeNull();

    expect(
      designEntryNeckLengthMm(
        createContext(),
        createDesignResult(Number.NaN),
        createDesignResult(3),
      ),
    ).toBeNull();

    expect(
      designEntryNeckLengthMm(
        createContext(),
        createDesignResult(5),
        createDesignResult(3),
        {
          ...GENERIC_SPRUE_GEOMETRY_POLICY,
          entryNeckLengthToDiameterRatio: 0,
        },
      ),
    ).toBeNull();
  });
});
