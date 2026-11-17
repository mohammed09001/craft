#pragma once

// Master Mold region set cover and automatic working-mold planner.
// Ports of master-mold/planning/regionSetCover.ts and workingMoldPlanner.ts:
// parting thresholds, region-owned ownership, the diverse prism beam,
// finalization and scoring, parting-interface curves and the incremental
// piece-count search. Operation order follows the reference so candidate
// ordering, scores and rejection reasons are identical.

#include <optional>
#include <set>
#include <string>
#include <vector>

#include "master/MasterAccessibility.h"

namespace craft {

// --- region set cover -------------------------------------------------------------------------
struct RegionSetCoverStep {
  int directionIndex = 0;
  std::string directionId;
  int newlyCoveredRegionCount = 0;
  int cumulativeCoveredRegionCount = 0;
};

struct RegionSetCoverResult {
  std::vector<RegionSetCoverStep> steps;
  std::vector<int> uncoveredRegionIndexes;
  int totalRegionCount = 0;
};

RegionSetCoverResult greedyRegionCover(const SurfaceRegionGraph& graph, const PlanningMesh& mesh, const AccessibilityAnalysis& analysis,
                                       double fullCoverageFraction = 0.999);

// --- decomposition contracts --------------------------------------------------------------------
struct Prism {
  int directionIndex = 0;
  double offsetMm = 0;
};

struct PlannedWorkingMoldPiece {
  Point3 releaseDirection;
  std::string directionId;
  std::optional<Prism> prism;  // none = catch-all remainder
};

struct WorkingMoldPlanScore {
  double slidingWallAreaMm2 = 0;
  int seamCrossingCount = 0;
  double areaImbalance = 0;
  int interfaceCount = 0;
  double total = 0;
};

struct DecompositionCandidate {
  int pieceCount = 0;
  std::vector<PlannedWorkingMoldPiece> pieces;
  bool feasible = false;
  int unassignablePatchCount = 0;
  double score = 0;
  WorkingMoldPlanScore scoreBreakdown;
};

struct WorkingMoldPartingInterface {
  std::string interfaceId;
  int pieceAIndex = 0;
  int pieceBIndex = 0;
  std::vector<Point3> samplePoints;
  std::string kind;  // silhouette | region-adjacency
  bool selfIntersecting = false;
};

struct WorkingMoldPieceCountDiagnostics {
  int pieceCount = 0;
  int planningCandidatesGenerated = 0;
  int planningCandidatesFeasible = 0;
  std::optional<int> bestUnassignablePatchCount;
  std::optional<int> bestUnresolvedRegionCount;
  std::optional<std::string> rejectionReason;
  int candidateDirectionCountUsed = 0;
  int combinationDirectionCountUsed = 0;
  int thresholdCountUsed = 0;
  int beamSizeUsed = 0;
  std::optional<int> regionSetCoverMinimumPieceEstimate;
  int regionSetCoverUncoveredRegionCount = 0;
};

struct WorkingMoldDecompositionFinalist {
  DecompositionCandidate candidate;
  std::vector<int> patchAssignment;
  std::vector<WorkingMoldPartingInterface> interfaces;
};

struct WorkingMoldPieceCountStep {
  int pieceCount = 0;
  std::vector<WorkingMoldDecompositionFinalist> finalists;
  std::optional<std::string> rejectionReason;
  WorkingMoldPieceCountDiagnostics diagnostics;
};

struct RejectedPieceCount {
  int pieceCount = 0;
  std::string reason;
};

struct WorkingMoldDecompositionPlan {
  DecompositionCandidate candidate;
  std::vector<WorkingMoldDecompositionFinalist> finalists;
  std::vector<RejectedPieceCount> rejectedPieceCounts;
};

// --- building blocks (exported for direct tests) --------------------------------------------------
std::optional<double> exactPartingThreshold(const PlanningMesh& mesh, const std::vector<std::uint8_t>& visibleFor,
                                            const std::vector<std::uint8_t>& visibleOpposing, const Point3& direction);
std::vector<double> candidatePartingThresholds(const PlanningMesh& mesh, const std::vector<std::uint8_t>& visibleFor,
                                               const std::vector<std::uint8_t>& visibleOpposing, const Point3& direction,
                                               const SurfaceRegionGraph& graph);

struct PrefixEvaluation {
  std::vector<int> assignment;
  int unassignable = 0;
  int remainderPatchCount = 0;
};
PrefixEvaluation evaluatePrefix(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis, const SurfaceRegionGraph& graph,
                                const std::vector<Prism>& prisms);

struct FinalizedEvaluation {
  DecompositionCandidate candidate;
  std::vector<int> assignment;
  std::set<int> unassignableRegionIndexes;
};
FinalizedEvaluation evaluateFinalized(const PlanningMesh& mesh, const AccessibilityAnalysis& analysis, const SurfaceRegionGraph& graph,
                                      const std::vector<Prism>& prisms, int catchAllDirectionIndex);

std::vector<Point3> orderPartingCurvePoints(const std::vector<Point3>& points);
std::vector<Point3> simplifyPartingCurve(const std::vector<Point3>& points, double toleranceMm);
bool detectSelfCrossing(const std::vector<Point3>& points, double toleranceMm);
std::vector<WorkingMoldPartingInterface> extractPartingInterfaces(const PlanningMesh& mesh, const std::vector<int>& assignment,
                                                                  const std::vector<PlannedWorkingMoldPiece>& pieces);

// --- search -------------------------------------------------------------------------------------------
struct WorkingMoldPlannerInput {
  PlanningMesh planningMesh;
  AccessibilityAnalysis analysis;
  int maxWorkingMoldPieces = 6;
};

class WorkingMoldPieceCountSearch {
 public:
  explicit WorkingMoldPieceCountSearch(WorkingMoldPlannerInput input);
  /// Advances to the next piece count (2 upward); nullopt once counts are exhausted.
  std::optional<WorkingMoldPieceCountStep> next();

