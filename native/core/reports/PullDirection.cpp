#include "reports/PullDirection.h"

#include <algorithm>
#include <cmath>
#include <set>

#include "master/MasterAccessibility.h"  // jsToFixed
#include "mold/Registration.h"           // jsNumberToString

namespace craft {

namespace {

ReportJson str(const std::string& value) { return ReportJson::string(value); }
ReportJson num(double value) { return ReportJson::number(value); }
ReportJson flag(bool value) { return ReportJson::boolean(value); }
ReportJson optStr(const std::optional<std::string>& value) { return value ? str(*value) : ReportJson::null(); }
ReportJson optNum(const std::optional<double>& value) { return value ? num(*value) : ReportJson::null(); }
ReportJson strings(const std::vector<std::string>& values) {
  ReportJson out = ReportJson::array();
  for (const auto& v : values) out.push(str(v));
  return out;
}

/// Math.round (floor(x + 0.5)).
double jsRound(double value) { return std::floor(value + 0.5); }

}  // namespace

// --- completion ----------------------------------------------------------------------------------------------------------------------

const char* pullDirectionCompletionStatusName(PullDirectionCompletionStatus status) {
  switch (status) {
    case PullDirectionCompletionStatus::Good: return "Good";
    case PullDirectionCompletionStatus::Review: return "Review";
    case PullDirectionCompletionStatus::Poor: return "Poor";
  }
  return "Poor";
}

namespace {

constexpr double kHighConfidence = 82, kReviewConfidence = 55, kSmallMargin = 8;

double clampConfidence(double value) {
  if (!std::isfinite(value)) return 0;
  return std::max(0.0, std::min(100.0, jsRound(value)));
}

bool isSelectable(const PullDirectionCompletionCandidate& c) { return c.isValid.value_or(true) != false && c.isFilteredOut.value_or(false) != true; }

double resolveScore(const PullDirectionCompletionCandidate& c) {
  std::optional<double> score = c.score ? c.score : (c.preliminaryScore ? c.preliminaryScore : c.engineeringScore);
  if (!score || !std::isfinite(*score)) return 0;
  return *score;
}

double normalizeScoreToConfidence(double score) {
  if (!std::isfinite(score)) return 0;
  if (score <= 1) return clampConfidence(score * 100);
  return clampConfidence(score);
}

std::vector<PullDirectionCompletionCandidate> sortCandidates(std::vector<PullDirectionCompletionCandidate> list) {
  const double inf = std::numeric_limits<double>::infinity();
  std::stable_sort(list.begin(), list.end(), [&](const auto& left, const auto& right) {
    const double lr = left.rank.value_or(inf), rr = right.rank.value_or(inf);
    if (lr != rr) return (lr - rr) < 0;
    return (resolveScore(right) - resolveScore(left)) < 0;
  });
  return list;
}

std::vector<std::string> uniqueWarnings(const std::vector<std::string>& warnings) {
  const auto trim = [](const std::string& text) {
    std::size_t b = 0, e = text.size();
    const auto ws = [](unsigned char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\v' || c == '\f' || c == '\r'; };
    while (b < e && ws(static_cast<unsigned char>(text[b]))) ++b;
    while (e > b && ws(static_cast<unsigned char>(text[e - 1]))) --e;
    return text.substr(b, e - b);
  };
  std::set<std::string> seen;
  std::vector<std::string> result;
  for (const auto& warning : warnings) {
    const std::string normalized = trim(warning);
    if (normalized.empty() || seen.count(normalized)) continue;
    seen.insert(normalized);
    result.push_back(normalized);
  }
  return result;
}

PullDirectionCompletionStatus resolveStatus(double confidence) {
  if (confidence >= kHighConfidence) return PullDirectionCompletionStatus::Good;
  if (confidence >= kReviewConfidence) return PullDirectionCompletionStatus::Review;
  return PullDirectionCompletionStatus::Poor;
}

}  // namespace

PullDirectionCompletionResult completePullDirection(const std::vector<PullDirectionCompletionCandidate>& candidates) {
  std::vector<PullDirectionCompletionCandidate> selectable;
  for (const auto& c : candidates) if (isSelectable(c)) selectable.push_back(c);
  selectable = sortCandidates(std::move(selectable));

  PullDirectionCompletionResult result;
  if (selectable.empty()) {
    result.status = PullDirectionCompletionStatus::Poor;
    result.confidenceScore = 0;
    result.warnings = {"No valid pull direction candidates are available."};
    result.summary = "No usable pull direction could be selected.";
    return result;
  }

  const PullDirectionCompletionCandidate selected = selectable.front();
  result.alternatives.assign(selectable.begin() + 1, selectable.end());
  const double selectedConfidence = normalizeScoreToConfidence(resolveScore(selected));

  std::vector<std::string> warnings = selected.warnings;
  if (!result.alternatives.empty()) {
    const double runnerUp = normalizeScoreToConfidence(resolveScore(result.alternatives.front()));
    if (selectedConfidence - runnerUp < kSmallMargin) warnings.push_back("Top pull direction is close to another candidate; manual review is recommended.");
  }
  if (selectedConfidence < kReviewConfidence) warnings.push_back("Selected pull direction has low confidence.");
  if (selectedConfidence < kHighConfidence) warnings.push_back("Pull direction should be reviewed before final mold generation.");

  result.status = resolveStatus(selectedConfidence);
  result.confidenceScore = selectedConfidence;
  result.selectedCandidate = selected;
  result.warnings = uniqueWarnings(warnings);
  const std::string percent = jsNumberToString(selectedConfidence);
  switch (result.status) {
    case PullDirectionCompletionStatus::Good: result.summary = "Best pull direction selected with " + percent + "% confidence."; break;
    case PullDirectionCompletionStatus::Review:
      result.summary = "Pull direction selected with " + percent + "% confidence. Review is recommended before mold generation.";
      break;
    case PullDirectionCompletionStatus::Poor:
      result.summary = "Pull direction confidence is low at " + percent + "%. Mold generation should proceed carefully.";
      break;
  }
  return result;
}

// --- report contract -----------------------------------------------------------------------------------------------------------

ReportJson toJson(const PullDirectionCandidate& c) {
  ReportJson direction = ReportJson::object();
  direction.set("x", num(c.direction.x)).set("y", num(c.direction.y)).set("z", num(c.direction.z)).set("normalized", flag(c.direction.normalized));
  ReportJson validation = ReportJson::object();
  validation.set("state", str(c.validationState)).set("messages", strings(c.validationMessages));
  ReportJson metadata = ReportJson::object();
  metadata.set("source", str(c.metadataSource)).set("generatedAt", optStr(c.generatedAt));
  ReportJson out = ReportJson::object();
  out.set("id", str(c.id)).set("direction", std::move(direction)).set("rank", optNum(c.rank)).set("score", optNum(c.score));
  out.set("confidence", optNum(c.confidence)).set("quality", str(c.quality)).set("validation", std::move(validation));
  out.set("reason", optStr(c.reason)).set("evaluationNotes", strings(c.evaluationNotes)).set("metadata", std::move(metadata));
  return out;
}

ReportJson toJson(const PullDirectionReport& r) {
  ReportJson summary = ReportJson::object();
  summary.set("title", str(r.summaryTitle)).set("description", str(r.summaryDescription)).set("isComplete", flag(r.summaryIsComplete));
  summary.set("bestCandidateId", optStr(r.bestCandidateId)).set("evaluatedCandidateCount", num(r.evaluatedCandidateCount));
  summary.set("selectionReason", optStr(r.selectionReason)).set("solutionQuality", str(r.solutionQuality));

  ReportJson candidates = ReportJson::array();
  for (const auto& c : r.candidates) candidates.push(toJson(c));

  ReportJson statistics = ReportJson::object();
  statistics.set("evaluatedDirectionsCount", num(r.evaluatedDirectionsCount)).set("validDirectionsCount", num(r.validDirectionsCount));
  statistics.set("rejectedDirectionsCount", num(r.rejectedDirectionsCount)).set("highestScore", optNum(r.highestScore));
  statistics.set("lowestScore", optNum(r.lowestScore)).set("averageScore", optNum(r.averageScore));

  ReportJson execution = ReportJson::object();
  execution.set("startedAt", optStr(r.startedAt)).set("completedAt", optStr(r.completedAt)).set("durationMs", optNum(r.durationMs));
  execution.set("algorithmName", optStr(r.algorithmName)).set("algorithmVersion", optStr(r.algorithmVersion)).set("executionMode", str(r.executionMode));

  ReportJson metadata = ReportJson::object();
  metadata.set("createdAt", str(r.createdAt)).set("updatedAt", optStr(r.updatedAt)).set("source", str(r.source));
  metadata.set("modelId", optStr(r.modelId)).set("analysisSessionId", optStr(r.analysisSessionId));
  metadata.set("coordinateSystem", str(r.coordinateSystem)).set("units", str(r.units));

  ReportJson warnings = ReportJson::array();
  for (const auto& w : r.warnings) {
    ReportJson item = ReportJson::object();
    item.set("code", str(w.code)).set("message", str(w.message)).set("severity", str(w.severity));
    warnings.push(std::move(item));
  }
  ReportJson errors = ReportJson::array();
  for (const auto& e : r.errors) {
    ReportJson item = ReportJson::object();
    item.set("code", str(e.code)).set("message", str(e.message)).set("severity", str(e.severity));
    errors.push(std::move(item));
  }

  ReportJson out = ReportJson::object();
  out.set("reportId", str(r.reportId)).set("reportType", str(r.reportType)).set("schemaVersion", str(r.schemaVersion)).set("status", str(r.status));
  out.set("summary", std::move(summary)).set("bestCandidate", r.bestCandidate ? toJson(*r.bestCandidate) : ReportJson::null());
  out.set("candidates", std::move(candidates)).set("statistics", std::move(statistics)).set("execution", std::move(execution));
  out.set("metadata", std::move(metadata)).set("warnings", std::move(warnings)).set("errors", std::move(errors));
  return out;
}

PullDirectionReport createMockPullDirectionReport(const std::string& nowIso) {
  PullDirectionReport r;
  r.reportId = "pull-direction-report-mock";
  r.status = "not_analyzed";
  r.summaryTitle = "Pull Direction";
  r.summaryDescription = "Pull direction analysis has not been executed yet.";
  r.executionMode = "mock";
  r.createdAt = nowIso;
  r.source = "mock";
  r.coordinateSystem = "unknown";
  r.units = "unknown";
  return r;
}

PullDirectionReport createPullDirectionSessionReport(const PullDirectionSessionReportInput& input, const std::string& nowIso) {
  PullDirectionReport r = createMockPullDirectionReport(nowIso);
  r.status = input.status.value_or("waiting_for_analysis");
  r.summaryDescription = "Pull direction analysis is registered for this analysis session but has not been executed yet.";
  r.updatedAt = nowIso;
  r.source = input.source.value_or("frontend");
  r.modelId = input.modelId;
  r.analysisSessionId = input.analysisSessionId;
  r.coordinateSystem = input.coordinateSystem.value_or("unknown");
  r.units = input.units.value_or("unknown");
  r.algorithmName.reset();
  r.algorithmVersion.reset();
  r.executionMode = "mock";
  return r;
}

namespace {

double normalizeConfidence(double score) {
  if (!std::isfinite(score)) return 0;
  if (score <= 1) return std::max(0.0, std::min(1.0, score));
  return std::max(0.0, std::min(1.0, score / 100));
}

std::string resolveCandidateQuality(double confidence, bool isSelected) {
  if (confidence >= 0.82 && isSelected) return "good";
  if (confidence >= 0.75) return "good";
  if (confidence >= 0.55) return "acceptable";
  if (confidence > 0) return "poor";
  return "unknown";
}

PullDirectionCandidate toReportCandidate(const PullDirectionCompletionCandidate& candidate, const std::string& now,
                                         const std::optional<std::string>& selectedCandidateId) {
  const double confidence = normalizeConfidence(candidate.score.value_or(0));
  const bool isSelected = selectedCandidateId && candidate.id == *selectedCandidateId;
  PullDirectionCandidate c;
  c.id = candidate.id;
  c.direction = {candidate.direction[0], candidate.direction[1], candidate.direction[2], true};
  c.rank = candidate.rank;
  c.score = candidate.score;
  c.confidence = confidence;
  c.quality = resolveCandidateQuality(confidence, isSelected);
  c.validationState = confidence >= 0.55 ? "valid" : "warning";
  c.validationMessages = candidate.warnings;
  c.reason = isSelected ? "Selected by the MVP pull direction completion layer." : "Alternative candidate kept for comparison.";
  if (isSelected) {
    c.evaluationNotes = {"Selected by the MVP pull direction completion layer.",
                         "Advanced draft and undercut analysis will be handled in later stages."};
  }
  c.metadataSource = "algorithm";
  c.generatedAt = now;
  return c;
}

}  // namespace

PullDirectionReport createPullDirectionReportFromCandidates(const PullDirectionSessionReportInput& input,
                                                            const std::vector<PullDirectionCompletionCandidate>& completionCandidates,
                                                            const std::string& nowIso) {
  PullDirectionSessionReportInput withStatus = input;
  withStatus.status = "completed";
  PullDirectionReport r = createPullDirectionSessionReport(withStatus, nowIso);
  const std::string& now = nowIso;

  const PullDirectionCompletionResult completion = completePullDirection(completionCandidates);
  const std::optional<std::string> selectedId = completion.selectedCandidate ? std::optional<std::string>(completion.selectedCandidate->id) : std::nullopt;

  r.candidates.clear();
  for (const auto& c : completionCandidates) r.candidates.push_back(toReportCandidate(c, now, selectedId));
  r.bestCandidate.reset();
  if (completion.selectedCandidate) r.bestCandidate = toReportCandidate(*completion.selectedCandidate, now, selectedId);

  r.status = "completed";
  r.summaryTitle = "Pull Direction";
  r.summaryDescription = completion.summary;
  r.summaryIsComplete = r.bestCandidate.has_value();
  r.bestCandidateId = r.bestCandidate ? std::optional<std::string>(r.bestCandidate->id) : std::nullopt;
  r.evaluatedCandidateCount = static_cast<int>(r.candidates.size());
  r.selectionReason = completion.selectedCandidate
      ? "The selected direction has the strongest score and sufficient confidence for MVP mold generation."
      : "No usable pull direction candidate was selected.";
  r.solutionQuality = completion.status == PullDirectionCompletionStatus::Good ? "strong"
                      : completion.status == PullDirectionCompletionStatus::Review ? "acceptable" : "weak";

  std::vector<double> scores;
  int valid = 0;
  for (const auto& c : r.candidates) {
    scores.push_back(c.score.value_or(0));
    if (c.validationState == "valid") ++valid;
  }
  r.evaluatedDirectionsCount = static_cast<int>(r.candidates.size());
  r.validDirectionsCount = valid;
  r.rejectedDirectionsCount = static_cast<int>(r.candidates.size()) - valid;
  if (!scores.empty()) {
    double sum = 0;
    for (double s : scores) sum += s;
    r.highestScore = *std::max_element(scores.begin(), scores.end());
    r.lowestScore = *std::min_element(scores.begin(), scores.end());
    r.averageScore = sum / static_cast<double>(scores.size());
  } else {
    r.highestScore.reset(); r.lowestScore.reset(); r.averageScore.reset();
  }

  r.completedAt = now;
  r.algorithmName = "MVP Pull Direction Completion";
  r.algorithmVersion = "1.0.0";
  r.executionMode = "heuristic";

  r.warnings.clear();
  for (const auto& w : completion.warnings) r.warnings.push_back({"PULL_DIRECTION_REVIEW", w, "warning"});
  r.errors.clear();
  return r;
}

PullDirectionReport createCompletedPullDirectionSessionReport(const PullDirectionSessionReportInput& input, const std::string& nowIso) {
  // SAMPLE candidates, exactly as the reference hard-codes them. They are not the result of any analysis.
  std::vector<PullDirectionCompletionCandidate> sample(3);
  sample[0].id = "pull-positive-z"; sample[0].label = "+Z"; sample[0].direction = {0, 0, 1}; sample[0].rank = 1; sample[0].score = 88;
  sample[1].id = "pull-positive-x"; sample[1].label = "+X"; sample[1].direction = {1, 0, 0}; sample[1].rank = 2; sample[1].score = 71;
  sample[2].id = "pull-positive-y"; sample[2].label = "+Y"; sample[2].direction = {0, 1, 0}; sample[2].rank = 3; sample[2].score = 52;
  sample[2].warnings = {"Low confidence candidate."};
  return createPullDirectionReportFromCandidates(input, sample, nowIso);
}

// --- context-panel card ----------------------------------------------------------------------------------------------------------

namespace {

std::string resolveMvpStatus(const std::string& reportStatus, const std::optional<PullDirectionCandidate>& best) {
  if (reportStatus == "failed") return "Poor";
  if (!best) return reportStatus == "not_analyzed" || reportStatus == "waiting_for_analysis" ? "Review" : "Poor";
  const double confidence = best->confidence.value_or(0);
  const double percent = confidence <= 1 ? confidence * 100 : confidence;
  if (percent >= 82 || best->quality == "excellent" || best->quality == "good") return "Good";
  if (percent >= 55 || best->quality == "acceptable" || best->validationState == "warning") return "Review";
  return "Poor";
}

std::string formatBestDirection(const std::optional<PullDirectionCandidate>& best) {
  if (!best) return "Not available";
  return pullDirectionLabel(best->direction.x, best->direction.y, best->direction.z);
}

}  // namespace

std::string pullDirectionLabel(double x, double y, double z) {
  struct Component { const char* axis; double value; };
  const Component components[3] = {{"X", x}, {"Y", y}, {"Z", z}};
  int dominant = 0;
  for (int i = 1; i < 3; ++i) if (std::abs(components[i].value) > std::abs(components[dominant].value)) dominant = i;
  bool axisAligned = std::abs(components[dominant].value) >= 0.9;
  for (int i = 0; i < 3; ++i) if (i != dominant && !(std::abs(components[i].value) <= 0.1)) axisAligned = false;
  if (axisAligned) return std::string(components[dominant].value >= 0 ? "+" : "-") + components[dominant].axis;
  const auto fmt = [](double value) { return std::isfinite(value) ? jsToFixed(value, 2) : std::string("0"); };
  return "(" + fmt(x) + ", " + fmt(y) + ", " + fmt(z) + ")";
}

PullDirectionCardModel buildPullDirectionCardModel(const PullDirectionReport* report) {
  PullDirectionCardModel card;
  const std::string status = report ? report->status : "not_analyzed";
  const std::optional<PullDirectionCandidate> best = report ? report->bestCandidate : std::nullopt;
  card.result = resolveMvpStatus(status, best);
  card.bestDirection = formatBestDirection(best);
  if (best && best->confidence) {
    const double percent = *best->confidence <= 1 ? *best->confidence * 100 : *best->confidence;
    card.confidence = jsNumberToString(jsRound(percent)) + "%";
  } else {
    card.confidence = "Not available";
  }
  card.candidates = report ? report->evaluatedDirectionsCount : 0;
  if (report) for (const auto& w : report->warnings) card.warnings.push_back(w.message);
  return card;
}

PullDirectionReportRegistryEntry pullDirectionReportRegistryEntry() {
  PullDirectionReportRegistryEntry e;
  e.id = "pull-direction";
  e.reportType = "pull_direction";
  e.schemaVersion = "1.0.0";
  e.title = "Pull Direction";
  e.description = "Defines the official contract for future pull direction analysis results. No engineering algorithm is executed in this stage.";
  e.category = "mold_engineering";
  e.lifecycleStage = "contract_ready";
  return e;
}

// --- candidate analysis foundation ----------------------------------------------------------------------------------------

std::vector<PullDirectionCandidateDirection> canonicalAxisSeedCandidates() {
  return {{"pull-direction-candidate-positive-x", "+X", {1, 0, 0}}, {"pull-direction-candidate-negative-x", "-X", {-1, 0, 0}},
          {"pull-direction-candidate-positive-y", "+Y", {0, 1, 0}}, {"pull-direction-candidate-negative-y", "-Y", {0, -1, 0}},
          {"pull-direction-candidate-positive-z", "+Z", {0, 0, 1}}, {"pull-direction-candidate-negative-z", "-Z", {0, 0, -1}}};
}

namespace {

constexpr double kVectorEpsilon = 1e-9;

PullDirectionValidatedCandidate validateCandidate(const PullDirectionCandidateDirection& candidate, std::vector<std::pair<std::string, std::string>>& seen) {
  PullDirectionValidatedCandidate out;
  out.candidate = candidate;
  const auto& v = candidate.vector;
  const bool finite = std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z);
  if (!finite) out.issues.emplace_back("non-finite-vector-component", "Candidate vector contains a non-finite component.");
  out.magnitude = finite ? std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z) : 0;
  if (out.magnitude <= kVectorEpsilon) out.issues.emplace_back("zero-length-vector", "Candidate vector magnitude is zero or too small.");
  if (out.issues.empty()) {
    const PullDirectionVec3 n{v.x / out.magnitude, v.y / out.magnitude, v.z / out.magnitude};
    out.normalizedVector = n;
    const std::string key = jsToFixed(n.x, 6) + ":" + jsToFixed(n.y, 6) + ":" + jsToFixed(n.z, 6);
    const auto it = std::find_if(seen.begin(), seen.end(), [&](const auto& e) { return e.first == key; });
    if (it != seen.end()) out.issues.emplace_back("duplicate-direction", "Candidate direction duplicates " + it->second + ".");
    else seen.emplace_back(key, candidate.id);
  }
  out.valid = out.issues.empty();
  out.excludedFromFutureScoring = !out.valid;
  return out;
}

ReportJson candidateJson(const PullDirectionCandidateDirection& c) {
  ReportJson vector = ReportJson::object();
  vector.set("x", num(c.vector.x)).set("y", num(c.vector.y)).set("z", num(c.vector.z));
  ReportJson out = ReportJson::object();
  out.set("id", str(c.id)).set("label", str(c.label)).set("vector", std::move(vector)).set("source", str("canonical-axis-seed"));
  out.set("strategy", str("canonical-axis-seed")).set("coordinateSystem", str("model-space")).set("requiresGeometryInspection", flag(false));
  out.set("score", ReportJson::null()).set("rank", ReportJson::null());
  return out;
}

ReportJson validatedJson(const PullDirectionValidatedCandidate& v) {
  ReportJson normalized = ReportJson::null();
  if (v.normalizedVector) {
    normalized = ReportJson::object();
    normalized.set("x", num(v.normalizedVector->x)).set("y", num(v.normalizedVector->y)).set("z", num(v.normalizedVector->z));
  }
  ReportJson issues = ReportJson::array();
  for (const auto& [code, message] : v.issues) {
    ReportJson item = ReportJson::object();
    item.set("code", str(code)).set("message", str(message)).set("severity", str("error"));
    issues.push(std::move(item));
  }
  ReportJson out = ReportJson::object();
  out.set("candidate", candidateJson(v.candidate)).set("normalizedVector", std::move(normalized)).set("magnitude", num(v.magnitude));
  out.set("status", str(v.valid ? "valid" : "invalid")).set("issues", std::move(issues)).set("excludedFromFutureScoring", flag(v.excludedFromFutureScoring));
  return out;
}

ReportJson filteredJson(const PullDirectionFilteredCandidate& f) {
  ReportJson out = ReportJson::object();
  out.set("validatedCandidate", validatedJson(f.validatedCandidate)).set("includedForFutureScoring", flag(f.includedForFutureScoring));
  out.set("reasonCode", str(f.reasonCode)).set("message", str(f.message));
  return out;
}

ReportJson rankedJson(const PullDirectionRankedCandidate& r) {
  ReportJson out = ReportJson::object();
  out.set("filteredCandidate", filteredJson(r.filteredCandidate)).set("rank", r.rank ? num(*r.rank) : ReportJson::null());
  out.set("score", ReportJson::null()).set("reasonCode", str(r.reasonCode)).set("message", str(r.message)).set("selectedAsBestDirection", flag(false));
  return out;
}

template <class T, class F>
ReportJson listJson(const std::vector<T>& items, F&& convert) {
  ReportJson out = ReportJson::array();
  for (const auto& item : items) out.push(convert(item));
  return out;
}

}  // namespace

