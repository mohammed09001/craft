import { describe,expect,it } from "vitest";

import {
  calculateCavityComplexityScore,
  selectCavityOffsetEngine,
} from "./cavityEngine.selector";

describe("cavity engine selector",()=>{
  it("uses exact geometry for zero clearance regardless of model complexity",()=>{
    const decision=selectCavityOffsetEngine({
      triangleCount:500_000,
      connectedComponentCount:4,
      requestedClearanceMm:0,
      qualityMode:"high",
    });

    expect(decision.engine)
      .toBe("exact-zero-clearance");

    expect(decision.complexityScore).toBe(0);

    expect(decision.reasonCodes).toEqual([
      "zero_clearance_exact_geometry",
    ]);
  });

  it("uses direct Minkowski for a simple positive-clearance model",()=>{
    const decision=selectCavityOffsetEngine({
      triangleCount:10_000,
      connectedComponentCount:1,
      requestedClearanceMm:0.2,
      qualityMode:"standard",
    });

    expect(decision.engine)
      .toBe("direct-minkowski");

    expect(decision.reasonCodes)
      .toContain("triangle_count_direct");

    expect(decision.reasonCodes)
      .toContain("complexity_score_direct");
  });

  it("uses distance field for a heavy STL model",()=>{
    const decision=selectCavityOffsetEngine({
      triangleCount:242_884,
      connectedComponentCount:1,
      requestedClearanceMm:0.2,
      qualityMode:"high",
    });

    expect(decision.engine)
      .toBe("distance-field");

    expect(decision.reasonCodes)
      .toContain("triangle_count_high");

    expect(decision.reasonCodes)
      .toContain(
        "complexity_score_distance_field",
      );
  });

  it("uses distance field for multiple connected components",()=>{
    const decision=selectCavityOffsetEngine({
      triangleCount:20_000,
      connectedComponentCount:2,
      requestedClearanceMm:0.2,
      qualityMode:"standard",
    });

    expect(decision.engine)
      .toBe("distance-field");

    expect(decision.reasonCodes)
      .toContain("multiple_components");
  });

  it("produces a deterministic normalized complexity score",()=>{
    const metrics={
      triangleCount:125_000,
      connectedComponentCount:1,
      requestedClearanceMm:0.2,
      qualityMode:"high" as const,
    };

    const first=
      calculateCavityComplexityScore(metrics);

    const second=
      calculateCavityComplexityScore(metrics);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
  });

  it("rejects invalid complexity metrics",()=>{
    expect(
      ()=>calculateCavityComplexityScore({
        triangleCount:-1,
        connectedComponentCount:1,
        requestedClearanceMm:0.2,
        qualityMode:"high",
      }),
    ).toThrow(
      "Cavity complexity metrics are invalid.",
    );
  });
});
