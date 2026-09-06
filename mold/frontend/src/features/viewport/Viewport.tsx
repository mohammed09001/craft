import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";
import { useModelImportActions } from "@/features/viewport/modelImport.store";
import { useViewportToolbarSlotElement } from "@/features/viewport/viewportToolbarSlotContext";
import type { DistanceMeasurementStatus } from "@/features/viewport/modelMeasurement.store";
import {
  useDistanceMeasurementActions,
  useDistanceMeasurementStatus,
} from "@/features/viewport/modelMeasurement.store";
import { useViewportCommandRegistration } from "@/features/viewport/viewportCommandContext";
import {
  useModelSelectionActions,
  useModelSelectionStatus,
} from "@/features/viewport/modelSelection.store";
import { MoldBodiesBrowser } from "@/features/mold-generation/reference-mold-definition";
import { useMoldAppearanceStore } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import { selectActiveMoldBodies, selectSpruePresentationDefinitions, SplitFaceControls, useSplitFaceStore } from "@/features/mold-generation/split-face";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import { createReferenceMoldBlockBounds } from "@/features/mold-generation/reference-mold-definition/referenceMoldBlock.geometry";
import { validateLocalStlFiles } from "@/features/viewport/modelImportValidation";
import type {
  ViewportPalette,
  ViewportStatus,
} from "@/features/viewport/viewport.contracts";
import { useViewportRuntime } from "@/features/viewport/useViewportRuntime";
import { resolveViewportTool, useViewportToolStore } from "@/features/viewport/viewportTool.store";
import { shouldIgnoreEscape } from "@/features/viewport/runtime/pointerSelection";
import {
  type PartFlipDirection,
  type PartOrientation,
  usePartOrientationStore,
} from "@/features/viewport/partOrientation.store";
import { PrinterDimensionsPrompt } from "@/features/viewport/PrinterDimensionsPrompt";
import { usePrinterBuildVolume } from "@/features/viewport/printerBuildVolume.store";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import {
  useIsSegmentationVisualizationActive,
  useSegmentationModeStore,
} from "@/features/mold-generation/segmentation";
import {
  CuttingSessionPanel,
  canUseSingletonSplitFaceInteraction,
  moveSegmentationExtensionAxis,
  regenerateSegmentationAfterScale,
  useCuttingWorkflowStore,
} from "@/features/mold-generation/cutting-workflow";
import { useThemeMode } from "@/state/ui-shell";

import styles from "@/features/viewport/Viewport.module.css";

// A stable empty reference so blocking sprue presentation during a
// cutting session never produces a new array identity every render.
const EMPTY_SPRUE_PRESENTATION: readonly import("@/features/mold-generation/sprue-generation").SpruePresentationDefinition[] = [];

const STATUS_LABELS: Record<ViewportStatus["phase"], string> = {
  initializing: "Viewport: Initializing",
  ready: "Viewport: Ready",
  unsupported: "Viewport: Unsupported",
  error: "Viewport: Error",
  "context-lost": "Viewport: Context Lost",
};

const FALLBACK_PALETTE: ViewportPalette = {
  background: "#0b1118",
  gridMajor: "#303943",
  gridMinor: "#46525f",
};
function readPalette(host: HTMLElement | null): ViewportPalette {
  if (host === null) {
    return FALLBACK_PALETTE;
  }

  const style = window.getComputedStyle(host);

  return {
    background: normalizeCssColor(style.backgroundColor),
    gridMajor: normalizeCssColor(style.outlineColor),
    gridMinor: normalizeCssColor(style.borderTopColor),
  };
}

function normalizeCssColor(color: string) {
  const srgbMatch = color.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s+\/\s+([\d.]+))?\)$/u,
  );

  if (srgbMatch === null) {
    return color;
  }

  const [, red, green, blue, alpha] = srgbMatch;
  const channels = [red, green, blue].map((channel) =>
    Math.round(Number(channel) * 255),
  );

  if (alpha === undefined) {
    return `rgb(${channels.join(" ")})`;
  }

  return `rgba(${channels.join(" ")} / ${alpha})`;
}

function getVisibleMessage(status: ViewportStatus) {
  if (status.phase === "initializing") {
    return "Starting interactive 3D viewport.";
  }

  if (status.phase === "unsupported") {
    return "WebGL 2 is not available in this browser.";
  }

  if (status.phase === "error") {
    return "The 3D viewport could not be started.";
  }

  if (status.phase === "context-lost") {
    return "The graphics context was lost and is being restored.";
  }

  return null;
}

