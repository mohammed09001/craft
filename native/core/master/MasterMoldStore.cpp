#include "master/MasterMoldStore.h"

#include <algorithm>

#include "master/MasterPlanning.h"

namespace craft {

// --- derivations ------------------------------------------------------------------------------------------------------------

std::string masterBodyKey(MasterToolId id) { return id == MasterToolId::A ? "master-a" : "master-b"; }
std::string halfBodyKey(MasterToolId id) { return id == MasterToolId::A ? "half-a" : "half-b"; }

bool masterBodyDefaultVisible(const std::string& key) { return key.rfind("half-", 0) != 0; }

MasterMoldUiState deriveMasterMoldUiState(const std::string& status, const std::optional<MasterFailure>& failure, const std::optional<std::string>& lastError) {
  MasterMoldUiState state;
  if (status == "generating") { state.kind = "generating"; return state; }
  if (status == "error") { state.kind = "error"; state.message = lastError; return state; }
  if (status == "unavailable") { state.kind = "idle"; return state; }
  if (status == "stale") { state.kind = "stale"; return state; }
  if (status == "blocked") {
    state.kind = "blocked";
    if (failure) state.message = failure->message;
    return state;
  }
  state.kind = "success";
  return state;
}

std::vector<MasterMoldRenderableBody> selectRenderableMasterMoldBodies(const std::string& status, const MasterMoldPlan* plan, const std::map<std::string, bool>& visibility) {
  std::vector<MasterMoldRenderableBody> bodies;
  if (!plan || !(status == "current" || status == "stale")) return bodies;
  const auto visibleOf = [&](const std::string& key) {
    const auto it = visibility.find(key);
    return it == visibility.end() ? masterBodyDefaultVisible(key) : it->second;
  };
  for (const MasterTool& tool : plan->masters) {
    MasterMoldRenderableBody b;
    b.id = masterBodyKey(tool.id);
    b.set = kMasterSetMasters;
    b.name = tool.name;
    b.visible = visibleOf(b.id);
    b.bounds = tool.facts.bounds;
    b.triangleCount = tool.facts.triangleCount;
    b.volumeMm3 = tool.facts.volumeMm3;
    b.mesh = &tool.mesh;
    b.stale = status == "stale";
    b.inPrintFrame = true;
    b.geometryIdentity = plan->fingerprint + ":" + b.id;
    bodies.push_back(std::move(b));
  }
  for (const VirtualWorkingHalf& half : plan->halves) {
    MasterMoldRenderableBody b;
    b.id = halfBodyKey(half.id);
    b.set = kMasterSetHalves;
    b.name = half.name + " (virtual)";
    b.visible = visibleOf(b.id);
    b.bounds = half.facts.bounds;
    b.triangleCount = half.facts.triangleCount;
    b.volumeMm3 = half.facts.volumeMm3;
    b.mesh = &half.mesh;
    b.stale = status == "stale";
    b.inPrintFrame = false;
    b.geometryIdentity = plan->fingerprint + ":" + b.id;
    bodies.push_back(std::move(b));
  }
  return bodies;
}

// --- worker-side evaluation ---------------------------------------------------------------------------------------------------

MasterMoldResult evaluateMasterMoldGeneration(IMeshGeometryEngine& engine, const MasterMoldRequest& request, const MasterMoldEngineHooks& hooks) {
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
  MasterMoldOutcome outcome = runMasterMoldEngine(engine, worldMeshFromSnapshot(request.seed), hooks);
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
  return {request.operationId, request.generationVersion, std::move(outcome)};
}

// --- store ------------------------------------------------------------------------------------------------------------------------------

bool MasterMoldStore::visible(const std::string& key) const {
  const auto it = visibility_.find(key);
  return it == visibility_.end() ? masterBodyDefaultVisible(key) : it->second;
}

void MasterMoldStore::reset() {
  status_ = "unavailable";
  // A new version even though no new generation starts: an in-flight run holds the prior version and trusts its result only while the version still matches.
  generationVersion_ += 1;
  plan_.reset();
  failure_.reset();
  progressStage_.reset();
  summary_.reset();
  visibility_.clear();
  lastError_.reset();
  seedIdentity_.reset();
  pending_.reset();
}

void MasterMoldStore::markMasterMoldStale(const MasterMoldSeedIdentity& identity) {
  if (!seedIdentity_) return;
  if (seedIdentity_->identity == identity.identity) return;
  if (status_ == "stale") return;
  generationVersion_ += 1;
  status_ = "stale";  // a result is kept (ghosted, never exportable); a failure of the old inputs says nothing about the new ones
  failure_.reset();
}

void MasterMoldStore::reportGenerationFailure(const std::string& message) {
  status_ = "error";
  lastError_ = message;
  plan_.reset();
  failure_.reset();
  summary_.reset();
  progressStage_.reset();
}

void MasterMoldStore::togglePieceVisibility(const std::string& key) { visibility_[key] = !visible(key); }

void MasterMoldStore::isolateSet(const std::string& setId) {
  visibility_.clear();
  for (const std::string& key : {masterBodyKey(MasterToolId::A), masterBodyKey(MasterToolId::B)}) visibility_[key] = setId == kMasterSetMasters;
  for (const std::string& key : {halfBodyKey(MasterToolId::A), halfBodyKey(MasterToolId::B)}) visibility_[key] = setId == kMasterSetHalves;
}

void MasterMoldStore::showAllPieces() {
  visibility_.clear();
  for (const std::string& key : {masterBodyKey(MasterToolId::A), masterBodyKey(MasterToolId::B), halfBodyKey(MasterToolId::A), halfBodyKey(MasterToolId::B)}) visibility_[key] = true;
}

MasterMoldGenerateStart MasterMoldStore::beginGenerate(const MasterSeedSnapshot& seed, const std::optional<std::string>& liveIdentity) {
  const int generationVersion = generationVersion_ + 1;
  const MasterMoldSeedIdentity identity{masterSeedStalenessIdentity(seed.sourceGeometryVersion, seed.printerBuildVolume, seed.processProfile), seed.sourceProjectRevision};
  MasterMoldGenerateStart start;
  start.generationVersion = generationVersion;

  // Only a successful, current result of the very same inputs is reused: the engine is deterministic, so rerunning it cannot change that answer.
  if (seedIdentity_ && seedIdentity_->identity == identity.identity && plan_ && (status_ == "current" || status_ == "stale")) {
    const bool superseded = liveIdentity && *liveIdentity != identity.identity;
    generationVersion_ = generationVersion;
    status_ = superseded ? "stale" : "current";
    progressStage_.reset();
    lastError_.reset();
    seedIdentity_ = identity;
    start.reused = true;
    return start;
  }

  pending_ = Pending{generationVersion, identity};
  status_ = "generating";
  generationVersion_ = generationVersion;
  progressStage_.reset();
  lastError_.reset();

  MasterMoldRequest request;
  request.operationId = "master-mold:" + std::to_string(generationVersion);
  request.generationVersion = generationVersion;
  request.seed = seed;
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

  const bool superseded = liveIdentityAtCommit && *liveIdentityAtCommit != pending.identity.identity;
  progressStage_.reset();
  lastError_.reset();
  seedIdentity_ = pending.identity;
  generationVersion_ = generationVersion;
  visibility_.clear();

  if (result.outcome.success() && result.outcome.plan) {
    plan_ = std::make_shared<const MasterMoldPlan>(std::move(*result.outcome.plan));
    failure_.reset();
    MasterMoldSummary s;
    s.masterCount = kMasterToolCount;
    s.warningCount = static_cast<int>(plan_->warnings.size());
    s.allReleasesVerified = std::all_of(plan_->releaseChecks.begin(), plan_->releaseChecks.end(), [](const MasterReleaseCheck& c) { return c.verification == MasterVerification::Verified; });
    for (const MasterTool& t : plan_->masters) s.totalFillVolumeMm3 += t.fillVolumeMm3;
    s.elapsedMs = result.outcome.elapsedMs;
    summary_ = s;
    status_ = superseded ? "stale" : "current";
    return true;
  }
  // A failure never leaves an earlier result behind.
  plan_.reset();
  summary_.reset();
  failure_ = result.outcome.failure.value_or(MasterFailure{MasterOutcomeCode::InternalError, MasterReleaseStage::None, "the Master Mold run returned neither a plan nor a failure.", {}});
  status_ = superseded ? "stale" : "blocked";
  return true;
}

bool MasterMoldStore::failGeneration(int generationVersion, const std::string& message) {
  if (generationVersion_ != generationVersion) return false;
  pending_.reset();
  status_ = "error";
  lastError_ = message;
  plan_.reset();
  failure_.reset();
  summary_.reset();
  progressStage_.reset();
  return true;
}

}  // namespace craft
