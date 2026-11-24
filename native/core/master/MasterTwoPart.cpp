#include "master/MasterTwoPart.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <numeric>
#include <tuple>

#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "master/MasterCoverage.h"
#include "master/MasterPlanning.h"

namespace craft {

namespace {

using V3 = std::array<double, 3>;

constexpr double kPi = 3.14159265358979323846;
constexpr double kInf = std::numeric_limits<double>::infinity();

std::string fmt(double v);
double meshArea(const MeshPayload& m);
MeshPayload exportMesh(IMeshGeometryEngine& engine, const SolidPtr& solid, const char* operation);

V3 sub(const V3& a, const V3& b) { return {a[0] - b[0], a[1] - b[1], a[2] - b[2]}; }
V3 cross(const V3& a, const V3& b) { return {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]}; }
double dot(const V3& a, const V3& b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
double norm(const V3& a) { return std::sqrt(dot(a, a)); }
V3 scaled(const V3& a, double s) { return {a[0] * s, a[1] * s, a[2] * s}; }
V3 unit(const V3& a) {
  const double n = norm(a);
  return n > 0 ? scaled(a, 1.0 / n) : V3{0, 0, 1};
}
V3 toV3(const Point3& p) { return {p.x, p.y, p.z}; }
Point3 toPoint(const V3& v) { return {v[0], v[1], v[2]}; }

// --- rigid frames ----------------------------------------------------------------------------------------------------------------------------

/// Proper rotation whose rows are (e1, e2, u): it maps the release axis u onto +Z.
struct Frame {
  V3 row[3];
  V3 apply(const V3& p) const { return {dot(row[0], p), dot(row[1], p), dot(row[2], p)}; }
  V3 inverse(const V3& p) const {
    return {row[0][0] * p[0] + row[1][0] * p[1] + row[2][0] * p[2], row[0][1] * p[0] + row[1][1] * p[1] + row[2][1] * p[2],
            row[0][2] * p[0] + row[1][2] * p[1] + row[2][2] * p[2]};
  }
};

Frame frameForAxis(const V3& axis) {
  const V3 u = unit(axis);
  const V3 helper = std::fabs(u[0]) < 0.9 ? V3{1, 0, 0} : V3{0, 1, 0};
  const V3 e1 = unit(sub(helper, scaled(u, dot(helper, u))));
  const V3 e2 = cross(u, e1);
  return {{e1, e2, u}};
}

/// Column-major 3x4 affine matrix: three linear columns, then the translation.
struct Affine {
  std::array<double, 12> m{1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0};
  V3 apply(const V3& p) const {
    return {m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9], m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10], m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11]};
  }
};

Affine fromFrame(const Frame& f) {
  Affine a;
  for (int col = 0; col < 3; ++col)
    for (int r = 0; r < 3; ++r) a.m[static_cast<std::size_t>(col * 3 + r)] = f.row[r][col];
  return a;
}

/// outer o inner (inner applied first).
Affine compose(const Affine& outer, const Affine& inner) {
  Affine out;
  for (int col = 0; col < 3; ++col) {
    const V3 c{inner.m[static_cast<std::size_t>(col * 3)], inner.m[static_cast<std::size_t>(col * 3 + 1)], inner.m[static_cast<std::size_t>(col * 3 + 2)]};
    for (int r = 0; r < 3; ++r) out.m[static_cast<std::size_t>(col * 3 + r)] = outer.m[static_cast<std::size_t>(r)] * c[0] + outer.m[static_cast<std::size_t>(3 + r)] * c[1] + outer.m[static_cast<std::size_t>(6 + r)] * c[2];
  }
  const V3 t = outer.apply({inner.m[9], inner.m[10], inner.m[11]});
  out.m[9] = t[0];
  out.m[10] = t[1];
  out.m[11] = t[2];
  return out;
}

std::array<double, 16> toColumnMajor4(const Affine& a) {
  return {a.m[0], a.m[1], a.m[2], 0, a.m[3], a.m[4], a.m[5], 0, a.m[6], a.m[7], a.m[8], 0, a.m[9], a.m[10], a.m[11], 1};
}

// --- triangle data -----------------------------------------------------------------------------------------------------------------------------

struct TriSet {
  std::vector<double> v;  // 9 per triangle
  std::vector<double> n;  // 3 per triangle, unit; (0,0,0) for a degenerate triangle
  std::size_t count() const { return n.size() / 3; }
};

TriSet buildTriSet(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices) {
  TriSet t;
  const std::size_t tc = indices.size() / 3;
  t.v.resize(tc * 9);
  t.n.assign(tc * 3, 0.0);
  for (std::size_t i = 0; i < tc; ++i) {
    V3 p[3];
    for (int k = 0; k < 3; ++k) {
      const std::size_t vi = indices[3 * i + static_cast<std::size_t>(k)];
      p[k] = {positions[3 * vi], positions[3 * vi + 1], positions[3 * vi + 2]};
      for (int a = 0; a < 3; ++a) t.v[i * 9 + static_cast<std::size_t>(3 * k + a)] = p[k][static_cast<std::size_t>(a)];
    }
    const V3 c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const double len = norm(c);
    if (len > 0 && std::isfinite(len)) {
      t.n[3 * i] = c[0] / len;
      t.n[3 * i + 1] = c[1] / len;
      t.n[3 * i + 2] = c[2] / len;
    }
  }
  return t;
}

/// Resolution of the input itself: STL vertices are float32, so a face plane is known only to about one part in 1.7e7 of its coordinate magnitude, and
/// rotating into another frame spreads that over a few operations. 2e-7 of the largest coordinate (about 12x the observed spread) is the finest
/// distance at which two faces can be told apart; it is not a clearance and it never hides an overlap larger than the input's own rounding.
double inputResolution(const TriSet& t) {
  double maxAbs = 0;
  for (const double c : t.v) maxAbs = std::max(maxAbs, std::fabs(c));
  return 2e-7 * std::max(maxAbs, 1e-3);
}

struct AxisScan {
  double minProj = kInf, maxProj = -kInf;
  double lower = -kInf;  // highest projection of any face opposing half A's pull (facing -u)
  double upper = kInf;   // lowest projection of any face opposing half B's pull (facing +u)
};

AxisScan scanAxis(const TriSet& t, const V3& u, double sine) {
  AxisScan s;
  const std::size_t tc = t.count();
  for (std::size_t i = 0; i < tc; ++i) {
    const double p0 = t.v[i * 9] * u[0] + t.v[i * 9 + 1] * u[1] + t.v[i * 9 + 2] * u[2];
    const double p1 = t.v[i * 9 + 3] * u[0] + t.v[i * 9 + 4] * u[1] + t.v[i * 9 + 5] * u[2];
    const double p2 = t.v[i * 9 + 6] * u[0] + t.v[i * 9 + 7] * u[1] + t.v[i * 9 + 8] * u[2];
    const double lo = std::min({p0, p1, p2}), hi = std::max({p0, p1, p2});
    s.minProj = std::min(s.minProj, lo);
    s.maxProj = std::max(s.maxProj, hi);
    const double nu = t.n[3 * i] * u[0] + t.n[3 * i + 1] * u[1] + t.n[3 * i + 2] * u[2];
    if (nu < -sine) s.lower = std::max(s.lower, hi);
    else if (nu > sine) s.upper = std::min(s.upper, lo);
  }
  return s;
}

PlanarAxisEvaluation evaluateFromScan(const AxisScan& s, const V3& u, double planeTol) {
  PlanarAxisEvaluation e;
  e.axis = toPoint(u);
  e.minProjectionMm = s.minProj;
  e.maxProjectionMm = s.maxProj;
  e.lowerMm = std::max(s.lower, s.minProj);
  e.upperMm = std::min(s.upper, s.maxProj);
  e.widthMm = e.upperMm - e.lowerMm;
  e.feasible = e.widthMm >= -planeTol;
  return e;
}

// --- candidate axes --------------------------------------------------------------------------------------------------------------------------

struct AxisCandidate {
  V3 u;
  PlanarAxisEvaluation e;
  int order = 0;
};

void addAxis(std::vector<V3>& axes, const V3& raw) {
  if (norm(raw) < 1e-12 || !std::isfinite(norm(raw))) return;
  const V3 u = unit(raw);
  for (const V3& a : axes)
    if (std::fabs(dot(a, u)) > 0.99966) return;  // within 1.5 degrees of an axis already listed (either sense)
  axes.push_back(u);
}

std::vector<V3> candidateAxes(const TriSet& t, const std::vector<float>& positions) {
  std::vector<V3> axes;
  addAxis(axes, {0, 0, 1});
  addAxis(axes, {0, 1, 0});
  addAxis(axes, {1, 0, 0});

  // Principal axes of the vertex cloud.
  const std::size_t vc = positions.size() / 3;
  if (vc > 0) {
    V3 mean{0, 0, 0};
    for (std::size_t i = 0; i < vc; ++i)
      for (int a = 0; a < 3; ++a) mean[static_cast<std::size_t>(a)] += positions[3 * i + static_cast<std::size_t>(a)] / static_cast<double>(vc);
    std::array<double, 9> cov{};
    for (std::size_t i = 0; i < vc; ++i) {
      const V3 d{positions[3 * i] - mean[0], positions[3 * i + 1] - mean[1], positions[3 * i + 2] - mean[2]};
      for (int r = 0; r < 3; ++r)
        for (int c = 0; c < 3; ++c) cov[static_cast<std::size_t>(r * 3 + c)] += d[static_cast<std::size_t>(r)] * d[static_cast<std::size_t>(c)] / static_cast<double>(vc);
    }
    for (const Point3& p : principalAxesOfCovariance(cov)) addAxis(axes, toV3(p));
  }

  // Dominant face normals (area-weighted, 3 degree cells): flat faces are the natural seam-parallel directions.
  std::map<std::tuple<int, int, int>, std::pair<double, V3>> cells;
  for (std::size_t i = 0; i < t.count(); ++i) {
    V3 n{t.n[3 * i], t.n[3 * i + 1], t.n[3 * i + 2]};
    if (norm(n) == 0) continue;
    const V3 a{t.v[i * 9], t.v[i * 9 + 1], t.v[i * 9 + 2]}, b{t.v[i * 9 + 3], t.v[i * 9 + 4], t.v[i * 9 + 5]}, c{t.v[i * 9 + 6], t.v[i * 9 + 7], t.v[i * 9 + 8]};
    const double area = 0.5 * norm(cross(sub(b, a), sub(c, a)));
    if (n[2] < 0 || (n[2] == 0 && (n[1] < 0 || (n[1] == 0 && n[0] < 0)))) n = scaled(n, -1);
    const auto key = std::make_tuple(static_cast<int>(std::lround(n[0] * 30)), static_cast<int>(std::lround(n[1] * 30)), static_cast<int>(std::lround(n[2] * 30)));
    auto& cell = cells[key];
    cell.first += area;
    for (int k = 0; k < 3; ++k) cell.second[static_cast<std::size_t>(k)] += n[static_cast<std::size_t>(k)] * area;
  }
  std::vector<std::pair<double, V3>> ranked;
  for (const auto& [key, cell] : cells) ranked.push_back(cell);
  std::stable_sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) { return a.first > b.first; });
  for (std::size_t i = 0; i < ranked.size() && i < 8; ++i) addAxis(axes, ranked[i].second);

  // Fibonacci hemisphere.
  constexpr int kSphere = 320;
  for (int i = 0; i < kSphere; ++i) {
    const double z = 1.0 - 2.0 * (i + 0.5) / kSphere;
    if (z < 0) break;
    const double r = std::sqrt(std::max(0.0, 1 - z * z));
    const double phi = kPi * (3.0 - std::sqrt(5.0)) * i;
    addAxis(axes, {r * std::cos(phi), r * std::sin(phi), z});
  }
  return axes;
}

