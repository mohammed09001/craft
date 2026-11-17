#include "master/MasterRegionDirect.h"

#include <algorithm>
#include <cmath>
#include <set>
#include <unordered_set>

namespace craft {

RegionDirectAssignmentResult buildRegionDirectAssignment(const SurfaceRegionGraph& graph, const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                                         const std::vector<RegionSetCoverStep>& coverSteps, double fullCoverageFraction) {
  const auto summaries = summarizeRegionAccessibility(graph, mesh, analysis);
  RegionDirectAssignmentResult result;
  for (const auto& step : coverSteps) result.pieceDirectionIndexes.push_back(step.directionIndex);
  result.assignment.assign(mesh.patches.size(), -1);
  result.alternativePiecesByPatch.assign(mesh.patches.size(), {});
  for (const auto& summary : summaries) {
    const SurfaceRegion& region = graph.regions[static_cast<std::size_t>(summary.regionIndex)];
    int owner = -1;
    std::vector<int> covering;
    for (std::size_t piece = 0; piece < result.pieceDirectionIndexes.size(); ++piece) {
      const std::string& id = analysis.directions[static_cast<std::size_t>(result.pieceDirectionIndexes[piece])].directionId;
      const auto it = summary.visibleAreaFractionByDirectionId.find(id);
      const double fraction = it == summary.visibleAreaFractionByDirectionId.end() ? 0 : it->second;
      if (fraction >= fullCoverageFraction) {
        covering.push_back(static_cast<int>(piece));
        if (owner == -1) owner = static_cast<int>(piece);
      }
    }
    if (owner == -1) { result.unassignedPatchCount += static_cast<int>(region.patchIndexes.size()); continue; }
    for (int p : region.patchIndexes) {
      result.assignment[static_cast<std::size_t>(p)] = owner;
      result.alternativePiecesByPatch[static_cast<std::size_t>(p)] = covering;
    }
  }
  return result;
}

namespace {

struct PhysicalPiece {
  int directionIndex = 0;
  std::vector<int> patches;
};

double dotp(const Point3& a, const Point3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

std::vector<std::vector<int>> splitIntoConnectedComponents(const std::vector<int>& patches, const std::vector<std::vector<int>>& adjacency) {
  const std::unordered_set<int> patchSet(patches.begin(), patches.end());
  std::unordered_set<int> visited;
  std::vector<std::vector<int>> components;
  for (int start : patches) {
    if (visited.count(start)) continue;
    std::vector<int> component, stack{start};
    visited.insert(start);
    while (!stack.empty()) {
      const int current = stack.back();
      stack.pop_back();
      component.push_back(current);
      for (int neighbor : adjacency[static_cast<std::size_t>(current)]) {
        if (patchSet.count(neighbor) && !visited.count(neighbor)) { visited.insert(neighbor); stack.push_back(neighbor); }
      }
    }
    components.push_back(std::move(component));
  }
  return components;
}

std::vector<PhysicalPiece> computeComponentsByDirection(const std::vector<int>& assignment, const std::vector<std::vector<int>>& adjacency) {
  std::vector<std::pair<int, std::vector<int>>> byDirection;  // insertion ordered
  for (std::size_t p = 0; p < assignment.size(); ++p) {
    const int direction = assignment[p];
    if (direction == -1) continue;
    auto it = std::find_if(byDirection.begin(), byDirection.end(), [&](const auto& e) { return e.first == direction; });
    if (it == byDirection.end()) { byDirection.emplace_back(direction, std::vector<int>{}); it = byDirection.end() - 1; }
    it->second.push_back(static_cast<int>(p));
  }
  std::vector<PhysicalPiece> components;
  for (const auto& [direction, patches] : byDirection)
    for (auto& component : splitIntoConnectedComponents(patches, adjacency)) components.push_back({direction, std::move(component)});
  return components;
}

std::vector<int> absorbSmallDisconnectedComponents(const PlanningMesh& mesh, const RegionDirectAssignmentResult& direct) {
  std::vector<int> assignment = direct.assignment;
  for (int pass = 0; pass < 8; ++pass) {
    const std::vector<PhysicalPiece> components = computeComponentsByDirection(assignment, mesh.adjacency);
    std::vector<std::pair<int, std::size_t>> largest;  // direction -> largest component size
    for (const PhysicalPiece& c : components) {
      auto it = std::find_if(largest.begin(), largest.end(), [&](const auto& e) { return e.first == c.directionIndex; });
      if (it == largest.end()) largest.emplace_back(c.directionIndex, c.patches.size());
      else if (c.patches.size() > it->second) it->second = c.patches.size();
    }
    bool changed = false;
    for (const PhysicalPiece& component : components) {
      const auto largestIt = std::find_if(largest.begin(), largest.end(), [&](const auto& e) { return e.first == component.directionIndex; });
      if (component.patches.size() == largestIt->second) continue;

      std::optional<std::set<int>> candidates;
      for (int p : component.patches) {
        std::set<int> own;
        for (int alt : direct.alternativePiecesByPatch[static_cast<std::size_t>(p)]) if (alt != component.directionIndex) own.insert(alt);
        if (!candidates) {
          candidates = own;
        } else {
          std::set<int> intersected;
          for (int c : *candidates) if (own.count(c)) intersected.insert(c);
          candidates = intersected;
        }
        if (candidates->empty()) break;
      }
      if (!candidates || candidates->empty()) continue;

      int chosen = -1;
      for (int p : component.patches) {
        for (int neighbor : mesh.adjacency[static_cast<std::size_t>(p)]) {
          const int neighborDirection = assignment[static_cast<std::size_t>(neighbor)];
          if (candidates->count(neighborDirection)) { chosen = neighborDirection; break; }
        }
        if (chosen != -1) break;
      }
      if (chosen == -1) continue;
      for (int p : component.patches) assignment[static_cast<std::size_t>(p)] = chosen;
      changed = true;
    }
    if (!changed) break;
  }
  return assignment;
}

std::optional<std::vector<PhysicalPiece>> buildPhysicalPieces(const PlanningMesh& mesh, const RegionDirectAssignmentResult& direct) {
  const int directionCount = static_cast<int>(direct.pieceDirectionIndexes.size());
  if (directionCount < 2) return std::nullopt;
  const std::vector<int> assignment = absorbSmallDisconnectedComponents(mesh, direct);
  std::vector<std::vector<int>> byDirection(static_cast<std::size_t>(directionCount));
  for (std::size_t p = 0; p < assignment.size(); ++p) {
    const int d = assignment[p];
    if (d >= 0 && d < directionCount) byDirection[static_cast<std::size_t>(d)].push_back(static_cast<int>(p));
  }
  std::vector<PhysicalPiece> pieces;
  for (int d = 0; d < directionCount; ++d) {
    const auto& patches = byDirection[static_cast<std::size_t>(d)];
    if (patches.empty()) return std::nullopt;
    for (auto& component : splitIntoConnectedComponents(patches, mesh.adjacency)) pieces.push_back({d, std::move(component)});
  }
  if (pieces.size() < 2) return std::nullopt;
  return pieces;
}

std::vector<WorkingMoldPartingInterface> interfacesFor(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis, const RegionDirectAssignmentResult& direct,
                                                       std::vector<Point3>& releaseDirections) {
  std::vector<PlannedWorkingMoldPiece> pieces;
  for (int directionIndex : direct.pieceDirectionIndexes) {
    const auto& d = analysis.directions[static_cast<std::size_t>(directionIndex)];
    releaseDirections.push_back(d.vector);
    pieces.push_back({d.vector, d.directionId, std::nullopt});
  }
  return extractPartingInterfaces(mesh, direct.assignment, pieces);
}

}  // namespace

std::optional<DirectConstruction> buildMultiLabelConstructionPieces(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                                                    const RegionDirectAssignmentResult& direct) {
  if (direct.unassignedPatchCount > 0) return std::nullopt;
  const auto physical = buildPhysicalPieces(mesh, direct);
  if (!physical) return std::nullopt;
  DirectConstruction out;
  std::vector<Point3> releaseDirections;
  out.interfaces = interfacesFor(mesh, analysis, direct, releaseDirections);
  for (const PhysicalPiece& piece : *physical) {
    PlannedPieceRegion region;
    region.releaseDirection = releaseDirections[static_cast<std::size_t>(piece.directionIndex)];
    std::vector<int> triangles;
    for (int p : piece.patches) triangles.push_back(mesh.patches[static_cast<std::size_t>(p)].sourceTriangle);
    region.multiLabelTriangles = std::move(triangles);
    out.pieces.push_back(std::move(region));
  }
  return out;
}

std::optional<DirectConstruction> buildDirectAssignmentConstructionPieces(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                                                          const RegionDirectAssignmentResult& direct) {
  if (direct.unassignedPatchCount > 0) return std::nullopt;
  const auto physical = buildPhysicalPieces(mesh, direct);
  if (!physical) return std::nullopt;
  DirectConstruction out;
  std::vector<Point3> releaseDirections;
  out.interfaces = interfacesFor(mesh, analysis, direct, releaseDirections);

  constexpr double kPi = 3.14159265358979323846;
  for (std::size_t pieceIndex = 0; pieceIndex + 1 < physical->size(); ++pieceIndex) {
    const PhysicalPiece& piece = (*physical)[pieceIndex];
    const Point3 direction = releaseDirections[static_cast<std::size_t>(piece.directionIndex)];
    double minProjection = INFINITY, ownPatchRadius = 0;
    std::vector<Point3> ownPoints;
    for (int p : piece.patches) {
      const PlanningPatch& patch = mesh.patches[static_cast<std::size_t>(p)];
      const double projection = dotp(patch.centroid, direction);
      if (projection < minProjection) minProjection = projection;
      const double equivalentRadius = std::sqrt(patch.areaMm2 / kPi);
      if (equivalentRadius > ownPatchRadius) ownPatchRadius = equivalentRadius;
      ownPoints.push_back(patch.centroid);
    }
    if (!std::isfinite(minProjection)) return std::nullopt;
    std::vector<Point3> otherPoints;
    for (std::size_t other = 0; other < physical->size(); ++other) {
      if (other == pieceIndex) continue;
      for (int p : (*physical)[other].patches) otherPoints.push_back(mesh.patches[static_cast<std::size_t>(p)].centroid);
    }
    PlannedPieceRegion region;
    region.releaseDirection = direction;
    region.plane = PlannedPieceRegion::Plane{direction, minProjection - 1e-4};
    region.grid = PlannedPieceRegion::Grid{std::move(ownPoints), std::move(otherPoints), ownPatchRadius};
    out.pieces.push_back(std::move(region));
  }
  PlannedPieceRegion last;
  last.releaseDirection = releaseDirections[static_cast<std::size_t>(physical->back().directionIndex)];
  out.pieces.push_back(std::move(last));
  return out;
}

/// heightFieldFallbackPieces: a failed finalist is retried with curve-following parting tools when at least one prism piece
/// has only usable (non-self-intersecting, >= 3 point) interfaces; every other piece keeps its flat plane.
std::optional<std::vector<PlannedPieceRegion>> heightFieldFallbackPieces(const WorkingMoldDecompositionFinalist& finalist,
                                                                         const std::vector<PlannedPieceRegion>& planarPieces) {
  int eligible = 0;
  std::vector<PlannedPieceRegion> pieces = planarPieces;
  for (std::size_t index = 0; index < planarPieces.size(); ++index) {
    if (!planarPieces[index].plane) continue;
    std::vector<std::vector<Point3>> curves;
    bool any = false, usable = true;
    for (const auto& face : finalist.interfaces) {
      if (face.pieceAIndex != static_cast<int>(index) && face.pieceBIndex != static_cast<int>(index)) continue;
      any = true;
      if (face.selfIntersecting || face.samplePoints.size() < 3) usable = false;
      curves.push_back(face.samplePoints);
    }
    if (!any || !usable) continue;
    ++eligible;
    pieces[index].curve = std::move(curves);
  }
  if (eligible == 0) return std::nullopt;
  return pieces;
}


}  // namespace craft
