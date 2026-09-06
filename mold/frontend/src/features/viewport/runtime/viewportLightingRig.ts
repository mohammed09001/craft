import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
} from "three";

import { updateAdaptiveShadowCamera } from "@/features/viewport/runtime/adaptiveShadowCamera";

import type { ViewportPalette } from "@/features/viewport/viewport.contracts";
import { isLightColor } from "@/features/viewport/runtime/viewportVisualTheme";

export interface ViewportLightingRig {
  readonly object: Group;
  readonly keyLight: DirectionalLight;
  readonly fillLight: DirectionalLight;
  readonly rimLight: DirectionalLight;
  readonly ambientLight: AmbientLight;
  readonly hemisphereLight: HemisphereLight;
  updateBounds(bounds: Box3 | null): void;
  updateTheme(palette: ViewportPalette): void;
}

/**
 * Creates a documented 5-point CAD studio lighting rig.
 *
 * Combines low ambient light (to preserve cavity depth),
 * soft sky/ground hemisphere contrast, dynamic key lighting,
 * fill illumination, and silhouette rim separation.
 */
export function createViewportLightingRig(): ViewportLightingRig {
  const group = new Group();
  group.name = "cad-lighting-rig";

  // 1. Controlled low ambient intensity preserves depth inside cavities
  const ambientLight = new AmbientLight(0xffffff, 0.15);
  ambientLight.name = "cad-ambient-light";

  // 2. Soft sky/ground separation improves top/bottom face readability
  const hemisphereLight = new HemisphereLight(
    0xd8e2fd,
    0x1f232b,
    0.40,
  );
  hemisphereLight.name = "cad-hemisphere-light";
  hemisphereLight.position.set(0, 0, 120);

  // 3. Primary key light: defines overall form, primary face contrast, and directional shadows
  const keyLight = new DirectionalLight(0xffffff, 1.45);
  keyLight.name = "cad-key-light";
  keyLight.position.set(90, -110, 150);

  // Configure soft PCF shadows safely
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.0001;

  // 4. Fill light: preserves shadow details in cavity corners without flattening
  const fillLight = new DirectionalLight(0xbde0fe, 0.35);
  fillLight.name = "cad-fill-light";
  fillLight.position.set(-100, 75, 65);

  // 5. Rim light: separates outer silhouettes and sprue/funnel edges from dark viewport background
  const rimLight = new DirectionalLight(0xffffff, 0.50);
  rimLight.name = "cad-rim-light";
  rimLight.position.set(-55, -80, 105);

  group.add(
    ambientLight,
    hemisphereLight,
    keyLight,
    keyLight.target,
    fillLight,
    rimLight,
  );

  updateAdaptiveShadowCamera(keyLight, null);

  const updateTheme = (palette: ViewportPalette) => {
    const isLight = isLightColor(palette.background);

    if (isLight) {
      keyLight.intensity = 1.30;
      fillLight.intensity = 0.45;
      rimLight.intensity = 0.40;
      ambientLight.intensity = 0.22;
      hemisphereLight.color.setHex(0xffffff);
      hemisphereLight.groundColor.setHex(0xcfd8e8);
      hemisphereLight.intensity = 0.45;
    } else {
      keyLight.intensity = 1.45;
      fillLight.intensity = 0.35;
      rimLight.intensity = 0.50;
      ambientLight.intensity = 0.15;
      hemisphereLight.color.setHex(0xd8e2fd);
      hemisphereLight.groundColor.setHex(0x1f232b);
      hemisphereLight.intensity = 0.40;
    }
  };

  return {
    object: group,
    keyLight,
    fillLight,
    rimLight,
    ambientLight,
    hemisphereLight,
    updateBounds: (bounds) => {
      updateAdaptiveShadowCamera(keyLight, bounds);
    },
    updateTheme,
  };
}
