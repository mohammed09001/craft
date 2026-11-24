#include "mold/MoldWire.h"

namespace craft::wire {

namespace {
constexpr std::uint8_t kKindRequest = 3, kKindResult = 4, kKindSegmentationRequest = 5, kKindSegmentationResult = 6, kKindRegistration = 7;
}  // namespace

// --- bodies, planes, definition ---------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MoldBody& v) {
  io(a, v.id); io(a, v.name); io(a, v.visible); io(a, v.bounds); io(a, v.centroid); io(a, v.generationOrder); io(a, v.sourceSelectedFaceSignature);
  io(a, v.triangleCount); io(a, v.volumeMm3); io(a, v.watertight); io(a, v.mesh); io(a, v.geometryVersion); io(a, v.sprueOperationId);
}
template <class A> void visit(A& a, CuttingPlane& v) {
  io(a, v.sourceFace); io(a, v.axis); io(a, v.normal); io(a, v.normalizedPosition); io(a, v.enabled); io(a, v.creationOrder);
}
template <class A> void visit(A& a, CutPlaneData& v) { io(a, v.axis); io(a, v.coordinate); io(a, v.normal); io(a, v.sourceSketchId); io(a, v.sourceFace); io(a, v.order); }
template <class A> void visit(A& a, ReferenceMoldDefinition& v) {
  io(a, v.schemaVersion); io(a, v.definitionId); io(a, v.modelId); io(a, v.partOffset); io(a, v.selectionBoxBounds); io(a, v.clearanceMm);
  io(a, v.referenceMoldBlockBounds); io(a, v.usedFaces); io(a, v.moldBodies); io(a, v.moldBodiesPartitionReferenceBlock); io(a, v.segmentationLineage);
}
template <class A> void visit(A& a, Issue& v) { io(a, v.severity); io(a, v.reasonCode); io(a, v.message); }

// --- cavity ----------------------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, WatertightPartSolid& v) {
  io(a, v.mesh); io(a, v.bounds); io(a, v.volumeMm3); io(a, v.triangleCount); io(a, v.connectedComponentCount); io(a, v.watertight); io(a, v.manifold);
  io(a, v.warnings);
}
template <class A> void visit(A& a, CavityTool& v) { io(a, v.solid); io(a, v.clearanceMm); io(a, v.implementationMethod); io(a, v.qualityMode); }
template <class A> void visit(A& a, CavityBodyValidation& v) {
  io(a, v.bodyId); io(a, v.bodyName); io(a, v.parentBodyId); io(a, v.cavityAffected); io(a, v.finiteGeometry); io(a, v.validBounds); io(a, v.positiveVolume);
  io(a, v.volumeMm3); io(a, v.triangleCount); io(a, v.connectedComponentCount); io(a, v.watertight); io(a, v.manifold); io(a, v.openEdgeCount);
  io(a, v.nonManifoldEdgeCount); io(a, v.minimumWallMm); io(a, v.warnings); io(a, v.reasonCodes);
}
template <class A> void visit(A& a, CavityMoldBody& v) { io(a, v.body); io(a, v.parentBodyId); io(a, v.cavityAffected); io(a, v.validation); }
template <class A> void visit(A& a, CavitySubtractionDiagnostics& v) {
  io(a, v.sourceBodyCount); io(a, v.affectedBodyCount); io(a, v.unaffectedBodyCount); io(a, v.originalVolumeMm3); io(a, v.resultVolumeMm3);
  io(a, v.removedVolumeMm3); io(a, v.cavityToolVolumeMm3);
}
template <class A> void visit(A& a, CavityOffsetAttempt& v) { io(a, v.engine); io(a, v.succeeded); io(a, v.errorMessage); }
template <class A> void visit(A& a, DistanceFieldQualityProfile& v) {
  io(a, v.qualityMode); io(a, v.requestedClearanceMm); io(a, v.targetEdgeLengthMm); io(a, v.effectiveEdgeLengthMm); io(a, v.surfaceToleranceMm);
  io(a, v.maximumAxisCells); io(a, v.boundsPaddingMm); io(a, v.bounds); io(a, v.estimatedGridDimensions); io(a, v.estimatedGridCellCount);
  io(a, v.maximumGridCellCount); io(a, v.exceedsGridBudget);
}
template <class A> void visit(A& a, CavityTimings& v) { io(a, v.validationMs); io(a, v.offsetMs); io(a, v.booleanMs); io(a, v.totalMs); }
template <class A> void visit(A& a, CavityGenerationResult& v) {
  io(a, v.operationId); io(a, v.generationVersion); io(a, v.sourceSignature); io(a, v.implementation); io(a, v.cavityTool); io(a, v.bodies);
  io(a, v.warnings); io(a, v.subtraction); io(a, v.selectedEngine); io(a, v.engineReasonCodes); io(a, v.offsetAttempts); io(a, v.usedFallback);
  io(a, v.hasDistanceFieldProfile); io(a, v.distanceFieldProfile); io(a, v.timings);
}
template <class A> void visit(A& a, MoldGenerationResult& v) { io(a, v.definition); io(a, v.cutPlanes); io(a, v.cuttingPlanes); io(a, v.cavity); io(a, v.validationWarnings); }
template <class A> void visit(A& a, MoldGenerationRequest& v) {
  io(a, v.modelId); io(a, v.partGeometryVersion); io(a, v.groundedPart); io(a, v.moldClearanceMm); io(a, v.cavityClearanceMm); io(a, v.qualityMode);
  io(a, v.segmentedBodies); io(a, v.cuttingPlanes); io(a, v.generationVersion);
}

