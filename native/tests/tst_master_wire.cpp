// The Master Mold wire format (P0-5 phase 2): a real request and a real result survive a round trip exactly, and bad data is refused.
//
// The comparison is written separately from the format's own visitor on purpose: the visitor writes and reads every field with one function, so a field it
// forgot would be forgotten both ways and a re-encode comparison alone would not notice. The explicit comparison checks the fields that matter on a result the
// planner really produced.

#include <QtTest>

#include <cstring>

#include "ManifoldMeshEngine.h"
#include "master/MasterMoldStore.h"
#include "master/MasterWire.h"

using namespace craft;

namespace {

std::span<const std::uint8_t> span(const std::vector<std::uint8_t>& v) { return {v.data(), v.size()}; }

MeshPayload boxMesh(double sx, double sy, double sz) {
  MeshPayload m;
  const double v[8][3] = {{0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0}, {0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1}};
  for (const auto& p : v) m.positions.insert(m.positions.end(), {p[0] * sx, p[1] * sy, p[2] * sz});
  m.indices = {0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5};
  return m;
}

MasterMoldRequest requestFor(const MeshPayload& mesh, const std::string& name, const std::optional<Point3>& printer = std::nullopt) {
  MasterSeedInput input;
  auto& g = input.sourcePartGeometry;
  g.modelId = name;
  g.positions = mesh.positions;
  g.indices = mesh.indices;
  g.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  Bounds3 b = emptyBounds();
  for (std::size_t i = 0; i < mesh.vertexCount(); ++i)
    for (int a = 0; a < 3; ++a) {
      b.min[a] = std::min(b.min[a], mesh.positions[3 * i + static_cast<std::size_t>(a)]);
      b.max[a] = std::max(b.max[a], mesh.positions[3 * i + static_cast<std::size_t>(a)]);
    }
  g.localBounds = b;
  g.geometryVersion = "geom-" + name;
  input.printerBuildVolume = printer;
  input.projectRevision = "rev-1";
  input.processProfile.workingMoldDensityGPerCm3 = 1.6;
  MasterMoldRequest request;
  request.operationId = "master-mold:1";
  request.generationVersion = 1;
  request.seed = buildMasterMoldSeedSnapshot(input);
  return request;
}

void compareMesh(const MeshPayload& a, const MeshPayload& b) {
  QCOMPARE(a.positions, b.positions);
  QCOMPARE(a.indices, b.indices);
  QCOMPARE(a.faceRuns.size(), b.faceRuns.size());
}

}  // namespace

