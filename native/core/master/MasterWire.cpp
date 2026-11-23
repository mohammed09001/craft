#include "master/MasterWire.h"

#include <string>

#include "wire/Wire.h"

namespace craft::wire {

namespace {
constexpr std::uint8_t kKindRequest = 1, kKindResult = 2;
}  // namespace
// --- seed ----------------------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterSeedSourceMesh& v) { io(a, v.modelId); io(a, v.positions); io(a, v.indices); io(a, v.bounds); io(a, v.geometryVersion); }
template <class A> void visit(A& a, MasterCastingProcessProfile& v) {
  io(a, v.profileId); io(a, v.flexibleCastTarget); io(a, v.reusableToolingPreferred); io(a, v.shrinkCompensationMmPerMm);
  io(a, v.minimumToolingWallMm); io(a, v.releaseClearanceMm); io(a, v.maximumToolingPieceCount); io(a, v.ventRequirementPolicy);
  io(a, v.maximumWorkingMoldPieceCount); io(a, v.sacrificialToolingPermitted);
}
template <class A> void visit(A& a, MasterPlanningPreferences& v) { io(a, v.preferredMaximumWorkingMoldPieces); }
template <class A> void visit(A& a, MasterSeedSnapshot& v) {
  io(a, v.schemaVersion); io(a, v.seedId); io(a, v.sourceModelId); io(a, v.sourceGeometryVersion); io(a, v.sourceMesh);
  io(a, v.sourceTransform); io(a, v.sourceBounds); io(a, v.printerBuildVolume); io(a, v.processProfile); io(a, v.userPreferences);
  io(a, v.sourceProjectRevision);
}

// --- tooling set -----------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterPourFaceCandidate& v) {
  io(a, v.direction); io(a, v.source); io(a, v.exposedOpeningAreaMm2); io(a, v.castingDepthMm); io(a, v.valid); io(a, v.rejectionReason); io(a, v.score);
}
template <class A> void visit(A& a, MasterVentRecommendation& v) { io(a, v.recommendationId); io(a, v.pocketIndex); io(a, v.pocketPosition); io(a, v.message); }
template <class A> void visit(A& a, MasterVentFeature& v) { io(a, v.featureId); io(a, v.start); io(a, v.end); io(a, v.radiusMm); io(a, v.proof); }
template <class A> void visit(A& a, MasterVentPlan& v) { io(a, v.status); io(a, v.features); io(a, v.unresolvedRecommendations); }
template <class A> void visit(A& a, MasterPourFaceDecision& v) {
  io(a, v.selected); io(a, v.castingOrientation); io(a, v.score); io(a, v.candidates); io(a, v.fillabilityWarnings); io(a, v.ventPlan);
}
template <class A> void visit(A& a, MasterReleaseDirection& v) { io(a, v.direction); io(a, v.accessibilityFraction); io(a, v.undercutAreaMm2); }
template <class A> void visit(A& a, MasterSurfaceAccessibility& v) { io(a, v.directions); io(a, v.onePieceReleaseFeasible); }
template <class A> void visit(A& a, MasterPartingSurface& v) { io(a, v.kind); io(a, v.axis); io(a, v.coordinateMm); io(a, v.planeNormal); io(a, v.origin); }
template <class A> void visit(A& a, MasterToolingPiece& v) {
  io(a, v.pieceId); io(a, v.name); io(a, v.mesh); io(a, v.bounds); io(a, v.volumeMm3); io(a, v.triangleCount); io(a, v.watertight); io(a, v.manifold);
  io(a, v.releaseDirection); io(a, v.regions); io(a, v.toolingRegistrationFeatureIds); io(a, v.fitsBuildVolume); io(a, v.directionVector);
}
template <class A> void visit(A& a, MasterReleaseStep& v) {
  io(a, v.stepIndex); io(a, v.pieceId); io(a, v.direction); io(a, v.clearanceDistanceMm); io(a, v.collisionVerified); io(a, v.directionVector);
}
template <class A> void visit(A& a, MasterToolingRegistrationFeature& v) { io(a, v.featureId); io(a, v.kind); io(a, v.malePieceId); io(a, v.femalePieceId); }
template <class A> void visit(A& a, MasterToolingAssembly& v) { io(a, v.pieces); io(a, v.registrationFeatures); io(a, v.coreMode); io(a, v.releaseSequence); }
template <class A> void visit(A& a, MasterToolingSet& v) {
  io(a, v.moldPartId); io(a, v.moldPartName); io(a, v.castTargetVersion); io(a, v.sourceSignature); io(a, v.pourFaceDecision); io(a, v.accessibility);
  io(a, v.releaseMode); io(a, v.partingSurfaces); io(a, v.assembly); io(a, v.warnings); io(a, v.fingerprint);
}

