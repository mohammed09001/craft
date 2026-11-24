#include "geometry/GeometryTolerance.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <stdexcept>

namespace craft {

namespace {
// Headroom for a weld/merge pass plus one Boolean re-triangulation step.
constexpr double kFloat32UlpSafetyFactor = 4;
}  // namespace

double float32Ulp(double magnitude) {
  const float value = static_cast<float>(std::fabs(magnitude));
  std::int32_t bits = 0;
  std::memcpy(&bits, &value, sizeof(bits));
  bits += 1;
  float next = 0;
  std::memcpy(&next, &bits, sizeof(next));
  return static_cast<double>(next) - static_cast<double>(value);
}

GeometryTolerancePolicy buildGeometryTolerancePolicy(const Bounds3& bounds, double clearanceMm) {
  const double dimensions[3] = {bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y,
                                bounds.max.z - bounds.min.z};
  const double absoluteCoordinates[6] = {bounds.min.x, bounds.max.x, bounds.min.y,
                                         bounds.max.y, bounds.min.z, bounds.max.z};

  bool valid = std::isfinite(clearanceMm) && clearanceMm >= 0;
  for (double value : dimensions) valid = valid && std::isfinite(value) && value > 0;
  for (double value : absoluteCoordinates) valid = valid && std::isfinite(value);
  if (!valid) throw std::invalid_argument("Geometry tolerance policy inputs are invalid.");

  const double diagonal = std::hypot(dimensions[0], dimensions[1], dimensions[2]);
  const double minimumDimension = std::min({dimensions[0], dimensions[1], dimensions[2]});
  const double featureLimit = std::max(1e-7, minimumDimension * 1e-4);
  const double clearanceLimit = clearanceMm > 0 ? clearanceMm * 1e-3 : featureLimit;
  const double linearToleranceMm =
      std::min(std::min({1e-3, featureLimit, clearanceLimit}), std::max(1e-7, diagonal * 1e-8));

  double maxAbsCoordinateMm = 0;
  for (double value : absoluteCoordinates) {
    maxAbsCoordinateMm = std::max(maxAbsCoordinateMm, std::fabs(value));
  }
  const double float32PrecisionFloorMm = kFloat32UlpSafetyFactor * float32Ulp(maxAbsCoordinateMm);

  GeometryTolerancePolicy policy;
  policy.weldToleranceMm = linearToleranceMm;
  policy.booleanToleranceMm = linearToleranceMm;
  policy.surfaceToleranceMm = std::min(featureLimit, linearToleranceMm * 4);
  policy.linearToleranceMm = linearToleranceMm;
  policy.containmentToleranceMm = std::max(linearToleranceMm, float32PrecisionFloorMm);
  policy.areaToleranceMm2 = linearToleranceMm * linearToleranceMm;
  policy.volumeToleranceMm3 = linearToleranceMm * linearToleranceMm * linearToleranceMm;
  const double scaleVolume = dimensions[0] * dimensions[1] * dimensions[2];
  policy.affectedVolumeToleranceMm3 = std::max(policy.volumeToleranceMm3, scaleVolume * 1e-10);
  policy.minimumFragmentVolumeMm3 = std::max(policy.volumeToleranceMm3 * 8, scaleVolume * 1e-12);

  const double values[] = {policy.weldToleranceMm,          policy.booleanToleranceMm,
                           policy.surfaceToleranceMm,       policy.linearToleranceMm,
                           policy.containmentToleranceMm,   policy.areaToleranceMm2,
                           policy.volumeToleranceMm3,       policy.affectedVolumeToleranceMm3,
                           policy.minimumFragmentVolumeMm3};
  for (double value : values) {
    if (!std::isfinite(value) || value <= 0) {
      throw std::runtime_error("Geometry tolerance policy could not be resolved safely.");
    }
  }
  return policy;
}

}  // namespace craft
