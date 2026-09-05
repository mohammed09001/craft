import { CanvasTexture, Scene, SRGBColorSpace, WebGLRenderer } from "three";

import type { ViewportPalette } from "@/features/viewport/viewport.contracts";
import { resolveCadTheme } from "@/features/viewport/runtime/viewportVisualTheme";

export interface ViewportBackground {
  updatePalette(palette: ViewportPalette): void;
  dispose(): void;
}

/**
 * Provides a subtle CAD engineering background gradient for the 3D scene.
 *
 * Creates a soft 2-stop vertical gradient texture (top sky vs bottom ground)
 * matching standard CAD software work environments (Fusion 360, SolidWorks, NX).
 */
export function createViewportBackground(
  renderer: WebGLRenderer,
  scene: Scene,
  initialPalette: ViewportPalette,
): ViewportBackground {
  let texture: CanvasTexture | null = null;

  const applyGradient = (palette: ViewportPalette) => {
    try {
      const theme = resolveCadTheme(palette);

      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");

      if (ctx === null) {
        renderer.setClearColor?.(palette.background, 1);
        return;
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, theme.backgroundTop);
      gradient.addColorStop(1, theme.backgroundBottom);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 512);

      if (texture !== null) {
        texture.dispose();
      }

      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      scene.background = texture;
      renderer.setClearColor?.(palette.background, 1);
    } catch {
      renderer.setClearColor?.(palette.background, 1);
    }
  };

  applyGradient(initialPalette);

  return {
    updatePalette: (palette) => {
      applyGradient(palette);
    },
    dispose: () => {
      if (scene.background === texture && texture !== null) {
        scene.background = null;
      }
      if (texture !== null) {
        texture.dispose();
        texture = null;
      }
    },
  };
}
