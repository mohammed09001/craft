import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  type WebGLRendererParameters,
  WebGLRenderer
} from "three";

import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

const MAX_DEVICE_PIXEL_RATIO = 2;

export function getClampedDevicePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  context: WebGL2RenderingContext,
  palette: ViewportPalette,
) {
  const parameters: WebGLRendererParameters = {
    canvas,
    context,
    antialias: true,
    alpha: false,
    stencil: false,
    preserveDrawingBuffer: false,
  };
  const renderer = new WebGLRenderer(parameters);

  // CAD visual baseline configuration.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(palette.background, 1);
  renderer.setPixelRatio(getClampedDevicePixelRatio());

  return renderer;
}