// --- sprues ----------------------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, SprueProfileDimensions& v) { io(a, v.mainDiameterMm); io(a, v.entryNeckDiameterMm); io(a, v.entryNeckLengthMm); }
template <class A> void visit(A& a, SprueScalarDesign& v) { io(a, v.valueMm); io(a, v.unconstrainedValueMm); io(a, v.source); }
template <class A> void visit(A& a, SprueProfileDesignResult& v) {
  io(a, v.profile); io(a, v.source); io(a, v.mainSection); io(a, v.entryNeckDiameter); io(a, v.entryNeckLength); io(a, v.warnings);
}
template <class A> void visit(A& a, SprueValidation& v) { io(a, v.status); io(a, v.reasonCode); io(a, v.message); }
template <class A> void visit(A& a, SprueOperationDefinition& v) {
  io(a, v.operationId); io(a, v.position); io(a, v.inwardDirection); io(a, v.profileDesign); io(a, v.creationOrder); io(a, v.validation);
}
template <class A> void visit(A& a, SprueTolerancePolicy& v) {
  io(a, v.linearToleranceMm); io(a, v.areaToleranceMm2); io(a, v.volumeToleranceMm3); io(a, v.meaningfulVolumeMm3); io(a, v.surfaceToleranceMm);
  io(a, v.outsideMarginMm); io(a, v.beyondMarginMm);
}
template <class A> void visit(A& a, SprueDefinition& v) {
  io(a, v.operationId); io(a, v.targetBodyIds); io(a, v.position); io(a, v.inwardDirection); io(a, v.profile); io(a, v.depthMm); io(a, v.circularSegments);
  io(a, v.moldFrameId); io(a, v.tolerancePolicy);
}
template <class A> void visit(A& a, SprueFailure& v) { io(a, v.reasonCode); io(a, v.message); }
template <class A> void visit(A& a, SprueGenerationResult& v) { io(a, v.success); io(a, v.failure); io(a, v.sprue); io(a, v.updatedBodies); io(a, v.replacedBodyIds); }
template <class A> void visit(A& a, SprueResultCache::Entry& v) { io(a, v.key); io(a, v.result); }
template <class A> void visit(A& a, SprueEvaluation& v) {
  io(a, v.bodies); io(a, v.resolvedSprues); io(a, v.definitions); io(a, v.warnings); io(a, v.cacheHits); io(a, v.cacheMisses);
}

