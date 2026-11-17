#include "master/MasterMoldStore.h"

#include <algorithm>

#include "master/MasterPlanning.h"

namespace craft {

// --- derivations ------------------------------------------------------------------------------------------------------------

std::string masterMoldPieceKey(const std::string& moldPartId, const std::string& pieceId) { return moldPartId + ":" + pieceId; }

bool hasRenderableToolingGeometry(const std::vector<MasterToolingSetState>& sets) {
  return std::any_of(sets.begin(), sets.end(), [](const auto& e) { return e.set && !e.set->assembly.pieces.empty(); });
}

std::string overallStatusOfSets(const std::vector<MasterToolingSetState>& sets) {
  if (sets.empty()) return "unavailable";
  if (std::any_of(sets.begin(), sets.end(), [](const auto& s) { return s.status == "stale"; })) return "stale";
  return std::any_of(sets.begin(), sets.end(), [](const auto& s) { return s.status == "blocked"; }) ? "blocked" : "current";
}

MasterMoldSummary summarizeGeneration(const std::vector<MasterToolingSetState>& sets, int workingMoldPieceCount, int warningCount) {
  MasterMoldSummary s;
  s.workingMoldPieceCount = workingMoldPieceCount;
  s.warningCount = warningCount;
  int valid = 0;
  bool allVerified = true;
  for (const auto& entry : sets) {
    if (!entry.set) continue;
    ++valid;
    s.masterToolingPieceCount += static_cast<int>(entry.set->assembly.pieces.size());
    if (entry.set->releaseMode == "one-piece") ++s.onePieceCases;
    if (entry.set->releaseMode == "multi-piece") ++s.multiPieceCases;
    const auto& seq = entry.set->assembly.releaseSequence;
    const bool verified = seq.size() == entry.set->assembly.pieces.size() &&
                          std::all_of(seq.begin(), seq.end(), [](const auto& step) { return step.collisionVerified; });
    allVerified = allVerified && verified;
  }
  s.allReleasesVerified = valid > 0 && allVerified;
  return s;
}

namespace {
std::vector<std::string> blockedMessagesOf(const std::vector<MasterToolingSetState>& sets) {
  std::vector<std::string> out;
  for (const auto& entry : sets) {
    if (entry.status != "blocked") continue;
    if (entry.failureMessage) out.push_back(*entry.failureMessage);
    else if (entry.set && !entry.set->warnings.empty()) out.push_back(entry.set->warnings.front());
    else out.push_back("tooling could not be generated.");
  }
  return out;
}
}  // namespace

MasterMoldUiState deriveMasterMoldUiState(const std::string& status, const std::vector<MasterToolingSetState>& sets, const std::optional<std::string>& lastError) {
  MasterMoldUiState state;
  if (status == "generating") { state.kind = "generating"; return state; }
  if (status == "error") { state.kind = "error"; state.message = lastError; return state; }
  if (status == "unavailable") { state.kind = "idle"; return state; }
  if (status == "stale") { state.kind = "stale"; return state; }
  state.blockedMessages = blockedMessagesOf(sets);
  state.validSetCount = static_cast<int>(std::count_if(sets.begin(), sets.end(), [](const auto& e) { return e.set && !e.set->assembly.pieces.empty(); }));
  if (status == "blocked") {
    if (state.validSetCount > 0) {
      state.kind = "partial-success";
      state.blockedSetCount = static_cast<int>(sets.size()) - state.validSetCount;
    } else {
      state.kind = "blocked";
    }
    return state;
  }
  state.kind = state.validSetCount > 0 ? "success" : "blocked";
  return state;
}

std::vector<MasterMoldRenderableBody> selectRenderableMasterMoldBodies(const std::vector<MasterToolingSetState>& sets,
                                                                       const std::map<std::string, bool>& pieceVisibility) {
  std::vector<MasterMoldRenderableBody> bodies;
  for (const auto& entry : sets) {
    if (!(entry.status == "current" || entry.status == "stale") || !entry.set) continue;
    for (const MasterToolingPiece& piece : entry.set->assembly.pieces) {
      const std::string key = masterMoldPieceKey(entry.moldPartId, piece.pieceId);
      const auto it = pieceVisibility.find(key);
      MasterMoldRenderableBody body;
      body.id = key;
      body.name = piece.name;
      body.visible = it == pieceVisibility.end() || it->second;
      body.bounds = piece.bounds;
      body.triangleCount = piece.triangleCount;
      body.volumeMm3 = piece.volumeMm3;
      body.mesh = &piece.mesh;
      body.stale = entry.status == "stale";
      body.geometryIdentity = entry.set->fingerprint + ":" + piece.pieceId;
      bodies.push_back(std::move(body));
    }
  }
  return bodies;
}

// --- worker-side evaluation ---------------------------------------------------------------------------------------------------

MasterMoldResult mapEngineResult(const MasterMoldRequest& request, const MasterMoldEngineResult& engineResult) {
  MasterMoldResult result;
  result.operationId = request.operationId;
  result.generationVersion = request.generationVersion;
  result.elapsedMs = engineResult.elapsedMs;
  result.plan = engineResult.plan;
  result.workingMoldPieceCount = engineResult.plan ? static_cast<int>(engineResult.plan->moldPieces.size()) : 0;
  result.warningCount = engineResult.plan ? static_cast<int>(engineResult.plan->warnings.size()) : 0;
  result.budget = engineResult.budget;
  result.seedId = request.seed.seedId;
  result.unportedPathsReached = engineResult.unportedPathsReached;
  result.unportedPaths = engineResult.unportedPaths;

  for (const MasterToolingSet& set : engineResult.toolingSets) {
    const bool sacrificial = set.releaseMode == "sacrificial-recommended";
    MasterToolingSetState state;
    state.moldPartId = set.moldPartId;
    state.moldPartName = set.moldPartName;
    state.status = sacrificial ? "blocked" : "current";
    state.sourceSignature = set.sourceSignature;
    state.contentVersion = set.castTargetVersion;
    state.set = set;
    if (sacrificial) {
      std::string message = "no reusable tooling plan.";
      const auto it = std::find_if(set.warnings.begin(), set.warnings.end(), [](const auto& w) { return w.find("reusable_plan_not_found") != std::string::npos; });
      if (it != set.warnings.end()) message = *it;
      else if (!set.warnings.empty()) message = set.warnings.front();
      state.failureMessage = message;
    }
    result.sets.push_back(std::move(state));
  }
  for (const MasterMoldFailure& failure : engineResult.failures) {
    if (std::any_of(result.sets.begin(), result.sets.end(), [&](const auto& s) { return s.moldPartId == failure.moldPartId; })) continue;
    MasterToolingSetState state;
    state.moldPartId = failure.moldPartId;
    state.moldPartName = failure.moldPartId;
    state.status = "blocked";
    state.failureMessage = failure.message;
    state.failureFamily = failure.family;
    result.sets.push_back(std::move(state));
  }
  return result;
}

MasterMoldResult evaluateMasterMoldGeneration(IMeshGeometryEngine& engine, const MasterMoldRequest& request, const MasterMoldEngineHooks& hooks) {
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
  const MasterMoldEngineResult engineResult = runMasterMoldEngine(engine, worldMeshFromSnapshot(request.seed), request.priorSets, hooks);
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
  return mapEngineResult(request, engineResult);
}

// --- store ------------------------------------------------------------------------------------------------------------------------------

namespace {
/// Reused sets shed any prior `stale` overlay: a fresh generate() re-validates against the live inputs.
MasterToolingSetState reviveEntry(MasterToolingSetState entry) {
  if (entry.status != "stale") return entry;
  entry.status = entry.set ? "current" : "blocked";
  return entry;
}
}  // namespace

void MasterMoldStore::setParameters(std::optional<double> wall, std::optional<double> bottom) {
  if (wall) parameters_.wallThicknessMm = *wall;
  if (bottom) parameters_.bottomThicknessMm = *bottom;
}

void MasterMoldStore::reset() {
  status_ = "unavailable";
  // A new version even though no new generation starts: an in-flight run holds the prior version and trusts its result only
  // while the version still matches.
  generationVersion_ += 1;
  sets_.clear();
  plan_.reset();
  progressStage_.reset();
  summary_.reset();
  pieceVisibility_.clear();
  lastError_.reset();
  seedIdentity_.reset();
  pending_.reset();
}

void MasterMoldStore::markMasterMoldStale(const MasterMoldSeedIdentity& identity) {
  if (!seedIdentity_) return;
  if (seedIdentity_->identity == identity.identity) return;
  if (status_ == "stale" && std::all_of(sets_.begin(), sets_.end(), [](const auto& s) { return s.status == "stale"; })) return;
  generationVersion_ += 1;
  status_ = "stale";
  for (auto& entry : sets_) entry.status = "stale";
}

void MasterMoldStore::reportGenerationFailure(const std::string& message) {
  status_ = "error";
  lastError_ = message;
  progressStage_.reset();
}

void MasterMoldStore::togglePieceVisibility(const std::string& pieceKey) {
  const auto it = pieceVisibility_.find(pieceKey);
  const bool currentlyHidden = it != pieceVisibility_.end() && !it->second;
  pieceVisibility_[pieceKey] = currentlyHidden;  // hidden -> visible; visible/unset -> hidden
}

void MasterMoldStore::isolateToolingSet(const std::string& moldPartId) {
  std::map<std::string, bool> visibility;
  for (const auto& entry : sets_) {
    if (!entry.set) continue;
    for (const auto& piece : entry.set->assembly.pieces) visibility[masterMoldPieceKey(entry.moldPartId, piece.pieceId)] = entry.moldPartId == moldPartId;
  }
  pieceVisibility_ = std::move(visibility);
}

void MasterMoldStore::showAllPieces() { pieceVisibility_.clear(); }

MasterMoldGenerateStart MasterMoldStore::beginGenerate(const MasterSeedSnapshot& seed, const std::optional<std::string>& liveIdentity) {
  const int generationVersion = generationVersion_ + 1;
  const MasterMoldSeedIdentity identity{masterSeedStalenessIdentity(seed.sourceGeometryVersion, seed.printerBuildVolume, seed.processProfile, seed.userPreferences),
                                        seed.sourceProjectRevision};
  MasterMoldGenerateStart start;
  start.generationVersion = generationVersion;

  if (seedIdentity_ && seedIdentity_->identity == identity.identity && !sets_.empty()) {
    const bool superseded = liveIdentity && *liveIdentity != identity.identity;
    std::vector<MasterToolingSetState> reused;
    for (const auto& e : sets_) reused.push_back(reviveEntry(e));
    generationVersion_ = generationVersion;
    status_ = superseded ? "stale" : overallStatusOfSets(reused);
    if (superseded) for (auto& e : reused) e.status = "stale";
    sets_ = std::move(reused);
    progressStage_.reset();
    lastError_.reset();
    seedIdentity_ = identity;
    start.reused = true;
    return start;
  }

  Pending pending;
  pending.generationVersion = generationVersion;
  pending.identity = identity;
  pending.before = sets_;
  pending_ = std::move(pending);

  status_ = "generating";
  generationVersion_ = generationVersion;
  progressStage_.reset();
  lastError_.reset();

  MasterMoldRequest request;
  request.operationId = "master-mold:" + std::to_string(generationVersion);
  request.generationVersion = generationVersion;
  request.seed = seed;
  for (const auto& e : pending_->before) if (e.set) request.priorSets.push_back(*e.set);
  start.request = std::move(request);
  return start;
}

void MasterMoldStore::setProgress(int generationVersion, const MasterMoldProgressStage& stage) {
  if (generationVersion_ == generationVersion) progressStage_ = stage;
}

bool MasterMoldStore::commitGeneration(int generationVersion, MasterMoldResult result, const std::optional<std::string>& liveIdentityAtCommit) {
  if (generationVersion_ != generationVersion || !pending_ || pending_->generationVersion != generationVersion) return false;
  const Pending pending = *pending_;
  pending_.reset();

  std::vector<MasterToolingSetState> sets;
  for (const auto& entry : result.sets) {
    const auto prior = std::find_if(pending.before.begin(), pending.before.end(), [&](const auto& c) { return c.moldPartId == entry.moldPartId; });
    if (prior != pending.before.end() && prior->status == "current" && prior->sourceSignature == entry.sourceSignature &&
        prior->contentVersion == entry.contentVersion && prior->set && entry.set && prior->set->fingerprint == entry.set->fingerprint) {
      sets.push_back(reviveEntry(*prior));
    } else {
      sets.push_back(reviveEntry(entry));
    }
  }
  const bool superseded = liveIdentityAtCommit && *liveIdentityAtCommit != pending.identity.identity;
  std::vector<MasterToolingSetState> committed = sets;
  if (superseded) for (auto& e : committed) e.status = "stale";

  status_ = superseded ? "stale" : overallStatusOfSets(sets);
  generationVersion_ = generationVersion;
  summary_ = summarizeGeneration(sets, result.workingMoldPieceCount, result.warningCount);
  sets_ = std::move(committed);
  plan_ = std::move(result.plan);
  progressStage_.reset();
  lastError_.reset();
  seedIdentity_ = pending.identity;
  return true;
}

bool MasterMoldStore::failGeneration(int generationVersion, const std::string& message) {
  if (generationVersion_ != generationVersion) return false;
  pending_.reset();
  status_ = "error";
  lastError_ = message;
  progressStage_.reset();
  return true;
}

}  // namespace craft
