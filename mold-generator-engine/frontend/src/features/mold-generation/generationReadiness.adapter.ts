import {
  createUnavailableGenerationReadinessSnapshot,
  type Chapter9CoreCavityReadiness,
  type Chapter9DraftOrientationReadiness,
  type Chapter9GenerationContract,
  type Chapter9GenerationFinding,
  type Chapter9GenerationReadinessReport,
  type Chapter9PartingStrategyReadiness,
  type Chapter9PullDirectionReadiness,
  type Chapter9UndercutIndicator,
  type GenerationCoreCavityReadinessSnapshot,
  type GenerationDraftOrientationSnapshot,
  type GenerationInputKey,
  type GenerationInputState,
  type GenerationPartingStrategySnapshot,
  type GenerationPullDirectionSnapshot,
  type GenerationReadinessBlocker,
  type GenerationReadinessBuildOptions,
  type GenerationReadinessConfidence,
  type GenerationReadinessInput,
  type GenerationReadinessLevel,
  type GenerationReadinessReasonCode,
  type GenerationReadinessSnapshot,
  type GenerationReadinessStatus,
  type GenerationReadinessWarning,
  type GenerationUndercutIndicatorSnapshot,
  type GenerationVector3,
} from './generationReadiness.contracts';

type UnknownRecord = Record<string, unknown>;

export type GenerationReadinessAdapterInput =
  | Chapter9GenerationReadinessReport
  | Chapter9GenerationContract;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => isString(item));

const isVector = (value: unknown): value is GenerationVector3 =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.z);

const isFindingArray = (
  value: unknown,
): value is readonly Chapter9GenerationFinding[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) &&
      isString(item.code) &&
      isString(item.source) &&
      isString(item.severity) &&
      isString(item.message),
  );

const isPullDirectionReadiness = (
  value: unknown,
): value is Chapter9PullDirectionReadiness =>
  isRecord(value) &&
  isString(value.status) &&
  (value.candidate_id === null || isString(value.candidate_id)) &&
  (value.direction === null || isVector(value.direction)) &&
  (value.decisiveness === null || isString(value.decisiveness)) &&
  (value.score === null || isFiniteNumber(value.score)) &&
  isFiniteNumber(value.confidence);

const isDraftOrientationReadiness = (
  value: unknown,
): value is Chapter9DraftOrientationReadiness =>
  isRecord(value) &&
  isString(value.status) &&
  isFiniteNumber(value.evaluated_surface_area_ratio) &&
  isFiniteNumber(value.insufficient_draft_area_ratio) &&
  isFiniteNumber(value.near_zero_draft_area_ratio);

const isUndercutIndicator = (
  value: unknown,
): value is Chapter9UndercutIndicator =>
  isRecord(value) &&
  isString(value.region_id) &&
  isString(value.source) &&
  isFiniteNumber(value.face_count) &&
  isFiniteNumber(value.area_ratio) &&
  isFiniteNumber(value.confidence);

const isPartingStrategyReadiness = (
  value: unknown,
): value is Chapter9PartingStrategyReadiness =>
  isRecord(value) &&
  isString(value.candidate_id) &&
  isFiniteNumber(value.rank) &&
  isString(value.strategy_type) &&
  isString(value.status) &&
  isFiniteNumber(value.score) &&
  isFiniteNumber(value.confidence) &&
  (value.pull_direction === null || isVector(value.pull_direction)) &&
  isString(value.generation_mode);

const isCoreCavityReadiness = (
  value: unknown,
): value is Chapter9CoreCavityReadiness =>
  isRecord(value) &&
  typeof value.handling_required === 'boolean' &&
  (value.decision_outcome === null || isString(value.decision_outcome)) &&
  isStringArray(value.target_ids) &&
  isFiniteNumber(value.confidence);

const isChapter9GenerationContract = (
  value: unknown,
): value is Chapter9GenerationContract =>
  isRecord(value) &&
  isPullDirectionReadiness(value.pull_direction) &&
  isDraftOrientationReadiness(value.draft_orientation) &&
  Array.isArray(value.undercut_indicators) &&
  value.undercut_indicators.every(isUndercutIndicator) &&
  Array.isArray(value.parting_strategies) &&
  value.parting_strategies.every(isPartingStrategyReadiness) &&
  isCoreCavityReadiness(value.core_cavity_readiness) &&
  (value.selected_parting_strategy_id === null ||
    isString(value.selected_parting_strategy_id)) &&
  isFiniteNumber(value.confidence);

