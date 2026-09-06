import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

/**
 * CAD Rendering Theme Definitions.
 *
 * Defines surface-role colors, material physical parameters,
 * and viewport studio background parameters for CAD clarity.
 */

export interface CadSurfaceTheme {
  readonly outerMoldColor: number;
  readonly cavitySurfaceColor: number;
  readonly registrationKeyColor: number;
  readonly sprueFunnelColor: number;
  readonly importedPartColor: number;
  readonly featureEdgeColor: number;
  readonly segmentationEnvelopeColor: number;

  readonly outerRoughness: number;
  readonly outerMetalness: number;
  readonly cavityRoughness: number;
  readonly cavityMetalness: number;
  readonly registrationRoughness: number;
  readonly registrationMetalness: number;
  readonly sprueRoughness: number;
  readonly sprueMetalness: number;
  readonly importedRoughness: number;
  readonly importedMetalness: number;
  readonly segmentationEnvelopeRoughness: number;
  readonly segmentationEnvelopeMetalness: number;
  readonly segmentationRegistrationRoughness: number;
  readonly segmentationRegistrationMetalness: number;
  readonly segmentationRegistrationOpacity: number;

  readonly backgroundTop: string;
  readonly backgroundBottom: string;
}

export const CAD_DARK_THEME: CadSurfaceTheme = {
  outerMoldColor: 0xba4a44,        // Refined satin CAD red
  cavitySurfaceColor: 0x9b3934,    // Richer, slightly deeper tone for internal cavity depth
  registrationKeyColor: 0xd4a338,  // Calm CAD Engineering Yellow for alignment locks
  sprueFunnelColor: 0xdfad3c,      // Coherent Engineering Yellow tone for sprue & funnel
  importedPartColor: 0xb8e3ec,     // Classic CAD cyan-blue part color
  featureEdgeColor: 0x380f0e,      // Crisp dark red-brown for feature edges
  segmentationEnvelopeColor: 0xb8c0c8,

  outerRoughness: 0.38,
  outerMetalness: 0.06,
  cavityRoughness: 0.32,
  cavityMetalness: 0.08,
  registrationRoughness: 0.35,
  registrationMetalness: 0.06,
  sprueRoughness: 0.32,
  sprueMetalness: 0.08,
  importedRoughness: 0.38,
  importedMetalness: 0.06,
  segmentationEnvelopeRoughness: 0.92,
  segmentationEnvelopeMetalness: 0,
  segmentationRegistrationRoughness: 0.84,
  segmentationRegistrationMetalness: 0,
  segmentationRegistrationOpacity: 0.72,

  backgroundTop: "#161c24",
  backgroundBottom: "#0a0e13",
};

export const CAD_LIGHT_THEME: CadSurfaceTheme = {
  outerMoldColor: 0xc4524c,
  cavitySurfaceColor: 0xa33d38,
  registrationKeyColor: 0xc8962d,  // Calm CAD Engineering Yellow adapted for light background contrast
  sprueFunnelColor: 0xd29f32,      // Coherent Engineering Yellow tone for light theme
  importedPartColor: 0x4a8fa8,
  featureEdgeColor: 0x421211,
  segmentationEnvelopeColor: 0x77828c,

  outerRoughness: 0.36,
  outerMetalness: 0.05,
  cavityRoughness: 0.30,
  cavityMetalness: 0.08,
  registrationRoughness: 0.34,
  registrationMetalness: 0.06,
  sprueRoughness: 0.30,
  sprueMetalness: 0.08,
  importedRoughness: 0.36,
  importedMetalness: 0.05,
  segmentationEnvelopeRoughness: 0.92,
  segmentationEnvelopeMetalness: 0,
  segmentationRegistrationRoughness: 0.84,
  segmentationRegistrationMetalness: 0,
  segmentationRegistrationOpacity: 0.72,

  backgroundTop: "#f5f7fa",
  backgroundBottom: "#e2e7ec",
};

export function isLightColor(colorStr: string): boolean {
  const rgbMatch = colorStr.match(/\d+/g);
  if (rgbMatch !== null && rgbMatch.length >= 3) {
    const r = Number(rgbMatch[0] ?? 0);
    const g = Number(rgbMatch[1] ?? 0);
    const b = Number(rgbMatch[2] ?? 0);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
  }
  const lower = colorStr.toLowerCase();
  return (
    lower.includes("fff") ||
    lower.includes("f8") ||
    lower.includes("f5") ||
    lower.includes("f0") ||
    lower.includes("e2")
  );
}

export function resolveCadTheme(palette: ViewportPalette): CadSurfaceTheme {
  return isLightColor(palette.background) ? CAD_LIGHT_THEME : CAD_DARK_THEME;
}
