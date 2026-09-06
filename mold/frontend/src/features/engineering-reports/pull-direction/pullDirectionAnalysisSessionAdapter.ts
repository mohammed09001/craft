import {
  type PullDirectionAnalysisEngine,
  type PullDirectionAnalysisFoundationReport,
  type PullDirectionAnalysisInput,
  type PullDirectionAnalysisResult,
  type PullDirectionAnalysisSource,
} from "./pullDirectionAnalysisEngine.contracts";
import { createPullDirectionAnalysisEngine } from "./pullDirectionAnalysisEngine";

export interface PullDirectionAnalysisSessionModelInput {
  readonly sessionId?: string;
  readonly modelId: string;
  readonly fileName?: string;
  readonly unit?: string;
  readonly geometry?: unknown;
  readonly source?: PullDirectionAnalysisSource;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const createPullDirectionAnalysisInputFromSession = (
  input: PullDirectionAnalysisSessionModelInput,
): PullDirectionAnalysisInput => ({
  ...(input.sessionId !== undefined ? { analysisSessionId: input.sessionId } : {}),
  source: input.source ?? "analysis-session",
  ...(input.requestedAt !== undefined ? { requestedAt: input.requestedAt } : {}),
  mode: "candidate-ranking-pipeline-report",
  ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  model: {
    modelId: input.modelId,
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.geometry !== undefined ? { geometry: input.geometry } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  },
});

export const executePullDirectionAnalysisFromSession = <
  TReport = PullDirectionAnalysisFoundationReport,
>(
  input: PullDirectionAnalysisSessionModelInput,
  engine: PullDirectionAnalysisEngine<TReport> = createPullDirectionAnalysisEngine<TReport>(),
): PullDirectionAnalysisResult<TReport> => {
  return engine.execute(createPullDirectionAnalysisInputFromSession(input));
};



