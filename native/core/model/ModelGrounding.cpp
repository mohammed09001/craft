#include "model/ModelGrounding.h"

#include <algorithm>
#include <cmath>

namespace craft {

namespace {
constexpr double kMinGridSize = 20;
constexpr double kGridMarginFactor = 1.5;
constexpr double kTargetMinorDivisions = 20;
constexpr double kNiceStepFactors[] = {1, 2, 5, 10};

bool isValidPositive(double value) { return std::isfinite(value) && value > 0; }
}  // namespace

std::optional<ModelGroundingTransform> calculateModelGroundingTransform(const Bounds3& bounds,
                                                                        double groundLevel) {
  if (!std::isfinite(groundLevel) || !isFiniteBounds(bounds) || bounds.max.x < bounds.min.x ||
      bounds.max.y < bounds.min.y || bounds.max.z < bounds.min.z) {
    return std::nullopt;
  }
  const Point3 translation{-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2,
                           groundLevel - bounds.min.z};
  return ModelGroundingTransform{
      translation,
      {{bounds.min.x + translation.x, bounds.min.y + translation.y, bounds.min.z + translation.z},
       {bounds.max.x + translation.x, bounds.max.y + translation.y, bounds.max.z + translation.z}}};
}

std::optional<double> calculateNiceStep(double rawStep) {
  if (!isValidPositive(rawStep)) return std::nullopt;
  const double magnitude = std::pow(10.0, std::floor(std::log10(rawStep)));
  const double normalized = rawStep / magnitude;
  double factor = 10;
  for (double candidate : kNiceStepFactors) {
    if (normalized <= candidate) {
      factor = candidate;
      break;
    }
  }
  return factor * magnitude;
}

AdaptiveGridConfig deriveAdaptiveGridConfig(const std::optional<Bounds3>& groundedBounds) {
  if (!groundedBounds) return kDefaultGridConfig;
  const double footprint = std::max(groundedBounds->max.x - groundedBounds->min.x,
                                    groundedBounds->max.y - groundedBounds->min.y);
  if (!isValidPositive(footprint)) return kDefaultGridConfig;

  const double targetSize = std::max(footprint * kGridMarginFactor, kMinGridSize);
  const auto minorStep = calculateNiceStep(targetSize / kTargetMinorDivisions);
  if (!minorStep) return kDefaultGridConfig;

  const double majorStep = *minorStep * 5;
  const double roundTo = majorStep * 2;
  return {majorStep, *minorStep, std::ceil(targetSize / roundTo) * roundTo};
}

}  // namespace craft
