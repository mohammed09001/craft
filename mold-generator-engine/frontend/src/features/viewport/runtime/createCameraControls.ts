import { MOUSE, TOUCH, type PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type CameraControlsOptions = {
  onChange: () => void;
  onInteractionStart: () => void;
};

export function createCameraControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  { onChange, onInteractionStart }: CameraControlsOptions,
) {
  const controls = new OrbitControls(camera, canvas);

  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.target.set(0, 0, 12);
  controls.minDistance = 35;
  controls.maxDistance = 420;
  controls.mouseButtons = {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.PAN,
  };
  controls.touches = {
    ONE: TOUCH.ROTATE,
    TWO: TOUCH.DOLLY_PAN,
  };
  controls.listenToKeyEvents(host);
  controls.addEventListener("start", onInteractionStart);
  controls.addEventListener("change", onChange);

  return controls;
}
