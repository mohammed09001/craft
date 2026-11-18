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

  // --- sprue 3D preview: funnel/stem/neck at the pointer, glass mold, hidden when it should be --------------------------------

  void sprueToolShowsTheMoldAsGlassAndPreviewsTheFunnel() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    const auto glassRows = [&] {
      int rows = 0;
      for (int row = 0; row < app->scene()->count(); ++row) {
        const QModelIndex index = app->scene()->index(row);
        if (app->scene()->data(index, SceneModel::KindRole).toString() != "mold-body") continue;
        if (app->scene()->data(index, SceneModel::GlassEdgeGeometryRole).value<QQuick3DGeometry*>()) ++rows;
      }
      return rows;
    };
    const auto previewTriangles = [&] { return static_cast<viewport::MeshGeometry*>(app->spruePreviewGeometry())->triangleCount(); };

    // Outside the tool nothing is glass and nothing is previewed.
    QVERIFY(!app->sprueGlass());
    QCOMPARE(glassRows(), 0);
    QCOMPARE(previewTriangles(), 0);

    // Selecting the Sprue tool turns the mold bodies to glass with an edge outline each.
    app->setTool("sprue");
    QVERIFY(app->sprueGlass());
    QVERIFY(glassRows() >= 1);
    QCOMPARE(app->sprueStyle().value("glassOpacity").toDouble(), 0.28);
    QCOMPARE(app->sprueStyle().value("validColor").value<QColor>(), QColor("#31975a"));
    QCOMPARE(app->sprueStyle().value("invalidColor").value<QColor>(), QColor("#b33a36"));

    // Over the cavity the preview is valid (green) and carries all three solids; over solid material it is invalid.
    int validX = -1, invalidX = -1;
    for (int x = 100; x <= 700 && (validX < 0 || invalidX < 0); x += 10) {
      app->previewSprueAt(x, 300, 800, 600);
      if (!app->sprueCandidate().value("onTopFace").toBool()) continue;
      (app->sprueCandidate().value("valid").toBool() ? validX : invalidX) = x;
    }
    QVERIFY2(validX > 0, "no pixel over the cavity found");
    QVERIFY2(invalidX > 0, "no pixel over solid mold material found");

    app->previewSprueAt(validX, 300, 800, 600);
    QVERIFY(app->sprueCandidate().value("valid").toBool());
    const int validTriangles = previewTriangles();
    QVERIFY(validTriangles >= 24 * 4 / 2);  // funnel + main stem + entry neck: hundreds of triangles
    const double x = app->sprueCandidate().value("x").toDouble(), y = app->sprueCandidate().value("y").toDouble(), z = app->sprueCandidate().value("z").toDouble();
    const double stem = app->sprueCandidate().value("stemLengthMm").toDouble();
    // The preview hangs from the top face: its funnel rises 5 mm above it and the stem runs down by the stem length.
    const auto* preview = static_cast<viewport::MeshGeometry*>(app->spruePreviewGeometry());
    QVERIFY(preview->boundsMax().z() >= static_cast<float>(z + 4.99));
    QVERIFY(preview->boundsMax().z() <= static_cast<float>(z + 5.01));
    QVERIFY(std::fabs(preview->boundsMin().z() - static_cast<float>(z - stem)) < 1e-3f);
    QVERIFY(preview->boundsMin().x() <= static_cast<float>(x) && preview->boundsMax().x() >= static_cast<float>(x));
    QVERIFY(preview->boundsMin().y() <= static_cast<float>(y) && preview->boundsMax().y() >= static_cast<float>(y));

    app->previewSprueAt(invalidX, 300, 800, 600);
    QVERIFY(!app->sprueCandidate().value("valid").toBool());
    QVERIFY(previewTriangles() > 0);  // a red preview still shows where the stem would go

    // The pointer leaving the top face (or the viewport) hides it.
    app->previewSprueAt(2, 2, 800, 600);
    QVERIFY(!app->sprueCandidate().value("onTopFace").toBool());
    QCOMPARE(previewTriangles(), 0);
    app->previewSprueAt(validX, 300, 800, 600);
    QVERIFY(previewTriangles() > 0);
    app->clearSprueCandidate();
    QCOMPARE(previewTriangles(), 0);
    QVERIFY(app->sprueCandidate().isEmpty());

    // Leaving the Sprue tool restores the mold and clears the preview.
    app->previewSprueAt(validX, 300, 800, 600);
    app->setTool("select");
    QVERIFY(!app->sprueGlass());
    QCOMPARE(glassRows(), 0);
    QCOMPARE(previewTriangles(), 0);
    QVERIFY(app->sprueCandidate().isEmpty());
    app->previewSprueAt(validX, 300, 800, 600);  // not the Sprue tool: nothing is previewed
    QCOMPARE(previewTriangles(), 0);
  }

  void thePreviewHidesWhenTheMoldChangesOrASprueIsPlaced() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    app->setTool("sprue");
    const auto previewTriangles = [&] { return static_cast<viewport::MeshGeometry*>(app->spruePreviewGeometry())->triangleCount(); };
    int validX = -1;
    for (int x = 100; x <= 700 && validX < 0; x += 10) {
      app->previewSprueAt(x, 300, 800, 600);
      if (app->sprueCandidate().value("valid").toBool()) validX = x;
    }
    QVERIFY(validX > 0);
    QVERIFY(previewTriangles() > 0);

    // Placing the sprue rebuilds the mold: the old preview goes, a new pointer move previews again.
    QVERIFY(app->placeSprueAt(validX, 300, 800, 600));
    QCOMPARE(previewTriangles(), 0);
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value(); }));
    QVERIFY(app->sprueGlass());  // the mold is still complete and the tool is still the Sprue tool

    // Changing a mold input drops the mold: the glass look and the preview go with it.
    app->previewSprueAt(validX, 300, 800, 600);
    app->setCutFaceEnabled("left", true);
    QVERIFY(app->moldPhase() != "complete");
    QVERIFY(!app->sprueGlass());
    QCOMPARE(previewTriangles(), 0);
    QVERIFY(app->sprueCandidate().isEmpty());
  }

  // --- sprue resize gizmo: rings at the openings, hover, drag, Escape, numeric edit --------------------------------------------

  void sprueRingsResizeASprueByDraggingAndTyping() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");

    // No rings outside the Sprue tool, and none until there is a sprue.
    QVERIFY(!app->sprueGizmo().value("active").toBool());
    QCOMPARE(app->sprueHandles()->rowCount(), 0);
    app->setTool("sprue");
    QVERIFY(app->sprueGizmo().value("active").toBool());
    QCOMPARE(app->sprueHandles()->rowCount(), 0);
    QCOMPARE(app->sprueGizmo().value("cursor").toString(), QStringLiteral("funnel"));

    // Place a sprue over the cavity; once resolved it has two rings (the opening and the entry neck).
    int placedAt = -1;
    for (int x = 100; x <= 700 && placedAt < 0; x += 10) {
      app->previewSprueAt(x, 300, 800, 600);
      if (app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, 300, 800, 600)) placedAt = x;
    }
    QVERIFY(placedAt > 0);
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value(); }));
    QCOMPARE(app->sprueHandles()->rowCount(), 2);
    const auto handleRow = [&](const QString& suffix) {
      for (int row = 0; row < app->sprueHandles()->rowCount(); ++row) {
        if (app->sprueHandles()->data(app->sprueHandles()->index(row), SprueHandleModel::IdRole).toString().endsWith(suffix)) return row;
      }
      return -1;
    };
    const int top = handleRow(":top"), bottom = handleRow(":bottom");
    QVERIFY(top >= 0 && bottom >= 0);
    const auto colorOf = [&](int row) { return app->sprueHandles()->data(app->sprueHandles()->index(row), SprueHandleModel::ColorRole).value<QColor>(); };
    QCOMPARE(colorOf(top), QColor("#3ea36d"));  // resolved: the idle green

    // Find a pixel on the top ring.
    const auto findRing = [&](const QString& suffix) {
      for (int y = 100; y < 500; y += 2) {
        for (int x = 150; x < 650; x += 2) {
          if (app->sprueGizmoHoverAt(x, y, 800, 600) && app->sprueGizmo().value("state").toString() == "rim-hover") {
            // Which ring is it? The hovered one is drawn in the hover colour.
            const int row = handleRow(suffix);
            if (colorOf(row) == QColor("#67c58f")) return QPoint(x, y);
          }
        }
      }
      return QPoint(-1, -1);
    };
    const QPoint ring = findRing(":top");
    QVERIFY2(ring.x() >= 0, "no pixel on the top ring");

    // Hover: the ring highlights, the cursor is the resize cursor, and the bodies the sprue cuts are hidden.
    QVERIFY(app->sprueGizmoHoverAt(ring.x(), ring.y(), 800, 600));
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("rim-hover"));
    QCOMPARE(app->sprueGizmo().value("cursor").toString(), QStringLiteral("resize"));
    const auto bodiesHidden = [&] {
      int hidden = 0;
      for (int row = 0; row < app->scene()->count(); ++row) {
        const QModelIndex index = app->scene()->index(row);
        if (app->scene()->data(index, SceneModel::KindRole).toString() == "mold-body" && app->scene()->data(index, SceneModel::GizmoHiddenRole).toBool()) ++hidden;
      }
      return hidden;
    };
    QVERIFY(bodiesHidden() >= 1);
    QVERIFY(app->sprueCandidate().isEmpty());  // no placement preview under a ring
    app->sprueGizmoLeave();
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("idle"));
    QCOMPARE(bodiesHidden(), 0);
    QVERIFY(!app->sprueGizmoPressAt(5, 5, 800, 600));  // an ordinary press elsewhere

    // Escape during a drag reverts the preview and commits nothing.
    const double originalMain = app->sprueIntents().front().profileDesign.profile.mainDiameterMm;
    QVERIFY(app->sprueGizmoPressAt(ring.x(), ring.y(), 800, 600));
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("resizing"));
    app->sprueGizmoDragTo(ring.x() + 40, ring.y(), false);
    QCOMPARE(app->sprueGizmo().value("labelText").toString(), QString::fromUtf8("\xC3\x98 %1 mm").arg(originalMain + 2.0, 0, 'f', 2));
    QCOMPARE(app->sprueHandles()->data(app->sprueHandles()->index(top), SprueHandleModel::GroupScaleRole).toDouble(), (originalMain + 2.0) / originalMain);
    QCOMPARE(colorOf(top), QColor("#f0b44d"));  // the active ring
    QVERIFY(app->sprueGizmo().value("cancellable").toBool());
    QVERIFY(app->sprueGizmoCancel());
    QCOMPARE(app->sprueHandles()->data(app->sprueHandles()->index(top), SprueHandleModel::GroupScaleRole).toDouble(), 1.0);
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, originalMain);
    QVERIFY(!app->sprueGizmoCancel());  // nothing left to cancel

    // A release commits the previewed diameter (snapped to 0.25 mm; Shift would not snap).
    QVERIFY(app->sprueGizmoPressAt(ring.x(), ring.y(), 800, 600));
    app->sprueGizmoDragTo(ring.x() + 40, ring.y(), false);
    app->sprueGizmoRelease();
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, originalMain + 2.0);
    QCOMPARE(app->sprueIntents().front().validation.status, std::string("pending"));
    QCOMPARE(colorOf(handleRow(":top")), QColor("#d8a43b"));  // pending until the sprue is evaluated again
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy() && app->sprueIntents().front().validation.status == "resolved"; }));
    QCOMPARE(app->sprueHandles()->rowCount(), 2);
    QCOMPARE(colorOf(handleRow(":top")), QColor("#3ea36d"));
    QCOMPARE(app->sprueHandles()->data(app->sprueHandles()->index(handleRow(":top")), SprueHandleModel::GroupScaleRole).toDouble(), 1.0);

    // A press-release without movement changes nothing.
    const double afterDrag = app->sprueIntents().front().profileDesign.profile.mainDiameterMm;
    const QPoint ring2 = findRing(":top");
    QVERIFY(ring2.x() >= 0);
    QVERIFY(app->sprueGizmoPressAt(ring2.x(), ring2.y(), 800, 600));
    app->sprueGizmoRelease();
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, afterDrag);
    QVERIFY(app->sprueIntents().size() == 1);  // and it did not place a second sprue

    // Double click: the numeric editor opens with the current value and the limits; Enter commits.
    app->sprueGizmoLeave();
    const QVariantMap edit = app->sprueGizmoEditAt(ring2.x(), ring2.y(), 800, 600);
    QCOMPARE(edit.value("opening").toString(), QStringLiteral("top"));
    QCOMPARE(edit.value("text").toString(), QString::number(afterDrag, 'f', 2));
    QCOMPARE(edit.value("min").toDouble(), 2.0);
    QCOMPARE(edit.value("max").toDouble(), 50.0);
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("numeric-edit"));
    QVERIFY(app->sprueGizmoHoverAt(10, 10, 800, 600));  // the pointer belongs to the editor: no preview
    QVERIFY(!app->sprueGizmoCommitEdit(QStringLiteral("inf")));   // non-finite: refused, the editor stays open
    QVERIFY(!app->sprueGizmo().value("editError").toString().isEmpty());
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("numeric-edit"));
    QVERIFY(app->sprueGizmoCommitEdit(QStringLiteral("7.5")));
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("idle"));
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, 7.5);
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy() && app->sprueIntents().front().validation.status == "resolved"; }));

    // Escape closes the editor without committing.
    const QPoint ring3 = findRing(":top");
    QVERIFY(ring3.x() >= 0);
    app->sprueGizmoLeave();
    QVERIFY(!app->sprueGizmoEditAt(5, 5, 800, 600).contains("operationId"));
    QVERIFY(app->sprueGizmoEditAt(ring3.x(), ring3.y(), 800, 600).contains("operationId"));
    QVERIFY(app->sprueGizmoCancel());
    QCOMPARE(app->sprueGizmo().value("state").toString(), QStringLiteral("idle"));
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, 7.5);

    // Leaving the Sprue tool removes the rings and restores any hidden body.
    app->setTool("select");
    QCOMPARE(app->sprueHandles()->rowCount(), 0);
    QVERIFY(!app->sprueGizmo().value("active").toBool());
    QCOMPARE(bodiesHidden(), 0);
  }

  void theNeckRingCannotGrowPastTheMainDiameter() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    app->setTool("sprue");
    int placedAt = -1;
    for (int x = 100; x <= 700 && placedAt < 0; x += 10) {
      app->previewSprueAt(x, 300, 800, 600);
      if (app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, 300, 800, 600)) placedAt = x;
    }
    QVERIFY(placedAt > 0);
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value(); }));

    // Find the bottom (entry neck) ring and drag it far to the right: it stops at the main diameter.
    QPoint ring(-1, -1);
    for (int y = 100; y < 500 && ring.x() < 0; y += 2) {
      for (int x = 150; x < 650 && ring.x() < 0; x += 2) {
        if (!app->sprueGizmoHoverAt(x, y, 800, 600)) continue;
        for (int row = 0; row < app->sprueHandles()->rowCount(); ++row) {
          const QString id = app->sprueHandles()->data(app->sprueHandles()->index(row), SprueHandleModel::IdRole).toString();
          if (id.endsWith(":bottom") && app->sprueHandles()->data(app->sprueHandles()->index(row), SprueHandleModel::ColorRole).value<QColor>() == QColor("#67c58f")) ring = QPoint(x, y);
        }
      }
    }
    QVERIFY2(ring.x() >= 0, "no pixel on the entry-neck ring");
    const double main = app->sprueIntents().front().profileDesign.profile.mainDiameterMm;
    QVERIFY(app->sprueGizmoPressAt(ring.x(), ring.y(), 800, 600));
    app->sprueGizmoDragTo(ring.x() + 2000, ring.y(), false);
    QVERIFY(app->sprueGizmo().value("labelWarns").toBool());  // at the limit
    app->sprueGizmoRelease();
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.entryNeckDiameterMm, main);
  }

  // --- cutting planes and the Eraser (reference: cuttingPlane3dRuntime.ts, removeSplitFace) --------------------------------

  void cutPlanesAreDrawnWhileSettingUpAndTheEraserRemovesOne() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);

    // No faces chosen: no planes, and the Eraser has nothing to work on.
    QVERIFY(!app->cutPlanes().value("visible").toBool());
    QVERIFY(!app->eraserAvailable());
    app->setTool("eraser");
    QCOMPARE(app->tool(), QStringLiteral("select"));

    app->setCutFaceEnabled("front", true);
    app->setCutFaceEnabled("top", true);
    app->setCutFacePosition("top", 0.5);
    app->setCutFaceEnabled("left", true);
    app->setCutFacePosition("left", 0.7);
    QVERIFY(app->cutPlanes().value("visible").toBool());
    QCOMPARE(app->cutPlaneSlabs()->rowCount(), 3);
    QVERIFY(app->eraserAvailable());

    // Slab geometry: thin along the plane's axis, as wide as the reference mold block (K2) on the others.
    const auto row = [&](const QString& face) {
      for (int r = 0; r < app->cutPlaneSlabs()->rowCount(); ++r) {
        if (app->cutPlaneSlabs()->data(app->cutPlaneSlabs()->index(r), CutPlaneModel::FaceRole).toString() == face) return r;
      }
      return -1;
    };
    const auto at = [&](int r, int role) { return app->cutPlaneSlabs()->data(app->cutPlaneSlabs()->index(r), role); };
    const QVector3D topSize = at(row("top"), CutPlaneModel::SizeRole).value<QVector3D>();
    QCOMPARE(topSize.z(), 0.02f);
    QCOMPARE(topSize.x(), 40.0f + 2 * 10.0f);   // K1 is 40 x 30 x 12; the mold block adds the 10 mm clearance each side
    QCOMPARE(topSize.y(), 30.0f + 2 * 10.0f);
    QCOMPARE(at(row("top"), CutPlaneModel::ColorRole).value<QColor>(), QColor("#f59e0b"));
    QCOMPARE(at(row("top"), CutPlaneModel::SurfaceOpacityRole).toDouble(), 0.22);

    // The Eraser: hover turns the plane red; a click removes it.
    app->setTool("eraser");
    QCOMPARE(app->tool(), QStringLiteral("eraser"));
    QPoint onPlane(-1, -1);
    for (int y = 100; y < 500 && onPlane.x() < 0; y += 3)
      for (int x = 150; x < 650 && onPlane.x() < 0; x += 3)
        if (app->eraserHoverAt(x, y, 800, 600)) onPlane = QPoint(x, y);
    QVERIFY2(onPlane.x() >= 0, "no pixel on a plane");
    const QString hovered = app->cutPlanes().value("hoveredFace").toString();
    QVERIFY(!hovered.isEmpty());
    QCOMPARE(at(row(hovered), CutPlaneModel::ColorRole).value<QColor>(), QColor("#ef3038"));
    QCOMPARE(at(row(hovered), CutPlaneModel::SurfaceOpacityRole).toDouble(), 0.42);
    QCOMPARE(at(row(hovered), CutPlaneModel::EdgeOpacityRole).toDouble(), 1.0);
    for (int r = 0; r < app->cutPlaneSlabs()->rowCount(); ++r) {
      if (r != row(hovered)) QCOMPARE(at(r, CutPlaneModel::ColorRole).value<QColor>(), QColor("#f59e0b"));  // only one is red
    }
    QVERIFY(!app->eraserHoverAt(3, 3, 800, 600));   // away from every plane: nothing hovered
    QVERIFY(app->cutPlanes().value("hoveredFace").toString().isEmpty());
    QVERIFY(!app->pickAt(3, 3, 800, 600));            // a click on nothing removes nothing
    QCOMPARE(app->cutPlaneSlabs()->rowCount(), 3);

    QVERIFY(app->pickAt(onPlane.x(), onPlane.y(), 800, 600));
    QCOMPARE(app->cutPlaneSlabs()->rowCount(), 2);
    const QStringList chosen{"front", "top", "left"};
    for (const QVariant& f : app->cutFaces()) {
      const QString face = f.toMap().value("face").toString();
      const bool expectedEnabled = face != hovered && chosen.contains(face);
      QCOMPARE(f.toMap().value("enabled").toBool(), expectedEnabled);
    }
    QVERIFY(app->statusText().contains("Removed the " + hovered));

    // Removing the remaining planes returns the tool to Select: the Eraser needs planes.
    for (const QString& face : {QStringLiteral("front"), QStringLiteral("top"), QStringLiteral("left")}) app->removeCutFace(face);
    QCOMPARE(app->cutPlaneSlabs()->rowCount(), 0);
    QCOMPARE(app->tool(), QStringLiteral("select"));
    QVERIFY(!app->eraserAvailable());
    QVERIFY(!app->removeCutFace("front"));  // already gone

    // A face chosen again starts from its own default position (the removed plane's position is forgotten).
    app->setCutFaceEnabled("top", true);
    double topPosition = 0;
    for (const QVariant& f : app->cutFaces()) if (f.toMap().value("face").toString() == "top") topPosition = f.toMap().value("position").toDouble();
    QVERIFY(topPosition > 0.99);
  }

  void theEraserRemovesAPlaneFromACompleteMoldAndKeepsTheSprues() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    app->setCutFaceEnabled("left", true);
    app->setCutFacePosition("left", 0.5);
    app->generateMold();

    // While the mold is generating nothing can be removed (the reference's guard) and the Eraser is not offered.
    QCOMPARE(app->moldPhase(), QStringLiteral("generating"));
    QVERIFY(!app->eraserAvailable());
    QVERIFY(!app->removeCutFace("left"));
    QVERIFY(app->cutPlanes().value("visible").toBool());   // planes are drawn while generating
    QVERIFY(waitFor([&] { return app->moldPhase() != "generating"; }, 120000));
    QCOMPARE(app->moldPhase(), QStringLiteral("complete"));

    // A complete mold hides the planes, unless the Eraser needs them.
    QVERIFY(!app->cutPlanes().value("visible").toBool());
    QCOMPARE(app->cutPlaneSlabs()->rowCount(), 0);
    QVERIFY(app->eraserAvailable());
    app->setTool("eraser");
    QVERIFY(app->cutPlanes().value("visible").toBool());
    QCOMPARE(app->cutPlaneSlabs()->rowCount(), 1);

    // Place a sprue (the Sprue tool), then come back to the Eraser.
    app->setTool("sprue");
    bool placed = false;
    for (int y = 150; y <= 450 && !placed; y += 15)
      for (int x = 100; x <= 700 && !placed; x += 10) {
        app->previewSprueAt(x, y, 800, 600);
        placed = app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, y, 800, 600);
      }
    QVERIFY2(placed, "no pixel over the cavity found");
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value(); }));
    QCOMPARE(app->sprueIntents().size(), std::size_t{1});
    app->setTool("eraser");

    // Click the plane: the plane goes, the mold built with it is dropped, the sprue intent stays.
    QPoint onPlane(-1, -1);
    for (int y = 60; y < 560 && onPlane.x() < 0; y += 3)
      for (int x = 60; x < 740 && onPlane.x() < 0; x += 3)
        if (app->eraserHoverAt(x, y, 800, 600)) onPlane = QPoint(x, y);
    QVERIFY2(onPlane.x() >= 0, "no pixel on the plane");
    QVERIFY(app->pickAt(onPlane.x(), onPlane.y(), 800, 600));
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
    QVERIFY(!app->moldResult().has_value());
    QCOMPARE(app->sprueIntents().size(), std::size_t{1});
    QCOMPARE(app->tool(), QStringLiteral("select"));  // no planes left
    QVERIFY(!app->cutPlanes().value("visible").toBool());
  }

  void removingPlanesFollowsTheReferenceStoreScenarios() {
    QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/cutplane-reference.json"));
    QVERIFY(file.open(QIODevice::ReadOnly));
    const QJsonArray scenarios = QJsonDocument::fromJson(file.readAll()).object().value("lifecycle").toArray();
    int replayed = 0, ignored = 0;
    for (const QJsonValue& value : scenarios) {
      const QJsonObject s = value.toObject();
      if (s.value("how").toString() != "remove") continue;  // the rebuild scenarios are checked on the partition in tst_cutplane_equivalence
      const QString name = s.value("name").toString();
      auto app = makeApp();
      app->importStlFile(bracket());
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
      for (const QJsonValue& face : s.value("faces").toArray()) app->setCutFaceEnabled(face.toString(), true);
      const bool generating = s.value("generating").toBool();
      if (generating) {
        app->generateMold();
        QCOMPARE(app->moldPhase(), QStringLiteral("generating"));
      }
      const bool removed = app->removeCutFace(s.value("remove").toString());

      // The planes left (and their positions) are the reference store's.
      const QJsonArray expected = s.value("after").toObject().value("planes").toArray();
      QList<QPair<QString, double>> remaining;
      for (const QVariant& f : app->cutFaces()) {
        const QVariantMap m = f.toMap();
        if (m.value("enabled").toBool()) remaining.append({m.value("face").toString(), m.value("position").toDouble()});
      }
      QVERIFY2(remaining.size() == expected.size(), qPrintable(name + QStringLiteral(": %1 planes left, the reference keeps %2").arg(remaining.size()).arg(expected.size())));
      for (int i = 0; i < expected.size(); ++i) {
        QCOMPARE(remaining.at(i).first, expected.at(i).toObject().value("sourceFaceId").toString());
        QVERIFY2(std::fabs(remaining.at(i).second - expected.at(i).toObject().value("normalizedPosition").toDouble()) < 1e-9, qPrintable(name + " position"));
      }
      // Whether anything was removed agrees with the reference (it changes the history only when it removed something).
      const bool referenceRemoved = s.value("after").toObject().value("undoDepth").toInt() > s.value("before").toObject().value("undoDepth").toInt();
      QCOMPARE(removed, referenceRemoved);
      if (!referenceRemoved) ++ignored;
      if (generating) QVERIFY(waitFor([&] { return app->moldPhase() != "generating"; }, 120000));
      ++replayed;
    }
    QVERIFY(replayed >= 5);
    QVERIFY(ignored >= 2);  // an absent face and the generating guard
  }

  // --- undo / redo (reference: the split-face store's snapshot history) ------------------------------------------------------

  void undoRedoFollowsTheReferenceStoreStepByStep() {
    QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/undo-reference.json"));
    QVERIFY(file.open(QIODevice::ReadOnly));
    const QJsonObject fixture = QJsonDocument::fromJson(file.readAll()).object();
    QCOMPARE(fixture.value("cap").toInt(), 50);
    int sequences = 0, steps = 0;
    for (const QJsonValue& sequenceValue : fixture.value("sequences").toArray()) {
      const QJsonObject sequence = sequenceValue.toObject();
      const QString name = sequence.value("name").toString();
      auto app = makeApp();
      app->importStlFile(bracket());
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));

      const auto enabled = [&](const QString& face) {
        for (const QVariant& f : app->cutFaces()) {
          if (f.toMap().value("face").toString() == face) return f.toMap().value("enabled").toBool();
        }
        return false;
      };

      const QJsonArray recorded = sequence.value("steps").toArray();
      for (int i = 0; i < recorded.size(); ++i) {
        const QJsonObject step = recorded.at(i).toObject();
        const QJsonObject op = step.value("op").toObject();
        const QString kind = op.value("op").toString();
        if (kind == "toggle") app->setCutFaceEnabled(op.value("face").toString(), !enabled(op.value("face").toString()));
        else if (kind == "drag") app->setCutFacePosition(op.value("face").toString(), op.value("position").toDouble());
        else if (kind == "clearance") app->setMoldClearanceMm(op.value("mm").toDouble());
        else if (kind == "gesture") {
          app->beginHistoryGesture();
          for (const QJsonValue& v : op.value("values").toArray()) app->setMoldClearanceMm(v.toDouble());
          app->endHistoryGesture();
        } else if (kind == "remove") app->removeCutFace(op.value("face").toString());
        else if (kind == "undo") app->undo();
        else if (kind == "redo") app->redo();
        // kind == "start": nothing yet.

        const QJsonObject expected = step.value("state").toObject();
        const QString where = QStringLiteral("%1 step %2 (%3)").arg(name).arg(i).arg(kind);
        QList<QPair<QString, double>> planes;
        for (const QVariant& f : app->cutFaces()) {
          const QVariantMap m = f.toMap();
          if (m.value("enabled").toBool()) planes.append({m.value("face").toString(), m.value("position").toDouble()});
        }
        const QJsonArray expectedPlanes = expected.value("planes").toArray();
        QVERIFY2(planes.size() == expectedPlanes.size(), qPrintable(where + QStringLiteral(": %1 planes, reference %2").arg(planes.size()).arg(expectedPlanes.size())));
        for (int p = 0; p < expectedPlanes.size(); ++p) {
          QCOMPARE(planes.at(p).first, expectedPlanes.at(p).toObject().value("face").toString());
          QVERIFY2(std::fabs(planes.at(p).second - expectedPlanes.at(p).toObject().value("position").toDouble()) < 1e-9, qPrintable(where + ": plane position"));
        }
        QVERIFY2(std::fabs(app->moldClearanceMm() - expected.value("clearanceMm").toDouble()) < 1e-9, qPrintable(where + ": clearance"));
        const int undoDepth = app->history().value("undoDepth").toInt(), redoDepth = app->history().value("redoDepth").toInt();
        QVERIFY2(undoDepth == expected.value("undoDepth").toInt(), qPrintable(where + QStringLiteral(": undo depth %1, reference %2").arg(undoDepth).arg(expected.value("undoDepth").toInt())));
        QVERIFY2(redoDepth == expected.value("redoDepth").toInt(), qPrintable(where + QStringLiteral(": redo depth %1, reference %2").arg(redoDepth).arg(expected.value("redoDepth").toInt())));
        QCOMPARE(app->history().value("canUndo").toBool(), undoDepth > 0);
        QCOMPARE(app->history().value("canRedo").toBool(), redoDepth > 0);
        ++steps;
      }
      ++sequences;
    }
    QCOMPARE(sequences, 5);
    QVERIFY(steps > 150);
  }

  void undoBringsBackTheGeneratedMoldWithoutRecomputingIt() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    app->setCutFaceEnabled("left", true);
    app->setCutFacePosition("left", 0.5);
    QCOMPARE(app->history().value("undoDepth").toInt(), 2);
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }, 120000));
    QCOMPARE(app->history().value("undoDepth").toInt(), 3);  // the generated mold is a step of its own
    const MoldGenerationResult* generated = &*app->moldResult();
    const std::size_t bodies = app->scene()->items().size();

    // Removing the plane drops the mold; undo puts the very same mold back, instantly.
    app->setTool("eraser");
    QVERIFY(app->removeCutFace("left"));
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
    QVERIFY(!app->moldResult().has_value());
    app->undo();
    QCOMPARE(app->moldPhase(), QStringLiteral("complete"));
    QVERIFY(!app->busy());
    QVERIFY(&*app->moldResult() == generated);              // the same result object: restored, not recomputed
    QCOMPARE(app->scene()->items().size(), bodies);          // and shown again
    QVERIFY(app->cutPlanes().value("eraserAvailable").toBool());
    app->redo();
    QVERIFY(!app->moldResult().has_value());
    app->undo();
    QVERIFY(&*app->moldResult() == generated);

    // Further back: the state before the mold was generated (inputs unchanged), then before the plane moved, then nothing.
    app->undo();
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
    QVERIFY(!app->moldResult().has_value());
    QCOMPARE(app->scene()->items().size(), std::size_t{1});  // only the part
    app->undo();
    app->undo();
    QVERIFY(!app->history().value("canUndo").toBool());
    for (const QVariant& f : app->cutFaces()) QVERIFY(!f.toMap().value("enabled").toBool());
    // ... and forward again, all the way: the mold returns without a single job running.
    app->redo();
    app->redo();
    app->redo();
    QCOMPARE(app->moldPhase(), QStringLiteral("complete"));
    QVERIFY(&*app->moldResult() == generated);
    QVERIFY(!app->busy());
  }

  void undoRestoresSprueEditsAndTheirEvaluation() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->generateMold();
    QVERIFY(waitFor([&] { return app->moldPhase() == "complete"; }, 120000));
    app->camera()->setViewportSize(800, 600);
    app->camera()->lookFrom("top");
    app->setTool("sprue");
    const int base = app->history().value("undoDepth").toInt();
    const SprueEvaluation* beforeSprue = app->sprueEvaluation().has_value() ? &*app->sprueEvaluation() : nullptr;

    bool placed = false;
    for (int y = 150; y <= 450 && !placed; y += 15)
      for (int x = 100; x <= 700 && !placed; x += 10) {
        app->previewSprueAt(x, y, 800, 600);
        placed = app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, y, 800, 600);
      }
    QVERIFY(placed);
    QVERIFY(!app->history().value("canUndo").toBool());   // not while the sprue is being evaluated (the reference's rule)
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value() && !app->busy(); }));
    QCOMPARE(app->history().value("undoDepth").toInt(), base + 1);
    QVERIFY(app->history().value("canUndo").toBool());
    const SprueEvaluation* withSprue = &*app->sprueEvaluation();
    QCOMPARE(app->sprueIntents().size(), std::size_t{1});

    // A burst of resizes while the first is still evaluated is one step.
    const std::string id = app->sprueIntents().front().operationId;
    app->resizeSprue(QString::fromStdString(id), 5.0);
    app->resizeSprue(QString::fromStdString(id), 6.0);
    app->resizeSprue(QString::fromStdString(id), 7.0);
    QCOMPARE(app->history().value("undoDepth").toInt(), base + 2);
    QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy(); }));
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, 7.0);

    // Undo the burst: the sprue as it was (its evaluation object comes back, nothing is re-evaluated) ...
    app->undo();
    QCOMPARE(app->spruePhase(), QStringLiteral("idle"));
    QVERIFY(!app->busy());
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, 2.5);
    QVERIFY(&*app->sprueEvaluation() == withSprue);
    // ... undo the placement: no sprue, the evaluation from before it ...
    app->undo();
    QVERIFY(app->sprueIntents().empty());
    QVERIFY(app->sprueEvaluation().has_value() == (beforeSprue != nullptr));
    if (beforeSprue) QVERIFY(&*app->sprueEvaluation() == beforeSprue);  // the very evaluation from before the sprue
    // ... and redo both.
    app->redo();
    app->redo();
    QCOMPARE(app->sprueIntents().front().profileDesign.profile.mainDiameterMm, 7.0);
    QCOMPARE(app->spruePhase(), QStringLiteral("idle"));
    QVERIFY(!app->busy());
  }

  void undoWhileTheMoldIsGeneratingCancelsIt() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->setCutFaceEnabled("left", true);
    app->generateMold();
    QCOMPARE(app->moldPhase(), QStringLiteral("generating"));
    QVERIFY(app->history().value("canUndo").toBool());   // unlike a sprue evaluation, a mold generation does not block undo
    app->undo();
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
    QVERIFY(!app->busy());
    for (const QVariant& f : app->cutFaces()) QVERIFY(!f.toMap().value("enabled").toBool());
    // The cancelled generation's late result must not appear.
    QTest::qWait(800);
    QVERIFY(waitFor([&] { return !app->busy(); }));
    QCOMPARE(app->moldPhase(), QStringLiteral("ready"));
    QVERIFY(!app->moldResult().has_value());
  }

  void aSliderDragIsOneStepAndAFreshModelStartsAFreshHistory() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    app->setCutFaceEnabled("left", true);
    const int base = app->history().value("undoDepth").toInt();
    app->beginHistoryGesture();
    for (double p : {0.2, 0.3, 0.4, 0.5, 0.6}) app->setCutFacePosition("left", p);
    app->endHistoryGesture();
    QCOMPARE(app->history().value("undoDepth").toInt(), base + 1);
    app->undo();
    for (const QVariant& f : app->cutFaces()) if (f.toMap().value("face").toString() == "left") QVERIFY(f.toMap().value("position").toDouble() < 0.001);
    // Importing a model starts a fresh history.
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QVERIFY(!app->history().value("canUndo").toBool());
    QVERIFY(!app->history().value("canRedo").toBool());
  }

  void undoMakesTheProjectCleanAgain() {
    auto app = makeApp();
    app->importStlFile(bracket());
    QVERIFY(waitFor([&] { return app->modelPhase() == "ready"; }));
    QTemporaryDir dir;
    const QString path = dir.filePath("p.craft");
    app->saveProjectToFile(path);
    QVERIFY(waitFor([&] { return !app->project().value("saving").toBool() && !app->project().value("dirty").toBool(); }));
    app->setCutFaceEnabled("top", true);
    QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }));  // the flag follows edits on a short timer
    app->undo();
    QVERIFY2(!app->project().value("dirty").toBool(), "back at the saved inputs, the project is not modified");
    app->redo();
    QVERIFY(app->project().value("dirty").toBool());
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

  // --- Gate 6, end to end: import -> design -> export -> save -> reopen -> export again -> edit -> save -> reopen ---------------
  // One real project (the 9,024-triangle sphere fixture the reference's e2e suite uses), one journey. The claim under test is
  // the one that matters to a user: a saved project reopens into a mold whose exported tooling is byte-for-byte the tooling
  // that was exported before saving, an edit made after reopening survives a second save, and the files are valid STL.

  static QMap<QString, QByteArray> exportedFiles(AppController& app, const QString& folder) {
    QSignalSpy done(&app, &AppController::exportFinished);
    app.exportMoldBodiesTo(folder);
    QMap<QString, QByteArray> files;
    if (done.count() != 1 || !done.first().at(0).toBool()) return files;
    for (const QString& name : QDir(folder).entryList({"*.stl"}, QDir::Files, QDir::Name)) {
      QFile f(QDir(folder).filePath(name));
      if (f.open(QIODevice::ReadOnly)) files.insert(name, f.readAll());
    }
    return files;
  }

  // A binary STL is an 80-byte header, a uint32 triangle count and 50 bytes per triangle, and nothing else.
  static bool isWellFormedBinaryStl(const QByteArray& bytes) {
    if (bytes.size() < 84) return false;
    quint32 triangles = 0;
    memcpy(&triangles, bytes.constData() + 80, 4);
    return triangles > 0 && bytes.size() == 84 + 50 * static_cast<qint64>(triangles);
  }

  void endToEndProjectJourney() {
    const QString sphere = QStringLiteral(CRAFT_REPO_ROOT "/mold/frontend/e2e/fixtures/highpoly_sphere_15mm_ascii.stl");
    QTemporaryDir work;
    const QString projectFile = work.filePath("sphere.craft");

    // 1. Import, design and generate in a first session.
    QMap<QString, QByteArray> exportedBeforeSave;
    QList<double> volumes;
    {
      auto app = makeApp();
      app->importStlFile(sphere);
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready" || app->modelPhase() == "error"; }, 120000));
      QCOMPARE(app->modelPhase(), QStringLiteral("ready"));
      app->setMoldClearanceMm(12);
      app->setCavityClearanceMm(0.3);
      app->setCutFaceEnabled("right", true);
      app->setCutFacePosition("right", 0.5);
      app->generateMold();
      QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }, 600000));
      QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));

      app->camera()->setViewportSize(800, 600);
      app->camera()->lookFrom("top");
      app->setTool("sprue");
      bool placed = false;
      for (int y = 200; y <= 400 && !placed; y += 20)
        for (int x = 250; x <= 550 && !placed; x += 15) {
          app->previewSprueAt(x, y, 800, 600);
          placed = app->sprueCandidate().value("valid").toBool() && app->placeSprueAt(x, y, 800, 600);
        }
      QVERIFY2(placed, "no valid sprue position was found on the sphere mold");
      QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && app->sprueEvaluation().has_value() && !app->busy(); }, 300000));
      QCOMPARE(app->sprueIntents().front().validation.status, std::string("resolved"));
      app->setTool("select");

      QTemporaryDir out;
      exportedBeforeSave = exportedFiles(*app, out.path());
      QVERIFY2(exportedBeforeSave.size() >= 2, "the export produced fewer than two mold bodies");
      for (auto it = exportedBeforeSave.cbegin(); it != exportedBeforeSave.cend(); ++it)
        QVERIFY2(isWellFormedBinaryStl(it.value()), qPrintable(it.key() + " is not a well-formed binary STL"));
      volumes = bodyVolumes(*app);

      QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));
      app->saveProjectToFile(projectFile);
      QVERIFY(waitForProject(*app, "saving"));
      QVERIFY(QFileInfo(projectFile).size() > 0);
      QVERIFY(waitFor([&] { return !app->project().value("dirty").toBool(); }, 5000));
    }

    // 2. A fresh session opens the file: the same mold, the same exported tooling, nothing to save, nothing to undo.
    QMap<QString, QByteArray> exportedAfterReopen;
    {
      auto app = makeApp();
      app->openProjectFile(projectFile);
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready" && !app->project().value("opening").toBool(); }, 120000));
      QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }, 600000));
      QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
      QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy(); }, 300000));
      QCOMPARE(app->sprueIntents().front().validation.status, std::string("resolved"));
      QCOMPARE(bodyVolumes(*app), volumes);
      QVERIFY(!app->history().value("canUndo").toBool());  // opening is not an edit and starts a fresh history

      QTemporaryDir out;
      exportedAfterReopen = exportedFiles(*app, out.path());
      QCOMPARE(exportedAfterReopen.keys(), exportedBeforeSave.keys());
      for (auto it = exportedBeforeSave.cbegin(); it != exportedBeforeSave.cend(); ++it)
        QVERIFY2(exportedAfterReopen.value(it.key()) == it.value(), qPrintable(it.key() + " differs after save and reopen"));
      QVERIFY(waitFor([&] { return !app->project().value("dirty").toBool(); }, 5000));

      // 3. Edit after reopening: move the cut plane, regenerate (the sprue intent is kept and evaluated again), save in place.
      app->setCutFacePosition("right", 0.35);
      QVERIFY(waitFor([&] { return app->project().value("dirty").toBool(); }, 5000));
      app->generateMold();
      QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }, 600000));
      QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
      QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy(); }, 300000));
      QCOMPARE(app->sprueIntents().size(), std::size_t{1});
      QVERIFY(bodyVolumes(*app) != volumes);  // the edit really changed the mold

      QTemporaryDir editedOut;
      const QMap<QString, QByteArray> edited = exportedFiles(*app, editedOut.path());
      QVERIFY(edited.size() >= 2);
      QVERIFY2(edited != exportedBeforeSave, "the edited mold exported the same files as before the edit");
      for (auto it = edited.cbegin(); it != edited.cend(); ++it)
        QVERIFY2(it.value().mid(80) != exportedBeforeSave.value(it.key()).mid(80), qPrintable(it.key() + ": the triangles did not change with the edit"));
      for (auto it = edited.cbegin(); it != edited.cend(); ++it) QVERIFY(isWellFormedBinaryStl(it.value()));
      volumes = bodyVolumes(*app);
      exportedAfterReopen = edited;

      app->saveProject();  // the project has its file now: saves in place, asks for no name
      QVERIFY(waitForProject(*app, "saving"));
      QVERIFY(waitFor([&] { return !app->project().value("dirty").toBool(); }, 5000));
      QCOMPARE(app->project().value("path").toString(), projectFile);
    }

    // 4. A third session sees the edit, and exports the edited tooling exactly.
    {
      auto app = makeApp();
      app->openProjectFile(projectFile);
      QVERIFY(waitFor([&] { return app->modelPhase() == "ready" && !app->project().value("opening").toBool(); }, 120000));
      QVERIFY(waitFor([&] { return app->moldPhase() == "complete" || app->moldPhase() == "error"; }, 600000));
      QVERIFY2(app->moldPhase() == "complete", qPrintable(app->moldError()));
      QVERIFY(waitFor([&] { return app->spruePhase() == "idle" && !app->busy(); }, 300000));
      for (const QVariant& f : app->cutFaces())
        if (f.toMap().value("face").toString() == "right") QCOMPARE(f.toMap().value("position").toDouble(), 0.35);
      QCOMPARE(bodyVolumes(*app), volumes);
      QTemporaryDir out;
      const QMap<QString, QByteArray> files = exportedFiles(*app, out.path());
      QCOMPARE(files.keys(), exportedAfterReopen.keys());
      // The mold edited in the second session carries that session's generation counter in its operation id (as in the
      // reference), so the header may differ in its "op=" field; every triangle must be identical.
      for (auto it = files.cbegin(); it != files.cend(); ++it) {
        const QByteArray& expected = exportedAfterReopen.value(it.key());
        QVERIFY2(it.value().size() == expected.size(), qPrintable(it.key() + " has a different size after the second save and reopen"));
        QVERIFY2(it.value().mid(80) == expected.mid(80), qPrintable(it.key() + " has different triangles after the second save and reopen"));
        QCOMPARE(QString::fromLatin1(it.value().left(80)).section("op=", 0, 0), QString::fromLatin1(expected.left(80)).section("op=", 0, 0));
      }
    }
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
