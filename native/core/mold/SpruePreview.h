#pragma once

// Geometry of the Sprue 3D preview: the funnel, main stem and entry neck drawn at the pointer while the Sprue tool is
// active, and the constants of the "glass" look the mold bodies take while it is.
//
// Port of the geometry and presentation rules in mold/frontend/src/features/viewport/runtime/spruePreview3dRuntime.ts
// (placePreview, material colours, glass opacity). The placement itself (which point, valid or not, the stem length
// and the profile) is computeSpruePlacement in SprueGeneration. The solids are Three.js CylinderGeometry (including its
// vertex order and normals) placed with Quaternion.setFromUnitVectors and Matrix4.compose, so the native vertices can
// be compared one by one with the real reference (tst_sprue_preview_equivalence).

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "mold/SprueGeneration.h"

namespace craft {

inline constexpr double kSprueFunnelHeightMm = 5;
inline constexpr double kSprueFunnelInletRadiusMm = 4;
inline constexpr int kSprueFunnelSegments = 24;
inline constexpr double kSpruePreviewToleranceMm = 1e-4;  // SURFACE_TOLERANCE_MM

// Presentation (the reference's constants).
inline constexpr unsigned kSpruePreviewValidRgb = 0x31975a;
inline constexpr unsigned kSpruePreviewInvalidRgb = 0xb33a36;
inline constexpr double kSpruePreviewOpacity = 0.86;
inline constexpr double kSpruePreviewRoughness = 0.44;
inline constexpr double kSpruePreviewMetalness = 0.05;
inline constexpr double kSprueGlassOpacity = 0.28;
inline constexpr unsigned kSprueGlassEdgeRgb = 0x762d34;
inline constexpr double kSprueGlassEdgeOpacity = 0.78;
inline constexpr double kSprueGlassEdgeAngleDegrees = 1.0;  // three.js EdgesGeometry default threshold

/// An indexed triangle surface with one normal per vertex.
struct IndexedSurface {
  std::vector<double> positions;  // xyz per vertex
  std::vector<double> normals;    // xyz per vertex
  std::vector<std::uint32_t> indices;
};

/// three.js CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1, false, 0, 2 pi): axis +Y, centred on
/// the origin, same vertex/index order and normals, with coordinates rounded to float32 as Three.js stores them.
IndexedSurface cylinderSurface(double radiusTop, double radiusBottom, double height, int radialSegments);

struct SpruePreviewPart {
  std::string name;       // SpruePreviewFunnel | SpruePreviewStem | SpruePreviewEntryNeck
  bool visible = false;   // the stem and the neck are hidden when their length is below tolerance
  IndexedSurface surface; // world coordinates (the mold frame), normals through the renderer's normal matrix
};

struct SpruePreviewGeometry {
  bool valid = false;     // the placement reaches the cavity: drawn green, else red
  unsigned colorRgb = kSpruePreviewInvalidRgb;
  std::array<SpruePreviewPart, 3> parts;  // funnel, main stem, entry neck
};

/// The three solids for a placement; nullopt when the stem is shorter than the tolerance (the reference hides the
/// preview then).
std::optional<SpruePreviewGeometry> buildSpruePreview(const SpruePlacement& placement);

}  // namespace craft
