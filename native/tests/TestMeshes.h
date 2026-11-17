#pragma once

// Shared geometry builders for the native tests.

#include <cmath>
#include <numbers>

#include "contracts/Geometry.h"

namespace craft::test {

/// Same vertex and index order as cubeMesh() in the reference
/// cavityGeneration.testFixtures.ts (outward winding, 8 vertices, 12 faces).
inline MeshPayload cubeMesh(const Bounds3& b) {
  MeshPayload mesh;
  mesh.positions = {b.min.x, b.min.y, b.min.z, b.min.x, b.min.y, b.max.z, b.min.x, b.max.y, b.max.z,
                    b.min.x, b.max.y, b.min.z, b.max.x, b.min.y, b.min.z, b.max.x, b.max.y, b.min.z,
                    b.max.x, b.max.y, b.max.z, b.max.x, b.min.y, b.max.z};
  mesh.indices = {0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 1,
                  3, 2, 6, 3, 6, 5, 0, 3, 5, 0, 5, 4, 1, 7, 6, 1, 6, 2};
  return mesh;
}

/// Closed UV sphere with outward winding.
inline MeshPayload sphereMesh(const Point3& center, double radius, int segments = 24,
                              int rings = 12) {
  MeshPayload mesh;
  mesh.positions.insert(mesh.positions.end(), {center.x, center.y, center.z + radius});
  for (int ring = 1; ring < rings; ++ring) {
    const double phi = std::numbers::pi * ring / rings;
    for (int segment = 0; segment < segments; ++segment) {
      const double theta = 2 * std::numbers::pi * segment / segments;
      mesh.positions.insert(mesh.positions.end(),
                            {center.x + radius * std::sin(phi) * std::cos(theta),
                             center.y + radius * std::sin(phi) * std::sin(theta),
                             center.z + radius * std::cos(phi)});
    }
  }
  mesh.positions.insert(mesh.positions.end(), {center.x, center.y, center.z - radius});
  const auto ringStart = [&](int ring) { return static_cast<std::uint32_t>(1 + (ring - 1) * segments); };
  const auto south = static_cast<std::uint32_t>(mesh.positions.size() / 3 - 1);
  for (int segment = 0; segment < segments; ++segment) {
    const std::uint32_t next = (segment + 1) % segments;
    mesh.indices.insert(mesh.indices.end(), {0u, ringStart(1) + segment, ringStart(1) + next});
    for (int ring = 1; ring < rings - 1; ++ring) {
      const std::uint32_t a = ringStart(ring) + segment, b = ringStart(ring) + next;
      const std::uint32_t c = ringStart(ring + 1) + segment, d = ringStart(ring + 1) + next;
      mesh.indices.insert(mesh.indices.end(), {a, c, d, a, d, b});
    }
    mesh.indices.insert(mesh.indices.end(),
                        {south, ringStart(rings - 1) + next, ringStart(rings - 1) + segment});
  }
  return mesh;
}

/// Expands an indexed mesh to the float32 triangle soup an STL import yields.
inline TriangleSoup soupFromMesh(const MeshPayload& mesh) {
  TriangleSoup soup;
  soup.positions.reserve(mesh.indices.size() * 3);
  for (std::uint32_t index : mesh.indices) {
    for (int axis = 0; axis < 3; ++axis) {
      soup.positions.push_back(static_cast<float>(mesh.positions[index * 3ull + axis]));
    }
  }
  return soup;
}

inline Bounds3 box(double minX, double minY, double minZ, double maxX, double maxY, double maxZ) {
  return {{minX, minY, minZ}, {maxX, maxY, maxZ}};
}

}  // namespace craft::test
