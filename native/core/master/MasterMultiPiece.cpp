#include "master/MasterMultiPiece.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>

#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "master/MasterAccessibility.h"  // jsToFixed
#include "master/MasterWorkingMoldConstructor.h"
#include "master/RayBvh.h"
#include "mold/Registration.h"  // jsNumberToString

namespace craft {

namespace {

constexpr double kSplitFractions[3] = {0.35, 0.5, 0.65};
constexpr int kMaxFeatureLevelsPerAxis = 8;
constexpr int kMaxSplitDepth = 2;
constexpr int kAbsoluteMaxToolingPieces = 4;
constexpr int kMaxReleaseVerificationSweeps = 48;
constexpr int kMaxExactAttemptsPerAxis = 2;
constexpr int kPlannerSweepSamples = 8;
constexpr int kMaxObliqueSplitPlanes = 2;
constexpr int kMaxObliqueExactAttempts = 4;
constexpr int kObliqueSampleCap = 2048;
constexpr int kMaxObliqueSeeds = 8;
constexpr double kFragilePieceVolumeFraction = 0.05;
constexpr double kObliqueExclusionCosine = 0.985;
constexpr double kObliqueMergeAngleDeg = 12;
constexpr double kLevelQuantumMm = 1e-4;
constexpr double kDemoldClearanceSafetyFactor = 1.1;
constexpr double kRegistrationPinRadiusMm = 2.5;
constexpr int kRegistrationPinSegments = 16;
constexpr double kMultiPanelMinPinRadiusMm = 1;
constexpr double kMultiPanelPinPositions[5][2] = {{0.2, 0.2}, {0.8, 0.8}, {0.2, 0.8}, {0.8, 0.2}, {0.5, 0.5}};
// PLAN_COST_WEIGHTS
constexpr double kFragilePiecePenalty = 100, kVolumeImbalance = 1, kPrintVolume = 1e-5, kExtraPanelPenalty = 2;

double jsRound(double v) { return std::floor(v + 0.5); }

std::vector<float> toFloats(const std::vector<double>& v) { return std::vector<float>(v.begin(), v.end()); }

struct PullCandidate {
  std::string pull;
  Point3 vector;
  bool oblique = false;
};

Point3 neg(const Point3& v) { return {-v.x, -v.y, -v.z}; }

std::vector<MasterDir> chunkReleaseDirectionOrder(MasterDir splitAxis) {
  const MasterDir opposite = flipDirection(splitAxis);
  std::vector<MasterDir> order{splitAxis, opposite};
  for (MasterDir d : kMasterDirections) if (d != splitAxis && d != opposite) order.push_back(d);
  return order;
}

std::vector<PullCandidate> pullCandidatesFor(MasterDir splitAxis, const std::optional<Point3>& assigned, const std::optional<Point3>& planeNormal = std::nullopt) {
  std::vector<PullCandidate> candidates;
  for (MasterDir d : chunkReleaseDirectionOrder(splitAxis)) candidates.push_back({masterDirName(d), masterDirVector(d), false});
  if (planeNormal) {
    candidates.insert(candidates.begin() + 1, {"-plane-normal", neg(*planeNormal), true});
    candidates.insert(candidates.begin() + 1, {"+plane-normal", *planeNormal, true});
  }
  if (assigned) {
    const double length = jsHypot3(assigned->x, assigned->y, assigned->z);
    if (length > 0) {
      const Point3 v{assigned->x / length, assigned->y / length, assigned->z / length};
      candidates.insert(candidates.begin() + 1, {"-assigned", v, true});
      candidates.insert(candidates.begin() + 1, {"+assigned", neg(v), true});
    }
  }
  return candidates;
}

}  // namespace

MasterDir flipDirection(MasterDir direction) { return masterDirFlip(direction); }

// --- lock evidence -------------------------------------------------------------------------------------------------------

namespace {

Bounds3 growPullColumn(const Bounds3& seed, const Bounds3& target, const Point3& pull, double padMm) {
  Bounds3 out = seed;
  const double components[3] = {std::fabs(pull.x), std::fabs(pull.y), std::fabs(pull.z)};
  int axis = 0;
  for (int i = 1; i < 3; ++i) if (components[i] > components[axis]) axis = i;
  if (pull[axis] > 0) out.max[axis] = target.max[axis]; else out.min[axis] = target.min[axis];
  for (int c = 0; c < 3; ++c) {
    if (c == axis) continue;
    out.min[c] = std::max(target.min[c], out.min[c] - padMm);
    out.max[c] = std::min(target.max[c], out.max[c] + padMm);
  }
  return out;
}

bool containsSeed(const Bounds3& outer, const Bounds3& inner) {
  return outer.min.x <= inner.min.x + 1e-6 && outer.min.y <= inner.min.y + 1e-6 && outer.min.z <= inner.min.z + 1e-6 &&
         outer.max.x >= inner.max.x - 1e-6 && outer.max.y >= inner.max.y - 1e-6 && outer.max.z >= inner.max.z - 1e-6;
}

}  // namespace

LockEvidence deriveLockRegions(const MasterCastTarget& target, MasterDir pullDirection, const std::optional<Bounds3>& collisionBounds) {
  LockEvidence evidence;
  evidence.pullDirection = pullDirection;
  const Point3 pull = masterDirVector(pullDirection);
  evidence.pullVector = pull;
  const Bounds3& tb = target.bounds;
  const double maxSpan = std::max({tb.max.x - tb.min.x, tb.max.y - tb.min.y, tb.max.z - tb.min.z});
  const double cellMm = maxSpan / 8;
  std::vector<LockRegion> regions;
  if (collisionBounds) regions.push_back({*collisionBounds, growPullColumn(*collisionBounds, tb, pull, cellMm), "release-collision", std::nullopt});

  const std::vector<float> positions = toFloats(target.mesh.positions);
  const RayBvh bvh(positions, target.mesh.indices);
  const auto& indices = target.mesh.indices;
  const std::size_t triangleCount = indices.size() / 3;
  const std::size_t stride = std::max<std::size_t>(1, static_cast<std::size_t>(std::floor(static_cast<double>(triangleCount) / 256)));
  std::vector<Point3> lockedPoints;
  for (std::size_t t = 0; t < triangleCount; t += stride) {
    const auto vertex = [&](int c) {
      const std::size_t v = indices[t * 3 + static_cast<std::size_t>(c)];
      return Point3{target.mesh.positions[v * 3], target.mesh.positions[v * 3 + 1], target.mesh.positions[v * 3 + 2]};
    };
    const Point3 a = vertex(0), b = vertex(1), c = vertex(2);
    const Point3 ab{b.x - a.x, b.y - a.y, b.z - a.z}, ac{c.x - a.x, c.y - a.y, c.z - a.z};
    Point3 normal{ab.y * ac.z - ab.z * ac.y, ab.z * ac.x - ab.x * ac.z, ab.x * ac.y - ab.y * ac.x};
    const double area2 = std::sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (area2 <= 0) continue;
    const double inv = 1 / area2;
    normal = {normal.x * inv, normal.y * inv, normal.z * inv};
    if (normal.x * pull.x + normal.y * pull.y + normal.z * pull.z >= -1e-3) continue;
    const Point3 sum{(a.x + b.x) + c.x, (a.y + b.y) + c.y, (a.z + b.z) + c.z};
    const Point3 centroid{sum.x * (1.0 / 3), sum.y * (1.0 / 3), sum.z * (1.0 / 3)};
    const Point3 probe{centroid.x + normal.x * 1e-3, centroid.y + normal.y * 1e-3, centroid.z + normal.z * 1e-3};
    ++evidence.sampledTriangleCount;
    if (bvh.countUniqueForwardIntersections(probe, pull) > 0) {
      ++evidence.lockedSampleCount;
      lockedPoints.push_back(centroid);
    }
  }

  struct Key { int x, y, z; bool operator==(const Key&) const = default; };
  struct Cell { int count = 0; std::vector<Point3> points; };
  std::vector<Key> order;
  std::vector<Cell> cells;
  const auto find = [&](const Key& k) -> int {
    for (std::size_t i = 0; i < order.size(); ++i) if (order[i] == k) return static_cast<int>(i);
    return -1;
  };
  for (const Point3& p : lockedPoints) {
    const Key key{std::min(7, static_cast<int>(std::floor((p.x - tb.min.x) / cellMm))), std::min(7, static_cast<int>(std::floor((p.y - tb.min.y) / cellMm))),
                  std::min(7, static_cast<int>(std::floor((p.z - tb.min.z) / cellMm)))};
    int i = find(key);
    if (i < 0) { order.push_back(key); cells.emplace_back(); i = static_cast<int>(order.size()) - 1; }
    cells[static_cast<std::size_t>(i)].count += 1;
    cells[static_cast<std::size_t>(i)].points.push_back(p);
  }
  std::vector<bool> visited(order.size(), false);
  for (std::size_t start = 0; start < order.size(); ++start) {
    if (visited[start]) continue;
    std::vector<int> component, stack{static_cast<int>(start)};
    visited[start] = true;
    while (!stack.empty()) {
      const int current = stack.back();
      stack.pop_back();
      component.push_back(current);
      const Key k = order[static_cast<std::size_t>(current)];
      const Key neighbors[6] = {{k.x - 1, k.y, k.z}, {k.x + 1, k.y, k.z}, {k.x, k.y - 1, k.z}, {k.x, k.y + 1, k.z}, {k.x, k.y, k.z - 1}, {k.x, k.y, k.z + 1}};
      for (const Key& n : neighbors) {
        const int ni = find(n);
        if (ni < 0 || visited[static_cast<std::size_t>(ni)]) continue;
        visited[static_cast<std::size_t>(ni)] = true;
        stack.push_back(ni);
      }
    }
    Point3 min{INFINITY, INFINITY, INFINITY}, max{-INFINITY, -INFINITY, -INFINITY};
    int count = 0;
    for (int m : component) {
      count += cells[static_cast<std::size_t>(m)].count;
      for (const Point3& p : cells[static_cast<std::size_t>(m)].points) {
        min = {std::min(min.x, p.x), std::min(min.y, p.y), std::min(min.z, p.z)};
        max = {std::max(max.x, p.x), std::max(max.y, p.y), std::max(max.z, p.z)};
      }
    }
    if (count == 0) continue;
    const Bounds3 seedBounds{min, max};
    const Bounds3 bounds = growPullColumn(seedBounds, tb, pull, cellMm);
    if (std::any_of(regions.begin(), regions.end(), [&](const LockRegion& r) { return containsSeed(r.bounds, seedBounds); })) continue;
    regions.push_back({seedBounds, bounds, "inaccessible-patch-cluster", count});
  }

  const auto rank = [](const LockRegion& r) { return r.evidence == "release-collision" ? 9007199254740991.0 : static_cast<double>(r.lockedSampleCount.value_or(0)); };
  std::stable_sort(regions.begin(), regions.end(), [&](const LockRegion& a, const LockRegion& b) { return rank(b) < rank(a); });
  if (regions.size() > 4) regions.resize(4);
  evidence.regions = std::move(regions);
  return evidence;
}

// --- candidate splits -----------------------------------------------------------------------------------------------------

std::vector<double> featureLevels(const MeshPayload& mesh, int axis, double min, double max) {
  std::vector<double> levels;
  for (std::size_t i = static_cast<std::size_t>(axis); i < mesh.positions.size(); i += 3) {
    const double value = mesh.positions[i];
    if (value < min - kLevelQuantumMm || value > max + kLevelQuantumMm) continue;
    const double rounded = jsRound(value / kLevelQuantumMm) * kLevelQuantumMm;
    if (std::find(levels.begin(), levels.end(), rounded) == levels.end()) levels.push_back(rounded);
  }
  std::stable_sort(levels.begin(), levels.end());
  if (static_cast<int>(levels.size()) > kMaxFeatureLevelsPerAxis) levels.resize(kMaxFeatureLevelsPerAxis);
  return levels;
}

namespace {

std::vector<CandidateSplit> obliqueClusterSplits(const MasterCastTarget& target) {
  const MeshPayload& mesh = target.mesh;
  const std::size_t triangleCount = mesh.indices.size() / 3;
  if (triangleCount == 0) return {};
  const std::size_t stride = std::max<std::size_t>(1, static_cast<std::size_t>(std::floor(static_cast<double>(triangleCount) / kObliqueSampleCap)));
  const double mergeCosine = std::cos((kObliqueMergeAngleDeg * 3.14159265358979323846) / 180);
  struct Seed { double nx, ny, nz, area; };
  std::vector<Seed> seeds;
  for (std::size_t t = 0; t < triangleCount; t += stride) {
    const std::size_t i0 = mesh.indices[t * 3] * 3ull, i1 = mesh.indices[t * 3 + 1] * 3ull, i2 = mesh.indices[t * 3 + 2] * 3ull;
    const double ax = mesh.positions[i1] - mesh.positions[i0], ay = mesh.positions[i1 + 1] - mesh.positions[i0 + 1], az = mesh.positions[i1 + 2] - mesh.positions[i0 + 2];
    const double bx = mesh.positions[i2] - mesh.positions[i0], by = mesh.positions[i2 + 1] - mesh.positions[i0 + 1], bz = mesh.positions[i2 + 2] - mesh.positions[i0 + 2];
    double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const double length = jsHypot3(nx, ny, nz);
    if (length < 1e-12) continue;
    const double area = length / 2;
    nx /= length; ny /= length; nz /= length;
    if (std::fabs(nx) >= kObliqueExclusionCosine || std::fabs(ny) >= kObliqueExclusionCosine || std::fabs(nz) >= kObliqueExclusionCosine) continue;
    const bool flip = std::fabs(nx) >= std::fabs(ny) && std::fabs(nx) >= std::fabs(nz) ? nx < 0 : std::fabs(ny) >= std::fabs(nz) ? ny < 0 : nz < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    Seed* existing = nullptr;
    for (Seed& s : seeds) if (s.nx * nx + s.ny * ny + s.nz * nz >= mergeCosine) { existing = &s; break; }
    if (existing) { existing->area += area; continue; }
    if (static_cast<int>(seeds.size()) >= kMaxObliqueSeeds) continue;
    seeds.push_back({nx, ny, nz, area});
  }
  const Point3 center{(target.bounds.min.x + target.bounds.max.x) / 2, (target.bounds.min.y + target.bounds.max.y) / 2, (target.bounds.min.z + target.bounds.max.z) / 2};
  std::stable_sort(seeds.begin(), seeds.end(), [](const Seed& a, const Seed& b) {
    if (b.area - a.area != 0) return b.area - a.area < 0;
    if (a.nx - b.nx != 0) return a.nx - b.nx < 0;
    if (a.ny - b.ny != 0) return a.ny - b.ny < 0;
    return a.nz - b.nz < 0;
  });
  if (static_cast<int>(seeds.size()) > kMaxObliqueSplitPlanes) seeds.resize(kMaxObliqueSplitPlanes);
  std::vector<CandidateSplit> out;
  for (const Seed& s : seeds) {
    const Point3 normal{s.nx, s.ny, s.nz};
    const double ax = std::fabs(normal.x), ay = std::fabs(normal.y), az = std::fabs(normal.z);
    MasterDir axis;
    if (ax >= ay && ax >= az) axis = normal.x >= 0 ? MasterDir::PX : MasterDir::NX;
    else if (ay >= az) axis = normal.y >= 0 ? MasterDir::PY : MasterDir::NY;
    else axis = normal.z >= 0 ? MasterDir::PZ : MasterDir::NZ;
    const Point3 v = masterDirVector(axis);
    out.push_back({axis, center.x * v.x + center.y * v.y + center.z * v.z, "oblique-normal-cluster", normal, center});
  }
  return out;
}

}  // namespace

std::vector<CandidateSplit> candidateSplits(const MasterCastTarget& target, const MeshPayload* coreToolMesh, const std::optional<Point3>& buildVolume) {
  std::vector<CandidateSplit> splits;
  std::set<std::string> seen;
  const auto pushAxisAligned = [&](MasterDir axis, double coordinate, const char* origin) {
    const std::string key = std::string(masterDirName(axis)) + ":" + jsNumberToString(jsRound(coordinate / kLevelQuantumMm));
    if (!seen.insert(key).second) return;
    splits.push_back({axis, coordinate, origin, std::nullopt, std::nullopt});
  };
  const MasterDir axes[3] = {MasterDir::PX, MasterDir::PY, MasterDir::PZ};
  for (MasterDir axis : axes) {
    const int a = masterDirAxis(axis);
    const double min = target.bounds.min[a], max = target.bounds.max[a], span = max - min;
    if (buildVolume && span > (*buildVolume)[a]) {
      pushAxisAligned(axis, min + (*buildVolume)[a], "build-volume");
      pushAxisAligned(axis, max - (*buildVolume)[a], "build-volume");
    }
    for (double level : featureLevels(target.mesh, a, min, max)) pushAxisAligned(axis, level, "target-feature");
    if (coreToolMesh) for (double level : featureLevels(*coreToolMesh, a, min, max)) pushAxisAligned(axis, level, "tool-feature");
  }
  for (const CandidateSplit& s : obliqueClusterSplits(target)) splits.push_back(s);
  for (MasterDir axis : axes) {
    const int a = masterDirAxis(axis);
    const double span = target.bounds.max[a] - target.bounds.min[a];
    for (double fraction : kSplitFractions) pushAxisAligned(axis, target.bounds.min[a] + span * fraction, "span-fraction");
    pushAxisAligned(axis, target.bounds.min[a], "target-face");
    pushAxisAligned(axis, target.bounds.max[a], "target-face");
  }
  return splits;
}

// --- chunks ---------------------------------------------------------------------------------------------------------------------

namespace {

struct ChunkCutPlane {
  MasterDir axis = MasterDir::PX;
  double coordinateMm = 0;
  std::optional<Point3> normal, point;
};
struct ChunkLineage {
  std::vector<ChunkCutPlane> cuts;
  std::vector<bool> sides;
};
struct CaseChunk {
  SolidPtr solid;
  Bounds3 bounds;
  double volumeMm3 = 0;
  std::optional<ChunkLineage> lineage;
};
struct SequencedChunk {
  int chunkIndex = 0;
  PullCandidate pull;
};

std::vector<CaseChunk> chunkify(IMeshGeometryEngine& engine, const SolidPtr& solid, const std::optional<ChunkLineage>& lineage) {
  const auto components = engine.decompose(solid);
  std::vector<CaseChunk> chunks;
  if (components.size() <= 1) {
    chunks.push_back({engine.asOriginal(solid), solid->bounds(), solid->volume(), lineage});
    return chunks;
  }
  for (const SolidPtr& c : components) chunks.push_back({engine.asOriginal(c), c->bounds(), c->volume(), lineage});
  return chunks;
}

std::optional<std::vector<CaseChunk>> bisectChunk(IMeshGeometryEngine& engine, const CaseChunk& chunk) {
  int longest = 0;
  double longestSpan = -1;
  for (int a = 0; a < 3; ++a) {
    const double span = chunk.bounds.max[a] - chunk.bounds.min[a];
    if (span > longestSpan) { longestSpan = span; longest = a; }
  }
  if (longestSpan <= 0) return std::nullopt;
  std::vector<CaseChunk> results;
  const double cut = chunk.bounds.min[longest] + longestSpan * 0.5;
  for (bool side : {true, false}) {
    Bounds3 half = chunk.bounds;
    if (side) half.min[longest] = cut; else half.max[longest] = cut;
    const SolidPtr piece = engine.intersect(chunk.solid, engine.box(half));
    if (piece->isEmpty()) continue;
    ChunkLineage lineage = chunk.lineage.value_or(ChunkLineage{});
    lineage.cuts.push_back({longest == 0 ? MasterDir::PX : longest == 1 ? MasterDir::PY : MasterDir::PZ, cut, std::nullopt, std::nullopt});
    lineage.sides.push_back(side);
    results.push_back({engine.asOriginal(piece), piece->bounds(), piece->volume(), lineage});
  }
  if (results.size() >= 2) return results;
  return std::nullopt;
}

bool sweptAabbsNeverOverlap(const CaseChunk& chunk, const Bounds3& obstacle, const Point3& vector, double clearanceMm) {
  const double eps = 1e-6;
  double overlapStart = eps, overlapEnd = clearanceMm;
  for (int a = 0; a < 3; ++a) {
    const double component = vector[a];
    const double lo = chunk.bounds.min[a], hi = chunk.bounds.max[a], oLo = obstacle.min[a], oHi = obstacle.max[a];
    if (std::fabs(component) < 1e-9) {
      if (hi <= oLo || lo >= oHi) return true;
      continue;
    }
    double start = std::max(overlapStart, (oHi - hi) / component);
    double end = std::min(overlapEnd, (oLo - lo) / component);
    if (start >= end) return true;
    overlapStart = start;
    overlapEnd = end;
  }
  return overlapStart >= overlapEnd;
}

struct ChunkBudget { int sweeps = 0; };

std::optional<std::vector<SequencedChunk>> sequenceRelease(IMeshGeometryEngine& engine, const MasterCastTarget& target, std::vector<CaseChunk>& chunks,
                                                           const std::vector<PullCandidate>& pullCandidates, const GeometryTolerancePolicy& policy,
                                                           double volumeTolerance, double sweepClearanceMm, ChunkBudget& budget) {
  const SolidPtr targetSolid = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
  std::vector<int> remaining;
  for (std::size_t i = 0; i < chunks.size(); ++i) remaining.push_back(static_cast<int>(i));
  std::vector<SequencedChunk> sequence;
  while (!remaining.empty()) {
    int removed = -1;
    PullCandidate removedPull;
    for (int ci : remaining) {
      const CaseChunk& chunk = chunks[static_cast<std::size_t>(ci)];
      const double volumeFloor = std::max(policy.affectedVolumeToleranceMm3, target.volumeMm3 * kFragilePieceVolumeFraction * 0.5);
      if (chunk.volumeMm3 < volumeFloor) continue;
      for (const PullCandidate& candidate : pullCandidates) {
        if (budget.sweeps >= kMaxReleaseVerificationSweeps) return std::nullopt;
        if (!sweptAabbsNeverOverlap(chunk, target.bounds, candidate.vector, sweepClearanceMm)) {
          budget.sweeps += 1;
          const auto vsTarget = verifyDemoldTranslationByVector(engine, targetSolid, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm,
                                                                volumeTolerance, kPlannerSweepSamples);
          if (!vsTarget.removable) continue;
        }
        bool siblingsOk = true;
        for (int si : remaining) {
          if (si == ci) continue;
          const CaseChunk& sibling = chunks[static_cast<std::size_t>(si)];
          if (sweptAabbsNeverOverlap(chunk, sibling.bounds, candidate.vector, sweepClearanceMm)) continue;
          if (budget.sweeps >= kMaxReleaseVerificationSweeps) return std::nullopt;
          budget.sweeps += 1;
          const auto vsSibling = verifyDemoldTranslationByVector(engine, sibling.solid, chunk.solid, candidate.vector, sweepClearanceMm,
                                                                 policy.surfaceToleranceMm, volumeTolerance, kPlannerSweepSamples);
          if (!vsSibling.removable) { siblingsOk = false; break; }
        }
        if (siblingsOk) { removed = ci; removedPull = candidate; break; }
      }
      if (removed >= 0) break;
    }
    if (removed < 0) return std::nullopt;
    remaining.erase(std::find(remaining.begin(), remaining.end(), removed));
    sequence.push_back({removed, removedPull});
  }
  return sequence;
}

struct ProvenCut { int first, second; ChunkCutPlane cut; };

std::vector<ProvenCut> provenanceInterfaceCuts(const std::vector<CaseChunk>& chunks, const std::vector<SequencedChunk>& sequence) {
  std::vector<ProvenCut> pairs;
  for (std::size_t first = 0; first < sequence.size(); ++first) {
    for (std::size_t second = first + 1; second < sequence.size(); ++second) {
      const auto& la = chunks[static_cast<std::size_t>(sequence[first].chunkIndex)].lineage;
      const auto& lb = chunks[static_cast<std::size_t>(sequence[second].chunkIndex)].lineage;
      if (!la || !lb) continue;
      int divergence = -1;
      const std::size_t shared = std::min(la->sides.size(), lb->sides.size());
      for (std::size_t depth = 0; depth < shared; ++depth) {
        if (la->sides[depth] != lb->sides[depth]) { divergence = static_cast<int>(depth); break; }
      }
      if (divergence < 0) continue;
      const std::size_t d = static_cast<std::size_t>(divergence);
      const ChunkCutPlane* cut = d < la->cuts.size() ? &la->cuts[d] : d < lb->cuts.size() ? &lb->cuts[d] : nullptr;
      if (!cut) continue;
      pairs.push_back({static_cast<int>(first), static_cast<int>(second), *cut});
    }
  }
  return pairs;
}

double provenInterfaceAreaMm2(IMeshGeometryEngine& engine, const GeometryTolerancePolicy& policy, const CaseChunk& first, const CaseChunk& second,
                              const ChunkCutPlane& cut) {
  const Point3 normal = cut.normal ? *cut.normal : masterDirVector(cut.axis);
  const double planeOffset = cut.normal && cut.point ? cut.normal->x * cut.point->x + cut.normal->y * cut.point->y + cut.normal->z * cut.point->z : cut.coordinateMm;
  const Point3 ca{(first.bounds.min.x + first.bounds.max.x) / 2, (first.bounds.min.y + first.bounds.max.y) / 2, (first.bounds.min.z + first.bounds.max.z) / 2};
  const Point3 cb{(second.bounds.min.x + second.bounds.max.x) / 2, (second.bounds.min.y + second.bounds.max.y) / 2, (second.bounds.min.z + second.bounds.max.z) / 2};
  const double dotA = ca.x * normal.x + ca.y * normal.y + ca.z * normal.z;
  const double dotB = cb.x * normal.x + cb.y * normal.y + cb.z * normal.z;
  const bool firstIsMinSide = dotA <= dotB;
  constexpr double kPi = 3.14159265358979323846;
  const double thetaY = std::atan2(normal.x, normal.z);
  const double thetaX = -std::asin(std::max(-1.0, std::min(1.0, normal.y)));
  const auto rotateToZ = [&](const SolidPtr& s) {
    return engine.rotate(engine.rotate(s, 0, (-thetaY * 180) / kPi, 0), (-thetaX * 180) / kPi, 0, 0);
  };
  const double eps = std::max(policy.surfaceToleranceMm, 1e-4) * 10;
  const SolidPtr r0 = rotateToZ(engine.asOriginal(first.solid));
  const SolidPtr r1 = rotateToZ(engine.asOriginal(second.solid));
  return engine.sliceOverlapArea(firstIsMinSide ? r0 : r1, planeOffset - eps, firstIsMinSide ? r1 : r0, planeOffset + eps);
}

double pointToSegmentDistanceMm(const Point3& p, const Point3& s, const Point3& e) {
  const double sx = e.x - s.x, sy = e.y - s.y, sz = e.z - s.z;
  const double lengthSq = sx * sx + sy * sy + sz * sz;
  const double t = lengthSq <= 1e-18 ? 0 : std::max(0.0, std::min(1.0, ((p.x - s.x) * sx + (p.y - s.y) * sy + (p.z - s.z) * sz) / lengthSq));
  return jsHypot3(p.x - (s.x + t * sx), p.y - (s.y + t * sy), p.z - (s.z + t * sz));
}

struct MultiPanelRegistration {
  std::vector<MasterToolingRegistrationFeature> features;
  std::optional<std::string> failureReason;
  std::vector<std::string> blockedInterfaces;
};

MultiPanelRegistration registerMultiPanelInterfaces(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                                    std::vector<CaseChunk>& chunks, const std::vector<SequencedChunk>& sequence,
                                                    const std::vector<MasterVentFeature>& ventFeatures, const MasterToolingParameters& parameters,
                                                    const GeometryTolerancePolicy& policy, double volumeTolerance, double sweepClearanceMm) {
  MultiPanelRegistration out;
  const double wallDerivedRadius = std::min(kRegistrationPinRadiusMm, parameters.caseWallThicknessMm / 2);
  if (wallDerivedRadius < kMultiPanelMinPinRadiusMm) {
    out.failureReason = "case wall " + jsNumberToString(parameters.caseWallThicknessMm) + "mm can carry at most a " + jsToFixed(wallDerivedRadius, 3) +
                        "mm registration key, below the " + jsNumberToString(kMultiPanelMinPinRadiusMm) + "mm printable minimum.";
    return out;
  }
  const SolidPtr targetSolid = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
  const Bounds3 caseBounds = caseEnvelopeFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const int pourAxis = masterDirAxis(pourFace);
  const Point3 pourDirection = masterDirVector(pourFace);
  Bounds3 keepOut{{target.bounds.min.x - wallDerivedRadius, target.bounds.min.y - wallDerivedRadius, target.bounds.min.z - wallDerivedRadius},
                  {target.bounds.max.x + wallDerivedRadius, target.bounds.max.y + wallDerivedRadius, target.bounds.max.z + wallDerivedRadius}};
  if (pourDirection[pourAxis] > 0) {
    keepOut.min[pourAxis] = target.bounds.max[pourAxis];
    keepOut.max[pourAxis] = std::max(caseBounds.max[pourAxis], target.bounds.max[pourAxis]);
  } else {
    keepOut.max[pourAxis] = target.bounds.min[pourAxis];
    keepOut.min[pourAxis] = std::min(caseBounds.min[pourAxis], target.bounds.min[pourAxis]);
  }
  SolidPtr pourKeepOut;
  if (!(keepOut.max[pourAxis] - keepOut.min[pourAxis] <= 0)) pourKeepOut = engine.box(keepOut);

  for (const ProvenCut& nomination : provenanceInterfaceCuts(chunks, sequence)) {
    const std::string pairLabel = "panel-" + std::to_string(nomination.first + 1) + ":panel-" + std::to_string(nomination.second + 1);
    const std::string maleId = "piece-panel-" + std::to_string(nomination.first + 1), femaleId = "piece-panel-" + std::to_string(nomination.second + 1);
    if (std::any_of(out.features.begin(), out.features.end(), [&](const auto& f) { return f.malePieceId == maleId && f.femalePieceId == femaleId; })) continue;
    CaseChunk& first = chunks[static_cast<std::size_t>(sequence[static_cast<std::size_t>(nomination.first)].chunkIndex)];
    CaseChunk& second = chunks[static_cast<std::size_t>(sequence[static_cast<std::size_t>(nomination.second)].chunkIndex)];
    const double patchArea = provenInterfaceAreaMm2(engine, policy, first, second, nomination.cut);
    if (patchArea <= volumeTolerance / std::max(1e-3, sweepClearanceMm)) continue;

    const Point3 cutNormal = nomination.cut.normal ? *nomination.cut.normal : masterDirVector(nomination.cut.axis);
    const double planeOffset = nomination.cut.normal && nomination.cut.point
        ? nomination.cut.normal->x * nomination.cut.point->x + nomination.cut.normal->y * nomination.cut.point->y + nomination.cut.normal->z * nomination.cut.point->z
        : nomination.cut.coordinateMm;
    const int cutAxis = masterDirAxis(nomination.cut.axis);
    std::vector<int> transverse;
    for (int a = 0; a < 3; ++a) if (a != cutAxis) transverse.push_back(a);
    Point3 overlapMin, overlapMax;
    for (int a = 0; a < 3; ++a) {
      overlapMin[a] = std::max(first.bounds.min[a], second.bounds.min[a]);
      overlapMax[a] = std::min(first.bounds.max[a], second.bounds.max[a]);
    }
    double patchRadiusCap = INFINITY;
    for (int a : transverse) patchRadiusCap = std::min(patchRadiusCap, (overlapMax[a] - overlapMin[a]) / 4);
    const double radiusMm = std::min(wallDerivedRadius, patchRadiusCap);
    if (radiusMm < kMultiPanelMinPinRadiusMm) {
      out.blockedInterfaces.push_back(pairLabel);
      if (!out.failureReason) {
        out.failureReason = pairLabel + " interface patch (" + jsToFixed(patchArea, 1) + " mm\xC2\xB2) cannot carry a printable key: patch extent allows at most a " +
                            jsToFixed(patchRadiusCap, 3) + "mm radius, below the " + jsNumberToString(kMultiPanelMinPinRadiusMm) + "mm printable minimum.";
      }
      continue;
    }
    const double ventClearance = parameters.geometryToleranceMm;
    bool placed = false;
    std::optional<std::string> blockedReason;
    for (const auto& frac : kMultiPanelPinPositions) {
      Point3 center{0, 0, 0};
      for (int a : transverse) center[a] = overlapMin[a];
      const int uAxis = transverse[0], vAxis = transverse[1];
      center[uAxis] += (overlapMax[uAxis] - overlapMin[uAxis]) * frac[0];
      center[vAxis] += (overlapMax[vAxis] - overlapMin[vAxis]) * frac[1];
      double residual = planeOffset;
      for (int a : transverse) residual -= cutNormal[a] * center[a];
      center[cutAxis] = residual / cutNormal[cutAxis];

      const SolidPtr probe = engine.sphere(radiusMm, kRegistrationPinSegments, center);
      bool corridorClear = true;
      if (engine.intersect(probe, targetSolid)->volume() > volumeTolerance) {
        blockedReason = "the key body intersects the functional cavity";
        corridorClear = false;
      }
      if (corridorClear && pourKeepOut && engine.intersect(probe, pourKeepOut)->volume() > volumeTolerance) {
        blockedReason = "the key body enters the pour corridor";
        corridorClear = false;
      }
      if (corridorClear) {
        for (const MasterVentFeature& vent : ventFeatures) {
          if (pointToSegmentDistanceMm(center, vent.start, vent.end) < radiusMm + vent.radiusMm + ventClearance) {
            blockedReason = "the key body enters a vent path corridor";
            corridorClear = false;
            break;
          }
        }
      }
      if (!corridorClear) continue;

      const SolidPtr pin = engine.sphere(radiusMm, kRegistrationPinSegments, center);
      const SolidPtr beforeFirst = engine.asOriginal(first.solid), beforeSecond = engine.asOriginal(second.solid);
      const SolidPtr newFirst = engine.unionOf({first.solid, pin});
      const SolidPtr newSecond = engine.subtract(second.solid, pin);
      first.solid = newFirst;
      second.solid = newSecond;
      first.bounds = newFirst->bounds();
      second.bounds = newSecond->bounds();
      first.volumeMm3 = newFirst->volume();
      second.volumeMm3 = newSecond->volume();

      bool verified = false;
      if (engine.decompose(newFirst).size() != 1 || engine.decompose(newSecond).size() != 1) {
        blockedReason = "the key would leave a disconnected panel";
      } else {
        verified = true;
        for (std::size_t entryIndex = 0; entryIndex < sequence.size() && verified; ++entryIndex) {
          const SequencedChunk& entry = sequence[entryIndex];
          const CaseChunk& entryChunk = chunks[static_cast<std::size_t>(entry.chunkIndex)];
          const auto targetProof = verifyDemoldTranslationByVector(engine, targetSolid, entryChunk.solid, entry.pull.vector, sweepClearanceMm,
                                                                   policy.surfaceToleranceMm, volumeTolerance);
          if (!targetProof.removable) {
            blockedReason = "panel-" + std::to_string(entryIndex + 1) + " no longer clears the cast target along its pull";
            verified = false;
            break;
          }
          for (std::size_t siblingIndex = entryIndex + 1; siblingIndex < sequence.size(); ++siblingIndex) {
            const auto siblingProof = verifyDemoldTranslationByVector(engine, chunks[static_cast<std::size_t>(sequence[siblingIndex].chunkIndex)].solid,
                                                                      entryChunk.solid, entry.pull.vector, sweepClearanceMm, policy.surfaceToleranceMm,
                                                                      volumeTolerance);
            if (!siblingProof.removable) {
              blockedReason = "panel-" + std::to_string(entryIndex + 1) + " collides with panel-" + std::to_string(siblingIndex + 1) + " during release";
              verified = false;
              break;
            }
          }
        }
      }
      if (!verified) {
        // The reference restores only the solids; bounds and volume stay those of the tentative key (replicated).
        first.solid = beforeFirst;
        second.solid = beforeSecond;
        continue;
      }
      out.features.push_back({"multi-panel-pin-" + std::to_string(nomination.first) + "-" + std::to_string(nomination.second) + "-" + std::to_string(out.features.size()),
                              "pin", maleId, femaleId});
      placed = true;
      break;
    }
    if (!placed) {
      out.blockedInterfaces.push_back(pairLabel);
      if (!out.failureReason) {
        out.failureReason = pairLabel + ": no key position on the " + jsToFixed(patchArea, 1) + " mm\xC2\xB2 interface patch cleared the corridors at the derived " +
                            jsToFixed(radiusMm, 2) + "mm radius (" + blockedReason.value_or("all candidate positions rejected") + ").";
      }
    }
  }
  return out;
}

ConstructedPiece constructedOf(IMeshGeometryEngine& engine, const CaseChunk& chunk) {
  ConstructedPiece c;
  c.mesh = engine.meshFromSolid(chunk.solid, {}, "Mesh export");
  c.bounds = chunk.bounds;
  c.volumeMm3 = chunk.volumeMm3;
  c.solid = engine.asOriginal(chunk.solid);
  return c;
}

bool fitsBuildVolume(const MasterToolingPiece& piece, const Point3& v) {
  return piece.bounds.max.x - piece.bounds.min.x <= v.x && piece.bounds.max.y - piece.bounds.min.y <= v.y && piece.bounds.max.z - piece.bounds.min.z <= v.z;
}

}  // namespace

// --- localized removable core ----------------------------------------------------------------------------------------------------------------

MultiPiecePlanAttempt planLocalizedRemovableCore(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                                 const MasterToolingParameters& parameters, const LockEvidence& lockEvidence,
                                                 const std::optional<Point3>& assignedDirection, const std::optional<Point3>& buildVolume,
                                                 const std::vector<MasterVentRecommendation>& ventRecommendations) {
  const Bounds3 caseBounds = caseEnvelopeFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(caseBounds, 0);
  const SolidPtr targetSolid = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
  const auto ventFeatures = safeVentPathsFor(target.bounds, caseBounds, target.bounds, ventRecommendations, parameters.caseWallThicknessMm, target.mesh, nullptr);
  ConstructedPiece shell;
  try {
    shell = constructCasePiece(engine, target, pourFace, parameters, std::nullopt, nullptr, CoreAssignmentMode::Split, ventFeatures);
  } catch (const std::runtime_error&) {
    return {std::nullopt, std::string("localized_core_case_construction_failed")};
  }
  const double volumeTolerance = std::max(policy.affectedVolumeToleranceMm3, target.volumeMm3 * 1e-3);
  const Point3 span{target.bounds.max.x - target.bounds.min.x, target.bounds.max.y - target.bounds.min.y, target.bounds.max.z - target.bounds.min.z};

  std::vector<PullCandidate> pullCandidates{{masterDirName(lockEvidence.pullDirection), masterDirVector(lockEvidence.pullDirection), false},
                                            {masterDirName(flipDirection(lockEvidence.pullDirection)), masterDirVector(flipDirection(lockEvidence.pullDirection)), false}};
  for (MasterDir axis : {MasterDir::PX, MasterDir::PY, MasterDir::PZ}) {
    for (const PullCandidate& c : pullCandidatesFor(axis, assignedDirection)) pullCandidates.push_back(c);
  }
  if (pullCandidates.size() > 10) pullCandidates.resize(10);

  for (const LockRegion& region : lockEvidence.regions) {
    const int partingAxis = masterDirAxis(lockEvidence.pullDirection);
    const double partingSign = lockEvidence.pullVector[partingAxis] > 0 ? 1 : -1;
    const SolidPtr regionBox = engine.box(region.bounds);
    const SolidPtr core = engine.intersect(targetSolid, regionBox);
    const double coreVolume = core->volume();
    if (core->isEmpty() || coreVolume <= volumeTolerance || coreVolume >= target.volumeMm3 * 0.45) continue;
    const SolidPtr remaining = engine.subtract(targetSolid, core);
    for (const PullCandidate& pull : pullCandidates) {
      const double clearance = span[partingAxis] * 1.25 + parameters.caseWallThicknessMm * 2;
      if (!verifyDemoldTranslationByVector(engine, shell.solid, core, pull.vector, clearance, policy.surfaceToleranceMm, volumeTolerance, 12).removable) continue;
      if (!verifyDemoldTranslationByVector(engine, shell.solid, remaining, pull.vector, clearance, policy.surfaceToleranceMm, volumeTolerance, 12).removable) continue;
      if (engine.intersect(shell.solid, core)->volume() > volumeTolerance) continue;

      MasterToolingPiece corePiece;
      corePiece.pieceId = "piece-localized-removable-core";
      corePiece.name = target.moldPartName + " Localized Removable Core";
      corePiece.mesh = engine.meshFromSolid(core, {}, "Mesh export");
      corePiece.bounds = core->bounds();
      corePiece.volumeMm3 = coreVolume;
      corePiece.triangleCount = static_cast<int>(corePiece.mesh.indices.size() / 3);
      const MeshTopologyCounts topology = meshTopology(corePiece.mesh);
      corePiece.watertight = topology.openEdgeCount == 0;
      corePiece.manifold = topology.openEdgeCount == 0 && topology.nonManifoldEdgeCount == 0;
      corePiece.releaseDirection = pull.pull;
      if (pull.oblique) corePiece.directionVector = pull.vector;
      corePiece.regions = {"localized-removable-core"};
      corePiece.fitsBuildVolume = !buildVolume || (corePiece.bounds.max.x - corePiece.bounds.min.x <= buildVolume->x &&
                                                    corePiece.bounds.max.y - corePiece.bounds.min.y <= buildVolume->y &&
                                                    corePiece.bounds.max.z - corePiece.bounds.min.z <= buildVolume->z);
      MasterToolingPiece shellPiece = pieceFromConstructed("piece-case-shell", target.moldPartName + " Case Shell", shell, pull.pull, {"case-shell"}, {},
                                                           pull.oblique ? std::optional<Point3>(pull.vector) : std::nullopt);
      if (!corePiece.fitsBuildVolume || (buildVolume && !shellPiece.fitsBuildVolume)) continue;

      MultiPiecePlan plan;
      plan.pieces = {corePiece, shellPiece};
      plan.partingSurface.kind = "planar";
      plan.partingSurface.axis = masterDirName(flipDirection(lockEvidence.pullDirection));
      plan.partingSurface.coordinateMm = partingSign > 0 ? region.seedBounds.min[partingAxis] : region.seedBounds.max[partingAxis];
      plan.partingSurface.origin = "lock-evidence";
      plan.coreMode = CoreAssignmentMode::LocalizedRemovableCore;
      for (int step = 0; step < 2; ++step) {
        MasterReleaseStep s{step, plan.pieces[static_cast<std::size_t>(step)].pieceId, pull.pull, clearance, true, std::nullopt};
        if (pull.oblique) s.directionVector = pull.vector;
        plan.releaseSequence.push_back(s);
      }
      plan.ventFeatures = ventFeatures;
      plan.registrationNote = "localized removable core (lock evidence: " + region.evidence + ") is removed before the case shell; no panel interface alignment is required.";
      plan.cost = 0;
      return {plan, std::nullopt};
    }
  }
  return {std::nullopt, std::string("no_localized_core_release_sequence_verified")};
}

// --- recursive split --------------------------------------------------------------------------------------------------------------------------

MultiPiecePlanAttempt attemptRecursiveSplit(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace, const CandidateSplit& split,
                                            const MasterToolingParameters& parameters, const MeshPayload* coreToolMesh, CoreAssignmentMode coreMode,
                                            int maxPieces, const std::optional<Point3>& assignedDirection, const std::optional<Bounds3>& functionalBounds,
                                            const std::optional<Point3>& buildVolume, const std::vector<MasterVentRecommendation>& ventRecommendations) {
  const Bounds3 caseBounds = caseEnvelopeFor(target.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(caseBounds, 0);
  const double volumeTolerance = std::max(policy.affectedVolumeToleranceMm3, target.volumeMm3 * 1e-3);
  const int splitAxis = masterDirAxis(split.axis);
  const double sweepClearanceMm = (target.bounds.max[splitAxis] - target.bounds.min[splitAxis]) * kDemoldClearanceSafetyFactor + parameters.caseWallThicknessMm * 2;
  ChunkBudget budget;
  const std::vector<PullCandidate> pullCandidates = pullCandidatesFor(split.axis, assignedDirection, split.normal);
  const auto ventFeatures = safeVentPathsFor(target.bounds, caseBounds, target.bounds, ventRecommendations, parameters.caseWallThicknessMm, target.mesh, nullptr);

  const auto splitSpec = [&](bool positive) {
    SplitSpec s;
    s.axis = split.axis;
    s.coordinateMm = split.coordinateMm;
    s.positiveSide = positive;
    s.normal = split.normal;
    s.point = split.point;
    return s;
  };
  ConstructedPiece positivePiece, negativePiece;
  try {
    positivePiece = constructCasePiece(engine, target, pourFace, parameters, splitSpec(true), coreToolMesh, coreMode, ventFeatures);
  } catch (const std::runtime_error&) {
    return {std::nullopt, std::string("positive_piece_construction_failed")};
  }
  try {
    negativePiece = constructCasePiece(engine, target, pourFace, parameters, splitSpec(false), coreToolMesh, coreMode, ventFeatures);
  } catch (const std::runtime_error&) {
    return {std::nullopt, std::string("negative_piece_construction_failed")};
  }

  const auto rootLineage = [&](bool side) {
    ChunkLineage lineage;
    lineage.cuts.push_back({split.axis, split.coordinateMm, split.normal, split.point});
    lineage.sides.push_back(side);
    return lineage;
  };
  const SolidPtr probe = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
  const auto collectChunks = [&](const ConstructedPiece& half, const ChunkLineage& lineage) -> std::vector<CaseChunk> {
    std::vector<CaseChunk> frontier = chunkify(engine, half.solid, lineage);
    int depth = 1;
    while (!frontier.empty() && depth < kMaxSplitDepth) {
      std::vector<CaseChunk> next;
      for (const CaseChunk& chunk : frontier) {
        bool removable = false;
        for (const PullCandidate& candidate : pullCandidates) {
          if (budget.sweeps >= kMaxReleaseVerificationSweeps) break;
          budget.sweeps += 1;
          if (verifyDemoldTranslationByVector(engine, probe, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance,
                                              kPlannerSweepSamples).removable) {
            removable = true;
            break;
          }
        }
        if (removable || chunk.volumeMm3 < volumeTolerance) { next.push_back(chunk); continue; }
        auto bisected = bisectChunk(engine, chunk);
        if (!bisected) return {};
        next.insert(next.end(), bisected->begin(), bisected->end());
      }
      frontier = std::move(next);
      ++depth;
    }
    return frontier;
  };

  std::vector<CaseChunk> positiveChunks = collectChunks(positivePiece, rootLineage(false));
  std::vector<CaseChunk> negativeChunks = collectChunks(negativePiece, rootLineage(true));
  if (positiveChunks.empty() || negativeChunks.empty()) return {std::nullopt, std::string("panel_decomposition_exhausted_the_split_budget")};
  std::vector<CaseChunk> chunks = positiveChunks;
  chunks.insert(chunks.end(), negativeChunks.begin(), negativeChunks.end());
  if (static_cast<int>(chunks.size()) > std::min(maxPieces, kAbsoluteMaxToolingPieces)) return {std::nullopt, std::string("panel_count_exceeds_the_profile_cap")};

  const auto sequenceOpt = sequenceRelease(engine, target, chunks, pullCandidates, policy, volumeTolerance, sweepClearanceMm, budget);
  if (!sequenceOpt) {
    return {std::nullopt, std::string(budget.sweeps >= kMaxReleaseVerificationSweeps ? "release_verification_budget_exhausted" : "no_panel_release_sequence_verified")};
  }
  const std::vector<SequencedChunk>& sequence = *sequenceOpt;

  try {
    SolidPtr assembled;
    for (const SequencedChunk& entry : sequence) {
      const SolidPtr& s = chunks[static_cast<std::size_t>(entry.chunkIndex)].solid;
      assembled = assembled ? engine.unionOf({assembled, s}) : engine.asOriginal(s);
    }
    const SolidPtr targetSolid = engine.solidFromMesh(target.mesh, policy.booleanToleranceMm, "Mesh preparation");
    const double overlapVolume = engine.intersect(assembled, targetSolid)->volume();
    const double envelopeVolume = (caseBounds.max.x - caseBounds.min.x) * (caseBounds.max.y - caseBounds.min.y) * (caseBounds.max.z - caseBounds.min.z);
    const double residual = envelopeVolume - assembled->volume() - targetSolid->volume();
    if (overlapVolume > volumeTolerance || residual < -volumeTolerance * 10 || residual > target.volumeMm3 * 2) {
      return {std::nullopt, std::string("assembled_negative_mismatch")};
    }
  } catch (const std::exception&) {
    return {std::nullopt, std::string("assembled_negative_mismatch")};
  }

  std::vector<MasterToolingPiece> pieces;
  std::vector<MasterToolingRegistrationFeature> registrationFeatures;
  std::optional<std::string> registrationNote;
  const auto vectorOf = [](const PullCandidate& p) { return p.oblique ? std::optional<Point3>(p.vector) : std::nullopt; };
  if (sequence.size() == 2) {
    const CaseChunk& c0 = chunks[static_cast<std::size_t>(sequence[0].chunkIndex)];
    const CaseChunk& c1 = chunks[static_cast<std::size_t>(sequence[1].chunkIndex)];
    const ConstructedPiece p0 = constructedOf(engine, c0), p1 = constructedOf(engine, c1);
    const RegisteredPiecePair registered = applyToolingRegistration(engine, target, pourFace, splitSpec(true), parameters, functionalBounds, p0, p1);
    if (registered.reason) {
      registrationNote = "tooling pins not placed: " + *registered.reason;
      for (std::size_t index = 0; index < sequence.size(); ++index) {
        const CaseChunk& chunk = chunks[static_cast<std::size_t>(sequence[index].chunkIndex)];
        pieces.push_back(pieceFromConstructed("piece-panel-" + std::to_string(index + 1), target.moldPartName + " Tooling Panel " + std::to_string(index + 1),
                                              constructedOf(engine, chunk), sequence[index].pull.pull, {masterDirName(split.axis)}, {}, vectorOf(sequence[index].pull)));
      }
    } else {
      registrationFeatures = registered.features;
      std::vector<std::string> ids;
      for (const auto& f : registered.features) ids.push_back(f.featureId);
      pieces.push_back(pieceFromConstructed("piece-positive-side", target.moldPartName + " Tooling Panel 1", registered.positivePiece, sequence[0].pull.pull,
                                            {std::string(masterDirName(split.axis)) + "+"}, ids));
      pieces.push_back(pieceFromConstructed("piece-negative-side", target.moldPartName + " Tooling Panel 2", registered.negativePiece, sequence[1].pull.pull,
                                            {std::string(masterDirName(split.axis)) + "-"}));
    }
  } else {
    const MultiPanelRegistration registration = registerMultiPanelInterfaces(engine, target, pourFace, chunks, sequence, ventFeatures, parameters, policy,
                                                                             volumeTolerance, sweepClearanceMm);
    registrationFeatures = registration.features;
    for (std::size_t index = 0; index < sequence.size(); ++index) {
      const CaseChunk& chunk = chunks[static_cast<std::size_t>(sequence[index].chunkIndex)];
      std::vector<std::string> ids;
      for (const auto& f : registrationFeatures) if (f.malePieceId == "piece-panel-" + std::to_string(index + 1)) ids.push_back(f.featureId);
      pieces.push_back(pieceFromConstructed("piece-panel-" + std::to_string(index + 1), target.moldPartName + " Tooling Panel " + std::to_string(index + 1),
                                            constructedOf(engine, chunk), sequence[index].pull.pull, {masterDirName(split.axis)}, ids, vectorOf(sequence[index].pull)));
    }
    std::vector<std::string> provenInterfaces;
    for (const ProvenCut& n : provenanceInterfaceCuts(chunks, sequence)) provenInterfaces.push_back("panel-" + std::to_string(n.first + 1) + ":panel-" + std::to_string(n.second + 1));
    const std::set<std::string> blocked(registration.blockedInterfaces.begin(), registration.blockedInterfaces.end());
    std::vector<std::string> uncovered;
    for (const auto& pair : provenInterfaces) if (blocked.count(pair)) uncovered.push_back(pair);
    if (!registration.features.empty() && uncovered.empty() && !registration.failureReason) {
      registrationNote = std::nullopt;
    } else {
      const auto& listed = uncovered.empty() ? provenInterfaces : uncovered;
      std::string joined;
      for (const auto& l : listed) joined += (joined.empty() ? "" : ", ") + l;
      registrationNote = "automatic alignment registration remains unresolved on interfaces " + joined + "; " +
                         registration.failureReason.value_or("user-managed alignment is required until each pair's release corridor is proven.") + ".";
    }
  }

  if (buildVolume && !std::all_of(pieces.begin(), pieces.end(), [&](const auto& p) { return fitsBuildVolume(p, *buildVolume); })) {
    return {std::nullopt, std::string("panel_exceeds_build_volume")};
  }

  double totalVolume = 0, smaller = INFINITY, largest = -INFINITY;
  for (const auto& p : pieces) { totalVolume += p.volumeMm3; smaller = std::min(smaller, p.volumeMm3); largest = std::max(largest, p.volumeMm3); }
  const bool fragile = smaller < target.volumeMm3 * kFragilePieceVolumeFraction;
  const double imbalance = (largest - smaller) / std::max(1.0, totalVolume);
  const double cost = (fragile ? kFragilePiecePenalty : 0) + kVolumeImbalance * imbalance * 10 + 0 + kPrintVolume * totalVolume +
                      kExtraPanelPenalty * (static_cast<double>(pieces.size()) - 2);

  MultiPiecePlan plan;
  plan.pieces = pieces;
  plan.partingSurface.kind = "planar";
  plan.partingSurface.axis = masterDirName(split.axis);
  plan.partingSurface.coordinateMm = split.coordinateMm;
  plan.partingSurface.planeNormal = split.normal;
  plan.partingSurface.origin = split.origin;
  plan.coreMode = coreMode;
  for (std::size_t index = 0; index < sequence.size(); ++index) {
    MasterReleaseStep step{static_cast<int>(index), pieces[index].pieceId, sequence[index].pull.pull, sweepClearanceMm, true, std::nullopt};
    if (sequence[index].pull.oblique) step.directionVector = sequence[index].pull.vector;
    plan.releaseSequence.push_back(step);
  }
  plan.registrationFeatures = registrationFeatures;
  plan.ventFeatures = ventFeatures;
  plan.registrationNote = registrationNote;
  plan.cost = cost;
  return {plan, std::nullopt};
}

MultiPiecePlanAttempt planMultiPieceTooling(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                            const MasterToolingParameters& parameters, const MeshPayload* coreToolMesh,
                                            const std::optional<Point3>& assignedDirection, const std::optional<Bounds3>& functionalBounds,
                                            const std::optional<Point3>& buildVolume, const std::vector<MasterVentRecommendation>& ventRecommendations) {
  std::optional<std::string> lastRejection;
  const int maxPieces = std::min(parameters.maxToolingPieces, kAbsoluteMaxToolingPieces);
  std::map<int, int> axisAttemptCount;
  int obliqueAttempts = 0;
  for (const CandidateSplit& split : candidateSplits(target, coreToolMesh, buildVolume)) {
    if (!split.normal) {
      int& used = axisAttemptCount[static_cast<int>(split.axis)];
      if (used >= kMaxExactAttemptsPerAxis) continue;
      ++used;
    } else if (obliqueAttempts >= kMaxObliqueExactAttempts) {
      continue;
    }
    std::vector<CoreAssignmentMode> modes{CoreAssignmentMode::Split};
    if (coreToolMesh) modes = {CoreAssignmentMode::Split, CoreAssignmentMode::FullNegative, CoreAssignmentMode::FullPositive};
    for (CoreAssignmentMode mode : modes) {
      if (split.normal) {
        if (obliqueAttempts >= kMaxObliqueExactAttempts) break;
        ++obliqueAttempts;
      }
      MultiPiecePlanAttempt attempt = attemptRecursiveSplit(engine, target, pourFace, split, parameters, coreToolMesh, mode, maxPieces, assignedDirection,
                                                            functionalBounds, buildVolume, ventRecommendations);
      if (attempt.plan) return attempt;
      lastRejection = attempt.rejectionReason;
    }
  }
  return {std::nullopt, lastRejection.value_or("no_candidate_plan_verified")};
}

}  // namespace craft
