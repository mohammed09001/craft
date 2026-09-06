import { describe, expect, it } from "vitest";

import { evaluatePullDirectionForEngineeringReport } from "./pullDirectionEvaluationFacade";
import { createPullDirectionEvaluationPresentation } from "./pullDirectionEvaluationPresentation";
import { createPullDirectionEvaluationReportSnapshot } from "./pullDirectionEvaluationSnapshot";

describe("pull direction evaluation presentation", () => {
  it("creates a ready presentation model from a report snapshot", () => {
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
    const presentation = createPullDirectionEvaluationPresentation(snapshot);

    expect(presentation.summary).toMatchObject({
      title: "Pull Direction Evaluation",
      subtitle:
        "Pull direction evaluation is ready for downstream engineering analysis.",
      statusBadge: {
        label: "Ready",
        tone: "success",
      },
      bestCandidateLabel: "candidate-z · Recommended · 100/100",
      countLabel: "1 total · 1 recommended · 0 usable · 0 weak · 0 rejected",
    });

    expect(presentation.candidates).toHaveLength(1);
    expect(presentation.candidates[0]).toMatchObject({
      candidateId: "candidate-z",
      decision: "recommended",
      decisionBadge: {
        label: "Recommended",
        tone: "success",
      },
      scoreLabel: "100/100",
      originalDirectionLabel: "(0, 0, 5)",
      normalizedDirectionLabel: "(0, 0, 1)",
      vectorLengthLabel: "5",
    });
  });

  it("creates a blocked presentation model when no candidate exists", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );
    const presentation = createPullDirectionEvaluationPresentation(snapshot);

    expect(presentation.summary).toEqual({
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
    expect(presentation.candidates).toEqual([]);
  });

  it("formats vector and score values for review-friendly display", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-diagonal",
          direction: { x: 1, y: 1, z: 1 },
          confidence: 0.333333333333,
          sourcePriority: 0.666666666666,
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );
    const presentation = createPullDirectionEvaluationPresentation(snapshot);

    expect(presentation.candidates[0]).toMatchObject({
      candidateId: "candidate-diagonal",
      scoreLabel: "73.33/100",
      originalDirectionLabel: "(1, 1, 1)",
      normalizedDirectionLabel: "(0.57735, 0.57735, 0.57735)",
      vectorLengthLabel: "1.732051",
    });
  });

  it("keeps rejected candidate reasons visible for future UI review", () => {
    const result = evaluatePullDirectionForEngineeringReport({
      rankedCandidates: [
        {
          id: "candidate-invalid",
        },
      ],
    });

    const snapshot = createPullDirectionEvaluationReportSnapshot(
      result.reportSection,
    );
    const presentation = createPullDirectionEvaluationPresentation(snapshot);

    expect(presentation.candidates).toHaveLength(1);
    expect(presentation.candidates[0]).toMatchObject({
      candidateId: "candidate-invalid",
      decision: "rejected",
      decisionBadge: {
        label: "Rejected",
        tone: "danger",
      },
      scoreLabel: "0/100",
      normalizedDirectionLabel: "N/A",
      vectorLengthLabel: "N/A",
    });
    expect(presentation.candidates[0]?.reasonLabels).toEqual([
      "negative: The candidate was marked invalid by an earlier validation stage.",
    ]);
  });
});

