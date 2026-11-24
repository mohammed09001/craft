#pragma once

// How the reference viewport looks, as plain data (no Qt, no renderer): the lighting rig, the surface colours and
// materials, the feature-edge style and the grid. Every value is taken from the reference's own modules and checked
// against them by tst_viewport_look (look-reference.json, generated from the real code):
//   viewportLightingRig.ts       the five-point rig (ambient, hemisphere, key, fill, rim)
//   viewportVisualTheme.ts       CAD_DARK_THEME colours, roughness, metalness
//   featureEdgeOverlay.ts        edge colour 0x380f0e, opacity 0.65, threshold 25 degrees
//   createEngineeringGrid.ts     grid opacities 0.32 (minor) and 0.50 (major)
//   createRenderer.ts            ACES tone mapping, exposure 0.95   (needs a WebGL context: noted here, not in the fixture)
//   viewportEnvironment.ts       RoomEnvironment image-based light, intensity 0.55   (same)
//   Viewport.tsx / tokens.css    the page background the renderer clears to, per theme
//
// The reference's theme-dependent branches (a light rig, a light part colour) are not taken in the running application:
// frames rendered in the light theme show the dark theme's part colour and shading, measured pixel for pixel
// (docs/native-migration/VIEWPORT_COMPARISON.md, D-081). Native follows what the application shows, so only the
// background, the grid and the overlay text change with the theme.

#include <array>
#include <cstdint>

#include "view/ViewPose.h"

namespace craft {

struct LookLight {
  Vec3 position;            // the light shines from here towards the origin (three.js DirectionalLight, target at 0,0,0)
  std::uint32_t colorRgb;
  double intensity;
};

struct LookGridLine {
  std::uint32_t colorRgb;
  double opacity;
};

/// One geometry role's surface (MeshStandardMaterial): the outer mold's is ViewportLook::moldRgb / roughness / metalness.
struct LookRole {
  std::uint32_t rgb;
  double roughness;
  double metalness;
};

/// The glass mold appearance (cadMaterialFactory.ts, mode "glass"): one MeshPhysicalMaterial for every role, in the outer mold's colour.
struct LookGlass {
  double opacity;
  double roughness;
  double metalness;
  double transmission;
  double thickness;
  double ior;
};

struct ViewportLook {
  std::uint32_t backgroundRgb;

  // Surfaces (MeshStandardMaterial, double sided).
  std::uint32_t partRgb;
  std::uint32_t moldRgb;
  double roughness;
  double metalness;

  // The faces of a mold body are coloured by what they are (a face run's role, moldBodyMesh3d.ts): the cavity's inner surface, a
  // registration key, a sprue funnel. Everything else is the outer mold.
  LookRole cavitySurface, registrationKey, sprueFunnel;
  LookGlass glass;

  // Feature edges, drawn on mold bodies only (the reference does not outline the imported part).
  std::uint32_t edgeRgb;
  double edgeOpacity;
  double edgeAngleDegrees;

  // A stale Master Mold body is ghosted to this opacity at most (STALE_MASTER_MOLD_OPACITY, masterMoldBody3dRuntime.ts).
  double staleMasterOpacity;

  LookGridLine gridMinor;
  LookGridLine gridMajor;

  // The ground-plane ruler: its axes take the major grid colour and its ticks the minor one (createGroundPlaneRulerRuntime.ts);
  // the labels are yellow on a dark background and blue on a light one.
  std::uint32_t rulerLabelRgb;

  // Lighting.
  LookLight key, fill, rim;
  double ambientIntensity;
  std::uint32_t ambientRgb;
  std::uint32_t hemisphereSkyRgb, hemisphereGroundRgb;
  double hemisphereIntensity;
  double environmentIntensity;
  double exposure;
};

/// The reference look for a theme. Only the background and the grid depend on it.
ViewportLook referenceLook(bool dark);

/// The linear-light factor that turns the outer mold's colour into `roleRgb` when it multiplies the material's base colour (Qt converts a
/// colour property from sRGB to linear, then multiplies a vertex colour into it): linear(role) / linear(outer) per channel. It can
/// exceed 1 (a yellow key on a red body), which a float vertex colour carries.
std::array<float, 3> roleTint(std::uint32_t roleRgb, std::uint32_t outerRgb);

}  // namespace craft