const isChapter9GenerationReport = (
  value: unknown,
): value is Chapter9GenerationReadinessReport =>
  isRecord(value) &&
  isString(value.status) &&
  isChapter9GenerationContract(value.contract);

const extractContract = (
  input: unknown,
): {
  readonly contract: Chapter9GenerationContract | null;
  readonly report: Chapter9GenerationReadinessReport | null;
} => {
  if (isChapter9GenerationReport(input)) {
    return { contract: input.contract, report: input };
  }

  if (isChapter9GenerationContract(input)) {
    return { contract: input, report: null };
  }

  return { contract: null, report: null };
};

const toConfidence = (value: number): GenerationReadinessConfidence => {
  if (value >= 0.8) {
    return 'high';
  }

  if (value >= 0.55) {
    return 'medium';
  }

  if (value > 0) {
    return 'low';
  }

  return 'none';
};

const normalizeRatio = (value: number): number =>
  Math.max(0, Math.min(1, Number(value.toFixed(6))));

const uniqueReasonCodes = (
  reasonCodes: readonly GenerationReadinessReasonCode[],
): GenerationReadinessReasonCode[] => Array.from(new Set(reasonCodes));

const createInput = (
  key: GenerationInputKey,
  state: GenerationInputState,
  label: string,
  required: boolean,
  reasonCodes: readonly GenerationReadinessReasonCode[],
): GenerationReadinessInput => ({
  key,
  state,
  label,
  required,
  reasonCodes: uniqueReasonCodes(reasonCodes),
});

const toFindingWarning = (
  finding: Chapter9GenerationFinding,
): GenerationReadinessWarning => ({
  code: finding.code,
  message: finding.message,
  source: finding.source,
});

const toFindingBlocker = (
  finding: Chapter9GenerationFinding,
): GenerationReadinessBlocker => ({
  code: finding.code,
  message: finding.message,
  source: finding.source,
});

const toPullDirectionSnapshot = (
  value: Chapter9PullDirectionReadiness,
): GenerationPullDirectionSnapshot => ({
  status: value.status,
  candidateId: value.candidate_id,
  direction: value.direction,
  decisiveness: value.decisiveness,
  score: value.score,
  confidence: toConfidence(value.confidence),
});

const toDraftOrientationSnapshot = (
  value: Chapter9DraftOrientationReadiness,
): GenerationDraftOrientationSnapshot => ({
  status: value.status,
  evaluatedSurfaceAreaRatio: normalizeRatio(value.evaluated_surface_area_ratio),
  insufficientDraftAreaRatio: normalizeRatio(value.insufficient_draft_area_ratio),
  nearZeroDraftAreaRatio: normalizeRatio(value.near_zero_draft_area_ratio),
  faceCountBySurfaceType: value.face_count_by_surface_type ?? {},
  faceCountByAdequacy: value.face_count_by_adequacy ?? {},
});

const toUndercutIndicatorSnapshot = (
  value: Chapter9UndercutIndicator,
): GenerationUndercutIndicatorSnapshot => ({
  regionId: value.region_id,
  source: value.source,
  faceCount: value.face_count,
  areaRatio: normalizeRatio(value.area_ratio),
  confidence: toConfidence(value.confidence),
  severity: value.severity ?? null,
  treatmentRequirement: value.treatment_requirement ?? null,
  isBlocking: value.is_blocking ?? false,
  requiresManualReview: value.requires_manual_review ?? false,
});

const toPartingStrategySnapshot = (
  value: Chapter9PartingStrategyReadiness,
): GenerationPartingStrategySnapshot => ({
  candidateId: value.candidate_id,
  rank: value.rank,
  strategyType: value.strategy_type,
  status: value.status,
  score: value.score,
  confidence: toConfidence(value.confidence),
  pullDirection: value.pull_direction,
  generationMode: value.generation_mode,
  coreTargetIds: value.core_target_ids ?? [],
  warningCodes: value.warning_codes ?? [],
  blockerCodes: value.blocker_codes ?? [],
  requiresManualReview: value.requires_manual_review ?? false,
});

