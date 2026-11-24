// Engineering reports: replays native/tests/fixtures/reference/reports-reference.json (written by the real
// TypeScript registry, completion, pipeline and evaluation code) through the native port and compares.
//
// The fixture encodes non-finite numbers as the strings "NaN", "Infinity" and "-Infinity".

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QtTest>
#include <cmath>
#include <functional>

#include "reports/EngineeringReports.h"
#include "reports/GenerationReadiness.h"
#include "reports/PullDirection.h"
#include "reports/PullDirectionEvaluation.h"

using namespace craft;

namespace {

// --- JSON bridging ----------------------------------------------------------------------------------------------------------------

double decodeNumber(const QJsonValue& v) {
  if (v.isString()) {
    const QString s = v.toString();
    if (s == "Infinity") return INFINITY;
    if (s == "-Infinity") return -INFINITY;
    return std::nan("");  // "NaN" and any other string used where a number is expected
  }
  return v.toDouble();
}

/// Fixture JSON -> ReportJson, with the special number strings decoded.
ReportJson toReport(const QJsonValue& v) {
  if (v.isNull() || v.isUndefined()) return ReportJson::null();
  if (v.isBool()) return ReportJson::boolean(v.toBool());
  if (v.isDouble()) return ReportJson::number(v.toDouble());
  if (v.isString()) {
    const QString s = v.toString();
    if (s == "NaN" || s == "Infinity" || s == "-Infinity") return ReportJson::number(decodeNumber(v));
    return ReportJson::string(s.toStdString());
  }
  if (v.isArray()) {
    ReportJson out = ReportJson::array();
    for (const QJsonValue& item : v.toArray()) out.push(toReport(item));
    return out;
  }
  ReportJson out = ReportJson::object();
  const QJsonObject object = v.toObject();
  // QJsonObject iterates sorted; member order is irrelevant for the comparisons below.
  for (auto it = object.begin(); it != object.end(); ++it) out.set(it.key().toStdString(), toReport(it.value()));
  return out;
}

/// ReportJson -> QJsonValue, encoding non-finite numbers like the fixture does.
QJsonValue toQt(const ReportJson& j) {
  switch (j.kind()) {
    case ReportJson::Kind::Null: return QJsonValue(QJsonValue::Null);
    case ReportJson::Kind::Bool: return j.asBool();
    case ReportJson::Kind::Number: {
      const double n = j.asNumber();
      if (std::isnan(n)) return QStringLiteral("NaN");
      if (std::isinf(n)) return n > 0 ? QStringLiteral("Infinity") : QStringLiteral("-Infinity");
      return n;
    }
    case ReportJson::Kind::String: return QString::fromStdString(j.asString());
    case ReportJson::Kind::Array: {
      QJsonArray out;
      for (std::size_t i = 0; i < j.size(); ++i) out.append(toQt(j.at(i)));
      return out;
    }
    case ReportJson::Kind::Object: {
      QJsonObject out;
      for (std::size_t i = 0; i < j.size(); ++i) out.insert(QString::fromStdString(j.keyAt(i)), toQt(j.at(i)));
      return out;
    }
  }
  return {};
}

/// Deep comparison with a numeric tolerance; returns an empty string when equal, else the first difference.
QString diff(const QJsonValue& expected, const QJsonValue& actual, const QString& path) {
  if (expected.isDouble() && actual.isDouble()) {
    const double e = expected.toDouble(), a = actual.toDouble();
    if (std::abs(e - a) <= 1e-9 + 1e-12 * std::abs(e)) return {};
    return QStringLiteral("%1: expected %2, got %3").arg(path).arg(e, 0, 'g', 17).arg(a, 0, 'g', 17);
  }
  if (expected.type() != actual.type())
    return QStringLiteral("%1: type differs (expected %2, got %3)").arg(path, QString::fromUtf8(QJsonDocument(QJsonArray{expected}).toJson(QJsonDocument::Compact)),
                                                                          QString::fromUtf8(QJsonDocument(QJsonArray{actual}).toJson(QJsonDocument::Compact)));
  if (expected.isArray()) {
    const QJsonArray e = expected.toArray(), a = actual.toArray();
    if (e.size() != a.size()) return QStringLiteral("%1: array size expected %2, got %3").arg(path).arg(e.size()).arg(a.size());
    for (qsizetype i = 0; i < e.size(); ++i)
      if (const QString d = diff(e[i], a[i], QStringLiteral("%1[%2]").arg(path).arg(i)); !d.isEmpty()) return d;
    return {};
  }
  if (expected.isObject()) {
    const QJsonObject e = expected.toObject(), a = actual.toObject();
    for (auto it = e.begin(); it != e.end(); ++it) {
      if (!a.contains(it.key())) return QStringLiteral("%1: missing key '%2'").arg(path, it.key());
      if (const QString d = diff(it.value(), a[it.key()], path + "." + it.key()); !d.isEmpty()) return d;
    }
    for (auto it = a.begin(); it != a.end(); ++it)
      if (!e.contains(it.key())) return QStringLiteral("%1: unexpected key '%2'").arg(path, it.key());
    return {};
  }
  if (expected == actual) return {};
  return QStringLiteral("%1: expected %2, got %3").arg(path, expected.toVariant().toString(), actual.toVariant().toString());
}

#define COMPARE_JSON(expected, actual, path)                        \
  do {                                                              \
    const QString difference_ = diff((expected), (actual), (path)); \
    QVERIFY2(difference_.isEmpty(), qPrintable(difference_));       \
  } while (false)

std::optional<double> optNumber(const QJsonObject& o, const char* key) {
  if (!o.contains(key) || o[key].isNull()) return std::nullopt;
  return decodeNumber(o[key]);
}
std::optional<std::string> optString(const QJsonObject& o, const char* key) {
  if (!o.contains(key) || o[key].isNull()) return std::nullopt;
  return o[key].toString().toStdString();
}
std::optional<bool> optBool(const QJsonObject& o, const char* key) {
  if (!o.contains(key) || o[key].isNull()) return std::nullopt;
  return o[key].toBool();
}

}  // namespace

