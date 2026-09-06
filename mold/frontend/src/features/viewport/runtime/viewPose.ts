import { Box3, Group, PerspectiveCamera, Sphere, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MIN_DISPLAYABLE_SIZE = 1e-9;
const FIT_MARGIN = 1.35;
const RESET_VIEW_DIRECTION = new Vector3(1, -1, 0.78).normalize();

export type FitDistanceInput = {
  radius: number;
  verticalFovDegrees: number;
  aspect: number;
  margin?: number;
};

type ModelBounds = {
  box: Box3;
  sphere: Sphere;
};

function isFiniteVector(vector: Vector3) {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function getSafeViewDirection(
  camera: PerspectiveCamera,
  controls: OrbitControls,
) {
  const direction = camera.position.clone().sub(controls.target);

  if (!isFiniteVector(direction) || direction.lengthSq() <= MIN_DISPLAYABLE_SIZE) {
    return RESET_VIEW_DIRECTION.clone();
  }

  return direction.normalize();
}

function updateCameraClipping(
  camera: PerspectiveCamera,
  distance: number,
  radius: number,
) {
  camera.near = Math.max((distance - radius * 2) / 100, 0.01);
  camera.far = Math.max(distance + radius * 20, camera.near + 1);
  camera.updateProjectionMatrix();
}

export function calculateFitDistance({
  radius,
  verticalFovDegrees,
  aspect,
  margin = FIT_MARGIN,
}: FitDistanceInput) {
  if (
    !Number.isFinite(radius) ||
    radius <= MIN_DISPLAYABLE_SIZE ||
    !Number.isFinite(verticalFovDegrees) ||
    verticalFovDegrees <= 0 ||
    !Number.isFinite(aspect) ||
    aspect <= 0
  ) {
    return null;
  }

  const verticalHalfFov = (verticalFovDegrees * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);

  if (!Number.isFinite(limitingHalfFov) || limitingHalfFov <= 0) {
    return null;
  }

  return (radius / Math.sin(limitingHalfFov)) * margin;
}

export function getModelBounds(modelRoot: Group): ModelBounds | null {
  modelRoot.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(modelRoot);

  if (box.isEmpty()) {
    return null;
  }

  const sphere = box.getBoundingSphere(new Sphere());

  if (
    !isFiniteVector(box.min) ||
    !isFiniteVector(box.max) ||
    !isFiniteVector(sphere.center) ||
    !Number.isFinite(sphere.radius) ||
    sphere.radius <= MIN_DISPLAYABLE_SIZE
  ) {
    return null;
  }

  return { box, sphere };
}

export function fitCameraToModel(
  modelRoot: Group,
  camera: PerspectiveCamera,
  controls: OrbitControls,
) {
  const bounds = getModelBounds(modelRoot);

  if (bounds === null) {
    return false;
  }

  const distance = calculateFitDistance({
    radius: bounds.sphere.radius,
    verticalFovDegrees: camera.fov,
    aspect: camera.aspect,
  });

  if (distance === null) {
    return false;
  }

  const direction = getSafeViewDirection(camera, controls);

  controls.target.copy(bounds.sphere.center);
  controls.minDistance = Math.max(bounds.sphere.radius * 0.02, 0.01);
  controls.maxDistance = Math.max(distance + bounds.sphere.radius * 20, 1);
  camera.position.copy(bounds.sphere.center).addScaledVector(direction, distance);
  updateCameraClipping(camera, distance, bounds.sphere.radius);
  controls.update();

  return true;
}

export function resetCameraToModel(
  modelRoot: Group,
  camera: PerspectiveCamera,
  controls: OrbitControls,
) {
  const bounds = getModelBounds(modelRoot);

  if (bounds === null) {
    camera.up.set(0, 0, 1);
    camera.position.set(95, -120, 85);
    controls.target.set(0, 0, 12);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    return false;
  }

  const distance = calculateFitDistance({
    radius: bounds.sphere.radius,
    verticalFovDegrees: camera.fov,
    aspect: camera.aspect,
  });

  if (distance === null) {
    return false;
  }

  camera.up.set(0, 0, 1);
  controls.target.copy(bounds.sphere.center);
  controls.minDistance = Math.max(bounds.sphere.radius * 0.02, 0.01);
  controls.maxDistance = Math.max(distance + bounds.sphere.radius * 20, 1);
  camera.position
    .copy(bounds.sphere.center)
    .addScaledVector(RESET_VIEW_DIRECTION, distance);
  camera.lookAt(bounds.sphere.center);
  updateCameraClipping(camera, distance, bounds.sphere.radius);
  controls.update();

  return true;
}

