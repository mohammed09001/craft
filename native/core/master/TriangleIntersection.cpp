#include "master/TriangleIntersection.h"

#include <algorithm>
#include <cmath>

namespace craft {

namespace {

constexpr double kZero = 1e-15;
constexpr double kZeroSq = kZero * kZero;

using V = TriVec;
V sub(const V& a, const V& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
double dot(const V& a, const V& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V cross(const V& a, const V& b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double length(const V& a) { return std::sqrt(dot(a, a)); }
bool nearZero(double v) { return std::fabs(v) < kZero; }

struct Bounds1 {
  double min = INFINITY, max = -INFINITY;
  void set(const V& axis, const V (&points)[3]) {
    min = INFINITY;
    max = -INFINITY;
    for (const V& p : points) {
      const double v = dot(axis, p);
      min = v < min ? v : min;
      max = v > max ? v : max;
    }
  }
  bool separated(const Bounds1& o) const { return min > o.max || o.min > max; }
};

struct Tri {
  V p[3];
  V axes[4];
  Bounds1 sat[4];
  V normal;
  double constant = 0;
  bool degPoint = false, degSegment = false;
  V segStart, segEnd;

  explicit Tri(const IntersectTriangle& t) {
    p[0] = t.a; p[1] = t.b; p[2] = t.c;
    const V &a = p[0], &b = p[1], &c = p[2];
    // Triangle.getNormal: (c - b) x (a - b), scaled by 1/sqrt(lengthSq).
    V n = cross(sub(c, b), sub(a, b));
    const double lenSq = dot(n, n);
    if (lenSq > 0) {
      const double s = 1 / std::sqrt(lenSq);
      n = {n.x * s, n.y * s, n.z * s};
    } else {
      n = {0, 0, 0};
    }
    axes[0] = n;
    sat[0].set(axes[0], p);
    axes[1] = sub(a, b); sat[1].set(axes[1], p);
    axes[2] = sub(b, c); sat[2].set(axes[2], p);
    axes[3] = sub(c, a); sat[3].set(axes[3], p);
    const double lab = length(axes[1]), lbc = length(axes[2]), lca = length(axes[3]);
    if (lab < kZero) {
      if (lbc < kZero || lca < kZero) degPoint = true;
      else { degSegment = true; segStart = a; segEnd = c; }
    } else if (lbc < kZero) {
      if (lca < kZero) degPoint = true;
      else { degSegment = true; segStart = b; segEnd = a; }
    } else if (lca < kZero) {
      degSegment = true; segStart = c; segEnd = b;
    }
    normal = axes[0];
    constant = -dot(a, normal);
  }

  double planeDistance(const V& q) const { return dot(normal, q) + constant; }

  bool containsPoint(const V& point) const {
    const V v0 = sub(p[2], p[0]), v1 = sub(p[1], p[0]), v2 = sub(point, p[0]);
    const double d00 = dot(v0, v0), d01 = dot(v0, v1), d02 = dot(v0, v2), d11 = dot(v1, v1), d12 = dot(v1, v2);
    const double denom = d00 * d11 - d01 * d01;
    if (denom == 0) return false;
    const double inv = 1 / denom;
    const double u = (d11 * d02 - d01 * d12) * inv;
    const double v = (d00 * d12 - d01 * d02) * inv;
    const double x = 1 - u - v, y = v;
    return x >= 0 && y >= 0 && (x + y) <= 1;
  }
};

bool coplanar(const Tri& self, const Tri& other) {
  const V planeNormal = (!self.degPoint && !self.degSegment) ? self.normal : other.normal;
  Bounds1 cached, cached2;
  for (int i = 1; i < 4; ++i) {
    cached.set(self.axes[i], other.p);
    if (self.sat[i].separated(cached)) return false;
    V dir = cross(planeNormal, self.axes[i]);
    cached.set(dir, self.p);
    cached2.set(dir, other.p);
    if (cached.separated(cached2)) return false;
  }
  for (int i = 1; i < 4; ++i) {
    cached.set(other.axes[i], self.p);
    if (other.sat[i].separated(cached)) return false;
    V dir = cross(planeNormal, other.axes[i]);
    cached.set(dir, self.p);
    cached2.set(dir, other.p);
    if (cached.separated(cached2)) return false;
  }
  return true;
}

/// Plane.intersectLine(segment, target) != null, returning the point.
bool planeIntersectLine(const Tri& plane, const V& start, const V& end, V& out) {
  const V direction = sub(end, start);
  const double denominator = dot(plane.normal, direction);
  if (denominator == 0) {
    if (plane.planeDistance(start) == 0) { out = start; return true; }
    return false;
  }
  const double t = -(dot(start, plane.normal) + plane.constant) / denominator;
  if (t < 0 || t > 1) return false;
  out = {start.x + direction.x * t, start.y + direction.y * t, start.z + direction.z * t};
  return true;
}

bool triangleSegment(const Tri& triangle, const Tri& degenerate) {
  const double startDist = triangle.planeDistance(degenerate.segStart);
  const double endDist = triangle.planeDistance(degenerate.segEnd);
  if (nearZero(startDist)) {
    if (nearZero(endDist)) return coplanar(triangle, degenerate);
    return triangle.containsPoint(degenerate.segStart);
  }
  if (nearZero(endDist)) return triangle.containsPoint(degenerate.segEnd);
  V point;
  if (planeIntersectLine(triangle, degenerate.segStart, degenerate.segEnd, point)) return triangle.containsPoint(point);
  return false;
}

bool trianglePoint(const Tri& triangle, const Tri& degenerate) {
  const V& point = degenerate.p[0];
  return nearZero(triangle.planeDistance(point)) && triangle.containsPoint(point);
}

bool segmentPoint(const Tri& segmentTri, const Tri& pointTri) {
  const V& point = pointTri.p[0];
  const V delta = sub(segmentTri.segEnd, segmentTri.segStart);
  const V startP = sub(point, segmentTri.segStart);
  const double lenSq = dot(delta, delta);
  double t = dot(delta, startP) / lenSq;
  t = std::min(1.0, std::max(0.0, t));
  const V closest{delta.x * t + segmentTri.segStart.x, delta.y * t + segmentTri.segStart.y, delta.z * t + segmentTri.segStart.z};
  const V d = sub(point, closest);
  return dot(d, d) < kZeroSq;
}

/// -1: not a degenerate case; 0/1: the answer.
int degenerateCases(const Tri& self, const Tri& other) {
  if (self.degSegment) {
    if (other.degSegment) {
      const V delta1 = sub(self.segEnd, self.segStart), delta2 = sub(other.segEnd, other.segStart);
      const V startDelta = sub(other.segStart, self.segStart);
      const double denom = delta1.x * delta2.y - delta1.y * delta2.x;
      if (nearZero(denom)) return 0;
      const double t = (startDelta.x * delta2.y - startDelta.y * delta2.x) / denom;
      const double u = -(delta1.x * startDelta.y - delta1.y * startDelta.x) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) return 0;
      const double z1 = self.segStart.z + delta1.z * t;
      const double z2 = other.segStart.z + delta2.z * u;
      return nearZero(z1 - z2) ? 1 : 0;
    }
    if (other.degPoint) return segmentPoint(self, other) ? 1 : 0;
    return triangleSegment(other, self) ? 1 : 0;
  }
  if (self.degPoint) {
    if (other.degPoint) {
      const V d = sub(other.p[0], self.p[0]);
      return dot(d, d) < kZeroSq ? 1 : 0;
    }
    if (other.degSegment) return segmentPoint(other, self) ? 1 : 0;
    return trianglePoint(other, self) ? 1 : 0;
  }
  if (other.degPoint) return trianglePoint(self, other) ? 1 : 0;
  if (other.degSegment) return triangleSegment(self, other) ? 1 : 0;
  return -1;
}

/// Returns true for the coplanar case; otherwise fills the projected interval.
bool lineBounds(const Tri& self, double aProj, double bProj, double cProj, double abDist, double acDist, double aDist, double bDist,
                double cDist, double& lo, double& hi) {
  const auto single = [&](double pa, double pb, double pc, double da, double db, double dc) {
    double t = da / (da - db);
    lo = pa + (pb - pa) * t;
    t = da / (da - dc);
    hi = pa + (pc - pa) * t;
  };
  (void)self;
  if (abDist > 0) single(cProj, aProj, bProj, cDist, aDist, bDist);
  else if (acDist > 0) single(bProj, aProj, cProj, bDist, aDist, cDist);
  else if (bDist * cDist > 0 || aDist != 0) single(aProj, bProj, cProj, aDist, bDist, cDist);
  else if (bDist != 0) single(bProj, aProj, cProj, bDist, aDist, cDist);
  else if (cDist != 0) single(cProj, aProj, bProj, cDist, aDist, bDist);
  else return true;
  return false;
}

double component(const V& v, int i) { return i == 0 ? v.x : i == 1 ? v.y : v.z; }

}  // namespace

bool trianglesIntersect(const IntersectTriangle& first, const IntersectTriangle& second, double planeToleranceMm) {
  const Tri self(first), other(second);
  const int degenerate = degenerateCases(self, other);
  if (degenerate != -1) return degenerate == 1;

  double a1 = other.planeDistance(self.p[0]), b1 = other.planeDistance(self.p[1]), c1 = other.planeDistance(self.p[2]);
  if (planeToleranceMm > 0) {
    const double a2t = self.planeDistance(other.p[0]), b2t = self.planeDistance(other.p[1]), c2t = self.planeDistance(other.p[2]);
    const double worst = std::max({std::fabs(a1), std::fabs(b1), std::fabs(c1), std::fabs(a2t), std::fabs(b2t), std::fabs(c2t)});
    if (worst <= planeToleranceMm) return coplanar(self, other);
  }
  if (nearZero(a1)) a1 = 0;
  if (nearZero(b1)) b1 = 0;
  if (nearZero(c1)) c1 = 0;
  const double a1b1 = a1 * b1, a1c1 = a1 * c1;
  if (a1b1 > 0 && a1c1 > 0) return false;

  double a2 = self.planeDistance(other.p[0]), b2 = self.planeDistance(other.p[1]), c2 = self.planeDistance(other.p[2]);
  if (nearZero(a2)) a2 = 0;
  if (nearZero(b2)) b2 = 0;
  if (nearZero(c2)) c2 = 0;
  const double a2b2 = a2 * b2, a2c2 = a2 * c2;
  if (a2b2 > 0 && a2c2 > 0) return false;

  const V line = cross(self.normal, other.normal);
  int index = 0;
  double maxComponent = std::fabs(line.x);
  const double comp1 = std::fabs(line.y);
  if (comp1 > maxComponent) { maxComponent = comp1; index = 1; }
  if (std::fabs(line.z) > maxComponent) index = 2;

  double lo1, hi1, lo2, hi2;
  if (lineBounds(self, component(self.p[0], index), component(self.p[1], index), component(self.p[2], index), a1b1, a1c1, a1, b1, c1, lo1, hi1))
    return coplanar(self, other);
  if (lineBounds(other, component(other.p[0], index), component(other.p[1], index), component(other.p[2], index), a2b2, a2c2, a2, b2, c2, lo2, hi2))
    return coplanar(self, other);
  if (hi1 < lo1) std::swap(lo1, hi1);
  if (hi2 < lo2) std::swap(lo2, hi2);
  if (hi1 < lo2 || hi2 < lo1) return false;
  return true;
}

}  // namespace craft
