#include "SceneGeometry.h"

namespace craft::viewport {

MeshGeometry::MeshGeometry(QQuick3DObject* parent) : QQuick3DGeometry(parent) {}

void MeshGeometry::setBuffers(const TriangleBuffers& buffers) {
  clear();
  triangleCount_ = buffers.vertexCount / 3;
  if (buffers.vertexCount > 0) {
    setVertexData(buffers.vertexData);
    setStride(buffers.stride());
    setPrimitiveType(QQuick3DGeometry::PrimitiveType::Triangles);
    addAttribute(QQuick3DGeometry::Attribute::PositionSemantic, TriangleBuffers::kPositionOffset,
                 QQuick3DGeometry::Attribute::F32Type);
    addAttribute(QQuick3DGeometry::Attribute::NormalSemantic, TriangleBuffers::kNormalOffset,
                 QQuick3DGeometry::Attribute::F32Type);
    if (buffers.hasColor)
      addAttribute(QQuick3DGeometry::Attribute::ColorSemantic, TriangleBuffers::kColorOffset, QQuick3DGeometry::Attribute::F32Type);
    setBounds(buffers.boundsMin, buffers.boundsMax);
  }
  update();
}

void MeshGeometry::clearBuffers() {
  clear();
  triangleCount_ = 0;
  update();
}

LineGeometry::LineGeometry(QQuick3DObject* parent) : QQuick3DGeometry(parent) {}

void LineGeometry::setBuffers(const LineBuffers& buffers) {
  clear();
  segmentCount_ = buffers.vertexCount / 2;
  if (buffers.vertexCount > 0) {
    setVertexData(buffers.vertexData);
    setStride(LineBuffers::kStride);
    setPrimitiveType(QQuick3DGeometry::PrimitiveType::Lines);
    addAttribute(QQuick3DGeometry::Attribute::PositionSemantic, 0,
                 QQuick3DGeometry::Attribute::F32Type);
    setBounds(buffers.boundsMin, buffers.boundsMax);
  }
  update();
}

void LineGeometry::clearBuffers() {
  clear();
  segmentCount_ = 0;
  update();
}

}  // namespace craft::viewport
