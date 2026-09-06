import { describe, expect, it } from "vitest";

import { evaluatePullDirectionForEngineeringReport } from "./pullDirectionEvaluationFacade";
import { createPullDirectionEvaluationReportSnapshot } from "./pullDirectionEvaluationSnapshot";
import { validatePullDirectionEvaluationReportSnapshot } from "./pullDirectionEvaluationSnapshotValidation";

describe("pull direction evaluation snapshot validation", () => {
  it("accepts a valid ready snapshot", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 5 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    const validation = validatePullDirectionEvaluationReportSnapshot(snapshot);

    expect(validation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("accepts a valid blocked snapshot", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    const validation = validatePullDirectionEvaluationReportSnapshot(snapshot);

    expect(validation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("rejects snapshots with non-finite numbers", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-x",
          direction: { x: 1, y: 0, z: 0 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    const invalidSnapshot = {
      ...snapshot,
      evaluations: [
        {
          ...snapshot.evaluations[0],
          score: Number.NaN,
          normalizedDirection: {
            x: Number.POSITIVE_INFINITY,
            y: 0,
            z: 0,
          },
        },
      ],
    };

    const validation = validatePullDirectionEvaluationReportSnapshot(
      invalidSnapshot,
    );

    expect(validation.isValid).toBe(false);
    expect(validation.issues).toEqual([
      {
        severity: "error",
        path: "evaluations.0.normalizedDirection.x",
        message: "Expected a finite numeric value.",
      },
      {
        severity: "error",
        path: "evaluations.0.score",
        message: "Expected a finite numeric value.",
      },
    ]);
  });

  it("warns when decision counts do not match total candidates", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-y",
          direction: { x: 0, y: 1, z: 0 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    const invalidSnapshot = {
      ...snapshot,
      summary: {
        ...snapshot.summary,
        decisionCounts: {
          recommended: 0,
          usable: 0,
          weak: 0,
          rejected: 0,
        },
      },
    };

    const validation = validatePullDirectionEvaluationReportSnapshot(
      invalidSnapshot,
    );

    expect(validation).toEqual({
      isValid: true,
      issues: [
        {
          severity: "warning",
          path: "summary.decisionCounts",
          message: "Decision counts do not add up to totalCandidates.",
        },
      ],
    });
  });

  it("rejects snapshots with empty candidate ids", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-valid",
          direction: { x: 1, y: 0, z: 0 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );

    const invalidSnapshot = {
      ...snapshot,
      bestCandidate: snapshot.bestCandidate
        ? {
            ...snapshot.bestCandidate,
            candidateId: " ",
          }
        : null,
      evaluations: [
        {
          ...snapshot.evaluations[0],
          candidateId: "",
        },
      ],
    };

    const validation = validatePullDirectionEvaluationReportSnapshot(
      invalidSnapshot,
    );

    expect(validation).toEqual({
      isValid: false,
      issues: [
        {
          severity: "error",
          path: "bestCandidate.candidateId",
          message: "Expected a non-empty candidate id.",
        },
        {
          severity: "error",
          path: "evaluations.0.candidateId",
          message: "Expected a non-empty candidate id.",
        },
      ],
    });
  });
});