PullDirectionAnalysisPipelineOutput runPullDirectionAnalysisPipeline(const std::vector<PullDirectionCandidateDirection>& candidates) {
  PullDirectionAnalysisPipelineOutput out;
  out.generated = candidates;
  std::vector<std::pair<std::string, std::string>> seen;
  for (const auto& c : candidates) out.validation.candidates.push_back(validateCandidate(c, seen));
  for (const auto& v : out.validation.candidates) {
    (v.valid ? out.validation.validCandidates : out.validation.invalidCandidates).push_back(v);
  }
  for (const auto& v : out.validation.invalidCandidates) {
    for (const auto& [code, message] : v.issues) {
      (void)message;
      if (code == "duplicate-direction") { out.validation.duplicateCandidateIds.push_back(v.candidate.id); break; }
    }
  }
  for (const auto& v : out.validation.validCandidates)
    out.included.push_back({v, true, "valid-candidate-included", "Valid candidate included for future filtering/scoring stages."});
  for (const auto& v : out.validation.invalidCandidates)
    out.excluded.push_back({v, false, "invalid-candidate-excluded", "Invalid candidate excluded before future scoring stages."});
  out.filtered = out.included;
  out.filtered.insert(out.filtered.end(), out.excluded.begin(), out.excluded.end());
  for (std::size_t i = 0; i < out.included.size(); ++i)
    out.ranked.push_back({out.included[i], static_cast<int>(i) + 1, "included-candidate-ranked", "Candidate receives a placeholder rank while preserving filtered order."});
  for (const auto& f : out.excluded) out.unranked.push_back({f, std::nullopt, "excluded-candidate-not-ranked", "Excluded candidate is not ranked."});
  return out;
}

