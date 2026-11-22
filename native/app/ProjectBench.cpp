#include "ProjectBench.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QTimer>

#include <functional>

#ifdef Q_OS_WIN
#include <windows.h>
#include <psapi.h>
#endif

#include "AppController.h"

namespace craft::app {

namespace {

QJsonObject processMemory() {
  QJsonObject m;
#ifdef Q_OS_WIN
  PROCESS_MEMORY_COUNTERS_EX counters{};
  if (GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters), sizeof(counters))) {
    const double mib = 1024.0 * 1024.0;
    m["workingSetMiB"] = static_cast<double>(counters.WorkingSetSize) / mib;
    m["peakWorkingSetMiB"] = static_cast<double>(counters.PeakWorkingSetSize) / mib;
    m["privateMiB"] = static_cast<double>(counters.PrivateUsage) / mib;
    m["peakPagefileMiB"] = static_cast<double>(counters.PeakPagefileUsage) / mib;
  }
#endif
  return m;
}

}  // namespace

struct ProjectBench::Impl {
  AppController& app;
  ProjectBenchOptions options;
  QJsonObject result;
  Impl(AppController& a, ProjectBenchOptions o) : app(a), options(std::move(o)) {}

  bool waitFor(const std::function<bool()>& done, int timeoutMs) {
    QElapsedTimer timer;
    timer.start();
    while (!done() && timer.elapsed() < timeoutMs) {
      QEventLoop loop;
      QTimer::singleShot(10, &loop, &QEventLoop::quit);
      loop.exec();
    }
    return done();
  }

  void finish(bool ok, const QString& message) {
    result["ok"] = ok;
    result["message"] = message;
    result["label"] = options.label;
    result["memory"] = processMemory();
    if (!options.outputJson.isEmpty()) {
      QFile out(options.outputJson);
      if (out.open(QIODevice::WriteOnly)) out.write(QJsonDocument(result).toJson(QJsonDocument::Indented));
    }
    fprintf(stdout, "%s\n", ok ? "CRAFT_PROJECT_BENCH_OK" : qPrintable(QStringLiteral("CRAFT_PROJECT_BENCH_FAIL: ") + message));
    fflush(stdout);
    QCoreApplication::exit(ok ? 0 : 2);
  }

  /// Times a mold at one quality (what the Generate mold button does) or the Master Mold, until it ends; records time, outcome and memory.
  void timeJob(const QString& name, const std::function<void()>& start, const std::function<bool()>& running, const std::function<QString()>& outcome) {
    QElapsedTimer t;
    t.start();
    start();
    waitFor([&] { return !running(); }, 30 * 60 * 1000);
    QJsonObject r;
    r["ms"] = static_cast<double>(t.nsecsElapsed()) / 1e6;
    r["finished"] = !running();
    r["outcome"] = outcome();
    r["memory"] = processMemory();
    result[name] = r;
  }

  void runPart() {
    app.setAutosaveIntervalMs(24 * 60 * 60 * 1000);
    app.importStlFile(options.importPath);
    if (!waitFor([&] { return app.modelPhase() == QLatin1String("ready") || app.modelPhase() == QLatin1String("error"); }, 10 * 60 * 1000) || app.modelPhase() != QLatin1String("ready"))
      return finish(false, QStringLiteral("the import failed or timed out: %1").arg(app.modelMessage()));
    result["triangles"] = static_cast<double>(app.model()->sourceSoup->triangleCount());
    { const auto& b = app.model()->groundedBounds; result["sizeMm"] = QJsonArray{b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z}; }
    result["memoryAfterImport"] = processMemory();
    if (options.kind == QLatin1String("master")) {
      // The application's limit is the reference's 180 s; a measurement can ask for longer to see how long a part really takes.
      bool limitOk = false;
      const int limitMs = qEnvironmentVariable("CRAFT_BENCH_MASTER_TIMEOUT_MS").toInt(&limitOk);
      if (limitOk && limitMs > 0) app.setMasterMoldTimeoutMs(limitMs);
      timeJob(QStringLiteral("master"), [&] { app.generateMasterMold(); }, [&] { return app.masterMold().value("generating").toBool(); },
              [&] { return app.masterMold().value("uiKind").toString() + QLatin1Char(' ') + app.masterMold().value("banner").toString(); });
    } else {
      // The conditions of R-Cavity-1: 1 mm cavity clearance and one split (the top face at its default position).
      app.setCavityClearanceMm(1.0);
      app.setCutFaceEnabled(QStringLiteral("top"), true);
      for (const QString quality : {QStringLiteral("high"), QStringLiteral("standard")}) {
        app.setCavityQuality(quality);
        timeJob(quality, [&] { app.generateMold(); }, [&] { return app.moldPhase() == QLatin1String("generating"); },
                [&] { return app.moldPhase() + QLatin1Char(' ') + app.moldError() + QLatin1Char(' ') + QString::number(app.moldSummary().value("bodyCount").toInt()) + QStringLiteral(" bodies"); });
        if (app.moldPhase() == QLatin1String("generating")) break;   // never finished: the second run would overlap it
      }
    }
    finish(true, QStringLiteral("done"));
  }

