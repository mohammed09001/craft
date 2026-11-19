#include "SceneModel.h"
#include "view/ViewportLook.h"

#include <algorithm>

#include "mold/SpruePreview.h"

namespace craft::app {

namespace {
const QString kPartKind = QStringLiteral("part");
const QString kBodyKind = QStringLiteral("mold-body");
}  // namespace

SceneModel::SceneModel(QObject* parent) : QAbstractListModel(parent) {}

SceneModel::~SceneModel() {
  for (SceneItem& item : items_) destroyGeometry(item);
}

int SceneModel::rowCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : static_cast<int>(items_.size());
}

QVariant SceneModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= count()) return {};
  const SceneItem& item = items_[static_cast<std::size_t>(index.row())];
  switch (role) {
    case IdRole: return item.id;
    case NameRole: return item.name;
    case KindRole: return item.kind;
    case ColorRole: return item.color;
    case VisibleRole: return item.visible;
    case OffsetRole: return item.offset;
    case GeometryRole: return QVariant::fromValue<QQuick3DGeometry*>(item.geometry);
    case EdgeGeometryRole: return QVariant::fromValue<QQuick3DGeometry*>(item.edges);
    case VolumeRole: return item.volumeMm3;
    case TriangleCountRole: return item.triangleCount;
    case SelectedRole: return item.selected;
    case GlassEdgeGeometryRole: return QVariant::fromValue<QQuick3DGeometry*>(item.glassEdges);
    case GizmoHiddenRole: return item.gizmoHidden;
    case GhostRole: return item.ghost;
  }
  return {};
}

QHash<int, QByteArray> SceneModel::roleNames() const {
  return {{IdRole, "itemId"},
          {NameRole, "itemName"},
          {KindRole, "itemKind"},
          {ColorRole, "itemColor"},
          {VisibleRole, "itemVisible"},
          {OffsetRole, "itemOffset"},
          {GeometryRole, "itemGeometry"},
          {EdgeGeometryRole, "itemEdgeGeometry"},
          {VolumeRole, "itemVolume"},
          {TriangleCountRole, "itemTriangleCount"},
          {SelectedRole, "itemSelected"},
          {GlassEdgeGeometryRole, "itemGlassEdgeGeometry"},
          {GizmoHiddenRole, "itemGizmoHidden"},
          {GhostRole, "itemGhost"}};
}

void SceneModel::destroyGeometry(SceneItem& item) {
  // Release GPU buffers now; the nodes themselves go away once QML has
  // dropped its references to them.
  if (item.geometry) {
    item.geometry->clearBuffers();
    item.geometry->deleteLater();
    item.geometry = nullptr;
  }
  if (item.edges) {
    item.edges->clearBuffers();
    item.edges->deleteLater();
    item.edges = nullptr;
  }
  if (item.glassEdges) {
    item.glassEdges->clearBuffers();
    item.glassEdges->deleteLater();
    item.glassEdges = nullptr;
  }
}

int SceneModel::partRow() const {
  for (int row = 0; row < count(); ++row) {
    if (items_[static_cast<std::size_t>(row)].kind == kPartKind) return row;
  }
  return -1;
}

void SceneModel::setPart(const QString& id, const QString& name,
                         std::shared_ptr<const TriangleSoup> soup, const QColor& color) {
  const int existing = partRow();
  if (existing >= 0) {
    beginRemoveRows({}, existing, existing);
    destroyGeometry(items_[static_cast<std::size_t>(existing)]);
    items_.erase(items_.begin() + existing);
    endRemoveRows();
  }
  if (soup && soup->triangleCount() > 0) {
    SceneItem item;
    item.id = id;
    item.name = name;
    item.kind = kPartKind;
    item.visible = !hiddenIds_.contains(id);
    item.color = color;
    item.bounds = boundsOfSoup(*soup);
    item.triangleCount = static_cast<int>(soup->triangleCount());
    item.geometry = new viewport::MeshGeometry;
    item.geometry->setParent(this);
    item.geometry->setBuffers(viewport::buildTriangleBuffers(*soup));
    // The reference does not outline the imported part: feature edges are drawn on mold bodies only (featureEdgeOverlay.ts).
    item.soup = std::move(soup);
    beginInsertRows({}, 0, 0);
    items_.insert(items_.begin(), std::move(item));
    endInsertRows();
  }
  emit countChanged();
  emit sceneChanged();
}

