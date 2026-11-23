#include "GeometryWorker.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>

#include <chrono>
#include <cstdio>
#include <thread>
#include <vector>

namespace craft::app {

namespace {

void progressLine(const QString& stage, double fraction) {
  std::fprintf(stdout, "PROGRESS %s %.4f\n", stage.toUtf8().constData(), fraction);
  std::fflush(stdout);
}

bool writeResult(const QString& resultFile, const QByteArray& bytes) {
  const QString temporary = resultFile + QStringLiteral(".part");
  QFile file(temporary);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate) || file.write(bytes) != bytes.size()) return false;
  file.close();
  QFile::remove(resultFile);
  return QFile::rename(temporary, resultFile);
}

}  // namespace

int runGeometryWorker(const QString& jobFile, const QString& resultFile) {
  QFile in(jobFile);
  if (!in.open(QIODevice::ReadOnly)) {
    std::fprintf(stderr, "The job file could not be read: %s\n", jobFile.toUtf8().constData());
    return 2;
  }
  QJsonParseError parseError;
  const QJsonDocument doc = QJsonDocument::fromJson(in.readAll(), &parseError);
  if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
    std::fprintf(stderr, "The job file is not valid JSON.\n");
    return 2;
  }
  const QJsonObject job = doc.object();
  const QString kind = job.value(QStringLiteral("kind")).toString();

  if (kind == QLatin1String("echo")) {
    progressLine(QStringLiteral("echo"), 1.0);
    QJsonObject out;
    out.insert(QStringLiteral("echo"), job.value(QStringLiteral("payload")));
    return writeResult(resultFile, QJsonDocument(out).toJson(QJsonDocument::Compact)) ? 0 : 3;
  }
  if (kind == QLatin1String("spin")) {
    // Holds `megabytes` of touched memory and burns CPU for `milliseconds`, reporting as it goes: stands in for a long Boolean.
    const std::size_t bytes = static_cast<std::size_t>(job.value(QStringLiteral("megabytes")).toInt(0)) << 20;
    const int milliseconds = job.value(QStringLiteral("milliseconds")).toInt(1000);
    std::vector<unsigned char> held(bytes);
    for (std::size_t i = 0; i < bytes; i += 4096) held[i] = 1;
    const auto start = std::chrono::steady_clock::now();
    volatile unsigned long long sink = 0;
    for (;;) {
      const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
      if (elapsed >= milliseconds) break;
      for (int i = 0; i < 200000; ++i) sink = sink + static_cast<unsigned long long>(i);
      progressLine(QStringLiteral("spinning"), static_cast<double>(elapsed) / milliseconds);
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    return writeResult(resultFile, QByteArray("{\"done\":true}")) ? 0 : 3;
  }
  std::fprintf(stderr, "Unknown job kind: %s\n", kind.toUtf8().constData());
  return 2;
}

// --- launcher -------------------------------------------------------------------------------------------------------------------------------

WorkerProcess::WorkerProcess(QString executable, QObject* parent) : QObject(parent), executable_(std::move(executable)) {
  qRegisterMetaType<craft::app::WorkerOutcome>();
  connect(&process_, &QProcess::readyReadStandardOutput, this, &WorkerProcess::onReadyRead);
  connect(&process_, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this, &WorkerProcess::onFinished);
}

WorkerProcess::~WorkerProcess() {
  // Never leave a worker behind: a destroyed launcher means nobody will read its result.
  if (process_.state() != QProcess::NotRunning) {
    process_.kill();
    process_.waitForFinished(5000);
  }
}

bool WorkerProcess::start(const QByteArray& jobJson) {
  dir_ = std::make_unique<QTemporaryDir>();
  if (!dir_->isValid()) return false;
  const QString jobPath = QDir(dir_->path()).filePath(QStringLiteral("job.json"));
  resultPath_ = QDir(dir_->path()).filePath(QStringLiteral("result.bin"));
  QFile job(jobPath);
  if (!job.open(QIODevice::WriteOnly) || job.write(jobJson) != jobJson.size()) return false;
  job.close();
  cancelled_ = false;
  reported_ = false;
  pending_.clear();
  process_.setProcessChannelMode(QProcess::SeparateChannels);
  process_.start(executable_, {QStringLiteral("--geometry-worker"), jobPath, resultPath_});
  return process_.waitForStarted(10000);
}

void WorkerProcess::cancel() {
  if (process_.state() == QProcess::NotRunning) return;
  cancelled_ = true;
  process_.kill();   // TerminateProcess: the system frees the whole address space at once
}

void WorkerProcess::onReadyRead() {
  pending_ += process_.readAllStandardOutput();
  qsizetype newline;
  while ((newline = pending_.indexOf('\n')) >= 0) {
    const QByteArray line = pending_.left(newline).trimmed();
    pending_.remove(0, newline + 1);
    if (!line.startsWith("PROGRESS ")) continue;
    const QList<QByteArray> parts = line.mid(9).split(' ');
    if (parts.size() == 2) emit progress(QString::fromUtf8(parts[0]), parts[1].toDouble());
  }
}

void WorkerProcess::onFinished(int exitCode, QProcess::ExitStatus status) {
  if (reported_) return;
  reported_ = true;
  WorkerOutcome outcome;
  outcome.exitCode = exitCode;
  outcome.message = QString::fromUtf8(process_.readAllStandardError()).trimmed();
  if (cancelled_) {
    outcome.state = WorkerOutcome::State::Cancelled;
    outcome.message = QStringLiteral("The job was cancelled and its process was stopped.");
  } else if (status == QProcess::CrashExit) {
    outcome.state = WorkerOutcome::State::Crashed;
    if (outcome.message.isEmpty()) outcome.message = QStringLiteral("The geometry process ended unexpectedly.");
  } else if (exitCode != 0) {
    outcome.state = WorkerOutcome::State::Failed;
    if (outcome.message.isEmpty()) outcome.message = QStringLiteral("The geometry process failed (exit code %1).").arg(exitCode);
  } else {
    QFile result(resultPath_);
    if (result.open(QIODevice::ReadOnly)) {
      outcome.result = result.readAll();
      outcome.state = WorkerOutcome::State::Succeeded;
    } else {
      outcome.state = WorkerOutcome::State::Failed;
      outcome.message = QStringLiteral("The geometry process finished without a result.");
    }
  }
  dir_.reset();
  emit finished(outcome);
}

}  // namespace craft::app
