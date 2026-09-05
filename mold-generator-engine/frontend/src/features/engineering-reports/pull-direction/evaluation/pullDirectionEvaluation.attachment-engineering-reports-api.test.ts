import { describe, expect, it } from "vitest";

import {
  attachPullDirectionEvaluationToReport,
  createPullDirectionEvaluationAttachment,
  createPullDirectionEvaluationScoreProfile,
  type PullDirectionEvaluationAttachedReport,
  type PullDirectionEvaluationAttachment,
} from "../../index";

describe("engineering reports API attachment exports", () => {
  it("exports createPullDirectionEvaluationAttachment from engineering-reports API", () => {
    const attachment: PullDirectionEvaluationAttachment =
      createPullDirectionEvaluationAttachment({
        report: {
          rankedCandidates: [
            {
              id: "candidate-engineering-attachment",
              direction: { x: 7, y: 0, z: 0 },
              confidence: 1,
              sourcePriority: 1,
            },
          ],
        },
      });

    expect(attachment.pullDirectionEvaluation.reportSection.status).toBe("ready");
    expect(attachment.pullDirectionEvaluation.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-engineering-attachment",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 1, y: 0, z: 0 },
    });
    expect(
      attachment.pullDirectionEvaluation.presentation.summary.statusBadge,
    ).toEqual({
      label: "Ready",
      tone: "success",
    });
  });

  it("exports attachPullDirectionEvaluationToReport from engineering-reports API", () => {
    const report = {
      reportId: "engineering-reports-api-report",
      title: "Engineering Reports API Pull Direction Report",
      rankedCandidates: [
        {
          id: "candidate-engineering-api-report",
          direction: { x: 0, y: 0, z: 20 },
          confidence: 1,
          sourcePriority: 1,
        },
      ],
    };

    const attachedReport: PullDirectionEvaluationAttachedReport<typeof report> =
      attachPullDirectionEvaluationToReport({
        report,
      });

    expect("pullDirectionEvaluation" in report).toBe(false);
    expect(attachedReport.reportId).toBe("engineering-reports-api-report");
    expect(attachedReport.title).toBe(
      "Engineering Reports API Pull Direction Report",
    );
    expect(attachedReport.pullDirectionEvaluation.reportSection.status).toBe(
      "ready",
    );
    expect(attachedReport.pullDirectionEvaluation.snapshot.bestCandidate).toEqual({
      candidateId: "candidate-engineering-api-report",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
  });

  it("supports custom scoring profiles through the engineering-reports API attachment export", () => {
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
        reportId: "engineering-reports-custom-score-report",
        rankedCandidates: [
          {
            id: "candidate-engineering-custom-score",
            direction: { x: 0, y: 9, z: 0 },
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
      candidateId: "candidate-engineering-custom-score",
      score: 80,
      decision: "usable",
      normalizedDirection: { x: 0, y: 1, z: 0 },
    });
    expect(
      attachedReport.pullDirectionEvaluation.presentation.summary
        .bestCandidateLabel,
    ).toBe("candidate-engineering-custom-score · Usable · 80/100");
  });
});

