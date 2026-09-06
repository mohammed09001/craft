import { Box3, DirectionalLight, Vector3 } from "three";

/**
 * Dynamically adapts directional key light shadow camera frustum
 * to match the exact extent of the active model or mold block.
 *
 * Prevents shadow clipping or acne regardless of model dimensions.
 */
export function updateAdaptiveShadowCamera(
  keyLight: DirectionalLight,
  bounds: Box3 | null,
) {
  if (keyLight.shadow === undefined) {
    return;
  }

  if (bounds === null || bounds.isEmpty()) {
    // Default safe fallback for typical mold blocks (~100-200mm)
    keyLight.shadow.camera.left = -200;
    keyLight.shadow.camera.right = 200;
    keyLight.shadow.camera.top = 200;
    keyLight.shadow.camera.bottom = -200;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 800;
    keyLight.shadow.camera.updateProjectionMatrix();
    return;
  }

  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 20);
  const margin = maxDim * 0.75;

  keyLight.target.position.copy(center);
  keyLight.target.updateMatrixWorld();

  keyLight.shadow.camera.left = -margin;
  keyLight.shadow.camera.right = margin;
  keyLight.shadow.camera.top = margin;
  keyLight.shadow.camera.bottom = -margin;

  const lightDist = keyLight.position.distanceTo(center);
  keyLight.shadow.camera.near = Math.max(1, lightDist - maxDim * 2);
  keyLight.shadow.camera.far = lightDist + maxDim * 2;
  keyLight.shadow.camera.updateProjectionMatrix();
}
