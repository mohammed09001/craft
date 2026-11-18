#pragma once

// Export of Master tooling pieces: one binary STL per printable piece plus a manifest.
//
// New native feature: the reference frontend has no tooling export (it only displays the pieces), so there is no
// behaviour to match; the contract is the one below and docs/native-migration (D-056..D-058).
//
//   <folder>/<model>_master_tooling[_N]/
//       <model>_master_<set>_<piece>.stl   binary STL, millimeters, Z-up, the same world frame as the viewport
//       manifest.json                      what each file is, with SHA-256, bounds, volume, release directions,
//                                          registration pins, the release sequence, what was left out and why
//
// Rules:
//  * Only tooling sets whose status is "current" are exported. A stale set (the part changed since it was
//    generated) or a blocked one (tooling failed) is listed under "excluded" with its reason, never written.
//  * Every piece of a current set is exported whatever its viewport visibility. Pieces with no geometry are
//    excluded; pieces the engine flagged (not watertight / not manifold / larger than the build volume) are
//    exported with a warning, in the manifest and in the result.
//  * Nothing is ever overwritten: the files go into a fresh sub-folder (a numeric suffix is added when the name is
//    taken). The sub-folder appears only when complete: everything is written to "<name>.craft-export-tmp",
//    verified by reading it back, then renamed. A failure or cancellation removes the temporary folder.

#include <filesystem>
#include <string>
#include <vector>

#include "contracts/Operation.h"
#include "master/MasterMoldStore.h"

namespace craft::toolingexport {

struct PlannedFile {
  std::string moldPartId, moldPartName, pieceId, pieceName;
  std::string fileName;
  const MasterToolingSetState* state = nullptr;  // owned by the caller's sets, which must outlive the plan
  const MasterToolingPiece* piece = nullptr;
};

struct ExcludedItem {
  std::string moldPartId, moldPartName;
  std::string pieceId;  // empty: the whole tooling set
  std::string status;   // the set's status ("stale", "blocked", ...) or "current" for a piece-level exclusion
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
  bool unportedPathsReached = false;  // the engine may have skipped strategies the reference has (honest scope flag)
  std::vector<std::string> unportedPaths;
};

struct MasterExportResult {
  std::filesystem::path folder;    // the final sub-folder
  std::filesystem::path manifest;
  std::vector<std::filesystem::path> files;  // the STL files, in the final folder
  std::vector<std::string> warnings;
  std::vector<ExcludedItem> excluded;
  std::uintmax_t totalBytes = 0;
};

/// A file-name component: no characters Windows or macOS forbid, no control characters or whitespace (runs of
/// underscores collapse), no leading/trailing dots/underscores, cut to `maxBytes` on a UTF-8 boundary. Bytes >= 0x80
/// are kept, so non-Latin names survive. Empty input gives `fallback`.
std::string sanitizeFileComponent(const std::string& text, const std::string& fallback, std::size_t maxBytes = 60);

/// Decides what is exported and under which names. Pure; throws nothing.
MasterExportPlan planMasterToolingExport(const std::vector<MasterToolingSetState>& sets, const std::string& modelName);

/// Writes the plan. Throws CodedError:
///   master_export_nothing       nothing exportable (the message says why: stale, blocked, no geometry)
///   master_export_write_failed  folder/file could not be written or failed read-back verification
///   cancelled                   `cancel` was triggered (the partial output is removed)
MasterExportResult writeMasterToolingExport(const MasterExportPlan& plan, const std::filesystem::path& parentFolder,
                                            const MasterExportOptions& options, const CancellationToken& cancel = {});

}  // namespace craft::toolingexport
