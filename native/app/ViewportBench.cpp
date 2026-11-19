#include "ViewportBench.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QGuiApplication>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickItem>
#include <QQuickWindow>
#include <QScreen>
#include <QSGRendererInterface>
#include <QTimer>

#include <rhi/qrhi.h>

#include <algorithm>
#include <cmath>
#include <memory>
#include <mutex>
#include <vector>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <psapi.h>
#pragma comment(lib, "psapi.lib")
#endif

#include "AppController.h"
#include "ViewportCamera.h"

namespace craft::app {

namespace {

QJsonObject memorySnapshot() {
  QJsonObject m;
#ifdef _WIN32
  PROCESS_MEMORY_COUNTERS_EX counters{};
  counters.cb = sizeof(counters);
  if (GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters), sizeof(counters))) {
    constexpr double mib = 1024.0 * 1024.0;
    m["workingSetMiB"] = static_cast<double>(counters.WorkingSetSize) / mib;
    m["peakWorkingSetMiB"] = static_cast<double>(counters.PeakWorkingSetSize) / mib;
    m["privateMiB"] = static_cast<double>(counters.PrivateUsage) / mib;
  }
  m["pid"] = static_cast<double>(GetCurrentProcessId());
#endif
  return m;
}

double percentile(std::vector<double> sorted, double p) {
  if (sorted.empty()) return 0;
  std::sort(sorted.begin(), sorted.end());
  return sorted[static_cast<std::size_t>(p * static_cast<double>(sorted.size() - 1))];
}

}  // namespace

struct ViewportBench::Impl {
  AppController& app;
  QQuickWindow* window;
  ViewportBenchOptions options;
  QJsonObject result;
  QElapsedTimer clock;
  qint64 importStartedNs = 0;
  bool done = false;
  int swapsSinceReady = 0;
  bool ready = false;
  std::vector<double> intervalsMs;
  qint64 lastSwapNs = 0;
  int orbitSwaps = 0;
  bool orbitFinished = false;
  std::mutex orbitMutex;
  QMetaObject::Connection orbitConnection;

  Impl(AppController& a, QQuickWindow* w, ViewportBenchOptions o) : app(a), window(w), options(std::move(o)) {}

  QQuickItem* viewportItem() const { return window->findChild<QQuickItem*>(QStringLiteral("viewport")); }

  // The window is sized so that the viewport item (not the whole window) is exactly the requested size.
  bool sizeViewport() {
    QQuickItem* item = viewportItem();
    if (!item) return false;
    for (int attempt = 0; attempt < 6; ++attempt) {
      const int dw = options.viewportWidth - static_cast<int>(item->width());
      const int dh = options.viewportHeight - static_cast<int>(item->height());
      if (dw == 0 && dh == 0) return true;
      window->resize(window->width() + dw, window->height() + dh);
      QCoreApplication::processEvents(QEventLoop::AllEvents, 100);
      pump(150);
    }
    return static_cast<int>(item->width()) == options.viewportWidth && static_cast<int>(item->height()) == options.viewportHeight;
  }

  static void pump(int ms) {
    QElapsedTimer t;
    t.start();
    while (t.elapsed() < ms) QCoreApplication::processEvents(QEventLoop::AllEvents, 20);
  }

  QImage grabViewport() {
    pump(700);  // let the scene graph render the latest state
    const QImage frame = window->grabWindow();
    QQuickItem* item = viewportItem();
    const QPointF origin = item->mapToScene(QPointF(0, 0));
    const qreal dpr = frame.devicePixelRatio() > 0 ? frame.devicePixelRatio() : 1.0;
    const QRect rect(qRound(origin.x() * dpr), qRound(origin.y() * dpr), qRound(item->width() * dpr), qRound(item->height() * dpr));
    return frame.copy(rect).convertToFormat(QImage::Format_RGB32);
  }