// --- registration ----------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, RegistrationInterface& v) {
  io(a, v.id); io(a, v.bodyAId); io(a, v.bodyBId); io(a, v.role); io(a, v.axis); io(a, v.planeCoordinateMm); io(a, v.matingBounds); io(a, v.assemblyDirection);
}
template <class A> void visit(A& a, LinearKeyGeometry& v) {
  io(a, v.widthMm); io(a, v.depthMm); io(a, v.lengthMm); io(a, v.taperAngleDeg); io(a, v.leadInMm); io(a, v.rootFilletMm);
}
template <class A> void visit(A& a, RegistrationFeature& v) {
  io(a, v.id); io(a, v.interfaceId); io(a, v.logicalKeyId); io(a, v.segmentIndex); io(a, v.side); io(a, v.maleBodyId); io(a, v.femaleBodyId);
  io(a, v.startPoint); io(a, v.endPoint); io(a, v.anchor); io(a, v.direction); io(a, v.normal); io(a, v.geometry); io(a, v.clearanceMm); io(a, v.status);
}
template <class A> void visit(A& a, RegistrationTolerancePolicy& v) {
  io(a, v.policyId); io(a, v.radialClearanceMm); io(a, v.booleanToleranceMm); io(a, v.minimumWallMm); io(a, v.cavitySafetyMarginMm);
  io(a, v.outerEdgeMarginMm); io(a, v.minimumFeatureRadiusMm); io(a, v.maximumFeatureRadiusMm);
}
template <class A> void visit(A& a, RegistrationAttemptReport& v) { io(a, v.radiusMm); io(a, v.requestedCount); io(a, v.selectedCount); }
template <class A> void visit(A& a, RegistrationReport& v) {
  io(a, v.sourceRevision); io(a, v.status); io(a, v.reasonCode); io(a, v.message); io(a, v.interfaces); io(a, v.features); io(a, v.tolerancePolicy);
  io(a, v.attempts);
}
template <class A> void visit(A& a, DerivedRegistrationState& v) { io(a, v.status); io(a, v.revision); io(a, v.bodies); io(a, v.report); }
template <class A> void visit(A& a, DerivedMoldEvaluation& v) { io(a, v.sprues); io(a, v.registration); }

// --- segmentation ----------------------------------------------------------------------------------------------------------------------

