#include "CutPlaneModel.h"

namespace craft::app {

namespace {
QVector3D toQ(const Vec3& v) { return QVector3D(static_cast<float>(v.x), static_cast<float>(v.y), static_cast<float>(v.z)); }
}  // namespace

QVariant CutPlaneModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) return {};
  const Row& row = rows_[static_cast<std::size_t>(index.row())];
  switch (role) {
    case FaceRole: return QString::fromLatin1(faceIdName(row.face));
    case CenterRole: return row.center;
    case SizeRole: return row.size;
    case ColorRole: return QColor::fromRgb(cutPlaneColorRgb(row.visual));
    case SurfaceOpacityRole: return cutPlaneSurfaceOpacity(row.visual);
    case EdgeOpacityRole: return cutPlaneEdgeOpacity(row.visual);
  }
  return {};
}

QHash<int, QByteArray> CutPlaneModel::roleNames() const {
  return {{FaceRole, "slabFace"},   {CenterRole, "slabCenter"},           {SizeRole, "slabSize"},
          {ColorRole, "slabColor"}, {SurfaceOpacityRole, "slabSurfaceOpacity"}, {EdgeOpacityRole, "slabEdgeOpacity"}};
}

void CutPlaneModel::setSlabs(const std::vector<PlaneSlab>& slabs) {
  beginResetModel();
  rows_.clear();
  for (const PlaneSlab& s : slabs) rows_.push_back({s.face, toQ(s.center), toQ(s.size), CutPlaneVisual::Idle});
  endResetModel();
}

void CutPlaneModel::setVisual(int row, CutPlaneVisual visual) {
  if (row < 0 || row >= rowCount()) return;
  Row& r = rows_[static_cast<std::size_t>(row)];
  if (r.visual == visual) return;
  r.visual = visual;
  emit dataChanged(index(row), index(row), {ColorRole, SurfaceOpacityRole, EdgeOpacityRole});
}

void CutPlaneModel::setCoordinate(int row, int axisIndex, double coordinate) {
  if (row < 0 || row >= rowCount() || axisIndex < 0 || axisIndex > 2) return;
  Row& r = rows_[static_cast<std::size_t>(row)];
  const float value = static_cast<float>(coordinate);
  if ((axisIndex == 0 ? r.center.x() : axisIndex == 1 ? r.center.y() : r.center.z()) == value) return;
  if (axisIndex == 0) r.center.setX(value);
  else if (axisIndex == 1) r.center.setY(value);
  else r.center.setZ(value);
  emit dataChanged(index(row), index(row), {CenterRole});
}

int CutPlaneModel::rowOf(FaceId face) const {
  for (int row = 0; row < rowCount(); ++row) {
    if (rows_[static_cast<std::size_t>(row)].face == face) return row;
  }
  return -1;
}

}  // namespace craft::app
