#pragma once

// QML-facing camera: exposes a craft::ViewPose (Z-up orbit camera math in
// craft_core) as position/rotation properties a Qt Quick 3D camera binds to.
//
// Qt Quick 3D cameras look down their local -Z axis with local +Y up. The
// scene itself is kept Z-up, so instead of rotating the scene the camera's
// rotation is derived from the pose: local -Z -> view direction, local +Y ->
// the pose's up vector (which always has a positive world-Z component).

#include <QObject>
#include <QQuaternion>
#include <QVector3D>

#include "contracts/Geometry.h"
#include "view/ViewPose.h"

namespace craft::viewport {

class ViewportCamera : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVector3D position READ position NOTIFY poseChanged)
  Q_PROPERTY(QQuaternion rotation READ rotation NOTIFY poseChanged)
  Q_PROPERTY(QVector3D target READ target NOTIFY poseChanged)
  Q_PROPERTY(qreal fieldOfView READ fieldOfView CONSTANT)
  Q_PROPERTY(qreal clipNear READ clipNear NOTIFY poseChanged)
  Q_PROPERTY(qreal clipFar READ clipFar NOTIFY poseChanged)

 public:
  explicit ViewportCamera(QObject* parent = nullptr);

  QVector3D position() const;
  QQuaternion rotation() const;
  QVector3D target() const;
  qreal fieldOfView() const { return pose_.verticalFovDegrees(); }
  qreal clipNear() const { return pose_.nearPlane(); }
  qreal clipFar() const { return pose_.farPlane(); }

  const ViewPose& pose() const { return pose_; }

  /// Bounds the view commands frame; nullopt = empty scene (default pose).
  void setSceneBounds(const std::optional<Bounds3>& bounds);

  /// Drag deltas in pixels; a full viewport height of drag is one turn.
  Q_INVOKABLE void orbitByPixels(qreal dx, qreal dy, qreal viewportHeight);
  Q_INVOKABLE void panByPixels(qreal dx, qreal dy, qreal viewportHeight);
  /// Mouse-wheel angle delta (120 units per notch); positive zooms in.
  Q_INVOKABLE void zoomByWheel(qreal angleDelta);
  Q_INVOKABLE void setViewportSize(qreal width, qreal height);
  /// Keeps the current direction and frames the scene.
  Q_INVOKABLE void fit();
  /// Canonical isometric-style reset view.
  Q_INVOKABLE void reset();
  /// Named orthographic-style directions: "top", "front", "right", ...
  Q_INVOKABLE void lookFrom(const QString& direction);

 signals:
  void poseChanged();

 private:
  double aspect() const;

  ViewPose pose_;
  std::optional<Bounds3> sceneBounds_;
  qreal width_ = 1;
  qreal height_ = 1;
};

}  // namespace craft::viewport
