#pragma once

// A walk through the native UI for the review in docs/native-migration/UI_WALKTHROUGH.md.
// Development tooling: only built with the tests (CRAFT_BUILD_TESTS), never part of a packaged application.
//
// Run as `craft --ui-tour out-dir --import part.stl [--tour-bad-stl broken.stl]`: it drives the real controller through the
// application's states (empty, model loaded, part selected, cut faces, Eraser, mold generated, sprue, moldability report, Master Mold,
// segmentation, an import error) and in each one writes, for the dark and the light theme, the whole window and the whole
// content of the inspector (all of it, not only the part that fits the window), plus the window at its minimum size in the dark
// theme. It also lints the item tree of every capture (text that is truncated, items cut off at the edge of the panel they sit in,
// controls narrower than their content) and writes everything it found to tour.json.

#include <QObject>
#include <QString>

class QQuickWindow;

namespace craft::app {

class AppController;

struct UiTourOptions {
  QString importPath;
  QString badStlPath;     // a file the importer rejects, for the error state
  QString outputDirectory;
};

class UiTour : public QObject {
 public:
  UiTour(AppController& app, QQuickWindow* window, UiTourOptions options);
  ~UiTour() override;
  /// Runs the whole tour (blocking inside nested event loops, as QTest::qWait does) and quits the application.
  void start();

 private:
  struct Impl;
  Impl* impl_;
};

}  // namespace craft::app
