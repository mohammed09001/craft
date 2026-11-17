#pragma once

// Triangle BVH for mesh crossing queries. The per-triangle arithmetic is
// three.js Ray.intersectTriangle (DoubleSide) exactly as three-mesh-bvh calls
// it, so crossing counts agree with the reference's countUniqueForwardIntersections.

#include <cstdint>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

inline constexpr double kRayIntersectionEpsilonMm = 1e-7;  // RAY_INTERSECTION_EPSILON_MM

class RayBvh {
 public:
  /// The referenced arrays must outlive the BVH.
  RayBvh(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices);

  /// True when any hit lies beyond `eps` along the ray (early exit).
  bool anyHitBeyond(const Point3& origin, const Point3& direction, double eps) const;

  /// Hit distances in [near, far] (DoubleSide), unsorted.
  std::vector<double> hitDistances(const Point3& origin, const Point3& direction, double nearMm, double farMm) const;

  /// countUniqueForwardIntersections / segmentCrossingCount: unique hits farther than eps, within `farMm`.
  int countUniqueForwardIntersections(const Point3& origin, const Point3& direction, double farMm = INFINITY) const;

 private:
  struct Node {
    Bounds3 box;
    int left = -1, right = -1, start = 0, count = 0;
  };
  int build(std::vector<int>& ids, std::size_t begin, std::size_t end);
  bool triangleDistance(int triangle, const Point3& origin, const Point3& direction, double& distance) const;

  const std::vector<float>& positions_;
  const std::vector<std::uint32_t>& indices_;
  std::vector<Bounds3> boxes_;
  std::vector<Node> nodes_;
  std::vector<int> order_;
};

}  // namespace craft