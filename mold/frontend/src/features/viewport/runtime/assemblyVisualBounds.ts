import { Box3, Mesh, Object3D } from "three";

/**
 * Calculates the unified bounding box for all visible mold bodies and imported models.
 *
 * Ensures lights, shadows, and environment contributions adapt to the ENTIRE mold assembly
 * rather than individual isolated meshes.
 */
export function calculateAssemblyVisualBounds(
  moldRoot: Object3D | null,
  modelRoot: Object3D | null,
): Box3 | null {
  const combinedBounds = new Box3();
  let hasValidMesh = false;

  const expandFromMesh = (object: Object3D) => {
    object.traverse((child) => {
      if (child instanceof Mesh && child.visible && child.geometry) {
        child.updateWorldMatrix(true, false);
        if (!child.geometry.boundingBox) {
          child.geometry.computeBoundingBox();
        }
        if (child.geometry.boundingBox && !child.geometry.boundingBox.isEmpty()) {
          const worldBox = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
          combinedBounds.union(worldBox);
          hasValidMesh = true;
        }
      }
    });
  };

  if (moldRoot !== null) {
    expandFromMesh(moldRoot);
  }

  if (modelRoot !== null) {
    expandFromMesh(modelRoot);
  }

  return hasValidMesh ? combinedBounds : null;
}
