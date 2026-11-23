#pragma once

// Out-of-process geometry jobs (P0-5, docs/native-migration/PROCESS_ISOLATION_DESIGN.md, phase 1).
//
// A Boolean inside the kernel cannot be interrupted, and a thread cannot be killed safely, so a cancelled job keeps running and keeps its memory.
// A separate process can be killed and the system then frees everything. Craft.exe in "--geometry-worker <job> <result>" mode is that process.
//
// Protocol: the job file is JSON with a "kind"; the worker writes progress lines "PROGRESS <stage> <fraction>" to stdout, then the result file
// (written to a temporary name and renamed, so a result file is never half written), and exits 0. A job it does not know, or a failure, exits non-zero
// with a message on stderr. Phase 1 has two self-test kinds ("echo" and "spin") that prove the mechanism; the real jobs arrive in later phases.

#include <QByteArray>
#include <QObject>
#include <QProcess>
#include <QString>
#include <QTemporaryDir>

#include <memory>

namespace craft::app {

/// The worker side. Runs in the child process; returns the process exit code.
int runGeometryWorker(const QString& jobFile, const QString& resultFile);

struct WorkerOutcome {
  enum class State { Succeeded, Failed, Cancelled, Crashed };
  State state = State::Failed;
  QString message;       // the worker's error message, or why it was stopped
  QString errorCode;     // the worker's error code ("ERROR <code>" line), when it reported one
  int exitCode = -1;
  QByteArray result;     // the result file's contents when Succeeded
};

/// The launching side: one job per object. cancel() kills the process; the outcome is then Cancelled.
class WorkerProcess : public QObject {
  Q_OBJECT
 public:
  explicit WorkerProcess(QString executable, QObject* parent = nullptr);
  ~WorkerProcess() override;

  /// Writes the job file and starts the worker. False (and `finished` is not emitted) if it could not be started.
  bool start(const QByteArray& jobJson, const QByteArray& payload = {});
  void cancel();
  bool running() const { return process_.state() != QProcess::NotRunning; }
  qint64 processId() const { return process_.processId(); }

 signals:
  void progress(QString stage, double fraction);
  void stageLine(QString line);   // "name<TAB>detail<TAB>elapsedMs" for the log
  void finished(craft::app::WorkerOutcome outcome);

 private:
  void onReadyRead();
  void onReadyReadError();
  void onFinished(int exitCode, QProcess::ExitStatus status);

  QString executable_;
  QProcess process_;
  std::unique_ptr<QTemporaryDir> dir_;
  QString resultPath_;
  QByteArray pending_, pendingError_, errorText_;
  bool cancelled_ = false;
  bool reported_ = false;
};

}  // namespace craft::app

Q_DECLARE_METATYPE(craft::app::WorkerOutcome)