class ReportsEquivalenceTest : public QObject {
  Q_OBJECT

 private:
  QJsonObject doc_;
  std::string fixedNow_;

 private slots:
  void initTestCase() {
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/reports-reference.json"));
    QVERIFY2(f.open(QIODevice::ReadOnly), "reports-reference.json is missing; run scripts/native/generate-reference-fixtures.ps1 -Only reports");
    doc_ = QJsonDocument::fromJson(f.readAll()).object();
    fixedNow_ = doc_["fixedNow"].toString().toStdString();
  }

  // --- registry -------------------------------------------------------------------------------------------------------------------

  void defaultRegistriesMatchReference() {
    const QJsonObject registry = doc_["registry"].toObject();
    const auto listJson = [](const std::vector<EngineeringReportDefinition>& list) {
      ReportJson out = ReportJson::array();
      for (const auto& d : list) out.push(toJson(d));
      return toQt(out);
    };
    COMPARE_JSON(registry["defaultReports"], listJson(defaultEngineeringReports()), "defaultReports");
    COMPARE_JSON(registry["manifestAll"], listJson(engineeringReportManifest()), "manifestAll");
    COMPARE_JSON(registry["manifestVisible"], listJson(visibleEngineeringReportManifest()), "manifestVisible");
    EngineeringReportDiscoverOptions hidden;
    hidden.includeHidden = true;
    COMPARE_JSON(registry["defaultRegistryAll"], listJson(defaultEngineeringReportRegistry().toManifest(hidden)), "defaultRegistryAll");
    COMPARE_JSON(registry["defaultRegistryVisible"], listJson(defaultEngineeringReportRegistry().toManifest()), "defaultRegistryVisible");
    COMPARE_JSON(registry["pullDirectionDefinition"], toQt(toJson(defaultEngineeringReportDefinitions().front())), "pullDirectionDefinition");

    const PullDirectionReportRegistryEntry entry = pullDirectionReportRegistryEntry();
    const QJsonObject expected = registry["pullDirectionRegistryEntry"].toObject();
    QCOMPARE(QString::fromStdString(entry.id), expected["id"].toString());
    QCOMPARE(QString::fromStdString(entry.reportType), expected["reportType"].toString());
    QCOMPARE(QString::fromStdString(entry.schemaVersion), expected["schemaVersion"].toString());
    QCOMPARE(QString::fromStdString(entry.title), expected["title"].toString());
    QCOMPARE(QString::fromStdString(entry.description), expected["description"].toString());
    QCOMPARE(QString::fromStdString(entry.category), expected["category"].toString());
    QCOMPARE(QString::fromStdString(entry.lifecycleStage), expected["lifecycleStage"].toString());
    QCOMPARE(entry.supportsMockData, expected["supportsMockData"].toBool());
    QCOMPARE(entry.hasAlgorithm, expected["hasAlgorithm"].toBool());
    QCOMPARE(entry.hasViewportVisualization, expected["hasViewportVisualization"].toBool());
    COMPARE_JSON(expected["initialReport"], toQt(toJson(createMockPullDirectionReport(fixedNow_))), "initialReport");
  }

