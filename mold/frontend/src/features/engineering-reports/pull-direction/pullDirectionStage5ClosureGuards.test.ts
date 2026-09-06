import { describe, expect, it } from "vitest";
import { createPullDirectionAnalysisEngine, createPullDirectionAnalysisPipeline } from "./index";

describe("Pull Direction Stage 5 Closure Guards", () => {
  it("keeps the Stage 5 pipeline limited to candidate preparation and ranking foundation", () => {
    const pipeline = createPullDirectionAnalysisPipeline();

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "stage-5-closure-pipeline-model",
      },
    });

    expect(output.trace.mode).toBe("candidate-ranking-pipeline-report");

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

    expect(output.trace.steps.every((step) => step.allowsRealGeometryComputation === false)).toBe(
      true,
    );

    expect(output.candidateRanking.usesRealScoring).toBe(false);
    expect(output.candidateRanking.computedScores).toBe(false);
    expect(output.candidateRanking.selectedBestDirection).toBe(false);
    expect(output.candidateRanking.inspectedMesh).toBe(false);
    expect(output.candidateRanking.inspectedFaceNormals).toBe(false);
  });

  it("keeps the Stage 5 report free from real scoring, geometry inspection, and best direction selection", () => {
    const engine = createPullDirectionAnalysisEngine();

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "stage-5-closure-report-model",
      },
    });

    expect(result.report.algorithm.candidateGeneration).toBe(true);
    expect(result.report.algorithm.candidateNormalization).toBe(true);
    expect(result.report.algorithm.candidateValidation).toBe(true);
    expect(result.report.algorithm.candidateFiltering).toBe(true);
    expect(result.report.algorithm.candidateRanking).toBe(true);

    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);
    expect(result.report.metadata.inspectedMesh).toBe(false);
    expect(result.report.metadata.inspectedFaceNormals).toBe(false);

    expect(result.report.candidates).toHaveLength(6);
    expect(result.report.validatedCandidates).toHaveLength(6);
    expect(result.report.filteredCandidates).toHaveLength(6);
    expect(result.report.includedCandidates).toHaveLength(6);
    expect(result.report.excludedCandidates).toHaveLength(0);
    expect(result.report.rankedCandidates).toHaveLength(6);
    expect(result.report.unrankedCandidates).toHaveLength(0);

    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.metadata.inspectedMesh).toBe(false);
    expect(result.report.metadata.inspectedFaceNormals).toBe(false);
    expect(result.report.metadata.computedScores).toBe(false);
    expect(result.report.metadata.usesRealScoring).toBe(false);
    expect(result.report.metadata.selectedBestDirection).toBe(false);
  });

  it("does not mutate original candidate score or rank fields during ranking foundation", () => {
    const engine = createPullDirectionAnalysisEngine();

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "stage-5-closure-no-mutation-model",
      },
    });

    expect(result.report.rankedCandidates.every((candidate) => candidate.score === null)).toBe(
      true,
    );

    expect(
      result.report.rankedCandidates.every(
        (candidate) => candidate.selectedAsBestDirection === false,
      ),
    ).toBe(true);

    expect(
      result.report.rankedCandidates.every(
        (candidate) => candidate.filteredCandidate.validatedCandidate.candidate.score === null,
      ),
    ).toBe(true);

    expect(
      result.report.rankedCandidates.every(
        (candidate) => candidate.filteredCandidate.validatedCandidate.candidate.rank === null,
      ),
    ).toBe(true);
  });
});

