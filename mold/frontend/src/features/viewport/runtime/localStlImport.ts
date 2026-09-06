import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  Quaternion,
  Vector3,
  Object3D,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

import { createCadMaterial } from "@/features/viewport/runtime/cadMaterialFactory";
import { CAD_DARK_THEME, resolveCadTheme } from "@/features/viewport/runtime/viewportVisualTheme";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";
import {
  IDENTITY_PART_ORIENTATION,
  type PartOrientation,
} from "@/features/viewport/partOrientation.store";
import { createModelInspectionStatus } from "@/features/viewport/modelInspection";
import type { ModelImportStatus } from "@/features/viewport/modelImport.contracts";
import { prepareAutomaticModelOrientation } from "@/features/viewport/runtime/automaticModelOrientation";
import {
  deriveAdaptiveGridConfig,
  type AdaptiveGridConfig,
} from "@/features/viewport/runtime/adaptiveGrid";
import type { EngineeringGrid } from "@/features/viewport/runtime/createEngineeringGrid";
import {
  calculateModelGroundingTransform,
  type NumericBounds3,
} from "@/features/viewport/runtime/modelGrounding";
import type { RenderScheduler } from "@/features/viewport/runtime/renderScheduler";
import { captureCanonicalPartGeometry } from "@/features/viewport/runtime/canonicalPartGeometrySnapshot";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import {
  fitCameraToModel,
  resetCameraToModel,
} from "@/features/viewport/runtime/viewPose";

const MIN_DISPLAYABLE_SIZE = 1e-9;

type LocalStlRuntimeOptions = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  modelRoot: Group;
  scene: Scene;
  scheduler: RenderScheduler;
  onModelStatusChange: (status: ModelImportStatus) => void;
  onModelReplaced: (target: { modelId: string; target: Mesh } | null) => void;
  onModelTransformed?: (target: { modelId: string; target: Mesh }) => void;
  createGrid: (config: AdaptiveGridConfig) => EngineeringGrid;
  replaceGrid: (grid: EngineeringGrid) => void;
  onCanonicalA3Change?: (geometry: CanonicalPartGeometry | null) => void;
  onPartOrientationCommit?: (orientation: PartOrientation) => boolean;
  palette?: ViewportPalette;
};

type LocalStlRuntime = {
  fitView: () => void;
  loadLocalStl: (file: File) => void;
  orientModel: () => void;
  resetView: () => void;
  setPartOrientation: (orientation: PartOrientation) => void;
  setMoldAssemblyOffset: (offset: { readonly x: number; readonly y: number; readonly z: number }) => void;
  setModelVisible: (visible: boolean) => void;
  setPalette: (palette: ViewportPalette) => void;
  dispose: () => void;
};

type DisposableObject = Object3D & {
  geometry?: BufferGeometry;
  material?: Material | Material[];
};

function disposeMaterial(material: Material) {
  material.dispose();
}

function disposeModelRoot(modelRoot: Group) {
  for (const child of [...modelRoot.children]) {
    modelRoot.remove(child);
    child.traverse((object) => {
      const disposable = object as DisposableObject;

      disposable.geometry?.dispose();

      if (Array.isArray(disposable.material)) {
        disposable.material.forEach(disposeMaterial);
        return;
      }

      disposable.material?.dispose();
    });
  }
}

function validateGeometry(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");

  if (position === undefined || position.count === 0) {
    throw new Error("The STL file does not contain displayable vertices.");
  }

  for (const value of position.array) {
    if (!Number.isFinite(value)) {
      throw new Error("The STL file contains invalid vertex coordinates.");
    }
  }

  if (geometry.getAttribute("normal") === undefined) {
    geometry.computeVertexNormals();
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const boundingBox = geometry.boundingBox;
  const boundingSphere = geometry.boundingSphere;

  if (boundingBox === null || boundingBox.isEmpty()) {
    throw new Error("The STL file has an invalid bounding box.");
  }

  const size = boundingBox.getSize(new Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);

  if (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z) ||
    maxDimension <= MIN_DISPLAYABLE_SIZE
  ) {
    throw new Error("The STL file has no displayable size.");
  }

  if (
    boundingSphere === null ||
    !Number.isFinite(boundingSphere.radius) ||
    boundingSphere.radius <= MIN_DISPLAYABLE_SIZE
  ) {
    throw new Error("The STL file has an invalid bounding sphere.");
  }

  return boundingBox;
}

