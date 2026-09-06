import { describe, expect, it } from "vitest";
import {
  createPullDirectionAnalysisEngine,
  createPullDirectionAnalysisPipeline,
} from "./index";

describe("Pull Direction Filtering Regression Guards", () => {
  it("keeps filtering output unscored, unranked, and without best direction selection", () => {
    const engine = createPullDirectionAnalysisEngine();

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "filtering-regression-guard-model",
      },
    });

    expect(result.report.algorithm.candidateFiltering).toBe(true);
    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.candidateRanking).toBe(true);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);

    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.metadata.computedScores).toBe(false);
    expect(result.report.metadata.rankedCandidates).toBe(false);
    expect(result.report.metadata.selectedBestDirection).toBe(false);

    expect(
      result.report.filteredCandidates.every(
        (candidate) => candidate.validatedCandidate.candidate.score === null,
      ),
    ).toBe(true);

    expect(
      result.report.filteredCandidates.every(
        (candidate) => candidate.validatedCandidate.candidate.rank === null,
      ),
    ).toBe(true);
  });
});

describe("Pull Direction Filtering Geometry Inspection Guard", () => {
  it("does not inspect mesh, face normals, or geometry payload during filtering", () => {
    const engine = createPullDirectionAnalysisEngine();

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "filtering-geometry-inspection-guard-model",
        geometry: {
          fakeMesh: {
            faces: [1, 2, 3],
            normals: [0, 0, 1],
          },
          shouldRemainIgnored: true,
        },
      },
    });

    expect(result.report.metadata.inspectedMesh).toBe(false);
    expect(result.report.metadata.inspectedFaceNormals).toBe(false);
    expect(result.report.metadata.computedScores).toBe(false);
    expect(result.report.metadata.rankedCandidates).toBe(false);
    expect(result.report.metadata.selectedBestDirection).toBe(false);

    expect(
      result.report.filteredCandidates.every(
        (candidate) =>
          candidate.validatedCandidate.candidate.requiresGeometryInspection === false,
      ),
    ).toBe(true);
  });
});

describe("Pull Direction Filtering Pipeline Stage Guard", () => {
  it("keeps filtering pipeline order before ranking and without scoring or best direction selection", () => {
    const pipeline = createPullDirectionAnalysisPipeline();

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "filtering-pipeline-stage-guard-model",
      },
    });

    const stages = output.trace.steps.map((step) => step.stage);

    expect(stages).toEqual([
      "initialize",
      "read-model-input",
      "generate-seed-candidates",
      "normalize-candidates",
      "validate-candidates",
      "filter-candidates",
      "rank-candidates",
      "build-report",
    ]);

    expect(stages).not.toContain("score-candidates");
    expect(stages).toContain("rank-candidates");
    expect(stages).not.toContain("select-best-direction");

    expect(output.candidateFiltering.computedScores).toBe(false);
    expect(output.candidateFiltering.rankedCandidates).toBe(false);
    expect(output.candidateFiltering.selectedBestDirection).toBe(false);

    expect(output.trace.steps.every((step) => step.allowsRealGeometryComputation === false)).toBe(
      true,
    );
  });
});



