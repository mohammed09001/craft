import type { CavityGenerationResult } from "../cavity-generation";
import type { ReferenceMoldDefinition } from "../reference-mold-definition";
import type { DerivedRegistrationState, RegistrationSizingPolicy } from "../registration";
import type { SprueDefinition, SprueOperationDefinition, SprueSourceBody } from "../sprue-generation";
import type { CuttingPlaneRecord } from "../split-face";

export interface DerivedMoldEvaluationInput {
  readonly requestId: string;
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
  readonly cavityResult: CavityGenerationResult | null;
  readonly definition: ReferenceMoldDefinition;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
  readonly sprueDefinitions: readonly SprueOperationDefinition[];
  /**
   * Which Registration sizing policy the committed Registration stage should
   * use. Selected by the caller from authoritative committed mode/provenance
   * (e.g. `definition.segmentationLineage`), never guessed here or in the
   * Worker. Omitted for Cut by Face / Manual More Molds, which keep the
   * NORMAL default applied by buildRegistrationDependencySnapshot.
   */
  readonly registrationSizingPolicy?: RegistrationSizingPolicy;
}

export interface DerivedMoldEvaluationResult {
  readonly requestId: string;
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
  readonly sprueBodies: readonly SprueSourceBody[];
  readonly sprueDefinitions: readonly SprueOperationDefinition[];
  readonly resolvedSprues: readonly SprueDefinition[];
  readonly registration: DerivedRegistrationState;
  readonly warnings: readonly string[];
}

export type DerivedMoldWorkerRequest =
  | { readonly type: "evaluate"; readonly input: DerivedMoldEvaluationInput }
  | { readonly type: "cancel"; readonly requestId: string };

export type DerivedMoldWorkerResponse =
  | { readonly type: "progress"; readonly requestId: string; readonly stage: "sprues" | "registration"; readonly progress: number }
  | { readonly type: "success"; readonly requestId: string; readonly result: DerivedMoldEvaluationResult }
  | { readonly type: "failure"; readonly requestId: string; readonly reasonCode: string; readonly message: string };
