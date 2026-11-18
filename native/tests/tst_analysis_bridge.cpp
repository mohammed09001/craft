// Analysis bridge tests: a real Python worker process running the real
// mold_generator_engine import analysis, plus failure, cancellation, timeout,
// crash-isolation and protocol-mismatch behaviour. No network is involved.
//
// Needs a Python 3.13 interpreter: CRAFT_PYTHON (environment) or the
// CRAFT_PYTHON_EXECUTABLE the build was configured with. Without one the
// engine-dependent cases are reported as SKIPPED, never as passed.

#include <QtTest/QtTest>

#include <QJsonArray>
#include <QSignalSpy>
#include <QTemporaryDir>

#include "AnalysisProtocol.h"
#include "AnalysisWorkerClient.h"

using namespace craft::analysis;

namespace {

QString pythonExecutable() {
  const QString fromEnvironment = qEnvironmentVariable("CRAFT_PYTHON");
  return fromEnvironment.isEmpty() ? QStringLiteral(CRAFT_DEV_PYTHON) : fromEnvironment;
}

QString fixture(const char* name) {
  return QStringLiteral(CRAFT_REPO_ROOT "/mold/tests/fixtures/models/stl/") + QLatin1String(name);
}

WorkerConfig realConfig() {
  WorkerConfig config;
  config.pythonExecutable = pythonExecutable();
  config.workerScript = QStringLiteral(CRAFT_WORKER_SCRIPT);
  config.pythonPath = {QStringLiteral(CRAFT_ENGINE_SRC)};
  return config;
}

QString writeScript(const QTemporaryDir& directory, const char* name, const char* source) {
  const QString path = directory.filePath(QLatin1String(name));
  QFile file(path);
  if (!file.open(QIODevice::WriteOnly)) return {};
  file.write(source);
  return path;
}

#define REQUIRE_PYTHON()                                                                    \
  if (!QFileInfo::exists(pythonExecutable()))                                               \
    QSKIP("No Python runtime (set CRAFT_PYTHON); engine-backed bridge cases not executed.")

}  // namespace

class AnalysisBridgeTest : public QObject {
  Q_OBJECT

