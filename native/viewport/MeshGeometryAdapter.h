#pragma once

// Converts canonical Craft geometry into renderer-ready buffers.
//
// This is the only place where engineering data (millimeters, Z-up, indexed
// or triangle-soup meshes) is turned into GPU vertex layouts. The functions
// are pure and renderer-independent, so the conversion is unit-tested without
// a GPU; MeshGeometry / LineGeometry merely upload the result.
//
// No axis conversion happens here: the scene stays Z-up and the camera is
// oriented accordingly (see ViewportCamera), so a rendered coordinate is
// always the engineering coordinate.

#include <QByteArray>
#include <QVector3D>

#include <array>
#include <cstdint>
#include <vector>

#include "contracts/Geometry.h"

namespace craft::viewport {

/// Interleaved float32 position + normal, 24 bytes per vertex, non-indexed
/// triangles with one geometric normal per face (flat CAD shading, like the
/// reference viewport's STL rendering).
struct TriangleBuffers {
  QByteArray vertexData;
  int vertexCount = 0;
  QVector3D boundsMin;
  QVector3D boundsMax;

  static constexpr int kStride = 24;
  static constexpr int kPositionOffset = 0;
  static constexpr int kNormalOffset = 12;
};

/// Float32 xyz pairs, 12 bytes per vertex, line-list topology.
struct LineBuffers {
  QByteArray vertexData;
  int vertexCount = 0;
  QVector3D boundsMin;
  QVector3D boundsMax;

  static constexpr int kStride = 12;
};

TriangleBuffers buildTriangleBuffers(const TriangleSoup& soup);
TriangleBuffers buildTriangleBuffers(const MeshPayload& mesh);

/// Feature edges: boundary edges plus edges whose adjacent faces meet at more
/// than `angleDegrees` (the reference featureEdgeOverlay.ts idea). Vertices
/// are matched by exact position, so it works for triangle soups too.
LineBuffers buildFeatureEdgeBuffers(const TriangleSoup& soup, double angleDegrees = 30.0);
LineBuffers buildFeatureEdgeBuffers(const MeshPayload& mesh, double angleDegrees = 30.0);

/// Square grid on the plane Z = 0, centred on the origin. `step` is the line
/// spacing; lines that fall on a multiple of `skipStep` are omitted (pass 0
/// to keep all) so minor and major grids do not overdraw each other.
LineBuffers buildGridBuffers(double size, double step, double skipStep = 0.0);

/// A single segment (axes, measurement line).
LineBuffers buildSegmentBuffers(const QVector3D& from, const QVector3D& to);

/// Segments as consecutive xyz pairs (the ground-plane ruler's axes and ticks).
LineBuffers buildLineListBuffers(const std::vector<float>& xyz);

/// Many segments in one line list (the dashed selection box). Empty input gives an empty buffer.
LineBuffers buildSegmentListBuffers(const std::vector<std::array<QVector3D, 2>>& segments);

/// An indexed triangle surface with one normal per vertex (xyz doubles), e.g. the Sprue preview solids.
struct SmoothSurface {
  const std::vector<double>* positions = nullptr;
  const std::vector<double>* normals = nullptr;
  const std::vector<std::uint32_t>* indices = nullptr;
};

/// Several indexed surfaces as one non-indexed triangle list, keeping their per-vertex (smooth) normals.
TriangleBuffers buildSmoothSurfaceBuffers(const std::vector<SmoothSurface>& surfaces);

/// Overlay quads as triangles: each quad (a, b, c, d) becomes (a, b, c) and (a, c, d) with its geometric normal.
TriangleBuffers buildQuadBuffers(const std::vector<std::array<QVector3D, 4>>& quads);

}  // namespace craft::viewport
