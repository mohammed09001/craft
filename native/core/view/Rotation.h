#pragma once

// The rotation helpers the Sprue preview and gizmo share: Three.js Quaternion.setFromUnitVectors and the rotation of
// a vector by a unit quaternion (the upper 3x3 of Matrix4.compose).

#include "view/ViewPose.h"

namespace craft {

struct Quat {
  double x = 0, y = 0, z = 0, w = 1;
};

/// three.js Quaternion.setFromUnitVectors(vFrom, vTo) (both unit length).
Quat quaternionFromUnitVectors(const Vec3& from, const Vec3& to);

/// q * v for a unit quaternion.
Vec3 rotate(const Quat& q, const Vec3& v);
/// q^-1 * v.
Vec3 rotateInverse(const Quat& q, const Vec3& v);

}  // namespace craft
