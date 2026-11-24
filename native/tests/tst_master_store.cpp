// Master Mold store state machine, UI-state derivation and renderable selection for the two-master contract.

#include <QtTest/QtTest>

#include "master/MasterMoldStore.h"

using namespace craft;

namespace {

MasterSeedSnapshot seedFor(const std::optional<Point3>& printer = std::nullopt, const std::string& revision = "rev-1") {
  MasterSeedInput input;
  auto& g = input.sourcePartGeometry;
  g.modelId = "model";
  g.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0};
  g.indices = {0, 1, 2};
  g.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  g.localBounds = {{0, 0, 0}, {1, 1, 0}};
  g.geometryVersion = "geom";
  input.printerBuildVolume = printer;
  input.projectRevision = revision;
  return buildMasterMoldSeedSnapshot(input);
}

MeshPayload box(double x0, double y0, double z0, double x1, double y1, double z1) {
  MeshPayload m;
  const double v[8][3] = {{0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0}, {0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1}};
  for (const auto& p : v) m.positions.insert(m.positions.end(), {x0 + p[0] * (x1 - x0), y0 + p[1] * (y1 - y0), z0 + p[2] * (z1 - z0)});
  m.indices = {0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5};
  return m;
}

MasterMoldPlan validPlan(const std::string& fingerprint = "fp") {
  MasterMoldPlan p;
  p.sourceGeometryVersion = "geom";
  p.fingerprint = fingerprint;
  for (int i = 0; i < kMasterToolCount; ++i) {
    const auto id = static_cast<MasterToolId>(i);
    MasterTool& m = p.masters[static_cast<std::size_t>(i)];
    m.id = id;
    m.name = masterToolName(id);
    m.mesh = box(0, 0, 0, 10, 10, 10);
    m.facts = analyzeSolidBody(m.mesh);
    m.fillVolumeMm3 = 1000;
    m.minimumWallMm = 3;
    m.registrationFeatureIds = {i == 0 ? "A:key" : "B:key"};
    VirtualWorkingHalf& h = p.halves[static_cast<std::size_t>(i)];
    h.id = id;
    h.name = std::string("Working half ") + (i == 0 ? "A" : "B");
    h.mesh = box(0, 0, 0, 10, 10, 10);
    h.facts = analyzeSolidBody(h.mesh);
    h.releaseDirection = {0, 0, i == 0 ? 1.0 : -1.0};
    p.materials[static_cast<std::size_t>(i)] = estimateMasterMaterial(id, 1000, 0.1, std::nullopt);
  }
  const std::pair<MasterReleaseStage, MasterToolId> needed[] = {{MasterReleaseStage::MasterToWorkingMold, MasterToolId::A},
                                                               {MasterReleaseStage::MasterToWorkingMold, MasterToolId::B},
                                                               {MasterReleaseStage::WorkingMoldAssembly, MasterToolId::A},
                                                               {MasterReleaseStage::ProductRelease, MasterToolId::A}};
  for (const auto& [stage, subject] : needed) {
    MasterReleaseCheck c;
    c.stage = stage;
    c.subject = subject;
    c.verification = MasterVerification::Verified;
    c.direction = {0, 0, 1};
    c.method = "test";
    p.releaseChecks.push_back(c);
  }
  p.fidelity = {0.05, 0.01, true, "test"};
  p.residualUncertainty = {"Digital validation only."};
  return p;
}

MasterMoldResult successResult(int generation, const std::string& fingerprint = "fp") {
  MasterMoldResult r;
  r.operationId = "master-mold:" + std::to_string(generation);
  r.generationVersion = generation;
  r.outcome = makeMasterOutcome(validPlan(fingerprint), 5);
  return r;
}

MasterMoldResult failureResult(int generation, MasterOutcomeCode code = MasterOutcomeCode::NoFeasiblePlan) {
  MasterMoldResult r;
  r.operationId = "master-mold:" + std::to_string(generation);
  r.generationVersion = generation;
  MasterFailure f;
  f.code = code;
  f.message = "no flat seam";
  r.outcome = makeMasterFailure(f, 5);
  return r;
}

}  // namespace

