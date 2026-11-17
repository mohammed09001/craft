#include "geometry/SignedDistance.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <numeric>
#include <stdexcept>

namespace craft {

namespace {

struct V {
  double x, y, z;
};
V sub(const V& a, const V& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V add(const V& a, const V& b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V mul(const V& a, double s) { return {a.x * s, a.y * s, a.z * s}; }
double dot(const V& a, const V& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V cross(const V& a, const V& b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
double length(const V& a) { return std::sqrt(dot(a, a)); }
V normalize(const V& a) { return mul(a, 1.0 / length(a)); }

struct Triangle {
  V a, b, c;
};

struct Aabb {
  V lo{std::numeric_limits<double>::infinity(), std::numeric_limits<double>::infinity(),
       std::numeric_limits<double>::infinity()};
  V hi{-std::numeric_limits<double>::infinity(), -std::numeric_limits<double>::infinity(),
       -std::numeric_limits<double>::infinity()};
  void grow(const V& p) {
    lo = {std::min(lo.x, p.x), std::min(lo.y, p.y), std::min(lo.z, p.z)};
    hi = {std::max(hi.x, p.x), std::max(hi.y, p.y), std::max(hi.z, p.z)};
  }
  double distanceSquared(const V& p) const {
    const double dx = std::max({lo.x - p.x, 0.0, p.x - hi.x});
    const double dy = std::max({lo.y - p.y, 0.0, p.y - hi.y});
    const double dz = std::max({lo.z - p.z, 0.0, p.z - hi.z});
    return dx * dx + dy * dy + dz * dz;
  }
};

// Closest point on triangle (Ericson, Real-Time Collision Detection 5.1.5).
V closestPointOnTriangle(const V& p, const Triangle& t) {
  const V ab = sub(t.b, t.a), ac = sub(t.c, t.a), ap = sub(p, t.a);
  const double d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return t.a;
  const V bp = sub(p, t.b);
  const double d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return t.b;
  const double vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(t.a, mul(ab, d1 / (d1 - d3)));
  const V cp = sub(p, t.c);
  const double d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return t.c;
  const double vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(t.a, mul(ac, d2 / (d2 - d6)));
  const double va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    return add(t.b, mul(sub(t.c, t.b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  }
  const double denom = 1.0 / (va + vb + vc);
  return add(t.a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
}

// Moller-Trumbore, double sided; returns distance or -1.
double rayTriangle(const V& origin, const V& dir, const Triangle& t) {
  const V e1 = sub(t.b, t.a), e2 = sub(t.c, t.a);
  const V p = cross(dir, e2);
  const double det = dot(e1, p);
  if (std::fabs(det) < 1e-14) return -1;
  const double inv = 1.0 / det;
  const V s = sub(origin, t.a);
  const double u = dot(s, p) * inv;
  if (u < 0 || u > 1) return -1;
  const V q = cross(s, e1);
  const double v = dot(dir, q) * inv;
  if (v < 0 || u + v > 1) return -1;
  return dot(e2, q) * inv;
}

bool rayHitsBox(const V& o, const V& d, const Aabb& box) {
  double tmin = 0, tmax = std::numeric_limits<double>::infinity();
  const double origin[3] = {o.x, o.y, o.z}, dir[3] = {d.x, d.y, d.z};
  const double lo[3] = {box.lo.x, box.lo.y, box.lo.z}, hi[3] = {box.hi.x, box.hi.y, box.hi.z};
  for (int axis = 0; axis < 3; ++axis) {
    if (std::fabs(dir[axis]) < 1e-300) {
      if (origin[axis] < lo[axis] || origin[axis] > hi[axis]) return false;
      continue;
    }
    double t0 = (lo[axis] - origin[axis]) / dir[axis];
    double t1 = (hi[axis] - origin[axis]) / dir[axis];
    if (t0 > t1) std::swap(t0, t1);
    tmin = std::max(tmin, t0);
    tmax = std::min(tmax, t1);
    if (tmin > tmax) return false;
  }
  return true;
}

// Same three directions as rayDirections in meshBvh.ts.
const std::array<V, 3>& rayDirections() {
  static const std::array<V, 3> kDirs = {
      normalize({1, std::sqrt(0.5), std::sqrt(3.0) / 3}),
      normalize({std::sqrt(2.0) / 5, 1, std::sqrt(5.0) / 7}),
      normalize({std::sqrt(7.0) / 9, std::sqrt(3.0) / 4, 1}),
  };
  return kDirs;
}

}  // namespace

struct SignedDistanceField::Impl {
  struct Node {
    Aabb box;
    int left = -1, right = -1;  // children, or -1 for a leaf
    int begin = 0, end = 0;     // triangle range for a leaf
  };
  std::vector<Triangle> triangles;
  std::vector<Node> nodes;
  double epsilon = kDefaultSurfaceEpsilonMm;

  int build(std::vector<int>& order, int begin, int end) {
    Node node;
    for (int i = begin; i < end; ++i) {
      const Triangle& t = triangles[order[i]];
      node.box.grow(t.a);
      node.box.grow(t.b);
      node.box.grow(t.c);
    }
    node.begin = begin;
    node.end = end;
    const int index = static_cast<int>(nodes.size());
    nodes.push_back(node);
    if (end - begin > 8) {
      const V size = sub(node.box.hi, node.box.lo);
      const int axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
      const auto centroid = [&](int tri) {
        const Triangle& t = triangles[tri];
        const V s = add(add(t.a, t.b), t.c);
        return axis == 0 ? s.x : axis == 1 ? s.y : s.z;
      };
      const int mid = begin + (end - begin) / 2;
      std::nth_element(order.begin() + begin, order.begin() + mid, order.begin() + end,
                       [&](int l, int r) { return centroid(l) < centroid(r); });
      const int left = build(order, begin, mid);
      const int right = build(order, mid, end);
      nodes[index].left = left;
      nodes[index].right = right;
    }
    return index;
  }

  std::vector<int> order;

  void closest(int nodeIndex, const V& p, double& best) const {
    const Node& node = nodes[nodeIndex];
    if (node.box.distanceSquared(p) >= best) return;
    if (node.left < 0) {
      for (int i = node.begin; i < node.end; ++i) {
        const V q = closestPointOnTriangle(p, triangles[order[i]]);
        const V d = sub(p, q);
        best = std::min(best, dot(d, d));
      }
      return;
    }
    const double dl = nodes[node.left].box.distanceSquared(p);
    const double dr = nodes[node.right].box.distanceSquared(p);
    if (dl < dr) {
      closest(node.left, p, best);
      closest(node.right, p, best);
    } else {
      closest(node.right, p, best);
      closest(node.left, p, best);
    }
  }

  void collectHits(int nodeIndex, const V& o, const V& d, std::vector<double>& hits) const {
    const Node& node = nodes[nodeIndex];
    if (!rayHitsBox(o, d, node.box)) return;
    if (node.left < 0) {
      for (int i = node.begin; i < node.end; ++i) {
        const double t = rayTriangle(o, d, triangles[order[i]]);
        if (t > kRayIntersectionEpsilonMm && std::isfinite(t)) hits.push_back(t);
      }
      return;
    }
    collectHits(node.left, o, d, hits);
    collectHits(node.right, o, d, hits);
  }

  int uniqueForwardCrossings(const V& o, const V& d) const {
    std::vector<double> hits;
    collectHits(0, o, d, hits);
    std::sort(hits.begin(), hits.end());
    int unique = 0;
    double previous = -std::numeric_limits<double>::infinity();
    for (double distance : hits) {
      if (distance - previous > kRayIntersectionEpsilonMm) {
        ++unique;
        previous = distance;
      }
    }
    return unique;
  }
};

SignedDistanceField::SignedDistanceField(const MeshPayload& mesh, double surfaceEpsilonMm)
    : impl_(std::make_unique<Impl>()) {
  if (mesh.positions.size() % 3 != 0 || mesh.indices.size() % 3 != 0) {
    throw std::invalid_argument("Mesh payload is malformed.");
  }
  if (mesh.positions.empty() || mesh.indices.empty()) {
    throw std::invalid_argument("Mesh payload is empty.");
  }
  if (!std::isfinite(surfaceEpsilonMm) || surfaceEpsilonMm <= 0) {
    throw std::invalid_argument("Signed-distance surface epsilon must be positive.");
  }
  impl_->epsilon = surfaceEpsilonMm;
  const auto vertex = [&mesh](std::uint32_t i) {
    if (i * 3ull + 2 >= mesh.positions.size()) throw std::invalid_argument("Mesh payload is malformed.");
    return V{double(float(mesh.positions[i * 3ull])), double(float(mesh.positions[i * 3ull + 1])),
             double(float(mesh.positions[i * 3ull + 2]))};
  };
  for (std::size_t i = 0; i + 2 < mesh.indices.size(); i += 3) {
    impl_->triangles.push_back(
        {vertex(mesh.indices[i]), vertex(mesh.indices[i + 1]), vertex(mesh.indices[i + 2])});
  }
  impl_->order.resize(impl_->triangles.size());
  std::iota(impl_->order.begin(), impl_->order.end(), 0);
  impl_->nodes.reserve(impl_->triangles.size() / 2 + 1);
  impl_->build(impl_->order, 0, static_cast<int>(impl_->order.size()));
}

SignedDistanceField::~SignedDistanceField() = default;
SignedDistanceField::SignedDistanceField(SignedDistanceField&&) noexcept = default;
SignedDistanceField& SignedDistanceField::operator=(SignedDistanceField&&) noexcept = default;

std::size_t SignedDistanceField::triangleCount() const { return impl_->triangles.size(); }

double SignedDistanceField::distanceToSurface(const Point3& p) const {
  if (!std::isfinite(p.x) || !std::isfinite(p.y) || !std::isfinite(p.z)) {
    throw std::invalid_argument("Signed-distance query point is invalid.");
  }
  double best = std::numeric_limits<double>::infinity();
  impl_->closest(0, {p.x, p.y, p.z}, best);
  return std::sqrt(best);
}

bool SignedDistanceField::isInside(const Point3& p) const {
  int votes = 0;
  for (const V& d : rayDirections()) {
    if (impl_->uniqueForwardCrossings({p.x, p.y, p.z}, d) % 2 == 1) ++votes;
  }
  return votes > 1;  // majority of three
}

double SignedDistanceField::signedDistance(const Point3& p) const {
  const double distance = distanceToSurface(p);
  if (distance <= impl_->epsilon) return 0;
  return isInside(p) ? distance : -distance;
}

}  // namespace craft
