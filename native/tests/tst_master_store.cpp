// Master Mold store state machine, UI-state derivation and renderable
// selection, with expectations derived from masterMold.store.ts semantics.
// Reference equivalence of the engine-result mapping is in
// tst_master_equivalence.

#include <QtTest/QtTest>

#include "master/MasterMoldStore.h"
#include "master/MasterPlanning.h"

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

MasterToolingSet toolingSet(const std::string& partId, const std::string& mode, int pieceCount, bool verified = true, const std::string& fingerprint = "fp") {
  MasterToolingSet set;
  set.moldPartId = partId;
  set.moldPartName = "Part " + partId;
  set.castTargetVersion = "v-" + partId;
  set.sourceSignature = "sig-" + partId;
  set.releaseMode = mode;
  set.fingerprint = fingerprint + ":" + partId;
  for (int i = 0; i < pieceCount; ++i) {
    MasterToolingPiece piece;
    piece.pieceId = "piece-" + std::to_string(i + 1);
    piece.name = "Piece " + std::to_string(i + 1);
    piece.triangleCount = 12;
    piece.volumeMm3 = 100;
    set.assembly.pieces.push_back(piece);
    set.assembly.releaseSequence.push_back({i, piece.pieceId, "-Z", 5, verified, std::nullopt});
  }
  return set;
}

MasterToolingSetState state(const std::string& partId, const std::string& status, std::optional<MasterToolingSet> set, std::optional<std::string> failure = std::nullopt) {
  MasterToolingSetState s;
  s.moldPartId = partId;
  s.moldPartName = "Part " + partId;
  s.status = status;
  s.sourceSignature = "sig-" + partId;
  s.contentVersion = "v-" + partId;
  s.set = std::move(set);
  s.failureMessage = std::move(failure);
  return s;
}

MasterMoldResult resultWith(std::vector<MasterToolingSetState> sets) {
  MasterMoldResult r;
  r.sets = std::move(sets);
  r.workingMoldPieceCount = static_cast<int>(r.sets.size());
  r.warningCount = 1;
  return r;
}

MasterMoldResult goodResult() {
  return resultWith({state("a", "current", toolingSet("a", "one-piece", 1)), state("b", "current", toolingSet("b", "multi-piece", 2))});
}

}  // namespace

class MasterStoreTest : public QObject {
  Q_OBJECT

 private slots:
  void freshGenerateStartsAndCommits() {
    MasterMoldStore store;
    QCOMPARE(store.status(), std::string("unavailable"));
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    QVERIFY(!start.reused);
    QCOMPARE(start.generationVersion, 1);
    QCOMPARE(start.request->operationId, std::string("master-mold:1"));
    QVERIFY(start.request->priorSets.empty());
    QCOMPARE(store.status(), std::string("generating"));

    QVERIFY(store.commitGeneration(1, goodResult(), std::nullopt));
    QCOMPARE(store.status(), std::string("current"));
    QCOMPARE(store.sets().size(), std::size_t{2});
    QVERIFY(store.seedIdentity().has_value());
    QCOMPARE(store.summary()->masterToolingPieceCount, 3);
    QCOMPARE(store.summary()->onePieceCases, 1);
    QCOMPARE(store.summary()->multiPieceCases, 1);
    QVERIFY(store.summary()->allReleasesVerified);
  }

  void identicalSeedReusesWithoutRunning() {
    MasterMoldStore store;
    store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(1, goodResult(), std::nullopt);
    const auto again = store.beginGenerate(seedFor(), std::nullopt);
    QVERIFY(again.reused);
    QVERIFY(!again.request.has_value());
    QCOMPARE(again.generationVersion, 2);
    QCOMPARE(store.generationVersion(), 2);
    QCOMPARE(store.status(), std::string("current"));
  }

  void reuseRevivesStaleSetsAndHonoursALiveMismatch() {
    MasterMoldStore store;
    const MasterSeedSnapshot seed = seedFor();
    store.beginGenerate(seed, std::nullopt);
    store.commitGeneration(1, goodResult(), std::nullopt);
    store.markMasterMoldStale({"something-else", "x"});
    QCOMPARE(store.status(), std::string("stale"));
    // Back to the original inputs: stale overlay is shed.
    QVERIFY(store.beginGenerate(seed, std::nullopt).reused);
    QCOMPARE(store.status(), std::string("current"));
    // The live identity moved while the reuse path committed: flagged stale again.
    QVERIFY(store.beginGenerate(seed, std::string("moved")).reused);
    QCOMPARE(store.status(), std::string("stale"));
  }