/// Pattern search around a promising axis: widen the seam interval by small rotations. Deterministic and bounded.
AxisCandidate refineAxis(const TriSet& t, AxisCandidate best, double sine, double planeTol) {
  double step = 3.0 * kPi / 180.0;
  int evaluations = 0;
  while (step > 0.04 * kPi / 180.0 && evaluations < 120) {
    const Frame f = frameForAxis(best.u);
    bool improved = false;
    for (int k = 0; k < 4 && evaluations < 120; ++k) {
      const double dx = (k == 0 ? step : k == 1 ? -step : 0), dy = (k == 2 ? step : k == 3 ? -step : 0);
      const V3 cand = unit({best.u[0] + f.row[0][0] * std::tan(dx) + f.row[1][0] * std::tan(dy), best.u[1] + f.row[0][1] * std::tan(dx) + f.row[1][1] * std::tan(dy),
                            best.u[2] + f.row[0][2] * std::tan(dx) + f.row[1][2] * std::tan(dy)});
      ++evaluations;
      const PlanarAxisEvaluation e = evaluateFromScan(scanAxis(t, cand, sine), cand, planeTol);
      if (e.widthMm > best.e.widthMm + 1e-12) {
        best.u = cand;
        best.e = e;
        improved = true;
        break;
      }
    }
    if (!improved) step *= 0.5;
  }
  return best;
}

// --- sweep verification ---------------------------------------------------------------------------------------------------------------------

struct SweepOutcome {
  MasterVerification verification = MasterVerification::Verified;
  int opposingFaces = 0;
  double slidingAreaMm2 = 0;
  double overlapMm3 = 0;
  double filmContactMm3 = 0;  // overlap that is only a film no thicker than the kernel resolution: contact, reported but not counted
  std::string note;
};

MeshPayload prismMesh(const V3& a, const V3& b, const V3& c, const V3& shift) {
  MeshPayload m;
  const V3 pts[6] = {a, b, c, {a[0] + shift[0], a[1] + shift[1], a[2] + shift[2]}, {b[0] + shift[0], b[1] + shift[1], b[2] + shift[2]},
                     {c[0] + shift[0], c[1] + shift[1], c[2] + shift[2]}};
  for (const V3& p : pts) m.positions.insert(m.positions.end(), p.begin(), p.end());
  m.indices = {0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0};
  if (analyzeSolidBody(m).volumeMm3 < 0)
    for (std::size_t i = 0; i < m.indices.size(); i += 3) std::swap(m.indices[i + 1], m.indices[i + 2]);
  return m;
}

/// Continuous collision test of `moving` translating along dz * (0,0,1) (dz = +1 or -1) until it is clear of everything, against fixed obstacle
/// meshes. A body S sliding by d can only run into an obstacle through an obstacle face whose outward normal opposes d: the point of S that meets
/// it travels along d through the open side of that face. So the swept volume reaching that face is S intersected with the face extruded back
/// along -d. Faces that do not oppose the motion cannot be run into, and faces parallel to it only slide (zero-draft contact, reported).
SweepOutcome verifySweep(IMeshGeometryEngine& engine, const SolidPtr& moving, const MeshPayload& movingMesh, double dz, const std::vector<const MeshPayload*>& obstacles,
                         const MasterProcessProfile& profile, double toleranceMm, double reachMm) {
  SweepOutcome out;
  const Bounds3 mb = moving->bounds();
  const double sMin = dz > 0 ? mb.min.z : -mb.max.z;
  const double sMax = dz > 0 ? mb.max.z : -mb.min.z;
  struct Face { V3 a, b, c; double tMax; double nd; };
  std::vector<Face> faces;

  // Column map of the moving body: for each footprint cell, the lowest (trailing) point of its material along the motion. An obstacle face can only be
  // reached if some column under its footprint holds material behind it; this discards the many faces that merely sit inside the body's bounding box.
  constexpr int kCells = 256;
  const double cellW = std::max(1e-9, (mb.max.x - mb.min.x) / kCells), cellH = std::max(1e-9, (mb.max.y - mb.min.y) / kCells);
  std::vector<double> colMin(static_cast<std::size_t>(kCells) * kCells, kInf);
  const auto cellRange = [&](double lo0, double hi0, double lo1, double hi1, int& i0, int& i1, int& j0, int& j1) {
    i0 = std::clamp(static_cast<int>(std::floor((lo0 - mb.min.x) / cellW)), 0, kCells - 1);
    i1 = std::clamp(static_cast<int>(std::floor((hi0 - mb.min.x) / cellW)), 0, kCells - 1);
    j0 = std::clamp(static_cast<int>(std::floor((lo1 - mb.min.y) / cellH)), 0, kCells - 1);
    j1 = std::clamp(static_cast<int>(std::floor((hi1 - mb.min.y) / cellH)), 0, kCells - 1);
  };
  for (std::size_t i = 0; i < movingMesh.triangleCount(); ++i) {
    double lo[2] = {kInf, kInf}, hi[2] = {-kInf, -kInf}, tLow = kInf;
    for (int k = 0; k < 3; ++k) {
      const std::size_t vi = movingMesh.indices[3 * i + static_cast<std::size_t>(k)];
      tLow = std::min(tLow, dz * movingMesh.positions[3 * vi + 2]);
      for (int a = 0; a < 2; ++a) {
        lo[a] = std::min(lo[a], movingMesh.positions[3 * vi + static_cast<std::size_t>(a)]);
        hi[a] = std::max(hi[a], movingMesh.positions[3 * vi + static_cast<std::size_t>(a)]);
      }
    }
    int i0, i1, j0, j1;
    cellRange(lo[0], hi[0], lo[1], hi[1], i0, i1, j0, j1);
    for (int a = i0; a <= i1; ++a)
      for (int b = j0; b <= j1; ++b) colMin[static_cast<std::size_t>(a * kCells + b)] = std::min(colMin[static_cast<std::size_t>(a * kCells + b)], tLow);
  }
  for (const MeshPayload* mesh : obstacles) {
    const std::size_t tc = mesh->triangleCount();
    for (std::size_t i = 0; i < tc; ++i) {
      V3 p[3];
      double lo[2] = {kInf, kInf}, hi[2] = {-kInf, -kInf};
      double tMax = -kInf, tMin = kInf;
      for (int k = 0; k < 3; ++k) {
        const std::size_t vi = mesh->indices[3 * i + static_cast<std::size_t>(k)];
        p[k] = {mesh->positions[3 * vi], mesh->positions[3 * vi + 1], mesh->positions[3 * vi + 2]};
        tMax = std::max(tMax, dz * p[k][2]);
        tMin = std::min(tMin, dz * p[k][2]);
        for (int a = 0; a < 2; ++a) {
          lo[a] = std::min(lo[a], p[k][static_cast<std::size_t>(a)]);
          hi[a] = std::max(hi[a], p[k][static_cast<std::size_t>(a)]);
        }
      }
      const V3 cr = cross(sub(p[1], p[0]), sub(p[2], p[0]));
      const double len = norm(cr);
      if (!(len > 0) || !std::isfinite(len)) continue;
      if (tMax <= sMin + reachMm) continue;                    // lies entirely behind the moving body's trailing end: can never be reached
      if (lo[0] > mb.max.x || hi[0] < mb.min.x || lo[1] > mb.max.y || hi[1] < mb.min.y) continue;  // outside its footprint
      const double nd = dz * cr[2] / len;
      if (nd < -profile.slidingSine) {
        int i0, i1, j0, j1;
        cellRange(lo[0], hi[0], lo[1], hi[1], i0, i1, j0, j1);
        bool reachable = false;
        for (int a = i0; a <= i1 && !reachable; ++a)
          for (int b = j0; b <= j1; ++b)
            if (colMin[static_cast<std::size_t>(a * kCells + b)] < tMax - reachMm) { reachable = true; break; }
        if (!reachable) continue;
        faces.push_back({p[0], p[1], p[2], tMax, nd});
      } else if (std::fabs(nd) <= profile.slidingSine && tMin < sMax) {
        out.slidingAreaMm2 += 0.5 * len;
      }
    }
  }
  out.opposingFaces = static_cast<int>(faces.size());
  if (faces.empty()) return out;
  if (static_cast<int>(faces.size()) > profile.maxSweepPrisms) {
    out.verification = MasterVerification::Unverified;
    double lowReach = kInf, highReach = -kInf;
    for (const Face& f : faces) {
      lowReach = std::min(lowReach, f.tMax - sMin);
      highReach = std::max(highReach, f.tMax - sMin);
    }
    out.note = std::to_string(faces.size()) + " opposing faces exceed the sweep budget of " + std::to_string(profile.maxSweepPrisms) +
               " (they reach " + fmt(lowReach) + " to " + fmt(highReach) + " mm past the moving body's trailing end); the release is not certified.";
    return out;
  }
  try {
    std::vector<SolidPtr> chunkUnions;
    std::vector<SolidPtr> chunk;
    const auto flush = [&] {
      if (chunk.empty()) return;
      chunkUnions.push_back(chunk.size() == 1 ? chunk[0] : engine.unionOf(chunk));
      chunk.clear();
    };
    for (const Face& f : faces) {
      const double length = (f.tMax - sMin) + 1.0;
      chunk.push_back(engine.solidFromMesh(prismMesh(f.a, f.b, f.c, {0, 0, -dz * length}), toleranceMm, "Sweep prism"));
      if (chunk.size() >= 256) flush();
    }
    flush();
    const SolidPtr swept = chunkUnions.size() == 1 ? chunkUnions[0] : engine.unionOf(chunkUnions);
    const SolidPtr overlap = engine.intersect(moving, swept);
    out.overlapMm3 = overlap->isEmpty() ? 0.0 : overlap->volume();
    if (out.overlapMm3 <= profile.clearVolumeMm3) return out;
    // An overlap that is only a film no thicker than the kernel's own resolution laid over a face (a peg standing in a pit of the same radius, a wall sliding
    // along a wall) is contact, not interference: a skin of thickness t over area A has volume about t * A / 2, so t = 2 V / A of the overlap solid itself.
    // A real hook or lip is a lump, not a film, and keeps its thickness however small its volume.
    {
      const double area = meshArea(exportMesh(engine, overlap, "Sweep overlap"));
      const double thickness = area > 0 ? 2 * out.overlapMm3 / area : 0.0;
      if (thickness <= 2 * toleranceMm) {
        out.filmContactMm3 = out.overlapMm3;
        out.overlapMm3 = 0;
        return out;
      }
    }
    const Bounds3 ob = overlap->bounds();
    // The opposing face closest to the motion direction is the likeliest culprit of a sliver-sized overlap: say where it is and how steep.
    const Face* flattest = &faces.front();
    for (const Face& f : faces) if (f.nd > flattest->nd) flattest = &f;
    char buf[420];
    std::snprintf(buf, sizeof buf, "swept overlap %.6g mm^3 near (%.3f, %.3f, %.3f) from %d opposing face(s); the most nearly parallel one has sin(angle) %.3g at (%.3f, %.3f, %.3f).", out.overlapMm3, 0.5 * (ob.min.x + ob.max.x),
                  0.5 * (ob.min.y + ob.max.y), 0.5 * (ob.min.z + ob.max.z), out.opposingFaces, flattest->nd, (flattest->a[0] + flattest->b[0] + flattest->c[0]) / 3, (flattest->a[1] + flattest->b[1] + flattest->c[1]) / 3, (flattest->a[2] + flattest->b[2] + flattest->c[2]) / 3);
    out.note = buf;
    out.verification = out.overlapMm3 >= profile.blockedVolumeMm3 ? MasterVerification::Blocked : MasterVerification::Unverified;
  } catch (const CodedError& error) {
    if (error.code() == "cancelled") throw;
    out.verification = MasterVerification::Unverified;
    out.note = std::string("the sweep could not be evaluated by the kernel: ") + error.what();
  } catch (const std::exception& error) {
    out.verification = MasterVerification::Unverified;
    out.note = std::string("the sweep could not be evaluated by the kernel: ") + error.what();
  }
  return out;
}

