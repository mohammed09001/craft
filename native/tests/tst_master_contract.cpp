// The Master Mold result contract (version 2): exactly two independent masters and two virtual working halves, or a structured failure.
//
// The point of these tests is that a success cannot be fabricated: every invariant is broken one at a time on an otherwise valid plan, and the
// outcome must stop being a success and say why. The valid fixture is built from boxes, which are just closed solids -- this is a contract test, not
// a geometry test.

#include <QtTest>

#include <algorithm>

#include "master/MasterContract.h"
#include "master/MasterWire.h"

using namespace craft;

namespace {

MeshPayload boxMesh(double sx, double sy, double sz, double ox = 0, double oy = 0, double oz = 0) {
  MeshPayload m;
  const double v[8][3] = {{0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0}, {0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1}};
  for (const auto& p : v) {
    m.positions.push_back(ox + p[0] * sx);
    m.positions.push_back(oy + p[1] * sy);
    m.positions.push_back(oz + p[2] * sz);
  }
  m.indices = {0, 3, 2, 0, 2, 1,  4, 5, 6, 4, 6, 7,  0, 1, 5, 0, 5, 4,  3, 7, 6, 3, 6, 2,  0, 4, 7, 0, 7, 3,  1, 2, 6, 1, 6, 5};
  return m;
}

MeshPayload twoBoxes() {
  MeshPayload a = boxMesh(10, 10, 10), b = boxMesh(10, 10, 10, 50, 0, 0);
  const std::uint32_t base = static_cast<std::uint32_t>(a.vertexCount());
  a.positions.insert(a.positions.end(), b.positions.begin(), b.positions.end());
  for (const std::uint32_t i : b.indices) a.indices.push_back(i + base);
  return a;
}

MasterReleaseCheck check(MasterReleaseStage stage, MasterToolId subject) {
  MasterReleaseCheck c;
  c.stage = stage;
  c.subject = subject;
  c.verification = MasterVerification::Verified;
  c.direction = {0, 0, 1};
  c.marginMm = 0.2;
  c.method = "swept-volume-conservative";
  return c;
}

MasterMoldPlan validPlan() {
  MasterMoldPlan p;
  p.sourceGeometryVersion = "part_mesh:test";
  p.fingerprint = "master-plan:test";
  for (int i = 0; i < kMasterToolCount; ++i) {
    const auto id = static_cast<MasterToolId>(i);
    MasterTool& m = p.masters[static_cast<std::size_t>(i)];
    m.id = id;
    m.name = masterToolName(id);
    m.mesh = boxMesh(10, 10, 10);
    m.facts = analyzeSolidBody(m.mesh);
    m.fillVolumeMm3 = 1000;
    m.minimumWallMm = 3;
    m.registrationFeatureIds = {i == 0 ? "key-male" : "key-female"};
    VirtualWorkingHalf& h = p.halves[static_cast<std::size_t>(i)];
    h.id = id;
    h.name = std::string("Working half ") + (i == 0 ? "A" : "B");
    h.mesh = boxMesh(10, 10, 10);
    h.facts = analyzeSolidBody(h.mesh);
    h.releaseDirection = {0, 0, i == 0 ? 1.0 : -1.0};
    p.materials[static_cast<std::size_t>(i)] = estimateMasterMaterial(id, 1000, 0.1, std::nullopt);
  }
  p.releaseChecks = {check(MasterReleaseStage::MasterToWorkingMold, MasterToolId::A), check(MasterReleaseStage::MasterToWorkingMold, MasterToolId::B),
                     check(MasterReleaseStage::WorkingMoldAssembly, MasterToolId::A), check(MasterReleaseStage::ProductRelease, MasterToolId::A)};
  p.fidelity = {0.05, 0.01, true, "test"};
  p.residualUncertainty = {"Digital validation only: shrinkage, adhesion, print quality and material behaviour are not modelled."};
  return p;
}

bool mentions(const std::vector<std::string>& v, const std::string& needle) {
  return std::any_of(v.begin(), v.end(), [&](const std::string& s) { return s.find(needle) != std::string::npos; });
}

}  // namespace

