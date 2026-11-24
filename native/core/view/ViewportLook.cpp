#include "view/ViewportLook.h"

#include <cmath>

namespace craft {

namespace {
double srgbToLinear(double c) { return c <= 0.04045 ? c / 12.92 : std::pow((c + 0.055) / 1.055, 2.4); }
}  // namespace

std::array<float, 3> roleTint(std::uint32_t roleRgb, std::uint32_t outerRgb) {
  std::array<float, 3> tint{};
  for (int channel = 0; channel < 3; ++channel) {
    const int shift = 16 - 8 * channel;
    const double role = srgbToLinear(((roleRgb >> shift) & 0xffu) / 255.0);
    const double outer = srgbToLinear(((outerRgb >> shift) & 0xffu) / 255.0);
    tint[static_cast<std::size_t>(channel)] = outer > 0 ? static_cast<float>(role / outer) : 1.0f;
  }
  return tint;
}

ViewportLook referenceLook(bool dark) {
  ViewportLook look{};
  // The page background the renderer clears to (Viewport.tsx FALLBACK_PALETTE / the theme tokens, measured in frames).
  look.backgroundRgb = dark ? 0x0b1118 : 0xf7f9fb;

  // CAD_DARK_THEME importedPartColor / outerMoldColor, importedRoughness / importedMetalness (outer mold: the same).
  look.partRgb = 0xb8e3ec;
  look.moldRgb = 0xba4a44;
  look.roughness = 0.38;
  look.metalness = 0.06;

  // CAD_DARK_THEME cavitySurface / registrationKey / sprueFunnel colours with their roughness and metalness (look-reference.json,
  // materials.roles), and the glass appearance (materials.glass).
  look.cavitySurface = {0x9b3934, 0.32, 0.08};
  look.registrationKey = {0xd4a338, 0.35, 0.06};
  look.sprueFunnel = {0xdfad3c, 0.32, 0.08};
  look.glass = {0.3, 0.18, 0.02, 0.68, 0.8, 1.45};

  // featureEdgeOverlay.ts
  look.edgeRgb = 0x380f0e;
  look.edgeOpacity = 0.65;
  look.edgeAngleDegrees = 25.0;
  look.staleMasterOpacity = 0.2;

  // createEngineeringGrid.ts: opacities 0.32 and 0.50. The minor colour is the palette's "rgba(r g b / a)" string, which
  // three.js cannot parse, so its default white is used in both themes; the major colour is the palette's parseable
  // rgb(48, 57, 67) (dark) or rgb(183, 195, 207) (light). Checked against the real code by ruler-reference.json.
  look.gridMinor = {0xffffffu, 0.32};
  look.gridMajor = {dark ? 0x303943u : 0xb7c3cfu, 0.50};
  look.rulerLabelRgb = dark ? 0xfbbf24u : 0x1d4ed8u;  // deriveRulerLabelColor

  // viewportLightingRig.ts, dark variant (the one the application shows in both themes, see above).
  look.key = {{90, -110, 150}, 0xffffff, 1.45};
  look.fill = {{-100, 75, 65}, 0xbde0fe, 0.35};
  look.rim = {{-55, -80, 105}, 0xffffff, 0.50};
  look.ambientRgb = 0xffffff;
  look.ambientIntensity = 0.15;
  look.hemisphereSkyRgb = 0xd8e2fd;
  look.hemisphereGroundRgb = 0x1f232b;
  look.hemisphereIntensity = 0.40;

  // createViewportEnvironment.ts (scene.environmentIntensity) and createRenderer.ts (toneMappingExposure).
  look.environmentIntensity = 0.55;
  look.exposure = 0.95;
  return look;
}

}  // namespace craft