  void changedInputsRunWithPriorSetsAndKeepEqualSets() {
    MasterMoldStore store;
    store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(1, goodResult(), std::nullopt);
    const auto start = store.beginGenerate(seedFor(Point3{200, 200, 200}), std::nullopt);
    QVERIFY(!start.reused);
    QCOMPARE(start.request->priorSets.size(), std::size_t{2});
    QCOMPARE(store.status(), std::string("generating"));
    QVERIFY(store.commitGeneration(start.generationVersion, goodResult(), std::nullopt));
    QCOMPARE(store.status(), std::string("current"));
  }

  void staleMarkingIsIdempotentAndBumpsTheVersionOnce() {
    MasterMoldStore store;
    store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(1, goodResult(), std::nullopt);
    store.markMasterMoldStale(*store.seedIdentity());  // same identity: no-op
    QCOMPARE(store.status(), std::string("current"));
    QCOMPARE(store.generationVersion(), 1);
    store.markMasterMoldStale({"changed", "r"});
    QCOMPARE(store.status(), std::string("stale"));
    QCOMPARE(store.generationVersion(), 2);
    for (const auto& s : store.sets()) QCOMPARE(s.status, std::string("stale"));
    store.markMasterMoldStale({"changed-again", "r"});  // everything already stale
    QCOMPARE(store.generationVersion(), 2);
  }

  void staleBeforeAnyResultIsIgnored() {
    MasterMoldStore store;
    store.markMasterMoldStale({"x", "y"});
    QCOMPARE(store.status(), std::string("unavailable"));
    QCOMPARE(store.generationVersion(), 0);
  }