  void fail(const QString& why) {
    if (done) return;
    done = true;
    fprintf(stderr, "CRAFT_BENCH_FAIL: %s\n", qPrintable(why));
    QCoreApplication::exit(2);
  }

  void describeRenderer() {
    QJsonObject r;
    QSGRendererInterface* ri = window->rendererInterface();
    r["graphicsApi"] = static_cast<int>(ri->graphicsApi());
    if (auto* rhi = static_cast<QRhi*>(ri->getResource(window, QSGRendererInterface::RhiResource))) {
      r["backend"] = QString::fromUtf8(rhi->backendName());
      r["adapter"] = QString::fromUtf8(rhi->driverInfo().deviceName);
      r["deviceType"] = static_cast<int>(rhi->driverInfo().deviceType);
    }
    r["devicePixelRatio"] = window->devicePixelRatio();
    result["renderer"] = r;
  }

  void finish() {
    if (done) return;
    done = true;
    result["memoryAfterOrbit"] = memorySnapshot();
    QFile out(options.outputJson);
    if (out.open(QIODevice::WriteOnly)) out.write(QJsonDocument(result).toJson());
    fprintf(stdout, "CRAFT_BENCH_OK\n");
    fflush(stdout);
    QTimer::singleShot(options.holdMilliseconds, qApp, [] { QCoreApplication::exit(0); });
  }

  // Frame cadence under a continuous orbit. The swap times are taken on the render thread (direct connection) so a busy
  // GUI thread does not distort them; each swap asks the GUI thread for one more orbit step, which schedules the next frame.
  void runOrbit() {
    intervalsMs.clear();
    lastSwapNs = 0;
    orbitSwaps = 0;
    const int total = options.warmupFrames + options.orbitFrames;
    orbitConnection = QObject::connect(window, &QQuickWindow::frameSwapped, window, [this, total] {
      const qint64 now = clock.nsecsElapsed();
      bool last = false;
      {
        std::lock_guard<std::mutex> lock(orbitMutex);
        if (orbitSwaps > options.warmupFrames && lastSwapNs != 0) intervalsMs.push_back(static_cast<double>(now - lastSwapNs) / 1e6);
        lastSwapNs = now;
        last = ++orbitSwaps >= total;
      }
      QMetaObject::invokeMethod(window, [this, last] {
        if (last) {
          QObject::disconnect(orbitConnection);
          finishOrbit();
        } else if (!orbitFinished) {
          app.camera()->orbitByPixels(3.0, 0.0, options.viewportHeight);
        }
      }, Qt::QueuedConnection);
    }, Qt::DirectConnection);
    app.camera()->orbitByPixels(3.0, 0.0, options.viewportHeight);
  }

  void finishOrbit() {
    if (orbitFinished) return;
    orbitFinished = true;
    std::lock_guard<std::mutex> lock(orbitMutex);
    QJsonObject o;
    o["frames"] = static_cast<double>(intervalsMs.size());
    double sum = 0;
    for (double v : intervalsMs) sum += v;
    const double mean = intervalsMs.empty() ? 0 : sum / static_cast<double>(intervalsMs.size());
    o["meanMs"] = mean;
    o["fps"] = mean > 0 ? 1000.0 / mean : 0;
    o["p50Ms"] = percentile(intervalsMs, 0.50);
    o["p95Ms"] = percentile(intervalsMs, 0.95);
    o["p99Ms"] = percentile(intervalsMs, 0.99);
    o["maxMs"] = percentile(intervalsMs, 1.0);
    o["over20ms"] = static_cast<double>(std::count_if(intervalsMs.begin(), intervalsMs.end(), [](double v) { return v > 20.0; }));
    o["over33ms"] = static_cast<double>(std::count_if(intervalsMs.begin(), intervalsMs.end(), [](double v) { return v > 33.4; }));
    result["orbit"] = o;
    finish();
  }
  void measureImport() {
    result["memoryBeforeImport"] = memorySnapshot();
    QObject::connect(&app, &AppController::errorOccurred, window, [this](const QString& title, const QString& message, const QString&) {
      fail(title + ": " + message);
    });
    QObject::connect(&app, &AppController::modelChanged, window, [this] {
      if (app.modelPhase() != QLatin1String("ready") || ready) return;
      ready = true;
      result["importReadyMs"] = static_cast<double>(clock.nsecsElapsed() - importStartedNs) / 1e6;
      // The first frame that can show the part: the second swap after the model is ready.
      auto swapConnection = std::make_shared<QMetaObject::Connection>();
      *swapConnection = QObject::connect(window, &QQuickWindow::frameSwapped, window, [this, swapConnection] {
        if (++swapsSinceReady < 2) return;
        QObject::disconnect(*swapConnection);
        result["importFirstFrameMs"] = static_cast<double>(clock.nsecsElapsed() - importStartedNs) / 1e6;
        QTimer::singleShot(0, window, [this] { afterImport(); });
      });
      window->update();
    });
    clock.start();
    importStartedNs = clock.nsecsElapsed();
    app.importStlFile(options.importPath);
  }

