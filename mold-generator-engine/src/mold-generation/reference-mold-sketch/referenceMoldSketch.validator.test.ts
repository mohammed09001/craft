import { describe, expect, it } from "vitest";

import type { ReferenceMoldSketchInput } from "./referenceMoldSketch.types";
import { validateReferenceMoldSketch } from "./referenceMoldSketch.validator";

const baseInput = (
  overrides: Partial<ReferenceMoldSketchInput> = {},
): ReferenceMoldSketchInput => ({
  faceView: {
    faceViewId: "front-face",
    boxFaceId: "box-face-front",
    bounds: {
      min: { x: 0, y: 0 },
      max: { x: 100, y: 50 },
    },
  },
  drawingMode: "line",
  points: [
    { x: 0, y: 25 },
    { x: 100, y: 25 },
  ],
  tolerance: 0.01,
  ...overrides,
});

describe("validateReferenceMoldSketch", () => {
  it("accepts a valid line from the left boundary to the right boundary", () => {
    const result = validateReferenceMoldSketch(baseInput());

    expect(result.status).toBe("accepted");
    expect(result.requiresManualReview).toBe(false);
    expect(result.confidence).toBe("high");
    expect(result.blockers).toEqual([]);
    expect(result.reasonCodes).toContain("reference_mold_sketch_ready");
    expect(result.startBoundaryTouch?.sides).toEqual(["left"]);
    expect(result.endBoundaryTouch?.sides).toEqual(["right"]);
    expect(result.referenceMoldSketch).toBeDefined();
    expect(result.referenceMoldSketch?.isFinalMoldGeometry).toBe(false);
  });

  it("accepts a valid freehand polyline from one box boundary to another", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        drawingMode: "freehand",
        points: [
          { x: 50, y: 0 },
          { x: 40, y: 15 },
          { x: 60, y: 35 },
          { x: 50, y: 50 },
        ],
      }),
    );

    expect(result.status).toBe("accepted");
    expect(result.confidence).toBe("medium");
    expect(result.startBoundaryTouch?.sides).toEqual(["bottom"]);
    expect(result.endBoundaryTouch?.sides).toEqual(["top"]);
    expect(result.referenceMoldSketch?.drawingMode).toBe("freehand");
    expect(result.referenceMoldSketch?.points).toHaveLength(4);
  });

  it("rejects when start point does not touch the box face boundary", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        points: [
          { x: 10, y: 25 },
          { x: 100, y: 25 },
        ],
      }),
    );

    expect(result.status).toBe("rejected");
    expect(result.referenceMoldSketch).toBeUndefined();
    expect(result.reasonCodes).toContain("start_not_on_box_boundary");
    expect(result.blockers).toContain(
      "Reference sketch start boundary point must touch the box face boundary.",
    );
  });

  it("rejects when end point does not touch the box face boundary", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        points: [
          { x: 0, y: 25 },
          { x: 90, y: 25 },
        ],
      }),
    );

    expect(result.status).toBe("rejected");
    expect(result.referenceMoldSketch).toBeUndefined();
    expect(result.reasonCodes).toContain("end_not_on_box_boundary");
    expect(result.blockers).toContain(
      "Reference sketch end boundary point must touch the box face boundary.",
    );
  });

  it("rejects invalid bounds", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        faceView: {
          bounds: {
            min: { x: 10, y: 0 },
            max: { x: 10, y: 50 },
          },
        },
      }),
    );

    expect(result.status).toBe("rejected");
    expect(result.normalizedPoints).toEqual([]);
    expect(result.reasonCodes).toContain("invalid_bounds");
    expect(result.requiresManualReview).toBe(true);
  });

  it("rejects non-finite points", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        points: [
          { x: 0, y: 25 },
          { x: Number.POSITIVE_INFINITY, y: 25 },
        ],
      }),
    );

    expect(result.status).toBe("rejected");
    expect(result.normalizedPoints).toEqual([]);
    expect(result.reasonCodes).toContain("non_finite_point");
    expect(result.referenceMoldSketch).toBeUndefined();
  });

  it("rejects a zero-length path", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
    );

    expect(result.status).toBe("rejected");
    expect(result.reasonCodes).toContain("zero_length_path");
    expect(result.referenceMoldSketch).toBeUndefined();
  });

  it("accepts and snaps endpoints that are within boundary tolerance", () => {
    const result = validateReferenceMoldSketch(
      baseInput({
        points: [
          { x: 0.08, y: 25 },
          { x: 99.95, y: 25 },
        ],
        tolerance: 0.1,
      }),
    );

    expect(result.status).toBe("accepted");
    expect(result.reasonCodes).toContain("endpoint_snapped_to_box_boundary");
    expect(result.normalizedPoints).toEqual([
      { x: 0, y: 25 },
      { x: 100, y: 25 },
    ]);
    expect(result.startBoundaryTouch?.sides).toEqual(["left"]);
    expect(result.endBoundaryTouch?.sides).toEqual(["right"]);
  });
});
