#include <QCommandLineParser>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMouseEvent>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickStyle>
#include <QQuickWindow>

#include <functional>
#include <memory>

#ifdef CRAFT_SMOKE_REAL_EVENTS
#include <qpa/qwindowsysteminterface.h>
#endif
#include <QTimer>

#include "AppController.h"
#include "AppPaths.h"
#include "Logging.h"
#include "ManifoldMeshEngine.h"

using namespace craft::app;

namespace {

// Headless-friendly end-to-end check used by CTest (app_smoke): import, mold,
// analysis, a real rendered frame, then a JSON summary and CRAFT_SMOKE_OK.
class Smoke : public QObject {
 public:
  Smoke(AppController& app, QQuickWindow* window, QString importPath, bool mold, bool analyse, bool moldability, QString summary)
      : app_(app), window_(window), importPath_(std::move(importPath)), mold_(mold), analyse_(analyse), moldability_(moldability),
        summary_(std::move(summary)) {}

  void start() {
    QObject::connect(&app_, &AppController::errorOccurred, this,
                     [this](const QString& title, const QString& message, const QString& code) {
                       fail(QStringLiteral("%1: %2 (%3)").arg(title, message, code));
                     });
    QObject::connect(&app_, &AppController::modelChanged, this, [this] {
      if (app_.modelPhase() == "ready" && !imported_) {
        imported_ = true;
        if (mold_) app_.generateMold(); else afterMold();
      }
    });
    QObject::connect(&app_, &AppController::moldChanged, this, [this] {
      if (app_.moldPhase() == "complete" && !moldDone_) { moldDone_ = true; afterMold(); }
    });
    QObject::connect(&app_, &AppController::analysisChanged, this, [this] {
      if (app_.analysisPhase() == "complete" && !analysisDone_) { analysisDone_ = true; afterAnalysis(); }
    });
    QObject::connect(&app_, &AppController::engineeringReportsChanged, this, [this] {
      const QString phase = app_.engineeringReports().value("phase").toString();
      if (phase == "complete" && !reportsDone_) { reportsDone_ = true; render(); }
      else if (phase == "error") fail(QStringLiteral("moldability analysis failed: %1").arg(app_.engineeringReports().value("error").toString()));
    });
    QTimer::singleShot(120000, this, [this] { fail(QStringLiteral("smoke test timed out")); });
    app_.importStlFile(importPath_);
  }

