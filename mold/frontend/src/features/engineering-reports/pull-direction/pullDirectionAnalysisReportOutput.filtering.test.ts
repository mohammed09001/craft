import { describe, expect, it } from "vitest";
import {
  createPullDirectionAnalysisEngine,
  type PullDirectionReportOutputPort,
} from "./index";

describe("Pull Direction Candidate Filtering Report Output", () => {
  it("includes filtered, included, and excluded candidate collections in the foundation report", () => {
    const engine = createPullDirectionAnalysisEngine({
      clock: () => "2026-07-06T00:00:00.000Z",
    });

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "filtering-report-output-model",
        fileName: "filtering-report-output.stl",
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

    expect(result.report.algorithm.implemented).toBe(false);
    expect(result.report.algorithm.candidateGeneration).toBe(true);
    expect(result.report.algorithm.candidateNormalization).toBe(true);
    expect(result.report.algorithm.candidateValidation).toBe(true);
    expect(result.report.algorithm.candidateFiltering).toBe(true);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);

    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.metadata.candidateFilteringStrategy).toBe("validation-status-filter");
    expect(result.report.metadata.filteredCandidateCount).toBe(6);
    expect(result.report.metadata.includedCandidateCount).toBe(6);
    expect(result.report.metadata.excludedCandidateCount).toBe(0);
    expect(result.report.metadata.computedScores).toBe(false);
    expect(result.report.metadata.rankedCandidates).toBe(false);
    expect(result.report.metadata.selectedBestDirection).toBe(false);
  });

  it("passes candidate filtering output through replaceable report output ports", () => {
    interface MinimalReport {
      readonly reportType: "PullDirectionReport";
      readonly candidateCount: number;
      readonly includedCandidateCount: number;
      readonly excludedCandidateCount: number;
      readonly status: "Analysis Ready";
    }

    const reportOutputPort: PullDirectionReportOutputPort<MinimalReport> = {
      buildReport: ({ candidateGeneration, candidateFiltering }) => ({
        reportType: "PullDirectionReport",
        candidateCount: candidateGeneration.candidates.length,
        includedCandidateCount: candidateFiltering.includedCandidates.length,
        excludedCandidateCount: candidateFiltering.excludedCandidates.length,
        status: "Analysis Ready",
      }),
    };

    const engine = createPullDirectionAnalysisEngine<MinimalReport>({
      reportOutputPort,
    });

    const result = engine.execute({
      source: "engine-bridge",
      model: {
        modelId: "custom-filtering-report-output-model",
      },
    });

    expect(result.report).toEqual({
      reportType: "PullDirectionReport",
      candidateCount: 6,
      includedCandidateCount: 6,
      excludedCandidateCount: 0,
      status: "Analysis Ready",
    });
  });
});
