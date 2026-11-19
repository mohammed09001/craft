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
#include <QSet>
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
  bool selected = false;  // the part, highlighted while selected (the reference highlights the model, not bodies)
  bool ghost = false;         // a stale Master Mold piece: drawn as a ghosted holdover in its own colour (masterMoldBody3dRuntime.ts)
  bool gizmoHidden = false;  // hidden while a sprue ring is hovered, so the ring behind the body shows

  // Exactly one of the two is set.
  std::shared_ptr<const TriangleSoup> soup;
  std::shared_ptr<const MeshPayload> mesh;

  viewport::MeshGeometry* geometry = nullptr;
  viewport::LineGeometry* edges = nullptr;
  viewport::LineGeometry* glassEdges = nullptr;  // outline drawn while the Sprue tool shows the mold as glass
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
    SelectedRole,
    GlassEdgeGeometryRole,
    GizmoHiddenRole,
    GhostRole,
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
  /// Marks the part row selected when `id` is its id (and clears every other mark); an empty or non-part id clears.
  void setSelectedId(const QString& id);
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

  /// While on, every mold-body row carries an outline of its edges (1 degree threshold, like the reference's
  /// EdgesGeometry) for the Sprue tool's glass look; the outlines are built on demand and freed when it is off.
  void setGlass(bool on);
  /// Hides exactly the mold-body rows with these ids (the sprue gizmo's hover); an empty list restores all of them.
  void setGizmoHiddenBodies(const QStringList& bodyIds);
  void setGhostBodies(const QStringList& bodyIds);
  bool glass() const { return glass_; }

  /// Shows or hides the row with this id (the part or a mold body) and remembers it: a mold rebuilt with the same ids comes back as the user left it.
  void setVisibleById(const QString& id, bool visible);
  /// Forgets every hidden id and shows every row (a new model).
  void clearHidden();
  bool isHidden(const QString& id) const { return hiddenIds_.contains(id); }
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

  void buildGlassEdges(SceneItem& item);

  bool glass_ = false;
  std::vector<SceneItem> items_;
  std::vector<QColor> bodyPalette_;
  QSet<QString> hiddenIds_;   // the ids the user hid: bodies and the part
};

}  // namespace craft::app
