import { create } from "zustand";

import {
  cancelActiveMasterMoldGeneration as defaultCancelActiveMasterMoldGeneration,
  runMasterMoldGenerationInWorker as defaultRunMasterMoldGenerationInWorker,
} from "./masterMoldGeneration.workerClient";
import { DEFAULT_MASTER_MOLD_BOTTOM_MM, DEFAULT_MASTER_MOLD_WALL_MM } from "./masterMold.contracts";
import type {
  MasterMoldOverallStatus,
  MasterMoldParameters,
  MasterMoldRequest,
  MasterMoldResult,
  MasterMoldSeedIdentity,
  MasterMoldSummary,
  MasterToolingSetState,
} from "./masterMold.contracts";
import type { MasterMoldResultPlan } from "./masterMold.contracts";
import { masterMoldPieceKey, overallStatusOfSets, summarizeGeneration } from "./masterMold.contracts";
import type { MasterMoldProgressStage } from "./engine/contracts";
import type { MasterMoldSeedSnapshot } from "./seed/masterMoldSeed";
import { masterSeedStalenessIdentity } from "./seed/masterMoldSeed";

export interface MasterMoldStoreDeps {
  readonly runMasterMoldGenerationInWorker: typeof defaultRunMasterMoldGenerationInWorker;
  readonly cancelActiveMasterMoldGeneration: typeof defaultCancelActiveMasterMoldGeneration;
}

const defaultDeps: MasterMoldStoreDeps = {
  runMasterMoldGenerationInWorker: defaultRunMasterMoldGenerationInWorker,
  cancelActiveMasterMoldGeneration: defaultCancelActiveMasterMoldGeneration,
};

export interface MasterMoldGenerateRequest {
  readonly seed: MasterMoldSeedSnapshot;
  /**
   * Execution 07 LOOP 09: reads the LIVE staleness identity at the moment of
   * commit. The Action component skips live staleness propagation while
   * `status === "generating"`, so the commit must be paired with this check:
   * a source/transform/build-volume change during a generation cannot
   * present obsolete geometry as current -- the verified result commits
   * flagged `stale` instead.
   */
  readonly liveIdentity?: () => string | null;
}

export interface MasterMoldState {
  readonly status: MasterMoldOverallStatus;
  readonly parameters: MasterMoldParameters;
  readonly generationVersion: number;
  readonly sets: readonly MasterToolingSetState[];
  /** Master-owned automatic Working Mold Plan (Article 14 owned state). */
  readonly plan: MasterMoldResultPlan | null;
  /** Named-stage progress of the in-flight generation (Article 13.5); null while idle. */
  readonly progressStage: MasterMoldProgressStage | null;
  /** Post-generation summary for the UI (Article 15). */
  readonly summary: MasterMoldSummary | null;
  /** Piece visibility presentation state (Article 15): defaults to visible. */
  /** Piece visibility presentation state (Article 15): defaults to visible. Keys are the composite (set, piece) identity -- engine piece ids are set-local (Execution 07 LOOP 10). */
  readonly pieceVisibility: Readonly<Record<string, boolean>>;
  readonly lastError: string | null;
  /** The seed identity `sets` was generated against, or null before the first generation (Article 14). */
  readonly seedIdentity: MasterMoldSeedIdentity | null;
  generate(request: MasterMoldGenerateRequest): Promise<boolean>;
  setParameters(partial: Partial<Pick<MasterMoldParameters, "wallThicknessMm" | "bottomThicknessMm">>): void;
  reset(): void;
  /**
   * Article 14's invalidation seam: called reactively whenever the live seed
   * identity changes (source geometry, profile, build volume, preferences),
   * so a stale result is flagged the moment its inputs change rather than
   * only being discovered on the next Generate click. Create Cavity state
   * and Split Face definitions are deliberately NOT inputs.
   */
  markMasterMoldStale(seedIdentity: MasterMoldSeedIdentity): void;
  /** A seed-assembly or worker-side failure surfaces through status/lastError like any other production state. */
  reportGenerationFailure(message: string): void;
  /** Toggles visibility for the composite (set, piece) key (Execution 07 LOOP 10). */
  togglePieceVisibility(pieceId: string): void;
  /** Isolates one Master Tooling Set: its pieces visible, everything else hidden (Article 15). */
  isolateToolingSet(moldPartId: string): void;
  showAllPieces(): void;
}

/** Reused sets must shed any prior `stale` overlay -- a fresh generate() re-validates against the live seed inputs, so its result is truthfully current/blocked again. */
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
 * Execution 06 Article 14: the Master Mold store owns the autonomous
 * pipeline's lifecycle. Its staleness inputs are Master-specific (seed
 * identity); it never reads Split Face or Create Cavity state.
 */