const toCoreCavitySnapshot = (
  value: Chapter9CoreCavityReadiness,
): GenerationCoreCavityReadinessSnapshot => ({
  handlingRequired: value.handling_required,
  decisionOutcome: value.decision_outcome,
  targetIds: value.target_ids,
  confidence: toConfidence(value.confidence),
  blockerCodes: value.blocker_codes ?? [],
  warningCodes: value.warning_codes ?? [],
  sourceReferences: value.source_references ?? [],
});

const isPullDirectionAvailable = (
  value: Chapter9PullDirectionReadiness,
): boolean => value.direction !== null && value.candidate_id !== null;

const hasSelectedPartingStrategy = (
  contract: Chapter9GenerationContract,
): boolean =>
  contract.selected_parting_strategy_id !== null &&
  contract.parting_strategies.some(
    (strategy) => strategy.candidate_id === contract.selected_parting_strategy_id,
  );

const buildInputs = (
  contract: Chapter9GenerationContract,
): GenerationReadinessInput[] => {
  const selectedStrategyAvailable = hasSelectedPartingStrategy(contract);
  const partingStrategiesAvailable = contract.parting_strategies.length > 0;

  return [
    createInput(
      'chapter9_generation_contract',
      'available',
      'Chapter 9 generation contract',
      true,
      ['chapter9_generation_contract_available'],
    ),
    createInput(
      'pull_direction',
      isPullDirectionAvailable(contract.pull_direction) ? 'available' : 'missing',
      'Pull direction',
      true,
      isPullDirectionAvailable(contract.pull_direction)
        ? ['pull_direction_available']
        : ['pull_direction_missing'],
    ),
    createInput(
      'draft_orientation',
      contract.draft_orientation.status === 'unavailable'
        ? 'missing'
        : 'available',
      'Draft orientation',
      true,
      contract.draft_orientation.status === 'unavailable'
        ? ['draft_orientation_missing']
        : ['draft_orientation_available'],
    ),
    createInput(
      'undercut_indicators',
      'available',
      'Undercut indicators',
      false,
      ['undercut_indicators_available'],
    ),
    createInput(
      'parting_strategies',
      partingStrategiesAvailable
        ? selectedStrategyAvailable
          ? 'available'
          : 'incomplete'
        : 'missing',
      'Parting strategies',
      true,
      partingStrategiesAvailable
        ? selectedStrategyAvailable
          ? ['parting_strategies_available', 'selected_parting_strategy_available']
          : ['parting_strategies_available', 'selected_parting_strategy_missing']
        : ['parting_strategies_missing'],
    ),
    createInput(
      'core_cavity_readiness',
      'available',
      'Core/cavity readiness',
      true,
      contract.core_cavity_readiness.handling_required
        ? ['core_cavity_readiness_available', 'core_cavity_handling_required']
        : ['core_cavity_readiness_available'],
    ),
  ];
};

const resolveStatus = (
  reportStatus: GenerationReadinessStatus | null,
  hasBlockingInput: boolean,
  hasWarnings: boolean,
  hasCompleteContract: boolean,
): GenerationReadinessStatus => {
  if (hasBlockingInput || reportStatus === 'blocked') {
    return 'blocked';
  }

  if (reportStatus === 'ready') {
    return hasWarnings ? 'ready_with_warnings' : 'ready';
  }

  if (reportStatus === 'ready_with_warnings') {
    return 'ready_with_warnings';
  }

  if (hasCompleteContract) {
    return hasWarnings ? 'ready_with_warnings' : 'ready';
  }

  return hasWarnings ? 'ready_with_warnings' : 'unavailable';
};

const resolveReadiness = (
  status: GenerationReadinessStatus,
  hasRequiredInputs: boolean,
): GenerationReadinessLevel => {
  if (status === 'ready') {
    return 'sufficient';
  }

  if (status === 'ready_with_warnings' || hasRequiredInputs) {
    return 'partial';
  }

  if (status === 'blocked') {
    return 'insufficient';
  }

  return 'unavailable';
};

