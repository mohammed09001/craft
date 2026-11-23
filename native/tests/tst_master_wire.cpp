// The Master Mold wire format (P0-5 phase 2): a real request and a real result survive a round trip exactly, and bad data is refused.
//
// The comparison here is written separately from the format's own visitor on purpose: the visitor writes and reads every field with one
// function, so a field it forgot would be forgotten both ways and a re-encode comparison alone would not notice. The explicit comparison below
// checks the fields that matter on real engine output.

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>

#include <cstring>

#include "master/MasterMoldStore.h"
#include "master/MasterWire.h"
#include "ManifoldMeshEngine.h"
#include "MasterTestRequests.h"

using namespace craft;

namespace {


MasterMoldRequest requestFor(const QJsonObject& c) { return craft::testing::masterRequestFor(c); }

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

void compareSet(const MasterToolingSet& a, const MasterToolingSet& b) {
  QCOMPARE(a.moldPartId, b.moldPartId);
  QCOMPARE(a.moldPartName, b.moldPartName);
  QCOMPARE(a.castTargetVersion, b.castTargetVersion);
  QCOMPARE(a.sourceSignature, b.sourceSignature);
  QCOMPARE(a.releaseMode, b.releaseMode);
  QCOMPARE(a.fingerprint, b.fingerprint);
  QCOMPARE(a.warnings, b.warnings);
  QCOMPARE(a.pourFaceDecision.selected.has_value(), b.pourFaceDecision.selected.has_value());
  if (a.pourFaceDecision.selected) QCOMPARE(static_cast<int>(*a.pourFaceDecision.selected), static_cast<int>(*b.pourFaceDecision.selected));
  QCOMPARE(a.pourFaceDecision.score, b.pourFaceDecision.score);
  QCOMPARE(a.pourFaceDecision.candidates.size(), b.pourFaceDecision.candidates.size());
  for (std::size_t i = 0; i < a.pourFaceDecision.candidates.size(); ++i) {
    const auto& x = a.pourFaceDecision.candidates[i];
    const auto& y = b.pourFaceDecision.candidates[i];
    QCOMPARE(static_cast<int>(x.direction), static_cast<int>(y.direction));
    QCOMPARE(x.source, y.source);
    QCOMPARE(x.exposedOpeningAreaMm2, y.exposedOpeningAreaMm2);
    QCOMPARE(x.valid, y.valid);
    QCOMPARE(x.rejectionReason, y.rejectionReason);
    QCOMPARE(x.score, y.score);
  }
  QCOMPARE(a.pourFaceDecision.ventPlan.status, b.pourFaceDecision.ventPlan.status);
  QCOMPARE(a.pourFaceDecision.ventPlan.features.size(), b.pourFaceDecision.ventPlan.features.size());
  QCOMPARE(a.accessibility.onePieceReleaseFeasible, b.accessibility.onePieceReleaseFeasible);
  QCOMPARE(a.accessibility.directions.size(), b.accessibility.directions.size());
  for (std::size_t i = 0; i < a.accessibility.directions.size(); ++i) {
    QCOMPARE(a.accessibility.directions[i].accessibilityFraction, b.accessibility.directions[i].accessibilityFraction);
    QCOMPARE(a.accessibility.directions[i].undercutAreaMm2, b.accessibility.directions[i].undercutAreaMm2);
  }
  QCOMPARE(a.partingSurfaces.size(), b.partingSurfaces.size());
  for (std::size_t i = 0; i < a.partingSurfaces.size(); ++i) {
    QCOMPARE(a.partingSurfaces[i].kind, b.partingSurfaces[i].kind);
    QCOMPARE(a.partingSurfaces[i].axis, b.partingSurfaces[i].axis);
    QCOMPARE(a.partingSurfaces[i].coordinateMm, b.partingSurfaces[i].coordinateMm);
    QCOMPARE(a.partingSurfaces[i].planeNormal.has_value(), b.partingSurfaces[i].planeNormal.has_value());
    QCOMPARE(a.partingSurfaces[i].origin, b.partingSurfaces[i].origin);
  }
  QCOMPARE(a.assembly.coreMode, b.assembly.coreMode);
  QCOMPARE(a.assembly.pieces.size(), b.assembly.pieces.size());
  for (std::size_t i = 0; i < a.assembly.pieces.size(); ++i) {
    const auto& x = a.assembly.pieces[i];
    const auto& y = b.assembly.pieces[i];
    QCOMPARE(x.pieceId, y.pieceId);
    QCOMPARE(x.name, y.name);
    compareMesh(x.mesh, y.mesh);
    QVERIFY(x.bounds == y.bounds);
    QCOMPARE(x.volumeMm3, y.volumeMm3);
    QCOMPARE(x.triangleCount, y.triangleCount);
    QCOMPARE(x.watertight, y.watertight);
    QCOMPARE(x.manifold, y.manifold);
    QCOMPARE(x.releaseDirection, y.releaseDirection);
    QCOMPARE(x.regions, y.regions);
    QCOMPARE(x.toolingRegistrationFeatureIds, y.toolingRegistrationFeatureIds);
    QCOMPARE(x.fitsBuildVolume, y.fitsBuildVolume);
    QCOMPARE(x.directionVector.has_value(), y.directionVector.has_value());
    if (x.directionVector) QVERIFY(*x.directionVector == *y.directionVector);
  }
  QCOMPARE(a.assembly.registrationFeatures.size(), b.assembly.registrationFeatures.size());
  QCOMPARE(a.assembly.releaseSequence.size(), b.assembly.releaseSequence.size());
  for (std::size_t i = 0; i < a.assembly.releaseSequence.size(); ++i) {
    QCOMPARE(a.assembly.releaseSequence[i].pieceId, b.assembly.releaseSequence[i].pieceId);
    QCOMPARE(a.assembly.releaseSequence[i].clearanceDistanceMm, b.assembly.releaseSequence[i].clearanceDistanceMm);
    QCOMPARE(a.assembly.releaseSequence[i].collisionVerified, b.assembly.releaseSequence[i].collisionVerified);
  }
}

void compareResult(const MasterMoldResult& a, const MasterMoldResult& b) {
  QCOMPARE(a.operationId, b.operationId);
  QCOMPARE(a.generationVersion, b.generationVersion);
  QCOMPARE(a.elapsedMs, b.elapsedMs);
  QCOMPARE(a.workingMoldPieceCount, b.workingMoldPieceCount);
  QCOMPARE(a.warningCount, b.warningCount);
  QCOMPARE(a.seedId, b.seedId);
  QCOMPARE(a.unportedPathsReached, b.unportedPathsReached);
  QCOMPARE(a.unportedPaths, b.unportedPaths);
  QCOMPARE(a.budget.candidateDirectionCount, b.budget.candidateDirectionCount);
  QCOMPARE(a.budget.releaseVerificationAttempts, b.budget.releaseVerificationAttempts);
  QCOMPARE(a.budget.limitsExceeded, b.budget.limitsExceeded);
  QCOMPARE(a.budget.budgetDetails.size(), b.budget.budgetDetails.size());
  QCOMPARE(a.sets.size(), b.sets.size());
  for (std::size_t i = 0; i < a.sets.size(); ++i) {
    const auto& x = a.sets[i];
    const auto& y = b.sets[i];
    QCOMPARE(x.moldPartId, y.moldPartId);
    QCOMPARE(x.moldPartName, y.moldPartName);
    QCOMPARE(x.status, y.status);
    QCOMPARE(x.sourceSignature, y.sourceSignature);
    QCOMPARE(x.contentVersion, y.contentVersion);
    QCOMPARE(x.failureMessage, y.failureMessage);
    QCOMPARE(x.failureFamily, y.failureFamily);
    QCOMPARE(x.set.has_value(), y.set.has_value());
    if (x.set) compareSet(*x.set, *y.set);
  }
  QCOMPARE(a.plan.has_value(), b.plan.has_value());
  if (a.plan) {
    const AutoWorkingMoldPlan& x = *a.plan;
    const AutoWorkingMoldPlan& y = *b.plan;
    QCOMPARE(x.sourceGeometryVersion, y.sourceGeometryVersion);
    QCOMPARE(x.moldPieces.size(), y.moldPieces.size());
    for (std::size_t i = 0; i < x.moldPieces.size(); ++i) {
      QCOMPARE(x.moldPieces[i].pieceId, y.moldPieces[i].pieceId);
      compareMesh(x.moldPieces[i].mesh, y.moldPieces[i].mesh);
      QVERIFY(x.moldPieces[i].assignedDirection == y.moldPieces[i].assignedDirection);
      QCOMPARE(x.moldPieces[i].releaseOrder, y.moldPieces[i].releaseOrder);
      QCOMPARE(x.moldPieces[i].interfaceIds, y.moldPieces[i].interfaceIds);
    }
    QCOMPARE(x.partingInterfaces.size(), y.partingInterfaces.size());
    QCOMPARE(x.releaseSequence.size(), y.releaseSequence.size());
    QCOMPARE(x.registrationPlan.features.size(), y.registrationPlan.features.size());
    QCOMPARE(x.registrationPlan.reason, y.registrationPlan.reason);
    QCOMPARE(x.warnings.size(), y.warnings.size());
    QCOMPARE(x.score.total, y.score.total);
    QCOMPARE(x.score.interfaceCount, y.score.interfaceCount);
    QCOMPARE(x.rejectedPieceCounts.size(), y.rejectedPieceCounts.size());
  }
}

std::span<const std::uint8_t> span(const std::vector<std::uint8_t>& v) { return {v.data(), v.size()}; }

}  // namespace

