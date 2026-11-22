// Development probe (not registered with CTest): runs the Master Mold preflight's pair loop on an STL and prints the first pairs it flags, so a
// "triangles intersect non-adjacent geometry" verdict can be inspected. Usage: probe_selfx part.stl
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <numeric>
#include <string>

#include "master/TriangleIntersection.h"
#include "stl/Stl.h"

using namespace craft;

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  if (std::string(argv[1]) == "--pair") {
    // The two coplanar wall triangles of a split quad: upper-left half and lower-right half, in the plane y = 0, `h` apart in height.
    for (double w : {0.001, 0.01, 0.05, 0.1, 0.39, 1.0, 4.0, 20.0}) {
      for (double h : {7.5, 1.0}) {
        const IntersectTriangle A{{0, 0, h}, {w, 0, 2 * h}, {0, 0, 2 * h}};
        const IntersectTriangle B{{0, 0, 0}, {w, 0, 0}, {w, 0, h}};
        std::printf("width %-6g height %-4g -> %s\n", w, h, trianglesIntersect(A, B) ? "INTERSECT" : "apart");
      }
    }
    {
      // The first pair the preflight flagged in gear_s.stl, exactly, then the same pair turned about the z axis.
      const double x1 = -29.87415, y1 = -2.74505, x2 = -29.83566, y2 = -3.13585;
      const IntersectTriangle A{{x1, y1, 7.5}, {x2, y2, 15}, {x1, y1, 15}};
      const IntersectTriangle B{{x1, y1, 0}, {x2, y2, 0}, {x2, y2, 7.5}};
      std::printf("as flagged: %s\n", trianglesIntersect(A, B) ? "INTERSECT" : "apart");
      for (int deg = 0; deg < 360; deg += 30) {
        const double c = std::cos(deg * 3.14159265358979 / 180), s = std::sin(deg * 3.14159265358979 / 180);
        const auto turn = [&](TriVec v) { return TriVec{v.x * c - v.y * s, v.x * s + v.y * c, v.z}; };
        const IntersectTriangle A2{turn(A.a), turn(A.b), turn(A.c)}, B2{turn(B.a), turn(B.b), turn(B.c)};
        std::printf("turned %3d deg: %s\n", deg, trianglesIntersect(A2, B2) ? "INTERSECT" : "apart");
      }
    }
    return 0;
  }
  const auto read = stl::readFile(argv[1]);
  const auto& p = read.soup.positions;
  const std::size_t n = p.size() / 9;
  std::vector<IntersectTriangle> tris(n);
  std::vector<double> lo(n), hi(n);
  for (std::size_t t = 0; t < n; ++t) {
    const float* q = &p[t * 9];
    tris[t] = {{q[0], q[1], q[2]}, {q[3], q[4], q[5]}, {q[6], q[7], q[8]}};
    lo[t] = std::min({q[0], q[3], q[6]});
    hi[t] = std::max({q[0], q[3], q[6]});
  }
  const auto same = [](const TriVec& a, const TriVec& b) { return a.x == b.x && a.y == b.y && a.z == b.z; };
  const auto shares = [&](std::size_t a, std::size_t b) {
    const TriVec* va[3] = {&tris[a].a, &tris[a].b, &tris[a].c};
    const TriVec* vb[3] = {&tris[b].a, &tris[b].b, &tris[b].c};
    for (auto* x : va) for (auto* y : vb) if (same(*x, *y)) return true;
    return false;
  };
  std::vector<std::size_t> order(n);
  std::iota(order.begin(), order.end(), 0);
  std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) { return lo[a] < lo[b]; });
  int flagged = 0, shown = 0;
  for (std::size_t i = 0; i < n; ++i)
    for (std::size_t j = i + 1; j < n && lo[order[j]] <= hi[order[i]] + 1e-6; ++j) {
      const std::size_t a = order[i], b = order[j];
      if (shares(a, b) || !trianglesIntersect(tris[a], tris[b])) continue;
      ++flagged;
      if (shown++ < 4) {
        const auto& A = tris[a]; const auto& B = tris[b];
        std::printf("pair %zu x %zu\n  A (%.5f %.5f %.5f) (%.5f %.5f %.5f) (%.5f %.5f %.5f)\n  B (%.5f %.5f %.5f) (%.5f %.5f %.5f) (%.5f %.5f %.5f)\n", a, b,
                    A.a.x, A.a.y, A.a.z, A.b.x, A.b.y, A.b.z, A.c.x, A.c.y, A.c.z, B.a.x, B.a.y, B.a.z, B.b.x, B.b.y, B.b.z, B.c.x, B.c.y, B.c.z);
      }
    }
  std::printf("%s: %zu triangles, %d flagged pairs (no x-range prefilter beyond sorting)\n", argv[1], n, flagged);
}

