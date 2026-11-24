#include "model/PartOrientation.h"

#include <algorithm>
#include <cmath>

namespace craft {

namespace {

constexpr double kMinDisplayableSize = 1e-9;
constexpr double kSupportToleranceFactor = 1e-4;
constexpr double kMinSupportTolerance = 1e-6;
constexpr double kAreaEpsilonFactor = 1e-8;
constexpr double kHeightEpsilonFactor = 1e-8;
constexpr double kSnapEpsilon = 1e-12;
const double kSqrtHalf = std::sqrt(0.5);  // == Math.SQRT1_2

/// Math.hypot as V8 computes it (scaled, Kahan-compensated sum), so a normalised quaternion matches the reference to the last bit.
double hypot4(double a, double b, double c, double d) {
  const double values[4] = {a, b, c, d};
  double maxAbs = 0;
  for (double v : values) maxAbs = std::max(maxAbs, std::fabs(v));
  if (maxAbs == 0) return 0;
  double sum = 0, compensation = 0;
  for (double v : values) {
    const double n = v / maxAbs;
    const double summand = n * n - compensation;
    const double preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return std::sqrt(sum) * maxAbs;
}

bool finiteQuaternion(const Quaternion& q) {
  return std::isfinite(q.x) && std::isfinite(q.y) && std::isfinite(q.z) && std::isfinite(q.w);
}

Quaternion flipStep(PartFlipDirection d) {
  switch (d) {
    case PartFlipDirection::Left: return {0, -kSqrtHalf, 0, kSqrtHalf};
    case PartFlipDirection::Right: return {0, kSqrtHalf, 0, kSqrtHalf};
    case PartFlipDirection::Forward: return {-kSqrtHalf, 0, 0, kSqrtHalf};
    case PartFlipDirection::Backward: return {kSqrtHalf, 0, 0, kSqrtHalf};
    case PartFlipDirection::UpsideDown: return {1, 0, 0, 0};
  }
  return kIdentityOrientation;
}

double snapComponent(double v) {
  if (std::fabs(v) <= kSnapEpsilon) return 0;
  if (std::fabs(v - 1) <= kSnapEpsilon) return 1;
  if (std::fabs(v + 1) <= kSnapEpsilon) return -1;
  return v;
}

/// automaticModelOrientation.ts rotatePoint (used for scoring; not the matrix form applyQuaternion uses).
Point3 rotatePoint(double x, double y, double z, const Quaternion& r) {
  const double ix = r.w * x + r.y * z - r.z * y;
  const double iy = r.w * y + r.z * x - r.x * z;
  const double iz = r.w * z + r.x * y - r.y * x;
  const double iw = -r.x * x - r.y * y - r.z * z;
  return {ix * r.w + iw * -r.x + iy * -r.z - iz * -r.y, iy * r.w + iw * -r.y + iz * -r.x - ix * -r.z, iz * r.w + iw * -r.z + ix * -r.y - iy * -r.x};
}

double maxDimension(const Bounds3& b) {
  return std::max({b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z});
}

bool finiteBounds(const Bounds3& b) {
  return std::isfinite(b.min.x) && std::isfinite(b.min.y) && std::isfinite(b.min.z) && std::isfinite(b.max.x) && std::isfinite(b.max.y) &&
         std::isfinite(b.max.z) && b.max.x >= b.min.x && b.max.y >= b.min.y && b.max.z >= b.min.z;
}

std::optional<Bounds3> transformedBounds(const TriangleSoup& soup, const Quaternion& rotation) {
  if (!finiteQuaternion(rotation) || soup.positions.empty()) return std::nullopt;
  Bounds3 b = emptyBounds();
  for (std::size_t i = 0; i + 2 < soup.positions.size(); i += 3) {
    const double x = soup.positions[i], y = soup.positions[i + 1], z = soup.positions[i + 2];
    if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z)) return std::nullopt;
    const Point3 p = rotatePoint(x, y, z, rotation);
    b.min = {std::min(b.min.x, p.x), std::min(b.min.y, p.y), std::min(b.min.z, p.z)};
    b.max = {std::max(b.max.x, p.x), std::max(b.max.y, p.y), std::max(b.max.z, p.z)};
  }
  if (!finiteBounds(b) || maxDimension(b) <= kMinDisplayableSize) return std::nullopt;
  return b;
}

int compareNumbers(double left, double right, double epsilon, bool preferHigher) {
  const double difference = left - right;
  if (std::fabs(difference) <= epsilon) return 0;
  if (preferHigher) return difference > 0 ? 1 : -1;
  return difference < 0 ? 1 : -1;
}

int compareEvaluations(const OrientationEvaluation& left, const OrientationEvaluation& right) {
  const double modelSize = std::max(maxDimension(left.bounds), maxDimension(right.bounds));
  const double areaEpsilon = std::max(modelSize * modelSize * kAreaEpsilonFactor, 1e-12);
  const double heightEpsilon = std::max(modelSize * kHeightEpsilonFactor, 1e-12);
  if (int c = compareNumbers(left.score.supportArea, right.score.supportArea, areaEpsilon, true)) return c;
  if (int c = compareNumbers(left.score.footprintArea, right.score.footprintArea, areaEpsilon, true)) return c;
  return compareNumbers(left.score.height, right.score.height, heightEpsilon, false);
}

std::optional<OrientationEvaluation> evaluateCandidate(const TriangleSoup& soup, const char* id, const Quaternion& rotation) {
  const auto bounds = transformedBounds(soup, rotation);
  if (!bounds) return std::nullopt;
  const double modelSize = maxDimension(*bounds);
  const double tolerance = std::max(modelSize * kSupportToleranceFactor, kMinSupportTolerance);
  const double groundLimit = bounds->min.z + tolerance;
  const std::size_t vertexCount = soup.positions.size() / 3;
  std::size_t groundPoints = 0;
  double supportArea = 0;
  for (std::size_t v = 0; v < vertexCount; ++v) {
    if (rotatePoint(soup.positions[3 * v], soup.positions[3 * v + 1], soup.positions[3 * v + 2], rotation).z <= groundLimit) ++groundPoints;
  }
  const std::size_t triangles = vertexCount / 3;
  for (std::size_t t = 0; t < triangles; ++t) {
    const float* p = &soup.positions[9 * t];
    const Point3 a = rotatePoint(p[0], p[1], p[2], rotation);
    const Point3 b = rotatePoint(p[3], p[4], p[5], rotation);
    const Point3 c = rotatePoint(p[6], p[7], p[8], rotation);
    if (a.z <= groundLimit && b.z <= groundLimit && c.z <= groundLimit)
      supportArea += std::fabs(((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2);
  }
  OrientationEvaluation e;
  e.id = id;
  e.rotation = rotation;
  e.bounds = *bounds;
  e.score.footprintArea = (bounds->max.x - bounds->min.x) * (bounds->max.y - bounds->min.y);
  e.score.height = bounds->max.z - bounds->min.z;
  e.score.supportArea = supportArea;
  e.score.supportPointRatio = static_cast<double>(groundPoints) / static_cast<double>(vertexCount);
  return e;
}

}  // namespace

std::optional<PartFlipDirection> parseFlipDirection(const std::string& name) {
  if (name == "left") return PartFlipDirection::Left;
  if (name == "right") return PartFlipDirection::Right;
  if (name == "forward") return PartFlipDirection::Forward;
  if (name == "backward") return PartFlipDirection::Backward;
  if (name == "upside-down") return PartFlipDirection::UpsideDown;
  return std::nullopt;
}

const char* flipDirectionName(PartFlipDirection d) {
  switch (d) {
    case PartFlipDirection::Left: return "left";
    case PartFlipDirection::Right: return "right";
    case PartFlipDirection::Forward: return "forward";
    case PartFlipDirection::Backward: return "backward";
    case PartFlipDirection::UpsideDown: return "upside-down";
  }
  return "";
}

std::optional<Quaternion> normalizeOrientation(const Quaternion& q) {
  if (!finiteQuaternion(q)) return std::nullopt;
  const double length = hypot4(q.x, q.y, q.z, q.w);
  if (length <= 2.220446049250313e-16) return std::nullopt;  // Number.EPSILON
  return Quaternion{q.x / length, q.y / length, q.z / length, q.w / length};
}

Quaternion composePartFlip(const Quaternion& o, PartFlipDirection direction) {
  const Quaternion s = flipStep(direction);
  const auto composed = normalizeOrientation({s.w * o.x + s.x * o.w + s.y * o.z - s.z * o.y, s.w * o.y - s.x * o.z + s.y * o.w + s.z * o.x,
                                              s.w * o.z + s.x * o.y - s.y * o.x + s.z * o.w, s.w * o.w - s.x * o.x - s.y * o.y - s.z * o.z});
  if (!composed) return kIdentityOrientation;
  const Quaternion snapped{snapComponent(composed->x), snapComponent(composed->y), snapComponent(composed->z), snapComponent(composed->w)};
  const double anchor = snapped.w != 0 ? snapped.w : snapped.x != 0 ? snapped.x : snapped.y != 0 ? snapped.y : snapped.z;
  const double sign = anchor < 0 ? -1 : 1;
  // `* sign` as the reference does; it can turn a 0 into -0, which compares equal to 0 and is harmless.
  return {snapped.x * sign, snapped.y * sign, snapped.z * sign, snapped.w * sign};
}

const std::array<std::pair<const char*, Quaternion>, 6>& orientationCandidates() {
  static const std::array<std::pair<const char*, Quaternion>, 6> candidates = {{
      {"negative-z-down", {0, 0, 0, 1}},
      {"positive-z-down", {1, 0, 0, 0}},
      {"positive-x-down", {0, kSqrtHalf, 0, kSqrtHalf}},
      {"negative-x-down", {0, -kSqrtHalf, 0, kSqrtHalf}},
      {"positive-y-down", {-kSqrtHalf, 0, 0, kSqrtHalf}},
      {"negative-y-down", {kSqrtHalf, 0, 0, kSqrtHalf}},
  }};
  return candidates;
}

std::vector<OrientationEvaluation> evaluateOrientationCandidates(const TriangleSoup& soup) {
  std::vector<OrientationEvaluation> out;
  for (const auto& [id, rotation] : orientationCandidates())
    if (auto e = evaluateCandidate(soup, id, rotation)) out.push_back(std::move(*e));
  return out;
}

std::optional<OrientationEvaluation> selectBestOrientationCandidate(const std::vector<OrientationEvaluation>& evaluations) {
  if (evaluations.empty()) return std::nullopt;
  const OrientationEvaluation* best = &evaluations.front();
  for (std::size_t i = 1; i < evaluations.size(); ++i)
    if (compareEvaluations(evaluations[i], *best) > 0) best = &evaluations[i];
  return *best;
}

std::optional<OrientationEvaluation> automaticOrientation(const TriangleSoup& soup) {
  return selectBestOrientationCandidate(evaluateOrientationCandidates(soup));
}

TriangleSoup rotateSoup(const TriangleSoup& soup, const Quaternion& q) {
  // Matrix4.makeRotationFromQuaternion (unit scale, no translation), applied as Matrix4.applyMatrix4 does.
  const double x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
  const double xx = q.x * x2, xy = q.x * y2, xz = q.x * z2, yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
  const double wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
  const double e0 = 1 - (yy + zz), e1 = xy + wz, e2 = xz - wy;
  const double e4 = xy - wz, e5 = 1 - (xx + zz), e6 = yz + wx;
  const double e8 = xz + wy, e9 = yz - wx, e10 = 1 - (xx + yy);
  TriangleSoup out;
  out.positions.resize(soup.positions.size());
  for (std::size_t i = 0; i + 2 < soup.positions.size(); i += 3) {
    const double x = soup.positions[i], y = soup.positions[i + 1], z = soup.positions[i + 2];
    out.positions[i] = static_cast<float>(e0 * x + e4 * y + e8 * z);
    out.positions[i + 1] = static_cast<float>(e1 * x + e5 * y + e9 * z);
    out.positions[i + 2] = static_cast<float>(e2 * x + e6 * y + e10 * z);
  }
  return out;
}

}  // namespace craft
