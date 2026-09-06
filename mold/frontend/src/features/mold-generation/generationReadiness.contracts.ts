export const GENERATION_READINESS_STATUS_VALUES = [
  'ready',
  'ready_with_warnings',
  'blocked',
  'unavailable',
] as const;

export type GenerationReadinessStatus =
  (typeof GENERATION_READINESS_STATUS_VALUES)[number];

export const GENERATION_READINESS_LEVEL_VALUES = [
  'unavailable',
  'insufficient',
  'partial',
  'sufficient',
] as const;

export type GenerationReadinessLevel =
  (typeof GENERATION_READINESS_LEVEL_VALUES)[number];

export const GENERATION_READINESS_CONFIDENCE_VALUES = [
  'none',
  'low',
  'medium',
  'high',
] as const;

export type GenerationReadinessConfidence =
  (typeof GENERATION_READINESS_CONFIDENCE_VALUES)[number];

export const GENERATION_INPUT_STATE_VALUES = [
  'available',
  'missing',
  'incomplete',
  'blocked',
  'unknown',
] as const;

export type GenerationInputState =
  (typeof GENERATION_INPUT_STATE_VALUES)[number];

export const GENERATION_INPUT_KEYS = [
  'chapter9_generation_contract',
  'pull_direction',
  'draft_orientation',
  'undercut_indicators',
  'parting_strategies',
  'core_cavity_readiness',
] as const;

export type GenerationInputKey = (typeof GENERATION_INPUT_KEYS)[number];

export const CHAPTER9_DEPENDENCY_LEVEL_VALUES = [
  'none',
  'contract_only',
  'generation_ready',
] as const;

export type Chapter9DependencyLevel =
  (typeof CHAPTER9_DEPENDENCY_LEVEL_VALUES)[number];

export const GENERATION_READINESS_REASON_CODES = [
  'chapter9_generation_contract_missing',
  'chapter9_generation_contract_available',
  'pull_direction_missing',
  'pull_direction_available',
  'draft_orientation_missing',
  'draft_orientation_available',
  'undercut_indicators_available',
  'parting_strategies_missing',
  'parting_strategies_available',
  'selected_parting_strategy_missing',
  'selected_parting_strategy_available',
  'core_cavity_readiness_missing',
  'core_cavity_readiness_available',
  'core_cavity_handling_required',
  'warnings_present',
  'manual_review_required',
  'blocked_by_chapter9',
  'blocked_by_missing_required_inputs',
  'ready_for_initial_generation_boundary',
  'low_confidence',
] as const;

export type GenerationReadinessReasonCode =
  (typeof GENERATION_READINESS_REASON_CODES)[number];

export interface GenerationVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Chapter9PullDirectionReadiness {
  readonly status: string;
  readonly candidate_id: string | null;
  readonly direction: GenerationVector3 | null;
  readonly decisiveness: string | null;
  readonly score: number | null;
  readonly confidence: number;
  readonly warning_codes?: readonly string[];
}

export interface Chapter9DraftOrientationReadiness {
  readonly status: string;
  readonly evaluated_surface_area_ratio: number;
  readonly insufficient_draft_area_ratio: number;
  readonly near_zero_draft_area_ratio: number;
  readonly face_count_by_surface_type?: Readonly<Record<string, number>>;
  readonly face_count_by_adequacy?: Readonly<Record<string, number>>;
  readonly warning_codes?: readonly string[];
}

export interface Chapter9UndercutIndicator {
  readonly region_id: string;
  readonly source: string;
  readonly face_count: number;
  readonly area_ratio: number;
  readonly confidence: number;
  readonly severity?: string | null;
  readonly treatment_requirement?: string | null;
  readonly is_blocking?: boolean;
  readonly requires_manual_review?: boolean;
}

export interface Chapter9PartingStrategyReadiness {
  readonly candidate_id: string;
  readonly rank: number;
  readonly strategy_type: string;
  readonly status: string;
  readonly score: number;
  readonly confidence: number;
  readonly pull_direction: GenerationVector3 | null;
  readonly generation_mode: string;
  readonly core_target_ids?: readonly string[];
  readonly warning_codes?: readonly string[];
  readonly blocker_codes?: readonly string[];
  readonly requires_manual_review?: boolean;
}

export interface Chapter9CoreCavityReadiness {
  readonly handling_required: boolean;
  readonly decision_outcome: string | null;
  readonly target_ids: readonly string[];
  readonly confidence: number;
  readonly blocker_codes?: readonly string[];
  readonly warning_codes?: readonly string[];
  readonly source_references?: readonly string[];
}

export interface Chapter9GenerationContract {
  readonly pull_direction: Chapter9PullDirectionReadiness;
  readonly draft_orientation: Chapter9DraftOrientationReadiness;
  readonly undercut_indicators: readonly Chapter9UndercutIndicator[];
  readonly parting_strategies: readonly Chapter9PartingStrategyReadiness[];
  readonly core_cavity_readiness: Chapter9CoreCavityReadiness;
  readonly selected_parting_strategy_id: string | null;
  readonly confidence: number;
}

/** Backward compatibility type alias */
export type MoldGenerationReadinessContract = Chapter9GenerationContract;

