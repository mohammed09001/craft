import type { MasterToolingSet, MasterMoldProjectSnapshot } from "./engine/contracts";

export const MASTER_MOLD_SCHEMA_VERSION = 1 as const;

export const DEFAULT_MASTER_MOLD_WALL_MM = 3;
export const MIN_MASTER_MOLD_WALL_MM = 1;
export const DEFAULT_MASTER_MOLD_BOTTOM_MM = 3;
export const MIN_MASTER_MOLD_BOTTOM_MM = 1;

/** The six orthogonal seed directions the engine evaluates (extensible; deterministic order matters for tie-breaking). */
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
 * Execution 05 Articles 12/13: one generation request carries the entire
 * authoritative project snapshot plus the prior tooling sets whose inputs
 * are provably unchanged -- the engine reuses those verbatim (Article 13
 * incremental regeneration) instead of recomputing them.
 */
export interface MasterMoldRequest {
  readonly operationId: string;
  readonly generationVersion: number;
  readonly snapshot: MasterMoldProjectSnapshot;
  readonly priorSets: readonly MasterToolingSet[];
}

/** Store-level per-part state (Execution 05 Article 13 state shape). */
export interface MasterToolingSetState {
  readonly moldPartId: string;
  readonly moldPartName: string;
  readonly status: "current" | "stale" | "blocked";
  /** Engine cast-target input identity (Article 13 reuse key). */
  readonly sourceSignature: string;
  /** Committed mold-part geometry version at generation time (granular staleness diffing). */
  readonly contentVersion: string;
  /** null when tooling generation failed for this part (structured failure, not a fake set). */
  readonly set: MasterToolingSet | null;
  readonly failureMessage: string | null;
}

export interface MasterMoldResult {
  readonly operationId: string;
  readonly generationVersion: number;
  readonly elapsedMs: number;
  readonly sets: readonly MasterToolingSetState[];
}

/** Identifies the upstream project document snapshot a result was built against (Article 12). */
export interface MasterMoldSourceDocumentIdentity {
  readonly revision: number;
  readonly fingerprint: string;
}

export type MasterMoldOverallStatus = "unavailable" | "generating" | "current" | "stale" | "blocked" | "error";

export function overallStatusOfSets(sets: readonly MasterToolingSetState[]): MasterMoldOverallStatus {
  if (sets.length === 0) return "unavailable";
  if (sets.some((set) => set.status === "stale")) return "stale";
  return sets.some((set) => set.status === "blocked") ? "blocked" : "current";
}
