#pragma once

// Qt Quick 3D geometry nodes fed from MeshGeometryAdapter buffers.
//
// Ownership: each geometry object is a QObject owned by whoever created it
// (the scene model for model/mold meshes, the app controller for helpers).
// Qt Quick 3D owns the GPU buffers behind a geometry and releases them when
// the geometry is destroyed or cleared on the render thread; replacing a
// model therefore means: remove the item from the scene, then deleteLater()
// its geometry. clearBuffers() releases GPU memory early without destroying
// the node.

#include <QQuick3DGeometry>

#include "MeshGeometryAdapter.h"

namespace craft::viewport {

class MeshGeometry : public QQuick3DGeometry {
  Q_OBJECT

 public:
  explicit MeshGeometry(QQuick3DObject* parent = nullptr);

  void setBuffers(const TriangleBuffers& buffers);
  void clearBuffers();
  int triangleCount() const { return triangleCount_; }

 private:
  int triangleCount_ = 0;
};

class LineGeometry : public QQuick3DGeometry {
  Q_OBJECT

 public:
  explicit LineGeometry(QQuick3DObject* parent = nullptr);

  void setBuffers(const LineBuffers& buffers);
  void clearBuffers();
  int segmentCount() const { return segmentCount_; }

 private:
  int segmentCount_ = 0;
};

}  // namespace craft::viewport
