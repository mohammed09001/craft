#pragma once

// The Cut by Face plane slabs as a list model for the viewport: one row per drawn plane with its pose, size and
// look (amber idle, red under the Eraser). QML draws each row as a thin translucent box plus its edges.

#include <QAbstractListModel>
#include <QColor>
#include <QVector3D>

#include <vector>

#include "mold/CuttingPlaneSlabs.h"

namespace craft::app {

class CutPlaneModel : public QAbstractListModel {
  Q_OBJECT

 public:
  enum Role { FaceRole = Qt::UserRole + 1, CenterRole, SizeRole, ColorRole, SurfaceOpacityRole, EdgeOpacityRole };

  explicit CutPlaneModel(QObject* parent = nullptr) : QAbstractListModel(parent) {}

  int rowCount(const QModelIndex& parent = {}) const override { return parent.isValid() ? 0 : static_cast<int>(rows_.size()); }
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  /// Replaces every row (idle look).
  void setSlabs(const std::vector<PlaneSlab>& slabs);
  /// Look of one row; -1 or an unknown row does nothing.
  void setVisual(int row, CutPlaneVisual visual);
  /// The row of a face, or -1.
  int rowOf(FaceId face) const;

 private:
  struct Row {
    FaceId face = FaceId::Top;
    QVector3D center, size;
    CutPlaneVisual visual = CutPlaneVisual::Idle;
  };
  std::vector<Row> rows_;
};

}  // namespace craft::app
