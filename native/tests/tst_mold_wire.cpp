// The mold generation wire format (P0-5 phase 3): a real request and a real result (mold, sprues, registration, sprue cache) survive a round trip
// exactly, and bad data is refused. As in tst_master_wire, the comparison is written separately from the format's own visitor, because a field the
// visitor forgot would be forgotten both ways and a re-encode comparison alone would not notice it.

#include <QtTest>

#include <cstring>

#include "ManifoldMeshEngine.h"
#include "MoldTestRequests.h"
#include "mold/MoldWire.h"

using namespace craft;

namespace {

void compareMesh(const MeshPayload& a, const MeshPayload& b) {
  QCOMPARE(a.positions, b.positions);
  QCOMPARE(a.indices, b.indices);
  QCOMPARE(a.faceRuns.size(), b.faceRuns.size());
  for (std::size_t i = 0; i < a.faceRuns.size(); ++i) {
    QCOMPARE(a.faceRuns[i].startTriangle, b.faceRuns[i].startTriangle);
    QCOMPARE(a.faceRuns[i].triangleCount, b.faceRuns[i].triangleCount);
    QCOMPARE(static_cast<int>(a.faceRuns[i].role), static_cast<int>(b.faceRuns[i].role));
  }
}

void compareBody(const MoldBody& a, const MoldBody& b) {
  QCOMPARE(a.id, b.id);
  QCOMPARE(a.name, b.name);
  QCOMPARE(a.visible, b.visible);
  QVERIFY(a.bounds == b.bounds);
  QVERIFY(a.centroid == b.centroid);
  QCOMPARE(a.generationOrder, b.generationOrder);
  QCOMPARE(a.sourceSelectedFaceSignature, b.sourceSelectedFaceSignature);
  QCOMPARE(a.triangleCount, b.triangleCount);
  QCOMPARE(a.volumeMm3, b.volumeMm3);
  QCOMPARE(a.watertight, b.watertight);
  compareMesh(a.mesh, b.mesh);
  QCOMPARE(a.geometryVersion, b.geometryVersion);
  QCOMPARE(a.sprueOperationId, b.sprueOperationId);
}

void compareBodies(const std::vector<MoldBody>& a, const std::vector<MoldBody>& b) {
  QCOMPARE(a.size(), b.size());
  for (std::size_t i = 0; i < a.size(); ++i) compareBody(a[i], b[i]);
}

void compareSprueResult(const SprueGenerationResult& a, const SprueGenerationResult& b) {
  QCOMPARE(a.success, b.success);
  QCOMPARE(a.failure.reasonCode, b.failure.reasonCode);
  QCOMPARE(a.failure.message, b.failure.message);
  QCOMPARE(a.sprue.operationId, b.sprue.operationId);
  QCOMPARE(a.sprue.targetBodyIds, b.sprue.targetBodyIds);
  QVERIFY(a.sprue.position == b.sprue.position);
  QVERIFY(a.sprue.profile == b.sprue.profile);
  QCOMPARE(a.sprue.depthMm, b.sprue.depthMm);
  QCOMPARE(a.sprue.circularSegments, b.sprue.circularSegments);
  QCOMPARE(a.sprue.moldFrameId, b.sprue.moldFrameId);
  QCOMPARE(a.sprue.tolerancePolicy.linearToleranceMm, b.sprue.tolerancePolicy.linearToleranceMm);
  QCOMPARE(a.sprue.tolerancePolicy.meaningfulVolumeMm3, b.sprue.tolerancePolicy.meaningfulVolumeMm3);
  compareBodies(a.updatedBodies, b.updatedBodies);
  QCOMPARE(a.replacedBodyIds, b.replacedBodyIds);
}

void compareCache(const std::map<std::string, SprueResultCache::Entry>& a, const std::map<std::string, SprueResultCache::Entry>& b) {
  QCOMPARE(a.size(), b.size());
  auto ia = a.begin();
  auto ib = b.begin();
  for (; ia != a.end(); ++ia, ++ib) {
    QCOMPARE(ia->first, ib->first);
    QCOMPARE(ia->second.key, ib->second.key);
    compareSprueResult(ia->second.result, ib->second.result);
  }
}

void compareMoldResult(const MoldGenerationResult& a, const MoldGenerationResult& b) {
  QCOMPARE(a.definition.definitionId, b.definition.definitionId);
  QCOMPARE(a.definition.modelId, b.definition.modelId);
  QVERIFY(a.definition.partOffset == b.definition.partOffset);
  QVERIFY(a.definition.selectionBoxBounds == b.definition.selectionBoxBounds);
  QVERIFY(a.definition.referenceMoldBlockBounds == b.definition.referenceMoldBlockBounds);
  QCOMPARE(a.definition.clearanceMm, b.definition.clearanceMm);
  QCOMPARE(a.definition.usedFaces.size(), b.definition.usedFaces.size());
  QCOMPARE(a.definition.moldBodiesPartitionReferenceBlock, b.definition.moldBodiesPartitionReferenceBlock);
  QCOMPARE(a.definition.segmentationLineage, b.definition.segmentationLineage);
  compareBodies(a.definition.moldBodies, b.definition.moldBodies);
  QCOMPARE(a.cutPlanes.size(), b.cutPlanes.size());
  for (std::size_t i = 0; i < a.cutPlanes.size(); ++i) {
    QCOMPARE(static_cast<int>(a.cutPlanes[i].axis), static_cast<int>(b.cutPlanes[i].axis));
    QCOMPARE(a.cutPlanes[i].coordinate, b.cutPlanes[i].coordinate);
    QCOMPARE(a.cutPlanes[i].sourceSketchId, b.cutPlanes[i].sourceSketchId);
    QCOMPARE(a.cutPlanes[i].order, b.cutPlanes[i].order);
  }
  QCOMPARE(a.cuttingPlanes.size(), b.cuttingPlanes.size());
  QCOMPARE(a.validationWarnings.size(), b.validationWarnings.size());

  const CavityGenerationResult& x = a.cavity;
  const CavityGenerationResult& y = b.cavity;
  QCOMPARE(x.operationId, y.operationId);
  QCOMPARE(x.sourceSignature, y.sourceSignature);
  QCOMPARE(x.implementation, y.implementation);
  compareMesh(x.cavityTool.solid.mesh, y.cavityTool.solid.mesh);
  QVERIFY(x.cavityTool.solid.bounds == y.cavityTool.solid.bounds);
  QCOMPARE(x.cavityTool.solid.volumeMm3, y.cavityTool.solid.volumeMm3);
  QCOMPARE(x.cavityTool.clearanceMm, y.cavityTool.clearanceMm);
  QCOMPARE(x.cavityTool.implementationMethod, y.cavityTool.implementationMethod);
  QCOMPARE(static_cast<int>(x.cavityTool.qualityMode), static_cast<int>(y.cavityTool.qualityMode));
  QCOMPARE(x.bodies.size(), y.bodies.size());
  for (std::size_t i = 0; i < x.bodies.size(); ++i) {
    compareBody(x.bodies[i].body, y.bodies[i].body);
    QCOMPARE(x.bodies[i].parentBodyId, y.bodies[i].parentBodyId);
    QCOMPARE(x.bodies[i].cavityAffected, y.bodies[i].cavityAffected);
    QCOMPARE(x.bodies[i].validation.minimumWallMm, y.bodies[i].validation.minimumWallMm);
    QCOMPARE(x.bodies[i].validation.openEdgeCount, y.bodies[i].validation.openEdgeCount);
    QCOMPARE(x.bodies[i].validation.reasonCodes, y.bodies[i].validation.reasonCodes);
    QCOMPARE(x.bodies[i].validation.connectedComponentCount, y.bodies[i].validation.connectedComponentCount);
  }
  QCOMPARE(x.subtraction.removedVolumeMm3, y.subtraction.removedVolumeMm3);
  QCOMPARE(x.subtraction.originalVolumeMm3, y.subtraction.originalVolumeMm3);
  QCOMPARE(x.selectedEngine, y.selectedEngine);
  QCOMPARE(x.engineReasonCodes, y.engineReasonCodes);
  QCOMPARE(x.offsetAttempts.size(), y.offsetAttempts.size());
  QCOMPARE(x.usedFallback, y.usedFallback);
  QCOMPARE(x.hasDistanceFieldProfile, y.hasDistanceFieldProfile);
  QCOMPARE(x.timings.totalMs, y.timings.totalMs);
}

void compareDerived(const DerivedMoldEvaluation& a, const DerivedMoldEvaluation& b) {
  compareBodies(a.sprues.bodies, b.sprues.bodies);
  QCOMPARE(a.sprues.resolvedSprues.size(), b.sprues.resolvedSprues.size());
  for (std::size_t i = 0; i < a.sprues.resolvedSprues.size(); ++i) {
    QCOMPARE(a.sprues.resolvedSprues[i].operationId, b.sprues.resolvedSprues[i].operationId);
    QVERIFY(a.sprues.resolvedSprues[i].position == b.sprues.resolvedSprues[i].position);
    QCOMPARE(a.sprues.resolvedSprues[i].depthMm, b.sprues.resolvedSprues[i].depthMm);
  }
  QCOMPARE(a.sprues.definitions.size(), b.sprues.definitions.size());
  for (std::size_t i = 0; i < a.sprues.definitions.size(); ++i) {
    QCOMPARE(a.sprues.definitions[i].operationId, b.sprues.definitions[i].operationId);
    QCOMPARE(a.sprues.definitions[i].validation.status, b.sprues.definitions[i].validation.status);
    QCOMPARE(a.sprues.definitions[i].validation.reasonCode, b.sprues.definitions[i].validation.reasonCode);
    QCOMPARE(a.sprues.definitions[i].creationOrder, b.sprues.definitions[i].creationOrder);
    QVERIFY(a.sprues.definitions[i].profileDesign.profile == b.sprues.definitions[i].profileDesign.profile);
    QCOMPARE(a.sprues.definitions[i].profileDesign.source, b.sprues.definitions[i].profileDesign.source);
    QCOMPARE(a.sprues.definitions[i].profileDesign.mainSection.has_value(), b.sprues.definitions[i].profileDesign.mainSection.has_value());
  }
  QCOMPARE(a.sprues.warnings, b.sprues.warnings);
  QCOMPARE(a.sprues.cacheHits, b.sprues.cacheHits);
  QCOMPARE(a.sprues.cacheMisses, b.sprues.cacheMisses);

  QCOMPARE(a.registration.status, b.registration.status);
  QCOMPARE(a.registration.revision, b.registration.revision);
  compareBodies(a.registration.bodies, b.registration.bodies);
  QCOMPARE(a.registration.report.has_value(), b.registration.report.has_value());
  if (a.registration.report) {
    const RegistrationReport& x = *a.registration.report;
    const RegistrationReport& y = *b.registration.report;
    QCOMPARE(x.status, y.status);
    QCOMPARE(x.reasonCode, y.reasonCode);
    QCOMPARE(x.message, y.message);
    QCOMPARE(x.sourceRevision, y.sourceRevision);
    QCOMPARE(x.interfaces.size(), y.interfaces.size());
    for (std::size_t i = 0; i < x.interfaces.size(); ++i) {
      QCOMPARE(x.interfaces[i].id, y.interfaces[i].id);
      QCOMPARE(x.interfaces[i].planeCoordinateMm, y.interfaces[i].planeCoordinateMm);
      QVERIFY(x.interfaces[i].matingBounds == y.interfaces[i].matingBounds);
      QVERIFY(x.interfaces[i].assemblyDirection == y.interfaces[i].assemblyDirection);
    }
    QCOMPARE(x.features.size(), y.features.size());
    for (std::size_t i = 0; i < x.features.size(); ++i) {
      QCOMPARE(x.features[i].id, y.features[i].id);
      QCOMPARE(static_cast<int>(x.features[i].side), static_cast<int>(y.features[i].side));
      QCOMPARE(x.features[i].maleBodyId, y.features[i].maleBodyId);
      QVERIFY(x.features[i].anchor == y.features[i].anchor);
      QCOMPARE(x.features[i].geometry.widthMm, y.features[i].geometry.widthMm);
      QCOMPARE(x.features[i].geometry.taperAngleDeg, y.features[i].geometry.taperAngleDeg);
      QCOMPARE(x.features[i].clearanceMm, y.features[i].clearanceMm);
      QCOMPARE(x.features[i].status, y.features[i].status);
    }
    QCOMPARE(x.tolerancePolicy.policyId, y.tolerancePolicy.policyId);
    QCOMPARE(x.tolerancePolicy.radialClearanceMm, y.tolerancePolicy.radialClearanceMm);
    QCOMPARE(x.attempts.size(), y.attempts.size());
  }
}

std::span<const std::uint8_t> span(const std::vector<std::uint8_t>& v) { return {v.data(), v.size()}; }

}  // namespace