  void resetSupersedesAnInFlightRun() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    store.reset();
    QCOMPARE(store.status(), std::string("unavailable"));
    QVERIFY(store.generationVersion() > start.generationVersion);
    QVERIFY(!store.commitGeneration(start.generationVersion, goodResult(), std::nullopt));
    QVERIFY(!store.failGeneration(start.generationVersion, "late failure"));
    QCOMPARE(store.status(), std::string("unavailable"));
    QVERIFY(store.sets().empty());
  }

  void aNewerRunSupersedesAnOlderOne() {
    MasterMoldStore store;
    const auto first = store.beginGenerate(seedFor(), std::nullopt);
    const auto second = store.beginGenerate(seedFor(Point3{100, 100, 100}), std::nullopt);
    QVERIFY(second.generationVersion > first.generationVersion);
    QVERIFY(!store.commitGeneration(first.generationVersion, goodResult(), std::nullopt));
    QVERIFY(store.commitGeneration(second.generationVersion, goodResult(), std::nullopt));
  }

  void anInputChangeDuringARunCommitsStale() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    QVERIFY(store.commitGeneration(start.generationVersion, goodResult(), std::string("a-different-live-identity")));
    QCOMPARE(store.status(), std::string("stale"));
    QCOMPARE(store.sets().size(), std::size_t{2});  // geometry is kept, flagged stale
    for (const auto& s : store.sets()) QCOMPARE(s.status, std::string("stale"));
    QVERIFY(store.summary().has_value());
  }

  void failuresSurfaceThroughStatus() {
    MasterMoldStore store;
    const auto start = store.beginGenerate(seedFor(), std::nullopt);
    QVERIFY(store.failGeneration(start.generationVersion, "boom"));
    QCOMPARE(store.status(), std::string("error"));
    QCOMPARE(*store.lastError(), std::string("boom"));
    store.reportGenerationFailure("seed assembly failed");
    QCOMPARE(*store.lastError(), std::string("seed assembly failed"));
  }

  void visibilityToggleIsolateAndShowAllUseCompositeKeys() {
    MasterMoldStore store;
    store.beginGenerate(seedFor(), std::nullopt);
    store.commitGeneration(1, goodResult(), std::nullopt);  // both sets have a "piece-1"
    store.togglePieceVisibility(masterMoldPieceKey("a", "piece-1"));
    auto bodies = selectRenderableMasterMoldBodies(store.sets(), store.pieceVisibility());
    QCOMPARE(bodies.size(), std::size_t{3});
    QVERIFY(!bodies[0].visible);   // a:piece-1
    QVERIFY(bodies[1].visible);    // b:piece-1 is a different piece despite the same local id
    store.togglePieceVisibility(masterMoldPieceKey("a", "piece-1"));
    QVERIFY(selectRenderableMasterMoldBodies(store.sets(), store.pieceVisibility())[0].visible);
    store.isolateToolingSet("b");
    bodies = selectRenderableMasterMoldBodies(store.sets(), store.pieceVisibility());
    QVERIFY(!bodies[0].visible);
    QVERIFY(bodies[1].visible && bodies[2].visible);
    store.showAllPieces();
    for (const auto& b : selectRenderableMasterMoldBodies(store.sets(), store.pieceVisibility())) QVERIFY(b.visible);
  }

  void renderableSelectionKeepsStaleAndDropsBlocked() {
    std::vector<MasterToolingSetState> sets{state("a", "stale", toolingSet("a", "one-piece", 1)),
                                            state("b", "blocked", toolingSet("b", "sacrificial-recommended", 0), "no reusable tooling plan."),
                                            state("c", "blocked", std::nullopt, "failed")};
    const auto bodies = selectRenderableMasterMoldBodies(sets, {});
    QCOMPARE(bodies.size(), std::size_t{1});
    QVERIFY(bodies[0].stale);
    QCOMPARE(bodies[0].id, std::string("a:piece-1"));
    QCOMPARE(bodies[0].geometryIdentity, std::string("fp:a:piece-1"));
    QVERIFY(hasRenderableToolingGeometry(sets));
    QVERIFY(!hasRenderableToolingGeometry({sets[1], sets[2]}));
  }

  void uiStateDerivation() {
    const auto good = goodResult().sets;
    QCOMPARE(deriveMasterMoldUiState("unavailable", {}, std::nullopt).kind, std::string("idle"));
    QCOMPARE(deriveMasterMoldUiState("generating", good, std::nullopt).kind, std::string("generating"));
    QCOMPARE(deriveMasterMoldUiState("stale", good, std::nullopt).kind, std::string("stale"));
    const auto error = deriveMasterMoldUiState("error", {}, std::string("bad"));
    QCOMPARE(error.kind, std::string("error"));
    QCOMPARE(*error.message, std::string("bad"));
    QCOMPARE(deriveMasterMoldUiState("current", good, std::nullopt).kind, std::string("success"));

    std::vector<MasterToolingSetState> partial = good;
    partial.push_back(state("c", "blocked", std::nullopt, "no reusable tooling plan."));
    const auto p = deriveMasterMoldUiState("blocked", partial, std::nullopt);
    QCOMPARE(p.kind, std::string("partial-success"));
    QCOMPARE(p.validSetCount, 2);
    QCOMPARE(p.blockedSetCount, 1);
    QCOMPARE(p.blockedMessages, (std::vector<std::string>{"no reusable tooling plan."}));

    // A blocked-only result never looks like generated geometry.
    const std::vector<MasterToolingSetState> blockedOnly{state("x", "blocked", toolingSet("x", "sacrificial-recommended", 0)), state("y", "blocked", std::nullopt)};
    const auto b = deriveMasterMoldUiState("blocked", blockedOnly, std::nullopt);
    QCOMPARE(b.kind, std::string("blocked"));
    QCOMPARE(b.blockedMessages.back(), std::string("tooling could not be generated."));
    QCOMPARE(deriveMasterMoldUiState("current", {}, std::nullopt).kind, std::string("blocked"));
  }

  void overallStatusAndSummaryRules() {
    QCOMPARE(overallStatusOfSets({}), std::string("unavailable"));
    auto sets = goodResult().sets;
    QCOMPARE(overallStatusOfSets(sets), std::string("current"));
    sets[1].status = "blocked";
    QCOMPARE(overallStatusOfSets(sets), std::string("blocked"));
    sets[0].status = "stale";
    QCOMPARE(overallStatusOfSets(sets), std::string("stale"));  // stale wins over blocked
    // An unverified release sweep or a missing step prevents "all releases verified".
    auto unverified = goodResult();
    unverified.sets[0].set->assembly.releaseSequence[0].collisionVerified = false;
    QVERIFY(!summarizeGeneration(unverified.sets, 2, 0).allReleasesVerified);
    auto missing = goodResult();
    missing.sets[1].set->assembly.releaseSequence.pop_back();
    QVERIFY(!summarizeGeneration(missing.sets, 2, 0).allReleasesVerified);
    QVERIFY(!summarizeGeneration({}, 0, 0).allReleasesVerified);
  }

  void parametersAreStored() {
    MasterMoldStore store;
    QCOMPARE(store.parameters().wallThicknessMm, 3.0);
    store.setParameters(4.5, std::nullopt);
    QCOMPARE(store.parameters().wallThicknessMm, 4.5);
    QCOMPARE(store.parameters().bottomThicknessMm, 3.0);
  }
};

QTEST_APPLESS_MAIN(MasterStoreTest)
#include "tst_master_store.moc"