// --- helpers ------------------------------------------------------------------------------------------------------------------------------------

double meshArea(const MeshPayload& m) {
  double area = 0;
  for (std::size_t i = 0; i < m.triangleCount(); ++i) {
    V3 p[3];
    for (int k = 0; k < 3; ++k) {
      const std::size_t vi = m.indices[3 * i + static_cast<std::size_t>(k)];
      p[k] = {m.positions[3 * vi], m.positions[3 * vi + 1], m.positions[3 * vi + 2]};
    }
    area += 0.5 * norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
  }
  return area;
}

/// Strict local maxima of the cavity ceiling: places where trapped air could collect other than at the inlet.
std::vector<V3> localCeilingMaxima(const MeshPayload& m, const V3& inletXY, double inletRadius) {
  std::map<std::tuple<double, double, double>, std::uint32_t> ids;
  std::vector<V3> pos;
  std::vector<std::uint32_t> canon(m.vertexCount());
  for (std::size_t v = 0; v < m.vertexCount(); ++v) {
    const auto key = std::make_tuple(m.positions[3 * v], m.positions[3 * v + 1], m.positions[3 * v + 2]);
    const auto it = ids.find(key);
    if (it == ids.end()) {
      ids.emplace(key, static_cast<std::uint32_t>(pos.size()));
      canon[v] = static_cast<std::uint32_t>(pos.size());
      pos.push_back({m.positions[3 * v], m.positions[3 * v + 1], m.positions[3 * v + 2]});
    } else {
      canon[v] = it->second;
    }
  }
  std::vector<char> isMax(pos.size(), 1), hasNeighbour(pos.size(), 0);
  for (std::size_t t = 0; t < m.triangleCount(); ++t) {
    for (int k = 0; k < 3; ++k) {
      const std::uint32_t a = canon[m.indices[3 * t + static_cast<std::size_t>(k)]], b = canon[m.indices[3 * t + static_cast<std::size_t>((k + 1) % 3)]];
      if (a == b) continue;
      hasNeighbour[a] = hasNeighbour[b] = 1;
      if (pos[b][2] >= pos[a][2]) isMax[a] = 0;
      if (pos[a][2] >= pos[b][2]) isMax[b] = 0;
    }
  }
  std::vector<V3> out;
  for (std::size_t i = 0; i < pos.size(); ++i) {
    if (!isMax[i] || !hasNeighbour[i]) continue;
    if (std::hypot(pos[i][0] - inletXY[0], pos[i][1] - inletXY[1]) <= inletRadius) continue;
    out.push_back(pos[i]);
  }
  return out;
}

// --- curved seam: a height field z = h(x, y) in the pull frame ----------------------------------------------------------------------------------------
//
// With both halves translating along +-Z, a mold point can leave upward only if no part of the product lies above it in its column, and downward only if
// none lies below it. In a column the product meets (one interval [lo, hi]) that puts every mold point below lo in half B and every point above hi in
// half A, so a seam is admissible exactly when lo <= h <= hi in each such column; outside the product's footprint h is free. A column holding two
// intervals has mold between them that can go neither way, and shows up here as an empty interval. The bounds come straight from the faces: a face
// looking down (outward normal -Z) is the bottom of an interval, so h must be at or above it over its whole footprint; a face looking up is a top, so h must
// be at or below it. The grid is conservative: each vertex must satisfy every face that touches the cells around it, evaluated exactly over the clipped
// footprint, so the piecewise-linear h cannot dip through a face between vertices.
struct HeightField {
  int nx = 0, ny = 0;  // cells
  double x0 = 0, y0 = 0, dx = 1, dy = 1;
  std::vector<double> h;  // (nx + 1) * (ny + 1), index j * (nx + 1) + i
  double hMin = 0, hMax = 0, hMean = 0;
  double at(int i, int j) const { return h[static_cast<std::size_t>(j) * static_cast<std::size_t>(nx + 1) + static_cast<std::size_t>(i)]; }
  double xAt(int i) const { return x0 + dx * i; }
  double yAt(int j) const { return y0 + dy * j; }
};

struct PullTriangles {
  std::vector<double> v;  // 9 per triangle, pull frame
  std::vector<double> n;  // 3 per triangle, unit, (0,0,0) when degenerate
  Bounds3 bounds;
  std::size_t count() const { return n.size() / 3; }
};

PullTriangles pullTriangles(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, const Frame& frame) {
  PullTriangles t;
  const std::size_t tc = indices.size() / 3;
  t.v.resize(tc * 9);
  t.n.assign(tc * 3, 0.0);
  t.bounds = {{kInf, kInf, kInf}, {-kInf, -kInf, -kInf}};
  for (std::size_t i = 0; i < tc; ++i) {
    V3 p[3];
    for (int k = 0; k < 3; ++k) {
      const std::size_t vi = indices[3 * i + static_cast<std::size_t>(k)];
      p[k] = frame.apply({positions[3 * vi], positions[3 * vi + 1], positions[3 * vi + 2]});
      for (int a = 0; a < 3; ++a) {
        t.v[i * 9 + static_cast<std::size_t>(3 * k + a)] = p[k][static_cast<std::size_t>(a)];
        t.bounds.min[a] = std::min(t.bounds.min[a], p[k][static_cast<std::size_t>(a)]);
        t.bounds.max[a] = std::max(t.bounds.max[a], p[k][static_cast<std::size_t>(a)]);
      }
    }
    const V3 c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const double len = norm(c);
    if (len > 0 && std::isfinite(len)) {
      t.n[3 * i] = c[0] / len;
      t.n[3 * i + 1] = c[1] / len;
      t.n[3 * i + 2] = c[2] / len;
    }
  }
  return t;
}

using P2 = std::array<double, 2>;

/// Keeps the part of a convex polygon with coordinate `axis` on the kept side of `bound` (Sutherland-Hodgman, one edge).
void clipEdge(std::vector<P2>& poly, int axis, double bound, bool keepGreater) {
  std::vector<P2> out;
  const auto inside = [&](const P2& p) { return keepGreater ? p[static_cast<std::size_t>(axis)] >= bound : p[static_cast<std::size_t>(axis)] <= bound; };
  for (std::size_t i = 0; i < poly.size(); ++i) {
    const P2& a = poly[i];
    const P2& b = poly[(i + 1) % poly.size()];
    const bool ia = inside(a), ib = inside(b);
    if (ia) out.push_back(a);
    if (ia != ib) {
      const double t = (bound - a[static_cast<std::size_t>(axis)]) / (b[static_cast<std::size_t>(axis)] - a[static_cast<std::size_t>(axis)]);
      out.push_back({a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])});
    }
  }
  poly = std::move(out);
}

double polygonArea(const std::vector<P2>& p) {
  double a = 0;
  for (std::size_t i = 0; i < p.size(); ++i) {
    const P2& u = p[i];
    const P2& v = p[(i + 1) % p.size()];
    a += u[0] * v[1] - v[0] * u[1];
  }
  return std::fabs(a) / 2;
}

struct HeightFieldAttempt {
  std::shared_ptr<const HeightField> field;
  std::string why;          // when there is none: the worst unsatisfiable vertex
  double worstGapMm = 0;    // lower bound minus upper bound at that vertex
  int badVertices = 0;
};

void throwIfCancelled(const MasterMoldEngineHooks& hooks);

