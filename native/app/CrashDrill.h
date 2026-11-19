#pragma once

// Two halves of a crash-recovery drill with a REAL operating-system kill (docs/native-migration, R-Project-3).
// Development tooling: only built with the tests (CRAFT_BUILD_TESTS), never part of a packaged application.
//
//   craft --crash-victim ready.json --import part.stl
//       Imports the part, then keeps editing it (the cavity clearance, cycling through a fixed set of values) with a very short autosave
//       interval, so an autosave is being written almost all the time. Once the first autosave exists it writes ready.json and carries
//       on until it is killed from outside (TerminateProcess): it never exits by itself.
//   craft --recover-probe summary.json
//       Starts like the application after a crash would: it lists what the autosave folder holds, opens the first recovery offer
//       the way the Recover dialog does, and writes what it found (the offers, every file in the folder, the recovered project).
//
// scripts/native/crash-drill.ps1 runs the pair many times, killing the victim at random moments, and checks every recovery.

#include <QObject>
#include <QString>

namespace craft::app {

class AppController;

enum class DrillRole { Victim, Probe };

struct CrashDrillOptions {
  DrillRole role = DrillRole::Victim;
  QString importPath;  // victim: the part to edit
  QString file;        // victim: the ready file to write; probe: the summary to write
};

class CrashDrill : public QObject {
 public:
  CrashDrill(AppController& app, CrashDrillOptions options);
  ~CrashDrill() override;
  void start();

 private:
  struct Impl;
  Impl* impl_;
};

/// The values the victim cycles the cavity clearance through: a recovered project must hold one of them.
inline constexpr int kCrashDrillClearanceSteps = 40;
inline double crashDrillClearanceMm(int step) { return 0.1 * (1 + step % kCrashDrillClearanceSteps); }

}  // namespace craft::app