function createModelMesh(geometry: BufferGeometry, palette?: ViewportPalette) {
  const theme = palette !== undefined ? resolveCadTheme(palette) : CAD_DARK_THEME;
  const mesh = new Mesh(geometry, createCadMaterial("imported-part", "solid", theme));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function toNumericBounds(bounds: Box3): NumericBounds3 {
  return {
    min: {
      x: bounds.min.x,
      y: bounds.min.y,
      z: bounds.min.z,
    },
    max: {
      x: bounds.max.x,
      y: bounds.max.y,
      z: bounds.max.z,
    },
  };
}

function createLoadingStatus(file: File): ModelImportStatus {
  return {
    phase: "loading",
    fileName: file.name,
    fileSize: file.size,
  };
}

function createReadyStatus(file: File, geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");

  return createModelInspectionStatus({
    fileName: file.name,
    fileSize: file.size,
    geometryVertexCount: position?.count ?? 0,
  });
}

export function createLocalStlRuntime({
  camera,
  controls,
  modelRoot,
  scene,
  scheduler,
  onModelStatusChange,
  onModelReplaced,
  onModelTransformed,
  createGrid,
  replaceGrid,
  onCanonicalA3Change,
  onPartOrientationCommit,
  palette,
}: LocalStlRuntimeOptions): LocalStlRuntime {
  const loader = new STLLoader();
  let activeReader: FileReader | null = null;
  let latestRequestId = 0;
  let disposed = false;
  let currentReadyStatus: ModelImportStatus | null = null;
  let currentModelMesh: Mesh | null = null;
  let currentSourceGeometry: BufferGeometry | null = null;
  let currentModelDrawRange: { start: number; count: number } | null = null;
  let currentModelId: string | null = null;
  let currentPalette: ViewportPalette | undefined = palette;
  let currentPartOrientation = IDENTITY_PART_ORIENTATION;

  scene.add(modelRoot);

  function isCurrentRequest(requestId: number) {
    return !disposed && requestId === latestRequestId;
  }

  function emitImportError(file: File, message: string) {
    if (currentReadyStatus !== null && modelRoot.children.length > 0) {
      onModelStatusChange({
        ...currentReadyStatus,
        lastImportError: message,
      });
      return;
    }

    onModelStatusChange({
      phase: "error",
      fileName: file.name,
      fileSize: file.size,
      message,
    });
  }

  function emitOrientationError(message: string) {
    if (currentReadyStatus === null) {
      return;
    }

    onModelStatusChange({
      ...currentReadyStatus,
      lastImportError: message,
    });
  }

  function applyPartOrientation(orientation: PartOrientation) {
    if (currentModelMesh === null || currentModelId === null) {
      currentPartOrientation = orientation;
      return;
    }

    if (currentSourceGeometry === null) {
      return;
    }

    const previousOrientation = currentPartOrientation;
    const previousPosition = modelRoot.position.clone();
    const previousQuaternion = modelRoot.quaternion.clone();
    const restoreApprovedOrientation = () => {
      if (
        previousOrientation.x !== orientation.x ||
        previousOrientation.y !== orientation.y ||
        previousOrientation.z !== orientation.z ||
        previousOrientation.w !== orientation.w
      ) {
        onPartOrientationCommit?.(previousOrientation);
      }
    };
    const orientedGeometry = currentSourceGeometry.clone();
    orientedGeometry.applyQuaternion(
      new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
    );
    orientedGeometry.computeBoundingBox();
    const orientedBounds = orientedGeometry.boundingBox;
    if (orientedBounds === null) {
      orientedGeometry.dispose();
      restoreApprovedOrientation();
      return;
    }
    const grounding = calculateModelGroundingTransform(
      toNumericBounds(orientedBounds),
    );
    if (grounding === null) {
      orientedGeometry.dispose();
      restoreApprovedOrientation();
      return;
    }

    let previousGeometry: BufferGeometry | null = null;
    try {
      const nextGrid = createGrid(
        deriveAdaptiveGridConfig(grounding.groundedBounds),
      );
      orientedGeometry.translate(
        grounding.translation.x,
        grounding.translation.y,
        grounding.translation.z,
      );
      orientedGeometry.computeBoundingBox();
      orientedGeometry.computeBoundingSphere();
      previousGeometry = currentModelMesh.geometry;
      currentModelMesh.geometry = orientedGeometry;
      currentModelDrawRange = {
        start: orientedGeometry.drawRange.start,
        count: orientedGeometry.drawRange.count,
      };
      modelRoot.position.set(0, 0, 0);
      modelRoot.quaternion.identity();
      modelRoot.updateWorldMatrix(true, true);
      replaceGrid(nextGrid);
      currentPartOrientation = orientation;
      previousGeometry.dispose();
      previousGeometry = null;
    } catch (error) {
      if (previousGeometry !== null) {
        currentModelMesh.geometry = previousGeometry;
        modelRoot.position.copy(previousPosition);
        modelRoot.quaternion.copy(previousQuaternion);
        modelRoot.updateWorldMatrix(true, true);
      }
      orientedGeometry.dispose();
      restoreApprovedOrientation();
      throw error;
    }
    onCanonicalA3Change?.(
      captureCanonicalPartGeometry(currentModelId, currentModelMesh),
    );
    onModelTransformed?.({ modelId: currentModelId, target: currentModelMesh });
    scheduler.invalidate();
  }

  function replaceModel(
    mesh: Mesh,
    boundingBox: Box3,
    file: File,
    requestId: number,
  ) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const readyStatus = createReadyStatus(file, mesh.geometry);
    const modelId = `${requestId}:${file.name}:${file.size}`;
    const grounding = calculateModelGroundingTransform(
      toNumericBounds(boundingBox),
    );

    if (grounding === null) {
      throw new Error("The STL file has an invalid bounding box.");
    }

    onModelReplaced(null);
    currentModelMesh = null;
    currentSourceGeometry?.dispose();
    currentSourceGeometry = null;
    currentModelDrawRange = null;
    currentModelId = null;
    onCanonicalA3Change?.(null);
    disposeModelRoot(modelRoot);
    modelRoot.add(mesh);
    currentReadyStatus = readyStatus;
    currentModelMesh = mesh;
    currentSourceGeometry = mesh.geometry.clone();
    currentModelDrawRange = {
      start: mesh.geometry.drawRange.start,
      count: mesh.geometry.drawRange.count,
    };
    currentModelId = modelId;
    applyPartOrientation(currentPartOrientation);
    onModelReplaced({ modelId, target: mesh });
    fitCameraToModel(modelRoot, camera, controls);
    scheduler.invalidate();
    onModelStatusChange(readyStatus);
  }

  return {
    fitView: () => {
      if (fitCameraToModel(modelRoot, camera, controls)) {
        scheduler.invalidate();
      }
    },
    orientModel: () => {
      if (currentModelMesh === null || currentReadyStatus === null) {
        return;
      }

      try {
        const preparation = prepareAutomaticModelOrientation(
          currentModelMesh.geometry,
        );

        if (preparation === null) {
          throw new Error("The model could not be oriented.");
        }

        const orientation = {
          x: preparation.rotation.x,
          y: preparation.rotation.y,
          z: preparation.rotation.z,
          w: preparation.rotation.w,
        };
        if (onPartOrientationCommit?.(orientation) === false) {
          return;
        }
        applyPartOrientation(orientation);
        fitCameraToModel(modelRoot, camera, controls);
        scheduler.invalidate();
        onModelStatusChange(currentReadyStatus);
      } catch {
        emitOrientationError("The model could not be oriented.");
      }
    },
    loadLocalStl: (file) => {
      latestRequestId += 1;
      const requestId = latestRequestId;

      activeReader?.abort();
      onModelStatusChange(createLoadingStatus(file));

      const reader = new FileReader();
      activeReader = reader;

      reader.onload = () => {
        if (!isCurrentRequest(requestId)) {
          return;
        }

        try {
          if (!(reader.result instanceof ArrayBuffer)) {
            throw new Error("The STL file could not be read.");
          }

          let geometry: BufferGeometry;

          try {
            geometry = loader.parse(reader.result);
          } catch {
            throw new Error("The STL file could not be parsed.");
          }

          const boundingBox = validateGeometry(geometry);
          const mesh = createModelMesh(geometry, currentPalette);

          if (!isCurrentRequest(requestId)) {
            mesh.geometry.dispose();
            disposeMaterial(mesh.material);
            return;
          }

          replaceModel(mesh, boundingBox, file, requestId);
        } catch (error) {
          if (!isCurrentRequest(requestId)) {
            return;
          }

          emitImportError(
            file,
            error instanceof Error
              ? error.message
              : "The STL file could not be loaded.",
          );
        }
      };

      reader.onerror = () => {
        if (!isCurrentRequest(requestId)) {
          return;
        }

        emitImportError(file, "The STL file could not be read.");
      };

      reader.readAsArrayBuffer(file);
    },
    resetView: () => {
      resetCameraToModel(modelRoot, camera, controls);
      scheduler.invalidate();
    },
    setPartOrientation: (orientation) => {
      try {
        applyPartOrientation(orientation);
      } catch {
        emitOrientationError("The model could not be oriented.");
      }
    },
    setMoldAssemblyOffset: (offset) => {
      if (![offset.x, offset.y, offset.z].every(Number.isFinite)) {
        return;
      }
      modelRoot.position.set(offset.x, offset.y, offset.z);
      modelRoot.updateWorldMatrix(true, true);
      scheduler.invalidate();
    },
    setModelVisible: (visible) => {
      if (currentModelMesh === null || currentModelDrawRange === null) {
        return;
      }

      currentModelMesh.geometry.setDrawRange(
        currentModelDrawRange.start,
        visible ? currentModelDrawRange.count : 0,
      );
      scheduler.invalidate();
    },
    setPalette: (nextPalette) => {
      currentPalette = nextPalette;
      if (currentModelMesh !== null) {
        const theme = resolveCadTheme(nextPalette);
        const nextMaterial = createCadMaterial("imported-part", "solid", theme);
        disposeMaterial(currentModelMesh.material as Material);
        currentModelMesh.material = nextMaterial;
        currentModelMesh.castShadow = true;
        currentModelMesh.receiveShadow = true;
      }
      scheduler.invalidate();
    },
    dispose: () => {
      disposed = true;
      latestRequestId += 1;
      activeReader?.abort();
      activeReader = null;
      currentReadyStatus = null;
      currentModelMesh = null;
      currentSourceGeometry?.dispose();
      currentSourceGeometry = null;
      currentModelDrawRange = null;
      currentModelId = null;
      onCanonicalA3Change?.(null);
      onModelReplaced(null);
      disposeModelRoot(modelRoot);
    },
  };
}

