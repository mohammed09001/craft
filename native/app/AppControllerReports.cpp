// Engineering reports in the application controller: the moldability analysis job
// (the real Python detailed mold analysis, returned as an `engineering_report`
// envelope), strict validation of that envelope, the pull-direction card and
// evaluation view derived with the ported report logic, and the registry list.
// The logic itself lives in the Qt-free core (reports/*).

#include <QDateTime>
#include <QJsonArray>
#include <QJsonObject>
#include <QLoggingCategory>

#include <cmath>

#include "AnalysisProtocol.h"
#include "AppPaths.h"
#include "AppController.h"
#include "reports/EngineeringReports.h"
#include "reports/GenerationReadiness.h"
#include "reports/PullDirection.h"
#include "reports/PullDirectionEvaluation.h"

Q_DECLARE_LOGGING_CATEGORY(lcApp)

namespace craft::app {

namespace {

// The Python detailed analysis is pure Python and slow on large parts (about 9 minutes for a 10,800-face box); the job
// can be cancelled at any time, and it is given far longer than the default 2-minute analysis timeout.
constexpr int kMoldabilityTimeoutMs = 20 * 60 * 1000;

ReportJson fromQt(const QJsonValue& value) {
  switch (value.type()) {
    case QJsonValue::Null:
    case QJsonValue::Undefined: return ReportJson::null();
    case QJsonValue::Bool: return ReportJson::boolean(value.toBool());
    case QJsonValue::Double: return ReportJson::number(value.toDouble());
    case QJsonValue::String: return ReportJson::string(value.toString().toStdString());
    case QJsonValue::Array: {
      ReportJson out = ReportJson::array();
      for (const QJsonValue& item : value.toArray()) out.push(fromQt(item));
      return out;
    }
    case QJsonValue::Object: {
      ReportJson out = ReportJson::object();
      const QJsonObject object = value.toObject();
      for (auto it = object.begin(); it != object.end(); ++it) out.set(it.key().toStdString(), fromQt(it.value()));
      return out;
    }
  }
  return ReportJson::null();
}

QString q(const std::string& text) { return QString::fromStdString(text); }

QString statusLabel(EngineeringReportStatus status) {
  switch (status) {
    case EngineeringReportStatus::Success: return QStringLiteral("Complete");
    case EngineeringReportStatus::SuccessWithWarnings: return QStringLiteral("Complete with warnings");
    case EngineeringReportStatus::Partial: return QStringLiteral("Partial");
    case EngineeringReportStatus::Failed: return QStringLiteral("Failed");
    case EngineeringReportStatus::Unsupported: return QStringLiteral("Unsupported");
    case EngineeringReportStatus::Skipped: return QStringLiteral("Skipped");
  }
  return QStringLiteral("Failed");
}

QString supportStatusLabel(EngineeringReportSupportStatus status) {
  switch (status) {
    case EngineeringReportSupportStatus::ComingSoon: return QStringLiteral("Coming Soon");
    case EngineeringReportSupportStatus::Supported: return QStringLiteral("Supported");
    case EngineeringReportSupportStatus::Experimental: return QStringLiteral("Experimental");
    case EngineeringReportSupportStatus::Hidden: return QStringLiteral("Hidden");
    case EngineeringReportSupportStatus::Deprecated: return QStringLiteral("Deprecated");
  }
  return QString();
}

std::optional<double> number(const ReportJson* json) {
  if (json && json->isNumber() && std::isfinite(json->asNumber())) return json->asNumber();
  return std::nullopt;
}

std::string text(const ReportJson* json) { return json && json->isString() ? json->asString() : std::string(); }

QVariantList registryList() {
  QVariantList list;
  for (const EngineeringReportManifestItem& item : visibleEngineeringReportManifest()) {
    list.append(QVariantMap{{"id", q(item.id)},
                            {"displayName", q(item.displayName)},
                            {"description", q(item.description)},
                            {"supportStatus", q(engineeringReportSupportStatusName(item.supportStatus))},
                            {"supportLabel", supportStatusLabel(item.supportStatus)}});
  }
  return list;
}

/// Pull-direction card + evaluation derived from the ranked candidates the Python engine returned.
QVariantMap derivePullDirection(const ReportJson& data, const std::string& nowIso, bool engineOk) {
  QVariantMap out{{"available", false}};
  const ReportJson* pull = data.find("pullDirection");
  const ReportJson* ranked = pull && pull->isObject() ? pull->find("rankedCandidates") : nullptr;
  if (!ranked || !ranked->isArray() || ranked->size() == 0) {
    out.insert("note", engineOk ? QStringLiteral("The analysis returned no pull-direction candidates.")
                                : QStringLiteral("No pull-direction result: the model could not be analyzed."));
    return out;
  }

  std::vector<PullDirectionCompletionCandidate> completion;
  std::vector<PullDirectionRankedCandidateLike> likes;
  QVariantList rankedView;
  for (std::size_t i = 0; i < ranked->size(); ++i) {
    const ReportJson& item = ranked->at(i);
    const ReportJson* direction = item.find("direction");
    const auto component = [&](const char* key) { return direction ? number(direction->find(key)).value_or(0) : 0.0; };
    PullDirectionCompletionCandidate c;
    c.id = text(item.find("id"));
    c.direction = {component("x"), component("y"), component("z")};
    c.rank = number(item.find("rank"));
    c.score = number(item.find("score"));
    if (const ReportJson* valid = item.find("isValid"); valid && valid->isBool()) c.isValid = valid->asBool();
    completion.push_back(c);

    PullDirectionRankedCandidateLike like;
    like.id = c.id;
    like.direction = PullDirectionPartialVec3{c.direction[0], c.direction[1], c.direction[2]};
    like.isValid = c.isValid;
    like.rank = c.rank;
    like.score = c.score;
    likes.push_back(like);

    rankedView.append(QVariantMap{{"id", q(c.id)}, {"rank", c.rank.value_or(0)}, {"score", c.score.value_or(0)},
                                  {"directionLabel", q(pullDirectionLabel(c.direction[0], c.direction[1], c.direction[2]))}});
  }

  PullDirectionSessionReportInput input;
  input.analysisSessionId = "moldability-analysis";
  input.source = "engine";
  input.coordinateSystem = "model";
  input.units = "mm";
  const PullDirectionReport report = createPullDirectionReportFromCandidates(input, completion, nowIso);
  const PullDirectionCardModel card = buildPullDirectionCardModel(&report);

  QVariantList warnings;
  for (const std::string& w : card.warnings) warnings.append(q(w));
  out["available"] = true;
  out["card"] = QVariantMap{{"result", q(card.result)}, {"bestDirection", q(card.bestDirection)}, {"confidence", q(card.confidence)},
                            {"candidates", card.candidates}, {"warnings", warnings}};
  out["ranked"] = rankedView;
  out["selectionStatus"] = q(text(pull->find("selectionStatus")));

  const PullDirectionEvaluationBundle bundle = createPullDirectionEvaluationBundle(likes);
  const ReportJson* summary = bundle.presentation.find("summary");
  QVariantList messages;
  for (std::size_t i = 0; i < summary->find("messages")->size(); ++i) messages.append(q(text(summary->find("messages")->at(i).find("label"))));
  out["evaluation"] = QVariantMap{{"status", q(bundle.reportSection.status)},
                                  {"statusLabel", q(text(summary->find("statusBadge")->find("label")))},
                                  {"tone", q(text(summary->find("statusBadge")->find("tone")))},
                                  {"bestLabel", q(text(summary->find("bestCandidateLabel")))},
                                  {"countLabel", q(text(summary->find("countLabel")))},
                                  {"subtitle", q(text(summary->find("subtitle")))},
                                  {"messages", messages},
                                  {"snapshotValid", bundle.snapshotValidation.isValid}};
  return out;
}

QString readinessStatusLabel(const std::string& status) {
  if (status == "ready") return QStringLiteral("Ready");
  if (status == "ready_with_warnings") return QStringLiteral("Ready with warnings");
  if (status == "blocked") return QStringLiteral("Blocked");
  return QStringLiteral("Unavailable");
}

QVariantList stringList(const ReportJson* array, const char* key = nullptr) {
  QVariantList out;
  if (!array || !array->isArray()) return out;
  for (std::size_t i = 0; i < array->size(); ++i) {
    const ReportJson& item = array->at(i);
    out.append(q(key ? text(item.find(key)) : (item.isString() ? item.asString() : std::string())));
  }
  return out;
}

/// Generation readiness: the Python Chapter 9 hand-off report run through the ported adapter.
QVariantMap deriveGenerationReadiness(const ReportJson& data, const std::string& nowIso) {
  const ReportJson* source = data.find("generationReadiness");
  if (!source || source->isNull()) return QVariantMap{{"available", false}};
  const ReportJson snapshot = buildGenerationReadinessSnapshot(*source, nowIso);

  QVariantList strategies;
  if (const ReportJson* list = snapshot.find("partingStrategies"))
    for (std::size_t i = 0; i < list->size(); ++i) {
      const ReportJson& s = list->at(i);
      strategies.append(QVariantMap{{"rank", number(s.find("rank")).value_or(0)},
                                    {"strategyType", q(text(s.find("strategyType")))},
                                    {"status", q(text(s.find("status")))},
                                    {"generationMode", q(text(s.find("generationMode")))},
                                    {"score", number(s.find("score")).value_or(0)},
                                    {"confidence", q(text(s.find("confidence")))},
                                    {"requiresManualReview", s.find("requiresManualReview") && s.find("requiresManualReview")->isBool() && s.find("requiresManualReview")->asBool()}});
    }
  const auto flagOf = [&](const char* key) { const ReportJson* v = snapshot.find(key); return v && v->isBool() && v->asBool(); };
  const std::string status = text(snapshot.find("status"));
  QVariantMap view{{"available", true},
                   {"status", q(status)},
                   {"statusLabel", readinessStatusLabel(status)},
                   {"readiness", q(text(snapshot.find("readiness")))},
                   {"canGenerate", flagOf("canGenerate")},
                   {"requiresManualReview", flagOf("requiresManualReview")},
                   {"confidence", q(text(snapshot.find("confidence")))},
                   {"engineStatus", q(text(source->find("status")))},
                   {"engineSummary", q(text(source->find("summary")))},
                   {"availableInputs", stringList(snapshot.find("availableInputs"), "label")},
                   {"missingInputs", stringList(snapshot.find("missingInputs"), "label")},
                   {"blockers", stringList(snapshot.find("blockers"), "message")},
                   {"warnings", stringList(snapshot.find("warnings"), "message")},
                   {"partingStrategies", strategies}};
  const ReportJson* selected = snapshot.find("selectedPartingStrategyId");
  view["selectedPartingStrategyId"] = selected && selected->isString() ? q(selected->asString()) : QString();
  if (const ReportJson* coreJson = snapshot.find("coreCavityReadiness"); coreJson && coreJson->isObject()) {
    view["coreHandlingRequired"] = coreJson->find("handlingRequired") && coreJson->find("handlingRequired")->isBool() && coreJson->find("handlingRequired")->asBool();
    view["coreDecisionOutcome"] = q(text(coreJson->find("decisionOutcome")));
  }
  return view;
}

/// Cavity analysis: the engine's own status, outcome and findings. The engine states plainly that its detector is a
/// shell/topology method that cannot prove the absence of an internal cavity; its findings are shown verbatim.
QVariantMap deriveCavityAnalysis(const ReportJson& data) {
  const ReportJson* cavity = data.find("cavityAnalysis");
  if (!cavity || !cavity->isObject()) return QVariantMap{{"available", false}};
  const ReportJson* decision = cavity->find("cavity_analysis_decision");
  const auto count = [&](const char* section, const char* list) {
    const ReportJson* s = cavity->find(section);
    const ReportJson* l = s ? s->find(list) : nullptr;
    return l && l->isArray() ? static_cast<int>(l->size()) : 0;
  };
  QVariantList findings;
  if (const ReportJson* list = cavity->find("findings"); list && list->isArray())
    for (std::size_t i = 0; i < list->size() && i < 8; ++i) findings.append(q(text(list->at(i).find("message"))));
  QVariantMap view{{"available", true},
                   {"status", q(text(cavity->find("status")))},
                   {"assessmentOutcome", q(text(cavity->find("assessment_outcome")))},
                   {"summary", q(text(cavity->find("summary")))},
                   {"candidateCount", count("candidate_detection", "candidates")},
                   {"openingCount", count("opening_detection", "openings")},
                   {"findings", findings}};
  if (decision && decision->isObject()) {
    view["decisionOutcome"] = q(text(decision->find("outcome")));
    view["decisionSummary"] = q(text(decision->find("summary")));
    view["coreTargetCount"] = decision->find("applicable_target_ids") ? static_cast<int>(decision->find("applicable_target_ids")->size()) : 0;
    view["manualReviewTargetCount"] = decision->find("manual_review_target_ids") ? static_cast<int>(decision->find("manual_review_target_ids")->size()) : 0;
    view["limitations"] = stringList(decision->find("limitations"));
  }
  return view;
}

}  // namespace

QVariantMap AppController::engineeringReports() const {
  QVariantMap map{{"phase", reportsPhase_},
                  {"stage", reportsStage_},
                  {"error", reportsError_},
                  {"registry", registryList()},
                  {"canRun", model_ && reportsPhase_ != QLatin1String("running")}};
  for (auto it = reportsResult_.begin(); it != reportsResult_.end(); ++it) map.insert(it.key(), it.value());
  return map;
}

void AppController::connectReports() {
  connect(&analysis_, &analysis::WorkerClient::jobProgress, this, [this](const QString& jobId, const QString& stage, double) {
    if (jobId != reportsJobId_) return;
    static const QMap<QString, QString> labels{{"loading-engine", QStringLiteral("Loading the analysis engine…")},
                                               {"importing", QStringLiteral("Importing the model…")},
                                               {"analyzing", QStringLiteral("Analyzing pull directions, draft and undercuts…")},
                                               {"serializing", QStringLiteral("Preparing the report…")}};
    reportsStage_ = labels.value(stage, stage);
    emit engineeringReportsChanged();
  });
  connect(&analysis_, &analysis::WorkerClient::jobSucceeded, this, [this](const QString& jobId, const QJsonObject& message) {
    if (jobId != reportsJobId_) return;
    // Reject a result computed for a model that has since been replaced.
    if (model_ && message.value("modelId").toString().toStdString() != model_->modelId) {
      qCWarning(lcApp) << "Dropped stale engineering report for" << message.value("modelId").toString();
      return;
    }
    reportsJobId_.clear();
    setBusy(false);

    const EngineeringReportParseResult parsed = parseEngineeringReport(fromQt(message.value("report")));
    if (!parsed.report) {
      // The worker is a separate process: a malformed envelope is an error, never a partially trusted result.
      reportsPhase_ = QStringLiteral("error");
      reportsError_ = QStringLiteral("The analysis returned a malformed engineering report: %1").arg(q(parsed.error));
      reportsResult_.clear();
      emit engineeringReportsChanged();
      setStatus(reportsError_);
      emit errorOccurred(QStringLiteral("Engineering report"), reportsError_, QStringLiteral("malformed_report"));
      return;
    }
    const EngineeringReport& report = *parsed.report;
    const std::string nowIso = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs).toStdString();

    QVariantList warnings, errors;
    for (const auto& w : report.warnings) warnings.append(q(w.message));
    for (const auto& e : report.errors) errors.append(q(e.message));
    QVariantMap statistics;
    for (std::size_t i = 0; i < report.statistics.size(); ++i) {
      const ReportJson& v = report.statistics.at(i);
      if (v.isNumber() && std::isfinite(v.asNumber())) statistics.insert(q(report.statistics.keyAt(i)), v.asNumber());
    }

    QVariantMap view;
    view["report"] = QVariantMap{{"reportId", q(report.metadata.reportId)},
                                 {"status", q(engineeringReportStatusName(report.status))},
                                 {"statusLabel", statusLabel(report.status)},
                                 {"success", report.success},
                                 {"summary", q(text(report.data.find("summary")))},
                                 {"engineVersion", q(report.metadata.engineVersion.value_or(""))},
                                 {"statistics", statistics},
                                 {"warnings", warnings},
                                 {"errors", errors},
                                 {"elapsedMs", message.value("elapsedMs").toDouble()}};
    if (const ReportJson* moldability = report.data.find("moldability"); moldability && moldability->isObject()) {
      view["moldability"] = QVariantMap{{"status", q(text(moldability->find("status")))},
                                        {"overallRisk", q(text(moldability->find("overall_risk")))},
                                        {"summary", q(text(moldability->find("summary")))},
                                        {"manualReview", moldability->find("manual_review_required") && moldability->find("manual_review_required")->isBool() &&
                                                             moldability->find("manual_review_required")->asBool()}};
    }
    view["pullDirection"] = derivePullDirection(report.data, nowIso, report.success);
    view["cavity"] = deriveCavityAnalysis(report.data);
    view["readiness"] = deriveGenerationReadiness(report.data, nowIso);
    if (const ReportJson* stageErrors = report.data.find("stageErrors"); stageErrors && stageErrors->isObject() && stageErrors->size() > 0) {
      QVariantList list;
      for (std::size_t i = 0; i < stageErrors->size(); ++i) list.append(q(stageErrors->keyAt(i)) + QStringLiteral(": ") + q(text(&stageErrors->at(i))));
      view["stageErrors"] = list;
    }
    if (const ReportJson* omitted = report.data.find("omitted"); omitted && omitted->isObject() && omitted->size() > 0) {
      view["omittedNote"] = QStringLiteral("Per-face detail (%1 lists) stays in the analysis engine and is not shown here.").arg(omitted->size());
    }
    reportsResult_ = view;
    reportsPhase_ = QStringLiteral("complete");
    reportsError_.clear();
    reportsStage_.clear();
    emit engineeringReportsChanged();
    setStatus(QStringLiteral("Moldability analysis: %1").arg(statusLabel(report.status)));
  });
  connect(&analysis_, &analysis::WorkerClient::jobFailed, this, [this](const QString& jobId, const QString& code, const QString& message) {
    if (jobId != reportsJobId_) return;
    reportsPhase_ = QStringLiteral("error");
    reportsError_ = message;
    reportsResult_.clear();
    reportsJobId_.clear();
    setBusy(false);
    emit engineeringReportsChanged();
    setStatus(QStringLiteral("Moldability analysis failed: %1").arg(message));
    emit errorOccurred(QStringLiteral("Moldability analysis failed"), message, code);
  });
  connect(&analysis_, &analysis::WorkerClient::jobCancelled, this, [this](const QString& jobId) {
    if (jobId != reportsJobId_) return;
    reportsPhase_ = QStringLiteral("idle");
    reportsStage_.clear();
    reportsJobId_.clear();
    setBusy(false);
    emit engineeringReportsChanged();
    setStatus(QStringLiteral("Moldability analysis cancelled."));
  });
}

