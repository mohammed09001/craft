/**
 * Viewport look reference fixture generator for the native migration.
 *
 * Instantiates the REAL reference modules that decide how the viewport looks and records their values: the five-point
 * lighting rig (positions, colours, intensities, in both theme variants), the CAD surface themes (part and mold colours,
 * roughness, metalness, background gradient), the engineering grid materials, the feature-edge overlay (colour, opacity and
 * which dihedral angles produce an edge), and how the theme is resolved from a palette. Replayed by tst_viewport_look.cpp
 * against the native look. (The renderer's tone mapping and the environment intensity are set in createRenderer and
 * createViewportEnvironment, which need a WebGL context; they are noted in the native look with their source lines.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, type LineSegments } from "three";

import { createEngineeringGrid } from "@/features/viewport/runtime/createEngineeringGrid";
import { createFeatureEdgeOverlay } from "@/features/viewport/runtime/featureEdgeOverlay";
import { createViewportLightingRig } from "@/features/viewport/runtime/viewportLightingRig";
import {
  CAD_DARK_THEME,
  CAD_LIGHT_THEME,
  isLightColor,
  resolveCadTheme,
} from "@/features/viewport/runtime/viewportVisualTheme";
import { createCadMaterial } from "@/features/viewport/runtime/cadMaterialFactory";

const outputPath = resolve(process.env.CRAFT_LOOK_OUTPUT ?? "look-reference.json");

const DARK_PALETTE = { background: "rgb(11, 17, 24)", gridMajor: "rgb(48, 57, 67)", gridMinor: "rgba(100 114 129 / 0.16)" };
const LIGHT_PALETTE = { background: "rgb(247, 249, 251)", gridMajor: "rgb(183, 195, 207)", gridMinor: "rgba(135 149 163 / 0.2)" };

function rig(palette: typeof DARK_PALETTE) {
  const r = createViewportLightingRig();
  r.updateTheme(palette);
  const one = (name: string, light: { position: { toArray(): number[] }; color: { getHex(): number }; intensity: number }) => ({
    name,
    position: light.position.toArray(),
    colorHex: light.color.getHex(),
    intensity: light.intensity,
  });
  return {
    key: one("key", r.keyLight),
    fill: one("fill", r.fillLight),
    rim: one("rim", r.rimLight),
    ambient: { colorHex: r.ambientLight.color.getHex(), intensity: r.ambientLight.intensity },
    hemisphere: {
      skyHex: r.hemisphereLight.color.getHex(),
      groundHex: r.hemisphereLight.groundColor.getHex(),
      intensity: r.hemisphereLight.intensity,
    },
    keyCastsShadow: r.keyLight.castShadow,
  };
}

function theme(t: typeof CAD_DARK_THEME) {
  return { ...t };
}

// Does an edge appear between two triangles that meet at the given dihedral (bend) angle, under the overlay's threshold?
function edgeAppears(bendDegrees: number): boolean {
  const bend = (bendDegrees * Math.PI) / 180;
  // Triangle A in the XY plane, triangle B hinged on the shared edge (0,0,0)-(1,0,0), bent up by `bend`.
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, -1, 0,
    1, 0, 0, 0, 0, 0, 0, Math.cos(bend), Math.sin(bend),
  ]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.name = "hinge";
  const overlay = createFeatureEdgeOverlay();
  overlay.updateFromMoldMeshes([mesh]);
  const line = overlay.group.children[0] as LineSegments;
  // Every border edge of the open pair also appears; the shared hinge adds a segment only when it is a feature edge.
  const count = line.geometry.getAttribute("position").count / 2;
  overlay.dispose();
  return count > 4;
}

it("records the viewport look of the reference", () => {
  const overlay = createFeatureEdgeOverlay();
  const sample = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  const grid = createEngineeringGrid({ background: "#0b1118", gridMajor: "#303943", gridMinor: "#46525f" });
  const darkPart = createCadMaterial("imported-part", "solid", CAD_DARK_THEME) as unknown as { color: { getHex(): number }; roughness: number; metalness: number; side: number };
  const outerMold = createCadMaterial("outer-mold", "solid", CAD_DARK_THEME) as unknown as { color: { getHex(): number }; roughness: number; metalness: number; side: number };

  const result = {
    lightingRig: { dark: rig(DARK_PALETTE), light: rig(LIGHT_PALETTE) },
    themes: { dark: theme(CAD_DARK_THEME), light: theme(CAD_LIGHT_THEME) },
    themeResolution: {
      darkPaletteIsLight: isLightColor(DARK_PALETTE.background),
      lightPaletteIsLight: isLightColor(LIGHT_PALETTE.background),
      lightPaletteResolvesToLightTheme: resolveCadTheme(LIGHT_PALETTE) === CAD_LIGHT_THEME,
      hexBackgroundF7F9FBIsLight: isLightColor("#f7f9fb"),
    },
    materials: {
      importedPartDark: { colorHex: darkPart.color.getHex(), roughness: darkPart.roughness, metalness: darkPart.metalness, doubleSided: darkPart.side === 2 },
      outerMoldDark: { colorHex: outerMold.color.getHex(), roughness: outerMold.roughness, metalness: outerMold.metalness, doubleSided: outerMold.side === 2 },
    },
    grid: {
      minorOpacity: (grid.userData.minorMaterial as { opacity: number }).opacity,
      majorOpacity: (grid.userData.majorMaterial as { opacity: number }).opacity,
      transparent: (grid.userData.minorMaterial as { transparent: boolean }).transparent,
    },
    featureEdges: {
      // The overlay material is created inside; read it from a line made for a sample mesh.
      colorHex: (() => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
        sample.geometry = geometry;
        overlay.updateFromMoldMeshes([sample]);
        const line = overlay.group.children[0] as LineSegments;
        const material = line.material as unknown as { color: { getHex(): number }; opacity: number; depthWrite: boolean };
        return { color: material.color.getHex(), opacity: material.opacity, depthWrite: material.depthWrite };
      })(),
      // Bend angles (degrees) at which the shared edge of a hinge becomes a feature edge: the overlay's threshold angle.
      appearsAtBend: Object.fromEntries([5, 15, 20, 24, 26, 30, 45, 90].map((a) => [String(a), edgeAppears(a)])),
    },
  };

  // The CAD themes are plain data: the generator is the only thing that can notice them drifting.
  expect(result.themes.dark.importedPartColor).toBe(0xb8e3ec);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  overlay.dispose();
});
