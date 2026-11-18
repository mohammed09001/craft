#include "reports/EngineeringReports.h"

#include <algorithm>
#include <cctype>
#include <cmath>

#include "reports/LocaleCompare.h"

namespace craft {

namespace {

struct NameEntry { const char* name; };

/// JS String.prototype.trim() on the whitespace that can occur in ids (ASCII whitespace).
std::string jsTrim(const std::string& text) {
  std::size_t begin = 0, end = text.size();
  const auto isWs = [](unsigned char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\v' || c == '\f' || c == '\r'; };
  while (begin < end && isWs(static_cast<unsigned char>(text[begin]))) ++begin;
  while (end > begin && isWs(static_cast<unsigned char>(text[end - 1]))) --end;
  return text.substr(begin, end - begin);
}

/// normalizeKey: value.trim().toLowerCase() (ASCII case folding).
std::string normalizeKey(const std::string& value) {
  std::string out = jsTrim(value);
  for (char& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return out;
}

ReportJson stringOrNull(const std::optional<std::string>& value) { return value ? ReportJson::string(*value) : ReportJson::null(); }

}  // namespace

// --- enums -----------------------------------------------------------------------------------------------------------------------------

const char* engineeringReportStatusName(EngineeringReportStatus status) {
  switch (status) {
    case EngineeringReportStatus::Success: return "success";
    case EngineeringReportStatus::SuccessWithWarnings: return "success_with_warnings";
    case EngineeringReportStatus::Partial: return "partial";
    case EngineeringReportStatus::Failed: return "failed";
    case EngineeringReportStatus::Unsupported: return "unsupported";
    case EngineeringReportStatus::Skipped: return "skipped";
  }
  return "failed";
}

std::optional<EngineeringReportStatus> parseEngineeringReportStatus(const std::string& text) {
  for (auto s : {EngineeringReportStatus::Success, EngineeringReportStatus::SuccessWithWarnings, EngineeringReportStatus::Partial,
                 EngineeringReportStatus::Failed, EngineeringReportStatus::Unsupported, EngineeringReportStatus::Skipped})
    if (text == engineeringReportStatusName(s)) return s;
  return std::nullopt;
}

const char* engineeringReportSourceName(EngineeringReportSource source) {
  switch (source) {
    case EngineeringReportSource::PythonEngine: return "python-engine";
    case EngineeringReportSource::EngineBridge: return "engine-bridge";
    case EngineeringReportSource::Frontend: return "frontend";
  }
  return "frontend";
}

std::optional<EngineeringReportSource> parseEngineeringReportSource(const std::string& text) {
  for (auto s : {EngineeringReportSource::PythonEngine, EngineeringReportSource::EngineBridge, EngineeringReportSource::Frontend})
    if (text == engineeringReportSourceName(s)) return s;
  return std::nullopt;
}

const char* engineeringReportCategoryName(EngineeringReportCategory category) {
  switch (category) {
    case EngineeringReportCategory::Moldability: return "moldability";
    case EngineeringReportCategory::Geometry: return "geometry";
    case EngineeringReportCategory::Manufacturing: return "manufacturing";
    case EngineeringReportCategory::Quality: return "quality";
    case EngineeringReportCategory::Diagnostics: return "diagnostics";
    case EngineeringReportCategory::Other: return "other";
  }
  return "other";
}

std::optional<EngineeringReportCategory> parseEngineeringReportCategory(const std::string& text) {
  for (auto c : {EngineeringReportCategory::Moldability, EngineeringReportCategory::Geometry, EngineeringReportCategory::Manufacturing,
                 EngineeringReportCategory::Quality, EngineeringReportCategory::Diagnostics, EngineeringReportCategory::Other})
    if (text == engineeringReportCategoryName(c)) return c;
  return std::nullopt;
}

const char* engineeringReportSupportStatusName(EngineeringReportSupportStatus status) {
  switch (status) {
    case EngineeringReportSupportStatus::ComingSoon: return "coming-soon";
    case EngineeringReportSupportStatus::Supported: return "supported";
    case EngineeringReportSupportStatus::Experimental: return "experimental";
    case EngineeringReportSupportStatus::Hidden: return "hidden";
    case EngineeringReportSupportStatus::Deprecated: return "deprecated";
  }
  return "supported";
}

std::optional<EngineeringReportSupportStatus> parseEngineeringReportSupportStatus(const std::string& text) {
  for (auto s : {EngineeringReportSupportStatus::ComingSoon, EngineeringReportSupportStatus::Supported, EngineeringReportSupportStatus::Experimental,
                 EngineeringReportSupportStatus::Hidden, EngineeringReportSupportStatus::Deprecated})
    if (text == engineeringReportSupportStatusName(s)) return s;
  return std::nullopt;
}

// --- report contract -------------------------------------------------------------------------------------------------------------

ReportJson toJson(const EngineeringReport& report) {
  ReportJson metadata = ReportJson::object();
  metadata.set("reportId", ReportJson::string(report.metadata.reportId));
  metadata.set("analysisName", ReportJson::string(report.metadata.analysisName));
  metadata.set("reportName", ReportJson::string(report.metadata.reportName));
  metadata.set("createdAt", ReportJson::string(report.metadata.createdAt));
  metadata.set("source", ReportJson::string(engineeringReportSourceName(report.metadata.source)));
  metadata.set("engineVersion", stringOrNull(report.metadata.engineVersion));
  metadata.set("contractVersion", ReportJson::string(report.metadata.contractVersion.value_or(kEngineeringReportSchemaVersion)));

  ReportJson warnings = ReportJson::array();
  for (const auto& w : report.warnings) {
    ReportJson item = ReportJson::object();
    item.set("code", ReportJson::string(w.code));
    item.set("message", ReportJson::string(w.message));
    item.set("source", stringOrNull(w.source));
    item.set("details", w.details ? *w.details : ReportJson::object());
    warnings.push(std::move(item));
  }
  ReportJson errors = ReportJson::array();
  for (const auto& e : report.errors) {
    ReportJson item = ReportJson::object();
    item.set("code", ReportJson::string(e.code));
    item.set("message", ReportJson::string(e.message));
    item.set("source", stringOrNull(e.source));
    item.set("recoverable", ReportJson::boolean(e.recoverable.value_or(false)));
    item.set("details", e.details ? *e.details : ReportJson::object());
    errors.push(std::move(item));
  }

  ReportJson out = ReportJson::object();
  out.set("schema", ReportJson::string(report.schema));
  out.set("schemaVersion", ReportJson::string(report.schemaVersion));
  out.set("metadata", std::move(metadata));
  out.set("status", ReportJson::string(engineeringReportStatusName(report.status)));
  out.set("success", ReportJson::boolean(report.success));
  out.set("warnings", std::move(warnings));
  out.set("errors", std::move(errors));
  out.set("statistics", report.statistics);
  out.set("data", report.data);
  return out;
}

namespace {

struct Reader {
  std::string error;

  const ReportJson* member(const ReportJson& object, const char* key, const std::string& path) {
    const ReportJson* value = object.find(key);
    if (!value) fail(path + "." + key + " is missing.");
    return value;
  }
  void fail(const std::string& message) { if (error.empty()) error = message; }
  bool ok() const { return error.empty(); }

  std::string requireString(const ReportJson& object, const char* key, const std::string& path) {
    const ReportJson* value = member(object, key, path);
    if (!value) return {};
    if (!value->isString()) { fail(path + "." + key + " must be a string."); return {}; }
    return value->asString();
  }
  std::optional<std::string> optionalString(const ReportJson& object, const char* key, const std::string& path) {
    const ReportJson* value = object.find(key);
    if (!value || value->isNull()) return std::nullopt;
    if (!value->isString()) { fail(path + "." + key + " must be a string or null."); return std::nullopt; }
    return value->asString();
  }
};

}  // namespace

EngineeringReportParseResult parseEngineeringReport(const ReportJson& json) {
  EngineeringReportParseResult result;
  Reader r;
  const auto finish = [&](std::optional<EngineeringReport> report) {
    if (!r.ok()) { result.error = r.error; return result; }
    result.report = std::move(report);
    return result;
  };
  if (!json.isObject()) { r.fail("Report must be a JSON object."); return finish(std::nullopt); }

  EngineeringReport report;
  report.schema = r.requireString(json, "schema", "report");
  if (r.ok() && report.schema != kEngineeringReportSchema) r.fail("report.schema must be \"engineering_report\".");
  report.schemaVersion = r.requireString(json, "schemaVersion", "report");
  if (r.ok()) {
    // Same major version only: a different major is a different contract.
    const std::string major = report.schemaVersion.substr(0, report.schemaVersion.find('.'));
    if (major != "1") r.fail("report.schemaVersion " + report.schemaVersion + " is not supported (expected 1.x).");
  }

  if (const ReportJson* metadata = r.member(json, "metadata", "report"); metadata && r.ok()) {
    if (!metadata->isObject()) { r.fail("report.metadata must be an object."); }
    else {
      report.metadata.reportId = r.requireString(*metadata, "reportId", "report.metadata");
      report.metadata.analysisName = r.requireString(*metadata, "analysisName", "report.metadata");
      report.metadata.reportName = r.requireString(*metadata, "reportName", "report.metadata");
      report.metadata.createdAt = r.requireString(*metadata, "createdAt", "report.metadata");
      const std::string source = r.requireString(*metadata, "source", "report.metadata");
      if (r.ok()) {
        if (auto parsed = parseEngineeringReportSource(source)) report.metadata.source = *parsed;
        else r.fail("report.metadata.source \"" + source + "\" is not a known source.");
      }
      report.metadata.engineVersion = r.optionalString(*metadata, "engineVersion", "report.metadata");
      report.metadata.contractVersion = r.optionalString(*metadata, "contractVersion", "report.metadata");
    }
  }

  const std::string status = r.requireString(json, "status", "report");
  if (r.ok()) {
    if (auto parsed = parseEngineeringReportStatus(status)) report.status = *parsed;
    else r.fail("report.status \"" + status + "\" is not a known status.");
  }
  if (const ReportJson* success = r.member(json, "success", "report"); success && r.ok()) {
    if (!success->isBool()) r.fail("report.success must be a boolean.");
    else report.success = success->asBool();
  }

  const auto readIssues = [&](const char* key, auto&& convert) {
    const ReportJson* list = r.member(json, key, "report");
    if (!list || !r.ok()) return;
    if (!list->isArray()) { r.fail(std::string("report.") + key + " must be an array."); return; }
    for (std::size_t i = 0; i < list->size() && r.ok(); ++i) {
      const std::string path = std::string("report.") + key + "[" + std::to_string(i) + "]";
      if (!list->at(i).isObject()) { r.fail(path + " must be an object."); return; }
      convert(list->at(i), path);
    }
  };
  readIssues("warnings", [&](const ReportJson& item, const std::string& path) {
    EngineeringReportWarning w;
    w.code = r.requireString(item, "code", path);
    w.message = r.requireString(item, "message", path);
    w.source = r.optionalString(item, "source", path);
    if (const ReportJson* details = item.find("details")) w.details = *details;
    report.warnings.push_back(std::move(w));
  });
  readIssues("errors", [&](const ReportJson& item, const std::string& path) {
    EngineeringReportError e;
    e.code = r.requireString(item, "code", path);
    e.message = r.requireString(item, "message", path);
    e.source = r.optionalString(item, "source", path);
    if (const ReportJson* recoverable = item.find("recoverable")) {
      if (!recoverable->isBool()) r.fail(path + ".recoverable must be a boolean.");
      else e.recoverable = recoverable->asBool();
    }
    if (const ReportJson* details = item.find("details")) e.details = *details;
    report.errors.push_back(std::move(e));
  });

  if (const ReportJson* statistics = r.member(json, "statistics", "report"); statistics && r.ok()) {
    if (!statistics->isObject()) r.fail("report.statistics must be an object.");
    else {
      for (std::size_t i = 0; i < statistics->size() && r.ok(); ++i) {
        const ReportJson::Kind k = statistics->at(i).kind();
        if (k == ReportJson::Kind::Array || k == ReportJson::Kind::Object) r.fail("report.statistics." + statistics->keyAt(i) + " must be a primitive.");
      }
      report.statistics = *statistics;
    }
  }
  if (const ReportJson* data = r.member(json, "data", "report"); data && r.ok()) {
    if (!data->isObject()) r.fail("report.data must be an object.");
    else report.data = *data;
  }
  return finish(std::move(report));
}

// --- registry ------------------------------------------------------------------------------------------------------------------------

ReportJson toJson(const EngineeringReportDefinition& d) {
  ReportJson out = ReportJson::object();
  out.set("id", ReportJson::string(d.id));
  out.set("type", ReportJson::string(d.type));
  out.set("displayName", ReportJson::string(d.displayName));
  out.set("description", ReportJson::string(d.description));
  out.set("category", ReportJson::string(engineeringReportCategoryName(d.category)));
  out.set("displayOrder", ReportJson::number(d.displayOrder));
  out.set("visible", ReportJson::boolean(d.visible));
  out.set("supportStatus", ReportJson::string(engineeringReportSupportStatusName(d.supportStatus)));
  out.set("version", ReportJson::string(d.version));
  if (d.icon && !d.icon->empty()) out.set("icon", ReportJson::string(*d.icon));
  if (d.metadata) {
    ReportJson metadata = ReportJson::object();
    for (const auto& [key, value] : *d.metadata) metadata.set(key, value);
    out.set("metadata", std::move(metadata));
  }
  return out;
}

namespace {

void assertNonEmpty(const char* name, const std::string& value) {
  if (jsTrim(value).empty()) throw std::invalid_argument(std::string("Engineering report ") + name + " must be a non-empty string.");
}

void assertValidDefinition(const EngineeringReportDefinition& d) {
  assertNonEmpty("id", d.id);
  assertNonEmpty("type", d.type);
  assertNonEmpty("displayName", d.displayName);
  assertNonEmpty("description", d.description);
  assertNonEmpty("version", d.version);
  // Category and support status are enums here, so the reference's "Unsupported ..." checks are enforced by the type
  // (parseEngineeringReportCategory/SupportStatus return nullopt for unknown text; callers report the same message).
  if (!std::isfinite(d.displayOrder)) throw std::invalid_argument("Engineering report displayOrder must be a finite number.");
}

}  // namespace

EngineeringReportDefinition parseEngineeringReportDefinition(const ReportJson& json) {
  const auto text = [&](const char* key) {
    const ReportJson* value = json.find(key);
    return value && value->isString() ? value->asString() : std::string();
  };
  EngineeringReportDefinition d;
  d.id = text("id");
  d.type = text("type");
  d.displayName = text("displayName");
  d.description = text("description");
  d.version = text("version");
  assertNonEmpty("id", d.id);
  assertNonEmpty("type", d.type);
  assertNonEmpty("displayName", d.displayName);
  assertNonEmpty("description", d.description);
  assertNonEmpty("version", d.version);
  const auto category = parseEngineeringReportCategory(text("category"));
  if (!category) throw std::invalid_argument("Unsupported engineering report category: " + text("category"));
  d.category = *category;
  const auto status = parseEngineeringReportSupportStatus(text("supportStatus"));
  if (!status) throw std::invalid_argument("Unsupported engineering report status: " + text("supportStatus"));
  d.supportStatus = *status;
  const ReportJson* order = json.find("displayOrder");
  d.displayOrder = order && order->isNumber() ? order->asNumber() : std::nan("");
  if (!std::isfinite(d.displayOrder)) throw std::invalid_argument("Engineering report displayOrder must be a finite number.");
  if (const ReportJson* visible = json.find("visible"); visible && visible->isBool()) d.visible = visible->asBool();
  if (const ReportJson* icon = json.find("icon"); icon && icon->isString()) d.icon = icon->asString();
  if (const ReportJson* metadata = json.find("metadata"); metadata && metadata->isObject()) {
    std::vector<std::pair<std::string, ReportJson>> items;
    for (std::size_t i = 0; i < metadata->size(); ++i) items.emplace_back(metadata->keyAt(i), metadata->at(i));
    d.metadata = std::move(items);
  }
  return d;
}

EngineeringReportRegistry::EngineeringReportRegistry(const std::vector<EngineeringReportDefinition>& initial) {
  for (const EngineeringReportDefinition& definition : initial) {
    assertValidDefinition(definition);
    const std::string id = normalizeKey(definition.id), type = normalizeKey(definition.type);
    for (const auto& existing : definitions_) {
      if (normalizeKey(existing.id) == id) throw std::invalid_argument("Duplicate engineering report id registered: " + definition.id);
      if (normalizeKey(existing.type) == type) throw std::invalid_argument("Duplicate engineering report type registered: " + definition.type);
    }
    definitions_.push_back(definition);
  }
}

EngineeringReportRegistry EngineeringReportRegistry::registerDefinition(const EngineeringReportDefinition& definition) const {
  std::vector<EngineeringReportDefinition> all = definitions_;
  all.push_back(definition);
  return EngineeringReportRegistry(all);
}

std::vector<EngineeringReportDefinition> EngineeringReportRegistry::discover(const EngineeringReportDiscoverOptions& options) const {
  std::vector<EngineeringReportDefinition> reports;
  for (const auto& report : definitions_) {
    if (options.category && report.category != *options.category) continue;
    if (!options.includeHidden && !(report.visible && report.supportStatus != EngineeringReportSupportStatus::Hidden)) continue;
    reports.push_back(report);
  }
  std::stable_sort(reports.begin(), reports.end(), [](const auto& left, const auto& right) {
    if (left.displayOrder != right.displayOrder) return left.displayOrder < right.displayOrder;
    return localeCompare(left.displayName, right.displayName) < 0;
  });
  return reports;
}

std::optional<EngineeringReportDefinition> EngineeringReportRegistry::getById(const std::string& id) const {
  const std::string key = normalizeKey(id);
  for (const auto& d : definitions_) if (normalizeKey(d.id) == key) return d;
  return std::nullopt;
}

std::optional<EngineeringReportDefinition> EngineeringReportRegistry::getByType(const std::string& type) const {
  const std::string key = normalizeKey(type);
  for (const auto& d : definitions_) if (normalizeKey(d.type) == key) return d;
  return std::nullopt;
}

std::vector<EngineeringReportDefinition> EngineeringReportRegistry::getByCategory(EngineeringReportCategory category, bool includeHidden) const {
  EngineeringReportDiscoverOptions options;
  options.includeHidden = includeHidden;
  options.category = category;
  return discover(options);
}

std::vector<EngineeringReportDefinition> EngineeringReportRegistry::getVisible() const { return discover(); }

std::vector<EngineeringReportManifestItem> EngineeringReportRegistry::toManifest(const EngineeringReportDiscoverOptions& options) const {
  return discover(options);
}

namespace {

EngineeringReportDefinition comingSoon(const char* id, const char* displayName, const char* description, EngineeringReportCategory category, double order) {
  EngineeringReportDefinition d;
  d.id = id;
  d.type = id;
  d.displayName = displayName;
  d.description = description;
  d.category = category;
  d.displayOrder = order;
  d.visible = true;
  d.supportStatus = EngineeringReportSupportStatus::ComingSoon;
  d.version = "0.1.0";
  d.metadata = std::vector<std::pair<std::string, ReportJson>>{{"chapter", ReportJson::string("9")}, {"stage", ReportJson::string("3")}};
  return d;
}

}  // namespace

const std::vector<EngineeringReportDefinition>& defaultEngineeringReports() {
  static const std::vector<EngineeringReportDefinition> reports = {
      comingSoon("pull-direction", "Pull Direction", "Identifies the intended mold opening direction. Algorithm is not implemented in this stage.",
                 EngineeringReportCategory::Moldability, 10),
      comingSoon("draft-analysis", "Draft Analysis", "Evaluates draft readiness. Algorithm is not implemented in this stage.",
                 EngineeringReportCategory::Moldability, 20),
      comingSoon("undercut-analysis", "Undercut Analysis", "Detects potential undercut regions. Algorithm is not implemented in this stage.",
                 EngineeringReportCategory::Moldability, 30),
      comingSoon("parting-analysis", "Parting Analysis",
                 "Prepares future parting line and parting surface analysis. Algorithm is not implemented in this stage.",
                 EngineeringReportCategory::Manufacturing, 40),
      comingSoon("thickness-analysis", "Thickness Analysis", "Prepares future wall thickness analysis. Algorithm is not implemented in this stage.",
                 EngineeringReportCategory::Geometry, 50),
  };
  return reports;
}

const EngineeringReportRegistry& engineeringReportRegistry() {
  static const EngineeringReportRegistry registry(defaultEngineeringReports());
  return registry;
}

std::vector<EngineeringReportManifestItem> engineeringReportManifest() {
  EngineeringReportDiscoverOptions options;
  options.includeHidden = true;
  return engineeringReportRegistry().toManifest(options);
}

std::vector<EngineeringReportManifestItem> visibleEngineeringReportManifest() { return engineeringReportRegistry().toManifest(); }

const std::vector<EngineeringReportDefinition>& defaultEngineeringReportDefinitions() {
  static const std::vector<EngineeringReportDefinition> definitions = [] {
    EngineeringReportDefinition d;
    d.id = "pull-direction";
    d.type = "pull_direction";
    d.displayName = "Pull Direction";
    d.description =
        "Contract-ready placeholder for future pull direction analysis. No engineering algorithm is executed in Chapter 9 Stage 4.";
    d.category = EngineeringReportCategory::Moldability;
    d.displayOrder = 10;
    d.visible = true;
    d.supportStatus = EngineeringReportSupportStatus::ComingSoon;
    d.version = "1.0.0";
    d.metadata = std::vector<std::pair<std::string, ReportJson>>{{"lifecycleStage", ReportJson::string("contract_ready")},
                                                                  {"supportsMockData", ReportJson::boolean(true)},
                                                                  {"hasAlgorithm", ReportJson::boolean(false)},
                                                                  {"hasViewportVisualization", ReportJson::boolean(false)}};
    return std::vector<EngineeringReportDefinition>{d};
  }();
  return definitions;
}

const EngineeringReportRegistry& defaultEngineeringReportRegistry() {
  static const EngineeringReportRegistry registry(defaultEngineeringReportDefinitions());
  return registry;
}

}  // namespace craft
