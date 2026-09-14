import { create } from "zustand";

import {
  cancelActiveMasterMoldGeneration as defaultCancelActiveMasterMoldGeneration,
  runMasterMoldGenerationInWorker as defaultRunMasterMoldGenerationInWorker,
} from "./masterMoldGeneration.workerClient";
import { DEFAULT_MASTER_MOLD_BOTTOM_MM, DEFAULT_MASTER_MOLD_WALL_MM } from "./masterMold.contracts";
import type { MasterMoldOverallStatus, MasterMoldParameters, MasterMoldRequest, MasterMoldSourceDocumentIdentity, MasterToolingSetState } from "./masterMold.contracts";
import { overallStatusOfSets } from "./masterMold.contracts";
import type { MasterMoldProjectSnapshot, MasterToolingSet } from "./engine/contracts";
import { castTargetInputVersion } from "./engine/castTargetIdentity";

export interface MasterMoldStoreDeps {
  readonly runMasterMoldGenerationInWorker: typeof defaultRunMasterMoldGenerationInWorker;
  readonly cancelActiveMasterMoldGeneration: typeof defaultCancelActiveMasterMoldGeneration;
}

const defaultDeps: MasterMoldStoreDeps = {
  runMasterMoldGenerationInWorker: defaultRunMasterMoldGenerationInWorker,
  cancelActiveMasterMoldGeneration: defaultCancelActiveMasterMoldGeneration,
};

export interface MasterMoldGenerateRequest {
  readonly snapshot: MasterMoldProjectSnapshot;
}

export interface MasterMoldState {
  readonly status: MasterMoldOverallStatus;
  readonly parameters: MasterMoldParameters;
  readonly generationVersion: number;
  readonly sets: readonly MasterToolingSetState[];
  readonly progress: number;
  readonly lastError: string | null;
  /** The project document snapshot `sets` was generated against, or null before the first generation (Article 12). */
  readonly sourceDocumentIdentity: MasterMoldSourceDocumentIdentity | null;
  generate(request: MasterMoldGenerateRequest, documentIdentity?: MasterMoldSourceDocumentIdentity): Promise<boolean>;
  setParameters(partial: Partial<Pick<MasterMoldParameters, "wallThicknessMm" | "bottomThicknessMm">>): void;
  reset(): void;
  /**
   * Article 12's invalidation seam: called reactively whenever the upstream
   * project document changes identity, so a stale result is flagged the
   * moment its source changes rather than only being discovered on the next
   * Generate click. A no-op before any generation, or when the given
   * identity still matches what `sets` was built from.
   */
  markMasterMoldStale(documentIdentity: MasterMoldSourceDocumentIdentity): void;
  /** Marks only the named mold parts stale, leaving unaffected siblings reusable (Article 13). */
  invalidateMasterMoldParts(partIds: readonly string[]): void;
  /** A snapshot-assembly or worker-side failure surfaces through status/lastError like any other production state. */
  reportGenerationFailure(message: string): void;
}

/** Reused sets must shed any prior `stale` overlay -- a fresh generate() re-validates against the live snapshot inputs, so its result is truthfully current/blocked again. */
function reviveEntry(entry: MasterToolingSetState): MasterToolingSetState {
  if (entry.status !== "stale") return entry;
  return { ...entry, status: entry.set !== null ? "current" : "blocked" };
}

const initialParameters: MasterMoldParameters = {
  wallThicknessMm: DEFAULT_MASTER_MOLD_WALL_MM,
  bottomThicknessMm: DEFAULT_MASTER_MOLD_BOTTOM_MM,
  geometryToleranceMm: 1e-3,
};

/**
 * Execution 05 Articles 12/13: the Master Mold store owns one Master tooling
 * set per committed mold part. Regeneration is incremental -- a part whose
 * cast-target input signature is unchanged is reused, never recomputed --
 * and a failure on one part never discards a valid sibling.
 */
