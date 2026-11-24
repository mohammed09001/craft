#include <QElapsedTimer>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSignalSpy>
#include <QtTest>

#ifdef Q_OS_WIN
#include <windows.h>
#endif

#include "GeometryWorker.h"
#include "ManifoldMeshEngine.h"
#include "MasterTestRequests.h"
#include "master/MasterMoldStore.h"
#include "master/MasterWire.h"
#include "MoldTestRequests.h"
#include "mold/MoldWire.h"

using craft::app::WorkerOutcome;
using craft::app::WorkerProcess;

namespace {

WorkerOutcome runToEnd(WorkerProcess& worker, int timeoutMs = 30000) {
  QSignalSpy spy(&worker, &WorkerProcess::finished);
  if (!spy.wait(timeoutMs)) return {};
  return qvariant_cast<WorkerOutcome>(spy.takeFirst().at(0));
}

/// True while a process with this id still exists.
bool processExists(qint64 pid) {
#ifdef Q_OS_WIN
  HANDLE h = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, static_cast<DWORD>(pid));
  if (!h) return false;
  const bool alive = WaitForSingleObject(h, 0) == WAIT_TIMEOUT;
  CloseHandle(h);
  return alive;
#else
  Q_UNUSED(pid);
  return false;
#endif
}

}  // namespace