ReportJson pullDirectionPipelineTrace() {
  const std::pair<const char*, const char*> steps[] = {
      {"initialize", "Pull Direction analysis engine initialized."},
      {"read-model-input", "Model input reference accepted without mesh inspection."},
      {"generate-seed-candidates", "Canonical axis seed candidates generated without mesh or face-normal analysis."},
      {"normalize-candidates", "Candidate vectors normalized without geometry inspection."},
      {"validate-candidates", "Candidate vectors validated without mesh or face-normal analysis."},
      {"filter-candidates", "Candidate filtering separated included and excluded candidates without scoring."},
      {"rank-candidates", "Candidate ranking foundation preserved filtered order without real scoring."},
      {"build-report", "Pipeline output prepared with ranking foundation output."}};
  ReportJson list = ReportJson::array();
  for (const auto& [stage, message] : steps) {
    ReportJson step = ReportJson::object();
    step.set("stage", str(stage)).set("status", str("completed")).set("message", str(message)).set("allowsRealGeometryComputation", flag(false));
    list.push(std::move(step));
  }
  ReportJson trace = ReportJson::object();
  trace.set("engineId", str(kPullDirectionAnalysisEngineId)).set("engineVersion", str(kPullDirectionAnalysisEngineVersion));
  trace.set("mode", str("candidate-ranking-pipeline-report")).set("steps", std::move(list)).set("warnings", ReportJson::array());
  return trace;
}

