#include "master/MasterWorkingMoldPlanner.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <unordered_set>

#include "mold/Registration.h"  // jsNumberToString

namespace craft {

namespace {

constexpr double kSlidingWallCosine = 0.2;
constexpr double kSeamInteriorCosine = 0.5;
constexpr int kBeamWidth = 8;
constexpr int kMaxThresholdsPerDirection = 6;
constexpr int kMaxCombinationDirections = 6;
constexpr int kMaxExactPlansPerPieceCount = 2;
constexpr int kAbsoluteMaxWorkingMoldPieces = 6;
constexpr double kThresholdRound = 1e4;
constexpr double kDegenerateSplitFraction = 0.05;

double dotp(const Point3& a, const Point3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
double jsRound(double v) { return std::floor(v + 0.5); }

Point3 unit(const Point3& v) {
  const double length = jsHypot3(v.x, v.y, v.z);
  return {v.x / length, v.y / length, v.z / length};
}

double distanceBetween(const Point3& a, const Point3& b) { return jsHypot3(a.x - b.x, a.y - b.y, a.z - b.z); }

}  // namespace

// --- region set cover ---------------------------------------------------------------------------

RegionSetCoverResult greedyRegionCover(const SurfaceRegionGraph& graph, const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                       double fullCoverageFraction) {
  RegionSetCoverResult result;
  result.totalRegionCount = static_cast<int>(graph.regions.size());
  if (graph.regions.empty() || analysis.directions.empty()) {
    for (const SurfaceRegion& r : graph.regions) result.uncoveredRegionIndexes.push_back(r.regionIndex);
    return result;
  }
  const auto summaries = summarizeRegionAccessibility(graph, mesh, analysis);
  std::vector<std::set<int>> coverage(analysis.directions.size());
  for (const auto& summary : summaries) {
    for (std::size_t d = 0; d < analysis.directions.size(); ++d) {
      const auto it = summary.visibleAreaFractionByDirectionId.find(analysis.directions[d].directionId);
      const double fraction = it == summary.visibleAreaFractionByDirectionId.end() ? 0 : it->second;
      if (fraction >= fullCoverageFraction) coverage[d].insert(summary.regionIndex);
    }
  }
  std::set<int> uncovered;
  for (const SurfaceRegion& r : graph.regions) uncovered.insert(r.regionIndex);
  std::set<int> picked;
  for (;;) {
    int best = -1, bestNew = 0;
    for (std::size_t d = 0; d < analysis.directions.size(); ++d) {
      if (picked.count(static_cast<int>(d))) continue;
      int newCoverage = 0;
      for (int region : coverage[d]) if (uncovered.count(region)) ++newCoverage;
      if (newCoverage > bestNew) { bestNew = newCoverage; best = static_cast<int>(d); }
    }
    if (best == -1 || bestNew == 0) break;
    picked.insert(best);
    for (int region : coverage[static_cast<std::size_t>(best)]) uncovered.erase(region);
    result.steps.push_back({best, analysis.directions[static_cast<std::size_t>(best)].directionId, bestNew,
                            result.totalRegionCount - static_cast<int>(uncovered.size())});
    if (uncovered.empty()) break;
  }
  result.uncoveredRegionIndexes.assign(uncovered.begin(), uncovered.end());
  return result;
}

// --- thresholds ---------------------------------------------------------------------------------

std::optional<double> exactPartingThreshold(const PlanningMesh& mesh, const std::vector<std::uint8_t>& visibleFor,
                                            const std::vector<std::uint8_t>& visibleOpposing, const Point3& direction) {
  double min = INFINITY;
  for (const PlanningPatch& patch : mesh.patches) {
    const std::size_t i = static_cast<std::size_t>(patch.patchIndex);
    if (visibleFor[i] == 1 && visibleOpposing[i] != 1) {
      const double projection = dotp(patch.centroid, direction);
      if (projection < min) min = projection;
    }
  }
  if (!std::isfinite(min)) return std::nullopt;
  return jsRound(min * 1e4) / 1e4 - 1e-4;
}

std::vector<double> candidatePartingThresholds(const PlanningMesh& mesh, const std::vector<std::uint8_t>& visibleFor,
                                               const std::vector<std::uint8_t>& visibleOpposing, const Point3& direction,
                                               const SurfaceRegionGraph& graph) {
  const auto primary = exactPartingThreshold(mesh, visibleFor, visibleOpposing, direction);
  if (!primary) return {};

  std::vector<double> exclusiveProjections;
  double maxBlocked = -INFINITY;
  for (const PlanningPatch& patch : mesh.patches) {
    const std::size_t i = static_cast<std::size_t>(patch.patchIndex);
    const double projection = dotp(patch.centroid, direction);
    if (visibleFor[i] == 1 && visibleOpposing[i] != 1) exclusiveProjections.push_back(projection);
    if (visibleFor[i] != 1 && projection > maxBlocked) maxBlocked = projection;
  }

  std::vector<double> candidates{*primary};
  const auto push = [&](double value) {
    if (!std::isfinite(value)) return;
    const double rounded = jsRound(value * kThresholdRound) / kThresholdRound;
    for (double existing : candidates) if (std::fabs(existing - rounded) < 1 / kThresholdRound) return;
    candidates.push_back(rounded);
  };

  std::vector<double> sorted = exclusiveProjections;
  std::stable_sort(sorted.begin(), sorted.end());
  struct Gap { double size, afterValue; };
  std::vector<Gap> gaps;
  for (std::size_t i = 1; i < sorted.size(); ++i) {
    const double size = sorted[i] - sorted[i - 1];
    if (size > 1e-6) gaps.push_back({size, sorted[i]});
  }
  std::stable_sort(gaps.begin(), gaps.end(), [](const Gap& a, const Gap& b) { return a.size > b.size; });
  for (const Gap& gap : gaps) {
    if (static_cast<int>(candidates.size()) >= kMaxThresholdsPerDirection) break;
    push(gap.afterValue - 1e-4);
  }

  for (const SurfaceRegion& region : graph.regions) {
    if (static_cast<int>(candidates.size()) >= kMaxThresholdsPerDirection) break;
    double regionMin = INFINITY;
    bool touches = false;
    for (int p : region.patchIndexes) {
      const std::size_t i = static_cast<std::size_t>(p);
      if (visibleFor[i] == 1 && visibleOpposing[i] != 1) {
        touches = true;
        const double projection = dotp(mesh.patches[i].centroid, direction);
        if (projection < regionMin) regionMin = projection;
      }
    }
    if (touches) push(regionMin - 1e-4);
  }

  if (static_cast<int>(candidates.size()) < kMaxThresholdsPerDirection && std::isfinite(maxBlocked)) push(maxBlocked + 1e-4);
  if (static_cast<int>(candidates.size()) > kMaxThresholdsPerDirection) candidates.resize(kMaxThresholdsPerDirection);
  return candidates;
}

// --- ownership and evaluation ---------------------------------------------------------------------

namespace {

std::vector<int> regionOwnedAssignment(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis, const SurfaceRegionGraph& graph,
                                       const std::vector<Prism>& prisms, int remainderPieceIndex,
                                       std::optional<int> remainderDirectionIndex) {
  const auto directionIndexOf = [&](int piece) -> std::optional<int> {
    return piece >= 0 && piece < static_cast<int>(prisms.size()) ? std::optional<int>(prisms[static_cast<std::size_t>(piece)].directionIndex)
                                                                  : remainderDirectionIndex;
  };
  std::vector<int> raw(mesh.patches.size());
  for (const PlanningPatch& patch : mesh.patches) {
    int piece = remainderPieceIndex;
    for (std::size_t p = 0; p < prisms.size(); ++p) {
      const Point3& direction = analysis.directions[static_cast<std::size_t>(prisms[p].directionIndex)].vector;
      if (dotp(patch.centroid, direction) >= prisms[p].offsetMm) { piece = static_cast<int>(p); break; }
    }
    raw[static_cast<std::size_t>(patch.patchIndex)] = piece;
  }

  std::vector<std::optional<int>> owner(graph.regions.size());
  for (const SurfaceRegion& region : graph.regions) {
    std::vector<std::pair<int, double>> areaByPiece;  // insertion ordered, like a JS Map
    for (int p : region.patchIndexes) {
      const int piece = raw[static_cast<std::size_t>(p)];
      auto it = std::find_if(areaByPiece.begin(), areaByPiece.end(), [&](const auto& e) { return e.first == piece; });
      if (it == areaByPiece.end()) areaByPiece.emplace_back(piece, 0.0), it = areaByPiece.end() - 1;
      it->second += mesh.patches[static_cast<std::size_t>(p)].areaMm2;
    }
    int bestPiece = remainderPieceIndex;
    double bestArea = -1;
    for (const auto& [piece, area] : areaByPiece) {
      if (area > bestArea || (area == bestArea && piece < bestPiece)) { bestArea = area; bestPiece = piece; }
    }
    const auto bestDirection = directionIndexOf(bestPiece);
    bool safe = true;
    if (bestDirection) {
      const auto& visible = analysis.perDirection[static_cast<std::size_t>(*bestDirection)].visible;
      for (int p : region.patchIndexes) if (visible[static_cast<std::size_t>(p)] != 1) { safe = false; break; }
    }
    if (safe) owner[static_cast<std::size_t>(region.regionIndex)] = bestPiece;
  }

  std::vector<int> assignment(mesh.patches.size());
  for (std::size_t p = 0; p < mesh.patches.size(); ++p) {
    const int regionIndex = p < graph.regionOfPatch.size() ? graph.regionOfPatch[p] : -1;
    const std::optional<int> forced = regionIndex >= 0 ? owner[static_cast<std::size_t>(regionIndex)] : std::nullopt;
    assignment[p] = forced ? *forced : raw[p];
  }
  return assignment;
}

std::string uncoveredRegionSignature(const std::vector<int>& assignment, const SurfaceRegionGraph& graph) {
  std::set<int> regions;
  for (std::size_t p = 0; p < assignment.size(); ++p) {
    if (assignment[p] != -1) continue;
    const int r = p < graph.regionOfPatch.size() ? graph.regionOfPatch[p] : -1;
    if (r >= 0) regions.insert(r);
  }
  std::string out;
  for (int r : regions) out += (out.empty() ? "" : ",") + std::to_string(r);
  return out;
}

int isDegenerateSplit(int remainder, int total) {
  if (total == 0) return 0;
  const double fraction = static_cast<double>(remainder) / total;
  return fraction < kDegenerateSplitFraction || fraction > 1 - kDegenerateSplitFraction ? 1 : 0;
}

}  // namespace

PrefixEvaluation evaluatePrefix(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis, const SurfaceRegionGraph& graph,
                                const std::vector<Prism>& prisms) {
  PrefixEvaluation out;
  out.assignment = regionOwnedAssignment(mesh, analysis, graph, prisms, -1, std::nullopt);
  for (const PlanningPatch& patch : mesh.patches) {
    const int piece = out.assignment[static_cast<std::size_t>(patch.patchIndex)];
    if (piece == -1) { ++out.remainderPatchCount; continue; }
    const auto& visible = analysis.perDirection[static_cast<std::size_t>(prisms[static_cast<std::size_t>(piece)].directionIndex)].visible;
    if (visible[static_cast<std::size_t>(patch.patchIndex)] != 1) ++out.unassignable;
  }
  return out;
}

FinalizedEvaluation evaluateFinalized(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis, const SurfaceRegionGraph& graph,
                                      const std::vector<Prism>& prisms, int catchAll) {
  const int pieceCount = static_cast<int>(prisms.size()) + 1;
  FinalizedEvaluation out;
  out.assignment = regionOwnedAssignment(mesh, analysis, graph, prisms, pieceCount - 1, catchAll);
  int unassignable = 0, hardBlocked = 0;
  double slidingWall = 0;
  int catchAllInvisible = 0;
  const auto& catchAllVisible = analysis.perDirection[static_cast<std::size_t>(catchAll)].visible;
  for (const PlanningPatch& patch : mesh.patches) {
    if (catchAllVisible[static_cast<std::size_t>(patch.patchIndex)] != 1) ++catchAllInvisible;
  }
  for (const PlanningPatch& patch : mesh.patches) {
    const int piece = out.assignment[static_cast<std::size_t>(patch.patchIndex)];
    const int directionIndex = piece < static_cast<int>(prisms.size()) ? prisms[static_cast<std::size_t>(piece)].directionIndex : catchAll;
    const DirectionAccessibility& per = analysis.perDirection[static_cast<std::size_t>(directionIndex)];
    const std::size_t pi = static_cast<std::size_t>(patch.patchIndex);
    if (per.visible[pi] != 1) {
      ++unassignable;
      const PatchAccessibilityClass cls = per.classification[pi];
      if (cls != PatchAccessibilityClass::Grazing && cls != PatchAccessibilityClass::Uncertain) ++hardBlocked;
      const int r = pi < graph.regionOfPatch.size() ? graph.regionOfPatch[pi] : -1;
      if (r >= 0) out.unassignableRegionIndexes.insert(r);
      continue;
    }
    const Point3& direction = analysis.directions[static_cast<std::size_t>(directionIndex)].vector;
    if (std::fabs(dotp(patch.normal, direction)) < kSlidingWallCosine) slidingWall += patch.areaMm2;
  }
  const bool feasible = hardBlocked == 0 && catchAllInvisible > 0;

  int seamCrossings = 0;
  for (const PlanningPatch& patch : mesh.patches) {
    for (int neighbor : mesh.adjacency[static_cast<std::size_t>(patch.patchIndex)]) {
      if (neighbor <= patch.patchIndex) continue;
      const int own = out.assignment[static_cast<std::size_t>(patch.patchIndex)];
      if (own == out.assignment[static_cast<std::size_t>(neighbor)]) continue;
      const int directionIndex = own < static_cast<int>(prisms.size()) ? prisms[static_cast<std::size_t>(own)].directionIndex : catchAll;
      const Point3& direction = analysis.directions[static_cast<std::size_t>(directionIndex)].vector;
      if (std::fabs(dotp(patch.normal, direction)) > kSeamInteriorCosine) ++seamCrossings;
    }
  }

  std::vector<double> pieceAreas(static_cast<std::size_t>(pieceCount), 0.0);
  for (const PlanningPatch& patch : mesh.patches) pieceAreas[static_cast<std::size_t>(out.assignment[static_cast<std::size_t>(patch.patchIndex)])] += patch.areaMm2;
  const double smallest = *std::min_element(pieceAreas.begin(), pieceAreas.end());
  const double largest = *std::max_element(pieceAreas.begin(), pieceAreas.end());
  const double imbalance = largest <= 0 ? 1 : (largest - smallest) / largest;

  WorkingMoldPlanScore score;
  score.slidingWallAreaMm2 = slidingWall;
  score.seamCrossingCount = seamCrossings;
  score.areaImbalance = imbalance;
  score.interfaceCount = pieceCount - 1;
  score.total = slidingWall * 1e-4 + seamCrossings * 0.05 + imbalance * 2 + pieceCount * 0.1;

  DecompositionCandidate& c = out.candidate;
  for (const Prism& prism : prisms) {
    const PlanningCandidateDirection& d = analysis.directions[static_cast<std::size_t>(prism.directionIndex)];
    c.pieces.push_back({unit(d.vector), d.directionId, prism});
  }
  const PlanningCandidateDirection& cd = analysis.directions[static_cast<std::size_t>(catchAll)];
  c.pieces.push_back({unit(cd.vector), cd.directionId, std::nullopt});
  c.pieceCount = pieceCount;
  c.feasible = feasible;
  c.unassignablePatchCount = unassignable;
  c.score = score.total;
  c.scoreBreakdown = score;
  return out;
}

// --- parting curves -----------------------------------------------------------------------------------

std::vector<Point3> orderPartingCurvePoints(const std::vector<Point3>& points) {
  if (points.size() <= 2) return points;
  std::vector<Point3> remaining = points;
  std::stable_sort(remaining.begin(), remaining.end(), [](const Point3& a, const Point3& b) {
    if (a.x != b.x) return a.x < b.x;
    if (a.y != b.y) return a.y < b.y;
    return a.z < b.z;
  });
  std::vector<Point3> ordered{remaining.front()};
  remaining.erase(remaining.begin());
  while (!remaining.empty()) {
    const Point3 current = ordered.back();
    std::size_t bestIndex = 0;
    double bestDistance = INFINITY;
    for (std::size_t i = 0; i < remaining.size(); ++i) {
      const double d = distanceBetween(current, remaining[i]);
      if (d < bestDistance) { bestDistance = d; bestIndex = i; }
    }
    ordered.push_back(remaining[bestIndex]);
    remaining.erase(remaining.begin() + static_cast<long>(bestIndex));
  }
  return ordered;
}

namespace {
double distanceFromSegment(const Point3& p, const Point3& a, const Point3& b) {
  const double abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const double lengthSq = abx * abx + aby * aby + abz * abz;
  if (lengthSq < 1e-12) return distanceBetween(p, a);
  const double t = std::max(0.0, std::min(1.0, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lengthSq));
  return distanceBetween(p, {a.x + abx * t, a.y + aby * t, a.z + abz * t});
}

double segmentDistance(const Point3& a, const Point3& b, const Point3& c, const Point3& d) {
  const int samples = 8;
  double best = INFINITY;
  for (int i = 0; i <= samples; ++i) {
    const double t = static_cast<double>(i) / samples;
    const Point3 p{a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t};
    best = std::min(best, distanceFromSegment(p, c, d));
  }
  return best;
}
}  // namespace

std::vector<Point3> simplifyPartingCurve(const std::vector<Point3>& points, double tolerance) {
  std::vector<Point3> deduped;
  for (const Point3& p : points) {
    if (!deduped.empty() && distanceBetween(deduped.back(), p) <= tolerance) continue;
    deduped.push_back(p);
  }
  if (deduped.size() <= 2) return deduped;
  std::vector<Point3> simplified{deduped.front()};
  for (std::size_t i = 1; i + 1 < deduped.size(); ++i) {
    if (distanceFromSegment(deduped[i], simplified.back(), deduped[i + 1]) > tolerance) simplified.push_back(deduped[i]);
  }
  simplified.push_back(deduped.back());
  return simplified;
}

bool detectSelfCrossing(const std::vector<Point3>& points, double tolerance) {
  if (points.size() < 4) return false;
  for (std::size_t i = 0; i + 1 < points.size(); ++i)
    for (std::size_t j = i + 2; j + 1 < points.size(); ++j)
      if (segmentDistance(points[i], points[i + 1], points[j], points[j + 1]) <= tolerance) return true;
  return false;
}

std::vector<WorkingMoldPartingInterface> extractPartingInterfaces(const PlanningMesh& mesh, const std::vector<int>& assignment,
                                                                  const std::vector<PlannedWorkingMoldPiece>& pieces) {
  struct Entry { int pieceA, pieceB; std::vector<Point3> points; int silhouette = 0; };
  std::map<std::string, Entry> samples;  // sorted below with the ICU-like order
  for (const PlanningPatch& patch : mesh.patches) {
    for (int neighbor : mesh.adjacency[static_cast<std::size_t>(patch.patchIndex)]) {
      if (neighbor <= patch.patchIndex) continue;
      const int pieceA = assignment[static_cast<std::size_t>(patch.patchIndex)], pieceB = assignment[static_cast<std::size_t>(neighbor)];
      if (pieceA == pieceB) continue;
      const PlanningPatch& other = mesh.patches[static_cast<std::size_t>(neighbor)];
      const Point3& dirA = pieces[static_cast<std::size_t>(pieceA)].releaseDirection;
      const Point3& dirB = pieces[static_cast<std::size_t>(pieceB)].releaseDirection;
      const auto slidesBoth = [&](const Point3& n) {
        return std::fabs(dotp(n, dirA)) < kSeamInteriorCosine && std::fabs(dotp(n, dirB)) < kSeamInteriorCosine;
      };
      const bool silhouette = slidesBoth(patch.normal) && slidesBoth(other.normal);
      const std::string key = "wm-interface-" + std::to_string(std::min(pieceA, pieceB)) + "-" + std::to_string(std::max(pieceA, pieceB));
      auto it = samples.find(key);
      if (it == samples.end()) it = samples.emplace(key, Entry{pieceA, pieceB, {}, 0}).first;
      Entry& entry = it->second;
      if (entry.points.size() >= 64) continue;
      if (silhouette) ++entry.silhouette;
      const Point3 &a = patch.centroid, &b = other.centroid;
      entry.points.push_back({(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2});
    }
  }
  const double diagonal = jsHypot3(mesh.bounds.max.x - mesh.bounds.min.x, mesh.bounds.max.y - mesh.bounds.min.y,
                                   mesh.bounds.max.z - mesh.bounds.min.z);
  const double tolerance = std::max(1e-6, diagonal * 1e-4);

  std::vector<std::pair<std::string, Entry>> sorted(samples.begin(), samples.end());
  std::stable_sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) { return icuLess(a.first, b.first); });
  std::vector<WorkingMoldPartingInterface> out;
  for (auto& [id, entry] : sorted) {
    WorkingMoldPartingInterface iface;
    iface.interfaceId = id;
    iface.pieceAIndex = entry.pieceA;
    iface.pieceBIndex = entry.pieceB;
    iface.samplePoints = simplifyPartingCurve(orderPartingCurvePoints(entry.points), tolerance);
    iface.kind = entry.silhouette == static_cast<int>(entry.points.size()) ? "silhouette" : "region-adjacency";
    iface.selfIntersecting = detectSelfCrossing(iface.samplePoints, tolerance);
    out.push_back(std::move(iface));
  }
  return out;
}

// --- search ---------------------------------------------------------------------------------------------

namespace {
std::string directionSetKey(const std::vector<Prism>& prisms) {
  std::vector<int> ids;
  for (const Prism& p : prisms) ids.push_back(p.directionIndex);
  std::sort(ids.begin(), ids.end());
  std::string out;
  for (int id : ids) out += (out.empty() ? "" : ",") + std::to_string(id);
  return out;
}

std::string prefixKey(const std::vector<Prism>& prisms) {
  std::string out;
  for (const Prism& p : prisms) out += (out.empty() ? "" : "|") + std::to_string(p.directionIndex) + "@" + jsNumberToString(p.offsetMm);
  return out;
}
}  // namespace

WorkingMoldPieceCountSearch::WorkingMoldPieceCountSearch(WorkingMoldPlannerInput input) : input_(std::move(input)) {
  const PlanningMesh& mesh = input_.planningMesh;
  if (input_.analysis.directions.empty() || mesh.patches.empty()) {
    empty_ = true;
    regionGraph_ = buildSurfaceRegionGraph(mesh);
    regionCover_ = greedyRegionCover(regionGraph_, mesh, input_.analysis);
    return;
  }
  maxPieces_ = std::max(2, std::min(input_.maxWorkingMoldPieces, kAbsoluteMaxWorkingMoldPieces));
  const SurfaceRegionGraph base = buildSurfaceRegionGraph(mesh);
  RegionSubdivisionResult refinement = refineRegionGraphByVisibility(base, mesh, input_.analysis);
  regionGraph_ = std::move(refinement.regionGraph);
  subdividedRegionCount_ = refinement.subdividedRegionCount;
  regionCover_ = greedyRegionCover(regionGraph_, mesh, input_.analysis);
  regionSetCoverUncoveredRegionCount_ = static_cast<int>(regionCover_.uncoveredRegionIndexes.size());
  if (regionSetCoverUncoveredRegionCount_ == 0) regionSetCoverMinimumPieceEstimate_ = static_cast<int>(regionCover_.steps.size());
  zeroVisibility_.assign(mesh.patches.size(), 0);
}

const std::vector<std::uint8_t>& WorkingMoldPieceCountSearch::opposingVisibilityOf(int d) const {
  const auto& dirs = input_.analysis.directions;
  const Point3& vector = dirs[static_cast<std::size_t>(d)].vector;
  for (std::size_t j = 0; j < dirs.size(); ++j) {
    if (static_cast<int>(j) == d) continue;
    const Point3& other = dirs[j].vector;
    if (vector.x * other.x + vector.y * other.y + vector.z * other.z < -0.999) return input_.analysis.perDirection[j].visible;
  }
  return zeroVisibility_;
}

std::vector<Prism> WorkingMoldPieceCountSearch::extensionsOf(const std::vector<Prism>& prisms) const {
  const int all = static_cast<int>(input_.analysis.directions.size());
  const int budget = prisms.empty() ? all : std::min(all, kMaxCombinationDirections);
  std::vector<Prism> result;
  for (int d = 0; d < budget; ++d) {
    const auto offsets = candidatePartingThresholds(input_.planningMesh, input_.analysis.perDirection[static_cast<std::size_t>(d)].visible,
                                                    opposingVisibilityOf(d), input_.analysis.directions[static_cast<std::size_t>(d)].vector, regionGraph_);
    for (double offset : offsets) result.push_back({d, offset});
  }
  return result;
}

std::optional<WorkingMoldPieceCountStep> WorkingMoldPieceCountSearch::next() {
  if (empty_) return std::nullopt;
  if (pieceCount_ > maxPieces_) return std::nullopt;
  const PlanningMesh& mesh = input_.planningMesh;
  const AccessibilityAnalysis& analysis = input_.analysis;
  const int currentCount = pieceCount_;
  ++pieceCount_;
  const int prismCount = currentCount - 1;
  const int totalPatches = static_cast<int>(mesh.patches.size());
  const int directionCount = static_cast<int>(analysis.directions.size());

  const auto selectDiverseBeam = [](std::vector<BeamPrefix> candidates, std::size_t width) {
    std::stable_sort(candidates.begin(), candidates.end(), [](const BeamPrefix& a, const BeamPrefix& b) {
      if (a.unassignable != b.unassignable) return a.unassignable < b.unassignable;
      if (a.score != b.score) return a.score < b.score;
      return a.isDegenerateSplit < b.isDegenerateSplit;
    });
    std::vector<BeamPrefix> selected, leftover;
    std::set<std::string> seenSignatures, seenDirectionSets;
    for (BeamPrefix& c : candidates) {
      if (selected.size() >= width) break;
      const std::string key = directionSetKey(c.prisms);
      if (seenDirectionSets.count(key) || seenSignatures.count(c.uncoveredRegionSignature)) { leftover.push_back(c); continue; }
      seenDirectionSets.insert(key);
      seenSignatures.insert(c.uncoveredRegionSignature);
      selected.push_back(c);
    }
    for (BeamPrefix& c : leftover) {
      if (selected.size() >= width) break;
      selected.push_back(c);
    }
    return selected;
  };

  int combinationDirectionCountUsed = 0, thresholdCountUsed = 0;
  if (prismCount == 1) {
    beam_.clear();
    const std::vector<Prism> extensions = extensionsOf({});
    combinationDirectionCountUsed = directionCount;
    thresholdCountUsed = static_cast<int>(extensions.size());
    std::vector<BeamPrefix> candidates;
    for (const Prism& prism : extensions) {
      const std::string key = prefixKey({prism});
      if (!evaluated_.insert(key).second) continue;
      const PrefixEvaluation e = evaluatePrefix(mesh, analysis, regionGraph_, {prism});
      candidates.push_back({{prism}, e.unassignable, static_cast<double>(e.unassignable), isDegenerateSplit(e.remainderPatchCount, totalPatches),
                            uncoveredRegionSignature(e.assignment, regionGraph_)});
    }
    beam_ = selectDiverseBeam(std::move(candidates), kBeamWidth);
  } else {
    std::vector<BeamPrefix> nextBeam;
    const std::vector<Prism> extensions = extensionsOf(beam_.empty() ? std::vector<Prism>{} : beam_[0].prisms);
    combinationDirectionCountUsed = std::min(directionCount, kMaxCombinationDirections);
    thresholdCountUsed = static_cast<int>(extensions.size());
    for (const BeamPrefix& prefix : beam_) {
      for (const Prism& extension : extensions) {
        if (std::any_of(prefix.prisms.begin(), prefix.prisms.end(), [&](const Prism& p) { return p.directionIndex == extension.directionIndex; })) continue;
        std::vector<Prism> prisms = prefix.prisms;
        prisms.push_back(extension);
        if (!evaluated_.insert(prefixKey(prisms)).second) continue;
        const PrefixEvaluation e = evaluatePrefix(mesh, analysis, regionGraph_, prisms);
        nextBeam.push_back({prisms, e.unassignable, e.unassignable + static_cast<double>(prisms.size()) * 0.01,
                            isDegenerateSplit(e.remainderPatchCount, totalPatches), uncoveredRegionSignature(e.assignment, regionGraph_)});
      }
    }
    beam_ = selectDiverseBeam(std::move(nextBeam), kBeamWidth);
  }

  WorkingMoldPieceCountDiagnostics diag;
  diag.pieceCount = currentCount;
  diag.candidateDirectionCountUsed = directionCount;
  diag.combinationDirectionCountUsed = combinationDirectionCountUsed;
  diag.thresholdCountUsed = thresholdCountUsed;
  diag.beamSizeUsed = static_cast<int>(beam_.size());
  diag.regionSetCoverMinimumPieceEstimate = regionSetCoverMinimumPieceEstimate_;
  diag.regionSetCoverUncoveredRegionCount = regionSetCoverUncoveredRegionCount_;

  if (beam_.empty()) {
    diag.rejectionReason = "no_prism_prefix_survived_the_search_budget";
    return WorkingMoldPieceCountStep{currentCount, {}, diag.rejectionReason, diag};
  }

  struct Finalized { FinalizedEvaluation evaluation; std::vector<Prism> prisms; int catchAll; };
  std::vector<Finalized> finalized;
  for (std::size_t i = 0; i < std::min<std::size_t>(beam_.size(), kMaxExactPlansPerPieceCount * 4); ++i) {
    for (int catchIndex = 0; catchIndex < directionCount; ++catchIndex) {
      finalized.push_back({evaluateFinalized(mesh, analysis, regionGraph_, beam_[i].prisms, catchIndex), beam_[i].prisms, catchIndex});
    }
  }

  std::vector<const Finalized*> feasible;
  for (const Finalized& f : finalized) if (f.evaluation.candidate.feasible) feasible.push_back(&f);
  std::stable_sort(feasible.begin(), feasible.end(), [](const Finalized* a, const Finalized* b) {
    const auto& x = a->evaluation.candidate;
    const auto& y = b->evaluation.candidate;
    if (x.scoreBreakdown.slidingWallAreaMm2 != y.scoreBreakdown.slidingWallAreaMm2) return x.scoreBreakdown.slidingWallAreaMm2 < y.scoreBreakdown.slidingWallAreaMm2;
    if (x.scoreBreakdown.seamCrossingCount != y.scoreBreakdown.seamCrossingCount) return x.scoreBreakdown.seamCrossingCount < y.scoreBreakdown.seamCrossingCount;
    return x.score < y.score;
  });

  std::optional<int> bestUnassignable;
  for (const Finalized& f : finalized) {
    const int n = f.evaluation.candidate.unassignablePatchCount;
    bestUnassignable = bestUnassignable ? std::min(*bestUnassignable, n) : n;
  }
  diag.planningCandidatesGenerated = static_cast<int>(finalized.size());
  diag.bestUnassignablePatchCount = bestUnassignable;

  if (feasible.empty()) {
    std::stable_sort(finalized.begin(), finalized.end(), [](const Finalized& a, const Finalized& b) {
      return a.evaluation.candidate.unassignablePatchCount < b.evaluation.candidate.unassignablePatchCount;
    });
    const Finalized* best = finalized.empty() ? nullptr : &finalized.front();
    if (best) diag.bestUnresolvedRegionCount = static_cast<int>(best->evaluation.unassignableRegionIndexes.size());
    const bool coverProves = regionSetCoverMinimumPieceEstimate_ && *regionSetCoverMinimumPieceEstimate_ <= currentCount;
    std::string baseReason;
    if (!best) baseReason = "no_decomposition_candidate_generated";
    else if (best->evaluation.candidate.unassignablePatchCount == 0) baseReason = "split_added_no_accessibility (the prisms did not improve on the catch-all release)";
    else baseReason = "no_feasible_release_assignment (best left " + std::to_string(best->evaluation.candidate.unassignablePatchCount) +
                      " inaccessible patch(es) across " + std::to_string(*diag.bestUnresolvedRegionCount) + " unresolved region(s))";
    diag.rejectionReason = coverProves
        ? baseReason + " (region set-cover proves " + std::to_string(*regionSetCoverMinimumPieceEstimate_) +
              " direction(s) can release every region; this search's prism ordering did not find a matching geometric arrangement)"
        : baseReason;
    return WorkingMoldPieceCountStep{currentCount, {}, diag.rejectionReason, diag};
  }

  std::vector<const Finalized*> top(feasible.begin(), feasible.begin() + static_cast<long>(std::min<std::size_t>(feasible.size(), kMaxExactPlansPerPieceCount)));
  std::set<int> usedDirections;
  for (const Finalized* f : top) {
    for (const Prism& p : f->prisms) usedDirections.insert(p.directionIndex);
    usedDirections.insert(f->catchAll);
  }
  const Finalized* insurance = nullptr;
  for (const Finalized* f : feasible) {
    bool prismUsed = false;
    for (const Prism& p : f->prisms) if (usedDirections.count(p.directionIndex)) prismUsed = true;
    if (!prismUsed && !usedDirections.count(f->catchAll)) { insurance = f; break; }
  }
  if (insurance) top.push_back(insurance);

  diag.planningCandidatesFeasible = static_cast<int>(feasible.size());
  diag.bestUnresolvedRegionCount = bestUnassignable ? std::optional<int>(0) : std::nullopt;
  WorkingMoldPieceCountStep step;
  step.pieceCount = currentCount;
  for (const Finalized* f : top) {
    WorkingMoldDecompositionFinalist finalist;
    finalist.candidate = f->evaluation.candidate;
    finalist.patchAssignment = f->evaluation.assignment;
    finalist.interfaces = extractPartingInterfaces(mesh, f->evaluation.assignment, f->evaluation.candidate.pieces);
    step.finalists.push_back(std::move(finalist));
  }
  step.diagnostics = diag;
  return step;
}

std::optional<WorkingMoldDecompositionPlan> planWorkingMoldDecomposition(const WorkingMoldPlannerInput& input) {
  WorkingMoldPieceCountSearch search(input);
  std::vector<RejectedPieceCount> rejected;
  std::optional<WorkingMoldDecompositionPlan> preferred;
  for (;;) {
    auto step = search.next();
    if (!step) break;
    if (step->rejectionReason) { rejected.push_back({step->pieceCount, *step->rejectionReason}); continue; }
    if (!preferred && step->pieceCount == 2 && input.maxWorkingMoldPieces > 2) {
      preferred = WorkingMoldDecompositionPlan{step->finalists.front().candidate, step->finalists, {}};
      continue;
    }
    if (preferred) {
      WorkingMoldDecompositionPlan plan{preferred->candidate, preferred->finalists, rejected};
      plan.finalists.insert(plan.finalists.end(), step->finalists.begin(), step->finalists.end());
      return plan;
    }
    return WorkingMoldDecompositionPlan{step->finalists.front().candidate, step->finalists, rejected};
  }
  if (!preferred) return std::nullopt;
  preferred->rejectedPieceCounts = rejected;
  return preferred;
}

}  // namespace craft
