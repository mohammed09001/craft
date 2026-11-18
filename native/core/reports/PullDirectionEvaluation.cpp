#include "reports/PullDirectionEvaluation.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>

#include "master/MasterAccessibility.h"  // jsToFixed
#include "reports/LocaleCompare.h"
#include "mold/Registration.h"           // jsNumberToString

namespace craft {

namespace {

ReportJson str(const std::string& value) { return ReportJson::string(value); }
ReportJson num(double value) { return ReportJson::number(value); }
ReportJson flag(bool value) { return ReportJson::boolean(value); }
double jsRound(double value) { return std::floor(value + 0.5); }
bool isFiniteNumber(double value) { return std::isfinite(value); }
double readFinite(const std::optional<double>& value, double fallback) { return value && isFiniteNumber(*value) ? *value : fallback; }

ReportJson vecJson(const PullDirectionVec3& v) {
  ReportJson out = ReportJson::object();
  out.set("x", num(v.x)).set("y", num(v.y)).set("z", num(v.z));
  return out;
}
ReportJson optVecJson(const std::optional<PullDirectionVec3>& v) { return v ? vecJson(*v) : ReportJson::null(); }
ReportJson optNum(const std::optional<double>& v) { return v ? num(*v) : ReportJson::null(); }
ReportJson optStr(const std::optional<std::string>& v) { return v ? str(*v) : ReportJson::null(); }

}  // namespace

// --- score profile -------------------------------------------------------------------------------------------------------------------

PullDirectionScoreProfile defaultPullDirectionScoreProfile() { return PullDirectionScoreProfile(); }

PullDirectionScoreProfile createPullDirectionScoreProfile(const PullDirectionScoreProfileInput& in) {
  const PullDirectionScoreProfile d;
  PullDirectionScoreProfile p;
  p.minScore = readFinite(in.minScore, d.minScore);
  p.maxScore = readFinite(in.maxScore, d.maxScore);
  p.minVectorLength = readFinite(in.minVectorLength, d.minVectorLength);
  p.defaultConfidence = readFinite(in.defaultConfidence, d.defaultConfidence);
  p.precisionDecimals = readFinite(in.precisionDecimals, d.precisionDecimals);
  p.thresholdRecommended = readFinite(in.thresholdRecommended, d.thresholdRecommended);
  p.thresholdUsable = readFinite(in.thresholdUsable, d.thresholdUsable);
  p.thresholdWeak = readFinite(in.thresholdWeak, d.thresholdWeak);
  p.weightBase = readFinite(in.weightBase, d.weightBase);
  p.weightConfidence = readFinite(in.weightConfidence, d.weightConfidence);
  p.weightSourcePriority = readFinite(in.weightSourcePriority, d.weightSourcePriority);
  return p;
}

ReportJson toJson(const PullDirectionScoreProfile& p) {
  ReportJson thresholds = ReportJson::object();
  thresholds.set("recommended", num(p.thresholdRecommended)).set("usable", num(p.thresholdUsable)).set("weak", num(p.thresholdWeak));
  ReportJson weights = ReportJson::object();
  weights.set("baseScore", num(p.weightBase)).set("confidenceContribution", num(p.weightConfidence)).set("sourcePriorityContribution", num(p.weightSourcePriority));
  ReportJson out = ReportJson::object();
  out.set("minScore", num(p.minScore)).set("maxScore", num(p.maxScore)).set("minVectorLength", num(p.minVectorLength));
  out.set("defaultConfidence", num(p.defaultConfidence)).set("precisionDecimals", num(p.precisionDecimals));
  out.set("thresholds", std::move(thresholds)).set("weights", std::move(weights));
  return out;
}

namespace {

double clampScore(double value, double minScore, double maxScore) {
  if (!std::isfinite(value)) return minScore;
  return std::min(maxScore, std::max(minScore, value));
}

double roundScore(double value, const PullDirectionScoreProfile& p) {
  const double precision = std::pow(10.0, std::max(0.0, p.precisionDecimals));
  return jsRound(clampScore(value, p.minScore, p.maxScore) * precision) / precision;
}

std::string resolveDecision(double score, const PullDirectionScoreProfile& p) {
  if (score >= p.thresholdRecommended) return "recommended";
  if (score >= p.thresholdUsable) return "usable";
  if (score >= p.thresholdWeak) return "weak";
  return "rejected";
}

}  // namespace

// --- evaluation ----------------------------------------------------------------------------------------------------------------------

namespace {

PullDirectionEvaluationReason reason(const char* code, const char* message, const char* impact) { return {code, message, impact}; }

}  // namespace

PullDirectionEvaluationResult evaluatePullDirectionCandidates(const std::vector<PullDirectionEvaluationCandidate>& candidates,
                                                              const PullDirectionScoreProfile& profile) {
  PullDirectionEvaluationResult result;
  for (const PullDirectionEvaluationCandidate& candidate : candidates) {
    PullDirectionCandidateEvaluation e;
    e.candidateId = candidate.id;
    e.originalDirection = candidate.direction;

    if (candidate.isValid && *candidate.isValid == false) {
      e.reasons.push_back(reason("candidate_invalid", "The candidate was marked invalid by an earlier validation stage.", "negative"));
      e.score = profile.minScore;
      e.decision = "rejected";
      result.evaluations.push_back(std::move(e));
      continue;
    }
    e.reasons.push_back(reason("candidate_valid", "The candidate is available for pull direction evaluation.", "positive"));

    const auto& d = candidate.direction;
    if (!std::isfinite(d.x) || !std::isfinite(d.y) || !std::isfinite(d.z)) {
      e.reasons.push_back(reason("direction_vector_not_finite", "The direction vector contains a non-finite numeric value.", "negative"));
      e.score = profile.minScore;
      e.decision = "rejected";
      result.evaluations.push_back(std::move(e));
      continue;
    }
    const double length = std::sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    if (length <= profile.minVectorLength) {
      e.reasons.push_back(reason("direction_vector_zero_length", "The direction vector length is too small to be evaluated safely.", "negative"));
      e.vectorLength = length;
      e.score = profile.minScore;
      e.decision = "rejected";
      result.evaluations.push_back(std::move(e));
      continue;
    }
    e.reasons.push_back(reason("direction_vector_valid", "The direction vector is finite and has a usable length.", "positive"));
    e.vectorLength = length;
    e.normalizedDirection = PullDirectionVec3{d.x / length, d.y / length, d.z / length};
    e.reasons.push_back(reason("normalized_direction_created", "A normalized direction vector was created for stable downstream evaluation.", "positive"));

    double confidence;
    if (!candidate.confidence) {
      e.reasons.push_back(reason("confidence_missing", "No confidence value was provided for this pull direction candidate.", "neutral"));
      confidence = profile.defaultConfidence;
    } else {
      confidence = clampScore(*candidate.confidence, 0, 1);
      if (confidence != *candidate.confidence)
        e.reasons.push_back(reason("confidence_clamped", "The candidate confidence value was outside the 0..1 range and was clamped.", "neutral"));
      else
        e.reasons.push_back(reason("confidence_available", "A confidence value was available for this candidate.", "positive"));
    }
    double priority = 0;
    if (candidate.sourcePriority) {
      priority = clampScore(*candidate.sourcePriority, 0, 1);
      if (priority > 0) e.reasons.push_back(reason("source_priority_applied", "A source priority value was applied during evaluation.", "positive"));
    }
    e.score = roundScore(profile.weightBase + confidence * profile.weightConfidence + priority * profile.weightSourcePriority, profile);
    e.decision = resolveDecision(e.score, profile);
    result.evaluations.push_back(std::move(e));
  }

  std::stable_sort(result.evaluations.begin(), result.evaluations.end(), [](const auto& left, const auto& right) {
    if (right.score != left.score) return (right.score - left.score) < 0;
    return localeCompare(left.candidateId, right.candidateId) < 0;
  });
  for (const auto& e : result.evaluations) {
    if (!result.bestCandidateId && e.decision != "rejected") result.bestCandidateId = e.candidateId;
    if (e.decision == "recommended") result.recommendedCandidateIds.push_back(e.candidateId);
  }
  return result;
}

namespace {

ReportJson reasonJson(const PullDirectionEvaluationReason& r) {
  ReportJson out = ReportJson::object();
  out.set("code", str(r.code)).set("message", str(r.message)).set("impact", str(r.impact));
  return out;
}

ReportJson evaluationJson(const PullDirectionCandidateEvaluation& e) {
  ReportJson reasons = ReportJson::array();
  for (const auto& r : e.reasons) reasons.push(reasonJson(r));
  ReportJson out = ReportJson::object();
  out.set("candidateId", str(e.candidateId)).set("originalDirection", vecJson(e.originalDirection)).set("normalizedDirection", optVecJson(e.normalizedDirection));
  out.set("vectorLength", optNum(e.vectorLength)).set("score", num(e.score)).set("decision", str(e.decision)).set("reasons", std::move(reasons));
  return out;
}

ReportJson messageJson(const PullDirectionSummaryMessage& m) {
  ReportJson out = ReportJson::object();
  out.set("severity", str(m.severity)).set("code", str(m.code)).set("message", str(m.message));
  return out;
}

}  // namespace

ReportJson toJson(const PullDirectionEvaluationResult& result) {
  ReportJson evaluations = ReportJson::array();
  for (const auto& e : result.evaluations) evaluations.push(evaluationJson(e));
  ReportJson recommended = ReportJson::array();
  for (const auto& id : result.recommendedCandidateIds) recommended.push(str(id));
  ReportJson out = ReportJson::object();
  out.set("evaluations", std::move(evaluations)).set("bestCandidateId", optStr(result.bestCandidateId)).set("recommendedCandidateIds", std::move(recommended));
  return out;
}

// --- adapter -------------------------------------------------------------------------------------------------------------------------

namespace {

std::optional<PullDirectionVec3> readDirection(const PullDirectionRankedCandidateLike& c) {
  const std::optional<PullDirectionPartialVec3>* raw = c.direction ? &c.direction : (c.vector ? &c.vector : (c.pullDirection ? &c.pullDirection : nullptr));
  if (!raw) return std::nullopt;
  const auto& v = **raw;
  const auto component = [](const std::optional<double>& value) -> std::optional<double> { return value && isFiniteNumber(*value) ? value : std::nullopt; };
  const auto x = component(v.x), y = component(v.y), z = component(v.z);
  if (!x || !y || !z) return std::nullopt;
  return PullDirectionVec3{*x, *y, *z};
}

std::string trimmed(const std::string& text) {
  std::size_t b = 0, e = text.size();
  const auto ws = [](unsigned char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\v' || c == '\f' || c == '\r'; };
  while (b < e && ws(static_cast<unsigned char>(text[b]))) ++b;
  while (e > b && ws(static_cast<unsigned char>(text[e - 1]))) --e;
  return text.substr(b, e - b);
}

}  // namespace

std::vector<PullDirectionEvaluationCandidate> createPullDirectionEvaluationInput(const std::vector<PullDirectionRankedCandidateLike>& ranked) {
  const std::size_t total = ranked.size();
  std::vector<PullDirectionEvaluationCandidate> out;
  for (std::size_t index = 0; index < ranked.size(); ++index) {
    const PullDirectionRankedCandidateLike& c = ranked[index];
    const auto direction = readDirection(c);

    std::string id = "ranked-candidate-" + std::to_string(index + 1);
    const std::optional<std::string>& rawId = c.id ? c.id : c.candidateId;
    if (rawId && !trimmed(*rawId).empty()) id = trimmed(*rawId);

    bool validity = true;
    if (c.isValid) validity = *c.isValid;
    else if (c.valid) validity = *c.valid;

    double confidence = 0.5;
    if (c.confidence && isFiniteNumber(*c.confidence)) confidence = *c.confidence;
    else if (c.score && isFiniteNumber(*c.score)) confidence = *c.score > 1 ? *c.score / 100 : *c.score;

    double sourcePriority;
    if (c.sourcePriority && isFiniteNumber(*c.sourcePriority)) sourcePriority = *c.sourcePriority;
    else if (c.rank && isFiniteNumber(*c.rank) && *c.rank > 0) sourcePriority = 1 / *c.rank;
    else if (total <= 1) sourcePriority = 1;
    else sourcePriority = 1 - static_cast<double>(index) / std::max(1.0, static_cast<double>(total) - 1);

    PullDirectionEvaluationCandidate candidate;
    candidate.id = id;
    candidate.direction = direction.value_or(PullDirectionVec3{0, 0, 0});
    candidate.isValid = direction.has_value() && validity;
    candidate.confidence = confidence;
    candidate.sourcePriority = sourcePriority;
    out.push_back(std::move(candidate));
  }
  return out;
}

// --- summary -------------------------------------------------------------------------------------------------------------------------

PullDirectionEvaluationSummary summarizePullDirectionEvaluation(const PullDirectionEvaluationResult& result) {
  PullDirectionEvaluationSummary s;
  s.totalCandidates = static_cast<double>(result.evaluations.size());
  s.evaluatedCandidates = s.totalCandidates;
  for (const auto& e : result.evaluations) {
    if (e.decision == "recommended") s.countRecommended += 1;
    else if (e.decision == "usable") s.countUsable += 1;
    else if (e.decision == "weak") s.countWeak += 1;
    else s.countRejected += 1;
  }
  s.recommendedCandidates = s.countRecommended;
  s.usableCandidates = s.countUsable;
  s.weakCandidates = s.countWeak;
  s.rejectedCandidates = s.countRejected;

  const PullDirectionCandidateEvaluation* best = nullptr;
  if (result.bestCandidateId)
    for (const auto& e : result.evaluations) if (e.candidateId == *result.bestCandidateId) { best = &e; break; }
  if (best) { s.bestCandidateId = best->candidateId; s.bestCandidateScore = best->score; s.bestCandidateDecision = best->decision; }

  if (result.evaluations.empty()) {
    s.messages.push_back({"warning", "no_candidates", "No pull direction candidates were available for evaluation."});
    return s;
  }
  if (!best) {
    s.messages.push_back({"error", "no_usable_candidate", "No usable pull direction candidate was found. Additional geometric analysis is required."});
  } else if (best->decision == "recommended") {
    s.messages.push_back({"info", "recommended_candidate_available", "A recommended pull direction candidate is available for downstream engineering analysis."});
  } else if (best->decision == "usable") {
    s.messages.push_back({"info", "usable_candidate_available", "A usable pull direction candidate is available, but it is not yet classified as strongly recommended."});
  } else if (best->decision == "weak") {
    s.messages.push_back({"warning", "weak_best_candidate", "The best available pull direction candidate is weak and should be reviewed before downstream use."});
  }
  if (s.countRejected > 0) s.messages.push_back({"warning", "rejected_candidates_present", "One or more pull direction candidates were rejected during evaluation."});
  return s;
}

namespace {

PullDirectionEvaluationReportSection buildSection(const PullDirectionEvaluationResult& result) {
  PullDirectionEvaluationReportSection section;
  section.summary = summarizePullDirectionEvaluation(result);
  if (!section.summary.bestCandidateDecision) section.status = "blocked";
  else if (*section.summary.bestCandidateDecision == "weak" || section.summary.rejectedCandidates > 0) section.status = "review_required";
  else section.status = "ready";
  section.evaluations = result.evaluations;
  if (result.bestCandidateId) {
    for (const auto& e : result.evaluations) {
      if (e.candidateId == *result.bestCandidateId) {
        section.bestCandidate = PullDirectionEvaluationBestCandidate{e.candidateId, e.score, e.decision, e.normalizedDirection};
        break;
      }
    }
  }
  section.messages = section.summary.messages;
  return section;
}

}  // namespace

ReportJson toJson(const PullDirectionEvaluationReportSection& section) {
  const auto& s = section.summary;
  ReportJson counts = ReportJson::object();
  counts.set("recommended", num(s.countRecommended)).set("usable", num(s.countUsable)).set("weak", num(s.countWeak)).set("rejected", num(s.countRejected));
  ReportJson summaryMessages = ReportJson::array();
  for (const auto& m : s.messages) summaryMessages.push(messageJson(m));
  ReportJson summary = ReportJson::object();
  summary.set("totalCandidates", num(s.totalCandidates)).set("evaluatedCandidates", num(s.evaluatedCandidates));
  summary.set("recommendedCandidates", num(s.recommendedCandidates)).set("usableCandidates", num(s.usableCandidates));
  summary.set("weakCandidates", num(s.weakCandidates)).set("rejectedCandidates", num(s.rejectedCandidates));
  summary.set("bestCandidateId", optStr(s.bestCandidateId)).set("bestCandidateScore", optNum(s.bestCandidateScore));
  summary.set("bestCandidateDecision", optStr(s.bestCandidateDecision)).set("decisionCounts", std::move(counts)).set("messages", std::move(summaryMessages));

  ReportJson evaluations = ReportJson::array();
  for (const auto& e : section.evaluations) evaluations.push(evaluationJson(e));
  ReportJson best = ReportJson::null();
  if (section.bestCandidate) {
    best = ReportJson::object();
    best.set("candidateId", str(section.bestCandidate->candidateId)).set("score", num(section.bestCandidate->score));
    best.set("decision", str(section.bestCandidate->decision)).set("normalizedDirection", optVecJson(section.bestCandidate->normalizedDirection));
  }
  ReportJson messages = ReportJson::array();
  for (const auto& m : section.messages) messages.push(messageJson(m));

  ReportJson out = ReportJson::object();
  out.set("status", str(section.status)).set("summary", std::move(summary)).set("evaluations", std::move(evaluations));
  out.set("bestCandidate", std::move(best)).set("messages", std::move(messages));
  return out;
}

PullDirectionEvaluationReportSection createPullDirectionEvaluationReportSnapshot(const PullDirectionEvaluationReportSection& section) {
  const auto round6 = [](double v) { return jsRound(v * 1'000'000) / 1'000'000; };
  const auto roundVec = [&](const PullDirectionVec3& v) { return PullDirectionVec3{round6(v.x), round6(v.y), round6(v.z)}; };
  const auto roundOptVec = [&](const std::optional<PullDirectionVec3>& v) { return v ? std::optional<PullDirectionVec3>(roundVec(*v)) : std::nullopt; };
  PullDirectionEvaluationReportSection snapshot = section;
  if (snapshot.summary.bestCandidateScore) snapshot.summary.bestCandidateScore = round6(*snapshot.summary.bestCandidateScore);
  for (auto& e : snapshot.evaluations) {
    e.originalDirection = roundVec(e.originalDirection);
    e.normalizedDirection = roundOptVec(e.normalizedDirection);
    if (e.vectorLength) e.vectorLength = round6(*e.vectorLength);
    e.score = round6(e.score);
  }
  if (snapshot.bestCandidate) {
    snapshot.bestCandidate->score = round6(snapshot.bestCandidate->score);
    snapshot.bestCandidate->normalizedDirection = roundOptVec(snapshot.bestCandidate->normalizedDirection);
  }
  return snapshot;
}

// --- snapshot validation -------------------------------------------------------------------------------------------------------

namespace {

struct Validator {
  std::vector<PullDirectionSnapshotValidationIssue> issues;

