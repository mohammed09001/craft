#include "mold/Registration.h"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <numbers>

#include "geometry/MeshAnalysis.h"
#include "geometry/SignedDistance.h"

namespace craft {

namespace {

constexpr double kInf = std::numeric_limits<double>::infinity();

const Axis kAxes[3] = {Axis::X, Axis::Y, Axis::Z};
int ax(Axis a) { return static_cast<int>(a); }

std::pair<Axis, Axis> otherAxes(Axis a) {
  return a == Axis::X ? std::pair{Axis::Y, Axis::Z} : a == Axis::Y ? std::pair{Axis::X, Axis::Z}
                                                                    : std::pair{Axis::X, Axis::Y};
}

Point3 direction(Axis axis, double sign) {
  Point3 p;
  p[ax(axis)] = sign;
  return p;
}

std::string hashString(const std::string& value) { return finishHash(hashText(value)); }

/// Number(x.toFixed(3)).
double toFixed3(double value) {
  char buffer[64];
  std::snprintf(buffer, sizeof(buffer), "%.3f", value);
  return std::strtod(buffer, nullptr);
}

Point3 pointAtInterface(const RegistrationInterface& iface, Axis u, bool vCorridor, double fixedCoord,
                        double along) {
  Point3 p;
  for (Axis a : kAxes) {
    if (a == iface.axis) p[ax(a)] = iface.planeCoordinateMm;
    else if (a == u) p[ax(a)] = vCorridor ? fixedCoord : along;
    else p[ax(a)] = vCorridor ? along : fixedCoord;
  }
  return p;
}

Point3 cross(const Point3& a, const Point3& b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
Point3 scale(const Point3& v, double s) { return {v.x * s, v.y * s, v.z * s}; }
Point3 add(const Point3& a, const Point3& b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
Point3 normalize(const Point3& v) {
  const double len = std::hypot(v.x, v.y, v.z);
  return len > 1e-9 ? scale(v, 1 / len) : Point3{0, 0, 1};
}

struct InterfaceCandidate {
  const MoldBody* bodyA = nullptr;
  const MoldBody* bodyB = nullptr;
  Axis axis = Axis::X;
  double plane = 0;
  double area = 0;
  Bounds3 bounds;
};

std::optional<InterfaceCandidate> bestAxisForPair(const MoldBody& left, const MoldBody& right, double toleranceMm) {
  std::optional<InterfaceCandidate> best;
  for (Axis axis : kAxes) {
    const int a = ax(axis);
    const bool leftBefore = std::fabs(left.bounds.max[a] - right.bounds.min[a]) <= toleranceMm;
    const bool rightBefore = std::fabs(right.bounds.max[a] - left.bounds.min[a]) <= toleranceMm;
    if (!leftBefore && !rightBefore) continue;
    const auto [u, v] = otherAxes(axis);
    const double uLo = std::max(left.bounds.min[ax(u)], right.bounds.min[ax(u)]);
    const double uHi = std::min(left.bounds.max[ax(u)], right.bounds.max[ax(u)]);
    const double vLo = std::max(left.bounds.min[ax(v)], right.bounds.min[ax(v)]);
    const double vHi = std::min(left.bounds.max[ax(v)], right.bounds.max[ax(v)]);
    const double area = (uHi - uLo) * (vHi - vLo);
    if (area <= toleranceMm * toleranceMm) continue;
    InterfaceCandidate candidate;
    candidate.bodyA = leftBefore ? &left : &right;
    candidate.bodyB = leftBefore ? &right : &left;
    candidate.axis = axis;
    candidate.plane = candidate.bodyA->bounds.max[a];
    candidate.area = area;
    for (int i = 0; i < 3; ++i) {
      candidate.bounds.min[i] = std::max(left.bounds.min[i], right.bounds.min[i]);
      candidate.bounds.max[i] = std::min(left.bounds.max[i], right.bounds.max[i]);
    }
    candidate.bounds.min[a] = candidate.plane;
    candidate.bounds.max[a] = candidate.plane;
    if (!best || area > best->area || (area == best->area && a < ax(best->axis))) best = candidate;
  }
  return best;
}

RegistrationInterface toMoldInterface(const InterfaceCandidate& c) {
  RegistrationInterface iface;
  const std::string signature = c.bodyA->id + ":" + c.bodyB->id + ":" + axisName(c.axis) + ":" + jsNumberToString(c.plane);
  iface.id = "mold-interface:" + hashString(signature);
  iface.bodyAId = c.bodyA->id;
  iface.bodyBId = c.bodyB->id;
  iface.axis = c.axis;
  iface.planeCoordinateMm = c.plane;
  iface.matingBounds = c.bounds;
  iface.assemblyDirection = direction(c.axis, 1);
  return iface;
}

bool pointSafeFromRegions(const Point3& pt, double radius, const std::vector<RegistrationProtectedRegion>& regions,
                          const RegistrationTolerancePolicy& policy, Axis axis) {
  const double margin = radius + policy.cavitySafetyMarginMm - 1e-4;
  const auto [u, v] = otherAxes(axis);
  for (const RegistrationProtectedRegion& region : regions) {
    const auto outside = [&](Axis a) {
      const int i = ax(a);
      return pt[i] < region.bounds.min[i] ? region.bounds.min[i] - pt[i]
                                          : pt[i] > region.bounds.max[i] ? pt[i] - region.bounds.max[i] : 0.0;
    };
    if (std::hypot(outside(u), outside(v)) < margin) return false;
  }
  return true;
}

bool pointSafeFromExclusions(const Point3& pt, double radiusMm, const std::vector<RegistrationExclusionZone>& zones,
                             double marginMm) {
  for (const RegistrationExclusionZone& zone : zones) {
    if (std::hypot(pt.x - zone.anchor.x, pt.y - zone.anchor.y, pt.z - zone.anchor.z) <
        radiusMm + zone.radiusMm + marginMm - 1e-4) {
      return false;
    }
  }
  return true;
}

}  // namespace

std::string jsNumberToString(double value) {
  if (std::isnan(value)) return "NaN";
  if (std::isinf(value)) return value < 0 ? "-Infinity" : "Infinity";
  if (value == 0) return "0";
  // ECMAScript Number::toString: take the shortest round-trip digits and place
  // the decimal point (or exponent) by the spec's rules.
  char buffer[64];
  const auto result = std::to_chars(buffer, buffer + sizeof(buffer), std::fabs(value), std::chars_format::scientific);
  const std::string text(buffer, result.ptr);  // d[.ddd]e[+-]xx
  const std::size_t e = text.find('e');
  std::string digits;
  for (std::size_t i = 0; i < e; ++i) {
    if (text[i] != '.') digits += text[i];
  }
  const int k = static_cast<int>(digits.size());
  const int n = std::atoi(text.c_str() + e + 1) + 1;  // value = 0.digits * 10^n
  std::string out;
  if (k <= n && n <= 21) {
    out = digits + std::string(static_cast<std::size_t>(n - k), '0');
  } else if (0 < n && n <= 21) {
    out = digits.substr(0, static_cast<std::size_t>(n)) + "." + digits.substr(static_cast<std::size_t>(n));
  } else if (-6 < n && n <= 0) {
    out = "0." + std::string(static_cast<std::size_t>(-n), '0') + digits;
  } else {
    const int exponent = n - 1;
    out = digits.substr(0, 1) + (k > 1 ? "." + digits.substr(1) : "") + "e" + (exponent < 0 ? "-" : "+") +
          std::to_string(std::abs(exponent));
  }
  return value < 0 ? "-" + out : out;
}
const char* keySideName(KeySide side) {
  switch (side) {
    case KeySide::Left: return "left";
    case KeySide::Right: return "right";
    case KeySide::Top: return "top";
    case KeySide::Bottom: return "bottom";
  }
  return "left";
}

RegistrationTolerancePolicy resolveRegistrationTolerance(const std::optional<RegistrationManufacturingProfile>& profile) {
  const std::optional<double> accuracy = profile ? profile->xyAccuracyMm : std::nullopt;
  const std::optional<double> nozzle = profile ? profile->nozzleDiameterMm : std::nullopt;
  const bool resin = profile && profile->process == "resin";
  RegistrationTolerancePolicy p;
  p.radialClearanceMm = resin ? std::max(0.15, accuracy.value_or(0.08) * 1.8)
                              : std::max({0.3, accuracy.value_or(0.15) * 1.8, nozzle.value_or(0.4) * 0.6});
  p.minimumWallMm = resin ? std::max(1.0, accuracy.value_or(0.08) * 8) : std::max(1.2, nozzle.value_or(0.4) * 3);
  p.minimumFeatureRadiusMm = resin ? std::max(0.6, accuracy.value_or(0.08) * 6) : std::max(0.8, nozzle.value_or(0.4) * 2);
  p.maximumFeatureRadiusMm = !profile ? 2.5 : (resin ? 10.0 : 15.0);
  p.policyId = !profile ? "registration-conservative-fdm-v1" : "registration-" + profile->process + "-v1";
  p.booleanToleranceMm = std::max(1e-6, accuracy.value_or(0.05) * 1e-3);
  p.cavitySafetyMarginMm = std::max(1.0, p.minimumWallMm);
  p.outerEdgeMarginMm = std::max(1.0, p.minimumWallMm);
  return p;
}

RegistrationSizingPolicy normalMoldRegistrationSizingPolicy() { return RegistrationSizingPolicy{}; }

RegistrationSizingPolicy automaticSegmentationRegistrationSizingPolicy() {
  RegistrationSizingPolicy policy;
  policy.policyId = "registration-sizing-automatic-segmentation-v5";
  policy.preferredNominalWidthMm = 30;
  policy.profileSearchOrder = ProfileSearchOrder::PreferredFirst;
  policy.placementStrategy = PlacementStrategy::CavityWallCentered;
  return policy;
}

RegistrationTolerancePolicy applyRegistrationSizingToTolerancePolicy(const RegistrationTolerancePolicy& tolerance,
                                                                    const RegistrationSizingPolicy& sizing) {
  RegistrationTolerancePolicy result = tolerance;
  result.maximumFeatureRadiusMm = std::max(tolerance.maximumFeatureRadiusMm, sizing.preferredNominalWidthMm / 2);
  return result;
}

std::vector<RegistrationInterface> detectMatingInterfaces(const std::vector<MoldBody>& bodies, double toleranceMm) {
  std::vector<const MoldBody*> sorted;
  for (const MoldBody& b : bodies) sorted.push_back(&b);
  std::sort(sorted.begin(), sorted.end(), [](const MoldBody* l, const MoldBody* r) { return l->id < r->id; });
  std::vector<InterfaceCandidate> candidates;
  for (std::size_t l = 0; l < sorted.size(); ++l) {
    for (std::size_t r = l + 1; r < sorted.size(); ++r) {
      if (auto c = bestAxisForPair(*sorted[l], *sorted[r], toleranceMm)) candidates.push_back(*c);
    }
  }
  std::stable_sort(candidates.begin(), candidates.end(), [](const InterfaceCandidate& a, const InterfaceCandidate& b) {
    if (a.area != b.area) return a.area > b.area;
    return a.bodyA->id + ":" + a.bodyB->id + ":" + axisName(a.axis) <
           b.bodyA->id + ":" + b.bodyB->id + ":" + axisName(b.axis);
  });
  std::vector<RegistrationInterface> interfaces;
  for (const InterfaceCandidate& c : candidates) interfaces.push_back(toMoldInterface(c));
  return interfaces;
}

std::optional<RegistrationInterface> detectPrimaryMatingInterface(const std::vector<MoldBody>& bodies, double toleranceMm) {
  const auto interfaces = detectMatingInterfaces(bodies, toleranceMm);
  return interfaces.empty() ? std::nullopt : std::optional<RegistrationInterface>(interfaces.front());
}

std::vector<RegistrationLayoutAttempt> planRegistrationLayout(
    const RegistrationInterface& moldInterface, const std::vector<MoldBody>& bodies,
    const std::vector<RegistrationProtectedRegion>& protectedRegions, const RegistrationTolerancePolicy& policy,
    const std::vector<RegistrationExclusionZone>& exclusionZones, const std::vector<RegistrationInterface>* allInterfaces,
    const RegistrationSizingPolicy& sizingPolicy) {
  const auto [u, v] = otherAxes(moldInterface.axis);
  const int ui = ax(u), vi = ax(v);
  const double spanU = moldInterface.matingBounds.max[ui] - moldInterface.matingBounds.min[ui];
  const double spanV = moldInterface.matingBounds.max[vi] - moldInterface.matingBounds.min[vi];
  const double minSpan = std::min(spanU, spanV);

  const RegistrationProtectedRegion* cavityRegion = nullptr;
  for (const auto& region : protectedRegions) {
    if (region.kind == "cavity") {
      cavityRegion = &region;
      break;
    }
  }

  const auto wallCenteredCoord = [&](KeySide side) -> std::optional<double> {
    if (!cavityRegion) return std::nullopt;
    const int a = (side == KeySide::Left || side == KeySide::Right) ? ui : vi;
    const double exteriorMin = moldInterface.matingBounds.min[a];
    const double exteriorMax = moldInterface.matingBounds.max[a];
    const double cavityMin = std::max(cavityRegion->bounds.min[a], exteriorMin);
    const double cavityMax = std::min(cavityRegion->bounds.max[a], exteriorMax);
    const bool nearExteriorMin = side == KeySide::Left || side == KeySide::Bottom;
    const double wallMin = nearExteriorMin ? exteriorMin : cavityMax;
    const double wallMax = nearExteriorMin ? cavityMin : exteriorMax;
    if (wallMax - wallMin <= 0) return std::nullopt;
    return (wallMin + wallMax) / 2;
  };

  if (minSpan < policy.minimumFeatureRadiusMm * 2) return {};

  const MoldBody* bodyA = nullptr;
  const MoldBody* bodyB = nullptr;
  for (const MoldBody& b : bodies) {
    if (b.id == moldInterface.bodyAId) bodyA = &b;
    if (b.id == moldInterface.bodyBId) bodyB = &b;
  }
  const int axisIndex = ax(moldInterface.axis);
  const double thicknessA = bodyA->bounds.max[axisIndex] - bodyA->bounds.min[axisIndex];
  const double thicknessB = bodyB->bounds.max[axisIndex] - bodyB->bounds.min[axisIndex];
  const double minBodyThickness = std::min(thicknessA, thicknessB);

  const std::string femaleBodyId =
      (thicknessA > thicknessB || (thicknessA == thicknessB && bodyA->id < bodyB->id)) ? bodyA->id : bodyB->id;
  const std::string maleBodyId = femaleBodyId == bodyA->id ? bodyB->id : bodyA->id;
  const bool isTwoPart = bodies.size() <= 2 || (allInterfaces != nullptr && allInterfaces->size() == 1);

  const double preferredCapMm = sizingPolicy.preferredNominalWidthMm;
  const double preferredFloorMm = kRegistrationManufacturingMinimumWidthMm;
  const double preferredDepthReferenceMm = std::min(preferredCapMm, 10.0);
  const double preferredDepthCapMm = preferredDepthReferenceMm * 0.4;
  const double preferredDepthFloorMm = preferredDepthReferenceMm * 0.32;
  struct Profile {
    double keyWidthMm, keyDepthMm;
  };
  const Profile profiles[4] = {
      {toFixed3(std::min(3.2, std::max(kRegistrationManufacturingMinimumWidthMm, minSpan * 0.06))),
       toFixed3(std::min(1.4, std::max(1.0, minBodyThickness * 0.08)))},
      {toFixed3(std::min(3.8, std::max(2.8, minSpan * 0.08))), toFixed3(std::min(1.6, std::max(1.2, minBodyThickness * 0.10)))},
      {toFixed3(std::min(4.5, std::max(3.2, minSpan * 0.1))), toFixed3(std::min(1.8, std::max(1.4, minBodyThickness * 0.12)))},
      {toFixed3(std::min(preferredCapMm, std::max(preferredFloorMm, minSpan * 0.11))),
       toFixed3(std::min(preferredDepthCapMm, std::max(preferredDepthFloorMm, minBodyThickness * 0.13)))},
  };
  std::vector<Profile> ordered(profiles, profiles + 4);
  if (sizingPolicy.profileSearchOrder == ProfileSearchOrder::PreferredFirst) {
    ordered = {profiles[3], profiles[2], profiles[1], profiles[0]};
  }

  const double outerMargin = policy.outerEdgeMarginMm + 0.2;
  if (minBodyThickness <= policy.minimumWallMm * 1.05) return {};

  const bool preferVerticalCorridors = isTwoPart || spanV >= spanU;
  const std::vector<KeySide> sidesToUse = preferVerticalCorridors ? std::vector<KeySide>{KeySide::Left, KeySide::Right}
                                                                  : std::vector<KeySide>{KeySide::Bottom, KeySide::Top};

  std::vector<RegistrationLayoutAttempt> attempts;
  for (const Profile& profile : ordered) {
    const double keyWidthMm = profile.keyWidthMm, keyDepthMm = profile.keyDepthMm;
    if (keyWidthMm / 2 > policy.maximumFeatureRadiusMm + 1e-9) continue;
    const double leadInMm = toFixed3(std::min(0.5, keyDepthMm * 0.35));

    struct IntersectionExclusion {
      bool alongU;
      double coord, radius;
    };
    std::vector<IntersectionExclusion> intersectionExclusions;
    if (allInterfaces != nullptr && allInterfaces->size() > 1) {
      const double protectRadius = std::max(keyWidthMm * 2.0, policy.minimumWallMm * 2.5) + policy.radialClearanceMm;
      for (const RegistrationInterface& other : *allInterfaces) {
        if (other.id == moldInterface.id) continue;
        if (other.axis != moldInterface.axis) {
          const double c = other.planeCoordinateMm;
          if (c >= moldInterface.matingBounds.min[ui] && c <= moldInterface.matingBounds.max[ui]) {
            intersectionExclusions.push_back({true, c, protectRadius});
          }
          if (c >= moldInterface.matingBounds.min[vi] && c <= moldInterface.matingBounds.max[vi]) {
            intersectionExclusions.push_back({false, c, protectRadius});
          }
        }
      }
    }

    std::vector<RegistrationFeature> planned;
    for (KeySide side : sidesToUse) {
      const bool isVCorridor = side == KeySide::Left || side == KeySide::Right;
      const int lenAxis = isVCorridor ? vi : ui;
      const double fullSpan = isVCorridor ? spanV : spanU;
      const double lenMin = moldInterface.matingBounds.min[lenAxis];
      const double lenMax = moldInterface.matingBounds.max[lenAxis];

      const auto edgeCorridorCoord = [&]() {
        if (side == KeySide::Left) return moldInterface.matingBounds.min[ui] + outerMargin + keyWidthMm / 2;
        if (side == KeySide::Right) return moldInterface.matingBounds.max[ui] - outerMargin - keyWidthMm / 2;
        if (side == KeySide::Bottom) return moldInterface.matingBounds.min[vi] + outerMargin + keyWidthMm / 2;
        return moldInterface.matingBounds.max[vi] - outerMargin - keyWidthMm / 2;
      };
      const double fixedCoord = sizingPolicy.placementStrategy == PlacementStrategy::CavityWallCentered
                                    ? wallCenteredCoord(side).value_or(edgeCorridorCoord())
                                    : edgeCorridorCoord();

      double startSpan, endSpan;
      if (isTwoPart) {
        if (side == KeySide::Left) {
          startSpan = lenMin + outerMargin + fullSpan * 0.02;
          endSpan = lenMax - outerMargin - fullSpan * 0.02;
        } else {
          startSpan = lenMin + outerMargin + fullSpan * 0.11;
          endSpan = lenMax - outerMargin - fullSpan * 0.11;
        }
      } else {
        startSpan = lenMin + outerMargin + fullSpan * 0.06;
        endSpan = lenMax - outerMargin - fullSpan * 0.06;
      }
      if (endSpan - startSpan < policy.minimumFeatureRadiusMm * 4) continue;

      const double step = 2.0;
      struct Interval {
        double start, end;
      };
      std::vector<Interval> safeIntervals;
      std::optional<double> currentStart, lastValid;
      for (double c = startSpan; c <= endSpan; c += step) {
        const Point3 pt = pointAtInterface(moldInterface, u, isVCorridor, fixedCoord, c);
        bool inIntersectionZone = false;
        for (const IntersectionExclusion& excl : intersectionExclusions) {
          const bool relevant = (!excl.alongU && isVCorridor) || (excl.alongU && !isVCorridor);
          if (relevant && std::fabs(c - excl.coord) < excl.radius) {
            inIntersectionZone = true;
            break;
          }
        }
        const bool isSafe = !inIntersectionZone &&
                            pointSafeFromRegions(pt, keyWidthMm / 2, protectedRegions, policy, moldInterface.axis) &&
                            pointSafeFromExclusions(pt, keyWidthMm / 2, exclusionZones, policy.cavitySafetyMarginMm);
        if (isSafe) {
          if (!currentStart) currentStart = c;
          lastValid = c;
        } else if (currentStart && lastValid) {
          safeIntervals.push_back({*currentStart, *lastValid});
          currentStart.reset();
          lastValid.reset();
        }
      }
      if (currentStart && lastValid) safeIntervals.push_back({*currentStart, *lastValid});

      const double minViableSegmentLength = std::max(keyWidthMm * 1.5, 5.0);
      std::vector<Interval> validSegments;
      for (const Interval& seg : safeIntervals) {
        if (seg.end - seg.start >= minViableSegmentLength) validSegments.push_back(seg);
      }

      const std::string logicalKeyId = "key:" + moldInterface.id + ":" + keySideName(side);
      const bool towardFemale = femaleBodyId == moldInterface.bodyBId;
      const Point3 normalVector = direction(moldInterface.axis, towardFemale ? 1 : -1);

      for (std::size_t segIdx = 0; segIdx < validSegments.size(); ++segIdx) {
        const Interval& seg = validSegments[segIdx];
        const double segLength = seg.end - seg.start;
        const Point3 startPt = pointAtInterface(moldInterface, u, isVCorridor, fixedCoord, seg.start);
        const Point3 endPt = pointAtInterface(moldInterface, u, isVCorridor, fixedCoord, seg.end);
        const Point3 anchor{(startPt.x + endPt.x) / 2, (startPt.y + endPt.y) / 2, (startPt.z + endPt.z) / 2};
        const double dirLen = std::hypot(endPt.x - startPt.x, endPt.y - startPt.y, endPt.z - startPt.z);
        const Point3 dirVector = dirLen > 1e-9 ? Point3{(endPt.x - startPt.x) / dirLen, (endPt.y - startPt.y) / dirLen,
                                                        (endPt.z - startPt.z) / dirLen}
                                               : Point3{0, 1, 0};
        RegistrationFeature feature;
        feature.id = "registration-feature:" +
                     hashString(moldInterface.id + ":" + keySideName(side) + ":" + std::to_string(segIdx) + ":" +
                                jsNumberToString(startPt.x) + ":" + jsNumberToString(startPt.y) + ":" +
                                jsNumberToString(startPt.z));
        feature.interfaceId = moldInterface.id;
        feature.logicalKeyId = logicalKeyId;
        feature.segmentIndex = static_cast<int>(segIdx);
        feature.side = side;
        feature.maleBodyId = maleBodyId;
        feature.femaleBodyId = femaleBodyId;
        feature.startPoint = startPt;
        feature.endPoint = endPt;
        feature.anchor = anchor;
        feature.direction = dirVector;
        feature.normal = normalVector;
        feature.geometry = {keyWidthMm, keyDepthMm, toFixed3(segLength), 10, leadInMm, 0.5};
        feature.clearanceMm = policy.radialClearanceMm;
        planned.push_back(std::move(feature));
      }
    }
    if (!planned.empty()) {
      RegistrationLayoutAttempt attempt;
      attempt.radiusMm = keyWidthMm / 2;
      attempt.requestedCounts = {planned.size()};
      attempt.candidates = std::move(planned);
      attempts.push_back(std::move(attempt));
    }
  }
  return attempts;
}

// --- wall thickness -----------------------------------------------------------

struct WallThicknessField::Impl {
  std::vector<std::unique_ptr<SignedDistanceField>> keepOut;
};

WallThicknessField::WallThicknessField(const std::vector<RegistrationProtectedRegion>& regions, double toleranceMm)
    : impl_(std::make_unique<Impl>()) {
  for (const RegistrationProtectedRegion& region : regions) {
    if (!region.mesh) continue;
    impl_->keepOut.push_back(std::make_unique<SignedDistanceField>(*region.mesh, toleranceMm));
  }
}
WallThicknessField::~WallThicknessField() = default;
WallThicknessField::WallThicknessField(WallThicknessField&&) noexcept = default;

double WallThicknessField::clearanceAt(const Point3& p) const {
  if (impl_->keepOut.empty()) return kInf;
  double best = kInf;
  for (const auto& field : impl_->keepOut) best = std::min(best, -field->signedDistance(p));
  return best;
}

namespace {

/// Exact remaining wall to the female body's own external surface.
double externalSurfaceClearanceMm(const RegistrationFeature& feature, const RegistrationInterface& iface,
                                  const MoldBody& femaleBody) {
  const bool towardFemale = feature.femaleBodyId == iface.bodyBId;
  const int axis = ax(iface.axis);
  const double sign = towardFemale ? 1 : -1;
  const double tipCoordinate = feature.anchor[axis] + sign * feature.geometry.depthMm;
  const double depthClearance = sign > 0 ? femaleBody.bounds.max[axis] - tipCoordinate
                                         : tipCoordinate - femaleBody.bounds.min[axis];
  const auto [u, v] = otherAxes(iface.axis);
  const double halfWidth = feature.geometry.widthMm / 2;
  const bool isVDir = std::fabs(feature.direction[ax(v)]) > 0.5;
  const int latAxis = isVDir ? ax(u) : ax(v);
  const int lenAxis = isVDir ? ax(v) : ax(u);
  const double latCenter = feature.startPoint[latAxis];
  const double minLat = latCenter - halfWidth, maxLat = latCenter + halfWidth;
  const double minLen = std::min(feature.startPoint[lenAxis], feature.endPoint[lenAxis]);
  const double maxLen = std::max(feature.startPoint[lenAxis], feature.endPoint[lenAxis]);
  const double lateralClearance =
      std::min({minLat - femaleBody.bounds.min[latAxis], femaleBody.bounds.max[latAxis] - maxLat,
                minLen - femaleBody.bounds.min[lenAxis], femaleBody.bounds.max[lenAxis] - maxLen});
  return std::min(depthClearance, lateralClearance);
}

/// Deterministic sample points on the key socket surface.
std::vector<Point3> linearKeySamplePoints(const RegistrationFeature& feature, const RegistrationInterface& iface) {
  const bool towardFemale = feature.femaleBodyId == iface.bodyBId;
  const Point3 axisNormal = scale(iface.assemblyDirection, towardFemale ? 1 : -1);
  const Point3 start = feature.startPoint, end = feature.endPoint;
  const double length = feature.geometry.lengthMm, width = feature.geometry.widthMm, depth = feature.geometry.depthMm;
  const Point3 dir = normalize({end.x - start.x, end.y - start.y, end.z - start.z});
  const Point3 lat = normalize(cross(axisNormal, dir));
  std::vector<Point3> points;
  const int lengthSteps = std::max(3, static_cast<int>(std::ceil(length / 10)));
  for (int i = 0; i <= lengthSteps; ++i) {
    const double t = static_cast<double>(i) / lengthSteps;
    const Point3 basePt{start.x + dir.x * length * t, start.y + dir.y * length * t, start.z + dir.z * length * t};
    for (double depthFrac : {0.3, 0.7, 1.0}) {
      const Point3 depthPt = add(basePt, scale(axisNormal, depth * depthFrac));
      for (double latOffset : {-width / 2, 0.0, width / 2}) points.push_back(add(depthPt, scale(lat, latOffset)));
    }
  }
  return points;
}

}  // namespace

std::vector<RegistrationFeature> filterByWallThickness(const std::vector<RegistrationFeature>& candidates,
                                                       const RegistrationInterface& moldInterface,
                                                       const WallThicknessField& field, const MoldBody& femaleBody,
                                                       const RegistrationTolerancePolicy& policy) {
  const double epsilon = 1e-4;
  std::vector<RegistrationFeature> safe;
  for (const RegistrationFeature& feature : candidates) {
    const double extCl = externalSurfaceClearanceMm(feature, moldInterface, femaleBody);
    double minSdfCl = kInf;
    for (const Point3& p : linearKeySamplePoints(feature, moldInterface)) minSdfCl = std::min(minSdfCl, field.clearanceAt(p));
    if (extCl < policy.minimumWallMm - epsilon || minSdfCl < policy.minimumWallMm - epsilon) continue;
    safe.push_back(feature);
  }
  return safe;
}

// --- generation service ----------------------------------------------------------

namespace {

MeshPayload featureToolMesh(const RegistrationFeature& feature, bool female, double overlapMm) {
  const double clearance = female ? feature.clearanceMm : 0;
  const double nominalWidth = feature.geometry.widthMm;
  const double nominalDepth = feature.geometry.depthMm;
  const double taperAngleRad = feature.geometry.taperAngleDeg * std::numbers::pi / 180;
  const double leadIn = std::min(feature.geometry.leadInMm, nominalDepth * 0.4);
  const double coreDepth = nominalDepth - leadIn;
  const double widthBase = nominalWidth + 2 * clearance;
  const double widthMid = std::max(0.5, widthBase - 2 * coreDepth * std::tan(taperAngleRad));
  const double widthTip = std::max(0.2, widthMid - 2 * leadIn * std::tan(taperAngleRad + 0.2));

  const Point3 norm = feature.normal;
  const Point3 lat = normalize(cross(norm, feature.direction));
  const double halfBase = widthBase / 2, halfMid = widthMid / 2, halfTip = widthTip / 2;
  const double baseOffset = -overlapMm, midOffset = coreDepth;
  const double tipOffset = nominalDepth + (female ? feature.clearanceMm : 0);
  const Point3 p0 = feature.startPoint, p1 = feature.endPoint;
  const auto getPt = [&](const Point3& p, double normOff, double latOff) {
    return Point3{p.x + norm.x * normOff + lat.x * latOff, p.y + norm.y * normOff + lat.y * latOff,
                  p.z + norm.z * normOff + lat.z * latOff};
  };
  const Point3 v[12] = {
      getPt(p0, baseOffset, -halfBase), getPt(p0, baseOffset, halfBase), getPt(p1, baseOffset, halfBase),
      getPt(p1, baseOffset, -halfBase), getPt(p0, midOffset, -halfMid),  getPt(p0, midOffset, halfMid),
      getPt(p1, midOffset, halfMid),    getPt(p1, midOffset, -halfMid),  getPt(p0, tipOffset, -halfTip),
      getPt(p0, tipOffset, halfTip),    getPt(p1, tipOffset, halfTip),   getPt(p1, tipOffset, -halfTip)};
  MeshPayload mesh;
  for (const Point3& p : v) mesh.positions.insert(mesh.positions.end(), {p.x, p.y, p.z});
  mesh.indices = {0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,   // core sides
                  4, 8, 9, 4, 9, 5, 5, 9, 10, 5, 10, 6, 6, 10, 11, 6, 11, 7, 7, 11, 8, 7, 8, 4,  // lead-in
                  0, 1, 2, 0, 2, 3,                                                        // base cap
                  8, 11, 10, 8, 10, 9};                                                    // tip cap
  return mesh;
}

RegistrationReport makeReport(const std::string& sourceRevision, const std::string& reasonCode, const std::string& message,
                              const RegistrationTolerancePolicy& policy, std::vector<RegistrationInterface> interfaces = {},
                              std::vector<RegistrationFeature> features = {},
                              std::vector<RegistrationAttemptReport> attempts = {}) {
  RegistrationReport report;
  report.sourceRevision = sourceRevision;
  report.status = reasonCode == "registration_generated" ? "generated" : "blocked";
  report.reasonCode = reasonCode;
  report.message = message;
  report.tolerancePolicy = policy;
  report.interfaces = std::move(interfaces);
  report.features = std::move(features);
  report.attempts = std::move(attempts);
  return report;
}

RegistrationResult blocked(const RegistrationRequest& request, RegistrationReport report) {
  return {request.bodies, std::move(report)};
}

}  // namespace

RegistrationResult generateRegistration(IMeshGeometryEngine& engine, const RegistrationRequest& request) {
  const RegistrationSizingPolicy& sizingPolicy = request.sizingPolicy;
  const RegistrationTolerancePolicy policy =
      applyRegistrationSizingToTolerancePolicy(resolveRegistrationTolerance(request.manufacturingProfile), sizingPolicy);
  if (!request.eligible) {
    return blocked(request, makeReport(request.sourceRevision, "registration_ineligible",
                                       "Registration is not applicable to this mold workflow.", policy));
  }
  const std::vector<RegistrationInterface> interfaces = detectMatingInterfaces(request.bodies, policy.booleanToleranceMm * 10);
  if (interfaces.empty()) {
    return blocked(request, makeReport(request.sourceRevision, "registration_interface_not_found",
                                       "No planar mating interface was detected; the valid mold was preserved.", policy));
  }

  std::vector<RegistrationAttemptReport> attemptReports;
  std::vector<RegistrationFeature> selectedFeatures;
  std::vector<RegistrationExclusionZone> exclusionZones;
  bool wallThicknessLimited = false;

  std::optional<WallThicknessField> field;
  try {
    field.emplace(request.protectedRegions, policy.booleanToleranceMm);
  } catch (const std::exception& error) {
    return blocked(request, makeReport(request.sourceRevision, "registration_boolean_failed", error.what(), policy, interfaces));
  }

  for (const RegistrationInterface& moldInterface : interfaces) {
    const auto attempts = planRegistrationLayout(moldInterface, request.bodies, request.protectedRegions, policy,
                                                 exclusionZones, &interfaces, sizingPolicy);
    std::optional<std::vector<RegistrationFeature>> selectedForInterface;
    if (!attempts.empty()) {
      const std::string& femaleBodyId = attempts.front().candidates.front().femaleBodyId;
      const MoldBody* femaleBody = nullptr;
      for (const MoldBody& b : request.bodies) {
        if (b.id == femaleBodyId) femaleBody = &b;
      }
      for (const RegistrationLayoutAttempt& attempt : attempts) {
        const auto exactSafe = filterByWallThickness(attempt.candidates, moldInterface, *field, *femaleBody, policy);
        if (exactSafe.size() < attempt.candidates.size()) wallThicknessLimited = true;
        for (std::size_t requestedCount : attempt.requestedCounts) {
          // selectSpreadLayout is a pass-through in the reference: null only when empty.
          const bool chosen = !exactSafe.empty();
          attemptReports.push_back({attempt.radiusMm, requestedCount, chosen ? exactSafe.size() : 0});
          if (chosen && !selectedForInterface) selectedForInterface = exactSafe;
        }
        if (selectedForInterface) break;
      }
    }
    if (!selectedForInterface) {
      const std::string reasonCode = wallThicknessLimited ? "registration_insufficient_wall_thickness"
                                                          : "registration_insufficient_safe_area";
      const std::string subject = "Linear alignment could not be generated for interface " + moldInterface.id +
                                  " (bodies " + moldInterface.bodyAId + "/" + moldInterface.bodyBId + ") due to ";
      const std::string message = subject + (wallThicknessLimited ? "wall thickness constraints" : "safe area clearance constraints") +
                                  ". The cavity remains valid.";
      return blocked(request, makeReport(request.sourceRevision, reasonCode, message, policy, interfaces, {}, attemptReports));
    }
    for (const RegistrationFeature& feature : *selectedForInterface) {
      selectedFeatures.push_back(feature);
      exclusionZones.push_back({feature.anchor, feature.geometry.widthMm / 2});
    }
  }
  field.reset();

  try {
    std::map<std::string, SolidPtr> sourceSolids;
    std::vector<SolidPtr> protectedSolids;
    for (const MoldBody& body : request.bodies) {
      sourceSolids[body.id] = engine.solidFromMesh(body.mesh, policy.booleanToleranceMm, "Mesh preparation");
    }
    for (const RegistrationProtectedRegion& region : request.protectedRegions) {
      if (region.mesh) protectedSolids.push_back(engine.solidFromMesh(*region.mesh, policy.booleanToleranceMm, "Mesh preparation"));
    }
    const double overlapMm = std::max(policy.booleanToleranceMm * 20, 0.01);
    const double toleranceCubed = std::pow(policy.booleanToleranceMm, 3);
    std::map<std::string, std::vector<SolidPtr>> maleToolsByBody, femaleToolsByBody;
    std::map<std::int64_t, FaceRole> roleMap;
    for (const RegistrationFeature& feature : selectedFeatures) {
      const SolidPtr maleTool = engine.asOriginal(engine.solidFromMesh(featureToolMesh(feature, false, overlapMm), 1e-5, "Mesh preparation"));
      const SolidPtr femaleTool = engine.asOriginal(engine.solidFromMesh(featureToolMesh(feature, true, overlapMm), 1e-5, "Mesh preparation"));
      roleMap[maleTool->originalId()] = FaceRole::RegistrationKey;
      roleMap[femaleTool->originalId()] = FaceRole::RegistrationKey;
      maleToolsByBody[feature.maleBodyId].push_back(maleTool);
      femaleToolsByBody[feature.femaleBodyId].push_back(femaleTool);
      for (const SolidPtr& protectedSolid : protectedSolids) {
        const double maleCollision = engine.intersect(maleTool, protectedSolid)->volume();
        const double femaleCollision = engine.intersect(femaleTool, protectedSolid)->volume();
        if (maleCollision > toleranceCubed || femaleCollision > toleranceCubed) {
          throw CodedError("registration_validation_failed", "Registration geometry intersects protected functional geometry.");
        }
      }
    }

    RegistrationResult result;
    for (const MoldBody& body : request.bodies) {
      const auto male = maleToolsByBody.find(body.id);
      const auto female = femaleToolsByBody.find(body.id);
      if (male == maleToolsByBody.end() && female == femaleToolsByBody.end()) {
        result.bodies.push_back(body);
        continue;
      }
      SolidPtr current = sourceSolids.at(body.id);
      const auto assertValid = [&](const SolidPtr& s) {
        if (!s->isValid()) throw CodedError("registration_boolean_failed", "Registration Boolean failed: invalid solid.");
      };
      if (male != maleToolsByBody.end()) {
        current = engine.unionOf({current, engine.unionOf(male->second)});
        assertValid(current);
      }
      if (female != femaleToolsByBody.end()) {
        current = engine.subtract(current, engine.unionOf(female->second));
        assertValid(current);
      }
      const double volume = current->volume();
      MeshPayload mesh = engine.meshFromSolid(current, roleMap, "Mesh export");
      bool finite = std::isfinite(volume);
      for (double v : mesh.positions) finite = finite && std::isfinite(v);
      if (current->isEmpty() || !finite || volume <= toleranceCubed || mesh.indices.size() < 12) {
        throw CodedError("registration_validation_failed", "Registration result geometry is invalid.");
      }
      std::size_t positiveComponents = 0;
      for (const SolidPtr& component : engine.decompose(current)) {
        if (component->volume() > toleranceCubed) ++positiveComponents;
      }
      if (positiveComponents > 1) {
        throw CodedError("registration_validation_failed", "Registration created an unacceptable detached fragment.");
      }
      MoldBody next = body;
      next.bounds = current->bounds();
      next.centroid = next.bounds.center();
      next.triangleCount = current->triangleCount();
      next.volumeMm3 = volume;
      std::string applied;
      for (const RegistrationFeature& f : selectedFeatures) {
        if (f.maleBodyId == body.id || f.femaleBodyId == body.id) applied += (applied.empty() ? "" : ":") + f.id;
      }
      next.geometryVersion = "registration:" + hashString(body.geometryVersion + ":" + applied);
      next.mesh = std::move(mesh);
      result.bodies.push_back(std::move(next));
    }
    std::vector<RegistrationFeature> generated = selectedFeatures;
    for (RegistrationFeature& f : generated) f.status = "generated";
    result.report = makeReport(
        request.sourceRevision, "registration_generated",
        std::to_string(generated.size()) + " complementary linear registration keys were generated across " +
            std::to_string(interfaces.size()) + " mating interface" + (interfaces.size() == 1 ? "" : "s") + ".",
        policy, interfaces, generated, attemptReports);
    return result;
  } catch (const CodedError& error) {
    const std::string code = error.code() == "registration_validation_failed" ? "registration_validation_failed"
                                                                              : "registration_boolean_failed";
    return blocked(request, makeReport(request.sourceRevision, code, error.what(), policy, interfaces, {}, attemptReports));
  } catch (const std::exception& error) {
    return blocked(request, makeReport(request.sourceRevision, "registration_boolean_failed", error.what(), policy,
                                       interfaces, {}, attemptReports));
  }
}

// --- lifecycle ---------------------------------------------------------------------

namespace {

MeshPayload protectedCylinderMesh(const Point3& start, const Point3& direction, double depth, double radius) {
  const double length = std::hypot(direction.x, direction.y, direction.z);
  const Point3 axis{direction.x / length, direction.y / length, direction.z / length};
  const Point3 reference = std::fabs(axis.z) < 0.9 ? Point3{0, 0, 1} : Point3{0, 1, 0};
  const Point3 cr{reference.y * axis.z - reference.z * axis.y, reference.z * axis.x - reference.x * axis.z,
                  reference.x * axis.y - reference.y * axis.x};
  const double crossLength = std::hypot(cr.x, cr.y, cr.z);
  const Point3 u{cr.x / crossLength, cr.y / crossLength, cr.z / crossLength};
  const Point3 v{axis.y * u.z - axis.z * u.y, axis.z * u.x - axis.x * u.z, axis.x * u.y - axis.y * u.x};
  MeshPayload mesh;
  const int segments = 32;
  for (int ring = 0; ring < 2; ++ring) {
    for (int i = 0; i < segments; ++i) {
      const double angle = static_cast<double>(i) / segments * std::numbers::pi * 2;
      const double c = std::cos(angle) * radius, s = std::sin(angle) * radius, offset = ring * depth;
      mesh.positions.insert(mesh.positions.end(),
                            {start.x + axis.x * offset + u.x * c + v.x * s, start.y + axis.y * offset + u.y * c + v.y * s,
                             start.z + axis.z * offset + u.z * c + v.z * s});
    }
  }
  const auto startCenter = static_cast<std::uint32_t>(mesh.positions.size() / 3);
  mesh.positions.insert(mesh.positions.end(), {start.x, start.y, start.z});
  const auto endCenter = static_cast<std::uint32_t>(mesh.positions.size() / 3);
  mesh.positions.insert(mesh.positions.end(),
                        {start.x + axis.x * depth, start.y + axis.y * depth, start.z + axis.z * depth});
  for (int i = 0; i < segments; ++i) {
    const auto next = static_cast<std::uint32_t>((i + 1) % segments);
    const auto a = static_cast<std::uint32_t>(i), b = next;
    const auto c = static_cast<std::uint32_t>(segments + i), d = static_cast<std::uint32_t>(segments) + next;
    mesh.indices.insert(mesh.indices.end(), {a, c, b, b, c, d, startCenter, a, b, endCenter, d, c});
  }
  return mesh;
}

RegistrationProtectedRegion sprueRegion(const SprueDefinition& sprue) {
  const double radius = sprue.profile.mainDiameterMm / 2 + sprue.tolerancePolicy.surfaceToleranceMm;
  const Point3 end{sprue.position.x + sprue.inwardDirection.x * sprue.depthMm,
                   sprue.position.y + sprue.inwardDirection.y * sprue.depthMm,
                   sprue.position.z + sprue.inwardDirection.z * sprue.depthMm};
  RegistrationProtectedRegion region;
  region.id = sprue.operationId;
  region.kind = "sprue";
  region.bounds = {{std::min(sprue.position.x, end.x) - radius, std::min(sprue.position.y, end.y) - radius,
                    std::min(sprue.position.z, end.z) - radius},
                   {std::max(sprue.position.x, end.x) + radius, std::max(sprue.position.y, end.y) + radius,
                    std::max(sprue.position.z, end.z) + radius}};
  region.mesh = protectedCylinderMesh(sprue.position, sprue.inwardDirection, sprue.depthMm, radius);
  return region;
}

}  // namespace

RegistrationDependencySnapshot buildRegistrationDependencySnapshot(const RegistrationDependencyInput& input) {
  RegistrationDependencySnapshot snapshot;
  snapshot.bodies = input.bodies;
  for (MoldBody& body : snapshot.bodies) {
    if (body.geometryVersion.empty()) body.geometryVersion = meshGeometryVersion(body.id, body.mesh, body.bounds);
  }
  snapshot.sizingPolicy = input.sizingPolicy;
  snapshot.manufacturingProfile = input.manufacturingProfile;
  const RegistrationTolerancePolicy tolerance = applyRegistrationSizingToTolerancePolicy(
      resolveRegistrationTolerance(input.manufacturingProfile), input.sizingPolicy);
  snapshot.interfaces = detectMatingInterfaces(snapshot.bodies, tolerance.booleanToleranceMm * 10);
  if (input.cavityMesh != nullptr) {
    RegistrationProtectedRegion cavity;
    cavity.id = "product-cavity";
    cavity.kind = "cavity";
    cavity.bounds = input.cavityBounds;
    cavity.mesh = *input.cavityMesh;
    snapshot.protectedRegions.push_back(std::move(cavity));
  }
  for (const SprueDefinition& sprue : input.sprues) snapshot.protectedRegions.push_back(sprueRegion(sprue));

  // Revision: a stable digest over every committed upstream dependency.
  char buffer[256];
  const auto num = [&](double v) {
    std::snprintf(buffer, sizeof(buffer), "%.17g", v);
    return std::string(buffer);
  };
  const auto boundsText = [&](const Bounds3& b) {
    return num(b.min.x) + "," + num(b.min.y) + "," + num(b.min.z) + "," + num(b.max.x) + "," + num(b.max.y) + "," + num(b.max.z);
  };
  std::string text = "bodies:";
  for (const MoldBody& b : snapshot.bodies) text += b.id + "@" + b.geometryVersion + "@" + boundsText(b.bounds) + ";";
  text += "|interfaces:";
  for (const auto& i : snapshot.interfaces) {
    text += i.id + "@" + i.bodyAId + "@" + i.bodyBId + "@" + axisName(i.axis) + "@" + num(i.planeCoordinateMm) + "@" +
            boundsText(i.matingBounds) + ";";
  }
  text += "|mold:" + input.definitionId + "@" + boundsText(input.selectionBoxBounds) + "@" +
          boundsText(input.referenceBlockBounds) + "@" + num(input.referenceBlockClearanceMm);
  text += "|planes:";
  for (const CuttingPlane& p : input.cuttingPlanes) {
    text += std::string(faceIdName(p.sourceFace)) + "@" + num(p.normalizedPosition) + "@" + (p.enabled ? "1" : "0") + "@" +
            std::to_string(p.creationOrder) + ";";
  }
  text += "|cavity:" + input.cavityRevision + "@" + boundsText(input.cavityBounds) + "@" + num(input.cavityClearanceMm) +
          "@" + input.cavityMethod;
  text += "|sprues:";
  for (const SprueDefinition& s : input.sprues) {
    text += s.operationId + "@" + num(s.position.x) + "," + num(s.position.y) + "," + num(s.position.z) + "@" +
            num(s.profile.mainDiameterMm) + "," + num(s.profile.entryNeckDiameterMm) + "," +
            num(s.profile.entryNeckLengthMm) + "@" + num(s.depthMm) + "@" + num(s.tolerancePolicy.surfaceToleranceMm) + ";";
  }
  text += "|sizing:" + input.sizingPolicy.policyId;
  if (input.manufacturingProfile) {
    text += "|profile:" + input.manufacturingProfile->process + "@" + num(input.manufacturingProfile->xyAccuracyMm.value_or(-1)) +
            "@" + num(input.manufacturingProfile->nozzleDiameterMm.value_or(-1));
  }
  snapshot.revision = "registration-input:" + hashString(text);
  return snapshot;
}

DerivedRegistrationState generateDerivedRegistration(IMeshGeometryEngine& engine, const RegistrationDependencySnapshot& snapshot) {
  DerivedRegistrationState state;
  state.revision = snapshot.revision;
  try {
    RegistrationRequest request;
    request.sourceRevision = snapshot.revision;
    request.bodies = snapshot.bodies;
    request.protectedRegions = snapshot.protectedRegions;
    request.manufacturingProfile = snapshot.manufacturingProfile;
    request.sizingPolicy = snapshot.sizingPolicy;
    RegistrationResult result = generateRegistration(engine, request);
    state.status = result.report.status == "generated" ? "generated" : "blocked";
    state.bodies = std::move(result.bodies);
    state.report = std::move(result.report);
  } catch (const std::exception& error) {
    const RegistrationTolerancePolicy tolerance = applyRegistrationSizingToTolerancePolicy(
        resolveRegistrationTolerance(snapshot.manufacturingProfile), snapshot.sizingPolicy);
    state.status = "failed";
    state.bodies = snapshot.bodies;
    state.report = makeReport(snapshot.revision, "registration_boolean_failed", error.what(), tolerance, snapshot.interfaces);
  }
  return state;
}

}  // namespace craft