void SceneModel::setPartOffset(const QVector3D& offset) {
  const int row = partRow();
  if (row < 0) return;
  items_[static_cast<std::size_t>(row)].offset = offset;
  emit dataChanged(index(row), index(row), {OffsetRole});
  emit sceneChanged();
}

void SceneModel::setSelectedId(const QString& id) {
  for (int row = 0; row < count(); ++row) {
    SceneItem& item = items_[static_cast<std::size_t>(row)];
    const bool selected = !id.isEmpty() && item.kind == kPartKind && item.id == id;
    if (item.selected == selected) continue;
    item.selected = selected;
    emit dataChanged(index(row), index(row), {SelectedRole});
  }
}

void SceneModel::buildGlassEdges(SceneItem& item) {
  if (item.glassEdges || !item.mesh) return;
  item.glassEdges = new viewport::LineGeometry;
  item.glassEdges->setParent(this);
  item.glassEdges->setBuffers(viewport::buildFeatureEdgeBuffers(*item.mesh, kSprueGlassEdgeAngleDegrees));
}

void SceneModel::setGlass(bool on) {
  if (glass_ == on) return;
  glass_ = on;
  for (int row = 0; row < count(); ++row) {
    SceneItem& item = items_[static_cast<std::size_t>(row)];
    if (item.kind != kBodyKind) continue;
    if (on) {
      buildGlassEdges(item);
    } else if (item.glassEdges) {
      item.glassEdges->clearBuffers();
      item.glassEdges->deleteLater();
      item.glassEdges = nullptr;
    }
    emit dataChanged(index(row), index(row), {GlassEdgeGeometryRole});
  }
}

void SceneModel::setGizmoHiddenBodies(const QStringList& bodyIds) {
  for (int row = 0; row < count(); ++row) {
    SceneItem& item = items_[static_cast<std::size_t>(row)];
    const bool hidden = item.kind == kBodyKind && bodyIds.contains(item.id);
    if (item.gizmoHidden == hidden) continue;
    item.gizmoHidden = hidden;
    emit dataChanged(index(row), index(row), {GizmoHiddenRole});
  }
}

void SceneModel::setGhostBodies(const QStringList& bodyIds) {
  for (int row = 0; row < count(); ++row) {
    SceneItem& item = items_[static_cast<std::size_t>(row)];
    const bool ghost = item.kind == kBodyKind && bodyIds.contains(item.id);
    if (item.ghost == ghost) continue;
    item.ghost = ghost;
    emit dataChanged(index(row), index(row), {GhostRole});
  }
}

void SceneModel::clearMoldBodies() { setMoldBodies({}); }

void SceneModel::setVisibleById(const QString& id, bool visible) {
  if (visible) hiddenIds_.remove(id);
  else hiddenIds_.insert(id);
  for (int row = 0; row < count(); ++row)
    if (items_[static_cast<std::size_t>(row)].id == id) setItemVisible(row, visible);
}

void SceneModel::clearHidden() {
  hiddenIds_.clear();
  for (int row = 0; row < count(); ++row) setItemVisible(row, true);
}