class TstMasterContract : public QObject {
  Q_OBJECT
 private slots:
  void bodyFacts_closedBoxIsOneWatertightSolid() {
    const MasterBodyFacts f = analyzeSolidBody(boxMesh(2, 3, 4));
    QCOMPARE(f.componentCount, 1);
    QVERIFY(f.watertight);
    QVERIFY(f.manifold);
    QCOMPARE(f.volumeMm3, 24.0);
    QCOMPARE(f.triangleCount, 12);
  }
  void bodyFacts_twoSeparateBodiesAreCounted() { QCOMPARE(analyzeSolidBody(twoBoxes()).componentCount, 2); }
  void bodyFacts_openSurfaceIsNotWatertight() {
    MeshPayload m = boxMesh(1, 1, 1);
    m.indices.resize(m.indices.size() - 3);
    QVERIFY(!analyzeSolidBody(m).watertight);
  }
  void bodyFacts_invertedSolidHasNegativeVolume() {
    MeshPayload m = boxMesh(1, 1, 1);
    for (std::size_t i = 0; i < m.indices.size(); i += 3) std::swap(m.indices[i + 1], m.indices[i + 2]);
    QVERIFY(analyzeSolidBody(m).volumeMm3 < 0);
  }
  void bodyFacts_triangleSoupMatchesIndexedMesh() {
    const MeshPayload indexed = boxMesh(2, 2, 2);
    MeshPayload soup;
    for (const std::uint32_t i : indexed.indices) for (int a = 0; a < 3; ++a) soup.positions.push_back(indexed.positions[3 * i + a]);
    for (std::uint32_t i = 0; i < indexed.indices.size(); ++i) soup.indices.push_back(i);
    const MasterBodyFacts f = analyzeSolidBody(soup);
    QCOMPARE(f.componentCount, 1);
    QVERIFY(f.watertight);
    QCOMPARE(f.volumeMm3, 8.0);
  }

  void validPlan_isASuccess() {
    const MasterMoldOutcome o = makeMasterOutcome(validPlan(), 12.5);
    QVERIFY2(o.success(), o.failure ? o.failure->diagnostics.front().c_str() : "no failure object");
    QVERIFY(o.plan.has_value());
    QVERIFY(!o.failure.has_value());
    QCOMPARE(o.plan->masters.size(), std::size_t{2});
    QCOMPARE(std::string(o.plan->masters[0].name), std::string("Master A"));
    QCOMPARE(std::string(o.plan->masters[1].name), std::string("Master B"));
  }
  void anyBrokenInvariant_isNeverASuccess_data() {
    QTest::addColumn<int>("which");
    QTest::addColumn<QString>("expected");
    QTest::newRow("master is two bodies") << 0 << "exactly one connected body";
    QTest::newRow("master is open") << 1 << "not a closed watertight";
    QTest::newRow("working half is two bodies") << 2 << "working half: expected exactly one connected body";
    QTest::newRow("master B id out of order") << 3 << "id out of order";
    QTest::newRow("assembly stage missing") << 4 << "missing release check: working_mold_assembly";
    QTest::newRow("product release unverified") << 5 << "not verified: product_release";
    QTest::newRow("a release check is blocked") << 6 << "release check is blocked";
    QTest::newRow("fidelity not measured") << 7 << "fidelity was not measured";
    QTest::newRow("fidelity out of tolerance") << 8 << "beyond the declared tolerance";
    QTest::newRow("same key on both masters") << 9 << "polarity must be complementary";
    QTest::newRow("mass without density") << 10 << "mass must be reported exactly when a density";
    QTest::newRow("fill volume mismatch") << 11 << "does not match its working half";
    QTest::newRow("no residual uncertainty") << 12 << "residual uncertainty must be stated";
    QTest::newRow("master without wall thickness") << 13 << "thickness not reported";
    QTest::newRow("verification without a method") << 14 << "without a recorded method";
    QTest::newRow("stale contract version") << 15 << "contract version";
  }
  void anyBrokenInvariant_isNeverASuccess() {
    QFETCH(int, which);
    QFETCH(QString, expected);
    MasterMoldPlan p = validPlan();
    switch (which) {
      case 0: p.masters[0].mesh = twoBoxes(); p.masters[0].fillVolumeMm3 = 1000; break;
      case 1: p.masters[1].mesh.indices.resize(p.masters[1].mesh.indices.size() - 3); break;
      case 2: p.halves[0].mesh = twoBoxes(); break;
      case 3: p.masters[1].id = MasterToolId::A; break;
      case 4: p.releaseChecks.erase(p.releaseChecks.begin() + 2); break;
      case 5: p.releaseChecks[3].verification = MasterVerification::Unverified; break;
      case 6: p.releaseChecks[0].verification = MasterVerification::Blocked; break;
      case 7: p.fidelity.measured = false; break;
      case 8: p.fidelity.maxDeviationMm = 0.5; break;
      case 9: p.masters[1].registrationFeatureIds = p.masters[0].registrationFeatureIds; break;
      case 10: p.materials[0].massG = 5.0; break;
      case 11: p.masters[0].fillVolumeMm3 = 600; p.materials[0].fillVolumeMm3 = 600; break;
      case 12: p.residualUncertainty.clear(); break;
      case 13: p.masters[0].minimumWallMm = 0; break;
      case 14: p.releaseChecks[1].method.clear(); break;
      case 15: p.contractVersion = 1; break;
    }
    const MasterMoldOutcome o = makeMasterOutcome(p, 1);
    QVERIFY(!o.success());
    QVERIFY(!o.plan.has_value());
    QVERIFY(o.failure.has_value());
    QCOMPARE(o.code, MasterOutcomeCode::InternalError);
    QVERIFY2(mentions(o.failure->diagnostics, expected.toStdString()), qPrintable("diagnostics did not mention: " + expected));
  }
  void fewerOrMoreThanTwoMastersIsUnrepresentable() {
    static_assert(std::tuple_size_v<decltype(MasterMoldPlan::masters)> == 2, "the contract carries exactly two masters");
    static_assert(std::tuple_size_v<decltype(MasterMoldPlan::halves)> == 2, "the contract carries exactly two virtual working halves");
    static_assert(kMasterToolCount == 2);
  }

