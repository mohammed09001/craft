import { describe, expect, it } from "vitest";
import {
  createCanonicalAxisSeedCandidateGenerator,
  createPullDirectionAnalysisEngine,
  createPullDirectionAnalysisPipeline,
  createPullDirectionCandidateValidator,
} from "./index";

describe("Pull Direction Regression Guards", () => {
  it("does not accidentally compute scores, ranks, or best direction", () => {
    const engine = createPullDirectionAnalysisEngine({
      clock: () => "2026-07-06T00:00:00.000Z",
    });

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "regression-guard-model",
        fileName: "regression-guard.stl",
      },
    });

    expect(result.status).toBe("analysis-ready");
    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.candidateRanking).toBe(true);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);

    expect(result.report.metadata["computedScores"]).toBe(false);
    expect(result.report.metadata["rankedCandidates"]).toBe(false);
    expect(result.report.metadata["selectedBestDirection"]).toBe(false);

    expect(result.report.candidates.every((candidate) => candidate.score === null)).toBe(true);
    expect(result.report.candidates.every((candidate) => candidate.rank === null)).toBe(true);
  });

  it("does not accidentally inspect mesh or face normals", () => {
    const generator = createCanonicalAxisSeedCandidateGenerator();
    const validator = createPullDirectionCandidateValidator();

    const generation = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "geometry-inspection-guard-model",
        geometry: {
          intentionallyIgnored: true,
        },
      },
    });

    const validation = validator.validate({
      candidates: generation.candidates,
    });

    expect(generation.inspectedMesh).toBe(false);
    expect(generation.inspectedFaceNormals).toBe(false);
    expect(generation.computedScores).toBe(false);
    expect(generation.selectedBestDirection).toBe(false);

    expect(validation.inspectedMesh).toBe(false);
    expect(validation.inspectedFaceNormals).toBe(false);
    expect(validation.computedScores).toBe(false);
    expect(validation.rankedCandidates).toBe(false);
    expect(validation.selectedBestDirection).toBe(false);

    expect(
      generation.candidates.every((candidate) => candidate.requiresGeometryInspection === false),
    ).toBe(true);
  });

  it("keeps pipeline stages limited to generation, normalization, validation, and reserved placeholders", () => {
    const pipeline = createPullDirectionAnalysisPipeline();

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "pipeline-stage-guard-model",
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

    expect(stages).not.toContain("inspect-mesh");
    expect(stages).not.toContain("analyze-face-normals");
    expect(stages).toContain("filter-candidates");
    expect(stages).not.toContain("score-candidates");
    expect(stages).toContain("rank-candidates");
    expect(stages).not.toContain("select-best-direction");

    expect(output.trace.steps.every((step) => step.allowsRealGeometryComputation === false)).toBe(
      true,
    );
  });

  it("keeps invalid candidates excluded from future scoring without scoring them now", () => {
    const validator = createPullDirectionCandidateValidator();
    const generator = createCanonicalAxisSeedCandidateGenerator();

    const generated = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "duplicate-guard-model",
      },
    });

    const firstCandidate = generated.candidates[0];

    if (firstCandidate === undefined) {
      throw new Error("Expected at least one seed candidate.");
    }

    const validation = validator.validate({
      candidates: [
        firstCandidate,
        {
          ...firstCandidate,
          id: "duplicate-positive-x-regression-guard",
          label: "Duplicate +X",
        },
      ],
    });

    expect(validation.validCandidates).toHaveLength(1);
    expect(validation.invalidCandidates).toHaveLength(1);
    expect(validation.invalidCandidates[0]?.excludedFromFutureScoring).toBe(true);
    expect(validation.invalidCandidates[0]?.candidate.score).toBeNull();
    expect(validation.invalidCandidates[0]?.candidate.rank).toBeNull();
    expect(validation.computedScores).toBe(false);
    expect(validation.rankedCandidates).toBe(false);
    expect(validation.selectedBestDirection).toBe(false);
  });
});




