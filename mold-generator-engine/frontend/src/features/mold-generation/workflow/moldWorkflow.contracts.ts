import type { CavityGenerationResult } from "../cavity-generation/cavityGeneration.contracts";
import type { ReferenceMoldDefinition } from "../reference-mold-definition";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import type { DerivedRegistrationState } from "../registration";
import type { SprueDefinition, SprueOperationDefinition, SprueSourceBody } from "../sprue-generation";
import type { CuttingPlaneRecord } from "../split-face";

export type MoldEvaluationPhase = "idle" | "evaluating" | "complete" | "failed" | "cancelled" | "stale";
export type MoldEvaluationStage = "base" | "cavity" | "sprues" | "registration" | "validation";

export interface MoldDocument {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly fingerprint: string;
  readonly definition: ReferenceMoldDefinition | null;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
  readonly cavityEnabled: boolean;
  readonly cavityClearanceMm: number;
  readonly sprues: readonly SprueOperationDefinition[];
  readonly registrationPolicyId: "default";
  readonly manufacturingProfile: null;
}

export interface MoldStageResults {
  readonly baseBodies: readonly MoldBodyData[];
  readonly cavityResult: CavityGenerationResult | null;
  readonly sprueBodies: readonly SprueSourceBody[];
  readonly resolvedSprues: readonly SprueDefinition[];
  readonly registration: DerivedRegistrationState;
}

export interface FinalMoldResult {
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
  readonly requestId: string;
  readonly bodies: readonly MoldBodyData[];
  readonly keyed: boolean;
  readonly stages: MoldStageResults;
  readonly warnings: readonly string[];
}

export interface MoldEvaluationState {
  readonly phase: MoldEvaluationPhase;
  readonly requestId: string | null;
  readonly sourceRevision: number | null;
  readonly sourceFingerprint: string | null;
  readonly stage: MoldEvaluationStage | null;
  readonly progress: number;
  readonly failure: { readonly reasonCode: string; readonly message: string } | null;
}

export const idleMoldEvaluation = (): MoldEvaluationState => ({
  phase: "idle", requestId: null, sourceRevision: null, sourceFingerprint: null,
  stage: null, progress: 0, failure: null,
});

export function applyBodyVisibility<TBody extends MoldBodyData>(
  bodies: readonly TBody[] | undefined,
  visibility: Readonly<Record<string, boolean>>,
): readonly TBody[] | undefined {
  return bodies?.map((body) => {
    const parentBodyId = "parentBodyId" in body && typeof body.parentBodyId === "string" ? body.parentBodyId : null;
    return { ...body, visible: visibility[body.id] ?? (parentBodyId === null ? undefined : visibility[parentBodyId]) ?? body.visible };
  });
}
