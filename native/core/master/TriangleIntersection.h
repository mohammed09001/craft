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

bool trianglesIntersect(const IntersectTriangle& first, const IntersectTriangle& second);

}  // namespace craft