 private:
  void afterMold() {
    if (analyse_) app_.runImportAnalysis(); else afterAnalysis();
  }
  void afterAnalysis() {
    if (moldability_) app_.runMoldabilityAnalysis(); else render();
  }
  // Exercises the real selection path (pick, hover, Cut by Face toggle) the way a user would, so the frame shows the
  // highlighted part, the dashed box, a selected face and a hovered face.
  void selectPartForSmoke() {
    const int w = static_cast<int>(window_->width()), h = static_cast<int>(window_->height());
    app_.camera()->setViewportSize(w, h);
    QPoint hit(-1, -1);
    for (int y = h / 2; y < h * 3 / 4 && hit.x() < 0; y += 6)
      for (int x = w / 4; x < w * 3 / 4 && hit.x() < 0; x += 6)
        if (app_.pickAt(x, y, w, h)) hit = QPoint(x, y);
    if (hit.x() < 0) return;
    app_.pickAt(hit.x(), hit.y(), w, h);  // the box is up now: this click toggles the face under the pointer
    const QString toggled = app_.selectionBox().value("selectedFaces").toStringList().value(0);
    // Hover a pixel whose nearest box face differs from the toggled one.
    for (int y = 0; y < h; y += 6)
      for (int x = 0; x < w; x += 6) {
        app_.hoverAt(x, y, w, h);
        const QString face = app_.selectionBox().value("hoverFace").toString();
        if (!face.isEmpty() && face != toggled) return;
      }
  }
  // The Sprue tool on the generated mold: preview the funnel at the first pixel whose axis reaches the cavity.
  void spruePreviewForSmoke() {
    const int w = static_cast<int>(window_->width()), h = static_cast<int>(window_->height());
    app_.camera()->setViewportSize(w, h);
    app_.setTool(QStringLiteral("sprue"));
    for (int y = h / 4; y < h * 3 / 4; y += 4)
      for (int x = w / 8; x < w * 5 / 8; x += 4) {
        app_.previewSprueAt(x, y, w, h);
        // Valid by default; with --sprue-invalid, the first pixel on the top face whose axis misses the cavity.
        if (app_.sprueCandidate().value("onTopFace").toBool() && app_.sprueCandidate().value("valid").toBool() != spruePreviewInvalid_) return;
      }
  }
  // Place a sprue on the mold, wait for it to resolve, then press on one of its rings and drag it 40 px, so the frame
  // shows the rings, the active ring, its preview scale and the diameter label.
  void gizmoSequence() {
    const int w = static_cast<int>(window_->width()), h = static_cast<int>(window_->height());
    app_.camera()->setViewportSize(w, h);
    app_.setTool(QStringLiteral("sprue"));
    bool placed = false;
    for (int y = h / 4; y < h * 3 / 4 && !placed; y += 4)
      for (int x = w / 8; x < w * 5 / 8 && !placed; x += 4) {
        app_.previewSprueAt(x, y, w, h);
        if (app_.sprueCandidate().value("valid").toBool()) placed = app_.placeSprueAt(x, y, w, h);
      }
    if (!placed) return fail(QStringLiteral("could not place a sprue for the gizmo smoke test"));
    auto poll = std::make_shared<std::function<void()>>();
    *poll = [this, poll, w, h] {
      if (app_.spruePhase() != "idle" || !app_.sprueEvaluation().has_value()) {
        QTimer::singleShot(100, this, *poll);
        return;
      }
      for (int y = h / 5; y < h * 4 / 5; y += 3) {
        for (int x = w / 8; x < w * 5 / 8; x += 3) {
          if (!app_.sprueGizmoPressAt(x, y, w, h)) continue;
          app_.sprueGizmoDragTo(x + 40, y, false);
          renderNow();
          return;
        }
      }
      fail(QStringLiteral("no sprue ring found under any pixel"));
    };
    (*poll)();
  }
  // The same flow with REAL mouse events delivered to the window, so the QML routing is exercised end to end: a press
  // on a ring starts a resize instead of an orbit, moves drive the diameter, the release commits it, and a double
  // click opens the numeric editor.
  void gizmoEventsSequence() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--sprue-gizmo-events needs a build with CRAFT_BUILD_TESTS (it drives the window through Qt's platform event interface)"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    auto* item = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
    if (!item) return fail(QStringLiteral("the viewport item was not found"));
    const int w = static_cast<int>(item->width()), h = static_cast<int>(item->height());
    app_.camera()->setViewportSize(w, h);
    app_.setTool(QStringLiteral("sprue"));
    bool placed = false;
    for (int y = h / 4; y < h * 3 / 4 && !placed; y += 4)
      for (int x = w / 8; x < w * 5 / 8 && !placed; x += 4) {
        app_.previewSprueAt(x, y, w, h);
        if (app_.sprueCandidate().value("valid").toBool()) placed = app_.placeSprueAt(x, y, w, h);
      }
    if (!placed) return fail(QStringLiteral("could not place a sprue for the gizmo events test"));

    // Platform-level events, like a real mouse: Qt itself turns a quick second press into the double click.
    const auto send = [this, item](QEvent::Type type, QPoint local, Qt::MouseButton button, Qt::MouseButtons buttons) {
      const QPointF scene = item->mapToScene(QPointF(local));
      QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), buttons, button, type);
    };
    const auto findRing = [this, w, h]() {
      for (int y = h / 6; y < h * 5 / 6; y += 3)
        for (int x = w / 8; x < w * 7 / 8; x += 3)
          if (app_.sprueGizmoHoverAt(x, y, w, h)) { app_.sprueGizmoLeave(); return QPoint(x, y); }
      return QPoint(-1, -1);
    };
    const auto resolved = [this] { return app_.spruePhase() == "idle" && app_.sprueEvaluation().has_value() && !app_.sprueIntents().empty() && app_.sprueIntents().front().validation.status == "resolved"; };