class TstMasterWire : public QObject {
  Q_OBJECT
  QJsonArray cases_;

  QJsonObject caseNamed(const QString& name) const {
    for (const QJsonValue& v : cases_) if (v.toObject()["name"].toString() == name) return v.toObject();
    return {};
  }

 private slots:
  void initTestCase() {
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
    QVERIFY(f.open(QIODevice::ReadOnly));
    cases_ = QJsonDocument::fromJson(f.readAll()).object()["cases"].toArray();
  }

  void aRealRequestAndResultRoundTripExactly_data() {
    QTest::addColumn<QString>("name");
    QTest::newRow("c-extrusion") << "c-extrusion";   // two tooling sets with real pieces
    QTest::newRow("bracket-soup") << "bracket-soup";
    QTest::newRow("c-assembly") << "c-assembly";     // a blocked part: a failure message and family, no set
  }

  void aRealRequestAndResultRoundTripExactly() {
    QFETCH(QString, name);
    const QJsonObject c = caseNamed(name);
    QVERIFY(!c.isEmpty());
    MasterMoldRequest request = requestFor(c);

    // The request.
    const std::vector<std::uint8_t> requestBytes = encodeMasterMoldRequest(request);
    const MasterMoldRequest decoded = decodeMasterMoldRequest(span(requestBytes));
    QCOMPARE(decoded.operationId, request.operationId);
    QCOMPARE(decoded.seed.seedId, request.seed.seedId);
    QCOMPARE(decoded.seed.sourceMesh.positions, request.seed.sourceMesh.positions);
    QCOMPARE(decoded.seed.sourceMesh.indices, request.seed.sourceMesh.indices);
    QCOMPARE(decoded.seed.sourceTransform, request.seed.sourceTransform);
    QVERIFY(decoded.seed.sourceBounds == request.seed.sourceBounds);
    QCOMPARE(decoded.seed.printerBuildVolume.has_value(), request.seed.printerBuildVolume.has_value());
    QCOMPARE(decoded.seed.processProfile.profileId, request.seed.processProfile.profileId);
    QCOMPARE(decoded.seed.processProfile.maximumWorkingMoldPieceCount, request.seed.processProfile.maximumWorkingMoldPieceCount);
    QCOMPARE(decoded.seed.sourceProjectRevision, request.seed.sourceProjectRevision);
    QCOMPARE(encodeMasterMoldRequest(decoded), requestBytes);

    // The result of really running the engine on it, and the engine run again from the decoded request must agree.
    auto engine = createManifoldMeshEngine();
    const MasterMoldResult result = evaluateMasterMoldGeneration(*engine, request);
    const MasterMoldResult fromDecoded = evaluateMasterMoldGeneration(*engine, decoded);
    QCOMPARE(fromDecoded.sets.size(), result.sets.size());
    for (std::size_t i = 0; i < result.sets.size(); ++i) {
      QCOMPARE(fromDecoded.sets[i].status, result.sets[i].status);
      QCOMPARE(fromDecoded.sets[i].contentVersion, result.sets[i].contentVersion);
    }

    const std::vector<std::uint8_t> resultBytes = encodeMasterMoldResult(result);
    const MasterMoldResult back = decodeMasterMoldResult(span(resultBytes));
    compareResult(result, back);
    QCOMPARE(encodeMasterMoldResult(back), resultBytes);   // and nothing is lost or invented on the second pass either

    // The row is only worth anything if it carried real content.
    if (name != "c-assembly") {
      QVERIFY(!result.sets.empty());
      QVERIFY(result.sets.front().set.has_value());
      QVERIFY(!result.sets.front().set->assembly.pieces.empty());
      QVERIFY(result.sets.front().set->assembly.pieces.front().mesh.triangleCount() > 0);
    } else {
      QVERIFY(result.sets.front().failureMessage.has_value());
    }
  }

