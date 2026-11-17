#pragma once

// Master Mold region-direct assignment: patches are assigned straight from the
// region set-cover proof (no offset search), then turned into construction
// inputs for the grid and multi-label partition modes.
// Ports of planning/regionDirectAssignment.ts and regionDirectConstruction.ts
// (the volumetric builder is not ported: the engine never reaches it).

#include <optional>
#include <vector>

#include "master/MasterWorkingMoldConstructor.h"
#include "master/MasterWorkingMoldPlanner.h"

namespace craft {

struct RegionDirectAssignmentResult {
  std::vector<int> assignment;  // patch -> piece (cover step) index, -1 when unreached
  std::vector<int> pieceDirectionIndexes;
  int unassignedPatchCount = 0;
  std::vector<std::vector<int>> alternativePiecesByPatch;
};

RegionDirectAssignmentResult buildRegionDirectAssignment(const SurfaceRegionGraph& graph, const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                                         const std::vector<RegionSetCoverStep>& coverSteps, double fullCoverageFraction = 0.999);

struct DirectConstruction {
  std::vector<PlannedPieceRegion> pieces;
  std::vector<WorkingMoldPartingInterface> interfaces;
};

/// One physical piece per mesh-connected component of each direction, built as a simultaneous grid partition (last piece = catch-all).
std::optional<DirectConstruction> buildDirectAssignmentConstructionPieces(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                                                          const RegionDirectAssignmentResult& direct);
/// The same physical pieces, each carrying only its own triangles for the joint multi-label reconstruction.
std::optional<DirectConstruction> buildMultiLabelConstructionPieces(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                                                    const RegionDirectAssignmentResult& direct);

/// A failed finalist retried with curve-following parting tools: the planar pieces with a curve group per neighbour for every prism piece whose interfaces are all usable; none when no piece qualifies.
std::optional<std::vector<PlannedPieceRegion>> heightFieldFallbackPieces(const WorkingMoldDecompositionFinalist& finalist,
                                                                         const std::vector<PlannedPieceRegion>& planarPieces);

}  // namespace craft
