// Application workflow tests: the real controller, real Manifold, real worker.

#include <QtTest/QtTest>

#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSignalSpy>
#include <QTemporaryDir>

#include <set>

#include "AppController.h"
#include "AppPaths.h"
#include "ManifoldMeshEngine.h"
#include "geometry/MeshAnalysis.h"
#include "project/ProjectFile.h"

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

  // --- selection: highlight, selection box, face hover, Cut by Face toggling (the reference viewport's behaviour) ----------

  void selectingThePartHighlightsItAndShowsTheBox() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    const auto partSelected = [&] { return app->scene()->data(app->scene()->index(0), SceneModel::SelectedRole).toBool(); };

    QVERIFY(!partSelected());
    QVERIFY(!app->selectionBox().value("visible").toBool());

    // The view starts in the notch of the L: sweep to a pixel on the part.
    int hitX = -1;
    for (int x = 400; x >= 100 && hitX < 0; x -= 10) {
      if (app->pickAt(x, 300, 800, 600)) hitX = x;
    }
    QVERIFY(hitX > 0);
    QCOMPARE(app->selection().value("kind").toString(), QStringLiteral("part"));
    QVERIFY(partSelected());
    QVERIFY(app->selectionBox().value("visible").toBool());
    QVERIFY(app->selectionBox().value("cutSelectionActive").toBool());
    QVERIFY(static_cast<viewport::LineGeometry*>(app->selectionBoxGeometry())->segmentCount() > 12);  // dashed, not 12 solid edges

    // Highlight colours come from the reference rule: yellow on the dark theme, blue on the light one.
    QCOMPARE(app->selectionStyle().value("highlightColor").value<QColor>(), QColor("#facc15"));
    app->setTheme("light");
    QCOMPARE(app->selectionStyle().value("highlightColor").value<QColor>(), QColor("#2563eb"));
    QCOMPARE(app->selectionStyle().value("background").toString(), QStringLiteral("#e9edf1"));

    // Clicking empty space clears everything.
    QVERIFY(!app->pickAt(2, 2, 800, 600));
    QVERIFY(!partSelected());
    QVERIFY(!app->selectionBox().value("visible").toBool());
    QVERIFY(app->selection().isEmpty());
  }

  void hoveringShowsTheBoxFaceNearestTheCamera() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");

    // Before anything is selected there is no box, hence no hovered face.
    QCOMPARE(app->selectionBox().value("hoverFace").toString(), QString());

    int hitX = -1;
    for (int x = 400; x >= 100 && hitX < 0; x -= 10) {
      if (app->pickAt(x, 300, 800, 600)) hitX = x;
    }
    QVERIFY(hitX > 0);
    QVERIFY(app->selectionBox().value("visible").toBool());

    // Seen from above, the face under the pointer is the top face (the nearest face of the box along the ray).
    QVERIFY(app->hoverAt(hitX, 300, 800, 600));
    QCOMPARE(app->selectionBox().value("hoverFace").toString(), QStringLiteral("top"));
    QCOMPARE(static_cast<viewport::MeshGeometry*>(app->hoverFaceGeometry())->triangleCount(), 2);

    // Over the notch of the L the ray still crosses the box (so the face shows), even though it misses the part.
    QVERIFY(app->hoverAt(400, 300, 800, 600));
    QCOMPARE(app->selectionBox().value("hoverFace").toString(), QStringLiteral("top"));

    // Outside the box there is no hover and the pointer is not over the part.
    QVERIFY(!app->hoverAt(2, 2, 800, 600));
    QCOMPARE(app->selectionBox().value("hoverFace").toString(), QString());
    QCOMPARE(static_cast<viewport::MeshGeometry*>(app->hoverFaceGeometry())->triangleCount(), 0);

    // Other tools have no hover.
    QVERIFY(app->hoverAt(hitX, 300, 800, 600));
    app->setTool("measure");
    QVERIFY(!app->hoverAt(hitX, 300, 800, 600));
    QCOMPARE(app->selectionBox().value("hoverFace").toString(), QString());
  }

  void clickingABoxFaceTogglesItsCutByFacePlane() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    const auto enabledFaces = [&] {
      QStringList faces;
      for (const QVariant& f : app->cutFaces()) {
        if (f.toMap().value("enabled").toBool()) faces << f.toMap().value("face").toString();
      }
      return faces;
    };
    QVERIFY(enabledFaces().isEmpty());

    // The first click selects the part (no box yet, nothing to toggle).
    int hitX = -1;
    for (int x = 400; x >= 100 && hitX < 0; x -= 10) {
      if (app->pickAt(x, 300, 800, 600)) hitX = x;
    }
    QVERIFY(hitX > 0);
    QVERIFY(enabledFaces().isEmpty());
    QVERIFY(app->selectionBox().value("selectedFaces").toStringList().isEmpty());

    // Now a click anywhere on the box toggles the face the pointer is over: from above, the top face.
    QVERIFY(app->pickAt(hitX, 300, 800, 600));
    QCOMPARE(enabledFaces(), QStringList{"top"});
    QCOMPARE(app->selectionBox().value("selectedFaces").toStringList(), QStringList{"top"});
    QCOMPARE(static_cast<viewport::MeshGeometry*>(app->selectedFacesGeometry())->triangleCount(), 2);
    QCOMPARE(app->selection().value("kind").toString(), QStringLiteral("part"));  // still selected
    QVERIFY(app->selectionBox().value("visible").toBool());

    // Clicking where the ray misses the part but crosses the box toggles too (and keeps the selection).
    QVERIFY(app->pickAt(400, 300, 800, 600));
    QVERIFY(enabledFaces().isEmpty());
    QVERIFY(app->selectionBox().value("selectedFaces").toStringList().isEmpty());
    QCOMPARE(static_cast<viewport::MeshGeometry*>(app->selectedFacesGeometry())->triangleCount(), 0);

    // From the front, the clicked face is "front" (+Y), the reference's naming.
    app->camera()->lookFrom("front");
    QVERIFY(app->pickAt(400, 300, 800, 600));
    QCOMPARE(enabledFaces(), QStringList{"front"});
  }

  void theBoxAndFaceTogglingStepAsideOnceTheMoldIsGenerated() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    int hitX = -1;
    for (int x = 400; x >= 100 && hitX < 0; x -= 10) {
      if (app->pickAt(x, 300, 800, 600)) hitX = x;
    }
    QVERIFY(hitX > 0);
    QVERIFY(app->selectionBox().value("visible").toBool());

    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() != "generating"; }, 120000));
    QCOMPARE(app->moldPhase(), QStringLiteral("complete"));
    // The reference hides the box while the cavity is generated/complete; the part itself stays highlighted.
    QVERIFY(!app->selectionBox().value("visible").toBool());
    QVERIFY(!app->selectionBox().value("cutSelectionActive").toBool());
    QVERIFY(app->scene()->data(app->scene()->index(0), SceneModel::SelectedRole).toBool());
    QCOMPARE(static_cast<viewport::LineGeometry*>(app->selectionBoxGeometry())->segmentCount(), 0);

    // Changing a mold input brings the mold down and the box back.
    app->setCutFaceEnabled("left", true);
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
    QVERIFY(app->selectionBox().value("visible").toBool());
    QCOMPARE(app->selectionBox().value("selectedFaces").toStringList(), QStringList{"left"});
  }

  void importingAnotherModelClearsTheSelection() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    int hitX = -1;
    for (int x = 400; x >= 100 && hitX < 0; x -= 10) {
      if (app->pickAt(x, 300, 800, 600)) hitX = x;
    }
    QVERIFY(hitX > 0);
    QVERIFY(app->selectionBox().value("visible").toBool());
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready" && app->selection().isEmpty(); }));
    QVERIFY(!app->selectionBox().value("visible").toBool());
    QVERIFY(!app->scene()->data(app->scene()->index(0), SceneModel::SelectedRole).toBool());
  }

  void masterToolingExportWritesEveryCurrentPieceAndRefusesStaleOnes() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QTemporaryDir out;
    QVERIFY(out.isValid());
    QSignalSpy finished(app.get(), &AppController::exportFinished);
    QSignalSpy errors(app.get(), &AppController::errorOccurred);

    // Nothing generated yet: nothing to export, the reason is reported, and no folder is created.
    QVERIFY(!app->masterMold().value("canExport").toBool());
    app->exportMasterToolingTo(out.filePath("none"));
    QVERIFY(waitFor([&] { return finished.count() == 1; }));
    QVERIFY(!finished.at(0).at(0).toBool());
    QCOMPARE(errors.count(), 1);
    QVERIFY(!QDir(out.filePath("none")).exists());

    app->generateMasterMold();
    QVERIFY(waitFor([&] { return app->masterMold().value("status").toString() != "generating" && !app->busy(); }, 120000));
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("current"));
    QVERIFY(app->masterMold().value("canExport").toBool());
    int expected = 0;
    for (const QVariant& set : app->masterMold().value("sets").toList()) expected += set.toMap().value("pieces").toList().size();
    QVERIFY(expected > 0);
    QCOMPARE(app->masterMold().value("exportablePieceCount").toInt(), expected);

    // Hiding a piece in the viewport does not remove it from the export.
    const QString firstKey = app->masterMold().value("sets").toList().at(0).toMap().value("pieces").toList().at(0).toMap().value("key").toString();
    app->toggleMasterPiece(firstKey);

    app->exportMasterToolingTo(out.filePath("export"));
    QVERIFY(app->masterMold().value("exporting").toBool());
    QVERIFY(!app->masterMold().value("canExport").toBool());  // one export at a time
    QVERIFY(waitFor([&] { return finished.count() == 2; }));
    QVERIFY2(finished.at(1).at(0).toBool(), qPrintable(finished.at(1).at(1).toString()));
    QVERIFY(!app->masterMold().value("exporting").toBool());
    QVERIFY(app->masterMold().value("canExport").toBool());

    const QVariantMap last = app->masterMold().value("lastExport").toMap();
    QCOMPARE(last.value("fileCount").toInt(), expected);
    const QString folder = last.value("folder").toString();
    QVERIFY(QDir(folder).exists());
    QVERIFY(folder.endsWith(QStringLiteral("bracket_master_tooling")));

    // The files and the manifest agree with each other and with the pieces the store holds.
    QFile manifestFile(QDir(folder).filePath("manifest.json"));
    QVERIFY(manifestFile.open(QIODevice::ReadOnly));
    const QJsonObject manifest = QJsonDocument::fromJson(manifestFile.readAll()).object();
    QCOMPARE(manifest.value("source").toObject().value("model").toString(), QStringLiteral("bracket.stl"));
    QCOMPARE(manifest.value("units").toString(), QStringLiteral("millimeters"));
    std::multiset<std::size_t> storeTriangles;
    for (const MasterToolingSetState& entry : app->masterMoldStore().sets()) {
      if (!entry.set) continue;
      for (const MasterToolingPiece& piece : entry.set->assembly.pieces) storeTriangles.insert(piece.mesh.triangleCount());
    }
    std::multiset<std::size_t> fileTriangles;
    int manifestPieces = 0;
    for (const QJsonValue& setValue : manifest.value("toolingSets").toArray()) {
      for (const QJsonValue& pieceValue : setValue.toObject().value("pieces").toArray()) {
        const QJsonObject piece = pieceValue.toObject();
        ++manifestPieces;
        const QString path = QDir(folder).filePath(piece.value("file").toString());
        const stl::ReadResult read = stl::readFile(std::filesystem::path(path.toStdWString()));
        QCOMPARE(static_cast<int>(read.facetCount), piece.value("triangleCount").toInt());
        fileTriangles.insert(read.facetCount);
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(QString::fromLatin1(QCryptographicHash::hash(file.readAll(), QCryptographicHash::Sha256).toHex()), piece.value("sha256").toString());
        QVERIFY(piece.value("volumeMm3").toDouble() > 0);
      }
    }
    QCOMPARE(manifestPieces, expected);
    QVERIFY(fileTriangles == storeTriangles);
    QCOMPARE(QDir(folder).entryList(QDir::Files).size(), expected + 1);  // the STLs and manifest.json

    // Once the part's context changes, the tooling is stale: it is not exported, and the reason says what to do.
    app->setPrinterVolume(500, 500, 500);
    QCOMPARE(app->masterMold().value("status").toString(), QStringLiteral("stale"));
    QVERIFY(!app->masterMold().value("canExport").toBool());
    app->exportMasterToolingTo(out.filePath("export"));
    QVERIFY(waitFor([&] { return finished.count() == 3; }));
    QVERIFY(!finished.at(2).at(0).toBool());
    QVERIFY(finished.at(2).at(1).toString().contains("regenerate"));
    QCOMPARE(QDir(out.filePath("export")).entryList(QDir::Dirs | QDir::NoDotAndDotDot).size(), 1);  // nothing new was created
    QCOMPARE(app->masterMold().value("lastExport").toMap().value("folder").toString(), folder);      // the earlier result stays described

    // Regenerating starts a new history: the old export notice is gone.
    app->generateMasterMold();
    QVERIFY(app->masterMold().value("lastExport").toMap().isEmpty());
    QVERIFY(waitFor([&] { return app->masterMold().value("status").toString() != "generating" && !app->busy(); }, 120000));
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

  // --- engineering reports: the real Python detailed mold analysis through the real worker --------------------------------

  // --- project save / open / autosave / recovery ----------------------------------------------------------------------------

  void initTestCase() {
    // Autosave files and materialized models must never touch the real user data directories.
    static QTemporaryDir isolated;
    QVERIFY(isolated.isValid());
    qputenv("CRAFT_AUTOSAVE_DIR", isolated.filePath("autosave").toLocal8Bit());
    qputenv("CRAFT_CACHE_DIR", isolated.filePath("cache").toLocal8Bit());
  }

  static QList<double> bodyVolumes(AppController& app) {
    QList<double> volumes;
    for (const QVariant& b : app.moldSummary().value("bodies").toList()) volumes << b.toMap().value("volumeMm3").toDouble();
    return volumes;
  }

  static bool waitForProject(AppController& app, const QString& what) {
    return waitFor([&] { return !app.project().value(what).toBool(); }, 60000);
  }

  void projectRoundTripRestoresInputsAndRebuildsTheSameMold() {
    QTemporaryDir dir;
    const QString file = dir.filePath("bracket.craft");
    QList<double> volumesBefore;
    std::vector<SprueOperationDefinition> sprues;
    {
      auto app = makeApp();
      app->importStlFile(bracket());
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
      app->setMoldClearanceMm(14.5);
      app->setCavityClearanceMm(0.4);
      app->setCutFaceEnabled("front", true);
      app->setCutFacePosition("front", 0.4);
      app->generateMold();
      QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }));
      QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));

      app->camera()->setViewportSize(800, 600);
      app->camera()->lookFrom("top");
      app->setTool("sprue");
      bool placed = false;
      for (int x = 100; x <= 700 && !placed; x += 10) {
        app->previewSprueAt(x, 300, 800, 600);
        placed = app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, 300, 800, 600);
      }
      QVERIFY(placed);
      QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value(); }));
      app->resizeSprue(QString::fromStdString(app->sprueIntents().front().operationId), 5.5);
      QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy(); }));
      app->setTool("select");
      app->setTheme("light");
      app->setShowEdges(false);

      QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));
      QVERIFY(!app->project().value("hasPath").toBool());
      app->saveProjectToFile(file);
      QVERIFY(waitForProject(*app, "saving"));
      QVERIFY2(QFileInfo::exists(file), "the project file was not written");
      QCOMPARE(app->project().value("path").toString(), file);
      QVERIFY(waitFor([&] { return !app->project().value("dirty").toBool(); }, 5000));
      volumesBefore = bodyVolumes(*app);
      sprues = app->sprueIntents();
      QCOMPARE(volumesBefore.size(), 2);  // the enabled front cut splits the mold into two bodies
    }

    auto reopened = makeApp();
    reopened->openProjectFile(file);
    QVERIFY(waitFor([&] { return reopened->modelPhase() == "ready" && !reopened->project().value("opening").toBool(); }, 60000));
    // Inputs come back exactly.
    QCOMPARE(reopened->moldClearanceMm(), 14.5);
    QCOMPARE(reopened->cavityClearanceMm(), 0.4);
    const QVariantList faces = reopened->cutFaces();
    bool frontChecked = false;
    for (const QVariant& f : faces)
      if (f.toMap().value("face").toString() == "front") {
        frontChecked = true;
        QVERIFY(f.toMap().value("enabled").toBool());
        QCOMPARE(f.toMap().value("position").toDouble(), 0.4);
      }
    QVERIFY(frontChecked);
    QCOMPARE(reopened->theme(), QStringLiteral("light"));
    QVERIFY(!reopened->showEdges());
    QCOMPARE(reopened->sprueIntents().size(), sprues.size());
    QCOMPARE(reopened->sprueIntents().front().operationId, sprues.front().operationId);
    QCOMPARE(reopened->sprueIntents().front().position.x, sprues.front().position.x);
    QCOMPARE(reopened->sprueIntents().front().profileDesign.profile.mainDiameterMm, 5.5);

    // The derived mold is rebuilt from those inputs, and it is the same mold (volumes equal, sprue resolved again).
    QVERIFY(waitFor([&] { return reopened->moldPhase() == "complete" || reopened->moldPhase() == "error"; }, 120000));
    QVERIFY2(reopened->moldPhase() == "complete", qPrintable(reopened->moldError()));
    QVERIFY(waitFor([&] { return reopened->spruePhase() == "idle" && !reopened->busy(); }, 60000));
    const QList<double> volumesAfter = bodyVolumes(*reopened);
    QCOMPARE(volumesAfter.size(), volumesBefore.size());
    for (int i = 0; i < volumesBefore.size(); ++i) QCOMPARE(volumesAfter[i], volumesBefore[i]);
    QCOMPARE(reopened->sprueIntents().front().validation.status, std::string("resolved"));

    // Opening is not an edit: the reopened project is clean and has its file.
    QVERIFY(waitFor([&] { return !reopened->project().value("dirty").toBool(); }, 5000));
    QCOMPARE(reopened->project().value("path").toString(), file);
  }

  void dirtyTrackingFollowsInputsNotThePose() {
    QTemporaryDir dir;
    auto app = makeApp();
    QVERIFY(!app->project().value("dirty").toBool());  // nothing loaded, nothing to lose
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));  // an imported model is unsaved work

    app->saveProjectToFile(dir.filePath("p.craft"));
    QVERIFY(waitForProject(*app, "saving"));
    QVERIFY(waitFor([&] { return !app->project().value("dirty").toBool(); }, 5000));

    app->camera()->orbitByPixels(40, 10, 600);  // the camera is saved but is not an edit
    QTest::qWait(500);
    QVERIFY(!app->project().value("dirty").toBool());

    app->setCavityClearanceMm(0.8);
    QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));
    QVERIFY(app->project().value("title").toString().endsWith(" *"));
    app->setCavityClearanceMm(0);  // back to the saved value: clean again
    QVERIFY(waitFor([&] { return !app->project().value("dirty").toBool(); }, 5000));
    QVERIFY(!app->project().value("title").toString().endsWith("*"));

    app->setShowGrid(false);  // view options are part of the project
    QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));
  }

  void savingAProjectThatHasNoFileAsksForAName() {
    auto app = makeApp();
    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    app->saveProject();  // no model at all
    QCOMPARE(errors.count(), 1);

    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QSignalSpy askName(app.get(), &AppController::saveAsRequested);
    app->saveProject();
    QCOMPARE(askName.count(), 1);
  }

  void autosaveSurvivesACrashAndIsOfferedOnTheNextStart() {
    QTemporaryDir dir;
    QString autosavePath;
    {
      auto app = makeApp();
      app->importStlFile(bracket());
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
      app->setCavityClearanceMm(0.7);
      QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));
      app->autosaveNow();
      QVERIFY(waitFor([&] { return !app->project().value("lastAutosaveAt").toString().isEmpty(); }, 30000));
      autosavePath = QDir(qEnvironmentVariable("CRAFT_AUTOSAVE_DIR")).filePath(app->project().value("projectId").toString() + ".craft");
      QVERIFY(QFileInfo::exists(autosavePath));
      // Leaving while dirty keeps the autosave: this is what an unclean exit looks like on disk.
    }
    QVERIFY2(QFileInfo::exists(autosavePath), "unsaved work must keep its autosave when the app goes away");

    auto next = makeApp();
    QVERIFY(next->recovery().value("available").toBool());
    const QVariantMap item = next->recovery().value("items").toList().front().toMap();
    QCOMPARE(item.value("path").toString(), autosavePath);
    QCOMPARE(item.value("name").toString(), QStringLiteral("bracket.stl"));

    next->recoverProject(autosavePath);
    QVERIFY(waitFor([&] { return next->modelPhase() == "ready" && !next->project().value("opening").toBool(); }, 60000));
    QCOMPARE(next->cavityClearanceMm(), 0.7);
    // Recovered work is unsaved work: dirty, no file of its own, and it keeps the project's identity.
    QVERIFY(next->project().value("dirty").toBool());
    QVERIFY(!next->project().value("hasPath").toBool());
    QVERIFY(!next->recovery().value("available").toBool());  // the live document's own autosave is not a recovery candidate

    // Saving it for real removes the autosave.
    next->saveProjectToFile(dir.filePath("recovered.craft"));
    QVERIFY(waitForProject(*next, "saving"));
    QVERIFY(waitFor([&] { return !QFileInfo::exists(autosavePath); }, 5000));
    QVERIFY(!next->project().value("dirty").toBool());
  }

  void aCleanExitLeavesNoAutosaveAndDiscardRemovesLeftovers() {
    QTemporaryDir dir;
    QString autosavePath;
    {
      auto app = makeApp();
      app->importStlFile(bracket());
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
      app->autosaveNow();
      QVERIFY(waitFor([&] { return !app->project().value("lastAutosaveAt").toString().isEmpty(); }, 30000));
      autosavePath = QDir(qEnvironmentVariable("CRAFT_AUTOSAVE_DIR")).filePath(app->project().value("projectId").toString() + ".craft");
      QVERIFY(QFileInfo::exists(autosavePath));
      app->saveProjectToFile(dir.filePath("p.craft"));
      QVERIFY(waitForProject(*app, "saving"));
      QVERIFY(waitFor([&] { return !QFileInfo::exists(autosavePath); }, 5000));  // saving superseded it
    }
    QVERIFY(!QFileInfo::exists(autosavePath));

    // Leftovers from earlier crashes can be discarded; garbage files in the folder are ignored, not offered.
    QFile junk(QDir(qEnvironmentVariable("CRAFT_AUTOSAVE_DIR")).filePath("junk.craft"));
    QVERIFY(junk.open(QIODevice::WriteOnly));
    junk.write("not a project");
    junk.close();
    auto app = makeApp();
    QVERIFY(!app->recovery().value("available").toBool());
    QFile::remove(junk.fileName());
  }

  void aDamagedProjectIsRefusedAndTheCurrentDocumentSurvives() {
    QTemporaryDir dir;
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->saveProjectToFile(dir.filePath("good.craft"));
    QVERIFY(waitForProject(*app, "saving"));

    QFile source(dir.filePath("good.craft"));
    QVERIFY(source.open(QIODevice::ReadOnly));
    QByteArray bytes = source.readAll();
    source.close();
    QFile cut(dir.filePath("cut.craft"));
    QVERIFY(cut.open(QIODevice::WriteOnly));
    cut.write(bytes.left(bytes.size() - 100));
    cut.close();

    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    const std::string modelBefore = app->model()->modelId;
    app->openProjectFile(dir.filePath("cut.craft"));
    QVERIFY(waitFor([&] { return errors.count() == 1; }, 30000));
    QCOMPARE(errors.first().at(2).toString(), QStringLiteral("project_truncated"));
    QCOMPARE(app->model()->modelId, modelBefore);  // the open document is untouched
    QCOMPARE(app->modelPhase(), QStringLiteral("ready"));
    QVERIFY(!app->project().value("opening").toBool());
  }

  void aLinkedModelThatMovedCanBeRelinked() {
    QTemporaryDir dir;
    QFile stlFile(bracket());
    QVERIFY(stlFile.open(QIODevice::ReadOnly));
    const QByteArray stlBytes = stlFile.readAll();
    // Build a linked project by hand (the app itself embeds; linked projects come from other tools or older saves).
    project::Document doc;
    doc.projectId = "linked-1";
    doc.createdAt = doc.modifiedAt = "2026-11-18T10:00:00.000Z";
    doc.appVersion = "test";
    project::ModelReference ref;
    ref.fileName = "bracket.stl";
    ref.storage = "linked";
    ref.linkedPath = dir.filePath("gone/bracket.stl").toStdString();
    ref.sizeBytes = static_cast<std::uint64_t>(stlBytes.size());
    ref.sha256 = project::sha256Hex(stlBytes);
    doc.model = ref;
    doc.mold.moldClearanceMm = 15;
    doc.mold.cavityClearanceMm = 0;
    project::writeProject(dir.filePath("linked.craft"), doc, {});

    auto app = makeApp();
    QSignalSpy relink(app.get(), &AppController::projectModelNeedsRelink);
    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    app->openProjectFile(dir.filePath("linked.craft"));
    QVERIFY(waitFor([&] { return relink.count() == 1; }, 30000));
    QCOMPARE(relink.first().at(1).toString(), QStringLiteral("project_asset_missing"));
    QVERIFY(!app->model().has_value());

    app->openProjectFile(dir.filePath("linked.craft"), bracket());  // the user located the model
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready" && !app->project().value("opening").toBool(); }, 60000));
    QCOMPARE(app->model()->fileName, QStringLiteral("bracket.stl"));
    QCOMPARE(app->moldClearanceMm(), 15.0);
  }

  void segmentationPlanAndExecutionComeBackWithTheProject() {
    QTemporaryDir dir;
    const QString file = dir.filePath("seg.craft");
    std::size_t bodiesBefore = 0;
    {
      auto app = makeApp();
      app->importStlFile(bracket());
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
      app->setPrinterVolume(150, 300, 300);
      app->planSegmentation();
      app->addSegmentationExtension("y");
      app->moveSegmentationExtension("y", 0);
      app->executeSegmentation();
      QVERIFY(waitFor([&] { return app->segmentation().value("phase").toString() == "executed" && !app->busy(); }, 120000));
      bodiesBefore = app->segmentationBodies().size();
      QCOMPARE(bodiesBefore, std::size_t{4});
      app->saveProjectToFile(file);
      QVERIFY(waitForProject(*app, "saving"));
    }
    auto reopened = makeApp();
    reopened->openProjectFile(file);
    QVERIFY(waitFor([&] { return reopened->segmentation().value("phase").toString() == "executed" && !reopened->busy(); }, 120000));
    QCOMPARE(reopened->printerVolume().value("x").toDouble(), 150.0);
    QCOMPARE(reopened->segmentation().value("extensions").toList().size(), 1);
    QCOMPARE(reopened->segmentationBodies().size(), bodiesBefore);
    QVERIFY(reopened->segmentationAdopted());
  }

  void aSecondSaveKeepsABackupAndRecoversFromABadSave() {
    QTemporaryDir dir;
    const QString file = dir.filePath("p.craft");
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->saveProjectToFile(file);
    QVERIFY(waitForProject(*app, "saving"));
    app->setCavityClearanceMm(0.9);
    app->saveProjectToFile(file);
    QVERIFY(waitForProject(*app, "saving"));
    QVERIFY(QFileInfo::exists(file + ".bak"));

    // The previous version is still a complete, openable project.
    auto older = makeApp();
    older->openProjectFile(file + ".bak");
    QVERIFY(waitFor([&] { return older->modelPhase() == "ready" && !older->project().value("opening").toBool(); }, 60000));
    QCOMPARE(older->cavityClearanceMm(), 0.0);
  }
  void moldabilityAnalysisRunsRealPythonEngine() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QCOMPARE(app->engineeringReports().value("phase").toString(), QStringLiteral("idle"));
    // The registry list is available before anything runs: five "Coming Soon" entries, as in the reference.
    const QVariantList registry = app->engineeringReports().value("registry").toList();
    QCOMPARE(registry.size(), 5);
    QCOMPARE(registry[0].toMap().value("displayName").toString(), QStringLiteral("Pull Direction"));
    QCOMPARE(registry[0].toMap().value("supportLabel").toString(), QStringLiteral("Coming Soon"));

    app->runMoldabilityAnalysis();
    QCOMPARE(app->engineeringReports().value("phase").toString(), QStringLiteral("running"));
    QVERIFY(waitFor([&] { const QString p = app->engineeringReports().value("phase").toString(); return p == "complete" || p == "error"; }, 120000));
    const QVariantMap reports = app->engineeringReports();
    QVERIFY2(reports.value("phase").toString() == "complete", qPrintable(reports.value("error").toString()));
    QVERIFY(!app->busy());

    const QVariantMap report = reports.value("report").toMap();
    QCOMPARE(report.value("status").toString(), QStringLiteral("partial"));  // the engine's own verdict for this part
    QVERIFY(report.value("success").toBool());
    QVERIFY(report.value("reportId").toString().startsWith("moldability_analysis:"));
    QVERIFY(report.value("statistics").toMap().value("analysisMs").toDouble() >= 0);
    QCOMPARE(report.value("statistics").toMap().value("faceCount").toInt(), 20);

    // Pull direction: six real axis candidates ranked by the Python engine, then run through the ported
    // completion + card + evaluation logic.
    const QVariantMap pull = reports.value("pullDirection").toMap();
    QVERIFY(pull.value("available").toBool());
    const QVariantList ranked = pull.value("ranked").toList();
    QCOMPARE(ranked.size(), 6);
    QCOMPARE(ranked[0].toMap().value("rank").toInt(), 1);
    QVERIFY(QRegularExpression("^[+-][XYZ]$").match(ranked[0].toMap().value("directionLabel").toString()).hasMatch());
    const QVariantMap card = pull.value("card").toMap();
    QCOMPARE(card.value("candidates").toInt(), 6);
    QVERIFY(QStringList({"Good", "Review", "Poor"}).contains(card.value("result").toString()));
    QVERIFY(QRegularExpression("^[+-][XYZ]$").match(card.value("bestDirection").toString()).hasMatch());
    QVERIFY(card.value("confidence").toString().endsWith("%"));
    const QVariantMap evaluation = pull.value("evaluation").toMap();
    QVERIFY(!evaluation.value("statusLabel").toString().isEmpty());
    QVERIFY(evaluation.value("snapshotValid").toBool());

    // Cavity analysis: the engine's own status/outcome and findings (it states its detector cannot prove "no cavity").
    const QVariantMap cavity = reports.value("cavity").toMap();
    QVERIFY(cavity.value("available").toBool());
    QCOMPARE(cavity.value("status").toString(), QStringLiteral("completed"));
    QVERIFY(!cavity.value("assessmentOutcome").toString().isEmpty());
    QVERIFY(!cavity.value("findings").toList().isEmpty());
    QVERIFY2(cavity.value("findings").toStringList().join(" ").contains("does not prove"), "the engine's caveat must reach the user");

    // Generation readiness: the Python Chapter 9 report through the ported adapter. The engine never selects a parting
    // strategy, so the adapter (like the reference) reports the part as blocked pending manual review.
    const QVariantMap readiness = reports.value("readiness").toMap();
    QVERIFY(readiness.value("available").toBool());
    QCOMPARE(readiness.value("engineStatus").toString(), QStringLiteral("ready_with_warnings"));
    QCOMPARE(readiness.value("status").toString(), QStringLiteral("blocked"));
    QVERIFY(!readiness.value("canGenerate").toBool());
    QVERIFY(readiness.value("requiresManualReview").toBool());
    QVERIFY(readiness.value("selectedPartingStrategyId").toString().isEmpty());
    QVERIFY(readiness.value("missingInputs").toStringList().contains("Parting strategies"));
    QVERIFY(!readiness.value("blockers").toList().isEmpty());
    QVERIFY(!readiness.value("partingStrategies").toList().isEmpty());
    QVERIFY(reports.value("stageErrors").toList().isEmpty());

    // The engine's preliminary moldability assessment rides in the same envelope.
    QVERIFY(!reports.value("moldability").toMap().value("status").toString().isEmpty());
    // Per-face lists stay in the engine and the panel says so.
    QVERIFY(reports.value("omittedNote").toString().contains("stays in the analysis engine"));
  }

  void moldabilityAnalysisOfAnUnanalyzableModelIsAFailedReport() {
    auto app = makeApp();
    app->importStlFile(fixtureStl("single_triangle_ascii.stl"));
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready" || app->modelPhase() == "error"; }));
    if (app->modelPhase() != "ready") QSKIP("the app refuses this fixture at import; nothing to analyze");
    app->runMoldabilityAnalysis();
    QVERIFY(waitFor([&] { const QString p = app->engineeringReports().value("phase").toString(); return p == "complete" || p == "error"; }, 60000));
    const QVariantMap reports = app->engineeringReports();
    QVERIFY2(reports.value("phase").toString() == "complete", qPrintable(reports.value("error").toString()));
    const QVariantMap report = reports.value("report").toMap();
    // The engine refused the model; that is reported as a failed report with its reasons, never as an analysis result.
    QCOMPARE(report.value("status").toString(), QStringLiteral("failed"));
    QVERIFY(!report.value("success").toBool());
    QVERIFY(!report.value("errors").toList().isEmpty());
    QVERIFY(!reports.value("pullDirection").toMap().value("available").toBool());
    QVERIFY(!reports.value("pullDirection").toMap().value("note").toString().isEmpty());
    // Readiness reflects the refusal too: blocked by the engine, blocked by the adapter, nothing to generate.
    const QVariantMap readiness = reports.value("readiness").toMap();
    QCOMPARE(readiness.value("engineStatus").toString(), QStringLiteral("blocked"));
    QCOMPARE(readiness.value("status").toString(), QStringLiteral("blocked"));
    QVERIFY(!readiness.value("canGenerate").toBool());
    QCOMPARE(reports.value("cavity").toMap().value("status").toString(), QStringLiteral("blocked"));
  }

  void moldabilityAnalysisWithoutAModelIsRefused() {
    auto app = makeApp();
    QSignalSpy errors(app.get(), &AppController::errorOccurred);
    app->runMoldabilityAnalysis();
    QCOMPARE(errors.count(), 1);
    QCOMPARE(app->engineeringReports().value("phase").toString(), QStringLiteral("idle"));
    QVERIFY(!app->engineeringReports().value("canRun").toBool());
  }

  void moldabilityAnalysisIsCancelledWhenTheModelChanges() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->runMoldabilityAnalysis();
    QCOMPARE(app->engineeringReports().value("phase").toString(), QStringLiteral("running"));
    // Replacing the model cancels the job and discards anything it would have produced.
    app->importStlFile(fixtureStl("closed_tetrahedron_ascii.stl"));
    QVERIFY(waitFor([&] { return app->model() && app->model()->fileName == "closed_tetrahedron_ascii.stl" && !app->busy(); }, 60000));
    QCOMPARE(app->engineeringReports().value("phase").toString(), QStringLiteral("idle"));
    QVERIFY(!app->engineeringReports().contains("report"));
    // And the next analysis works on the new model (the worker restarts after the cancel).
    app->runMoldabilityAnalysis();
    QVERIFY(waitFor([&] { const QString p = app->engineeringReports().value("phase").toString(); return p == "complete" || p == "error"; }, 120000));
    QCOMPARE(app->engineeringReports().value("phase").toString(), QStringLiteral("complete"));
    QCOMPARE(app->engineeringReports().value("report").toMap().value("statistics").toMap().value("faceCount").toInt(), 4);
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