  void error(const std::string& path, const std::string& message) { issues.push_back({"error", path, message}); }

  static const ReportJson* get(const ReportJson& object, const char* key) { return object.isObject() ? object.find(key) : nullptr; }

  void finite(const ReportJson* value, const std::string& path) {
    if (!value || !value->isNumber() || !std::isfinite(value->asNumber())) error(path, "Expected a finite numeric value.");
  }
  void nullableFinite(const ReportJson* value, const std::string& path) {
    if (value && value->isNull()) return;
    finite(value, path);
  }
  void nonNegativeInteger(const ReportJson* value, const std::string& path) {
    if (!value || !value->isNumber() || !std::isfinite(value->asNumber()) || value->asNumber() != std::floor(value->asNumber()) || value->asNumber() < 0)
      error(path, "Expected a non-negative integer value.");
  }
  void vector(const ReportJson* value, const std::string& path) {
    if (!value) { finite(nullptr, path + ".x"); finite(nullptr, path + ".y"); finite(nullptr, path + ".z"); return; }
    finite(get(*value, "x"), path + ".x");
    finite(get(*value, "y"), path + ".y");
    finite(get(*value, "z"), path + ".z");
  }
  void nullableVector(const ReportJson* value, const std::string& path) {
    if (value && value->isNull()) return;
    vector(value, path);
  }
  bool emptyId(const ReportJson* value) { return !value || !value->isString() || trimmed(value->asString()).empty(); }
};

}  // namespace

PullDirectionSnapshotValidationResult validatePullDirectionEvaluationReportSnapshot(const ReportJson& snapshot) {
  Validator v;
  const ReportJson null = ReportJson::null();
  const auto field = [&](const ReportJson& object, const char* key) -> const ReportJson* { return Validator::get(object, key); };

  // summary
  const ReportJson* summary = field(snapshot, "summary");
  const ReportJson& sm = summary ? *summary : null;
  v.nonNegativeInteger(field(sm, "totalCandidates"), "summary.totalCandidates");
  v.nonNegativeInteger(field(sm, "evaluatedCandidates"), "summary.evaluatedCandidates");
  v.nonNegativeInteger(field(sm, "recommendedCandidates"), "summary.recommendedCandidates");
  v.nonNegativeInteger(field(sm, "usableCandidates"), "summary.usableCandidates");
  v.nonNegativeInteger(field(sm, "weakCandidates"), "summary.weakCandidates");
  v.nonNegativeInteger(field(sm, "rejectedCandidates"), "summary.rejectedCandidates");
  v.nullableFinite(field(sm, "bestCandidateScore"), "summary.bestCandidateScore");
  const ReportJson* counts = field(sm, "decisionCounts");
  const ReportJson& dc = counts ? *counts : null;
  for (const char* key : {"recommended", "usable", "weak", "rejected"})
    v.nonNegativeInteger(field(dc, key), std::string("summary.decisionCounts.") + key);
  double summed = 0;
  for (const char* key : {"recommended", "usable", "weak", "rejected"}) {
    const ReportJson* item = field(dc, key);
    summed += item && item->isNumber() ? item->asNumber() : 0;
  }
  const ReportJson* total = field(sm, "totalCandidates");
  if (total && total->isNumber() && summed != total->asNumber())
    v.issues.push_back({"warning", "summary.decisionCounts", "Decision counts do not add up to totalCandidates."});

  // best candidate
  const ReportJson* best = field(snapshot, "bestCandidate");
  if (best && !best->isNull()) {
    if (v.emptyId(field(*best, "candidateId"))) v.error("bestCandidate.candidateId", "Expected a non-empty candidate id.");
    v.finite(field(*best, "score"), "bestCandidate.score");
    v.nullableVector(field(*best, "normalizedDirection"), "bestCandidate.normalizedDirection");
  }

  // evaluations
  if (const ReportJson* evaluations = field(snapshot, "evaluations"); evaluations && evaluations->isArray()) {
    for (std::size_t i = 0; i < evaluations->size(); ++i) {
      const ReportJson& e = evaluations->at(i);
      const std::string path = "evaluations." + std::to_string(i);
      if (v.emptyId(field(e, "candidateId"))) v.error(path + ".candidateId", "Expected a non-empty candidate id.");
      v.vector(field(e, "originalDirection"), path + ".originalDirection");
      v.nullableVector(field(e, "normalizedDirection"), path + ".normalizedDirection");
      v.nullableFinite(field(e, "vectorLength"), path + ".vectorLength");
      v.finite(field(e, "score"), path + ".score");
    }
  }

  PullDirectionSnapshotValidationResult result;
  result.issues = std::move(v.issues);
  result.isValid = std::all_of(result.issues.begin(), result.issues.end(), [](const auto& issue) { return issue.severity != "error"; });
  return result;
}

ReportJson toJson(const PullDirectionSnapshotValidationResult& result) {
  ReportJson issues = ReportJson::array();
  for (const auto& i : result.issues) {
    ReportJson item = ReportJson::object();
    item.set("severity", str(i.severity)).set("path", str(i.path)).set("message", str(i.message));
    issues.push(std::move(item));
  }
  ReportJson out = ReportJson::object();
  out.set("isValid", flag(result.isValid)).set("issues", std::move(issues));
  return out;
}

// --- presentation --------------------------------------------------------------------------------------------------------------------

namespace {

std::string formatNumber(const std::optional<double>& value) {
  if (!value || !std::isfinite(*value)) return "N/A";
  return jsNumberToString(std::strtod(jsToFixed(*value, 6).c_str(), nullptr));
}

std::string formatScore(double value) { return formatNumber(value) + "/100"; }

std::string formatVector(const std::optional<PullDirectionVec3>& v) {
  if (!v) return "N/A";
  return "(" + formatNumber(v->x) + ", " + formatNumber(v->y) + ", " + formatNumber(v->z) + ")";
}

ReportJson badge(const char* label, const char* tone) {
  ReportJson out = ReportJson::object();
  out.set("label", str(label)).set("tone", str(tone));
  return out;
}

ReportJson statusBadge(const std::string& status) {
  if (status == "ready") return badge("Ready", "success");
  if (status == "review_required") return badge("Review required", "warning");
  return badge("Blocked", "danger");
}

struct DecisionBadge { const char* label; const char* tone; };
DecisionBadge decisionBadge(const std::string& decision) {
  if (decision == "recommended") return {"Recommended", "success"};
  if (decision == "usable") return {"Usable", "neutral"};
  if (decision == "weak") return {"Weak", "warning"};
  return {"Rejected", "danger"};
}

}  // namespace

ReportJson createPullDirectionEvaluationPresentation(const PullDirectionEvaluationReportSection& snapshot) {
  std::string subtitle;
  if (snapshot.status == "ready") subtitle = "Pull direction evaluation is ready for downstream engineering analysis.";
  else if (snapshot.status == "review_required") subtitle = "Pull direction evaluation completed, but engineering review is required.";
  else subtitle = "Pull direction evaluation is blocked because no usable candidate is available.";

  std::string bestLabel = "No best candidate";
  if (snapshot.bestCandidate)
    bestLabel = snapshot.bestCandidate->candidateId + " \xC2\xB7 " + decisionBadge(snapshot.bestCandidate->decision).label + " \xC2\xB7 " + formatScore(snapshot.bestCandidate->score);

  const auto& s = snapshot.summary;
  const std::string countLabel = formatNumber(s.totalCandidates) + " total \xC2\xB7 " + formatNumber(s.recommendedCandidates) + " recommended \xC2\xB7 " +
                                 formatNumber(s.usableCandidates) + " usable \xC2\xB7 " + formatNumber(s.weakCandidates) + " weak \xC2\xB7 " +
                                 formatNumber(s.rejectedCandidates) + " rejected";

  ReportJson messages = ReportJson::array();
  for (const auto& m : snapshot.messages) {
    ReportJson item = ReportJson::object();
    item.set("label", str(m.message)).set("tone", str(m.severity == "error" ? "danger" : m.severity == "warning" ? "warning" : "neutral"));
    messages.push(std::move(item));
  }
  ReportJson summary = ReportJson::object();
  summary.set("title", str("Pull Direction Evaluation")).set("subtitle", str(subtitle)).set("statusBadge", statusBadge(snapshot.status));
  summary.set("bestCandidateLabel", str(bestLabel)).set("countLabel", str(countLabel)).set("messages", std::move(messages));

  ReportJson candidates = ReportJson::array();
  for (const auto& c : snapshot.evaluations) {
    const DecisionBadge b = decisionBadge(c.decision);
    ReportJson reasonLabels = ReportJson::array();
    for (const auto& r : c.reasons) reasonLabels.push(str(r.impact + ": " + r.message));
    ReportJson item = ReportJson::object();
    item.set("candidateId", str(c.candidateId)).set("decision", str(c.decision)).set("decisionBadge", badge(b.label, b.tone));
    item.set("scoreLabel", str(formatScore(c.score))).set("originalDirectionLabel", str(formatVector(c.originalDirection)));
    item.set("normalizedDirectionLabel", str(formatVector(c.normalizedDirection))).set("vectorLengthLabel", str(formatNumber(c.vectorLength)));
    item.set("reasonLabels", std::move(reasonLabels));
    candidates.push(std::move(item));
  }
  ReportJson out = ReportJson::object();
  out.set("summary", std::move(summary)).set("candidates", std::move(candidates));
  return out;
}

// --- bundle and view model ---------------------------------------------------------------------------------------------------

PullDirectionEvaluationBundle createPullDirectionEvaluationBundle(const std::vector<PullDirectionRankedCandidateLike>& ranked,
                                                                  const std::optional<PullDirectionScoreProfile>& profile) {
  const auto input = createPullDirectionEvaluationInput(ranked);
  const auto result = evaluatePullDirectionCandidates(input, profile.value_or(defaultPullDirectionScoreProfile()));
  PullDirectionEvaluationBundle bundle;
  bundle.reportSection = buildSection(result);
  bundle.snapshot = createPullDirectionEvaluationReportSnapshot(bundle.reportSection);
  bundle.snapshotValidation = validatePullDirectionEvaluationReportSnapshot(toJson(bundle.snapshot));
  bundle.presentation = createPullDirectionEvaluationPresentation(bundle.snapshot);
  return bundle;
}

ReportJson toJson(const PullDirectionEvaluationBundle& bundle) {
  ReportJson out = ReportJson::object();
  out.set("reportSection", toJson(bundle.reportSection)).set("snapshot", toJson(bundle.snapshot));
  out.set("snapshotValidation", toJson(bundle.snapshotValidation)).set("presentation", bundle.presentation);
  return out;
}

ReportJson createPullDirectionEvaluationReportViewModel(const std::vector<PullDirectionRankedCandidateLike>& ranked,
                                                        const std::optional<PullDirectionScoreProfile>& profile) {
  const PullDirectionEvaluationBundle bundle = createPullDirectionEvaluationBundle(ranked, profile);
  const std::string& status = bundle.reportSection.status;
  const bool ready = status == "ready", review = status == "review_required", blocked = status == "blocked";
  ReportJson state = ReportJson::object();
  state.set("status", str(status)).set("isReady", flag(ready)).set("requiresReview", flag(review)).set("isBlocked", flag(blocked));
  state.set("canUseBestCandidate", flag(bundle.snapshotValidation.isValid && (ready || review)));

  ReportJson best = ReportJson::null();
  if (bundle.snapshot.bestCandidate) {
    best = ReportJson::object();
    best.set("candidateId", str(bundle.snapshot.bestCandidate->candidateId)).set("score", num(bundle.snapshot.bestCandidate->score));
    best.set("normalizedDirection", optVecJson(bundle.snapshot.bestCandidate->normalizedDirection));
    best.set("label", *bundle.presentation.find("summary")->find("bestCandidateLabel"));
  }
  ReportJson out = ReportJson::object();
  out.set("state", std::move(state)).set("bestCandidate", std::move(best)).set("snapshot", toJson(bundle.snapshot));
  out.set("validation", toJson(bundle.snapshotValidation)).set("presentation", bundle.presentation).set("bundle", toJson(bundle));
  return out;
}

}  // namespace craft
