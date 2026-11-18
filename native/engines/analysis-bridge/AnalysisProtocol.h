#pragma once

// craft.analysis protocol, version 1 -- shared constants for the host side.
// The worker side is engines/analysis-bridge/worker/craft_analysis_worker.py;
// the wire format is documented in docs/native-migration/ARCHITECTURE.md.

namespace craft::analysis {

inline constexpr const char* kProtocolName = "craft.analysis";
inline constexpr int kProtocolVersion = 1;

// Commands.
inline constexpr const char* kCommandPing = "ping";
inline constexpr const char* kCommandImportAnalysis = "import_analysis";
inline constexpr const char* kCommandMoldabilityAnalysis = "moldability_analysis";
inline constexpr const char* kCommandShutdown = "shutdown";

// Host-side error codes (the worker adds its own, e.g. "source_not_found").
inline constexpr const char* kErrorRuntimeMissing = "analysis_runtime_missing";
inline constexpr const char* kErrorWorkerCrashed = "analysis_worker_crashed";
inline constexpr const char* kErrorTimeout = "analysis_timeout";
inline constexpr const char* kErrorBusy = "analysis_busy";
inline constexpr const char* kErrorProtocolMismatch = "protocol_version_mismatch";

}  // namespace craft::analysis
