#pragma once

// Pull-direction engineering report: the report contract, the MVP completion
// layer, session reports and the candidate analysis foundation.
// Ports of engineering-reports/pull-direction/pullDirectionReport.*.ts,
// pullDirectionCompletion.ts, pullDirectionAnalysis*.ts and
// pullDirectionCandidate*.ts.
//
// Scope note: the reference pull-direction "analysis engine" is a deliberate
// foundation. It generates the six canonical axis candidates and validates,
// filters and placeholder-ranks them WITHOUT inspecting the mesh, scoring or
// selecting a best direction. The ported code is equally honest about that:
// the report it builds says `algorithm.implemented: false`. The completed
// session report (createCompletedPullDirectionSessionReport) is built from
// hard-coded SAMPLE candidates in the reference; it is ported for equivalence
// and must never be presented as an analysis result.

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "reports/ReportJson.h"

namespace craft {

struct PullDirectionVec3 {
  double x = 0, y = 0, z = 0;
};

// --- completion (pullDirectionCompletion.ts) ----------------------------------------------------------------------------------

struct PullDirectionCompletionCandidate {
  std::string id;
  std::array<double, 3> direction{0, 0, 0};
  std::optional<std::string> label;
  std::optional<double> rank;  // null / absent
  std::optional<double> score, preliminaryScore, engineeringScore;
  std::optional<bool> isValid, isFilteredOut;
  std::vector<std::string> warnings;
};

enum class PullDirectionCompletionStatus { Good, Review, Poor };
const char* pullDirectionCompletionStatusName(PullDirectionCompletionStatus status);

struct PullDirectionCompletionResult {
  PullDirectionCompletionStatus status = PullDirectionCompletionStatus::Poor;
  double confidenceScore = 0;
  std::optional<PullDirectionCompletionCandidate> selectedCandidate;
  std::vector<PullDirectionCompletionCandidate> alternatives;
  std::vector<std::string> warnings;
  std::string summary;
};

PullDirectionCompletionResult completePullDirection(const std::vector<PullDirectionCompletionCandidate>& candidates);

// --- report contract (pullDirectionReport.contracts.ts) -------------------------------------------------------------------

struct PullDirectionReportVector3 {
  double x = 0, y = 0, z = 0;
  bool normalized = false;
};

struct PullDirectionCandidate {
  std::string id;
  PullDirectionReportVector3 direction;
  std::optional<double> rank, score, confidence;
  std::string quality = "unknown";  // unknown | poor | acceptable | good | excellent
  std::string validationState = "not_validated";  // not_validated | valid | invalid | warning
  std::vector<std::string> validationMessages;
  std::optional<std::string> reason;
  std::vector<std::string> evaluationNotes;
  std::string metadataSource = "unknown";  // mock | engine | algorithm | unknown
  std::optional<std::string> generatedAt;
};

struct PullDirectionReportWarning {
  std::string code, message, severity;  // info | warning
};
struct PullDirectionReportError {
  std::string code, message, severity;  // error | critical
};

struct PullDirectionReport {
  std::string reportId, reportType = "pull_direction", schemaVersion = "1.0.0";
  std::string status = "not_analyzed";  // not_analyzed | waiting_for_analysis | ready | completed | partial | failed

  // summary
  std::string summaryTitle, summaryDescription;
  bool summaryIsComplete = false;
  std::optional<std::string> bestCandidateId;
  int evaluatedCandidateCount = 0;
  std::optional<std::string> selectionReason;
  std::string solutionQuality = "unknown";  // unknown | weak | acceptable | strong | optimal

  std::optional<PullDirectionCandidate> bestCandidate;
  std::vector<PullDirectionCandidate> candidates;

  // statistics
  int evaluatedDirectionsCount = 0, validDirectionsCount = 0, rejectedDirectionsCount = 0;
  std::optional<double> highestScore, lowestScore, averageScore;

  // execution
  std::optional<std::string> startedAt, completedAt;
  std::optional<double> durationMs;
  std::optional<std::string> algorithmName, algorithmVersion;
  std::string executionMode = "mock";  // mock | deterministic | heuristic | ai | unknown

  // metadata
  std::string createdAt;
  std::optional<std::string> updatedAt;
  std::string source = "mock";  // mock | engine | frontend | import_pipeline
  std::optional<std::string> modelId, analysisSessionId;
  std::string coordinateSystem = "unknown";  // model | world | unknown
  std::string units = "unknown";             // mm | cm | m | inch | unknown

