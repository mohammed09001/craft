#pragma once

// Operation-level contracts shared by every native engine: structured issues,
// coded errors, job states, cancellation, and progress reporting.

#include <atomic>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace craft {

enum class IssueSeverity { Warning, Blocker };

/// Mirrors CavityIssue in cavityGeneration.contracts.ts.
struct Issue {
  IssueSeverity severity = IssueSeverity::Warning;
  std::string reasonCode;
  std::string message;
};

/// An engineering failure with a stable machine-readable code. The codes used
/// by ported algorithms are the same strings the reference implementation
/// attaches to its errors (e.g. "cavity_no_material_intersection").
class CodedError : public std::runtime_error {
 public:
  CodedError(std::string code, const std::string& message)
      : std::runtime_error(message), code_(std::move(code)) {}
  const std::string& code() const noexcept { return code_; }

 private:
  std::string code_;
};

/// Serializable job lifecycle. Mirrors the job-status vocabulary of
/// engine-integration/engineIntegration.contracts.ts.
enum class JobState { Queued, Running, Succeeded, Failed, Cancelled };

inline const char* jobStateName(JobState state) {
  switch (state) {
    case JobState::Queued: return "queued";
    case JobState::Running: return "running";
    case JobState::Succeeded: return "succeeded";
    case JobState::Failed: return "failed";
    case JobState::Cancelled: return "cancelled";
  }
  return "failed";
}

/// Cooperative cancellation shared between the requester and a worker thread.
class CancellationToken {
 public:
  CancellationToken() : flag_(std::make_shared<std::atomic<bool>>(false)) {}
  void cancel() const { flag_->store(true, std::memory_order_relaxed); }
  bool isCancelled() const { return flag_->load(std::memory_order_relaxed); }

 private:
  std::shared_ptr<std::atomic<bool>> flag_;
};

/// Stage name plus a 0..1 fraction. Must be safe to call from a worker thread.
using ProgressCallback = std::function<void(const std::string& stage, double fraction)>;

}  // namespace craft
