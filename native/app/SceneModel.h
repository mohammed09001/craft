#pragma once

// The renderable scene as a list model: the imported part plus the generated
// mold bodies. QML instantiates one Qt Quick 3D Model per row.
//
// The model keeps the canonical geometry of each row next to its GPU geometry
// so picking and export always operate on engineering data, never on render
// buffers. It owns every geometry object it creates and destroys them when a
// row is removed.

#include <QAbstractListModel>
#include <QColor>
#include <QVector3D>

#include <memory>
#include <optional>
#include <vector>

#include "SceneGeometry.h"
#include "contracts/Geometry.h"
#include "geometry/RayPicking.h"

namespace craft::app {

struct SceneItem {
  QString id;
  QString name;
  QString kind;  // "part" | "mold-body"
  QColor color;
  bool visible = true;
  QVector3D offset;  // display offset in mm (the part's mold-frame offset)
  double volumeMm3 = 0;
  int triangleCount = 0;
  Bounds3 bounds;    // canonical bounds, before `offset`

  // Exactly one of the two is set.
  std::shared_ptr<const TriangleSoup> soup;
  std::shared_ptr<const MeshPayload> mesh;

  viewport::MeshGeometry* geometry = nullptr;
  viewport::LineGeometry* edges = nullptr;
};

struct ScenePick {
  int row = -1;
  PickHit hit;  // in scene coordinates (offset applied)
};

class SceneModel : public QAbstractListModel {
  Q_OBJECT
  Q_PROPERTY(int count READ count NOTIFY countChanged)

 public:
  enum Role {
    IdRole = Qt::UserRole + 1,
    NameRole,
    KindRole,
    ColorRole,
    VisibleRole,
    OffsetRole,
    GeometryRole,
    EdgeGeometryRole,
    VolumeRole,
    TriangleCountRole,
  };

  explicit SceneModel(QObject* parent = nullptr);
  ~SceneModel() override;

  int rowCount(const QModelIndex& parent = {}) const override;
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;
  int count() const { return static_cast<int>(items_.size()); }

  /// Replaces the part row (or removes it when `soup` is null).
  void setPart(const QString& id, const QString& name, std::shared_ptr<const TriangleSoup> soup,
               const QColor& color);
  void setPartOffset(const QVector3D& offset);
  /// Replaces every mold-body row.
  struct BodyInput {
    QString id;
    QString name;
    std::shared_ptr<const MeshPayload> mesh;
    Bounds3 bounds;
    double volumeMm3 = 0;
  };
  void setMoldBodies(const std::vector<BodyInput>& bodies);
  void clearMoldBodies();
  void recolor(const QColor& partColor, const std::vector<QColor>& bodyPalette);

  Q_INVOKABLE void setItemVisible(int row, bool visible);
  Q_INVOKABLE void setKindVisible(const QString& kind, bool visible);

  const std::vector<SceneItem>& items() const { return items_; }
  /// Union of the visible rows' bounds in scene coordinates.
  std::optional<Bounds3> visibleBounds() const;
  /// Nearest hit among visible rows.
  std::optional<ScenePick> pick(const Ray& ray) const;

 signals:
  void countChanged();
  void sceneChanged();

 private:
  void destroyGeometry(SceneItem& item);
  int partRow() const;

  std::vector<SceneItem> items_;
  std::vector<QColor> bodyPalette_;
};

}  // namespace craft::app
