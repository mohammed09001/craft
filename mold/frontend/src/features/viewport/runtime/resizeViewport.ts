import type { PerspectiveCamera, WebGLRenderer } from "three";

import { getClampedDevicePixelRatio } from "@/features/viewport/runtime/createRenderer";

export function resizeViewport(
  host: HTMLElement,
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
) {
  const width = Math.max(0, Math.floor(host.clientWidth));
  const height = Math.max(0, Math.floor(host.clientHeight));

  renderer.setPixelRatio(getClampedDevicePixelRatio());

  if (width === 0 || height === 0) {
    renderer.setSize(0, 0, false);
    return false;
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);

  return true;
}

export function observeViewportResize(
  host: HTMLElement,
  onResize: () => void,
) {
  const observer = new ResizeObserver(onResize);

  observer.observe(host);

  return () => {
    observer.disconnect();
  };
}
