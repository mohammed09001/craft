export type PullDirectionEvaluationDecision =
  | "recommended"
  | "usable"
  | "weak"
  | "rejected";

export type PullDirectionEvaluationReasonCode =
  | "candidate_valid"
  | "candidate_invalid"
  | "direction_vector_valid"
  | "direction_vector_missing"
  | "direction_vector_not_finite"
  | "direction_vector_zero_length"
  | "normalized_direction_created"
  | "confidence_available"
  | "confidence_missing"
  | "confidence_clamped"
  | "source_priority_applied";

export interface PullDirectionVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PullDirectionEvaluationReason {
  readonly code: PullDirectionEvaluationReasonCode;
  readonly message: string;
  readonly impact: "positive" | "neutral" | "negative";
}

export interface PullDirectionEvaluationCandidate {
  readonly id: string;
  readonly direction: PullDirectionVector3;
  readonly isValid?: boolean;
  readonly confidence?: number;
  readonly sourcePriority?: number;
}

export interface PullDirectionEvaluationInput {
  readonly candidates: readonly PullDirectionEvaluationCandidate[];
}

export interface PullDirectionCandidateEvaluation {
  readonly candidateId: string;
  readonly originalDirection: PullDirectionVector3;
  readonly normalizedDirection: PullDirectionVector3 | null;
  readonly vectorLength: number | null;
  readonly score: number;
  readonly decision: PullDirectionEvaluationDecision;
  readonly reasons: readonly PullDirectionEvaluationReason[];
}

export interface PullDirectionEvaluationResult {
  readonly evaluations: readonly PullDirectionCandidateEvaluation[];
  readonly bestCandidateId: string | null;
  readonly recommendedCandidateIds: readonly string[];
}