class TstGeometryWorker : public QObject {
  Q_OBJECT
 private slots:
  void aJobRunsInAnotherProcessAndReturnsItsResult() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QVERIFY(worker.start(R"({"kind":"echo","payload":{"a":[1,2,3],"b":"text"}})"));
    const qint64 pid = worker.processId();
    QVERIFY(pid > 0);
    QVERIFY(pid != static_cast<qint64>(QCoreApplication::applicationPid()));
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Succeeded);
    const QJsonObject result = QJsonDocument::fromJson(outcome.result).object();
    QCOMPARE(result.value("echo").toObject().value("b").toString(), QString("text"));
    QCOMPARE(result.value("echo").toObject().value("a").toArray().size(), 3);
  }

  void progressArrivesWhileTheJobRuns() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QVERIFY(worker.start(R"({"kind":"spin","megabytes":8,"milliseconds":600})"));
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Succeeded);
    QVERIFY2(progress.count() >= 3, qPrintable(QString("only %1 progress reports").arg(progress.count())));
    QCOMPARE(progress.first().at(0).toString(), QString("spinning"));
  }

  // The point of the whole design: a cancel ends the work for real. The job holds 400 MiB and would burn CPU for a minute; after cancel() the
  // process must be gone within a few seconds, not at the end of its work.
  void cancelKillsTheProcessAndTheWorkWithIt() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QVERIFY(worker.start(R"({"kind":"spin","megabytes":400,"milliseconds":60000})"));
    const qint64 pid = worker.processId();
    QVERIFY(progress.wait(20000));            // it is really running
    QVERIFY(processExists(pid));
    QElapsedTimer timer;
    timer.start();
    worker.cancel();
    const WorkerOutcome outcome = runToEnd(worker, 15000);
    QCOMPARE(outcome.state, WorkerOutcome::State::Cancelled);
    QVERIFY2(timer.elapsed() < 5000, qPrintable(QString("took %1 ms").arg(timer.elapsed())));
    QVERIFY2(!processExists(pid), "the worker process is still alive after cancel");
  }

  // --- the real Master Mold job -------------------------------------------------------------------------------------------------

  // The result that comes back from the other process is the result the engine gives in this one.
  void aMasterMoldJobGivesTheSameResultAsRunningItHere_data() {
    QTest::addColumn<int>("rings");
    QTest::newRow("a sphere (two masters)") << 12;
    QTest::newRow("a sphere with the printer too small (a failure)") << -12;
  }
  void aMasterMoldJobGivesTheSameResultAsRunningItHere() {
    QFETCH(int, rings);
    const craft::MasterMoldRequest request = craft::testing::masterRequestForMesh(craft::testing::masterTestSphere(20, std::abs(rings), 32), "sphere",
                                                                                   rings < 0 ? std::optional<craft::Point3>{craft::Point3{10, 10, 10}} : std::nullopt);
    auto engine = craft::createManifoldMeshEngine();
    const craft::MasterMoldResult here = craft::evaluateMasterMoldGeneration(*engine, request);

    const std::vector<std::uint8_t> payload = craft::encodeMasterMoldRequest(request);
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QSignalSpy stages(&worker, &WorkerProcess::stageLine);
    QVERIFY(worker.start(R"({"kind":"master-mold"})", QByteArray(reinterpret_cast<const char*>(payload.data()), static_cast<qsizetype>(payload.size()))));
    const WorkerOutcome outcome = runToEnd(worker, 120000);
    QCOMPARE(outcome.state, WorkerOutcome::State::Succeeded);
    QVERIFY(progress.count() >= 1);
    QVERIFY(stages.count() >= 1);
    const craft::MasterMoldResult there = craft::decodeMasterMoldResult({reinterpret_cast<const std::uint8_t*>(outcome.result.constData()), static_cast<std::size_t>(outcome.result.size())});

    QCOMPARE(there.outcome.code, here.outcome.code);
    QCOMPARE(there.outcome.success(), rings > 0);
    if (here.outcome.success()) {
      QCOMPARE(there.outcome.plan->fingerprint, here.outcome.plan->fingerprint);
      for (int i = 0; i < craft::kMasterToolCount; ++i) {
        const auto k = static_cast<std::size_t>(i);
        QCOMPARE(there.outcome.plan->masters[k].mesh.positions, here.outcome.plan->masters[k].mesh.positions);
        QCOMPARE(there.outcome.plan->masters[k].mesh.indices, here.outcome.plan->masters[k].mesh.indices);
      }
    } else {
      QCOMPARE(there.outcome.failure->message, here.outcome.failure->message);
    }
  }

  void aMissingRequestIsReportedWithACode() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QVERIFY(worker.start(R"({"kind":"master-mold"})"));   // no payload at all
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Failed);
    QCOMPARE(outcome.errorCode, QString("worker_payload_missing"));
  }

  // A real Master Mold on a part that takes seconds in Release (a 57,000-triangle sphere): cancelling ends it at once, with its memory.
  void cancellingARealMasterMoldJobStopsItAtOnce() {
    const craft::MasterMoldRequest request = craft::testing::masterRequestForMesh(craft::testing::masterTestSphere(30, 120, 240), "dense-sphere");
    const std::vector<std::uint8_t> payload = craft::encodeMasterMoldRequest(request);
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QVERIFY(worker.start(R"({"kind":"master-mold"})", QByteArray(reinterpret_cast<const char*>(payload.data()), static_cast<qsizetype>(payload.size()))));
    const qint64 pid = worker.processId();
    QVERIFY(progress.wait(60000));            // it has started working on the part
    QVERIFY(processExists(pid));
    QElapsedTimer timer;
    timer.start();
    worker.cancel();
    const WorkerOutcome outcome = runToEnd(worker, 15000);
    // The part may finish before the cancel on a fast machine; then there is nothing to cancel and the test has nothing to say.
    if (outcome.state == WorkerOutcome::State::Succeeded) QSKIP("the job finished before it could be cancelled");
    QCOMPARE(outcome.state, WorkerOutcome::State::Cancelled);
    QVERIFY2(timer.elapsed() < 5000, qPrintable(QString("took %1 ms").arg(timer.elapsed())));
    QVERIFY(!processExists(pid));
  }

  void aFailingJobReportsItsMessage() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QVERIFY(worker.start(R"({"kind":"nonsense"})"));
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Failed);
    QVERIFY(outcome.message.contains("Unknown job kind"));
    QVERIFY(outcome.result.isEmpty());
  }

  void aWorkerKilledFromOutsideIsNeitherCancelledNorSucceeded() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QVERIFY(worker.start(R"({"kind":"spin","megabytes":8,"milliseconds":60000})"));
    QVERIFY(progress.wait(20000));
#ifdef Q_OS_WIN
    HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, static_cast<DWORD>(worker.processId()));
    QVERIFY(h);
    TerminateProcess(h, 1);
    CloseHandle(h);
#endif
    const WorkerOutcome outcome = runToEnd(worker, 15000);
    QVERIFY(outcome.state == WorkerOutcome::State::Crashed || outcome.state == WorkerOutcome::State::Failed);
    QVERIFY(outcome.result.isEmpty());
  }

  void destroyingTheLauncherDoesNotLeaveAWorkerBehind() {
    qint64 pid = 0;
    {
      WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
      QSignalSpy progress(&worker, &WorkerProcess::progress);
      QVERIFY(worker.start(R"({"kind":"spin","megabytes":8,"milliseconds":60000})"));
      pid = worker.processId();
      QVERIFY(progress.wait(20000));
    }
    QVERIFY2(!processExists(pid), "the worker outlived its launcher");
  }
};

QTEST_MAIN(TstGeometryWorker)
#include "tst_geometry_worker.moc"
