import type { MasterToolingSet, MasterMoldProgressStageName } from "./engine/contracts";
import type { MasterMoldSeedSnapshot } from "./seed/masterMoldSeed";

export const MASTER_MOLD_SCHEMA_VERSION = 1 as const;

export const DEFAULT_MASTER_MOLD_WALL_MM = 3;
export const MIN_MASTER_MOLD_WALL_MM = 1;
export const DEFAULT_MASTER_MOLD_BOTTOM_MM = 3;
export const MIN_MASTER_MOLD_BOTTOM_MM = 1;

/** The six orthogonal seed directions (extensible; deterministic order matters for tie-breaking). */
export const MASTER_MOLD_DIRECTIONS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;
export type MasterMoldDirection = (typeof MASTER_MOLD_DIRECTIONS)[number];

export type MasterMoldStatus =
  | "unavailable"
  | "ready"
  | "generating"
  | "current"
  | "stale"
  | "blocked"
  | "error";

export interface MasterMoldParameters {
  readonly wallThicknessMm: number;
  readonly bottomThicknessMm: number;
  readonly geometryToleranceMm: number;
}

/**
 * Execution 06 Articles 02/13: one generation request carries the compact
 * Master-owned seed snapshot (imported part + neutral context) plus prior
 * tooling sets whose inputs are provably unchanged -- the engine reuses
 * those verbatim (incremental regeneration) instead of recomputing them.
 */
export interface MasterMoldRequest {
  readonly operationId: string;
  readonly generationVersion: number;
  readonly seed: MasterMoldSeedSnapshot;
  readonly priorSets: readonly MasterToolingSet[];
}

/** Store-level per-piece state (Execution 05 Article 13 state shape, re-anchored to working-mold pieces by Execution 06). */
export interface MasterToolingSetState {
  readonly moldPartId: string;
  readonly moldPartName: string;
  readonly status: "current" | "stale" | "blocked";
  /** Engine tooling-set input identity (reuse key). */
  readonly sourceSignature: string;
  /** Working-mold piece geometry version at generation time (granular staleness diffing). */
  readonly contentVersion: string;
  /** null when tooling generation failed for this piece (structured failure, not a fake set). */
  readonly set: MasterToolingSet | null;
  readonly failureMessage: string | null;
}

export interface MasterMoldResult {
  readonly operationId: string;
  readonly generationVersion: number;
  readonly elapsedMs: number;
  readonly sets: readonly MasterToolingSetState[];
  /** The Master-owned automatic Working Mold Plan (Article 14 owned state). */
  readonly plan: MasterMoldResultPlan | null;
  readonly workingMoldPieceCount: number;
  readonly warningCount: number;
  readonly budget: import("./engine/contracts").MasterMoldBudgetReport;
  readonly seedId: string;
}

/** Store-level view of the plan (keeps the heavy meshes for viewport preview). */
export type MasterMoldResultPlan = import("./planning/masterMoldPlanning.contracts").AutoWorkingMoldPlan;

/** Identifies the seed snapshot a result was built against (Article 14 staleness). */
export interface MasterMoldSeedIdentity {
  /** masterSeedStalenessIdentity(seed): geometry + profile + build volume + preferences. */
  readonly identity: string;
  readonly sourceProjectRevision: string;
}

export type MasterMoldOverallStatus = "unavailable" | "generating" | "current" | "stale" | "blocked" | "error";

/** Compact post-generation summary for the UI (Article 15). */
export interface MasterMoldSummary {
  readonly workingMoldPieceCount: number;
  readonly masterToolingPieceCount: number;
  readonly onePieceCases: number;
  readonly multiPieceCases: number;
  readonly warningCount: number;
  readonly allReleasesVerified: boolean;
}

export function overallStatusOfSets(sets: readonly MasterToolingSetState[]): MasterMoldOverallStatus {
  if (sets.length === 0) return "unavailable";
  if (sets.some((set) => set.status === "stale")) return "stale";
  return sets.some((set) => set.status === "blocked") ? "blocked" : "current";
}

export function summarizeGeneration(sets: readonly MasterToolingSetState[], workingMoldPieceCount: number, warningCount: number): MasterMoldSummary {
  const valid = sets.filter((entry) => entry.set !== null);
  const masterToolingPieceCount = valid.reduce((sum, entry) => sum + entry.set!.assembly.pieces.length, 0);
  const onePieceCases = valid.filter((entry) => entry.set!.releaseMode === "one-piece").length;
  const multiPieceCases = valid.filter((entry) => entry.set!.releaseMode === "multi-piece").length;
  const allReleasesVerified = valid.length > 0 && valid.every(
    (entry) => entry.set!.assembly.releaseSequence.length === entry.set!.assembly.pieces.length &&
      entry.set!.assembly.releaseSequence.every((step) => step.collisionVerified),
  );
  return {
    workingMoldPieceCount,
    masterToolingPieceCount,
    onePieceCases,
    multiPieceCases,
    warningCount,
    allReleasesVerified,
  };
}

/** Progress stage names re-exported for UI consumption without importing the engine bundle. */
export type { MasterMoldProgressStageName };
