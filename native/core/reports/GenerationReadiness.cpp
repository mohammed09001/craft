#include "reports/GenerationReadiness.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <optional>
#include <vector>

#include "master/JsFormat.h"  // jsToFixed

namespace craft {

namespace {

// --- type guards (the reference's isRecord / isString / isVector ...) -------------------------------------------------------------

bool isRecord(const ReportJson* v) { return v && v->isObject(); }
bool isFiniteNumber(const ReportJson* v) { return v && v->isNumber() && std::isfinite(v->asNumber()); }

bool isString(const ReportJson* v) {
  if (!v || !v->isString()) return false;
  const std::string& s = v->asString();
  return std::any_of(s.begin(), s.end(), [](unsigned char c) { return !(c == ' ' || c == '\t' || c == '\n' || c == '\v' || c == '\f' || c == '\r'); });
}

bool isStringArray(const ReportJson* v) {
  if (!v || !v->isArray()) return false;
  for (std::size_t i = 0; i < v->size(); ++i) if (!isString(&v->at(i))) return false;
  return true;
}

bool isVector(const ReportJson* v) { return isRecord(v) && isFiniteNumber(v->find("x")) && isFiniteNumber(v->find("y")) && isFiniteNumber(v->find("z")); }

/// `value === null || guard(value)`: an absent key (undefined) fails, like the reference.
bool nullOr(const ReportJson* v, bool (*guard)(const ReportJson*)) { return v && (v->isNull() || guard(v)); }

bool isFindingArray(const ReportJson* v) {
  if (!v || !v->isArray()) return false;
  for (std::size_t i = 0; i < v->size(); ++i) {
    const ReportJson* item = &v->at(i);
    if (!(isRecord(item) && isString(item->find("code")) && isString(item->find("source")) && isString(item->find("severity")) && isString(item->find("message")))) return false;
  }
  return true;
}

bool isPullDirectionReadiness(const ReportJson* v) {
  return isRecord(v) && isString(v->find("status")) && nullOr(v->find("candidate_id"), isString) && nullOr(v->find("direction"), isVector) &&
         nullOr(v->find("decisiveness"), isString) && nullOr(v->find("score"), isFiniteNumber) && isFiniteNumber(v->find("confidence"));
}

bool isDraftOrientationReadiness(const ReportJson* v) {
  return isRecord(v) && isString(v->find("status")) && isFiniteNumber(v->find("evaluated_surface_area_ratio")) &&
         isFiniteNumber(v->find("insufficient_draft_area_ratio")) && isFiniteNumber(v->find("near_zero_draft_area_ratio"));
}

bool isUndercutIndicator(const ReportJson* v) {
  return isRecord(v) && isString(v->find("region_id")) && isString(v->find("source")) && isFiniteNumber(v->find("face_count")) &&
         isFiniteNumber(v->find("area_ratio")) && isFiniteNumber(v->find("confidence"));
}

bool isPartingStrategyReadiness(const ReportJson* v) {
  return isRecord(v) && isString(v->find("candidate_id")) && isFiniteNumber(v->find("rank")) && isString(v->find("strategy_type")) &&
         isString(v->find("status")) && isFiniteNumber(v->find("score")) && isFiniteNumber(v->find("confidence")) &&
         nullOr(v->find("pull_direction"), isVector) && isString(v->find("generation_mode"));
}

bool isCoreCavityReadiness(const ReportJson* v) {
  const ReportJson* handling = v ? v->find("handling_required") : nullptr;
  return isRecord(v) && handling && handling->isBool() && nullOr(v->find("decision_outcome"), isString) && isStringArray(v->find("target_ids")) &&
         isFiniteNumber(v->find("confidence"));
}

bool everyItem(const ReportJson* v, bool (*guard)(const ReportJson*)) {
  if (!v || !v->isArray()) return false;
  for (std::size_t i = 0; i < v->size(); ++i) if (!guard(&v->at(i))) return false;
  return true;
}

bool isGenerationContract(const ReportJson* v) {
  return isRecord(v) && isPullDirectionReadiness(v->find("pull_direction")) && isDraftOrientationReadiness(v->find("draft_orientation")) &&
         everyItem(v->find("undercut_indicators"), isUndercutIndicator) && everyItem(v->find("parting_strategies"), isPartingStrategyReadiness) &&
         isCoreCavityReadiness(v->find("core_cavity_readiness")) && nullOr(v->find("selected_parting_strategy_id"), isString) &&
         isFiniteNumber(v->find("confidence"));
}

// --- helpers -----------------------------------------------------------------------------------------------------------------------------

ReportJson str(const std::string& s) { return ReportJson::string(s); }
ReportJson flag(bool b) { return ReportJson::boolean(b); }

/// `value ?? fallback`: null and absent both fall back.
ReportJson orDefault(const ReportJson* v, ReportJson fallback) { return v && !v->isNull() ? *v : std::move(fallback); }

std::string confidenceBand(double value) {
  if (value >= 0.8) return "high";
  if (value >= 0.55) return "medium";
  if (value > 0) return "low";
  return "none";
}

double normalizeRatio(double value) {
  const double rounded = std::strtod(jsToFixed(value, 6).c_str(), nullptr);  // Number(value.toFixed(6))
  return std::max(0.0, std::min(1.0, rounded));
}

bool jsTruthy(const ReportJson* v) {
  if (!v) return false;
  switch (v->kind()) {
    case ReportJson::Kind::Null: return false;
    case ReportJson::Kind::Bool: return v->asBool();
    case ReportJson::Kind::Number: return v->asNumber() != 0 && !std::isnan(v->asNumber());
    case ReportJson::Kind::String: return !v->asString().empty();
    default: return true;
  }
}

void addUnique(std::vector<std::string>& list, const std::string& code) {
  if (std::find(list.begin(), list.end(), code) == list.end()) list.push_back(code);
}

struct Input {
  std::string key, state, label;
  bool required = false;
  std::vector<std::string> reasonCodes;
};

ReportJson inputJson(const Input& in) {
  ReportJson codes = ReportJson::array();
  for (const auto& c : in.reasonCodes) codes.push(str(c));
  ReportJson out = ReportJson::object();
  out.set("key", str(in.key)).set("state", str(in.state)).set("label", str(in.label)).set("required", flag(in.required)).set("reasonCodes", std::move(codes));
  return out;
}

Input makeInput(const char* key, const char* state, const char* label, bool required, std::vector<std::string> reasons) {
  Input in{key, state, label, required, {}};
  for (const auto& r : reasons) addUnique(in.reasonCodes, r);
  return in;
}

struct Message {
  std::string code, message;
  std::optional<std::string> inputKey, source;
};

ReportJson messageJson(const Message& m) {
  ReportJson out = ReportJson::object();
  out.set("code", str(m.code)).set("message", str(m.message));
  if (m.inputKey) out.set("inputKey", str(*m.inputKey));
  if (m.source) out.set("source", str(*m.source));
  return out;
}

const ReportJson* strategyCodes(const ReportJson& strategy, const char* key) {
  const ReportJson* v = strategy.find(key);
  return v && v->isArray() ? v : nullptr;
}

}  // namespace

ReportJson unavailableGenerationReadinessSnapshot(const std::string& nowIso) {
  Input missing = makeInput("chapter9_generation_contract", "missing", "Chapter 9 generation contract", true, {"chapter9_generation_contract_missing"});
  ReportJson missingInputs = ReportJson::array();
  missingInputs.push(inputJson(missing));
  ReportJson blocker = ReportJson::object();
  blocker.set("code", str("blocked_by_missing_required_inputs"))
      .set("message", str("Generation cannot start without the Chapter 9 generation contract."))
      .set("inputKey", str("chapter9_generation_contract"));
  ReportJson blockers = ReportJson::array();
  blockers.push(std::move(blocker));
  ReportJson reasons = ReportJson::array();
  reasons.push(str("chapter9_generation_contract_missing")).push(str("blocked_by_missing_required_inputs"));

  ReportJson out = ReportJson::object();
  out.set("status", str("unavailable")).set("readiness", str("unavailable")).set("canGenerate", flag(false)).set("requiresManualReview", flag(false));
  out.set("confidence", str("none")).set("chapter9DependencyLevel", str("none")).set("availableInputs", ReportJson::array());
  out.set("missingInputs", std::move(missingInputs)).set("warnings", ReportJson::array()).set("blockers", std::move(blockers));
  out.set("reasonCodes", std::move(reasons)).set("pullDirection", ReportJson::null()).set("draftOrientation", ReportJson::null());
  out.set("undercutIndicators", ReportJson::array()).set("partingStrategies", ReportJson::array()).set("coreCavityReadiness", ReportJson::null());
  out.set("selectedPartingStrategyId", ReportJson::null()).set("generatedAt", str(nowIso));
  return out;
}

ReportJson buildGenerationReadinessSnapshot(const ReportJson& input, const std::string& nowIso) {
  // extractContract: a report wrapping a contract, else a bare contract, else nothing.
  const ReportJson* contract = nullptr;
  const ReportJson* report = nullptr;
  if (isRecord(&input) && isString(input.find("status")) && isGenerationContract(input.find("contract"))) {
    contract = input.find("contract");
    report = &input;
  } else if (isGenerationContract(&input)) {
    contract = &input;
  }
  if (!contract) return unavailableGenerationReadinessSnapshot(nowIso);

  const ReportJson& pull = *contract->find("pull_direction");
  const ReportJson& draft = *contract->find("draft_orientation");
  const ReportJson& undercuts = *contract->find("undercut_indicators");
  const ReportJson& strategies = *contract->find("parting_strategies");
  const ReportJson& core = *contract->find("core_cavity_readiness");
  const ReportJson* selectedId = contract->find("selected_parting_strategy_id");
  const double contractConfidence = contract->find("confidence")->asNumber();

  // --- inputs ------------------------------------------------------------------------------------------------------------------------
  const bool selectedAvailable = selectedId && !selectedId->isNull() && [&] {
    for (std::size_t i = 0; i < strategies.size(); ++i)
      if (strategies.at(i).find("candidate_id")->asString() == selectedId->asString()) return true;
    return false;
  }();
  const bool strategiesAvailable = strategies.size() > 0;
  const bool pullAvailable = !pull.find("direction")->isNull() && !pull.find("candidate_id")->isNull();
  const bool draftUnavailable = draft.find("status")->asString() == "unavailable";

  std::vector<Input> inputs;
  inputs.push_back(makeInput("chapter9_generation_contract", "available", "Chapter 9 generation contract", true, {"chapter9_generation_contract_available"}));
  inputs.push_back(makeInput("pull_direction", pullAvailable ? "available" : "missing", "Pull direction", true, {pullAvailable ? "pull_direction_available" : "pull_direction_missing"}));
  inputs.push_back(makeInput("draft_orientation", draftUnavailable ? "missing" : "available", "Draft orientation", true,
                             {draftUnavailable ? "draft_orientation_missing" : "draft_orientation_available"}));
  inputs.push_back(makeInput("undercut_indicators", "available", "Undercut indicators", false, {"undercut_indicators_available"}));
  inputs.push_back(makeInput("parting_strategies", strategiesAvailable ? (selectedAvailable ? "available" : "incomplete") : "missing", "Parting strategies", true,
                             strategiesAvailable ? (selectedAvailable ? std::vector<std::string>{"parting_strategies_available", "selected_parting_strategy_available"}
                                                                       : std::vector<std::string>{"parting_strategies_available", "selected_parting_strategy_missing"})
                                                 : std::vector<std::string>{"parting_strategies_missing"}));
  const ReportJson* handling = core.find("handling_required");
  inputs.push_back(makeInput("core_cavity_readiness", "available", "Core/cavity readiness", true,
                             handling->asBool() ? std::vector<std::string>{"core_cavity_readiness_available", "core_cavity_handling_required"}
                                                : std::vector<std::string>{"core_cavity_readiness_available"}));

  std::vector<Input> availableInputs, missingInputs;
  for (const Input& in : inputs) (in.state == "available" ? availableInputs : missingInputs).push_back(in);

  // --- warnings and blockers -----------------------------------------------------------------------------------------------
  const ReportJson* reportBlockers = report && isFindingArray(report->find("blockers")) ? report->find("blockers") : nullptr;
  const ReportJson* reportWarnings = report && isFindingArray(report->find("warnings")) ? report->find("warnings") : nullptr;

  std::vector<Message> warnings, blockers;
  const auto findingMessage = [](const ReportJson& f) {
    return Message{f.find("code")->asString(), f.find("message")->asString(), std::nullopt, f.find("source")->asString()};
  };
  if (reportWarnings) for (std::size_t i = 0; i < reportWarnings->size(); ++i) warnings.push_back(findingMessage(reportWarnings->at(i)));
  for (std::size_t i = 0; i < strategies.size(); ++i)
    if (const ReportJson* codes = strategyCodes(strategies.at(i), "warning_codes"))
      for (std::size_t k = 0; k < codes->size(); ++k)
        if (codes->at(k).isString())
          warnings.push_back({codes->at(k).asString(), "Parting strategy warning: " + codes->at(k).asString() + ".", std::string("parting_strategies"), std::string("chapter9_generation_contract")});
  if (const ReportJson* codes = strategyCodes(core, "warning_codes"))
    for (std::size_t k = 0; k < codes->size(); ++k)
      if (codes->at(k).isString())
        warnings.push_back({codes->at(k).asString(), "Core/cavity readiness warning: " + codes->at(k).asString() + ".", std::string("core_cavity_readiness"), std::string("chapter9_generation_contract")});

  if (reportBlockers) for (std::size_t i = 0; i < reportBlockers->size(); ++i) blockers.push_back(findingMessage(reportBlockers->at(i)));
  for (std::size_t i = 0; i < strategies.size(); ++i)
    if (const ReportJson* codes = strategyCodes(strategies.at(i), "blocker_codes"))
      for (std::size_t k = 0; k < codes->size(); ++k)
        if (codes->at(k).isString())
          blockers.push_back({codes->at(k).asString(), "Parting strategy blocker: " + codes->at(k).asString() + ".", std::string("parting_strategies"), std::string("chapter9_generation_contract")});
  if (const ReportJson* codes = strategyCodes(core, "blocker_codes"))
    for (std::size_t k = 0; k < codes->size(); ++k)
      if (codes->at(k).isString())
        blockers.push_back({codes->at(k).asString(), "Core/cavity readiness blocker: " + codes->at(k).asString() + ".", std::string("core_cavity_readiness"), std::string("chapter9_generation_contract")});
  for (const Input& in : missingInputs)
    if (in.required)
      blockers.push_back({in.reasonCodes.empty() ? "blocked_by_missing_required_inputs" : in.reasonCodes.front(), in.label + " is required before mold generation can continue.", in.key,
                          std::string("chapter9_generation_contract")});

  // --- status ------------------------------------------------------------------------------------------------------------------------
  const std::optional<std::string> reportStatus = report ? std::optional<std::string>(report->find("status")->asString()) : std::nullopt;
  const bool hasRequiredInputs = std::all_of(inputs.begin(), inputs.end(), [](const Input& in) { return !in.required || in.state == "available"; });
  const bool hasBlocking = !blockers.empty(), hasWarnings = !warnings.empty();
  std::string status;
  if (hasBlocking || reportStatus == "blocked") status = "blocked";
  else if (reportStatus == "ready") status = hasWarnings ? "ready_with_warnings" : "ready";
  else if (reportStatus == "ready_with_warnings") status = "ready_with_warnings";
  else if (hasRequiredInputs) status = hasWarnings ? "ready_with_warnings" : "ready";
  else status = hasWarnings ? "ready_with_warnings" : "unavailable";

  std::string readiness;
  if (status == "ready") readiness = "sufficient";
  else if (status == "ready_with_warnings" || hasRequiredInputs) readiness = "partial";
  else if (status == "blocked") readiness = "insufficient";
  else readiness = "unavailable";

  const bool canGenerate = status == "ready" && selectedAvailable;
  bool anyStrategyReview = false;
  for (std::size_t i = 0; i < strategies.size(); ++i) anyStrategyReview = anyStrategyReview || jsTruthy(strategies.at(i).find("requires_manual_review"));
  const bool requiresManualReview = status == "ready_with_warnings" || !blockers.empty() || anyStrategyReview;

  std::vector<std::string> reasonCodes;
  for (const Input& in : inputs) for (const auto& c : in.reasonCodes) addUnique(reasonCodes, c);
  if (hasWarnings) addUnique(reasonCodes, "warnings_present");
  if (requiresManualReview) addUnique(reasonCodes, "manual_review_required");
  addUnique(reasonCodes, !blockers.empty() ? "blocked_by_missing_required_inputs" : "ready_for_initial_generation_boundary");
  if (reportStatus == "blocked") addUnique(reasonCodes, "blocked_by_chapter9");
  if (contractConfidence < 0.55) addUnique(reasonCodes, "low_confidence");

  // --- snapshot sections ----------------------------------------------------------------------------------------------------------
  ReportJson pullJson = ReportJson::object();
  pullJson.set("status", *pull.find("status")).set("candidateId", *pull.find("candidate_id")).set("direction", *pull.find("direction"));
  pullJson.set("decisiveness", *pull.find("decisiveness")).set("score", *pull.find("score")).set("confidence", str(confidenceBand(pull.find("confidence")->asNumber())));

  ReportJson draftJson = ReportJson::object();
  draftJson.set("status", *draft.find("status"));
  draftJson.set("evaluatedSurfaceAreaRatio", ReportJson::number(normalizeRatio(draft.find("evaluated_surface_area_ratio")->asNumber())));
  draftJson.set("insufficientDraftAreaRatio", ReportJson::number(normalizeRatio(draft.find("insufficient_draft_area_ratio")->asNumber())));
  draftJson.set("nearZeroDraftAreaRatio", ReportJson::number(normalizeRatio(draft.find("near_zero_draft_area_ratio")->asNumber())));
  draftJson.set("faceCountBySurfaceType", orDefault(draft.find("face_count_by_surface_type"), ReportJson::object()));
  draftJson.set("faceCountByAdequacy", orDefault(draft.find("face_count_by_adequacy"), ReportJson::object()));

  ReportJson undercutJson = ReportJson::array();
  for (std::size_t i = 0; i < undercuts.size(); ++i) {
    const ReportJson& u = undercuts.at(i);
    ReportJson item = ReportJson::object();
    item.set("regionId", *u.find("region_id")).set("source", *u.find("source")).set("faceCount", *u.find("face_count"));
    item.set("areaRatio", ReportJson::number(normalizeRatio(u.find("area_ratio")->asNumber())));
    item.set("confidence", str(confidenceBand(u.find("confidence")->asNumber())));
    item.set("severity", orDefault(u.find("severity"), ReportJson::null())).set("treatmentRequirement", orDefault(u.find("treatment_requirement"), ReportJson::null()));
    item.set("isBlocking", orDefault(u.find("is_blocking"), flag(false))).set("requiresManualReview", orDefault(u.find("requires_manual_review"), flag(false)));
    undercutJson.push(std::move(item));
  }

  std::vector<const ReportJson*> sorted;
  for (std::size_t i = 0; i < strategies.size(); ++i) sorted.push_back(&strategies.at(i));
  std::stable_sort(sorted.begin(), sorted.end(), [](const ReportJson* l, const ReportJson* r) { return l->find("rank")->asNumber() - r->find("rank")->asNumber() < 0; });
  ReportJson strategyJson = ReportJson::array();
  for (const ReportJson* s : sorted) {
    ReportJson item = ReportJson::object();
    item.set("candidateId", *s->find("candidate_id")).set("rank", *s->find("rank")).set("strategyType", *s->find("strategy_type")).set("status", *s->find("status"));
    item.set("score", *s->find("score")).set("confidence", str(confidenceBand(s->find("confidence")->asNumber()))).set("pullDirection", *s->find("pull_direction"));
    item.set("generationMode", *s->find("generation_mode")).set("coreTargetIds", orDefault(s->find("core_target_ids"), ReportJson::array()));
    item.set("warningCodes", orDefault(s->find("warning_codes"), ReportJson::array())).set("blockerCodes", orDefault(s->find("blocker_codes"), ReportJson::array()));
    item.set("requiresManualReview", orDefault(s->find("requires_manual_review"), flag(false)));
    strategyJson.push(std::move(item));
  }

  ReportJson coreJson = ReportJson::object();
  coreJson.set("handlingRequired", *core.find("handling_required")).set("decisionOutcome", *core.find("decision_outcome")).set("targetIds", *core.find("target_ids"));
  coreJson.set("confidence", str(confidenceBand(core.find("confidence")->asNumber())));
  coreJson.set("blockerCodes", orDefault(core.find("blocker_codes"), ReportJson::array())).set("warningCodes", orDefault(core.find("warning_codes"), ReportJson::array()));
  coreJson.set("sourceReferences", orDefault(core.find("source_references"), ReportJson::array()));

  const auto inputList = [](const std::vector<Input>& list) {
    ReportJson out = ReportJson::array();
    for (const auto& in : list) out.push(inputJson(in));
    return out;
  };
  const auto messageList = [](const std::vector<Message>& list) {
    ReportJson out = ReportJson::array();
    for (const auto& m : list) out.push(messageJson(m));
    return out;
  };
  ReportJson reasons = ReportJson::array();
  for (const auto& c : reasonCodes) reasons.push(str(c));

  ReportJson out = ReportJson::object();
  out.set("status", str(status)).set("readiness", str(readiness)).set("canGenerate", flag(canGenerate)).set("requiresManualReview", flag(requiresManualReview));
  out.set("confidence", str(confidenceBand(contractConfidence))).set("chapter9DependencyLevel", str(canGenerate ? "generation_ready" : "contract_only"));
  out.set("availableInputs", inputList(availableInputs)).set("missingInputs", inputList(missingInputs)).set("warnings", messageList(warnings)).set("blockers", messageList(blockers));
  out.set("reasonCodes", std::move(reasons)).set("pullDirection", std::move(pullJson)).set("draftOrientation", std::move(draftJson));
  out.set("undercutIndicators", std::move(undercutJson)).set("partingStrategies", std::move(strategyJson)).set("coreCavityReadiness", std::move(coreJson));
  out.set("selectedPartingStrategyId", selectedId ? *selectedId : ReportJson::null()).set("generatedAt", str(nowIso));
  return out;
}

}  // namespace craft
