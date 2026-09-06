import { describe, expect, it } from "vitest";

import { createPullDirectionEvaluationBundleFromReportSource } from "./pullDirectionEvaluationReportSource";
import { createPullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

describe("pull direction evaluation report source adapter", () => {
  it("creates an evaluation bundle from a report source with ranked candidates", () => {
    const bundle = createPullDirectionEvaluationBundleFromReportSource({
      report: {
        rankedCandidates: [
          {
            id: "candidate-from-report",
            direction: { x: 0, y: 0, z: 9 },
            confidence: 1,
            sourcePriority: 1,
          },
        ],
      },
    });

    expect(bundle.reportSection.status).toBe("ready");
    expect(bundle.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-from-report",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(bundle.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });
    expect(bundle.presentation.summary.bestCandidateLabel).toBe(
      "candidate-from-report · Recommended · 100/100",
    );
  });

  it("creates a blocked bundle when the report source is null", () => {
    const bundle = createPullDirectionEvaluationBundleFromReportSource({
      report: null,
    });

    expect(bundle.reportSection.status).toBe("blocked");
    expect(bundle.reportSection.bestCandidate).toBeNull();
    expect(bundle.snapshot.status).toBe("blocked");
    expect(bundle.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });
    expect(bundle.presentation.summary.bestCandidateLabel).toBe(
      "No best candidate",
    );
  });

  it("creates a blocked bundle when rankedCandidates is missing", () => {
    const bundle = createPullDirectionEvaluationBundleFromReportSource({
      report: {},
    });

    expect(bundle.reportSection.status).toBe("blocked");
    expect(bundle.reportSection.summary.totalCandidates).toBe(0);
    expect(bundle.reportSection.messages).toEqual([
      {
        severity: "warning",
        code: "no_candidates",
        message: "No pull direction candidates were available for evaluation.",
      },
    ]);
  });

  it("creates a blocked bundle when rankedCandidates is null", () => {
    const bundle = createPullDirectionEvaluationBundleFromReportSource({
      report: {
        rankedCandidates: null,
      },
    });

    expect(bundle.reportSection.status).toBe("blocked");
    expect(bundle.reportSection.summary.totalCandidates).toBe(0);
    expect(bundle.presentation.candidates).toEqual([]);
  });

  it("supports custom scoring profiles through the report source adapter", () => {
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

    const bundle = createPullDirectionEvaluationBundleFromReportSource({
      report: {
        rankedCandidates: [
          {
            id: "candidate-custom-source",
            direction: { x: 0, y: 7, z: 0 },
            confidence: 1,
            sourcePriority: 0,
          },
        ],
      },
      scoreProfile,
    });

    expect(bundle.reportSection.status).toBe("ready");
    expect(bundle.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-custom-source",
      score: 80,
      decision: "usable",
      normalizedDirection: { x: 0, y: 1, z: 0 },
    });
    expect(bundle.presentation.summary.bestCandidateLabel).toBe(
      "candidate-custom-source · Usable · 80/100",
    );
  });
});

