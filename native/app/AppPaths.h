#pragma once

// Portable runtime locations. Nothing here refers to a development drive:
// user data goes to the OS per-user locations (QStandardPaths), and bundled
// runtimes are resolved relative to the installed application directory.

#include <QString>

#include "AnalysisWorkerClient.h"

namespace craft::app {

struct AppPaths {
  /// Per-user writable data directory (created on demand), e.g.
  /// %LOCALAPPDATA%/Craft/Craft on Windows, ~/Library/Application Support/Craft/Craft on macOS.
  static QString dataDirectory();
  static QString logDirectory();
  static QString logFilePath();
  /// A file path as the Python worker must be given it: the extended-length form ("\\?\C:\...") when the path is MAX_PATH or more, which the worker's
  /// open() needs while Windows' long-path setting is off (io/path/ExtendedPath.h); otherwise the path unchanged.
  static QString pathForWorker(const QString& path);

  /// Where unsaved work is autosaved for crash recovery. CRAFT_AUTOSAVE_DIR overrides it (tests, portable setups).
  static QString autosaveDirectory();
  /// Where models embedded in a project are materialized as files (the Python analysis reads models from disk).
  /// CRAFT_CACHE_DIR overrides it.
  static QString modelCacheDirectory();

  /// Analysis runtime resolution order:
  ///   1. CRAFT_PYTHON / CRAFT_ANALYSIS_WORKER environment overrides,
  ///   2. a runtime bundled with the application:
  ///        <app>/python/python(.exe), <app>/analysis/craft_analysis_worker.py,
  ///        <app>/analysis/site (engine packages);
  ///        on macOS the same folders under Craft.app/Contents/Resources,
  ///   3. the development tree this binary was built from (dev builds only).
  /// An empty pythonExecutable means no runtime is available; the bridge then
  /// reports "analysis_runtime_missing" instead of failing obscurely.
  static analysis::WorkerConfig analysisWorkerConfig();
  /// Human-readable description of which of the three sources was chosen.
  static QString analysisRuntimeSource();
};

}  // namespace craft::app
