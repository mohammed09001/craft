#include "MeshGeometryAdapter.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <map>
#include <numbers>
#include <unordered_map>
#include <vector>

namespace craft::viewport {

namespace {

struct BoundsAccumulator {
  float min[3] = {0, 0, 0};
  float max[3] = {0, 0, 0};
  bool any = false;

  void add(const float* p) {
    for (int axis = 0; axis < 3; ++axis) {
      min[axis] = any ? std::min(min[axis], p[axis]) : p[axis];
      max[axis] = any ? std::max(max[axis], p[axis]) : p[axis];
    }
    any = true;
  }
  QVector3D lower() const { return {min[0], min[1], min[2]}; }
  QVector3D upper() const { return {max[0], max[1], max[2]}; }
};

void faceNormal(const float* a, const float* b, const float* c, float* normal) {
  const double e1[3] = {double(b[0]) - a[0], double(b[1]) - a[1], double(b[2]) - a[2]};
  const double e2[3] = {double(c[0]) - a[0], double(c[1]) - a[1], double(c[2]) - a[2]};
  const double n[3] = {e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2],
                       e1[0] * e2[1] - e1[1] * e2[0]};
  const double length = std::sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  for (int axis = 0; axis < 3; ++axis) {
    normal[axis] = length > 0 ? static_cast<float>(n[axis] / length) : 0.0f;
  }
}

template <typename CornerAt>
TriangleBuffers buildTriangles(std::size_t triangleCount, CornerAt cornerAt) {
  TriangleBuffers buffers;
  buffers.vertexCount = static_cast<int>(triangleCount * 3);
  buffers.vertexData.resize(static_cast<qsizetype>(triangleCount) * 3 * TriangleBuffers::kStride);
  auto* out = reinterpret_cast<float*>(buffers.vertexData.data());
  BoundsAccumulator bounds;
  for (std::size_t triangle = 0; triangle < triangleCount; ++triangle) {
    float corners[3][3];
    for (int corner = 0; corner < 3; ++corner) cornerAt(triangle, corner, corners[corner]);
    float normal[3];
    faceNormal(corners[0], corners[1], corners[2], normal);
    for (int corner = 0; corner < 3; ++corner) {
      std::memcpy(out, corners[corner], 12);
      std::memcpy(out + 3, normal, 12);
      out += 6;
      bounds.add(corners[corner]);
    }
  }
  buffers.boundsMin = bounds.lower();
  buffers.boundsMax = bounds.upper();
  return buffers;
}

LineBuffers finishLines(const std::vector<float>& values) {
  LineBuffers buffers;
  buffers.vertexCount = static_cast<int>(values.size() / 3);
  buffers.vertexData = QByteArray(reinterpret_cast<const char*>(values.data()),
                                  static_cast<qsizetype>(values.size() * sizeof(float)));
  BoundsAccumulator bounds;
  for (std::size_t i = 0; i + 2 < values.size(); i += 3) bounds.add(values.data() + i);
  buffers.boundsMin = bounds.lower();
  buffers.boundsMax = bounds.upper();
  return buffers;
}

struct IndexedTriangles {
  std::vector<float> positions;         // xyz per vertex
  std::vector<std::uint32_t> indices;   // 3 per triangle
};

/// Welds a soup by exact float position so shared edges can be recognised.
IndexedTriangles weldExact(const TriangleSoup& soup) {
  IndexedTriangles result;
  std::map<std::array<float, 3>, std::uint32_t> lookup;
  for (std::size_t i = 0; i + 2 < soup.positions.size(); i += 3) {
    const std::array<float, 3> key{soup.positions[i], soup.positions[i + 1], soup.positions[i + 2]};
    auto [entry, inserted] = lookup.try_emplace(key, static_cast<std::uint32_t>(result.positions.size() / 3));
    if (inserted) result.positions.insert(result.positions.end(), key.begin(), key.end());
    result.indices.push_back(entry->second);
  }
  return result;
}

LineBuffers featureEdges(const IndexedTriangles& mesh, double angleDegrees) {
  struct EdgeFaces {
    std::uint32_t a = 0, b = 0;
    int count = 0;
    float normals[2][3] = {};
  };
  std::unordered_map<std::uint64_t, EdgeFaces> edges;
  edges.reserve(mesh.indices.size());
  for (std::size_t i = 0; i + 2 < mesh.indices.size(); i += 3) {
    const std::uint32_t tri[3] = {mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]};
    float normal[3];
    faceNormal(&mesh.positions[tri[0] * 3ull], &mesh.positions[tri[1] * 3ull],
               &mesh.positions[tri[2] * 3ull], normal);
    for (int e = 0; e < 3; ++e) {
      const std::uint32_t a = tri[e], b = tri[(e + 1) % 3];
      const std::uint64_t key = a < b ? (std::uint64_t(a) << 32) | b : (std::uint64_t(b) << 32) | a;
      EdgeFaces& edge = edges[key];
      if (edge.count < 2) std::memcpy(edge.normals[edge.count], normal, 12);
      edge.a = std::min(a, b);
      edge.b = std::max(a, b);
      ++edge.count;
    }
  }

