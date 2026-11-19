#include "view/ViewportLook.h"

namespace craft {

ViewportLook referenceLook(bool dark) {
  ViewportLook look{};
  // The page background the renderer clears to (Viewport.tsx FALLBACK_PALETTE / the theme tokens, measured in frames).
  look.backgroundRgb = dark ? 0x0b1118 : 0xf7f9fb;

  // CAD_DARK_THEME importedPartColor / outerMoldColor, importedRoughness / importedMetalness (outer mold: the same).
  look.partRgb = 0xb8e3ec;
  look.moldRgb = 0xba4a44;
  look.roughness = 0.38;
  look.metalness = 0.06;

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
