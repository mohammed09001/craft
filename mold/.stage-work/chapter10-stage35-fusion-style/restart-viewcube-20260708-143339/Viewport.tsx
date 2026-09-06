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

import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";
import { useModelImportActions } from "@/features/viewport/modelImport.store";
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
import { validateLocalStlFiles } from "@/features/viewport/modelImportValidation";
import type {
  ViewportPalette,
  ViewportStatus,
} from "@/features/viewport/viewport.contracts";
import { useViewportRuntime } from "@/features/viewport/useViewportRuntime";
import { useThemeMode } from "@/state/ui-shell";

import styles from "@/features/viewport/Viewport.module.css";
import { MoldOrientationCube } from "../mold-generation/MoldOrientationCube";

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

export function Viewport({ onStatusChange }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const registerViewportCommands = useViewportCommandRegistration();
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
  const { resetSelectionAfterReplacement, setModelSelectionStatus } =
    useModelSelectionActions();
  const selectionStatus = useModelSelectionStatus();
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

      if (resolvedStatus.phase === "ready") {
        setHasLoadedModel(true);
      }
    },
    [setModelImportStatus],
  );

  const handleFirstInteraction = useCallback(() => {
    setHasInteracted(true);
  }, []);

  const {
    clearMeasurement: clearMeasurementRuntime,
    fitView,
    loadLocalStl,
    orientModel,
    resetView,
  } = useViewportRuntime({
    hostRef,
    canvasRef,
    palette,
    activeTool: measurementStatus.activeTool,
    onStatusChange: handleStatusChange,
    onModelStatusChange: handleModelStatusChange,
    onMeasurementChange: setMeasurementStatus,
    onSelectionChange: setModelSelectionStatus,
    onFirstInteraction: handleFirstInteraction,
  });

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
    orientModel();
  }, [orientModel]);

  const handleActivateMeasureDistance = useCallback(() => {
    if (measurementStatus.activeTool !== "measure-distance") {
      toggleMeasureDistance();
    }
  }, [measurementStatus.activeTool, toggleMeasureDistance]);

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
      className={`${styles.viewport} ${isDragActive ? styles.dragActive : ""}`}
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
      <MoldOrientationCube />
      <p className={styles.srStatus} id="viewport-selection-description">
        When an STL model is loaded, click the model to select it. Press Escape
        to clear selection.
      </p>
      <canvas aria-hidden="true" className={styles.canvas} ref={canvasRef} />

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
          <p className={styles.emptyText} id="viewport-drop-description">
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



