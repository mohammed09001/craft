import {
  Box3,
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Intersection,
  type Material,
  type Object3D,
} from "three";

import { createObjectSelectionBoxRuntime, type ObjectSelectionBoxRuntime } from "@/features/viewport/runtime/objectSelectionBoxRuntime";
import type {
  ObjectSelectionBoxBounds,
  ObjectSelectionBoxFace,
} from "@/features/viewport/runtime/objectSelectionBoxRuntime";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

type HighlightEntry = {
  mesh: Mesh;
  originalMaterial: Material | Material[];
  selectionMaterial: Material | Material[];
};

const expandBoundsByTransformedBox = (
  targetBounds: Box3,
  sourceBounds: Box3,
  transform: Matrix4,
) => {
  const { min, max } = sourceBounds;
  const corner = new Vector3();
  const expandPoint = (x: number, y: number, z: number) => {
    targetBounds.expandByPoint(corner.set(x, y, z).applyMatrix4(transform));
  };

  expandPoint(min.x, min.y, min.z);
  expandPoint(max.x, min.y, min.z);
  expandPoint(max.x, max.y, min.z);
  expandPoint(min.x, max.y, min.z);
  expandPoint(min.x, min.y, max.z);
  expandPoint(max.x, min.y, max.z);
  expandPoint(max.x, max.y, max.z);
  expandPoint(min.x, max.y, max.z);
};

const getTargetLocalBounds = (target: Object3D): Box3 | null => {
  target.updateWorldMatrix(true, true);

  const inverseTargetWorld = target.matrixWorld.clone().invert();
  const bounds = new Box3();
  const meshToTarget = new Matrix4();
  let hasBounds = false;

  target.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    if (object.userData.referenceMoldVisualization === true) return;

    object.geometry.computeBoundingBox();

    if (object.geometry.boundingBox === null) {
      return;
    }

    meshToTarget.multiplyMatrices(inverseTargetWorld, object.matrixWorld);
    expandBoundsByTransformedBox(
      bounds,
      object.geometry.boundingBox,
      meshToTarget,
    );
    hasBounds = true;
  });

  return hasBounds && !bounds.isEmpty() ? bounds : null;
};

export type ModelSelectionHighlight = {
  apply: (target: Object3D, palette: ViewportPalette) => void;
  clearSelectionBoxFaceHover: () => boolean;
  clear: () => void;
  dispose: () => void;
  getSelectionBoxHoverTarget: () => SelectionBoxHoverTarget | null;
  getSelectionBoxBounds: () => ObjectSelectionBoxBounds | null;
  isAppliedTo: (target: Object3D) => boolean;
  setSelectionBoxSelectedFaces: (faces: readonly ObjectSelectionBoxFace[]) => boolean;
  setSelectionBoxVisible: (visible: boolean) => boolean;
  updateSelectionBoxFaceHover: (
    intersections: readonly Intersection<Object3D>[],
  ) => boolean;
  updatePalette: (palette: ViewportPalette) => void;
};

/** The box face currently under the pointer, used to resolve a click (e.g. Cut by Face toggling). Purely hover-derived -- there is no separate "focused"/locked face concept. */
export interface SelectionBoxHoverTarget {
  readonly face: ObjectSelectionBoxFace;
  readonly bounds: ObjectSelectionBoxBounds;
  readonly matrixWorld: Matrix4;
}

function createSelectionMaterial(
  originalMaterial: Material,
  palette: ViewportPalette,
) {
  const selectionMaterial = originalMaterial.clone();
  const highlightColor = new Color(palette.background).getHSL({ h: 0, s: 0, l: 0 })
    .l > 0.5
    ? new Color(0x2563eb)
    : new Color(0xfacc15);

  if (selectionMaterial instanceof MeshStandardMaterial) {
    selectionMaterial.color.copy(highlightColor);
    selectionMaterial.emissive.copy(highlightColor);
    selectionMaterial.emissiveIntensity = 0.18;
    selectionMaterial.roughness = Math.min(selectionMaterial.roughness, 0.58);
  }

  selectionMaterial.name = `${originalMaterial.name || "Material"} Selection`;

  return selectionMaterial;
}

