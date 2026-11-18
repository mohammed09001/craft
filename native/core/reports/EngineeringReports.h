#pragma once

// Engineering reports: the shared report contract and the report registry.
// Ports of engineering-reports/engineeringReport.contracts.ts, reportRegistry*.ts,
// defaultEngineeringReports.ts, engineeringReportManifest.ts and
// defaultReportRegistry.ts, plus the Python engineering_reports/contracts.py
// wire shape. Qt-free.
//
// Native additions (not in the reference): parseEngineeringReport() is a strict
// runtime validator. The reference only declares the contract as TypeScript
// types; the native app receives reports from a separate process, so it checks
// the shape at that boundary instead of trusting it.

#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "reports/ReportJson.h"

namespace craft {

// --- report contract ---------------------------------------------------------------------------------------------------------------

inline constexpr const char* kEngineeringReportSchema = "engineering_report";
inline constexpr const char* kEngineeringReportSchemaVersion = "1.0.0";

enum class EngineeringReportStatus { Success, SuccessWithWarnings, Partial, Failed, Unsupported, Skipped };
const char* engineeringReportStatusName(EngineeringReportStatus status);
std::optional<EngineeringReportStatus> parseEngineeringReportStatus(const std::string& text);

enum class EngineeringReportSource { PythonEngine, EngineBridge, Frontend };
const char* engineeringReportSourceName(EngineeringReportSource source);
std::optional<EngineeringReportSource> parseEngineeringReportSource(const std::string& text);

struct EngineeringReportMetadata {
  std::string reportId, analysisName, reportName, createdAt;
  EngineeringReportSource source = EngineeringReportSource::PythonEngine;
  std::optional<std::string> engineVersion;  // null / absent
  std::optional<std::string> contractVersion;
};

struct EngineeringReportWarning {
  std::string code, message;
  std::optional<std::string> source;
  std::optional<ReportJson> details;
};

struct EngineeringReportError {
  std::string code, message;
  std::optional<std::string> source;
  std::optional<bool> recoverable;
  std::optional<ReportJson> details;
};

struct EngineeringReport {
  std::string schema = kEngineeringReportSchema;
  std::string schemaVersion = kEngineeringReportSchemaVersion;
  EngineeringReportMetadata metadata;
  EngineeringReportStatus status = EngineeringReportStatus::Success;
  bool success = true;
  std::vector<EngineeringReportWarning> warnings;
  std::vector<EngineeringReportError> errors;
  ReportJson statistics = ReportJson::object();  // string -> primitive
  ReportJson data = ReportJson::object();        // string -> JSON
};

ReportJson toJson(const EngineeringReport& report);

struct EngineeringReportParseResult {
  std::optional<EngineeringReport> report;
  std::string error;  // empty on success
};
/// Strict validation of a report received from another process (e.g. the Python worker).
EngineeringReportParseResult parseEngineeringReport(const ReportJson& json);

// --- registry ------------------------------------------------------------------------------------------------------------------------

enum class EngineeringReportCategory { Moldability, Geometry, Manufacturing, Quality, Diagnostics, Other };
const char* engineeringReportCategoryName(EngineeringReportCategory category);
std::optional<EngineeringReportCategory> parseEngineeringReportCategory(const std::string& text);

enum class EngineeringReportSupportStatus { ComingSoon, Supported, Experimental, Hidden, Deprecated };
const char* engineeringReportSupportStatusName(EngineeringReportSupportStatus status);
std::optional<EngineeringReportSupportStatus> parseEngineeringReportSupportStatus(const std::string& text);

/// Definition and manifest item share one shape in the reference.
struct EngineeringReportDefinition {
  std::string id, type, displayName, description;
  EngineeringReportCategory category = EngineeringReportCategory::Other;
  double displayOrder = 0;
  bool visible = true;
  EngineeringReportSupportStatus supportStatus = EngineeringReportSupportStatus::Supported;
  std::string version;
  std::optional<std::string> icon;                                   // omitted when empty
  std::optional<std::vector<std::pair<std::string, ReportJson>>> metadata;  // primitive values
};
using EngineeringReportManifestItem = EngineeringReportDefinition;

ReportJson toJson(const EngineeringReportDefinition& definition);

/// Builds a definition from raw JSON with the reference's assertValidDefinition checks and messages, in the same order
/// (id, type, displayName, description, version, category, supportStatus, displayOrder). Throws std::invalid_argument.
EngineeringReportDefinition parseEngineeringReportDefinition(const ReportJson& json);

struct EngineeringReportDiscoverOptions {
  bool includeHidden = false;
  std::optional<EngineeringReportCategory> category;
};

/// Immutable registry. register() returns a new registry. Constructing or registering throws std::invalid_argument
/// with the reference messages on an invalid or duplicate definition.
class EngineeringReportRegistry {
 public:
  EngineeringReportRegistry() = default;
  explicit EngineeringReportRegistry(const std::vector<EngineeringReportDefinition>& initial);

  EngineeringReportRegistry registerDefinition(const EngineeringReportDefinition& definition) const;
  std::vector<EngineeringReportDefinition> discover(const EngineeringReportDiscoverOptions& options = {}) const;
  std::optional<EngineeringReportDefinition> getById(const std::string& id) const;
  std::optional<EngineeringReportDefinition> getByType(const std::string& type) const;
  std::vector<EngineeringReportDefinition> getByCategory(EngineeringReportCategory category, bool includeHidden = false) const;
  std::vector<EngineeringReportDefinition> getVisible() const;
  std::vector<EngineeringReportManifestItem> toManifest(const EngineeringReportDiscoverOptions& options = {}) const;

 private:
  std::vector<EngineeringReportDefinition> definitions_;  // insertion order
};

/// The five "coming soon" entries the context panel lists (defaultEngineeringReports.ts).
const std::vector<EngineeringReportDefinition>& defaultEngineeringReports();
/// engineeringReportManifest.ts
const EngineeringReportRegistry& engineeringReportRegistry();
std::vector<EngineeringReportManifestItem> engineeringReportManifest();         // includes hidden
std::vector<EngineeringReportManifestItem> visibleEngineeringReportManifest();
/// defaultReportRegistry.ts: the contract-ready definitions (pull direction only).
const std::vector<EngineeringReportDefinition>& defaultEngineeringReportDefinitions();
const EngineeringReportRegistry& defaultEngineeringReportRegistry();

}  // namespace craft
