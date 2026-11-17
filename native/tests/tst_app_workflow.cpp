// Application workflow tests: the real controller, real Manifold, real worker.

#include <QtTest/QtTest>

#include <QSignalSpy>
#include <QTemporaryDir>

#include "AppController.h"
#include "AppPaths.h"
#include "ManifoldMeshEngine.h"

using namespace craft;
using namespace craft::app;

namespace {
QString bracket() { return QStringLiteral(CRAFT_REPO_ROOT "/native/tests/fixtures/models/bracket.stl"); }
QString fixtureStl(const char* n) {
  return QStringLiteral(CRAFT_REPO_ROOT "/mold/tests/fixtures/models/stl/") + QLatin1String(n);
}

analysis::WorkerConfig devConfig() { return AppPaths::analysisWorkerConfig(); }

std::unique_ptr<AppController> makeApp() {
  return std::make_unique<AppController>(std::shared_ptr<IMeshGeometryEngine>(createManifoldMeshEngine()),
                                         devConfig());
}

bool waitFor(const std::function<bool()>& done, int ms = 60000) {
  QElapsedTimer t; t.start();
  while (!done() && t.elapsed() < ms) QTest::qWait(20);
  return done();
}
}  // namespace

class WorkflowTest : public QObject {
  Q_OBJECT
 private slots:
  void importGroundsModelAndPopulatesScene() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    const LoadedModel& m = *app->model();
    QCOMPARE(m.sourceSoup->triangleCount(), std::size_t{20});
    // Bracket profile 40 x 30 x 12, centred on XY and resting on Z = 0.
    QCOMPARE(m.groundedBounds.min.z, 0.0);
    QCOMPARE(m.groundedBounds.size().x, 40.0);
    QVERIFY(std::fabs(m.groundedBounds.min.x + m.groundedBounds.max.x) < 1e-4);
    QCOMPARE(app->scene()->count(), 1);
    QVERIFY(app->scene()->visibleBounds().has_value());
  }

  void badFileKeepsPreviousModelAndReports() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    app->importStlFile(fixtureStl("truncated_binary.stl"));
    QVERIFY(waitFor([&] { return errors.count() == 1; }));
    QCOMPARE(errors.first().at(2).toString(), QStringLiteral("stl_parse_failed"));
    QCOMPARE(app->modelPhase(), QStringLiteral("ready"));
    QCOMPARE(app->model()->fileName, QStringLiteral("bracket.stl"));
  }

  void generateMoldProducesInspectableBodiesAndExports() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->setCutFaceEnabled("top", true);
    app->setCutFacePosition("top", 0.5);
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }));
    QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
    const MoldGenerationResult& r = *app->moldResult();
    QCOMPARE(r.cavity.bodies.size(), std::size_t{2});
    // Removed volume equals the part volume: L profile area 40*10 + 10*20 = 600 mm^2, 12 mm tall.
    QVERIFY(std::fabs(r.cavity.subtraction.removedVolumeMm3 - 600.0 * 12) < 1e-2);
    QCOMPARE(app->scene()->count(), 3);  // part + 2 bodies

    QTemporaryDir dir;
    QSignalSpy done(app.get(), &AppController::exportFinished);
    app->exportMoldBodiesTo(dir.path());
    QCOMPARE(done.count(), 1);
    QVERIFY(done.first().at(0).toBool());
    QCOMPARE(QDir(dir.path()).entryList({"*.stl"}).size(), 2);
  }

  void positiveCavityClearanceRunsEndToEnd() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->setCavityClearanceMm(1.0);
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }));
    QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
    QCOMPARE(app->moldSummary().value("offsetEngine").toString(), QStringLiteral("direct-minkowski"));
    // Offset tool is larger than the 7200 mm^3 part.
    QVERIFY(app->moldSummary().value("removedVolumeMm3").toDouble() > 7200.0);
    QCOMPARE(app->moldSummary().value("cavityClearanceMm").toDouble(), 1.0);
  }

  void sprueWorkflowPlaceEditRegenerateRemove() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    const double volumeBefore = app->moldSummary().value("bodies").toList().front().toMap().value("volumeMm3").toDouble();

    // Top view, then scan for a pixel over the cavity (the part's L shape).
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    app->setTool("sprue");
    QVERIFY(!app->placeSprueAt(2, 2, 800, 600));  // empty space: nothing to place on
    int placedAt = -1;
    for (int x = 100; x <= 700 && placedAt < 0; x += 10) {
      app->previewSprueAt(x, 300, 800, 600);
      if (app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, 300, 800, 600)) placedAt = x;
    }
    QVERIFY2(placedAt > 0, "no pixel over the cavity found");
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value(); }));
    QCOMPARE(app->sprueIntents().size(), std::size_t{1});
    QCOMPARE(app->sprueIntents().front().validation.status, std::string("resolved"));
    QCOMPARE(app->sprueEvaluation()->resolvedSprues.size(), std::size_t{1});
    const double volumeAfter = app->moldSummary().value("bodies").toList().front().toMap().value("volumeMm3").toDouble();
    QVERIFY(volumeAfter < volumeBefore);
    QCOMPARE(app->moldSummary().value("sprueCount").toULongLong(), qulonglong{1});
    QCOMPARE(app->scene()->count(), 2);  // part + one body

    // Resizing re-evaluates only the sprue stage and removes more material.
    const std::string id = app->sprueIntents().front().operationId;
    app->resizeSprue(QString::fromStdString(id), 6.0);
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy(); }));
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, 6.0);
    const double volumeResized = app->moldSummary().value("bodies").toList().front().toMap().value("volumeMm3").toDouble();
    QVERIFY(volumeResized < volumeAfter);

    // The intent survives a cavity regeneration and is resolved again.
    app->setCavityClearanceMm(0.5);
    QVERIFY(!app->moldResult().has_value());
    QCOMPARE(app->sprueIntents().front().validation.status, std::string("pending"));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }));
    QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
    QCOMPARE(app->sprueIntents().front().validation.status, std::string("resolved"));

    // Export carries the sprue cut.
    QTemporaryDir dir;
    app->exportMoldBodiesTo(dir.path());
    QCOMPARE(QDir(dir.path()).entryList({"*.stl"}).size(), 1);

    app->removeSprue(QString::fromStdString(id));
    QVERIFY(waitFor([&] { return app->sprueIntents().empty() && !app->busy(); }));
    QCOMPARE(app->moldSummary().value("sprueCount").toULongLong(), qulonglong{0});

    // A new import discards sprue intents.
    app->setTool("select");
    app->importStlFile(fixtureStl("closed_tetrahedron_ascii.stl"));
    QVERIFY(waitFor([&] { return app->model()->fileName == "closed_tetrahedron_ascii.stl"; }));
    QVERIFY(app->sprueIntents().empty());
  }

  void editingInputsDropsStaleResult() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    app->setMoldClearanceMm(20);
    QVERIFY(!app->moldResult().has_value());
    QCOMPARE(app->scene()->count(), 1);
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
  }

  void newImportDiscardsMold() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    app->importStlFile(fixtureStl("closed_tetrahedron_ascii.stl"));
    QVERIFY(waitFor([&] { return app->model()->fileName == "closed_tetrahedron_ascii.stl"; }));
    QVERIFY(!app->moldResult().has_value());
    QCOMPARE(app->scene()->count(), 1);
  }

  void pickingAndMeasuring() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    // The view centre is the empty notch of the L; sweep left to find the leg.
    int hitX = -1;
    for (int x = 400; x >= 100 && hitX < 0; x -= 10) {
      if (app->pickAt(x, 300, 800, 600) &&
          app->selection().value("normal").toMap().value("z").toDouble() > 0.999) hitX = x;  // top face, not a wall
    }
    QVERIFY(hitX > 0);
    QCOMPARE(app->selection().value("kind").toString(), QStringLiteral("part"));
    QVERIFY(std::fabs(app->selection().value("normal").toMap().value("z").toDouble() - 1.0) < 1e-6);
    QVERIFY(!app->pickAt(2, 2, 800, 600));
    app->setTool("measure");
    app->pickAt(hitX, 300, 800, 600);
    app->pickAt(hitX - 10, 300, 800, 600);
    QVERIFY(app->measurement().value("distanceMm").toDouble() > 0);
  }

  void importAnalysisRunsRealPythonEngine() {
    if (!QFileInfo::exists(devConfig().pythonExecutable)) QSKIP("No Python runtime configured.");
    auto app = makeApp();
    app->importStlFile(fixtureStl("closed_tetrahedron_ascii.stl"));
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->runImportAnalysis();
    QVERIFY(waitFor([&] { return app->analysisPhase() == "complete" || app->analysisPhase() == "error"; }, 60000));
    QVERIFY2(app->analysisPhase() == "complete", qPrintable(app->analysisError()));
    QCOMPARE(app->analysisReport().value("import_succeeded").toBool(), true);
    QVERIFY(!app->analysisReport().value("summary").toString().isEmpty());
  }
};

QTEST_MAIN(WorkflowTest)
#include "tst_app_workflow.moc"
