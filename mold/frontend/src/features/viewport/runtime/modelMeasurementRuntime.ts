import {
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
  type Object3D,
} from "three";

import type {
  ActiveViewportTool,
  DistanceMeasurementStatus,
  SerializablePoint3,
} from "@/features/viewport/modelMeasurement.store";
import {
  calculateEuclideanDistance,
  formatModelUnitsDistance,
} from "@/features/viewport/modelMeasurement.store";
import {
  createPointerGesture,
  isClickCandidate,
  normalizePointerToNdc,
  shouldIgnoreEscape,
  updatePointerGesture,
  type PointerGesture,
} from "@/features/viewport/runtime/pointerSelection";
import type { RenderScheduler } from "@/features/viewport/runtime/renderScheduler";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

type CurrentModelTarget = {
  modelId: string;
  target: Object3D;
};

type ModelMeasurementRuntimeOptions = {
  camera: Camera;
  canvas: HTMLCanvasElement;
  onFirstInteraction?: (() => void) | undefined;
  onMeasurementChange: (status: DistanceMeasurementStatus) => void;
  palette: ViewportPalette;
  scheduler: RenderScheduler;
};

export type ModelMeasurementRuntime = {
  clearMeasurement: () => void;
  dispose: () => void;
  resetForModelReplacement: (target: CurrentModelTarget | null) => void;
  setActiveTool: (activeTool: ActiveViewportTool) => void;
  setPalette: (palette: ViewportPalette) => void;
};

function toSerializablePoint(point: Vector3): SerializablePoint3 {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
  };
}

function toVector3(point: SerializablePoint3) {
  return new Vector3(point.x, point.y, point.z);
}

function createMarkerMaterial(palette: ViewportPalette) {
  const isLight = new Color(palette.background).getHSL({ h: 0, s: 0, l: 0 }).l >
    0.5;

  return new MeshBasicMaterial({
    color: isLight ? 0x1d4ed8 : 0xfbbf24,
    depthTest: true,
  });
}

function createLineMaterial(palette: ViewportPalette) {
  const isLight = new Color(palette.background).getHSL({ h: 0, s: 0, l: 0 }).l >
    0.5;

  return new LineBasicMaterial({
    color: isLight ? 0x1d4ed8 : 0xfbbf24,
    depthTest: true,
  });
}