HeightFieldAttempt solveHeightField(const PullTriangles& tris, const Bounds3& domain, int cells, double sine, double tolMm, const MasterMoldEngineHooks& hooks) {
  HeightFieldAttempt result;
  auto f = std::make_shared<HeightField>();
  const double w = domain.max.x - domain.min.x, d = domain.max.y - domain.min.y;
  const double cell = std::max(w, d) / cells;
  f->nx = std::max(1, static_cast<int>(std::ceil(w / cell)));
  f->ny = std::max(1, static_cast<int>(std::ceil(d / cell)));
  f->dx = w / f->nx;
  f->dy = d / f->ny;
  f->x0 = domain.min.x;
  f->y0 = domain.min.y;
  const std::size_t nv = static_cast<std::size_t>(f->nx + 1) * static_cast<std::size_t>(f->ny + 1);
  std::vector<double> lower(nv, -kInf), upper(nv, kInf);
  const auto idx = [&](int i, int j) { return static_cast<std::size_t>(j) * static_cast<std::size_t>(f->nx + 1) + static_cast<std::size_t>(i); };

  std::vector<P2> poly;
  for (std::size_t t = 0; t < tris.count(); ++t) {
    if ((t & 0x3FFF) == 0) throwIfCancelled(hooks);
    const double nx = tris.n[3 * t], ny = tris.n[3 * t + 1], nz = tris.n[3 * t + 2];
    if (std::fabs(nz) <= sine) continue;  // a vertical face is never the top or the bottom of a column interval
    const double* p = &tris.v[t * 9];
    const double minx = std::min({p[0], p[3], p[6]}), maxx = std::max({p[0], p[3], p[6]});
    const double miny = std::min({p[1], p[4], p[7]}), maxy = std::max({p[1], p[4], p[7]});
    const int iLo = std::max(0, static_cast<int>(std::ceil((minx - f->x0) / f->dx)) - 1), iHi = std::min(f->nx, static_cast<int>(std::floor((maxx - f->x0) / f->dx)) + 1);
    const int jLo = std::max(0, static_cast<int>(std::ceil((miny - f->y0) / f->dy)) - 1), jHi = std::min(f->ny, static_cast<int>(std::floor((maxy - f->y0) / f->dy)) + 1);
    const bool bottom = nz < 0;
    for (int j = jLo; j <= jHi; ++j)
      for (int i = iLo; i <= iHi; ++i) {
        poly = {{p[0], p[1]}, {p[3], p[4]}, {p[6], p[7]}};
        clipEdge(poly, 0, f->xAt(i) - f->dx, true);
        clipEdge(poly, 0, f->xAt(i) + f->dx, false);
        if (poly.size() < 3) continue;
        clipEdge(poly, 1, f->yAt(j) - f->dy, true);
        clipEdge(poly, 1, f->yAt(j) + f->dy, false);
        if (poly.size() < 3 || polygonArea(poly) < 1e-9 * f->dx * f->dy) continue;  // a touch along an edge constrains no column
        double zExtreme = bottom ? -kInf : kInf;
        for (const P2& q : poly) {
          const double z = p[2] - (nx * (q[0] - p[0]) + ny * (q[1] - p[1])) / nz;
          zExtreme = bottom ? std::max(zExtreme, z) : std::min(zExtreme, z);
        }
        if (bottom) lower[idx(i, j)] = std::max(lower[idx(i, j)], zExtreme);
        else upper[idx(i, j)] = std::min(upper[idx(i, j)], zExtreme);
      }
  }

  int worstI = 0, worstJ = 0;
  for (int j = 0; j <= f->ny; ++j)
    for (int i = 0; i <= f->nx; ++i) {
      const double gap = lower[idx(i, j)] - upper[idx(i, j)];
      if (gap > tolMm) {
        ++result.badVertices;
        if (gap > result.worstGapMm) { result.worstGapMm = gap; worstI = i; worstJ = j; }
      }
    }
  if (result.badVertices > 0) {
    result.why = std::to_string(result.badVertices) + " of " + std::to_string(nv) + " seam vertices (worst near x " + fmt(f->xAt(worstI)) + ", y " + fmt(f->yAt(worstJ)) +
                 ") must lie above a face that opens downward and below one that opens upward, by " + fmt(result.worstGapMm) + " mm: a column holds mold that can leave neither way.";
    return result;
  }

  // Smoothest seam inside the bounds: relax toward the neighbours' mean and clamp, so the seam is as flat as the product allows.
  const double kMargin = 0.2;
  std::vector<double> lo(nv), hi(nv), h(nv);
  double sum = 0;
  int finite = 0;
  for (std::size_t v = 0; v < nv; ++v) {
    const double L = lower[v], U = upper[v];
    const double m = std::isfinite(L) && std::isfinite(U) ? std::min(kMargin, 0.1 * std::max(0.0, U - L)) : kMargin;
    lo[v] = std::isfinite(L) ? L + m : -kInf;
    hi[v] = std::isfinite(U) ? U - m : kInf;
    if (lo[v] > hi[v]) lo[v] = hi[v] = 0.5 * (L + U);
    if (std::isfinite(lo[v]) && std::isfinite(hi[v])) { sum += 0.5 * (lo[v] + hi[v]); ++finite; }
    else if (std::isfinite(lo[v])) { sum += lo[v]; ++finite; }
    else if (std::isfinite(hi[v])) { sum += hi[v]; ++finite; }
  }
  const double seedValue = finite > 0 ? sum / finite : 0.5 * (tris.bounds.min.z + tris.bounds.max.z);
  for (std::size_t v = 0; v < nv; ++v) h[v] = std::clamp(seedValue, lo[v], hi[v]);
  for (int sweep = 0; sweep < 400; ++sweep) {
    if ((sweep & 15) == 0) throwIfCancelled(hooks);
    double change = 0;
    for (int j = 0; j <= f->ny; ++j)
      for (int i = 0; i <= f->nx; ++i) {
        double s = 0;
        int n = 0;
        if (i > 0) { s += h[idx(i - 1, j)]; ++n; }
        if (i < f->nx) { s += h[idx(i + 1, j)]; ++n; }
        if (j > 0) { s += h[idx(i, j - 1)]; ++n; }
        if (j < f->ny) { s += h[idx(i, j + 1)]; ++n; }
        const std::size_t v = idx(i, j);
        const double next = std::clamp(s / n, lo[v], hi[v]);
        change = std::max(change, std::fabs(next - h[v]));
        h[v] = next;
      }
    if (change < 1e-7) break;
  }
  f->h = std::move(h);
  f->hMin = *std::min_element(f->h.begin(), f->h.end());
  f->hMax = *std::max_element(f->h.begin(), f->h.end());
  f->hMean = std::accumulate(f->h.begin(), f->h.end(), 0.0) / static_cast<double>(nv);
  result.field = std::move(f);
  return result;
}

/// The range of h under a disc (for the registration keys, which stand vertically across the seam).
std::pair<double, double> heightRange(const HeightField& f, double x, double y, double radius) {
  double lo = kInf, hi = -kInf;
  const int i0 = std::clamp(static_cast<int>(std::floor((x - radius - f.x0) / f.dx)), 0, f.nx), i1 = std::clamp(static_cast<int>(std::ceil((x + radius - f.x0) / f.dx)), 0, f.nx);
  const int j0 = std::clamp(static_cast<int>(std::floor((y - radius - f.y0) / f.dy)), 0, f.ny), j1 = std::clamp(static_cast<int>(std::ceil((y + radius - f.y0) / f.dy)), 0, f.ny);
  for (int j = j0; j <= j1; ++j)
    for (int i = i0; i <= i1; ++i) {
      lo = std::min(lo, f.at(i, j));
      hi = std::max(hi, f.at(i, j));
    }
  return {lo, hi};
}

/// The closed solid under the seam: its top is the height field, its sides stand on the field's footprint and it ends at `zBottom`.
MeshPayload heightFieldBody(const HeightField& f, double zBottom) {
  MeshPayload m;
  const int W = f.nx + 1;
  for (int j = 0; j <= f.ny; ++j)
    for (int i = 0; i <= f.nx; ++i) m.positions.insert(m.positions.end(), {f.xAt(i), f.yAt(j), f.at(i, j)});
  const auto top = [&](int i, int j) { return static_cast<std::uint32_t>(j * W + i); };
  for (int j = 0; j < f.ny; ++j)
    for (int i = 0; i < f.nx; ++i) {
      m.indices.insert(m.indices.end(), {top(i, j), top(i + 1, j), top(i + 1, j + 1)});
      m.indices.insert(m.indices.end(), {top(i, j), top(i + 1, j + 1), top(i, j + 1)});
    }
  std::vector<std::uint32_t> ring;  // counter-clockwise seen from above
  for (int i = 0; i < f.nx; ++i) ring.push_back(top(i, 0));
  for (int j = 0; j < f.ny; ++j) ring.push_back(top(f.nx, j));
  for (int i = f.nx; i > 0; --i) ring.push_back(top(i, f.ny));
  for (int j = f.ny; j > 0; --j) ring.push_back(top(0, j));
  const std::uint32_t firstBottom = static_cast<std::uint32_t>(m.vertexCount());
  for (const std::uint32_t t : ring) m.positions.insert(m.positions.end(), {m.positions[3 * t], m.positions[3 * t + 1], zBottom});
  const std::uint32_t centre = static_cast<std::uint32_t>(m.vertexCount());
  m.positions.insert(m.positions.end(), {f.x0 + f.dx * f.nx / 2, f.y0 + f.dy * f.ny / 2, zBottom});
  for (std::size_t k = 0; k < ring.size(); ++k) {
    const std::size_t q = (k + 1) % ring.size();
    const std::uint32_t tp = ring[k], tq = ring[q], bp = firstBottom + static_cast<std::uint32_t>(k), bq = firstBottom + static_cast<std::uint32_t>(q);
    m.indices.insert(m.indices.end(), {tp, bp, bq});
    m.indices.insert(m.indices.end(), {tp, bq, tq});
    m.indices.insert(m.indices.end(), {centre, bq, bp});
  }
  return m;
}

struct Candidate {
  V3 axis;       // model-frame release axis, half A pulls toward +axis
  double seamMm; // flat seam: its offset along `axis` in the model frame
  double widthMm;
  std::shared_ptr<const HeightField> field;  // curved seam: h(x, y) in the frame of `axis`; null for a flat seam
};

struct BuildResult {
  std::optional<MasterMoldPlan> plan;
  std::optional<MasterFailure> failure;
};

MasterFailure failureOf(MasterOutcomeCode code, MasterReleaseStage stage, std::string message, std::vector<std::string> diagnostics = {}) {
  MasterFailure f;
  f.code = code;
  f.stage = stage;
  f.message = std::move(message);
  f.diagnostics = std::move(diagnostics);
  return f;
}

std::string fmt(double v) {
  char buf[48];
  std::snprintf(buf, sizeof buf, "%.6g", v);
  return buf;
}