 private slots:
  void importAnalysisReturnsRealEngineReport() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy ready(&client, &WorkerClient::workerReady);
    QSignalSpy progress(&client, &WorkerClient::jobProgress);
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);

    const QString jobId = client.startJob(
        QLatin1String(kCommandImportAnalysis),
        {{"sourcePath", fixture("closed_tetrahedron_ascii.stl")},
         {"modelId", "1:closed_tetrahedron_ascii.stl:550"},
         {"geometryVersion", "part_mesh:test"}});
    QVERIFY(client.isBusy());
    QVERIFY2(succeeded.wait(30000), failed.isEmpty() ? "timed out"
                                                     : qPrintable(failed.first().at(2).toString()));
    QVERIFY(failed.isEmpty());
    QVERIFY(!client.isBusy());

    // Handshake.
    QCOMPARE(ready.count(), 1);
    const QJsonObject hello = client.workerInfo();
    QCOMPARE(hello["protocol"].toString(), QLatin1String(kProtocolName));
    QCOMPARE(hello["protocolVersion"].toInt(), kProtocolVersion);
    QVERIFY(hello["python"].toString().startsWith("3.13"));

    // Envelope: strict job + model identity echo.
    QCOMPARE(succeeded.first().at(0).toString(), jobId);
    const QJsonObject message = succeeded.first().at(1).toJsonObject();
    QCOMPARE(message["command"].toString(), QLatin1String(kCommandImportAnalysis));
    QCOMPARE(message["modelId"].toString(), QStringLiteral("1:closed_tetrahedron_ascii.stl:550"));
    QCOMPARE(message["geometryVersion"].toString(), QStringLiteral("part_mesh:test"));
    QVERIFY(message["elapsedMs"].toDouble() >= 0);

    // The report is the engine's own ImportAnalysisReport.to_dict().
    const QJsonObject report = message["report"].toObject();
    QCOMPARE(report["schema_version"].toString(), QStringLiteral("1.0"));
    QCOMPARE(report["import_succeeded"].toBool(), true);
    QCOMPARE(report["analysis_completed"].toBool(), true);
    QCOMPARE(report["source"].toObject()["source_name"].toString(),
             QStringLiteral("closed_tetrahedron_ascii.stl"));
    QCOMPARE(report["source"].toObject()["file_format"].toString(), QStringLiteral("stl"));
    QVERIFY(!report["status"].toString().isEmpty());
    QVERIFY(!report["summary"].toString().isEmpty());
    const QJsonObject statistics = report["statistics"].toObject();
    QVERIFY2(!statistics.isEmpty(), "A closed tetrahedron must produce model statistics.");

    QVERIFY(progress.count() >= 2);
    QCOMPARE(progress.first().at(0).toString(), jobId);
  }

  void engineReportsImportFailureAsStructuredReport() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    client.startJob(QLatin1String(kCommandImportAnalysis),
                    {{"sourcePath", fixture("truncated_binary.stl")}});
    QVERIFY(succeeded.wait(30000));
    const QJsonObject report = succeeded.first().at(1).toJsonObject()["report"].toObject();
    QCOMPARE(report["status"].toString(), QStringLiteral("import_failed"));
    QCOMPARE(report["import_succeeded"].toBool(), false);
    QVERIFY(!report["errors"].toArray().isEmpty());
  }

  void moldabilityAnalysisReturnsAnEngineeringReportEnvelope() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy progress(&client, &WorkerClient::jobProgress);
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandMoldabilityAnalysis),
                    {{"sourcePath", fixture("closed_tetrahedron_ascii.stl")}, {"modelId", "m-1"}, {"geometryVersion", "g-1"}},
                    300000);
    QVERIFY2(succeeded.wait(60000), failed.isEmpty() ? "timed out" : qPrintable(failed.first().at(2).toString()));
    const QJsonObject message = succeeded.first().at(1).toJsonObject();
    QCOMPARE(message["command"].toString(), QLatin1String(kCommandMoldabilityAnalysis));
    QCOMPARE(message["modelId"].toString(), QStringLiteral("m-1"));  // identity echo for stale-result rejection

    // The standard engineering_report contract (Python create_engineering_report().to_dict()).
    const QJsonObject report = message["report"].toObject();
    QCOMPARE(report["schema"].toString(), QStringLiteral("engineering_report"));
    QCOMPARE(report["schemaVersion"].toString(), QStringLiteral("1.0.0"));
    QCOMPARE(report["metadata"].toObject()["analysisName"].toString(), QStringLiteral("moldability_analysis"));
    QCOMPARE(report["metadata"].toObject()["source"].toString(), QStringLiteral("python-engine"));
    QVERIFY(report["success"].toBool());
    const QJsonObject data = report["data"].toObject();
    QCOMPARE(data["pullDirection"].toObject()["rankedCandidates"].toArray().size(), 8);  // 4 faces: face-normal + axis candidates
    // Cavity analysis and the Chapter 9 readiness hand-off ride in the same envelope (the readiness contract is
    // exactly what the native adapter consumes).
    QVERIFY(data["cavityAnalysis"].toObject().contains("cavity_analysis_decision"));
    const QJsonObject readiness = data["generationReadiness"].toObject();
    QVERIFY(readiness.contains("contract"));
    QVERIFY(readiness["contract"].toObject().contains("parting_strategies"));
    QVERIFY(data["stageErrors"].toObject().isEmpty());
    // Bounded payload: per-face lists are replaced by counts and listed under data.omitted.
    QVERIFY(data["omitted"].toObject().contains("face_evaluations"));
    QVERIFY(!QJsonDocument(data["detailedAnalysis"].toObject()).toJson().contains("\"face_evaluations\":["));

    QStringList stages;
    for (const auto& args : progress) stages << args.at(1).toString();
    QVERIFY(stages.contains("analyzing"));
  }

  void moldabilityAnalysisFailuresAreStructured() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandMoldabilityAnalysis), {{"sourcePath", fixture("does_not_exist.stl")}});
    QVERIFY(failed.wait(30000));
    QCOMPARE(failed.first().at(1).toString(), QStringLiteral("source_not_found"));
    failed.clear();
    client.startJob(QLatin1String(kCommandMoldabilityAnalysis), {});
    QVERIFY(failed.wait(30000));
    QCOMPARE(failed.first().at(1).toString(), QStringLiteral("invalid_params"));

    // A model the engine cannot import is a failed report (a result), not a worker error.
    client.startJob(QLatin1String(kCommandMoldabilityAnalysis), {{"sourcePath", fixture("corrupted_ascii.stl")}});
    QVERIFY(succeeded.wait(30000));
    const QJsonObject report = succeeded.first().at(1).toJsonObject()["report"].toObject();
    QCOMPARE(report["status"].toString(), QStringLiteral("failed"));
    QVERIFY(!report["success"].toBool());
    QCOMPARE(report["errors"].toArray().first().toObject()["code"].toString(), QStringLiteral("model_import_failed"));
  }
  void missingSourceIsAStructuredError() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    const QString jobId = client.startJob(QLatin1String(kCommandImportAnalysis),
                                          {{"sourcePath", "Z:/does/not/exist.stl"}});
    QVERIFY(failed.wait(30000));
    QCOMPARE(failed.first().at(0).toString(), jobId);
    QCOMPARE(failed.first().at(1).toString(), QStringLiteral("source_not_found"));
    // The worker survives a failed job and serves the next one.
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(succeeded.wait(30000));
    QVERIFY(client.isWorkerRunning());
  }

  void unknownCommandAndBadParamsAreRejected() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QStringLiteral("generate_everything"), {});
    QVERIFY(failed.wait(30000));
    QCOMPARE(failed.last().at(1).toString(), QStringLiteral("unknown_command"));
    client.startJob(QLatin1String(kCommandImportAnalysis), {});
    QVERIFY(failed.wait(30000));
    QCOMPARE(failed.last().at(1).toString(), QStringLiteral("invalid_params"));
  }

  void secondJobWhileBusyIsRefused() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    const QString first = client.startJob(QLatin1String(kCommandPing), {});
    const QString second = client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(first != second);
    QVERIFY(failed.wait(5000));
    QCOMPARE(failed.first().at(0).toString(), second);
    QCOMPARE(failed.first().at(1).toString(), QLatin1String(kErrorBusy));
    QVERIFY(succeeded.count() == 1 || succeeded.wait(30000));
    QCOMPARE(succeeded.first().at(0).toString(), first);
  }

  void cancelKillsWorkerAndNextJobRestartsIt() {
    REQUIRE_PYTHON();
    WorkerClient client(realConfig());
    QSignalSpy cancelled(&client, &WorkerClient::jobCancelled);
    QSignalSpy succeeded(&client, &WorkerClient::jobSucceeded);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);

    const QString jobId = client.startJob(QLatin1String(kCommandImportAnalysis),
                                          {{"sourcePath", fixture("closed_tetrahedron_ascii.stl")}});
    client.cancel(jobId);
    QCOMPARE(cancelled.count(), 1);
    QCOMPARE(cancelled.first().at(0).toString(), jobId);
    QVERIFY(!client.isBusy());
    QVERIFY(!client.isWorkerRunning());

    // A late result for the cancelled job must never surface.
    QTest::qWait(300);
    QVERIFY(succeeded.isEmpty());
    QVERIFY(failed.isEmpty());

    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(succeeded.wait(30000));
    QVERIFY(client.isWorkerRunning());
  }

  void missingRuntimeIsReportedNotCrashed() {
    WorkerConfig config = realConfig();
    config.pythonExecutable = QStringLiteral("Z:/no/such/python.exe");
    WorkerClient client(config);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(failed.wait(5000));
    QCOMPARE(failed.first().at(1).toString(), QLatin1String(kErrorRuntimeMissing));
    QVERIFY(!client.isBusy());
  }

  void startupTimeoutFailsTheJob() {
    REQUIRE_PYTHON();
    QTemporaryDir directory;
    WorkerConfig config = realConfig();
    config.workerScript = writeScript(directory, "silent.py", "import time\ntime.sleep(30)\n");
    config.startupTimeoutMs = 400;
    WorkerClient client(config);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(failed.wait(10000));
    QCOMPARE(failed.first().at(1).toString(), QLatin1String(kErrorTimeout));
    QVERIFY(!client.isWorkerRunning());
  }

  void jobTimeoutKillsAHungWorker() {
    REQUIRE_PYTHON();
    QTemporaryDir directory;
    WorkerConfig config = realConfig();
    config.workerScript = writeScript(
        directory, "hang.py",
        "import json, sys, time\n"
        "print(json.dumps({'type': 'hello', 'protocol': 'craft.analysis', 'protocolVersion': 1}),"
        " flush=True)\n"
        "sys.stdin.readline()\n"
        "time.sleep(30)\n");
    config.jobTimeoutMs = 500;
    WorkerClient client(config);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(failed.wait(15000));
    QCOMPARE(failed.first().at(1).toString(), QLatin1String(kErrorTimeout));
    QVERIFY(!client.isWorkerRunning());
  }

  void workerCrashIsIsolatedAndReported() {
    REQUIRE_PYTHON();
    QTemporaryDir directory;
    WorkerConfig config = realConfig();
    config.workerScript = writeScript(
        directory, "crash.py",
        "import json, os, sys\n"
        "print(json.dumps({'type': 'hello', 'protocol': 'craft.analysis', 'protocolVersion': 1}),"
        " flush=True)\n"
        "sys.stdin.readline()\n"
        "os._exit(3)\n");
    WorkerClient client(config);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(failed.wait(15000));
    QCOMPARE(failed.first().at(1).toString(), QLatin1String(kErrorWorkerCrashed));
    QVERIFY(!client.isBusy());
  }

  void protocolVersionMismatchIsRefused() {
    REQUIRE_PYTHON();
    QTemporaryDir directory;
    WorkerConfig config = realConfig();
    config.workerScript = writeScript(
        directory, "future.py",
        "import json, sys\n"
        "print(json.dumps({'type': 'hello', 'protocol': 'craft.analysis', 'protocolVersion': 99}),"
        " flush=True)\n"
        "sys.stdin.readline()\n");
    WorkerClient client(config);
    QSignalSpy failed(&client, &WorkerClient::jobFailed);
    client.startJob(QLatin1String(kCommandPing), {});
    QVERIFY(failed.wait(15000));
    QCOMPARE(failed.first().at(1).toString(), QLatin1String(kErrorProtocolMismatch));
  }

  void workerOpensNoNetworkSocket() {
    // Static guarantee: the worker never imports a networking module.
    QFile script(QStringLiteral(CRAFT_WORKER_SCRIPT));
    QVERIFY(script.open(QIODevice::ReadOnly));
    const QByteArray source = script.readAll();
    for (const char* module : {"import socket", "import http", "import urllib", "import asyncio",
                               "import requests", "socketserver"}) {
      QVERIFY2(!source.contains(module), module);
    }
  }
};

QTEST_GUILESS_MAIN(AnalysisBridgeTest)
#include "tst_analysis_bridge.moc"
