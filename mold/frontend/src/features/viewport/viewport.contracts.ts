import type { CavityToolData } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";

export type ViewportPhase =
  | "initializing"
  | "ready"
  | "unsupported"
  | "error"
  | "context-lost";

export type ViewportStatus = {
  phase: ViewportPhase;
  message?: string;
};

export type ViewportPalette = {
  background: string;
  gridMajor: string;
  gridMinor: string;
};

export type ViewportRuntimeOptions = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  palette: ViewportPalette;
  onStatusChange: (status: ViewportStatus) => void;
  onModelStatusChange: (
    status: import("@/features/viewport/modelImport.contracts").ModelImportStatus,
  ) => void;
  onMeasurementChange: (
    status: import("@/features/viewport/modelMeasurement.store").DistanceMeasurementStatus,
  ) => void;
  onSelectionChange: (
    status: import("@/features/viewport/modelSelection.store").ModelSelectionStatus,
  ) => void;
  onFirstInteraction?: () => void;
  onSplitFaceToggle?: (face: import("@/features/mold-generation/split-face").PartBoundingBoxFaceId) => void;
  onCuttingPlaneDragStart?: (id: string) => void;
  onCuttingPlaneDragCommit?: (id: string, normalizedPosition: number) => void;
  onCuttingPlaneDragCancel?: () => void;
  onCuttingPlaneErase?: (
    faceId: import("@/features/mold-generation/split-face").PartBoundingBoxFaceId,
  ) => void;
  onCanonicalPartGeometryChange?: (geometry: import("@/features/mold-generation/cavity-generation/cavityGeneration.contracts").CanonicalPartGeometry | null) => void;
  onSpruePlacementRequest?: (
    placement: import("@/features/mold-generation/sprue-generation").SpruePreviewPlacement,
  ) => Promise<boolean>;
  onSprueDiameterCommit?: (operationId: string, diameterMm: number) => Promise<boolean>;
  onSprueEntryNeckDiameterCommit?: (operationId: string, diameterMm: number) => Promise<boolean>;
  onPartOrientationCommit?: (
    orientation: import("@/features/viewport/partOrientation.store").PartOrientation,
  ) => boolean;
  onMoldScaleBegin?: () => void;
  onMoldScaleUpdate?: (clearanceMm: number) => void;
  onMoldScaleCommit?: () => void;
  onMoldScaleCancel?: () => void;
  canActivatePartOrientation?: () => boolean;
};

export type ViewportRuntime = {
  clearSelection: () => void;
  clearMeasurement: () => void;
  fitView: () => void;
  loadLocalStl: (file: File) => void;
  setModelVisible: (visible: boolean) => void;
  setSelectionBoxVisible: (visible: boolean) => void;
  setPartOrientation?: (
    orientation: import("@/features/viewport/partOrientation.store").PartOrientation,
  ) => void;
  setOrientationToolActive?: (active: boolean) => void;
  orientModel: () => void;
  resetView: () => void;
  setSplitFaceSelection?: (active: boolean, selected: readonly import("@/features/mold-generation/split-face").PartBoundingBoxFaceId[]) => void;
  setCuttingPlanes?: (partBoundingBox: import("@/features/mold-generation/split-face").Bounds3 | null, referenceMoldBlock: import("@/features/mold-generation/split-face").Bounds3 | null, planes: readonly import("@/features/mold-generation/split-face").CuttingPlaneRecord[]) => void;
  setReferenceMoldDefinition: (
    definition: import("@/features/mold-generation/reference-mold-definition").ReferenceMoldDefinition | null,
  ) => void;
  setMasterMoldBodies?: (
    bodies: readonly import("@/features/mold-generation/master-mold/masterMoldViewportAdapter").MasterMoldRenderableBody[],
  ) => void;
  setMoldAppearanceMode?: (
    mode: import("@/features/mold-generation/reference-mold-definition/moldAppearance.store").MoldAppearanceMode,
  ) => void;
  setSprueCavityGeometry?: (
    cavityTool: CavityToolData | null,
  ) => void;
  setSprueDefinitions?: (
    definitions: readonly import("@/features/mold-generation/sprue-generation").SprueDefinition[],
  ) => void;
  setSelectedSprueId?: (sprueId: string | null) => void;
  setSprueToolActive?: (active: boolean) => void;
  setActiveTool?: (tool: import("@/features/viewport/modelMeasurement.store").ActiveViewportTool) => void;
  setSpruePreviewActive?: (active: boolean) => void;
  setSprues?: (
    sprues: readonly import("@/features/mold-generation/sprue-generation").SpruePresentationDefinition[],
  ) => void;
  setEraserInteractionActive?: (active: boolean) => void;
  setSegmentationVisualization?: (
    partOffset: { readonly x: number; readonly y: number; readonly z: number } | null,
    previewBodies: readonly import("@/features/mold-generation/reference-mold-definition/orthogonalMold").MoldBodyData[],
    previewPlanes: readonly import("@/features/mold-generation/segmentation").BoundaryIntent[],
    committedBodies: readonly import("@/features/mold-generation/reference-mold-definition/orthogonalMold").MoldBodyData[],
  ) => void;
  setMoldScaleInteraction?: (
    active: boolean,
    clearanceMm: number,
  ) => void;
  setPalette?: (palette: ViewportPalette) => void;
  invalidate?: () => void;
  dispose: () => void;
};
