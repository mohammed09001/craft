import { describe, expect, it } from "vitest";
import {
  createPullDirectionAnalysisPipeline,
  type PullDirectionCandidateFilter,
} from "./index";

describe("Pull Direction Pipeline Candidate Filtering Integration", () => {
  it("runs candidate generation, validation, then filtering inside the pipeline", () => {
    const pipeline = createPullDirectionAnalysisPipeline();

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "pipeline-filtering-model",
      },
    });

    expect(output.candidateGeneration.candidates).toHaveLength(6);
    expect(output.candidateValidation.validCandidates).toHaveLength(6);
    expect(output.candidateValidation.invalidCandidates).toHaveLength(0);

    expect(output.candidateFiltering.strategy).toBe("validation-status-filter");
    expect(output.candidateFiltering.candidates).toHaveLength(6);
    expect(output.candidateFiltering.includedCandidates).toHaveLength(6);
    expect(output.candidateFiltering.excludedCandidates).toHaveLength(0);

    expect(output.candidateFiltering.inspectedMesh).toBe(false);
    expect(output.candidateFiltering.inspectedFaceNormals).toBe(false);
    expect(output.candidateFiltering.computedScores).toBe(false);
    expect(output.candidateFiltering.rankedCandidates).toBe(false);
    expect(output.candidateFiltering.selectedBestDirection).toBe(false);

    expect(output.trace.steps.map((step) => step.stage)).toContain("filter-candidates");
  });

  it("keeps candidate filtering replaceable through a filter port", () => {
    const candidateFilter: PullDirectionCandidateFilter = {
      filter: () => ({
        strategy: "validation-status-filter",
        candidates: [],
        includedCandidates: [],
        excludedCandidates: [],
        inspectedMesh: false,
        inspectedFaceNormals: false,
        computedScores: false,
        rankedCandidates: false,
        selectedBestDirection: false,
      }),
    };

    const pipeline = createPullDirectionAnalysisPipeline({
      candidateFilter,
    });

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "replaceable-filter-port-model",
      },
    });

    expect(output.candidateGeneration.candidates).toHaveLength(6);
    expect(output.candidateValidation.validCandidates).toHaveLength(6);
    expect(output.candidateFiltering.candidates).toEqual([]);
    expect(output.candidateFiltering.includedCandidates).toEqual([]);
    expect(output.candidateFiltering.excludedCandidates).toEqual([]);
  });
});