    auto stage = std::make_shared<int>(0);
    auto poll = std::make_shared<std::function<void()>>();
    auto before = std::make_shared<double>(0);
    *poll = [=, this] {
      if (!resolved()) { QTimer::singleShot(100, this, *poll); return; }
      const QPoint ring = findRing();
      if (ring.x() < 0) return fail(QStringLiteral("no sprue ring found under any pixel"));
      if (*stage == 0) {
        *before = app_.sprueIntents().front().profileDesign.profile.mainDiameterMm;
        send(QEvent::MouseMove, ring, Qt::NoButton, Qt::NoButton);
        send(QEvent::MouseButtonPress, ring, Qt::LeftButton, Qt::LeftButton);
        if (!app_.sprueGizmo().value("dragging").toBool()) return fail(QStringLiteral("a press on a ring did not start a resize (the gesture went to the camera)"));
        for (int i = 1; i <= 8; ++i) send(QEvent::MouseMove, ring + QPoint(i * 5, 0), Qt::NoButton, Qt::LeftButton);
        if (app_.sprueGizmo().value("labelText").toString().isEmpty()) return fail(QStringLiteral("dragging a ring showed no diameter label"));
        send(QEvent::MouseButtonRelease, ring + QPoint(40, 0), Qt::LeftButton, Qt::NoButton);
        const double after = app_.sprueIntents().front().profileDesign.profile.mainDiameterMm;
        if (!(after > *before + 1.5)) return fail(QStringLiteral("releasing the drag did not commit the dragged diameter (%1 -> %2)").arg(*before).arg(after));
        if (app_.sprueIntents().size() != 1) return fail(QStringLiteral("the drag placed another sprue"));
        *stage = 1;
        QTimer::singleShot(100, this, *poll);
        return;
      }
      // Stage 1: a double click on the (now larger) ring opens the numeric editor.
      send(QEvent::MouseButtonPress, ring, Qt::LeftButton, Qt::LeftButton);
      send(QEvent::MouseButtonRelease, ring, Qt::LeftButton, Qt::NoButton);
      send(QEvent::MouseButtonPress, ring, Qt::LeftButton, Qt::LeftButton);    // becomes the double click
      send(QEvent::MouseButtonRelease, ring, Qt::LeftButton, Qt::NoButton);
      if (!app_.sprueGizmo().value("editing").toBool())
        return fail(QStringLiteral("a double click on a ring did not open the numeric editor (state=%1, sprues=%2, ring at %3,%4)")
                        .arg(app_.sprueGizmo().value("state").toString()).arg(app_.sprueIntents().size()).arg(ring.x()).arg(ring.y()));
      if (app_.sprueIntents().size() != 1) return fail(QStringLiteral("the double click placed another sprue"));
      app_.sprueGizmoCancel();
      renderNow();
    };
    (*poll)();
#endif
  }
  void render() {
    if (spruePreview_ && sprueGizmoEvents_) return gizmoEventsSequence();
    if (spruePreview_ && sprueGizmo_) return gizmoSequence();
    renderNow();
  }
  void renderNow() {
    if (spruePreview_) spruePreviewForSmoke();
    if (selectPart_) selectPartForSmoke();
    QTimer::singleShot(1500, this, [this] {
      const QImage frame = window_->grabWindow();
      if (!screenshot_.isEmpty()) frame.save(screenshot_);
      int distinct = 0;
      QRgb first = frame.isNull() ? 0 : frame.pixel(0, 0);
      for (int y = 0; y < frame.height(); y += 8)
        for (int x = 0; x < frame.width(); x += 8)
          if (frame.pixel(x, y) != first) ++distinct;
      QVariantMap s = app_.stateSummary();
      s.insert("frameWidth", frame.width());
      s.insert("frameHeight", frame.height());
      s.insert("frameNonBackgroundSamples", distinct);
      // Which runtime actually served the analysis jobs (a packaged build must say "bundled runtime").
      const auto config = AppPaths::analysisWorkerConfig();
      s.insert("analysisRuntimeSource", AppPaths::analysisRuntimeSource());
      s.insert("analysisPython", config.pythonExecutable);
      s.insert("analysisWorkerScript", config.workerScript);
      s.insert("analysisWorkerInfo", app_.analysisWorkerInfo());
      s.insert("applicationDir", QCoreApplication::applicationDirPath());
      s.insert("selectionBox", app_.selectionBox());
      s.insert("sprueCandidate", app_.sprueCandidate());
      s.insert("sprueGlass", app_.sprueGlass());
      s.insert("sprueGizmo", app_.sprueGizmo());
      s.insert("selection", app_.selection());
      s.insert("engineeringReportsSummary", app_.engineeringReports());
      finish(s, !frame.isNull() && distinct > 50);
    });
  }
  void finish(const QVariantMap& s, bool renderedOk) {
    if (done_) return;
    done_ = true;
    if (!summary_.isEmpty()) {
      QFile f(summary_);
      if (f.open(QIODevice::WriteOnly)) f.write(QJsonDocument(QJsonObject::fromVariantMap(s)).toJson());
    }
    if (!renderedOk) return fail(QStringLiteral("viewport rendered an empty frame"));
    fprintf(stdout, "CRAFT_SMOKE_OK\n");
    fflush(stdout);
    QCoreApplication::exit(0);
  }
  void fail(const QString& why) {
    if (done_) return;
    done_ = true;
    fprintf(stderr, "CRAFT_SMOKE_FAIL: %s\n", qPrintable(why));
    QCoreApplication::exit(2);
  }

 public:
  void setSelectPart(bool value) { selectPart_ = value; }
  void setSpruePreview(bool value, bool invalid = false) { spruePreview_ = value; spruePreviewInvalid_ = invalid; }
  void setSprueGizmo(bool value, bool events = false) { sprueGizmo_ = value; sprueGizmoEvents_ = events; }
  void setScreenshot(const QString& path) { screenshot_ = path; }

 private:
  AppController& app_;
  QQuickWindow* window_;
  QString importPath_, summary_, screenshot_;
  bool selectPart_ = false, spruePreview_ = false, spruePreviewInvalid_ = false, sprueGizmo_ = false, sprueGizmoEvents_ = false;
  bool mold_, analyse_, moldability_;
  bool imported_ = false, moldDone_ = false, analysisDone_ = false, reportsDone_ = false, done_ = false;
};

}  // namespace

