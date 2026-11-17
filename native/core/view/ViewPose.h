#pragma once

// Renderer-independent Z-up orbit camera math.
//
// Fit/reset behaviour is a port of
// mold/frontend/src/features/viewport/runtime/viewPose.ts and createCamera.ts
// (45 degree vertical FOV, Z-up, 1.35 fit margin, reset direction
// (1, -1, 0.78)). Orbit/pan/zoom replace three.js OrbitControls with an
// explicit spherical model around the target; the picking ray is derived from
// the same pose so selection never depends on renderer internals.

#include <optional>

#include "contracts/Geometry.h"

namespace craft {

inline constexpr double kDefaultVerticalFovDegrees = 45.0;
inline constexpr double kFitMargin = 1.35;
inline constexpr double kMinDisplayableSize = 1e-9;

struct Vec3 {
  double x = 0, y = 0, z = 0;
  Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
  Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
  Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
  double dot(const Vec3& o) const { return x * o.x + y * o.y + z * o.z; }
  Vec3 cross(const Vec3& o) const {
    return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x};
  }
  double length() const;
  Vec3 normalized() const;
};

struct Ray {
  Vec3 origin;
  Vec3 direction;  // unit length
};

struct BoundingSphere {
  Vec3 center;
  double radius = 0;
};

/// Sphere through the box corners, exactly as three.js Box3.getBoundingSphere.
BoundingSphere boundingSphereOf(const Bounds3& bounds);

/// Distance at which a sphere of `radius` fits the narrower of the two FOVs.
std::optional<double> calculateFitDistance(double radius, double verticalFovDegrees,
                                           double aspect, double margin = kFitMargin);

struct CameraBasis {
  Vec3 forward;  // from the eye towards the target
  Vec3 right;
  Vec3 up;
};

class ViewPose {
 public:
  ViewPose();  // the reference default pose: eye (95,-120,85), target (0,0,12)

  Vec3 position() const { return position_; }
  Vec3 target() const { return target_; }
  double verticalFovDegrees() const { return fovDegrees_; }
  double nearPlane() const { return near_; }
  double farPlane() const { return far_; }
  double distance() const { return (position_ - target_).length(); }
  CameraBasis basis() const;

  /// Reference default pose used when no model is loaded.
  void resetToDefault();
  /// Keeps the current viewing direction and frames the bounds.
  bool fitToBounds(const Bounds3& bounds, double aspect);
  /// Frames the bounds from the canonical reset direction.
  bool resetToBounds(const Bounds3& bounds, double aspect);
  /// Frames the bounds looking from `direction` (target -> eye, any length).
  bool lookFromDirection(const Bounds3& bounds, double aspect, const Vec3& direction);

  /// Angles in radians; elevation is clamped short of the poles.
  void orbit(double deltaAzimuth, double deltaElevation);
  /// Pixel deltas; the point under the cursor at target depth follows it.
  void pan(double deltaXPixels, double deltaYPixels, double viewportHeightPixels);
  /// factor < 1 moves towards the target; clamped to the fitted range.
  void zoom(double factor);

  /// World-space ray through a viewport pixel (origin top-left, y down).
  Ray rayThroughPixel(double x, double y, double viewportWidth, double viewportHeight) const;

 private:
  void frame(const BoundingSphere& sphere, double distance, const Vec3& direction);

  Vec3 position_;
  Vec3 target_;
  double fovDegrees_ = kDefaultVerticalFovDegrees;
  double near_ = 0.1;
  double far_ = 2000;
  double minDistance_ = 0.01;
  double maxDistance_ = 1e6;
};

}  // namespace craft
