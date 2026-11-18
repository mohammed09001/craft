#include "mold/SpruePreview.h"

#include <algorithm>
#include <cmath>

#include "mold/SprueProfile.h"
#include "view/Rotation.h"

namespace craft {

namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;
constexpr double kStemRadiusMm = kDefaultSprueEntryNeckDiameterMm / 2;  // STEM_RADIUS_MM

float f32(double v) { return static_cast<float>(v); }

// The upper 3x3 of three.js Matrix4.compose(position, quaternion, scale), column-major as `te`.
struct Compose {
  double te[16];
  Compose(const Vec3& position, const Quat& q, const Vec3& scale) {
    const double x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
    const double xx = q.x * x2, xy = q.x * y2, xz = q.x * z2, yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
    const double wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
    const double sx = scale.x, sy = scale.y, sz = scale.z;
    te[0] = (1 - (yy + zz)) * sx; te[1] = (xy + wz) * sx; te[2] = (xz - wy) * sx; te[3] = 0;
    te[4] = (xy - wz) * sy; te[5] = (1 - (xx + zz)) * sy; te[6] = (yz + wx) * sy; te[7] = 0;
    te[8] = (xz + wy) * sz; te[9] = (yz - wx) * sz; te[10] = (1 - (xx + yy)) * sz; te[11] = 0;
    te[12] = position.x; te[13] = position.y; te[14] = position.z; te[15] = 1;
  }
  Vec3 point(const Vec3& v) const {
    return {te[0] * v.x + te[4] * v.y + te[8] * v.z + te[12], te[1] * v.x + te[5] * v.y + te[9] * v.z + te[13],
            te[2] * v.x + te[6] * v.y + te[10] * v.z + te[14]};
  }
};

// Matrix3.getNormalMatrix(modelMatrix) applied to a normal, then normalised. For M = R * S the normal matrix is
// R * S^-1, so the scale is divided out before the rotation.
Vec3 normalOf(const Quat& q, const Vec3& scale, const Vec3& n) {
  return rotate(q, {n.x / scale.x, n.y / scale.y, n.z / scale.z}).normalized();
}

IndexedSurface placed(const IndexedSurface& local, const Vec3& position, const Quat& orientation, const Vec3& scale) {
  const Compose matrix(position, orientation, scale);
  IndexedSurface out;
  out.indices = local.indices;
  out.positions.reserve(local.positions.size());
  out.normals.reserve(local.normals.size());
  for (std::size_t i = 0; i + 2 < local.positions.size(); i += 3) {
    const Vec3 p = matrix.point({local.positions[i], local.positions[i + 1], local.positions[i + 2]});
    out.positions.insert(out.positions.end(), {p.x, p.y, p.z});
    const Vec3 n = normalOf(orientation, scale, {local.normals[i], local.normals[i + 1], local.normals[i + 2]});
    out.normals.insert(out.normals.end(), {n.x, n.y, n.z});
  }
  return out;
}

}  // namespace

