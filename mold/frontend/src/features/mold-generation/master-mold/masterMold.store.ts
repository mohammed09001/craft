import { create } from "zustand";

import { cavityBodyGeometryVersion } from "../cavity-generation/cavityGeneration.signature";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import {
  cancelActiveMasterMoldGeneration as defaultCancelActiveMasterMoldGeneration,
  runMasterMoldGenerationInWorker as defaultRunMasterMoldGenerationInWorker,
} from "./masterMoldGeneration.workerClient";
import { buildMasterMoldSourceFingerprint, isMasterMoldBodyCurrent } from "./masterMold.fingerprint";
import {
  DEFAULT_MASTER_MOLD_BOTTOM_MM,
  DEFAULT_MASTER_MOLD_WALL_MM,
  type MasterMoldBodyResult,
  type MasterMoldParameters,
  type MasterMoldTargetInput,
} from "./masterMold.contracts";

/** One committed final-mold part, as the caller (Master Mold's UI) already has it -- no knowledge of cavity/cutting internals required here. */
export interface MasterMoldFinalBodyInput {
  readonly id: string;
  readonly name: string;
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
  readonly volumeMm3: number;
}

export type MasterMoldOverallStatus = "unavailable" | "generating" | "current" | "blocked" | "error";

export interface MasterMoldStoreDeps {
  readonly runMasterMoldGenerationInWorker: typeof defaultRunMasterMoldGenerationInWorker;
  readonly cancelActiveMasterMoldGeneration: typeof defaultCancelActiveMasterMoldGeneration;
}

const defaultDeps: MasterMoldStoreDeps = {
  runMasterMoldGenerationInWorker: defaultRunMasterMoldGenerationInWorker,
  cancelActiveMasterMoldGeneration: defaultCancelActiveMasterMoldGeneration,
};

export interface MasterMoldState {
  readonly status: MasterMoldOverallStatus;
  readonly parameters: MasterMoldParameters;
  readonly generationVersion: number;
  readonly bodies: readonly MasterMoldBodyResult[];
  readonly progress: number;
  readonly lastError: string | null;
  generate(finalMoldBodies: readonly MasterMoldFinalBodyInput[]): Promise<boolean>;
  setParameters(partial: Partial<Pick<MasterMoldParameters, "wallThicknessMm" | "bottomThicknessMm">>): void;
  reset(): void;
}

function overallStatusOf(bodies: readonly MasterMoldBodyResult[]): MasterMoldOverallStatus {
  if (bodies.length === 0) return "unavailable";
  return bodies.some((body) => body.status === "blocked") ? "blocked" : "current";
}

const initialParameters: MasterMoldParameters = {
  wallThicknessMm: DEFAULT_MASTER_MOLD_WALL_MM,
  bottomThicknessMm: DEFAULT_MASTER_MOLD_BOTTOM_MM,
  geometryToleranceMm: 1e-3,
};

/**
 * Article 06/07: independent per-part Master Mold results with targeted
 * incremental regeneration. Reuses a body whose (geometryVersion,
 * parameters) fingerprint is unchanged instead of recomputing it, and a
 * failure on one target never discards an already-valid sibling -- each
 * body carries its own status.
 */
export function createMasterMoldStoreCreator(deps: MasterMoldStoreDeps = defaultDeps) {
  const { runMasterMoldGenerationInWorker, cancelActiveMasterMoldGeneration } = deps;

  return create<MasterMoldState>((set, get) => ({
    status: "unavailable",
    parameters: initialParameters,
    generationVersion: 0,
    bodies: [],
    progress: 0,
    lastError: null,

    setParameters: (partial) => {
      set((state) => ({ ...state, parameters: { ...state.parameters, ...partial } }));
    },

    reset: () => {
      cancelActiveMasterMoldGeneration("Master Mold state was reset.");
      set({ status: "unavailable", parameters: get().parameters, generationVersion: get().generationVersion, bodies: [], progress: 0, lastError: null });
    },

    generate: async (finalMoldBodies) => {
      const before = get();
      const generationVersion = before.generationVersion + 1;
      const parameters = before.parameters;

      const existingByPartId = new Map(before.bodies.map((body) => [body.source.finalMoldPartId, body]));
      const reused: MasterMoldBodyResult[] = [];
      const targets: MasterMoldTargetInput[] = [];

      for (const input of finalMoldBodies) {
        const finalMoldGeometryVersion = cavityBodyGeometryVersion({ id: input.id, mesh: input.mesh, bounds: input.bounds });
        const fingerprint = buildMasterMoldSourceFingerprint(finalMoldGeometryVersion, parameters, null);
        const existing = existingByPartId.get(input.id);

        if (existing !== undefined && isMasterMoldBodyCurrent(existing.fingerprint, fingerprint)) {
          reused.push(existing);
          continue;
        }

        targets.push({
          source: { finalMoldPartId: input.id, finalMoldPartName: input.name, finalMoldGeometryVersion },
          mesh: input.mesh,
          bounds: input.bounds,
          volumeMm3: input.volumeMm3,
        });
      }

      if (targets.length === 0) {
        set({ status: overallStatusOf(reused), generationVersion, bodies: reused, progress: 1, lastError: null });
        return true;
      }

      set((state) => ({ ...state, status: "generating", generationVersion, progress: 0, lastError: null }));

      try {
        const result = await runMasterMoldGenerationInWorker(
          { operationId: `master-mold:${generationVersion}`, generationVersion, parameters, targets },
          { onProgress: (completed, total) => set((state) => (state.generationVersion === generationVersion ? { ...state, progress: total === 0 ? 1 : completed / total } : state)) },
        );

        if (get().generationVersion !== generationVersion) {
          // A newer generate() call superseded this one -- never overwrite it (Article 12).
          return false;
        }

        const byPartId = new Map(reused.map((body) => [body.source.finalMoldPartId, body]));
        for (const body of result.bodies) byPartId.set(body.source.finalMoldPartId, body);
        const merged = finalMoldBodies.map((input) => byPartId.get(input.id)).filter((body): body is MasterMoldBodyResult => body !== undefined);

        set({ status: overallStatusOf(merged), generationVersion, bodies: merged, progress: 1, lastError: null });
        return true;
      } catch (error) {
        if (get().generationVersion !== generationVersion) {
          return false;
        }

        set((state) => ({ ...state, status: "error", lastError: error instanceof Error ? error.message : "Master Mold generation failed." }));
        return false;
      }
    },
  }));
}

export const useMasterMoldStore = createMasterMoldStoreCreator();
