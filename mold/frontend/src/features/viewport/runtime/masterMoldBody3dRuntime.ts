import { Group, Line, LineSegments, Mesh, type Material, MeshStandardMaterial } from "three";

import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import type { MasterMoldRenderableBody } from "@/features/mold-generation/master-mold/masterMoldViewportAdapter";
import { createFeatureEdgeOverlay } from "@/features/viewport/runtime/featureEdgeOverlay";
import { applyMoldBodyMeshAppearance, createMoldBodyMesh } from "@/features/viewport/runtime/moldBodyMesh3d";
import { resolveCadTheme } from "@/features/viewport/runtime/viewportVisualTheme";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

/**
 * Article 02: a stale Master Mold body must read as a ghosted holdover, not
 * a manufacturable result -- deliberately much more transparent than the
 * "glass" appearance mode (which still represents a real, current body) so
 * the two are never confused. Applied on top of whatever role/appearance
 * material the body would otherwise get, never replacing per-role color.
 */
const STALE_MASTER_MOLD_OPACITY = 0.2;

function applyStaleGhosting(mesh: Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (material instanceof MeshStandardMaterial) {
      material.transparent = true;
      material.opacity = Math.min(material.opacity, STALE_MASTER_MOLD_OPACITY);
      material.depthWrite = false;
    }
  }
  mesh.renderOrder = 7;
  mesh.castShadow = false;
  mesh.userData.masterMoldStale = true;
}

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
  setBodies(bodies: readonly MasterMoldRenderableBody[]): void;
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

  /**
   * Article 05: keyed on `geometryIdentity` (the body's own source
   * fingerprint), not shape-derived stats like bounds/triangleCount, which
   * two genuinely different meshes can share. `id`/`visible`/`stale` are
   * kept alongside it because they change the render even when the
   * underlying geometry identity does not (a body being added/removed, or
   * flipping stale/current on an otherwise-unchanged mesh).
   */
  const identityOf = (bodies: readonly MasterMoldRenderableBody[]): string =>
    JSON.stringify(
      bodies.map((body) => ({
        id: body.id,
        geometryIdentity: body.geometryIdentity,
        visible: body.visible,
        stale: body.stale,
      })),
    );

  const rebuild = (bodies: readonly MasterMoldRenderableBody[]) => {
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
      if (body.stale) applyStaleGhosting(mesh);
      group.add(mesh);
      moldMeshes.push(mesh);
    }

    featureEdges.updateFromMoldMeshes(moldMeshes);
    group.add(featureEdges.group);
    invalidate();
  };

  const applyToMeshes = () => {
    group.traverse((descendant) => {
      if (descendant instanceof Mesh) {
        const wasStale = descendant.userData.masterMoldStale === true;
        applyMoldBodyMeshAppearance(descendant, appearanceMode, currentPalette);
        if (wasStale) applyStaleGhosting(descendant);
      }
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