IndexedSurface cylinderSurface(double radiusTop, double radiusBottom, double height, int radialSegments) {
  IndexedSurface surface;
  const double halfHeight = height / 2;
  const double slope = (radiusBottom - radiusTop) / height;
  std::uint32_t index = 0;

  // Torso (heightSegments = 1): two rings, vertex order x = 0..radialSegments for y = 0 then y = 1.
  std::vector<std::vector<std::uint32_t>> rows;
  for (int y = 0; y <= 1; ++y) {
    std::vector<std::uint32_t> row;
    const double v = y;
    const double radius = v * (radiusBottom - radiusTop) + radiusTop;
    for (int x = 0; x <= radialSegments; ++x) {
      const double u = static_cast<double>(x) / radialSegments;
      const double theta = u * kTwoPi;
      const double sinTheta = std::sin(theta), cosTheta = std::cos(theta);
      surface.positions.insert(surface.positions.end(), {f32(radius * sinTheta), f32(-v * height + halfHeight), f32(radius * cosTheta)});
      const Vec3 normal = Vec3{sinTheta, slope, cosTheta}.normalized();
      surface.normals.insert(surface.normals.end(), {f32(normal.x), f32(normal.y), f32(normal.z)});
      row.push_back(index++);
    }
    rows.push_back(std::move(row));
  }
  for (int x = 0; x < radialSegments; ++x) {
    // three.js: a = [y][x], b = [y + 1][x], c = [y + 1][x + 1], d = [y][x + 1]; triangles (a, b, d) and (b, c, d).
    const std::uint32_t a = rows[0][static_cast<std::size_t>(x)], b = rows[1][static_cast<std::size_t>(x)];
    const std::uint32_t c = rows[1][static_cast<std::size_t>(x) + 1], d = rows[0][static_cast<std::size_t>(x) + 1];
    if (radiusTop > 0) surface.indices.insert(surface.indices.end(), {a, b, d});  // (radiusTop > 0 || y !== 0)
    if (radiusBottom > 0) surface.indices.insert(surface.indices.end(), {b, c, d});  // (radiusBottom > 0 || y !== heightSegments - 1)
  }

  // Caps: one centre vertex per segment, then the ring.
  const auto cap = [&](bool top) {
    const std::uint32_t centerStart = index;
    const double radius = top ? radiusTop : radiusBottom;
    const double sign = top ? 1 : -1;
    for (int x = 1; x <= radialSegments; ++x) {
      surface.positions.insert(surface.positions.end(), {0.0, f32(halfHeight * sign), 0.0});
      surface.normals.insert(surface.normals.end(), {0.0, sign, 0.0});
      ++index;
    }
    const std::uint32_t centerEnd = index;
    for (int x = 0; x <= radialSegments; ++x) {
      const double theta = static_cast<double>(x) / radialSegments * kTwoPi;
      surface.positions.insert(surface.positions.end(), {f32(radius * std::sin(theta)), f32(halfHeight * sign), f32(radius * std::cos(theta))});
      surface.normals.insert(surface.normals.end(), {0.0, sign, 0.0});
      ++index;
    }
    for (int x = 0; x < radialSegments; ++x) {
      const std::uint32_t c = centerStart + static_cast<std::uint32_t>(x), i = centerEnd + static_cast<std::uint32_t>(x);
      if (top) surface.indices.insert(surface.indices.end(), {i, i + 1, c});
      else surface.indices.insert(surface.indices.end(), {i + 1, i, c});
    }
  };
  if (radiusTop > 0) cap(true);
  if (radiusBottom > 0) cap(false);
  return surface;
}

std::optional<SpruePreviewGeometry> buildSpruePreview(const SpruePlacement& placement) {
  const double length = placement.stemLengthMm;
  if (!std::isfinite(length) || length <= kSpruePreviewToleranceMm) return std::nullopt;

  const SprueProfileDimensions& profile = placement.profileDesign.profile;
  const double mainRadius = profile.mainDiameterMm / 2;
  const double neckRadius = profile.entryNeckDiameterMm / 2;
  const double neckLength = std::min(profile.entryNeckLengthMm, length);
  const double mainStemLength = std::max(0.0, length - neckLength);
  const double mainScale = mainRadius / kStemRadiusMm;
  const double neckScale = neckRadius / kStemRadiusMm;

  const Vec3 entry{placement.topPoint.x, placement.topPoint.y, placement.topPoint.z};
  const Vec3 inward = Vec3{placement.inwardDirection.x, placement.inwardDirection.y, placement.inwardDirection.z}.normalized();
  const Vec3 outward = inward * -1.0;
  const Vec3 axis{0, 1, 0};

  SpruePreviewGeometry out;
  out.valid = placement.valid;
  out.colorRgb = placement.valid ? kSpruePreviewValidRgb : kSpruePreviewInvalidRgb;

  // The funnel: wide end outward, narrow end on the surface.
  {
    SpruePreviewPart& part = out.parts[0];
    part.name = "SpruePreviewFunnel";
    part.visible = true;
    part.surface = placed(cylinderSurface(kSprueFunnelInletRadiusMm, kStemRadiusMm, kSprueFunnelHeightMm, kSprueFunnelSegments),
                          entry + outward * (kSprueFunnelHeightMm / 2), quaternionFromUnitVectors(axis, outward), {mainScale, 1, mainScale});
  }
  const Quat inwardOrientation = quaternionFromUnitVectors(axis, inward);
  const IndexedSurface unitStem = cylinderSurface(kStemRadiusMm, kStemRadiusMm, 1, kSprueCircularSegments);
  {
    SpruePreviewPart& part = out.parts[1];
    part.name = "SpruePreviewStem";
    part.visible = mainStemLength > kSpruePreviewToleranceMm;
    part.surface = placed(unitStem, entry + inward * (mainStemLength / 2), inwardOrientation,
                          {mainScale, std::max(mainStemLength, kSpruePreviewToleranceMm), mainScale});
  }
  {
    SpruePreviewPart& part = out.parts[2];
    part.name = "SpruePreviewEntryNeck";
    part.visible = neckLength > kSpruePreviewToleranceMm;
    part.surface = placed(unitStem, entry + inward * (mainStemLength + neckLength / 2), inwardOrientation,
                          {neckScale, std::max(neckLength, kSpruePreviewToleranceMm), neckScale});
  }
  return out;
}

}  // namespace craft