  void run() {
    if (options.kind != QLatin1String("project")) return runPart();
    app.setAutosaveIntervalMs(24 * 60 * 60 * 1000);  // only the autosave this run asks for: a timer's own would overlap the measurements
    QDir().mkpath(options.workDirectory);
    const QString project = QDir(options.workDirectory).filePath(QStringLiteral("bench.craft"));
    QFile::remove(project);
    const auto stepMs = [](QElapsedTimer& t) { return static_cast<double>(t.nsecsElapsed()) / 1e6; };
    QElapsedTimer t;

    t.start();
    app.importStlFile(options.importPath);
    if (!waitFor([&] { return app.modelPhase() == QLatin1String("ready") || app.modelPhase() == QLatin1String("error"); }, 10 * 60 * 1000) || app.modelPhase() != QLatin1String("ready"))
      return finish(false, QStringLiteral("the import failed or timed out: %1").arg(app.modelMessage()));
    result["importMs"] = stepMs(t);
    result["triangles"] = static_cast<double>(app.model()->sourceSoup->triangleCount());
    result["memoryAfterImport"] = processMemory();

    // Two saves of the same model: the second is what a repeated save, and the autosave, cost once the first has been done.
    for (int n = 1; n <= 2; ++n) {
      if (n == 2) app.setMoldClearanceMm(app.moldClearanceMm() == 12 ? 14 : 12);   // an edit, so that the project is dirty
      t.start();
      app.saveProjectToFile(project);
      if (!waitFor([&] { return !app.project().value("saving").toBool(); }, 10 * 60 * 1000)) return finish(false, QStringLiteral("save %1 timed out").arg(n));
      if (!QFileInfo::exists(project)) return finish(false, QStringLiteral("save %1 wrote no file: %2").arg(n).arg(app.statusText()));
      result[n == 1 ? "saveFirstMs" : "saveSecondMs"] = stepMs(t);
    }
    result["projectFileMiB"] = static_cast<double>(QFileInfo(project).size()) / (1024.0 * 1024.0);
    result["memoryAfterSaves"] = processMemory();

    // One autosave of an edited project (what runs every minute while the project is dirty).
    app.setMoldClearanceMm(app.moldClearanceMm() == 12 ? 14 : 12);
    if (!waitFor([&] { return app.project().value("dirty").toBool(); }, 60 * 1000)) return finish(false, QStringLiteral("the edit did not make the project dirty"));
    const QString lastBefore = app.project().value("lastAutosaveAt").toString();
    t.start();
    app.autosaveNow();
    if (!app.project().value("dirty").toBool()) return finish(false, QStringLiteral("autosaveNow did nothing"));
    if (!waitFor([&] { return app.project().value("lastAutosaveAt").toString() != lastBefore; }, 10 * 60 * 1000)) return finish(false, QStringLiteral("the autosave timed out"));
    result["autosaveMs"] = stepMs(t);

    // Two opens of the project: the first writes the model to the analysis cache, the second finds it there.
    for (int n = 1; n <= 2; ++n) {
      t.start();
      app.openProjectFile(project);
      if (!waitFor([&] { return app.modelPhase() == QLatin1String("ready") && !app.project().value("opening").toBool(); }, 10 * 60 * 1000)) return finish(false, QStringLiteral("open %1 timed out").arg(n));
      result[n == 1 ? "openFirstMs" : "openSecondMs"] = stepMs(t);
    }
    finish(true, QStringLiteral("done"));
  }
};

ProjectBench::ProjectBench(AppController& app, QQuickWindow*, ProjectBenchOptions options) : impl_(new Impl(app, std::move(options))) {}
ProjectBench::~ProjectBench() { delete impl_; }
void ProjectBench::start() { impl_->run(); }

}  // namespace craft::app
