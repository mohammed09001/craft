import { useCallback, useEffect, useRef } from "react";

import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition";
import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import type { Bounds3, CuttingPlaneRecord, PartBoundingBoxFaceId } from "@/features/mold-generation/split-face";
import type {
  CanonicalPartGeometry,
  CavityToolData,
} from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import type { SpruePreviewPlacement } from "@/features/mold-generation/sprue-generation";
import type {
  BoundaryIntent,
} from "@/features/mold-generation/segmentation";
import type { MasterMoldRenderableBody } from "@/features/mold-generation/master-mold/masterMoldViewportAdapter";
import type { MoldBodyData } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import {
  getPartOrientationCapability,
  type PartOrientation,
} from "@/features/viewport/partOrientation.store";
import type {
  ActiveViewportTool,
  DistanceMeasurementStatus,
} from "@/features/viewport/modelMeasurement.store";
import type { ModelSelectionStatus } from "@/features/viewport/modelSelection.store";
import type {
  ViewportPalette,
  ViewportRuntime,
  ViewportStatus,
} from "@/features/viewport/viewport.contracts";

type UseViewportRuntimeOptions = {
  hostRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  palette: ViewportPalette;
  activeTool: ActiveViewportTool;
  partOrientation: PartOrientation;
  orientationToolActive: boolean;
  referenceMoldDefinition: ReferenceMoldDefinition | null;
  masterMoldBodies: readonly MasterMoldRenderableBody[];
  moldAppearanceMode: MoldAppearanceMode;
  sprueCavityGeometry: CavityToolData | null;
  spruePreviewActive: boolean;
  sprues: readonly import("@/features/mold-generation/sprue-generation").SpruePresentationDefinition[];
  selectionBoxVisible: boolean;
  eraserInteractionActive: boolean;
  splitFaceSelectionActive: boolean;
  selectedSplitFaces: readonly PartBoundingBoxFaceId[];
  cuttingPlanes: readonly CuttingPlaneRecord[];
  cuttingPlaneK1: Bounds3 | null;
  cuttingPlaneK2: Bounds3 | null;
  segmentationPartOffset: { readonly x: number; readonly y: number; readonly z: number } | null;
  segmentationPreviewBodies: readonly MoldBodyData[];
  segmentationPreviewPlanes: readonly BoundaryIntent[];
  segmentationCommittedBodies: readonly MoldBodyData[];
  moldScaleActive?: boolean;
  moldScaleClearanceMm?: number;
  onSplitFaceToggle: (face: PartBoundingBoxFaceId) => void;
  onCuttingPlaneDragStart: (id: string) => void;
  onCuttingPlaneDragCommit: (id: string, normalizedPosition: number) => void;
  onCuttingPlaneDragCancel: () => void;
  onCuttingPlaneErase: (faceId: PartBoundingBoxFaceId) => void;
  onCanonicalPartGeometryChange: (geometry: CanonicalPartGeometry | null) => void;
  onSpruePlacementRequest: (
    placement: SpruePreviewPlacement,
  ) => Promise<boolean>;
  onSprueDiameterCommit: (operationId: string, diameterMm: number) => Promise<boolean>;
  onSprueEntryNeckDiameterCommit: (operationId: string, diameterMm: number) => Promise<boolean>;
  onPartOrientationCommit: (orientation: PartOrientation) => boolean;
  onMoldScaleBegin?: () => void;
  onMoldScaleUpdate?: (clearanceMm: number) => void;
  onMoldScaleCommit?: () => void;
  onMoldScaleCancel?: () => void;
  onStatusChange: (status: ViewportStatus) => void;
  onModelStatusChange: (status: ModelImportStatus) => void;
  onMeasurementChange: (status: DistanceMeasurementStatus) => void;
  onSelectionChange: (status: ModelSelectionStatus) => void;
  onFirstInteraction: () => void;
};

