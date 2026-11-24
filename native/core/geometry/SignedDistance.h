#pragma once

// Signed distance to a closed triangle mesh, for the distance-field cavity
// offset. Port of geometry/meshBvh.ts + cavity-generation/cavitySignedDistance.bvh.ts:
//   - closest-point distance via an AABB hierarchy (the reference uses
//     three-mesh-bvh),
//   - inside/outside by majority vote of three fixed ray directions, counting
//     unique forward crossings (epsilon 1e-7 mm).
// Positions are quantized to float32 first, exactly as the reference does by
// building a Float32BufferAttribute.
//
// Sign convention (matches the reference): positive INSIDE, negative outside,
// zero within the surface epsilon. Thread-safe for concurrent const queries.

#include <memory>

#include "contracts/Geometry.h"

namespace craft {

inline constexpr double kRayIntersectionEpsilonMm = 1e-7;
inline constexpr double kDefaultSurfaceEpsilonMm = 1e-7;

class SignedDistanceField {
 public:
  /// Throws std::invalid_argument for an empty/malformed mesh or a
  /// non-positive epsilon.
  explicit SignedDistanceField(const MeshPayload& mesh,
                               double surfaceEpsilonMm = kDefaultSurfaceEpsilonMm);
  ~SignedDistanceField();
  SignedDistanceField(SignedDistanceField&&) noexcept;
  SignedDistanceField& operator=(SignedDistanceField&&) noexcept;

  std::size_t triangleCount() const;
  /// Unsigned distance to the nearest triangle.
  double distanceToSurface(const Point3& p) const;
  bool isInside(const Point3& p) const;
  double signedDistance(const Point3& p) const;
  /// Like signedDistance, but exact only within `band` millimeters of the
  /// surface; farther points return +band (inside) or -band (outside). The
  /// closest-point search stops at the band, which makes far points cheap.
  /// Valid whenever the consumer only needs the sign of far samples (a level
  /// set at offset c sampled at spacing h needs band >= c + a few h).
  double signedDistanceBanded(const Point3& p, double band) const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace craft
