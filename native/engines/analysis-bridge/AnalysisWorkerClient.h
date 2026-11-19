#pragma once

// Host side of the local Python analysis bridge.
//
// Owns one child process (QProcess) running craft_analysis_worker.py and
// speaks JSON Lines over its stdin/stdout. Nothing listens on a network
// interface. The worker is crash-isolated from the application: a crash,
// hang, or cancel only ever kills the child, which is restarted lazily on the
// next request.

#include <QJsonObject>
#include <QObject>
#include <QProcess>
#include <QString>
#include <QStringList>
#include <QTimer>

namespace craft::analysis {

struct WorkerConfig {
  QString pythonExecutable;    // empty => every job fails with analysis_runtime_missing
  QString workerScript;
  QStringList pythonPath;      // prepended to PYTHONPATH (engine sources / bundled site)
  QString kernelsLibrary;      // native numerical kernels (CRAFT_ANALYSIS_KERNELS for the worker); empty or missing => the worker runs the Python loops
  int startupTimeoutMs = 20000;
  int jobTimeoutMs = 120000;
};

class WorkerClient : public QObject {
  Q_OBJECT

 public:
  explicit WorkerClient(WorkerConfig config, QObject* parent = nullptr);
  ~WorkerClient() override;

  /// Starts a job and returns its id. Only one job runs at a time; a second
  /// request while busy fails immediately with "analysis_busy". Results are
  /// always delivered asynchronously through the signals below.
  /// `jobTimeoutMs` overrides WorkerConfig::jobTimeoutMs for this job when positive (long analyses).
  QString startJob(const QString& command, const QJsonObject& params, int jobTimeoutMs = 0);

  /// Hard cancel: terminates the worker process. Emits jobCancelled.
  void cancel(const QString& jobId);

  bool isBusy() const { return !activeJobId_.isEmpty(); }
  bool isWorkerRunning() const { return process_.state() != QProcess::NotRunning; }
  /// The worker's hello message (protocol + engine + Python version), empty
  /// until a worker has started successfully.
  QJsonObject workerInfo() const { return hello_; }

  void shutdown();

 signals:
  void workerReady(const QJsonObject& hello);
  void jobProgress(const QString& jobId, const QString& stage, double fraction);
  /// `message` is the full result envelope (report, elapsedMs, echoed ids).
  void jobSucceeded(const QString& jobId, const QJsonObject& message);
  void jobFailed(const QString& jobId, const QString& code, const QString& message);
  void jobCancelled(const QString& jobId);
  void workerLog(const QString& line);

 private:
  void ensureStarted();
  void sendPending();
  void handleStdout();
  void handleLine(const QByteArray& line);
  void handleProcessGone(const QString& code, const QString& message);
  void failActive(const QString& code, const QString& message);
  void stopProcess();

  WorkerConfig config_;
  QProcess process_;
  QTimer timeout_;
  QByteArray stdoutBuffer_;
  QJsonObject hello_;
  bool handshakeDone_ = false;
  QString activeJobId_;
  QByteArray pendingRequest_;
  int activeJobTimeoutMs_ = 0;
  quint64 nextJobNumber_ = 1;
};

}  // namespace craft::analysis
