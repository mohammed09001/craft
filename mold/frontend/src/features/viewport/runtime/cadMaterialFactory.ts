import {
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
} from "three";

import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import {
  CAD_DARK_THEME,
  type CadSurfaceTheme,
} from "@/features/viewport/runtime/viewportVisualTheme";

export type CadGeometryRole =
  | "outer-mold"
  | "cavity-surface"
  | "registration-key"
  | "sprue-funnel"
  | "imported-part";

export function createCadMaterial(
  role: CadGeometryRole,
  mode: MoldAppearanceMode = "solid",
  theme: CadSurfaceTheme = CAD_DARK_THEME,
): Material {
  if (mode === "glass") {
    return new MeshPhysicalMaterial({
      color: theme.outerMoldColor,
      metalness: 0.02,
      roughness: 0.18,
      transmission: 0.68,
      thickness: 0.8,
      ior: 1.45,
      opacity: 0.3,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
  }

  switch (role) {
    case "cavity-surface":
      return new MeshStandardMaterial({
        color: theme.cavitySurfaceColor,
        metalness: theme.cavityMetalness,
        roughness: theme.cavityRoughness,
        opacity: 1,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
      });

    case "registration-key":
      return new MeshStandardMaterial({
        color: theme.registrationKeyColor,
        metalness: theme.registrationMetalness,
        roughness: theme.registrationRoughness,
        opacity: 1,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
      });

    case "sprue-funnel":
      return new MeshStandardMaterial({
        color: theme.sprueFunnelColor,
        metalness: theme.sprueMetalness,
        roughness: theme.sprueRoughness,
        opacity: 1,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
      });

    case "imported-part":
      return new MeshStandardMaterial({
        color: theme.importedPartColor,
        metalness: theme.importedMetalness,
        roughness: theme.importedRoughness,
        opacity: 1,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
      });

    case "outer-mold":
    default:
      return new MeshStandardMaterial({
        color: theme.outerMoldColor,
        metalness: theme.outerMetalness,
        roughness: theme.outerRoughness,
        opacity: 1,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
      });
  }
}
