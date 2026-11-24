#pragma once

// Master Mold product state: the store state machine, the worker-side evaluation, the shared UI-state derivation and the renderable-body selection.
// Qt-free: the app layer owns threading, the timeout and the viewport.
//
// The store holds one thing: the outcome of the last generation. A success is exactly two printable masters (A, B) and two virtual working halves;
// a failure is a structured MasterFailure. A failed or reset run never leaves an earlier result behind, and a result whose inputs changed is "stale":
// still drawn (ghosted) but never exportable.

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "master/MasterContract.h"
#include "master/MasterEngine.h"

namespace craft {

/// Store-level ids. A "set" is a group of bodies the panel lists and can isolate.
inline constexpr const char* kMasterSetMasters = "masters";
inline constexpr const char* kMasterSetHalves = "halves";
std::string masterBodyKey(MasterToolId id);   // "master-a" / "master-b"
std::string halfBodyKey(MasterToolId id);     // "half-a" / "half-b"

struct MasterMoldRequest {
  std::string operationId;
  int generationVersion = 0;
  MasterSeedSnapshot seed;  // local-space geometry + transform; the evaluation applies the world transform
};

struct MasterMoldResult {
  std::string operationId;
  int generationVersion = 0;
  MasterMoldOutcome outcome;
};

struct MasterMoldSeedIdentity {
  std::string identity;
  std::string sourceProjectRevision;
};

struct MasterMoldSummary {
  int masterCount = 0;
  int warningCount = 0;
  bool allReleasesVerified = false;
  double totalFillVolumeMm3 = 0;
  double elapsedMs = 0;
};

/// The explicit UI states derived from the store snapshot (one derivation for every consumer).
struct MasterMoldUiState {
  std::string kind;  // idle | generating | success | blocked | error | stale
  std::optional<std::string> message;  // blocked / error text
};

struct MasterMoldRenderableBody {
  std::string id;  // body key
  std::string set; // kMasterSetMasters | kMasterSetHalves
  std::string name;
  bool visible = true;
  Bounds3 bounds;
  int triangleCount = 0;
  double volumeMm3 = 0;
  const MeshPayload* mesh = nullptr;  // owned by the store's plan; valid until the store changes
  bool stale = false;
  bool inPrintFrame = false;           // masters are in their own manufacturing frames and need a display offset; halves are in the model frame
  std::string geometryIdentity;
};

MasterMoldUiState deriveMasterMoldUiState(const std::string& status, const std::optional<MasterFailure>& failure, const std::optional<std::string>& lastError);
std::vector<MasterMoldRenderableBody> selectRenderableMasterMoldBodies(const std::string& status, const MasterMoldPlan* plan, const std::map<std::string, bool>& visibility);
/// Halves are a preview: hidden until the user shows them.
bool masterBodyDefaultVisible(const std::string& key);

/// How much memory generating needs, for refusing the run before it starts when it cannot fit. Measured on the worker process itself (its own report of
/// its peak working set; Release build, Intel Core i7-8550U, 16 GiB, 2026-11-24, the benchmark parts and a flared cup at three sizes):
///   2,640 triangles 190 MiB (a cup: curved seam, small mesh, large halves)   6,400: 49 MiB   7,680: 54 MiB
///   85,200: 341 MiB   160,000: 467 MiB   184,320: 534 MiB   956,000: 3,049 MiB   1,536,000: 4,065 MiB
/// Above 80,000 triangles the peak is about 3.0 to 3.4 KB per triangle plus a small base; below it the part's shape matters more than its size. 256 MiB plus
/// 3.5 KB per triangle covers every measurement (at 956,000 triangles 3.4 GiB against 3.0 GiB measured; the small parts are far below it, as they should be).
inline constexpr std::uint64_t kMasterPeakBytesPerTriangle = 3500;
inline constexpr std::uint64_t kMasterFixedPeakBytes = 256ull * 1024 * 1024;
inline std::uint64_t estimateMasterMoldPeakBytes(std::uint64_t triangleCount) { return kMasterFixedPeakBytes + kMasterPeakBytesPerTriangle * triangleCount; }

/// What the worker does: world transform -> engine -> result. Throws CodedError("cancelled").
MasterMoldResult evaluateMasterMoldGeneration(IMeshGeometryEngine& engine, const MasterMoldRequest& request, const MasterMoldEngineHooks& hooks = {});

// --- store -------------------------------------------------------------------------------------------------------------
struct MasterMoldGenerateStart {
  bool reused = false;  // full-reuse fast path: nothing to run
  int generationVersion = 0;
  std::optional<MasterMoldRequest> request;  // set when a run must start
};

class MasterMoldStore {
 public:
  /// unavailable | generating | current | stale | blocked | error
  const std::string& status() const { return status_; }
  int generationVersion() const { return generationVersion_; }
  const std::shared_ptr<const MasterMoldPlan>& plan() const { return plan_; }
  const std::optional<MasterFailure>& failure() const { return failure_; }
  const std::optional<MasterMoldProgressStage>& progressStage() const { return progressStage_; }
  const std::optional<MasterMoldSummary>& summary() const { return summary_; }
  const std::map<std::string, bool>& visibility() const { return visibility_; }
  const std::optional<std::string>& lastError() const { return lastError_; }
  const std::optional<MasterMoldSeedIdentity>& seedIdentity() const { return seedIdentity_; }
  bool visible(const std::string& key) const;

  void reset();
  void markMasterMoldStale(const MasterMoldSeedIdentity& identity);
  void reportGenerationFailure(const std::string& message);
  void togglePieceVisibility(const std::string& key);
  void isolateSet(const std::string& setId);
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
  };
  std::string status_ = "unavailable";
  int generationVersion_ = 0;
  std::shared_ptr<const MasterMoldPlan> plan_;
  std::optional<MasterFailure> failure_;
  std::optional<MasterMoldProgressStage> progressStage_;
  std::optional<MasterMoldSummary> summary_;
  std::map<std::string, bool> visibility_;
  std::optional<std::string> lastError_;
  std::optional<MasterMoldSeedIdentity> seedIdentity_;
  std::optional<Pending> pending_;
};

}  // namespace craft
