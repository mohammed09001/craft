#include "master/MasterWorkingMoldConstructor.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>

#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "master/MasterMultiLabel.h"
#include "mold/Registration.h"  // jsNumberToString

namespace craft {

namespace {

constexpr double kReleaseSweepSafetyFactor = 1.1;
constexpr int kRegistrationPinSegments = 16;
constexpr double kRegistrationPinRadiusMm = 2.5;
constexpr double kPinInsetFractions[3] = {-0.3, 0, 0.3};
constexpr int kCoarseSampleCount = 32;
constexpr int kRefinementIterations = 12;

struct Envelope {
  Bounds3 bounds;
  GeometryTolerancePolicy policy;
  double volumeTolerance;
};

Point3 neg(const Point3& v) { return {-v.x, -v.y, -v.z}; }

double sweepClearance(const Bounds3& b, const Point3& d) {
  const double extent = std::fabs(d.x) * (b.max.x - b.min.x) + std::fabs(d.y) * (b.max.y - b.min.y) + std::fabs(d.z) * (b.max.z - b.min.z);
  return extent * kReleaseSweepSafetyFactor + 1;
}

[[noreturn]] void fail(const std::string& message) { throw std::runtime_error(message); }

}  // namespace

// --- geometry helpers ---------------------------------------------------------------------------

OrthonormalBasis basisAround(const Point3& w) {
  const Point3 reference = std::fabs(w.x) < 0.9 ? Point3{1, 0, 0} : Point3{0, 1, 0};
  Point3 u{reference.y * w.z - reference.z * w.y, reference.z * w.x - reference.x * w.z, reference.x * w.y - reference.y * w.x};
  const double uLength = jsHypot3(u.x, u.y, u.z);
  u.x /= uLength; u.y /= uLength; u.z /= uLength;
  const Point3 v{w.y * u.z - w.z * u.y, w.z * u.x - w.x * u.z, w.x * u.y - w.y * u.x};
  return {u, v, w};
}

double workingMoldEnvelopeWallMm(const Bounds3& b, double minimumToolingWallMm) {
  const double largest = std::max({b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z});
  const double scaled = largest * 0.15;
  return std::min(40.0, std::max({5.0, minimumToolingWallMm * 2, scaled}));
}

Bounds3 inflatedBounds(const Bounds3& b, double wall) {
  return {{b.min.x - wall, b.min.y - wall, b.min.z - wall}, {b.max.x + wall, b.max.y + wall, b.max.z + wall}};
}

MeshPayload halfSpacePrismPayload(const Point3& direction, double offsetMm, const Bounds3& bounds) {
  const OrthonormalBasis basis = basisAround(direction);
  const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
  const double diagonal = jsHypot3(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const double radius = diagonal * 0.75 + 1;
  const double depth = diagonal * 1.5 + 2;
  const Point3 center{(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2};
  const double along = w.x * center.x + w.y * center.y + w.z * center.z;
  const Point3 faceCenter{center.x + w.x * (offsetMm - along), center.y + w.y * (offsetMm - along), center.z + w.z * (offsetMm - along)};
  MeshPayload mesh;
  const auto corner = [&](double iu, double iv, double iw) {
    mesh.positions.push_back(faceCenter.x + u.x * radius * iu + v.x * radius * iv + w.x * depth * iw);
    mesh.positions.push_back(faceCenter.y + u.y * radius * iu + v.y * radius * iv + w.y * depth * iw);
    mesh.positions.push_back(faceCenter.z + u.z * radius * iu + v.z * radius * iv + w.z * depth * iw);
  };
  corner(-1, -1, 0); corner(1, -1, 0); corner(1, 1, 0); corner(-1, 1, 0);
  corner(-1, -1, 1); corner(1, -1, 1); corner(1, 1, 1); corner(-1, 1, 1);
  mesh.indices = {0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5};
  return mesh;
}

MeshPayload cylinderPrismPayload(const Point3& direction, const Point3& center, double radiusMm, double lengthMm, int segments) {
  const OrthonormalBasis basis = basisAround(direction);
  const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
  constexpr double kPi = 3.14159265358979323846;
  MeshPayload mesh;
  for (int side = 0; side < 2; ++side) {
    const double sign = side == 0 ? -1.0 : 1.0;
    for (int i = 0; i < segments; ++i) {
      const double angle = (2 * kPi * i) / segments;
      const double ou = std::cos(angle) * radiusMm, ov = std::sin(angle) * radiusMm;
      mesh.positions.push_back(center.x + u.x * ou + v.x * ov + sign * w.x * lengthMm / 2);
      mesh.positions.push_back(center.y + u.y * ou + v.y * ov + sign * w.y * lengthMm / 2);
      mesh.positions.push_back(center.z + u.z * ou + v.z * ov + sign * w.z * lengthMm / 2);
    }
  }
  const std::uint32_t bottom = static_cast<std::uint32_t>(mesh.positions.size() / 3);
  mesh.positions.insert(mesh.positions.end(), {center.x - w.x * lengthMm / 2, center.y - w.y * lengthMm / 2, center.z - w.z * lengthMm / 2});
  const std::uint32_t top = static_cast<std::uint32_t>(mesh.positions.size() / 3);
  mesh.positions.insert(mesh.positions.end(), {center.x + w.x * lengthMm / 2, center.y + w.y * lengthMm / 2, center.z + w.z * lengthMm / 2});
  const std::uint32_t n = static_cast<std::uint32_t>(segments);
  for (std::uint32_t i = 0; i < n; ++i) {
    const std::uint32_t j = (i + 1) % n;
    mesh.indices.insert(mesh.indices.end(), {bottom, j, i, top, n + i, n + j, i, j, n + j, i, n + j, n + i});
  }
  return mesh;
}

// --- demold verification -------------------------------------------------------------------------------

DemoldVerificationResult verifyDemoldTranslationByVector(IMeshGeometryEngine& engine, const SolidPtr& tool, const SolidPtr& target,
                                                         const Point3& direction, double clearanceDistanceMm, double toleranceMm,
                                                         double volumeToleranceMm3, int coarseSampleCount, bool wantCollisionDistance) {
  const Bounds3 toolBounds = tool->bounds();
  const Bounds3 targetBounds = target->bounds();
  const double gap = std::max(toleranceMm, 1e-9);   // boxes this far apart cannot touch, whatever the rounding of the translation
  const auto overlapVolumeAt = [&](double distance) {
    const Point3 shift{direction.x * distance, direction.y * distance, direction.z * distance};
    if (targetBounds.min.x + shift.x > toolBounds.max.x + gap || targetBounds.max.x + shift.x < toolBounds.min.x - gap ||
        targetBounds.min.y + shift.y > toolBounds.max.y + gap || targetBounds.max.y + shift.y < toolBounds.min.y - gap ||
        targetBounds.min.z + shift.z > toolBounds.max.z + gap || targetBounds.max.z + shift.z < toolBounds.min.z - gap)
      return 0.0;
    const SolidPtr translated = engine.translate(target, direction.x * distance, direction.y * distance, direction.z * distance);
    return engine.intersect(tool, translated)->volume();
  };
  const auto collidesAt = [&](double distance) { return overlapVolumeAt(distance) > volumeToleranceMm3; };

  const double start = std::max(toleranceMm * 2, 1e-6);
  const double safeClearance = std::max(clearanceDistanceMm, start);
  const double step = std::max((safeClearance - start) / coarseSampleCount, toleranceMm);

  double previousClear = start;
  std::optional<double> firstCollision;
  for (double distance = start; distance <= safeClearance; distance += step) {
    if (collidesAt(distance)) { firstCollision = distance; break; }
    previousClear = distance;
  }
  if (!firstCollision) return {true, std::nullopt};

  double lo = previousClear, hi = *firstCollision;
  if (!wantCollisionDistance) return {false, hi};
  for (int i = 0; i < kRefinementIterations; ++i) {
    const double mid = (lo + hi) / 2;
    if (collidesAt(mid)) hi = mid; else lo = mid;
  }
  return {false, hi};
}

// --- release verification -----------------------------------------------------------------------------------

namespace {

struct ReleaseResult {
  std::vector<WorkingMoldReleaseStep> steps;
  int candidatesSwept = 0;
};

ReleaseResult verifyWorkingMoldRelease(IMeshGeometryEngine& engine, const WorkingMoldConstructionInput& input, const Envelope& env,
                                       const SolidPtr& part, const std::vector<SolidPtr>& carved,
                                       const std::vector<Point3>& extraCandidates, bool greedy) {
  ReleaseResult result;
  std::vector<int> remaining;
  for (std::size_t i = 0; i < carved.size(); ++i) remaining.push_back(static_cast<int>(i));

  const auto tryRelease = [&](int pieceIndex) -> std::optional<std::pair<Point3, double>> {
    const PlannedPieceRegion& piece = input.pieces[static_cast<std::size_t>(pieceIndex)];
    std::vector<Point3> candidates{piece.releaseDirection};
    if (piece.plane) {
      candidates.push_back(piece.plane->direction);
      candidates.push_back(neg(piece.plane->direction));
    }
    candidates.push_back(neg(piece.releaseDirection));
    for (const Point3& d : extraCandidates) candidates.push_back(d);
    for (const Point3& d : extraCandidates) candidates.push_back(neg(d));

    SolidPtr remainingUnion;
    for (int sibling : remaining) {
      if (sibling == pieceIndex) continue;
      const SolidPtr& s = carved[static_cast<std::size_t>(sibling)];
      remainingUnion = remainingUnion ? engine.unionOf({remainingUnion, s}) : s;
    }
    for (const Point3& candidate : candidates) {
      ++result.candidatesSwept;
      const double clearance = sweepClearance(env.bounds, candidate);
      const auto vsPart = verifyDemoldTranslationByVector(engine, part, carved[static_cast<std::size_t>(pieceIndex)], candidate, clearance,
                                                          env.policy.surfaceToleranceMm, env.volumeTolerance);
      const bool siblingsOk = !vsPart.removable ? false : !remainingUnion || verifyDemoldTranslationByVector(engine, remainingUnion, carved[static_cast<std::size_t>(pieceIndex)],
                                                                                 candidate, clearance, env.policy.surfaceToleranceMm,
                                                                                 env.volumeTolerance).removable;
      if (vsPart.removable && siblingsOk) return std::make_pair(candidate, clearance);
    }
    return std::nullopt;
  };

  if (greedy) {
    while (!remaining.empty()) {
      std::optional<std::tuple<int, Point3, double>> released;
      for (int pieceIndex : remaining) {
        if (auto r = tryRelease(pieceIndex)) { released = std::make_tuple(pieceIndex, r->first, r->second); break; }
      }
      if (!released) {
        std::string stuck;
        for (int i : remaining) stuck += (stuck.empty() ? "" : ", ") + std::to_string(i + 1);
        fail("working mold piece(s) " + stuck + " cannot release against each other in any tried order or direction.");
      }
      remaining.erase(std::find(remaining.begin(), remaining.end(), std::get<0>(*released)));
      result.steps.push_back({static_cast<int>(result.steps.size()), std::get<0>(*released), std::get<1>(*released), std::get<2>(*released), true});
    }
    return result;
  }

  for (int pieceIndex = static_cast<int>(carved.size()) - 1; pieceIndex >= 0; --pieceIndex) {
    const auto r = tryRelease(pieceIndex);
    if (!r) fail("working mold piece " + std::to_string(pieceIndex + 1) + " cannot release along either polarity of its final registered direction.");
    remaining.erase(std::find(remaining.begin(), remaining.end(), pieceIndex));
    result.steps.push_back({static_cast<int>(result.steps.size()), pieceIndex, r->first, r->second, true});
  }
  return result;
}

// --- registration ---------------------------------------------------------------------------------------------

struct Placement {
  int pieceIndex, siblingIndex;
  Point3 center, direction;
};

std::vector<Placement> candidatePlacements(const WorkingMoldConstructionInput& input, const Bounds3& env, double radius, double clearance,
                                           double pinHeight) {
  std::vector<Placement> placements;
  const double margin = radius * 1.5;
  const int catchAll = static_cast<int>(input.pieces.size()) - 1;
  for (int pieceIndex = 0; pieceIndex < static_cast<int>(input.pieces.size()); ++pieceIndex) {
    const auto& plane = input.pieces[static_cast<std::size_t>(pieceIndex)].plane;
    if (!plane) continue;
    const OrthonormalBasis basis = basisAround(plane->direction);
    const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
    const Point3 center{(env.min.x + env.max.x) / 2, (env.min.y + env.max.y) / 2, (env.min.z + env.max.z) / 2};
    const double along = w.x * center.x + w.y * center.y + w.z * center.z;
    const Point3 faceCenter{center.x + w.x * (plane->offsetMm - along), center.y + w.y * (plane->offsetMm - along),
                            center.z + w.z * (plane->offsetMm - along)};
    const double sx = env.max.x - env.min.x, sy = env.max.y - env.min.y, sz = env.max.z - env.min.z;
    const double spanU = std::fabs(u.x) * sx + std::fabs(u.y) * sy + std::fabs(u.z) * sz;
    const double spanV = std::fabs(v.x) * sx + std::fabs(v.y) * sy + std::fabs(v.z) * sz;
    for (double insetU : kPinInsetFractions) {
      for (double insetV : kPinInsetFractions) {
        const Point3 point{faceCenter.x + u.x * spanU * insetU + v.x * spanV * insetV,
                           faceCenter.y + u.y * spanU * insetU + v.y * spanV * insetV,
                           faceCenter.z + u.z * spanU * insetU + v.z * spanV * insetV};
        bool within = true;
        for (int k = 0; k < static_cast<int>(input.pieces.size()) && within; ++k) {
          if (k == pieceIndex) continue;
          const auto& other = input.pieces[static_cast<std::size_t>(k)].plane;
          if (!other) continue;
          const double otherAlong = other->direction.x * point.x + other->direction.y * point.y + other->direction.z * point.z;
          if (otherAlong >= other->offsetMm - margin) within = false;
        }
        if (!within) continue;
        const double reach = pinHeight / 2;
        const Point3 ends[2] = {{point.x - plane->direction.x * reach, point.y - plane->direction.y * reach, point.z - plane->direction.z * reach},
                                {point.x + plane->direction.x * reach, point.y + plane->direction.y * reach, point.z + plane->direction.z * reach}};
        bool inside = true;
        for (const Point3& e : ends) {
          inside = inside && e.x >= env.min.x + margin && e.x <= env.max.x - margin && e.y >= env.min.y + margin && e.y <= env.max.y - margin &&
                   e.z >= env.min.z + margin && e.z <= env.max.z - margin;
        }
        if (!inside) continue;
        const Bounds3& sb = input.sourceBounds;
        const double distanceToPart = jsHypot3(std::max({sb.min.x - point.x, 0.0, point.x - sb.max.x}),
                                               std::max({sb.min.y - point.y, 0.0, point.y - sb.max.y}),
                                               std::max({sb.min.z - point.z, 0.0, point.z - sb.max.z}));
        if (distanceToPart <= radius + clearance) continue;
        placements.push_back({pieceIndex, catchAll, point, plane->direction});
      }
    }
  }
  return placements;
}

WorkingMoldRegistrationPlan placeRegistration(IMeshGeometryEngine& engine, const WorkingMoldConstructionInput& input, const Envelope& env,
                                              const SolidPtr& part, std::vector<SolidPtr>& carved) {
  WorkingMoldRegistrationPlan plan;
  const std::vector<SolidPtr> originals = carved;
  const double radius = std::min(kRegistrationPinRadiusMm, input.minimumToolingWallMm);
  if (radius < 1) { plan.reason = "walls too thin for working-mold alignment pins"; return plan; }
  const double pinHeight = radius * 2;
  const auto placements = candidatePlacements(input, env.bounds, radius, env.policy.surfaceToleranceMm, pinHeight);

  std::map<int, int> perPiecePlaced;
  for (const Placement& placement : placements) {
    const int placed = perPiecePlaced[placement.pieceIndex];
    if (placed >= 2) continue;
    const std::vector<SolidPtr> before = carved;
    const SolidPtr male = engine.solidFromMesh(cylinderPrismPayload(placement.direction, placement.center, radius, pinHeight, kRegistrationPinSegments),
                                               env.policy.booleanToleranceMm, "Registration pin");
    carved[static_cast<std::size_t>(placement.pieceIndex)] = engine.unionOf({carved[static_cast<std::size_t>(placement.pieceIndex)], male});
    carved[static_cast<std::size_t>(placement.siblingIndex)] = engine.subtract(carved[static_cast<std::size_t>(placement.siblingIndex)], male);
    try {
      verifyWorkingMoldRelease(engine, input, env, part, carved, {}, false);
    } catch (const std::runtime_error&) {
      carved = before;
      continue;
    }
    plan.features.push_back({"wm-pin-" + std::to_string(placement.pieceIndex) + "-" + std::to_string(placed),
                             "wm-interface-plane-" + std::to_string(placement.pieceIndex), "pin", placement.pieceIndex,
                             placement.siblingIndex, placement.center, placement.direction});
    perPiecePlaced[placement.pieceIndex] = placed + 1;
  }

  int prismPieces = 0;
  for (const auto& p : input.pieces) if (p.plane) ++prismPieces;
  for (int pieceIndex = 0; pieceIndex < prismPieces; ++pieceIndex) {
    const bool has = std::any_of(plan.features.begin(), plan.features.end(), [&](const auto& f) { return f.malePieceIndex == pieceIndex; });
    if (!has) {
      plan.reason = "no interference-safe working-mold pin placement on interface " + std::to_string(pieceIndex);
      return plan;
    }
  }
  if (plan.features.empty()) { plan.reason = "no planar working-mold interface available for pins"; return plan; }

  try {
    verifyWorkingMoldRelease(engine, input, env, part, carved, {}, false);
  } catch (const std::runtime_error& error) {
    carved = originals;
    plan.features.clear();
    plan.reason = std::string("automatic alignment features rejected by final release verification: ") + error.what();
    return plan;
  }
  return plan;
}

}  // namespace

// --- construction ---------------------------------------------------------------------------------------------

// --- height-field parting tools ---------------------------------------------------------------------------------------

namespace {

/// Extruded simple polygon (the curve projected onto the plane perpendicular to `direction`), spanning the envelope along it.
SolidPtr ruledPartingSurfaceSolid(IMeshGeometryEngine& engine, const std::vector<Point3>& curvePoints, const Point3& direction, const Bounds3& bounds) {
  if (curvePoints.size() < 3) fail("a ruled parting surface needs at least 3 curve points.");
  const OrthonormalBasis basis = basisAround(direction);
  const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
  const double diagonal = jsHypot3(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const double height = diagonal * 1.5 + 2;
  std::vector<std::pair<double, double>> polygon;
  for (const Point3& p : curvePoints) polygon.emplace_back(p.x * u.x + p.y * u.y + p.z * u.z, p.x * v.x + p.y * v.y + p.z * v.z);
  const SolidPtr extruded = engine.extrudePolygon(polygon, height, true);
  return engine.transform(extruded, {u.x, u.y, u.z, v.x, v.y, v.z, w.x, w.y, w.z, 0, 0, 0});
}

}  // namespace

SolidPtr heightFieldPartingSolid(IMeshGeometryEngine& engine, const std::vector<Point3>& curvePoints, const Point3& flatDirection, double flatOffsetMm,
                                 const Bounds3& bounds, double toleranceMm, std::optional<double> outerRadiusMm) {
  if (curvePoints.size() < 3) fail("a height-field parting surface needs at least 3 curve points.");
  const OrthonormalBasis basis = basisAround(flatDirection);
  const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
  struct Local { double pu, pv, h; };
  std::vector<Local> local;
  for (const Point3& p : curvePoints) {
    local.push_back({p.x * u.x + p.y * u.y + p.z * u.z, p.x * v.x + p.y * v.y + p.z * v.z, p.x * w.x + p.y * w.y + p.z * w.z - flatOffsetMm});
  }
  double sumU = 0, sumV = 0, sumH = 0;
  for (const Local& l : local) { sumU += l.pu; }
  for (const Local& l : local) { sumV += l.pv; }
  for (const Local& l : local) { sumH += l.h; }
  const double n0 = static_cast<double>(local.size());
  const double centroidU = sumU / n0, centroidV = sumV / n0, centroidH = sumH / n0;

  std::vector<Local> sorted = local;
  std::stable_sort(sorted.begin(), sorted.end(), [&](const Local& a, const Local& b) {
    return std::atan2(a.pv - centroidV, a.pu - centroidU) - std::atan2(b.pv - centroidV, b.pu - centroidU) < 0;
  });
  double maxCurveRadius = 0;
  for (const Local& l : sorted) maxCurveRadius = std::max(maxCurveRadius, jsHypot3(l.pu - centroidU, l.pv - centroidV, 0));

  const double diagonal = jsHypot3(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const double outerRadius = outerRadiusMm ? *outerRadiusMm : diagonal + maxCurveRadius + 1;
  if (outerRadius <= maxCurveRadius) fail("a height-field parting surface's outer radius must comfortably exceed the curve's own extent.");
  const double depth = diagonal * 1.5 + 2;

  MeshPayload mesh;
  const auto pushVertex = [&](double pu, double pv, double hRelative) {
    const double height = flatOffsetMm + hRelative;
    mesh.positions.push_back(u.x * pu + v.x * pv + w.x * height);
    mesh.positions.push_back(u.y * pu + v.y * pv + w.y * height);
    mesh.positions.push_back(u.z * pu + v.z * pv + w.z * height);
    return static_cast<std::uint32_t>(mesh.positions.size() / 3 - 1);
  };
  const std::uint32_t centerIndex = pushVertex(centroidU, centroidV, centroidH);
  const std::size_t n = sorted.size();
  std::vector<std::uint32_t> curveIdx(n), outerIdx(n), ceilingIdx(n);
  std::vector<double> angles(n);
  for (std::size_t i = 0; i < n; ++i) {
    angles[i] = std::atan2(sorted[i].pv - centroidV, sorted[i].pu - centroidU);
    curveIdx[i] = pushVertex(sorted[i].pu, sorted[i].pv, sorted[i].h);
  }
  for (std::size_t i = 0; i < n; ++i) {
    const double outerU = centroidU + std::cos(angles[i]) * outerRadius;
    const double outerV = centroidV + std::sin(angles[i]) * outerRadius;
    outerIdx[i] = pushVertex(outerU, outerV, 0);
    ceilingIdx[i] = pushVertex(outerU, outerV, depth);
  }
  const std::uint32_t ceilingCenter = pushVertex(centroidU, centroidV, depth);
  const auto tri = [&](std::uint32_t a, std::uint32_t b, std::uint32_t c) { mesh.indices.insert(mesh.indices.end(), {a, b, c}); };
  const auto quad = [&](std::uint32_t a, std::uint32_t b, std::uint32_t c, std::uint32_t d) { tri(a, b, c); tri(a, c, d); };
  for (std::size_t i = 0; i < n; ++i) {
    const std::size_t next = (i + 1) % n;
    tri(centerIndex, curveIdx[next], curveIdx[i]);
    quad(curveIdx[i], curveIdx[next], outerIdx[next], outerIdx[i]);
    quad(outerIdx[i], outerIdx[next], ceilingIdx[next], ceilingIdx[i]);
    tri(ceilingCenter, ceilingIdx[i], ceilingIdx[next]);
  }
  SolidPtr solid = engine.solidFromMesh(mesh, toleranceMm, "Height-field parting-surface construction");
  if (!solid->isValid()) fail("Height-field parting-surface construction failed: invalid solid.");
  if (solid->volume() < 0) fail("height-field parting surface produced an inward-facing (negative-volume) solid.");
  return solid;
}

SolidPtr multiNeighborHeightFieldSolid(IMeshGeometryEngine& engine, const std::vector<std::vector<Point3>>& curveGroups, const Point3& flatDirection,
                                       double flatOffsetMm, const Bounds3& bounds, double toleranceMm) {
  if (curveGroups.empty()) fail("multiNeighborHeightFieldSolid needs at least one curve.");
  const OrthonormalBasis basis = basisAround(flatDirection);
  const Point3 &u = basis.u, &v = basis.v;
  constexpr int kCircleSegments = 32;
  constexpr double kPi = 3.14159265358979323846;
  SolidPtr tool = engine.solidFromMesh(halfSpacePrismPayload(flatDirection, flatOffsetMm, bounds), toleranceMm, "Mesh preparation");
  for (const std::vector<Point3>& curvePoints : curveGroups) {
    if (curvePoints.size() < 3) fail("a height-field parting surface needs at least 3 curve points.");
    struct Local { double pu, pv; };
    std::vector<Local> local;
    for (const Point3& p : curvePoints) local.push_back({p.x * u.x + p.y * u.y + p.z * u.z, p.x * v.x + p.y * v.y + p.z * v.z});
    double sumU = 0, sumV = 0;
    for (const Local& l : local) sumU += l.pu;
    for (const Local& l : local) sumV += l.pv;
    const double centroidU = sumU / static_cast<double>(local.size()), centroidV = sumV / static_cast<double>(local.size());
    double maxCurveRadius = 0;
    for (const Local& l : local) maxCurveRadius = std::max(maxCurveRadius, jsHypot3(l.pu - centroidU, l.pv - centroidV, 0));
    const double localRadius = maxCurveRadius * 2 + toleranceMm * 8 + 1;
    std::vector<Point3> footprint;
    for (int index = 0; index < kCircleSegments; ++index) {
      const double angle = (static_cast<double>(index) / kCircleSegments) * kPi * 2;
      const double pu = centroidU + std::cos(angle) * localRadius, pv = centroidV + std::sin(angle) * localRadius;
      footprint.push_back({u.x * pu + v.x * pv, u.y * pu + v.y * pv, u.z * pu + v.z * pv});
    }
    const SolidPtr footprintSolid = ruledPartingSurfaceSolid(engine, footprint, flatDirection, bounds);
    const SolidPtr localHeightField = heightFieldPartingSolid(engine, curvePoints, flatDirection, flatOffsetMm, bounds, toleranceMm, localRadius);
    const SolidPtr toolMinusFootprint = engine.subtract(tool, footprintSolid);
    const SolidPtr composed = engine.unionOf({toolMinusFootprint, localHeightField});
    if (!composed->isValid()) fail("Multi-neighbor height-field composition failed: invalid solid.");
    tool = composed;
  }
  return tool;
}

// --- simultaneous grid partition tools ----------------------------------------------------------------------------------------

namespace {

SolidPtr applyStolenMaterialExclusions(IMeshGeometryEngine& engine, SolidPtr tool, const std::vector<Point3>& otherPoints, const Point3& direction,
                                       double flatOffsetMm, const Bounds3& bounds, double toleranceMm) {
  const OrthonormalBasis basis = basisAround(direction);
  const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
  struct P { double pu, pv, h; };
  std::vector<P> stolen;
  for (const Point3& p : otherPoints) {
    const P q{p.x * u.x + p.y * u.y + p.z * u.z, p.x * v.x + p.y * v.y + p.z * v.z, p.x * w.x + p.y * w.y + p.z * w.z};
    if (q.h >= flatOffsetMm) stolen.push_back(q);
  }
  if (stolen.empty()) return tool;

  double uMin = INFINITY, uMax = -INFINITY, vMin = INFINITY, vMax = -INFINITY;
  for (const P& p : stolen) { uMin = std::min(uMin, p.pu); uMax = std::max(uMax, p.pu); vMin = std::min(vMin, p.pv); vMax = std::max(vMax, p.pv); }
  const double area = std::max(uMax - uMin, 1e-6) * std::max(vMax - vMin, 1e-6);
  const double spacing = std::sqrt(area / static_cast<double>(stolen.size()));
  const double linkRadius = std::max({spacing * 4, toleranceMm * 16, 1e-3});
  const double linkSq = linkRadius * linkRadius;

  std::vector<std::size_t> parent(stolen.size());
  for (std::size_t i = 0; i < parent.size(); ++i) parent[i] = i;
  const auto find = [&](std::size_t index) {
    std::size_t root = index;
    while (parent[root] != root) root = parent[root];
    std::size_t current = index;
    while (parent[current] != root) { const std::size_t next = parent[current]; parent[current] = root; current = next; }
    return root;
  };
  for (std::size_t i = 0; i < stolen.size(); ++i)
    for (std::size_t j = i + 1; j < stolen.size(); ++j) {
      const double du = stolen[i].pu - stolen[j].pu, dv = stolen[i].pv - stolen[j].pv;
      if (du * du + dv * dv <= linkSq) { const std::size_t ra = find(i), rb = find(j); if (ra != rb) parent[ra] = rb; }
    }
  std::vector<std::pair<std::size_t, std::vector<P>>> clusters;  // insertion ordered by first appearance of each root
  for (std::size_t i = 0; i < stolen.size(); ++i) {
    const std::size_t root = find(i);
    auto it = std::find_if(clusters.begin(), clusters.end(), [&](const auto& c) { return c.first == root; });
    if (it == clusters.end()) { clusters.emplace_back(root, std::vector<P>{}); it = clusters.end() - 1; }
    it->second.push_back(stolen[i]);
  }

  const double diagonal = jsHypot3(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  for (const auto& [root, cluster] : clusters) {
    (void)root;
    double sumU = 0, sumV = 0;
    for (const P& p : cluster) sumU += p.pu;
    for (const P& p : cluster) sumV += p.pv;
    const double centroidU = sumU / static_cast<double>(cluster.size()), centroidV = sumV / static_cast<double>(cluster.size());
    double maxRadius = 0, hMin = INFINITY, hMax = -INFINITY;
    for (const P& p : cluster) {
      maxRadius = std::max(maxRadius, jsHypot3(p.pu - centroidU, p.pv - centroidV, 0));
      hMin = std::min(hMin, p.h);
      hMax = std::max(hMax, p.h);
    }
    const double radiusMm = maxRadius + toleranceMm * 8 + 1e-3;
    const double marginH = std::max({toleranceMm * 8, (hMax - hMin) * 0.2, 1e-3});
    const double hLow = hMin - marginH;
    const double hHigh = flatOffsetMm + diagonal * 1.5 + 2;
    const double centerAlong = (hLow + hHigh) / 2;
    const double lengthMm = hHigh - hLow;
    const Point3 centerPoint{u.x * centroidU + v.x * centroidV + w.x * centerAlong, u.y * centroidU + v.y * centroidV + w.y * centerAlong,
                             u.z * centroidU + v.z * centroidV + w.z * centerAlong};
    const SolidPtr exclusion = engine.solidFromMesh(cylinderPrismPayload(direction, centerPoint, radiusMm, lengthMm, 24), toleranceMm, "Mesh preparation");
    const SolidPtr next = engine.subtract(tool, exclusion);
    if (!next->isValid()) fail("Assignment-exclusion parting-surface subtraction failed: invalid solid.");
    tool = next;
  }
  return tool;
}

}  // namespace

SolidPtr localBoundedAssignmentSolid(IMeshGeometryEngine& engine, const std::vector<Point3>& ownPoints, const std::vector<Point3>& otherPoints,
                                     const Point3& direction, const Bounds3& bounds, double toleranceMm, double ownPatchRadiusMm) {
  if (ownPoints.empty()) fail("a local-bounded assignment solid needs at least one own patch point.");
  const OrthonormalBasis basis = basisAround(direction);
  const Point3 &u = basis.u, &v = basis.v, &w = basis.w;
  struct P { double pu, pv, h; };
  std::vector<P> own;
  for (const Point3& p : ownPoints) own.push_back({p.x * u.x + p.y * u.y + p.z * u.z, p.x * v.x + p.y * v.y + p.z * v.z, p.x * w.x + p.y * w.y + p.z * w.z});
  double sumU = 0, sumV = 0;
  for (const P& p : own) sumU += p.pu;
  for (const P& p : own) sumV += p.pv;
  const double centroidU = sumU / static_cast<double>(own.size()), centroidV = sumV / static_cast<double>(own.size());
  double maxRadius = 0, flatOffsetMm = INFINITY;
  for (const P& p : own) {
    maxRadius = std::max(maxRadius, jsHypot3(p.pu - centroidU, p.pv - centroidV, 0));
    flatOffsetMm = std::min(flatOffsetMm, p.h);
  }
  flatOffsetMm -= 1e-4;
  const double footprintRadius = maxRadius + ownPatchRadiusMm * 2 + toleranceMm * 8 + std::max(maxRadius * 0.15, 1e-3);
  const double diagonal = jsHypot3(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const Point3 boundsCenter{(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2};
  const double centerAlong = boundsCenter.x * w.x + boundsCenter.y * w.y + boundsCenter.z * w.z;
  const Point3 footprintCenter{u.x * centroidU + v.x * centroidV + w.x * centerAlong, u.y * centroidU + v.y * centroidV + w.y * centerAlong,
                               u.z * centroidU + v.z * centroidV + w.z * centerAlong};
  const SolidPtr footprint = engine.solidFromMesh(cylinderPrismPayload(direction, footprintCenter, footprintRadius, diagonal * 4 + 4, 24), toleranceMm, "Mesh preparation");
  const SolidPtr flat = engine.solidFromMesh(halfSpacePrismPayload(direction, flatOffsetMm, bounds), toleranceMm, "Mesh preparation");
  const SolidPtr base = engine.intersect(footprint, flat);
  if (!base->isValid()) fail("Local-bounded assignment footprint intersection failed: invalid solid.");
  return applyStolenMaterialExclusions(engine, base, otherPoints, direction, flatOffsetMm, bounds, toleranceMm);
}

// --- construction ---------------------------------------------------------------------------------------------

WorkingMoldConstructionOutput constructWorkingMold(IMeshGeometryEngine& engine, const WorkingMoldConstructionInput& input, const CancellationToken& cancel) {
  const double wall = workingMoldEnvelopeWallMm(input.sourceBounds, input.minimumToolingWallMm);
  Envelope env;
  env.bounds = inflatedBounds(input.sourceBounds, wall);
  env.policy = buildGeometryTolerancePolicy(env.bounds, 0);
  env.volumeTolerance = std::max(env.policy.affectedVolumeToleranceMm3, 1e-3);

  MeshPayload partMesh;
  partMesh.positions.assign(input.sourcePositions.begin(), input.sourcePositions.end());
  partMesh.indices = input.sourceIndices;
  SolidPtr part;
  try {
    part = engine.solidFromMesh(partMesh, env.policy.booleanToleranceMm, "Mesh preparation");
  } catch (const CodedError& error) {
    // The reference WASM kernel throws its own status text when it rejects the source mesh.
    if (error.code() == "mesh_not_manifold") fail("Not manifold");
    throw;
  }
  SolidPtr negativeTool = part;
  if (input.releaseClearanceMm > 0) negativeTool = engine.minkowskiSphere(part, input.releaseClearanceMm, 16);

  // Construction MODE: multi-label (every piece carries triangles), simultaneous grid (every non-last piece carries a
  // grid and the last is the catch-all), otherwise sequential half-space / curve carving. (The volumetric mode is never
  // reached by the engine and is not ported.)
  const bool isMultiLabel = input.pieces.size() >= 2 && std::all_of(input.pieces.begin(), input.pieces.end(), [](const auto& p) { return p.multiLabelTriangles.has_value(); });
  const bool isSimultaneous = !isMultiLabel && input.pieces.size() >= 2 &&
                              std::all_of(input.pieces.begin(), input.pieces.end() - 1, [](const auto& p) { return p.grid.has_value(); }) && !input.pieces.back().plane;

  // Keeps the first region a later one claims; any residue between independently built claims is resolved in order.
  const auto resolveOverlaps = [&](std::vector<SolidPtr>& claims, const char* what) {
    SolidPtr claimedSoFar;
    for (std::size_t index = 0; index < claims.size(); ++index) {
      if (claimedSoFar) {
        claims[index] = engine.subtract(claims[index], claimedSoFar);
        if (!claims[index]->isValid()) fail(std::string(what) + " overlap resolution failed: invalid solid.");
      }
      claimedSoFar = claimedSoFar ? engine.unionOf({claimedSoFar, claims[index]}) : engine.asOriginal(claims[index]);
    }
    return claimedSoFar;
  };

  std::vector<SolidPtr> pieceSolids;
  if (isMultiLabel) {
    const double diagonal = jsHypot3(env.bounds.max.x - env.bounds.min.x, env.bounds.max.y - env.bounds.min.y, env.bounds.max.z - env.bounds.min.z);
    const double voxel = diagonal / 60;
    MultiLabelPartitionInput ml;
    for (const auto& piece : input.pieces) ml.pieceTriangleIndices.push_back(*piece.multiLabelTriangles);
    ml.positions = &input.sourcePositions;
    ml.indices = &input.sourceIndices;
    ml.bounds = env.bounds;
    ml.voxelSizeMm = voxel;
    ml.smoothnessWeight = voxel * 2;
    ml.maxIterations = 15;
    MultiLabelPartitionResult labelled = buildMultiLabelPartitionSolids(engine, ml, cancel);
    pieceSolids = std::move(labelled.solids);
    resolveOverlaps(pieceSolids, "Multi-label partition");
  } else if (isSimultaneous) {
    const SolidPtr envelopeBlank = engine.box(env.bounds);
    std::vector<SolidPtr> claims;
    for (std::size_t i = 0; i + 1 < input.pieces.size(); ++i) {
      const PlannedPieceRegion& piece = input.pieces[i];
      const SolidPtr localTool = localBoundedAssignmentSolid(engine, piece.grid->ownPoints, piece.grid->otherPoints, piece.releaseDirection, env.bounds,
                                                             env.policy.booleanToleranceMm, piece.grid->ownPatchRadiusMm);
      const SolidPtr claim = engine.intersect(envelopeBlank, localTool);
      if (!claim->isValid()) fail("Simultaneous-partition raw claim failed: invalid solid.");
      claims.push_back(claim);
    }
    const SolidPtr claimedSoFar = resolveOverlaps(claims, "Simultaneous-partition");
    pieceSolids = claims;
    const SolidPtr catchAll = claimedSoFar ? engine.subtract(envelopeBlank, claimedSoFar) : engine.asOriginal(envelopeBlank);
    if (!catchAll->isValid()) fail("Simultaneous-partition catch-all failed: invalid solid.");
    pieceSolids.push_back(catchAll);
  } else {
    SolidPtr remainder = engine.box(env.bounds);
    for (const PlannedPieceRegion& piece : input.pieces) {
      if (!piece.plane) {
        pieceSolids.push_back(remainder);
        remainder.reset();
        break;
      }
      if (piece.curve) {
        if (piece.curve->empty()) fail("a height-field cutting tool needs at least one curve group.");
        for (const auto& group : *piece.curve) if (group.size() < 3) fail("a height-field cutting tool needs at least 3 curve points per neighbor group.");
      }
      const SolidPtr cutting = piece.curve
          ? (piece.curve->size() == 1
                 ? heightFieldPartingSolid(engine, (*piece.curve)[0], piece.plane->direction, piece.plane->offsetMm, env.bounds, env.policy.booleanToleranceMm)
                 : multiNeighborHeightFieldSolid(engine, *piece.curve, piece.plane->direction, piece.plane->offsetMm, env.bounds, env.policy.booleanToleranceMm))
          : engine.solidFromMesh(halfSpacePrismPayload(piece.plane->direction, piece.plane->offsetMm, env.bounds), env.policy.booleanToleranceMm, "Mesh preparation");
      const SolidPtr region = engine.intersect(remainder, cutting);
      remainder = engine.subtract(remainder, cutting);
      pieceSolids.push_back(region);
    }
  }
  if (pieceSolids.size() != input.pieces.size()) fail("working mold partition did not produce one region per planned piece.");
  // Split fragmented regions into their connected components (each keeps its parent's plan entry).
  std::vector<SolidPtr> expanded;
  std::vector<PlannedPieceRegion> expandedPieces;
  for (std::size_t i = 0; i < pieceSolids.size(); ++i) {
    for (const SolidPtr& component : engine.decompose(pieceSolids[i])) {
      expanded.push_back(component);
      expandedPieces.push_back(input.pieces[i]);
    }
  }
  WorkingMoldConstructionInput expandedInput = input;
  expandedInput.pieces = expandedPieces;

  std::vector<SolidPtr> carved;
  for (const SolidPtr& region : expanded) carved.push_back(engine.subtract(region, negativeTool));

  WorkingMoldConstructionOutput output;
  output.registrationPlan = placeRegistration(engine, expandedInput, env, part, carved);
  std::vector<Point3> extraDirections;
  if (isMultiLabel) for (const auto& piece : input.pieces) extraDirections.push_back(piece.releaseDirection);
  extraDirections.insert(extraDirections.end(), input.extraReleaseDirections.begin(), input.extraReleaseDirections.end());
  ReleaseResult release = verifyWorkingMoldRelease(engine, expandedInput, env, part, carved, extraDirections, input.useGreedyReleaseOrder);
  output.releaseSequence = release.steps;
  output.releaseSweepCount = release.candidatesSwept;

  // Assembled-negative invariants on the final registered pieces.
  SolidPtr assembled;
  for (const SolidPtr& piece : carved) assembled = assembled ? engine.unionOf({assembled, piece}) : piece;
  if (engine.intersect(assembled, part)->volume() > env.volumeTolerance) fail("assembled registered working mold intersects the source part.");
  const double envelopeVolume = (env.bounds.max.x - env.bounds.min.x) * (env.bounds.max.y - env.bounds.min.y) * (env.bounds.max.z - env.bounds.min.z);
  const double complement = envelopeVolume - assembled->volume() - part->volume();
  if (std::fabs(complement) > std::max(env.volumeTolerance, part->volume() * 1e-3)) fail("assembled registered working mold does not tile its envelope.");

  for (std::size_t index = 0; index < carved.size(); ++index) {
    const SolidPtr& solid = carved[index];
    if (!solid->isValid() || solid->isEmpty()) fail("working mold piece " + std::to_string(index + 1) + " construction failed.");
    if (engine.decompose(solid).size() > 1) fail("working mold piece " + std::to_string(index + 1) + " is not a single connected solid.");
    MeshPayload mesh = engine.meshFromSolid(solid, {}, "Mesh export");
    const MeshTopologyCounts topology = meshTopology(mesh);
    if (topology.openEdgeCount > 0 || topology.nonManifoldEdgeCount > 0) fail("working mold piece " + std::to_string(index + 1) + " is not a closed manifold.");
    const Bounds3 bounds = solid->bounds();
    const Point3 direction = expandedPieces[index].releaseDirection;
    int releaseOrder = 0;
    for (const auto& step : output.releaseSequence) if (step.pieceIndex == static_cast<int>(index)) releaseOrder = step.stepIndex;
    WorkingMoldPieceTarget target;
    target.pieceId = "wm-piece-" + std::to_string(index + 1);
    target.name = "Working Mold " + std::to_string(index + 1);
    target.geometryVersion = "working-mold-piece:" +
        finishHash(hashText(meshGeometryVersion("piece-" + std::to_string(index + 1), mesh, bounds) + jsNumberToString(direction.x) + "," +
                            jsNumberToString(direction.y) + "," + jsNumberToString(direction.z) + "," + std::to_string(releaseOrder)));
    target.volumeMm3 = solid->volume();
    target.bounds = bounds;
    target.assignedDirection = direction;
    target.directionId = "piece-" + std::to_string(index + 1);
    target.releaseOrder = releaseOrder;
    target.triangleCount = static_cast<int>(mesh.indices.size() / 3);
    target.watertight = topology.openEdgeCount == 0;
    target.manifold = topology.openEdgeCount == 0 && topology.nonManifoldEdgeCount == 0;
    target.mesh = std::move(mesh);
    output.pieces.push_back(std::move(target));
  }
  return output;
}

}  // namespace craft
