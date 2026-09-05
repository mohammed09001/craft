import {
  BoxGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";

import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import type { MoldBodyData } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import type { BoundaryIntent } from "@/features/mold-generation/segmentation";
import type { Bounds3 } from "@/features/mold-generation/split-face";
import { CUTTING_PLANE_COLORS } from "@/features/viewport/runtime/cuttingPlane3dRuntime";
import { createMoldBodyMesh } from "@/features/viewport/runtime/moldBodyMesh3d";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

/**
 * Read-only projection of application-owned preliminary and committed mold
 * geometry. No plan, Registration feature, or manufacturing body is authored
 * in this runtime.
 */
export interface SegmentationVisualization3dRuntime {
  readonly object: Group;
  setVisualization(
    previewBodies: readonly MoldBodyData[],
    previewPlanes: readonly BoundaryIntent[],
    committedBodies: readonly MoldBodyData[],
  ): void;
  setAppearanceMode(mode: MoldAppearanceMode): void;
  setPalette(palette: ViewportPalette): void;
  dispose(): void;
}

function aggregateBounds(bodies: readonly MoldBodyData[]): Bounds3 | null {
  if (bodies.length === 0) return null;
  return {
    min: {
      x: Math.min(...bodies.map((body) => body.bounds.min.x)),
      y: Math.min(...bodies.map((body) => body.bounds.min.y)),
      z: Math.min(...bodies.map((body) => body.bounds.min.z)),
    },
    max: {
      x: Math.max(...bodies.map((body) => body.bounds.max.x)),
      y: Math.max(...bodies.map((body) => body.bounds.max.y)),
      z: Math.max(...bodies.map((body) => body.bounds.max.z)),
    },
  };
}

export const createSegmentationVisualization3dRuntime = (
  invalidate: () => void,
): SegmentationVisualization3dRuntime => {
  const root = new Group();
  root.name = "Segmentation Visualization";
  const previewBodiesGroup = new Group();
  previewBodiesGroup.name = "Segmentation Planned Sections";
  const previewPlanesGroup = new Group();
  previewPlanesGroup.name = "Segmentation Preview Planes";
  const committedBodiesGroup = new Group();
  committedBodiesGroup.name = "Segmentation Committed Bodies";
  root.add(previewBodiesGroup, previewPlanesGroup, committedBodiesGroup);

  let appearanceMode: MoldAppearanceMode = "solid";
  let palette: ViewportPalette | undefined;
  let currentPreviewBodies: readonly MoldBodyData[] = [];
  let currentPreviewPlanes: readonly BoundaryIntent[] = [];
  let currentCommittedBodies: readonly MoldBodyData[] = [];

  const clearGroup = (group: Group) => {
    for (const child of [...group.children]) {
      child.traverse((descendant) => {
        if (descendant instanceof Mesh || descendant instanceof LineSegments) {
          descendant.geometry.dispose();
          const materials = Array.isArray(descendant.material)
            ? descendant.material
            : [descendant.material];
          materials.forEach((material) => material.dispose());
        }
      });
      child.removeFromParent();
    }
  };

  const rebuildBodies = (
    group: Group,
    bodies: readonly MoldBodyData[],
    preview: boolean,
  ) => {
    clearGroup(group);
    for (const body of bodies) {
      const mesh = createMoldBodyMesh({
        body,
        mode: appearanceMode,
        palette,
      });
      mesh.renderOrder = preview ? 6 : 7;
      mesh.userData.segmentationBodyId = body.id;
      mesh.userData.segmentationPreview = preview;
      group.add(mesh);
    }
  };

  const rebuildPlanes = (
    bodies: readonly MoldBodyData[],
    boundaries: readonly BoundaryIntent[],
  ) => {
    clearGroup(previewPlanesGroup);
    const bounds = aggregateBounds(bodies);
    if (bounds === null || boundaries.length === 0) return;
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeY = bounds.max.y - bounds.min.y;
    const sizeZ = bounds.max.z - bounds.min.z;
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerY = (bounds.min.y + bounds.max.y) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    for (const boundary of boundaries) {
      const dimensions: [number, number, number] =
        boundary.axis === "x"
          ? [0.02, sizeY, sizeZ]
          : boundary.axis === "y"
            ? [sizeX, 0.02, sizeZ]
            : [sizeX, sizeY, 0.02];
      const geometry = new BoxGeometry(...dimensions);
      const surface = new Mesh(
        geometry,
        new MeshBasicMaterial({
          color: CUTTING_PLANE_COLORS.idle,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      surface.renderOrder = 8;
      const edges = new LineSegments(
        new EdgesGeometry(geometry),
        new LineBasicMaterial({
          color: CUTTING_PLANE_COLORS.idle,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          depthTest: true,
        }),
      );
      edges.renderOrder = 9;
      edges.raycast = () => undefined;
      const plane = new Group();
      plane.name = `Segmentation Preview Plane ${boundary.id}`;
      plane.position.set(centerX, centerY, centerZ);
      plane.position[boundary.axis] = boundary.coordinateMm;
      plane.add(surface, edges);
      previewPlanesGroup.add(plane);
    }
  };

  const rebuild = () => {
    const previewVisible = currentCommittedBodies.length === 0;
    rebuildBodies(
      previewBodiesGroup,
      previewVisible ? currentPreviewBodies : [],
      true,
    );
    rebuildPlanes(
      previewVisible ? currentPreviewBodies : [],
      previewVisible ? currentPreviewPlanes : [],
    );
    rebuildBodies(committedBodiesGroup, currentCommittedBodies, false);
    invalidate();
  };

  return {
    object: root,
    setVisualization: (previewBodies, previewPlanes, committedBodies) => {
      currentPreviewBodies = previewBodies;
      currentPreviewPlanes = previewPlanes;
      currentCommittedBodies = committedBodies;
      rebuild();
    },
    setAppearanceMode: (mode) => {
      if (appearanceMode === mode) return;
      appearanceMode = mode;
      rebuild();
    },
    setPalette: (nextPalette) => {
      palette = nextPalette;
      rebuild();
    },
    dispose: () => {
      clearGroup(previewBodiesGroup);
      clearGroup(previewPlanesGroup);
      clearGroup(committedBodiesGroup);
      root.removeFromParent();
      currentPreviewBodies = [];
      currentPreviewPlanes = [];
      currentCommittedBodies = [];
    },
  };
};
