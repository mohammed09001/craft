import { describe, expect, it } from "vitest";

import { createPullDirectionEvaluationBundle } from "./pullDirectionEvaluationBundle";
import { createPullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

describe("pull direction evaluation bundle", () => {
  it("creates a complete ready bundle from ranked candidates", () => {
    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 8 },
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
    expect(bundle.snapshot.bestCandidate).toEqual({
      candidateId: "candidate-z",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });

    expect(bundle.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });

    expect(bundle.presentation.summary).toMatchObject({
      title: "Pull Direction Evaluation",
      statusBadge: {
        label: "Ready",
        tone: "success",
      },
      bestCandidateLabel: "candidate-z · Recommended · 100/100",
    });
  });

  it("creates a complete blocked bundle when no candidates exist", () => {
    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [],
    });

    expect(bundle.reportSection.status).toBe("blocked");
    expect(bundle.reportSection.bestCandidate).toBeNull();

    expect(bundle.snapshot).toMatchObject({
      status: "blocked",
      bestCandidate: null,
      evaluations: [],
    });

    expect(bundle.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });

    expect(bundle.presentation.summary).toEqual({
      title: "Pull Direction Evaluation",
      subtitle:
        "Pull direction evaluation is blocked because no usable candidate is available.",
      statusBadge: {
        label: "Blocked",
        tone: "danger",
      },
      bestCandidateLabel: "No best candidate",
      countLabel: "0 total · 0 recommended · 0 usable · 0 weak · 0 rejected",
      messages: [
        {
          label: "No pull direction candidates were available for evaluation.",
          tone: "warning",
        },
      ],
    });
    expect(bundle.presentation.candidates).toEqual([]);
  });

  it("keeps review-required state visible across report, snapshot, and presentation", () => {
    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-valid",
          direction: { x: 1, y: 0, z: 0 },
          confidence: 0.7,
          sourcePriority: 0.4,
        },
        {
          id: "candidate-invalid",
        },
      ],
    });

    expect(bundle.reportSection.status).toBe("review_required");
    expect(bundle.snapshot.status).toBe("review_required");
    expect(bundle.presentation.summary.statusBadge).toEqual({
      label: "Review required",
      tone: "warning",
    });
    expect(bundle.presentation.summary.messages).toEqual([
      {
        label:
          "A usable pull direction candidate is available, but it is not yet classified as strongly recommended.",
        tone: "neutral",
      },
      {
        label: "One or more pull direction candidates were rejected during evaluation.",
        tone: "warning",
      },
    ]);
  });

  it("supports custom score profiles through the full bundle builder", () => {
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

    const bundle = createPullDirectionEvaluationBundle({
      rankedCandidates: [
        {
          id: "candidate-custom",
          direction: { x: 0, y: 10, z: 0 },
          confidence: 1,
          sourcePriority: 0,
        },
      ],
      scoreProfile,
    });

    expect(bundle.reportSection.status).toBe("ready");
    expect(bundle.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-custom",
      score: 80,
      decision: "usable",
      normalizedDirection: { x: 0, y: 1, z: 0 },
    });
    expect(bundle.presentation.summary.bestCandidateLabel).toBe(
      "candidate-custom · Usable · 80/100",
    );
  });
});

