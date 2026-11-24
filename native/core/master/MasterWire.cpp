#include "master/MasterWire.h"

#include <string>

#include "wire/Wire.h"

namespace craft::wire {

namespace {
constexpr std::uint8_t kKindRequest = 1, kKindResult = 2, kKindOutcome = 3;
}  // namespace

// --- seed ----------------------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterSeedSourceMesh& v) { io(a, v.modelId); io(a, v.positions); io(a, v.indices); io(a, v.bounds); io(a, v.geometryVersion); }
template <class A> void visit(A& a, MasterProcessProfile& v) {
  io(a, v.profileId); io(a, v.workingWallMm); io(a, v.sprueRadiusMm); io(a, v.masterWallMm); io(a, v.masterBaseMm); io(a, v.freeboardMm); io(a, v.keyRadiusMm);
  io(a, v.keyHeightMm); io(a, v.keyClearanceMm); io(a, v.slidingSine); io(a, v.blockedVolumeMm3); io(a, v.clearVolumeMm3); io(a, v.wasteMargin);
  io(a, v.workingMoldDensityGPerCm3); io(a, v.fidelityToleranceMm); io(a, v.maxConstructedCandidates); io(a, v.maxSweepPrisms); io(a, v.maxCurvedAxes); io(a, v.curvedSeamResolutions); io(a, v.coverageResolution); io(a, v.coverageDirections);
}
template <class A> void visit(A& a, MasterSeedSnapshot& v) {
  io(a, v.schemaVersion); io(a, v.seedId); io(a, v.sourceModelId); io(a, v.sourceGeometryVersion); io(a, v.sourceMesh);
  io(a, v.sourceTransform); io(a, v.sourceBounds); io(a, v.printerBuildVolume); io(a, v.processProfile); io(a, v.sourceProjectRevision);
}

// --- two-master contract -------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterReleaseCheck& v) { io(a, v.stage); io(a, v.subject); io(a, v.verification); io(a, v.direction); io(a, v.marginMm); io(a, v.method); io(a, v.note); }
template <class A> void visit(A& a, MasterBodyFacts& v) { io(a, v.triangleCount); io(a, v.componentCount); io(a, v.watertight); io(a, v.manifold); io(a, v.volumeMm3); io(a, v.bounds); }
template <class A> void visit(A& a, MasterTool& v) {
  io(a, v.id); io(a, v.name); io(a, v.mesh); io(a, v.facts); io(a, v.printFromModel); io(a, v.pourDirection); io(a, v.fillVolumeMm3);
  io(a, v.minimumWallMm); io(a, v.registrationFeatureIds); io(a, v.ventFeatureIds);
}
template <class A> void visit(A& a, VirtualWorkingHalf& v) { io(a, v.id); io(a, v.name); io(a, v.mesh); io(a, v.facts); io(a, v.releaseDirection); }
template <class A> void visit(A& a, MasterSeam& v) { io(a, v.kind); io(a, v.pullAxis); io(a, v.planeOffsetMm); io(a, v.description); }
template <class A> void visit(A& a, MasterMaterialEstimate& v) { io(a, v.id); io(a, v.fillVolumeMm3); io(a, v.wasteMargin); io(a, v.volumeWithWasteMm3); io(a, v.densityGPerCm3); io(a, v.massG); }
template <class A> void visit(A& a, MasterFidelity& v) { io(a, v.toleranceMm); io(a, v.maxDeviationMm); io(a, v.measured); io(a, v.method); }
template <class A> void visit(A& a, MasterMoldPlan& v) {
  io(a, v.contractVersion); io(a, v.sourceGeometryVersion); io(a, v.masters); io(a, v.halves); io(a, v.seam); io(a, v.releaseChecks);
  io(a, v.materials); io(a, v.fidelity); io(a, v.warnings); io(a, v.residualUncertainty); io(a, v.fingerprint);
}
template <class A> void visit(A& a, MasterFailure& v) { io(a, v.code); io(a, v.stage); io(a, v.message); io(a, v.diagnostics); }
template <class A> void visit(A& a, MasterMoldOutcome& v) { io(a, v.code); io(a, v.plan); io(a, v.failure); io(a, v.elapsedMs); }

// --- request and result ------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterMoldRequest& v) { io(a, v.operationId); io(a, v.generationVersion); io(a, v.seed); }
template <class A> void visit(A& a, MasterMoldResult& v) { io(a, v.operationId); io(a, v.generationVersion); io(a, v.outcome); }

}  // namespace craft::wire

namespace craft {

namespace {
/// Bytes never promote a plan to success: a decoded success must still satisfy the contract.
void requireConsistent(const MasterMoldOutcome& outcome) {
  if (outcome.code == MasterOutcomeCode::Success) {
    if (!outcome.plan || outcome.failure || !validateMasterPlan(*outcome.plan).empty()) throw WireError("A Master Mold outcome claims success without a valid plan.");
  } else if (outcome.plan || !outcome.failure) {
    throw WireError("A Master Mold failure outcome is inconsistent.");
  }
}
}  // namespace

std::vector<std::uint8_t> encodeMasterMoldRequest(const MasterMoldRequest& request) { return wire::encode(wire::kKindRequest, request); }
MasterMoldRequest decodeMasterMoldRequest(std::span<const std::uint8_t> bytes) { return wire::decode<MasterMoldRequest>(wire::kKindRequest, bytes); }
std::vector<std::uint8_t> encodeMasterMoldResult(const MasterMoldResult& result) { return wire::encode(wire::kKindResult, result); }
MasterMoldResult decodeMasterMoldResult(std::span<const std::uint8_t> bytes) {
  MasterMoldResult result = wire::decode<MasterMoldResult>(wire::kKindResult, bytes);
  requireConsistent(result.outcome);
  return result;
}
std::vector<std::uint8_t> encodeMasterMoldOutcome(const MasterMoldOutcome& outcome) { return wire::encode(wire::kKindOutcome, outcome); }
MasterMoldOutcome decodeMasterMoldOutcome(std::span<const std::uint8_t> bytes) {
  MasterMoldOutcome outcome = wire::decode<MasterMoldOutcome>(wire::kKindOutcome, bytes);
  requireConsistent(outcome);
  return outcome;
}

}  // namespace craft
