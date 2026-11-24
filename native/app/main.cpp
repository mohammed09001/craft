#include <QAccessible>
#include <QCommandLineParser>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QMimeData>
#include <QRegularExpression>
#include <QSet>
#include <QMouseEvent>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QSurfaceFormat>
#include <QVector4D>

#include <functional>
#include <memory>

#ifdef CRAFT_SMOKE_REAL_EVENTS
#include <qpa/qwindowsysteminterface.h>
#include <qpa/qplatformdrag.h>
#endif
#include <QTimer>

#include "AppController.h"
#include "AppPaths.h"
#include "GeometryWorker.h"
#include "Logging.h"
#include "ManifoldMeshEngine.h"
#ifdef CRAFT_SMOKE_REAL_EVENTS
#include "ProjectBench.h"
#include "ViewportBench.h"
#include "UiTour.h"
#include "CrashDrill.h"
#endif

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
    // Only when the autosave folder is isolated (CRAFT_AUTOSAVE_DIR, as the tests set it): never delete the user's own autosaves.
    if (!qEnvironmentVariable("CRAFT_AUTOSAVE_DIR").isEmpty()) app_.discardRecovery();
    QObject::connect(&app_, &AppController::errorOccurred, this,
                     [this](const QString& title, const QString& message, const QString& code) {
                       if (expectError_) return;   // a test that raises an error on purpose (the dialog's focus)
                       fail(QStringLiteral("%1: %2 (%3)").arg(title, message, code));
                     });
    QObject::connect(&app_, &AppController::modelChanged, this, [this] {
      if (app_.modelPhase() == "ready" && !imported_) {
        imported_ = true;
        for (const QString& face : cutFaces_) app_.setCutFaceEnabled(face, true);   // --cut-face: planes before the mold is generated
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
    if (dropEvents_) return dropEventsSequence();   // the part arrives by being dropped on the window
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
      injectMouse(scene, buttons, button, type);
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
  // The Eraser through REAL mouse events: hovering a plane turns it red (after the 33 ms hover throttle), a click on it
  // removes it, a click on empty space removes nothing.
  // Runs `go` once the viewport item has kept the same size for a while. A window can still be resized after it appears
  // (placed on another monitor, a layout pass), and a pixel position measured before that no longer lies on the plane.
  void whenViewportSettled(std::function<void()> go) {
    struct State { int w = -1, h = -1, stable = 0; };
    auto state = std::make_shared<State>();
    auto poll = std::make_shared<std::function<void()>>();
    *poll = [this, state, poll, go = std::move(go)]() mutable {
      auto* item = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
      const int w = item ? static_cast<int>(item->width()) : 0, h = item ? static_cast<int>(item->height()) : 0;
      state->stable = (w == state->w && h == state->h && w > 0) ? state->stable + 1 : 0;
      state->w = w;
      state->h = h;
      if (state->stable >= 6) { go(); return; }   // six polls of 50 ms with the same size
      QTimer::singleShot(50, this, *poll);
    };
    QTimer::singleShot(50, this, *poll);
  }
  // Dragging a cutting plane with the right mouse button through REAL mouse events delivered to the window: hover brightens the
  // plane, a right press on it drags it instead of panning, the release commits one undo step; a right drag elsewhere still pans.
  // Dropping files on the window through REAL platform drag-and-drop events: two files and a file that is not an STL are refused with the
  // reference's messages and import nothing; one STL imports (the drop target is outlined while the drag is over the window).
  // The platform interface takes NATIVE pixels (QTest's own mouse helpers convert the same way); every position in these tests is in the
  // window's device-independent pixels, as the application sees them, so it is scaled by the window's device pixel ratio here. Without this
  // the real-input tests only held at a display scale of 100 %.
#ifdef CRAFT_SMOKE_REAL_EVENTS   // the private platform interface is not linked into packaged (tests-off) builds
  void injectMouse(const QPointF& scene, Qt::MouseButtons buttons, Qt::MouseButton button, QEvent::Type type) {
    const qreal dpr = window_->devicePixelRatio();
    QWindowSystemInterface::handleMouseEvent(window_, scene * dpr, window_->mapToGlobal(scene) * dpr, buttons, button, type);
  }
#endif
  // What is drawn as a plane must be what the controller picks as a plane, whatever the display scale and the window size. The ray of a pixel and
  // the frame are made by different code, and a mix-up of device-independent and device pixels, or a stale viewport size after a resize, would put
  // the drawn slab far from where the pick finds it. The test: a plane under the pointer is drawn brighter than an idle one, so the pixels that
  // differ between the frame with the pointer on the plane and the frame without are drawn plane; each of them (in device pixels) must be picked
  // as a plane. (The pick ignores what is in front of a slab, as the reference's raycast does, so the picked area may be larger than the drawn
  // one, never smaller.) Needs the 'top' and 'left' planes chosen. Returns the problem, or nothing.
  /// The centre of `item` in scene coordinates, once it can be clicked: the window is exposed and active, the item is visible and has a size,
  /// and its position has not changed for three polls in a row (a layout that is still settling after a start, a resize or a model that was
  /// just loaded moves a button between the moment its position is read and the moment the press arrives, and the press then misses it).
  /// Gives up after five seconds and returns what it has; `why` then names what was not so, for the test's message.
  QPointF stableCentre(QQuickItem* item, QString* why = nullptr) {
    QPointF last(-1e9, -1e9);
    int steady = 0;
    QElapsedTimer timer;
    timer.start();
    QString problem;
    while (timer.elapsed() < 5000) {
      problem.clear();
      if (!window_->isExposed()) problem = QStringLiteral("the window is not exposed");
      else if (!window_->isActive()) { window_->requestActivate(); problem = QStringLiteral("the window is not active"); }
      else if (!item->isVisible() || item->width() <= 0 || item->height() <= 0) problem = QStringLiteral("the item is not visible or has no size");
      const QPointF now = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
      steady = (problem.isEmpty() && now == last) ? steady + 1 : 0;
      last = now;
      if (steady >= 3) break;
      QEventLoop loop;
      QTimer::singleShot(30, &loop, &QEventLoop::quit);
      loop.exec();
    }
    if (why) *why = steady >= 3 ? QString() : (problem.isEmpty() ? QStringLiteral("its position kept changing") : problem);
    return last;
  }
  QString drawnAndPickedAgree(QQuickItem* item) {
    const int w = static_cast<int>(item->width()), h = static_cast<int>(item->height());
    app_.camera()->setViewportSize(w, h);
    QPoint onPlane(-1, -1);
    for (int y = h / 6; y < h * 5 / 6 && onPlane.x() < 0; y += 3)
      for (int x = w / 8; x < w * 7 / 8 && onPlane.x() < 0; x += 3)
        if (app_.cutPlaneHoverAt(x, y, w, h) && app_.cutPlanes().value("planeHoverFace").toString() == QLatin1String("top")) onPlane = QPoint(x, y);
    app_.cutPlaneLeave();
    if (onPlane.x() < 0) return QStringLiteral("no pixel on the top cutting plane (viewport %1 x %2)").arg(w).arg(h);
    const qreal dpr = window_->devicePixelRatio();
    const auto frameNow = [this, dpr] {
      QImage frame;
      for (int attempt = 0; attempt < 20 && (frame.isNull() || frame.width() != qRound(window_->width() * dpr)); ++attempt) {
        QEventLoop loop;
        QTimer::singleShot(120, &loop, &QEventLoop::quit);
        loop.exec();
        frame = window_->grabWindow();
      }
      return frame;
    };
    // The idle frame first; then the hover, and frames are taken until one differs from the idle one (a change of the scene reaches the
    // screen on the next rendered frame, and after a resize that can be a moment later), for at most three seconds.
    app_.cutPlaneLeave();
    const QImage idle = frameNow();
    app_.cutPlaneHoverAt(onPlane.x(), onPlane.y(), w, h);
    QImage hovered = frameNow();
    for (int attempt = 0; attempt < 30 && !hovered.isNull() && hovered == idle; ++attempt) hovered = frameNow();
    if (hovered.isNull() || idle.isNull() || hovered.size() != idle.size()) return QStringLiteral("no frames could be grabbed to check the planes' pixels");
    const QPointF origin = item->mapToScene(QPointF(0, 0));
    int drawn = 0, picked = 0;
    for (int y = 0; y < hovered.height(); y += 4)
      for (int x = 0; x < hovered.width(); x += 4) {
        const QColor a = hovered.pixelColor(x, y), b = idle.pixelColor(x, y);
        if (std::abs(a.red() - b.red()) + std::abs(a.green() - b.green()) + std::abs(a.blue() - b.blue()) <= 20) continue;
        const double lx = x / dpr - origin.x(), ly = y / dpr - origin.y();
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
        ++drawn;
        if (app_.cutPlaneHoverAt(lx, ly, w, h)) ++picked;
      }
    app_.cutPlaneLeave();
    if (drawn < 200) return QStringLiteral("the hovered plane changed only %1 sampled pixels of the frame (scale %2, viewport %3 x %4): too few to compare with the pick").arg(drawn).arg(dpr).arg(w).arg(h);
    if (picked < drawn * 95 / 100)
      return QStringLiteral("only %1 of %2 sampled pixels that are drawn as a plane are picked as one (scale %3, viewport %4 x %5): the drawing and the picking disagree").arg(picked).arg(drawn).arg(dpr).arg(w).arg(h);
    return {};
  }
  void dropEventsSequence() { whenViewportSettled([this] { dropEventsBody(); }); }
  void dropEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--drop-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    auto* viewport = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
    auto* overlay = window_->findChild<QQuickItem*>(QStringLiteral("dropOverlay"));
    if (!viewport || !overlay) return fail(QStringLiteral("the viewport or the drop overlay was not found"));
    const QPoint where = window_->mapFromGlobal(window_->mapToGlobal(viewport->mapToScene(QPointF(viewport->width() / 2, viewport->height() / 2)).toPoint()));
    const auto drop = [&](const QList<QUrl>& urls, bool* overlayShown) {
      QMimeData mime;
      mime.setUrls(urls);
      const QPoint nativeWhere = (QPointF(where) * window_->devicePixelRatio()).toPoint();   // the platform interface takes native pixels
      const auto over = QWindowSystemInterface::handleDrag(window_, &mime, nativeWhere, Qt::CopyAction, Qt::LeftButton, Qt::NoModifier);
      if (overlayShown) *overlayShown = over.isAccepted() && overlay->isVisible();
      QWindowSystemInterface::handleDrop(window_, &mime, nativeWhere, Qt::CopyAction, Qt::LeftButton, Qt::NoModifier);
      return over.isAccepted();
    };
    bool shown = false;
    if (!drop({QUrl::fromLocalFile(importPath_), QUrl::fromLocalFile(importPath_)}, &shown)) return fail(QStringLiteral("the window did not accept a drag of files"));
    if (!shown) return fail(QStringLiteral("the drop target was not outlined while a drag was over the window"));
    if (app_.statusText() != QLatin1String("Choose exactly one STL file.") || app_.modelPhase() == "ready")
      return fail(QStringLiteral("two dropped files were not refused (status '%1', model %2)").arg(app_.statusText(), app_.modelPhase()));
    drop({QUrl::fromLocalFile(QFileInfo(importPath_).absolutePath() + QStringLiteral("/not-a-model.txt"))}, nullptr);
    if (app_.statusText() != QLatin1String("Only .stl files are supported.") || app_.modelPhase() == "ready")
      return fail(QStringLiteral("a dropped file that is not an STL was not refused (status '%1')").arg(app_.statusText()));
    if (overlay->isVisible()) return fail(QStringLiteral("the drop target stayed outlined after the drop"));
    drop({QUrl::fromLocalFile(importPath_)}, nullptr);   // the model arriving continues the usual smoke flow (a mold, a frame, the summary)
#endif
  }
  // The inspector's sections through REAL input: a click on a header folds and unfolds it, Space and Enter do the same from the keyboard once
  // the header has the focus (it shows a focus ring and names itself to a screen reader), and Collapse all / Expand all fold every section.
  // The Molds browser through REAL clicks: with the mold generated, a click on a body's checkbox hides that body on the scene and a second one shows it
  // again; the click on "Original" hides the model. (Everything else is folded first so the section sits at the top of the inspector, in view.)
  // The Master Mold toolbar entry through a REAL click: it needs only an imported model (no mold, planes or cavity), is unavailable while the
  // tooling is generated, ends highlighted with the plain name as its tooltip, and says "needs regeneration" when a printer change makes it stale.
  void masterEventsSequence() { whenViewportSettled([this] { masterEventsBody(); }); }
  void masterEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--master-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    const auto settle = [](int ms) { QEventLoop loop; QTimer::singleShot(ms, &loop, &QEventLoop::quit); loop.exec(); };
    const auto waitFor = [&settle](const std::function<bool()>& condition, int ms) {
      QElapsedTimer timer;
      timer.start();
      while (!condition() && timer.elapsed() < ms) settle(25);
      return condition();
    };
    std::function<QQuickItem*(QQuickItem*, const QString&)> findItem = [&findItem](QQuickItem* from, const QString& name) -> QQuickItem* {
      if (from->objectName() == name) return from;
      for (QQuickItem* child : from->childItems())
        if (QQuickItem* found = findItem(child, name)) return found;
      return nullptr;
    };
    QQuickItem* button = findItem(window_->contentItem(), QStringLiteral("masterMoldButton"));
    if (!button) return fail(QStringLiteral("the Master Mold toolbar button was not found"));
    const auto tip = [&] {   // what the button's tooltip shows (the toolbar owns it)
      QQuickItem* bar = findItem(window_->contentItem(), QStringLiteral("viewportToolbar"));
      return bar ? bar->property("masterMoldTip").toString() : QString();
    };
    const auto bodyCount = [&] {
      int n = 0;
      for (int r = 0; r < app_.scene()->rowCount(); ++r)
        if (app_.scene()->data(app_.scene()->index(r), SceneModel::KindRole).toString() == QLatin1String("mold-body")) ++n;
      return n;
    };

    if (!button->property("enabled").toBool()) return fail(QStringLiteral("the Master Mold button is disabled with a valid model and no mold"));
    if (button->property("highlighted").toBool()) return fail(QStringLiteral("the Master Mold button is highlighted before anything was generated"));
    if (tip() != QLatin1String("Master Mold")) return fail(QStringLiteral("the idle tooltip is not the plain name: ") + tip());
    if (bodyCount() != 0) return fail(QStringLiteral("there are mold bodies before anything was generated"));

    QString notReady;
    const QPointF scene = stableCentre(button, &notReady);
    if (!notReady.isEmpty()) return fail(QStringLiteral("the Master Mold button could not be clicked: ") + notReady);
    injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
    injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
    injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
    // The click started the job (synchronously, with the worker still running): the button is unavailable and its tooltip is the progress.
    if (!app_.masterMold().value("generating").toBool()) return fail(QStringLiteral("a click on the Master Mold button did not start generating (button at %1,%2 size %3x%4, enabled %5, window active %6, status %7)").arg(scene.x()).arg(scene.y()).arg(button->width()).arg(button->height()).arg(button->property("enabled").toBool()).arg(window_->isActive()).arg(app_.masterMold().value("status").toString()));
    if (button->property("enabled").toBool()) return fail(QStringLiteral("the Master Mold button stayed enabled while generating"));
    if (tip() == QLatin1String("Master Mold")) return fail(QStringLiteral("the tooltip did not show progress while generating"));
    if (!waitFor([&] { return !app_.masterMold().value("generating").toBool() && app_.masterMold().value("status").toString() != "unavailable"; }, 120000))
      return fail(QStringLiteral("the Master Mold did not finish"));
    if (app_.masterMold().value("uiKind").toString() != QLatin1String("success"))
      return fail(QStringLiteral("the Master Mold did not succeed: ") + app_.masterMold().value("uiKind").toString() + QLatin1String(" ") + app_.masterMold().value("banner").toString());
    settle(150);
    if (bodyCount() < 1) return fail(QStringLiteral("a finished Master Mold put no pieces on the scene"));
    if (!button->property("highlighted").toBool()) return fail(QStringLiteral("the Master Mold button is not highlighted when complete"));
    if (!button->property("enabled").toBool()) return fail(QStringLiteral("the Master Mold button stayed disabled after finishing"));
    if (tip() != QLatin1String("Master Mold")) return fail(QStringLiteral("the tooltip after success is not the plain name: ") + tip());

    app_.setPrinterVolume(500, 500, 500);   // a Master input: the result stays, flagged stale
    settle(150);
    if (!tip().contains(QLatin1String("needs regeneration"))) return fail(QStringLiteral("a stale result's tooltip does not say so: ") + tip());
    if (button->property("highlighted").toBool()) return fail(QStringLiteral("a stale Master Mold button is still highlighted"));

    // The pieces list (MasterMoldPiecesBrowser.tsx): its button is there once there is tooling to inspect; a click opens the list under the bar,
    // a check box shows or hides one piece, Show all brings every piece back, Isolate keeps one set, a second click on the button closes it.
    {
      const auto clickItem = [&](QQuickItem* target, const QString& what) -> QString {
        QString notReady;
        const QPointF at = stableCentre(target, &notReady);
        if (!notReady.isEmpty()) return QStringLiteral("%1 could not be clicked: %2").arg(what, notReady);
        injectMouse(at, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
        injectMouse(at, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
        injectMouse(at, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
        settle(150);
        return {};
      };
      const auto visibleKeys = [&] {
        QStringList shown, hidden;
        for (const QVariant& set : app_.masterMold().value("sets").toList())
          for (const QVariant& piece : set.toMap().value("pieces").toList()) (piece.toMap().value("visible").toBool() ? shown : hidden) << piece.toMap().value("key").toString();
        return QPair<QStringList, QStringList>(shown, hidden);
      };
      QQuickItem* piecesButton = findItem(window_->contentItem(), QStringLiteral("masterPiecesButton"));
      if (!piecesButton || !piecesButton->isVisible()) return fail(QStringLiteral("the Master Mold pieces button is not shown with tooling to inspect"));
      QQuickItem* flyout = findItem(window_->contentItem(), QStringLiteral("masterPiecesFlyout"));
      if (!flyout) return fail(QStringLiteral("the Master Mold pieces list does not exist"));
      if (flyout->isVisible()) return fail(QStringLiteral("the pieces list is open before the button was clicked"));
      if (const QString p = clickItem(piecesButton, QStringLiteral("the pieces button")); !p.isEmpty()) return fail(p);
      if (!waitFor([&] { return flyout->isVisible(); }, 3000)) return fail(QStringLiteral("a click on the pieces button did not open the list"));
      if (!piecesButton->property("highlighted").toBool()) return fail(QStringLiteral("the pieces button is not shown as pressed while the list is open"));
      QQuickItem* title = findItem(flyout, QStringLiteral("masterPiecesTitle"));
      if (!title || !title->property("text").toString().startsWith(QLatin1String("Two masters"))) return fail(QStringLiteral("the pieces list has no 'Two masters' title"));
      const QRectF listRect(flyout->mapToScene(QPointF(0, 0)), QSizeF(flyout->width(), flyout->height()));
      QQuickItem* viewportItem = findItem(window_->contentItem(), QStringLiteral("viewport"));
      const QRectF viewRect(viewportItem->mapToScene(QPointF(0, 0)), QSizeF(viewportItem->width(), viewportItem->height()));
      if (!viewRect.contains(listRect)) return fail(QStringLiteral("the pieces list is not inside the viewport"));

      const auto [shownAtFirst, hiddenAtFirst] = visibleKeys();
      // The two masters are shown; the two virtual working halves are a preview and start hidden.
      if (shownAtFirst.size() != 2 || hiddenAtFirst.size() != 2 || !shownAtFirst.contains(QStringLiteral("master-a")) || !shownAtFirst.contains(QStringLiteral("master-b")))
        return fail(QStringLiteral("the list does not open with exactly the two masters shown (%1 shown, %2 hidden)").arg(shownAtFirst.size()).arg(hiddenAtFirst.size()));
      const QString firstKey = shownAtFirst.first();
      QQuickItem* check = findItem(flyout, QStringLiteral("masterPieceFlyout:") + firstKey);
      if (!check) return fail(QStringLiteral("the list has no check box for the piece %1").arg(firstKey));
      if (const QString p = clickItem(check, QStringLiteral("a piece's check box")); !p.isEmpty()) return fail(p);
      if (!waitFor([&] { return visibleKeys().second.contains(firstKey); }, 3000)) return fail(QStringLiteral("a click on a piece's check box did not hide the piece"));
      QQuickItem* showAll = findItem(flyout, QStringLiteral("masterPiecesShowAll"));
      if (!showAll) return fail(QStringLiteral("the list has no Show all"));
      if (const QString p = clickItem(showAll, QStringLiteral("Show all")); !p.isEmpty()) return fail(p);
      if (!waitFor([&] { return visibleKeys().second.isEmpty(); }, 3000)) return fail(QStringLiteral("Show all did not bring every piece back"));

      QString setId;
      for (const QVariant& set : app_.masterMold().value("sets").toList()) if (set.toMap().value("canIsolate").toBool() && setId.isEmpty()) setId = set.toMap().value("id").toString();
      QQuickItem* isolate = setId.isEmpty() ? nullptr : findItem(flyout, QStringLiteral("masterIsolate:") + setId);
      if (!isolate) return fail(QStringLiteral("the list has no Isolate for a set that can be isolated"));
      if (const QString p = clickItem(isolate, QStringLiteral("Isolate")); !p.isEmpty()) return fail(p);
      settle(150);
      if (visibleKeys().first.isEmpty()) return fail(QStringLiteral("Isolate hid every piece of the isolated set"));

      if (const QString p = clickItem(piecesButton, QStringLiteral("the pieces button (to close)")); !p.isEmpty()) return fail(p);
      if (!waitFor([&] { return !flyout->isVisible(); }, 3000)) return fail(QStringLiteral("a second click on the pieces button did not close the list"));
    }
    renderNow();
#endif
  }
  // The viewport's floating toolbar through REAL clicks (the reference's "Model tools" bar): it sits inside the viewport; the mold-scale stepper
  // steps the clearance in whole millimetres and shows it; a disabled tool ignores a click; the badge counts the chosen cutting planes; the
  // Eraser, Pointer and Sprue buttons switch the tool; the cavity button says "Create Cavity", builds the mold and then says "Rebuild Cavity";
  // the glass button toggles the appearance; Undo steps back; and a press, a drag and a wheel on the bar neither orbit nor zoom the view.
  // The smoke flow comes back to its dispatcher whenever a mold completes, and this test builds a mold: it must not start itself a second time inside
  // its own event loop (the second copy removed the planes under the first and the mold with them).
  void toolbarEventsSequence() {
    if (toolbarEventsStarted_) return;
    toolbarEventsStarted_ = true;
    whenViewportSettled([this] { toolbarEventsBody(); });
  }
  void toolbarEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--toolbar-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    const auto settle = [](int ms) { QEventLoop loop; QTimer::singleShot(ms, &loop, &QEventLoop::quit); loop.exec(); };
    const auto waitFor = [&settle](const std::function<bool()>& condition, int ms) {
      QElapsedTimer timer;
      timer.start();
      while (!condition() && timer.elapsed() < ms) settle(25);
      return condition();
    };
    std::function<QQuickItem*(QQuickItem*, const QString&)> findItem = [&findItem](QQuickItem* from, const QString& name) -> QQuickItem* {
      if (from->objectName() == name) return from;
      for (QQuickItem* child : from->childItems())
        if (QQuickItem* found = findItem(child, name)) return found;
      return nullptr;
    };
    const auto item = [&](const char* name) { return findItem(window_->contentItem(), QString::fromLatin1(name)); };
    // A real click on a named item: the problem, or nothing.
    const auto click = [&](const char* name) -> QString {
      QQuickItem* target = item(name);
      if (!target) return QStringLiteral("the toolbar item '%1' was not found").arg(QString::fromLatin1(name));
      QString notReady;
      const QPointF scene = stableCentre(target, &notReady);
      if (!notReady.isEmpty()) return QStringLiteral("'%1' could not be clicked: %2").arg(QString::fromLatin1(name), notReady);
      injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
      settle(120);
      return {};
    };
    const auto enabled = [&](const char* name) { QQuickItem* t = item(name); return t && t->property("enabled").toBool(); };
    const auto problem = [&](const QString& what) { return fail(what); };

    // 0. The bar is there, inside the viewport, centred in its upper part.
    QQuickItem* bar = item("viewportToolbarPanel");   // the visible bar (the toolbar item itself is a lane across the viewport that takes no input)
    QQuickItem* viewport = item("viewport");
    if (!bar || !viewport || !bar->isVisible()) return problem(QStringLiteral("the viewport toolbar is not shown with a model loaded"));
    const QRectF barRect(bar->mapToScene(QPointF(0, 0)), QSizeF(bar->width(), bar->height()));
    const QRectF viewportRect(viewport->mapToScene(QPointF(0, 0)), QSizeF(viewport->width(), viewport->height()));
    if (!viewportRect.contains(barRect)) return problem(QStringLiteral("the toolbar (%1) is not inside the viewport (%2)").arg(QString::number(barRect.width()), QString::number(viewportRect.width())));
    if (std::fabs(barRect.center().x() - viewportRect.center().x()) > 2 || barRect.top() - viewportRect.top() > 30)
      return problem(QStringLiteral("the toolbar is not at the upper centre of the viewport"));
    for (const char* name : {"flipToolButton", "clearanceMinus", "clearancePlus", "pointerToolButton", "eraserToolButton", "sprueToolButton", "cavityButton", "masterMoldButton", "undoButton", "redoButton"})
      if (!item(name)) return problem(QStringLiteral("the toolbar has no '%1'").arg(QString::fromLatin1(name)));
    if (app_.tool() != QLatin1String("select")) return problem(QStringLiteral("the pointer is not the tool at the start"));
    if (!item("pointerToolButton")->property("highlighted").toBool()) return problem(QStringLiteral("the Pointer button is not shown as the active tool"));

    // 0b. Mold Scale through real input: the bar's button makes it the tool; a drag in the view changes the clearance by 0.1 mm per pixel and is one
    // undo step; Escape in mid-drag puts the value back; the field takes a typed value and commits it with Enter.
    {
      const auto key = [this](int code, const QString& text = QString(), Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
        QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, code, modifiers, text);
        QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, code, modifiers, text);
      };
      const auto depth = [&] { return app_.history().value("undoDepth").toInt(); };
      const double base = app_.moldClearanceMm();
      const int depthBase = depth();
      QQuickItem* scaleField = item("moldScaleEditor");
      if (!item("moldScaleToolButton") || !scaleField) return problem(QStringLiteral("the Mold Scale button or its field is missing"));
      if (scaleField->isVisible()) return problem(QStringLiteral("the Mold Scale field is shown before the tool is chosen"));
      if (const QString p = click("moldScaleToolButton"); !p.isEmpty()) return problem(p);
      if (app_.tool() != QLatin1String("mold-scale") || !item("moldScaleToolButton")->property("highlighted").toBool()) return problem(QStringLiteral("a click on the Mold Scale button did not make it the active tool (%1)").arg(app_.tool()));
      if (!waitFor([&] { return scaleField->isVisible(); }, 3000)) return problem(QStringLiteral("the Mold Scale field did not appear with the tool"));
      if (scaleField->property("text").toString() != QString::number(base)) return problem(QStringLiteral("the field shows '%1' for a clearance of %2").arg(scaleField->property("text").toString()).arg(base));

      // A drag of 50 px to the right in empty viewport: +5 mm while it is held, one undo step once it is released, and the camera stays where it was.
      const QRectF vp(viewport->mapToScene(QPointF(0, 0)), QSizeF(viewport->width(), viewport->height()));
      const QPointF from(vp.left() + 80, vp.bottom() - 120);
      const QVector3D eye = app_.camera()->position();
      injectMouse(from, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      settle(60);
      injectMouse(from, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      settle(60);
      for (int step = 1; step <= 5; ++step) { injectMouse(from + QPointF(10 * step, 0), Qt::LeftButton, Qt::LeftButton, QEvent::MouseMove); settle(30); }
      if (std::fabs(app_.moldClearanceMm() - (base + 5.0)) > 1e-9) return problem(QStringLiteral("a 50 px drag gave a clearance of %1, expected %2").arg(app_.moldClearanceMm()).arg(base + 5.0));
      if (scaleField->property("text").toString() != QString::number(base + 5.0)) return problem(QStringLiteral("the field shows '%1' during the drag, expected %2").arg(scaleField->property("text").toString()).arg(base + 5.0));
      injectMouse(from + QPointF(50, 0), Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
      settle(100);
      if (depth() != depthBase + 1) return problem(QStringLiteral("the drag made %1 undo steps, expected 1").arg(depth() - depthBase));
      if ((app_.camera()->position() - eye).length() > 1e-4) return problem(QStringLiteral("a Mold Scale drag moved the camera"));

      // Escape in mid-drag: the value goes back, no step is added.
      injectMouse(from, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      settle(60);
      injectMouse(from, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      settle(60);
      for (int step = 1; step <= 3; ++step) { injectMouse(from + QPointF(10 * step, 0), Qt::LeftButton, Qt::LeftButton, QEvent::MouseMove); settle(30); }
      if (std::fabs(app_.moldClearanceMm() - (base + 8.0)) > 1e-9) return problem(QStringLiteral("the second drag gave %1, expected %2").arg(app_.moldClearanceMm()).arg(base + 8.0));
      key(Qt::Key_Escape);
      settle(100);
      if (std::fabs(app_.moldClearanceMm() - (base + 5.0)) > 1e-9) return problem(QStringLiteral("Escape in mid-drag left the clearance at %1, expected %2").arg(app_.moldClearanceMm()).arg(base + 5.0));
      injectMouse(from + QPointF(30, 0), Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
      settle(100);
      if (depth() != depthBase + 1) return problem(QStringLiteral("the cancelled drag changed the history (%1 steps)").arg(depth() - depthBase));

      // A typed value: click into the field, replace its text, Enter.
      QString notReady;
      const QPointF fieldCentre = stableCentre(scaleField, &notReady);
      if (!notReady.isEmpty()) return problem(QStringLiteral("the Mold Scale field could not be clicked: ") + notReady);
      injectMouse(fieldCentre, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      injectMouse(fieldCentre, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      injectMouse(fieldCentre, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
      settle(100);
      if (!scaleField->hasActiveFocus()) return problem(QStringLiteral("a click on the Mold Scale field did not focus it"));
      QMetaObject::invokeMethod(scaleField, "selectAll");
      key(Qt::Key_7, QStringLiteral("7"));
      key(Qt::Key_Period, QStringLiteral("."));
      key(Qt::Key_5, QStringLiteral("5"));
      key(Qt::Key_Return, QStringLiteral("\r"));
      settle(150);
      if (std::fabs(app_.moldClearanceMm() - 7.5) > 1e-9) return problem(QStringLiteral("typing 7.5 and Enter gave a clearance of %1").arg(app_.moldClearanceMm()));
      if (depth() != depthBase + 2) return problem(QStringLiteral("the typed value made %1 more undo steps, expected 1").arg(depth() - depthBase - 1));
      if (scaleField->hasActiveFocus()) return problem(QStringLiteral("the field kept the focus after Enter"));

      // Leave the tool; put the clearance back so that the steps below start from the usual value.
      if (const QString p = click("pointerToolButton"); !p.isEmpty()) return problem(p);
      if (app_.tool() != QLatin1String("select") || scaleField->isVisible()) return problem(QStringLiteral("the Pointer button did not leave Mold Scale"));
      app_.setMoldClearanceMm(base);
    }
    // 0c. The Constructed Cutting Plan session through real clicks: the bar's button opens the panel; Flip, Mold Scale, the cavity and Master Mold wait; the
    // tabs switch (the Segmentation tab plans); the axis buttons add and remove an extension plane; Cancel puts the planes back; Done with no plane is refused
    // with its reason; Done with a plane keeps it and closes the panel.
    {
      for (const QVariant& f : app_.cutFaces()) app_.setCutFaceEnabled(f.toMap().value("face").toString(), false);
      settle(100);
      const auto chosen = [&] { QStringList on; for (const QVariant& f : app_.cutFaces()) if (f.toMap().value("enabled").toBool()) on << f.toMap().value("face").toString(); on.sort(); return on; };
      QQuickItem* panelItem = item("cuttingSessionPanel");
      if (!item("constructButton") || !panelItem) return problem(QStringLiteral("the Constructed Cutting Plan button or its panel is missing"));
      if (panelItem->isVisible()) return problem(QStringLiteral("the session panel is shown before the session was opened"));
      if (!enabled("constructButton")) return problem(QStringLiteral("the Constructed Cutting Plan button is disabled with a model and no job"));

      if (const QString p = click("constructButton"); !p.isEmpty()) return problem(p);
      if (!waitFor([&] { return app_.cuttingSession().value("open").toBool() && panelItem->isVisible(); }, 3000)) return problem(QStringLiteral("a click on the Constructed Cutting Plan button did not open the session"));
      if (app_.cuttingSession().value("tab").toString() != QLatin1String("cutByFace") || !item("sessionTabCutByFace")->property("highlighted").toBool()) return problem(QStringLiteral("the session did not open on the Cutting by Face tab"));
      for (const char* waiting : {"flipToolButton", "moldScaleToolButton", "clearancePlus", "clearanceMinus", "cavityButton", "masterMoldButton", "constructButton"})
        if (enabled(waiting)) return problem(QStringLiteral("'%1' is enabled while the cutting session is open").arg(QString::fromLatin1(waiting)));
      const QRectF panelRect(panelItem->mapToScene(QPointF(0, 0)), QSizeF(panelItem->width(), panelItem->height()));
      QQuickItem* vpItem = item("viewport");
      const QRectF vpRect(vpItem->mapToScene(QPointF(0, 0)), QSizeF(vpItem->width(), vpItem->height()));
      if (!vpRect.contains(panelRect)) return problem(QStringLiteral("the session panel is not inside the viewport"));

      // Planes chosen inside the session count on the tab; Cancel puts them back.
      app_.setCutFaceEnabled(QStringLiteral("top"), true);
      app_.setCutFaceEnabled(QStringLiteral("left"), true);
      if (!waitFor([&] { return item("sessionPlaneCount")->property("planes").toInt() == 2; }, 3000)) return problem(QStringLiteral("the tab does not count the two chosen planes"));
      if (const QString p = click("sessionTabSegmentation"); !p.isEmpty()) return problem(p);
      if (!waitFor([&] { return app_.cuttingSession().value("tab").toString() == QLatin1String("segmentation") && app_.segmentation().value("phase").toString() == QLatin1String("planned"); }, 10000))
        return problem(QStringLiteral("the Segmentation tab did not plan (tab %1, phase %2)").arg(app_.cuttingSession().value("tab").toString(), app_.segmentation().value("phase").toString()));
      QString axis;
      for (const char* a : {"x", "y", "z"}) if (axis.isEmpty() && enabled((QStringLiteral("sessionAxis:") + QLatin1String(a)).toLatin1().constData())) axis = QLatin1String(a);
      if (axis.isEmpty()) return problem(QStringLiteral("no axis button is available for an extension plane"));
      const QByteArray axisButton = (QStringLiteral("sessionAxis:") + axis).toLatin1();
      const int extensionsBefore = app_.segmentation().value("extensions").toList().size();
      if (const QString p = click(axisButton.constData()); !p.isEmpty()) return problem(p);
      if (app_.segmentation().value("extensions").toList().size() != extensionsBefore + 1 || !item(axisButton.constData())->property("highlighted").toBool())
        return problem(QStringLiteral("a click on the %1 axis button did not add an extension plane").arg(axis));
      if (const QString p = click(axisButton.constData()); !p.isEmpty()) return problem(p);
      if (app_.segmentation().value("extensions").toList().size() != extensionsBefore) return problem(QStringLiteral("a second click on the %1 axis button did not remove the extension plane").arg(axis));

      if (const QString p = click("sessionCancel"); !p.isEmpty()) return problem(p);
      if (!waitFor([&] { return !app_.cuttingSession().value("open").toBool() && !panelItem->isVisible(); }, 3000)) return problem(QStringLiteral("Cancel did not close the session"));
      if (!chosen().isEmpty()) return problem(QStringLiteral("Cancel left planes chosen: %1").arg(chosen().join(QLatin1Char('+'))));
      if (app_.segmentation().value("phase").toString() != QLatin1String("idle")) return problem(QStringLiteral("Cancel left the plan its Segmentation tab made (%1)").arg(app_.segmentation().value("phase").toString()));
      if (!enabled("flipToolButton") && app_.orientationState().value("available").toBool()) return problem(QStringLiteral("Flip stayed disabled after the session ended"));

      // Done with no plane is refused with the reason; with one it keeps it and closes.
      if (const QString p = click("constructButton"); !p.isEmpty()) return problem(p);
      if (!waitFor([&] { return panelItem->isVisible(); }, 3000)) return problem(QStringLiteral("the session did not open a second time"));
      if (enabled("sessionDone")) return problem(QStringLiteral("Done is enabled on Cutting by Face with no plane"));
      app_.commitCuttingSession();   // what an activated Done would do: refused
      if (!waitFor([&] { return item("sessionBlockedReason")->isVisible(); }, 3000)) return problem(QStringLiteral("the refused Done shows no reason"));
      app_.setCutFaceEnabled(QStringLiteral("top"), true);
      if (!waitFor([&] { return enabled("sessionDone"); }, 3000)) return problem(QStringLiteral("Done stayed disabled with a plane chosen"));
      if (const QString p = click("sessionDone"); !p.isEmpty()) return problem(p);
      if (!waitFor([&] { return !app_.cuttingSession().value("open").toBool(); }, 3000)) return problem(QStringLiteral("Done did not close the session"));
      if (chosen() != QStringList{QStringLiteral("top")}) return problem(QStringLiteral("Done did not keep the chosen plane (%1)").arg(chosen().join(QLatin1Char('+'))));
      app_.setCutFaceEnabled(QStringLiteral("top"), false);   // the steps below start from no plane
      settle(100);
    }
    // 0d. The dividers between groups of buttons, over a sweep of window widths. Where the bar wraps, a divider that would end a line or begin the next must not
    // be drawn; every other divider is. The expected answer is computed here from the buttons' own positions, independently of the bar's rule.
    {
      QQuickItem* flow = item("toolbarFlow");
      if (!flow) return problem(QStringLiteral("the toolbar's button flow is missing"));
      QQuickItem* toolbarItem = item("viewportToolbar");
      int checked = 0, hidden = 0, drawn = 0;
      for (int width = 700; width >= 120; width -= 20) {   // the bar's own width limit, from wider than its buttons down to a few of them per line
        toolbarItem->setProperty("widthLimit", width);
        settle(150);
        const QList<QQuickItem*> kids = flow->childItems();
        for (int i = 0; i < kids.size(); ++i) {
          if (kids[i]->objectName() != QLatin1String("barSeparator")) continue;
          QQuickItem *previous = nullptr, *next = nullptr;
          for (int k = i - 1; k >= 0 && !previous; --k) if (kids[k]->isVisible() && kids[k]->width() > 1) previous = kids[k];
          for (int k = i + 1; k < kids.size() && !next; ++k) if (kids[k]->isVisible() && kids[k]->width() > 1) next = kids[k];
          const bool expected = previous && next && qFuzzyCompare(previous->y() + 1, kids[i]->y() + 1) && qFuzzyCompare(next->y() + 1, kids[i]->y() + 1);
          const bool shown = kids[i]->property("dividing").toBool();
          if (expected != shown)
            return problem(QStringLiteral("at a bar width of %1 a divider %2 drawn where it %3").arg(width).arg(shown ? QStringLiteral("is") : QStringLiteral("is not")).arg(expected ? QStringLiteral("divides two buttons") : QStringLiteral("would hang at the end or start of a line")));
          ++checked;
          (shown ? drawn : hidden) += 1;
        }
      }
      toolbarItem->setProperty("widthLimit", 0);
      settle(150);
      if (checked == 0) return problem(QStringLiteral("no divider was found to check"));
      if (hidden == 0) return problem(QStringLiteral("no bar width made the bar wrap at a divider, so the rule was never exercised (%1 dividers drawn)").arg(drawn));
      if (drawn == 0) return problem(QStringLiteral("no divider was drawn at any width"));
    }
    // 1. The mold-scale stepper: whole millimetres, and the value on the bar follows.
    const double start = app_.moldClearanceMm();
    const auto shown = [&] { return item("clearanceValue")->property("text").toString(); };
    if (const QString p = click("clearancePlus"); !p.isEmpty()) return problem(p);
    const double up = std::floor(start + 1e-9) + 1;
    if (std::fabs(app_.moldClearanceMm() - up) > 1e-9) return problem(QStringLiteral("+ gave a clearance of %1, expected %2 (from %3)").arg(app_.moldClearanceMm()).arg(up).arg(start));
    if (shown() != QStringLiteral("%1 mm").arg(up)) return problem(QStringLiteral("the bar shows '%1' for a clearance of %2").arg(shown()).arg(up));
    if (const QString p = click("clearanceMinus"); !p.isEmpty()) return problem(p);
    if (const QString p = click("clearanceMinus"); !p.isEmpty()) return problem(p);
    if (std::fabs(app_.moldClearanceMm() - (up - 2)) > 1e-9) return problem(QStringLiteral("two - gave a clearance of %1, expected %2").arg(app_.moldClearanceMm()).arg(up - 2));
    if (const QString p = click("clearancePlus"); !p.isEmpty()) return problem(p);   // back to a whole step above the start

    // 2. Tools: the Eraser is unavailable with no plane and ignores a click; with a plane chosen the badge counts it and the Eraser works.
    // (Which planes are chosen when a model has just been imported is the application's business, so the test sets what it needs.)
    for (const QVariant& f : app_.cutFaces()) app_.setCutFaceEnabled(f.toMap().value("face").toString(), false);
    if (!waitFor([&] { return !enabled("eraserToolButton"); }, 3000)) return problem(QStringLiteral("the Eraser stayed enabled with every plane removed"));
    if (enabled("eraserToolButton")) return problem(QStringLiteral("the Eraser is enabled with no cutting plane"));
    if (const QString p = click("eraserToolButton"); !p.isEmpty()) return problem(p);
    if (app_.tool() != QLatin1String("select")) return problem(QStringLiteral("a click on the disabled Eraser changed the tool to %1").arg(app_.tool()));
    if (item("cutPlaneBadge")->property("planes").toInt() != 0) return problem(QStringLiteral("the badge counts planes before any is chosen"));
    app_.setCutFaceEnabled(QStringLiteral("top"), true);
    if (!waitFor([&] { return enabled("eraserToolButton"); }, 3000)) return problem(QStringLiteral("the Eraser stayed disabled with a cutting plane chosen"));
    if (item("cutPlaneBadge")->property("planes").toInt() != 1) return problem(QStringLiteral("the badge does not count the chosen plane (%1)").arg(item("cutPlaneBadge")->property("planes").toInt()));
    if (const QString p = click("eraserToolButton"); !p.isEmpty()) return problem(p);
    if (app_.tool() != QLatin1String("eraser") || !item("eraserToolButton")->property("highlighted").toBool()) return problem(QStringLiteral("a click on the Eraser did not make it the active tool (%1)").arg(app_.tool()));
    if (const QString p = click("pointerToolButton"); !p.isEmpty()) return problem(p);
    if (app_.tool() != QLatin1String("select")) return problem(QStringLiteral("a click on the Pointer did not select it (%1)").arg(app_.tool()));
    if (enabled("sprueToolButton")) return problem(QStringLiteral("the Sprue button is enabled before a mold exists"));

    // 3. The cavity button builds the mold; the glass button toggles its look; the Sprue button then works and toggles back to the pointer.
    if (item("cavityButton")->property("text").toString() != QLatin1String("Create Cavity")) return problem(QStringLiteral("the cavity button says '%1' before a mold exists").arg(item("cavityButton")->property("text").toString()));
    if (item("glassToggleButton")->isVisible()) return problem(QStringLiteral("the glass button is shown before a mold exists"));
    if (const QString p = click("cavityButton"); !p.isEmpty()) return problem(p);
    if (app_.moldPhase() != QLatin1String("generating") && app_.moldPhase() != QLatin1String("complete")) return problem(QStringLiteral("a click on the cavity button did not start a mold (%1)").arg(app_.moldPhase()));
    if (!waitFor([&] { return app_.moldPhase() == QLatin1String("complete") || app_.moldPhase() == QLatin1String("error"); }, 120000) || app_.moldPhase() != QLatin1String("complete"))
      return problem(QStringLiteral("the mold did not complete: %1").arg(app_.moldError()));
    if (!waitFor([&] { return item("cavityButton")->property("text").toString() == QLatin1String("Rebuild Cavity"); }, 3000)) return problem(QStringLiteral("the cavity button says '%1' after the mold, not 'Rebuild Cavity'").arg(item("cavityButton")->property("text").toString()));
    if (!item("glassToggleButton")->isVisible()) return problem(QStringLiteral("the glass button is not shown once the mold exists"));
    const bool glass = app_.moldGlass();
    if (const QString p = click("glassToggleButton"); !p.isEmpty()) return problem(p);
    if (app_.moldGlass() == glass) return problem(QStringLiteral("a click on the glass button did not toggle the appearance"));
    if (const QString p = click("glassToggleButton"); !p.isEmpty()) return problem(p);
    if (app_.moldGlass() != glass) return problem(QStringLiteral("a second click on the glass button did not toggle it back"));
    if (!waitFor([&] { return enabled("sprueToolButton"); }, 3000)) return problem(QStringLiteral("the Sprue button stayed disabled with a mold"));
    if (const QString p = click("sprueToolButton"); !p.isEmpty()) return problem(p);
    if (app_.tool() != QLatin1String("sprue")) return problem(QStringLiteral("a click on the Sprue button did not select the tool (%1)").arg(app_.tool()));
    if (const QString p = click("sprueToolButton"); !p.isEmpty()) return problem(p);
    if (app_.tool() != QLatin1String("select")) return problem(QStringLiteral("a second click on the Sprue button did not go back to the pointer (%1)").arg(app_.tool()));

    // 4. Undo steps back (the mold, the plane and the clearance are all edits), and Redo is then available.
    if (!app_.history().value("canUndo").toBool() || !enabled("undoButton")) return problem(QStringLiteral("Undo is not available after edits"));
    if (const QString p = click("undoButton"); !p.isEmpty()) return problem(p);
    if (!waitFor([&] { return app_.history().value("canRedo").toBool() && enabled("redoButton"); }, 5000)) return problem(QStringLiteral("Redo is not available after an Undo"));

    // 5. The bar takes the pointer: a press and a drag that stay on its padding must not orbit the view, and the wheel over it must not zoom it.
    //    The control comes first: the same gesture on empty viewport does orbit, so "the camera did not move" means something.
    const auto drag = [&](const QPointF& from, const QPointF& step, int moves) {
      injectMouse(from, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      settle(60);
      injectMouse(from, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      settle(60);
      for (int i = 1; i <= moves; ++i) { injectMouse(from + step * i, Qt::LeftButton, Qt::LeftButton, QEvent::MouseMove); settle(30); }
      injectMouse(from + step * moves, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
      settle(150);
    };
    const QVector3D eyeStart = app_.camera()->position();
    const QPointF barTopLeft = bar->mapToScene(QPointF(0, 0));
    drag(QPointF(barTopLeft.x() + 3, barTopLeft.y() + 8), QPointF(0, 2), 4);   // 3 px in from the left edge, 8 px down: inside the bar all the way
    if ((app_.camera()->position() - eyeStart).length() > 1e-4) return problem(QStringLiteral("dragging on the toolbar's padding moved the camera by %1").arg((app_.camera()->position() - eyeStart).length()));
    const QRectF nowViewport(viewport->mapToScene(QPointF(0, 0)), QSizeF(viewport->width(), viewport->height()));
    drag(QPointF(nowViewport.left() + 60, nowViewport.bottom() - 90), QPointF(10, 10), 6);
    if ((app_.camera()->position() - eyeStart).length() < 1e-3) return problem(QStringLiteral("the control drag on empty viewport did not orbit the camera: the test cannot tell whether the bar takes the pointer"));    renderNow();
#endif
  }  void moldsEventsSequence() { whenViewportSettled([this] { moldsEventsBody(); }); }
  void moldsEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--molds-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    const auto find = [this](const QString& name) { return window_->findChild<QQuickItem*>(name); };
    const auto settle = [](int ms) { QEventLoop loop; QTimer::singleShot(ms, &loop, &QEventLoop::quit); loop.exec(); };
    const auto click = [this, &settle](QQuickItem* item) {
      const QPointF scene = stableCentre(item);
      injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
      settle(120);
    };
    const auto rowVisible = [this](const QString& id) {
      for (int r = 0; r < app_.scene()->rowCount(); ++r)
        if (app_.scene()->data(app_.scene()->index(r), SceneModel::IdRole).toString() == id) return app_.scene()->data(app_.scene()->index(r), SceneModel::VisibleRole).toBool();
      return true;
    };
    if (!app_.moldBrowser().value("available").toBool()) return fail(QStringLiteral("the Molds browser is not available with a mold generated"));
    const QVariantList bodies = app_.moldBrowser().value("bodies").toList();
    const QString bodyId = bodies.value(0).toMap().value("id").toString();
    const QString modelId = app_.moldBrowser().value("model").toMap().value("id").toString();

    QQuickItem* collapseAll = find(QStringLiteral("collapseAll"));
    QQuickItem* header = find(QStringLiteral("sectionHeader:Molds"));
    if (!collapseAll || !header) return fail(QStringLiteral("the Collapse all button or the Molds section was not found"));
    click(collapseAll);
    click(header);   // only Molds is open, at the top of the inspector
    // Repeater delegates are children of the visual tree, not always of the object tree findChild walks: look through the items.
    std::function<QQuickItem*(QQuickItem*, const QString&)> findItem = [&findItem](QQuickItem* from, const QString& name) -> QQuickItem* {
      if (from->objectName() == name) return from;
      for (QQuickItem* child : from->childItems())
        if (QQuickItem* found = findItem(child, name)) return found;
      return nullptr;
    };
    QQuickItem* bodyToggle = findItem(window_->contentItem(), QStringLiteral("bodyToggle:") + bodyId);
    QQuickItem* modelToggle = findItem(window_->contentItem(), QStringLiteral("bodyToggle:model"));
    if (!bodyToggle || !modelToggle) return fail(QStringLiteral("the checkboxes of the Molds section were not found"));

    click(bodyToggle);
    if (rowVisible(bodyId)) return fail(QStringLiteral("a click on a body's checkbox did not hide it"));
    if (app_.moldBrowser().value("bodies").toList().value(0).toMap().value("visible").toBool()) return fail(QStringLiteral("the browser still lists the hidden body as visible"));
    if (!rowVisible(bodies.value(1).toMap().value("id").toString())) return fail(QStringLiteral("hiding one body hid another"));
    if (findItem(window_->contentItem(), QStringLiteral("bodyToggle:") + bodyId) != bodyToggle)
      return fail(QStringLiteral("toggling a body rebuilt its checkbox (it would lose the keyboard focus)"));
    click(bodyToggle);
    if (!rowVisible(bodyId)) return fail(QStringLiteral("a second click did not show the body again"));
    click(modelToggle);
    if (rowVisible(modelId)) return fail(QStringLiteral("a click on Original did not hide the model"));
    click(modelToggle);
    if (!rowVisible(modelId)) return fail(QStringLiteral("a second click on Original did not show the model"));
    // The checkbox follows the scene when the visibility changes from somewhere else (it keeps no state of its own after a click).
    app_.setBodyVisible(bodyId, false);
    settle(150);
    if (bodyToggle->property("checked").toBool()) return fail(QStringLiteral("the checkbox did not follow a body hidden from outside"));
    app_.setBodyVisible(bodyId, true);
    settle(150);
    if (!bodyToggle->property("checked").toBool()) return fail(QStringLiteral("the checkbox did not follow a body shown from outside"));
    // (Last: a change of cavity clearance or quality is an input change and drops the generated mold.)
    // The cavity quality selector of the Mold section: disabled without a clearance, and its choice reaches the controller.
    if (QQuickItem* quality = findItem(window_->contentItem(), QStringLiteral("cavityQuality"))) {
      if (quality->property("enabled").toBool()) return fail(QStringLiteral("the cavity quality selector is enabled with no cavity clearance"));
      app_.setCavityClearanceMm(1.0);
      settle(150);
      if (!quality->property("enabled").toBool()) return fail(QStringLiteral("the cavity quality selector stayed disabled with a clearance"));
      if (quality->property("currentIndex").toInt() != 0) return fail(QStringLiteral("the cavity quality selector does not start on High"));
      quality->setProperty("currentIndex", 1);
      QMetaObject::invokeMethod(quality, "activated", Q_ARG(int, 1));
      if (app_.cavityQuality() != QLatin1String("standard")) return fail(QStringLiteral("choosing Standard in the selector did not reach the controller"));
      app_.setCavityQuality(QStringLiteral("high"));
      settle(150);
      if (quality->property("currentIndex").toInt() != 0) return fail(QStringLiteral("the selector did not follow the controller back to High"));
      app_.setCavityClearanceMm(0.0);
    } else {
      return fail(QStringLiteral("the cavity quality selector was not found"));
    }
    renderNow();
#endif
  }
  void sectionsEventsSequence() { whenViewportSettled([this] { sectionsEventsBody(); }); }
  void sectionsEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--sections-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    const auto find = [this](const QString& name) { return window_->findChild<QQuickItem*>(name); };
    QQuickItem* header = find(QStringLiteral("sectionHeader:Model"));
    QQuickItem* section = find(QStringLiteral("section:Model"));
    QQuickItem* content = find(QStringLiteral("inspectorContent"));
    if (!header || !section || !content) return fail(QStringLiteral("the Model section, its header or the inspector was not found"));
    const auto click = [this](QQuickItem* item) {
      const QPointF scene = stableCentre(item);
      injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
    };
    const auto key = [this](int code, const QString& text) {
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, code, Qt::NoModifier, text);
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, code, Qt::NoModifier, text);
    };
    const auto collapsed = [&](QQuickItem* s) { return s->property("collapsed").toBool(); };
    // The layout follows on the next frame: poll for it (up to three seconds) instead of reading the height at once.
    const auto waitFor = [](const std::function<bool()>& condition) {
      QElapsedTimer timer;
      timer.start();
      while (!condition() && timer.elapsed() < 3000) {
        QEventLoop loop;
        QTimer::singleShot(25, &loop, &QEventLoop::quit);
        loop.exec();
      }
      return condition();
    };
    const double heightOpen = content->height();
    if (collapsed(section)) return fail(QStringLiteral("the Model section starts folded"));

    click(header);
    if (!collapsed(section)) return fail(QStringLiteral("a click on the header did not fold the section"));
    if (!waitFor([&] { return content->height() < heightOpen - 20; })) return fail(QStringLiteral("folding the section did not shorten the inspector (%1 px, was %2)").arg(content->height()).arg(heightOpen));
    if (!header->hasActiveFocus()) return fail(QStringLiteral("clicking the header did not give it the focus"));
    click(header);
    if (collapsed(section)) return fail(QStringLiteral("a second click did not unfold the section"));
    if (!waitFor([&] { return content->height() > heightOpen - 2; })) return fail(QStringLiteral("unfolding the section did not restore the inspector's height (%1 px, was %2)").arg(content->height()).arg(heightOpen));

    key(Qt::Key_Space, QStringLiteral(" "));
    if (!collapsed(section)) return fail(QStringLiteral("Space on the focused header did not fold the section"));
    key(Qt::Key_Return, QStringLiteral("\r"));
    if (collapsed(section)) return fail(QStringLiteral("Enter on the focused header did not unfold the section"));
    if (!header->property("activeFocusOnTab").toBool()) return fail(QStringLiteral("the header cannot be reached with Tab"));

    const QList<QQuickItem*> sections = window_->findChildren<QQuickItem*>(QRegularExpression(QStringLiteral("^section:")));
    if (sections.size() < 5) return fail(QStringLiteral("only %1 sections were found").arg(sections.size()));
    click(find(QStringLiteral("collapseAll")));
    for (QQuickItem* s : sections)
      if (!collapsed(s)) return fail(QStringLiteral("Collapse all left '%1' open").arg(s->objectName()));
    if (!waitFor([&] { return content->height() < heightOpen / 2; })) return fail(QStringLiteral("folding every section left the inspector %1 px tall (was %2)").arg(content->height()).arg(heightOpen));
    click(find(QStringLiteral("expandAll")));
    for (QQuickItem* s : sections)
      if (collapsed(s)) return fail(QStringLiteral("Expand all left '%1' folded").arg(s->objectName()));
    renderNow();
#endif
  }
  void planeDragEventsSequence() { whenViewportSettled([this] { planeDragEventsBody(); }); }
  void planeDragEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--plane-drag-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    auto* item = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
    if (!item) return fail(QStringLiteral("the viewport item was not found"));
    const int w = static_cast<int>(item->width()), h = static_cast<int>(item->height());
    app_.camera()->setViewportSize(w, h);
    app_.setCutFaceEnabled(QStringLiteral("top"), true);
    app_.setCutFacePosition(QStringLiteral("top"), 0.5);
    app_.setCutFaceEnabled(QStringLiteral("left"), true);
    app_.setCutFacePosition(QStringLiteral("left"), 0.7);
    const auto send = [this, item](QEvent::Type type, QPoint local, Qt::MouseButton button, Qt::MouseButtons buttons) {
      const QPointF scene = item->mapToScene(QPointF(local));
      injectMouse(scene, buttons, button, type);
    };
    const auto topPosition = [this] {
      for (const QVariant& f : app_.cutFaces())
        if (f.toMap().value("face").toString() == QLatin1String("top")) return f.toMap().value("position").toDouble();
      return -1.0;
    };
    const auto undoDepth = [this] { return app_.history().value("undoDepth").toInt(); };
    const auto target = [this] { return app_.camera()->pose().target(); };
    QPoint onPlane(-1, -1);
    for (int y = h / 6; y < h * 5 / 6 && onPlane.x() < 0; y += 3)
      for (int x = w / 8; x < w * 7 / 8 && onPlane.x() < 0; x += 3)
        if (app_.cutPlaneHoverAt(x, y, w, h) && app_.cutPlanes().value("planeHoverFace").toString() == QLatin1String("top")) onPlane = QPoint(x, y);
    app_.cutPlaneLeave();
    if (onPlane.x() < 0) return fail(QStringLiteral("no pixel on the top cutting plane"));

    // What is drawn as a plane must be what the controller picks as a plane, at this display scale and after the window is resized (below).
    if (const QString problem = drawnAndPickedAgree(item); !problem.isEmpty()) return fail(problem);
    // Hover (no timer: the planes are few): the plane brightens and the cursor becomes an open hand.
    send(QEvent::MouseMove, onPlane, Qt::NoButton, Qt::NoButton);
    if (app_.cutPlanes().value("planeHoverFace").toString() != QLatin1String("top") || app_.cutPlanes().value("cursor").toString() != QLatin1String("grab"))
      return fail(QStringLiteral("hovering a plane with the mouse did not highlight it (hover '%1', cursor '%2')")
                      .arg(app_.cutPlanes().value("planeHoverFace").toString(), app_.cutPlanes().value("cursor").toString()));

    // The left button on a plane still orbits: no drag.
    const double before = topPosition();
    const int depth = undoDepth();
    send(QEvent::MouseButtonPress, onPlane, Qt::LeftButton, Qt::LeftButton);
    if (app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("the left button started a plane drag"));
    send(QEvent::MouseButtonRelease, onPlane, Qt::LeftButton, Qt::NoButton);

    // A right press on the plane starts the drag; moving drags the plane and does not pan; releasing commits one undo step.
    const craft::Vec3 targetBefore = target();
    send(QEvent::MouseButtonPress, onPlane, Qt::RightButton, Qt::RightButton);
    if (!app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("a right press on a plane did not start dragging it"));
    if (app_.cutPlanes().value("cursor").toString() != QLatin1String("grabbing")) return fail(QStringLiteral("the cursor is not a closed hand while dragging"));
    send(QEvent::MouseMove, QPoint(onPlane.x() + 20, onPlane.y() - 60), Qt::NoButton, Qt::RightButton);
    send(QEvent::MouseMove, QPoint(onPlane.x() + 30, onPlane.y() - 90), Qt::NoButton, Qt::RightButton);
    const craft::Vec3 targetDuring = target();
    if (std::fabs(targetDuring.x - targetBefore.x) + std::fabs(targetDuring.y - targetBefore.y) + std::fabs(targetDuring.z - targetBefore.z) > 1e-12)
      return fail(QStringLiteral("the camera panned while a plane was dragged"));
    if (topPosition() != before) return fail(QStringLiteral("the plane's position was committed before the button was released"));
    send(QEvent::MouseButtonRelease, QPoint(onPlane.x() + 30, onPlane.y() - 90), Qt::RightButton, Qt::NoButton);
    if (app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("the drag did not end on release"));
    if (std::fabs(topPosition() - before) < 0.01) return fail(QStringLiteral("releasing the drag did not move the plane (position %1, was %2)").arg(topPosition()).arg(before));
    if (undoDepth() != depth + 1) return fail(QStringLiteral("the drag was not one undo step (depth %1, was %2)").arg(undoDepth()).arg(depth));

    // A right drag that starts away from every plane still pans.
    const QPoint empty(3, 3);
    const craft::Vec3 panBefore = target();
    send(QEvent::MouseButtonPress, empty, Qt::RightButton, Qt::RightButton);
    if (app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("a right press on empty space started a plane drag"));
    send(QEvent::MouseMove, QPoint(empty.x() + 40, empty.y() + 30), Qt::NoButton, Qt::RightButton);
    send(QEvent::MouseButtonRelease, QPoint(empty.x() + 40, empty.y() + 30), Qt::RightButton, Qt::NoButton);
    const craft::Vec3 panAfter = target();
    if (std::fabs(panAfter.x - panBefore.x) + std::fabs(panAfter.y - panBefore.y) + std::fabs(panAfter.z - panBefore.z) < 1e-6)
      return fail(QStringLiteral("a right drag away from the planes did not pan the camera"));
    // The window is resized (down to its minimum, then up): the viewport follows through the application's own handlers, and the drawing and the
    // picking still agree.
    const QSize startSize = window_->size();
    int resized = 0;
    for (const QSize& size : {QSize(std::max(window_->minimumWidth(), 940), std::max(window_->minimumHeight(), 560)), QSize(1500, 900)}) {
      window_->resize(size);
      QEventLoop loop;
      QTimer::singleShot(400, &loop, &QEventLoop::quit);
      loop.exec();
      if (window_->width() < size.width() - 60) continue;   // the screen cannot hold this size: not a failure of the application
      ++resized;
      if (const QString problem = drawnAndPickedAgree(item); !problem.isEmpty()) return fail(QStringLiteral("after resizing the window to %1 x %2: %3").arg(window_->width()).arg(window_->height()).arg(problem));
    }
    window_->resize(startSize);
    if (resized == 0) return fail(QStringLiteral("the window could not be resized to any of the test sizes"));
    renderNow();
#endif
  }
  // A segmentation extension plane dragged with the right mouse button through REAL mouse events, then undone with a real Ctrl+Z: the plan's
  // boundary follows the slab (one undo step), the camera does not pan during the drag, and a left press on the plane starts no drag (D-110).
  void extensionDragEventsSequence() { whenViewportSettled([this] { extensionDragEventsBody(); }); }
  void extensionDragEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--extension-drag-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    auto* item = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
    if (!item) return fail(QStringLiteral("the viewport item was not found"));
    const int w = static_cast<int>(item->width()), h = static_cast<int>(item->height());
    app_.camera()->setViewportSize(w, h);
    app_.setPrinterVolume(150, 300, 300);
    app_.planSegmentation();
    app_.addSegmentationExtension(QStringLiteral("y"));
    const auto coordinate = [this] {
      for (const QVariant& e : app_.segmentation().value("extensions").toList())
        if (e.toMap().value("axis").toString() == QLatin1String("y")) return e.toMap().value("coordinateMm").toDouble();
      return std::nan("");
    };
    const auto send = [this, item](QEvent::Type type, QPoint local, Qt::MouseButton button, Qt::MouseButtons buttons) {
      const QPointF scene = item->mapToScene(QPointF(local));
      injectMouse(scene, buttons, button, type);
    };
    const auto undoDepth = [this] { return app_.history().value("undoDepth").toInt(); };
    const auto target = [this] { return app_.camera()->pose().target(); };
    const double before = coordinate();
    if (!std::isfinite(before) || app_.cutPlaneSlabs()->rowCount() != 1) return fail(QStringLiteral("the extension plane is not drawn (coordinate %1, planes %2)").arg(before).arg(app_.cutPlaneSlabs()->rowCount()));
    QPoint onPlane(-1, -1);
    for (int y = h / 6; y < h * 5 / 6 && onPlane.x() < 0; y += 3)
      for (int x = w / 8; x < w * 7 / 8 && onPlane.x() < 0; x += 3)
        if (app_.cutPlaneHoverAt(x, y, w, h)) onPlane = QPoint(x, y);
    app_.cutPlaneLeave();
    if (onPlane.x() < 0) return fail(QStringLiteral("no pixel on the extension plane"));

    send(QEvent::MouseMove, onPlane, Qt::NoButton, Qt::NoButton);
    if (app_.cutPlanes().value("planeHoverFace").toString() != QLatin1String("back")) return fail(QStringLiteral("hovering the extension plane did not highlight it"));
    const int depth = undoDepth();
    send(QEvent::MouseButtonPress, onPlane, Qt::LeftButton, Qt::LeftButton);
    if (app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("the left button started a plane drag"));
    send(QEvent::MouseButtonRelease, onPlane, Qt::LeftButton, Qt::NoButton);

    const craft::Vec3 targetBefore = target();
    send(QEvent::MouseButtonPress, onPlane, Qt::RightButton, Qt::RightButton);
    if (!app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("a right press on the extension plane did not start dragging it"));
    send(QEvent::MouseMove, QPoint(onPlane.x() + 20, onPlane.y() - 60), Qt::NoButton, Qt::RightButton);
    send(QEvent::MouseMove, QPoint(onPlane.x() + 30, onPlane.y() - 90), Qt::NoButton, Qt::RightButton);
    const craft::Vec3 targetDuring = target();
    if (std::fabs(targetDuring.x - targetBefore.x) + std::fabs(targetDuring.y - targetBefore.y) + std::fabs(targetDuring.z - targetBefore.z) > 1e-12)
      return fail(QStringLiteral("the camera panned while the extension plane was dragged"));
    if (coordinate() != before) return fail(QStringLiteral("the boundary moved before the button was released"));
    send(QEvent::MouseButtonRelease, QPoint(onPlane.x() + 30, onPlane.y() - 90), Qt::RightButton, Qt::NoButton);
    if (app_.cutPlanes().value("dragging").toBool()) return fail(QStringLiteral("the drag did not end on release"));
    const double after = coordinate();
    if (!std::isfinite(after) || std::fabs(after - before) < 0.01) return fail(QStringLiteral("releasing the drag did not move the boundary (%1, was %2)").arg(after).arg(before));
    if (undoDepth() != depth + 1) return fail(QStringLiteral("the drag was not one undo step (depth %1, was %2)").arg(undoDepth()).arg(depth));
    if (!app_.segmentation().value("valid").toBool()) return fail(QStringLiteral("the plan is not valid after the drag"));

    // Ctrl+Z as real key events puts the boundary back.
    QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, Qt::Key_Z, Qt::ControlModifier);
    QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, Qt::Key_Z, Qt::ControlModifier);
    if (std::fabs(coordinate() - before) > 1e-9) return fail(QStringLiteral("Ctrl+Z did not put the boundary back (%1, was %2)").arg(coordinate()).arg(before));
    renderNow();
#endif
  }
  // Keyboard use through REAL key events (P2-1): the first Tab lands on the first control in reading order, Tab reaches every control without a
  // trap and shows where the focus is, and a control that changes the controller's lists keeps the keyboard focus: a Cut by face check box
  // toggled with Space and its slider moved with the arrow keys, a sprue's slider, a segmentation extension's field confirmed with Enter, a
  // Master Mold piece's check box. Writes the audit (every focusable control, the Tab order, what did not get focus) next to the summary file.
  void focusEventsSequence() { whenViewportSettled([this] { focusEventsBody(); }); }
  void focusEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--focus-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    // Items made by a Repeater are not QObject children of the window: search the visual tree.
    std::function<QQuickItem*(QQuickItem*, const QString&)> findIn = [&findIn](QQuickItem* from, const QString& name) -> QQuickItem* {
      if (from->objectName() == name) return from;
      for (QQuickItem* child : from->childItems())
        if (QQuickItem* found = findIn(child, name)) return found;
      return nullptr;
    };
    const auto find = [this, &findIn](const QString& name) { return findIn(window_->contentItem(), name); };
    const auto key = [this](int code, const QString& text = QString(), Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, code, modifiers, text);
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, code, modifiers, text);
    };
    const auto settle = [](int ms) { QEventLoop loop; QTimer::singleShot(ms, &loop, &QEventLoop::quit); loop.exec(); };
    const auto waitFor = [&settle](const std::function<bool()>& condition, int ms) {
      QElapsedTimer timer;
      timer.start();
      while (!condition() && timer.elapsed() < ms) settle(50);
      return condition();
    };
    const auto describe = [](QQuickItem* item) {
      if (!item) return QStringLiteral("(nothing)");
      QString text = item->property("text").toString();
      if (text.isEmpty()) text = item->property("displayText").toString();
      return QStringLiteral("%1 '%2' %3").arg(QString::fromLatin1(item->metaObject()->className()), item->objectName(), text).trimmed();
    };
    // The focus must still be on the control with this name after it acted.
    const auto stillFocused = [&](const QString& name, const QString& what) -> QString {
      QQuickItem* now = window_->activeFocusItem();
      if (now && now->objectName() == name) return {};
      return QStringLiteral("after %1 the keyboard focus is on %2, not on '%3' (R-UI-5)").arg(what, describe(now), name);
    };
    const int w = static_cast<int>(window_->width()), h = static_cast<int>(window_->height());
    app_.camera()->setViewportSize(w, h);

    // Unfold every section without clicking anything (a click would put the focus somewhere before the first Tab is measured).
    for (QQuickItem* section : window_->findChildren<QQuickItem*>(QRegularExpression(QStringLiteral("^section:")))) section->setProperty("collapsed", false);
    settle(200);

    // 0. A keyboard user who has not touched anything yet: the first Tab must land on the first control in reading order, the toolbar's Open
    // button, not on something in the middle of the inspector.
    const QString startFocus = describe(window_->activeFocusItem());
    key(Qt::Key_Tab);
    QQuickItem* firstStop = window_->activeFocusItem();
    if (!firstStop || !firstStop->property("text").toString().remove(QLatin1Char('&')).startsWith(QLatin1String("Open STL")))
      return fail(QStringLiteral("the first Tab from a fresh window (focus on %1) lands on %2, not on the toolbar's Open button").arg(startFocus, describe(firstStop)));

    // 1. A sprue's sliders (the mold the smoke test generated is complete): an arrow key resizes the sprue and the slider keeps the focus.
    if (app_.moldPhase() == QLatin1String("complete")) {
      app_.setTool(QStringLiteral("sprue"));
      bool placed = false;
      for (int y = h / 4; y < h * 3 / 4 && !placed; y += 4)
        for (int x = w / 8; x < w * 5 / 8 && !placed; x += 4) {
          app_.previewSprueAt(x, y, w, h);
          if (app_.sprueCandidate().value("valid").toBool()) placed = app_.placeSprueAt(x, y, w, h);
        }
      if (!placed) return fail(QStringLiteral("could not place a sprue for the focus test"));
      app_.setTool(QStringLiteral("select"));
      if (!waitFor([&] { return app_.spruePhase() == QLatin1String("idle") && app_.sprueEvaluation().has_value(); }, 60000)) return fail(QStringLiteral("the sprue did not resolve"));
      const QString id = app_.sprues().value(0).toMap().value("operationId").toString();
      QQuickItem* slider = find(QStringLiteral("sprueMainSlider:") + id);
      if (!slider) return fail(QStringLiteral("the sprue's main-diameter slider was not found"));
      slider->forceActiveFocus();
      const double before = app_.sprues().value(0).toMap().value("mainDiameterMm").toDouble();
      key(Qt::Key_Right);
      key(Qt::Key_Right);
      if (!waitFor([&] { return std::fabs(app_.sprues().value(0).toMap().value("mainDiameterMm").toDouble() - before) > 1e-6; }, 5000))
        return fail(QStringLiteral("the arrow keys did not resize the sprue"));
      settle(150);
      if (const QString problem = stillFocused(QStringLiteral("sprueMainSlider:") + id, QStringLiteral("arrow keys on the sprue's slider")); !problem.isEmpty()) return fail(problem);
      waitFor([&] { return app_.spruePhase() == QLatin1String("idle"); }, 60000);
    }

    // 2. The cut-face rows: Space on a check box, an arrow key on a slider.
    QQuickItem* check = find(QStringLiteral("cutFaceCheck:top"));
    if (!check) return fail(QStringLiteral("the Cut by face check box for 'top' was not found"));
    check->forceActiveFocus();
    key(Qt::Key_Space, QStringLiteral(" "));
    settle(100);
    bool topChosen = false;
    for (const QVariant& f : app_.cutFaces()) if (f.toMap().value("face").toString() == QLatin1String("top")) topChosen = f.toMap().value("enabled").toBool();
    if (!topChosen) return fail(QStringLiteral("Space on the 'top' check box did not choose the face"));
    if (const QString problem = stillFocused(QStringLiteral("cutFaceCheck:top"), QStringLiteral("Space on the 'top' check box")); !problem.isEmpty()) return fail(problem);
    QQuickItem* slider = find(QStringLiteral("cutFaceSlider:top"));
    if (!slider || !slider->isEnabled()) return fail(QStringLiteral("the 'top' slider is missing or disabled"));
    slider->forceActiveFocus();
    const auto topPosition = [this] {
      for (const QVariant& f : app_.cutFaces()) if (f.toMap().value("face").toString() == QLatin1String("top")) return f.toMap().value("position").toDouble();
      return -1.0;
    };
    const double before = topPosition();
    key(Qt::Key_Left);
    key(Qt::Key_Left);
    settle(100);
    if (std::fabs(topPosition() - before) < 1e-6) return fail(QStringLiteral("the arrow keys did not move the 'top' plane"));
    if (const QString problem = stillFocused(QStringLiteral("cutFaceSlider:top"), QStringLiteral("arrow keys on the 'top' slider")); !problem.isEmpty()) return fail(problem);

    // 3. A segmentation extension's field: type a value and confirm it with Enter; the field keeps the focus.
    app_.setPrinterVolume(150, 300, 300);
    app_.planSegmentation();
    app_.addSegmentationExtension(QStringLiteral("y"));
    QQuickItem* field = find(QStringLiteral("extensionField:y"));
    if (!field) return fail(QStringLiteral("the extension's coordinate field was not found"));
    field->forceActiveFocus();
    QMetaObject::invokeMethod(field, "selectAll");
    key(Qt::Key_5, QStringLiteral("5"));
    key(Qt::Key_Return, QStringLiteral("\r"));
    settle(150);
    double coordinate = std::nan("");
    for (const QVariant& e : app_.segmentation().value("extensions").toList()) if (e.toMap().value("axis").toString() == QLatin1String("y")) coordinate = e.toMap().value("coordinateMm").toDouble();
    if (std::fabs(coordinate - 5.0) > 1e-9) return fail(QStringLiteral("typing 5 and Enter in the extension field gave %1").arg(coordinate));
    if (const QString problem = stillFocused(QStringLiteral("extensionField:y"), QStringLiteral("Enter in the extension field")); !problem.isEmpty()) return fail(problem);

    // 4. A Master Mold piece's check box (the Master Mold is generated from the part alone).
    app_.resetSegmentation();
    app_.generateMasterMold();
    if (!waitFor([&] { return app_.masterMold().value("status").toString() != QLatin1String("generating") && !app_.busy(); }, 150000)) return fail(QStringLiteral("the Master Mold did not finish"));
    QString pieceKey;
    for (const QVariant& set : app_.masterMold().value("sets").toList())
      for (const QVariant& piece : set.toMap().value("pieces").toList()) if (pieceKey.isEmpty()) pieceKey = piece.toMap().value("key").toString();
    if (!pieceKey.isEmpty()) {
      QQuickItem* piece = find(QStringLiteral("masterPiece:") + pieceKey);
      if (!piece) return fail(QStringLiteral("the Master Mold piece's check box was not found"));
      piece->forceActiveFocus();
      const auto visibleNow = [&] {
        for (const QVariant& set : app_.masterMold().value("sets").toList())
          for (const QVariant& p : set.toMap().value("pieces").toList()) if (p.toMap().value("key").toString() == pieceKey) return p.toMap().value("visible").toBool();
        return false;
      };
      const bool was = visibleNow();
      key(Qt::Key_Space, QStringLiteral(" "));
      settle(150);
      if (visibleNow() == was) return fail(QStringLiteral("Space on the Master Mold piece's check box did not toggle it"));
      if (const QString problem = stillFocused(QStringLiteral("masterPiece:") + pieceKey, QStringLiteral("Space on a Master Mold piece's check box")); !problem.isEmpty()) return fail(problem);
    }

    // 5. A modal dialog (the error dialog): it takes the focus, Tab stays inside it, Escape closes it, and the control that had the focus before
    // gets it back.
    {
      QQuickItem* before = find(QStringLiteral("masterMoldButton"));
      if (!before) return fail(QStringLiteral("the Master Mold toolbar button was not found"));
      before->forceActiveFocus();
      expectError_ = true;
      app_.importStlFile(QStringLiteral("C:/this/folder/does/not/exist.stl"));   // an error: the dialog opens
      QObject* dialog = window_->findChild<QObject*>(QStringLiteral("errorDialog"));
      if (!dialog) return fail(QStringLiteral("the error dialog was not found"));
      if (!waitFor([&] { return dialog->property("visible").toBool(); }, 5000)) return fail(QStringLiteral("the error dialog did not open"));
      settle(150);
      // The dialog's items live in the window's overlay: the focus must be on the dialog's own popup item or one of its controls.
      const auto inPopup = [](QQuickItem* item) {
        for (QQuickItem* p = item; p; p = p->parentItem())
          if (QByteArray(p->metaObject()->className()).contains("QQuickPopupItem")) return true;
        return false;
      };
      QQuickItem* focused = window_->activeFocusItem();
      if (!inPopup(focused)) return fail(QStringLiteral("the open error dialog does not hold the keyboard focus (it is on %1)").arg(describe(focused)));
      for (int i = 0; i < 6; ++i) {
        key(Qt::Key_Tab);
        QQuickItem* now = window_->activeFocusItem();
        if (!inPopup(now)) return fail(QStringLiteral("Tab left the modal dialog and went to %1").arg(describe(now)));
      }
      key(Qt::Key_Escape);
      if (!waitFor([&] { return !dialog->property("visible").toBool(); }, 5000)) return fail(QStringLiteral("Escape did not close the error dialog"));
      settle(150);
      if (window_->activeFocusItem() != before)
        return fail(QStringLiteral("after the dialog closed the keyboard focus is on %1, not back on the Master Mold button").arg(describe(window_->activeFocusItem())));
    }

    // 6. Tab walks the whole window and comes back; every stop shows its focus.
    QList<QQuickItem*> focusable;
    std::function<void(QQuickItem*)> collect = [&](QQuickItem* item) {
      if (item->activeFocusOnTab() && item->isVisible() && item->isEnabled() && item->width() > 0 && item->height() > 0) focusable << item;
      for (QQuickItem* child : item->childItems()) collect(child);
    };
    collect(window_->contentItem());
    QJsonArray audit, order, unreached;
    QSet<QQuickItem*> visited;
    window_->contentItem()->forceActiveFocus();
    key(Qt::Key_Tab);
    QQuickItem* start = window_->activeFocusItem();
    int steps = 0;
    bool cycled = false;
    for (; steps < 400; ++steps) {
      QQuickItem* now = window_->activeFocusItem();
      if (steps > 0 && now == start) { cycled = true; break; }
      if (now) {
        visited.insert(now);
        order.append(QJsonObject{{"item", describe(now)}, {"visualFocusProperty", now->property("visualFocus").isValid()}, {"visualFocus", now->property("visualFocus").toBool()}});
      }
      key(Qt::Key_Tab);
    }
    for (QQuickItem* item : focusable) {
      audit.append(QJsonObject{{"item", describe(item)}, {"reached", visited.contains(item)}});
      if (!visited.contains(item)) unreached.append(describe(item));
    }
    const QJsonObject report{{"focusable", audit}, {"tabOrder", order}, {"unreached", unreached}, {"tabStops", static_cast<int>(visited.size())}, {"cycled", cycled}};
    if (!summary_.isEmpty()) {
      QFile out(summary_ + QStringLiteral(".focus.json"));
      if (out.open(QIODevice::WriteOnly)) out.write(QJsonDocument(report).toJson(QJsonDocument::Indented));
    }
    // Every control Tab stops on has a name a screen reader can say: an Accessible.name, the text of a button or check box, or the name of the control
    // it is part of (the editor inside a spin box). Sliders and spin boxes have no text, so they need an Accessible.name of their own.
    QAccessible::setActive(true);
    QJsonArray unnamed;
    for (QQuickItem* item : std::as_const(visited)) {
      QString name;
      for (QQuickItem* p = item; p && name.isEmpty(); p = p->parentItem()) {
        if (QAccessibleInterface* a = QAccessible::queryAccessibleInterface(p)) name = a->text(QAccessible::Name).trimmed();
        const QByteArray type = p->metaObject()->className();
        if (name.isEmpty() && (type.contains("Button") || type.contains("CheckBox"))) name = p->property("text").toString().remove(QLatin1Char('&')).trimmed();   // a button is named by its text
      }
      if (name.isEmpty()) unnamed.append(describe(item));
    }
    if (!unnamed.isEmpty()) return fail(QStringLiteral("%1 control(s) have no accessible name, for example %2").arg(unnamed.size()).arg(unnamed.first().toString()));
    if (!cycled) return fail(QStringLiteral("Tab did not come back to its first stop within 400 presses: a focus trap (%1 stops)").arg(visited.size()));
    if (!unreached.isEmpty()) return fail(QStringLiteral("%1 control(s) cannot be reached with Tab, for example %2").arg(unreached.size()).arg(unreached.first().toString()));
    for (const QJsonValue& v : order) {
      const QJsonObject o = v.toObject();
      if (o.value("visualFocusProperty").toBool() && !o.value("visualFocus").toBool()) return fail(QStringLiteral("%1 has the focus by Tab but shows no focus indicator").arg(o.value("item").toString()));
    }
    renderNow();
#endif
  }
  void eraserEventsSequence() { whenViewportSettled([this] { eraserEventsBody(); }); }
  void eraserEventsBody() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--eraser-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    auto* item = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
    if (!item) return fail(QStringLiteral("the viewport item was not found"));
    const int w = static_cast<int>(item->width()), h = static_cast<int>(item->height());
    app_.camera()->setViewportSize(w, h);
    app_.setCutFaceEnabled(QStringLiteral("left"), true);
    app_.setCutFacePosition(QStringLiteral("left"), 0.7);
    app_.setCutFaceEnabled(QStringLiteral("top"), true);
    app_.setCutFacePosition(QStringLiteral("top"), 0.5);
    app_.setCutFaceEnabled(QStringLiteral("front"), true);
    app_.setTool(QStringLiteral("eraser"));
    if (app_.tool() != "eraser") return fail(QStringLiteral("the Eraser tool was not available with three planes chosen"));
    const auto send = [this, item](QEvent::Type type, QPoint local, Qt::MouseButton button, Qt::MouseButtons buttons) {
      const QPointF scene = item->mapToScene(QPointF(local));
      injectMouse(scene, buttons, button, type);
    };
    QPoint onPlane(-1, -1);
    for (int y = h / 6; y < h * 5 / 6 && onPlane.x() < 0; y += 3)
      for (int x = w / 8; x < w * 7 / 8 && onPlane.x() < 0; x += 3)
        if (app_.eraserHoverAt(x, y, w, h)) onPlane = QPoint(x, y);
    app_.eraserLeave();
    if (onPlane.x() < 0) return fail(QStringLiteral("no pixel on a cutting plane"));

    // Hover: the QML throttles it with a timer, so wait for the highlight (up to three seconds) instead of a fixed delay.
    send(QEvent::MouseMove, onPlane, Qt::NoButton, Qt::NoButton);
    auto waited = std::make_shared<int>(0);
    auto afterHover = std::make_shared<std::function<void()>>();
    *afterHover = [this, send, onPlane, waited, afterHover, item, w, h]() {
      if (app_.cutPlanes().value("hoveredFace").toString().isEmpty()) {
        if ((*waited += 30) < 3000) { QTimer::singleShot(30, this, *afterHover); return; }
        return fail(QStringLiteral("hovering a plane with the mouse did not highlight it (pixel %1,%2; viewport %3x%4 when measured, %5x%6 now; window active: %7)")
                        .arg(onPlane.x()).arg(onPlane.y()).arg(w).arg(h).arg(static_cast<int>(item->width())).arg(static_cast<int>(item->height()))
                        .arg(window_->isActive()));
      }
      const int before = app_.cutPlanes().value("planeCount").toInt();
      send(QEvent::MouseButtonPress, QPoint(3, 3), Qt::LeftButton, Qt::LeftButton);   // empty space: nothing happens
      send(QEvent::MouseButtonRelease, QPoint(3, 3), Qt::LeftButton, Qt::NoButton);
      if (app_.cutPlanes().value("planeCount").toInt() != before) return fail(QStringLiteral("a click on empty space removed a plane"));
      send(QEvent::MouseButtonPress, onPlane, Qt::LeftButton, Qt::LeftButton);
      send(QEvent::MouseButtonRelease, onPlane, Qt::LeftButton, Qt::NoButton);
      if (app_.cutPlanes().value("planeCount").toInt() != before - 1) return fail(QStringLiteral("clicking a plane with the Eraser did not remove it (%1 planes, was %2)").arg(app_.cutPlanes().value("planeCount").toInt()).arg(before));
      renderNow();
    };
    QTimer::singleShot(30, this, *afterHover);
#endif
  }
  // The interaction hint badge through REAL input: shown once a model is loaded, hidden by the first press (or wheel) in the viewport.
  void hintEventsSequence() {
    whenViewportSettled([this] {
#ifndef CRAFT_SMOKE_REAL_EVENTS
      return fail(QStringLiteral("--hint-events needs a build with CRAFT_BUILD_TESTS"));
#else
      QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
      auto* hint = window_->findChild<QQuickItem*>(QStringLiteral("interactionHint"));
      auto* viewport = window_->findChild<QQuickItem*>(QStringLiteral("viewport"));
      if (!hint || !viewport) return fail(QStringLiteral("the hint badge or the viewport was not found"));
      // The badge shows once the model is ready and nothing is busy: poll for it (up to three seconds) instead of looking once after a
      // fixed delay, and say why when it never comes (the failure used to carry no state at all).
      auto waited = std::make_shared<int>(0);
      auto afterShown = std::make_shared<std::function<void()>>();
      *afterShown = [=, this]() {
        if (!hint->isVisible()) {
          if ((*waited += 30) < 3000) { QTimer::singleShot(30, this, *afterShown); return; }
          return fail(QStringLiteral("the hint badge is not shown for a loaded model that nobody has touched (model phase '%1', busy %2, window active %3, viewport %4x%5)")
                          .arg(app_.modelPhase()).arg(app_.busy()).arg(window_->isActive()).arg(static_cast<int>(viewport->width())).arg(static_cast<int>(viewport->height())));
        }
        if (hint->opacity() != 1.0) {   // the badge fades in: wait for the end of the fade as well
          if ((*waited += 30) < 3000) { QTimer::singleShot(30, this, *afterShown); return; }
          return fail(QStringLiteral("the hint badge is transparent (opacity %1)").arg(hint->opacity()));
        }
        const QPointF local(viewport->width() / 2, viewport->height() / 3);
        const QPointF scene = viewport->mapToScene(local);
        if (hintWheel_) {
          QWindowSystemInterface::handleWheelEvent(window_, scene * window_->devicePixelRatio(), window_->mapToGlobal(scene) * window_->devicePixelRatio(), QPoint(), QPoint(0, 120), Qt::NoModifier);
        } else {
          injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
          injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
          injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
        }
        QTimer::singleShot(100, this, [=, this] {
          if (hint->isVisible()) return fail(QStringLiteral("the hint badge stayed after the first %1").arg(hintWheel_ ? "wheel" : "press"));
          renderNow();
        });
      };
      QTimer::singleShot(30, this, *afterShown);
#endif
    });
  }
  // Undo/redo through REAL input: the toolbar buttons clicked with the mouse and Ctrl+Z / Ctrl+Y as key events.
  void undoEventsSequence() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--undo-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    auto* undoButton = window_->findChild<QQuickItem*>(QStringLiteral("undoButton"));
    auto* redoButton = window_->findChild<QQuickItem*>(QStringLiteral("redoButton"));
    if (!undoButton || !redoButton) return fail(QStringLiteral("the Undo/Redo toolbar buttons were not found"));
    const auto enabledFaces = [this] {
      QStringList faces;
      for (const QVariant& f : app_.cutFaces()) if (f.toMap().value("enabled").toBool()) faces << f.toMap().value("face").toString();
      return faces;
    };
    const auto clickItem = [this](QQuickItem* item) {
      const QPointF scene = stableCentre(item);
      injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
    };
    const auto key = [this](int code, Qt::KeyboardModifiers modifiers) {
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, code, modifiers);
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, code, modifiers);
    };

    if (undoButton->isEnabled()) return fail(QStringLiteral("Undo is enabled with nothing to undo"));
    app_.setCutFaceEnabled(QStringLiteral("left"), true);
    app_.setCutFaceEnabled(QStringLiteral("top"), true);
    if (enabledFaces() != QStringList{"left", "top"}) return fail(QStringLiteral("could not choose two faces"));
    QTimer::singleShot(100, this, [=, this] {   // let the QML re-evaluate the buttons' enabled state
      if (!undoButton->isEnabled() || redoButton->isEnabled()) return fail(QStringLiteral("the buttons do not reflect the history (undo %1, redo %2)").arg(undoButton->isEnabled()).arg(redoButton->isEnabled()));
      clickItem(undoButton);
      if (enabledFaces() != QStringList{"left"}) return fail(QStringLiteral("clicking Undo did not remove the last face (faces: %1)").arg(enabledFaces().join(",")));
      clickItem(undoButton);
      if (!enabledFaces().isEmpty()) return fail(QStringLiteral("clicking Undo twice did not remove both faces"));
      clickItem(redoButton);
      if (enabledFaces() != QStringList{"left"}) return fail(QStringLiteral("clicking Redo did not bring the face back"));
      // Keyboard: Ctrl+Z / Ctrl+Y (the standard Undo / Redo keys).
      key(Qt::Key_Z, Qt::ControlModifier);
      if (!enabledFaces().isEmpty()) return fail(QStringLiteral("Ctrl+Z did not undo (faces: %1)").arg(enabledFaces().join(",")));
      key(Qt::Key_Y, Qt::ControlModifier);
      if (enabledFaces() != QStringList{"left"}) return fail(QStringLiteral("Ctrl+Y did not redo (faces: %1)").arg(enabledFaces().join(",")));
      renderNow();
    });