/// A JSON-like value (the details of an issue): its type, then its content.
template <class A> void visit(A& a, Json& j) {
  auto type = j.type();
  io(a, type);
  if constexpr (A::kReading) {
    switch (type) {
      case Json::Type::Undefined: j = Json(); break;
      case Json::Type::Null: j = Json::null(); break;
      case Json::Type::Bool: { bool b = false; io(a, b); j = Json::boolean(b); break; }
      case Json::Type::Number: { double d = 0; io(a, d); j = Json::number(d); break; }
      case Json::Type::String: { std::string s; io(a, s); j = Json::string(std::move(s)); break; }
      case Json::Type::Array: { std::vector<Json> items; io(a, items); j = Json::array(std::move(items)); break; }
      case Json::Type::Object: { std::vector<std::pair<std::string, Json>> entries; io(a, entries); j = Json::object(std::move(entries)); break; }
      default: throw WireError("A JSON value has an unknown type.");
    }
  } else {
    switch (type) {
      case Json::Type::Bool: { bool b = j.boolValue(); io(a, b); break; }
      case Json::Type::Number: { double d = j.numberValue(); io(a, d); break; }
      case Json::Type::String: { std::string s = j.stringValue(); io(a, s); break; }
      case Json::Type::Array: { std::vector<Json> items = j.items(); io(a, items); break; }
      case Json::Type::Object: { std::vector<std::pair<std::string, Json>> entries = j.entries(); io(a, entries); break; }
      default: break;   // undefined and null carry no content
    }
  }
}
template <class A> void visit(A& a, FitStageResult& v) { io(a, v.status); io(a, v.axisFit); io(a, v.failingAxes); }
template <class A> void visit(A& a, SegmentationIssue& v) { io(a, v.blocker); io(a, v.reasonCode); io(a, v.message); io(a, v.details); }
template <class A> void visit(A& a, SegmentationSourceIdentity& v) {
  io(a, v.documentRevision); io(a, v.documentFingerprint); io(a, v.resultRequestId); io(a, v.definitionId); io(a, v.modelId); io(a, v.frameId);
  io(a, v.bodySignature); io(a, v.protectedRegionSignature);
}
template <class A> void visit(A& a, SegmentationProtectedRegion& v) {
  io(a, v.id); io(a, v.kind); io(a, v.source); io(a, v.provenanceId); io(a, v.bodyIds); io(a, v.bounds); io(a, v.hardness); io(a, v.clearanceMm);
}
template <class A> void visit(A& a, ProtectedRegionEvidence& v) { io(a, v.status); io(a, v.reason); }
template <class A> void visit(A& a, SegmentationSourceSnapshot& v) {
  io(a, v.identity); io(a, v.bodies); io(a, v.aggregateBounds); io(a, v.protectedRegions); io(a, v.protectedRegionEvidence); io(a, v.warnings);
}
template <class A> void visit(A& a, SegmentationRequest& v) {
  io(a, v.requestId); io(a, v.source); io(a, v.printerVolume); io(a, v.printerVolumeSignature); io(a, v.settingsSignature); io(a, v.policyId);
  io(a, v.policyVersion);
}
template <class A> void visit(A& a, BoundaryIntent& v) {
  io(a, v.id); io(a, v.axis); io(a, v.coordinateMm); io(a, v.ordinal); io(a, v.sequenceIndex); io(a, v.broadcastToAllStraddlingBodies); io(a, v.allStraddling);
}
template <class A> void visit(A& a, SegmentDefinition& v) {
  io(a, v.id); io(a, v.ordinal); io(a, v.gridIndex); io(a, v.sourceBodyIds); io(a, v.predictedBounds); io(a, v.predictedFit); io(a, v.boundaryIntentIds);
}
template <class A> void visit(A& a, CandidateScore& v) {
  io(a, v.hardFailureCount); io(a, v.segmentCount); io(a, v.minimumPrintableMarginMm); io(a, v.declaredRisk); io(a, v.weightedObjectiveScore);
}
template <class A> void visit(A& a, SegmentationValidation& v) {
  io(a, v.status); io(a, v.stage); io(a, v.sourceRevision); io(a, v.sourceFingerprint); io(a, v.printableByBounds); io(a, v.geometryExecution);
  io(a, v.manufacturingSafety); io(a, v.warnings); io(a, v.blockers);
}
template <class A> void visit(A& a, SegmentationPlan& v) {
  io(a, v.id); io(a, v.request); io(a, v.algorithmId); io(a, v.algorithmVersion); io(a, v.planningBasis); io(a, v.requiredAxes);
  io(a, v.perAxisSegmentCount); io(a, v.estimatedMinimumSegmentCount); io(a, v.candidateIds); io(a, v.rejectedCandidateIds); io(a, v.selectedCandidateId);
  io(a, v.boundaries); io(a, v.segments); io(a, v.score); io(a, v.validation); io(a, v.extensionObligations);
}
template <class A> void visit(A& a, SegmentationExecutionPolicy& v) {
  io(a, v.id); io(a, v.version); io(a, v.toleranceVersion); io(a, v.linearToleranceMm); io(a, v.boundsToleranceMm); io(a, v.sideToleranceMm);
  io(a, v.volumeToleranceMm3); io(a, v.overlapToleranceMm3);
}
template <class A> void visit(A& a, SupportedPlaneCutIntent& v) {
  io(a, v.boundary); io(a, v.boundaryId); io(a, v.axis); io(a, v.coordinateMm); io(a, v.normal); io(a, v.originOffset);
}
template <class A> void visit(A& a, SegmentationExecutionRequest& v) {
  io(a, v.id); io(a, v.segmentationRequestId); io(a, v.acceptedPlanId); io(a, v.acceptedPlan); io(a, v.documentRevision); io(a, v.documentFingerprint);
  io(a, v.committedResultRequestId); io(a, v.sourceBody); io(a, v.bodySignature); io(a, v.printerVolume); io(a, v.printerVolumeSignature);
  io(a, v.executionAxis); io(a, v.planes); io(a, v.planeSequenceSignature); io(a, v.policy);
}
template <class A> void visit(A& a, SegmentationExecutionDiagnostic& v) {
  io(a, v.stage); io(a, v.reasonCode); io(a, v.message); io(a, v.axis); io(a, v.boundaryId); io(a, v.cutIndex); io(a, v.cutCount);
}
template <class A> void visit(A& a, SegmentationOutputProvenance& v) {
  io(a, v.sourceBodyId); io(a, v.sourceGeometryVersion); io(a, v.segmentationRequestId); io(a, v.acceptedPlanId); io(a, v.axis); io(a, v.boundaryId);
  io(a, v.side); io(a, v.parentBodyId); io(a, v.parentGeometryVersion); io(a, v.cutIndex); io(a, v.boundaryLineage); io(a, v.executionRequestId);
  io(a, v.executionPolicyId); io(a, v.executionPolicyVersion);
}
template <class A> void visit(A& a, SegmentationExecutedBody& v) { io(a, v.body); io(a, v.provenance); }
template <class A> void visit(A& a, SegmentationCutValidation& v) {
  io(a, v.cutIndex); io(a, v.axis); io(a, v.boundaryId); io(a, v.inputBodyId); io(a, v.inputVolumeMm3); io(a, v.outputVolumeMm3); io(a, v.volumeDeltaMm3);
  io(a, v.overlapVolumeMm3);
}
template <class A> void visit(A& a, SegmentationExecutionValidation& v) {
  io(a, v.sourceVolumeMm3); io(a, v.outputVolumeMm3); io(a, v.volumeDeltaMm3); io(a, v.overlapVolumeMm3); io(a, v.cuts); io(a, v.policy);
}
template <class A> void visit(A& a, SegmentationExecutionResult& v) {
  io(a, v.status); io(a, v.stage); io(a, v.reasonCode); io(a, v.issues); io(a, v.diagnostics); io(a, v.executionRequest); io(a, v.bodies); io(a, v.validation);
}
template <class A> void visit(A& a, SegmentationJobResult& v) { io(a, v.result); io(a, v.registration); }
template <class A> void visit(A& a, SegmentationWorkerRequest& v) {
  io(a, v.plan); io(a, v.snapshot); io(a, v.definition); io(a, v.printerVolume); io(a, v.bodies); io(a, v.revisionPrefix);
}
// --- request and result ------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MoldWorkerRequest& v) { io(a, v.request); io(a, v.sprueIntents); io(a, v.sprueCache); }
template <class A> void visit(A& a, MoldWorkerResult& v) { io(a, v.mold); io(a, v.derived); io(a, v.sprueCache); }

}  // namespace craft::wire

