#include "AppPaths.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QStandardPaths>

#include <filesystem>

#include "path/ExtendedPath.h"

namespace craft::app {

namespace {

#ifdef Q_OS_WIN
constexpr const char* kPythonRelative = "python/python.exe";
constexpr const char* kKernelsRelative = "analysis/craft_analysis_kernels.dll";
#elif defined(Q_OS_MACOS)
constexpr const char* kPythonRelative = "python/bin/python3";
constexpr const char* kKernelsRelative = "analysis/craft_analysis_kernels.dylib";
#else
constexpr const char* kPythonRelative = "python/bin/python3";
constexpr const char* kKernelsRelative = "analysis/craft_analysis_kernels.so";
#endif

QString bundleRoot() {
  QDir directory(QCoreApplication::applicationDirPath());
#ifdef Q_OS_MACOS
  // Craft.app/Contents/MacOS -> Craft.app/Contents/Resources
  directory.cdUp();
  directory.cd(QStringLiteral("Resources"));
#endif
  return directory.absolutePath();
}

struct Resolution {
  analysis::WorkerConfig config;
  QString source;
};

Resolution resolveAnalysisRuntime() {
  Resolution resolution;
  const QString root = bundleRoot();
  const QString bundledPython = QDir(root).filePath(QLatin1String(kPythonRelative));
  const QString bundledWorker = QDir(root).filePath(QStringLiteral("analysis/craft_analysis_worker.py"));
  const QString bundledSite = QDir(root).filePath(QStringLiteral("analysis/site"));

  const QString environmentPython = qEnvironmentVariable("CRAFT_PYTHON");
  const QString environmentWorker = qEnvironmentVariable("CRAFT_ANALYSIS_WORKER");

  if (QFileInfo::exists(bundledWorker)) {
    resolution.config.workerScript = bundledWorker;
    resolution.config.pythonPath = {bundledSite};
  }
#ifdef CRAFT_DEV_WORKER_SCRIPT
  else if (QFileInfo::exists(QStringLiteral(CRAFT_DEV_WORKER_SCRIPT))) {
    resolution.config.workerScript = QStringLiteral(CRAFT_DEV_WORKER_SCRIPT);
    resolution.config.pythonPath = {QStringLiteral(CRAFT_DEV_ENGINE_SRC)};
  }
#endif
  if (!environmentWorker.isEmpty()) resolution.config.workerScript = environmentWorker;

  // The native kernels are an optimisation, never a requirement: without them the worker runs the same arithmetic in Python.
  const QString bundledKernels = QDir(root).filePath(QLatin1String(kKernelsRelative));
  if (QFileInfo::exists(bundledKernels)) {
    resolution.config.kernelsLibrary = bundledKernels;
  }
#ifdef CRAFT_DEV_KERNELS
  else if (QFileInfo::exists(QStringLiteral(CRAFT_DEV_KERNELS))) {
    resolution.config.kernelsLibrary = QStringLiteral(CRAFT_DEV_KERNELS);
  }
#endif

  if (!environmentPython.isEmpty()) {
    resolution.config.pythonExecutable = environmentPython;
    resolution.source = QStringLiteral("CRAFT_PYTHON environment override");
  } else if (QFileInfo::exists(bundledPython)) {
    resolution.config.pythonExecutable = bundledPython;
    resolution.source = QStringLiteral("bundled runtime");
  }
#ifdef CRAFT_DEV_PYTHON
  else if (QFileInfo::exists(QStringLiteral(CRAFT_DEV_PYTHON))) {
    resolution.config.pythonExecutable = QStringLiteral(CRAFT_DEV_PYTHON);
    resolution.source = QStringLiteral("development interpreter");
  }
#endif
  else {
    resolution.source = QStringLiteral("none");
  }
  return resolution;
}

}  // namespace

QString AppPaths::dataDirectory() {
  const QString path = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
  QDir().mkpath(path);
  return path;
}

QString AppPaths::logDirectory() {
  const QString path = QDir(dataDirectory()).filePath(QStringLiteral("logs"));
  QDir().mkpath(path);
  return path;
}

QString AppPaths::autosaveDirectory() {
  const QString override = qEnvironmentVariable("CRAFT_AUTOSAVE_DIR");
  const QString path = !override.isEmpty() ? override : QDir(dataDirectory()).filePath(QStringLiteral("autosave"));
  QDir().mkpath(path);
  return path;
}

QString AppPaths::modelCacheDirectory() {
  const QString override = qEnvironmentVariable("CRAFT_CACHE_DIR");
  const QString path = !override.isEmpty() ? override : QDir(QStandardPaths::writableLocation(QStandardPaths::CacheLocation)).filePath(QStringLiteral("models"));
  QDir().mkpath(path);
  return path;
}

QString AppPaths::pathForWorker(const QString& path) {
  const std::filesystem::path extended = craft::io::extendedLength(std::filesystem::path(path.toStdWString()));
  return extended.native() == path.toStdWString() ? path : QString::fromStdWString(extended.native());
}

QString AppPaths::logFilePath() { return QDir(logDirectory()).filePath(QStringLiteral("craft.log")); }

analysis::WorkerConfig AppPaths::analysisWorkerConfig() { return resolveAnalysisRuntime().config; }

QString AppPaths::analysisRuntimeSource() { return resolveAnalysisRuntime().source; }

}  // namespace craft::app