void SceneModel::setMoldBodies(const std::vector<BodyInput>& bodies) {
  for (int row = count() - 1; row >= 0; --row) {
    if (items_[static_cast<std::size_t>(row)].kind != kBodyKind) continue;
    beginRemoveRows({}, row, row);
    destroyGeometry(items_[static_cast<std::size_t>(row)]);
    items_.erase(items_.begin() + row);
    endRemoveRows();
  }
  int paletteIndex = 0;
  for (const BodyInput& body : bodies) {
    if (!body.mesh || body.mesh->empty()) continue;
    SceneItem item;
    item.id = body.id;
    item.name = body.name;
    item.kind = kBodyKind;
    item.visible = !hiddenIds_.contains(body.id);
    item.color = bodyPalette_.empty()
                     ? QColor(120, 160, 200)
                     : bodyPalette_[static_cast<std::size_t>(paletteIndex) % bodyPalette_.size()];
    ++paletteIndex;
    item.bounds = body.bounds;
    item.volumeMm3 = body.volumeMm3;
    item.triangleCount = static_cast<int>(body.mesh->triangleCount());
    item.mesh = body.mesh;
    item.geometry = new viewport::MeshGeometry;
    item.geometry->setParent(this);
    item.geometry->setBuffers(viewport::buildTriangleBuffers(*body.mesh));
    item.edges = new viewport::LineGeometry;
    item.edges->setParent(this);
    item.edges->setBuffers(viewport::buildFeatureEdgeBuffers(*body.mesh, referenceLook(true).edgeAngleDegrees));
    if (glass_) buildGlassEdges(item);
    const int row = count();
    beginInsertRows({}, row, row);
    items_.push_back(std::move(item));
    endInsertRows();
  }
  emit countChanged();
  emit sceneChanged();
}

void SceneModel::recolor(const QColor& partColor, const std::vector<QColor>& bodyPalette) {
  bodyPalette_ = bodyPalette;
  int paletteIndex = 0;
  for (SceneItem& item : items_) {
    if (item.kind == kPartKind) {
      item.color = partColor;
    } else if (!bodyPalette_.empty()) {
      item.color = bodyPalette_[static_cast<std::size_t>(paletteIndex++) % bodyPalette_.size()];
    }
  }
  if (!items_.empty()) emit dataChanged(index(0), index(count() - 1), {ColorRole});
}

void SceneModel::setItemVisible(int row, bool visible) {
  if (row < 0 || row >= count()) return;
  SceneItem& item = items_[static_cast<std::size_t>(row)];
  if (item.visible == visible) return;
  item.visible = visible;
  emit dataChanged(index(row), index(row), {VisibleRole});
  emit sceneChanged();
}

void SceneModel::setKindVisible(const QString& kind, bool visible) {
  for (int row = 0; row < count(); ++row) {
    if (items_[static_cast<std::size_t>(row)].kind == kind) setItemVisible(row, visible);
  }
}

std::optional<Bounds3> SceneModel::visibleBounds() const {
  std::optional<Bounds3> result;
  for (const SceneItem& item : items_) {
    if (!item.visible) continue;
    Bounds3 bounds = item.bounds;
    bounds.min = {bounds.min.x + item.offset.x(), bounds.min.y + item.offset.y(),
                  bounds.min.z + item.offset.z()};
    bounds.max = {bounds.max.x + item.offset.x(), bounds.max.y + item.offset.y(),
                  bounds.max.z + item.offset.z()};
    if (!result) {
      result = bounds;
      continue;
    }
    for (int axis = 0; axis < 3; ++axis) {
      result->min[axis] = std::min(result->min[axis], bounds.min[axis]);
      result->max[axis] = std::max(result->max[axis], bounds.max[axis]);
    }
  }
  return result;
}

std::optional<ScenePick> SceneModel::pick(const Ray& ray) const {
  std::optional<ScenePick> best;
  for (int row = 0; row < count(); ++row) {
    const SceneItem& item = items_[static_cast<std::size_t>(row)];
    if (!item.visible) continue;
    // Move the ray into the item's local frame instead of moving the mesh.
    const Vec3 offset{item.offset.x(), item.offset.y(), item.offset.z()};
    const Ray local{ray.origin - offset, ray.direction};
    std::optional<PickHit> hit = item.soup ? pickTriangleSoup(*item.soup, local)
                                 : item.mesh ? pickMesh(*item.mesh, local)
                                             : std::nullopt;
    if (!hit || (best && hit->distance >= best->hit.distance)) continue;
    hit->point = hit->point + offset;
    best = ScenePick{row, *hit};
  }
  return best;
}

}  // namespace craft::app