export interface Chapter9GenerationFinding {
  readonly code: string;
  readonly source: string;
  readonly severity: string;
  readonly message: string;
  readonly is_blocking?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Backward compatibility type alias */
export type MoldGenerationFinding = Chapter9GenerationFinding;

export interface Chapter9GenerationReadinessReport {
  readonly status: GenerationReadinessStatus;
  readonly source?: unknown;
  readonly summary?: string;
  readonly chapter_2_status?: string;
  readonly chapter_3_status?: string;
  readonly chapter_4_status?: string;
  readonly contract: Chapter9GenerationContract;
  readonly blockers?: readonly Chapter9GenerationFinding[];
  readonly warnings?: readonly Chapter9GenerationFinding[];
  readonly schema_version?: string;
}

/** Backward compatibility type alias */
export type MoldGenerationReadinessReport = Chapter9GenerationReadinessReport;

export interface GenerationReadinessInput {
  readonly key: GenerationInputKey;
  readonly state: GenerationInputState;
  readonly label: string;
  readonly required: boolean;
  readonly reasonCodes: readonly GenerationReadinessReasonCode[];
}

export interface GenerationReadinessWarning {
  readonly code: string;
  readonly message: string;
  readonly inputKey?: GenerationInputKey;
  readonly source?: string;
}

export interface GenerationReadinessBlocker {
  readonly code: string;
  readonly message: string;
  readonly inputKey?: GenerationInputKey;
  readonly source?: string;
}

export interface GenerationPullDirectionSnapshot {
  readonly status: string;
  readonly candidateId: string | null;
  readonly direction: GenerationVector3 | null;
  readonly decisiveness: string | null;
  readonly score: number | null;
  readonly confidence: GenerationReadinessConfidence;
}

export interface GenerationDraftOrientationSnapshot {
  readonly status: string;
  readonly evaluatedSurfaceAreaRatio: number;
  readonly insufficientDraftAreaRatio: number;
  readonly nearZeroDraftAreaRatio: number;
  readonly faceCountBySurfaceType: Readonly<Record<string, number>>;
  readonly faceCountByAdequacy: Readonly<Record<string, number>>;
}

export interface GenerationUndercutIndicatorSnapshot {
  readonly regionId: string;
  readonly source: string;
  readonly faceCount: number;
  readonly areaRatio: number;
  readonly confidence: GenerationReadinessConfidence;
  readonly severity: string | null;
  readonly treatmentRequirement: string | null;
  readonly isBlocking: boolean;
  readonly requiresManualReview: boolean;
}

export interface GenerationPartingStrategySnapshot {
  readonly candidateId: string;
  readonly rank: number;
  readonly strategyType: string;
  readonly status: string;
  readonly score: number;
  readonly confidence: GenerationReadinessConfidence;
  readonly pullDirection: GenerationVector3 | null;
  readonly generationMode: string;
  readonly coreTargetIds: readonly string[];
  readonly warningCodes: readonly string[];
  readonly blockerCodes: readonly string[];
  readonly requiresManualReview: boolean;
}

export interface GenerationCoreCavityReadinessSnapshot {
  readonly handlingRequired: boolean;
  readonly decisionOutcome: string | null;
  readonly targetIds: readonly string[];
  readonly confidence: GenerationReadinessConfidence;
  readonly blockerCodes: readonly string[];
  readonly warningCodes: readonly string[];
  readonly sourceReferences: readonly string[];
}

export interface GenerationReadinessSnapshot {
  readonly status: GenerationReadinessStatus;
  readonly readiness: GenerationReadinessLevel;
  readonly canGenerate: boolean;
  readonly requiresManualReview: boolean;
  readonly confidence: GenerationReadinessConfidence;
  readonly chapter9DependencyLevel: Chapter9DependencyLevel;
  readonly availableInputs: readonly GenerationReadinessInput[];
  readonly missingInputs: readonly GenerationReadinessInput[];
  readonly warnings: readonly GenerationReadinessWarning[];
  readonly blockers: readonly GenerationReadinessBlocker[];
  readonly reasonCodes: readonly GenerationReadinessReasonCode[];
  readonly pullDirection: GenerationPullDirectionSnapshot | null;
  readonly draftOrientation: GenerationDraftOrientationSnapshot | null;
  readonly undercutIndicators: readonly GenerationUndercutIndicatorSnapshot[];
  readonly partingStrategies: readonly GenerationPartingStrategySnapshot[];
  readonly coreCavityReadiness: GenerationCoreCavityReadinessSnapshot | null;
  readonly selectedPartingStrategyId: string | null;
  readonly generatedAt: string;
}

export interface GenerationReadinessBuildOptions {
  readonly now?: string;
}

export const createUnavailableGenerationReadinessSnapshot = (
  now: string,
): GenerationReadinessSnapshot => ({
  status: 'unavailable',
  readiness: 'unavailable',
  canGenerate: false,
  requiresManualReview: false,
  confidence: 'none',
  chapter9DependencyLevel: 'none',
  availableInputs: [],
  missingInputs: [
    {
      key: 'chapter9_generation_contract',
      state: 'missing',
      label: 'Chapter 9 generation contract',
      required: true,
      reasonCodes: ['chapter9_generation_contract_missing'],
    },
  ],
  warnings: [],
  blockers: [
    {
      code: 'blocked_by_missing_required_inputs',
      message: 'Generation cannot start without the Chapter 9 generation contract.',
      inputKey: 'chapter9_generation_contract',
    },
  ],
  reasonCodes: [
    'chapter9_generation_contract_missing',
    'blocked_by_missing_required_inputs',
  ],
  pullDirection: null,
  draftOrientation: null,
  undercutIndicators: [],
  partingStrategies: [],
  coreCavityReadiness: null,
  selectedPartingStrategyId: null,
  generatedAt: now,
});
