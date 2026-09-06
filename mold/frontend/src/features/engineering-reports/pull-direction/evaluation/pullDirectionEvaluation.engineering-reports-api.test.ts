import { describe, expect, it } from "vitest";

import {
  createPullDirectionEvaluationBundle,
  evaluatePullDirectionForEngineeringReport,
  validatePullDirectionEvaluationReportSnapshot,
  type PullDirectionEvaluationBundle,
  type PullDirectionEvaluationFacadeResult,
} from "../../index";

describe("engineering reports public API", () => {
  it("exports the pull direction evaluation bundle builder from engineering-reports", () => {
    const bundle: PullDirectionEvaluationBundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-engineering-reports-api",
          direction: { x: 0, y: 0, z: 16 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    expect(bundle.reportSection.status).toBe("ready");
    expect(bundle.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-engineering-reports-api",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(bundle.snapshot.status).toBe("ready");
    expect(bundle.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });
    expect(bundle.presentation.summary.statusBadge).toEqual({
      label: "Ready",
      tone: "success",
    });
  });

  it("exports the pull direction engineering report facade from engineering-reports", () => {
    const result: PullDirectionEvaluationFacadeResult =
      evaluatePullDirectionForEngineeringReport({
        rankedCandidates: [
          {
            id: "candidate-facade-api",
            direction: { x: 4, y: 0, z: 0 },
            confidence: 1,
            sourcePriority: 1,
          },
        ],
      });

    expect(result.reportSection.status).toBe("ready");
    expect(result.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-facade-api",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 1, y: 0, z: 0 },
    });
  });

  it("exports the snapshot validation guard from engineering-reports", () => {
    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [],
    });

    const validation = validatePullDirectionEvaluationReportSnapshot(
      bundle.snapshot,
    );

    expect(bundle.reportSection.status).toBe("blocked");
    expect(validation).toEqual({
      isValid: true,
      issues: [],
    });
  });
});