  void registryCasesMatchReference_data() {
    QTest::addColumn<int>("caseIndex");
    const QJsonArray cases = doc_.isEmpty() ? QJsonArray() : doc_["registry"].toObject()["cases"].toArray();
    Q_UNUSED(cases)
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/reports-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray all = QJsonDocument::fromJson(f.readAll()).object()["registry"].toObject()["cases"].toArray();
    for (int i = 0; i < all.size(); ++i) QTest::newRow(qPrintable(all[i].toObject()["name"].toString())) << i;
  }

  void registryCasesMatchReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = doc_["registry"].toObject()["cases"].toArray()[caseIndex].toObject();
    const QJsonObject result = c["result"].toObject();

    // Build the registry one definition at a time so the first failing definition reports its own message.
    EngineeringReportRegistry registry;
    std::string buildError;
    try {
      for (const QJsonValue& d : c["definitions"].toArray()) registry = registry.registerDefinition(parseEngineeringReportDefinition(toReport(d)));
    } catch (const std::invalid_argument& error) {
      buildError = error.what();
    }
    if (!result["ok"].toBool()) {
      QVERIFY2(!buildError.empty(), "native accepted definitions the reference rejected");
      QCOMPARE(QString::fromStdString(buildError), result["error"].toString());
      return;
    }
    QVERIFY2(buildError.empty(), buildError.c_str());

