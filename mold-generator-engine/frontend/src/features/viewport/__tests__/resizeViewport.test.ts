import type { PerspectiveCamera, WebGLRenderer } from "three";

import {
  observeViewportResize,
  resizeViewport,
} from "@/features/viewport/runtime/resizeViewport";

function setHostSize(host: HTMLElement, width: number, height: number) {
  Object.defineProperty(host, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(host, "clientHeight", {
    configurable: true,
    value: height,
  });
}

function createResizeSubject() {
  const host = document.createElement("div");
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
  } as unknown as WebGLRenderer;
  const camera = {
    aspect: 1,
    updateProjectionMatrix: vi.fn(),
  } as unknown as PerspectiveCamera;

  return { host, renderer, camera };
}

it("resizes the renderer and updates camera projection", () => {
  const { host, renderer, camera } = createResizeSubject();
  setHostSize(host, 640, 320);

  expect(resizeViewport(host, renderer, camera)).toBe(true);
  expect(camera.aspect).toBe(2);
  expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
  expect(renderer.setSize).toHaveBeenCalledWith(640, 320, false);
});

it("handles zero-size hosts without throwing", () => {
  const { host, renderer, camera } = createResizeSubject();
  setHostSize(host, 0, 0);

  expect(resizeViewport(host, renderer, camera)).toBe(false);
  expect(camera.updateProjectionMatrix).not.toHaveBeenCalled();
  expect(renderer.setSize).toHaveBeenCalledWith(0, 0, false);
});

it("uses ResizeObserver to request resize work and disconnects it", () => {
  const disconnect = vi.fn();
  const observe = vi.fn();
  const onResize = vi.fn();

  class ResizeObserverMock {
    observe = observe;
    disconnect = disconnect;
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);

  const host = document.createElement("div");
  const cleanup = observeViewportResize(host, onResize);

  expect(observe).toHaveBeenCalledWith(host);

  cleanup();

  expect(disconnect).toHaveBeenCalled();
});
