#include "master/MasterMultiLabel.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "master/MasterPlanning.h"
#include "master/RayBvh.h"

namespace craft {

namespace {

inline std::size_t voxelIndex(const std::array<int, 3>& dims, int x, int y, int z) {
  return (static_cast<std::size_t>(z) * static_cast<std::size_t>(dims[1]) + static_cast<std::size_t>(y)) * static_cast<std::size_t>(dims[0]) + static_cast<std::size_t>(x);
}

bool isOnGridBoundary(const std::array<int, 3>& dims, int x, int y, int z) {
  return x == 0 || y == 0 || z == 0 || x == dims[0] - 1 || y == dims[1] - 1 || z == dims[2] - 1;
}

/// Exact distance to the nearest triangle of a subset: three.js Triangle.closestPointToPoint (Ericson) per triangle,
/// minimized over a BVH of triangle boxes. The minimum is independent of traversal order.
class TriangleDistanceBvh {
 public:
  TriangleDistanceBvh(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, const std::vector<int>& triangles) {
    tris_.reserve(triangles.size());
    for (int t : triangles) {
      Tri tri;
      for (int c = 0; c < 3; ++c) {
        const std::size_t v = indices[static_cast<std::size_t>(t) * 3 + static_cast<std::size_t>(c)];
        tri.p[c] = {positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]};
      }
      tris_.push_back(tri);
    }
    std::vector<int> ids(tris_.size());
    for (std::size_t i = 0; i < ids.size(); ++i) ids[i] = static_cast<int>(i);
    if (!ids.empty()) build(ids, 0, ids.size());
    order_ = std::move(ids);
  }

  /// sqrt of the minimum squared distance (Infinity for an empty set).
  double distance(const Point3& p) const {
    double best = INFINITY;
    if (nodes_.empty()) return best;
    std::vector<int> stack{0};
    while (!stack.empty()) {
      const Node& n = nodes_[static_cast<std::size_t>(stack.back())];
      stack.pop_back();
      if (boxDistanceSq(n.box, p) >= best) continue;
      if (n.left < 0) {
        for (int i = n.start; i < n.start + n.count; ++i) best = std::min(best, triangleDistanceSq(tris_[static_cast<std::size_t>(order_[static_cast<std::size_t>(i)])], p));
      } else {
        stack.push_back(n.left);
        stack.push_back(n.right);
      }
    }
    return std::sqrt(best);
  }

 private:
  struct Tri { Point3 p[3]; };
  struct Node { Bounds3 box; int left = -1, right = -1, start = 0, count = 0; };

  static double boxDistanceSq(const Bounds3& b, const Point3& p) {
    const double cx = std::min(std::max(p.x, b.min.x), b.max.x), cy = std::min(std::max(p.y, b.min.y), b.max.y), cz = std::min(std::max(p.z, b.min.z), b.max.z);
    const double dx = cx - p.x, dy = cy - p.y, dz = cz - p.z;
    return dx * dx + dy * dy + dz * dz;
  }

