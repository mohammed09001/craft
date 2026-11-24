#include "master/MasterCoverage.h"

#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <numbers>
#include <queue>

namespace craft {

namespace {

struct Grid {
  int n[3] = {0, 0, 0};
  double origin[3] = {0, 0, 0};
  double voxel = 1;
  std::size_t count() const { return static_cast<std::size_t>(n[0]) * static_cast<std::size_t>(n[1]) * static_cast<std::size_t>(n[2]); }
  std::size_t index(int x, int y, int z) const { return (static_cast<std::size_t>(z) * static_cast<std::size_t>(n[1]) + static_cast<std::size_t>(y)) * static_cast<std::size_t>(n[0]) + static_cast<std::size_t>(x); }
  double centre(int axis, int i) const { return origin[axis] + (i + 0.5) * voxel; }
};

void throwIfCancelled(const MasterMoldEngineHooks& hooks) {
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
}

/// Solid voxels: centre inside the product, found by filling between the crossings of each x-parallel line through a column of voxel centres.
std::vector<std::uint8_t> voxelise(const Grid& g, const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, const MasterMoldEngineHooks& hooks) {
  std::vector<std::vector<float>> crossings(static_cast<std::size_t>(g.n[1]) * static_cast<std::size_t>(g.n[2]));
  // Sample the lines a hair off the voxel centres so that a line never runs along an edge shared by two triangles (it would be counted twice).
  const double jitterY = 0.01234 * g.voxel, jitterZ = 0.00771 * g.voxel;
  const std::size_t tc = indices.size() / 3;
  for (std::size_t t = 0; t < tc; ++t) {
    if ((t & 0xFFFF) == 0) throwIfCancelled(hooks);
    double p[3][3];
    for (int k = 0; k < 3; ++k)
      for (int a = 0; a < 3; ++a) p[k][a] = positions[3 * indices[3 * t + static_cast<std::size_t>(k)] + static_cast<std::size_t>(a)];
    const double minY = std::min({p[0][1], p[1][1], p[2][1]}), maxY = std::max({p[0][1], p[1][1], p[2][1]});
    const double minZ = std::min({p[0][2], p[1][2], p[2][2]}), maxZ = std::max({p[0][2], p[1][2], p[2][2]});
    const int y0 = std::max(0, static_cast<int>(std::ceil((minY - jitterY - g.origin[1]) / g.voxel - 0.5))), y1 = std::min(g.n[1] - 1, static_cast<int>(std::floor((maxY - jitterY - g.origin[1]) / g.voxel - 0.5)));
    const int z0 = std::max(0, static_cast<int>(std::ceil((minZ - jitterZ - g.origin[2]) / g.voxel - 0.5))), z1 = std::min(g.n[2] - 1, static_cast<int>(std::floor((maxZ - jitterZ - g.origin[2]) / g.voxel - 0.5)));
    // Barycentric set-up in the yz plane.
    const double ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const double det = ay * bz - az * by;
    if (det == 0) continue;
    for (int z = z0; z <= z1; ++z)
      for (int y = y0; y <= y1; ++y) {
        const double qy = g.centre(1, y) + jitterY - p[0][1], qz = g.centre(2, z) + jitterZ - p[0][2];
        const double u = (qy * bz - qz * by) / det, v = (ay * qz - az * qy) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        crossings[static_cast<std::size_t>(z) * static_cast<std::size_t>(g.n[1]) + static_cast<std::size_t>(y)].push_back(static_cast<float>(p[0][0] + u * (p[1][0] - p[0][0]) + v * (p[2][0] - p[0][0])));
      }
  }
  std::vector<std::uint8_t> solid(g.count(), 0);
  for (int z = 0; z < g.n[2]; ++z)
    for (int y = 0; y < g.n[1]; ++y) {
      std::vector<float>& xs = crossings[static_cast<std::size_t>(z) * static_cast<std::size_t>(g.n[1]) + static_cast<std::size_t>(y)];
      std::sort(xs.begin(), xs.end());
      for (std::size_t i = 0; i + 1 < xs.size(); i += 2) {
        const int x0 = std::max(0, static_cast<int>(std::ceil((xs[i] - g.origin[0]) / g.voxel - 0.5)));
        const int x1 = std::min(g.n[0] - 1, static_cast<int>(std::floor((xs[i + 1] - g.origin[0]) / g.voxel - 0.5)));
        for (int x = x0; x <= x1; ++x) solid[g.index(x, y, z)] = 1;
      }
    }
  return solid;
}

/// Voxels whose ray along `d` leaves the grid without meeting a solid voxel, found layer by layer from the far end. The ray between two layers may pass
/// through either of the two voxels it lies between (in each of the other two axes), which leans the answer toward "free".
std::vector<std::uint8_t> freeAlong(const Grid& g, const std::vector<std::uint8_t>& solid, const std::array<double, 3>& d) {
  int major = 0;
  for (int a = 1; a < 3; ++a)
    if (std::fabs(d[static_cast<std::size_t>(a)]) > std::fabs(d[static_cast<std::size_t>(major)])) major = a;
  const int minorA = (major + 1) % 3, minorB = (major + 2) % 3;
  const int sign = d[static_cast<std::size_t>(major)] > 0 ? 1 : -1;
  const double slopeA = d[static_cast<std::size_t>(minorA)] / std::fabs(d[static_cast<std::size_t>(major)]), slopeB = d[static_cast<std::size_t>(minorB)] / std::fabs(d[static_cast<std::size_t>(major)]);
  const int offA[2] = {static_cast<int>(std::floor(slopeA)), static_cast<int>(std::ceil(slopeA))}, offB[2] = {static_cast<int>(std::floor(slopeB)), static_cast<int>(std::ceil(slopeB))};
  const int countA = offA[0] == offA[1] ? 1 : 2, countB = offB[0] == offB[1] ? 1 : 2;
  std::vector<std::uint8_t> freeVox(g.count(), 0);
  const int start = sign > 0 ? g.n[major] - 1 : 0, stop = sign > 0 ? -1 : g.n[major];
  for (int k = start; k != stop; k -= sign) {
    for (int b = 0; b < g.n[minorB]; ++b)
      for (int a = 0; a < g.n[minorA]; ++a) {
        int c[3];
        c[major] = k;
        c[minorA] = a;
        c[minorB] = b;
        const std::size_t here = g.index(c[0], c[1], c[2]);
        if (solid[here]) continue;
        const int nk = k + sign;
        bool freeRay = nk < 0 || nk >= g.n[major];
        for (int ia = 0; ia < countA && !freeRay; ++ia)
          for (int ib = 0; ib < countB && !freeRay; ++ib) {
            const int na = a + offA[ia], nb = b + offB[ib];
            if (na < 0 || na >= g.n[minorA] || nb < 0 || nb >= g.n[minorB]) { freeRay = true; break; }  // slipped out of the grid sideways: escaped
            int n[3];
            n[major] = nk;
            n[minorA] = na;
            n[minorB] = nb;
            if (freeVox[g.index(n[0], n[1], n[2])]) freeRay = true;
          }
        if (freeRay) freeVox[here] = 1;
      }
  }
  return freeVox;
}

}  // namespace

CoverageAnalysis analyzeTwoDirectionCoverage(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, double margin, int resolution, int directions,
                                             const MasterMoldEngineHooks& hooks) {
  CoverageAnalysis out;
  if (indices.empty() || positions.empty() || resolution < 8) return out;
  Bounds3 b = emptyBounds();
  for (std::size_t i = 0; i + 2 < positions.size(); i += 3)
    for (int a = 0; a < 3; ++a) {
      b.min[a] = std::min(b.min[a], static_cast<double>(positions[i + static_cast<std::size_t>(a)]));
      b.max[a] = std::max(b.max[a], static_cast<double>(positions[i + static_cast<std::size_t>(a)]));
    }
  Grid g;
  const double longest = std::max({b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z}) + 2 * margin;
  g.voxel = longest / resolution;
  for (int a = 0; a < 3; ++a) {
    g.origin[a] = b.min[a] - margin;
    g.n[a] = std::max(1, static_cast<int>(std::ceil((b.max[a] - b.min[a] + 2 * margin) / g.voxel)));
  }
  out.voxelMm = g.voxel;

  const std::vector<std::uint8_t> solid = voxelise(g, positions, indices, hooks);
  const std::size_t total = g.count();
  const std::size_t words = (total + 63) / 64;
  std::vector<std::uint64_t> mold(words, 0);
  std::size_t moldCount = 0;
  for (std::size_t v = 0; v < total; ++v)
    if (!solid[v]) {
      mold[v >> 6] |= std::uint64_t{1} << (v & 63);
      ++moldCount;
    }
  const double voxelVolume = g.voxel * g.voxel * g.voxel;
  out.moldVolumeMm3 = static_cast<double>(moldCount) * voxelVolume;

  // Directions: half a Fibonacci sphere and the opposite of each, so every direction has its antipode in the list.
  const int half = std::max(2, directions / 2);
  std::vector<std::array<double, 3>> dirs;
  for (int i = 0; i < half; ++i) {
    const double z = 1.0 - (i + 0.5) / half;  // upper hemisphere, z in (0, 1]
    const double r = std::sqrt(std::max(0.0, 1 - z * z));
    const double phi = std::numbers::pi * (3.0 - std::sqrt(5.0)) * i;
    dirs.push_back({r * std::cos(phi), r * std::sin(phi), z});
  }
  for (int i = 0; i < half; ++i) dirs.push_back({-dirs[static_cast<std::size_t>(i)][0], -dirs[static_cast<std::size_t>(i)][1], -dirs[static_cast<std::size_t>(i)][2]});
  dirs.push_back({1, 0, 0});
  dirs.push_back({-1, 0, 0});
  dirs.push_back({0, 1, 0});
  dirs.push_back({0, -1, 0});
  dirs.push_back({0, 0, 1});
  dirs.push_back({0, 0, -1});
  out.directions = static_cast<int>(dirs.size());

  // blockedMold[d] = mold voxels with no free ray along dirs[d].
  std::vector<std::vector<std::uint64_t>> blocked(dirs.size(), std::vector<std::uint64_t>(words, 0));
  for (std::size_t d = 0; d < dirs.size(); ++d) {
    throwIfCancelled(hooks);
    const std::vector<std::uint8_t> freeVox = freeAlong(g, solid, dirs[d]);
    for (std::size_t v = 0; v < total; ++v)
      if (!solid[v] && !freeVox[v]) blocked[d][v >> 6] |= std::uint64_t{1} << (v & 63);
  }

  const auto popcount = [&](const std::vector<std::uint64_t>& x, const std::vector<std::uint64_t>& y) {
    std::uint64_t n = 0;
    for (std::size_t w = 0; w < words; ++w) n += static_cast<std::uint64_t>(std::popcount(x[w] & y[w]));
    return n;
  };
  std::uint64_t bestCount = ~std::uint64_t{0}, bestOpposing = ~std::uint64_t{0};
  std::size_t bestA = 0, bestB = 0, oppA = 0, oppB = 0;
  for (std::size_t a = 0; a < dirs.size(); ++a) {
    throwIfCancelled(hooks);
    for (std::size_t c = a; c < dirs.size(); ++c) {
      const std::uint64_t n = popcount(blocked[a], blocked[c]);
      ++out.pairs;
      if (n < bestCount) { bestCount = n; bestA = a; bestB = c; }
      const double dotp = dirs[a][0] * dirs[c][0] + dirs[a][1] * dirs[c][1] + dirs[a][2] * dirs[c][2];
      if (dotp < -0.999 && n < bestOpposing) { bestOpposing = n; oppA = a; oppB = c; }
    }
  }
  const auto fill = [&](DirectionPairCoverage& p, std::size_t a, std::size_t c, std::uint64_t n) {
    p.first = {dirs[a][0], dirs[a][1], dirs[a][2]};
    p.second = {dirs[c][0], dirs[c][1], dirs[c][2]};
    p.trappedMm3 = static_cast<double>(n) * voxelVolume;
    p.trappedFraction = moldCount > 0 ? static_cast<double>(n) / static_cast<double>(moldCount) : 0;
  };
  fill(out.best, bestA, bestB, bestCount);
  if (bestOpposing != ~std::uint64_t{0}) fill(out.bestOpposing, oppA, oppB, bestOpposing);

  // The least-trapped opposite pairs, distinct axes only.
  {
    std::vector<std::pair<std::uint64_t, std::size_t>> ranked;
    for (std::size_t a = 0; a < dirs.size(); ++a)
      for (std::size_t c = a + 1; c < dirs.size(); ++c)
        if (dirs[a][0] * dirs[c][0] + dirs[a][1] * dirs[c][1] + dirs[a][2] * dirs[c][2] < -0.999) ranked.push_back({popcount(blocked[a], blocked[c]), a * dirs.size() + c});
    std::sort(ranked.begin(), ranked.end());
    for (const auto& [n, packed] : ranked) {
      if (out.opposing.size() >= 12) break;
      const std::size_t a = packed / dirs.size(), c = packed % dirs.size();
      bool near = false;
      for (const DirectionPairCoverage& o : out.opposing) {
        const double d = std::fabs(o.first.x * dirs[a][0] + o.first.y * dirs[a][1] + o.first.z * dirs[a][2]);
        if (d > std::cos(4.0 * std::numbers::pi / 180)) near = true;
      }
      if (near) continue;
      DirectionPairCoverage p;
      fill(p, a, c, n);
      out.opposing.push_back(p);
    }
  }
  // The pockets of the best pair: how many separate regions are trapped, how big the largest is, and where.
  std::vector<std::uint8_t> trapped(total, 0);
  for (std::size_t w = 0; w < words; ++w) {
    std::uint64_t bits = blocked[bestA][w] & blocked[bestB][w];
    while (bits) {
      const int bit = std::countr_zero(bits);
      trapped[(w << 6) + static_cast<std::size_t>(bit)] = 1;
      bits &= bits - 1;
    }
  }
  out.trappedBounds = emptyBounds();
  double sum[3] = {0, 0, 0};
  std::size_t trappedCount = 0;
  std::vector<std::uint8_t> seen(total, 0);
  std::size_t largest = 0;
  for (int z = 0; z < g.n[2]; ++z)
    for (int y = 0; y < g.n[1]; ++y)
      for (int x = 0; x < g.n[0]; ++x) {
        const std::size_t v = g.index(x, y, z);
        if (!trapped[v]) continue;
        ++trappedCount;
        const double centre[3] = {g.centre(0, x), g.centre(1, y), g.centre(2, z)};
        for (int a = 0; a < 3; ++a) {
          sum[a] += centre[a];
          out.trappedBounds.min[a] = std::min(out.trappedBounds.min[a], centre[a]);
          out.trappedBounds.max[a] = std::max(out.trappedBounds.max[a], centre[a]);
        }
        if (seen[v]) continue;
        ++out.trappedComponents;
        std::size_t size = 0;
        std::queue<std::array<int, 3>> open;
        open.push({x, y, z});
        seen[v] = 1;
        while (!open.empty()) {
          const auto c = open.front();
          open.pop();
          ++size;
          const int steps[6][3] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
          for (const auto& s : steps) {
            const int nx = c[0] + s[0], ny = c[1] + s[1], nz = c[2] + s[2];
            if (nx < 0 || ny < 0 || nz < 0 || nx >= g.n[0] || ny >= g.n[1] || nz >= g.n[2]) continue;
            const std::size_t nv = g.index(nx, ny, nz);
            if (!trapped[nv] || seen[nv]) continue;
            seen[nv] = 1;
            open.push({nx, ny, nz});
          }
        }
        largest = std::max(largest, size);
      }
  out.largestPocketMm3 = static_cast<double>(largest) * voxelVolume;
  if (trappedCount > 0) out.trappedCentroid = {sum[0] / static_cast<double>(trappedCount), sum[1] / static_cast<double>(trappedCount), sum[2] / static_cast<double>(trappedCount)};
  out.ran = true;
  return out;
}

}  // namespace craft