int main(int argc, char* argv[]) {
  QGuiApplication application(argc, argv);
  QCoreApplication::setOrganizationName(QStringLiteral("Craft"));
  QCoreApplication::setApplicationName(QStringLiteral("Craft"));
  QCoreApplication::setApplicationVersion(QStringLiteral("0.1.0"));
  QQuickStyle::setStyle(QStringLiteral("Fusion"));
  installLogging();

  QCommandLineParser parser;
  parser.addHelpOption();
  parser.addOption({"smoke-test", "Run the end-to-end smoke test and exit."});
  parser.addOption({"import", "STL file to import.", "path"});
  parser.addOption({"generate-mold", "Generate a mold after import (smoke test)."});
  parser.addOption({"analyze", "Run the Python import analysis (smoke test)."});
  parser.addOption({"moldability", "Run the Python moldability/cavity/readiness analysis (smoke test)."});
  parser.addOption({"summary", "Write a JSON state summary here (smoke test).", "path"});
  parser.addOption({"select-part", "Select the part, toggle a box face and hover another before the frame is taken (smoke test)."});
  parser.addOption({"screenshot", "Save the rendered frame as a PNG (smoke test).", "path"});
  parser.addOption({"theme", "Start with this theme, dark or light (smoke test).", "name"});
  parser.addOption({"sprue-preview", "Select the Sprue tool and preview the funnel on the generated mold (smoke test; use with --generate-mold)."});
  parser.addOption({"sprue-invalid", "With --sprue-preview: preview where the axis misses the cavity (the red case)."});
  parser.addOption({"sprue-gizmo", "With --sprue-preview: place a sprue, then drag one of its resize rings (smoke test)."});
  parser.addOption({"sprue-gizmo-events", "With --sprue-preview: the same through real mouse events, plus a double click (smoke test)."});
  parser.process(application);

  AppController controller(std::shared_ptr<craft::IMeshGeometryEngine>(craft::createManifoldMeshEngine()),
                           AppPaths::analysisWorkerConfig());

  if (parser.isSet("theme")) controller.setTheme(parser.value("theme"));

  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty(QStringLiteral("app"), &controller);
  engine.loadFromModule("Craft", "Main");
  if (engine.rootObjects().isEmpty()) return 1;
  auto* window = qobject_cast<QQuickWindow*>(engine.rootObjects().first());

  std::unique_ptr<Smoke> smoke;
  if (parser.isSet("smoke-test")) {
    smoke = std::make_unique<Smoke>(controller, window, parser.value("import"),
                                    parser.isSet("generate-mold"), parser.isSet("analyze"), parser.isSet("moldability"),
                                    parser.value("summary"));
    smoke->setSelectPart(parser.isSet("select-part"));
    smoke->setSpruePreview(parser.isSet("sprue-preview"), parser.isSet("sprue-invalid"));
    smoke->setSprueGizmo(parser.isSet("sprue-gizmo"), parser.isSet("sprue-gizmo-events"));
    smoke->setScreenshot(parser.value("screenshot"));
    QTimer::singleShot(0, smoke.get(), [&smoke] { smoke->start(); });
  } else if (!parser.positionalArguments().isEmpty()) {
    // What a double-click on an associated file does: a .craft project opens as a project, anything else imports as an STL.
    const QString path = parser.positionalArguments().first();
    if (QFileInfo(path).suffix().compare(QStringLiteral("craft"), Qt::CaseInsensitive) == 0) controller.openProjectFile(path);
    else controller.importStlFile(path);
  }
  return application.exec();
}
