import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from "three";

import {
  calculateFitDistance,
  fitCameraToModel,
  resetCameraToModel,
} from "@/features/viewport/runtime/viewPose";

function createControls() {
  return {
    maxDistance: 0,
    minDistance: 0,
    target: new Vector3(),
    update: vi.fn(() => false),
  };
}

function createModel(size: number) {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(size, size, size));

  mesh.position.set(0, 0, size / 2);
  root.add(mesh);
  root.updateWorldMatrix(true, true);

  return root;
}

it("calculates larger fit distances for larger models", () => {
  const small = calculateFitDistance({
    radius: 10,
    verticalFovDegrees: 45,
    aspect: 1,
  });
  const large = calculateFitDistance({
    radius: 100,
    verticalFovDegrees: 45,
    aspect: 1,
  });

  expect(small).not.toBeNull();
  expect(large).not.toBeNull();
  expect(large ?? 0).toBeGreaterThan(small ?? 0);
});

it("accounts for narrow aspect ratios", () => {
  const wide = calculateFitDistance({
    radius: 10,
    verticalFovDegrees: 45,
    aspect: 2,
  });
  const narrow = calculateFitDistance({
    radius: 10,
    verticalFovDegrees: 45,
    aspect: 0.5,
  });

  expect(wide).not.toBeNull();
  expect(narrow).not.toBeNull();
  expect(narrow ?? 0).toBeGreaterThan(wide ?? 0);
});

it("rejects invalid or zero bounds inputs", () => {
  expect(
    calculateFitDistance({
      radius: 0,
      verticalFovDegrees: 45,
      aspect: 1,
    }),
  ).toBeNull();
  expect(
    calculateFitDistance({
      radius: Number.POSITIVE_INFINITY,
      verticalFovDegrees: 45,
      aspect: 1,
    }),
  ).toBeNull();
});

it("fits the camera while preserving the current view direction", () => {
  const model = createModel(20);
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
  const controls = createControls();

  controls.target.set(0, 0, 0);
  camera.position.set(0, -100, 50);

  expect(fitCameraToModel(model, camera, controls as never)).toBe(true);
  expect(controls.update).toHaveBeenCalled();
  expect(camera.position.y).toBeLessThan(controls.target.y);
});

it("resets to the default inspection direction", () => {
  const model = createModel(20);
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
  const controls = createControls();

  camera.position.set(-200, 0, 10);

  expect(resetCameraToModel(model, camera, controls as never)).toBe(true);
  expect(controls.update).toHaveBeenCalled();
  expect(camera.position.x).toBeGreaterThan(controls.target.x);
  expect(camera.position.y).toBeLessThan(controls.target.y);
  expect(camera.up.toArray()).toEqual([0, 0, 1]);
});

