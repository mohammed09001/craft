import { describe, expect, it } from "vitest";
import { createPullDirectionAnalysisPipeline } from "./index";

describe("Pull Direction Pipeline Candidate Validation Integration", () => {
  it("runs candidate generation then candidate validation inside the pipeline", () => {
    const pipeline = createPullDirectionAnalysisPipeline();

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "pipeline-validation-model",
      },
    });

    expect(output.candidateGeneration.candidates).toHaveLength(6);
    expect(output.candidateValidation.candidates).toHaveLength(6);
    expect(output.candidateValidation.validCandidates).toHaveLength(6);
    expect(output.candidateValidation.invalidCandidates).toHaveLength(0);

    expect(output.candidateValidation.normalized).toBe(true);
    expect(output.candidateValidation.inspectedMesh).toBe(false);
    expect(output.candidateValidation.inspectedFaceNormals).toBe(false);
    expect(output.candidateValidation.computedScores).toBe(false);
    expect(output.candidateValidation.rankedCandidates).toBe(false);
    expect(output.candidateValidation.selectedBestDirection).toBe(false);

    expect(output.trace.steps.map((step) => step.stage)).toContain("normalize-candidates");
    expect(output.trace.steps.map((step) => step.stage)).toContain("validate-candidates");
  });
});
