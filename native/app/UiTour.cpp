#include "UiTour.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMetaObject>
#include <QVariant>
#include <QPoint>
#include <QQuickItem>
#include <QQuickItemGrabResult>
#include <QQuickWindow>
#include <QSharedPointer>
#include <QTimer>
#include <QUrl>

#include <cstdio>
#include <functional>

#include "AppController.h"

namespace craft::app {

namespace {

void pump(int milliseconds) {
  QEventLoop loop;
  QTimer::singleShot(milliseconds, &loop, &QEventLoop::quit);
  loop.exec();
}

bool waitFor(const std::function<bool()>& condition, int timeoutMs) {
  QElapsedTimer timer;
  timer.start();
  while (!condition()) {
    if (timer.elapsed() > timeoutMs) return false;
    pump(40);
  }
  return true;
}

QString className(const QObject* object) {
  QString name = QString::fromLatin1(object->metaObject()->className());
  const int underscore = name.indexOf(QLatin1String("_QMLTYPE_"));
  if (underscore > 0) name = name.left(underscore);
  if (name.startsWith(QLatin1String("QQuick"))) name = name.mid(6);
  return name;
}

QString textOf(QQuickItem* item) {
  const QVariant text = item->property("text");
  QString s = text.isValid() ? text.toString() : QString();
  if (s.isEmpty()) s = item->objectName();
  return s.simplified().left(60);
}

}  // namespace

struct UiTour::Impl {
  AppController& app;
  QQuickWindow* window;
  UiTourOptions options;
  QJsonArray states;
  QJsonArray problems;
  int sequence = 0;

  Impl(AppController& a, QQuickWindow* w, UiTourOptions o) : app(a), window(w), options(std::move(o)) {}

  QQuickItem* viewport() { return window->findChild<QQuickItem*>(QStringLiteral("viewport")); }
  QSize viewportSize() {
    QQuickItem* v = viewport();
    return v ? QSize(static_cast<int>(v->width()), static_cast<int>(v->height())) : window->size();
  }
  void syncCamera() {
    const QSize s = viewportSize();
    app.camera()->setViewportSize(s.width(), s.height());
  }
  void problem(const QString& state, const QString& what) {
    problems.append(QJsonObject{{"state", state}, {"problem", what}});
    std::fprintf(stderr, "[ui-tour] %s: %s\n", qPrintable(state), qPrintable(what));
  }

  // --- lint ---------------------------------------------------------------------------------------------------------------------
  // Items that are visible, have a size, and are cut off or squeezed. Vertical overflow of a scrolled panel is not a defect; horizontal
  // overflow (a panel has no horizontal scroll) is.
  void lint(QQuickItem* item, QQuickItem* clipAncestor, QJsonArray& out, const QRectF& windowRect, int depth = 0) {
    if (!item || !item->isVisible() || item->opacity() <= 0.0 || item->width() <= 0 || item->height() <= 0) return;
    const QRectF scene = item->mapRectToScene(QRectF(0, 0, item->width(), item->height()));
    const QString cls = className(item);
    const auto flag = [&](const QString& kind, const QString& detail) {
      out.append(QJsonObject{{"kind", kind}, {"item", cls}, {"text", textOf(item)}, {"detail", detail},
                             {"rect", QJsonArray{qRound(scene.x()), qRound(scene.y()), qRound(scene.width()), qRound(scene.height())}}});
    };
    if (cls == QLatin1String("Text") || cls == QLatin1String("Label") || item->property("elide").isValid()) {
      if (item->property("truncated").toBool()) flag(QStringLiteral("truncated-text"), QStringLiteral("text does not fit its width"));
    }
    const bool control = cls.contains(QLatin1String("Button")) || cls.contains(QLatin1String("SpinBox")) || cls.contains(QLatin1String("TextField")) ||
                         cls.contains(QLatin1String("ComboBox")) || cls.contains(QLatin1String("CheckBox")) || cls.contains(QLatin1String("Switch"));
    if (control && item->implicitWidth() > 0 && item->width() < item->implicitWidth() - 1.5)
      flag(QStringLiteral("squeezed-control"), QStringLiteral("%1 px wide, wants %2").arg(qRound(item->width())).arg(qRound(item->implicitWidth())));
    if (clipAncestor) {
      const QRectF clip = clipAncestor->mapRectToScene(QRectF(0, 0, clipAncestor->width(), clipAncestor->height()));
      if (scene.right() > clip.right() + 1.5 && scene.left() < clip.right())
        flag(QStringLiteral("cut-off"), QStringLiteral("extends %1 px past the right edge of its panel").arg(qRound(scene.right() - clip.right())));
    }
    if (scene.right() > windowRect.right() + 1.5 || scene.left() < windowRect.left() - 1.5)
      if (cls != QLatin1String("Overlay")) flag(QStringLiteral("off-window"), QStringLiteral("outside the window horizontally"));
    QQuickItem* nextClip = item->clip() && item->width() > 0 ? item : clipAncestor;
    for (QQuickItem* child : item->childItems()) lint(child, nextClip, out, windowRect, depth + 1);
  }

