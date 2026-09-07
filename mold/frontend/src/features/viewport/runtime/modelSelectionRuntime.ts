import {
  Raycaster,
  Vector2,
  type Camera,
  type Intersection,
  type Object3D,
} from "three";

import type { ModelSelectionStatus } from "@/features/viewport/modelSelection.store";
import type { ActiveViewportTool } from "@/features/viewport/modelMeasurement.store";
import { createModelSelectionHighlight } from "@/features/viewport/runtime/modelSelectionHighlight";
import {
  createPointerGesture,
  isClickCandidate,
  normalizePointerToNdc,
  updatePointerGesture,
  type PointerGesture,
} from "@/features/viewport/runtime/pointerSelection";
import { shouldIgnoreEscape } from "@/features/viewport/shouldIgnoreEscape";
import type { RenderScheduler } from "@/features/viewport/runtime/renderScheduler";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";
import type { PartBoundingBoxFaceId } from "@/features/mold-generation/split-face";

type CurrentModelTarget = {
  modelId: string;
  target: Object3D;
};

type ModelSelectionRuntimeOptions = {
  camera: Camera;
  canvas: HTMLCanvasElement;
  onSelectionBoxAvailable?: (
    modelId: string,
    target: Object3D,
    bounds: import("@/features/viewport/runtime/objectSelectionBoxRuntime").ObjectSelectionBoxBounds,
  ) => void;
  onModelRemoved?: () => void;
  onFirstInteraction?: (() => void) | undefined;
  onSelectionChange: (status: ModelSelectionStatus) => void;
  onSplitFaceToggle?: (face: PartBoundingBoxFaceId) => void;
  palette: ViewportPalette;
  scheduler: RenderScheduler;
};

export type ModelSelectionRuntime = {
  clearSelection: () => void;
  dispose: () => void;
  refreshForModelTransform: (target: CurrentModelTarget) => void;
  resetForModelReplacement: (target: CurrentModelTarget | null) => void;
  setActiveTool: (activeTool: ActiveViewportTool) => void;
  setInteractionBlocked: (blocked: boolean) => void;
  setPalette: (palette: ViewportPalette) => void;
  setSelectionBoxVisible: (visible: boolean) => void;
  setSplitFaceSelection: (active: boolean, selected: readonly PartBoundingBoxFaceId[]) => void;
};

