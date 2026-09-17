import { runMasterMoldEngine } from "./engine/masterMoldEngine";
import type { MasterMoldSeedSnapshot } from "./seed/masterMoldSeed";
import type { MasterToolingSetState } from "./masterMold.contracts";
import type { MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";

export interface MasterMoldEvaluationOptions {
  readonly onStage?: (stage: import("./engine/contracts").MasterMoldProgressStage) => void;
  readonly signal?: AbortSignal;
}

/**
 * The same pipeline `masterMoldGeneration.worker.ts` runs inside a dedicated
 * Worker -- the Execution 06 autonomous Master Mold Engine -- callable
 * directly so the Worker client can fall back to it in environments without
 * Worker support.
 *
 * Engine tooling sets and structured per-piece failures are mapped into the
 * store-level state shape: a valid multi-piece result is `current` (never
 * "blocked" for failing one-piece release), and `sacrificial-recommended`
 * outcomes surface as blocked-with-reason, never as fake geometry.
 */
export async function evaluateMasterMoldGeneration(
  request: MasterMoldRequest,
  options: MasterMoldEvaluationOptions = {},
): Promise<MasterMoldResult> {
  if (options.signal?.aborted) {
    throw cancelledError();
  }

  const engineResult = await runMasterMoldEngine(request.seed, request.priorSets, {
    onStage: (stage) => options.onStage?.(stage),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (options.signal?.aborted) {
    throw cancelledError();
  }

  const workingMoldPieceCount = engineResult.plan?.moldPieces.length ?? 0;
  const warningCount = engineResult.plan?.warnings.length ?? 0;
  const setStates: MasterToolingSetState[] = engineResult.toolingSets.map((set) => {
    // A multi-piece valid result is `current`, never "blocked" for failing
    // one-piece release (Article 09). A sacrificial recommendation IS a
    // product-level "no reusable tooling" answer: blocked-with-reason.
    const sacrificial = set.releaseMode === "sacrificial-recommended";
    return {
      moldPartId: set.moldPartId,
      moldPartName: set.moldPartName,
      status: sacrificial ? "blocked" as const : "current" as const,
      sourceSignature: set.sourceSignature,
      contentVersion: set.castTargetVersion,
      set,
      failureMessage: sacrificial ? set.warnings.find((warning) => warning.includes("reusable_plan_not_found")) ?? set.warnings[0] ?? "no reusable tooling plan." : null,
    };
  });

  for (const failure of engineResult.failures) {
    if (setStates.some((existing) => existing.moldPartId === failure.moldPartId)) continue;
    setStates.push({
      moldPartId: failure.moldPartId,
      moldPartName: failure.moldPartId,
      status: "blocked",
      sourceSignature: "",
      contentVersion: "",
      set: null,
      failureMessage: failure.message,
    });
  }

  return {
    operationId: request.operationId,
    generationVersion: request.generationVersion,
    elapsedMs: engineResult.elapsedMs,
    sets: setStates,
    plan: engineResult.plan,
    workingMoldPieceCount,
    warningCount,
    budget: engineResult.budget,
    seedId: request.seed.seedId,
  };
}

function cancelledError(): Error {
  return Object.assign(new Error("Master Mold generation was cancelled."), { code: "cancelled" });
}

export type { MasterMoldSeedSnapshot };
