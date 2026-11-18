#include "mold/SprueGizmo.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "mold/SprueProfile.h"

namespace craft {

namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;
float f32(double v) { return static_cast<float>(v); }

Vec3 toVec(const Point3& p) { return {p.x, p.y, p.z}; }

// three.js Ray.intersectTriangle with backfaceCulling = true (a FrontSide material): a ray travelling along the
// triangle's normal is a back-face hit and is rejected. Returns the distance along the (unit) ray.
std::optional<double> intersectFrontFace(const Ray& ray, const Vec3& a, const Vec3& b, const Vec3& c) {
  const Vec3 edge1 = b - a;
  const Vec3 edge2 = c - a;
  const Vec3 normal = edge1.cross(edge2);
  double ddn = ray.direction.dot(normal);
  double sign = 0;
  if (ddn > 0) {
    return std::nullopt;  // back face
  } else if (ddn < 0) {
    sign = -1;
    ddn = -ddn;
  } else {
    return std::nullopt;
  }
  const Vec3 diff = ray.origin - a;
  const double ddqxe2 = sign * ray.direction.dot(diff.cross(edge2));
  if (ddqxe2 < 0) return std::nullopt;
  const double dde1xq = sign * ray.direction.dot(edge1.cross(diff));
  if (dde1xq < 0) return std::nullopt;
  if (ddqxe2 + dde1xq > ddn) return std::nullopt;
  const double qdn = -sign * diff.dot(normal);
  if (qdn < 0) return std::nullopt;
  return qdn / ddn;
}

}  // namespace

std::vector<SpruePresentation> presentSprues(const std::vector<SprueOperationDefinition>& intents, const std::vector<SprueDefinition>& resolved) {
  std::vector<SpruePresentation> out;
  out.reserve(intents.size());
  for (const SprueOperationDefinition& intent : intents) {
    SpruePresentation p;
    p.operationId = intent.operationId;
    const SprueDefinition* sprue = nullptr;
    for (const SprueDefinition& r : resolved) {
      if (r.operationId == intent.operationId) sprue = &r;  // the reference's Map keeps the last duplicate
    }
    if (intent.validation.status == "pending") {
      p.position = intent.position;
      p.inwardDirection = intent.inwardDirection;
      p.profile = intent.profileDesign.profile;
      p.status = "pending";
    } else {
      p.position = sprue ? sprue->position : intent.position;
      p.inwardDirection = sprue ? sprue->inwardDirection : intent.inwardDirection;
      p.profile = sprue ? sprue->profile : intent.profileDesign.profile;
      if (sprue) {
        p.depthMm = sprue->depthMm;
        p.targetBodyIds = sprue->targetBodyIds;
      }
      p.status = intent.validation.status;
    }
    out.push_back(std::move(p));
  }
  return out;
}

double SprueHandle::minimumDiameterMm() const {
  return opening == SprueHandleOpening::Top ? std::max(kMinSprueDiameterMm, entryNeckDiameterMm) : kMinSprueDiameterMm;
}
double SprueHandle::maximumDiameterMm() const { return opening == SprueHandleOpening::Top ? kMaxSprueDiameterMm : mainDiameterMm; }
double SprueHandle::visualTubeMm() const { return std::max(0.12, radiusMm * 0.045); }
double SprueHandle::targetTubeMm() const { return std::max(0.45, radiusMm * 0.16); }

std::vector<SprueHandle> buildSprueHandles(const std::vector<SpruePresentation>& presentations) {
  std::vector<SprueHandle> handles;
  const Vec3 zAxis{0, 0, 1};
  for (const SpruePresentation& p : presentations) {
    const Vec3 inward = toVec(p.inwardDirection);
    const Vec3 outward = (inward * -1.0).normalized();  // transformDirection(identity mold frame).normalize()
    const Quat orientation = quaternionFromUnitVectors(zAxis, outward);

    SprueHandle top;
    top.operationId = p.operationId;
    top.opening = SprueHandleOpening::Top;
    top.status = p.status;
    top.position = toVec(p.position);
    top.orientation = orientation;
    top.radiusMm = p.profile.mainDiameterMm / 2;
    top.mainDiameterMm = p.profile.mainDiameterMm;
    top.entryNeckDiameterMm = p.profile.entryNeckDiameterMm;
    if (p.targetBodyIds) top.targetBodyIds = *p.targetBodyIds;
    top.pickMesh = std::make_shared<const IndexedSurface>(torusSurface(top.radiusMm, top.targetTubeMm()));
    handles.push_back(top);

    if (p.depthMm) {
      SprueHandle bottom = top;
      bottom.opening = SprueHandleOpening::Bottom;
      bottom.position = toVec(p.position) + inward * *p.depthMm;  // the raw (not re-normalised) inward direction, as the reference
      bottom.radiusMm = p.profile.entryNeckDiameterMm / 2;
      bottom.pickMesh = std::make_shared<const IndexedSurface>(torusSurface(bottom.radiusMm, bottom.targetTubeMm()));
      handles.push_back(bottom);
    }
  }
  return handles;
}