export const buildGenerationReadinessSnapshot = (
  input: unknown,
  options: GenerationReadinessBuildOptions = {},
): GenerationReadinessSnapshot => {
  const now = options.now ?? new Date().toISOString();
  const { contract, report } = extractContract(input);

  if (contract === null) {
    return createUnavailableGenerationReadinessSnapshot(now);
  }

  const inputs = buildInputs(contract);
  const availableInputs = inputs.filter((item) => item.state === 'available');
  const missingInputs = inputs.filter((item) => item.state !== 'available');
  const reportBlockers = isFindingArray(report?.blockers) ? report.blockers : [];
  const reportWarnings = isFindingArray(report?.warnings) ? report.warnings : [];

  const partingStrategyWarnings = contract.parting_strategies.flatMap(
    (strategy) => strategy.warning_codes ?? [],
  );
  const partingStrategyBlockers = contract.parting_strategies.flatMap(
    (strategy) => strategy.blocker_codes ?? [],
  );

  const warnings: GenerationReadinessWarning[] = [
    ...reportWarnings.map(toFindingWarning),
    ...partingStrategyWarnings.map((code) => ({
      code,
      message: `Parting strategy warning: ${code}.`,
      inputKey: 'parting_strategies' as const,
      source: 'chapter9_generation_contract',
    })),
    ...(contract.core_cavity_readiness.warning_codes ?? []).map((code) => ({
      code,
      message: `Core/cavity readiness warning: ${code}.`,
      inputKey: 'core_cavity_readiness' as const,
      source: 'chapter9_generation_contract',
    })),
  ];

  const blockers: GenerationReadinessBlocker[] = [
    ...reportBlockers.map(toFindingBlocker),
    ...partingStrategyBlockers.map((code) => ({
      code,
      message: `Parting strategy blocker: ${code}.`,
      inputKey: 'parting_strategies' as const,
      source: 'chapter9_generation_contract',
    })),
    ...(contract.core_cavity_readiness.blocker_codes ?? []).map((code) => ({
      code,
      message: `Core/cavity readiness blocker: ${code}.`,
      inputKey: 'core_cavity_readiness' as const,
      source: 'chapter9_generation_contract',
    })),
    ...missingInputs
      .filter((item) => item.required)
      .map((item) => ({
        code: item.reasonCodes[0] ?? 'blocked_by_missing_required_inputs',
        message: `${item.label} is required before mold generation can continue.`,
        inputKey: item.key,
        source: 'chapter9_generation_contract',
      })),
  ];

  const reportStatus = report?.status ?? null;
  const hasRequiredInputs = inputs
    .filter((item) => item.required)
    .every((item) => item.state === 'available');
  const status = resolveStatus(
    reportStatus,
    blockers.length > 0,
    warnings.length > 0,
    hasRequiredInputs,
  );
  const canGenerate = status === 'ready' && hasSelectedPartingStrategy(contract);
  const requiresManualReview =
    status === 'ready_with_warnings' ||
    blockers.length > 0 ||
    contract.parting_strategies.some((strategy) => strategy.requires_manual_review);

  const reasonCodes = uniqueReasonCodes([
    ...inputs.flatMap((item) => item.reasonCodes),
    ...(warnings.length > 0 ? (['warnings_present'] as const) : []),
    ...(requiresManualReview ? (['manual_review_required'] as const) : []),
    ...(blockers.length > 0
      ? (['blocked_by_missing_required_inputs'] as const)
      : (['ready_for_initial_generation_boundary'] as const)),
    ...(reportStatus === 'blocked' ? (['blocked_by_chapter9'] as const) : []),
    ...(contract.confidence < 0.55 ? (['low_confidence'] as const) : []),
  ]);

  return {
    status,
    readiness: resolveReadiness(status, hasRequiredInputs),
    canGenerate,
    requiresManualReview,
    confidence: toConfidence(contract.confidence),
    chapter9DependencyLevel: canGenerate ? 'generation_ready' : 'contract_only',
    availableInputs,
    missingInputs,
    warnings,
    blockers,
    reasonCodes,
    pullDirection: toPullDirectionSnapshot(contract.pull_direction),
    draftOrientation: toDraftOrientationSnapshot(contract.draft_orientation),
    undercutIndicators: contract.undercut_indicators.map(
      toUndercutIndicatorSnapshot,
    ),
    partingStrategies: [...contract.parting_strategies]
      .sort((left, right) => left.rank - right.rank)
      .map(toPartingStrategySnapshot),
    coreCavityReadiness: toCoreCavitySnapshot(contract.core_cavity_readiness),
    selectedPartingStrategyId: contract.selected_parting_strategy_id,
    generatedAt: now,
  };
};