#endif
  }
  // Flip through REAL input: the toolbar button clicked with the mouse, then the four arrow keys as key events (a held key flips once).
  void flipEventsSequence() {
#ifndef CRAFT_SMOKE_REAL_EVENTS
    return fail(QStringLiteral("--flip-events needs a build with CRAFT_BUILD_TESTS"));
#else
    QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
    window_->requestActivate();
    auto* flipButton = window_->findChild<QQuickItem*>(QStringLiteral("flipToolButton"));
    if (!flipButton) return fail(QStringLiteral("the Flip toolbar button was not found"));
    const auto clickItem = [this](QQuickItem* item) {
      const QPointF scene = stableCentre(item);
      injectMouse(scene, Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      injectMouse(scene, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      injectMouse(scene, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
    };
    const auto key = [this](int code) {
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, code, Qt::NoModifier);
      QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, code, Qt::NoModifier);
    };
    const auto quat = [this] {
      const QVariantMap s = app_.orientationState();
      return QVector4D(float(s.value("x").toDouble()), float(s.value("y").toDouble()), float(s.value("z").toDouble()), float(s.value("w").toDouble()));
    };
    const auto identity = [this] { return app_.orientationState().value("isIdentity").toBool(); };

    QTimer::singleShot(150, this, [=, this] {   // let the window finish its first layout before real events are delivered
    if (!flipButton->isEnabled()) return fail(QStringLiteral("the Flip button is disabled on a ready model"));
    if (!identity()) return fail(QStringLiteral("a freshly imported model is not at the identity orientation"));
    key(Qt::Key_Left);   // the Flip tool is not active yet: the arrow keys must not turn the part
    if (!identity()) return fail(QStringLiteral("an arrow key flipped the part while the Flip tool was not active"));
    clickItem(flipButton);
    if (app_.tool() != QLatin1String("orientation")) return fail(QStringLiteral("clicking Flip did not select the Flip tool (tool: %1)").arg(app_.tool()));
    key(Qt::Key_Left);
    if (identity()) return fail(QStringLiteral("the Left arrow did not flip the part"));
    const QVector4D afterLeft = quat();
    key(Qt::Key_Right);
    if (!identity()) return fail(QStringLiteral("Left then Right did not return to the identity orientation"));
    key(Qt::Key_Up);
    if (identity()) return fail(QStringLiteral("the Up arrow did not flip the part"));
    if (quat() == afterLeft) return fail(QStringLiteral("Up and Left flipped about the same axis"));
    key(Qt::Key_Down);
    if (!identity()) return fail(QStringLiteral("Up then Down did not return to the identity orientation"));
    for (int i = 0; i < 4; ++i) key(Qt::Key_Left);
    if (!identity()) return fail(QStringLiteral("four Left arrows did not make a full turn"));
    // A held key (auto-repeat press events) flips once, as in the reference.
    QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, Qt::Key_Left, Qt::NoModifier, QString(), false);
    for (int i = 0; i < 5; ++i) QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyPress, Qt::Key_Left, Qt::NoModifier, QString(), true);
    QWindowSystemInterface::handleKeyEvent(window_, QEvent::KeyRelease, Qt::Key_Left, Qt::NoModifier);
    if (quat() != afterLeft) return fail(QStringLiteral("a held Left arrow did not flip exactly once"));
    // Choosing Flip again leaves the tool, and the arrow keys stop turning the part.
    clickItem(flipButton);
    if (app_.tool() == QLatin1String("orientation")) return fail(QStringLiteral("clicking Flip again did not leave the Flip tool"));
    key(Qt::Key_Right);
    if (quat() != afterLeft) return fail(QStringLiteral("an arrow key flipped the part after the Flip tool was left"));
    app_.resetPartOrientation();
    if (!identity()) return fail(QStringLiteral("Reset did not restore the identity orientation"));
    renderNow();
    });