  void truncatedDataIsRefusedAtEveryLength() {
    const MasterMoldRequest request = requestFor(caseNamed("c-extrusion"));
    const std::vector<std::uint8_t> bytes = encodeMasterMoldRequest(request);
    QVERIFY(bytes.size() > 100);
    for (std::size_t length = 0; length < bytes.size(); length += (length < 400 ? 1 : 37)) {
      bool refused = false;
      try {
        (void)decodeMasterMoldRequest({bytes.data(), length});
      } catch (const WireError&) {
        refused = true;
      }
      QVERIFY2(refused, qPrintable(QString("a %1-byte prefix of %2 bytes was accepted").arg(length).arg(bytes.size())));
    }
  }

  void aForgedLengthDoesNotAllocateWhatItClaims() {
    // magic, kind 1 (request), then a string length of 2^60: must be refused at once, not attempted.
    std::vector<std::uint8_t> bytes = {'C', 'M', 'W', '1', 1};
    const std::uint64_t huge = std::uint64_t{1} << 60;
    bytes.resize(bytes.size() + sizeof huge);
    std::memcpy(bytes.data() + 5, &huge, sizeof huge);
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldRequest(span(bytes)), WireError);
  }

  void wrongMagicWrongKindAndTrailingBytesAreRefused() {
    const MasterMoldRequest request = requestFor(caseNamed("tiny-box"));
    std::vector<std::uint8_t> bytes = encodeMasterMoldRequest(request);
    std::vector<std::uint8_t> badMagic = bytes;
    badMagic[0] = 'X';
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldRequest(span(badMagic)), WireError);
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldResult(span(bytes)), WireError);   // a request is not a result
    std::vector<std::uint8_t> trailing = bytes;
    trailing.push_back(0);
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldRequest(span(trailing)), WireError);
  }
};

QTEST_APPLESS_MAIN(TstMasterWire)
#include "tst_master_wire.moc"