function getModelMessage(status: ModelImportStatus) {
  if (status.lastImportError !== undefined) {
    return status.lastImportError;
  }

  if (status.message !== undefined) {
    return status.message;
  }

  if (status.phase === "validating") {
    return "Checking STL file.";
  }

  if (status.phase === "loading") {
    return "Loading STL file.";
  }

  return null;
}

function getMeasurementHudText(measurement: DistanceMeasurementStatus) {
  if (measurement.activeTool === "measure-distance") {
    if (measurement.phase === "awaiting-second-point") {
      return "Select the second point on the model surface.";
    }

    if (measurement.phase === "complete" && measurement.distanceLabel) {
      return measurement.distanceLabel;
    }

    return "Select the first point on the model surface.";
  }

  if (measurement.phase === "complete" && measurement.distanceLabel) {
    return measurement.distanceLabel;
  }

  return null;
}

type ViewportProps = {
  onStatusChange: (status: ViewportStatus) => void;
};

function getFlipDirectionForArrowKey(
  key: string,
): PartFlipDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "forward";
    case "ArrowDown":
      return "backward";
    default:
      return null;
  }
}

export function Viewport({ onStatusChange }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const registerViewportCommands = useViewportCommandRegistration();
  const toolbarSlotElement = useViewportToolbarSlotElement();
  const themeMode = useThemeMode();
  const { resetModelImportStatus, setModelImportStatus } =
    useModelImportActions();
  const {
    clearMeasurement: clearMeasurementState,
    resetMeasurementAfterReplacement,
    setMeasurementStatus,
    toggleMeasureDistance,
  } = useDistanceMeasurementActions();
  const measurementStatus = useDistanceMeasurementStatus();
  // The single authoritative read of whether the unified Constructed
  // Cutting Plan panel is open, and which of its two tabs is active --
  // CuttingSessionPanel and Viewport both derive from this one definition
  // instead of each re-deriving `state.kind` independently.
  const cuttingSessionState = useCuttingWorkflowStore((s) => s.state);
  const isSessionOpen = cuttingSessionState.kind === "sessionOpen";
  const activeSessionTab = isSessionOpen ? cuttingSessionState.activeTab : null;
  const isCutByFaceTabActive = isSessionOpen && activeSessionTab === "cutByFace";
  const isSegmentationTabActive = isSessionOpen && activeSessionTab === "segmentation";
  // Cut by Face reuses the singleton directly (its own tab) -- every other
  // open-session state (Segmentation) must never fall through to mutating
  // the singleton's hidden, not-currently-active data.
  const singletonInteractionBlocked = !canUseSingletonSplitFaceInteraction(cuttingSessionState);
  // Sprue is a post-commit tool (see SplitFaceControls, which stops
  // rendering it -- and everything else -- entirely while any session is
  // open) -- out of scope for the duration of any open session, regardless
  // of tab.
  const sprueInteractionBlocked = isSessionOpen;
  const blockedVoidInteraction = useCallback(() => undefined, []);
  const blockedAsyncInteraction = useCallback(async () => false, []);
  const singletonRemoveSplitFaceAndRebuild = useSplitFaceStore(
    (state) => state.removeSplitFaceAndRebuild,
  );
  const removeSplitFaceAndRebuild = singletonInteractionBlocked
    ? blockedAsyncInteraction
    : singletonRemoveSplitFaceAndRebuild;
  const singletonCreateSprue = useSplitFaceStore((state) => state.createSprue);
  const singletonResizeSprue = useSplitFaceStore((state) => state.resizeSprue);
  const singletonResizeSprueEntryNeck = useSplitFaceStore((state) => state.resizeSprueEntryNeck);
  const singletonSprues = useSplitFaceStore(selectSpruePresentationDefinitions);
  const createSprue = sprueInteractionBlocked ? blockedAsyncInteraction : singletonCreateSprue;
  const resizeSprue = sprueInteractionBlocked ? blockedAsyncInteraction : singletonResizeSprue;
  const resizeSprueEntryNeck = sprueInteractionBlocked
    ? blockedAsyncInteraction
    : singletonResizeSprueEntryNeck;
  const sprues = sprueInteractionBlocked ? EMPTY_SPRUE_PRESENTATION : singletonSprues;
  const toolbarTool = useViewportToolStore(
    (state) => state.activeTool,
  );
  const resetViewportTool = useViewportToolStore((state) => state.resetActiveTool);
  const setViewportTool = useViewportToolStore((state) => state.setActiveTool);
  const effectiveViewportTool = resolveViewportTool(toolbarTool, measurementStatus.activeTool);
  const partOrientation = usePartOrientationStore((state) => state.orientation);
  const commitPartOrientation = usePartOrientationStore(
    (state) => state.commitOrientation,
  );
  const flipPartOrientation = usePartOrientationStore(
    (state) => state.flipOrientation,
  );
  const resetPartOrientationForReplacement = usePartOrientationStore(
    (state) => state.resetForModelReplacement,
  );
  const { resetSelectionAfterReplacement, setModelSelectionStatus } =
    useModelSelectionActions();
  const selectionStatus = useModelSelectionStatus();
  // Printer dimensions are no longer a pre-upload gate -- requested
  // contextually only once the Segmentation tab (which needs printer-aware
  // analysis) is active.
  const printerBuildVolume = usePrinterBuildVolume();
  const needsPrinterDimensionsPrompt =
    isSegmentationTabActive && printerBuildVolume === null;
  const clearSplitWorkflow = useSplitFaceStore((state) => state.clearForModelReplacement);
  const clearSplitWorkflowForOrientation = useSplitFaceStore(
    (state) => state.clearForOrientationChange,
  );

  const baseReferenceMoldDefinition = useSplitFaceStore((state) => state.definition);
  const activeMoldBodies = useSplitFaceStore(selectActiveMoldBodies);
  const sprueCavityGeometry = useSplitFaceStore((state) =>
    state.cavity.status === "complete"
      ? state.cavity.result?.cavityTool ?? null
      : null,
  );
  const selectionBoxAllowedByCavity = useSplitFaceStore(
    (state) =>
      state.cavity.status !== "generating" &&
      state.cavity.status !== "complete",
  );
  const selectionBoxVisible =
    selectionBoxAllowedByCavity;
  const registrationState = useSplitFaceStore((state) => state.registration);
  const spruePresentation = useSplitFaceStore(selectSpruePresentationDefinitions);
  const referenceMoldDefinition = useMemo(
    () =>
      baseReferenceMoldDefinition === null
        ? null
        : {
            ...baseReferenceMoldDefinition,
            moldBodies: activeMoldBodies ?? baseReferenceMoldDefinition.moldBodies,
            registrationFeatures:
              registrationState.status === "generated"
                ? registrationState.report?.features
                : undefined,
            sprues: spruePresentation,
          },
    [activeMoldBodies, baseReferenceMoldDefinition, registrationState, spruePresentation],
  );

  const splitWorkflow = useSplitFaceStore((state) => state.workflow);
  const selectedSplitFaces = useSplitFaceStore((state) => state.selectedFaceIds);
  const cuttingPlanes = useSplitFaceStore((state) => state.cuttingPlanes);
  const cuttingGuidesVisible =
    splitWorkflow !== "partsReady" || effectiveViewportTool === "eraser";
  const singletonClearanceMm = useSplitFaceStore((state) => state.clearanceMm);
  const beginSingletonClearanceEdit = useSplitFaceStore((state) => state.beginClearanceEdit);
  const updateSingletonClearanceEdit = useSplitFaceStore((state) => state.updateClearanceEdit);
  const commitSingletonClearanceEdit = useSplitFaceStore((state) => state.commitClearanceEdit);
  const cancelSingletonClearanceEdit = useSplitFaceStore((state) => state.cancelClearanceEdit);
  const clearanceMm = singletonClearanceMm;
  const moldAppearanceMode = useMoldAppearanceStore((state) => state.mode);
  // K1/K2 for the manual Split Face cutting-plane visualization -- requires
  // an actual selected model (the 3D selection target these planes are
  // parented under), so it stays selection-based, unchanged.
  const cuttingPlaneK1 = selectionStatus.selectionBoxBounds ?? null;
  const cuttingPlaneK2 = useMemo(
    () =>
      cuttingPlaneK1 === null
        ? null
        : createReferenceMoldBlockBounds(cuttingPlaneK1, clearanceMm),
    [cuttingPlaneK1, clearanceMm],
  );
  // Read-only: this viewport never calls requestPlan/acceptPlan/executeAcceptedPlan.
  // It only maps the Segmentation Engine's already-committed plan/result into
  // display objects -- see docs/agent/PROJECT_MAP.md's runtime ownership rule.
  const segmentationPlan = useSegmentationModeStore((state) => state.plan);
  const segmentationResult = useSegmentationModeStore((state) => state.result);
  const segmentationPreview = useSegmentationModeStore((state) => state.preview);
  const segmentationRegistration = useSegmentationModeStore(
    (state) => state.registration,
  );
  const resetSegmentationForMoldScale = useSegmentationModeStore(
    (state) => state.reset,
  );
  // Also requires the Segmentation tab to actually be the active tab -- the
  // segmentation store's own plan/phase persist across tab switches within
  // an open session (initialized once, on first visit -- see
  // cuttingWorkflow.store.ts's ensureSegmentationTabInitialized), so without
  // this its preview/committed bodies would keep rendering after switching
  // away, violating "inactive tab state must not appear in the viewport."
  const segmentationVisualizationActive = useIsSegmentationVisualizationActive() && isSegmentationTabActive;
  const segmentationPartOffset =
    segmentationVisualizationActive
      ? (segmentationPreview?.definition.moldFrame?.partOffset ?? null)
      : null;
  const segmentationPreviewBodies = useMemo(
    () =>
      segmentationVisualizationActive &&
      segmentationResult?.status !== "executed" &&
      segmentationPreview !== null
        ? (segmentationPreview.registration.status === "generated"
            ? (segmentationPreview.registration.bodies ??
              segmentationPreview.unkeyedBodies)
            : segmentationPreview.unkeyedBodies)
        : [],
    [
      segmentationPreview,
      segmentationResult,
      segmentationVisualizationActive,
    ],
  );
  const segmentationPreviewPlanes = useMemo(
    () =>
      segmentationVisualizationActive && segmentationResult?.status !== "executed"
        ? (segmentationPlan?.boundaries ?? [])
        : [],
    [segmentationPlan, segmentationResult, segmentationVisualizationActive],
  );
  const segmentationCommittedBodies = useMemo(
    () =>
      segmentationResult?.status === "executed"
        ? (segmentationRegistration.status === "generated"
            ? (segmentationRegistration.bodies ?? segmentationResult.bodies)
            : segmentationResult.bodies)
        : [],
    [segmentationRegistration, segmentationResult],
  );
  const hasExecutedSegmentationBodies =
    segmentationResult?.status === "executed" &&
    segmentationResult.bodies.length > 0;
  const singletonToggleSplitFace = useSplitFaceStore((state) => state.toggleFace);
  const toggleSplitFace = singletonInteractionBlocked
    ? blockedVoidInteraction
    : singletonToggleSplitFace;
  const singletonBeginPlaneDrag = useSplitFaceStore((state) => state.beginPlaneDrag);
  const beginPlaneDrag = singletonInteractionBlocked
    ? blockedVoidInteraction
    : singletonBeginPlaneDrag;
  const singletonCommitPlaneDrag = useSplitFaceStore((state) => state.commitPlaneDrag);
  const commitPlaneDrag = singletonInteractionBlocked
    ? blockedVoidInteraction
    : singletonCommitPlaneDrag;
  const singletonCancelPlaneDrag = useSplitFaceStore((state) => state.cancelPlaneDrag);
  const cancelPlaneDrag = singletonInteractionBlocked
    ? blockedVoidInteraction
    : singletonCancelPlaneDrag;
  const [isModelVisible, setIsModelVisible] = useState(true);
  const [status, setStatus] = useState<ViewportStatus>({
    phase: "initializing",
  });
  const [modelStatus, setLocalModelStatus] = useState<ModelImportStatus>({
    phase: "no-model",
  });
  const modelStatusRef = useRef<ModelImportStatus>({ phase: "no-model" });
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasLoadedModel, setHasLoadedModel] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [palette, setPalette] = useState<ViewportPalette>(FALLBACK_PALETTE);
  const [canonicalPartGeometry, setCanonicalPartGeometry] = useState<CanonicalPartGeometry | null>(null);
  const setCanonicalPartGeometrySignature = useSplitFaceStore((state) => state.setCanonicalPartGeometrySignature);
  const setGroundedWorldBoundsFromGeometry = useModelBoundsStore((state) => state.setGroundedWorldBoundsFromGeometry);
  const handleCanonicalPartGeometryChange = useCallback((geometry: CanonicalPartGeometry | null) => { setCanonicalPartGeometry(geometry); setCanonicalPartGeometrySignature(geometry?.sourceSignature ?? null); setGroundedWorldBoundsFromGeometry(geometry); }, [setCanonicalPartGeometrySignature, setGroundedWorldBoundsFromGeometry]);
  const handleSpruePlacementRequest = useCallback(
    (placement: import("@/features/mold-generation/sprue-generation").SpruePreviewPlacement) =>
      createSprue(placement),
    [createSprue],
  );
  const handleSprueDiameterCommit = useCallback(
    (operationId: string, diameterMm: number) => resizeSprue(operationId, diameterMm),
    [resizeSprue],
  );
  const handleSprueEntryNeckDiameterCommit = useCallback(
    (operationId: string, diameterMm: number) => resizeSprueEntryNeck(operationId, diameterMm),
    [resizeSprueEntryNeck],
  );
  const handleMoldScaleUpdate = useCallback(
    (clearanceMm: number) => {
      updateSingletonClearanceEdit(clearanceMm);
      // Segmentation owns a separate result store. Scaling K2 invalidates its
      // plan/result immediately, but reset only cancels/clears state;
      // it does not dispatch geometry work.
      resetSegmentationForMoldScale();
    },
    [resetSegmentationForMoldScale, updateSingletonClearanceEdit],
  );
  const handleMoldScaleCommit = useCallback(() => {
    commitSingletonClearanceEdit();
    // Fire-and-forget: the whole-K2 base committed synchronously above is
    // already a truthful current result on its own (see
    // regenerateSegmentationAfterScale's own doc comment for why this
    // orchestrator -- not this read-only viewport -- is the one allowed to
    // drive requestPlan/acceptPlan/executeAcceptedPlan). Segmentation
    // regeneration is this same Scale gesture's asynchronous tail, not a
    // separate user action to wait on here.
    void regenerateSegmentationAfterScale();
  }, [commitSingletonClearanceEdit]);

  useLayoutEffect(() => {
    setPalette(readPalette(hostRef.current));
  }, [themeMode]);

  useEffect(() => {
    resetModelImportStatus();
    resetMeasurementAfterReplacement();
    resetSelectionAfterReplacement();
  }, [
    resetMeasurementAfterReplacement,
    resetModelImportStatus,
    resetSelectionAfterReplacement,
  ]);

  const handleStatusChange = useCallback(
    (nextStatus: ViewportStatus) => {
      setStatus(nextStatus);
      onStatusChange(nextStatus);
    },
    [onStatusChange],
  );

  const handleModelStatusChange = useCallback(
    (nextStatus: ModelImportStatus) => {
      const currentStatus = modelStatusRef.current;
      const shouldPreserveReadyModel =
        currentStatus.phase === "ready" &&
        (nextStatus.phase === "invalid" || nextStatus.phase === "error");
      const resolvedStatus = shouldPreserveReadyModel
        ? {
            ...currentStatus,
            lastImportError:
              nextStatus.message ?? "The STL file could not be loaded.",
          }
        : nextStatus;

      modelStatusRef.current = resolvedStatus;
      setLocalModelStatus(resolvedStatus);
      setModelImportStatus(resolvedStatus);

      if (
        resolvedStatus.phase === "loading" ||
        resolvedStatus.phase === "no-model"
      ) {
        resetPartOrientationForReplacement();
        resetViewportTool();
        clearSplitWorkflow();
      }

      if (resolvedStatus.phase === "ready") {
        setHasLoadedModel(true);
      }
    },
    [
      clearSplitWorkflow,
      resetPartOrientationForReplacement,
      resetViewportTool,
      setModelImportStatus,
    ],
  );

  const handleFirstInteraction = useCallback(() => {
    setHasInteracted(true);
  }, []);

  const handlePlaneCommit = useCallback((id: string, normalized: number) => {
    if (cuttingPlaneK1 === null) {
      cancelPlaneDrag();
      return;
    }
    commitPlaneDrag(id, normalized, cuttingPlaneK1);
    // A segmentation extension plane only ever lives on the singleton (see
    // Viewport.tsx's cuttingPlanes prop, filtered to extension provenance
    // while the Segmentation tab owns the model) -- forward its new
    // authoritative world coordinate (already the same absolute
    // grounded-world mm space segmentation's own aggregateBounds uses, no
    // conversion needed) so geometry execution stays in sync with the drag.
    const plane = useSplitFaceStore
      .getState()
      .cuttingPlanes.find((candidate) => candidate.id === id);
    if (
      plane !== undefined &&
      plane.provenance.startsWith("segmentation-extension") &&
      plane.lastValidWorldCoordinate !== undefined
    ) {
      moveSegmentationExtensionAxis(plane.axis, plane.lastValidWorldCoordinate);
    }
  }, [cancelPlaneDrag, commitPlaneDrag, cuttingPlaneK1]);

  const {
    clearMeasurement: clearMeasurementRuntime,
    fitView,
    loadLocalStl,
    setModelVisible: setModelVisibleRuntime,
    resetView,
  } = useViewportRuntime({
    hostRef,
    canvasRef,
    palette,
    activeTool: measurementStatus.activeTool,
    partOrientation,
    orientationToolActive: effectiveViewportTool === "orientation",
    referenceMoldDefinition,
    moldAppearanceMode,
    sprueCavityGeometry,
    spruePreviewActive:
      effectiveViewportTool === "sprue" && !isSessionOpen,
    sprues,
    selectionBoxVisible,
    eraserInteractionActive: effectiveViewportTool === "eraser",
    // Only the Cut by Face tab (the singleton, directly) may ever expose
    // interactive face-selection -- Segmentation has no face-based cutting
    // planes of its own, and outside any open session there is nothing to
    // select (Cut by Face interaction now lives entirely inside the panel's
    // own tab, not on the idle main toolbar).
    splitFaceSelectionActive: cuttingGuidesVisible &&
      isCutByFaceTabActive &&
      ["selectingFaces", "planesReady", "error"].includes(splitWorkflow),
    selectedSplitFaces,
    // Ordinary (non-extension) Split Face cutting planes must never render
    // while the Segmentation tab owns the model -- the two cutting systems
    // must not appear active at the same time (see segmentationPreviewPlanes/
    // segmentationCommittedBodies below, which are the sole source of
    // algorithm-generated, locked orange planes/bodies in that state).
    // Likewise, the singleton's own (possibly stale, pre-session) cutting
    // planes must never render while a different tab owns the panel.
    // A user-added segmentation EXTENSION plane is the one deliberate
    // exception in both states -- it is a real, live, user-editable plane
    // on this same singleton (see addSegmentationExtensionAxis), on an axis
    // the algorithm's own locked planes never used, so it must still render
    // and stay draggable through this same interactive runtime rather than
    // being swept into the blanket suppression meant for stale/irrelevant
    // planes.
    cuttingPlanes: !cuttingGuidesVisible
      ? []
      : !isSessionOpen
        ? cuttingPlanes
        : isCutByFaceTabActive
          ? cuttingPlanes
          : cuttingPlanes.filter((plane) => plane.provenance.startsWith("segmentation-extension")),
    cuttingPlaneK1,
    cuttingPlaneK2,
    segmentationPartOffset,
    segmentationPreviewBodies,
    segmentationPreviewPlanes,
    segmentationCommittedBodies,
    // The global command is deliberately unavailable while a cutting draft
    // owns the viewport. Its preview reads only the canonical imported bounds
    // and its single commit writes only the singleton clearance.
    moldScaleActive: effectiveViewportTool === "mold-scale" && !isSessionOpen,
    moldScaleClearanceMm: singletonClearanceMm,
    onSplitFaceToggle: toggleSplitFace,
    onCuttingPlaneDragStart: beginPlaneDrag,
    onCuttingPlaneDragCommit: handlePlaneCommit,
    onCuttingPlaneDragCancel: cancelPlaneDrag,
    onCuttingPlaneErase: (faceId) => {
      const modelId = selectionStatus.selectedModelId;
      const selectionBoxBounds =
        selectionStatus.selectionBoxBounds;

      if (
        modelId === undefined ||
        selectionBoxBounds === undefined
      ) {
        return;
      }

      void removeSplitFaceAndRebuild(
        faceId,
        modelId,
        selectionBoxBounds,
      );
    },
    onCanonicalPartGeometryChange: handleCanonicalPartGeometryChange,
    onSpruePlacementRequest: handleSpruePlacementRequest,
    onSprueDiameterCommit: handleSprueDiameterCommit,
    onSprueEntryNeckDiameterCommit: handleSprueEntryNeckDiameterCommit,
    onPartOrientationCommit: (orientation: PartOrientation) => {
      // Orientation is a singleton-only physical transform with no
      // per-draft concept -- flipping the model out from under an active
      // tab's world-space cutting-plane definitions would silently
      // invalidate them without that tab ever being notified. Flip itself
      // is only ever offered on the idle main toolbar (SplitFaceControls),
      // before a session opens -- this guard is defense in depth, not the
      // only thing preventing it during a session.
      if (isSessionOpen) return false;
      const committed = commitPartOrientation(orientation);
      if (committed) {
        clearSplitWorkflowForOrientation();
      }
      return committed;
    },
    onMoldScaleBegin: beginSingletonClearanceEdit,
    onMoldScaleUpdate: handleMoldScaleUpdate,
    onMoldScaleCommit: handleMoldScaleCommit,
    onMoldScaleCancel: cancelSingletonClearanceEdit,
    onStatusChange: handleStatusChange,
    onModelStatusChange: handleModelStatusChange,
    onMeasurementChange: setMeasurementStatus,
    onSelectionChange: setModelSelectionStatus,
    onFirstInteraction: handleFirstInteraction,
  });


  const handleModelVisibilityChange = useCallback((visible: boolean) => {
    setIsModelVisible(visible);
  }, []);

  // Single authority for the imported model's runtime visibility: the user's
  // own toggle (isModelVisible) combined with the Segmentation Engine having
  // produced a committed, executed result. Segmentation state is only read
  // here, never written.
  useEffect(() => {
    setModelVisibleRuntime(isModelVisible && !hasExecutedSegmentationBodies);
  }, [hasExecutedSegmentationBodies, isModelVisible, setModelVisibleRuntime]);

  // A committed Segmentation result is now promoted into the singleton
  // imperatively, inside cuttingWorkflow.store.ts's commitActiveTab, at the
  // moment Done commits it -- not reactively here. Doing it there instead of
  // in a `useEffect` watching segmentationPhase/segmentationResult removes
  // an entire class of self-invalidation race: the promotion's own write to
  // the singleton used to retrigger segmentationMode.store.ts's own
  // handleUpstreamChange staleness subscription, which could mark the
  // just-executed result stale before the reactive effect's promotion had
  // even run. commitActiveTab's single synchronous sequence (execute, then
  // promote) has no such gap.

  const importFiles = useCallback(
    (files: FileList | readonly File[] | null) => {
      const result = validateLocalStlFiles(files);

      if (!result.ok) {
        handleModelStatusChange(result.status);
        return;
      }

      handleModelStatusChange({
        phase: "validating",
        fileName: result.file.name,
        fileSize: result.file.size,
      });
      setIsModelVisible(true);
      loadLocalStl(result.file);
    },
    [handleModelStatusChange, loadLocalStl],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFitView = useCallback(() => {
    fitView();
  }, [fitView]);

  const handleResetView = useCallback(() => {
    resetView();
  }, [resetView]);

  const handleOrientModel = useCallback(() => {
    setViewportTool(toolbarTool === "orientation" ? "pointer" : "orientation");
  }, [setViewportTool, toolbarTool]);

function isIgnoredFlipKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('button[aria-label="Flip"]')) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLOptionElement ||
    target instanceof HTMLButtonElement ||
    target.closest(
      "input, textarea, select, option, button, [contenteditable=''],[contenteditable='true']",
    ) !== null
  );
}

  const activeFlipKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Orientation flip has no per-tab concept and must not fire while any
    // cutting session is open -- same reasoning as onPartOrientationCommit
    // above.
    if (toolbarTool !== "orientation" || isSessionOpen) {
      activeFlipKeyRef.current = null;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (shouldIgnoreEscape(event)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        setViewportTool("pointer");
        return;
      }

      const direction = getFlipDirectionForArrowKey(event.key);
      if (direction === null || isIgnoredFlipKeyboardTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || activeFlipKeyRef.current === event.key) {
        return;
      }

      activeFlipKeyRef.current = event.key;
      if (flipPartOrientation(direction)) {
        clearSplitWorkflowForOrientation();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (getFlipDirectionForArrowKey(event.key) === null) {
        return;
      }
      if (activeFlipKeyRef.current === event.key) {
        activeFlipKeyRef.current = null;
      }
      if (isIgnoredFlipKeyboardTarget(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const clearPressedKey = () => {
      activeFlipKeyRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", clearPressedKey);
    return () => {
      activeFlipKeyRef.current = null;
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", clearPressedKey);
    };
  }, [clearSplitWorkflowForOrientation, flipPartOrientation, isSessionOpen, setViewportTool, toolbarTool]);

  const handleActivateMeasureDistance = useCallback(() => {
    if (measurementStatus.activeTool !== "measure-distance") {
      setViewportTool("pointer");
      toggleMeasureDistance();
    }
  }, [measurementStatus.activeTool, setViewportTool, toggleMeasureDistance]);

  const handleReturnToSelect = useCallback(() => {
    if (measurementStatus.activeTool === "measure-distance") {
      toggleMeasureDistance();
    }
  }, [measurementStatus.activeTool, toggleMeasureDistance]);

  const handleClearMeasurement = useCallback(() => {
    clearMeasurementRuntime();
    clearMeasurementState();
  }, [clearMeasurementRuntime, clearMeasurementState]);

  const viewportCommands = useMemo(
    () => ({
      "clear-measurement": handleClearMeasurement,
      "fit-view": handleFitView,
      "import-stl": handleImportClick,
      "measure-distance": handleActivateMeasureDistance,
      "orient-model": handleOrientModel,
      "replace-stl": handleImportClick,
      "reset-view": handleResetView,
      "return-to-select": handleReturnToSelect,
    }),
    [
      handleActivateMeasureDistance,
      handleClearMeasurement,
      handleFitView,
      handleImportClick,
      handleOrientModel,
      handleResetView,
      handleReturnToSelect,
    ],
  );

  useEffect(
    () => registerViewportCommands(viewportCommands),
    [registerViewportCommands, viewportCommands],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      importFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    },
    [importFiles],
  );

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(true);
    },
    [],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }

      setIsDragActive(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
      importFiles(event.dataTransfer.files);
    },
    [importFiles],
  );

  const visibleMessage = getVisibleMessage(status);
  const modelMessage = getModelMessage(modelStatus);
  const isInitializing = status.phase === "initializing";
  const isModelBusy =
    modelStatus.phase === "validating" || modelStatus.phase === "loading";
  const showEmptyModelOverlay =
    !hasLoadedModel &&
    visibleMessage === null &&
    !isModelBusy &&
    (modelStatus.phase === "no-model" ||
      modelStatus.phase === "invalid" ||
      modelStatus.phase === "error");
  const showHint =
    status.phase === "ready" && hasLoadedModel && !hasInteracted && !isModelBusy;
  const showModelNotice =
    hasLoadedModel &&
    !isModelBusy &&
    modelMessage !== null &&
    (modelStatus.phase === "invalid" ||
      modelStatus.phase === "error" ||
      modelStatus.lastImportError !== undefined);
  const canInspectModel = modelStatus.phase === "ready";
  const measurementHudText = getMeasurementHudText(measurementStatus);
  const showMeasurementHud = canInspectModel && measurementHudText !== null;

  return (
    <section
      aria-busy={isInitializing || isModelBusy}
      aria-describedby="viewport-live-status viewport-selection-description viewport-drop-description"
      aria-label="Interactive 3D viewport"
      className={`${styles.viewport} ${
        isDragActive ? styles.dragActive : ""
      } ${
        toolbarTool === "eraser"
          ? styles.eraserMode
          : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDown={handleFirstInteraction}
      onWheel={handleFirstInteraction}
      ref={hostRef}
      role="region"
      tabIndex={0}
    >
      <p className={styles.srStatus} id="viewport-selection-description">
        When an STL model is loaded, click the model to select it. Press Escape
        to clear selection.
      </p>
      <p className={styles.srStatus} id="viewport-drop-description">
        Drag and drop one STL file to import it.
      </p>
      <canvas aria-hidden="true" className={styles.canvas} ref={canvasRef} />

      {needsPrinterDimensionsPrompt && <PrinterDimensionsPrompt />}

      {toolbarSlotElement !== null &&
        createPortal(
          <SplitFaceControls
            canonicalPartGeometry={canonicalPartGeometry}
            selection={selectionStatus}
          />,
          toolbarSlotElement,
        )}

      {/*
       * Docked to the side of the viewport (Fusion 360-style tool panel),
       * not the header's toolbarSlot -- mounted directly in this
       * position:relative host, the same convention MoldBodiesBrowser
       * (docked top-left) already uses, so the two never fight over the
       * same portal/stacking context. See CuttingSessionPanel.module.css's
       * own doc comment.
       */}
      <CuttingSessionPanel
        canonicalPartGeometry={canonicalPartGeometry}
        modelId={selectionStatus.selectedModelId}
        selectionBoxBounds={selectionStatus.selectionBoxBounds}
      />

      <MoldBodiesBrowser
        modelVisible={isModelVisible}
        onModelVisibilityChange={handleModelVisibilityChange}
      />

      <input
        accept=".stl"
        aria-label="Local STL file"
        className={styles.fileInput}
        onChange={handleFileInputChange}
        ref={fileInputRef}
        type="file"
      />

      {visibleMessage !== null && (
        <div className={styles.overlay}>
          <p className={styles.message}>{visibleMessage}</p>
        </div>
      )}

      {showEmptyModelOverlay && (
        <div
          aria-label="Drop zone for one local STL file"
          className={styles.emptyOverlay}
        >
          <p className={styles.emptyTitle}>No model loaded.</p>
          <p className={styles.emptyText}>
            Import a local STL file to inspect it.
          </p>
          <p className={styles.emptyText}>
            Drag and drop one STL file
          </p>
          {modelMessage !== null && (
            <p className={styles.modelMessage} role="alert">
              {modelMessage}
            </p>
          )}
        </div>
      )}

      {isModelBusy && (
        <div aria-live="polite" className={styles.loadingBadge}>
          {modelMessage}
        </div>
      )}

      {showMeasurementHud && (
        <div className={styles.measurementHud} aria-live="polite">
          <span className={styles.measurementLabel}>
            {measurementStatus.activeTool === "measure-distance"
              ? "Measure Distance"
              : "Distance"}
          </span>
          <span className={styles.measurementValue}>{measurementHudText}</span>
        </div>
      )}


      {showModelNotice && (
        <div className={styles.modelNotice} role="alert">
          {modelMessage}
        </div>
      )}

      {showHint && (
        <div className={styles.hint}>
          Left drag Rotate · Right drag Pan · Wheel Zoom
        </div>
      )}

      <div
        aria-live="polite"
        className={styles.srStatus}
        id="viewport-live-status"
      >
        {measurementStatus.announcement ??
          selectionStatus.announcement ??
          modelMessage ??
          status.message ??
          STATUS_LABELS[status.phase]}
      </div>
    </section>
  );
}
















