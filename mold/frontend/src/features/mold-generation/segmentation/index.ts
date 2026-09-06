export * from "./fitAnalysis";
export * from "./domain/segmentation.contracts";
export {
  baselineSegmentationAlgorithm,
  coordinateConflictsWithRegion,
} from "./domain/baselineSegmentationAlgorithm";
export { planSegmentation } from "./domain/planSegmentation";
export {
  deriveAxisOwnership,
  isAxisAvailableForExtension,
} from "./domain/axisOwnership";
export type { Axis3, AxisOwnership } from "./domain/axisOwnership";
export { suggestExtensionAxisPosition } from "./domain/extensionAxisPlacement";
export { mergeExtensionBoundary } from "./domain/extensionBoundaryMerge";
export {
  createSegmentationRequest,
  executeSegmentationPlan,
  requestSegmentationPlan,
} from "./application/segmentationApplication";
export * from "./execution/segmentationExecution.contracts";
export { createSegmentationExecutionRequest } from "./execution/segmentationExecutionPreflight";
export { canCommitSegmentationExecution } from "./execution/segmentationExecutionCommitGate";
export { executePlaneSegmentation } from "./execution/segmentationPlaneExecutor";
export {
  useAutomaticSegmentationMoldFrameBounds,
  useFitAnalysis,
  readFitAnalysisFromStores,
} from "./useFitAnalysis";
export {
  useSegmentationStore,
  computeEffectivePlan,
} from "./segmentation.store";
export type { ExtensionBoundaryRequest } from "./segmentation.store";
export {
  SEGMENTATION_VISUALIZATION_PHASES,
  useIsSegmentationVisualizationActive,
} from "./workflowRoute";
