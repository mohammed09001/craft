#pragma once

// Master Mold engine orchestration.
// Port of engine/masterMoldEngine.ts: preflight -> planning geometry ->
// direction pruning + adaptive discovery -> piece-count search with exact
// planar construction -> per-piece Master tooling (pour face, accessibility,
// vent proofs, one-piece case with exact release proof) -> plan contract.
//
// Honest scope: the engine's fallback construction modes (height-field,
// region-direct, multi-label) and the multi-piece / localized-core tooling
// planners are NOT ported. Where the reference would have used them, the
// native engine reports the same structured failure it would have reported
// had those modes failed, and flags it in `unportedPathsReached` so a caller
// (and the tests) can tell a faithful result from a possibly-incomplete one.

#include <functional>
#include <optional>
#include <string>
#include <vector>

#include "contracts/Operation.h"
#include "master/MasterTooling.h"
#include "master/MasterWorkingMoldConstructor.h"
#include "master/MasterWorkingMoldPlanner.h"

namespace craft {

inline constexpr std::array<const char*, 7> kMasterProgressStages = {
    "analyzing_geometry", "building_accessibility", "optimizing_working_mold", "constructing_working_mold",
    "planning_master_tooling", "verifying_release", "finalizing"};

struct MasterMoldProgressStage {
  std::string stage;
  int stageIndex = 0;
  int stageCount = 7;
  std::optional<std::string> detail;
  double elapsedMs = 0;
};

struct MasterMoldEngineHooks {
  std::function<void(const MasterMoldProgressStage&)> onStage;
  CancellationToken cancel;
};

struct MasterMoldFailure {
  std::string moldPartId;
  std::string reason;
  std::string family;
  std::string message;
};
std::string masterMoldFailureFamilyOf(const std::string& reason);

struct MasterMoldBudgetLineItem {
  std::string name;
  int limit = 0, used = 0, pruned = 0;
  std::string reason;
};

struct MasterMoldBudgetReport {
  int candidateDirectionCount = 0, planningPatchCount = 0, workingMoldPlanCandidateCount = 0, workingMoldConstructionAttempts = 0;
  int pourFaceAnalysisAttempts = 0, ventAnalysisAttempts = 0, toolingOnePieceAttempts = 0, toolingMultiPieceAttempts = 0;
  int toolingExactPlanAttempts = 0, releaseVerificationAttempts = 0;
  std::vector<std::string> limitsExceeded;
  std::vector<MasterMoldBudgetLineItem> budgetDetails;
};

struct PlanningWarning {
  std::string code, message;
  std::optional<int> pieceIndex;
};

struct AutoWorkingMoldPlan {
  std::string sourceGeometryVersion;
  std::vector<WorkingMoldPieceTarget> moldPieces;
  std::vector<WorkingMoldPartingInterface> partingInterfaces;
  std::vector<WorkingMoldReleaseStep> releaseSequence;
  WorkingMoldRegistrationPlan registrationPlan;
  std::vector<PlanningWarning> warnings;
  WorkingMoldPlanScore score;
  std::vector<RejectedPieceCount> rejectedPieceCounts;
};

struct MasterMoldDebugSnapshot {
  std::string sourceValidity;
  int regionCount = 0, candidateDirectionCount = 0, regionRefinementCount = 0;
  int totalRegions = 0, uncoveredRegionCount = 0;
  std::optional<int> minimumPieceEstimate;
  std::vector<int> uncoveredRegionIndexes;
  std::vector<int> pieceCountAttempts;
  std::vector<std::pair<int, int>> thresholdAttemptsByPieceCount;
  int partingSurfaceCandidateCount = 0, exactConstructionAttempts = 0;
  std::optional<int> selectedPieceCount;
  std::optional<int> releaseSweepCount;
};

struct MasterMoldEngineResult {
  std::string seedId;
  std::optional<AutoWorkingMoldPlan> plan;
  std::vector<MasterToolingSet> toolingSets;
  std::vector<MasterMoldFailure> failures;
  MasterMoldBudgetReport budget;
  double elapsedMs = 0;
  std::vector<WorkingMoldPieceCountDiagnostics> planningDiagnostics;
  std::optional<MasterMoldDebugSnapshot> debugSnapshot;
  /// True when the reference would have tried a construction/tooling path this port does not implement.
  bool unportedPathsReached = false;
  std::vector<std::string> unportedPaths;
};

/// `seed` must already carry WORLD-space positions (worldMeshFromSnapshot).
/// Throws CodedError("cancelled", ...) when `hooks.cancel` is set.
MasterMoldEngineResult runMasterMoldEngine(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed,
                                           const std::vector<MasterToolingSet>& priorSets = {}, const MasterMoldEngineHooks& hooks = {});

}  // namespace craft