void AppController::runMoldabilityAnalysis() {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Moldability analysis"), QStringLiteral("Import an STL model first."), QStringLiteral("no_model"));
    return;
  }
  if (analysis_.isBusy()) return;
  reportsPhase_ = QStringLiteral("running");
  reportsError_.clear();
  reportsResult_.clear();
  reportsStage_ = QStringLiteral("Starting…");
  reportsJobId_ = analysis_.startJob(QLatin1String(analysis::kCommandMoldabilityAnalysis),
                                     {{"sourcePath", AppPaths::pathForWorker(model_->sourcePath)},
                                      {"modelId", QString::fromStdString(model_->modelId)},
                                      {"geometryVersion", QString::fromStdString(model_->geometryVersion)}},
                                     kMoldabilityTimeoutMs);
  setBusy(true, QStringLiteral("analysis"), 0);
  setStatus(QStringLiteral("Running the Python moldability analysis…"));
  emit engineeringReportsChanged();
}

void AppController::cancelMoldabilityAnalysis() { analysis_.cancel(reportsJobId_); }

void AppController::clearEngineeringReports() {
  if (!reportsJobId_.isEmpty()) analysis_.cancel(reportsJobId_);
  reportsJobId_.clear();
  reportsPhase_ = QStringLiteral("idle");
  reportsStage_.clear();
  reportsError_.clear();
  reportsResult_.clear();
  emit engineeringReportsChanged();
}

}  // namespace craft::app