  void failure_neverCarriesTheSuccessCode() {
    MasterFailure f;
    f.code = MasterOutcomeCode::Success;
    f.message = "x";
    const MasterMoldOutcome o = makeMasterFailure(f, 0);
    QVERIFY(!o.success());
    QCOMPARE(o.code, MasterOutcomeCode::InternalError);
  }
  void blockedRelease_namesItsStage() {
    MasterFailure f;
    f.code = MasterOutcomeCode::BlockedRelease;
    f.stage = MasterReleaseStage::ProductRelease;
    f.message = "witnessed obstruction";
    const MasterMoldOutcome o = makeMasterFailure(f, 3);
    QCOMPARE(o.code, MasterOutcomeCode::BlockedRelease);
    QCOMPARE(std::string(masterReleaseStageName(o.failure->stage)), std::string("product_release"));
  }
  void outcomeCodeNames_roundTrip() {
    for (const MasterOutcomeCode c : {MasterOutcomeCode::Success, MasterOutcomeCode::InvalidInput, MasterOutcomeCode::NoFeasiblePlan, MasterOutcomeCode::BlockedRelease,
                                      MasterOutcomeCode::UnresolvedVerification, MasterOutcomeCode::ResourceLimit, MasterOutcomeCode::InternalError})
      QCOMPARE(masterOutcomeCodeFromName(masterOutcomeCodeName(c)), c);
  }

  void material_massIsVolumeTimesDensityWithWaste() {
    const MasterMaterialEstimate e = estimateMasterMaterial(MasterToolId::B, 50000, 0.10, 1.2);  // 50 cm^3 + 10% = 55 cm^3 x 1.2 g/cm^3
    QCOMPARE(e.volumeWithWasteMm3, 55000.0);
    QVERIFY(e.massG.has_value());
    QVERIFY(qAbs(*e.massG - 66.0) < 1e-9);
    QVERIFY(!estimateMasterMaterial(MasterToolId::A, 1000, 0, std::nullopt).massG.has_value());
  }

  void wire_successRoundTrips() {
    const MasterMoldOutcome o = makeMasterOutcome(validPlan(), 7);
    QVERIFY(o.success());
    const std::vector<std::uint8_t> bytes = encodeMasterMoldOutcome(o);
    const MasterMoldOutcome back = decodeMasterMoldOutcome(bytes);
    QVERIFY(back.success());
    QCOMPARE(back.plan->fingerprint, o.plan->fingerprint);
    QCOMPARE(back.plan->masters[1].mesh.positions, o.plan->masters[1].mesh.positions);
    QCOMPARE(back.plan->halves[0].mesh.indices, o.plan->halves[0].mesh.indices);
    QCOMPARE(back.plan->releaseChecks.size(), o.plan->releaseChecks.size());
    QCOMPARE(encodeMasterMoldOutcome(back), bytes);
  }
  void wire_failureRoundTrips() {
    MasterFailure f;
    f.code = MasterOutcomeCode::UnresolvedVerification;
    f.stage = MasterReleaseStage::WorkingMoldAssembly;
    f.message = "interval left unverified";
    f.diagnostics = {"t in [0.40, 0.42]"};
    const MasterMoldOutcome back = decodeMasterMoldOutcome(encodeMasterMoldOutcome(makeMasterFailure(f, 9)));
    QCOMPARE(back.code, MasterOutcomeCode::UnresolvedVerification);
    QVERIFY(!back.plan.has_value());
    QCOMPARE(back.failure->stage, MasterReleaseStage::WorkingMoldAssembly);
    QCOMPARE(back.failure->diagnostics, f.diagnostics);
  }
  void wire_refusesASuccessWithoutAValidPlan() {
    MasterMoldOutcome forged;  // bypasses makeMasterOutcome on purpose
    forged.code = MasterOutcomeCode::Success;
    forged.plan = validPlan();
    forged.plan->releaseChecks[3].verification = MasterVerification::Unverified;
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldOutcome(encodeMasterMoldOutcome(forged)), WireError);
    MasterMoldOutcome empty;
    empty.code = MasterOutcomeCode::Success;
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldOutcome(encodeMasterMoldOutcome(empty)), WireError);
  }
  void wire_refusesTruncatedBytes() {
    std::vector<std::uint8_t> bytes = encodeMasterMoldOutcome(makeMasterOutcome(validPlan(), 1));
    bytes.resize(bytes.size() / 2);
    QVERIFY_EXCEPTION_THROWN(decodeMasterMoldOutcome(bytes), WireError);
  }
};

QTEST_APPLESS_MAIN(TstMasterContract)
#include "tst_master_contract.moc"