IndexedSurface torusSurface(double radius, double tube, int radialSegments, int tubularSegments) {
  IndexedSurface surface;
  for (int j = 0; j <= radialSegments; ++j) {
    for (int i = 0; i <= tubularSegments; ++i) {
      const double u = static_cast<double>(i) / tubularSegments * kTwoPi;
      const double v = static_cast<double>(j) / radialSegments * kTwoPi;
      const double x = (radius + tube * std::cos(v)) * std::cos(u);
      const double y = (radius + tube * std::cos(v)) * std::sin(u);
      const double z = tube * std::sin(v);
      surface.positions.insert(surface.positions.end(), {f32(x), f32(y), f32(z)});
      const Vec3 normal = Vec3{x - radius * std::cos(u), y - radius * std::sin(u), z}.normalized();
      surface.normals.insert(surface.normals.end(), {f32(normal.x), f32(normal.y), f32(normal.z)});
    }
  }
  const auto stride = static_cast<std::uint32_t>(tubularSegments + 1);
  for (std::uint32_t j = 1; j <= static_cast<std::uint32_t>(radialSegments); ++j) {
    for (std::uint32_t i = 1; i <= static_cast<std::uint32_t>(tubularSegments); ++i) {
      const std::uint32_t a = stride * j + i - 1, b = stride * (j - 1) + i - 1, c = stride * (j - 1) + i, d = stride * j + i;
      surface.indices.insert(surface.indices.end(), {a, b, d, b, c, d});
    }
  }
  return surface;
}

std::optional<SprueHandlePick> pickSprueHandle(const Ray& ray, const std::vector<SprueHandle>& handles) {
  std::optional<SprueHandlePick> best;
  for (std::size_t index = 0; index < handles.size(); ++index) {
    const SprueHandle& handle = handles[index];
    // The ray in the ring's own frame (rotation only: the pick ring is not scaled while nothing is being dragged).
    const Ray local{rotateInverse(handle.orientation, ray.origin - handle.position), rotateInverse(handle.orientation, ray.direction)};
    const IndexedSurface fallback = handle.pickMesh ? IndexedSurface{} : torusSurface(handle.radiusMm, handle.targetTubeMm());
    const IndexedSurface& target = handle.pickMesh ? *handle.pickMesh : fallback;
    double nearest = 0;
    bool hit = false;
    for (std::size_t t = 0; t + 2 < target.indices.size(); t += 3) {
      const auto vertex = [&](std::uint32_t i) { return Vec3{target.positions[i * 3ull], target.positions[i * 3ull + 1], target.positions[i * 3ull + 2]}; };
      if (const auto distance = intersectFrontFace(local, vertex(target.indices[t]), vertex(target.indices[t + 1]), vertex(target.indices[t + 2]))) {
        if (!hit || *distance < nearest) {
          nearest = *distance;
          hit = true;
        }
      }
    }
    if (hit && (!best || nearest < best->distance)) best = SprueHandlePick{static_cast<int>(index), nearest};
  }
  return best;
}

std::optional<double> normalizeHandleDiameter(const SprueHandle& handle, double diameterMm) {
  return handle.opening == SprueHandleOpening::Top ? normalizeSprueDiameterMm(diameterMm, handle.entryNeckDiameterMm)
                                                   : normalizeSprueEntryNeckDiameterMm(diameterMm, handle.mainDiameterMm);
}

std::optional<double> dragDiameter(const SprueHandle& handle, double dxPixels, double dyPixels, bool shiftHeld) {
  const double pixels = dxPixels - dyPixels * 0.25;
  const double raw = handle.diameterMm() + pixels * kSprueDiameterSensitivityMmPerPixel;
  // JavaScript's Math.round rounds halves up, unlike std::round.
  const double adjusted = shiftHeld ? raw : std::floor(raw / kSprueDiameterSnapMm + 0.5) * kSprueDiameterSnapMm;
  return normalizeHandleDiameter(handle, adjusted);
}

std::string diameterLabel(double diameterMm) {
  char buffer[64];
  std::snprintf(buffer, sizeof buffer, "\xC3\x98 %.2f mm", diameterMm);  // "Ø" in UTF-8
  return buffer;
}

bool diameterLabelWarns(const SprueHandle& handle, double diameterMm) {
  return diameterMm <= handle.minimumDiameterMm() || diameterMm >= handle.maximumDiameterMm();
}

unsigned handleColorRgb(const std::string& status, SprueHandleVisual visual) {
  if (visual == SprueHandleVisual::Active) return kSprueHandleActiveRgb;
  if (visual == SprueHandleVisual::Hover) return kSprueHandleHoverRgb;
  return status == "pending" ? kSprueHandlePendingRgb : status == "invalid" ? kSprueHandleInvalidRgb : kSprueHandleColorRgb;
}

double handleOpacity(SprueHandleVisual visual) { return visual == SprueHandleVisual::Idle ? kSprueHandleIdleOpacity : 1.0; }
double handleVisualScale(SprueHandleVisual visual) { return visual == SprueHandleVisual::Idle ? 1.0 : visual == SprueHandleVisual::Hover ? 1.08 : 1.12; }

}  // namespace craft