namespace craft {

std::vector<std::uint8_t> encodeSegmentationWorkerRequest(const SegmentationWorkerRequest& request) { return wire::encode(wire::kKindSegmentationRequest, request); }
SegmentationWorkerRequest decodeSegmentationWorkerRequest(std::span<const std::uint8_t> bytes) { return wire::decode<SegmentationWorkerRequest>(wire::kKindSegmentationRequest, bytes); }
std::vector<std::uint8_t> encodeSegmentationJobResult(const SegmentationJobResult& result) { return wire::encode(wire::kKindSegmentationResult, result); }
SegmentationJobResult decodeSegmentationJobResult(std::span<const std::uint8_t> bytes) { return wire::decode<SegmentationJobResult>(wire::kKindSegmentationResult, bytes); }
std::vector<std::uint8_t> encodeRegistrationState(const DerivedRegistrationState& state) { return wire::encode(wire::kKindRegistration, state); }
DerivedRegistrationState decodeRegistrationState(std::span<const std::uint8_t> bytes) { return wire::decode<DerivedRegistrationState>(wire::kKindRegistration, bytes); }

std::vector<std::uint8_t> encodeMoldWorkerRequest(const MoldWorkerRequest& request) { return wire::encode(wire::kKindRequest, request); }
MoldWorkerRequest decodeMoldWorkerRequest(std::span<const std::uint8_t> bytes) { return wire::decode<MoldWorkerRequest>(wire::kKindRequest, bytes); }
std::vector<std::uint8_t> encodeMoldWorkerResult(const MoldWorkerResult& result) { return wire::encode(wire::kKindResult, result); }
MoldWorkerResult decodeMoldWorkerResult(std::span<const std::uint8_t> bytes) { return wire::decode<MoldWorkerResult>(wire::kKindResult, bytes); }

}  // namespace craft
