#include "GeometryWorker.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>

#include <chrono>
#include <cstdio>
#include <exception>
#include <functional>
#include <span>
#include <thread>
#include <vector>

#include "ManifoldMeshEngine.h"
#include "contracts/Operation.h"
#include "master/MasterMoldStore.h"
#include "master/MasterWire.h"
#include "mold/MoldWire.h"

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

namespace {

/// A failure the launcher can show: "ERROR <code>\t<message>" on stderr, exit code 4.
int reportFailure(const std::string& code, const std::string& message) {
  std::fprintf(stderr, "ERROR %s\t%s\n", code.c_str(), message.c_str());
  return 4;
}

/// Runs one wire-format job: reads "payload.bin" beside the job file, hands its bytes to `body`, writes what it returns as the result. Every
/// failure becomes an "ERROR" line and a non-zero exit code (the launcher shows the code and the message).
int runWireJob(const QString& jobFile, const QString& resultFile, const std::function<std::vector<std::uint8_t>(std::span<const std::uint8_t>)>& body) {
  try {
    QFile payload(QFileInfo(jobFile).dir().filePath(QStringLiteral("payload.bin")));
    if (!payload.open(QIODevice::ReadOnly)) return reportFailure("worker_payload_missing", "The job's request file could not be read.");
    const QByteArray bytes = payload.readAll();
    const std::vector<std::uint8_t> out = body({reinterpret_cast<const std::uint8_t*>(bytes.constData()), static_cast<std::size_t>(bytes.size())});
    return writeResult(resultFile, QByteArray(reinterpret_cast<const char*>(out.data()), static_cast<qsizetype>(out.size()))) ? 0 : 3;
  } catch (const WireError& e) {
    return reportFailure("worker_wire_error", e.what());
  } catch (const CodedError& e) {
    return reportFailure(e.code(), e.what());
  } catch (const std::bad_alloc&) {
    return reportFailure("worker_out_of_memory", "The geometry process ran out of memory.");
  } catch (const std::exception& e) {
    return reportFailure("worker_exception", e.what());
  }
}

int runMasterMoldJob(const QString& jobFile, const QString& resultFile) {
  return runWireJob(jobFile, resultFile, [](std::span<const std::uint8_t> bytes) {
    const MasterMoldRequest request = decodeMasterMoldRequest(bytes);
    auto engine = createManifoldMeshEngine();
    MasterMoldEngineHooks hooks;   // no cancel token: cancelling means killing this process
    hooks.onStage = [](const MasterMoldProgressStage& stage) {
      progressLine(QString::fromStdString(stage.stage), (stage.stageIndex + 1.0) / stage.stageCount);
      std::fprintf(stderr, "STAGE %s\t%s\t%lld\n", stage.stage.c_str(), stage.detail.value_or(std::string()).c_str(), static_cast<long long>(stage.elapsedMs));
      std::fflush(stderr);
    };
    return encodeMasterMoldResult(evaluateMasterMoldGeneration(*engine, request, hooks));
  });
}

/// Mold generation and the derived evaluation (sprues, registration), as one job like the in-process one. The sprue cache comes in with the request and
/// goes back out with the result.
int runMoldJob(const QString& jobFile, const QString& resultFile) {
  return runWireJob(jobFile, resultFile, [](std::span<const std::uint8_t> bytes) {
    MoldWorkerRequest request = decodeMoldWorkerRequest(bytes);
    auto engine = createManifoldMeshEngine();
    SprueResultCache cache;
    cache.replaceAll(std::move(request.sprueCache));
    const ProgressCallback progress = [](const std::string& stage, double fraction) { progressLine(QString::fromStdString(stage), fraction); };
    const CancellationToken noToken;   // cancelling means killing this process
    MoldWorkerResult result;
    result.mold = generateMold(*engine, request.request, noToken, progress);
    result.derived = evaluateDerivedMold(*engine, result.mold, std::move(request.sprueIntents), progress, &cache);
    result.sprueCache = cache.snapshot();
    return encodeMoldWorkerResult(result);
  });
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
  if (kind == QLatin1String("master-mold")) return runMasterMoldJob(jobFile, resultFile);
  if (kind == QLatin1String("mold")) return runMoldJob(jobFile, resultFile);
  std::fprintf(stderr, "Unknown job kind: %s\n", kind.toUtf8().constData());
  return 2;
}

// --- launcher -------------------------------------------------------------------------------------------------------------------------------

WorkerProcess::WorkerProcess(QString executable, QObject* parent) : QObject(parent), executable_(std::move(executable)) {
  qRegisterMetaType<craft::app::WorkerOutcome>();
  connect(&process_, &QProcess::readyReadStandardOutput, this, &WorkerProcess::onReadyRead);
  connect(&process_, &QProcess::readyReadStandardError, this, &WorkerProcess::onReadyReadError);
  connect(&process_, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this, &WorkerProcess::onFinished);
}

WorkerProcess::~WorkerProcess() {
  // Never leave a worker behind: a destroyed launcher means nobody will read its result.
  if (process_.state() != QProcess::NotRunning) {
    process_.kill();
    process_.waitForFinished(5000);
  }
}

bool WorkerProcess::start(const QByteArray& jobJson, const QByteArray& payload) {
  dir_ = std::make_unique<QTemporaryDir>();
  if (!dir_->isValid()) return false;
  const QString jobPath = QDir(dir_->path()).filePath(QStringLiteral("job.json"));
  resultPath_ = QDir(dir_->path()).filePath(QStringLiteral("result.bin"));
  QFile job(jobPath);
  if (!job.open(QIODevice::WriteOnly) || job.write(jobJson) != jobJson.size()) return false;
  job.close();
  if (!payload.isEmpty()) {   // the worker reads "payload.bin" from the job file's own folder
    QFile data(QDir(dir_->path()).filePath(QStringLiteral("payload.bin")));
    if (!data.open(QIODevice::WriteOnly) || data.write(payload) != payload.size()) return false;
    data.close();
  }
  cancelled_ = false;
  reported_ = false;
  pending_.clear();
  pendingError_.clear();
  errorText_.clear();
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

// stderr carries "STAGE name<TAB>detail<TAB>ms" lines (passed on for the log), one "ERROR code<TAB>message" line on failure, and anything else
// the process wrote (kept as the message when there is no ERROR line).
void WorkerProcess::onReadyReadError() {
  pendingError_ += process_.readAllStandardError();
  qsizetype newline;
  while ((newline = pendingError_.indexOf('\n')) >= 0) {
    const QByteArray line = pendingError_.left(newline).trimmed();
    pendingError_.remove(0, newline + 1);
    if (line.startsWith("STAGE ")) emit stageLine(QString::fromUtf8(line.mid(6)));
    else if (!line.isEmpty()) errorText_ += line + '\n';
  }
}

void WorkerProcess::onFinished(int exitCode, QProcess::ExitStatus status) {
  if (reported_) return;
  reported_ = true;
  onReadyRead();
  onReadyReadError();
  if (!pendingError_.trimmed().isEmpty()) errorText_ += pendingError_.trimmed() + '\n';
  WorkerOutcome outcome;
  outcome.exitCode = exitCode;
  outcome.message = QString::fromUtf8(errorText_).trimmed();
  for (const QByteArray& line : errorText_.split('\n')) {
    if (!line.startsWith("ERROR ")) continue;
    const QByteArray body = line.mid(6);
    const qsizetype tab = body.indexOf('\t');
    if (tab > 0) {
      outcome.errorCode = QString::fromUtf8(body.left(tab));
      outcome.message = QString::fromUtf8(body.mid(tab + 1));
    }
    break;
  }
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
