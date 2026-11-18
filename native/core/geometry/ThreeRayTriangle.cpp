#include "geometry/ThreeRayTriangle.h"

namespace craft {

std::optional<double> intersectTriangleThree(const Ray& ray, const Vec3& a, const Vec3& b, const Vec3& c, bool backfaceCulling) {
  const Vec3 edge1 = b - a;
  const Vec3 edge2 = c - a;
  const Vec3 normal = edge1.cross(edge2);
  double ddn = ray.direction.dot(normal);
  double sign = 0;
  if (ddn > 0) {
    if (backfaceCulling) return std::nullopt;
    sign = 1;
  } else if (ddn < 0) {
    sign = -1;
    ddn = -ddn;
  } else {
    return std::nullopt;
  }
  const Vec3 diff = ray.origin - a;
  const double ddqxe2 = sign * ray.direction.dot(diff.cross(edge2));
  if (ddqxe2 < 0) return std::nullopt;
  const double dde1xq = sign * ray.direction.dot(edge1.cross(diff));
  if (dde1xq < 0) return std::nullopt;
  if (ddqxe2 + dde1xq > ddn) return std::nullopt;
  const double qdn = -sign * diff.dot(normal);
  if (qdn < 0) return std::nullopt;
  return qdn / ddn;
}

}  // namespace craft
