#pragma once

// Export of the two Master tools: one binary STL per printable master plus a manifest.
//
//   <folder>/<model>_master_tooling[_N]/
//       <model>_master_A.stl, <model>_master_B.stl   binary STL, millimetres, Z-up, each in its own print frame (bed on z = 0, open pour face up)
//       <model>_master_tooling.3mf                   optional (MasterExportOptions::write3mf): both masters as two named objects of one package, laid out
//                                                    side by side on one plate (B is moved along +X); the STLs stay in their own frames
//       manifest.json                                what each file is, SHA-256, bounds, volume, fill volume, print transform, release checks, fidelity,
//                                                    material estimates, warnings and the residual uncertainty
//
// Rules:
//  * Exactly the two masters are exported, never the virtual working halves and never anything else. A Master Mold is a pair: if either master cannot be
//    exported, nothing is, and the reason is reported.
//  * Only a "current" result is exported. A stale result (the part changed since it was generated) or a blocked one (no feasible plan) is listed under
//    "excluded" with its reason, never written.
//  * Nothing is ever overwritten: the files go into a fresh sub-folder (a numeric suffix is added when the name is taken). The sub-folder appears only
//    when complete: everything is written to "<name>.craft-export-tmp", verified by reading it back, then renamed. A failure or cancellation removes
//    the temporary folder.

#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "contracts/Operation.h"
#include "master/MasterMoldStore.h"

namespace craft::toolingexport {

/// What the export is made from: the store's status and result at the moment the export was requested (shared, so the job outlives a regeneration).
struct MasterExportSource {
  std::string status;                           // current | stale | blocked | ...
  std::shared_ptr<const MasterMoldPlan> plan;   // the successful result, if any
  std::string failureMessage;                   // why there is no plan, when blocked
};

struct PlannedFile {
  std::string toolName;  // "Master A" / "Master B"
  std::string fileName;
  std::shared_ptr<const MasterMoldPlan> plan;  // keeps the tool alive
  const MasterTool* tool = nullptr;
};

struct ExcludedItem {
  std::string name;    // the master, or "Master Mold" for the whole result
  std::string status;  // the result's status ("stale", "blocked", ...) or "current" for a master-level exclusion
  std::string reason;
};

struct MasterExportPlan {
  std::string stem;  // sanitized model name the file names start with
  std::vector<PlannedFile> files;
  std::vector<ExcludedItem> excluded;
  std::vector<std::string> warnings;
};

struct MasterExportOptions {
  std::string modelName;       // e.g. "bracket.stl"
  std::string appVersion;
  std::string exportedAtUtc;   // ISO-8601, supplied by the caller so the writer is deterministic
  int generationVersion = 0;
  bool write3mf = false;       // also write one 3MF holding both masters (verified by reading it back)
};

struct MasterExportResult {
  std::filesystem::path folder;    // the final sub-folder
  std::filesystem::path manifest;
  std::filesystem::path threeMf;             // the 3MF package in the final folder; empty unless MasterExportOptions::write3mf
  std::vector<std::filesystem::path> files;  // the two STL files, in the final folder
  std::vector<std::string> warnings;
  std::vector<ExcludedItem> excluded;
  std::uintmax_t totalBytes = 0;
};

/// A file-name component: no characters Windows or macOS forbid, no control characters or whitespace (runs of
/// underscores collapse), no leading/trailing dots/underscores, cut to `maxBytes` on a UTF-8 boundary. Bytes >= 0x80
/// are kept, so non-Latin names survive. Empty input gives `fallback`.
std::string sanitizeFileComponent(const std::string& text, const std::string& fallback, std::size_t maxBytes = 60);

/// Decides what is exported and under which names. Pure; throws nothing.
MasterExportPlan planMasterToolingExport(const MasterExportSource& source, const std::string& modelName);

/// Writes the plan. Throws CodedError:
///   master_export_nothing       nothing exportable (the message says why: stale, blocked, a master without geometry)
///   master_export_write_failed  folder/file could not be written or failed read-back verification
///   cancelled                   `cancel` was triggered (the partial output is removed)
MasterExportResult writeMasterToolingExport(const MasterExportPlan& plan, const std::filesystem::path& parentFolder,
                                            const MasterExportOptions& options, const CancellationToken& cancel = {});

}  // namespace craft::toolingexport
