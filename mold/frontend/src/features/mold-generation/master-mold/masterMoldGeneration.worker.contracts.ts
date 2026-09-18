import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MasterCastingProcessProfile, MasterMoldProgressStage, MasterToolingSet } from "./engine/contracts";
import type { MasterMoldPlanningPreferences } from "./seed/masterMoldSeed";
import type { MasterMoldResult } from "./masterMold.contracts";

export interface MasterMoldWorkerFailure {
  readonly code: string;
  readonly message: string;
}

/**
 * Execution 06 Article 13.1/13.2 + Execution 07 LOOP 02: compact Worker seed
 * payload. Geometry travels as LOCAL-space typed arrays whose buffers are
 * TRANSFERRED (never structured-cloned); the Worker applies the world
 * transform itself, so the heavy pass never runs on the UI thread. Nothing
 * from the Split Face / Cavity stores rides along.
 */
export interface MasterMoldWorkerSeedPayload {
  readonly seedId: string;
  readonly sourceModelId: string;
  readonly sourceGeometryVersion: string;
  /** Local-space positions; buffer transferred to the Worker. */
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  /** World-space bounds (cheap: derived from the 8 local-bounds corners). */
  readonly bounds: Bounds3;
  /** Column-major 4x4 part-from-local transform; applied inside the Worker. */
  readonly sourceTransform: readonly number[];
  readonly printerBuildVolume: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly processProfile: MasterCastingProcessProfile;
  readonly userPreferences: MasterMoldPlanningPreferences;
  readonly sourceProjectRevision: string;
}

export type MasterMoldWorkerRequest =
  | {
      readonly type: "generate";
      readonly requestId: string;
      readonly operationId: string;
      readonly generationVersion: number;
      readonly seed: MasterMoldWorkerSeedPayload;
      readonly priorSets: readonly MasterToolingSet[];
    }
  | { readonly type: "cancel"; readonly requestId: string };

export type MasterMoldWorkerResponse =
  | { readonly type: "progress"; readonly requestId: string; readonly stage: MasterMoldProgressStage }
  | { readonly type: "success"; readonly requestId: string; readonly result: MasterMoldResult }
  | { readonly type: "failure"; readonly requestId: string; readonly failure: MasterMoldWorkerFailure };