  const SurfaceRegionGraph& regionGraph() const { return regionGraph_; }
  int subdividedRegionCount() const { return subdividedRegionCount_; }
  const RegionSetCoverResult& regionCover() const { return regionCover_; }

 private:
  struct BeamPrefix {
    std::vector<Prism> prisms;
    int unassignable = 0;
    double score = 0;
    int isDegenerateSplit = 0;
    std::string uncoveredRegionSignature;
  };
  std::vector<Prism> extensionsOf(const std::vector<Prism>& prisms) const;
  const std::vector<std::uint8_t>& opposingVisibilityOf(int d) const;

  WorkingMoldPlannerInput input_;
  bool empty_ = false;
  int maxPieces_ = 2;
  int pieceCount_ = 2;
  std::vector<BeamPrefix> beam_;
  std::set<std::string> evaluated_;
  SurfaceRegionGraph regionGraph_;
  int subdividedRegionCount_ = 0;
  RegionSetCoverResult regionCover_;
  int regionSetCoverUncoveredRegionCount_ = 0;
  std::optional<int> regionSetCoverMinimumPieceEstimate_;
  std::vector<std::uint8_t> zeroVisibility_;
};

std::optional<WorkingMoldDecompositionPlan> planWorkingMoldDecomposition(const WorkingMoldPlannerInput& input);

// --- adaptive direction discovery (planning/adaptiveDirectionDiscovery.ts) ------------------------------
struct AdaptiveDirectionDiscoveryResult {
  AccessibilityAnalysis analysis;
  std::vector<PlanningCandidateDirection> discoveredDirections;
  int roundsRun = 0;
};
AdaptiveDirectionDiscoveryResult runAdaptiveDirectionDiscovery(const PlanningMesh& mesh, const std::vector<float>& positions,
                                                               const std::vector<std::uint32_t>& indices, const AccessibilityAnalysis& analysis);

}  // namespace craft
