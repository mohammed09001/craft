// Application workflow tests: the real controller, real Manifold, real worker.

#include <QtTest/QtTest>

#include <QSignalSpy>
#include <QTemporaryDir>

#include "AppController.h"
#include "AppPaths.h"
#include "ManifoldMeshEngine.h"
#include "geometry/MeshAnalysis.h"

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

  void splitMoldIsKeyedWithRegistration() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->setCutFaceEnabled("top", true);
    app->setCutFacePosition("top", 0.5);
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }));
    QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));

    const QVariantMap registration = app->moldSummary().value("registration").toMap();
    QVERIFY2(registration.value("status").toString() == "generated", qPrintable(registration.value("message").toString()));
    QCOMPARE(registration.value("interfaceCount").toULongLong(), qulonglong{1});
    QVERIFY(registration.value("featureCount").toULongLong() >= 2);
    QVERIFY(app->registrationState().has_value());
    QCOMPARE(app->registrationState()->bodies.size(), std::size_t{2});
    std::size_t keyTriangles = 0;
    for (const MoldBody& body : app->finalBodies()) {
      QVERIFY(meshTopology(body.mesh).closedManifold());
      for (const MeshFaceRun& run : body.mesh.faceRuns) {
        if (run.role == FaceRole::RegistrationKey) keyTriangles += run.triangleCount;
      }
    }
    QVERIFY(keyTriangles > 0);
    // Registration and the sprue stage compose: a sprue edit re-keys the mold.
    QVERIFY(app->moldIssues().isEmpty());
  }

  void unsplitMoldReportsRegistrationAsAWarning() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    const QVariantMap registration = app->moldSummary().value("registration").toMap();
    QCOMPARE(registration.value("status").toString(), QStringLiteral("blocked"));
    QCOMPARE(registration.value("reasonCode").toString(), QStringLiteral("registration_interface_not_found"));
    const QVariantList issues = app->moldIssues();
    QCOMPARE(issues.size(), 1);
    QCOMPARE(issues.front().toMap().value("code").toString(), QStringLiteral("registration_interface_not_found"));
  }

  void segmentationPlansCutsKeysAndFeedsTheMoldPipeline() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));

    // Nothing to plan without a printer volume; invalid volumes are rejected.
    app->setPrinterVolume(-1, 100, 100);
    QVERIFY(app->printerVolume().isEmpty());

    // The bracket's automatic block is 240 x 230 x 212 mm (>= 100 mm clearance each side).
    app->setPrinterVolume(300, 300, 300);
    app->planSegmentation();
    QCOMPARE(app->segmentation().value("phase").toString(), QStringLiteral("not-required"));

    app->setPrinterVolume(150, 300, 300);
    QCOMPARE(app->segmentation().value("phase").toString(), QStringLiteral("idle"));  // volume change reset it
    app->planSegmentation();
    QCOMPARE(app->segmentation().value("phase").toString(), QStringLiteral("planned"));
    QCOMPARE(app->segmentation().value("sectionCount").toULongLong(), qulonglong{2});
    QCOMPARE(app->segmentation().value("requiredAxes").toStringList(), QStringList{"x"});
    QCOMPARE(app->segmentation().value("availableAxes").toStringList(), (QStringList{"y", "z"}));
    QCOMPARE(app->scene()->count(), 3);  // part + two planned sections

    // A user extension on a free axis doubles the sections; a used axis is refused.
    app->addSegmentationExtension("y");
    QCOMPARE(app->segmentation().value("sectionCount").toULongLong(), qulonglong{4});
    QCOMPARE(app->segmentation().value("extensions").toList().size(), 1);
    app->addSegmentationExtension("x");
    QCOMPARE(app->segmentation().value("extensions").toList().size(), 1);
    app->moveSegmentationExtension("y", 500);  // outside the block: invalid, kept and reported
    QCOMPARE(app->segmentation().value("valid").toBool(), false);
    QVERIFY(!app->segmentation().value("blockers").toList().isEmpty());
    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    app->executeSegmentation();  // refused while invalid
    QCOMPARE(errors.count(), 1);
    app->moveSegmentationExtension("y", 0);
    QCOMPARE(app->segmentation().value("valid").toBool(), true);

    app->executeSegmentation();
    QVERIFY(waitFor([&] { return app->segmentation().value("phase").toString() != "executing" && !app->busy(); }));
    QCOMPARE(app->segmentation().value("phase").toString(), QStringLiteral("executed"));
    QVERIFY(app->segmentationAdopted());
    QCOMPARE(app->segmentationBodies().size(), std::size_t{4});
    QCOMPARE(app->scene()->count(), 5);
    for (const MoldBody& body : app->segmentationBodies()) QVERIFY(meshTopology(body.mesh).closedManifold());
    const QVariantMap execution = app->segmentation().value("execution").toMap();
    QCOMPARE(execution.value("bodyCount").toULongLong(), qulonglong{4});
    QCOMPARE(execution.value("registrationStatus").toString(), QStringLiteral("generated"));
    QVERIFY(execution.value("keyCount").toULongLong() > 0);

    // Cut by Face is disabled while a segmentation result is adopted.
    app->setCutFaceEnabled("top", true);
    QCOMPARE(app->cutFaces().at(4).toMap().value("face").toString(), QStringLiteral("top"));
    QVERIFY(!app->cutFaces().at(4).toMap().value("enabled").toBool());

    // The mold pipeline runs on the segmented bodies: cavity, then keys with the lineage policy.
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }));
    QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
    QVERIFY(app->moldResult()->definition.segmentationLineage);
    QCOMPARE(app->moldResult()->cavity.bodies.size(), std::size_t{4});
    QCOMPARE(app->moldResult()->definition.clearanceMm, 100.0);
    QCOMPARE(app->registrationState()->report->tolerancePolicy.maximumFeatureRadiusMm, 15.0);  // automatic sizing: 30 mm / 2
    QCOMPARE(app->moldSummary().value("registration").toMap().value("status").toString(), QStringLiteral("generated"));
    QCOMPARE(app->scene()->count(), 5);

    // Changing the clearance used by the block drops the segmentation and the mold.
    app->setMoldClearanceMm(120);
    QVERIFY(!app->moldResult().has_value());
    QVERIFY(!app->segmentationAdopted());
    QCOMPARE(app->segmentation().value("phase").toString(), QStringLiteral("idle"));
    QCOMPARE(app->scene()->count(), 1);

    app->planSegmentation();
    QCOMPARE(app->segmentation().value("moldClearanceMm").toDouble(), 120.0);
    app->resetSegmentation();
    QCOMPARE(app->scene()->count(), 1);
  }

  void masterMoldGeneratesShowsGhostsAndResets() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    const int partRows = app->scene()->count();
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("unavailable"));

    app->generateMasterMold();
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("generating"));
    QVERIFY(app->busy());
    QVERIFY(waitFor([&] { return app->masterMold().value("status").toString() != "generating" && !app->busy(); }, 120000));
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("current"));
    QCOMPARE(app->masterMold().value("uiKind").toString(), QStringLiteral("success"));
    const QVariantList sets = app->masterMold().value("sets").toList();
    QCOMPARE(sets.size(), 2);
    QVERIFY(app->masterMold().value("showPieces").toBool());
    QVERIFY(!app->masterMold().value("summaryLines").toStringList().isEmpty());
    // Tooling pieces are drawn next to the part.
    QCOMPARE(app->scene()->count(), partRows + 2);

    // Piece visibility goes through the store and reaches the scene rows.
    const QString key = sets.at(0).toMap().value("pieces").toList().at(0).toMap().value("key").toString();
    app->toggleMasterPiece(key);
    QVERIFY(!app->masterMold().value("sets").toList().at(0).toMap().value("pieces").toList().at(0).toMap().value("visible").toBool());
    app->isolateMasterSet(sets.at(1).toMap().value("id").toString());
    QVERIFY(!app->masterMold().value("sets").toList().at(0).toMap().value("pieces").toList().at(0).toMap().value("visible").toBool());
    QVERIFY(app->masterMold().value("sets").toList().at(1).toMap().value("pieces").toList().at(0).toMap().value("visible").toBool());
    app->showAllMasterPieces();
    QVERIFY(app->masterMold().value("sets").toList().at(0).toMap().value("pieces").toList().at(0).toMap().value("visible").toBool());

    // Generating again with identical inputs reuses the result without running.
    const int version = app->masterMold().value("generationVersion").toInt();
    app->generateMasterMold();
    QVERIFY(!app->busy());
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("current"));
    QCOMPARE(app->masterMold().value("generationVersion").toInt(), version + 1);

    // A printer build-volume change is a Master input: the result stays visible but is flagged stale.
    app->setPrinterVolume(500, 500, 500);
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("stale"));
    QCOMPARE(app->masterMold().value("uiKind").toString(), QStringLiteral("stale"));
    QVERIFY(app->masterMold().value("banner").toString().contains("needs regeneration"));
    QCOMPARE(app->scene()->count(), partRows + 2);

    // Regenerating clears the stale flag.
    app->generateMasterMold();
    QVERIFY(waitFor([&] { return app->masterMold().value("status").toString() != "generating" && !app->busy(); }, 120000));
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("current"));

    app->resetMasterMold();
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("unavailable"));
    QCOMPARE(app->scene()->count(), partRows);
  }

  void masterMoldCancellationAndModelChange() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMasterMold();
    app->cancelCurrentJob();
    QVERIFY(waitFor([&] { return app->masterMold().value("status").toString() != "generating" && !app->busy(); }, 120000));
    // Cancellation surfaces as the reference does: an error status with the cancelled message.
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("error"));
    QVERIFY(app->masterMold().value("banner").toString().contains("cancelled"));
    QVERIFY(app->masterMold().value("bannerIsError").toBool());

    // Re-importing a model resets Master Mold entirely.
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready" && !app->busy(); }));
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("unavailable"));
  }

  void masterMoldWithoutAModelIsRefused() {
    auto app = makeApp();
    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    app->generateMasterMold();
    QCOMPARE(errors.count(), 1);
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("unavailable"));
    QVERIFY(!app->masterMold().value("canGenerate").toBool());
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
