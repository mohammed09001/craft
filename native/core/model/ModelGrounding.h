#pragma once

// Model grounding and the adaptive engineering grid.
// Ports of mold/frontend/src/features/viewport/runtime/modelGrounding.ts and
// adaptiveGrid.ts: an imported model is centred on the XY origin and lowered
// or raised so its lowest point rests on the ground plane Z = 0.

#include <optional>

#include "contracts/Geometry.h"

namespace craft {

inline constexpr double kModelGroundLevel = 0.0;

struct ModelGroundingTransform {
  Point3 translation;
  Bounds3 groundedBounds;
};

/// Returns nullopt for non-finite or inverted bounds (same rejection rule as
/// calculateModelGroundingTransform).
std::optional<ModelGroundingTransform> calculateModelGroundingTransform(
    const Bounds3& bounds, double groundLevel = kModelGroundLevel);

struct AdaptiveGridConfig {
  double majorStep = 50;
  double minorStep = 10;
  double size = 220;
  friend bool operator==(const AdaptiveGridConfig&, const AdaptiveGridConfig&) = default;
};

inline constexpr AdaptiveGridConfig kDefaultGridConfig{};

/// 1/2/5/10 x 10^n step at or above rawStep; nullopt for non-positive input.
std::optional<double> calculateNiceStep(double rawStep);

/// Grid sized to 1.5x the model footprint with ~20 minor divisions.
AdaptiveGridConfig deriveAdaptiveGridConfig(const std::optional<Bounds3>& groundedBounds);

}  // namespace craft