  void afterImport() {
    result["model"] = QJsonObject::fromVariantMap(app.modelInfo());
    const QImage part = grabViewport();
    if (!options.frameDirectory.isEmpty()) part.save(QDir(options.frameDirectory).filePath(QStringLiteral("part.png")));
    result["memoryAfterImport"] = memorySnapshot();
    result["partFrameSize"] = QJsonArray{part.width(), part.height()};
    runOrbit();
  }

  void start() {
    QTimer::singleShot(600000, window, [this] { fail(QStringLiteral("viewport bench timed out")); });
    // Which display the window is on decides the refresh rate it is paced by: use the fastest one, not whichever the system
    // happened to open it on (a machine with a 75 Hz and a 60 Hz monitor gave different cadences from run to run).
    QScreen* fastest = nullptr;
    for (QScreen* screen : QGuiApplication::screens())
      if (!fastest || screen->refreshRate() > fastest->refreshRate()) fastest = screen;
    if (fastest && window->screen() != fastest) {
      window->setScreen(fastest);
      window->setPosition(fastest->geometry().topLeft() + QPoint(40, 40));
      pump(300);
    }
    if (fastest) {
      QJsonObject screen;
      screen["name"] = fastest->name();
      screen["refreshHz"] = fastest->refreshRate();
      screen["width"] = fastest->size().width();
      screen["height"] = fastest->size().height();
      result["screen"] = screen;
    }
    window->requestActivate();
    if (!sizeViewport()) return fail(QStringLiteral("could not size the viewport to the requested size (the screen may be too small)"));
    result["label"] = options.label;
    result["viewportSize"] = QJsonArray{options.viewportWidth, options.viewportHeight};
    result["theme"] = app.theme();
    describeRenderer();
    // The empty frame: the same viewport with nothing loaded, its "Open an STL" hint hidden so only the scene remains.
    if (QQuickItem* hint = window->findChild<QQuickItem*>(QStringLiteral("emptyHint"))) hint->setVisible(false);
    // The reference's hint badge is hidden in its frames too (it is page text, not scene). Opacity, not visibility: the
    // visibility is bound to the model and would come back when the part loads.
    if (QQuickItem* hint = window->findChild<QQuickItem*>(QStringLiteral("interactionHint"))) hint->setOpacity(0);
    const QImage empty = grabViewport();
    if (!options.frameDirectory.isEmpty()) {
      QDir().mkpath(options.frameDirectory);
      empty.save(QDir(options.frameDirectory).filePath(QStringLiteral("empty.png")));
    }
    measureImport();
  }
};

ViewportBench::ViewportBench(AppController& app, QQuickWindow* window, ViewportBenchOptions options)
    : impl_(new Impl(app, window, std::move(options))) {}

ViewportBench::~ViewportBench() { delete impl_; }

void ViewportBench::start() { impl_->start(); }

}  // namespace craft::app