/// Kernel mesh with exact-position duplicates welded and zero-area slivers dropped. A Boolean can leave two vertices at one position where a cutting
/// circle meets an edge of the other solid; they carry no volume but would show up as degenerate triangles in the printable body.
MeshPayload cleanMesh(const MeshPayload& in) {
  MeshPayload out;
  std::map<std::tuple<double, double, double>, std::uint32_t> ids;
  std::vector<std::uint32_t> remap(in.vertexCount());
  for (std::size_t v = 0; v < in.vertexCount(); ++v) {
    const auto key = std::make_tuple(in.positions[3 * v], in.positions[3 * v + 1], in.positions[3 * v + 2]);
    const auto it = ids.find(key);
    if (it != ids.end()) {
      remap[v] = it->second;
    } else {
      remap[v] = static_cast<std::uint32_t>(out.vertexCount());
      ids.emplace(key, remap[v]);
      out.positions.insert(out.positions.end(), {in.positions[3 * v], in.positions[3 * v + 1], in.positions[3 * v + 2]});
    }
  }
  for (std::size_t t = 0; t < in.triangleCount(); ++t) {
    const std::uint32_t a = remap[in.indices[3 * t]], b = remap[in.indices[3 * t + 1]], c = remap[in.indices[3 * t + 2]];
    if (a != b && b != c && a != c) out.indices.insert(out.indices.end(), {a, b, c});
  }
  return out;
}

MeshPayload exportMesh(IMeshGeometryEngine& engine, const SolidPtr& solid, const char* operation) { return cleanMesh(engine.meshFromSolid(solid, {}, operation)); }

std::string factsText(const MeshPayload& m) {
  MasterBodyDefects d;
  const MasterBodyFacts f = analyzeSolidBody(m, &d);
  return std::to_string(f.componentCount) + " body(ies), watertight " + (f.watertight ? "yes" : "no") + ", manifold " + (f.manifold ? "yes" : "no") + ", volume " + fmt(f.volumeMm3) +
         " mm^3, " + std::to_string(d.degenerateTriangles) + " degenerate triangle(s), " + std::to_string(d.openEdges) + " open edge(s), " + std::to_string(d.nonManifoldEdges) + " non-manifold edge(s)";
}

std::string axisText(const V3& u) { return "(" + fmt(u[0]) + ", " + fmt(u[1]) + ", " + fmt(u[2]) + ")"; }

void throwIfCancelled(const MasterMoldEngineHooks& hooks) {
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
}

MeshPayload rotatedMesh(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, const Frame& frame) {
  MeshPayload m;
  m.positions.resize(positions.size());
  for (std::size_t i = 0; i < positions.size() / 3; ++i) {
    const V3 p = frame.apply({positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]});
    m.positions[3 * i] = p[0];
    m.positions[3 * i + 1] = p[1];
    m.positions[3 * i + 2] = p[2];
  }
  m.indices = indices;
  return m;
}

MeshPayload mapMesh(const MeshPayload& in, const std::function<V3(const V3&)>& f) {
  MeshPayload out = in;
  for (std::size_t i = 0; i < in.positions.size() / 3; ++i) {
    const V3 p = f({in.positions[3 * i], in.positions[3 * i + 1], in.positions[3 * i + 2]});
    out.positions[3 * i] = p[0];
    out.positions[3 * i + 1] = p[1];
    out.positions[3 * i + 2] = p[2];
  }
  return out;
}

Bounds3 boundsFromCorners(double x0, double y0, double z0, double x1, double y1, double z1) { return {{x0, y0, z0}, {x1, y1, z1}}; }

struct Geometry {
  std::string label;
  SolidPtr solid;
  MeshPayload mesh;
  MasterBodyFacts facts;
};

}  // namespace

PlanarAxisEvaluation evaluatePlanarAxis(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, const Point3& axis, double slidingSine) {
  const TriSet t = buildTriSet(positions, indices);
  const V3 u = unit(toV3(axis));
  return evaluateFromScan(scanAxis(t, u, slidingSine), u, inputResolution(t));
}