function createSelectionMaterialSet(
  material: Material | Material[],
  palette: ViewportPalette,
) {
  if (Array.isArray(material)) {
    return material.map((entry) => createSelectionMaterial(entry, palette));
  }

  return createSelectionMaterial(material, palette);
}

function disposeMaterialSet(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

function updateMaterialSetPalette(
  material: Material | Material[],
  palette: ViewportPalette,
) {
  const materials = Array.isArray(material) ? material : [material];
  const highlightColor = new Color(palette.background).getHSL({ h: 0, s: 0, l: 0 })
    .l > 0.5
    ? new Color(0x2563eb)
    : new Color(0xfacc15);

  for (const entry of materials) {
    if (entry instanceof MeshStandardMaterial) {
      entry.color.copy(highlightColor);
      entry.emissive.copy(highlightColor);
    }
  }
}

export function createModelSelectionHighlight(): ModelSelectionHighlight {
  let highlightedTarget: Object3D | null = null;
  let entries: HighlightEntry[] = [];
  let selectionBox: ObjectSelectionBoxRuntime | null = null;

  function clear() {
    if (selectionBox !== null) {
      selectionBox.object.removeFromParent();
      selectionBox.dispose();
      selectionBox = null;
    }

    for (const entry of entries) {
      entry.mesh.material = entry.originalMaterial;
      disposeMaterialSet(entry.selectionMaterial);
    }

    highlightedTarget = null;
    entries = [];
  }

  return {
    apply: (target, palette) => {
      if (highlightedTarget === target) {
        return;
      }

      clear();
      highlightedTarget = target;
      target.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        if (object.userData.referenceMoldVisualization === true) return;

        const originalMaterial = object.material;
        const selectionMaterial = createSelectionMaterialSet(
          originalMaterial,
          palette,
        );

        entries.push({
          mesh: object,
          originalMaterial,
          selectionMaterial,
        });
        object.material = selectionMaterial;
      });

      const bounds = getTargetLocalBounds(target);
      if (bounds !== null) {
        selectionBox = createObjectSelectionBoxRuntime({
          min: bounds.min.clone(),
          max: bounds.max.clone(),
        });
        target.add(selectionBox.object);
      }
    },
    clearSelectionBoxFaceHover: () => selectionBox?.clearHoveredFace() ?? false,
    clear,
    dispose: clear,
    getSelectionBoxHoverTarget: () => {
      const face = selectionBox?.getHoveredFace() ?? null;

      if (
        selectionBox === null ||
        !selectionBox.object.visible ||
        face === null
      ) {
        return null;
      }

      selectionBox.object.updateWorldMatrix(true, false);

      return {
        face,
        bounds: selectionBox.getBounds(),
        matrixWorld: selectionBox.object.matrixWorld.clone(),
      };
    },
    getSelectionBoxBounds: () => selectionBox?.getBounds() ?? null,
    isAppliedTo: (target) => highlightedTarget === target,
    setSelectionBoxSelectedFaces: (faces) =>
      selectionBox?.setSelectedFaces(faces) ?? false,
    setSelectionBoxVisible: (visible) => {
      if (
        selectionBox === null ||
        selectionBox.object.visible === visible
      ) {
        return false;
      }

      if (!visible) {
        selectionBox.clearHoveredFace();
      }

      selectionBox.object.visible = visible;
      return true;
    },
    updateSelectionBoxFaceHover: (intersections) =>
      selectionBox?.object.visible
        ? selectionBox.updateHoveredFaceFromIntersections(intersections)
        : false,
    updatePalette: (palette) => {
      for (const entry of entries) {
        updateMaterialSetPalette(entry.selectionMaterial, palette);
      }
    },
  };
}

