import { describe, expect, it } from "vitest";

import { buildMoldCoordinateFrame } from "./moldCoordinateFrame.builder";

describe("buildMoldCoordinateFrame", () => {
  it("returns a fallback/manual-review frame when there is not enough data", () => {
    const frame = buildMoldCoordinateFrame();

    expect(frame.status).toBe("fallback");
    expect(frame.source).toBe("conservative_fallback");
    expect(frame.confidence).toBe("none");
    expect(frame.requiresManualReview).toBe(true);
    expect(frame.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(frame.directions.pullAxis).toEqual({ x: 0, y: 0, z: 1 });
    expect(frame.reasonCodes).toContain("missing_pull_axis");
    expect(frame.reasonCodes).toContain("missing_part_center");
    expect(frame.reasonCodes).toContain("missing_part_bounds");
    expect(frame.reasonCodes).toContain("fallback_axis_used");
    expect(frame.reasonCodes).toContain("fallback_origin_used");
    expect(frame.reasonCodes).toContain("manual_review_required");
    expect(frame.warnings.length).toBeGreaterThan(0);
  });

  it("builds conservative directions from pull direction only", () => {
    const frame = buildMoldCoordinateFrame({
      pullAxis: { x: 0, y: 0, z: -4 },
    });

    expect(frame.status).toBe("manual_review");
    expect(frame.source).toBe("analysis_pull_direction");
    expect(frame.confidence).toBe("low");
    expect(frame.requiresManualReview).toBe(true);
    expect(frame.directions.pullAxis).toEqual({ x: 0, y: 0, z: -1 });
    expect(frame.directions.moldAxis).toEqual(frame.directions.pullAxis);
    expect(frame.directions.topDirection).toEqual(frame.directions.pullAxis);
    expect(frame.directions.bottomDirection).toEqual({ x: -0, y: -0, z: 1 });
    expect(frame.reasonCodes).toContain("missing_part_center");
    expect(frame.reasonCodes).toContain("missing_part_bounds");
  });

  it("uses pull direction and part center to produce a higher-confidence frame", () => {
    const frame = buildMoldCoordinateFrame({
      pullAxis: { x: 10, y: 0, z: 0 },
      partCenter: { x: 12, y: 8, z: 3 },
    });

    expect(frame.source).toBe("analysis_pull_direction");
    expect(frame.confidence).toBe("high");
    expect(frame.origin).toEqual({ x: 12, y: 8, z: 3 });
    expect(frame.partCenter).toEqual({ x: 12, y: 8, z: 3 });
    expect(frame.directions.pullAxis).toEqual({ x: 1, y: 0, z: 0 });
    expect(frame.reasonCodes).not.toContain("missing_part_center");
    expect(frame.reasonCodes).toContain("coordinate_frame_ready");
  });

  it("rejects a zero pull direction without crashing", () => {
    const frame = buildMoldCoordinateFrame({
      pullAxis: { x: 0, y: 0, z: 0 },
      partCenter: { x: 1, y: 2, z: 3 },
    });

    expect(frame.status).toBe("blocked");
    expect(frame.confidence).toBe("none");
    expect(frame.requiresManualReview).toBe(true);
    expect(frame.blockers).toContain("Pull axis is invalid or zero-length.");
    expect(frame.reasonCodes).toContain("invalid_pull_axis");
    expect(frame.directions.pullAxis).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("keeps m1Direction and m2Direction opposite to each other", () => {
    const frame = buildMoldCoordinateFrame({
      pullAxis: { x: 0, y: 5, z: 0 },
      partCenter: { x: 0, y: 0, z: 0 },
    });

    expect(frame.directions.m1Direction.x).toBe(-frame.directions.m2Direction.x);
    expect(frame.directions.m1Direction.y).toBe(-frame.directions.m2Direction.y);
    expect(frame.directions.m1Direction.z).toBe(-frame.directions.m2Direction.z);
  });

  it("does not crash when Chapter 9/readiness details are incomplete", () => {
    const frame = buildMoldCoordinateFrame({
      pullAxis: { x: 0, y: 0, z: 1 },
      partCenter: { x: 2, y: 2, z: 2 },
      readinessReasonCodes: ["chapter9_missing_report", "partial_analysis_snapshot"],
    });

    expect(frame.requiresManualReview).toBe(true);
    expect(frame.reasonCodes).toContain("chapter9_data_incomplete");
    expect(frame.reasonCodes).toContain("manual_review_required");
  });

  it("does not generate later-stage mold geometry", () => {
    const frame = buildMoldCoordinateFrame({
      pullAxis: { x: 0, y: 0, z: 1 },
      partCenter: { x: 0, y: 0, z: 0 },
    });

    const forbiddenGeometryKeys = [
      "moldEnvelope",
      "moldBlock",
      "partingPlane",
      "partingStrategy",
      "coreCavityRegionMap",
      "cavity",
      "m1Geometry",
      "m2Geometry",
      "splitMold",
      "openingPreview",
    ];

    for (const key of forbiddenGeometryKeys) {
      expect(Object.prototype.hasOwnProperty.call(frame, key)).toBe(false);
    }
  });
});
