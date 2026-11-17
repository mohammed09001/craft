#include "AnalysisWorkerClient.h"

#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QProcessEnvironment>

#include "AnalysisProtocol.h"

namespace craft::analysis {

WorkerClient::WorkerClient(WorkerConfig config, QObject* parent)
    : QObject(parent), config_(std::move(config)) {
  timeout_.setSingleShot(true);
  connect(&timeout_, &QTimer::timeout, this, [this] {
    const QString what = handshakeDone_ ? QStringLiteral("The analysis job timed out.")
                                        : QStringLiteral("The analysis worker did not start in time.");
    const QString jobId = activeJobId_;
    activeJobId_.clear();
    pendingRequest_.clear();
    stopProcess();
    if (!jobId.isEmpty()) emit jobFailed(jobId, QLatin1String(kErrorTimeout), what);
  });

  connect(&process_, &QProcess::readyReadStandardOutput, this, &WorkerClient::handleStdout);
  connect(&process_, &QProcess::readyReadStandardError, this, [this] {
    const QList<QByteArray> lines = process_.readAllStandardError().split('\n');
    for (const QByteArray& line : lines) {
      const QString text = QString::fromUtf8(line).trimmed();
      if (!text.isEmpty()) emit workerLog(text);
    }
  });
  connect(&process_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
    if (error == QProcess::FailedToStart) {
      handleProcessGone(QLatin1String(kErrorRuntimeMissing),
                        QStringLiteral("The Python analysis runtime could not be started (%1).")
                            .arg(config_.pythonExecutable));
    }
  });
  connect(&process_, &QProcess::finished, this, [this](int exitCode, QProcess::ExitStatus status) {
    handleProcessGone(QLatin1String(kErrorWorkerCrashed),
                      status == QProcess::CrashExit
                          ? QStringLiteral("The analysis worker crashed.")
                          : QStringLiteral("The analysis worker exited unexpectedly (code %1).")
                                .arg(exitCode));
  });
}

WorkerClient::~WorkerClient() { stopProcess(); }

QString WorkerClient::startJob(const QString& command, const QJsonObject& params) {
  const QString jobId = QStringLiteral("analysis-job-%1").arg(nextJobNumber_++);

  // Failures are queued so callers always see the id before any signal.
  const auto failLater = [this, jobId](const char* code, const QString& message) {
    QMetaObject::invokeMethod(
        this, [this, jobId, code, message] { emit jobFailed(jobId, QLatin1String(code), message); },
        Qt::QueuedConnection);
  };

  if (isBusy()) {
    failLater(kErrorBusy, QStringLiteral("Another analysis job is already running."));
    return jobId;
  }
  if (config_.pythonExecutable.isEmpty() || !QFileInfo::exists(config_.pythonExecutable)) {
    failLater(kErrorRuntimeMissing,
              QStringLiteral("No Python analysis runtime is available. Expected a bundled runtime "
                             "next to the application or the CRAFT_PYTHON environment variable."));
    return jobId;
  }
  if (!QFileInfo::exists(config_.workerScript)) {
    failLater(kErrorRuntimeMissing,
              QStringLiteral("The analysis worker script is missing: %1").arg(config_.workerScript));
    return jobId;
  }

  QJsonObject request{{QStringLiteral("type"), QStringLiteral("request")},
                      {QStringLiteral("protocolVersion"), kProtocolVersion},
                      {QStringLiteral("jobId"), jobId},
                      {QStringLiteral("command"), command},
                      {QStringLiteral("params"), params}};
  activeJobId_ = jobId;
  pendingRequest_ = QJsonDocument(request).toJson(QJsonDocument::Compact) + '\n';

  ensureStarted();
  if (handshakeDone_) sendPending();
  return jobId;
}

void WorkerClient::cancel(const QString& jobId) {
  if (jobId.isEmpty() || jobId != activeJobId_) return;
  activeJobId_.clear();
  pendingRequest_.clear();
  timeout_.stop();
  stopProcess();
  emit jobCancelled(jobId);
}

void WorkerClient::shutdown() {
  activeJobId_.clear();
  pendingRequest_.clear();
  timeout_.stop();
  stopProcess();
}

