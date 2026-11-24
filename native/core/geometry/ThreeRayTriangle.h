#pragma once

// Ray / triangle intersection with the rules of three.js Ray.intersectTriangle, shared by every native picker that is
// compared with a Three.js raycast (the selection box, the sprue gizmo rings, the cutting-plane slabs): barycentric
// test with the triangle boundary inclusive, distance along the (unit) ray, nothing behind the origin.

#include <optional>

#include "view/ViewPose.h"

namespace craft {

/// Distance along `ray` to the triangle (a, b, c), or nullopt. With `backfaceCulling` (a FrontSide material) a ray
/// travelling along the triangle's normal (hitting its back) is rejected; without it (DoubleSide) both sides hit.
std::optional<double> intersectTriangleThree(const Ray& ray, const Vec3& a, const Vec3& b, const Vec3& c, bool backfaceCulling);

}  // namespace craft