export function createModelSelectionRuntime({
  camera,
  canvas,
  onSelectionBoxAvailable,
  onModelRemoved,
  onFirstInteraction,
  onSelectionChange,
  onSplitFaceToggle,
  palette: initialPalette,
  scheduler,
}: ModelSelectionRuntimeOptions): ModelSelectionRuntime {
  const raycaster = new Raycaster();
  const pointerNdc = new Vector2();
  const highlight = createModelSelectionHighlight();
  const intersections: Intersection<Object3D>[] = [];
  let currentModel: CurrentModelTarget | null = null;
  let selectedModelId: string | null = null;
  let hovered = false;
  let disposed = false;
  let gesture: PointerGesture | null = null;
  let hoverFrame: number | null = null;
  let latestHoverEvent: PointerEvent | null = null;
  let activeTool: ActiveViewportTool = "select";
  let palette = initialPalette;
  let splitFaceSelectionActive = false;
  let selectedSplitFaces: readonly PartBoundingBoxFaceId[] = [];
  let selectionBoxVisible = true;
  let interactionBlocked = false;

  function clearSelectionBoxFaceHover() {
    if (highlight.clearSelectionBoxFaceHover()) {
      scheduler.invalidate();
    }
  }

  function updateSelectionBoxFaceHover() {
    if (currentModel === null || selectedModelId !== currentModel.modelId) {
      clearSelectionBoxFaceHover();
      return;
    }

    if (highlight.updateSelectionBoxFaceHover(intersections)) {
      scheduler.invalidate();
    }
  }

  function pickModel(point: { clientX: number; clientY: number }) {
    if (interactionBlocked || activeTool !== "select" || currentModel === null) {
      clearSelectionBoxFaceHover();
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    const normalizedPoint = normalizePointerToNdc(point, rect, pointerNdc);

    if (normalizedPoint === null) {
      clearSelectionBoxFaceHover();
      return false;
    }

    raycaster.setFromCamera(normalizedPoint, camera);
    intersections.length = 0;
    raycaster.intersectObject(currentModel.target, true, intersections);
    updateSelectionBoxFaceHover();

    return intersections.length > 0;
  }

  function setHovered(nextHovered: boolean) {
    if (hovered === nextHovered) {
      return;
    }

    hovered = nextHovered;
    canvas.style.cursor = hovered ? "pointer" : "";
  }

  function cancelHoverFrame() {
    if (hoverFrame !== null) {
      window.cancelAnimationFrame(hoverFrame);
      hoverFrame = null;
    }

    latestHoverEvent = null;
  }

  function scheduleHover(event: PointerEvent) {
    if (
      interactionBlocked ||
      activeTool !== "select" ||
      gesture?.isDrag === true ||
      currentModel === null
    ) {
      clearSelectionBoxFaceHover();
      setHovered(false);
      return;
    }

    latestHoverEvent = event;

    if (hoverFrame !== null) {
      return;
    }

    hoverFrame = window.requestAnimationFrame(() => {
      hoverFrame = null;

      if (disposed || latestHoverEvent === null || gesture?.isDrag === true) {
        return;
      }

      setHovered(pickModel(latestHoverEvent));
    });
  }

  function emitClearSelection(announcement?: string) {
    selectedModelId = null;
    clearSelectionBoxFaceHover();
    highlight.clear();
    scheduler.invalidate();
    onSelectionChange(
      announcement === undefined
        ? { isModelSelected: false }
        : {
            isModelSelected: false,
            announcement,
          },
    );
  }

  function clearSelection() {
    if (selectedModelId === null) {
      return;
    }

    emitClearSelection("Selection cleared.");
  }

  function selectCurrentModel() {
    if (currentModel === null) {
      return;
    }

    if (selectedModelId === currentModel.modelId) {
      return;
    }

    selectedModelId = currentModel.modelId;
    highlight.apply(currentModel.target, palette);
    const selectionBoxBounds = highlight.getSelectionBoxBounds();
    if (selectionBoxBounds !== null) {
      onSelectionBoxAvailable?.(
        currentModel.modelId,
        currentModel.target,
        selectionBoxBounds,
      );
    }
    scheduler.invalidate();
    onSelectionChange({
      isModelSelected: true,
      selectedModelId,
      ...(selectionBoxBounds === null ? {} : {
        selectionBoxBounds: {
          min: { x: selectionBoxBounds.min.x, y: selectionBoxBounds.min.y, z: selectionBoxBounds.min.z },
          max: { x: selectionBoxBounds.max.x, y: selectionBoxBounds.max.y, z: selectionBoxBounds.max.z },
        },
      }),
      announcement: "Model selected.",
    });
  }

  function handlePointerDown(event: PointerEvent) {
    onFirstInteraction?.();

    if (!event.isPrimary) {
      return;
    }

    if (interactionBlocked || activeTool !== "select") {
      clearSelectionBoxFaceHover();
      setHovered(false);
      return;
    }

    gesture = createPointerGesture(event);
    setHovered(false);
  }

  function handlePointerMove(event: PointerEvent) {
    if (interactionBlocked || activeTool !== "select" || !event.isPrimary) {
      return;
    }

    if (gesture !== null && gesture.pointerId === event.pointerId) {
      updatePointerGesture(gesture, event);

      if (gesture.isDrag) {
        cancelHoverFrame();
        clearSelectionBoxFaceHover();
        setHovered(false);
        return;
      }
    }

    scheduleHover(event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (
      interactionBlocked ||
      activeTool !== "select" ||
      gesture === null ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    const completedGesture = gesture;
    gesture = null;

    if (completedGesture.button !== 0 || !isClickCandidate(completedGesture)) {
      return;
    }

    if (pickModel(event)) {
      if (splitFaceSelectionActive && selectedModelId === currentModel?.modelId) {
        const target = highlight.getSelectionBoxHoverTarget();
        if (target !== null) {
          onSplitFaceToggle?.(target.face);
          return;
        }
      }

      selectCurrentModel();
      return;
    }

    clearSelection();
  }

  function handlePointerCancel(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) {
      gesture = null;
    }

    cancelHoverFrame();
    clearSelectionBoxFaceHover();
    setHovered(false);
  }

  function handlePointerLeave() {
    gesture = null;
    cancelHoverFrame();
    clearSelectionBoxFaceHover();
    setHovered(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || shouldIgnoreEscape(event)) {
      return;
    }

    clearSelection();
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  window.addEventListener("keydown", handleKeyDown);

  return {
    clearSelection,
    dispose: () => {
      disposed = true;
      cancelHoverFrame();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("keydown", handleKeyDown);
      setHovered(false);
      clearSelectionBoxFaceHover();
      highlight.dispose();
      currentModel = null;
      selectedModelId = null;
      gesture = null;
    },
    refreshForModelTransform: (target) => {
      if (
        currentModel?.modelId !== target.modelId ||
        selectedModelId !== target.modelId
      ) {
        return;
      }
      currentModel = target;
      selectedModelId = null;
      highlight.clear();
      selectCurrentModel();
      highlight.setSelectionBoxVisible(selectionBoxVisible);
      highlight.setSelectionBoxSelectedFaces(
        splitFaceSelectionActive ? selectedSplitFaces : [],
      );
    },
    resetForModelReplacement: (target) => {
      const hadSelection = selectedModelId !== null;

      currentModel = target;
      selectedModelId = null;
      cancelHoverFrame();
      clearSelectionBoxFaceHover();
      setHovered(false);
      highlight.clear();
      onModelRemoved?.();
      onSelectionChange({ isModelSelected: false });

      if (hadSelection) {
        scheduler.invalidate();
      }
    },
    setActiveTool: (nextActiveTool) => {
      activeTool = nextActiveTool;
      if (activeTool !== "select") {
        gesture = null;
        cancelHoverFrame();
        clearSelectionBoxFaceHover();
        setHovered(false);
      }
    },
    setInteractionBlocked: (blocked) => {
      interactionBlocked = blocked;
      if (blocked) {
        gesture = null;
        cancelHoverFrame();
        clearSelectionBoxFaceHover();
        setHovered(false);
      }
    },
    setPalette: (nextPalette) => {
      palette = nextPalette;
      highlight.updatePalette(nextPalette);
      if (selectedModelId !== null) {
        scheduler.invalidate();
      }
    },
    setSelectionBoxVisible: (visible) => {
      selectionBoxVisible = visible;
      if (!visible) {
        clearSelectionBoxFaceHover();
      }

      if (highlight.setSelectionBoxVisible(visible)) {
        scheduler.invalidate();
      }
    },
    setSplitFaceSelection: (active, selected) => {
      splitFaceSelectionActive = active;
      selectedSplitFaces = selected;
      highlight.setSelectionBoxSelectedFaces(active ? selected : []);
      scheduler.invalidate();
    },
  };
}
