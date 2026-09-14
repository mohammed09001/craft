import { runMasterMoldEngine } from "./engine/masterMoldEngine";
import type { MasterToolingSetState } from "./masterMold.contracts";
import type { MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";

export interface MasterMoldEvaluationOptions {
  readonly onProgress?: (completed: number, total: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * The same pipeline `masterMoldGeneration.worker.ts` runs inside a dedicated
 * Worker -- the Execution 05 Master Mold Engine (Articles 05-11) -- callable
 * directly so the Worker client can fall back to it in environments without
 * Worker support.
 *
 * Engine tooling sets and structured per-part failures are mapped into the
 * store-level state shape: a multi-piece valid result is `current` (never
 * "blocked" for failing one-piece release), and `sacrificial-recommended`
 * outcomes surface as blocked-with-reason, never as a fake geometry.
 */
export async function evaluateMasterMoldGeneration(
  request: MasterMoldRequest,
  options: MasterMoldEvaluationOptions = {},
): Promise<MasterMoldResult> {
  if (options.signal?.aborted) {
    throw Object.assign(new Error("Master Mold generation was cancelled."), { code: "cancelled" });
  }

  options.onProgress?.(0, 1);
  const engineResult = await runMasterMoldEngine(request.snapshot, request.priorSets);

  if (options.signal?.aborted) {
    throw Object.assign(new Error("Master Mold generation was cancelled."), { code: "cancelled" });
  }
  options.onProgress?.(1, 1);

  const setStates: MasterToolingSetState[] = engineResult.toolingSets.map((set) => {
    // A multi-piece valid result is `current`, never "blocked" for failing
    // one-piece release (Article 13). A sacrificial recommendation IS a
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
      moldPartName: request.snapshot.committedMoldParts.find((part) => part.id === failure.moldPartId)?.name ?? failure.moldPartId,
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
  };
}
