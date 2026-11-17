#include "view/ViewPose.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace craft {

namespace {
const Vec3 kUp{0, 0, 1};
const Vec3 kResetViewDirection = Vec3{1, -1, 0.78}.normalized();
constexpr double kMaxElevation = 89.0 * std::numbers::pi / 180.0;

bool isFinite(const Vec3& v) {
  return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z);
}
}  // namespace

double Vec3::length() const { return std::sqrt(x * x + y * y + z * z); }

Vec3 Vec3::normalized() const {
  const double len = length();
  return len > 0 ? Vec3{x / len, y / len, z / len} : Vec3{};
}

BoundingSphere boundingSphereOf(const Bounds3& bounds) {
  const Point3 c = bounds.center();
  const Point3 s = bounds.size();
  return {{c.x, c.y, c.z}, Vec3{s.x, s.y, s.z}.length() * 0.5};
}

std::optional<double> calculateFitDistance(double radius, double verticalFovDegrees,
                                           double aspect, double margin) {
  if (!std::isfinite(radius) || radius <= kMinDisplayableSize ||
      !std::isfinite(verticalFovDegrees) || verticalFovDegrees <= 0 || !std::isfinite(aspect) ||
      aspect <= 0) {
    return std::nullopt;
  }
  const double verticalHalfFov = verticalFovDegrees * std::numbers::pi / 360.0;
  const double horizontalHalfFov = std::atan(std::tan(verticalHalfFov) * aspect);
  const double limitingHalfFov = std::min(verticalHalfFov, horizontalHalfFov);
  if (!std::isfinite(limitingHalfFov) || limitingHalfFov <= 0) return std::nullopt;
  return radius / std::sin(limitingHalfFov) * margin;
}

ViewPose::ViewPose() { resetToDefault(); }

void ViewPose::resetToDefault() {
  position_ = {95, -120, 85};
  target_ = {0, 0, 12};
  near_ = 0.1;
  far_ = 2000;
  minDistance_ = 0.01;
  maxDistance_ = 1e6;
}

CameraBasis ViewPose::basis() const {
  const Vec3 forward = (target_ - position_).normalized();
  Vec3 right = forward.cross(kUp);
  // Looking straight along Z leaves no horizontal reference; pick world X.
  right = right.length() <= 1e-12 ? Vec3{1, 0, 0} : right.normalized();
  return {forward, right, right.cross(forward).normalized()};
}

void ViewPose::frame(const BoundingSphere& sphere, double distance, const Vec3& direction) {
  target_ = sphere.center;
  minDistance_ = std::max(sphere.radius * 0.02, 0.01);
  maxDistance_ = std::max(distance + sphere.radius * 20, 1.0);
  position_ = sphere.center + direction * distance;
  near_ = std::max((distance - sphere.radius * 2) / 100, 0.01);
  far_ = std::max(distance + sphere.radius * 20, near_ + 1);
}

bool ViewPose::fitToBounds(const Bounds3& bounds, double aspect) {
  if (!isFiniteBounds(bounds)) return false;
  const BoundingSphere sphere = boundingSphereOf(bounds);
  const auto distance = calculateFitDistance(sphere.radius, fovDegrees_, aspect);
  if (!distance) return false;
  Vec3 direction = position_ - target_;
  direction = (!isFinite(direction) || direction.dot(direction) <= kMinDisplayableSize)
                  ? kResetViewDirection
                  : direction.normalized();
  frame(sphere, *distance, direction);
  return true;
}

bool ViewPose::resetToBounds(const Bounds3& bounds, double aspect) {
  return lookFromDirection(bounds, aspect, kResetViewDirection);
}

bool ViewPose::lookFromDirection(const Bounds3& bounds, double aspect, const Vec3& direction) {
  if (!isFiniteBounds(bounds) || !isFinite(direction) || direction.length() <= 0) return false;
  const BoundingSphere sphere = boundingSphereOf(bounds);
  const auto distance = calculateFitDistance(sphere.radius, fovDegrees_, aspect);
  if (!distance) return false;
  frame(sphere, *distance, direction.normalized());
  return true;
}

void ViewPose::orbit(double deltaAzimuth, double deltaElevation) {
  const Vec3 offset = position_ - target_;
  const double radius = offset.length();
  if (radius <= 0) return;
  double azimuth = std::atan2(offset.y, offset.x);
  double elevation = std::asin(std::clamp(offset.z / radius, -1.0, 1.0));
  azimuth += deltaAzimuth;
  elevation = std::clamp(elevation + deltaElevation, -kMaxElevation, kMaxElevation);
  position_ = target_ + Vec3{std::cos(elevation) * std::cos(azimuth),
                             std::cos(elevation) * std::sin(azimuth), std::sin(elevation)} *
                            radius;
}

void ViewPose::pan(double deltaXPixels, double deltaYPixels, double viewportHeightPixels) {
  if (viewportHeightPixels <= 0) return;
  const CameraBasis b = basis();
  const double worldPerPixel =
      2.0 * distance() * std::tan(fovDegrees_ * std::numbers::pi / 360.0) / viewportHeightPixels;
  const Vec3 shift = b.right * (-deltaXPixels * worldPerPixel) + b.up * (deltaYPixels * worldPerPixel);
  position_ = position_ + shift;
  target_ = target_ + shift;
}

void ViewPose::zoom(double factor) {
  if (!std::isfinite(factor) || factor <= 0) return;
  const Vec3 offset = position_ - target_;
  const double current = offset.length();
  if (current <= 0) return;
  const double next = std::clamp(current * factor, minDistance_, maxDistance_);
  position_ = target_ + offset * (next / current);
  near_ = std::max(next / 1000, 0.01);
  far_ = std::max(far_, next * 4);
}

Ray ViewPose::rayThroughPixel(double x, double y, double viewportWidth,
                              double viewportHeight) const {
  const CameraBasis b = basis();
  const double tanHalf = std::tan(fovDegrees_ * std::numbers::pi / 360.0);
  const double aspect = viewportHeight > 0 ? viewportWidth / viewportHeight : 1.0;
  const double ndcX = viewportWidth > 0 ? 2.0 * x / viewportWidth - 1.0 : 0.0;
  const double ndcY = viewportHeight > 0 ? 1.0 - 2.0 * y / viewportHeight : 0.0;
  const Vec3 direction =
      (b.forward + b.right * (ndcX * tanHalf * aspect) + b.up * (ndcY * tanHalf)).normalized();
  return {position_, direction};
}

}  // namespace craft
