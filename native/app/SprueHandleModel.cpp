#include "SprueHandleModel.h"

namespace craft::app {

SprueHandleModel::SprueHandleModel(QObject* parent) : QAbstractListModel(parent) {}

SprueHandleModel::~SprueHandleModel() {
  for (Row& row : rows_) destroy(row);
}

void SprueHandleModel::destroy(Row& row) {
  if (!row.geometry) return;
  row.geometry->clearBuffers();
  row.geometry->deleteLater();
  row.geometry = nullptr;
}

QVariant SprueHandleModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) return {};
  const Row& row = rows_[static_cast<std::size_t>(index.row())];
  switch (role) {
    case IdRole: return QString::fromStdString(row.id);
    case PositionRole: return row.position;
    case RotationRole: return row.rotation;
    case GeometryRole: return QVariant::fromValue<QQuick3DGeometry*>(row.geometry);
    case ColorRole: return QColor::fromRgb(handleColorRgb(row.status, row.visual));
    case OpacityRole: return handleOpacity(row.visual);
    case VisualScaleRole: return handleVisualScale(row.visual);
    case GroupScaleRole: return row.groupScale;
  }
  return {};
}

QHash<int, QByteArray> SprueHandleModel::roleNames() const {
  return {{IdRole, "handleId"},           {PositionRole, "handlePosition"},       {RotationRole, "handleRotation"},
          {GeometryRole, "handleGeometry"}, {ColorRole, "handleColor"},          {OpacityRole, "handleOpacity"},
          {VisualScaleRole, "handleVisualScale"}, {GroupScaleRole, "handleGroupScale"}};
}

void SprueHandleModel::setHandles(const std::vector<SprueHandle>& handles) {
  beginResetModel();
  for (Row& row : rows_) destroy(row);
  rows_.clear();
  for (const SprueHandle& handle : handles) {
    Row row;
    row.id = handle.id();
    row.status = handle.status;
    row.position = QVector3D(static_cast<float>(handle.position.x), static_cast<float>(handle.position.y), static_cast<float>(handle.position.z));
    row.rotation = QQuaternion(static_cast<float>(handle.orientation.w), static_cast<float>(handle.orientation.x), static_cast<float>(handle.orientation.y),
                               static_cast<float>(handle.orientation.z));
    // The ring that is drawn: the reference's TorusGeometry(radius, max(0.12, 0.045 r), 8, 32), in the ring's own frame.
    const IndexedSurface torus = torusSurface(handle.radiusMm, handle.visualTubeMm());
    row.geometry = new viewport::MeshGeometry;
    row.geometry->setParent(this);
    row.geometry->setBuffers(viewport::buildSmoothSurfaceBuffers({{&torus.positions, &torus.normals, &torus.indices}}));
    rows_.push_back(std::move(row));
  }
  endResetModel();
}

void SprueHandleModel::setVisual(int row, SprueHandleVisual visual) {
  if (row < 0 || row >= rowCount()) return;
  Row& r = rows_[static_cast<std::size_t>(row)];
  if (r.visual == visual) return;
  r.visual = visual;
  emit dataChanged(index(row), index(row), {ColorRole, OpacityRole, VisualScaleRole});
}

void SprueHandleModel::setGroupScale(int row, double ratio) {
  if (row < 0 || row >= rowCount()) return;
  Row& r = rows_[static_cast<std::size_t>(row)];
  if (r.groupScale == ratio) return;
  r.groupScale = ratio;
  emit dataChanged(index(row), index(row), {GroupScaleRole});
}

}  // namespace craft::app
