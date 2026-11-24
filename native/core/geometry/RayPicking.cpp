#include "geometry/RayPicking.h"

#include <cmath>

namespace craft {

namespace {

// Moller-Trumbore. Returns the ray parameter or a negative value on a miss.
double intersect(const Ray& ray, const Vec3& a, const Vec3& b, const Vec3& c) {
  const Vec3 edge1 = b - a;
  const Vec3 edge2 = c - a;
  const Vec3 p = ray.direction.cross(edge2);
  const double determinant = edge1.dot(p);
  if (std::fabs(determinant) < 1e-14) return -1;
  const double inverse = 1.0 / determinant;
  const Vec3 t = ray.origin - a;
  const double u = t.dot(p) * inverse;
  if (u < 0 || u > 1) return -1;
  const Vec3 q = t.cross(edge1);
  const double v = ray.direction.dot(q) * inverse;
  if (v < 0 || u + v > 1) return -1;
  const double distance = edge2.dot(q) * inverse;
  return distance > 1e-9 ? distance : -1;
}

template <typename VertexAt>
std::optional<PickHit> pick(std::size_t triangleCount, const Ray& ray, VertexAt vertexAt) {
  std::optional<PickHit> best;
  for (std::size_t triangle = 0; triangle < triangleCount; ++triangle) {
    const Vec3 a = vertexAt(triangle, 0);
    const Vec3 b = vertexAt(triangle, 1);
    const Vec3 c = vertexAt(triangle, 2);
    const double distance = intersect(ray, a, b, c);
    if (distance < 0 || (best && distance >= best->distance)) continue;
    best = PickHit{triangle, distance, ray.origin + ray.direction * distance,
                   (b - a).cross(c - a).normalized()};
  }
  return best;
}

}  // namespace

std::optional<PickHit> pickTriangleSoup(const TriangleSoup& soup, const Ray& ray) {
  const float* p = soup.positions.data();
  return pick(soup.triangleCount(), ray, [p](std::size_t triangle, int corner) {
    const float* v = p + triangle * 9 + corner * 3;
    return Vec3{v[0], v[1], v[2]};
  });
}

std::optional<PickHit> pickMesh(const MeshPayload& mesh, const Ray& ray) {
  return pick(mesh.triangleCount(), ray, [&mesh](std::size_t triangle, int corner) {
    const std::size_t v = mesh.indices[triangle * 3 + corner] * 3ull;
    return Vec3{mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2]};
  });
}

}  // namespace craft