void WorkerClient::ensureStarted() {
  if (process_.state() != QProcess::NotRunning) return;
  handshakeDone_ = false;
  stdoutBuffer_.clear();

  QProcessEnvironment environment = QProcessEnvironment::systemEnvironment();
  environment.remove(QStringLiteral("PYTHONHOME"));
  QStringList pythonPath = config_.pythonPath;
  const QString inherited = environment.value(QStringLiteral("PYTHONPATH"));
  if (!inherited.isEmpty()) pythonPath << inherited;
  environment.insert(QStringLiteral("PYTHONPATH"), pythonPath.join(QDir::listSeparator()));
  environment.insert(QStringLiteral("PYTHONNOUSERSITE"), QStringLiteral("1"));
  // Never litter the source tree (or a read-only install) with __pycache__.
  environment.insert(QStringLiteral("PYTHONDONTWRITEBYTECODE"), QStringLiteral("1"));
  environment.insert(QStringLiteral("PYTHONUTF8"), QStringLiteral("1"));
  process_.setProcessEnvironment(environment);

  process_.setProgram(config_.pythonExecutable);
  process_.setArguments({QStringLiteral("-u"), config_.workerScript});
  timeout_.start(config_.startupTimeoutMs);
  process_.start(QIODevice::ReadWrite);
}

void WorkerClient::sendPending() {
  if (pendingRequest_.isEmpty()) return;
  process_.write(pendingRequest_);
  pendingRequest_.clear();
  timeout_.start(config_.jobTimeoutMs);
}

void WorkerClient::handleStdout() {
  stdoutBuffer_ += process_.readAllStandardOutput();
  for (;;) {
    const qsizetype newline = stdoutBuffer_.indexOf('\n');
    if (newline < 0) break;
    const QByteArray line = stdoutBuffer_.left(newline).trimmed();
    stdoutBuffer_.remove(0, newline + 1);
    if (!line.isEmpty()) handleLine(line);
  }
}

void WorkerClient::handleLine(const QByteArray& line) {
  QJsonParseError parseError;
  const QJsonDocument document = QJsonDocument::fromJson(line, &parseError);
  if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
    emit workerLog(QStringLiteral("Ignored non-protocol output: %1").arg(QString::fromUtf8(line)));
    return;
  }
  const QJsonObject message = document.object();
  const QString type = message.value(QStringLiteral("type")).toString();

  if (type == QLatin1String("hello")) {
    if (message.value(QStringLiteral("protocol")).toString() != QLatin1String(kProtocolName) ||
        message.value(QStringLiteral("protocolVersion")).toInt(-1) != kProtocolVersion) {
      const QString detail =
          QStringLiteral("Worker announced %1 v%2; the application requires %3 v%4.")
              .arg(message.value(QStringLiteral("protocol")).toString())
              .arg(message.value(QStringLiteral("protocolVersion")).toInt(-1))
              .arg(QLatin1String(kProtocolName))
              .arg(kProtocolVersion);
      const QString jobId = activeJobId_;
      activeJobId_.clear();
      pendingRequest_.clear();
      timeout_.stop();
      stopProcess();
      if (!jobId.isEmpty()) emit jobFailed(jobId, QLatin1String(kErrorProtocolMismatch), detail);
      return;
    }
    hello_ = message;
    handshakeDone_ = true;
    timeout_.stop();
    emit workerReady(hello_);
    sendPending();
    return;
  }

  // Strict job matching: anything not addressed to the active job is stale.
  const QString jobId = message.value(QStringLiteral("jobId")).toString();
  if (jobId.isEmpty() || jobId != activeJobId_) {
    emit workerLog(QStringLiteral("Ignored stale %1 message for job '%2'.").arg(type, jobId));
    return;
  }

  if (type == QLatin1String("progress")) {
    emit jobProgress(jobId, message.value(QStringLiteral("stage")).toString(),
                     message.value(QStringLiteral("fraction")).toDouble());
  } else if (type == QLatin1String("result")) {
    activeJobId_.clear();
    timeout_.stop();
    emit jobSucceeded(jobId, message);
  } else if (type == QLatin1String("error")) {
    activeJobId_.clear();
    timeout_.stop();
    emit jobFailed(jobId, message.value(QStringLiteral("code")).toString(),
                   message.value(QStringLiteral("message")).toString());
  }
}

void WorkerClient::handleProcessGone(const QString& code, const QString& message) {
  handshakeDone_ = false;
  if (activeJobId_.isEmpty()) return;
  timeout_.stop();
  failActive(code, message);
}

void WorkerClient::failActive(const QString& code, const QString& message) {
  const QString jobId = activeJobId_;
  activeJobId_.clear();
  pendingRequest_.clear();
  emit jobFailed(jobId, code, message);
}

void WorkerClient::stopProcess() {
  handshakeDone_ = false;
  if (process_.state() == QProcess::NotRunning) return;
  // Callers clear the active job first, so the finished() handler stays quiet.
  process_.kill();
  process_.waitForFinished(3000);
}

}  // namespace craft::analysis
