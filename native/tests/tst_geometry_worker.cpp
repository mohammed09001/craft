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
    QTest::addColumn<QString>("name");
    QTest::newRow("c-extrusion") << "c-extrusion";
    QTest::newRow("c-assembly (blocked)") << "c-assembly";
  }
  void aMasterMoldJobGivesTheSameResultAsRunningItHere() {
    QFETCH(QString, name);
    const craft::MasterMoldRequest request = craft::testing::masterRequestFor(craft::testing::masterFixtureCase(name));
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

    QCOMPARE(there.sets.size(), here.sets.size());
    for (std::size_t i = 0; i < here.sets.size(); ++i) {
      QCOMPARE(there.sets[i].status, here.sets[i].status);
      QCOMPARE(there.sets[i].contentVersion, here.sets[i].contentVersion);
      QCOMPARE(there.sets[i].failureMessage, here.sets[i].failureMessage);
      QCOMPARE(there.sets[i].failureFamily, here.sets[i].failureFamily);
      QCOMPARE(there.sets[i].set.has_value(), here.sets[i].set.has_value());
      if (here.sets[i].set) {
        QCOMPARE(there.sets[i].set->fingerprint, here.sets[i].set->fingerprint);
        QCOMPARE(there.sets[i].set->assembly.pieces.size(), here.sets[i].set->assembly.pieces.size());
        for (std::size_t p = 0; p < here.sets[i].set->assembly.pieces.size(); ++p) {
          QCOMPARE(there.sets[i].set->assembly.pieces[p].mesh.positions, here.sets[i].set->assembly.pieces[p].mesh.positions);
          QCOMPARE(there.sets[i].set->assembly.pieces[p].mesh.indices, here.sets[i].set->assembly.pieces[p].mesh.indices);
        }
      }
    }
    QCOMPARE(there.workingMoldPieceCount, here.workingMoldPieceCount);
    QCOMPARE(there.warningCount, here.warningCount);
    QCOMPARE(there.budget.releaseVerificationAttempts, here.budget.releaseVerificationAttempts);
  }

  // --- the mold job ---------------------------------------------------------------------------------------------------------------------------

  void aMoldJobGivesTheSameResultAsRunningItHere_data() {
    QTest::addColumn<bool>("split");
    QTest::addColumn<int>("sprues");
    QTest::newRow("whole block") << false << 0;
    QTest::newRow("split, three sprues, registration") << true << 3;
  }
  void aMoldJobGivesTheSameResultAsRunningItHere() {
    QFETCH(bool, split);
    QFETCH(int, sprues);
    const craft::MoldWorkerRequest job = craft::testing::cubeMoldWorkerRequest(split, sprues);
    auto engine = craft::createManifoldMeshEngine();
    craft::SprueResultCache cache;
    const craft::MoldGenerationResult mold = craft::generateMold(*engine, job.request);
    const craft::DerivedMoldEvaluation derived = craft::evaluateDerivedMold(*engine, mold, job.sprueIntents, {}, &cache);

    const std::vector<std::uint8_t> payload = craft::encodeMoldWorkerRequest(job);
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QVERIFY(worker.start(R"({"kind":"mold"})", QByteArray(reinterpret_cast<const char*>(payload.data()), static_cast<qsizetype>(payload.size()))));
    const WorkerOutcome outcome = runToEnd(worker, 120000);
    QCOMPARE(outcome.state, WorkerOutcome::State::Succeeded);
    QVERIFY(progress.count() >= 1);
    const craft::MoldWorkerResult there = craft::decodeMoldWorkerResult({reinterpret_cast<const std::uint8_t*>(outcome.result.constData()), static_cast<std::size_t>(outcome.result.size())});

    QCOMPARE(there.mold.cavity.bodies.size(), mold.cavity.bodies.size());
    for (std::size_t i = 0; i < mold.cavity.bodies.size(); ++i) {
      QCOMPARE(there.mold.cavity.bodies[i].body.id, mold.cavity.bodies[i].body.id);
      QCOMPARE(there.mold.cavity.bodies[i].body.volumeMm3, mold.cavity.bodies[i].body.volumeMm3);
      QCOMPARE(there.mold.cavity.bodies[i].body.mesh.positions, mold.cavity.bodies[i].body.mesh.positions);
      QCOMPARE(there.mold.cavity.bodies[i].body.mesh.indices, mold.cavity.bodies[i].body.mesh.indices);
    }
    QCOMPARE(there.mold.cavity.cavityTool.solid.volumeMm3, mold.cavity.cavityTool.solid.volumeMm3);
    QCOMPARE(there.mold.cavity.sourceSignature, mold.cavity.sourceSignature);
    QCOMPARE(there.derived.sprues.resolvedSprues.size(), derived.sprues.resolvedSprues.size());
    QCOMPARE(there.derived.registration.status, derived.registration.status);
    QCOMPARE(there.derived.finalBodies().size(), derived.finalBodies().size());
    for (std::size_t i = 0; i < derived.finalBodies().size(); ++i)
      QCOMPARE(there.derived.finalBodies()[i].mesh.positions, derived.finalBodies()[i].mesh.positions);
    QCOMPARE(there.sprueCache.size(), cache.snapshot().size());   // the cache that comes back holds the same sprues
    if (split) QCOMPARE(there.derived.registration.status, std::string("generated"));
  }

  // A real mold on a 130k-triangle sphere (a long Boolean in Release): cancelling ends it at once, with its memory.
  void cancellingARealMoldJobStopsItAtOnce() {
    craft::MoldWorkerRequest job = craft::testing::cubeMoldWorkerRequest(true, 0);
    job.request.groundedPart = std::make_shared<craft::TriangleSoup>(craft::test::soupFromMesh(craft::test::sphereMesh({0, 0, 20}, 20, 360, 180)));
    job.request.cavityClearanceMm = 1;   // a clearance makes it build an offset tool, the long part
    const std::vector<std::uint8_t> payload = craft::encodeMoldWorkerRequest(job);
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QSignalSpy progress(&worker, &WorkerProcess::progress);
    QVERIFY(worker.start(R"({"kind":"mold"})", QByteArray(reinterpret_cast<const char*>(payload.data()), static_cast<qsizetype>(payload.size()))));
    const qint64 pid = worker.processId();
    QVERIFY(progress.wait(60000));            // it has started working on the part
    QVERIFY(processExists(pid));
    QElapsedTimer timer;
    timer.start();
    worker.cancel();
    const WorkerOutcome outcome = runToEnd(worker, 15000);
    if (outcome.state == WorkerOutcome::State::Succeeded) QSKIP("the job finished before it could be cancelled");
    QCOMPARE(outcome.state, WorkerOutcome::State::Cancelled);
    QVERIFY2(timer.elapsed() < 5000, qPrintable(QString("took %1 ms").arg(timer.elapsed())));
    QVERIFY(!processExists(pid));
  }

  void aMoldJobWithoutAPartFailsWithACode() {
    craft::MoldWorkerRequest job;   // no grounded part at all
    const std::vector<std::uint8_t> payload = craft::encodeMoldWorkerRequest(job);
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QVERIFY(worker.start(R"({"kind":"mold"})", QByteArray(reinterpret_cast<const char*>(payload.data()), static_cast<qsizetype>(payload.size()))));
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Failed);
    QVERIFY(!outcome.errorCode.isEmpty());
    QVERIFY(!outcome.message.isEmpty());
  }

  void aCorruptRequestIsReportedWithACode() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QVERIFY(worker.start(R"({"kind":"master-mold"})", QByteArray("this is not a request")));
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Failed);
    QCOMPARE(outcome.errorCode, QString("worker_wire_error"));
    QVERIFY(!outcome.message.isEmpty());
  }

  void aMissingRequestIsReportedWithACode() {
    WorkerProcess worker(QStringLiteral(CRAFT_WORKER_EXE));
    QVERIFY(worker.start(R"({"kind":"master-mold"})"));   // no payload at all
    const WorkerOutcome outcome = runToEnd(worker);
    QCOMPARE(outcome.state, WorkerOutcome::State::Failed);
    QCOMPARE(outcome.errorCode, QString("worker_payload_missing"));
  }

  // A real Master Mold on a part that takes a long time in Release: cancelling ends it at once, with its memory.
  void cancellingARealMasterMoldJobStopsItAtOnce() {
    const craft::MasterMoldRequest request = craft::testing::masterRequestFor(craft::testing::masterFixtureCase("torus"));
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