  std::vector<PullDirectionReportWarning> warnings;
  std::vector<PullDirectionReportError> errors;
};

ReportJson toJson(const PullDirectionReport& report);
ReportJson toJson(const PullDirectionCandidate& candidate);

/// pullDirectionReport.mock.ts. `nowIso` replaces `new Date().toISOString()` so callers control the clock.
PullDirectionReport createMockPullDirectionReport(const std::string& nowIso);

struct PullDirectionSessionReportInput {
  std::string analysisSessionId;
  std::optional<std::string> modelId;
  std::optional<std::string> status, source, coordinateSystem, units;
};

PullDirectionReport createPullDirectionSessionReport(const PullDirectionSessionReportInput& input, const std::string& nowIso);
/// SAMPLE data only (see the scope note above): three hard-coded candidates, as in the reference.
PullDirectionReport createCompletedPullDirectionSessionReport(const PullDirectionSessionReportInput& input, const std::string& nowIso);
/// The completed-report builder behind the sample: runs the MVP completion layer over `candidates` (scores 0..100 or 0..1)
/// and records them in the report. Native addition: the reference only ever calls this logic with the sample candidates;
/// the native app calls it with the real, Python-ranked candidates.
PullDirectionReport createPullDirectionReportFromCandidates(const PullDirectionSessionReportInput& input,
                                                            const std::vector<PullDirectionCompletionCandidate>& candidates,
                                                            const std::string& nowIso);

// --- context-panel card (systems/context-area/PullDirectionCard.tsx) ---------------------------------------------------

struct PullDirectionCardModel {
  std::string result;         // Good | Review | Poor  (header badge and "Result" row)
  std::string bestDirection;  // "+Z", "(0.60, 0.80, 0.00)" or "Not available"
  std::string confidence;     // "88%" or "Not available"
  int candidates = 0;
  std::vector<std::string> warnings;
};
/// "+Z" for an axis-aligned direction (dominant component >= 0.9, others <= 0.1), else "(x.xx, y.yy, z.zz)".
std::string pullDirectionLabel(double x, double y, double z);
/// `report` may be null (the reference card shows its not-analyzed placeholders).
PullDirectionCardModel buildPullDirectionCardModel(const PullDirectionReport* report);

/// pullDirectionReport.registry.ts constants.
struct PullDirectionReportRegistryEntry {
  std::string id, reportType, schemaVersion, title, description, category, lifecycleStage;
  bool supportsMockData = true, hasAlgorithm = false, hasViewportVisualization = false;
};
PullDirectionReportRegistryEntry pullDirectionReportRegistryEntry();

// --- candidate analysis foundation (pullDirectionAnalysis*.ts) --------------------------------------------------------------

inline constexpr const char* kPullDirectionAnalysisEngineId = "pull-direction-analysis-engine";
inline constexpr const char* kPullDirectionAnalysisEngineVersion = "0.5.0-candidate-ranking-pipeline-report";

struct PullDirectionCandidateDirection {
  std::string id, label;
  PullDirectionVec3 vector;
};

struct PullDirectionValidatedCandidate {
  PullDirectionCandidateDirection candidate;
  std::optional<PullDirectionVec3> normalizedVector;
  double magnitude = 0;
  bool valid = false;
  std::vector<std::pair<std::string, std::string>> issues;  // code, message
  bool excludedFromFutureScoring = false;
};

struct PullDirectionCandidateValidationResult {
  std::vector<PullDirectionValidatedCandidate> candidates, validCandidates, invalidCandidates;
  std::vector<std::string> duplicateCandidateIds;
};

struct PullDirectionFilteredCandidate {
  PullDirectionValidatedCandidate validatedCandidate;
  bool includedForFutureScoring = false;
  std::string reasonCode, message;
};

struct PullDirectionRankedCandidate {
  PullDirectionFilteredCandidate filteredCandidate;
  std::optional<int> rank;
  std::string reasonCode, message;
};

struct PullDirectionAnalysisPipelineOutput {
  std::vector<PullDirectionCandidateDirection> generated;
  PullDirectionCandidateValidationResult validation;
  std::vector<PullDirectionFilteredCandidate> filtered, included, excluded;
  std::vector<PullDirectionRankedCandidate> ranked, unranked;
};

/// The six canonical axis seeds (+X, -X, +Y, -Y, +Z, -Z).
std::vector<PullDirectionCandidateDirection> canonicalAxisSeedCandidates();
/// Validates, filters and placeholder-ranks `candidates` (default: the canonical seeds).
PullDirectionAnalysisPipelineOutput runPullDirectionAnalysisPipeline(const std::vector<PullDirectionCandidateDirection>& candidates);
ReportJson pullDirectionPipelineTrace();
/// candidateGeneration/candidateValidation/candidateFiltering/candidateRanking as the reference serializes them.
ReportJson toJson(const PullDirectionAnalysisPipelineOutput& output);

struct PullDirectionAnalysisInput {
  std::optional<std::string> analysisSessionId;
  std::string modelId;
  std::optional<std::string> fileName;
  bool hasGeometry = false;
  std::string source = "analysis-session";  // analysis-session | engine-bridge | mock | test
};

/// { status: "analysis-ready", report: foundation report, trace }.
ReportJson executePullDirectionAnalysis(const PullDirectionAnalysisInput& input, const std::string& completedAtIso);

}  // namespace craft
