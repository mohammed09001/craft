import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MasterCastingProcessProfile, MasterMoldProgressStage, MasterToolingSet } from "./engine/contracts";
import type { MasterMoldPlanningPreferences } from "./seed/masterMoldSeed";
import type { MasterMoldResult } from "./masterMold.contracts";

export interface MasterMoldWorkerFailure {
  readonly code: string;
  readonly message: string;
}

/**
 * Execution 06 Article 13.1/13.2: compact Worker seed payload. Geometry
 * travels as typed arrays whose buffers are TRANSFERRED (never
 * structured-cloned), and nothing from the Split Face / Cavity stores rides
 * along -- one canonical source mesh plus compact planning/profile data.
 */
export interface MasterMoldWorkerSeedPayload {
  readonly seedId: string;
  readonly sourceModelId: string;
  readonly sourceGeometryVersion: string;
  /** World-space positions; buffer transferred to the Worker. */
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: Bounds3;
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
