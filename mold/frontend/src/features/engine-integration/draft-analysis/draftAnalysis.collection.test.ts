import { describe, expect, it } from "vitest";

import { DEFAULT_DRAFT_ANALYSIS_OPTIONS } from "./draftAnalysis.contracts";
import { analyzeDraftFaceCollection } from "./draftAnalysis.collection";

describe("analyzeDraftFaceCollection", () => {
  it("analyzes a small collection of face normals", () => {
    const result = analyzeDraftFaceCollection({
      faces: [
        {
          faceId: "positive",
          normal: { x: 0, y: 0, z: 1 },
        },
        {
          faceId: "zero",
          normal: { x: 1, y: 0, z: 0 },
        },
        {
          faceId: "negative",
          normal: { x: 0, y: 0, z: -1 },
        },
      ],
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
        source: "pull_direction_engine",
      },
      options: DEFAULT_DRAFT_ANALYSIS_OPTIONS,
    });

    expect(result.faceSamples).toHaveLength(3);
    expect(result.summary.totalFaceCount).toBe(3);
    expect(result.summary.analyzedFaceCount).toBe(3);
    expect(result.summary.positiveDraftFaceCount).toBe(1);
    expect(result.summary.zeroDraftFaceCount).toBe(1);
    expect(result.summary.negativeDraftFaceCount).toBe(1);
    expect(result.summary.undeterminedFaceCount).toBe(0);

    expect(result.chapter10Signals).toEqual({
      hasNegativeDraftFaces: true,
      hasUndeterminedFaces: false,
      algorithmCompleted: true,
    });
  });

  it("marks invalid face normals as undetermined", () => {
    const result = analyzeDraftFaceCollection({
      faces: [
        {
          faceId: "invalid",
          normal: { x: 0, y: 0, z: 0 },
        },
      ],
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
        source: "pull_direction_engine",
      },
      options: DEFAULT_DRAFT_ANALYSIS_OPTIONS,
    });

    expect(result.faceSamples).toEqual([
      {
        faceId: "invalid",
        normal: { x: 0, y: 0, z: 0 },
        band: "undetermined",
      },
    ]);

    expect(result.summary.undeterminedFaceCount).toBe(1);
    expect(result.chapter10Signals).toEqual({
      hasNegativeDraftFaces: false,
      hasUndeterminedFaces: true,
      algorithmCompleted: true,
    });
  });

  it("limits stored face samples using maxStoredFaceSamples", () => {
    const result = analyzeDraftFaceCollection({
      faces: [
        { faceId: "a", normal: { x: 1, y: 0, z: 0 } },
        { faceId: "b", normal: { x: 1, y: 0, z: 0 } },
      ],
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
        source: "pull_direction_engine",
      },
      options: {
        ...DEFAULT_DRAFT_ANALYSIS_OPTIONS,
        maxStoredFaceSamples: 1,
      },
    });

    expect(result.faceSamples).toHaveLength(1);
    expect(result.summary.totalFaceCount).toBe(1);
  });
});