export function useViewportRuntime({
  hostRef,
  canvasRef,
  palette,
  activeTool,
  partOrientation,
  orientationToolActive,
  referenceMoldDefinition,
  masterMoldBodies,
  moldAppearanceMode,
  sprueCavityGeometry,
  spruePreviewActive,
  sprues,
  selectionBoxVisible,
  eraserInteractionActive,
  splitFaceSelectionActive,
  selectedSplitFaces,
  cuttingPlanes,
  cuttingPlaneK1,
  cuttingPlaneK2,
  segmentationPartOffset,
  segmentationPreviewBodies,
  segmentationPreviewPlanes,
  segmentationCommittedBodies,
  moldScaleActive = false,
  moldScaleClearanceMm = 10,
  onSplitFaceToggle,
  onCuttingPlaneDragStart,
  onCuttingPlaneDragCommit,
  onCuttingPlaneDragCancel,
  onCuttingPlaneErase,
  onCanonicalPartGeometryChange,
  onSpruePlacementRequest,
  onSprueDiameterCommit,
  onSprueEntryNeckDiameterCommit,
  onPartOrientationCommit,
  onMoldScaleBegin = () => undefined,
  onMoldScaleUpdate = () => undefined,
  onMoldScaleCommit = () => undefined,
  onMoldScaleCancel = () => undefined,
  onStatusChange,
  onModelStatusChange,
  onMeasurementChange,
  onSelectionChange,
  onFirstInteraction,
}: UseViewportRuntimeOptions) {
  const runtimeRef = useRef<ViewportRuntime | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const latestPaletteRef = useRef(palette);
  const latestActiveToolRef = useRef(activeTool);
  const latestPartOrientationRef = useRef(partOrientation);
  const latestOrientationToolActiveRef = useRef(orientationToolActive);
  const latestReferenceMoldDefinitionRef = useRef(referenceMoldDefinition);
  const latestMasterMoldBodiesRef = useRef(masterMoldBodies);
  const latestMoldAppearanceModeRef = useRef(moldAppearanceMode);
  const latestSprueCavityGeometryRef = useRef(sprueCavityGeometry);
  const latestSpruePreviewActiveRef = useRef(spruePreviewActive);
  const latestSpruesRef = useRef(sprues);
  const latestSelectionBoxVisibleRef = useRef(selectionBoxVisible);
  const latestEraserInteractionActiveRef = useRef(eraserInteractionActive);
  const latestSplitFacesRef = useRef({ active: splitFaceSelectionActive, selected: selectedSplitFaces });
  const latestCuttingPlanesRef = useRef({ k1: cuttingPlaneK1, k2: cuttingPlaneK2, planes: cuttingPlanes });
  const latestSegmentationVisualizationRef = useRef({
    partOffset: segmentationPartOffset,
    previewBodies: segmentationPreviewBodies,
    previewPlanes: segmentationPreviewPlanes,
    committedBodies: segmentationCommittedBodies,
  });
  const latestMoldScaleRef = useRef({ active: moldScaleActive, clearanceMm: moldScaleClearanceMm });
  const statusChangeRef = useRef(onStatusChange);
  const modelStatusChangeRef = useRef(onModelStatusChange);
  const measurementChangeRef = useRef(onMeasurementChange);
  const selectionChangeRef = useRef(onSelectionChange);
  const firstInteractionRef = useRef(onFirstInteraction);
  const splitFaceToggleRef = useRef(onSplitFaceToggle);
  const planeDragStartRef = useRef(onCuttingPlaneDragStart);
  const planeDragCommitRef = useRef(onCuttingPlaneDragCommit);
  const planeDragCancelRef = useRef(onCuttingPlaneDragCancel);
  const cuttingPlaneEraseRef = useRef(onCuttingPlaneErase);
  const canonicalPartGeometryChangeRef = useRef(onCanonicalPartGeometryChange);
  const spruePlacementRequestRef = useRef(onSpruePlacementRequest);
  const sprueDiameterCommitRef = useRef(onSprueDiameterCommit);
  const sprueEntryNeckDiameterCommitRef = useRef(onSprueEntryNeckDiameterCommit);
  const partOrientationCommitRef = useRef(onPartOrientationCommit);
  const moldScaleBeginRef = useRef(onMoldScaleBegin);
  const moldScaleUpdateRef = useRef(onMoldScaleUpdate);
  const moldScaleCommitRef = useRef(onMoldScaleCommit);
  const moldScaleCancelRef = useRef(onMoldScaleCancel);

  useEffect(() => { splitFaceToggleRef.current = onSplitFaceToggle; }, [onSplitFaceToggle]);
  useEffect(() => { planeDragStartRef.current = onCuttingPlaneDragStart; }, [onCuttingPlaneDragStart]);
  useEffect(() => { planeDragCommitRef.current = onCuttingPlaneDragCommit; }, [onCuttingPlaneDragCommit]);
  useEffect(() => { planeDragCancelRef.current = onCuttingPlaneDragCancel; }, [onCuttingPlaneDragCancel]);
  useEffect(() => { cuttingPlaneEraseRef.current = onCuttingPlaneErase; }, [onCuttingPlaneErase]);
  useEffect(() => { canonicalPartGeometryChangeRef.current = onCanonicalPartGeometryChange; }, [onCanonicalPartGeometryChange]);
  useEffect(() => { spruePlacementRequestRef.current = onSpruePlacementRequest; }, [onSpruePlacementRequest]);
  useEffect(() => { sprueDiameterCommitRef.current = onSprueDiameterCommit; }, [onSprueDiameterCommit]);
  useEffect(() => { sprueEntryNeckDiameterCommitRef.current = onSprueEntryNeckDiameterCommit; }, [onSprueEntryNeckDiameterCommit]);
  useEffect(() => { partOrientationCommitRef.current = onPartOrientationCommit; }, [onPartOrientationCommit]);
  useEffect(() => { moldScaleBeginRef.current = onMoldScaleBegin; }, [onMoldScaleBegin]);
  useEffect(() => { moldScaleUpdateRef.current = onMoldScaleUpdate; }, [onMoldScaleUpdate]);
  useEffect(() => { moldScaleCommitRef.current = onMoldScaleCommit; }, [onMoldScaleCommit]);
  useEffect(() => { moldScaleCancelRef.current = onMoldScaleCancel; }, [onMoldScaleCancel]);
  useEffect(() => { statusChangeRef.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { modelStatusChangeRef.current = onModelStatusChange; }, [onModelStatusChange]);
  useEffect(() => { measurementChangeRef.current = onMeasurementChange; }, [onMeasurementChange]);
  useEffect(() => { selectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { firstInteractionRef.current = onFirstInteraction; }, [onFirstInteraction]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const canvas = canvasRef.current;

    if (host === null || canvas === null) {
      return undefined;
    }

    statusChangeRef.current({ phase: "initializing" });

    void import("@/features/viewport/runtime/createThreeViewportRuntime")
      .then(({ createThreeViewportRuntime }) => {
        if (cancelled) {
          return;
        }

        const runtime = createThreeViewportRuntime({
          host,
          canvas,
          palette: latestPaletteRef.current,
          onStatusChange: (status) => {
            if (!cancelled) {
              statusChangeRef.current(status);
            }
          },
          onModelStatusChange: (status) => {
            if (!cancelled) {
              modelStatusChangeRef.current(status);
            }
          },
          onMeasurementChange: (status) => {
            if (!cancelled) {
              measurementChangeRef.current(status);
            }
          },
          onSelectionChange: (status) => {
            if (!cancelled) {
              selectionChangeRef.current(status);
            }
          },
          onFirstInteraction: () => {
            if (!cancelled) {
              firstInteractionRef.current();
            }
          },
          onSplitFaceToggle: (face) => splitFaceToggleRef.current(face),
          onCuttingPlaneDragStart: (id) => planeDragStartRef.current(id),
          onCuttingPlaneDragCommit: (id, position) => planeDragCommitRef.current(id, position),
          onCuttingPlaneDragCancel: () => planeDragCancelRef.current(),
          onCuttingPlaneErase: (faceId) => cuttingPlaneEraseRef.current(faceId),
          onCanonicalPartGeometryChange: (geometry) => canonicalPartGeometryChangeRef.current(geometry),
          onSpruePlacementRequest: (placement) => spruePlacementRequestRef.current(placement),
          onSprueDiameterCommit: (operationId, diameterMm) => sprueDiameterCommitRef.current(operationId, diameterMm),
          onSprueEntryNeckDiameterCommit: (operationId, diameterMm) => sprueEntryNeckDiameterCommitRef.current(operationId, diameterMm),
          onPartOrientationCommit: (orientation) => partOrientationCommitRef.current(orientation),
          onMoldScaleBegin: () => moldScaleBeginRef.current(),
          onMoldScaleUpdate: (clearanceMm) => moldScaleUpdateRef.current(clearanceMm),
          onMoldScaleCommit: () => moldScaleCommitRef.current(),
          onMoldScaleCancel: () => moldScaleCancelRef.current(),
          canActivatePartOrientation: () => getPartOrientationCapability().available,
        });

        runtime.setActiveTool?.(latestActiveToolRef.current);
        runtime.setPartOrientation?.(latestPartOrientationRef.current);
        runtime.setOrientationToolActive?.(latestOrientationToolActiveRef.current);
        runtime.setReferenceMoldDefinition(latestReferenceMoldDefinitionRef.current);
        runtime.setMasterMoldBodies?.(latestMasterMoldBodiesRef.current);
        runtime.setMoldAppearanceMode?.(latestMoldAppearanceModeRef.current);
        runtime.setSprueCavityGeometry?.(latestSprueCavityGeometryRef.current);
        runtime.setSpruePreviewActive?.(latestSpruePreviewActiveRef.current);
        runtime.setSprues?.(latestSpruesRef.current);
        runtime.setSelectionBoxVisible(latestSelectionBoxVisibleRef.current);
        runtime.setEraserInteractionActive?.(latestEraserInteractionActiveRef.current);
        runtime.setSplitFaceSelection?.(latestSplitFacesRef.current.active, latestSplitFacesRef.current.selected);
        runtime.setCuttingPlanes?.(latestCuttingPlanesRef.current.k1, latestCuttingPlanesRef.current.k2, latestCuttingPlanesRef.current.planes);
        runtime.setSegmentationVisualization?.(
          latestSegmentationVisualizationRef.current.partOffset,
          latestSegmentationVisualizationRef.current.previewBodies,
          latestSegmentationVisualizationRef.current.previewPlanes,
          latestSegmentationVisualizationRef.current.committedBodies,
        );
        runtime.setMoldScaleInteraction?.(latestMoldScaleRef.current.active, latestMoldScaleRef.current.clearanceMm);
        runtimeRef.current = runtime;

        const pendingFile = pendingFileRef.current;
        if (pendingFile !== null) {
          pendingFileRef.current = null;
          runtime.loadLocalStl(pendingFile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          statusChangeRef.current({
            phase: "error",
            message: "The 3D viewport could not be started.",
          });
          if (pendingFileRef.current !== null) {
            pendingFileRef.current = null;
            modelStatusChangeRef.current({
              phase: "error",
              message:
                "The 3D viewport could not be started, so the STL file was not loaded.",
            });
          }
        }
      });

    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [canvasRef, hostRef]);

  useEffect(() => {
    latestPaletteRef.current = palette;
    runtimeRef.current?.setPalette?.(palette);
  }, [palette]);

  useEffect(() => {
    latestActiveToolRef.current = activeTool;
    runtimeRef.current?.setActiveTool?.(activeTool);
  }, [activeTool]);

  useEffect(() => {
    latestPartOrientationRef.current = partOrientation;
    runtimeRef.current?.setPartOrientation?.(partOrientation);
  }, [partOrientation]);

  useEffect(() => {
    latestOrientationToolActiveRef.current = orientationToolActive;
    runtimeRef.current?.setOrientationToolActive?.(orientationToolActive);
  }, [orientationToolActive]);

  useEffect(() => {
    latestReferenceMoldDefinitionRef.current = referenceMoldDefinition;
    runtimeRef.current?.setReferenceMoldDefinition(referenceMoldDefinition);
  }, [referenceMoldDefinition]);

  useEffect(() => {
    latestMasterMoldBodiesRef.current = masterMoldBodies;
    runtimeRef.current?.setMasterMoldBodies?.(masterMoldBodies);
  }, [masterMoldBodies]);

  useEffect(() => {
    latestMoldAppearanceModeRef.current = moldAppearanceMode;
    runtimeRef.current?.setMoldAppearanceMode?.(moldAppearanceMode);
  }, [moldAppearanceMode]);

  useEffect(() => {
    latestSprueCavityGeometryRef.current = sprueCavityGeometry;
    runtimeRef.current?.setSprueCavityGeometry?.(sprueCavityGeometry);
  }, [sprueCavityGeometry]);

  useEffect(() => {
    latestSpruePreviewActiveRef.current = spruePreviewActive;
    runtimeRef.current?.setSpruePreviewActive?.(spruePreviewActive);
  }, [spruePreviewActive]);

  useEffect(() => {
    latestSpruesRef.current = sprues;
    runtimeRef.current?.setSprues?.(sprues);
  }, [sprues]);

  useEffect(() => {
    latestSelectionBoxVisibleRef.current = selectionBoxVisible;
    runtimeRef.current?.setSelectionBoxVisible(selectionBoxVisible);
  }, [selectionBoxVisible]);

  useEffect(() => {
    latestSplitFacesRef.current = { active: splitFaceSelectionActive, selected: selectedSplitFaces };
    runtimeRef.current?.setSplitFaceSelection?.(splitFaceSelectionActive, selectedSplitFaces);
  }, [selectedSplitFaces, splitFaceSelectionActive]);

  useEffect(() => {
    latestCuttingPlanesRef.current = { k1: cuttingPlaneK1, k2: cuttingPlaneK2, planes: cuttingPlanes };
    runtimeRef.current?.setCuttingPlanes?.(cuttingPlaneK1, cuttingPlaneK2, cuttingPlanes);
  }, [cuttingPlaneK1, cuttingPlaneK2, cuttingPlanes]);

  useEffect(() => {
    latestSegmentationVisualizationRef.current = {
      partOffset: segmentationPartOffset,
      previewBodies: segmentationPreviewBodies,
      previewPlanes: segmentationPreviewPlanes,
      committedBodies: segmentationCommittedBodies,
    };
    runtimeRef.current?.setSegmentationVisualization?.(
      segmentationPartOffset,
      segmentationPreviewBodies,
      segmentationPreviewPlanes,
      segmentationCommittedBodies,
    );
  }, [
    segmentationPartOffset,
    segmentationPreviewBodies,
    segmentationPreviewPlanes,
    segmentationCommittedBodies,
  ]);

  useEffect(() => {
    latestMoldScaleRef.current = { active: moldScaleActive, clearanceMm: moldScaleClearanceMm };
    runtimeRef.current?.setMoldScaleInteraction?.(moldScaleActive, moldScaleClearanceMm);
  }, [moldScaleActive, moldScaleClearanceMm]);

  useEffect(() => {
    latestEraserInteractionActiveRef.current = eraserInteractionActive;
    runtimeRef.current?.setEraserInteractionActive?.(eraserInteractionActive);
  }, [eraserInteractionActive]);

  const loadLocalStl = useCallback((file: File) => {
    const runtime = runtimeRef.current;
    if (runtime !== null) {
      runtime.loadLocalStl(file);
      return;
    }
    pendingFileRef.current = file;
  }, []);

  const setModelVisible = useCallback((visible: boolean) => {
    runtimeRef.current?.setModelVisible(visible);
  }, []);

  const fitView = useCallback(() => {
    runtimeRef.current?.fitView();
  }, []);

  const orientModel = useCallback(() => {
    runtimeRef.current?.orientModel();
  }, []);

  const resetView = useCallback(() => {
    runtimeRef.current?.resetView();
  }, []);

  const clearSelection = useCallback(() => {
    runtimeRef.current?.clearSelection();
  }, []);

  const clearMeasurement = useCallback(() => {
    runtimeRef.current?.clearMeasurement();
  }, []);

  return {
    loadLocalStl,
    setModelVisible,
    fitView,
    orientModel,
    resetView,
    clearSelection,
    clearMeasurement,
  };
}