  // --- capture ------------------------------------------------------------------------------------------------------------------
  void grabInspectorContent(const QString& path) {
    QQuickItem* content = window->findChild<QQuickItem*>(QStringLiteral("inspectorContent"));
    if (!content) return;
    QSharedPointer<QQuickItemGrabResult> result = content->grabToImage();
    if (!result) return;
    QEventLoop loop;
    QObject::connect(result.data(), &QQuickItemGrabResult::ready, &loop, &QEventLoop::quit);
    QTimer::singleShot(5000, &loop, &QEventLoop::quit);
    loop.exec();
    result->image().save(path);
  }

  void capture(const QString& state, const QString& theme, bool compact, QJsonObject& entry) {
    const QString tag = QStringLiteral("%1-%2%3").arg(state, theme, compact ? QStringLiteral("-compact") : QString());
    const QImage frame = window->grabWindow();
    frame.save(QDir(options.outputDirectory).filePath(tag + QStringLiteral(".png")));
    if (!compact) grabInspectorContent(QDir(options.outputDirectory).filePath(tag + QStringLiteral("-inspector.png")));
    QJsonArray issues;
    lint(window->contentItem(), nullptr, issues, QRectF(0, 0, window->width(), window->height()));
    entry.insert(tag, issues);
  }

  void captureState(const QString& name) {
    QJsonObject entry{{"state", name}};
    QJsonObject lints;
    const QString original = app.theme();
    for (const QString& theme : {QStringLiteral("dark"), QStringLiteral("light")}) {
      app.setTheme(theme);
      pump(450);
      capture(name, theme, false, lints);
    }
    app.setTheme(QStringLiteral("dark"));
    pump(300);
    // the minimum window size: the panels must still hold their content
    const QSize normal = window->size();
    window->resize(window->minimumWidth(), window->minimumHeight());
    pump(600);
    syncCamera();
    capture(name, QStringLiteral("dark"), true, lints);
    window->resize(normal);
    pump(500);
    syncCamera();
    Q_UNUSED(original);
    entry.insert("lint", lints);
    entry.insert("status", app.statusText());
    entry.insert("tool", app.tool());
    states.append(entry);
    std::fprintf(stderr, "[ui-tour] %02d %s captured\n", ++sequence, qPrintable(name));
  }

  QPoint findPixel(const std::function<bool(int, int, int, int)>& probe) {
    const QSize s = viewportSize();
    for (int y = s.height() / 6; y < s.height() * 5 / 6; y += 6)
      for (int x = s.width() / 8; x < s.width() * 7 / 8; x += 6)
        if (probe(x, y, s.width(), s.height())) return QPoint(x, y);
    return QPoint(-1, -1);
  }

