import type { Material } from "three";

import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import {
  CadGeometryRole,
  createCadMaterial,
} from "@/features/viewport/runtime/cadMaterialFactory";
import {
  CAD_DARK_THEME,
  resolveCadTheme,
} from "@/features/viewport/runtime/viewportVisualTheme";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

export const MOLD_RED = CAD_DARK_THEME.outerMoldColor;

export function createMoldAppearanceMaterial(
  mode: MoldAppearanceMode,
  role: CadGeometryRole = "outer-mold",
  palette?: ViewportPalette,
): Material {
  const theme = palette !== undefined ? resolveCadTheme(palette) : CAD_DARK_THEME;
  return createCadMaterial(role, mode, theme);
}
