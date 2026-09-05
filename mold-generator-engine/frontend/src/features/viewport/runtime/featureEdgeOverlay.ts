import {
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
} from "three";

export interface FeatureEdgeOverlay {
  readonly group: Group;
  updateFromMoldMeshes(moldMeshes: readonly Mesh[]): void;
  setColor(color: number): void;
  dispose(): void;
}

/**
 * Manages sharp CAD feature edge lines for generated mold bodies.
 *
 * Uses a 25-degree threshold angle to extract real structural feature edges
 * (cavity corners, step cutouts, parting lines) without visual triangulation noise.
 *
 * Keeps edge lines in a dedicated container group ("ReferenceMoldFeatureEdges")
 * so that children arrays of mold body mesh groups remain 100% instanceof Mesh.
 */
export function createFeatureEdgeOverlay(): FeatureEdgeOverlay {
  const group = new Group();
  group.name = "ReferenceMoldFeatureEdges";
  group.userData.referenceMoldVisualization = true;

  const lineMaterial = new LineBasicMaterial({
    color: 0x380f0e,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  const clearLines = () => {
    for (const child of [...group.children]) {
      if (child instanceof LineSegments) {
        child.geometry.dispose();
      }
      child.removeFromParent();
    }
  };

  return {
    group,
    updateFromMoldMeshes: (moldMeshes) => {
      clearLines();

      for (const mesh of moldMeshes) {
        if (!mesh.geometry) continue;

        const edgeGeometry = new EdgesGeometry(mesh.geometry, 25);
        const edgeLine = new LineSegments(edgeGeometry, lineMaterial);
        edgeLine.name = `${mesh.name}_Edges`;
        edgeLine.renderOrder = 9;
        edgeLine.visible = mesh.visible;
        edgeLine.raycast = () => undefined;
        edgeLine.userData.referenceMoldVisualization = true;
        edgeLine.userData.sourceMoldBodyId = mesh.userData.moldBodyId;

        // Position & transform sync with source mesh
        edgeLine.position.copy(mesh.position);
        edgeLine.quaternion.copy(mesh.quaternion);
        edgeLine.scale.copy(mesh.scale);

        group.add(edgeLine);
      }
    },
    setColor: (color) => {
      lineMaterial.color.setHex(color);
    },
    dispose: () => {
      clearLines();
      lineMaterial.dispose();
      group.removeFromParent();
    },
  };
}