#endif
  }
  // --master-mold: after the other steps, generate the Master Mold the way the button does and keep its outcome in the summary, so that an
  // installed package can prove the Master Mold works too (it runs in the geometry worker process like the mold).
  void masterMoldStep() {
    auto done = std::make_shared<bool>(false);
    const auto check = [this, done] {
      if (*done) return;
      if (app_.masterMold().value("generating").toBool() || app_.masterMold().value("status").toString() == QLatin1String("unavailable")) return;
      *done = true;
      masterDone_ = true;
      if (app_.masterMold().value("uiKind").toString() != QLatin1String("success"))
        return fail(QStringLiteral("the Master Mold did not succeed: ") + app_.masterMold().value("uiKind").toString() + QLatin1Char(' ') +
                    app_.masterMold().value("banner").toString());
      QTimer::singleShot(0, this, [this] { render(); });
    };
    QObject::connect(&app_, &AppController::masterMoldChanged, this, check);
    app_.generateMasterMold();
    if (!app_.masterMold().value("generating").toBool()) check();   // it refused to start: the summary shows why
  }
  void render() {
    if (masterMold_ && !masterDone_) return masterMoldStep();
    if (flipEvents_) return flipEventsSequence();
    if (hintEvents_) return hintEventsSequence();
    if (undoEvents_) return undoEventsSequence();
    if (eraserEvents_) return eraserEventsSequence();
    if (sectionsEvents_) return sectionsEventsSequence();
    if (moldsEvents_) return moldsEventsSequence();
    if (masterEvents_) return masterEventsSequence();
    if (toolbarEvents_) return toolbarEventsSequence();
    if (focusEvents_) return focusEventsSequence();
    if (planeDragEvents_) return planeDragEventsSequence();
    if (extensionDragEvents_) return extensionDragEventsSequence();
    if (spruePreview_ && sprueGizmoEvents_) return gizmoEventsSequence();
    if (spruePreview_ && sprueGizmo_) return gizmoSequence();
    renderNow();
  }
  // Cut by Face planes drawn as slabs, with the Eraser hovering one of them (red).
  void eraserForSmoke() {
    const int w = static_cast<int>(window_->width()), h = static_cast<int>(window_->height());
    app_.camera()->setViewportSize(w, h);
    app_.setCutFaceEnabled(QStringLiteral("left"), true);
    app_.setCutFacePosition(QStringLiteral("left"), 0.7);
    app_.setCutFaceEnabled(QStringLiteral("top"), true);
    app_.setCutFacePosition(QStringLiteral("top"), 0.5);
    app_.setCutFaceEnabled(QStringLiteral("front"), true);
    app_.setTool(QStringLiteral("eraser"));
    for (int y = h / 6; y < h * 5 / 6; y += 3)
      for (int x = w / 8; x < w * 7 / 8; x += 3)
        if (app_.eraserHoverAt(x, y, w, h)) return;
  }
  void renderNow() {
    if (eraser_) eraserForSmoke();
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
      s.insert("analysisKernels", config.kernelsLibrary);
      s.insert("analysisWorkerInfo", app_.analysisWorkerInfo());
      s.insert("applicationDir", QCoreApplication::applicationDirPath());
      s.insert("selectionBox", app_.selectionBox());
      s.insert("sprueCandidate", app_.sprueCandidate());
      s.insert("sprueGlass", app_.sprueGlass());
      s.insert("sprueGizmo", app_.sprueGizmo());
      s.insert("cutPlanes", app_.cutPlanes());
      s.insert("selection", app_.selection());
      s.insert("engineeringReportsSummary", app_.engineeringReports());
      if (masterMold_) {
        const QVariantMap master = app_.masterMold();
        QVariantMap brief;
        for (const char* key : {"status", "uiKind", "banner", "generating"}) brief.insert(QLatin1String(key), master.value(QLatin1String(key)));
        brief.insert(QStringLiteral("setCount"), master.value(QStringLiteral("sets")).toList().size());
        brief.insert(QStringLiteral("masterCount"), master.value(QStringLiteral("masterCount")));
        brief.insert(QStringLiteral("canExport"), master.value(QStringLiteral("canExport")));
        s.insert("masterMoldSummary", brief);
      }
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
  void setMasterMold(bool value) { masterMold_ = value; }
  void setCutFaces(const QStringList& faces) { cutFaces_ = faces; }
  void setSpruePreview(bool value, bool invalid = false) { spruePreview_ = value; spruePreviewInvalid_ = invalid; }
  void setSprueGizmo(bool value, bool events = false) { sprueGizmo_ = value; sprueGizmoEvents_ = events; }
  void setEraser(bool value, bool events = false) { eraser_ = value; eraserEvents_ = events; }
  void setUndoEvents(bool value) { undoEvents_ = value; }
  void setFlipEvents(bool value) { flipEvents_ = value; }
  void setFocusEvents(bool value) { focusEvents_ = value; }
  void setExtensionDragEvents(bool value) { extensionDragEvents_ = value; }
  void setPlaneDragEvents(bool value) { planeDragEvents_ = value; }
  void setSectionsEvents(bool value) { sectionsEvents_ = value; }
  void setMoldsEvents(bool value) { moldsEvents_ = value; }
  void setMasterEvents(bool value) { masterEvents_ = value; }
  void setToolbarEvents(bool value) { toolbarEvents_ = value; }
  void setDropEvents(bool value) { dropEvents_ = value; }
  void setHintEvents(bool value, bool wheel) { hintEvents_ = value; hintWheel_ = wheel; }
  void setScreenshot(const QString& path) { screenshot_ = path; }

 private:
  AppController& app_;
  QQuickWindow* window_;
  QString importPath_, summary_, screenshot_;
  QStringList cutFaces_;
  bool expectError_ = false;
  bool selectPart_ = false, spruePreview_ = false, spruePreviewInvalid_ = false, sprueGizmo_ = false, sprueGizmoEvents_ = false, eraser_ = false, eraserEvents_ = false, planeDragEvents_ = false, sectionsEvents_ = false, moldsEvents_ = false, masterEvents_ = false, toolbarEvents_ = false, toolbarEventsStarted_ = false, dropEvents_ = false, undoEvents_ = false, flipEvents_ = false, focusEvents_ = false, extensionDragEvents_ = false, hintEvents_ = false, hintWheel_ = false;
  bool mold_, analyse_, moldability_;
  bool imported_ = false, moldDone_ = false, analysisDone_ = false, reportsDone_ = false, done_ = false;
  bool masterMold_ = false, masterDone_ = false;
};

}  // namespace