export function createModelMeasurementRuntime({
  camera,
  canvas,
  onFirstInteraction,
  onMeasurementChange,
  palette: initialPalette,
  scheduler,
}: ModelMeasurementRuntimeOptions): ModelMeasurementRuntime {
  const raycaster = new Raycaster();
  const pointerNdc = new Vector2();
  const intersections: Intersection<Object3D>[] = [];
  const overlayRoot = new Group();
  const markerGeometry = new SphereGeometry(0.06, 16, 8);
  let markerMaterial = createMarkerMaterial(initialPalette);
  let lineMaterial = createLineMaterial(initialPalette);
  let line: Line | null = null;
  let firstMarker: Mesh | null = null;
  let secondMarker: Mesh | null = null;
  let currentModel: CurrentModelTarget | null = null;
  let activeTool: ActiveViewportTool = "select";
  let gesture: PointerGesture | null = null;
  let firstPoint: SerializablePoint3 | null = null;
  let secondPoint: SerializablePoint3 | null = null;
  let distance: number | null = null;
  let disposed = false;

  overlayRoot.name = "Distance Measurement Overlay";

  function phase(): DistanceMeasurementStatus["phase"] {
    if (activeTool === "select") {
      return distance === null ? "inactive" : "complete";
    }

    if (firstPoint === null) {
      return "awaiting-first-point";
    }

    if (secondPoint === null) {
      return "awaiting-second-point";
    }

    return "complete";
  }

  function emit(announcement?: string) {
    const status: DistanceMeasurementStatus = {
      activeTool,
      phase: phase(),
    };

    if (firstPoint !== null) {
      status.firstPoint = firstPoint;
    }

    if (secondPoint !== null) {
      status.secondPoint = secondPoint;
    }

    if (distance !== null) {
      status.distance = distance;
      status.distanceLabel = formatModelUnitsDistance(distance);
    }

    if (announcement !== undefined) {
      status.announcement = announcement;
    }

    onMeasurementChange(status);
  }

  function attachOverlayToCurrentModel() {
    if (currentModel === null) {
      return;
    }

    if (overlayRoot.parent !== currentModel.target) {
      overlayRoot.removeFromParent();
      currentModel.target.add(overlayRoot);
    }
  }

  function disposeLine() {
    if (line !== null) {
      overlayRoot.remove(line);
      line.geometry.dispose();
      line = null;
    }
  }

  function removeMarkersAndLine() {
    if (firstMarker !== null) {
      overlayRoot.remove(firstMarker);
      firstMarker = null;
    }

    if (secondMarker !== null) {
      overlayRoot.remove(secondMarker);
      secondMarker = null;
    }

    disposeLine();
  }

  function clearOverlay() {
    removeMarkersAndLine();
    firstPoint = null;
    secondPoint = null;
    distance = null;
  }

  function createMarker(point: SerializablePoint3) {
    const marker = new Mesh(markerGeometry, markerMaterial);

    marker.name = "Distance Measurement Marker";
    marker.position.copy(toVector3(point));
    marker.raycast = () => undefined;

    return marker;
  }

  function syncOverlay() {
    attachOverlayToCurrentModel();
    removeMarkersAndLine();

    if (firstPoint !== null) {
      firstMarker = createMarker(firstPoint);
      overlayRoot.add(firstMarker);
    }

    if (secondPoint !== null) {
      secondMarker = createMarker(secondPoint);
      overlayRoot.add(secondMarker);
    }

    if (firstPoint !== null && secondPoint !== null) {
      line = new Line(
        new BufferGeometry().setFromPoints([
          toVector3(firstPoint),
          toVector3(secondPoint),
        ]),
        lineMaterial,
      );
      line.name = "Distance Measurement Line";
      line.raycast = () => undefined;
      overlayRoot.add(line);
    }
  }

  function pickSurface(point: { clientX: number; clientY: number }) {
    if (currentModel === null) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const normalizedPoint = normalizePointerToNdc(point, rect, pointerNdc);

    if (normalizedPoint === null) {
      return null;
    }

    raycaster.setFromCamera(normalizedPoint, camera);
    intersections.length = 0;
    raycaster.intersectObject(currentModel.target, true, intersections);

    const hit = intersections[0];

    if (hit === undefined) {
      return null;
    }

    return currentModel.target.worldToLocal(hit.point.clone());
  }

  function clearMeasurement(announcement = "Measurement cleared.") {
    const hadMeasurement =
      firstPoint !== null || secondPoint !== null || distance !== null;

    clearOverlay();
    if (hadMeasurement) {
      scheduler.invalidate();
    }
    emit(announcement);
  }

  function handleMeasurementPoint(point: Vector3) {
    if (currentModel === null) {
      return;
    }

    if (distance !== null && firstPoint !== null && secondPoint !== null) {
      clearOverlay();
    }

    if (firstPoint === null) {
      firstPoint = toSerializablePoint(point);
      secondPoint = null;
      distance = null;
      syncOverlay();
      scheduler.invalidate();
      emit("First measurement point set.");
      return;
    }

    secondPoint = toSerializablePoint(point);
    distance = calculateEuclideanDistance(firstPoint, secondPoint);
    syncOverlay();
    scheduler.invalidate();
    emit("Distance measurement complete.");
  }

  function cancelDraft() {
    if (firstPoint === null || secondPoint !== null) {
      return;
    }

    clearOverlay();
    scheduler.invalidate();
    emit("Measurement draft canceled.");
  }

  function handlePointerDown(event: PointerEvent) {
    if (activeTool !== "measure-distance") {
      return;
    }

    onFirstInteraction?.();

    if (!event.isPrimary) {
      return;
    }

    gesture = createPointerGesture(event);
  }

  function handlePointerMove(event: PointerEvent) {
    if (
      activeTool !== "measure-distance" ||
      !event.isPrimary ||
      gesture === null ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    updatePointerGesture(gesture, event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (
      activeTool !== "measure-distance" ||
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

    const point = pickSurface(event);

    if (point !== null) {
      handleMeasurementPoint(point);
    }
  }

  function handlePointerCancel(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) {
      gesture = null;
    }
  }

  function handlePointerLeave() {
    gesture = null;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      shouldIgnoreEscape(event) ||
      activeTool !== "measure-distance"
    ) {
      return;
    }

    if (firstPoint !== null && secondPoint === null) {
      cancelDraft();
      return;
    }

    activeTool = "select";
    gesture = null;
    emit("Measure Distance disabled.");
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  window.addEventListener("keydown", handleKeyDown);

  return {
    clearMeasurement,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("keydown", handleKeyDown);
      clearOverlay();
      overlayRoot.removeFromParent();
      markerGeometry.dispose();
      markerMaterial.dispose();
      lineMaterial.dispose();
      currentModel = null;
      gesture = null;
    },
    resetForModelReplacement: (target) => {
      const hadMeasurement =
        firstPoint !== null || secondPoint !== null || distance !== null;

      clearOverlay();
      currentModel = target;
      gesture = null;
      if (target !== null) {
        attachOverlayToCurrentModel();
      } else {
        overlayRoot.removeFromParent();
      }

      emit();

      if (hadMeasurement && !disposed) {
        scheduler.invalidate();
      }
    },
    setActiveTool: (nextActiveTool) => {
      if (activeTool === nextActiveTool) {
        return;
      }

      activeTool = nextActiveTool;
      gesture = null;

      if (activeTool === "select" && firstPoint !== null && secondPoint === null) {
        clearOverlay();
        scheduler.invalidate();
      }

      emit(
        activeTool === "measure-distance"
          ? "Measure Distance enabled."
          : "Measure Distance disabled.",
      );
    },
    setPalette: (palette) => {
      markerMaterial.dispose();
      lineMaterial.dispose();
      markerMaterial = createMarkerMaterial(palette);
      lineMaterial = createLineMaterial(palette);
      syncOverlay();
      if (firstPoint !== null) {
        scheduler.invalidate();
      }
    },
  };
}
