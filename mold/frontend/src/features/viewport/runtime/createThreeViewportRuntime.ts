import { Group, type PerspectiveCamera, type WebGLRenderer } from "three";

import type {
  ViewportPalette,
  ViewportRuntime,
  ViewportRuntimeOptions,
} from "@/features/viewport/viewport.contracts";
import { createCamera } from "@/features/viewport/runtime/createCamera";
import { createCameraControls } from "@/features/viewport/runtime/createCameraControls";
import {
  createEngineeringGrid,
  disposeEngineeringGrid,
  type EngineeringGrid,
  updateEngineeringGridPalette,
} from "@/features/viewport/runtime/createEngineeringGrid";
import { createLighting } from "@/features/viewport/runtime/createLighting";
import { createRenderer } from "@/features/viewport/runtime/createRenderer";
import { createScene } from "@/features/viewport/runtime/createScene";
import { disposeScene } from "@/features/viewport/runtime/disposeScene";
import {
  createRenderScheduler,
  type RenderScheduler,
} from "@/features/viewport/runtime/renderScheduler";
import { createLocalStlRuntime } from "@/features/viewport/runtime/localStlImport";
import { createModelMeasurementRuntime } from "@/features/viewport/runtime/modelMeasurementRuntime";
import { createModelSelectionRuntime } from "@/features/viewport/runtime/modelSelectionRuntime";
import {
  observeViewportResize,
  resizeViewport,
} from "@/features/viewport/runtime/resizeViewport";
import { createReferenceMoldBlock3dRuntime } from "@/features/viewport/runtime/referenceMoldBlock3dRuntime";
import { createMasterMoldBody3dRuntime } from "@/features/viewport/runtime/masterMoldBody3dRuntime";
import { createCuttingPlane3dRuntime } from "@/features/viewport/runtime/cuttingPlane3dRuntime";
import { createGroundPlaneRulerRuntime } from "@/features/viewport/runtime/createGroundPlaneRulerRuntime";
import { createSegmentationVisualization3dRuntime } from "@/features/viewport/runtime/segmentationVisualization3dRuntime";
import { createSpruePreview3dRuntime } from "@/features/viewport/runtime/spruePreview3dRuntime";
import { createSpruePlacementRequestGate } from "@/features/viewport/runtime/spruePlacementRequestGate";
import { createSprueResizeRuntime } from "@/features/viewport/runtime/sprueResizeRuntime";
import { createMoldScaleRuntime } from "@/features/viewport/runtime/moldScaleRuntime";

function createInactiveRuntime({
  onModelStatusChange,
}: Pick<ViewportRuntimeOptions, "onModelStatusChange">): ViewportRuntime {
  return {
    clearSelection: () => undefined,
    clearMeasurement: () => undefined,
    fitView: () => undefined,
    loadLocalStl: () => {
      onModelStatusChange({
        phase: "error",
        message:
          "The 3D viewport is not available in this browser, so the STL file could not be loaded.",
      });
    },
    setModelVisible: () => undefined,
    setSelectionBoxVisible: () => undefined,
    setPartOrientation: () => undefined,
    orientModel: () => undefined,
    resetView: () => undefined,
    setSplitFaceSelection: () => undefined,
    setCuttingPlanes: () => undefined,
    setReferenceMoldDefinition: () => undefined,
    setMasterMoldBodies: () => undefined,
    setMoldAppearanceMode: () => undefined,
    setSprueCavityGeometry: () => undefined,
    setSpruePreviewActive: () => undefined,
    setSprues: () => undefined,
    setEraserInteractionActive: () => undefined,
    setSegmentationVisualization: () => undefined,
    setMoldScaleInteraction: () => undefined,
    setActiveTool: () => undefined,
    setPalette: () => undefined,
    invalidate: () => undefined,
    dispose: () => undefined,
  };
}

function getWebGL2Context(canvas: HTMLCanvasElement) {
  return canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    stencil: false,
    preserveDrawingBuffer: false,
  });
}

function setRendererPalette(
  renderer: WebGLRenderer,
  palette: ViewportPalette,
) {
  renderer.setClearColor(palette.background, 1);
}