namespace {

double workingWallFor(const MasterProcessProfile& profile, const Bounds3& b) {
  const double extent = std::max({b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z});
  return profile.workingWallMm.value_or(std::clamp(0.15 * extent, 10.0, 25.0));
}

/// A point near the top of the product and a radius such that the final-cast inlet channel's base disc lies wholly inside the product (see the comment where it is used).
struct Inlet { double x = 0, y = 0, baseZ = 0, radius = 0; };

std::optional<Inlet> findInlet(IMeshGeometryEngine& engine, const SolidPtr& part, const MeshPayload& partMesh, double apexZ, double extent, double sprueR, const MasterMoldEngineHooks& hooks) {
  std::optional<Inlet> inlet;
    {
      std::vector<std::pair<double, double>> spots;
      const double topBand = apexZ - 1e-6 * extent;
      double cx = 0, cy = 0;
      int n = 0;
      for (std::size_t i = 0; i < partMesh.vertexCount(); ++i)
        if (partMesh.positions[3 * i + 2] >= topBand) {
          cx += partMesh.positions[3 * i];
          cy += partMesh.positions[3 * i + 1];
          ++n;
        }
      spots.push_back({cx / n, cy / n});
      for (std::size_t i = 0; i < partMesh.vertexCount() && spots.size() < 12; ++i)
        if (partMesh.positions[3 * i + 2] >= topBand) spots.push_back({partMesh.positions[3 * i], partMesh.positions[3 * i + 1]});
      // The faces near the top, spread over the whole top: a flat top with a bore or teeth has room only in some places, and the first faces of a mesh are
      // all in one corner of it.
      {
        std::vector<std::pair<double, double>> nearTop;
        for (std::size_t t = 0; t < partMesh.triangleCount(); ++t) {
          double x = 0, y = 0, zMin = kInf;
          for (int k = 0; k < 3; ++k) {
            const std::size_t vi = partMesh.indices[3 * t + static_cast<std::size_t>(k)];
            x += partMesh.positions[3 * vi] / 3;
            y += partMesh.positions[3 * vi + 1] / 3;
            zMin = std::min(zMin, partMesh.positions[3 * vi + 2]);
          }
          if (zMin >= apexZ - 0.05 * extent) nearTop.push_back({x, y});
        }
        const std::size_t want = 48;
        const std::size_t stride = std::max<std::size_t>(1, nearTop.size() / want);
        for (std::size_t i = 0; i < nearTop.size() && spots.size() < 12 + want; i += stride) spots.push_back(nearTop[i]);
      }
      for (const double scaleR : {1.0, 0.6, 0.35}) {
        const double r = std::max(1.2, sprueR * scaleR);
        for (const double depthR : {0.5, 1.0, 2.0}) {
          for (const auto& [x, y] : spots) {
            throwIfCancelled(hooks);
            const double baseZ = apexZ - depthR * r;
            const SolidPtr slab = engine.cylinder(r, 0.2, 32, {0, 0, 1}, {x, y, baseZ - 0.2});
            const SolidPtr inside = engine.intersect(slab, part);
            if (!inside->isEmpty() && inside->volume() >= 0.999 * slab->volume()) {
              inlet = Inlet{x, y, baseZ - 0.2, r};
              break;
            }
          }
          if (inlet) break;
        }
        if (inlet) break;
      }
    }
  return inlet;
}

/// Builds, inverts and verifies one candidate. Never throws except for cancellation.
BuildResult buildCandidate(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const MasterProcessProfile& profile, const Candidate& cand, double toleranceMm, double reachMm,
                           const MasterMoldEngineHooks& hooks, const std::function<void(const char*, const std::string&)>& emit) {
  BuildResult result;
  try {
    const Frame frame = frameForAxis(cand.axis);
    MeshPayload pullMesh = rotatedMesh(seed.sourceMesh.positions, seed.sourceMesh.indices, frame);
    // A face that lies on the seam only to within the input's own float32 resolution is put exactly on it, so the Boolean construction meets coplanar faces
    // instead of microscopic slivers that would leave pin-holes in the halves. This moves a vertex by at most `reachMm` (the input resolution).
    int snapped = 0;
    for (std::size_t i = 0; i < pullMesh.vertexCount(); ++i) {
      double& z = pullMesh.positions[3 * i + 2];
      if (!cand.field && z != cand.seamMm && std::fabs(z - cand.seamMm) <= reachMm) {
        z = cand.seamMm;
        ++snapped;
      }
    }
    const SolidPtr part = engine.solidFromMesh(pullMesh, toleranceMm, "Mesh preparation");
    const Bounds3 pb = part->bounds();
    const double extent = std::max({pb.max.x - pb.min.x, pb.max.y - pb.min.y, pb.max.z - pb.min.z});
    const bool curved = cand.field != nullptr;
    const double c = curved ? cand.field->hMean : cand.seamMm;
    const double hLo = curved ? cand.field->hMin : c, hHi = curved ? cand.field->hMax : c;
    const double wall = workingWallFor(profile, pb);
    const double sprueR = profile.sprueRadiusMm.value_or(std::clamp(0.04 * extent, 3.0, 8.0));
    const double keyR = profile.keyRadiusMm, keyH = profile.keyHeightMm, clr = profile.keyClearanceMm;
    if (wall < 2 * (keyR + clr) + 2) return {std::nullopt, failureOf(MasterOutcomeCode::NoFeasiblePlan, MasterReleaseStage::None, "the working-mold margin is too small for the registration keys.")};

    // ---- working halves, pull frame (+Z is half A's pull) ----
    throwIfCancelled(hooks);
    emit("building_working_halves", "building the two working-mold halves");
    const Bounds3 env = boundsFromCorners(pb.min.x - wall, pb.min.y - wall, pb.min.z - wall, pb.max.x + wall, pb.max.y + wall, pb.max.z + wall);
    const SolidPtr envBox = engine.box(env);
    SolidPtr wa, wb;
    if (!curved) {
      const SolidPtr halfBoxA = engine.box(boundsFromCorners(env.min.x, env.min.y, c, env.max.x, env.max.y, env.max.z));
      const SolidPtr halfBoxB = engine.box(boundsFromCorners(env.min.x, env.min.y, env.min.z, env.max.x, env.max.y, c));
      wa = engine.subtract(halfBoxA, part);
      wb = engine.subtract(halfBoxB, part);
    } else {
      // Everything under the height field, one millimetre wider and deeper than the envelope so no face of it lies on a face of the envelope.
      const HeightField& field = *cand.field;
      if (field.x0 > env.min.x - 0.5 || field.y0 > env.min.y - 0.5 || field.xAt(field.nx) < env.max.x + 0.5 || field.yAt(field.ny) < env.max.y + 0.5)
        return {std::nullopt, failureOf(MasterOutcomeCode::InternalError, MasterReleaseStage::None, "the seam height field does not cover the working-mold envelope.")};
      const SolidPtr below = engine.solidFromMesh(heightFieldBody(field, env.min.z - 1.0), toleranceMm, "Seam body");
      const SolidPtr underSeam = engine.intersect(below, envBox);
      wb = engine.subtract(underSeam, part);
      wa = engine.subtract(engine.subtract(envBox, underSeam), part);
    }

    // Final-cast inlet: a vertical channel from just under the highest level of the part up through the top of half A.
    const MeshPayload partMesh = exportMesh(engine, part, "Mesh export");
    double apexZ = -kInf;
    for (std::size_t i = 0; i < partMesh.vertexCount(); ++i) apexZ = std::max(apexZ, partMesh.positions[3 * i + 2]);
    // The channel's base disc must lie wholly inside the product. Then everything directly below any point of the channel is product or channel, so the
    // channel can never form a blind pocket that catches half A as it lifts (the master's inlet post would otherwise have an underside).
    std::optional<Inlet> inlet = findInlet(engine, part, partMesh, apexZ, extent, sprueR, hooks);
    if (!inlet) return {std::nullopt, failureOf(MasterOutcomeCode::NoFeasiblePlan, MasterReleaseStage::None, "no point near the top of the product can hold a final-cast inlet channel whose base lies wholly inside the product.")};
    const double ax = inlet->x, ay = inlet->y, sprueRActual = inlet->radius;
    const SolidPtr sprue = engine.cylinder(sprueRActual, env.max.z - inlet->baseZ + 1.0, 32, {0, 0, 1}, {ax, ay, inlet->baseZ});

    // Registration keys in the flange: A carries male keys 1 and 2 and the socket for 3; B carries the complements.
    const double inset = wall / 2;
    const V3 keyXY[3] = {{env.min.x + inset, env.min.y + inset, 0}, {env.max.x - inset, env.min.y + inset, 0}, {env.min.x + inset, env.max.y - inset, 0}};
    const auto cyl = [&](double r, double z0, double z1, const V3& xy) { return engine.cylinder(r, z1 - z0, 32, {0, 0, 1}, {xy[0], xy[1], z0}); };
    wa = engine.subtract(wa, sprue);
    // Under each key the seam may slope a little: the key stands from its lowest to its highest point (a flat seam is one value).
    std::pair<double, double> keyZ[3];
    for (int k = 0; k < 3; ++k) keyZ[k] = curved ? heightRange(*cand.field, keyXY[k][0], keyXY[k][1], keyR + clr + 0.5) : std::pair<double, double>{c, c};
    wa = engine.subtract(wa, cyl(keyR + clr, keyZ[2].first - 0.1, keyZ[2].second + keyH + clr, keyXY[2]));
    wa = engine.unionOf({wa, cyl(keyR, keyZ[0].first - keyH, keyZ[0].second + 0.5, keyXY[0]), cyl(keyR, keyZ[1].first - keyH, keyZ[1].second + 0.5, keyXY[1])});
    wb = engine.subtract(wb, cyl(keyR + clr, keyZ[0].first - keyH - clr, keyZ[0].second + 0.1, keyXY[0]));
    wb = engine.subtract(wb, cyl(keyR + clr, keyZ[1].first - keyH - clr, keyZ[1].second + 0.1, keyXY[1]));
    wb = engine.unionOf({wb, cyl(keyR, keyZ[2].first - 0.5, keyZ[2].second + keyH, keyXY[2])});
    if (wa->isEmpty() || wb->isEmpty() || !wa->isValid() || !wb->isValid())
      return {std::nullopt, failureOf(MasterOutcomeCode::InternalError, MasterReleaseStage::None, "the working-mold Boolean construction produced an empty or invalid half.")};

    Geometry A{"Working half A", wa, exportMesh(engine, wa, "Working half A"), {}}, B{"Working half B", wb, exportMesh(engine, wb, "Working half B"), {}};
    A.facts = analyzeSolidBody(A.mesh);
    B.facts = analyzeSolidBody(B.mesh);
    for (const Geometry* g : {&A, &B}) {
      if (g->facts.componentCount != 1 || !g->facts.watertight || !g->facts.manifold || !(g->facts.volumeMm3 > 0))
        return {std::nullopt, failureOf(MasterOutcomeCode::NoFeasiblePlan, MasterReleaseStage::None,
                                        g->label + " is not a single closed solid for this seam (" + factsText(g->mesh) + ").")};
    }

    // ---- masters ----
    throwIfCancelled(hooks);
    emit("inverting_masters", "inverting each half into its own master");
    const double baseT = std::max(profile.masterBaseMm, keyH + clr + 3.0);
    const double mw = profile.masterWallMm, free = profile.freeboardMm;
    Affine tA;
    tA.m = {1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, baseT - hLo};  // the lowest point of the seam sits on the base
    Affine tB;
    tB.m = {1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, hHi + baseT};  // half-turn about X: parting face down, impression up; a proper rotation
    struct MasterBuild {
      SolidPtr pourHalf, solid;
      MeshPayload mesh, pourHalfMesh;
      MasterBodyFacts facts;
      double fillTop = 0, fillVolume = 0, headVolume = 0;
      Bounds3 envelope;
    };
    const auto invert = [&](const SolidPtr& half, const Affine& t, double yLo, double yHi, double fillHeight, const char* name) {
      MasterBuild m;
      m.pourHalf = engine.transform(half, t.m);
      m.pourHalfMesh = exportMesh(engine, m.pourHalf, name);
      m.fillTop = baseT + fillHeight;
      const Bounds3 tool = boundsFromCorners(env.min.x - mw, yLo - mw, 0, env.max.x + mw, yHi + mw, m.fillTop + free);
      m.envelope = tool;
      const SolidPtr head = engine.box(boundsFromCorners(env.min.x, yLo, m.fillTop, env.max.x, yHi, m.fillTop + free));
      m.headVolume = head->volume();
      const SolidPtr fill = engine.unionOf({m.pourHalf, head});
      m.solid = engine.subtract(engine.box(tool), fill);
      m.mesh = exportMesh(engine, m.solid, name);
      m.facts = analyzeSolidBody(m.mesh);
      m.fillVolume = engine.box(tool)->volume() - m.facts.volumeMm3 - m.headVolume;
      return m;
    };
    MasterBuild mA = invert(wa, tA, env.min.y, env.max.y, env.max.z - hLo, "Master A");
    MasterBuild mB = invert(wb, tB, -env.max.y, -env.min.y, hHi - env.min.z, "Master B");

    MasterMoldPlan plan;
    plan.sourceGeometryVersion = seed.sourceGeometryVersion;
    plan.seam.pullAxis = toPoint(cand.axis);
    plan.seam.planeOffsetMm = c;
    if (curved) {
      plan.seam.kind = "height-field";
      plan.seam.description = "curved parting surface z = h(x, y) along " + axisText(cand.axis) + ", " + std::to_string(cand.field->nx) + " x " + std::to_string(cand.field->ny) +
                              " cells, spanning " + fmt(hLo) + " to " + fmt(hHi) + " mm (mean " + fmt(c) + ")";
    } else {
      plan.seam.kind = "planar";
      plan.seam.description = "flat parting plane at " + fmt(c) + " mm along " + axisText(cand.axis) + "; seam interval width " + fmt(cand.widthMm) + " mm";
    }
    MasterBuild* builds[2] = {&mA, &mB};
    Geometry* halves[2] = {&A, &B};
    for (int i = 0; i < 2; ++i) {
      MasterBuild& m = *builds[i];
      const std::string tool = masterToolName(static_cast<MasterToolId>(i));
      if (m.facts.componentCount != 1 || !m.facts.watertight || !m.facts.manifold || !(m.facts.volumeMm3 > 0))
        return {std::nullopt, failureOf(MasterOutcomeCode::NoFeasiblePlan, MasterReleaseStage::None, tool + " is not a single closed printable solid (" + factsText(m.mesh) + ").")};
      const double expected = halves[i]->facts.volumeMm3;
      if (std::fabs(m.fillVolume - expected) > 1e-6 * expected + 1e-6)
        return {std::nullopt, failureOf(MasterOutcomeCode::InternalError, MasterReleaseStage::None,
                                        tool + ": the fill domain reconstructed from the master (" + fmt(m.fillVolume) + " mm^3) does not match its working half (" + fmt(expected) + " mm^3).")};
      if (seed.printerBuildVolume) {
        const Point3& bv = *seed.printerBuildVolume;
        if (m.facts.bounds.max.x - m.facts.bounds.min.x > bv.x || m.facts.bounds.max.y - m.facts.bounds.min.y > bv.y || m.facts.bounds.max.z - m.facts.bounds.min.z > bv.z)
          return {std::nullopt, failureOf(MasterOutcomeCode::NoFeasiblePlan, MasterReleaseStage::None, tool + " does not fit the printer build volume.")};
      }
    }

    // ---- release verification on the final solids ----
    throwIfCancelled(hooks);
    emit("verifying_release", "sweeping each release motion over the final solids");
    double sliding = 0;
    const Point3 up = toPoint(cand.axis), down = toPoint(scaled(cand.axis, -1));
    const auto record = [&](MasterReleaseStage stage, MasterToolId subject, const Point3& dir, const SweepOutcome& s, const std::string& what) -> std::optional<MasterFailure> {
      MasterReleaseCheck chk;
      chk.stage = stage;
      chk.subject = subject;
      chk.verification = s.verification;
      chk.direction = dir;
      chk.marginMm = 0;
      chk.method = "translation-sweep (opposing faces extruded back over the moving solid, exact intersection)";
      chk.note = what + ": " + std::to_string(s.opposingFaces) + " opposing face(s)" + (s.slidingAreaMm2 > 0 ? ", " + fmt(s.slidingAreaMm2) + " mm^2 zero-draft sliding contact" : "") +
                 (s.note.empty() ? "" : "; " + s.note);
      sliding += s.slidingAreaMm2;
      plan.releaseChecks.push_back(chk);
      if (s.verification == MasterVerification::Blocked) return failureOf(MasterOutcomeCode::BlockedRelease, stage, what + " is blocked: " + s.note);
      if (s.verification == MasterVerification::Unverified) return failureOf(MasterOutcomeCode::UnresolvedVerification, stage, what + " could not be certified: " + s.note);
      return std::nullopt;
    };
    if (auto f = record(MasterReleaseStage::MasterToWorkingMold, MasterToolId::A, up, verifySweep(engine, mA.pourHalf, mA.pourHalfMesh, 1, {&mA.mesh}, profile, toleranceMm, reachMm), "working half A out of Master A")) return {std::nullopt, *f};
    if (auto f = record(MasterReleaseStage::MasterToWorkingMold, MasterToolId::B, down, verifySweep(engine, mB.pourHalf, mB.pourHalfMesh, 1, {&mB.mesh}, profile, toleranceMm, reachMm), "working half B out of Master B")) return {std::nullopt, *f};
    // Mating halves must not overlap each other or the product, and the assembled halves must come apart. An overlap that is a film no thicker than the
    // kernel's resolution laid over a face is contact (the halves and the product share faces by construction), not interference.
    const auto interference = [&](const SolidPtr& s) {
      if (s->isEmpty() || s->volume() <= profile.clearVolumeMm3) return 0.0;
      const double area = meshArea(exportMesh(engine, s, "Mating overlap"));
      return area > 0 && 2 * s->volume() / area <= 2 * toleranceMm ? 0.0 : s->volume();
    };
    const double overlap = interference(engine.intersect(wa, wb)) + interference(engine.intersect(wa, part)) + interference(engine.intersect(wb, part));
    if (overlap > 0)
      return {std::nullopt, failureOf(MasterOutcomeCode::BlockedRelease, MasterReleaseStage::WorkingMoldAssembly, "the assembled halves and the product overlap by " + fmt(overlap) + " mm^3.")};
    if (auto f = record(MasterReleaseStage::WorkingMoldAssembly, MasterToolId::A, up, verifySweep(engine, wa, A.mesh, 1, {&B.mesh, &partMesh}, profile, toleranceMm, reachMm), "working half A off half B and the product")) return {std::nullopt, *f};
    if (auto f = record(MasterReleaseStage::WorkingMoldAssembly, MasterToolId::B, down, verifySweep(engine, wb, B.mesh, -1, {&A.mesh, &partMesh}, profile, toleranceMm, reachMm), "working half B off half A and the product")) return {std::nullopt, *f};
    if (auto f = record(MasterReleaseStage::ProductRelease, MasterToolId::A, up, verifySweep(engine, part, partMesh, 1, {&B.mesh}, profile, toleranceMm, reachMm), "product out of half B")) return {std::nullopt, *f};
    if (auto f = record(MasterReleaseStage::ProductRelease, MasterToolId::B, down, verifySweep(engine, part, partMesh, -1, {&A.mesh}, profile, toleranceMm, reachMm), "product out of half A")) return {std::nullopt, *f};

    // ---- reproduction fidelity: the assembled halves must leave exactly the product plus the inlet ----
    throwIfCancelled(hooks);
    emit("finalizing", "measuring reproduction fidelity");
    const Bounds3 region = boundsFromCorners(pb.min.x - 1, pb.min.y - 1, pb.min.z - 1, pb.max.x + 1, pb.max.y + 1, pb.max.z + 1);
    const SolidPtr regionBox = engine.box(region);
    const SolidPtr recon = engine.intersect(engine.subtract(envBox, engine.unionOf({wa, wb})), regionBox);
    const SolidPtr reference = engine.intersect(engine.unionOf({part, sprue}), regionBox);
    const SolidPtr reconOnly = engine.subtract(recon, reference), referenceOnly = engine.subtract(reference, recon);
    const double xorVolume = (reconOnly->isEmpty() ? 0 : reconOnly->volume()) + (referenceOnly->isEmpty() ? 0 : referenceOnly->volume());
    plan.fidelity.toleranceMm = profile.fidelityToleranceMm;
    plan.fidelity.maxDeviationMm = xorVolume / std::max(meshArea(partMesh), 1e-12);
    plan.fidelity.measured = true;
    plan.fidelity.method = "xor-volume-per-product-area (assembled halves vs product + inlet, excluding the flange keys)";

    // ---- assemble the contract ----
    const Affine fromModel = fromFrame(frame);
    const auto toModel = [&](const V3& p) { return frame.inverse(p); };
    for (int i = 0; i < 2; ++i) {
      const MasterBuild& m = *builds[i];
      const auto id = static_cast<MasterToolId>(i);
      MasterTool& tool = plan.masters[static_cast<std::size_t>(i)];
      tool.id = id;
      tool.name = masterToolName(id);
      tool.mesh = m.mesh;
      tool.facts = m.facts;
      tool.printFromModel = toColumnMajor4(compose(i == 0 ? tA : tB, fromModel));
      tool.pourDirection = {0, 0, 1};
      tool.fillVolumeMm3 = m.fillVolume;
      tool.minimumWallMm = std::min(mw, baseT - keyH);
      tool.registrationFeatureIds = i == 0 ? std::vector<std::string>{"A:pit-key-1", "A:pit-key-2", "A:pin-key-3"} : std::vector<std::string>{"B:pin-key-1", "B:pin-key-2", "B:pit-key-3"};
      tool.ventFeatureIds = {i == 0 ? "A:inlet-post" : "B:none"};
      if (i == 1) tool.ventFeatureIds.clear();
      VirtualWorkingHalf& half = plan.halves[static_cast<std::size_t>(i)];
      half.id = id;
      half.name = halves[i]->label;
      half.mesh = mapMesh(halves[i]->mesh, toModel);
      half.facts = analyzeSolidBody(half.mesh);
      half.releaseDirection = i == 0 ? up : down;
      plan.materials[static_cast<std::size_t>(i)] = estimateMasterMaterial(id, m.fillVolume, profile.wasteMargin, profile.workingMoldDensityGPerCm3);
    }

    // The fill domain of each master is open to the air and nothing in it faces down: no overhang to trap air while the mold-making material is poured.
    for (int i = 0; i < 2; ++i) {
      const MasterBuild& m = *builds[i];
      double downArea = 0;
      for (std::size_t t = 0; t < m.mesh.triangleCount(); ++t) {
        V3 p[3];
        for (int k = 0; k < 3; ++k) {
          const std::size_t vi = m.mesh.indices[3 * t + static_cast<std::size_t>(k)];
          p[k] = {m.mesh.positions[3 * vi], m.mesh.positions[3 * vi + 1], m.mesh.positions[3 * vi + 2]};
        }
        const V3 cr = cross(sub(p[1], p[0]), sub(p[2], p[0]));
        const double len = norm(cr);
        if (len > 0 && cr[2] / len < -profile.slidingSine && std::max({p[0][2], p[1][2], p[2][2]}) > 1e-9) downArea += 0.5 * len;
      }
      if (downArea > 1e-9) plan.warnings.push_back(std::string(masterToolName(static_cast<MasterToolId>(i))) + ": " + fmt(downArea) + " mm^2 of downward-facing surface above the print bed could trap air while filling.");
    }
    const std::vector<V3> maxima = localCeilingMaxima(partMesh, {ax, ay, 0}, sprueRActual);
    if (!maxima.empty())
      plan.warnings.push_back(std::to_string(maxima.size()) + " local high point(s) of the product cavity are not served by the inlet; air could be trapped there during the final cast (add a vent).");
    if (snapped > 0) plan.warnings.push_back(std::to_string(snapped) + " vertex(es) within " + fmt(reachMm) + " mm of the seam (the input's own float32 resolution) were placed exactly on it.");
    if (sliding > 0)
      plan.warnings.push_back(fmt(sliding) + " mm^2 of faces are parallel to the release motion (zero draft). They slide without interference in the digital model, but friction, adhesion and shrinkage can bind them in practice.");
    plan.residualUncertainty = {
        "Digital validation only: shrinkage, adhesion, print quality, release-agent behaviour and material properties are not modelled.",
        "Release is verified for translation along one axis per half; other release motions were not searched.",
        "Air entrapment is assessed geometrically (no fluid simulation); working-mold vents beyond the inlet are not generated.",
        "The working-mold material, the master print material and the final cast material are three separate roles; none is assumed flexible."};
    if (curved) plan.residualUncertainty.push_back("The parting surface is a piecewise-linear height field on a " + std::to_string(cand.field->nx) + " x " + std::to_string(cand.field->ny) + " grid; its release was verified on the built solids, but the seam leaves a faceted line on the cast product.");
    plan.fingerprint = "master-plan:" + finishHash(hashText(seed.seedId + "|" + seed.sourceGeometryVersion + "|" + axisText(cand.axis) + "|" + fmt(c) + "|" + fmt(mA.fillVolume) + "|" + fmt(mB.fillVolume)));
    result.plan = std::move(plan);
  } catch (const CodedError& error) {
    if (error.code() == "cancelled") throw;
    result.failure = failureOf(MasterOutcomeCode::InternalError, MasterReleaseStage::None, std::string("geometry kernel failure: ") + error.what());
  } catch (const std::exception& error) {
    result.failure = failureOf(MasterOutcomeCode::InternalError, MasterReleaseStage::None, std::string("geometry kernel failure: ") + error.what());
  }
  return result;
}

}  // namespace

