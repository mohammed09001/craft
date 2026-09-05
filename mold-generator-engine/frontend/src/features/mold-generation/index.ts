export {
  CHAPTER9_DEPENDENCY_LEVEL_VALUES,
  GENERATION_INPUT_KEYS,
  GENERATION_INPUT_STATE_VALUES,
  GENERATION_READINESS_CONFIDENCE_VALUES,
  GENERATION_READINESS_LEVEL_VALUES,
  GENERATION_READINESS_REASON_CODES,
  GENERATION_READINESS_STATUS_VALUES,
  createUnavailableGenerationReadinessSnapshot,
} from './generationReadiness.contracts';

export type {
  Chapter9CoreCavityReadiness,
  Chapter9DraftOrientationReadiness,
  Chapter9GenerationContract,
  Chapter9GenerationFinding,
  Chapter9GenerationReadinessReport,
  Chapter9PartingStrategyReadiness,
  Chapter9PullDirectionReadiness,
  Chapter9UndercutIndicator,
  Chapter9DependencyLevel,
  GenerationInputKey,
  GenerationInputState,
  GenerationCoreCavityReadinessSnapshot,
  GenerationDraftOrientationSnapshot,
  GenerationReadinessBlocker,
  GenerationReadinessBuildOptions,
  GenerationReadinessConfidence,
  GenerationReadinessInput,
  GenerationReadinessLevel,
  GenerationReadinessReasonCode,
  GenerationReadinessSnapshot,
  GenerationReadinessStatus,
  GenerationReadinessWarning,
  GenerationPartingStrategySnapshot,
  GenerationPullDirectionSnapshot,
  GenerationUndercutIndicatorSnapshot,
  GenerationVector3,
} from './generationReadiness.contracts';

export {
  buildGenerationReadinessSnapshot,
} from './generationReadiness.adapter';

export type {
  GenerationReadinessAdapterInput,
} from './generationReadiness.adapter';

export {
  FACE_SELECTION_MODE_VALUES,
  OBJECT_SELECTION_BOUNDARY_REASON_CODES,
  OBJECT_SELECTION_BOUNDARY_SOURCE_VALUES,
  OBJECT_SELECTION_BOUNDARY_VALIDITY_VALUES,
  SELECTION_INTERACTION_MODE_VALUES,
} from './objectSelectionBoundary.contracts';

export type {
  FaceInteractionState,
  FaceSelectionMode,
  ObjectSelectionBoundaryReasonCode,
  ObjectSelectionBoundarySource,
  ObjectSelectionBoundaryValidity,
  ObjectSelectionBounds,
  SelectionBoundaryInput,
  SelectionBoundaryWarning,
  SelectionBounds3,
  SelectionBoundsValidationResult,
  SelectionInteractionMode,
  SelectionInteractionSnapshot,
  SelectionVector3,
} from './objectSelectionBoundary.contracts';

export {
  buildObjectSelectionBoundarySnapshot,
  clearFaceFocus,
  clearHoveredFace,
  createSelectedObjectSelectionState,
  createUnselectedObjectSelectionState,
  focusFace,
  normalizeInteractiveSelectionState,
  selectFace,
  setSelectedFaces,
  updateHoveredFace,
  validateSelectionBounds,
} from './objectSelectionBoundary.lifecycle';
