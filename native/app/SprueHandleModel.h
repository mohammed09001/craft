#pragma once

// The sprue resize rings as a list model for the viewport: one row per ring with its pose, colour/opacity/scale state
// and a torus geometry (local coordinates; QML places it with the row's position, rotation and preview scale).

#include <QAbstractListModel>
#include <QColor>
#include <QQuaternion>
#include <QVector3D>

#include <vector>

#include "MeshGeometryAdapter.h"
#include "SceneGeometry.h"
#include "mold/SprueGizmo.h"

namespace craft::app {

class SprueHandleModel : public QAbstractListModel {
  Q_OBJECT

 public:
  enum Role { IdRole = Qt::UserRole + 1, PositionRole, RotationRole, GeometryRole, ColorRole, OpacityRole, VisualScaleRole, GroupScaleRole };

  explicit SprueHandleModel(QObject* parent = nullptr);
  ~SprueHandleModel() override;

  int rowCount(const QModelIndex& parent = {}) const override { return parent.isValid() ? 0 : static_cast<int>(rows_.size()); }
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  /// Replaces every ring (idle look, no preview scale).
  void setHandles(const std::vector<SprueHandle>& handles);
  void clear() { setHandles({}); }
  /// The ring's hover/active look.
  void setVisual(int row, SprueHandleVisual visual);
  /// The drag preview: the ring (not its tube) is scaled in its own plane by `ratio`.
  void setGroupScale(int row, double ratio);

 private:
  struct Row {
    std::string id, status;
    QVector3D position;
    QQuaternion rotation;
    viewport::MeshGeometry* geometry = nullptr;
    SprueHandleVisual visual = SprueHandleVisual::Idle;
    double groupScale = 1;
  };
  void destroy(Row& row);

  std::vector<Row> rows_;
};

}  // namespace craft::app