    const auto defsJson = [](const std::vector<EngineeringReportDefinition>& list) {
      ReportJson out = ReportJson::array();
      for (const auto& d : list) out.push(toJson(d));
      return toQt(out);
    };
    const auto optionsOf = [](const QJsonObject& op) {
      EngineeringReportDiscoverOptions options;
      options.includeHidden = op["includeHidden"].toBool(false);
      if (op.contains("category")) options.category = parseEngineeringReportCategory(op["category"].toString().toStdString());
      return options;
    };
    const QJsonArray ops = c["ops"].toArray(), outputs = result["outputs"].toArray();
    QCOMPARE(outputs.size(), ops.size());
    for (qsizetype i = 0; i < ops.size(); ++i) {
      const QJsonObject op = ops[i].toObject();
      const QString kind = op["op"].toString();
      QJsonValue actual;
      if (kind == "discover") actual = defsJson(registry.discover(optionsOf(op)));
      else if (kind == "getById") { const auto d = registry.getById(op["id"].toString().toStdString()); actual = d ? toQt(toJson(*d)) : QJsonValue(QJsonValue::Null); }
      else if (kind == "getByType") { const auto d = registry.getByType(op["type"].toString().toStdString()); actual = d ? toQt(toJson(*d)) : QJsonValue(QJsonValue::Null); }
      else if (kind == "getByCategory")
        actual = defsJson(registry.getByCategory(*parseEngineeringReportCategory(op["category"].toString().toStdString()), op["includeHidden"].toBool(false)));
      else if (kind == "getVisible") actual = defsJson(registry.getVisible());
      else if (kind == "toManifest") actual = defsJson(registry.toManifest(optionsOf(op)));
      else if (kind == "register") {
        QJsonObject registered;
        try {
          const EngineeringReportRegistry next = registry.registerDefinition(parseEngineeringReportDefinition(toReport(op["definition"])));
          EngineeringReportDiscoverOptions hidden;
          hidden.includeHidden = true;
          registered["ok"] = true;
          registered["list"] = defsJson(next.discover(hidden)).toArray();
        } catch (const std::invalid_argument& error) {
          registered["ok"] = false;
          registered["error"] = QString::fromUtf8(error.what());
        }
        actual = registered;
      } else QFAIL("unknown op");
      COMPARE_JSON(outputs[i], actual, QStringLiteral("%1.ops[%2:%3]").arg(c["name"].toString()).arg(i).arg(kind));
    }
  }

  // --- report contract (native addition: the strict boundary validator) ---------------------------------------------------

  void reportContractRoundTripsAndRejectsBadShapes() {
    EngineeringReport report;
    report.metadata = {"report-001", "contract_test", "Contract Test Report", "2026-07-05T00:00:00.000Z", EngineeringReportSource::PythonEngine, std::nullopt, std::nullopt};
    report.statistics.set("durationMs", ReportJson::number(5));
    report.data.set("value", ReportJson::number(42));
    EngineeringReportWarning warning{"MODEL_NON_FATAL_ISSUE", "Model contains a non-fatal issue.", std::string("contract-test"), std::nullopt};
    ReportJson details = ReportJson::object();
    details.set("faceIndex", ReportJson::number(12));
    warning.details = details;
    report.warnings.push_back(warning);

    // The Python wire shape (to_dict) is what toJson produces; parsing it back must reproduce the same JSON.
    const ReportJson wire = toJson(report);
    const auto parsed = parseEngineeringReport(wire);
    QVERIFY2(parsed.error.empty(), parsed.error.c_str());
    COMPARE_JSON(toQt(wire), toQt(toJson(*parsed.report)), "roundTrip");

    const auto rejects = [&](const std::function<void(ReportJson&)>& mutate, const QString& needle) {
      ReportJson broken = wire;
      mutate(broken);
      const auto result = parseEngineeringReport(broken);
      QVERIFY2(!result.report.has_value(), qPrintable("accepted a bad report: " + needle));
      QVERIFY2(QString::fromStdString(result.error).contains(needle), qPrintable(QString::fromStdString(result.error)));
    };
    rejects([](ReportJson& j) { j.set("schema", ReportJson::string("other")); }, "report.schema");
    rejects([](ReportJson& j) { j.set("schemaVersion", ReportJson::string("2.0.0")); }, "report.schemaVersion");
    rejects([](ReportJson& j) { j.set("status", ReportJson::string("great")); }, "report.status");
    rejects([](ReportJson& j) { j.set("success", ReportJson::string("yes")); }, "report.success");
    rejects([](ReportJson& j) { j.set("warnings", ReportJson::object()); }, "report.warnings");
    rejects([](ReportJson& j) { j.set("data", ReportJson::array()); }, "report.data");
    rejects([](ReportJson& j) { ReportJson s = ReportJson::object(); s.set("nested", ReportJson::array()); j.set("statistics", s); }, "report.statistics.nested");
    rejects([](ReportJson& j) { ReportJson m = *j.find("metadata"); m.set("source", ReportJson::string("cloud")); j.set("metadata", m); }, "report.metadata.source");
    QVERIFY(!parseEngineeringReport(ReportJson::array()).report.has_value());
  }

  // --- completion ----------------------------------------------------------------------------------------------------------------

  void completionMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/reports-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray all = QJsonDocument::fromJson(f.readAll()).object()["completion"].toArray();
    for (int i = 0; i < all.size(); ++i) QTest::newRow(qPrintable(all[i].toObject()["name"].toString())) << i;
  }

  void completionMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = doc_["completion"].toArray()[caseIndex].toObject();
    std::vector<PullDirectionCompletionCandidate> candidates;
    for (const QJsonValue& value : c["candidates"].toArray()) {
      const QJsonObject o = value.toObject();
      PullDirectionCompletionCandidate candidate;
      candidate.id = o["id"].toString().toStdString();
      const QJsonArray d = o["direction"].toArray();
      candidate.direction = {d[0].toDouble(), d[1].toDouble(), d[2].toDouble()};
      candidate.label = optString(o, "label");
      candidate.rank = optNumber(o, "rank");
      candidate.score = optNumber(o, "score");
      candidate.preliminaryScore = optNumber(o, "preliminaryScore");
      candidate.engineeringScore = optNumber(o, "engineeringScore");
      candidate.isValid = optBool(o, "isValid");
      candidate.isFilteredOut = optBool(o, "isFilteredOut");
      for (const QJsonValue& w : o["warnings"].toArray()) candidate.warnings.push_back(w.toString().toStdString());
      candidates.push_back(candidate);
    }
    const PullDirectionCompletionResult actual = completePullDirection(candidates);
    const QJsonObject expected = c["result"].toObject();
    QCOMPARE(QString::fromUtf8(pullDirectionCompletionStatusName(actual.status)), expected["status"].toString());
    QCOMPARE(actual.confidenceScore, expected["confidenceScore"].toDouble());
    QCOMPARE(QString::fromStdString(actual.summary), expected["summary"].toString());
    QCOMPARE(actual.selectedCandidate.has_value(), expected["selectedCandidate"].isObject());
    if (actual.selectedCandidate) QCOMPARE(QString::fromStdString(actual.selectedCandidate->id), expected["selectedCandidate"].toObject()["id"].toString());
    const QJsonArray alternatives = expected["alternatives"].toArray();
    QCOMPARE(actual.alternatives.size(), static_cast<std::size_t>(alternatives.size()));
    for (qsizetype i = 0; i < alternatives.size(); ++i)
      QCOMPARE(QString::fromStdString(actual.alternatives[static_cast<std::size_t>(i)].id), alternatives[i].toObject()["id"].toString());
    const QJsonArray warnings = expected["warnings"].toArray();
    QCOMPARE(actual.warnings.size(), static_cast<std::size_t>(warnings.size()));
    for (qsizetype i = 0; i < warnings.size(); ++i) QCOMPARE(QString::fromStdString(actual.warnings[static_cast<std::size_t>(i)]), warnings[i].toString());
  }

  // --- session reports --------------------------------------------------------------------------------------------------------

  void sessionReportsMatchReference() {
    const QJsonObject sessions = doc_["sessions"].toObject();
    COMPARE_JSON(sessions["mock"], toQt(toJson(createMockPullDirectionReport(fixedNow_))), "mock");
    for (const QJsonValue& value : sessions["cases"].toArray()) {
      const QJsonObject c = value.toObject(), input = c["input"].toObject();
      PullDirectionSessionReportInput in;
      in.analysisSessionId = input["analysisSessionId"].toString().toStdString();
      if (!input["modelId"].isNull()) in.modelId = input["modelId"].toString().toStdString();
      in.status = optString(input, "status");
      in.source = optString(input, "source");
      in.coordinateSystem = optString(input, "coordinateSystem");
      in.units = optString(input, "units");
      const QString name = QString::fromStdString(in.analysisSessionId);
      COMPARE_JSON(c["waiting"], toQt(toJson(createPullDirectionSessionReport(in, fixedNow_))), name + ".waiting");
      COMPARE_JSON(c["completed"], toQt(toJson(createCompletedPullDirectionSessionReport(in, fixedNow_))), name + ".completed");
    }
  }

  // --- candidate analysis foundation --------------------------------------------------------------------------------------

  void analysisFoundationMatchesReference() {
    for (const QJsonValue& value : doc_["analysis"].toArray()) {
      const QJsonObject c = value.toObject(), input = c["input"].toObject();
      PullDirectionAnalysisInput in;
      in.analysisSessionId = optString(input, "sessionId");
      in.modelId = input["modelId"].toString().toStdString();
      in.fileName = optString(input, "fileName");
      in.hasGeometry = input.contains("geometry");
      in.source = input.contains("source") ? input["source"].toString().toStdString() : "analysis-session";
      COMPARE_JSON(c["result"], toQt(executePullDirectionAnalysis(in, fixedNow_)), "analysis." + input["modelId"].toString());
    }
  }

  void candidatePipelineMatchesReference() {
    for (const QJsonValue& value : doc_["pipelines"].toArray()) {
      const QJsonObject c = value.toObject();
      std::vector<PullDirectionCandidateDirection> candidates;
      for (const QJsonValue& item : c["candidates"].toArray()) {
        const QJsonObject o = item.toObject(), v = o["vector"].toObject();
        candidates.push_back({o["id"].toString().toStdString(), o["label"].toString().toStdString(), {decodeNumber(v["x"]), decodeNumber(v["y"]), decodeNumber(v["z"])}});
      }
      COMPARE_JSON(c["output"], toQt(toJson(runPullDirectionAnalysisPipeline(candidates))), "pipeline." + c["name"].toString());
    }
    // The default pipeline seeds the six canonical axes.
    QCOMPARE(canonicalAxisSeedCandidates().size(), static_cast<std::size_t>(6));
  }

  // --- evaluation ------------------------------------------------------------------------------------------------------------------

  void scoreProfilesMatchReference() {
    for (const QJsonValue& value : doc_["evaluation"].toObject()["profiles"].toArray()) {
      const QJsonObject c = value.toObject();
      COMPARE_JSON(c["profile"], toQt(toJson(createPullDirectionScoreProfile(profileInput(c["input"].toObject())))), "profile");
    }
  }

  void evaluationMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/reports-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray all = QJsonDocument::fromJson(f.readAll()).object()["evaluation"].toObject()["cases"].toArray();
    for (int i = 0; i < all.size(); ++i) QTest::newRow(qPrintable(all[i].toObject()["name"].toString())) << i;
  }

  void evaluationMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = doc_["evaluation"].toObject()["cases"].toArray()[caseIndex].toObject();
    const QString name = c["name"].toString();
    std::vector<PullDirectionRankedCandidateLike> ranked;
    for (const QJsonValue& value : c["rankedCandidates"].toArray()) ranked.push_back(rankedOf(value.toObject()));
    std::optional<PullDirectionScoreProfile> profile;
    if (c["scoreProfileInput"].isObject()) profile = createPullDirectionScoreProfile(profileInput(c["scoreProfileInput"].toObject()));

    COMPARE_JSON(c["bundle"], toQt(toJson(createPullDirectionEvaluationBundle(ranked, profile))), name + ".bundle");
    COMPARE_JSON(c["viewModel"], toQt(createPullDirectionEvaluationReportViewModel(ranked, profile)), name + ".viewModel");

    // evaluatePullDirectionCandidates on candidates built straight from the raw inputs (no adapter).
    std::vector<PullDirectionEvaluationCandidate> direct;
    const QJsonArray raw = c["rankedCandidates"].toArray();
    for (qsizetype i = 0; i < raw.size(); ++i) {
      const QJsonObject r = raw[i].toObject();
      PullDirectionEvaluationCandidate candidate;
      candidate.id = r["id"].isString() ? r["id"].toString().toStdString() : QStringLiteral("c%1").arg(i).toStdString();
      if (r["direction"].isObject()) {
        const QJsonObject d = r["direction"].toObject();
        const auto comp = [&](const char* key) { return d.contains(key) ? decodeNumber(d[key]) : std::nan(""); };  // a missing component is undefined in JS
        candidate.direction = {comp("x"), comp("y"), comp("z")};
      }
      candidate.isValid = optBool(r, "isValid");
      candidate.confidence = optNumber(r, "confidence");
      candidate.sourcePriority = optNumber(r, "sourcePriority");
      direct.push_back(candidate);
    }
    QJsonObject expectedDirect = c["direct"].toObject();
    QJsonObject actualDirect = toQt(toJson(evaluatePullDirectionCandidates(direct, profile.value_or(defaultPullDirectionScoreProfile())))).toObject();
    if (name == QLatin1String("aliases-and-missing-direction")) {
      // A direction with a missing component echoes `undefined` (omitted by JSON) in the reference; native echoes NaN.
      const auto strip = [](QJsonObject& o) {
        QJsonArray evaluations = o["evaluations"].toArray();
        for (qsizetype i = 0; i < evaluations.size(); ++i) { QJsonObject e = evaluations[i].toObject(); e.remove("originalDirection"); evaluations[i] = e; }
        o["evaluations"] = evaluations;
      };
      strip(expectedDirect);
      strip(actualDirect);
    }
    COMPARE_JSON(expectedDirect, actualDirect, name + ".direct");
  }

  void snapshotValidationMatchesReference() {
    for (const QJsonValue& value : doc_["snapshotValidation"].toArray()) {
      const QJsonObject c = value.toObject();
      COMPARE_JSON(c["result"], toQt(toJson(validatePullDirectionEvaluationReportSnapshot(toReport(c["snapshot"])))), "validation." + c["name"].toString());
    }
  }

  // --- context-panel card (the real React component, rendered to static markup by the generator) --------------------------

  void pullDirectionCardMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/reports-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray all = QJsonDocument::fromJson(f.readAll()).object()["cards"].toArray();
    for (int i = 0; i < all.size(); ++i) QTest::newRow(qPrintable(all[i].toObject()["name"].toString())) << i;
  }

  void pullDirectionCardMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = doc_["cards"].toArray()[caseIndex].toObject();
    const QString markup = c["markup"].toString();

    std::optional<PullDirectionReport> report;
    if (c["report"].isObject()) {
      const QJsonObject r = c["report"].toObject();
      PullDirectionReport parsed;
      parsed.status = r["status"].toString().toStdString();
      parsed.evaluatedDirectionsCount = r["statistics"].toObject()["evaluatedDirectionsCount"].toInt();
      if (r["bestCandidate"].isObject()) {
        const QJsonObject b = r["bestCandidate"].toObject(), d = b["direction"].toObject();
        PullDirectionCandidate best;
        best.direction = {decodeNumber(d["x"]), decodeNumber(d["y"]), decodeNumber(d["z"]), true};
        if (!b["confidence"].isNull()) best.confidence = decodeNumber(b["confidence"]);
        best.quality = b["quality"].toString().toStdString();
        best.validationState = b["validation"].toObject()["state"].toString().toStdString();
        parsed.bestCandidate = best;
      }
      for (const QJsonValue& w : r["warnings"].toArray()) parsed.warnings.push_back({"", w.toObject()["message"].toString().toStdString(), ""});
      report = parsed;
    }
    const PullDirectionCardModel card = buildPullDirectionCardModel(report ? &*report : nullptr);

    // Header badge: the <span> right after the <h3>.
    const QRegularExpression headerRe(QStringLiteral("<h3>Pull Direction</h3><span>([^<]*)</span>"));
    const auto header = headerRe.match(markup);
    QVERIFY(header.hasMatch());
    QCOMPARE(QString::fromStdString(card.result), header.captured(1));

    // The four <dd> rows in order: Result, Best Direction, Confidence, Candidates.
    QStringList rows;
    QRegularExpressionMatchIterator it = QRegularExpression(QStringLiteral("<dd>([^<]*)</dd>")).globalMatch(markup);
    while (it.hasNext()) rows << it.next().captured(1);
    QCOMPARE(rows.size(), 4);
    QCOMPARE(QString::fromStdString(card.result), rows[0]);
    QCOMPARE(QString::fromStdString(card.bestDirection), rows[1]);
    QCOMPARE(QString::fromStdString(card.confidence), rows[2]);
    QCOMPARE(QString::number(card.candidates), rows[3]);

    QStringList warnings;
    QRegularExpressionMatchIterator wi = QRegularExpression(QStringLiteral("<li>([^<]*)</li>")).globalMatch(markup);
    while (wi.hasNext()) warnings << wi.next().captured(1);
    QCOMPARE(static_cast<qsizetype>(card.warnings.size()), warnings.size());
    for (qsizetype i = 0; i < warnings.size(); ++i) QCOMPARE(QString::fromStdString(card.warnings[static_cast<std::size_t>(i)]), warnings[i]);
  }

  void realCandidatesFlowThroughTheCompletedReportBuilder() {
    // The native app feeds Python-ranked candidates through the same builder the reference uses for its sample.
    std::vector<PullDirectionCompletionCandidate> ranked(2);
    ranked[0].id = "axis:-z"; ranked[0].direction = {0, 0, -1}; ranked[0].rank = 1; ranked[0].score = 41.7;
    ranked[1].id = "axis:+z"; ranked[1].direction = {0, 0, 1}; ranked[1].rank = 2; ranked[1].score = 41.7;
    PullDirectionSessionReportInput in;
    in.analysisSessionId = "real";
    in.source = "engine";
    const PullDirectionReport report = createPullDirectionReportFromCandidates(in, ranked, fixedNow_);
    QCOMPARE(QString::fromStdString(report.source), QStringLiteral("engine"));
    QCOMPARE(report.candidates.size(), static_cast<std::size_t>(2));
    QVERIFY(report.bestCandidate.has_value());
    QCOMPARE(QString::fromStdString(report.bestCandidate->id), QStringLiteral("axis:-z"));
    const PullDirectionCardModel card = buildPullDirectionCardModel(&report);
    QCOMPARE(QString::fromStdString(card.bestDirection), QStringLiteral("-Z"));
    QCOMPARE(QString::fromStdString(card.confidence), QStringLiteral("42%"));
    // 42% is below the 55% review band, but the reference card maps a best candidate whose validation state is "warning" to
    // "Review" (resolveMvpStatus), not "Poor"; the completion layer's own status for the same score is Poor.
    QCOMPARE(QString::fromStdString(card.result), QStringLiteral("Review"));
    QCOMPARE(QString::fromUtf8(pullDirectionCompletionStatusName(completePullDirection(ranked).status)), QStringLiteral("Poor"));
    QVERIFY(!card.warnings.empty());  // tie with the runner-up, low confidence, review recommended
  }

  // --- generation readiness adapter (real Python reports + synthetic edge cases through the real TS adapter) -------------

  void generationReadinessMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/readiness-reference.json"));
    QVERIFY2(f.open(QIODevice::ReadOnly), "readiness-reference.json is missing; run generate-reference-fixtures.ps1 -Only reports");
    const QJsonArray all = QJsonDocument::fromJson(f.readAll()).object()["cases"].toArray();
    for (int i = 0; i < all.size(); ++i) QTest::newRow(qPrintable(all[i].toObject()["name"].toString())) << i;
  }

  void generationReadinessMatchesReference() {
    QFETCH(int, caseIndex);
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/readiness-reference.json"));
    QVERIFY(f.open(QIODevice::ReadOnly));
    const QJsonObject root = QJsonDocument::fromJson(f.readAll()).object();
    const QJsonObject c = root["cases"].toArray()[caseIndex].toObject();
    const ReportJson snapshot = buildGenerationReadinessSnapshot(toReport(c["input"]), root["fixedNow"].toString().toStdString());
    COMPARE_JSON(c["snapshot"], toQt(snapshot), c["name"].toString());
  }

  void realPythonReportsAreBlockedUntilAStrategyIsSelected() {
    // Documents the reference behaviour on real engine output: the Python engine never selects a parting strategy, so the
    // adapter reports every analyzable part as blocked pending manual review (and canGenerate stays false).
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/readiness-python-samples.json"));
    QVERIFY(f.open(QIODevice::ReadOnly));
    const QJsonArray samples = QJsonDocument::fromJson(f.readAll()).array();
    QVERIFY(samples.size() >= 5);
    for (const QJsonValue& value : samples) {
      const QJsonObject sample = value.toObject();
      const QJsonObject snapshot = toQt(buildGenerationReadinessSnapshot(toReport(sample["report"]), "2026-01-01T00:00:00.000Z")).toObject();
      QCOMPARE(snapshot["status"].toString(), QStringLiteral("blocked"));
      QVERIFY(!snapshot["canGenerate"].toBool());
      QVERIFY(snapshot["requiresManualReview"].toBool());
      QVERIFY(snapshot["selectedPartingStrategyId"].isNull());
    }
  }

  void nullReportViewModelIsBlocked() {
    const QJsonObject expected = doc_["evaluation"].toObject()["nullReport"].toObject();
    COMPARE_JSON(expected, toQt(createPullDirectionEvaluationReportViewModel({}, std::nullopt)), "nullReport");
  }

 private:
  static PullDirectionScoreProfileInput profileInput(const QJsonObject& o) {
    PullDirectionScoreProfileInput in;
    in.minScore = optNumber(o, "minScore");
    in.maxScore = optNumber(o, "maxScore");
    in.minVectorLength = optNumber(o, "minVectorLength");
    in.defaultConfidence = optNumber(o, "defaultConfidence");
    in.precisionDecimals = optNumber(o, "precisionDecimals");
    const QJsonObject thresholds = o["thresholds"].toObject(), weights = o["weights"].toObject();
    in.thresholdRecommended = optNumber(thresholds, "recommended");
    in.thresholdUsable = optNumber(thresholds, "usable");
    in.thresholdWeak = optNumber(thresholds, "weak");
    in.weightBase = optNumber(weights, "baseScore");
    in.weightConfidence = optNumber(weights, "confidenceContribution");
    in.weightSourcePriority = optNumber(weights, "sourcePriorityContribution");
    return in;
  }

  static PullDirectionRankedCandidateLike rankedOf(const QJsonObject& o) {
    PullDirectionRankedCandidateLike r;
    r.id = optString(o, "id");
    r.candidateId = optString(o, "candidateId");
    const auto partial = [&](const char* key) -> std::optional<PullDirectionPartialVec3> {
      if (!o.contains(key) || !o[key].isObject()) return std::nullopt;
      const QJsonObject d = o[key].toObject();
      return PullDirectionPartialVec3{optNumber(d, "x"), optNumber(d, "y"), optNumber(d, "z")};
    };
    r.direction = partial("direction");
    r.vector = partial("vector");
    r.pullDirection = partial("pullDirection");
    r.isValid = optBool(o, "isValid");
    r.valid = optBool(o, "valid");
    r.confidence = optNumber(o, "confidence");
    r.score = optNumber(o, "score");
    r.rank = optNumber(o, "rank");
    r.sourcePriority = optNumber(o, "sourcePriority");
    return r;
  }
};

QTEST_APPLESS_MAIN(ReportsEquivalenceTest)
#include "tst_reports_equivalence.moc"