  const double threshold = std::cos(angleDegrees * std::numbers::pi / 180.0);
  std::vector<std::pair<std::uint32_t, std::uint32_t>> selected;
  for (const auto& [key, edge] : edges) {
    bool feature = edge.count != 2;
    if (!feature) {
      const double dot = double(edge.normals[0][0]) * edge.normals[1][0] +
                         double(edge.normals[0][1]) * edge.normals[1][1] +
                         double(edge.normals[0][2]) * edge.normals[1][2];
      feature = dot < threshold;
    }
    if (feature) selected.emplace_back(edge.a, edge.b);
  }
  std::sort(selected.begin(), selected.end());  // deterministic buffer order

  std::vector<float> values;
  values.reserve(selected.size() * 6);
  for (const auto& [a, b] : selected) {
    values.insert(values.end(), &mesh.positions[a * 3ull], &mesh.positions[a * 3ull] + 3);
    values.insert(values.end(), &mesh.positions[b * 3ull], &mesh.positions[b * 3ull] + 3);
  }
  return finishLines(values);
}

}  // namespace

TriangleBuffers buildTriangleBuffers(const TriangleSoup& soup) {
  const float* p = soup.positions.data();
  return buildTriangles(soup.triangleCount(), [p](std::size_t triangle, int corner, float* out) {
    std::memcpy(out, p + triangle * 9 + corner * 3, 12);
  });
}

TriangleBuffers buildTriangleBuffers(const MeshPayload& mesh) {
  return buildTriangles(mesh.triangleCount(), [&mesh](std::size_t triangle, int corner, float* out) {
    const std::size_t v = mesh.indices[triangle * 3 + corner] * 3ull;
    for (int axis = 0; axis < 3; ++axis) out[axis] = static_cast<float>(mesh.positions[v + axis]);
  });
}

LineBuffers buildFeatureEdgeBuffers(const TriangleSoup& soup, double angleDegrees) {
  return featureEdges(weldExact(soup), angleDegrees);
}

LineBuffers buildFeatureEdgeBuffers(const MeshPayload& mesh, double angleDegrees) {
  IndexedTriangles indexed;
  indexed.positions.reserve(mesh.positions.size());
  for (double value : mesh.positions) indexed.positions.push_back(static_cast<float>(value));
  indexed.indices = mesh.indices;
  return featureEdges(indexed, angleDegrees);
}

LineBuffers buildGridBuffers(double size, double step, double skipStep) {
  std::vector<float> values;
  if (!(size > 0) || !(step > 0)) return finishLines(values);
  const double half = size / 2;
  const int lines = static_cast<int>(std::floor(half / step + 1e-9));
  const auto h = static_cast<float>(half);
  for (int i = -lines; i <= lines; ++i) {
    const double offset = i * step;
    if (skipStep > 0) {
      const double ratio = offset / skipStep;
      if (std::fabs(ratio - std::round(ratio)) < 1e-9) continue;
    }
    const auto o = static_cast<float>(offset);
    values.insert(values.end(), {o, -h, 0.0f, o, h, 0.0f});  // parallel to Y
    values.insert(values.end(), {-h, o, 0.0f, h, o, 0.0f});  // parallel to X
  }
  return finishLines(values);
}

LineBuffers buildSegmentBuffers(const QVector3D& from, const QVector3D& to) {
  return finishLines({from.x(), from.y(), from.z(), to.x(), to.y(), to.z()});
}

LineBuffers buildSegmentListBuffers(const std::vector<std::array<QVector3D, 2>>& segments) {
  std::vector<float> values;
  values.reserve(segments.size() * 6);
  for (const auto& segment : segments) {
    for (const QVector3D& end : segment) values.insert(values.end(), {end.x(), end.y(), end.z()});
  }
  return finishLines(values);
}

TriangleBuffers buildQuadBuffers(const std::vector<std::array<QVector3D, 4>>& quads) {
  return buildTriangles(quads.size() * 2, [&quads](std::size_t triangle, int corner, float* out) {
    const auto& quad = quads[triangle / 2];
    const int index = triangle % 2 == 0 ? corner : (corner == 0 ? 0 : corner + 1);  // (a,b,c) then (a,c,d)
    out[0] = quad[static_cast<std::size_t>(index)].x();
    out[1] = quad[static_cast<std::size_t>(index)].y();
    out[2] = quad[static_cast<std::size_t>(index)].z();
  });
}

}  // namespace craft::viewport