export function createThreeViewportRuntime({
  host,
  canvas,
  palette,
  onStatusChange,
  onModelStatusChange,
  onMeasurementChange,
  onSelectionChange,
  onFirstInteraction,
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
  onMoldScaleBegin,
  onMoldScaleUpdate,
  onMoldScaleCommit,
  onMoldScaleCancel,
}: ViewportRuntimeOptions): ViewportRuntime {
  const context = getWebGL2Context(canvas);

  if (context === null) {
    onStatusChange({
      phase: "unsupported",
      message: "WebGL 2 is not available in this browser.",
    });

    return createInactiveRuntime({ onModelStatusChange });
  }

  let disposed = false;
  let contextLost = false;
  let firstSuccessfulRender = false;
  let renderer: WebGLRenderer;
  let camera: PerspectiveCamera;
  let scheduler: RenderScheduler;

  try {
    renderer = createRenderer(canvas, context, palette);
    const scene = createScene();
    camera = createCamera();
    let currentPalette = palette;
    let grid: EngineeringGrid = createEngineeringGrid(currentPalette);
    let moldBlockBaseZ: number | null = null;
    let referenceMoldPartOffset = { x: 0, y: 0, z: 0 };
    let segmentationPartOffset:
      | { readonly x: number; readonly y: number; readonly z: number }
      | null = null;
    const syncMoldAssemblyOffset = () => {
      localStlRuntime.setMoldAssemblyOffset(
        segmentationPartOffset ?? referenceMoldPartOffset,
      );
    };
    const setGridGroundZ = (groundZ: number) => {
      if (grid.position !== undefined) grid.position.z = groundZ;
    };
    const modelRoot = new Group();
    modelRoot.name = "Imported Model Root";
    const controls = createCameraControls(camera, canvas, host, {
      onChange: () => scheduler.invalidate(),
      onInteractionStart: () => onFirstInteraction?.(),
    });
    const disposeResizeObserver = observeViewportResize(host, () => {
      resizeViewport(host, renderer, camera);
      scheduler.invalidate();
    });

    scene.add(createLighting(), grid);

    const replaceGrid = (nextGrid: EngineeringGrid) => {
      scene.remove(grid);
      disposeEngineeringGrid(grid);
      grid = nextGrid;
      setGridGroundZ(moldBlockBaseZ ?? 0);
      scene.add(grid);
      scheduler.invalidate();
    };

    const handleRenderError = () => {
      if (disposed) {
        return;
      }

      onStatusChange({
        phase: "error",
        message: "The 3D viewport could not be started.",
      });
    };

    scheduler = createRenderScheduler({
      onRenderError: handleRenderError,
      renderFrame: () => {
        if (contextLost || disposed) {
          return false;
        }

        const needsAnotherFrame = controls.update();

        groundPlaneRuler.updateForCamera();

        renderer.render(scene, camera);

        if (!firstSuccessfulRender) {
          firstSuccessfulRender = true;
          onStatusChange({ phase: "ready" });
        }

        return needsAnotherFrame;
      },
    });
    const groundPlaneRuler = createGroundPlaneRulerRuntime({
      camera,
      canvas,
      palette: currentPalette,
      invalidate: scheduler.invalidate,
    });
    scene.add(groundPlaneRuler.object);
    const moldBlock3dRuntime = createReferenceMoldBlock3dRuntime(scheduler.invalidate, (groundZ) => {
      moldBlockBaseZ = groundZ;
      setGridGroundZ(0);
      scheduler.invalidate();
    });
    scene.add(moldBlock3dRuntime.object);
    const masterMoldBody3dRuntime = createMasterMoldBody3dRuntime(scheduler.invalidate);
    scene.add(masterMoldBody3dRuntime.object);
    const spruePreviewRuntime = createSpruePreview3dRuntime({
      camera,
      canvas,
      invalidate: scheduler.invalidate,
      onValidPlacementClick: (placement) => {
        sprueRequestGate.request(placement);
      },
    });
    const sprueRequestGate = createSpruePlacementRequestGate({
      create: (placement) =>
        onSpruePlacementRequest?.(placement) ?? Promise.resolve(false),
      onCreated: () => {
        if (!disposed) spruePreviewRuntime.clearPreview();
      },
    });
    const sprueResizeRuntime = createSprueResizeRuntime({
      camera, canvas, host, controls, invalidate: scheduler.invalidate,
      onDiameterCommit: (operationId, diameterMm) =>
        onSprueDiameterCommit?.(operationId, diameterMm) ?? Promise.resolve(false),
      onEntryNeckDiameterCommit: (operationId, diameterMm) =>
        onSprueEntryNeckDiameterCommit?.(operationId, diameterMm) ?? Promise.resolve(false),
    });
    const moldScaleRuntime = createMoldScaleRuntime({
      canvas,
      host,
      controls,
      onBegin: () => onMoldScaleBegin?.(),
      onUpdate: (clearanceMm) => onMoldScaleUpdate?.(clearanceMm),
      onCommit: () => onMoldScaleCommit?.(),
      onCancel: () => onMoldScaleCancel?.(),
    });
    scene.add(spruePreviewRuntime.object);
    scene.add(sprueResizeRuntime.object);
    const cuttingPlaneRuntime = createCuttingPlane3dRuntime({
      camera, canvas, controls, invalidate: scheduler.invalidate,
      onDragStart: (id) => onCuttingPlaneDragStart?.(id),
      onDragCommit: (id, position) => onCuttingPlaneDragCommit?.(id, position),
      onDragCancel: () => onCuttingPlaneDragCancel?.(),
      onErasePlane: (faceId) =>
        onCuttingPlaneErase?.(faceId),
    });
    scene.add(cuttingPlaneRuntime.root);
    const segmentationVisualizationRuntime = createSegmentationVisualization3dRuntime(scheduler.invalidate);
    scene.add(segmentationVisualizationRuntime.object);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      firstSuccessfulRender = false;
      scheduler.dispose();
      onStatusChange({
        phase: "context-lost",
        message: "The graphics context was lost and is being restored.",
      });
    };

    const handleContextRestored = () => {
      if (disposed) {
        return;
      }

      contextLost = false;
      onStatusChange({ phase: "initializing" });
      scheduler.invalidate();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const selectionRuntime = createModelSelectionRuntime({
      camera,
      canvas,
      onModelRemoved: () => {
        spruePreviewRuntime.setMoldRoot(null);
        moldBlock3dRuntime.clearTarget();
        cuttingPlaneRuntime.setTarget(null);
      },
      onSelectionBoxAvailable: (modelId, target) => {
        moldBlock3dRuntime.setTarget(modelId, target);
        spruePreviewRuntime.setMoldRoot(moldBlock3dRuntime.object);
        cuttingPlaneRuntime.setTarget(target);
      },
      onFirstInteraction,
      ...(onSplitFaceToggle === undefined ? {} : { onSplitFaceToggle }),
      onSelectionChange: (selection) => {
        if (!selection.isModelSelected) {
          moldBlock3dRuntime.clearTarget();
          cuttingPlaneRuntime.setTarget(null);
        }
        onSelectionChange(selection);
      },
      palette,
      scheduler,
    });
    const measurementRuntime = createModelMeasurementRuntime({
      camera,
      canvas,
      onFirstInteraction,
      onMeasurementChange,
      palette,
      scheduler,
    });

    const localStlRuntime = createLocalStlRuntime({
      camera,
      controls,
      modelRoot,
      scene,
      scheduler,
      onModelStatusChange,
      onModelReplaced: (target) => {
        selectionRuntime.resetForModelReplacement(target);
        measurementRuntime.resetForModelReplacement(target);
        moldBlock3dRuntime.syncTransform();
      },
      onModelTransformed: (target) => {
        selectionRuntime.refreshForModelTransform(target);
        measurementRuntime.resetForModelReplacement(target);
      },
      createGrid: (config) => {
        groundPlaneRuler.setGridConfig(config);
        return createEngineeringGrid(currentPalette, config);
      },
      replaceGrid,
      ...(onCanonicalPartGeometryChange === undefined ? {} : { onCanonicalA3Change: onCanonicalPartGeometryChange }),
      ...(onPartOrientationCommit === undefined ? {} : { onPartOrientationCommit }),
    });

    resizeViewport(host, renderer, camera);
    scheduler.invalidate();

    return {
      clearSelection: selectionRuntime.clearSelection,
      clearMeasurement: measurementRuntime.clearMeasurement,
      fitView: localStlRuntime.fitView,
      loadLocalStl: localStlRuntime.loadLocalStl,
      setModelVisible: localStlRuntime.setModelVisible,
      setSelectionBoxVisible: selectionRuntime.setSelectionBoxVisible,
      setPartOrientation: localStlRuntime.setPartOrientation,
      orientModel: localStlRuntime.orientModel,
      resetView: () => {
        spruePreviewRuntime.clearPreview();
        localStlRuntime.resetView();
      },
      setSplitFaceSelection: selectionRuntime.setSplitFaceSelection,
      setCuttingPlanes: cuttingPlaneRuntime.setPlanes,
      setReferenceMoldDefinition: (definition) => {
        spruePreviewRuntime.setMoldRoot(null);
        sprueResizeRuntime.setMoldRoot(null);
        referenceMoldPartOffset =
          definition?.moldFrame?.partOffset ?? { x: 0, y: 0, z: 0 };
        syncMoldAssemblyOffset();
        moldBlock3dRuntime.setDefinition(definition);
        spruePreviewRuntime.setMoldRoot(
          definition === null ? null : moldBlock3dRuntime.object,
        );
        sprueResizeRuntime.setMoldRoot(
          definition === null ? null : moldBlock3dRuntime.object,
        );
      },
      setMoldAppearanceMode: (mode) => {
        moldBlock3dRuntime.setAppearanceMode(mode);
        masterMoldBody3dRuntime.setAppearanceMode(mode);
        segmentationVisualizationRuntime.setAppearanceMode(mode);
        spruePreviewRuntime.setMoldRoot(moldBlock3dRuntime.object);
        sprueResizeRuntime.setMoldRoot(moldBlock3dRuntime.object);
      },
      setMasterMoldBodies: masterMoldBody3dRuntime.setBodies,
      setSprueCavityGeometry: spruePreviewRuntime.setCavityGeometry,
      setSpruePreviewActive: (active) => {
        selectionRuntime.setInteractionBlocked(active);
        spruePreviewRuntime.setActive(active);
        sprueResizeRuntime.setActive(active);
      },
      setSprues: sprueResizeRuntime.setSprues,
      setEraserInteractionActive:
        cuttingPlaneRuntime.setEraserInteractionActive,
      setSegmentationVisualization: (
        partOffset,
        previewBodies,
        previewPlanes,
        committedBodies,
      ) => {
        segmentationPartOffset = partOffset;
        syncMoldAssemblyOffset();
        segmentationVisualizationRuntime.setVisualization(
          previewBodies,
          previewPlanes,
          committedBodies,
        );
      },
      setMoldScaleInteraction: moldScaleRuntime.setInteraction,
      setActiveTool: (activeTool) => {
        selectionRuntime.setActiveTool(activeTool);
        measurementRuntime.setActiveTool(activeTool);
      },
      setPalette: (nextPalette) => {
        currentPalette = nextPalette;
        setRendererPalette(renderer, nextPalette);
        updateEngineeringGridPalette(grid, nextPalette);
        groundPlaneRuler.setPalette(nextPalette);
        selectionRuntime.setPalette(nextPalette);
        measurementRuntime.setPalette(nextPalette);
        moldBlock3dRuntime.setPalette(nextPalette);
        masterMoldBody3dRuntime.setPalette(nextPalette);
        segmentationVisualizationRuntime.setPalette(nextPalette);
        scheduler.invalidate();
      },
      invalidate: scheduler.invalidate,
      dispose: () => {
        disposed = true;
        scheduler.dispose();
        disposeResizeObserver();
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener(
          "webglcontextrestored",
          handleContextRestored,
        );
        localStlRuntime.dispose();
        controls.dispose();
        selectionRuntime.dispose();
        measurementRuntime.dispose();
        spruePreviewRuntime.dispose();
        sprueResizeRuntime.dispose();
        moldScaleRuntime.dispose();
        moldBlock3dRuntime.dispose();
        masterMoldBody3dRuntime.dispose();
        cuttingPlaneRuntime.dispose();
        segmentationVisualizationRuntime.dispose();
        groundPlaneRuler.dispose();
        disposeScene(scene);
        renderer.dispose();
      },
    };
  } catch {
    onStatusChange({
      phase: "error",
      message: "The 3D viewport could not be started.",
    });

    return createInactiveRuntime({ onModelStatusChange });
  }
}





