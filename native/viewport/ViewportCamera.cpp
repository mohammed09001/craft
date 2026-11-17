#include "ViewportCamera.h"

#include <cmath>
#include <numbers>

namespace craft::viewport {

namespace {
QVector3D toQt(const Vec3& v) {
  return {static_cast<float>(v.x), static_cast<float>(v.y), static_cast<float>(v.z)};
}
}  // namespace

ViewportCamera::ViewportCamera(QObject* parent) : QObject(parent) {}

QVector3D ViewportCamera::position() const { return toQt(pose_.position()); }
QVector3D ViewportCamera::target() const { return toQt(pose_.target()); }

QQuaternion ViewportCamera::rotation() const {
  const CameraBasis basis = pose_.basis();
  // fromDirection maps local +Z onto its first argument; the camera looks
  // along local -Z, so local +Z must point from the target back to the eye.
  return QQuaternion::fromDirection(toQt(basis.forward * -1.0), toQt(basis.up));
}

double ViewportCamera::aspect() const { return height_ > 0 ? width_ / height_ : 1.0; }

void ViewportCamera::setSceneBounds(const std::optional<Bounds3>& bounds) { sceneBounds_ = bounds; }

void ViewportCamera::setViewportSize(qreal width, qreal height) {
  width_ = width > 0 ? width : 1;
  height_ = height > 0 ? height : 1;
}

void ViewportCamera::orbitByPixels(qreal dx, qreal dy, qreal viewportHeight) {
  if (viewportHeight <= 0) return;
  const double turn = 2.0 * std::numbers::pi / viewportHeight;
  pose_.orbit(-dx * turn, dy * turn);
  emit poseChanged();
}

void ViewportCamera::panByPixels(qreal dx, qreal dy, qreal viewportHeight) {
  pose_.pan(dx, dy, viewportHeight);
  emit poseChanged();
}

void ViewportCamera::zoomByWheel(qreal angleDelta) {
  pose_.zoom(std::pow(0.9, angleDelta / 120.0));
  emit poseChanged();
}

void ViewportCamera::fit() {
  if (sceneBounds_) pose_.fitToBounds(*sceneBounds_, aspect());
  emit poseChanged();
}

void ViewportCamera::reset() {
  if (!sceneBounds_ || !pose_.resetToBounds(*sceneBounds_, aspect())) pose_.resetToDefault();
  emit poseChanged();
}

void ViewportCamera::lookFrom(const QString& direction) {
  if (!sceneBounds_) return;
  Vec3 from{1, -1, 0.78};
  if (direction == QLatin1String("top")) from = {0, 0, 1};
  else if (direction == QLatin1String("bottom")) from = {0, 0, -1};
  // Same face naming as Cut by Face: "front" is the +Y face, "back" is -Y.
  else if (direction == QLatin1String("front")) from = {0, 1, 0};
  else if (direction == QLatin1String("back")) from = {0, -1, 0};
  else if (direction == QLatin1String("right")) from = {1, 0, 0};
  else if (direction == QLatin1String("left")) from = {-1, 0, 0};
  pose_.lookFromDirection(*sceneBounds_, aspect(), from);
  emit poseChanged();
}

}  // namespace craft::viewport
