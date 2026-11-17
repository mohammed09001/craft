#include "master/MasterAccessibility.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <queue>
#include <set>
#include <thread>
#include <unordered_set>

#include "geometry/GeometryTolerance.h"
#include "master/RayBvh.h"

namespace craft {

// --- string helpers ---------------------------------------------------------------------------

std::string jsToFixed(double value, int digits) {
  if (!std::isfinite(value)) return std::isnan(value) ? "NaN" : (value < 0 ? "-Infinity" : "Infinity");
  const bool negative = value < 0;
  const double x = std::fabs(value);
  // Exact decimal expansion, then round half up on the digit string (ECMAScript picks the larger n on a tie).
  char buf[512];
  std::snprintf(buf, sizeof buf, "%.80f", x);
  std::string s = buf;
  const std::size_t dot = s.find('.');
  std::string intPart = s.substr(0, dot), frac = s.substr(dot + 1);
  const bool roundUp = static_cast<int>(frac.size()) > digits && frac[static_cast<std::size_t>(digits)] >= '5';
  std::string digitsText = intPart + frac.substr(0, static_cast<std::size_t>(digits));
  if (roundUp) {
    int i = static_cast<int>(digitsText.size()) - 1;
    while (i >= 0) {
      if (digitsText[static_cast<std::size_t>(i)] == '9') { digitsText[static_cast<std::size_t>(i)] = '0'; --i; }
      else { ++digitsText[static_cast<std::size_t>(i)]; break; }
    }
    if (i < 0) digitsText.insert(digitsText.begin(), '1');
  }
  const std::size_t intLen = digitsText.size() - static_cast<std::size_t>(digits);
  std::string out = digitsText.substr(0, intLen);
  if (digits > 0) out += "." + digitsText.substr(intLen);
  return (negative ? "-" : "") + out;
}

namespace {
int primaryRank(char c) {
  static const std::string punctuation = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";
  if (c >= '0' && c <= '9') return 100 + (c - '0');
  if (c >= 'a' && c <= 'z') return 200 + (c - 'a');
  if (c >= 'A' && c <= 'Z') return 200 + (c - 'A');
  const std::size_t i = punctuation.find(c);
  return i == std::string::npos ? 50 : static_cast<int>(i);
}
}  // namespace

bool icuLess(const std::string& a, const std::string& b) {
  const std::size_t n = std::min(a.size(), b.size());
  for (std::size_t i = 0; i < n; ++i) {
    const int ra = primaryRank(a[i]), rb = primaryRank(b[i]);
    if (ra != rb) return ra < rb;
  }
  if (a.size() != b.size()) return a.size() < b.size();
  for (std::size_t i = 0; i < n; ++i) {
    if (a[i] != b[i]) return std::islower(static_cast<unsigned char>(a[i])) != 0;  // lowercase first
  }
  return false;
}

const char* patchAccessibilityClassName(PatchAccessibilityClass v) {
  switch (v) {
    case PatchAccessibilityClass::Clear: return "clear";
    case PatchAccessibilityClass::Grazing: return "grazing";
    case PatchAccessibilityClass::Blocked: return "blocked";
    case PatchAccessibilityClass::Uncertain: return "uncertain";
  }
  return "clear";
}

// --- surface regions --------------------------------------------------------------------------

namespace {
std::string centroidKey(const Point3& c) { return jsToFixed(c.x, 6) + ":" + jsToFixed(c.y, 6) + ":" + jsToFixed(c.z, 6); }

std::string canonicalGroupKey(const std::vector<int>& members, const std::vector<PlanningPatch>& patches) {
  bool have = false;
  std::string best;
  for (int p : members) {
    std::string key = centroidKey(patches[static_cast<std::size_t>(p)].centroid);
    if (!have || key < best) { best = std::move(key); have = true; }  // code-unit comparison, like JS `<`
  }
  return best;
}

double hypotOr1(double x, double y, double z) {
  const double h = jsHypot3(x, y, z);
  return h == 0 || std::isnan(h) ? 1.0 : h;
}

SurfaceRegion materialize(const std::vector<int>& members, int regionIndex, const PlanningMesh& mesh, const std::string& regionId,
                          const std::vector<int>& adjacent, const std::vector<int>& boundary, bool sharp, bool subdividedId) {
  const auto& patches = mesh.patches;
  double area = 0, cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
  for (int p : members) {
    const PlanningPatch& patch = patches[static_cast<std::size_t>(p)];
    area += patch.areaMm2;
    cx += patch.centroid.x * patch.areaMm2; cy += patch.centroid.y * patch.areaMm2; cz += patch.centroid.z * patch.areaMm2;
    nx += patch.normal.x * patch.areaMm2; ny += patch.normal.y * patch.areaMm2; nz += patch.normal.z * patch.areaMm2;
  }
  const double areaSafe = std::max(area, 1e-12);
  const Point3 centroid{cx / areaSafe, cy / areaSafe, cz / areaSafe};
  const double len = hypotOr1(nx, ny, nz);
  const Point3 average{nx / len, ny / len, nz / len};
  double cone = 0;
  for (int p : members) cone = std::max(cone, angleBetweenDeg(patches[static_cast<std::size_t>(p)].normal, average));

  std::vector<int> sorted = members;
  std::sort(sorted.begin(), sorted.end());
  SurfaceRegion r;
  r.regionId = subdividedId ? "region:subdivided:" + centroidKey(centroid) : regionId;
  r.regionIndex = regionIndex;
  for (int p : sorted) r.sourceTriangleIds.push_back(patches[static_cast<std::size_t>(p)].sourceTriangle);
  std::sort(r.sourceTriangleIds.begin(), r.sourceTriangleIds.end());
  r.patchIndexes = sorted;
  r.areaMm2 = area;
  r.centroid = centroid;
  r.averageNormal = average;
  r.normalConeHalfAngleDeg = cone;
  r.boundaryPatchIndexes = boundary;
  r.adjacentRegionIndexes = adjacent;
  r.hasSharpBoundary = sharp;
  return r;
}
}  // namespace

SurfaceRegionGraph buildSurfaceRegionGraph(const PlanningMesh& mesh) {
  const auto& patches = mesh.patches;
  const std::size_t patchCount = patches.size();
  if (patchCount == 0) return {};
  const double mergeAngle = 20, ridgeAngle = 45;

  std::vector<std::string> keys(patchCount);
  for (std::size_t i = 0; i < patchCount; ++i) keys[i] = centroidKey(patches[i].centroid);
  const auto byKey = [&](int a, int b) { return icuLess(keys[static_cast<std::size_t>(a)], keys[static_cast<std::size_t>(b)]); };

  std::vector<int> canonicalOrder;
  for (const PlanningPatch& p : patches) canonicalOrder.push_back(p.patchIndex);
  std::stable_sort(canonicalOrder.begin(), canonicalOrder.end(), byKey);

  std::vector<std::vector<int>> sortedNeighbors(patchCount);
  for (std::size_t i = 0; i < patchCount; ++i) {
    sortedNeighbors[i] = mesh.adjacency[i];
    std::stable_sort(sortedNeighbors[i].begin(), sortedNeighbors[i].end(), byKey);
  }

  SurfaceRegionGraph graph;
  graph.regionOfPatch.assign(patchCount, -1);
  std::vector<std::vector<int>> groups;
  for (int seed : canonicalOrder) {
    if (graph.regionOfPatch[static_cast<std::size_t>(seed)] != -1) continue;
    const Point3 seedNormal = patches[static_cast<std::size_t>(seed)].normal;
    const int regionIndex = static_cast<int>(groups.size());
    std::vector<int> members, queue{seed};
    graph.regionOfPatch[static_cast<std::size_t>(seed)] = regionIndex;
    for (std::size_t head = 0; head < queue.size(); ++head) {
      const int current = queue[head];
      members.push_back(current);
      for (int neighbor : sortedNeighbors[static_cast<std::size_t>(current)]) {
        if (graph.regionOfPatch[static_cast<std::size_t>(neighbor)] != -1) continue;
        if (angleBetweenDeg(patches[static_cast<std::size_t>(neighbor)].normal, seedNormal) > mergeAngle) continue;
        graph.regionOfPatch[static_cast<std::size_t>(neighbor)] = regionIndex;
        queue.push_back(neighbor);
      }
    }
    groups.push_back(std::move(members));
  }

  std::vector<std::set<int>> adjacentSets(groups.size()), boundarySets(groups.size());
  std::vector<bool> sharp(groups.size(), false);
  for (std::size_t p = 0; p < patchCount; ++p) {
    const int own = graph.regionOfPatch[p];
    for (int neighbor : mesh.adjacency[p]) {
      const int other = graph.regionOfPatch[static_cast<std::size_t>(neighbor)];
      if (other == own) continue;
      adjacentSets[static_cast<std::size_t>(own)].insert(other);
      boundarySets[static_cast<std::size_t>(own)].insert(static_cast<int>(p));
      if (angleBetweenDeg(patches[p].normal, patches[static_cast<std::size_t>(neighbor)].normal) >= ridgeAngle) sharp[static_cast<std::size_t>(own)] = true;
    }
  }
  for (std::size_t r = 0; r < groups.size(); ++r) {
    graph.regions.push_back(materialize(groups[r], static_cast<int>(r), mesh, "region:" + canonicalGroupKey(groups[r], patches),
                                        {adjacentSets[r].begin(), adjacentSets[r].end()}, {boundarySets[r].begin(), boundarySets[r].end()},
                                        sharp[r], false));
  }
  return graph;
}

std::vector<SurfaceRegionAccessibilitySummary> summarizeRegionAccessibility(const SurfaceRegionGraph& graph, const PlanningMesh& mesh,
                                                                            const AccessibilityAnalysis& analysis) {
  std::vector<SurfaceRegionAccessibilitySummary> out;
  for (const SurfaceRegion& region : graph.regions) {
    SurfaceRegionAccessibilitySummary s;
    s.regionIndex = region.regionIndex;
    double best = -1;
    for (std::size_t d = 0; d < analysis.directions.size(); ++d) {
      const auto& visible = analysis.perDirection[d].visible;
      double visibleArea = 0;
      for (int p : region.patchIndexes) {
        if (visible[static_cast<std::size_t>(p)] == 1) visibleArea += mesh.patches[static_cast<std::size_t>(p)].areaMm2;
      }
      const double fraction = region.areaMm2 > 0 ? visibleArea / region.areaMm2 : 0;
      s.visibleAreaFractionByDirectionId[analysis.directions[d].directionId] = fraction;
      if (fraction > best) {
        best = fraction;
        s.bestDirectionId = analysis.directions[d].directionId;
        s.hasBestDirection = true;
      }
    }
    s.bestVisibleAreaFraction = std::max(0.0, best);
    out.push_back(std::move(s));
  }
  return out;
}

std::vector<int> unresolvedSurfaceRegionIndexes(const std::vector<SurfaceRegionAccessibilitySummary>& summaries, double fullCoverageFraction) {
  std::vector<int> out;
  for (const auto& s : summaries) if (s.bestVisibleAreaFraction < fullCoverageFraction) out.push_back(s.regionIndex);
  return out;
}

// --- subdivision ------------------------------------------------------------------------------

namespace {
std::vector<std::vector<int>> connectedComponents(const std::vector<int>& patchIndexes, const PlanningMesh& mesh) {
  const std::unordered_set<int> members(patchIndexes.begin(), patchIndexes.end());
  std::unordered_set<int> visited;
  std::vector<std::vector<int>> components;
  for (int start : patchIndexes) {
    if (visited.count(start)) continue;
    std::vector<int> queue{start}, component;
    visited.insert(start);
    for (std::size_t head = 0; head < queue.size(); ++head) {
      const int current = queue[head];
      component.push_back(current);
      for (int n : mesh.adjacency[static_cast<std::size_t>(current)]) {
        if (members.count(n) && !visited.count(n)) { visited.insert(n); queue.push_back(n); }
      }
    }
    components.push_back(std::move(component));
  }
  return components;
}

double areaOf(const std::vector<int>& patchIndexes, const PlanningMesh& mesh) {
  double sum = 0;
  for (int p : patchIndexes) sum += mesh.patches[static_cast<std::size_t>(p)].areaMm2;
  return sum;
}

SurfaceRegionGraph pseudoGraph(const std::vector<std::vector<int>>& groups, const PlanningMesh& mesh) {
  SurfaceRegionGraph g;
  g.regionOfPatch.assign(mesh.patches.size(), -1);
  for (std::size_t i = 0; i < groups.size(); ++i) {
    for (int p : groups[i]) g.regionOfPatch[static_cast<std::size_t>(p)] = static_cast<int>(i);
    SurfaceRegion r;
    r.regionIndex = static_cast<int>(i);
    r.patchIndexes = groups[i];
    r.areaMm2 = areaOf(groups[i], mesh);
    g.regions.push_back(std::move(r));
  }
  return g;
}
}  // namespace

RegionSubdivisionResult refineRegionGraphByVisibility(const SurfaceRegionGraph& graph, const PlanningMesh& mesh,
                                                      const AccessibilityAnalysis& analysis) {
  const int maxDepth = 2;
  const double minAreaFraction = 0.02;
  const std::size_t minPatchCount = 3;
  double totalArea = 0;
  for (const auto& r : graph.regions) totalArea += r.areaMm2;

  std::vector<std::vector<int>> groups;
  for (const auto& r : graph.regions) groups.push_back(r.patchIndexes);
  int totalSplits = 0;
  for (int round = 0; round < maxDepth; ++round) {
    const auto summaries = summarizeRegionAccessibility(pseudoGraph(groups, mesh), mesh, analysis);
    const double minArea = totalArea * minAreaFraction;
    std::vector<std::vector<int>> next;
    int splits = 0;
    for (std::size_t index = 0; index < groups.size(); ++index) {
      const auto& group = groups[index];
      const auto& summary = summaries[index];
      if (summary.bestVisibleAreaFraction >= 0.999 || summary.bestVisibleAreaFraction <= 0 || !summary.hasBestDirection) { next.push_back(group); continue; }
      int directionIndex = -1;
      for (std::size_t d = 0; d < analysis.directions.size(); ++d) {
        if (analysis.directions[d].directionId == summary.bestDirectionId) { directionIndex = static_cast<int>(d); break; }
      }
      if (directionIndex == -1) { next.push_back(group); continue; }
      const auto& visible = analysis.perDirection[static_cast<std::size_t>(directionIndex)].visible;
      std::vector<int> visiblePatches, invisiblePatches;
      for (int p : group) (visible[static_cast<std::size_t>(p)] == 1 ? visiblePatches : invisiblePatches).push_back(p);
      if (visiblePatches.empty() || invisiblePatches.empty()) { next.push_back(group); continue; }
      std::vector<std::vector<int>> sv, si;
      std::size_t survivingCount = 0;
      for (auto& c : connectedComponents(visiblePatches, mesh)) if (c.size() >= minPatchCount && areaOf(c, mesh) >= minArea) { survivingCount += c.size(); sv.push_back(std::move(c)); }
      for (auto& c : connectedComponents(invisiblePatches, mesh)) if (c.size() >= minPatchCount && areaOf(c, mesh) >= minArea) { survivingCount += c.size(); si.push_back(std::move(c)); }
      if (sv.empty() || si.empty() || static_cast<double>(survivingCount) < static_cast<double>(group.size()) * 0.9) { next.push_back(group); continue; }
      for (auto& c : sv) next.push_back(std::move(c));
      for (auto& c : si) next.push_back(std::move(c));
      ++splits;
    }
    groups = std::move(next);
    totalSplits += splits;
    if (splits == 0) break;
  }
  if (totalSplits == 0) return {graph, 0};

  // materializeRegionGraph
  const auto& patches = mesh.patches;
  std::vector<std::vector<int>> ordered;
  for (const auto& g : groups) if (!g.empty()) ordered.push_back(g);
  const auto minKey = [&](const std::vector<int>& m) {
    std::vector<std::string> ks;
    for (int p : m) ks.push_back(centroidKey(patches[static_cast<std::size_t>(p)].centroid));
    std::sort(ks.begin(), ks.end());
    return ks.empty() ? std::string() : ks.front();
  };
  std::vector<std::pair<std::string, std::size_t>> keyed;
  for (std::size_t i = 0; i < ordered.size(); ++i) keyed.emplace_back(minKey(ordered[i]), i);
  std::stable_sort(keyed.begin(), keyed.end(), [](const auto& a, const auto& b) { return icuLess(a.first, b.first); });
  std::vector<std::vector<int>> sortedGroups;
  for (const auto& k : keyed) sortedGroups.push_back(ordered[k.second]);

  SurfaceRegionGraph out;
  out.regionOfPatch.assign(patches.size(), -1);
  for (std::size_t r = 0; r < sortedGroups.size(); ++r)
    for (int p : sortedGroups[r]) out.regionOfPatch[static_cast<std::size_t>(p)] = static_cast<int>(r);
  std::vector<std::set<int>> adj(sortedGroups.size()), bnd(sortedGroups.size());
  std::vector<bool> sharp(sortedGroups.size(), false);
  for (std::size_t p = 0; p < patches.size(); ++p) {
    const int own = out.regionOfPatch[p];
    if (own == -1) continue;
    for (int n : mesh.adjacency[p]) {
      const int other = out.regionOfPatch[static_cast<std::size_t>(n)];
      if (other == -1 || other == own) continue;
      adj[static_cast<std::size_t>(own)].insert(other);
      bnd[static_cast<std::size_t>(own)].insert(static_cast<int>(p));
      if (angleBetweenDeg(patches[p].normal, patches[static_cast<std::size_t>(n)].normal) >= 45) sharp[static_cast<std::size_t>(own)] = true;
    }
  }
  for (std::size_t r = 0; r < sortedGroups.size(); ++r) {
    out.regions.push_back(materialize(sortedGroups[r], static_cast<int>(r), mesh, "", {adj[r].begin(), adj[r].end()},
                                      {bnd[r].begin(), bnd[r].end()}, sharp[r], true));
  }
  return {std::move(out), totalSplits};
}

// --- accessibility -------------------------------------------------------------------------------------------

namespace {
constexpr double kRayEpsilonMm = 1e-7;

double baseProbeOffsetMmFor(const Bounds3& b) {
  const double sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  for (double v : {sx, sy, sz}) if (!(std::isfinite(v) && v > 0)) return 1e-3;
  try {
    return buildGeometryTolerancePolicy(b, 0).containmentToleranceMm;
  } catch (const std::exception&) {
    return 1e-3;
  }
}
}  // namespace

AccessibilityAnalysis analyzeDirectionAccessibility(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices,
                                                    const PlanningMesh& mesh, const std::vector<PlanningCandidateDirection>& directions) {
  const std::size_t patchCount = mesh.patches.size();
  std::vector<std::vector<std::uint8_t>> visible(directions.size(), std::vector<std::uint8_t>(patchCount, 0));
  std::vector<std::vector<PatchAccessibilityClass>> classes(directions.size(), std::vector<PatchAccessibilityClass>(patchCount, PatchAccessibilityClass::Clear));
  const double baseOffset = baseProbeOffsetMmFor(boundsOfPositions(positions, positions.size() / 3));
  const RayBvh bvh(positions, indices);

  const auto work = [&](std::size_t from, std::size_t to) {
    for (std::size_t pi = from; pi < to; ++pi) {
      const PlanningPatch& patch = mesh.patches[pi];
      for (std::size_t d = 0; d < directions.size(); ++d) {
        const Point3 dir = directions[d].vector;
        bool results[3];
        const double scales[3] = {1, 4, 16};
        for (int s = 0; s < 3; ++s) {
          const double offset = baseOffset * scales[s];
          const Point3 probe{patch.centroid.x + patch.normal.x * offset, patch.centroid.y + patch.normal.y * offset,
                           patch.centroid.z + patch.normal.z * offset};
          results[s] = !bvh.anyHitBeyond(probe, dir, kRayEpsilonMm);
        }
        PatchAccessibilityClass cls;
        bool isVisible;
        if (results[0] == results[1] && results[1] == results[2]) {
          cls = results[0] ? PatchAccessibilityClass::Clear : PatchAccessibilityClass::Blocked;
          isVisible = results[0];
        } else if (results[1] == results[2]) {
          cls = PatchAccessibilityClass::Grazing;
          isVisible = results[2];
        } else {
          cls = PatchAccessibilityClass::Uncertain;
          isVisible = false;
        }
        if (isVisible) visible[d][static_cast<std::size_t>(patch.patchIndex)] = 1;
        classes[d][static_cast<std::size_t>(patch.patchIndex)] = cls;
      }
    }
  };
  const std::size_t threads = std::max<std::size_t>(1, std::min<std::size_t>(std::thread::hardware_concurrency(), 16));
  std::vector<std::thread> pool;
  const std::size_t chunk = (patchCount + threads - 1) / threads;
  for (std::size_t t = 0; t < threads && t * chunk < patchCount; ++t) pool.emplace_back(work, t * chunk, std::min(patchCount, (t + 1) * chunk));
  for (auto& th : pool) th.join();

  AccessibilityAnalysis analysis;
  analysis.directions = directions;
  for (std::size_t d = 0; d < directions.size(); ++d) {
    DirectionAccessibility acc;
    acc.directionId = directions[d].directionId;
    std::set<int> invisible;
    for (const PlanningPatch& patch : mesh.patches) {
      if (visible[d][static_cast<std::size_t>(patch.patchIndex)] == 1) acc.accessibleAreaMm2 += patch.areaMm2;
      else { acc.inaccessibleAreaMm2 += patch.areaMm2; invisible.insert(patch.patchIndex); }
    }
    // Undercut regions: BFS over invisible patches in ascending patch order (a JS Set filled in patch order).
    std::unordered_set<int> visited;
    for (int start : invisible) {
      if (visited.count(start)) continue;
      std::vector<int> queue{start};
      visited.insert(start);
      double area = 0;
      for (std::size_t head = 0; head < queue.size(); ++head) {
        const int p = queue[head];
        area += mesh.patches[static_cast<std::size_t>(p)].areaMm2;
        for (int n : mesh.adjacency[static_cast<std::size_t>(p)]) {
          if (invisible.count(n) && !visited.count(n)) { visited.insert(n); queue.push_back(n); }
        }
      }
      ++acc.undercutRegionCount;
      acc.largestUndercutAreaMm2 = std::max(acc.largestUndercutAreaMm2, area);
    }
    acc.visible = visible[d];
    acc.classification = classes[d];
    analysis.perDirection.push_back(std::move(acc));
  }
  std::vector<int> order;
  for (const PlanningPatch& p : mesh.patches) order.push_back(p.patchIndex);
  std::stable_sort(order.begin(), order.end(), [&](int a, int b) {
    const double d = mesh.patches[static_cast<std::size_t>(b)].areaMm2 - mesh.patches[static_cast<std::size_t>(a)].areaMm2;
    return d != 0 ? d < 0 : a < b;
  });
  analysis.dominantPatchOrder = std::move(order);
  return analysis;
}

double directionPreliminaryScore(const DirectionAccessibility& a, const PlanningMesh& mesh) {
  const double total = std::max(mesh.totalAreaMm2, 1e-9);
  return (a.inaccessibleAreaMm2 / total) * 10 + a.undercutRegionCount * 0.1 + (a.largestUndercutAreaMm2 / total) * 5;
}

PrunedDirections pruneDirections(const std::vector<PlanningCandidateDirection>& directions, const AccessibilityAnalysis& analysis,
                                 const PlanningMesh& mesh, int keep) {
  struct Scored { const PlanningCandidateDirection* direction; std::size_t index; double score; };
  std::vector<Scored> scored;
  for (std::size_t i = 0; i < directions.size(); ++i) scored.push_back({&directions[i], i, directionPreliminaryScore(analysis.perDirection[i], mesh)});

  // Region full-coverers against the refined region graph.
  const SurfaceRegionGraph refined = refineRegionGraphByVisibility(buildSurfaceRegionGraph(mesh), mesh, analysis).regionGraph;
  std::vector<std::vector<int>> perRegion;
  if (!refined.regions.empty()) {
    for (const auto& summary : summarizeRegionAccessibility(refined, mesh, analysis)) {
      std::vector<int> coverers;
      for (std::size_t d = 0; d < directions.size(); ++d) {
        const auto it = summary.visibleAreaFractionByDirectionId.find(directions[d].directionId);
        const double fraction = it == summary.visibleAreaFractionByDirectionId.end() ? 0 : it->second;
        if (fraction >= 0.999) coverers.push_back(static_cast<int>(d));
      }
      perRegion.push_back(std::move(coverers));
    }
  }

  std::set<std::size_t> mandatory;
  for (const Scored& s : scored) if (s.direction->source == "world-axis") mandatory.insert(s.index);
  for (const auto& coverers : perRegion) if (coverers.size() == 1) mandatory.insert(static_cast<std::size_t>(coverers[0]));

  std::vector<Scored> others;
  for (const Scored& s : scored) if (!mandatory.count(s.index)) others.push_back(s);
  std::stable_sort(others.begin(), others.end(), [](const Scored& a, const Scored& b) {
    if (a.score != b.score) return a.score < b.score;
    return icuLess(a.direction->directionId, b.direction->directionId);
  });
  const std::size_t mandatoryCount = mandatory.size();
  const std::size_t budget = std::max<std::size_t>(static_cast<std::size_t>(std::max(keep, 0)), mandatoryCount) - mandatoryCount;
  std::set<std::size_t> kept = mandatory;
  for (std::size_t i = 0; i < std::min(budget, others.size()); ++i) kept.insert(others[i].index);

  for (const auto& coverers : perRegion) {
    if (coverers.size() < 2) continue;
    if (std::any_of(coverers.begin(), coverers.end(), [&](int i) { return kept.count(static_cast<std::size_t>(i)) > 0; })) continue;
    int best = coverers[0];
    for (int i : coverers) if (scored[static_cast<std::size_t>(i)].score < scored[static_cast<std::size_t>(best)].score) best = i;
    kept.insert(static_cast<std::size_t>(best));
  }

  std::vector<Scored> ranked;
  for (const Scored& s : scored) if (kept.count(s.index)) ranked.push_back(s);
  std::stable_sort(ranked.begin(), ranked.end(), [](const Scored& a, const Scored& b) {
    if (a.score != b.score) return a.score < b.score;
    return icuLess(a.direction->directionId, b.direction->directionId);
  });

  PrunedDirections out;
  out.analysis.dominantPatchOrder = analysis.dominantPatchOrder;
  for (const Scored& s : ranked) {
    out.directions.push_back(*s.direction);
    out.analysis.directions.push_back(*s.direction);
    out.analysis.perDirection.push_back(analysis.perDirection[s.index]);
  }
  return out;
}

}  // namespace craft