  void run() {
    QDir().mkpath(options.outputDirectory);
    if (!qEnvironmentVariable("CRAFT_AUTOSAVE_DIR").isEmpty()) app.discardRecovery();   // isolated runs only (see native-tour.ps1)
    window->resize(1280, 800);
    pump(800);
    syncCamera();

    captureState(QStringLiteral("01-empty"));

    app.importStlFile(options.importPath);
    if (!waitFor([&] { return app.modelPhase() == QLatin1String("ready"); }, 30000)) problem("02-model-loaded", "the model did not load");
    pump(900);
    syncCamera();
    captureState(QStringLiteral("02-model-loaded"));

    const QSize s = viewportSize();
    const QPoint hit = findPixel([&](int x, int y, int w, int h) { return app.pickAt(x, y, w, h); });
    if (hit.x() >= 0) app.hoverAt(hit.x(), hit.y(), s.width(), s.height());
    pump(400);
    captureState(QStringLiteral("03-part-selected"));
    app.clearSelection();

    app.setCutFaceEnabled(QStringLiteral("front"), true);
    app.setCutFaceEnabled(QStringLiteral("top"), true);
    app.setCutFacePosition(QStringLiteral("top"), 0.5);
    app.setCutFaceEnabled(QStringLiteral("left"), true);
    app.setCutFacePosition(QStringLiteral("left"), 0.7);
    pump(500);
    captureState(QStringLiteral("04-cut-faces"));

    app.setTool(QStringLiteral("eraser"));
    const QPoint onPlane = findPixel([&](int x, int y, int w, int h) { return app.eraserHoverAt(x, y, w, h); });
    pump(400);
    if (onPlane.x() < 0) problem("05-eraser-hover", "no pixel on a cutting plane");
    captureState(QStringLiteral("05-eraser-hover"));
    app.eraserLeave();
    app.setTool(QStringLiteral("select"));

    app.generateMold();
    if (!waitFor([&] { return app.moldPhase() == QLatin1String("complete"); }, 120000)) problem("06-mold-generated", "the mold did not complete");
    pump(1200);
    captureState(QStringLiteral("06-mold-generated"));

    app.setTool(QStringLiteral("sprue"));
    const QPoint spruePixel = findPixel([&](int x, int y, int w, int h) { return app.placeSprueAt(x, y, w, h); });
    if (spruePixel.x() >= 0) waitFor([&] { return app.spruePhase() != QLatin1String("evaluating") && app.spruePhase() != QLatin1String("generating"); }, 60000);
    else problem("07-sprue-placed", "no sprue could be placed");
    pump(1000);
    captureState(QStringLiteral("07-sprue-placed"));
    app.setTool(QStringLiteral("select"));

    app.runMoldabilityAnalysis();
    if (!waitFor([&] {
          const QString phase = app.engineeringReports().value("phase").toString();
          return phase == QLatin1String("complete") || phase == QLatin1String("error");
        }, 180000))
      problem("08-moldability-report", "the analysis did not finish");
    pump(600);
    captureState(QStringLiteral("08-moldability-report"));

    app.generateMasterMold();
    pump(500);
    waitFor([&] { return !app.masterMold().value("generating").toBool(); }, 180000);
    pump(1000);
    captureState(QStringLiteral("09-master-mold"));

    // A printer change makes the finished pieces stale: they stay, ghosted in their own colours.
    app.setPrinterVolume(250, 250, 250);
    pump(800);
    captureState(QStringLiteral("09b-master-mold-stale"));

    app.setPrinterVolume(30, 30, 30);
    app.planSegmentation();
    waitFor([&] {
      const QString phase = app.segmentation().value("phase").toString();
      return phase == QLatin1String("planned") || phase == QLatin1String("failed") || phase == QLatin1String("not-required");
    }, 60000);
    pump(600);
    captureState(QStringLiteral("10-segmentation-planned"));

    // Every section of the inspector folded: only the titles remain (the inspector's own "Collapse all"), then unfolded again.
    if (QQuickItem* inspector = window->findChild<QQuickItem*>(QStringLiteral("inspector"))) {
      QMetaObject::invokeMethod(inspector, "setAllCollapsed", Q_ARG(QVariant, true));
      pump(500);
      captureState(QStringLiteral("11-sections-collapsed"));
      QMetaObject::invokeMethod(inspector, "setAllCollapsed", Q_ARG(QVariant, false));
      pump(400);
    } else {
      problem("11-sections-collapsed", "the inspector was not found");
    }

    if (!options.badStlPath.isEmpty()) {
      app.importStlFile(options.badStlPath);
      waitFor([&] { return app.modelPhase() == QLatin1String("error"); }, 30000);
      pump(600);
      captureState(QStringLiteral("12-import-error"));
    }

    QJsonObject summary{{"states", states}, {"problems", problems}, {"windowSize", QJsonArray{1280, 800}},
                        {"minimumSize", QJsonArray{window->minimumWidth(), window->minimumHeight()}}};
    QFile file(QDir(options.outputDirectory).filePath(QStringLiteral("tour.json")));
    if (file.open(QIODevice::WriteOnly)) file.write(QJsonDocument(summary).toJson());
    std::printf("CRAFT_TOUR_OK %d states, %d problems\n", static_cast<int>(states.size()), static_cast<int>(problems.size()));
    std::fflush(stdout);
    QCoreApplication::exit(0);
  }
};

UiTour::UiTour(AppController& app, QQuickWindow* window, UiTourOptions options) : impl_(new Impl(app, window, std::move(options))) {}
UiTour::~UiTour() { delete impl_; }
void UiTour::start() { impl_->run(); }

}  // namespace craft::app
