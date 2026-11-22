#pragma once

// Save, autosave and open timings of a project with a large model (P2-6, docs/native-migration/RISKS.md R-LargeStl-1).
// Development tooling: only built with the tests (CRAFT_BUILD_TESTS), never part of a packaged application.
//
// Run as `craft --project-bench out.json --import part.stl --bench-dir <scratch>`: it imports the model, saves it as a project twice (the
// second save of the same model shows what a repeated save and an autosave cost), runs one autosave, opens the project twice, and records
// each step's time, the size of the project file, and the process's peak and current memory.

#include <QObject>
#include <QString>

class QQuickWindow;

namespace craft::app {

class AppController;

struct ProjectBenchOptions {
  QString importPath;
  QString outputJson;
  QString workDirectory;  // the project and autosave are written here
  QString label;
};

class ProjectBench : public QObject {
 public:
  ProjectBench(AppController& app, QQuickWindow* window, ProjectBenchOptions options);
  ~ProjectBench() override;
  void start();

 private:
  struct Impl;
  Impl* impl_;
};

}  // namespace craft::app