class TstMoldWire : public QObject {
  Q_OBJECT

 private slots:
  void aRealRequestSurvivesARoundTrip_data() {
    QTest::addColumn<bool>("split");
    QTest::addColumn<int>("sprues");
    QTest::newRow("whole block, no sprue") << false << 0;
    QTest::newRow("split, three sprues") << true << 3;
  }

  void aRealRequestSurvivesARoundTrip() {
    QFETCH(bool, split);
    QFETCH(int, sprues);
    MoldWorkerRequest job = craft::testing::cubeMoldWorkerRequest(split, sprues);
    // A cache entry in the request too, as a second run of the same part would send it.
    auto engine = createManifoldMeshEngine();
    {
      SprueResultCache cache;
      const MoldGenerationResult mold = generateMold(*engine, job.request);
      evaluateDerivedMold(*engine, mold, job.sprueIntents, {}, &cache);
      job.sprueCache = cache.snapshot();
      QCOMPARE(job.sprueCache.size(), static_cast<std::size_t>(sprues));
    }
    const std::vector<std::uint8_t> bytes = encodeMoldWorkerRequest(job);
    const MoldWorkerRequest back = decodeMoldWorkerRequest(span(bytes));
    QCOMPARE(back.request.modelId, job.request.modelId);
    QCOMPARE(back.request.partGeometryVersion, job.request.partGeometryVersion);
    QVERIFY(back.request.groundedPart);
    QCOMPARE(back.request.groundedPart->positions, job.request.groundedPart->positions);
    QCOMPARE(back.request.moldClearanceMm, job.request.moldClearanceMm);
    QCOMPARE(back.request.cuttingPlanes.size(), job.request.cuttingPlanes.size());
    QCOMPARE(back.sprueIntents.size(), job.sprueIntents.size());
    for (std::size_t i = 0; i < job.sprueIntents.size(); ++i) {
      QCOMPARE(back.sprueIntents[i].operationId, job.sprueIntents[i].operationId);
      QVERIFY(back.sprueIntents[i].position == job.sprueIntents[i].position);
      QVERIFY(back.sprueIntents[i].profileDesign.profile == job.sprueIntents[i].profileDesign.profile);
    }
    compareCache(back.sprueCache, job.sprueCache);
    QCOMPARE(encodeMoldWorkerRequest(back), bytes);

    // And a request with no part at all keeps "no part".
    MoldWorkerRequest empty;
    QVERIFY(!decodeMoldWorkerRequest(span(encodeMoldWorkerRequest(empty))).request.groundedPart);
  }

