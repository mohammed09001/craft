import { describe, expect, it } from "vitest";

import {
  attachPullDirectionEvaluationToReport,
  createPullDirectionEvaluationAttachment,
} from "./pullDirectionEvaluationAttachment";
import { createPullDirectionEvaluationScoreProfile } from "./pullDirectionEvaluationScoring";

describe("pull direction evaluation attachment", () => {
  it("creates an attachment from a report source", () => {
    const attachment = createPullDirectionEvaluationAttachment({
      report: {
        rankedCandidates: [
          {
            id: "candidate-attachment",
            direction: { x: 0, y: 0, z: 11 },
            confidence: 1,
            sourcePriority: 1,
          },
        ],
      },
    });

    expect(attachment.pullDirectionEvaluation.reportSection.status).toBe("ready");
    expect(attachment.pullDirectionEvaluation.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-attachment",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(attachment.pullDirectionEvaluation.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("creates a blocked attachment when report source is missing", () => {
    const attachment = createPullDirectionEvaluationAttachment({
      report: undefined,
    });

    expect(attachment.pullDirectionEvaluation.reportSection.status).toBe("blocked");
    expect(attachment.pullDirectionEvaluation.reportSection.bestCandidate).toBeNull();
    expect(attachment.pullDirectionEvaluation.presentation.summary.bestCandidateLabel).toBe(
      "No best candidate",
    );
  });

  it("attaches pull direction evaluation to a report without mutating the original report", () => {
    const report = {
      reportId: "report-1",
      title: "Pull Direction Foundation Report",
      rankedCandidates: [
        {
          id: "candidate-report-attachment",
          direction: { x: 0, y: 5, z: 0 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    };

    const attachedReport = attachPullDirectionEvaluationToReport({
      report,
    });

    expect("pullDirectionEvaluation" in report).toBe(false);

    expect(attachedReport.reportId).toBe("report-1");
    expect(attachedReport.title).toBe("Pull Direction Foundation Report");
    expect(attachedReport.rankedCandidates).toBe(report.rankedCandidates);
    expect(attachedReport.pullDirectionEvaluation.reportSection.status).toBe(
      "ready",
    );
    expect(
      attachedReport.pullDirectionEvaluation.reportSection.bestCandidate,
    ).toEqual({
      candidateId: "candidate-report-attachment",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 1, z: 0 },
    });
  });

  it("keeps existing report fields while adding evaluation output", () => {
    const report = {
      reportId: "report-with-extra-fields",
      createdAt: "2026-07-07T00:00:00.000Z",
      metadata: {
        source: "test",
      },
      rankedCandidates: [
        {
          id: "candidate-extra",
          direction: { x: 3, y: 0, z: 4 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    };

    const attachedReport = attachPullDirectionEvaluationToReport({
      report,
    });

    expect(attachedReport.reportId).toBe("report-with-extra-fields");
    expect(attachedReport.createdAt).toBe("2026-07-07T00:00:00.000Z");
    expect(attachedReport.metadata).toEqual({
      source: "test",
    });
    expect(attachedReport.pullDirectionEvaluation.snapshot.bestCandidate).toEqual({
      candidateId: "candidate-extra",
      score: 100,
      decision: "recommended",
      normalizedDirection: {
        x: 0.6,
        y: 0,
        z: 0.8,
      },
    });
  });

  it("supports custom score profiles while attaching evaluation output", () => {
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

    const attachedReport = attachPullDirectionEvaluationToReport({
      report: {
        reportId: "custom-score-report",
        rankedCandidates: [
          {
            id: "candidate-custom-attachment",
            direction: { x: 10, y: 0, z: 0 },
            confidence: 1,
            sourcePriority: 0,
          },
        ],
      },
      scoreProfile,
    });

    expect(attachedReport.pullDirectionEvaluation.reportSection.status).toBe(
      "ready",
    );
    expect(
      attachedReport.pullDirectionEvaluation.reportSection.bestCandidate,
    ).toEqual({
      candidateId: "candidate-custom-attachment",
      score: 80,
      decision: "usable",
      normalizedDirection: { x: 1, y: 0, z: 0 },
    });
    expect(
      attachedReport.pullDirectionEvaluation.presentation.summary.bestCandidateLabel,
    ).toBe("candidate-custom-attachment · Usable · 80/100");
  });
});

