#pragma once

// Master Mold product state: the store state machine, the engine-result
// mapping the worker applies, the shared UI-state derivation and the
// renderable-body selection.
// Ports of masterMold.contracts.ts, masterMold.store.ts,
// masterMoldGeneration.evaluate.ts and masterMoldViewportAdapter.ts. Qt-free:
// the app layer owns threading, the timeout and the viewport.

#include <map>
#include <optional>
#include <string>
#include <vector>

#include "master/MasterEngine.h"

namespace craft {

inline constexpr int kMasterMoldSchemaVersion = 1;
inline constexpr double kDefaultMasterMoldWallMm = 3;
inline constexpr double kDefaultMasterMoldBottomMm = 3;

struct MasterMoldParameters {
  double wallThicknessMm = kDefaultMasterMoldWallMm;
  double bottomThicknessMm = kDefaultMasterMoldBottomMm;
  double geometryToleranceMm = 1e-3;
};

/// Store-level per-working-mold-piece state.
struct MasterToolingSetState {
  std::string moldPartId, moldPartName;
  std::string status;  // current | stale | blocked
  std::string sourceSignature, contentVersion;
  std::optional<MasterToolingSet> set;  // none when tooling failed for this piece
  std::optional<std::string> failureMessage;
  std::optional<std::string> failureFamily;
};

struct MasterMoldRequest {
  std::string operationId;
  int generationVersion = 0;
  MasterSeedSnapshot seed;  // local-space geometry + transform; the engine context applies the world transform
  std::vector<MasterToolingSet> priorSets;
};

struct MasterMoldResult {
  std::string operationId;
  int generationVersion = 0;
  double elapsedMs = 0;
  std::vector<MasterToolingSetState> sets;
  std::optional<AutoWorkingMoldPlan> plan;
  int workingMoldPieceCount = 0;
  int warningCount = 0;
  MasterMoldBudgetReport budget;
  std::string seedId;
  bool unportedPathsReached = false;
  std::vector<std::string> unportedPaths;
};

struct MasterMoldSeedIdentity {
  std::string identity;
  std::string sourceProjectRevision;
};

struct MasterMoldSummary {
  int workingMoldPieceCount = 0;
  int masterToolingPieceCount = 0;
  int onePieceCases = 0;
  int multiPieceCases = 0;
  int warningCount = 0;
  bool allReleasesVerified = false;
};

/// The explicit UI states derived from the store snapshot (one derivation for every consumer).
struct MasterMoldUiState {
  std::string kind;  // idle | generating | success | partial-success | blocked | error | stale
  int validSetCount = 0;
  int blockedSetCount = 0;
  std::vector<std::string> blockedMessages;
  std::optional<std::string> message;  // error
};

struct MasterMoldRenderableBody {
  std::string id;  // composite (set, piece) key
  std::string name;
  bool visible = true;
  Bounds3 bounds;
  int triangleCount = 0;
  double volumeMm3 = 0;
  const MeshPayload* mesh = nullptr;  // owned by the store's sets; valid until the store changes
  bool stale = false;
  std::string geometryIdentity;
};

std::string masterMoldPieceKey(const std::string& moldPartId, const std::string& pieceId);
bool hasRenderableToolingGeometry(const std::vector<MasterToolingSetState>& sets);
std::string overallStatusOfSets(const std::vector<MasterToolingSetState>& sets);  // unavailable | stale | blocked | current
MasterMoldSummary summarizeGeneration(const std::vector<MasterToolingSetState>& sets, int workingMoldPieceCount, int warningCount);
MasterMoldUiState deriveMasterMoldUiState(const std::string& status, const std::vector<MasterToolingSetState>& sets, const std::optional<std::string>& lastError);
std::vector<MasterMoldRenderableBody> selectRenderableMasterMoldBodies(const std::vector<MasterToolingSetState>& sets,
                                                                       const std::map<std::string, bool>& pieceVisibility);

/// What the worker does: world transform -> engine -> store-level state shape. Throws CodedError("cancelled").
MasterMoldResult evaluateMasterMoldGeneration(IMeshGeometryEngine& engine, const MasterMoldRequest& request, const MasterMoldEngineHooks& hooks = {});
/// The pure mapping step of the above (engine result -> store-level states), exposed for tests.
MasterMoldResult mapEngineResult(const MasterMoldRequest& request, const MasterMoldEngineResult& engineResult);

// --- store -------------------------------------------------------------------------------------------------------------
struct MasterMoldGenerateStart {
  bool reused = false;  // full-reuse fast path: nothing to run
  int generationVersion = 0;
  std::optional<MasterMoldRequest> request;  // set when a run must start
};

class MasterMoldStore {
 public:
  const std::string& status() const { return status_; }
  const MasterMoldParameters& parameters() const { return parameters_; }
  int generationVersion() const { return generationVersion_; }
  const std::vector<MasterToolingSetState>& sets() const { return sets_; }
  const std::optional<AutoWorkingMoldPlan>& plan() const { return plan_; }
  const std::optional<MasterMoldProgressStage>& progressStage() const { return progressStage_; }
  const std::optional<MasterMoldSummary>& summary() const { return summary_; }
  const std::map<std::string, bool>& pieceVisibility() const { return pieceVisibility_; }
  const std::optional<std::string>& lastError() const { return lastError_; }
  const std::optional<MasterMoldSeedIdentity>& seedIdentity() const { return seedIdentity_; }

  void setParameters(std::optional<double> wallThicknessMm, std::optional<double> bottomThicknessMm);
  void reset();
  void markMasterMoldStale(const MasterMoldSeedIdentity& identity);
  void reportGenerationFailure(const std::string& message);
  void togglePieceVisibility(const std::string& pieceKey);
  void isolateToolingSet(const std::string& moldPartId);
  void showAllPieces();

  /// First half of generate(): decides between the reuse fast path and a real run.
  /// `liveIdentity` is the current staleness identity (nullopt when unknown).
  MasterMoldGenerateStart beginGenerate(const MasterSeedSnapshot& seed, const std::optional<std::string>& liveIdentity);
  void setProgress(int generationVersion, const MasterMoldProgressStage& stage);
  /// Second half: false when a newer generation superseded this one.
  bool commitGeneration(int generationVersion, MasterMoldResult result, const std::optional<std::string>& liveIdentityAtCommit);
  /// A run failed or was cancelled; false when superseded.
  bool failGeneration(int generationVersion, const std::string& message);

 private:
  struct Pending {
    int generationVersion = 0;
    MasterMoldSeedIdentity identity;
    std::vector<MasterToolingSetState> before;
  };
  std::string status_ = "unavailable";
  MasterMoldParameters parameters_;
  int generationVersion_ = 0;
  std::vector<MasterToolingSetState> sets_;
  std::optional<AutoWorkingMoldPlan> plan_;
  std::optional<MasterMoldProgressStage> progressStage_;
  std::optional<MasterMoldSummary> summary_;
  std::map<std::string, bool> pieceVisibility_;
  std::optional<std::string> lastError_;
  std::optional<MasterMoldSeedIdentity> seedIdentity_;
  std::optional<Pending> pending_;
};

}  // namespace craft
