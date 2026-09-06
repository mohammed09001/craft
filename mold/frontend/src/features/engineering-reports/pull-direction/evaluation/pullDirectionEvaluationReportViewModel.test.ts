import { describe, expect, it } from "vitest";

import { createPullDirectionEvaluationReportViewModel } from "./pullDirectionEvaluationReportViewModel";
import { createPullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

describe("pull direction evaluation report view model", () => {
  it("creates a ready view model from a report source", () => {
    const viewModel = createPullDirectionEvaluationReportViewModel({
      report: {
        rankedCandidates: [
          {
            id: "candidate-view-model",
            direction: { x: 0, y: 0, z: 15 },
            confidence: 1,
            sourcePriority: 1,
          },
        ],
      },
    });

    expect(viewModel.state).toEqual({
      status: "ready",
      isReady: true,
      requiresReview: false,
      isBlocked: false,
      canUseBestCandidate: true,
    });

    expect(viewModel.bestCandidate).toEqual({
      candidateId: "candidate-view-model",
      score: 100,
      normalizedDirection: { x: 0, y: 0, z: 1 },
      label: "candidate-view-model · Recommended · 100/100",
    });

    expect(viewModel.validation).toEqual({
      isValid: true,
      issues: [],
    });

    expect(viewModel.presentation.summary.statusBadge).toEqual({
      label: "Ready",
      tone: "success",
    });

    expect(viewModel.bundle.reportSection.status).toBe("ready");
  });

  it("creates a review-required view model when rejected candidates are present", () => {
    const viewModel = createPullDirectionEvaluationReportViewModel({
      report: {
        rankedCandidates: [
          {
            id: "candidate-review",
            direction: { x: 1, y: 0, z: 0 },
            confidence: 0.7,
            sourcePriority: 0.4,
          },
          {
            id: "candidate-invalid",
          },
        ],
      },
    });

    expect(viewModel.state).toEqual({
      status: "review_required",
      isReady: false,
      requiresReview: true,
      isBlocked: false,
      canUseBestCandidate: true,
    });

    expect(viewModel.bestCandidate).toEqual({
      candidateId: "candidate-review",
      score: 83.5,
      normalizedDirection: { x: 1, y: 0, z: 0 },
      label: "candidate-review · Usable · 83.5/100",
    });

    expect(viewModel.presentation.summary.statusBadge).toEqual({
      label: "Review required",
      tone: "warning",
    });

    expect(viewModel.snapshot.summary.rejectedCandidates).toBe(1);
  });

  it("creates a blocked view model when report source is missing", () => {
    const viewModel = createPullDirectionEvaluationReportViewModel({
      report: undefined,
    });

    expect(viewModel.state).toEqual({
      status: "blocked",
      isReady: false,
      requiresReview: false,
      isBlocked: true,
      canUseBestCandidate: false,
    });

    expect(viewModel.bestCandidate).toBeNull();
    expect(viewModel.snapshot.status).toBe("blocked");
    expect(viewModel.presentation.summary.bestCandidateLabel).toBe(
      "No best candidate",
    );
    expect(viewModel.validation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("supports custom score profiles in the view model builder", () => {
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

    const viewModel = createPullDirectionEvaluationReportViewModel({
      report: {
        rankedCandidates: [
          {
            id: "candidate-custom-view-model",
            direction: { x: 0, y: 10, z: 0 },
            confidence: 1,
            sourcePriority: 0,
          },
        ],
      },
      scoreProfile,
    });

    expect(viewModel.state).toEqual({
      status: "ready",
      isReady: true,
      requiresReview: false,
      isBlocked: false,
      canUseBestCandidate: true,
    });

    expect(viewModel.bestCandidate).toEqual({
      candidateId: "candidate-custom-view-model",
      score: 80,
      normalizedDirection: { x: 0, y: 1, z: 0 },
      label: "candidate-custom-view-model · Usable · 80/100",
    });
  });

  it("keeps blocked state visible when all candidates are rejected", () => {
    const viewModel = createPullDirectionEvaluationReportViewModel({
      report: {
        rankedCandidates: [
          {
            id: "candidate-rejected",
          },
        ],
      },
    });

    expect(viewModel.state).toEqual({
      status: "blocked",
      isReady: false,
      requiresReview: false,
      isBlocked: true,
      canUseBestCandidate: false,
    });

    expect(viewModel.bestCandidate).toBeNull();
    expect(viewModel.snapshot.evaluations).toHaveLength(1);
    expect(viewModel.snapshot.evaluations[0]).toMatchObject({
      candidateId: "candidate-rejected",
      decision: "rejected",
      score: 0,
      normalizedDirection: null,
      vectorLength: null,
    });
  });
});