ReportJson toJson(const PullDirectionAnalysisPipelineOutput& o) {
  ReportJson generation = ReportJson::object();
  generation.set("strategy", str("canonical-axis-seed")).set("candidates", listJson(o.generated, candidateJson));
  generation.set("inspectedMesh", flag(false)).set("inspectedFaceNormals", flag(false)).set("computedScores", flag(false)).set("selectedBestDirection", flag(false));

  ReportJson validation = ReportJson::object();
  validation.set("candidates", listJson(o.validation.candidates, validatedJson)).set("validCandidates", listJson(o.validation.validCandidates, validatedJson));
  validation.set("invalidCandidates", listJson(o.validation.invalidCandidates, validatedJson)).set("duplicateCandidateIds", strings(o.validation.duplicateCandidateIds));
  validation.set("normalized", flag(true)).set("inspectedMesh", flag(false)).set("inspectedFaceNormals", flag(false)).set("computedScores", flag(false));
  validation.set("rankedCandidates", flag(false)).set("selectedBestDirection", flag(false));

  ReportJson filtering = ReportJson::object();
  filtering.set("strategy", str("validation-status-filter")).set("candidates", listJson(o.filtered, filteredJson));
  filtering.set("includedCandidates", listJson(o.included, filteredJson)).set("excludedCandidates", listJson(o.excluded, filteredJson));
  filtering.set("inspectedMesh", flag(false)).set("inspectedFaceNormals", flag(false)).set("computedScores", flag(false));
  filtering.set("rankedCandidates", flag(false)).set("selectedBestDirection", flag(false));

  std::vector<PullDirectionRankedCandidate> all = o.ranked;
  all.insert(all.end(), o.unranked.begin(), o.unranked.end());
  ReportJson ranking = ReportJson::object();
  ranking.set("strategy", str("preserve-filtered-order")).set("candidates", listJson(all, rankedJson));
  ranking.set("rankedCandidates", listJson(o.ranked, rankedJson)).set("unrankedCandidates", listJson(o.unranked, rankedJson));
  ranking.set("preservesInputOrder", flag(true)).set("usesRealScoring", flag(false)).set("inspectedMesh", flag(false));
  ranking.set("inspectedFaceNormals", flag(false)).set("computedScores", flag(false)).set("selectedBestDirection", flag(false));

  ReportJson out = ReportJson::object();
  out.set("trace", pullDirectionPipelineTrace()).set("candidateGeneration", std::move(generation)).set("candidateValidation", std::move(validation));
  out.set("candidateFiltering", std::move(filtering)).set("candidateRanking", std::move(ranking));
  return out;
}

