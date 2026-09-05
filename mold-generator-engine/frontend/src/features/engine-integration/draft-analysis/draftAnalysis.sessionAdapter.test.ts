import { describe, expect, it } from "vitest";

import { DEFAULT_DRAFT_ANALYSIS_OPTIONS } from "./draftAnalysis.contracts";
import { createDraftAnalysisInputFromSession } from "./draftAnalysis.sessionAdapter";

describe("createDraftAnalysisInputFromSession", () => {
  it("maps Analysis Session geometry and pull direction into Draft Analysis input", () => {
    const input = createDraftAnalysisInputFromSession({
      sessionId: "session-8a",
      modelId: "model-root",
      fileName: "root.stl",
      geometry: {
        modelId: "model-geometry",
        fileName: "geometry.stl",
        triangleCount: 128,
        vertexCount: 96,
        units: "mm",
      },
      pullDirection: {
        vector: { x: 0, y: 1, z: 0 },
        confidence: 0.9,
      },
    });

    expect(input).toEqual({
      analysisSessionId: "session-8a",
      geometry: {
        source: "analysis_session",
        modelId: "model-geometry",
        fileName: "geometry.stl",
        triangleCount: 128,
        vertexCount: 96,
        units: "mm",
      },
      pullDirection: {
        vector: { x: 0, y: 1, z: 0 },
        source: "pull_direction_engine",
        confidence: 0.9,
      },
      options: DEFAULT_DRAFT_ANALYSIS_OPTIONS,
    });
  });

  it("omits optional fields when the session does not provide them", () => {
    const input = createDraftAnalysisInputFromSession({
      id: "session-without-pull-direction",
      fileName: "sample.stl",
    });

    expect(input).toEqual({
      analysisSessionId: "session-without-pull-direction",
      geometry: {
        source: "analysis_session",
        fileName: "sample.stl",
      },
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
        source: "fallback",
      },
      options: DEFAULT_DRAFT_ANALYSIS_OPTIONS,
    });

    expect("modelId" in input.geometry).toBe(false);
    expect("triangleCount" in input.geometry).toBe(false);
    expect("vertexCount" in input.geometry).toBe(false);
    expect("units" in input.geometry).toBe(false);
    expect("confidence" in input.pullDirection).toBe(false);
    expect("faces" in input).toBe(false);
  });

  it("forwards optional face inputs when the session provides them", () => {
    const input = createDraftAnalysisInputFromSession({
      sessionId: "session-with-faces",
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
        confidence: 1,
      },
      faces: [
        {
          faceId: "face-a",
          normal: { x: 0, y: 0, z: 1 },
          centroid: { x: 1, y: 2, z: 3 },
          area: 10,
        },
        {
          faceId: "face-b",
          normal: { x: 1, y: 0, z: 0 },
        },
      ],
    });

    expect(input.faces).toEqual([
      {
        faceId: "face-a",
        normal: { x: 0, y: 0, z: 1 },
        centroid: { x: 1, y: 2, z: 3 },
        area: 10,
      },
      {
        faceId: "face-b",
        normal: { x: 1, y: 0, z: 0 },
      },
    ]);

    expect(input.faces?.[1] !== undefined && "centroid" in input.faces[1]).toBe(false);
    expect(input.faces?.[1] !== undefined && "area" in input.faces[1]).toBe(false);
  });
});
