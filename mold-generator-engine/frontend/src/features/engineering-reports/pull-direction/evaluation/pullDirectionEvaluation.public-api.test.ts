import { describe, expect, it } from "vitest";

import {
  createPullDirectionEvaluationBundle,
  createPullDirectionEvaluationScoreProfile,
  evaluatePullDirectionForEngineeringReport,
  validatePullDirectionEvaluationReportSnapshot,
  type PullDirectionEvaluationBundle,
  type PullDirectionEvaluationFacadeResult,
} from "./index";

describe("pull direction evaluation public API", () => {
  it("allows external consumers to create a complete evaluation bundle through the public barrel", () => {
    const bundle: PullDirectionEvaluationBundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 6 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    expect(bundle.reportSection.status).toBe("ready");
    expect(bundle.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-z",
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

  it("allows external consumers to use the public facade with a custom scoring profile", () => {
    const scoreProfile = createPullDirectionEvaluationScoreProfile({
      thresholds: {
        recommended: 95,
        usable: 80,
        weak: 50,
      },
      weights: {
        baseScore: 40,
        confidenceContribution: 40,
        sourcePriorityContribution: 20,
      },
    });

    const facadeResult: PullDirectionEvaluationFacadeResult =
      evaluatePullDirectionForEngineeringReport({
        rankedCandidates: [
          {
            id: "candidate-custom",
            direction: { x: 5, y: 0, z: 0 },
            confidence: 1,
            sourcePriority: 0,
          },
        ],
        scoreProfile,
      });

    expect(facadeResult.reportSection.status).toBe("ready");
    expect(facadeResult.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-custom",
      score: 80,
      decision: "usable",
      normalizedDirection: { x: 1, y: 0, z: 0 },
    });
  });

  it("allows external consumers to validate snapshots through the public barrel", () => {
    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-y",
          direction: { x: 0, y: 2, z: 0 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const validation = validatePullDirectionEvaluationReportSnapshot(
      bundle.snapshot,
    );

    expect(validation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("keeps blocked evaluation state stable through the public API", () => {
    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [],
    });

    expect(bundle.reportSection.status).toBe("blocked");
    expect(bundle.reportSection.bestCandidate).toBeNull();
    expect(bundle.snapshot.status).toBe("blocked");
    expect(bundle.presentation.summary.bestCandidateLabel).toBe(
      "No best candidate",
    );
  });
});

