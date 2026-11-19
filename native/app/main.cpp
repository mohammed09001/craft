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
#include <QSurfaceFormat>

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
#ifdef CRAFT_SMOKE_REAL_EVENTS
#include "ViewportBench.h"
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
      QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), buttons, button, type);
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
      QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), buttons, button, type);
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
      QTimer::singleShot(150, this, [=, this] {
        if (!hint->isVisible()) return fail(QStringLiteral("the hint badge is not shown for a loaded model that nobody has touched"));
        if (hint->opacity() != 1.0) return fail(QStringLiteral("the hint badge is transparent"));
        const QPointF local(viewport->width() / 2, viewport->height() / 3);
        const QPointF scene = viewport->mapToScene(local);
        if (hintWheel_) {
          QWindowSystemInterface::handleWheelEvent(window_, scene, window_->mapToGlobal(scene), QPoint(), QPoint(0, 120), Qt::NoModifier);
        } else {
          QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
          QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
          QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
        }
        QTimer::singleShot(100, this, [=, this] {
          if (hint->isVisible()) return fail(QStringLiteral("the hint badge stayed after the first %1").arg(hintWheel_ ? "wheel" : "press"));
          renderNow();
        });
      });
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
      const QPointF scene = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
      QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), Qt::NoButton, Qt::NoButton, QEvent::MouseMove);
      QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress);
      QWindowSystemInterface::handleMouseEvent(window_, scene, window_->mapToGlobal(scene), Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease);
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
  void render() {
    if (hintEvents_) return hintEventsSequence();
    if (undoEvents_) return undoEventsSequence();
    if (eraserEvents_) return eraserEventsSequence();
    if (planeDragEvents_) return planeDragEventsSequence();
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
  void setEraser(bool value, bool events = false) { eraser_ = value; eraserEvents_ = events; }
  void setUndoEvents(bool value) { undoEvents_ = value; }
  void setPlaneDragEvents(bool value) { planeDragEvents_ = value; }
  void setHintEvents(bool value, bool wheel) { hintEvents_ = value; hintWheel_ = wheel; }
  void setScreenshot(const QString& path) { screenshot_ = path; }

 private:
  AppController& app_;
  QQuickWindow* window_;
  QString importPath_, summary_, screenshot_;
  bool selectPart_ = false, spruePreview_ = false, spruePreviewInvalid_ = false, sprueGizmo_ = false, sprueGizmoEvents_ = false, eraser_ = false, eraserEvents_ = false, planeDragEvents_ = false, undoEvents_ = false, hintEvents_ = false, hintWheel_ = false;
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
  parser.addOption({"eraser", "Enable three Cut by Face planes and hover one with the Eraser tool (smoke test)."});
  parser.addOption({"viewport-bench", "Measure the viewport for the Three.js comparison and write the result here (development builds).", "path"});
  parser.addOption({"viewport-size", "With --viewport-bench: the viewport size in pixels, WxH.", "size"});
  parser.addOption({"bench-dir", "With --viewport-bench: write empty.png and part.png here.", "dir"});
  parser.addOption({"bench-frames", "With --viewport-bench: orbit frames to time (default 300).", "n"});
  parser.addOption({"bench-hold-ms", "With --viewport-bench: stay alive this long after measuring.", "ms"});
  parser.addOption({"bench-no-vsync", "With --viewport-bench: present without waiting for the display refresh, to see the rendering cost."});
  parser.addOption({"bench-label", "With --viewport-bench: a label stored in the result.", "text"});
  parser.addOption({"hint-events", "The interaction hint through a real mouse press (smoke test)."});
  parser.addOption({"hint-wheel", "The interaction hint through a real wheel event (smoke test)."});
  parser.addOption({"undo-events", "Undo/redo through real input: the toolbar buttons and Ctrl+Z / Ctrl+Y (smoke test)."});
  parser.addOption({"eraser-events", "The Eraser through real mouse events: hover a plane, click empty space, click the plane (smoke test)."});
  parser.addOption({"plane-drag-events", "Dragging a cutting plane with the right mouse button through real mouse events (smoke test)."});
  parser.addOption({"sprue-gizmo-events", "With --sprue-preview: the same through real mouse events, plus a double click (smoke test)."});
  parser.process(application);

  AppController controller(std::shared_ptr<craft::IMeshGeometryEngine>(craft::createManifoldMeshEngine()),
                           AppPaths::analysisWorkerConfig());

  if (parser.isSet("theme")) controller.setTheme(parser.value("theme"));

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
  if (parser.isSet("viewport-bench")) {
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
  } else
#endif
  if (parser.isSet("smoke-test")) {
    smoke = std::make_unique<Smoke>(controller, window, parser.value("import"),
                                    parser.isSet("generate-mold"), parser.isSet("analyze"), parser.isSet("moldability"),
                                    parser.value("summary"));
    smoke->setSelectPart(parser.isSet("select-part"));
    smoke->setSpruePreview(parser.isSet("sprue-preview"), parser.isSet("sprue-invalid"));
    smoke->setSprueGizmo(parser.isSet("sprue-gizmo"), parser.isSet("sprue-gizmo-events"));
    smoke->setEraser(parser.isSet("eraser"), parser.isSet("eraser-events"));
    smoke->setUndoEvents(parser.isSet("undo-events"));
    smoke->setPlaneDragEvents(parser.isSet("plane-drag-events"));
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
