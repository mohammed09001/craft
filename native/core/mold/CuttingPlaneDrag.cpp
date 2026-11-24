#include "mold/CuttingPlaneDrag.h"

#include <cmath>
#include <stdexcept>

namespace craft {

namespace {

Vec3 unitAxis(Axis axis) {
  return {axis == Axis::X ? 1.0 : 0.0, axis == Axis::Y ? 1.0 : 0.0, axis == Axis::Z ? 1.0 : 0.0};
}

// Three.js Vector3.addScaledVector(v, s): this += v * s, component by component.
Vec3 addScaled(const Vec3& a, const Vec3& v, double s) { return {a.x + v.x * s, a.y + v.y * s, a.z + v.z * s}; }

// Three.js Vector3.normalize(): divideScalar(length || 1), which multiplies by the reciprocal.
Vec3 threeNormalize(const Vec3& v) {
  double length = std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length == 0.0) length = 1.0;
  const double inverse = 1.0 / length;
  return {v.x * inverse, v.y * inverse, v.z * inverse};
}

double lengthSquared(const Vec3& v) { return v.x * v.x + v.y * v.y + v.z * v.z; }

}  // namespace

std::optional<Vec3> intersectReferencePlane(const Ray& ray, const Vec3& normal, double constant) {
  const double denominator = normal.dot(ray.direction);
  double t = 0;
  if (denominator == 0.0) {
    // Parallel: the ray lies in the plane when its origin is on it (distanceToPoint === 0), else no hit.
    if (normal.dot(ray.origin) + constant != 0.0) return std::nullopt;
  } else {
    t = -(ray.origin.dot(normal) + constant) / denominator;
    if (!(t >= 0.0)) return std::nullopt;
  }
  return Vec3{ray.direction.x * t + ray.origin.x, ray.direction.y * t + ray.origin.y, ray.direction.z * t + ray.origin.z};
}

std::optional<CutPlaneDrag> beginCutPlaneDrag(const PlaneSlab& slab, const Ray& ray, const Vec3& viewDirection,
                                              const Vec3& cameraUp, double pixelX, double pixelY) {
  const Vec3 axis = unitAxis(slab.axis);
  Vec3 normal = addScaled(viewDirection, axis, -viewDirection.dot(axis));
  if (lengthSquared(normal) < 1e-8) normal = addScaled(cameraUp, axis, -cameraUp.dot(axis));
  normal = threeNormalize(normal);

  CutPlaneDrag drag;
  drag.face = slab.face;
  drag.axis = slab.axis;
  drag.startCoordinate = slab.coordinate;
  drag.coordinate = slab.coordinate;
  Vec3 origin;
  (slab.axis == Axis::X ? origin.x : slab.axis == Axis::Y ? origin.y : origin.z) = slab.coordinate;
  drag.planeNormal = normal;
  drag.planeConstant = -origin.dot(normal);
  const auto hit = intersectReferencePlane(ray, drag.planeNormal, drag.planeConstant);
  if (!hit) return std::nullopt;
  drag.startHit = *hit;
  drag.startX = pixelX;
  drag.startY = pixelY;
  return drag;
}

bool updateCutPlaneDrag(CutPlaneDrag& drag, const Ray& ray, double pixelX, double pixelY, const Bounds3& k1) {
  const auto hit = intersectReferencePlane(ray, drag.planeNormal, drag.planeConstant);
  if (!hit) return false;
  const double dx = pixelX - drag.startX, dy = pixelY - drag.startY;
  if (!drag.moved && std::hypot(dx, dy) < kCutPlaneDragThresholdPx) return false;
  drag.moved = true;  // set before the position is worked out, as the reference does
  try {
    const Vec3 axis = unitAxis(drag.axis);
    const double candidate = drag.startCoordinate + (*hit - drag.startHit).dot(axis);
    const double normalized = worldToNormalizedPosition(k1, drag.axis, candidate);
    drag.coordinate = normalizedToWorldCoordinate(k1, drag.axis, normalized);
  } catch (const std::invalid_argument&) {
    return false;  // a non-finite hit (or a K1 too thin for a plane): the plane stays where it is
  }
  return true;
}

CutPlaneDragEnd finishCutPlaneDrag(const CutPlaneDrag& drag, const Bounds3& k1) {
  CutPlaneDragEnd end;
  if (!drag.moved) return end;
  try {
    end.normalized = clampNormalizedPosition(worldToNormalizedPosition(k1, drag.axis, drag.coordinate), k1, drag.axis);
    end.commit = true;
  } catch (const std::invalid_argument&) {
    end.commit = false;
  }
  return end;
}

std::optional<double> commitCutPlanePosition(const Bounds3& k1, Axis axis, double currentNormalized, double requested) {
  double next = 0;
  try {
    next = clampNormalizedPosition(requested, k1, axis);
  } catch (const std::invalid_argument&) {
    return std::nullopt;  // not finite, or K1 too thin for a plane: nothing to commit
  }
  if (std::fabs(next - currentNormalized) <= kCutPlaneCommitEpsilon) return std::nullopt;
  return next;
}

}  // namespace craft
