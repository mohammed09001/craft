import { baselineSegmentationAlgorithm } from "./baselineSegmentationAlgorithm";
import type { FitAxis, Size3 } from "../fitAnalysis";

describe("baselineSegmentationAlgorithm.identifyLogicalSections", () => {
  function identify(
    sourceSize: Size3,
    printerFitAxes: readonly FitAxis[] = [],
  ) {
    return baselineSegmentationAlgorithm.identifyLogicalSections!(
      sourceSize,
      printerFitAxes,
    );
  }

  it("suggests the elongated axis when it is significantly longer than the others", () => {
    expect(identify({ x: 95, y: 50, z: 50 })).toEqual({ x: 2 });
  });

  it("suggests nothing when no axis is significantly elongated", () => {
    expect(identify({ x: 60, y: 50, z: 50 })).toEqual({});
  });

  it("does not suggest an axis that printer-fit already forces", () => {
    expect(identify({ x: 95, y: 50, z: 50 }, ["x"])).toEqual({});
  });

  it("considers a non-forced axis independently of a forced longer axis", () => {
    // x is by far the longest overall, but it is already printer-forced;
    // among the remaining candidate axes (y, z), y is still significantly
    // elongated relative to z and should be suggested on its own merits.
    expect(identify({ x: 250, y: 95, z: 50 }, ["x"])).toEqual({ y: 2 });
  });
});
