import { describe, expect, it } from "vitest";
import {
  createCanonicalAxisSeedCandidateGenerator,
  createPullDirectionAnalysisEngine,
  createPullDirectionAnalysisInputFromSession,
  createPullDirectionAnalysisPipeline,
  executePullDirectionAnalysisFromSession,
  PULL_DIRECTION_ANALYSIS_ENGINE_ID,
  PULL_DIRECTION_ANALYSIS_ENGINE_VERSION,
  type PullDirectionCandidateGenerator,
  type PullDirectionReportOutputPort,
} from "./index";

describe("Pull Direction Candidate Validation Report Output", () => {
  it("generates canonical seed candidates without geometry inspection", () => {
    const generator = createCanonicalAxisSeedCandidateGenerator();

    const result = generator.generate({
      strategy: "canonical-axis-seed",
      model: {
        modelId: "model-001",
        fileName: "sample.stl",
      },
    });

    expect(result.strategy).toBe("canonical-axis-seed");
    expect(result.candidates).toHaveLength(6);
    expect(result.inspectedMesh).toBe(false);
    expect(result.inspectedFaceNormals).toBe(false);
    expect(result.computedScores).toBe(false);
    expect(result.selectedBestDirection).toBe(false);

    expect(result.candidates.map((candidate) => candidate.label)).toEqual([
      "+X",
      "-X",
      "+Y",
      "-Y",
      "+Z",
      "-Z",
    ]);

    expect(result.candidates.every((candidate) => candidate.requiresGeometryInspection === false)).toBe(
      true,
    );
    expect(result.candidates.every((candidate) => candidate.score === null)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.rank === null)).toBe(true);
  });

  it("creates an Analysis Ready report with seed candidates only", () => {
    const engine = createPullDirectionAnalysisEngine({
      clock: () => "2026-07-06T00:00:00.000Z",
    });

    const result = engine.execute({
      source: "test",
      model: {
        modelId: "model-002",
        fileName: "sample.stl",
      },
    });

    expect(result.status).toBe("analysis-ready");
    expect(result.report.status).toBe("Analysis Ready");
    expect(result.report.success).toBe(true);
    expect(result.report.candidates).toHaveLength(6);
    expect(result.report.selectedDirection).toBeNull();

    expect(result.report.algorithm.implemented).toBe(false);
    expect(result.report.algorithm.candidateGeneration).toBe(true);
    expect(result.report.algorithm.candidateFiltering).toBe(true);
    expect(result.report.algorithm.candidateRanking).toBe(true);
    expect(result.report.algorithm.ranking).toBe(false);
    expect(result.report.algorithm.scoring).toBe(false);
    expect(result.report.algorithm.bestDirectionSelection).toBe(false);
  });

  it("executes the internal pipeline in a stable Stage 5D-C order", () => {
    const engine = createPullDirectionAnalysisEngine();
    const result = engine.execute({
      source: "test",
      model: {
        modelId: "model-003",
      },
    });

    expect(result.trace.engineId).toBe(PULL_DIRECTION_ANALYSIS_ENGINE_ID);
    expect(result.trace.engineVersion).toBe(PULL_DIRECTION_ANALYSIS_ENGINE_VERSION);

    expect(result.trace.steps.map((step) => step.stage)).toEqual([
      "initialize",
      "read-model-input",
      "generate-seed-candidates",
      "normalize-candidates",
      "validate-candidates",
      "filter-candidates",
      "rank-candidates",
      "build-report",
    ]);

    expect(
      result.trace.steps.every((step) => step.allowsRealGeometryComputation === false),
    ).toBe(true);
  });

  it("keeps candidate generation replaceable through a generator port", () => {
    const candidateGenerator: PullDirectionCandidateGenerator = {
      generate: () => ({
        strategy: "canonical-axis-seed",
        candidates: [],
        inspectedMesh: false,
        inspectedFaceNormals: false,
        computedScores: false,
        selectedBestDirection: false,
      }),
    };

    const pipeline = createPullDirectionAnalysisPipeline({
      candidateGenerator,
    });

    const output = pipeline.execute({
      source: "test",
      model: {
        modelId: "model-004",
      },
    });

    expect(output.candidateGeneration.candidates).toEqual([]);
    expect(output.candidateGeneration.inspectedMesh).toBe(false);
    expect(output.candidateGeneration.inspectedFaceNormals).toBe(false);
    expect(output.candidateValidation.validCandidates).toEqual([]);
    expect(output.candidateValidation.invalidCandidates).toEqual([]);
    expect(output.candidateValidation.inspectedMesh).toBe(false);
    expect(output.candidateValidation.inspectedFaceNormals).toBe(false);
    expect(output.candidateFiltering.includedCandidates).toEqual([]);
    expect(output.candidateFiltering.excludedCandidates).toEqual([]);
    expect(output.candidateFiltering.inspectedMesh).toBe(false);
    expect(output.candidateFiltering.inspectedFaceNormals).toBe(false);
    expect(output.candidateFiltering.computedScores).toBe(false);
    expect(output.candidateFiltering.rankedCandidates).toBe(false);
    expect(output.candidateFiltering.selectedBestDirection).toBe(false);
  });

  it("keeps PullDirectionReport output replaceable through an output port", () => {
    interface MinimalPullDirectionReport {
      readonly reportType: "PullDirectionReport";
      readonly candidateCount: number;
      readonly status: "Analysis Ready";
    }

    const reportOutputPort: PullDirectionReportOutputPort<MinimalPullDirectionReport> = {
      buildReport: ({ candidateGeneration }) => ({
        reportType: "PullDirectionReport",
        candidateCount: candidateGeneration.candidates.length,
        status: "Analysis Ready",
      }),
    };

    const engine = createPullDirectionAnalysisEngine<MinimalPullDirectionReport>({
      reportOutputPort,
    });

    const result = engine.execute({
      source: "engine-bridge",
      model: {
        modelId: "bridge-model-001",
      },
    });

    expect(result.report).toEqual({
      reportType: "PullDirectionReport",
      candidateCount: 6,
      status: "Analysis Ready",
    });
  });

  it("creates analysis input from an Analysis Session compatible payload", () => {
    const input = createPullDirectionAnalysisInputFromSession({
      sessionId: "session-001",
      modelId: "model-005",
      fileName: "part.stl",
      unit: "mm",
    });

    expect(input.analysisSessionId).toBe("session-001");
    expect(input.source).toBe("analysis-session");
    expect(input.mode).toBe("candidate-ranking-pipeline-report");
    expect(input.model.modelId).toBe("model-005");
    expect(input.model.fileName).toBe("part.stl");
    expect(input.model.unit).toBe("mm");
  });

  it("can execute from an Analysis Session adapter without UI dependency", () => {
    const result = executePullDirectionAnalysisFromSession({
      sessionId: "session-002",
      modelId: "model-006",
      fileName: "adapter.stl",
    });

    expect(result.status).toBe("analysis-ready");
    expect(result.report.status).toBe("Analysis Ready");
    expect(result.report.input.analysisSessionId).toBe("session-002");
    expect(result.report.input.modelId).toBe("model-006");
    expect(result.report.input.source).toBe("analysis-session");
    expect(result.report.candidates).toHaveLength(6);
  });
});






