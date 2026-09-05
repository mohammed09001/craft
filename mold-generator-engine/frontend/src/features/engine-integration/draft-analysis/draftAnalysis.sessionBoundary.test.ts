import { describe, expect, it } from "vitest";

import { createDraftAnalysisBoundaryFromSession } from "./draftAnalysis.sessionBoundary";

describe("createDraftAnalysisBoundaryFromSession", () => {
  it("returns a pending boundary when the session has no face inputs", () => {
    const snapshot = createDraftAnalysisBoundaryFromSession({
      sessionId: "pending-session",
      fileName: "pending.stl",
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
      },
    });

    expect(snapshot).toEqual({
      source: "draft_analysis",
      status: "pending_algorithm",
      algorithmCompleted: false,
      hasNegativeDraftFaces: false,
      hasUndeterminedFaces: false,
      totalFaceCount: 0,
      analyzedFaceCount: 0,
      positiveDraftFaceCount: 0,
      zeroDraftFaceCount: 0,
      negativeDraftFaceCount: 0,
      undeterminedFaceCount: 0,
    });
  });

  it("returns a completed boundary when the session provides face inputs", () => {
    const snapshot = createDraftAnalysisBoundaryFromSession({
      sessionId: "completed-session",
      pullDirection: {
        vector: { x: 0, y: 0, z: 1 },
      },
      faces: [
        {
          faceId: "positive",
          normal: { x: 0, y: 0, z: 1 },
        },
        {
          faceId: "negative",
          normal: { x: 0, y: 0, z: -1 },
        },
      ],
    });

    expect(snapshot.status).toBe("completed");
    expect(snapshot.algorithmCompleted).toBe(true);
    expect(snapshot.hasNegativeDraftFaces).toBe(true);
    expect(snapshot.hasUndeterminedFaces).toBe(false);
    expect(snapshot.totalFaceCount).toBe(2);
    expect(snapshot.analyzedFaceCount).toBe(2);
    expect(snapshot.positiveDraftFaceCount).toBe(1);
    expect(snapshot.negativeDraftFaceCount).toBe(1);
    expect(snapshot.minimumDraftAngleDegrees).toBeCloseTo(-90);
    expect(snapshot.maximumDraftAngleDegrees).toBeCloseTo(90);
    expect(snapshot.meanDraftAngleDegrees).toBeCloseTo(0);
  });
});
