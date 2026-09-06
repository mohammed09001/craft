import { describe, expect, it } from "vitest";

import {
  attachPullDirectionEvaluationToReport,
  createPullDirectionEvaluationAttachment,
  type PullDirectionEvaluationAttachedReport,
  type PullDirectionEvaluationAttachment,
} from "../index";

describe("pull direction parent API attachment exports", () => {
  it("exports createPullDirectionEvaluationAttachment from pull-direction parent API", () => {
    const attachment: PullDirectionEvaluationAttachment =
      createPullDirectionEvaluationAttachment({
        report: {
          rankedCandidates: [
            {
              id: "candidate-parent-attachment",
              direction: { x: 0, y: 0, z: 18 },
              confidence: 1,
              sourcePriority: 1,
            },
          ],
        },
      });

    expect(attachment.pullDirectionEvaluation.reportSection.status).toBe("ready");
    expect(attachment.pullDirectionEvaluation.reportSection.bestCandidate).toEqual({
      candidateId: "candidate-parent-attachment",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 0, z: 1 },
    });
    expect(attachment.pullDirectionEvaluation.snapshotValidation).toEqual({
      isValid: true,
      issues: [],
    });
  });

  it("exports attachPullDirectionEvaluationToReport from pull-direction parent API", () => {
    const report = {
      reportId: "parent-api-report",
      title: "Parent API Pull Direction Report",
      rankedCandidates: [
        {
          id: "candidate-parent-api-report",
          direction: { x: 0, y: 6, z: 0 },
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
    expect(attachedReport.reportId).toBe("parent-api-report");
    expect(attachedReport.title).toBe("Parent API Pull Direction Report");
    expect(attachedReport.pullDirectionEvaluation.reportSection.status).toBe(
      "ready",
    );
    expect(
      attachedReport.pullDirectionEvaluation.reportSection.bestCandidate,
    ).toEqual({
      candidateId: "candidate-parent-api-report",
      score: 100,
      decision: "recommended",
      normalizedDirection: { x: 0, y: 1, z: 0 },
    });
  });
});

