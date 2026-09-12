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

export type MasterMoldOverallStatus = "unavailable" | "generating" | "current" | "stale" | "blocked" | "error";

/** Identifies the upstream final-mold document snapshot a Master Mold result was built against (Article 01). */
export interface MasterMoldSourceDocumentIdentity {
  readonly revision: number;
  readonly fingerprint: string;
}

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
  /** The final-mold document snapshot `bodies` was generated against, or null before the first generation (Article 01). */
  readonly sourceDocumentIdentity: MasterMoldSourceDocumentIdentity | null;
  generate(
    finalMoldBodies: readonly MasterMoldFinalBodyInput[],
    documentIdentity?: MasterMoldSourceDocumentIdentity,
  ): Promise<boolean>;
  setParameters(partial: Partial<Pick<MasterMoldParameters, "wallThicknessMm" | "bottomThicknessMm">>): void;
  reset(): void;
  /**
   * Article 01's invalidation seam: called reactively whenever the upstream
   * final-mold document changes identity (revision/fingerprint), so a stale
   * result is flagged the moment its source changes rather than only being
   * discovered on the next Generate click. A no-op before any generation, or
   * when the given identity still matches what `bodies` was built from.
   */
  markMasterMoldStale(documentIdentity: MasterMoldSourceDocumentIdentity): void;
  /** Marks only the named final-mold parts stale, leaving unaffected siblings reusable (Article 01). */
  invalidateMasterMoldParts(partIds: readonly string[]): void;
  /**
   * Article 07: a final-mold target synthesis failure (thrown before
   * `generate()` is even reached, e.g. while assembling the cutting/cavity
   * geometry Master Mold consumes) is itself a Master Mold production
   * state, not merely UI text local to one component -- callers other than
   * the toolbar action must be able to observe it via the store, the same
   * way a Worker-side failure already surfaces through `status`/`lastError`.
   */
  reportSynthesisFailure(message: string): void;
}

function overallStatusOf(bodies: readonly MasterMoldBodyResult[]): MasterMoldOverallStatus {
  if (bodies.length === 0) return "unavailable";
  if (bodies.some((body) => body.status === "stale")) return "stale";
  return bodies.some((body) => body.status === "blocked") ? "blocked" : "current";
}

/** Reused bodies must shed any prior `stale` overlay -- a fresh generate() call re-validates against the live document, so its result is truthfully current/blocked again, never left showing stale. */
function reviveIfStale(body: MasterMoldBodyResult): MasterMoldBodyResult {
  if (body.status !== "stale") return body;
  return { ...body, status: body.mesh !== null && body.bounds !== null ? "current" : "blocked" };
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
    sourceDocumentIdentity: null,

    setParameters: (partial) => {
      set((state) => ({ ...state, parameters: { ...state.parameters, ...partial } }));
    },

    reset: () => {
      cancelActiveMasterMoldGeneration("Master Mold state was reset.");
      set({
        status: "unavailable",
        parameters: get().parameters,
        // Article 09: bump generationVersion even though there is no new
        // generation -- an in-flight generate() call captured the PRIOR
        // version and only trusts its own result while
        // get().generationVersion still matches it. Cancelling the
        // underlying Worker call above makes its promise settle later
        // (typically a rejection), and without this bump that settling
        // would pass the version check and clobber this reset back to
        // "error"/stale bodies once it resolves.
        generationVersion: get().generationVersion + 1,
        bodies: [],
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
      if (state.status !== "current" && state.status !== "blocked") return;

      set((s) => ({
        ...s,
        status: "stale",
        bodies: s.bodies.map((body) => (body.status === "stale" ? body : { ...body, status: "stale" as const })),
      }));
    },

    invalidateMasterMoldParts: (partIds) => {
      const ids = new Set(partIds);
      set((s) => {
        if (s.bodies.length === 0 || ids.size === 0) return s;
        const bodies = s.bodies.map((body) =>
          ids.has(body.source.finalMoldPartId) && body.status !== "stale" ? { ...body, status: "stale" as const } : body,
        );
        return { ...s, bodies, status: overallStatusOf(bodies) };
      });
    },

    reportSynthesisFailure: (message) => {
      set((s) => ({ ...s, status: "error", lastError: message }));
    },

    generate: async (finalMoldBodies, documentIdentity) => {
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
          reused.push(reviveIfStale(existing));
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
        set({
          status: overallStatusOf(reused),
          generationVersion,
          bodies: reused,
          progress: 1,
          lastError: null,
          sourceDocumentIdentity: documentIdentity ?? before.sourceDocumentIdentity,
        });
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

        set({
          status: overallStatusOf(merged),
          generationVersion,
          bodies: merged,
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
