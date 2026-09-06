import { describe, expect, it } from "vitest";
import {
  createPullDirectionAnalysisEngine,
  type PullDirectionReportOutputPort,
} from "./index";

describe("Pull Direction Candidate Validation Report Output", () => {
  it("includes validated and invalid candidate collections in the foundation report", () => {
    const engine = createPullDirectionAnalysisEngine({
      clock: () => "2026-07-06T00:00:00.000Z",
    });

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "report-validation-model",
        fileName: "report-validation.stl",
      },
    });

    expect(result.status).toBe("analysis-ready");
    expect(result.report.status).toBe("Analysis Ready");
    expect(result.report.candidates).toHaveLength(6);
    expect(result.report.validatedCandidates).toHaveLength(6);
    expect(result.report.invalidCandidates).toHaveLength(0);
    expect(result.report.filteredCandidates).toHaveLength(6);
    expect(result.report.includedCandidates).toHaveLength(6);
    expect(result.report.excludedCandidates).toHaveLength(0);
    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.algorithm.implemented).toBe(false);
    expect(result.report.algorithm.candidateGeneration).toBe(true);
    expect(result.report.algorithm.candidateNormalization).toBe(true);
    expect(result.report.algorithm.candidateValidation).toBe(true);
    expect(result.report.algorithm.candidateFiltering).toBe(true);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);

    expect(result.report.metadata.candidateCount).toBe(6);
    expect(result.report.metadata.validatedCandidateCount).toBe(6);
    expect(result.report.metadata.validCandidateCount).toBe(6);
    expect(result.report.metadata.invalidCandidateCount).toBe(0);
    expect(result.report.metadata.duplicateCandidateCount).toBe(0);
    expect(result.report.metadata.filteredCandidateCount).toBe(6);
    expect(result.report.metadata.includedCandidateCount).toBe(6);
    expect(result.report.metadata.excludedCandidateCount).toBe(0);
    expect(result.report.metadata.inspectedMesh).toBe(false);
    expect(result.report.metadata.inspectedFaceNormals).toBe(false);
    expect(result.report.metadata.computedScores).toBe(false);
    expect(result.report.metadata.rankedCandidates).toBe(false);
    expect(result.report.metadata.selectedBestDirection).toBe(false);
  });

  it("passes candidate validation output through replaceable report output ports", () => {
    interface MinimalReport {
      readonly reportType: "PullDirectionReport";
      readonly candidateCount: number;
      readonly validCandidateCount: number;
      readonly invalidCandidateCount: number;
      readonly status: "Analysis Ready";
    }

    const reportOutputPort: PullDirectionReportOutputPort<MinimalReport> = {
      buildReport: ({ candidateGeneration, candidateValidation }) => ({
        reportType: "PullDirectionReport",
        candidateCount: candidateGeneration.candidates.length,
        validCandidateCount: candidateValidation.validCandidates.length,
        invalidCandidateCount: candidateValidation.invalidCandidates.length,
        status: "Analysis Ready",
      }),
    };

    const engine = createPullDirectionAnalysisEngine<MinimalReport>({
      reportOutputPort,
    });

    const result = engine.execute({
      source: "engine-bridge",
      model: {
        modelId: "custom-report-output-model",
      },
    });

    expect(result.report).toEqual({
      reportType: "PullDirectionReport",
      candidateCount: 6,
      validCandidateCount: 6,
      invalidCandidateCount: 0,
      status: "Analysis Ready",
    });
  });
});