export function createMasterMoldStoreCreator(deps: MasterMoldStoreDeps = defaultDeps) {
  const { runMasterMoldGenerationInWorker, cancelActiveMasterMoldGeneration } = deps;

  return create<MasterMoldState>((set, get) => ({
    status: "unavailable",
    parameters: initialParameters,
    generationVersion: 0,
    sets: [],
    progress: 0,
    lastError: null,
    sourceDocumentIdentity: null,

    setParameters: (partial) => {
      set((state) => ({ ...state, parameters: { ...state.parameters, ...partial } }));
    },

    reset: () => {
      cancelActiveMasterMoldGeneration("Master Mold state was reset.");
      set({
        status: "unavailable",
        parameters: get().parameters,
        // Article 12: bump generationVersion even though there is no new
        // generation -- an in-flight generate() call captured the PRIOR
        // version and only trusts its own result while
        // get().generationVersion still matches it.
        generationVersion: get().generationVersion + 1,
        sets: [],
        progress: 0,
        lastError: null,
        sourceDocumentIdentity: null,
      });
    },

    markMasterMoldStale: (documentIdentity) => {
      const state = get();
      if (state.sourceDocumentIdentity === null) return;
      if (
        state.sourceDocumentIdentity.revision === documentIdentity.revision &&
        state.sourceDocumentIdentity.fingerprint === documentIdentity.fingerprint
      ) {
        return;
      }

      set((s) => ({
        ...s,
        // Same generationVersion bump rationale as reset(): an in-flight
        // generate() must never overwrite this stale marking once it settles.
        generationVersion: s.generationVersion + 1,
        status: "stale",
        sets: s.sets.map((entry) => (entry.status === "stale" ? entry : { ...entry, status: "stale" as const })),
      }));
    },

    invalidateMasterMoldParts: (partIds) => {
      const ids = new Set(partIds);
      set((s) => {
        if (s.sets.length === 0 || ids.size === 0) return s;
        const sets = s.sets.map((entry) =>
          ids.has(entry.moldPartId) && entry.status === "current" ? { ...entry, status: "stale" as const } : entry,
        );
        return { ...s, sets, status: overallStatusOfSets(sets), generationVersion: s.generationVersion + 1 };
      });
    },

    reportGenerationFailure: (message) => {
      set((s) => ({ ...s, status: "error", lastError: message }));
    },

    generate: async (request, documentIdentity) => {
      const before = get();
      const generationVersion = before.generationVersion + 1;
      const snapshot = request.snapshot;
      const priorEntries = before.sets.filter((entry) => entry.set !== null);

      // Article 13 full-reuse fast path: every committed part has a set
      // whose cast-target input signature is provably unchanged -- revive in
      // place without touching the Worker at all.
      const allReusable =
        snapshot.committedMoldParts.length > 0 &&
        snapshot.committedMoldParts.length === priorEntries.length &&
        snapshot.committedMoldParts.every((part) => {
          const entry = priorEntries.find((candidate) => candidate.moldPartId === part.id);
          return entry !== undefined && entry.sourceSignature === castTargetInputVersion(snapshot, part);
        });

      if (allReusable) {
        set({
          status: overallStatusOfSets(priorEntries.map(reviveEntry)),
          generationVersion,
          sets: priorEntries.map(reviveEntry),
          progress: 1,
          lastError: null,
          sourceDocumentIdentity: documentIdentity ?? before.sourceDocumentIdentity,
        });
        return true;
      }

      set((state) => ({ ...state, status: "generating", generationVersion, progress: 0, lastError: null }));

      try {
        const priorSets = priorEntries.map((entry) => entry.set!) as MasterToolingSet[];
        const workerRequest: MasterMoldRequest = {
          operationId: `master-mold:${generationVersion}`,
          generationVersion,
          snapshot,
          priorSets,
        };
        const result = await runMasterMoldGenerationInWorker(
          workerRequest,
          { onProgress: (completed, total) => set((state) => (state.generationVersion === generationVersion ? { ...state, progress: total === 0 ? 1 : completed / total } : state)) },
        );

        if (get().generationVersion !== generationVersion) {
          // A newer generate() call superseded this one -- never overwrite it (Article 12).
          return false;
        }

        // Merge with prior state where both the source signature and the
        // produced content are unchanged, so untouched siblings keep their
        // object identity (and their non-stale status where truthful).
        const sets = result.sets.map((entry) => {
          const prior = before.sets.find((candidate) => candidate.moldPartId === entry.moldPartId);
          if (
            prior !== undefined &&
            prior.status === "current" &&
            prior.sourceSignature === entry.sourceSignature &&
            prior.contentVersion === entry.contentVersion &&
            prior.set !== null &&
            entry.set !== null &&
            prior.set.fingerprint === entry.set.fingerprint
          ) {
            return reviveEntry(prior);
          }
          return reviveEntry(entry);
        });

        set({
          status: overallStatusOfSets(sets),
          generationVersion,
          sets,
          progress: 1,
          lastError: null,
          sourceDocumentIdentity: documentIdentity ?? before.sourceDocumentIdentity,
        });
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