  static double triangleDistanceSq(const Tri& t, const Point3& p) {
    const Point3 &a = t.p[0], &b = t.p[1], &c = t.p[2];
    const auto sub = [](const Point3& u, const Point3& v) { return Point3{u.x - v.x, u.y - v.y, u.z - v.z}; };
    const auto dot = [](const Point3& u, const Point3& v) { return u.x * v.x + u.y * v.y + u.z * v.z; };
    const auto scaled = [](const Point3& base, const Point3& dir, double s) { return Point3{base.x + dir.x * s, base.y + dir.y * s, base.z + dir.z * s}; };
    const Point3 vab = sub(b, a), vac = sub(c, a), vap = sub(p, a);
    const double d1 = dot(vab, vap), d2 = dot(vac, vap);
    Point3 q;
    if (d1 <= 0 && d2 <= 0) {
      q = a;
    } else {
      const Point3 vbp = sub(p, b);
      const double d3 = dot(vab, vbp), d4 = dot(vac, vbp);
      if (d3 >= 0 && d4 <= d3) {
        q = b;
      } else {
        const double vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) {
          q = scaled(a, vab, d1 / (d1 - d3));
        } else {
          const Point3 vcp = sub(p, c);
          const double d5 = dot(vab, vcp), d6 = dot(vac, vcp);
          if (d6 >= 0 && d5 <= d6) {
            q = c;
          } else {
            const double vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) {
              q = scaled(a, vac, d2 / (d2 - d6));
            } else {
              const double va = d3 * d6 - d5 * d4;
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
                const Point3 vbc = sub(c, b);
                q = scaled(b, vbc, (d4 - d3) / ((d4 - d3) + (d5 - d6)));
              } else {
                const double denom = 1 / (va + vb + vc);
                const double v = vb * denom, w = vc * denom;
                q = scaled(scaled(a, vab, v), vac, w);
              }
            }
          }
        }
      }
    }
    const double dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    return dx * dx + dy * dy + dz * dz;
  }

  int build(std::vector<int>& ids, std::size_t begin, std::size_t end) {
    const int index = static_cast<int>(nodes_.size());
    nodes_.emplace_back();
    Bounds3 box = emptyBounds();
    for (std::size_t i = begin; i < end; ++i)
      for (const Point3& v : tris_[static_cast<std::size_t>(ids[i])].p)
        for (int a = 0; a < 3; ++a) { box.min[a] = std::min(box.min[a], v[a]); box.max[a] = std::max(box.max[a], v[a]); }
    nodes_[static_cast<std::size_t>(index)].box = box;
    if (end - begin <= 8) {
      nodes_[static_cast<std::size_t>(index)].start = static_cast<int>(begin);
      nodes_[static_cast<std::size_t>(index)].count = static_cast<int>(end - begin);
      return index;
    }
    int axis = 0;
    double best = box.max.x - box.min.x;
    if (box.max.y - box.min.y > best) { axis = 1; best = box.max.y - box.min.y; }
    if (box.max.z - box.min.z > best) axis = 2;
    const std::size_t mid = (begin + end) / 2;
    std::nth_element(ids.begin() + static_cast<long>(begin), ids.begin() + static_cast<long>(mid), ids.begin() + static_cast<long>(end), [&](int a, int b) {
      const auto centre = [&](int id) { const auto& t = tris_[static_cast<std::size_t>(id)]; return t.p[0][axis] + t.p[1][axis] + t.p[2][axis]; };
      return centre(a) < centre(b);
    });
    const int left = build(ids, begin, mid), right = build(ids, mid, end);
    nodes_[static_cast<std::size_t>(index)].left = left;
    nodes_[static_cast<std::size_t>(index)].right = right;
    return index;
  }

  std::vector<Tri> tris_;
  std::vector<Node> nodes_;
  std::vector<int> order_;
};

/// three.js Vector3.normalize(): multiplyScalar(1 / (length || 1)).
Point3 normalizeThree(double x, double y, double z) {
  const double len = std::sqrt(x * x + y * y + z * z);
  const double inv = 1 / (len != 0 ? len : 1);
  return {x * inv, y * inv, z * inv};
}

}  // namespace

// --- relaxation ---------------------------------------------------------------------------------------------------------------------

RelaxLabelingResult relaxLabeling(const std::array<int, 3>& dims, int labelCount, const std::vector<double>& dataCost,
                                  const std::vector<std::int32_t>& initialLabels, double smoothnessWeight, int maxIterations) {
  RelaxLabelingResult result;
  result.labels = initialLabels;
  std::vector<double> neighborCounts(static_cast<std::size_t>(labelCount));
  for (int iteration = 0; iteration < maxIterations; ++iteration) {
    ++result.iterationsRun;
    bool changed = false;
    for (int z = 0; z < dims[2]; ++z)
      for (int y = 0; y < dims[1]; ++y)
        for (int x = 0; x < dims[0]; ++x) {
          const std::size_t v = voxelIndex(dims, x, y, z);
          std::fill(neighborCounts.begin(), neighborCounts.end(), 0.0);
          double neighborTotal = 0;
          const auto visit = [&](int nx, int ny, int nz) {
            if (nx < 0 || ny < 0 || nz < 0 || nx >= dims[0] || ny >= dims[1] || nz >= dims[2]) return;
            neighborCounts[static_cast<std::size_t>(result.labels[voxelIndex(dims, nx, ny, nz)])] += 1;
            neighborTotal += 1;
          };
          visit(x - 1, y, z); visit(x + 1, y, z); visit(x, y - 1, z); visit(x, y + 1, z); visit(x, y, z - 1); visit(x, y, z + 1);
          std::int32_t bestLabel = result.labels[v];
          double bestCost = INFINITY;
          for (int label = 0; label < labelCount; ++label) {
            const double mismatch = neighborTotal - neighborCounts[static_cast<std::size_t>(label)];
            const double cost = dataCost[v * static_cast<std::size_t>(labelCount) + static_cast<std::size_t>(label)] + smoothnessWeight * mismatch;
            if (cost < bestCost) { bestCost = cost; bestLabel = label; }
          }
          if (bestLabel != result.labels[v]) { result.labels[v] = bestLabel; changed = true; }
        }
    if (!changed) { result.converged = true; break; }
  }
  return result;
}