ReportJson executePullDirectionAnalysis(const PullDirectionAnalysisInput& input, const std::string& completedAtIso) {
  const PullDirectionAnalysisPipelineOutput o = runPullDirectionAnalysisPipeline(canonicalAxisSeedCandidates());

  ReportJson algorithm = ReportJson::object();
  algorithm.set("implemented", flag(false)).set("candidateGeneration", flag(true)).set("candidateNormalization", flag(true));
  algorithm.set("candidateValidation", flag(true)).set("candidateFiltering", flag(true)).set("candidateRanking", flag(true));
  algorithm.set("ranking", flag(false)).set("scoring", flag(false)).set("bestDirectionSelection", flag(false));

  ReportJson inputJson = ReportJson::object();
  if (input.analysisSessionId) inputJson.set("analysisSessionId", str(*input.analysisSessionId));
  inputJson.set("modelId", str(input.modelId));
  if (input.fileName) inputJson.set("fileName", str(*input.fileName));
  inputJson.set("source", str(input.source)).set("hasGeometryPayload", flag(input.hasGeometry));

  ReportJson metadata = ReportJson::object();
  metadata.set("engineId", str(kPullDirectionAnalysisEngineId)).set("engineVersion", str(kPullDirectionAnalysisEngineVersion));
  metadata.set("executionMode", str("candidate-filter-pipeline-integration")).set("candidateGenerationStrategy", str("canonical-axis-seed"));
  metadata.set("candidateFilteringStrategy", str("validation-status-filter")).set("candidateRankingStrategy", str("preserve-filtered-order"));
  metadata.set("candidateCount", num(static_cast<double>(o.generated.size()))).set("validatedCandidateCount", num(static_cast<double>(o.validation.candidates.size())));
  metadata.set("validCandidateCount", num(static_cast<double>(o.validation.validCandidates.size())));
  metadata.set("invalidCandidateCount", num(static_cast<double>(o.validation.invalidCandidates.size())));
  metadata.set("filteredCandidateCount", num(static_cast<double>(o.filtered.size())));
  metadata.set("includedCandidateCount", num(static_cast<double>(o.included.size())));
  metadata.set("excludedCandidateCount", num(static_cast<double>(o.excluded.size())));
  metadata.set("rankedCandidateCount", num(static_cast<double>(o.ranked.size())));
  metadata.set("unrankedCandidateCount", num(static_cast<double>(o.unranked.size())));
  metadata.set("usesRealScoring", flag(false)).set("duplicateCandidateCount", num(static_cast<double>(o.validation.duplicateCandidateIds.size())));
  metadata.set("normalized", flag(true)).set("inspectedMesh", flag(false)).set("inspectedFaceNormals", flag(false)).set("computedScores", flag(false));
  metadata.set("rankedCandidates", flag(false)).set("selectedBestDirection", flag(false)).set("completedAt", str(completedAtIso));
  metadata.set("stage", str("Chapter 9 - Stage 5D-D"));

  const ReportJson full = toJson(o);
  ReportJson report = ReportJson::object();
  report.set("reportKind", str("PullDirectionReport")).set("status", str("Analysis Ready")).set("success", flag(true));
  report.set("algorithm", std::move(algorithm)).set("input", std::move(inputJson));
  report.set("candidates", *full.find("candidateGeneration")->find("candidates"));
  report.set("validatedCandidates", *full.find("candidateValidation")->find("validCandidates"));
  report.set("invalidCandidates", *full.find("candidateValidation")->find("invalidCandidates"));
  report.set("filteredCandidates", *full.find("candidateFiltering")->find("candidates"));
  report.set("includedCandidates", *full.find("candidateFiltering")->find("includedCandidates"));
  report.set("excludedCandidates", *full.find("candidateFiltering")->find("excludedCandidates"));
  report.set("rankedCandidates", *full.find("candidateRanking")->find("rankedCandidates"));
  report.set("unrankedCandidates", *full.find("candidateRanking")->find("unrankedCandidates"));
  report.set("selectedDirection", ReportJson::null()).set("pipelineTrace", pullDirectionPipelineTrace()).set("metadata", std::move(metadata));

  ReportJson result = ReportJson::object();
  result.set("status", str("analysis-ready")).set("report", std::move(report)).set("trace", pullDirectionPipelineTrace());
  return result;
}

}  // namespace craft
