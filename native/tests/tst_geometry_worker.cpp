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
