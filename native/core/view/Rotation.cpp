#include "view/Rotation.h"

#include <cmath>

namespace craft {

Quat quaternionFromUnitVectors(const Vec3& from, const Vec3& to) {
  double r = from.dot(to) + 1;
  Quat q;
  if (r < 1e-8) {
    r = 0;
    if (std::fabs(from.x) > std::fabs(from.z)) {
      q = {-from.y, from.x, 0, r};
    } else {
      q = {0, -from.z, from.y, r};
    }
  } else {
    q = {from.y * to.z - from.z * to.y, from.z * to.x - from.x * to.z, from.x * to.y - from.y * to.x, r};
  }
  const double length = std::sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (length == 0) return {0, 0, 0, 1};
  return {q.x / length, q.y / length, q.z / length, q.w / length};
}

Vec3 rotate(const Quat& q, const Vec3& v) {
  // The rotation matrix of Matrix4.compose, applied to v.
  const double x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
  const double xx = q.x * x2, xy = q.x * y2, xz = q.x * z2, yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
  const double wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
  return {(1 - (yy + zz)) * v.x + (xy - wz) * v.y + (xz + wy) * v.z, (xy + wz) * v.x + (1 - (xx + zz)) * v.y + (yz - wx) * v.z,
          (xz - wy) * v.x + (yz + wx) * v.y + (1 - (xx + yy)) * v.z};
}

Vec3 rotateInverse(const Quat& q, const Vec3& v) { return rotate({-q.x, -q.y, -q.z, q.w}, v); }

}  // namespace craft