class TstMasterStore : public QObject {
  Q_OBJECT
 private slots:
  void start_isIdle() {
    MasterMoldStore store;
    QCOMPARE(store.status(), std::string("unavailable"));
    QCOMPARE(deriveMasterMoldUiState(store.status(), store.failure(), store.lastError()).kind, std::string("idle"));
  }
  void generating_thenSuccessCommitsTwoMasters() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    QVERIFY(!start.reused && start.request);
    QCOMPARE(store.status(), std::string("generating"));
    QVERIFY(store.commitGeneration(start.generationVersion, successResult(start.generationVersion), std::nullopt));
    QCOMPARE(store.status(), std::string("current"));
    QVERIFY(store.plan());
    QVERIFY(store.summary()->allReleasesVerified);
    QCOMPARE(store.summary()->masterCount, 2);
    QCOMPARE(deriveMasterMoldUiState(store.status(), store.failure(), store.lastError()).kind, std::string("success"));
  }
  void sameInputs_reuseTheCurrentResult() {
    MasterMoldStore store;
    const auto seed = seedFor();
    const auto first = store.beginGenerate(seed, std::nullopt);
    store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt);
    const auto again = store.beginGenerate(seed, std::nullopt);
    QVERIFY(again.reused);
    QVERIFY(store.plan());
    QCOMPARE(store.status(), std::string("current"));
  }
  void changedInputs_runAgainAndNeverReuse() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt);
    const auto other = store.beginGenerate(seedFor(Point3{100, 100, 100}), std::nullopt);
    QVERIFY(!other.reused);
    QVERIFY(other.request);
  }
  void aFailureNeverLeavesAnEarlierResultBehind() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt);
    const auto second = store.beginGenerate(seedFor(Point3{100, 100, 100}), std::nullopt);
    QVERIFY(store.commitGeneration(second.generationVersion, failureResult(second.generationVersion), std::nullopt));
    QCOMPARE(store.status(), std::string("blocked"));
    QVERIFY(!store.plan());
    QVERIFY(!store.summary());
    QCOMPARE(store.failure()->code, MasterOutcomeCode::NoFeasiblePlan);
    QVERIFY(selectRenderableMasterMoldBodies(store.status(), store.plan().get(), store.visibility()).empty());
    QCOMPARE(deriveMasterMoldUiState(store.status(), store.failure(), store.lastError()).kind, std::string("blocked"));
  }
  void failedRunAndResetClearTheResult() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt);
    const auto second = store.beginGenerate(seedFor(Point3{1, 1, 1}), std::nullopt);
    QVERIFY(store.failGeneration(second.generationVersion, "boom"));
    QCOMPARE(store.status(), std::string("error"));
    QVERIFY(!store.plan());
    QCOMPARE(*store.lastError(), std::string("boom"));
    store.reset();
    QCOMPARE(store.status(), std::string("unavailable"));
  }
  void aSupersededRunIsIgnored() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    store.reset();  // a reset while the run is in flight
    QVERIFY(!store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt));
    QVERIFY(!store.failGeneration(first.generationVersion, "late"));
    QCOMPARE(store.status(), std::string("unavailable"));
  }
  void changedContext_makesTheResultStale_andStaleIsGhostedNotExportable() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt);
    store.markMasterMoldStale({"another-identity", "rev-2"});
    QCOMPARE(store.status(), std::string("stale"));
    QVERIFY(store.plan());
    const auto bodies = selectRenderableMasterMoldBodies(store.status(), store.plan().get(), store.visibility());
    QCOMPARE(bodies.size(), std::size_t{4});
    for (const auto& b : bodies) QVERIFY(b.stale);
    QCOMPARE(deriveMasterMoldUiState(store.status(), store.failure(), store.lastError()).kind, std::string("stale"));
  }
  void resultThatIsStaleAtCommit_isCommittedAsStale() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    QVERIFY(store.commitGeneration(start.generationVersion, successResult(start.generationVersion), std::string("a-different-live-identity")));
    QCOMPARE(store.status(), std::string("stale"));
  }

  void bodies_areTwoMastersAndTwoHalves_halvesHiddenByDefault() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(start.generationVersion, successResult(start.generationVersion), std::nullopt);
    const auto bodies = selectRenderableMasterMoldBodies(store.status(), store.plan().get(), store.visibility());
    QCOMPARE(bodies.size(), std::size_t{4});
    QCOMPARE(bodies[0].id, std::string("master-a"));
    QCOMPARE(bodies[1].id, std::string("master-b"));
    QVERIFY(bodies[0].visible && bodies[1].visible);
    QVERIFY(bodies[0].inPrintFrame && bodies[1].inPrintFrame);
    QCOMPARE(bodies[2].id, std::string("half-a"));
    QVERIFY(!bodies[2].visible && !bodies[3].visible);
    QVERIFY(!bodies[2].inPrintFrame);
  }
  void visibility_toggleIsolateShowAll() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(start.generationVersion, successResult(start.generationVersion), std::nullopt);
    store.togglePieceVisibility("master-a");
    QVERIFY(!store.visible("master-a"));
    store.togglePieceVisibility("half-b");
    QVERIFY(store.visible("half-b"));
    store.isolateSet(kMasterSetHalves);
    QVERIFY(!store.visible("master-a") && !store.visible("master-b") && store.visible("half-a") && store.visible("half-b"));
    store.showAllPieces();
    for (const char* k : {"master-a", "master-b", "half-a", "half-b"}) QVERIFY(store.visible(k));
  }
  void commitClearsEarlierVisibilityChoices() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(first.generationVersion, successResult(first.generationVersion), std::nullopt);
    store.togglePieceVisibility("master-a");
    const auto second = store.beginGenerate(seedFor(Point3{9, 9, 9}), std::nullopt);
    store.commitGeneration(second.generationVersion, successResult(second.generationVersion, "fp2"), std::nullopt);
    QVERIFY(store.visible("master-a"));
  }

  void identity_dependsOnTheProfileAndTheContract() {
    MasterProcessProfile other;
    other.masterWallMm = 6;
    QVERIFY(masterSeedStalenessIdentity("v", std::nullopt, MasterProcessProfile{}) != masterSeedStalenessIdentity("v", std::nullopt, other));
    QVERIFY(masterSeedStalenessIdentity("v", std::nullopt, MasterProcessProfile{}) == masterSeedStalenessIdentity("v", std::nullopt, MasterProcessProfile{}));
    QVERIFY(masterSeedStalenessIdentity("v", Point3{1, 2, 3}, MasterProcessProfile{}) != masterSeedStalenessIdentity("v", std::nullopt, MasterProcessProfile{}));
  }
  void memoryEstimate_growsWithTriangles() { QVERIFY(estimateMasterMoldPeakBytes(100000) > estimateMasterMoldPeakBytes(1000)); }
};

QTEST_APPLESS_MAIN(TstMasterStore)
#include "tst_master_store.moc"
