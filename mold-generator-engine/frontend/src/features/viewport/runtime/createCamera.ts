import { PerspectiveCamera, Vector3 } from "three";

export function createCamera() {
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);

  camera.up.set(0, 0, 1);
  camera.position.set(95, -120, 85);
  camera.lookAt(new Vector3(0, 0, 10));
  camera.updateProjectionMatrix();

  return camera;
}
