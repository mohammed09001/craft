#pragma once

// Master Mold surface regions and global accessibility.
// Ports of master-mold/planning/surfaceRegions.ts, regionSubdivision.ts and
// accessibility.ts (including pruneDirections). Visibility rays reproduce
// three.js Ray.intersectTriangle as used by three-mesh-bvh, with a native
// triangle BVH standing in for the acceleration structure.

#include <map>
#include <string>
#include <vector>

#include "master/MasterPlanning.h"

namespace craft {

struct SurfaceRegion {
  std::string regionId;
  int regionIndex = 0;
  std::vector<int> sourceTriangleIds;
  std::vector<int> patchIndexes;
  double areaMm2 = 0;
  Point3 centroid;
  Point3 averageNormal;
  double normalConeHalfAngleDeg = 0;
  std::vector<int> boundaryPatchIndexes;
  std::vector<int> adjacentRegionIndexes;
  bool hasSharpBoundary = false;
};

struct SurfaceRegionGraph {
  std::vector<SurfaceRegion> regions;
  std::vector<int> regionOfPatch;
};

enum class PatchAccessibilityClass { Clear, Grazing, Blocked, Uncertain };
const char* patchAccessibilityClassName(PatchAccessibilityClass value);

struct DirectionAccessibility {
  std::string directionId;
  std::vector<std::uint8_t> visible;
  std::vector<PatchAccessibilityClass> classification;
  double accessibleAreaMm2 = 0;
  double inaccessibleAreaMm2 = 0;
  int undercutRegionCount = 0;
  double largestUndercutAreaMm2 = 0;
};

struct AccessibilityAnalysis {
  std::vector<PlanningCandidateDirection> directions;
  std::vector<DirectionAccessibility> perDirection;
  std::vector<int> dominantPatchOrder;
};

struct SurfaceRegionAccessibilitySummary {
  int regionIndex = 0;
  std::map<std::string, double> visibleAreaFractionByDirectionId;
  std::string bestDirectionId;  // empty when none
  bool hasBestDirection = false;
  double bestVisibleAreaFraction = 0;
};

/// JavaScript Number.prototype.toFixed.
std::string jsToFixed(double value, int digits);
/// ICU-root-like string order for ASCII ids (punctuation < digits < letters,
/// letters case-insensitive first, lowercase before uppercase on ties).
bool icuLess(const std::string& a, const std::string& b);

SurfaceRegionGraph buildSurfaceRegionGraph(const PlanningMesh& mesh);
std::vector<SurfaceRegionAccessibilitySummary> summarizeRegionAccessibility(const SurfaceRegionGraph& graph, const PlanningMesh& mesh,
                                                                            const AccessibilityAnalysis& analysis);
std::vector<int> unresolvedSurfaceRegionIndexes(const std::vector<SurfaceRegionAccessibilitySummary>& summaries,
                                                double fullCoverageFraction = 0.999);

struct RegionSubdivisionResult {
  SurfaceRegionGraph regionGraph;
  int subdividedRegionCount = 0;
};
RegionSubdivisionResult refineRegionGraphByVisibility(const SurfaceRegionGraph& graph, const PlanningMesh& mesh,
                                                      const AccessibilityAnalysis& analysis);

AccessibilityAnalysis analyzeDirectionAccessibility(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices,
                                                    const PlanningMesh& mesh, const std::vector<PlanningCandidateDirection>& directions);
double directionPreliminaryScore(const DirectionAccessibility& accessibility, const PlanningMesh& mesh);

struct PrunedDirections {
  std::vector<PlanningCandidateDirection> directions;
  AccessibilityAnalysis analysis;
};
PrunedDirections pruneDirections(const std::vector<PlanningCandidateDirection>& directions, const AccessibilityAnalysis& analysis,
                                 const PlanningMesh& mesh, int keep);

}  // namespace craft
