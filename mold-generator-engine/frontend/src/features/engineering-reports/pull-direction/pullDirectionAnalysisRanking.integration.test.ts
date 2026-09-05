import { describe, expect, it } from "vitest";
import { createPullDirectionAnalysisEngine, createPullDirectionAnalysisPipeline } from "./index";

describe("Pull Direction Ranking Pipeline And Report Integration", () => {
  it("runs ranking foundation after filtering inside the pipeline", () => {
    const pipeline = createPullDirectionAnalysisPipeline();

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "ranking-pipeline-integration-model",
      },
    });

    expect(output.candidateFiltering.includedCandidates).toHaveLength(6);
    expect(output.candidateRanking.rankedCandidates).toHaveLength(6);
    expect(output.candidateRanking.unrankedCandidates).toHaveLength(0);

    expect(output.candidateRanking.strategy).toBe("preserve-filtered-order");
    expect(output.candidateRanking.preservesInputOrder).toBe(true);
    expect(output.candidateRanking.usesRealScoring).toBe(false);
    expect(output.candidateRanking.computedScores).toBe(false);
    expect(output.candidateRanking.selectedBestDirection).toBe(false);

    expect(output.trace.steps.map((step) => step.stage)).toEqual([
      "initialize",
      "read-model-input",
      "generate-seed-candidates",
      "normalize-candidates",
      "validate-candidates",
      "filter-candidates",
      "rank-candidates",
      "build-report",
    ]);
  });

  it("exposes ranking foundation output in the report without best direction selection", () => {
    const engine = createPullDirectionAnalysisEngine();

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "ranking-report-integration-model",
      },
    });

    expect(result.report.algorithm.candidateRanking).toBe(true);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);

    expect(result.report.rankedCandidates).toHaveLength(6);
    expect(result.report.unrankedCandidates).toHaveLength(0);
    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.metadata.candidateRankingStrategy).toBe("preserve-filtered-order");
    expect(result.report.metadata.rankedCandidateCount).toBe(6);
    expect(result.report.metadata.unrankedCandidateCount).toBe(0);
    expect(result.report.metadata.usesRealScoring).toBe(false);
    expect(result.report.metadata.computedScores).toBe(false);
    expect(result.report.metadata.selectedBestDirection).toBe(false);
  });
});
