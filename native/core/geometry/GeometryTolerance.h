#pragma once

// Scale-aware geometry tolerance derivation.
// Port of mold/frontend/src/features/mold-generation/geometry/geometryTolerance.ts
// (policy "geometry-adaptive-v2"; Cavity labels it "cavity-adaptive-v2").
// The arithmetic is intentionally kept operation-for-operation identical so
// native and reference Booleans run with the same weld/merge tolerance.

#include "contracts/Geometry.h"

namespace craft {

inline constexpr const char* kGeometryTolerancePolicyVersion = "geometry-adaptive-v2";
inline constexpr const char* kCavityTolerancePolicyVersion = "cavity-adaptive-v2";

struct GeometryTolerancePolicy {
  double weldToleranceMm = 0;
  double booleanToleranceMm = 0;
  double surfaceToleranceMm = 0;
  double linearToleranceMm = 0;
  /// Floor for comparing Float32-backed kernel bounds against Float64
  /// analytical bounds; see the reference file for the full rationale.
  double containmentToleranceMm = 0;
  double areaToleranceMm2 = 0;
  double volumeToleranceMm3 = 0;
  double affectedVolumeToleranceMm3 = 0;
  double minimumFragmentVolumeMm3 = 0;
};

/// Exact Float32 quantization step at `magnitude` (next representable value).
double float32Ulp(double magnitude);

/// Throws std::invalid_argument when the inputs are not a positive finite box
/// and a non-negative finite clearance.
GeometryTolerancePolicy buildGeometryTolerancePolicy(const Bounds3& bounds, double clearanceMm);

}  // namespace craft
