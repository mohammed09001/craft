import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  Line,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  type Material,
  type Object3D,
} from "three";

import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition";
import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import { createFeatureEdgeOverlay } from "@/features/viewport/runtime/featureEdgeOverlay";
import {
  applyMoldBodyMeshAppearance,
  createMoldBodyMesh,
  resolveBodyRole,
} from "@/features/viewport/runtime/moldBodyMesh3d";
import { resolveCadTheme } from "@/features/viewport/runtime/viewportVisualTheme";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

export const NORMAL_MOLD_BLOCK_OPACITY = 0.24;

export { resolveBodyRole };

export interface ReferenceMoldBlock3dRuntime {
  readonly object: Group;
  setDefinition(definition: ReferenceMoldDefinition | null): void;
  setAppearanceMode(mode: MoldAppearanceMode): void;
  setPalette(palette: ViewportPalette): void;
  setTarget(modelId: string, target: Object3D): void;
  clearTarget(): void;
  syncTransform(): void;
  dispose(): void;
}

export const createReferenceMoldBlock3dRuntime = (
  invalidate: () => void,
  onGroundZChange: (groundZ: number | null) => void = () => undefined,
): ReferenceMoldBlock3dRuntime => {
  const group = new Group();
  group.name = "ReferenceMoldBlockGroup";
  group.userData.referenceMoldVisualization = true;
  let definition: ReferenceMoldDefinition | null = null;
  let targetModelId: string | null = null;
  let target: Object3D | null = null;
  let appearanceMode: MoldAppearanceMode = "solid";
  let currentPalette: ViewportPalette | undefined = undefined;
  const featureEdges = createFeatureEdgeOverlay();

  const disposeMaterials = (material: Material | Material[]) => {
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((entry) => entry.dispose());
  };

  const applyMeshAppearance = (mesh: Mesh) => {
    applyMoldBodyMeshAppearance(mesh, appearanceMode, currentPalette);
  };

  const clearGeometry = () => {
    featureEdges.updateFromMoldMeshes([]);
    for (const child of [...group.children]) {
      if (child === featureEdges.group) {
        child.removeFromParent();
        continue;
      }
      child.traverse((descendant) => {
        if (descendant instanceof Mesh || descendant instanceof LineSegments || descendant instanceof Line) {
          descendant.geometry.dispose();
          disposeMaterials(descendant.material);
        }
      });
      child.removeFromParent();
    }
  };

  const syncTransform = () => {
    // Mold bodies are authored directly in the final world-aligned mold
    // coordinate frame. Copying the source-part transform here would apply
    // orientation and grounding a second time.
    group.position.set(0, 0, 0);
    group.quaternion.set(0, 0, 0, 1);
  };

  const rebuild = () => {
    clearGeometry();
    syncTransform();
    if (definition === null || target === null || definition.modelId !== targetModelId) {
      invalidate();
      onGroundZChange(null);
      return;
    }
    const { min, max } = definition.referenceMoldBlock.bounds;
    const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
    if (![min.x, min.y, min.z, max.x, max.y, max.z, size.x, size.y, size.z].every(Number.isFinite) ||
        size.x <= 0 || size.y <= 0 || size.z <= 0) {
      invalidate();
      onGroundZChange(null);
      return;
    }
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    const surface = new Mesh(geometry, new MeshBasicMaterial({
      color: 0xb94742,
      opacity: NORMAL_MOLD_BLOCK_OPACITY,
      transparent: true,
      depthWrite: false,
    }));
    surface.name = "ReferenceMoldBlockSurface";
    surface.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    surface.renderOrder = 8;
    surface.userData.referenceMoldVisualization = true;
    const edges = new LineSegments(new EdgesGeometry(geometry), new LineBasicMaterial({
      color: 0x7e2f2c,
      opacity: 0.82,
      transparent: true,
      depthWrite: false,
    }));
    edges.name = "ReferenceMoldBlockEdges";
    edges.position.copy(surface.position);
    edges.renderOrder = 9;
    edges.userData.referenceMoldVisualization = true;
    if (definition.moldBodies?.length) {
      geometry.dispose();
      surface.geometry.dispose(); surface.material.dispose(); edges.geometry.dispose(); edges.material.dispose();
      const bodies = new Group(); bodies.name = "ReferenceMoldBodies";
      const moldMeshes: Mesh[] = [];
      for (const body of definition.moldBodies) {
        const bodyMesh = createMoldBodyMesh({
          body,
          mode: appearanceMode,
          palette: currentPalette,
        });
        bodyMesh.renderOrder = 8;
        bodyMesh.userData.moldTopZ = max.z;
        bodyMesh.userData.referenceMoldVisualization = true;
        bodies.add(bodyMesh);
        moldMeshes.push(bodyMesh);
      }

      featureEdges.updateFromMoldMeshes(moldMeshes);
      group.add(bodies, featureEdges.group);
    } else {
      group.add(surface, edges);
    }
    onGroundZChange(min.z);
    invalidate();
  };

  return {
    object: group,
    setDefinition: (nextDefinition) => {
      const geometryUnchanged = definition === nextDefinition;
      definition = nextDefinition;
      if (geometryUnchanged) return;
      rebuild();
    },
    setAppearanceMode: (mode) => {
      if (mode === appearanceMode) return;
      appearanceMode = mode;

      group.traverse((descendant) => {
        if (!(descendant instanceof Mesh)) return;
        if (
          descendant.userData.moldBodyId === undefined &&
          descendant.userData.role === undefined
        ) {
          return;
        }

        applyMeshAppearance(descendant);
      });

      invalidate();
    },
    setPalette: (palette) => {
      currentPalette = palette;
      featureEdges.setColor(resolveCadTheme(palette).featureEdgeColor);

      group.traverse((descendant) => {
        if (!(descendant instanceof Mesh)) return;
        if (
          descendant.userData.moldBodyId === undefined &&
          descendant.userData.role === undefined
        ) {
          return;
        }

        applyMeshAppearance(descendant);
      });

      invalidate();
    },
    setTarget: (modelId, nextTarget) => {
      targetModelId = modelId;
      target = nextTarget;
      rebuild();
    },
    clearTarget: () => {
      clearGeometry();
      targetModelId = null;
      target = null;
      invalidate();
      onGroundZChange(null);
    },
    syncTransform,
    dispose: () => {
      clearGeometry();
      featureEdges.dispose();
      group.removeFromParent();
      targetModelId = null;
      target = null;
      definition = null;
      onGroundZChange(null);
    },
  };
};