MasterMoldOutcome planTwoPartMasters(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const MasterProcessProfile& profile, const MasterMoldEngineHooks& hooks) {
  const auto started = std::chrono::steady_clock::now();
  const auto elapsed = [&] { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count(); };
  const auto emit = [&](const char* stage, const std::string& detail) {
    if (!hooks.onStage) return;
    int index = 0;
    for (std::size_t i = 0; i < kMasterProgressStages.size(); ++i)
      if (std::string(kMasterProgressStages[i]) == stage) index = static_cast<int>(i);
    hooks.onStage({stage, index, 7, detail, elapsed()});
  };

  throwIfCancelled(hooks);
  emit("analyzing_geometry", "checking the source mesh");
  const MeshPreflightResult preflight = runMeshPreflight(seed.sourceMesh.positions, seed.sourceMesh.indices);
  if (preflight.status == "invalid-for-master-mold") {
    std::string message;
    for (const auto& issue : preflight.issues) message += (message.empty() ? "" : " ") + issue.message;
    return makeMasterFailure(failureOf(MasterOutcomeCode::InvalidInput, MasterReleaseStage::None, "the source mesh is not usable as a manufacturing solid: " + message), elapsed());
  }

  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(seed.sourceBounds, 0);
  const TriSet tris = buildTriSet(seed.sourceMesh.positions, seed.sourceMesh.indices);
  const double planeTol = inputResolution(tris);

  throwIfCancelled(hooks);
  emit("searching_release_axes", "judging every candidate release axis on every triangle");
  std::vector<AxisCandidate> candidates;
  {
    const std::vector<V3> axes = candidateAxes(tris, seed.sourceMesh.positions);
    int order = 0;
    for (const V3& u : axes) {
      throwIfCancelled(hooks);
      candidates.push_back({u, evaluateFromScan(scanAxis(tris, u, profile.slidingSine), u, planeTol), order++});
    }
  }
  const auto rank = [](const AxisCandidate& a, const AxisCandidate& b) {
    const double ea = std::max(1e-12, a.e.maxProjectionMm - a.e.minProjectionMm), eb = std::max(1e-12, b.e.maxProjectionMm - b.e.minProjectionMm);
    const double na = std::round(a.e.widthMm / ea * 1e6) / 1e6, nb = std::round(b.e.widthMm / eb * 1e6) / 1e6;
    if (na != nb) return na > nb;
    return a.order < b.order;
  };
  std::stable_sort(candidates.begin(), candidates.end(), rank);
  const std::size_t axesEvaluated = candidates.size();
  for (std::size_t i = 0; i < std::min<std::size_t>(4, candidates.size()); ++i) {
    throwIfCancelled(hooks);
    candidates[i] = refineAxis(tris, candidates[i], profile.slidingSine, planeTol);
  }
  std::stable_sort(candidates.begin(), candidates.end(), rank);

  std::vector<AxisCandidate> feasible;
  for (const AxisCandidate& c : candidates)
    if (c.e.feasible) feasible.push_back(c);
  std::vector<std::string> flatDiagnostics;
  for (std::size_t i = 0; i < std::min<std::size_t>(3, candidates.size()); ++i) {
    const AxisCandidate& c = candidates[i];
    if (!c.e.feasible)
      flatDiagnostics.push_back("axis " + axisText(c.u) + ": a face opposing half A's pull reaches " + fmt(c.e.lowerMm) + " mm while a face opposing half B's pull starts at " + fmt(c.e.upperMm) +
                                " mm (gap " + fmt(c.e.widthMm) + " mm); no flat seam separates them.");
  }

  // Centroid projection decides where inside the feasible interval the seam sits (balanced halves, away from the interval's ends).
  V3 centroid{0, 0, 0};
  {
    const std::size_t vc = seed.sourceMesh.positions.size() / 3;
    for (std::size_t i = 0; i < vc; ++i)
      for (int a = 0; a < 3; ++a) centroid[static_cast<std::size_t>(a)] += seed.sourceMesh.positions[3 * i + static_cast<std::size_t>(a)] / static_cast<double>(vc);
  }

  throwIfCancelled(hooks);
  emit("choosing_seam", "choosing the seam");
  std::optional<MasterFailure> lastFailure;
  int constructed = 0;
  for (const AxisCandidate& cand : feasible) {
    if (constructed >= profile.maxConstructedCandidates) break;
    ++constructed;
    V3 axis = cand.u;
    double lo = cand.e.lowerMm, hi = cand.e.upperMm, mn = cand.e.minProjectionMm, mx = cand.e.maxProjectionMm;
    const double w = std::max(0.0, hi - lo);
    double seam = w > 0 ? std::clamp(dot(centroid, axis), lo + 0.1 * w, hi - 0.1 * w) : 0.5 * (lo + hi);
    if (mx - seam < seam - mn) {  // put the taller half on the inlet side
      axis = scaled(axis, -1);
      seam = -seam;
      const double nlo = -hi, nhi = -lo, nmn = -mx, nmx = -mn;
      lo = nlo; hi = nhi; mn = nmn; mx = nmx;
    }
    BuildResult built = buildCandidate(engine, seed, profile, {axis, seam, std::max(0.0, hi - lo)}, policy.booleanToleranceMm, planeTol, hooks, emit);
    if (built.plan) {
      emit("finalizing", "publishing both masters");
      return makeMasterOutcome(std::move(*built.plan), elapsed());
    }
    // A witnessed block is more informative than "no plan", an unverified interval more than a kernel error.
    const auto weight = [](const MasterFailure& f) {
      switch (f.code) {
        case MasterOutcomeCode::BlockedRelease: return 3;
        case MasterOutcomeCode::UnresolvedVerification: return 2;
        case MasterOutcomeCode::NoFeasiblePlan: return 1;
        default: return 0;
      }
    };
    if (built.failure && (!lastFailure || weight(*built.failure) >= weight(*lastFailure))) lastFailure = built.failure;
  }

  // No flat seam worked. A curved seam z = h(x, y) lets both halves still slide along +-u whenever no column of the product holds mold that is trapped
  // between two of its intervals; try the axes that came closest.
  std::vector<std::string> curvedDiagnostics;
  int curvedConstructed = 0;
  int curvedAxes = 0;
  // The axes to try: first those where a coarse voxel census says the least mold is trapped between the product and itself (best evidence a seam exists),
  // then the ones whose flat seam came closest.
  CoverageAnalysis coverage;
  std::vector<V3> axesToTry;
  {
    emit("choosing_seam", "counting the mold each release axis would trap");
    double margin = 0;
    {
      const PullTriangles all = pullTriangles(seed.sourceMesh.positions, seed.sourceMesh.indices, frameForAxis({0, 0, 1}));
      margin = workingWallFor(profile, all.bounds);
    }
    coverage = analyzeTwoDirectionCoverage(seed.sourceMesh.positions, seed.sourceMesh.indices, margin, profile.coverageResolution, profile.coverageDirections, hooks);
    const auto add = [&](const V3& u) {
      for (const V3& a : axesToTry) if (std::fabs(dot(a, u)) > 0.99966) return;
      axesToTry.push_back(u);
    };
    for (const DirectionPairCoverage& p : coverage.opposing) {
      if (static_cast<int>(axesToTry.size()) >= profile.maxCurvedAxes) break;
      add(unit({p.first.x, p.first.y, p.first.z}));
    }
    for (std::size_t i = 0; i < candidates.size() && static_cast<int>(axesToTry.size()) < profile.maxCurvedAxes + 2; ++i) add(candidates[i].u);
  }
  for (std::size_t ci = 0; ci < axesToTry.size(); ++ci) {
    throwIfCancelled(hooks);
    V3 axis = axesToTry[ci];
    {
      const AxisScan scan = scanAxis(tris, axis, profile.slidingSine);
      const double c = dot(centroid, axis);
      if (c - scan.minProj < scan.maxProj - c) axis = scaled(axis, -1);  // the taller half on the inlet side
    }
    emit("choosing_seam", "searching a curved seam along " + axisText(axis));
    ++curvedAxes;
    const PullTriangles tris = pullTriangles(seed.sourceMesh.positions, seed.sourceMesh.indices, frameForAxis(axis));
    const double wall = workingWallFor(profile, tris.bounds);
    const double margin = wall + 2.0;  // the field covers the working-mold envelope with a millimetre to spare
    const Bounds3 domain = boundsFromCorners(tris.bounds.min.x - margin, tris.bounds.min.y - margin, 0, tris.bounds.max.x + margin, tris.bounds.max.y + margin, 0);
    HeightFieldAttempt attempt;
    for (const int cells : profile.curvedSeamResolutions) {
      attempt = solveHeightField(tris, domain, cells, profile.slidingSine, planeTol, hooks);
      if (attempt.field) break;
    }
    if (!attempt.field) {
      curvedDiagnostics.push_back("axis " + axisText(axis) + ": " + attempt.why);
      continue;
    }
    ++curvedConstructed;
    emit("choosing_seam", "building the halves around a curved seam");
    BuildResult built = buildCandidate(engine, seed, profile, {axis, 0, 0, attempt.field}, policy.booleanToleranceMm, planeTol, hooks, emit);
    if (built.plan) {
      emit("finalizing", "publishing both masters");
      return makeMasterOutcome(std::move(*built.plan), elapsed());
    }
    if (built.failure) {
      curvedDiagnostics.push_back("axis " + axisText(axis) + ": " + built.failure->message);
      if (!lastFailure || (built.failure->code == MasterOutcomeCode::BlockedRelease) || (built.failure->code == MasterOutcomeCode::UnresolvedVerification && lastFailure->code != MasterOutcomeCode::BlockedRelease)) lastFailure = built.failure;
    }
  }

  // What the census says about the part as a whole, whatever the seam search found: it separates a witnessed obstruction from a search that was too narrow.
  if (coverage.ran) {
    char buf[1100];
    std::snprintf(buf, sizeof buf,
                  "census (%d directions, %.2f mm voxels, mold %.0f mm^3, leaning toward 'free'): the best pair of OPPOSITE directions (%.2f, %.2f, %.2f) still traps %.1f mm^3 (%.4f %% of the mold); the best "
                  "pair of ANY two directions (%.2f, %.2f, %.2f then %.2f, %.2f, %.2f) traps %.1f mm^3 in %d pocket(s)%s.",
                  coverage.directions, coverage.voxelMm, coverage.moldVolumeMm3, coverage.bestOpposing.first.x, coverage.bestOpposing.first.y, coverage.bestOpposing.first.z,
                  coverage.bestOpposing.trappedMm3, 100 * coverage.bestOpposing.trappedFraction, coverage.best.first.x, coverage.best.first.y, coverage.best.first.z, coverage.best.second.x,
                  coverage.best.second.y, coverage.best.second.z, coverage.best.trappedMm3, coverage.trappedComponents,
                  coverage.best.trappedMm3 <= 0.0001 * coverage.moldVolumeMm3
                      ? ": nothing is trapped for two halves released in those two directions, so a two-part split probably exists"
                      : ": mold is trapped for every pair of directions sampled, which is evidence that no two-part split by translation exists");
    curvedDiagnostics.insert(curvedDiagnostics.begin(), buf);  // first: it is what the panel shows
    if (coverage.best.trappedMm3 <= 0.0001 * coverage.moldVolumeMm3) curvedDiagnostics.insert(curvedDiagnostics.begin() + 1, "This planner releases both halves along one axis (opposite directions); halves that leave in two different directions, the first and then the second, are not built. The failure is therefore a limit of the search, not a witnessed obstruction of this part.");
  }

  if (!lastFailure) {  // nothing was ever constructed: no flat seam and no curved seam in the resolutions tried
    std::vector<std::string> diagnostics = curvedDiagnostics;
    diagnostics.insert(diagnostics.end(), flatDiagnostics.begin(), flatDiagnostics.end());
    return makeMasterFailure(failureOf(MasterOutcomeCode::NoFeasiblePlan, MasterReleaseStage::None,
                                       "neither a flat parting plane along any of " + std::to_string(axesEvaluated) + " candidate release axes nor a curved parting surface along the " + std::to_string(curvedAxes) +
                                           " most promising lets both halves be pulled apart along one axis. This is a limit of the bounded search (opposing translation, a seam that is a height field), not proof that no rigid two-part solution exists.",
                                       diagnostics),
                             elapsed());
  }
  MasterFailure f = *lastFailure;
  f.diagnostics.insert(f.diagnostics.end(), curvedDiagnostics.begin(), curvedDiagnostics.end());
  f.diagnostics.push_back("constructed " + std::to_string(constructed) + " flat and " + std::to_string(curvedConstructed) + " curved candidate(s).");
  return makeMasterFailure(std::move(f), elapsed());
}

}  // namespace craft
