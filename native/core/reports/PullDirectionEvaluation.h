#pragma once

// Pull-direction evaluation layer: scores and classifies ranked candidates and
// turns them into a report section, snapshot, presentation and view model.
// Ports of engineering-reports/pull-direction/evaluation/*.ts. The scoring is
// deterministic arithmetic over confidence and source priority; it does not
// inspect geometry. Qt-free.

#include <optional>
#include <string>
#include <vector>

#include "reports/PullDirection.h"
#include "reports/ReportJson.h"

namespace craft {

// --- score profile (pullDirectionEvaluationScoring.ts) --------------------------------------------------------------------------

struct PullDirectionScoreProfile {
  double minScore = 0, maxScore = 100, minVectorLength = 1e-9, defaultConfidence = 0.5, precisionDecimals = 2;
  double thresholdRecommended = 85, thresholdUsable = 65, thresholdWeak = 35;
  double weightBase = 55, weightConfidence = 35, weightSourcePriority = 10;
};

/// Each field may be absent or non-finite; either falls back to the default (readFiniteNumber).
struct PullDirectionScoreProfileInput {
  std::optional<double> minScore, maxScore, minVectorLength, defaultConfidence, precisionDecimals;
  std::optional<double> thresholdRecommended, thresholdUsable, thresholdWeak;
  std::optional<double> weightBase, weightConfidence, weightSourcePriority;
};

PullDirectionScoreProfile defaultPullDirectionScoreProfile();
PullDirectionScoreProfile createPullDirectionScoreProfile(const PullDirectionScoreProfileInput& input);
ReportJson toJson(const PullDirectionScoreProfile& profile);

// --- evaluation (pullDirectionEvaluation.ts, adapter) ------------------------------------------------------------------------

struct PullDirectionEvaluationReason {
  std::string code, message, impact;  // impact: positive | neutral | negative
};

struct PullDirectionEvaluationCandidate {
  std::string id;
  PullDirectionVec3 direction;
  std::optional<bool> isValid;
  std::optional<double> confidence, sourcePriority;
};

struct PullDirectionCandidateEvaluation {
  std::string candidateId;
  PullDirectionVec3 originalDirection;
  std::optional<PullDirectionVec3> normalizedDirection;
  std::optional<double> vectorLength;
  double score = 0;
  std::string decision;  // recommended | usable | weak | rejected
  std::vector<PullDirectionEvaluationReason> reasons;
};

struct PullDirectionEvaluationResult {
  std::vector<PullDirectionCandidateEvaluation> evaluations;
  std::optional<std::string> bestCandidateId;
  std::vector<std::string> recommendedCandidateIds;
};

PullDirectionEvaluationResult evaluatePullDirectionCandidates(const std::vector<PullDirectionEvaluationCandidate>& candidates,
                                                              const PullDirectionScoreProfile& profile = defaultPullDirectionScoreProfile());
ReportJson toJson(const PullDirectionEvaluationResult& result);

/// A direction whose components may be missing (a `Partial<Vector3>`).
struct PullDirectionPartialVec3 {
  std::optional<double> x, y, z;
};

/// A ranked candidate as the evaluation adapter accepts it (every field optional, aliases included).
struct PullDirectionRankedCandidateLike {
  std::optional<std::string> id, candidateId;
  std::optional<PullDirectionPartialVec3> direction, vector, pullDirection;  // null / absent
  std::optional<bool> isValid, valid;
  std::optional<double> confidence, score, rank, sourcePriority;
};

std::vector<PullDirectionEvaluationCandidate> createPullDirectionEvaluationInput(const std::vector<PullDirectionRankedCandidateLike>& ranked);

// --- summary, report section, snapshot, validation, presentation, view model ---------------------------------------------

struct PullDirectionSummaryMessage {
  std::string severity, code, message;  // severity: info | warning | error
};

struct PullDirectionEvaluationSummary {
  double totalCandidates = 0, evaluatedCandidates = 0, recommendedCandidates = 0, usableCandidates = 0, weakCandidates = 0, rejectedCandidates = 0;
  std::optional<std::string> bestCandidateId;
  std::optional<double> bestCandidateScore;
  std::optional<std::string> bestCandidateDecision;
  double countRecommended = 0, countUsable = 0, countWeak = 0, countRejected = 0;  // decisionCounts
  std::vector<PullDirectionSummaryMessage> messages;
};

PullDirectionEvaluationSummary summarizePullDirectionEvaluation(const PullDirectionEvaluationResult& result);

struct PullDirectionEvaluationBestCandidate {
  std::string candidateId;
  double score = 0;
  std::string decision;
  std::optional<PullDirectionVec3> normalizedDirection;
};

/// The report section; a snapshot has the same shape with every number rounded to 1e-6.
struct PullDirectionEvaluationReportSection {
  std::string status;  // ready | review_required | blocked
  PullDirectionEvaluationSummary summary;
  std::vector<PullDirectionCandidateEvaluation> evaluations;
  std::optional<PullDirectionEvaluationBestCandidate> bestCandidate;
  std::vector<PullDirectionSummaryMessage> messages;
};
ReportJson toJson(const PullDirectionEvaluationReportSection& section);

PullDirectionEvaluationReportSection createPullDirectionEvaluationReportSnapshot(const PullDirectionEvaluationReportSection& section);

struct PullDirectionSnapshotValidationIssue {
  std::string severity, path, message;  // severity: error | warning
};
struct PullDirectionSnapshotValidationResult {
  bool isValid = true;
  std::vector<PullDirectionSnapshotValidationIssue> issues;
};
/// `snapshot` is the JSON shape of toJson(snapshot); fields may carry bad values (the reference casts, it does not parse).
PullDirectionSnapshotValidationResult validatePullDirectionEvaluationReportSnapshot(const ReportJson& snapshot);
ReportJson toJson(const PullDirectionSnapshotValidationResult& result);

ReportJson createPullDirectionEvaluationPresentation(const PullDirectionEvaluationReportSection& snapshot);

struct PullDirectionEvaluationBundle {
  PullDirectionEvaluationReportSection reportSection, snapshot;
  PullDirectionSnapshotValidationResult snapshotValidation;
  ReportJson presentation;
};
PullDirectionEvaluationBundle createPullDirectionEvaluationBundle(const std::vector<PullDirectionRankedCandidateLike>& ranked,
                                                                  const std::optional<PullDirectionScoreProfile>& profile = std::nullopt);
ReportJson toJson(const PullDirectionEvaluationBundle& bundle);

/// createPullDirectionEvaluationReportViewModel: state + best candidate + snapshot + validation + presentation + bundle.
ReportJson createPullDirectionEvaluationReportViewModel(const std::vector<PullDirectionRankedCandidateLike>& ranked,
                                                        const std::optional<PullDirectionScoreProfile>& profile = std::nullopt);

}  // namespace craft