int main(int argc, char* argv[]) {
  // Geometry worker mode (P0-5): a child process that runs one job and exits, so that a cancelled job can be killed for real. It needs no
  // window, no QML and no GPU, so it is handled before any of that exists.
  if (argc == 4 && QByteArrayView(argv[1]) == "--geometry-worker") {
    QCoreApplication worker(argc, argv);
    return craft::app::runGeometryWorker(QString::fromLocal8Bit(argv[2]), QString::fromLocal8Bit(argv[3]));
  }
  QGuiApplication application(argc, argv);
  QCoreApplication::setOrganizationName(QStringLiteral("Craft"));
  QCoreApplication::setApplicationName(QStringLiteral("Craft"));
  QCoreApplication::setApplicationVersion(QStringLiteral(CRAFT_APP_VERSION));   // the CMake project version, also the executable's file version
  QQuickStyle::setStyle(QStringLiteral("Fusion"));
  installLogging();

  QCommandLineParser parser;
  parser.addHelpOption();
  parser.addOption({"smoke-test", "Run the end-to-end smoke test and exit."});
  parser.addOption({"import", "STL file to import.", "path"});
  parser.addOption({"generate-mold", "Generate a mold after import (smoke test)."});
  parser.addOption({"master-mold", "Generate the Master Mold after the other steps and record its outcome in the summary (smoke test)."});
  parser.addOption({"analyze", "Run the Python import analysis (smoke test)."});
  parser.addOption({"moldability", "Run the Python moldability/cavity/readiness analysis (smoke test)."});
  parser.addOption({"summary", "Write a JSON state summary here (smoke test).", "path"});
  parser.addOption({"select-part", "Select the part, toggle a box face and hover another before the frame is taken (smoke test)."});
  parser.addOption({"screenshot", "Save the rendered frame as a PNG (smoke test).", "path"});
  parser.addOption({"theme", "Start with this theme, dark or light (smoke test).", "name"});
  parser.addOption({"cut-face", "Choose a Cut by Face plane before the mold is generated; repeatable (smoke test).", "face"});
  parser.addOption({"font-scale", "Scale the application font by this factor, as Windows' Text size setting does (development builds; the UI tour and the smoke tests).", "factor"});
  parser.addOption({"glass", "Draw the mold with the glass appearance (smoke test)."});
  parser.addOption({"mold-opacity", "Mold opacity, 0.05 to 1 (smoke test).", "value"});
  parser.addOption({"sprue-preview", "Select the Sprue tool and preview the funnel on the generated mold (smoke test; use with --generate-mold)."});
  parser.addOption({"sprue-invalid", "With --sprue-preview: preview where the axis misses the cavity (the red case)."});
  parser.addOption({"sprue-gizmo", "With --sprue-preview: place a sprue, then drag one of its resize rings (smoke test)."});
  parser.addOption({"eraser", "Enable three Cut by Face planes and hover one with the Eraser tool (smoke test)."});
  parser.addOption({"project-bench", "Time a large project's save, autosave and open and write the result here (development builds).", "path"});
  parser.addOption({"bench-kind", "With --project-bench: project (the default), mold or master.", "kind"});
  parser.addOption({"viewport-bench", "Measure the viewport for the Three.js comparison and write the result here (development builds).", "path"});
  parser.addOption({"viewport-size", "With --viewport-bench: the viewport size in pixels, WxH.", "size"});
  parser.addOption({"bench-dir", "With --viewport-bench: write empty.png and part.png here.", "dir"});
  parser.addOption({"bench-frames", "With --viewport-bench: orbit frames to time (default 300).", "n"});
  parser.addOption({"bench-hold-ms", "With --viewport-bench: stay alive this long after measuring.", "ms"});
  parser.addOption({"bench-no-vsync", "With --viewport-bench: present without waiting for the display refresh, to see the rendering cost."});
  parser.addOption({"bench-label", "With --viewport-bench: a label stored in the result.", "text"});
  parser.addOption({"crash-victim", "Crash drill, the part to be killed: edit with a very short autosave interval and write this ready file (development builds; with --import).", "path"});
  parser.addOption({"recover-probe", "Crash drill, the part after the kill: open the first recovery offer and write what was found here (development builds).", "path"});
  parser.addOption({"ui-tour", "Walk through the UI states and write screenshots, inspector captures and a layout lint here (development builds).", "dir"});
  parser.addOption({"tour-bad-stl", "With --ui-tour: a file the importer rejects, for the error state.", "path"});
  parser.addOption({"hint-events", "The interaction hint through a real mouse press (smoke test)."});
  parser.addOption({"hint-wheel", "The interaction hint through a real wheel event (smoke test)."});
  parser.addOption({"undo-events", "Undo/redo through real input: the toolbar buttons and Ctrl+Z / Ctrl+Y (smoke test)."});
  parser.addOption({"extension-drag-events", "A segmentation extension plane dragged with the right mouse button, then undone with Ctrl+Z, through real input (smoke test)."});
  parser.addOption({"focus-events", "Keyboard use through real key events: Tab reaches every control, focus is kept when a list changes (smoke test)."});
  parser.addOption({"flip-events", "Flip through real input: the toolbar button and the four arrow keys (smoke test)."});
  parser.addOption({"eraser-events", "The Eraser through real mouse events: hover a plane, click empty space, click the plane (smoke test)."});
  parser.addOption({"master-events", "The Master Mold toolbar button through a real click (smoke test)."});
  parser.addOption({"toolbar-events", "The viewport's floating toolbar through real clicks (smoke test)."});
  parser.addOption({"molds-events", "The Molds browser through real clicks, with a mold generated (smoke test)."});
  parser.addOption({"sections-events", "The inspector's sections through real mouse and keyboard events (smoke test)."});
  parser.addOption({"drop-events", "Dropping files on the window through real platform drag-and-drop events (smoke test)."});
  parser.addOption({"plane-drag-events", "Dragging a cutting plane with the right mouse button through real mouse events (smoke test)."});
  parser.addOption({"sprue-gizmo-events", "With --sprue-preview: the same through real mouse events, plus a double click (smoke test)."});
  parser.process(application);

  AppController controller(std::shared_ptr<craft::IMeshGeometryEngine>(craft::createManifoldMeshEngine()),
                           AppPaths::analysisWorkerConfig());

  if (parser.isSet("theme")) controller.setTheme(parser.value("theme"));
  if (parser.isSet("glass")) controller.setMoldGlass(true);
  if (parser.isSet("font-scale")) {   // a larger system text size without a larger display scale
    const double factor = parser.value("font-scale").toDouble();
    if (factor > 0.25 && factor < 8) {
      QFont font = QGuiApplication::font();
      if (font.pointSizeF() > 0) font.setPointSizeF(font.pointSizeF() * factor); else font.setPixelSize(static_cast<int>(font.pixelSize() * factor));
      QGuiApplication::setFont(font);
    }
  }
  if (parser.isSet("mold-opacity")) controller.setMoldOpacity(parser.value("mold-opacity").toDouble());
  // P0-5: Master Mold, the mold generation and the segmentation run in a separate process (this executable, --geometry-worker) so that Cancel and the time limit really stop it.
  // There is no in-process path: a controller without this setting fails those jobs with `worker_unavailable`.
  controller.setGeometryWorkerExecutable(QCoreApplication::applicationFilePath());

#ifdef CRAFT_SMOKE_REAL_EVENTS
  if (parser.isSet("bench-no-vsync")) {
    QSurfaceFormat format = QSurfaceFormat::defaultFormat();
    format.setSwapInterval(0);
    QSurfaceFormat::setDefaultFormat(format);
  }
#endif
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty(QStringLiteral("app"), &controller);
  engine.loadFromModule("Craft", "Main");
  if (engine.rootObjects().isEmpty()) return 1;
  auto* window = qobject_cast<QQuickWindow*>(engine.rootObjects().first());

  std::unique_ptr<Smoke> smoke;
#ifdef CRAFT_SMOKE_REAL_EVENTS
  std::unique_ptr<craft::app::ViewportBench> bench;
  std::unique_ptr<craft::app::ProjectBench> projectBench;
  std::unique_ptr<craft::app::UiTour> tour;
  std::unique_ptr<craft::app::CrashDrill> drill;
  if (parser.isSet("project-bench")) {
    craft::app::ProjectBenchOptions options;
    options.importPath = parser.value("import");
    options.outputJson = parser.value("project-bench");
    options.workDirectory = parser.value("bench-dir");
    options.label = parser.value("bench-label");
    if (parser.isSet("bench-kind")) options.kind = parser.value("bench-kind");
    projectBench = std::make_unique<craft::app::ProjectBench>(controller, window, options);
    QTimer::singleShot(0, projectBench.get(), [&projectBench] { projectBench->start(); });
  } else if (parser.isSet("viewport-bench")) {
    craft::app::ViewportBenchOptions options;
    options.importPath = parser.value("import");
    options.outputJson = parser.value("viewport-bench");
    options.frameDirectory = parser.value("bench-dir");
    options.label = parser.value("bench-label");
    if (parser.isSet("viewport-size")) {
      const QStringList parts = parser.value("viewport-size").split(QLatin1Char('x'));
      if (parts.size() == 2) {
        options.viewportWidth = parts[0].toInt();
        options.viewportHeight = parts[1].toInt();
      }
    }
    if (parser.isSet("bench-frames")) options.orbitFrames = parser.value("bench-frames").toInt();
    if (parser.isSet("bench-hold-ms")) options.holdMilliseconds = parser.value("bench-hold-ms").toInt();
    bench = std::make_unique<craft::app::ViewportBench>(controller, window, options);
    QTimer::singleShot(0, bench.get(), [&bench] { bench->start(); });
  } else if (parser.isSet("crash-victim") || parser.isSet("recover-probe")) {
    craft::app::CrashDrillOptions options;
    options.role = parser.isSet("crash-victim") ? craft::app::DrillRole::Victim : craft::app::DrillRole::Probe;
    options.importPath = parser.value("import");
    options.file = parser.isSet("crash-victim") ? parser.value("crash-victim") : parser.value("recover-probe");
    drill = std::make_unique<craft::app::CrashDrill>(controller, options);
    QTimer::singleShot(300, drill.get(), [&drill] { drill->start(); });
  } else if (parser.isSet("ui-tour")) {
    craft::app::UiTourOptions options;
    options.importPath = parser.value("import");
    options.badStlPath = parser.value("tour-bad-stl");
    options.outputDirectory = parser.value("ui-tour");
    tour = std::make_unique<craft::app::UiTour>(controller, window, options);
    QTimer::singleShot(500, tour.get(), [&tour] { tour->start(); });
  } else
#endif
  if (parser.isSet("smoke-test")) {
    smoke = std::make_unique<Smoke>(controller, window, parser.value("import"),
                                    parser.isSet("generate-mold"), parser.isSet("analyze"), parser.isSet("moldability"),
                                    parser.value("summary"));
    smoke->setSelectPart(parser.isSet("select-part"));
    smoke->setMasterMold(parser.isSet("master-mold"));
    smoke->setCutFaces(parser.values("cut-face"));
    smoke->setSpruePreview(parser.isSet("sprue-preview"), parser.isSet("sprue-invalid"));
    smoke->setSprueGizmo(parser.isSet("sprue-gizmo"), parser.isSet("sprue-gizmo-events"));
    smoke->setEraser(parser.isSet("eraser"), parser.isSet("eraser-events"));
    smoke->setUndoEvents(parser.isSet("undo-events"));
    smoke->setFlipEvents(parser.isSet("flip-events"));
    smoke->setFocusEvents(parser.isSet("focus-events"));
    smoke->setExtensionDragEvents(parser.isSet("extension-drag-events"));
    smoke->setPlaneDragEvents(parser.isSet("plane-drag-events"));
    smoke->setDropEvents(parser.isSet("drop-events"));
    smoke->setSectionsEvents(parser.isSet("sections-events"));
    smoke->setMoldsEvents(parser.isSet("molds-events"));
    smoke->setMasterEvents(parser.isSet("master-events"));
    smoke->setToolbarEvents(parser.isSet("toolbar-events"));
    smoke->setHintEvents(parser.isSet("hint-events") || parser.isSet("hint-wheel"), parser.isSet("hint-wheel"));
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
