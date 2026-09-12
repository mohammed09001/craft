import { Group, Line, LineSegments, Mesh, type Material } from "three";

import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import type { MoldBodyData } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import { createFeatureEdgeOverlay } from "@/features/viewport/runtime/featureEdgeOverlay";
import { applyMoldBodyMeshAppearance, createMoldBodyMesh } from "@/features/viewport/runtime/moldBodyMesh3d";
import { resolveCadTheme } from "@/features/viewport/runtime/viewportVisualTheme";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

/**
 * Article 10: renders generated Master Mold pieces. Deliberately a small,
 * independent sibling of ReferenceMoldBlock3dRuntime rather than an
 * extension of it -- Master Mold and Create Cavity are independent tools
 * (Article 09), and this runtime owns none of the reference-mold-block
 * rebuild/target-sync machinery that doesn't apply to it. Reuses the same
 * `createMoldBodyMesh` mesh factory and feature-edge overlay Create Cavity's
 * own body rendering already relies on -- no new rendering code per body.
 */
export interface MasterMoldBody3dRuntime {
  readonly object: Group;
  setBodies(bodies: readonly MoldBodyData[]): void;
  setAppearanceMode(mode: MoldAppearanceMode): void;
  setPalette(palette: ViewportPalette): void;
  dispose(): void;
}

export const createMasterMoldBody3dRuntime = (
  invalidate: () => void,
): MasterMoldBody3dRuntime => {
  const group = new Group();
  group.name = "MasterMoldBodyGroup";
  group.userData.masterMoldVisualization = true;

  let appearanceMode: MoldAppearanceMode = "solid";
  let currentPalette: ViewportPalette | undefined = undefined;
  let bodyIdentity: string | null = null;
  const featureEdges = createFeatureEdgeOverlay();

  const disposeMaterials = (material: Material | Material[]) => {
    (Array.isArray(material) ? material : [material]).forEach((entry) => entry.dispose());
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

  const identityOf = (bodies: readonly MoldBodyData[]): string =>
    JSON.stringify(
      bodies.map((body) => ({
        id: body.id,
        triangleCount: body.triangleCount,
        bounds: body.bounds,
        visible: body.visible,
      })),
    );

  const rebuild = (bodies: readonly MoldBodyData[]) => {
    clearGeometry();

    if (bodies.length === 0) {
      invalidate();
      return;
    }

    const moldMeshes: Mesh[] = [];

    for (const body of bodies) {
      const mesh = createMoldBodyMesh({ body, mode: appearanceMode, palette: currentPalette });
      mesh.renderOrder = 8;
      mesh.userData.masterMoldVisualization = true;
      group.add(mesh);
      moldMeshes.push(mesh);
    }

    featureEdges.updateFromMoldMeshes(moldMeshes);
    group.add(featureEdges.group);
    invalidate();
  };

  const applyToMeshes = () => {
    group.traverse((descendant) => {
      if (descendant instanceof Mesh) applyMoldBodyMeshAppearance(descendant, appearanceMode, currentPalette);
    });
  };

  return {
    object: group,
    setBodies: (bodies) => {
      const nextIdentity = identityOf(bodies);
      if (nextIdentity === bodyIdentity) return;
      bodyIdentity = nextIdentity;
      rebuild(bodies);
    },
    setAppearanceMode: (mode) => {
      if (mode === appearanceMode) return;
      appearanceMode = mode;
      applyToMeshes();
      invalidate();
    },
    setPalette: (palette) => {
      currentPalette = palette;
      featureEdges.setColor(resolveCadTheme(palette).featureEdgeColor);
      applyToMeshes();
      invalidate();
    },
    dispose: () => {
      clearGeometry();
      featureEdges.dispose();
      group.removeFromParent();
      bodyIdentity = null;
    },
  };
};
