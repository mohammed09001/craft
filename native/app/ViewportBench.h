#pragma once

// Viewport measurements for the comparison against the Three.js reference (docs/native-migration/VIEWPORT_COMPARISON.md).
// Development tooling: only built with the tests (CRAFT_BUILD_TESTS), never part of a packaged application.
//
// Run as `craft --viewport-bench out.json --import part.stl --viewport-size 960x640 --bench-dir frames/`: it sizes the
// window so the viewport item is exactly that big, grabs the viewport without and with the part, times the import,
// orbits the camera for a number of frames and records the frame cadence, the process memory and the graphics adapter.

#include <QObject>
#include <QString>

class QQuickWindow;

namespace craft::app {

class AppController;

struct ViewportBenchOptions {
  QString importPath;
  QString outputJson;
  QString frameDirectory;   // empty.png and part.png are written here
  int viewportWidth = 960, viewportHeight = 640;
  int orbitFrames = 300;
  int warmupFrames = 30;
  int holdMilliseconds = 0;  // stay alive after measuring so graphics memory can be sampled from outside
  QString label;
};

class ViewportBench : public QObject {
 public:
  ViewportBench(AppController& app, QQuickWindow* window, ViewportBenchOptions options);
  ~ViewportBench() override;
  void start();

 private:
  struct Impl;
  Impl* impl_;
};

}  // namespace craft::app