  void aRealResultSurvivesARoundTrip_data() { aRealRequestSurvivesARoundTrip_data(); }

  void aRealResultSurvivesARoundTrip() {
    QFETCH(bool, split);
    QFETCH(int, sprues);
    const MoldWorkerRequest job = craft::testing::cubeMoldWorkerRequest(split, sprues);
    auto engine = createManifoldMeshEngine();
    SprueResultCache cache;
    MoldWorkerResult result;
    result.mold = generateMold(*engine, job.request);
    result.derived = evaluateDerivedMold(*engine, result.mold, job.sprueIntents, {}, &cache);
    result.sprueCache = cache.snapshot();

    // The row is only worth anything if it carried real content.
    QVERIFY(!result.mold.cavity.bodies.empty());
    QVERIFY(result.mold.cavity.bodies.front().body.mesh.triangleCount() > 0);
    QCOMPARE(result.derived.sprues.resolvedSprues.size(), static_cast<std::size_t>(sprues));
    if (split) {
      QCOMPARE(result.mold.cavity.bodies.size(), std::size_t{2});
      QVERIFY2(result.derived.registration.report.has_value(), "a split mold must carry a registration report");
      QVERIFY(!result.derived.registration.report->interfaces.empty());
    }

    const std::vector<std::uint8_t> bytes = encodeMoldWorkerResult(result);
    const MoldWorkerResult back = decodeMoldWorkerResult(span(bytes));
    compareMoldResult(result.mold, back.mold);
    compareDerived(result.derived, back.derived);
    compareCache(result.sprueCache, back.sprueCache);
    QCOMPARE(encodeMoldWorkerResult(back), bytes);   // nothing is lost or invented on the second pass either
  }

