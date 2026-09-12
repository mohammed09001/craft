import { generateMasterMoldBody } from "./masterMoldGeometry.generator";
import type { MasterMoldBodyResult, MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";

export interface MasterMoldEvaluationOptions {
  readonly onProgress?: (completed: number, total: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * The same per-part generation pipeline `masterMoldGeneration.worker.ts`
 * runs inside a dedicated Worker, callable directly so the Worker client can
 * fall back to it in environments without Worker support (mirrors
 * `evaluateCavityGeneration`'s role for the cavity Worker/client pair).
 *
 * Article 06: bodies are generated one at a time (never uncontrolled
 * concurrency) and a failure on one target never discards an already-
 * produced sibling result.
 */
export async function evaluateMasterMoldGeneration(
  request: MasterMoldRequest,
  options: MasterMoldEvaluationOptions = {},
): Promise<MasterMoldResult> {
  const started = performance.now();
  const bodies: MasterMoldBodyResult[] = [];
  const total = request.targets.length;

  for (let index = 0; index < total; index += 1) {
    if (options.signal?.aborted) {
      throw Object.assign(new Error("Master Mold generation was cancelled."), { code: "cancelled" });
    }

    const target = request.targets[index]!;
    const body = await generateMasterMoldBody(target, request.parameters);
    bodies.push(body);
    options.onProgress?.(index + 1, total);
  }

  return {
    operationId: request.operationId,
    generationVersion: request.generationVersion,
    elapsedMs: performance.now() - started,
    bodies,
  };
}