std::vector<std::int32_t> argminLabels(const std::vector<double>& dataCost, std::size_t voxelCount, int labelCount) {
  std::vector<std::int32_t> labels(voxelCount);
  for (std::size_t v = 0; v < voxelCount; ++v) {
    std::int32_t best = 0;
    double bestCost = INFINITY;
    for (int label = 0; label < labelCount; ++label) {
      const double cost = dataCost[v * static_cast<std::size_t>(labelCount) + static_cast<std::size_t>(label)];
      if (cost < bestCost) { bestCost = cost; best = label; }
    }
    labels[v] = best;
  }
  return labels;
}

// --- escape corridors --------------------------------------------------------------------------------------------------------------------

EscapeCorridorResult carveEscapeCorridors(const std::vector<std::int32_t>& labels, const std::array<int, 3>& dims,
                                          const std::vector<std::uint8_t>& isCavity, int labelCount) {
  const int sizeX = dims[0], sizeY = dims[1], sizeZ = dims[2];
  const std::size_t voxelCount = static_cast<std::size_t>(sizeX) * sizeY * sizeZ;
  EscapeCorridorResult result;
  result.labels = labels;
  for (int label = 0; label < labelCount; ++label) {
    bool touchesBoundary = false;
    std::vector<std::size_t> own;
    for (std::size_t v = 0; v < voxelCount; ++v) {
      if (result.labels[v] != label) continue;
      own.push_back(v);
      const int z = static_cast<int>(v / (static_cast<std::size_t>(sizeX) * sizeY));
      const int y = static_cast<int>((v % (static_cast<std::size_t>(sizeX) * sizeY)) / static_cast<std::size_t>(sizeX));
      const int x = static_cast<int>(v % static_cast<std::size_t>(sizeX));
      if (isOnGridBoundary(dims, x, y, z)) { touchesBoundary = true; break; }
    }
    if (touchesBoundary || own.empty()) continue;

    std::vector<std::uint8_t> visited(voxelCount, 0);
    std::vector<std::int64_t> parent(voxelCount, -1);
    std::vector<std::size_t> queue = own;
    for (std::size_t v : own) visited[v] = 1;
    std::int64_t boundaryHit = -1;
    for (std::size_t head = 0; head < queue.size(); ++head) {
      const std::size_t v = queue[head];
      const int z = static_cast<int>(v / (static_cast<std::size_t>(sizeX) * sizeY));
      const int y = static_cast<int>((v % (static_cast<std::size_t>(sizeX) * sizeY)) / static_cast<std::size_t>(sizeX));
      const int x = static_cast<int>(v % static_cast<std::size_t>(sizeX));
      if (result.labels[v] != label && isOnGridBoundary(dims, x, y, z)) { boundaryHit = static_cast<std::int64_t>(v); break; }
      const int neighbors[6][3] = {{x - 1, y, z}, {x + 1, y, z}, {x, y - 1, z}, {x, y + 1, z}, {x, y, z - 1}, {x, y, z + 1}};
      for (const auto& n : neighbors) {
        if (n[0] < 0 || n[1] < 0 || n[2] < 0 || n[0] >= sizeX || n[1] >= sizeY || n[2] >= sizeZ) continue;
        const std::size_t nv = voxelIndex(dims, n[0], n[1], n[2]);
        if (visited[nv] == 0 && isCavity[nv] == 1) {
          visited[nv] = 1;
          parent[nv] = static_cast<std::int64_t>(v);
          queue.push_back(nv);
        }
      }
    }
    if (boundaryHit == -1) { result.genuinelyUnreachablePieceLabels.push_back(label); continue; }
    std::int64_t cursor = boundaryHit;
    int carved = 0;
    while (cursor != -1 && result.labels[static_cast<std::size_t>(cursor)] != label) {
      result.labels[static_cast<std::size_t>(cursor)] = label;
      ++carved;
      cursor = parent[static_cast<std::size_t>(cursor)];
    }
    if (carved > 0) { ++result.corridorsCarved; result.totalCorridorVoxels += carved; }
  }
  return result;
}

// --- partition ----------------------------------------------------------------------------------------------------------------------------

