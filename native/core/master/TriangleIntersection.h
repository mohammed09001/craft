#pragma once

// Triangle/triangle intersection with the semantics of three-mesh-bvh
// ExtendedTriangle.intersectsTriangle (Moller test, SAT for coplanar pairs,
// explicit degenerate-triangle handling). Used by the Master Mold preflight
// self-intersection pass, so results agree with the reference on borderline
// pairs.

namespace craft {

struct TriVec {
  double x = 0, y = 0, z = 0;
};

struct IntersectTriangle {
  TriVec a, b, c;
};

/// `planeToleranceMm` > 0 makes two triangles that lie in each other's plane to within that distance count as coplanar and be judged by their overlap in that
/// plane. The exact test (tolerance 0, the three-mesh-bvh behaviour) takes triangles that are coplanar only up to the rounding of float32 coordinates, as the
/// walls of a real model are, for two planes crossing at an angle of 1e-7, and the line they share is then arbitrary: it flags triangles that are apart.
bool trianglesIntersect(const IntersectTriangle& first, const IntersectTriangle& second, double planeToleranceMm = 0);

}  // namespace craft