// --- working mold plan -----------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, WorkingMoldPieceTarget& v) {
  io(a, v.pieceId); io(a, v.name); io(a, v.mesh); io(a, v.bounds); io(a, v.volumeMm3); io(a, v.geometryVersion); io(a, v.assignedDirection);
  io(a, v.directionId); io(a, v.releaseOrder); io(a, v.interfaceIds); io(a, v.triangleCount); io(a, v.watertight); io(a, v.manifold);
}
template <class A> void visit(A& a, WorkingMoldPartingInterface& v) {
  io(a, v.interfaceId); io(a, v.pieceAIndex); io(a, v.pieceBIndex); io(a, v.samplePoints); io(a, v.kind); io(a, v.selfIntersecting);
}
template <class A> void visit(A& a, WorkingMoldReleaseStep& v) { io(a, v.stepIndex); io(a, v.pieceIndex); io(a, v.direction); io(a, v.clearanceDistanceMm); io(a, v.collisionVerified); }
template <class A> void visit(A& a, WorkingMoldRegistrationFeature& v) {
  io(a, v.featureId); io(a, v.interfaceId); io(a, v.kind); io(a, v.malePieceIndex); io(a, v.femalePieceIndex); io(a, v.position); io(a, v.direction);
}
template <class A> void visit(A& a, WorkingMoldRegistrationPlan& v) { io(a, v.features); io(a, v.reason); }
template <class A> void visit(A& a, PlanningWarning& v) { io(a, v.code); io(a, v.message); io(a, v.pieceIndex); }
template <class A> void visit(A& a, WorkingMoldPlanScore& v) { io(a, v.slidingWallAreaMm2); io(a, v.seamCrossingCount); io(a, v.areaImbalance); io(a, v.interfaceCount); io(a, v.total); }
template <class A> void visit(A& a, RejectedPieceCount& v) { io(a, v.pieceCount); io(a, v.reason); }
template <class A> void visit(A& a, AutoWorkingMoldPlan& v) {
  io(a, v.sourceGeometryVersion); io(a, v.moldPieces); io(a, v.partingInterfaces); io(a, v.releaseSequence); io(a, v.registrationPlan);
  io(a, v.warnings); io(a, v.score); io(a, v.rejectedPieceCounts);
}

// --- request and result ------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterMoldBudgetLineItem& v) { io(a, v.name); io(a, v.limit); io(a, v.used); io(a, v.pruned); io(a, v.reason); }
template <class A> void visit(A& a, MasterMoldBudgetReport& v) {
  io(a, v.candidateDirectionCount); io(a, v.planningPatchCount); io(a, v.workingMoldPlanCandidateCount); io(a, v.workingMoldConstructionAttempts);
  io(a, v.pourFaceAnalysisAttempts); io(a, v.ventAnalysisAttempts); io(a, v.toolingOnePieceAttempts); io(a, v.toolingMultiPieceAttempts);
  io(a, v.toolingExactPlanAttempts); io(a, v.releaseVerificationAttempts); io(a, v.limitsExceeded); io(a, v.budgetDetails);
}
template <class A> void visit(A& a, MasterToolingSetState& v) {
  io(a, v.moldPartId); io(a, v.moldPartName); io(a, v.status); io(a, v.sourceSignature); io(a, v.contentVersion); io(a, v.set);
  io(a, v.failureMessage); io(a, v.failureFamily);
}
template <class A> void visit(A& a, MasterMoldRequest& v) { io(a, v.operationId); io(a, v.generationVersion); io(a, v.seed); io(a, v.priorSets); }
template <class A> void visit(A& a, MasterMoldResult& v) {
  io(a, v.operationId); io(a, v.generationVersion); io(a, v.elapsedMs); io(a, v.sets); io(a, v.plan); io(a, v.workingMoldPieceCount);
  io(a, v.warningCount); io(a, v.budget); io(a, v.seedId); io(a, v.unportedPathsReached); io(a, v.unportedPaths);
}


}  // namespace craft::wire

namespace craft {

std::vector<std::uint8_t> encodeMasterMoldRequest(const MasterMoldRequest& request) { return wire::encode(wire::kKindRequest, request); }
MasterMoldRequest decodeMasterMoldRequest(std::span<const std::uint8_t> bytes) { return wire::decode<MasterMoldRequest>(wire::kKindRequest, bytes); }
std::vector<std::uint8_t> encodeMasterMoldResult(const MasterMoldResult& result) { return wire::encode(wire::kKindResult, result); }
MasterMoldResult decodeMasterMoldResult(std::span<const std::uint8_t> bytes) { return wire::decode<MasterMoldResult>(wire::kKindResult, bytes); }

}  // namespace craft