  void truncatedDataIsRefusedAtEveryLength() {
    const std::vector<std::uint8_t> bytes = encodeMoldWorkerRequest(craft::testing::cubeMoldWorkerRequest(true, 1));
    QVERIFY(bytes.size() > 100);
    for (std::size_t length = 0; length < bytes.size(); length += (length < 600 ? 1 : 29)) {
      bool refused = false;
      try {
        (void)decodeMoldWorkerRequest({bytes.data(), length});
      } catch (const WireError&) {
        refused = true;
      }
      QVERIFY2(refused, qPrintable(QString("a %1-byte prefix of %2 bytes was accepted").arg(length).arg(bytes.size())));
    }
  }

  void aForgedLengthDoesNotAllocateWhatItClaims() {
    // magic, kind 3 (request), then a model id string length of 2^60.
    std::vector<std::uint8_t> bytes = {'C', 'M', 'W', '1', 3};
    const std::uint64_t huge = std::uint64_t{1} << 60;
    bytes.resize(bytes.size() + sizeof huge);
    std::memcpy(bytes.data() + 5, &huge, sizeof huge);
    QVERIFY_EXCEPTION_THROWN(decodeMoldWorkerRequest(span(bytes)), WireError);
  }

  void aMasterJobIsNotAMoldJobAndTrailingBytesAreRefused() {
    const std::vector<std::uint8_t> bytes = encodeMoldWorkerRequest(craft::testing::cubeMoldWorkerRequest(false, 0));
    QVERIFY_EXCEPTION_THROWN(decodeMoldWorkerResult(span(bytes)), WireError);   // a request is not a result
    std::vector<std::uint8_t> trailing = bytes;
    trailing.push_back(0);
    QVERIFY_EXCEPTION_THROWN(decodeMoldWorkerRequest(span(trailing)), WireError);
  }
};

QTEST_APPLESS_MAIN(TstMoldWire)
#include "tst_mold_wire.moc"
