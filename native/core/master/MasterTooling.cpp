#include "master/MasterTooling.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>
#include <unordered_map>

#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "master/MasterAccessibility.h"  // icuLess
#include "master/MasterWorkingMoldConstructor.h"
#include "master/RayBvh.h"
#include "mold/Registration.h"  // jsNumberToString

namespace craft {

// --- directions -------------------------------------------------------------------------------------

const char* masterDirName(MasterDir d) {
  static const char* names[6] = {"+X", "-X", "+Y", "-Y", "+Z", "-Z"};
  return names[static_cast<int>(d)];
}
Point3 masterDirVector(MasterDir d) {
  static const Point3 v[6] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
  return v[static_cast<int>(d)];
}
int masterDirAxis(MasterDir d) { return static_cast<int>(d) / 2; }
bool masterDirPositive(MasterDir d) { return static_cast<int>(d) % 2 == 0; }
MasterDir masterDirFlip(MasterDir d) { return static_cast<MasterDir>(static_cast<int>(d) ^ 1); }

Bounds3 masterStockBoundsFor(const Bounds3& b, MasterDir direction, double wall, double bottom) {
  const int axis = masterDirAxis(direction);
  Bounds3 out{{b.min.x - wall, b.min.y - wall, b.min.z - wall}, {b.max.x + wall, b.max.y + wall, b.max.z + wall}};
  if (masterDirPositive(direction)) {
    out.max[axis] = b.max[axis];
    out.min[axis] = b.min[axis] - bottom;
  } else {
    out.min[axis] = b.min[axis];
    out.max[axis] = b.max[axis] + bottom;
  }
  return out;
}

MasterDir masterDirFromName(const std::string& name) {
  for (MasterDir d : kMasterDirections) if (name == masterDirName(d)) return d;
  throw std::invalid_argument("unknown Master Mold direction: " + name);
}

Bounds3 caseEnvelopeFor(const Bounds3& targetBounds, MasterDir pourFace, double wallMm, double baseMm) {
  return masterStockBoundsFor(targetBounds, pourFace, wallMm, baseMm);
}

const char* coreModeName(CoreAssignmentMode mode) {
  switch (mode) {
    case CoreAssignmentMode::Split: return "split";
    case CoreAssignmentMode::FullNegative: return "full-negative";
    case CoreAssignmentMode::FullPositive: return "full-positive";
    case CoreAssignmentMode::LocalizedRemovableCore: return "localized-removable-core";
  }
  return "split";
}

MasterToolingParameters toolingParametersFromProfile(const MasterCastingProcessProfile& profile) {
  MasterToolingParameters p;
  p.caseWallThicknessMm = std::max(profile.minimumToolingWallMm, 3.0);
  p.caseBaseThicknessMm = 3;
  p.pourOpeningMarginMm = 2;
  p.partingFlangeWidthMm = 0;
  p.geometryToleranceMm = profile.releaseClearanceMm.value_or(1e-3);
  p.maxToolingPieces = profile.maximumToolingPieceCount;
  return p;
}

namespace {

struct V { double x, y, z; };
V sub(const V& a, const V& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V crossv(const V& a, const V& b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double dotv(const V& a, const V& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
double lengthOf(const V& a) { return std::sqrt(dotv(a, a)); }
/// three.js Vector3.normalize(): multiplyScalar(1 / (length || 1)).
V normalizeThree(const V& a) {
  const double len = lengthOf(a);
  const double inv = 1 / (len != 0 ? len : 1);
  return {a.x * inv, a.y * inv, a.z * inv};
}
Point3 toP(const V& v) { return {v.x, v.y, v.z}; }
V fromP(const Point3& p) { return {p.x, p.y, p.z}; }

std::vector<float> toFloats(const std::vector<double>& v) { return std::vector<float>(v.begin(), v.end()); }

V vertexOf(const MeshPayload& mesh, std::uint32_t index) {
  return {mesh.positions[index * 3ull], mesh.positions[index * 3ull + 1], mesh.positions[index * 3ull + 2]};
}

double faceAreaOfBounds(const Bounds3& b, MasterDir d) {
  const int axis = masterDirAxis(d);
  const int a = (axis + 1) % 3, c = (axis + 2) % 3;
  // reference: the two axes other than `axis`, in x,y,z order
  int first = axis == 0 ? 1 : 0;
  int second = axis == 2 ? 1 : 2;
  (void)a; (void)c;
  return (b.max[first] - b.min[first]) * (b.max[second] - b.min[second]);
}

bool negativeReachesFace(const Bounds3& negative, const Bounds3& target, MasterDir d, double tol) {
  const int axis = masterDirAxis(d);
  return masterDirPositive(d) ? negative.max[axis] >= target.max[axis] - tol : negative.min[axis] <= target.min[axis] + tol;
}

constexpr double kMinimumOpeningAreaMm2 = 25;
constexpr int kSealedPocketSampleLimit = 32;
constexpr int kExposureSampleCap = 512;
constexpr double kPlanarNormalDot = 0.999;
constexpr int kPocketGridDivisions = 8;

// Pour-face scoring weights (POUR_FACE_WEIGHTS).
constexpr double kWeightOpeningArea = 0.05, kWeightCastingDepth = 0.02, kWeightTrappedAir = 5, kWeightInterference = 3,
                 kWeightSupportHeight = 0.01, kWeightUserOverride = 10;

}  // namespace

// --- pour face --------------------------------------------------------------------------------------------

std::array<double, 6> planarFaceExposureByDirection(const MasterCastTarget& target) {
  std::array<double, 6> exposure{};
  const auto& indices = target.mesh.indices;
  const std::size_t triangleCount = indices.size() / 3;
  const std::size_t stride = std::max<std::size_t>(1, static_cast<std::size_t>(std::floor(static_cast<double>(triangleCount) / kExposureSampleCap)));
  for (std::size_t t = 0; t < triangleCount; t += stride) {
    const V a = vertexOf(target.mesh, indices[t * 3]), b = vertexOf(target.mesh, indices[t * 3 + 1]), c = vertexOf(target.mesh, indices[t * 3 + 2]);
    const double ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const double length = jsHypot3(nx, ny, nz);
    if (length <= 1e-12) continue;
    for (MasterDir direction : kMasterDirections) {
      const Point3 d = masterDirVector(direction);
      if ((nx * d.x + ny * d.y + nz * d.z) / length >= kPlanarNormalDot) exposure[static_cast<std::size_t>(direction)] += length / 2;
    }
  }
  return exposure;
}

std::vector<MasterDir> candidateDirections(const MasterCastTarget& target, std::optional<MasterDir> userOverride) {
  std::vector<MasterDir> ordered;
  if (userOverride) ordered.push_back(*userOverride);
  const auto exposure = planarFaceExposureByDirection(target);
  std::vector<MasterDir> byGeometry(kMasterDirections.begin(), kMasterDirections.end());
  std::stable_sort(byGeometry.begin(), byGeometry.end(), [&](MasterDir a, MasterDir b) {
    const double ea = exposure[static_cast<std::size_t>(a)], eb = exposure[static_cast<std::size_t>(b)];
    if (eb - ea != 0) return eb - ea < 0;
    const double fa = faceAreaOfBounds(target.bounds, a), fb = faceAreaOfBounds(target.bounds, b);
    if (fb - fa != 0) return fb - fa < 0;
    return icuLess(masterDirName(a), masterDirName(b));
  });
  for (MasterDir d : byGeometry) if (std::find(ordered.begin(), ordered.end(), d) == ordered.end()) ordered.push_back(d);
  return ordered;
}

namespace {

std::vector<Point3> sealedHighPocketSamples(const MasterCastTarget& target, MasterDir upDirection) {
  const Point3 up = masterDirVector(upDirection);
  const double ux = up.x, uy = up.y, uz = up.z;
  std::vector<Point3> horizontal;
  if (uz != 0) {
    horizontal = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}};
  } else {
    const V u{ux, uy, uz};
    const V c1 = crossv(u, {0, 0, 1}), c2 = crossv(u, {0, 0, -1});
    horizontal = {up, {-up.x, -up.y, -up.z}, toP(c1), toP(c2)};
  }
  const int axis = uz != 0 ? 2 : uy != 0 ? 1 : 0;
  const double seatingPlane = masterDirPositive(upDirection) ? target.bounds.min[axis] : target.bounds.max[axis];

  std::vector<Point3> samples;
  int sampled = 0;
  const std::vector<float> positions = toFloats(target.mesh.positions);
  const RayBvh bvh(positions, target.mesh.indices);
  const auto& indices = target.mesh.indices;
  for (std::size_t t = 0; t < indices.size() / 3 && sampled < kSealedPocketSampleLimit; ++t) {
    const V a = vertexOf(target.mesh, indices[t * 3]), b = vertexOf(target.mesh, indices[t * 3 + 1]), c = vertexOf(target.mesh, indices[t * 3 + 2]);
    const V normal = normalizeThree(crossv(sub(b, a), sub(c, a)));
    const double downwardDot = -(normal.x * ux + normal.y * uy + normal.z * uz);
    if (downwardDot <= 0.1) continue;
    const V sum = {(a.x + b.x) + c.x, (a.y + b.y) + c.y, (a.z + b.z) + c.z};
    const V centroid{sum.x * (1.0 / 3), sum.y * (1.0 / 3), sum.z * (1.0 / 3)};
    const double centroidAxis = axis == 0 ? centroid.x : axis == 1 ? centroid.y : centroid.z;
    if (std::fabs(centroidAxis - seatingPlane) <= 1e-3) continue;
    ++sampled;
    const Point3 probe{centroid.x + normal.x * 1e-3, centroid.y + normal.y * 1e-3, centroid.z + normal.z * 1e-3};
    if (bvh.countUniqueForwardIntersections(probe, up) < 2) continue;
    bool escaped = false;
    for (const Point3& direction : horizontal) {
      if (bvh.countUniqueForwardIntersections(probe, direction) == 0) { escaped = true; break; }
    }
    if (!escaped) samples.push_back({centroid.x, centroid.y, centroid.z});
  }
  return samples;
}

}  // namespace

std::vector<AirPocket> sealedAirPockets(const MasterCastTarget& target, MasterDir upDirection) {
  const std::vector<Point3> samples = sealedHighPocketSamples(target, upDirection);
  if (samples.empty()) return {};
  const Bounds3& bounds = target.bounds;
  const double maxSpan = std::max({bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z});
  const double cellMm = std::max(1e-3, maxSpan / kPocketGridDivisions);
  struct Cell { int count = 0; double sx = 0, sy = 0, sz = 0; };
  struct Key { int x, y, z; bool operator==(const Key&) const = default; };
  const auto cellIndex = [&](double v, double lo) {
    return std::min(kPocketGridDivisions - 1, std::max(0, static_cast<int>(std::floor((v - lo) / cellMm))));
  };
  std::vector<Key> order;
  std::vector<Cell> cells;
  const auto find = [&](const Key& k) -> int {
    for (std::size_t i = 0; i < order.size(); ++i) if (order[i] == k) return static_cast<int>(i);
    return -1;
  };
  for (const Point3& p : samples) {
    const Key key{cellIndex(p.x, bounds.min.x), cellIndex(p.y, bounds.min.y), cellIndex(p.z, bounds.min.z)};
    int i = find(key);
    if (i < 0) { order.push_back(key); cells.emplace_back(); i = static_cast<int>(order.size()) - 1; }
    cells[static_cast<std::size_t>(i)].count += 1;
    cells[static_cast<std::size_t>(i)].sx += p.x;
    cells[static_cast<std::size_t>(i)].sy += p.y;
    cells[static_cast<std::size_t>(i)].sz += p.z;
  }
  std::vector<bool> visited(order.size(), false);
  std::vector<AirPocket> pockets;
  for (std::size_t start = 0; start < order.size(); ++start) {
    if (visited[start]) continue;
    std::vector<int> component, queue{static_cast<int>(start)};
    visited[start] = true;
    while (!queue.empty()) {
      const int current = queue.back();
      queue.pop_back();
      component.push_back(current);
      const Key k = order[static_cast<std::size_t>(current)];
      for (int dx = -1; dx <= 1; ++dx)
        for (int dy = -1; dy <= 1; ++dy)
          for (int dz = -1; dz <= 1; ++dz) {
            if (dx == 0 && dy == 0 && dz == 0) continue;
            const int n = find({k.x + dx, k.y + dy, k.z + dz});
            if (n >= 0 && !visited[static_cast<std::size_t>(n)]) { visited[static_cast<std::size_t>(n)] = true; queue.push_back(n); }
          }
    }
    int count = 0;
    double sx = 0, sy = 0, sz = 0, minX = INFINITY, minY = INFINITY, minZ = INFINITY, maxX = -INFINITY, maxY = -INFINITY, maxZ = -INFINITY;
    for (int m : component) {
      const Cell& cell = cells[static_cast<std::size_t>(m)];
      const Key& k = order[static_cast<std::size_t>(m)];
      count += cell.count; sx += cell.sx; sy += cell.sy; sz += cell.sz;
      minX = std::min(minX, bounds.min.x + k.x * cellMm); minY = std::min(minY, bounds.min.y + k.y * cellMm); minZ = std::min(minZ, bounds.min.z + k.z * cellMm);
      maxX = std::max(maxX, bounds.min.x + (k.x + 1) * cellMm); maxY = std::max(maxY, bounds.min.y + (k.y + 1) * cellMm);
      maxZ = std::max(maxZ, bounds.min.z + (k.z + 1) * cellMm);
    }
    pockets.push_back({{sx / count, sy / count, sz / count}, count, {{minX, minY, minZ}, {maxX, maxY, maxZ}}});
  }
  std::stable_sort(pockets.begin(), pockets.end(), [](const AirPocket& a, const AirPocket& b) {
    if (a.sampleCount != b.sampleCount) return b.sampleCount < a.sampleCount;
    if (a.centroid.x != b.centroid.x) return a.centroid.x < b.centroid.x;
    if (a.centroid.y != b.centroid.y) return a.centroid.y < b.centroid.y;
    return a.centroid.z < b.centroid.z;
  });
  return pockets;
}

MasterPourFaceDecision planPourFace(const PourFacePlanInput& input) {
  const MasterCastTarget& target = *input.castTarget;
  const auto geometryExposure = planarFaceExposureByDirection(target);
  std::vector<MasterPourFaceCandidate> working;

  for (MasterDir direction : candidateDirections(target, input.userOverride)) {
    const int axis = masterDirAxis(direction);
    MasterPourFaceCandidate c;
    c.direction = direction;
    c.castingDepthMm = target.bounds.max[axis] - target.bounds.min[axis];
    c.exposedOpeningAreaMm2 = faceAreaOfBounds(target.bounds, direction);
    if (!std::isfinite(c.exposedOpeningAreaMm2) || c.exposedOpeningAreaMm2 <= 0) c.rejectionReason = "no_exposed_opening";
    else if (c.exposedOpeningAreaMm2 < kMinimumOpeningAreaMm2) c.rejectionReason = "opening_too_small";
    else if (negativeReachesFace(input.negativeToolBounds, target.bounds, direction, input.geometryToleranceMm)) c.rejectionReason = "cuts_functional_cavity_geometry";
    else if (c.castingDepthMm <= input.geometryToleranceMm) c.rejectionReason = "zero_case_wall";
    c.valid = !c.rejectionReason;
    if (c.valid) {
      const double faceTopGap = masterDirPositive(direction) ? target.bounds.max[axis] - input.negativeToolBounds.max[axis]
                                                             : input.negativeToolBounds.min[axis] - target.bounds.min[axis];
      const double interference = faceTopGap < input.geometryToleranceMm * 2 ? kWeightInterference : 0;
      const double openingArea = std::max(geometryExposure[static_cast<std::size_t>(direction)], c.exposedOpeningAreaMm2 * 0.5);
      c.score = kWeightOpeningArea * -openingArea + kWeightCastingDepth * c.castingDepthMm + kWeightSupportHeight * c.castingDepthMm + interference +
                (input.userOverride && direction == *input.userOverride ? -kWeightUserOverride : 0);
    } else {
      c.score = INFINITY;
    }
    c.source = input.userOverride && direction == *input.userOverride ? "user-override"
               : geometryExposure[static_cast<std::size_t>(direction)] > 0 ? "planar-face-normal" : "semantic-axis";
    working.push_back(std::move(c));
  }

  MasterPourFaceDecision decision;
  std::map<int, std::vector<AirPocket>> pocketsByDirection;
  for (MasterPourFaceCandidate& c : working) {
    if (!c.valid) continue;
    auto pockets = sealedAirPockets(target, c.direction);
    if (!pockets.empty()) {
      c.score += kWeightTrappedAir * static_cast<double>(pockets.size());
      decision.fillabilityWarnings.push_back(std::string("Pour face ") + masterDirName(c.direction) + ": " + std::to_string(pockets.size()) +
          " sealed high pocket" + (pockets.size() == 1 ? "" : "s") +
          " detected in casting orientation. A mesh-verified vent path is generated automatically when one exists; otherwise the pocket requires user-managed venting.");
    }
    pocketsByDirection[static_cast<int>(c.direction)] = std::move(pockets);
  }

  std::vector<const MasterPourFaceCandidate*> valid;
  for (const auto& c : working) if (c.valid) valid.push_back(&c);
  std::stable_sort(valid.begin(), valid.end(), [](const auto* a, const auto* b) {
    if (a->score != b->score) return a->score < b->score;
    return icuLess(masterDirName(a->direction), masterDirName(b->direction));
  });
  const MasterPourFaceCandidate* best = valid.empty() ? nullptr : valid.front();
  if (best) { decision.selected = best->direction; decision.castingOrientation = best->direction; }
  decision.score = best ? best->score : INFINITY;
  decision.candidates = working;
  const std::vector<AirPocket> selectedPockets = best ? pocketsByDirection[static_cast<int>(best->direction)] : std::vector<AirPocket>{};
  decision.ventPlan.status = selectedPockets.empty() ? "clear" : "user-review";
  for (std::size_t i = 0; i < selectedPockets.size(); ++i) {
    const AirPocket& p = selectedPockets[i];
    MasterVentRecommendation r;
    r.recommendationId = "vent-review-" + target.moldPartId + "-" + (best ? masterDirName(best->direction) : "unselected") + "-" + std::to_string(i + 1);
    r.pocketIndex = static_cast<int>(i) + 1;
    r.pocketPosition = p.centroid;
    r.message = "Sealed high pocket " + std::to_string(i + 1) + " (" + std::to_string(p.sampleCount) + " sample" + (p.sampleCount == 1 ? "" : "s") +
                ") requires a vent path: generated automatically when a mesh-verified route exists, otherwise user review.";
    decision.ventPlan.unresolvedRecommendations.push_back(std::move(r));
  }
  return decision;
}

// --- release analysis ----------------------------------------------------------------------------------------

MasterSurfaceAccessibility analyzeSurfaceAccessibility(const MasterCastTarget& target) {
  MasterSurfaceAccessibility out;
  const std::vector<float> positions = toFloats(target.mesh.positions);
  const RayBvh bvh(positions, target.mesh.indices);
  const auto& indices = target.mesh.indices;
  const std::size_t triangleCount = indices.size() / 3;
  const std::size_t stride = std::max<std::size_t>(1, static_cast<std::size_t>(std::floor(static_cast<double>(triangleCount) / 256)));
  double totalArea = 0;
  int sampled = 0;
  std::array<int, 6> visible{};
  for (std::size_t t = 0; t < triangleCount; t += stride) {
    const V a = vertexOf(target.mesh, indices[t * 3]), b = vertexOf(target.mesh, indices[t * 3 + 1]), c = vertexOf(target.mesh, indices[t * 3 + 2]);
    const V n = crossv(sub(b, a), sub(c, a));
    const double area2 = lengthOf(n);
    const V normal = normalizeThree(n);
    const V sum = {(a.x + b.x) + c.x, (a.y + b.y) + c.y, (a.z + b.z) + c.z};
    const V centroid{sum.x * (1.0 / 3), sum.y * (1.0 / 3), sum.z * (1.0 / 3)};
    const Point3 probe{centroid.x + normal.x * 1e-3, centroid.y + normal.y * 1e-3, centroid.z + normal.z * 1e-3};
    totalArea += area2 / 2;
    ++sampled;
    for (MasterDir d : kMasterDirections) {
      if (bvh.countUniqueForwardIntersections(probe, masterDirVector(d)) == 0) ++visible[static_cast<std::size_t>(d)];
    }
  }
  const double denominator = std::max(1, sampled);
  double best = 0;
  for (MasterDir d : kMasterDirections) {
    const double fraction = visible[static_cast<std::size_t>(d)] / denominator;
    out.directions.push_back({d, fraction, (1 - fraction) * totalArea});
    best = std::max(best, fraction);
  }
  out.onePieceReleaseFeasible = best >= 1 - 1.0 / 3;
  return out;
}

// --- vent proofs ------------------------------------------------------------------------------------------------

std::vector<MasterVentFeature> safeVentPathsFor(const Bounds3& targetBounds, const Bounds3& caseBounds, const Bounds3& protectedBounds,
                                                const std::vector<MasterVentRecommendation>& recommendations, double wallThicknessMm,
                                                const MeshPayload& targetMesh, const MeshPayload* protectedMesh) {
  const double tolerance = std::max(1e-3, wallThicknessMm * 0.05);
  const double radiusMm = std::max(0.25, std::min(wallThicknessMm * 0.2, 1.0));
  struct Face { int axis; bool max; };
  const Face faces[6] = {{0, false}, {0, true}, {1, false}, {1, true}, {2, false}, {2, true}};
  const std::vector<float> targetPositions = toFloats(targetMesh.positions);
  const RayBvh targetBvh(targetPositions, targetMesh.indices);
  std::vector<float> protectedPositions;
  std::unique_ptr<RayBvh> protectedBvh;
  if (protectedMesh) {
    protectedPositions = toFloats(protectedMesh->positions);
    protectedBvh = std::make_unique<RayBvh>(protectedPositions, protectedMesh->indices);
  }

  std::vector<MasterVentFeature> paths;
  for (const MasterVentRecommendation& rec : recommendations) {
    const Point3 point = rec.pocketPosition;
    bool within = true;
    for (int a = 0; a < 3; ++a) within = within && point[a] >= targetBounds.min[a] - tolerance && point[a] <= targetBounds.max[a] + tolerance;
    if (!within) continue;
    struct Candidate { int faceIndex; Point3 end; double lengthMm; bool boundaryFirst; };
    std::vector<Candidate> candidates;
    for (int fi = 0; fi < 6; ++fi) {
      const Face& face = faces[fi];
      const double outward = face.max ? 1 : -1;
      Point3 end = point;
      end[face.axis] = face.max ? caseBounds.max[face.axis] - radiusMm : caseBounds.min[face.axis] + radiusMm;
      const double lengthMm = (end[face.axis] - point[face.axis]) * outward;
      if (lengthMm <= radiusMm * 2) continue;
      Point3 direction{0, 0, 0};
      direction[face.axis] = outward;
      double tExit = INFINITY;
      bool admits = true;
      for (int a = 0; a < 3; ++a) {
        const double o = point[a], d = direction[a];
        if (std::fabs(d) <= 1e-12) {
          if (o < targetBounds.min[a] - tolerance || o > targetBounds.max[a] + tolerance) { admits = false; break; }
          continue;
        }
        const double tNear = (targetBounds.min[a] - o) / d, tFar = (targetBounds.max[a] - o) / d;
        tExit = std::min(tExit, std::max(tNear, tFar));
      }
      if (!admits || !std::isfinite(tExit) || tExit > lengthMm + tolerance) continue;
      const bool boundaryFirst = std::fabs(point[face.axis] - (face.max ? protectedBounds.max[face.axis] : protectedBounds.min[face.axis])) <= tolerance;
      candidates.push_back({fi, end, lengthMm, boundaryFirst});
    }
    std::stable_sort(candidates.begin(), candidates.end(), [](const Candidate& a, const Candidate& b) {
      if (a.boundaryFirst != b.boundaryFirst) return a.boundaryFirst > b.boundaryFirst;
      if (a.lengthMm != b.lengthMm) return a.lengthMm < b.lengthMm;
      return a.faceIndex < b.faceIndex;
    });
    for (const Candidate& candidate : candidates) {
      const Face& face = faces[candidate.faceIndex];
      const double outward = face.max ? 1 : -1;
      Point3 direction{0, 0, 0};
      direction[face.axis] = outward;
      const Point3 proofOrigin{point.x + direction.x * 1e-3, point.y + direction.y * 1e-3, point.z + direction.z * 1e-3};
      const double proofLength = candidate.lengthMm - 1e-3;
      if (targetBvh.countUniqueForwardIntersections(proofOrigin, direction, proofLength) != 0) continue;
      if (protectedBvh && protectedBvh->countUniqueForwardIntersections(proofOrigin, direction, proofLength) != 0) continue;
      paths.push_back({rec.recommendationId, point, candidate.end, radiusMm, "mesh-verified"});
      break;
    }
  }
  return paths;
}

// --- case construction -------------------------------------------------------------------------------------------------

namespace {

Bounds3 extensionBoxBounds(const Bounds3& b, MasterDir direction, double extensionMm) {
  const int axis = masterDirAxis(direction);
  Bounds3 out = b;
  if (masterDirPositive(direction)) { out.min[axis] = b.max[axis]; out.max[axis] = b.max[axis] + extensionMm; }
  else { out.max[axis] = b.min[axis]; out.min[axis] = b.min[axis] - extensionMm; }
  return out;
}

Bounds3 halfSpaceBoundsFor(const Bounds3& caseBounds, MasterDir axis, double coordinate, bool positive) {
  const int a = masterDirAxis(axis);
  Bounds3 out = caseBounds;
  if (positive) out.min[a] = coordinate; else out.max[a] = coordinate;
  return out;
}

SolidPtr halfSpaceClipSolid(IMeshGeometryEngine& engine, const Bounds3& caseBounds, const SplitSpec& split, bool positive, double toleranceMm) {
  if (!split.normal || !split.point) return engine.box(halfSpaceBoundsFor(caseBounds, split.axis, split.coordinateMm, positive));
  const double sign = positive ? 1 : -1;
  const Point3 direction{split.normal->x * sign, split.normal->y * sign, split.normal->z * sign};
  const double planeOffset = split.normal->x * split.point->x + split.normal->y * split.point->y + split.normal->z * split.point->z;
  return engine.solidFromMesh(halfSpacePrismPayload(direction, sign * planeOffset, caseBounds), toleranceMm, "Mesh preparation");
}

bool removesAllCore(CoreAssignmentMode mode, bool positiveSide) {
  return (mode == CoreAssignmentMode::FullNegative && positiveSide) || (mode == CoreAssignmentMode::FullPositive && !positiveSide);
}

}  // namespace

/// The reference constructCasePiece, in the full-negative / full-positive core modes, releases `removal` (which still aliases
/// `extendedTarget`) when it unions the core's own half and then releases `extendedTarget` again in its finally block. The
/// second release throws "Manifold instance already deleted", so every such attempt is reported as a failed piece
/// construction. Parity keeps that observable behaviour; set false to build the intended core-assigned pieces. See D-032.
constexpr bool kReplicateReferenceCoreDeleteDefect = true;

ConstructedPiece constructCasePiece(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                    const MasterToolingParameters& parameters, const std::optional<SplitSpec>& split,
                                    const MeshPayload* coreToolMesh, CoreAssignmentMode coreMode, const std::vector<MasterVentFeature>& vents) {
  const Bounds3 caseBounds = caseEnvelopeFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(caseBounds, 0);
  const double extensionMm = policy.surfaceToleranceMm * 8 + parameters.pourOpeningMarginMm;

  const SolidPtr caseSolid = engine.box(caseBounds);
  const SolidPtr pieceSide = split ? engine.intersect(caseSolid, halfSpaceClipSolid(engine, caseSolid->bounds(), *split, split->positiveSide, policy.booleanToleranceMm)) : caseSolid;
  const SolidPtr targetSolid = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
  const SolidPtr extensionSolid = engine.box(extensionBoxBounds(target.bounds, pourFace, extensionMm));
  const SolidPtr coreSolid = coreToolMesh ? engine.solidFromMesh(*coreToolMesh, policy.booleanToleranceMm, "Mesh preparation") : nullptr;

  SolidPtr extendedTarget = engine.unionOf({targetSolid, extensionSolid});
  SolidPtr removal = extendedTarget;
  SolidPtr withCoreAdded;
  bool plainRemoval = true;
  if (coreSolid && split && coreMode != CoreAssignmentMode::Split) {
    plainRemoval = false;
    const bool side = split->positiveSide;
    const SolidPtr ownBox = halfSpaceClipSolid(engine, caseBounds, *split, side, policy.booleanToleranceMm);
    const SolidPtr otherBox = halfSpaceClipSolid(engine, caseBounds, *split, !side, policy.booleanToleranceMm);
    const SolidPtr coreOwnSide = engine.intersect(coreSolid, ownBox);
    const SolidPtr coreOtherSide = engine.intersect(coreSolid, otherBox);
    (void)coreOtherSide;
    const bool ownsWholeCore = (coreMode == CoreAssignmentMode::FullNegative && !side) || (coreMode == CoreAssignmentMode::FullPositive && side);
    if (!coreOwnSide->isEmpty()) {
      if (kReplicateReferenceCoreDeleteDefect) throw std::runtime_error("Manifold instance already deleted");
      removal = engine.unionOf({removal, coreOwnSide});
    }
    if (ownsWholeCore) withCoreAdded = engine.asOriginal(coreSolid);
    if (removesAllCore(coreMode, side)) removal = engine.unionOf({removal, engine.asOriginal(coreSolid)});
  }
  if (plainRemoval && split) {
    const SolidPtr ownBox = halfSpaceClipSolid(engine, caseBounds, *split, split->positiveSide, policy.booleanToleranceMm);
    extendedTarget = engine.intersect(extendedTarget, ownBox);
    removal = extendedTarget;
  }

  SolidPtr voidSolid = engine.subtract(pieceSide, removal);
  for (const MasterVentFeature& vent : vents) {
    const double dx = vent.end.x - vent.start.x, dy = vent.end.y - vent.start.y, dz = vent.end.z - vent.start.z;
    const double length = jsHypot3(dx, dy, dz);
    if (length <= 1e-6) continue;
    const SolidPtr ventSolid = engine.solidFromMesh(
        cylinderPrismPayload({dx / length, dy / length, dz / length},
                             {(vent.start.x + vent.end.x) / 2, (vent.start.y + vent.end.y) / 2, (vent.start.z + vent.end.z) / 2}, vent.radiusMm, length, 16),
        policy.booleanToleranceMm, "Mesh preparation");
    voidSolid = engine.subtract(voidSolid, ventSolid);
  }
  if (withCoreAdded && !withCoreAdded->isEmpty()) voidSolid = engine.unionOf({voidSolid, withCoreAdded});

  if (!voidSolid->isValid() || voidSolid->isEmpty()) throw std::runtime_error(target.moldPartName + ": case piece Boolean construction failed.");
  if (engine.decompose(voidSolid).size() > 1) throw std::runtime_error(target.moldPartName + ": case piece is not a single connected solid.");
  ConstructedPiece piece;
  piece.mesh = engine.meshFromSolid(voidSolid, {}, "Mesh export");
  piece.bounds = voidSolid->bounds();
  piece.volumeMm3 = voidSolid->volume();
  piece.solid = engine.asOriginal(voidSolid);
  return piece;
}

MasterToolingPiece pieceFromConstructed(const std::string& pieceId, const std::string& name, const ConstructedPiece& constructed,
                                        const std::string& releaseDirection, const std::vector<std::string>& regions,
                                        const std::vector<std::string>& toolingRegistrationFeatureIds, const std::optional<Point3>& directionVector) {
  const MeshTopologyCounts topology = meshTopology(constructed.mesh);
  MasterToolingPiece piece;
  piece.pieceId = pieceId;
  piece.name = name;
  piece.mesh = constructed.mesh;
  piece.bounds = constructed.bounds;
  piece.volumeMm3 = constructed.volumeMm3;
  piece.triangleCount = static_cast<int>(constructed.mesh.indices.size() / 3);
  piece.watertight = topology.openEdgeCount == 0;
  piece.manifold = topology.openEdgeCount == 0 && topology.nonManifoldEdgeCount == 0;
  piece.releaseDirection = releaseDirection;
  piece.regions = regions;
  piece.toolingRegistrationFeatureIds = toolingRegistrationFeatureIds;
  piece.fitsBuildVolume = true;
  piece.directionVector = directionVector;
  return piece;
}

// --- tooling registration pins -------------------------------------------------------------------------------------------

namespace {

constexpr double kToolingPinRadiusMm = 2.5;
constexpr double kToolingPinCornerInset = 0.2;
constexpr int kToolingPinSegments = 16;

struct PinPlacement {
  MasterToolingRegistrationFeature feature;
  MeshPayload payload;
};

std::pair<std::vector<PinPlacement>, std::optional<std::string>> planToolingRegistrationPinPlacements(
    const MasterCastTarget& target, MasterDir pourFace, const SplitSpec& split, const MasterToolingParameters& parameters,
    const std::optional<Bounds3>& functionalBounds) {
  const Bounds3 caseBounds = caseEnvelopeFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const double radius = std::min(kToolingPinRadiusMm, parameters.caseWallThicknessMm / 2);
  if (radius < 1) return {{}, std::string("wall too thin for tooling alignment pins")};

  const bool oblique = split.normal && split.point;
  const Point3 pinAxis = oblique ? *split.normal : masterDirVector(split.axis);
  const int splitAxisName = masterDirAxis(split.axis);
  std::vector<int> sideAxes;
  for (int a = 0; a < 3; ++a) if (a != splitAxisName) sideAxes.push_back(a);
  std::vector<Point3> pinCenters;
  if (oblique) {
    const Point3 normal = *split.normal;
    const double planeOffset = normal.x * split.point->x + normal.y * split.point->y + normal.z * split.point->z;
    const OrthonormalBasis basis = basisAround(normal);
    const Point3 caseCenter{(caseBounds.min.x + caseBounds.max.x) / 2, (caseBounds.min.y + caseBounds.max.y) / 2, (caseBounds.min.z + caseBounds.max.z) / 2};
    const double along = normal.x * caseCenter.x + normal.y * caseCenter.y + normal.z * caseCenter.z;
    const Point3 projected{caseCenter.x + normal.x * (planeOffset - along), caseCenter.y + normal.y * (planeOffset - along),
                           caseCenter.z + normal.z * (planeOffset - along)};
    const double diagonal = jsHypot3(caseBounds.max.x - caseBounds.min.x, caseBounds.max.y - caseBounds.min.y, caseBounds.max.z - caseBounds.min.z);
    const double inset = diagonal * kToolingPinCornerInset;
    for (int index = 0; index < 2; ++index) {
      const double sign = index == 0 ? -1 : 1;
      pinCenters.push_back({projected.x + sign * (basis.u.x + basis.v.x) * inset, projected.y + sign * (basis.u.y + basis.v.y) * inset,
                            projected.z + sign * (basis.u.z + basis.v.z) * inset});
    }
  } else {
    for (int index = 0; index < 2; ++index) {
      Point3 point{0, 0, 0};
      point[splitAxisName] = split.coordinateMm;
      double insetBase[2], insetTop[2];
      for (int k = 0; k < 2; ++k) {
        const int axis = sideAxes[static_cast<std::size_t>(k)];
        insetBase[k] = caseBounds.min[axis] + (caseBounds.max[axis] - caseBounds.min[axis]) * kToolingPinCornerInset;
        insetTop[k] = caseBounds.max[axis] - (caseBounds.max[axis] - caseBounds.min[axis]) * kToolingPinCornerInset;
      }
      point[sideAxes[0]] = index == 0 ? insetBase[0] : insetTop[0];
      point[sideAxes[1]] = index == 0 ? insetBase[1] : insetTop[1];
      pinCenters.push_back(point);
    }
  }

  const Bounds3 tb = functionalBounds ? *functionalBounds : target.bounds;
  bool clear = true;
  for (const Point3& c : pinCenters) {
    const double distance = jsHypot3(std::max({tb.min.x - c.x, 0.0, c.x - tb.max.x}), std::max({tb.min.y - c.y, 0.0, c.y - tb.max.y}),
                                     std::max({tb.min.z - c.z, 0.0, c.z - tb.max.z}));
    if (!(distance > radius + parameters.geometryToleranceMm)) clear = false;
  }
  if (!clear) return {{}, std::string("no interference-safe pin placement on the parting plane")};

  const double pinHeight = parameters.caseWallThicknessMm * 2;
  std::vector<PinPlacement> placements;
  for (std::size_t index = 0; index < pinCenters.size(); ++index) {
    placements.push_back({{"tooling-pin-" + std::string(masterDirName(split.axis)) + "-" + std::to_string(index), "pin", "piece-positive-side", "piece-negative-side"},
                          cylinderPrismPayload(pinAxis, pinCenters[index], radius, pinHeight, kToolingPinSegments)});
  }
  return {placements, std::nullopt};
}

ConstructedPiece constructedFromSolid(IMeshGeometryEngine& engine, const SolidPtr& solid) {
  ConstructedPiece piece;
  piece.mesh = engine.meshFromSolid(solid, {}, "Mesh export");
  piece.bounds = solid->bounds();
  piece.volumeMm3 = solid->volume();
  piece.solid = engine.asOriginal(solid);
  return piece;
}

}  // namespace

RegisteredPiecePair applyToolingRegistration(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace, const SplitSpec& split,
                                             const MasterToolingParameters& parameters, const std::optional<Bounds3>& functionalBounds,
                                             const ConstructedPiece& positive, const ConstructedPiece& negative) {
  auto [placements, reason] = planToolingRegistrationPinPlacements(target, pourFace, split, parameters, functionalBounds);
  if (placements.empty() || reason) {
    return {positive, negative, {}, reason ? reason : std::optional<std::string>("no registration placements generated")};
  }
  const Bounds3 caseBounds = caseEnvelopeFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(caseBounds, 0);
  const double volumeTolerance = std::max(policy.affectedVolumeToleranceMm3, target.volumeMm3 * 1e-3);
  const int splitAxis = masterDirAxis(split.axis);
  const double sweepClearance = (target.bounds.max[splitAxis] - target.bounds.min[splitAxis]) * 1.1 + parameters.caseWallThicknessMm * 2;

  SolidPtr positiveSolid = engine.asOriginal(positive.solid);
  SolidPtr negativeSolid = engine.asOriginal(negative.solid);
  for (const PinPlacement& placement : placements) {
    const SolidPtr pin = engine.solidFromMesh(placement.payload, policy.booleanToleranceMm, "Mesh preparation");
    positiveSolid = engine.unionOf({positiveSolid, pin});
    negativeSolid = engine.subtract(negativeSolid, pin);
  }
  const Point3 sweepDirection = split.normal ? *split.normal : masterDirVector(split.axis);
  const auto sweep = verifyDemoldTranslationByVector(engine, negativeSolid, positiveSolid, sweepDirection, sweepClearance, policy.surfaceToleranceMm, volumeTolerance);
  if (!sweep.removable) {
    return {constructedFromSolid(engine, positiveSolid), constructedFromSolid(engine, negativeSolid), {}, std::string("registered pieces failed the re-verified release sweep")};
  }
  RegisteredPiecePair out{constructedFromSolid(engine, positiveSolid), constructedFromSolid(engine, negativeSolid), {}, std::nullopt};
  for (const PinPlacement& p : placements) out.features.push_back(p.feature);
  return out;
}

// --- one-piece case ----------------------------------------------------------------------------------------------------------

OnePieceAttempt attemptOnePiece(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                const MasterToolingParameters& parameters,
                                const std::vector<MasterVentRecommendation>& recommendations, const MeshPayload& protectedMesh) {
  OnePieceAttempt result;
  const Bounds3 caseBounds = masterStockBoundsFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(caseBounds, 0);
  const double volumeTolerance = std::max(policy.affectedVolumeToleranceMm3, target.volumeMm3 * 1e-3);
  const int axis = masterDirAxis(pourFace);
  const double sweepClearanceMm = (caseBounds.max[axis] - caseBounds.min[axis]) * 1.1;
  const auto ventFeatures = safeVentPathsFor(target.bounds, caseBounds, target.bounds, recommendations, parameters.caseWallThicknessMm, target.mesh, &protectedMesh);

  const SolidPtr targetSolid = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
  ConstructedPiece constructed;
  try {
    constructed = constructCasePiece(engine, target, pourFace, parameters, std::nullopt, nullptr, CoreAssignmentMode::Split, ventFeatures);
  } catch (const std::runtime_error&) {
    return result;
  }

  const MasterDir releaseDirection = masterDirFlip(pourFace);
  const Point3 releaseVector = masterDirVector(releaseDirection);
  const auto sweep = verifyDemoldTranslationByVector(engine, targetSolid, constructed.solid, releaseVector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
  if (!sweep.removable) {
    // Exact lock localization: where the case jams against the target at first contact (seeds the localized-core search).
    if (sweep.firstCollisionDistanceMm) {
      const double d = *sweep.firstCollisionDistanceMm;
      const SolidPtr translated = engine.translate(constructed.solid, releaseVector.x * d, releaseVector.y * d, releaseVector.z * d);
      const SolidPtr overlap = engine.intersect(targetSolid, translated);
      if (!overlap->isEmpty()) result.collisionBounds = overlap->bounds();
    }
    return result;
  }

  const double assembledTolerance = std::max(policy.affectedVolumeToleranceMm3, target.volumeMm3 * 1e-4);
  const double overlap = engine.intersect(constructed.solid, targetSolid)->volume();
  const double envelopeVolume = (caseBounds.max.x - caseBounds.min.x) * (caseBounds.max.y - caseBounds.min.y) * (caseBounds.max.z - caseBounds.min.z);
  double residual = envelopeVolume - constructed.solid->volume() - targetSolid->volume();
  if (std::fabs(residual) <= assembledTolerance) residual = 0;
  if (overlap > volumeTolerance || residual < -volumeTolerance || residual > target.volumeMm3) return result;

  const MasterToolingPiece piece = pieceFromConstructed("piece-1", target.moldPartName + " Master Case", constructed, masterDirName(releaseDirection), {"one-piece"});
  result.ok = true;
  result.pieces = {piece};
  result.ventFeatures = ventFeatures;
  result.releaseSequence = {{0, piece.pieceId, piece.releaseDirection, sweepClearanceMm, true, std::nullopt}};
  return result;
}

}  // namespace craft