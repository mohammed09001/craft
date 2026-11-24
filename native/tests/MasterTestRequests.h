#pragma once

// Builds Master Mold requests from small generated solids (shared by the worker and workflow tests).

#include <algorithm>
#include <cmath>
#include <numbers>

#include "master/MasterMoldStore.h"

namespace craft::testing {

/// A closed UV sphere with a vertex ring on the equator (`rings` even), outward winding.
inline MeshPayload masterTestSphere(double radius, int rings, int segments) {
  MeshPayload m;
  const auto addRing = [&](double r, double z) {
    for (int j = 0; j < segments; ++j) {
      const double a = 2 * std::numbers::pi * j / segments;
      m.positions.insert(m.positions.end(), {r * std::cos(a), r * std::sin(a), z});
    }
  };
  m.positions.insert(m.positions.end(), {0, 0, -radius});
  for (int k = 1; k < rings; ++k) addRing(radius * std::sin(std::numbers::pi * k / rings), -radius * std::cos(std::numbers::pi * k / rings));
  const auto top = static_cast<std::uint32_t>(m.vertexCount());
  m.positions.insert(m.positions.end(), {0, 0, radius});
  const auto ring = [&](int k, int j) { return static_cast<std::uint32_t>(1 + (k - 1) * segments + (j % segments)); };
  for (int j = 0; j < segments; ++j) {
    m.indices.insert(m.indices.end(), {0u, ring(1, j + 1), ring(1, j)});
    for (int k = 1; k + 1 < rings; ++k) {
      m.indices.insert(m.indices.end(), {ring(k, j), ring(k, j + 1), ring(k + 1, j + 1)});
      m.indices.insert(m.indices.end(), {ring(k, j), ring(k + 1, j + 1), ring(k + 1, j)});
    }
    m.indices.insert(m.indices.end(), {top, ring(rings - 1, j), ring(rings - 1, j + 1)});
  }
  return m;
}

inline MasterMoldRequest masterRequestForMesh(const MeshPayload& mesh, const std::string& name, const std::optional<Point3>& printer = std::nullopt) {
  MasterSeedInput input;
  MasterSeedGeometryInput& g = input.sourcePartGeometry;
  g.modelId = "model-" + name;
  g.positions = mesh.positions;
  g.indices = mesh.indices;
  g.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  Bounds3 local = emptyBounds();
  for (std::size_t i = 0; i < mesh.vertexCount(); ++i)
    for (int a = 0; a < 3; ++a) {
      local.min[a] = std::min(local.min[a], mesh.positions[3 * i + static_cast<std::size_t>(a)]);
      local.max[a] = std::max(local.max[a], mesh.positions[3 * i + static_cast<std::size_t>(a)]);
    }
  g.localBounds = local;
  g.geometryVersion = "geom-" + name;
  input.printerBuildVolume = printer;
  input.projectRevision = "rev-1";
  MasterMoldRequest request;
  request.operationId = "master-mold:1";
  request.generationVersion = 1;
  request.seed = buildMasterMoldSeedSnapshot(input);
  return request;
}

}  // namespace craft::testing