export function createMasterMoldStoreCreator(deps: MasterMoldStoreDeps = defaultDeps) {
  const { runMasterMoldGenerationInWorker, cancelActiveMasterMoldGeneration } = deps;

  return create<MasterMoldState>((set, get) => ({
    status: "unavailable",
    parameters: initialParameters,
    generationVersion: 0,
    sets: [],
    plan: null,
    progressStage: null,
    summary: null,
    pieceVisibility: {},
    lastError: null,
    seedIdentity: null,

    setParameters: (partial) => {
      set((state) => ({ ...state, parameters: { ...state.parameters, ...partial } }));
    },

    reset: () => {
      cancelActiveMasterMoldGeneration("Master Mold state was reset.");
      set({
        status: "unavailable",
        parameters: get().parameters,
        // Bump generationVersion even though there is no new generation --
        // an in-flight generate() captured the PRIOR version and only
        // trusts its own result while get().generationVersion still matches.
        generationVersion: get().generationVersion + 1,
        sets: [],
        plan: null,
        progressStage: null,
        summary: null,
        pieceVisibility: {},
        lastError: null,
        seedIdentity: null,
      });
    },

    markMasterMoldStale: (seedIdentity) => {
      const state = get();
      if (state.seedIdentity === null) return;
      if (state.seedIdentity.identity === seedIdentity.identity) return;
      // Already fully flagged stale: a further identity change adds nothing
      // (nothing current remains to demote), so keep the version stable.
      if (state.status === "stale" && state.sets.every((entry) => entry.status === "stale")) return;

      set((s) => ({
        ...s,
        generationVersion: s.generationVersion + 1,
        status: "stale",
        sets: s.sets.map((entry) => (entry.status === "stale" ? entry : { ...entry, status: "stale" as const })),
      }));
    },

    reportGenerationFailure: (message) => {
      set((s) => ({ ...s, status: "error", lastError: message, progressStage: null }));
    },

    togglePieceVisibility: (pieceId) => {
      set((s) => ({
        ...s,
        pieceVisibility: { ...s.pieceVisibility, [pieceId]: s.pieceVisibility[pieceId] === false },
      }));
    },

    isolateToolingSet: (moldPartId) => {
      set((s) => {
        // Engine piece ids are set-local: visibility keys the composite
        // (set, piece) identity so isolating one set never touches another
        // set's same-named panel (Execution 07 LOOP 10).
        const visibility: Record<string, boolean> = {};
        for (const entry of s.sets) {
          for (const piece of entry.set?.assembly.pieces ?? []) {
            visibility[masterMoldPieceKey(entry.moldPartId, piece.pieceId)] = entry.moldPartId === moldPartId;
          }
        }
        return { ...s, pieceVisibility: visibility };
      });
    },

    showAllPieces: () => {
      set((s) => ({ ...s, pieceVisibility: {} }));
    },

    generate: async (request) => {
      const before = get();
      const generationVersion = before.generationVersion + 1;
      const seed = request.seed;
      const identity: MasterMoldSeedIdentity = {
        identity: masterSeedStalenessIdentity(seed),
        sourceProjectRevision: seed.sourceProjectRevision,
      };
      const priorEntries = before.sets.filter((entry) => entry.set !== null);

      // Full-reuse fast path: the seed identity is provably unchanged, so
      // the deterministic pipeline would reproduce the same result.
      if (
        before.seedIdentity !== null &&
        before.seedIdentity.identity === identity.identity &&
        before.sets.length > 0
      ) {
        const liveIdentityAtCommit = request.liveIdentity?.() ?? null;
        const supersededByLiveInputs = liveIdentityAtCommit !== null && liveIdentityAtCommit !== identity.identity;
        const reused = before.sets.map(reviveEntry);
        set({
          status: supersededByLiveInputs ? "stale" : overallStatusOfSets(reused),
          generationVersion,
          sets: supersededByLiveInputs ? reused.map((entry) => ({ ...entry, status: "stale" as const })) : reused,
          progressStage: null,
          lastError: null,
          seedIdentity: identity,
        });
        return true;
      }

      set((state) => ({ ...state, status: "generating", generationVersion, progressStage: null, lastError: null }));

      try {
        const priorSets = priorEntries.map((entry) => entry.set!) as MasterMoldRequest["priorSets"];
        const workerRequest: MasterMoldRequest = {
          operationId: `master-mold:${generationVersion}`,
          generationVersion,
          seed,
          priorSets,
        };
        const result: MasterMoldResult = await runMasterMoldGenerationInWorker(workerRequest, {
          onStage: (stage) => set((state) => (state.generationVersion === generationVersion ? { ...state, progressStage: stage } : state)),
        });

        if (get().generationVersion !== generationVersion) {
          // A newer generate() call superseded this one -- never overwrite it.
          return false;
        }

        // Merge with prior state where the produced content is unchanged, so
        // untouched pieces keep their object identity.
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

        // Execution 07 LOOP 09: guaranteed identity check before commit. The
        // Action skips staleness propagation while generating, so THIS is the
        // pairing: if the live identity moved mid-flight, the verified
        // geometry still commits (final emitted geometry = verified
        // geometry) but flagged stale -- it can never present as current.
        const liveIdentityAtCommit = request.liveIdentity?.() ?? null;
        const supersededByLiveInputs = liveIdentityAtCommit !== null && liveIdentityAtCommit !== identity.identity;
        const committedSets = supersededByLiveInputs ? sets.map((entry) => ({ ...entry, status: "stale" as const })) : sets;

        set({
          status: supersededByLiveInputs ? "stale" : overallStatusOfSets(sets),
          generationVersion,
          sets: committedSets,
          plan: result.plan,
          progressStage: null,
          summary: summarizeGeneration(sets, result.workingMoldPieceCount, result.warningCount),
          lastError: null,
          seedIdentity: identity,
        });
        return true;
      } catch (error) {
        if (get().generationVersion !== generationVersion) {
          return false;
        }

        set((state) => ({
          ...state,
          status: "error",
          lastError: error instanceof Error ? error.message : "Master Mold generation failed.",
          progressStage: null,
        }));
        return false;
      }
    },
  }));
}

export const useMasterMoldStore = createMasterMoldStoreCreator();
