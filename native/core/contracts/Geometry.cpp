#include "contracts/Geometry.h"

#include <algorithm>
#include <cmath>

namespace craft {

Bounds3 boundsOfPositions(const std::vector<double>& positions) {
  Bounds3 bounds = emptyBounds();
  for (std::size_t i = 0; i + 2 < positions.size(); i += 3) {
    bounds.min.x = std::min(bounds.min.x, positions[i]);
    bounds.min.y = std::min(bounds.min.y, positions[i + 1]);
    bounds.min.z = std::min(bounds.min.z, positions[i + 2]);
    bounds.max.x = std::max(bounds.max.x, positions[i]);
    bounds.max.y = std::max(bounds.max.y, positions[i + 1]);
    bounds.max.z = std::max(bounds.max.z, positions[i + 2]);
  }
  return bounds;
}

Bounds3 boundsOfSoup(const TriangleSoup& soup) {
  Bounds3 bounds = emptyBounds();
  for (std::size_t i = 0; i + 2 < soup.positions.size(); i += 3) {
    bounds.min.x = std::min(bounds.min.x, static_cast<double>(soup.positions[i]));
    bounds.min.y = std::min(bounds.min.y, static_cast<double>(soup.positions[i + 1]));
    bounds.min.z = std::min(bounds.min.z, static_cast<double>(soup.positions[i + 2]));
    bounds.max.x = std::max(bounds.max.x, static_cast<double>(soup.positions[i]));
    bounds.max.y = std::max(bounds.max.y, static_cast<double>(soup.positions[i + 1]));
    bounds.max.z = std::max(bounds.max.z, static_cast<double>(soup.positions[i + 2]));
  }
  return bounds;
}

bool isFiniteBounds(const Bounds3& bounds) {
  for (int axis = 0; axis < 3; ++axis) {
    if (!std::isfinite(bounds.min[axis]) || !std::isfinite(bounds.max[axis])) return false;
  }
  return true;
}

double signedVolume(const MeshPayload& mesh) {
  double volume = 0.0;
  const auto& p = mesh.positions;
  for (std::size_t i = 0; i + 2 < mesh.indices.size(); i += 3) {
    const std::size_t a = mesh.indices[i] * 3ull;
    const std::size_t b = mesh.indices[i + 1] * 3ull;
    const std::size_t c = mesh.indices[i + 2] * 3ull;
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
               p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
               p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
              6.0;
  }
  return volume;
}

}  // namespace craft
