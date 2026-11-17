#include "master/RayBvh.h"

#include <algorithm>
#include <cmath>

namespace craft {

namespace {
struct V { double x, y, z; };
V sub(const V& a, const V& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V cross(const V& a, const V& b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double dot(const V& a, const V& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

bool rayHitsBox(const Bounds3& box, const Point3& o, const Point3& d, double farMm) {
  // Padded slab test: a conservative superset of the exact hits.
  double tmin = 0, tmax = farMm;
  const double pad = 1e-6;
  const double od[3] = {o.x, o.y, o.z}, dd[3] = {d.x, d.y, d.z};
  for (int a = 0; a < 3; ++a) {
    const double lo = box.min[a] - pad, hi = box.max[a] + pad;
    if (dd[a] == 0) {
      if (od[a] < lo || od[a] > hi) return false;
      continue;
    }
    double t1 = (lo - od[a]) / dd[a], t2 = (hi - od[a]) / dd[a];
    if (t1 > t2) std::swap(t1, t2);
    tmin = std::max(tmin, t1);
    tmax = std::min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
}  // namespace

RayBvh::RayBvh(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices) : positions_(positions), indices_(indices) {
  const std::size_t count = indices.size() / 3;
  std::vector<int> ids(count);
  for (std::size_t i = 0; i < count; ++i) ids[i] = static_cast<int>(i);
  boxes_.resize(count);
  for (std::size_t t = 0; t < count; ++t) {
    Bounds3 b = emptyBounds();
    for (int c = 0; c < 3; ++c) {
      const std::size_t v = indices[t * 3 + static_cast<std::size_t>(c)];
      for (int a = 0; a < 3; ++a) {
        const double value = positions[v * 3 + static_cast<std::size_t>(a)];
        b.min[a] = std::min(b.min[a], value);
        b.max[a] = std::max(b.max[a], value);
      }
    }
    boxes_[t] = b;
  }
  if (count > 0) build(ids, 0, ids.size());
  order_ = std::move(ids);
}

int RayBvh::build(std::vector<int>& ids, std::size_t begin, std::size_t end) {
  const int index = static_cast<int>(nodes_.size());
  nodes_.emplace_back();
  Bounds3 box = emptyBounds();
  for (std::size_t i = begin; i < end; ++i)
    for (int a = 0; a < 3; ++a) {
      box.min[a] = std::min(box.min[a], boxes_[static_cast<std::size_t>(ids[i])].min[a]);
      box.max[a] = std::max(box.max[a], boxes_[static_cast<std::size_t>(ids[i])].max[a]);
    }
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
    return boxes_[static_cast<std::size_t>(a)].min[axis] + boxes_[static_cast<std::size_t>(a)].max[axis] <
           boxes_[static_cast<std::size_t>(b)].min[axis] + boxes_[static_cast<std::size_t>(b)].max[axis];
  });
  const int left = build(ids, begin, mid);
  const int right = build(ids, mid, end);
  nodes_[static_cast<std::size_t>(index)].left = left;
  nodes_[static_cast<std::size_t>(index)].right = right;
  return index;
}

bool RayBvh::triangleDistance(int t, const Point3& originP, const Point3& directionP, double& distance) const {
  const V origin{originP.x, originP.y, originP.z}, dir{directionP.x, directionP.y, directionP.z};
  const auto vertex = [&](int corner) {
    const std::size_t v = indices_[static_cast<std::size_t>(t) * 3 + static_cast<std::size_t>(corner)];
    return V{positions_[v * 3], positions_[v * 3 + 1], positions_[v * 3 + 2]};
  };
  const V a = vertex(0), b = vertex(1), c = vertex(2);
  const V edge1 = sub(b, a);
  V edge2 = sub(c, a);
  const V normal = cross(edge1, edge2);
  double DdN = dot(dir, normal);
  double sign;
  if (DdN > 0) sign = 1;
  else if (DdN < 0) { sign = -1; DdN = -DdN; }
  else return false;
  const V diff = sub(origin, a);
  edge2 = cross(diff, edge2);
  const double DdQxE2 = sign * dot(dir, edge2);
  if (DdQxE2 < 0) return false;
  const double DdE1xQ = sign * dot(dir, cross(edge1, diff));
  if (DdE1xQ < 0) return false;
  if (DdQxE2 + DdE1xQ > DdN) return false;
  const double QdN = -sign * dot(diff, normal);
  if (QdN < 0) return false;
  const double s = QdN / DdN;
  const V point{origin.x + dir.x * s, origin.y + dir.y * s, origin.z + dir.z * s};
  const double dx = origin.x - point.x, dy = origin.y - point.y, dz = origin.z - point.z;
  distance = std::sqrt(dx * dx + dy * dy + dz * dz);
  return true;
}

bool RayBvh::anyHitBeyond(const Point3& origin, const Point3& direction, double eps) const {
  if (nodes_.empty()) return false;
  std::vector<int> stack{0};
  while (!stack.empty()) {
    const Node& n = nodes_[static_cast<std::size_t>(stack.back())];
    stack.pop_back();
    if (!rayHitsBox(n.box, origin, direction, INFINITY)) continue;
    if (n.left < 0) {
      for (int i = n.start; i < n.start + n.count; ++i) {
        double d;
        if (triangleDistance(order_[static_cast<std::size_t>(i)], origin, direction, d) && d >= eps && d > eps) return true;
      }
    } else {
      stack.push_back(n.left);
      stack.push_back(n.right);
    }
  }
  return false;
}

std::vector<double> RayBvh::hitDistances(const Point3& origin, const Point3& direction, double nearMm, double farMm) const {
  std::vector<double> hits;
  if (nodes_.empty()) return hits;
  std::vector<int> stack{0};
  while (!stack.empty()) {
    const Node& n = nodes_[static_cast<std::size_t>(stack.back())];
    stack.pop_back();
    if (!rayHitsBox(n.box, origin, direction, farMm)) continue;
    if (n.left < 0) {
      for (int i = n.start; i < n.start + n.count; ++i) {
        double d;
        if (triangleDistance(order_[static_cast<std::size_t>(i)], origin, direction, d) && !(d < nearMm || d > farMm)) hits.push_back(d);
      }
    } else {
      stack.push_back(n.left);
      stack.push_back(n.right);
    }
  }
  return hits;
}

int RayBvh::countUniqueForwardIntersections(const Point3& origin, const Point3& direction, double farMm) const {
  std::vector<double> hits = hitDistances(origin, direction, kRayIntersectionEpsilonMm, farMm);
  hits.erase(std::remove_if(hits.begin(), hits.end(), [](double d) { return !(std::isfinite(d) && d > kRayIntersectionEpsilonMm); }), hits.end());
  std::sort(hits.begin(), hits.end());
  int unique = 0;
  double previous = -INFINITY;
  for (double d : hits) {
    if (d - previous > kRayIntersectionEpsilonMm) { ++unique; previous = d; }
  }
  return unique;
}

}  // namespace craft