MultiLabelPartitionResult buildMultiLabelPartitionSolids(IMeshGeometryEngine& engine, const MultiLabelPartitionInput& input, const CancellationToken& cancel) {
  const int labelCount = static_cast<int>(input.pieceTriangleIndices.size());
  if (labelCount < 2) throw std::runtime_error("multi-label partition needs at least two pieces.");
  std::vector<TriangleDistanceBvh> bvhs;
  for (const auto& triangles : input.pieceTriangleIndices) {
    if (triangles.empty()) throw std::runtime_error("multi-label partition piece has no triangles.");
    bvhs.emplace_back(*input.positions, *input.indices, triangles);
  }
  const Bounds3& bounds = input.bounds;
  const double voxel = input.voxelSizeMm;
  const int sizeX = std::max(1, static_cast<int>(std::ceil((bounds.max.x - bounds.min.x) / voxel)));
  const int sizeY = std::max(1, static_cast<int>(std::ceil((bounds.max.y - bounds.min.y) / voxel)));
  const int sizeZ = std::max(1, static_cast<int>(std::ceil((bounds.max.z - bounds.min.z) / voxel)));
  const std::array<int, 3> dims{sizeX, sizeY, sizeZ};
  const std::size_t voxelCount = static_cast<std::size_t>(sizeX) * sizeY * sizeZ;

  std::vector<double> dataCost(voxelCount * static_cast<std::size_t>(labelCount));
  for (int z = 0; z < sizeZ; ++z) {
    if (cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
    const double wz = bounds.min.z + (z + 0.5) * voxel;
    for (int y = 0; y < sizeY; ++y) {
      const double wy = bounds.min.y + (y + 0.5) * voxel;
      for (int x = 0; x < sizeX; ++x) {
        const double wx = bounds.min.x + (x + 0.5) * voxel;
        const std::size_t v = voxelIndex(dims, x, y, z);
        for (int label = 0; label < labelCount; ++label) dataCost[v * static_cast<std::size_t>(labelCount) + static_cast<std::size_t>(label)] = bvhs[static_cast<std::size_t>(label)].distance({wx, wy, wz});
      }
    }
  }

  const auto initial = argminLabels(dataCost, voxelCount, labelCount);
  const RelaxLabelingResult relaxed = relaxLabeling(dims, labelCount, dataCost, initial, input.smoothnessWeight, input.maxIterations);

  // Cavity vs solid part material, from the full source mesh (the union of every piece's triangles), by 3-ray parity vote.
  const RayBvh fullBvh(*input.positions, *input.indices);
  const Point3 rays[3] = {normalizeThree(1, std::sqrt(0.5), std::sqrt(3.0) / 3), normalizeThree(std::sqrt(2.0) / 5, 1, std::sqrt(5.0) / 7),
                          normalizeThree(std::sqrt(7.0) / 9, std::sqrt(3.0) / 4, 1)};
  std::vector<std::uint8_t> isCavity(voxelCount, 0);
  for (int z = 0; z < sizeZ; ++z) {
    if (cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
    const double wz = bounds.min.z + (z + 0.5) * voxel;
    for (int y = 0; y < sizeY; ++y) {
      const double wy = bounds.min.y + (y + 0.5) * voxel;
      for (int x = 0; x < sizeX; ++x) {
        const double wx = bounds.min.x + (x + 0.5) * voxel;
        int votes = 0;
        for (const Point3& dir : rays) if (fullBvh.countUniqueForwardIntersections({wx, wy, wz}, dir) % 2 == 1) ++votes;
        isCavity[voxelIndex(dims, x, y, z)] = votes > 3 / 2.0 ? 0 : 1;
      }
    }
  }
  const EscapeCorridorResult corridors = carveEscapeCorridors(relaxed.labels, dims, isCavity, labelCount);
  const std::vector<std::int32_t>& labels = corridors.labels;

  MultiLabelPartitionResult result;
  result.dims = dims;
  result.iterationsRun = relaxed.iterationsRun;
  result.converged = relaxed.converged;
  result.corridorsCarved = corridors.corridorsCarved;
  result.totalCorridorVoxels = corridors.totalCorridorVoxels;
  result.genuinelyUnreachablePieceLabels = corridors.genuinelyUnreachablePieceLabels;
  for (int label = 0; label < labelCount; ++label) {
    if (cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
    const auto sdf = [&](const Point3& p) {
      const int ix = std::min(sizeX - 1, std::max(0, static_cast<int>(std::floor((p.x - bounds.min.x) / voxel))));
      const int iy = std::min(sizeY - 1, std::max(0, static_cast<int>(std::floor((p.y - bounds.min.y) / voxel))));
      const int iz = std::min(sizeZ - 1, std::max(0, static_cast<int>(std::floor((p.z - bounds.min.z) / voxel))));
      return labels[voxelIndex(dims, ix, iy, iz)] == label ? 1.0 : -1.0;
    };
    SolidPtr solid = engine.levelSet(sdf, bounds, voxel, 0, -1);
    if (!solid->isValid()) throw std::runtime_error("Multi-label partition piece " + std::to_string(label) + " failed: invalid solid.");
    result.solids.push_back(std::move(solid));
  }
  return result;
}

}  // namespace craft