class TstMasterWire : public QObject {
  Q_OBJECT
 private slots:
  void aRealRequestAndResultRoundTripExactly() {
    const MasterMoldRequest request = requestFor(boxMesh(30, 20, 40), "box", Point3{220, 220, 250});
    const std::vector<std::uint8_t> requestBytes = encodeMasterMoldRequest(request);
    const MasterMoldRequest decoded = decodeMasterMoldRequest(span(requestBytes));
    QCOMPARE(decoded.operationId, request.operationId);
    QCOMPARE(decoded.generationVersion, request.generationVersion);
    QCOMPARE(decoded.seed.seedId, request.seed.seedId);
    QCOMPARE(decoded.seed.sourceMesh.positions, request.seed.sourceMesh.positions);
    QCOMPARE(decoded.seed.sourceMesh.indices, request.seed.sourceMesh.indices);
    QCOMPARE(decoded.seed.sourceTransform, request.seed.sourceTransform);
    QVERIFY(decoded.seed.sourceBounds == request.seed.sourceBounds);
    QVERIFY(decoded.seed.printerBuildVolume.has_value());
    QCOMPARE(decoded.seed.printerBuildVolume->z, 250.0);
    QCOMPARE(decoded.seed.processProfile.profileId, request.seed.processProfile.profileId);
    QCOMPARE(decoded.seed.processProfile.masterWallMm, request.seed.processProfile.masterWallMm);
    QVERIFY(decoded.seed.processProfile.workingMoldDensityGPerCm3.has_value());
    QCOMPARE(*decoded.seed.processProfile.workingMoldDensityGPerCm3, 1.6);
    QCOMPARE(decoded.seed.sourceProjectRevision, request.seed.sourceProjectRevision);
    QCOMPARE(encodeMasterMoldRequest(decoded), requestBytes);

    // Running the planner on the original and on the decoded request must agree, and the result must survive the wire untouched.
    auto engine = createManifoldMeshEngine();
    const MasterMoldResult result = evaluateMasterMoldGeneration(*engine, request);
    const MasterMoldResult fromDecoded = evaluateMasterMoldGeneration(*engine, decoded);
    QVERIFY(result.outcome.success());
    QVERIFY(fromDecoded.outcome.success());
    QCOMPARE(fromDecoded.outcome.plan->fingerprint, result.outcome.plan->fingerprint);

    const std::vector<std::uint8_t> resultBytes = encodeMasterMoldResult(result);
    const MasterMoldResult back = decodeMasterMoldResult(span(resultBytes));
    QCOMPARE(back.operationId, result.operationId);
    QCOMPARE(back.generationVersion, result.generationVersion);
    QVERIFY(back.outcome.success());
    const MasterMoldPlan& a = *result.outcome.plan;
    const MasterMoldPlan& b = *back.outcome.plan;
    QCOMPARE(b.fingerprint, a.fingerprint);
    QCOMPARE(b.sourceGeometryVersion, a.sourceGeometryVersion);
    QCOMPARE(b.seam.kind, a.seam.kind);
    QCOMPARE(b.seam.planeOffsetMm, a.seam.planeOffsetMm);
    QCOMPARE(b.warnings, a.warnings);
    QCOMPARE(b.residualUncertainty, a.residualUncertainty);
    QCOMPARE(b.fidelity.maxDeviationMm, a.fidelity.maxDeviationMm);
    QCOMPARE(b.fidelity.method, a.fidelity.method);
    QCOMPARE(b.releaseChecks.size(), a.releaseChecks.size());
    for (std::size_t i = 0; i < a.releaseChecks.size(); ++i) {
      QCOMPARE(static_cast<int>(b.releaseChecks[i].stage), static_cast<int>(a.releaseChecks[i].stage));
      QCOMPARE(static_cast<int>(b.releaseChecks[i].verification), static_cast<int>(a.releaseChecks[i].verification));
      QCOMPARE(b.releaseChecks[i].method, a.releaseChecks[i].method);
      QCOMPARE(b.releaseChecks[i].note, a.releaseChecks[i].note);
    }
    for (int i = 0; i < kMasterToolCount; ++i) {
      const auto k = static_cast<std::size_t>(i);
      QCOMPARE(b.masters[k].name, a.masters[k].name);
      compareMesh(b.masters[k].mesh, a.masters[k].mesh);
      QCOMPARE(b.masters[k].printFromModel, a.masters[k].printFromModel);
      QCOMPARE(b.masters[k].fillVolumeMm3, a.masters[k].fillVolumeMm3);
      QCOMPARE(b.masters[k].registrationFeatureIds, a.masters[k].registrationFeatureIds);
      QCOMPARE(b.masters[k].facts.volumeMm3, a.masters[k].facts.volumeMm3);
      QCOMPARE(b.masters[k].facts.componentCount, a.masters[k].facts.componentCount);
      compareMesh(b.halves[k].mesh, a.halves[k].mesh);
      QCOMPARE(b.halves[k].releaseDirection.z, a.halves[k].releaseDirection.z);
      QCOMPARE(b.materials[k].fillVolumeMm3, a.materials[k].fillVolumeMm3);
      QCOMPARE(b.materials[k].massG.has_value(), a.materials[k].massG.has_value());
    }
    QCOMPARE(encodeMasterMoldResult(back), resultBytes);   // nothing is lost or invented on the second pass either
    QVERIFY(a.masters[0].mesh.triangleCount() > 0);        // the row carried real content
  }

  void aFailureRoundTripsWithItsCodeAndStage() {
    MasterMoldResult result;
    result.operationId = "master-mold:2";
    result.generationVersion = 2;
    MasterFailure f;
    f.code = MasterOutcomeCode::BlockedRelease;
    f.stage = MasterReleaseStage::WorkingMoldAssembly;
    f.message = "half A is blocked";
    f.diagnostics = {"near (1, 2, 3)"};
    result.outcome = makeMasterFailure(f, 12);
    const MasterMoldResult back = decodeMasterMoldResult(span(encodeMasterMoldResult(result)));
    QVERIFY(!back.outcome.success());
    QCOMPARE(back.outcome.code, MasterOutcomeCode::BlockedRelease);
    QCOMPARE(back.outcome.failure->stage, MasterReleaseStage::WorkingMoldAssembly);
    QCOMPARE(back.outcome.failure->diagnostics, f.diagnostics);
  }

  void aForgedSuccessIsRefused() {
    MasterMoldResult forged;
    forged.outcome.code = MasterOutcomeCode::Success;  // no plan at all
    QVERIFY_THROWS_EXCEPTION(WireError, decodeMasterMoldResult(span(encodeMasterMoldResult(forged))));
  }

  void truncatedDataIsRefusedAtEveryLength() {
    const std::vector<std::uint8_t> bytes = encodeMasterMoldRequest(requestFor(boxMesh(10, 10, 10), "tiny"));
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
    QVERIFY_THROWS_EXCEPTION(WireError, decodeMasterMoldRequest(span(bytes)));
  }

  void wrongMagicWrongKindAndTrailingBytesAreRefused() {
    std::vector<std::uint8_t> bytes = encodeMasterMoldRequest(requestFor(boxMesh(10, 10, 10), "tiny"));
    std::vector<std::uint8_t> badMagic = bytes;
    badMagic[0] = 'X';
    QVERIFY_THROWS_EXCEPTION(WireError, decodeMasterMoldRequest(span(badMagic)));
    QVERIFY_THROWS_EXCEPTION(WireError, decodeMasterMoldResult(span(bytes)));   // a request is not a result
    std::vector<std::uint8_t> trailing = bytes;
    trailing.push_back(0);
    QVERIFY_THROWS_EXCEPTION(WireError, decodeMasterMoldRequest(span(trailing)));
  }
};

QTEST_APPLESS_MAIN(TstMasterWire)
#include "tst_master_wire.moc"
