export { MoldBodiesBrowser } from "./MoldBodiesBrowser";
export type { ReferenceMoldDefinition } from "./referenceMoldDefinition.contracts";
export { generateMoldBodies, MOLD_GEOMETRY_TOLERANCE_MM } from "./orthogonalMold";
export type { CutPlaneData, MoldBodyData, MoldMeshPayload } from "./orthogonalMold";
export {
  AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM,
  createAutomaticSegmentationMoldFrameBounds,
  createReferenceMoldBlockBounds,
  createReferenceMoldFrameBounds,
  clampReferenceMoldClearance,
  DEFAULT_REFERENCE_MOLD_CLEARANCE_MM,
  MIN_REFERENCE_MOLD_CLEARANCE_MM,
  MAX_REFERENCE_MOLD_CLEARANCE_MM,
  resolveAutomaticSegmentationMoldClearance,
  type ReferenceMoldFrameBounds,
} from "./referenceMoldBlock.geometry";
export { clampGuideProgress, createCuttingGuides, deriveCuttingGuideGeometry, deriveGroundZ, isValidReferenceMoldBounds } from "./cuttingGuide.geometry";
