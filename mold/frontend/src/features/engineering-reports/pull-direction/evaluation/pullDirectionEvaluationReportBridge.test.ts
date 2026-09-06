import { describe, expect, it } from "vitest";

import {
  buildPullDirectionEvaluationReportSection,
  createPullDirectionEvaluationReportSection,
  resolvePullDirectionEvaluationReportStatus,
} from "./pullDirectionEvaluationReportBridge";
import { runPullDirectionEvaluationPipeline } from "./pullDirectionEvaluationPipeline";

describe("pull direction evaluation report bridge", () => {
  it("builds a ready report section when a recommended candidate exists", () => {
    const section = buildPullDirectionEvaluationReportSection({
      rankedCandidates: [
        {
          id: "candidate-z",
          direction: { x: 0, y: 0, z: 10 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    expect(section.status).toBe("ready");
    expect(section.bestCandidate).toEqual({
      candidateId: "candidate-z",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(section.summary.bestCandidateId).toBe("candidate-z");
    expect(section.evaluations).toHaveLength(1);
    expect(section.messages.map((message) => message.code)).toEqual([
      "recommended_candidate_available",
    ]);
  });

  it("marks the report section as review_required when rejected candidates exist", () => {
    const section = buildPullDirectionEvaluationReportSection({
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

    expect(section.status).toBe("review_required");
    expect(section.bestCandidate).toEqual({
      candidateId: "candidate-valid",
      score: 83.5,
      decision: "usable",
      normalizedDirection: { x: 1, y: 0, z: 0 },
    });
    expect(section.summary.rejectedCandidates).toBe(1);
    expect(section.messages.map((message) => message.code)).toEqual([
      "usable_candidate_available",
      "rejected_candidates_present",
    ]);
  });

  it("marks the report section as blocked when no usable candidate exists", () => {
    const section = buildPullDirectionEvaluationReportSection({
      rankedCandidates: [
        {
          id: "candidate-invalid",
        },
      ],
    });

    expect(section.status).toBe("blocked");
    expect(section.bestCandidate).toBeNull();
    expect(section.summary.bestCandidateId).toBeNull();
    expect(section.summary.bestCandidateDecision).toBeNull();
    expect(section.messages.map((message) => message.code)).toEqual([
      "no_usable_candidate",
      "rejected_candidates_present",
    ]);
  });

  it("can create a report section from an existing pipeline result", () => {
    const pipelineResult = runPullDirectionEvaluationPipeline({
      rankedCandidates: [
        {
          id: "candidate-y",
          direction: { x: 0, y: 3, z: 0 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    });

    const section = createPullDirectionEvaluationReportSection(pipelineResult);

    expect(section.status).toBe("ready");
    expect(section.bestCandidate?.candidateId).toBe("candidate-y");
    expect(section.bestCandidate?.normalizedDirection).toEqual({
      x: 0,
      y: 1,
      z: 0,
    });
  });

  it("resolves report status from summary state", () => {
    expect(
      resolvePullDirectionEvaluationReportStatus({
        totalCandidates: 1,
        evaluatedCandidates: 1,
        recommendedCandidates: 1,
        usableCandidates: 0,
        weakCandidates: 0,
        rejectedCandidates: 0,
        bestCandidateId: "candidate-ready",
        bestCandidateScore: 100,
        bestCandidateDecision: "recommended",
        decisionCounts: {
          recommended: 1,
          usable: 0,
          weak: 0,
          rejected: 0,
        },
        messages: [],
      }),
    ).toBe("ready");

    expect(
      resolvePullDirectionEvaluationReportStatus({
        totalCandidates: 2,
        evaluatedCandidates: 2,
        recommendedCandidates: 0,
        usableCandidates: 1,
        weakCandidates: 0,
        rejectedCandidates: 1,
        bestCandidateId: "candidate-review",
        bestCandidateScore: 80,
        bestCandidateDecision: "usable",
        decisionCounts: {
          recommended: 0,
          usable: 1,
          weak: 0,
          rejected: 1,
        },
        messages: [],
      }),
    ).toBe("review_required");

    expect(
      resolvePullDirectionEvaluationReportStatus({
        totalCandidates: 1,
        evaluatedCandidates: 1,
        recommendedCandidates: 0,
        usableCandidates: 0,
        weakCandidates: 0,
        rejectedCandidates: 1,
        bestCandidateId: null,
        bestCandidateScore: null,
        bestCandidateDecision: null,
        decisionCounts: {
          recommended: 0,
          usable: 0,
          weak: 0,
          rejected: 1,
        },
        messages: [],
      }),
    ).toBe("blocked");
  });
});

